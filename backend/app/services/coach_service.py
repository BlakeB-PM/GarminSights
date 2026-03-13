"""AI Coach service using RAG with Anthropic Claude."""

import logging
from datetime import datetime, timedelta
from typing import Optional

import anthropic

from app.database import execute_query
from app.config import settings

logger = logging.getLogger(__name__)

# System prompt for the AI Coach
SYSTEM_PROMPT = """You are a personal fitness coach analyzing real Garmin training data. \
You have been given the user's actual recorded data — use it.

STRICT RULES:
1. Ground every observation in the specific data provided. Quote exact numbers \
   (scores, weights, HRV values, durations, calories).
2. If the data doesn't contain something needed to answer a question, say so explicitly: \
   "Your data for this period doesn't include [X]." Never fabricate or guess at missing values.
3. When discussing strength, ALWAYS reference the all-time PRs section for personal records, \
   not just what was done in recent sessions.
4. Acknowledge the data window: start observations with "Over the past X days..." or \
   "Your data shows..." so the user knows you're grounded in their actual history.
5. Never give generic fitness advice disconnected from the actual data. Every recommendation \
   must trace back to something visible in the numbers.

COACHING STYLE:
- Lead with what the data actually shows (cite specific numbers), then give a targeted recommendation
- Be direct — not "make sure you sleep enough" but "Your sleep averaged 71/100 this past month \
  with HRV dropping to 38ms on Thursday — that's a clear recovery signal"
- Flag both concerns AND positives; reinforce good patterns you see
- Keep responses focused and scannable; use bullet points for observations and recommendations
- For strength questions, always compare to the all-time PR to give real context

DATA YOU HAVE ACCESS TO:
- Full training log for the requested window (every activity with date, type, duration, calories)
- Individual nightly sleep records (score, hours, HRV, resting HR) — not just averages
- Daily Body Battery, steps, and stress levels
- All-time strength PRs (estimated 1RM) so you always know the true lifetime bests
- Recent strength session details (sets, reps, weights in lbs)
- Cycling power data where available (FTP estimate, avg power per ride)

DATA NOT AVAILABLE (say so if asked):
- Nutrition or diet
- Injury history (unless the user tells you in their message)
- Data outside the window shown in the context"""


class CoachService:
    """Service for AI-powered fitness coaching using RAG."""

    def __init__(self):
        """Initialize the coach service."""
        self._client: Optional[anthropic.AsyncAnthropic] = None

    @property
    def client(self) -> anthropic.AsyncAnthropic:
        """Get or create the Anthropic client."""
        if self._client is None:
            api_key = settings.anthropic_api_key
            if not api_key:
                raise ValueError("ANTHROPIC_API_KEY not set in environment")
            self._client = anthropic.AsyncAnthropic(api_key=api_key)
        return self._client

    def build_fitness_context(self, days: int = 30) -> tuple[str, dict]:
        """
        Build a rich text summary of recent fitness data for LLM context.

        Args:
            days: Number of days to include in context

        Returns:
            Tuple of (context_text, summary_dict)
        """
        today = datetime.now().strftime("%Y-%m-%d")
        start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        context_parts = []
        summary = {
            "data_range": f"Last {days} days",
            "start_date": start_date,
            "end_date": today,
        }

        # Header: always tell Claude the exact date range
        context_parts.append(
            f"## Your Training Data: {start_date} through {today} ({days} days)\n"
        )

        # ── 1. Full training log ──────────────────────────────────────────────
        activities = execute_query(
            """
            SELECT
                name,
                activity_type,
                DATE(start_time) as date,
                ROUND(duration_seconds / 60.0) as minutes,
                calories
            FROM activities
            WHERE DATE(start_time) >= ?
            ORDER BY start_time DESC
            """,
            (start_date,),
        )

        if activities:
            context_parts.append("## Training Log (newest first)")
            for a in activities:
                activity_type = (a["activity_type"] or "unknown").replace("_", " ").title()
                label = a["name"] or activity_type
                cal_str = f", {a['calories']} cal" if a["calories"] else ""
                minutes_str = f"{a['minutes']:.0f} min" if a["minutes"] is not None else "? min"
                context_parts.append(
                    f"- {a['date']}: {label} ({activity_type}) — {minutes_str}{cal_str}"
                )
            summary["activities_count"] = len(activities)
        else:
            context_parts.append("## Training Log\nNo activities recorded in this period.")
            summary["activities_count"] = 0

        # ── 2. Sleep — day by day ─────────────────────────────────────────────
        sleep_rows = execute_query(
            """
            SELECT
                date,
                sleep_score,
                ROUND(total_sleep_seconds / 3600.0, 1) as hours,
                hrv_average,
                resting_hr
            FROM sleep
            WHERE date >= ?
            ORDER BY date DESC
            """,
            (start_date,),
        )

        if sleep_rows:
            # Averages for the summary dict
            scored = [r for r in sleep_rows if r["sleep_score"] is not None]
            avg_score = round(sum(r["sleep_score"] for r in scored) / len(scored)) if scored else None
            summary["avg_sleep_score"] = avg_score

            context_parts.append("\n## Sleep (nightly, newest first)")
            if avg_score is not None:
                hours_with_data = [r["hours"] for r in sleep_rows if r["hours"]]
                avg_hours = sum(hours_with_data) / len(hours_with_data) if hours_with_data else 0
                hrv_rows = [r["hrv_average"] for r in sleep_rows if r["hrv_average"]]
                avg_hrv = round(sum(hrv_rows) / len(hrv_rows)) if hrv_rows else None
                hrv_str = f", avg HRV {avg_hrv} ms" if avg_hrv else ""
                context_parts.append(
                    f"Average: {avg_score}/100, {avg_hours:.1f} hrs{hrv_str}"
                )
            for r in sleep_rows:
                score_str = f"{r['sleep_score']}/100" if r["sleep_score"] is not None else "no score"
                hours_str = f"{r['hours']} hrs" if r["hours"] else ""
                hrv_str = f", HRV {int(r['hrv_average'])} ms" if r["hrv_average"] is not None else ""
                rhr_str = f", RHR {int(r['resting_hr'])} bpm" if r["resting_hr"] is not None else ""
                context_parts.append(
                    f"- {r['date']}: {score_str}, {hours_str}{hrv_str}{rhr_str}"
                )
        else:
            context_parts.append("\n## Sleep\nNo sleep data recorded in this period.")

        # ── 3. Daily wellness ─────────────────────────────────────────────────
        dailies = execute_query(
            """
            SELECT
                AVG(steps) as avg_steps,
                AVG(body_battery_high) as avg_battery_high,
                AVG(body_battery_low) as avg_battery_low,
                AVG(stress_average) as avg_stress,
                COUNT(*) as days_with_data
            FROM dailies
            WHERE date >= ?
            """,
            (start_date,),
        )

        if dailies and dailies[0]["days_with_data"]:
            d = dailies[0]
            context_parts.append("\n## Daily Wellness (averages over period)")
            if d["avg_steps"] is not None:
                context_parts.append(f"- Average daily steps: {d['avg_steps']:,.0f}")
            if d["avg_battery_high"] is not None:
                low_str = f"{d['avg_battery_low']:.0f}" if d["avg_battery_low"] is not None else "N/A"
                context_parts.append(
                    f"- Average Body Battery: high {d['avg_battery_high']:.0f}, low {low_str} /100"
                )
                if d["avg_battery_low"] is not None and d["avg_battery_low"] < 20:
                    context_parts.append(
                        "  ⚠ Body Battery regularly draining very low — potential cumulative fatigue"
                    )
            if d["avg_stress"] is not None:
                context_parts.append(f"- Average stress level: {d['avg_stress']:.0f}/100")
        else:
            context_parts.append("\n## Daily Wellness\nNo daily metrics recorded in this period.")

        # ── 4. Strength: all-time PRs (no date filter) ───────────────────────
        all_time_prs = execute_query(
            """
            SELECT
                ss.exercise_name,
                MAX(ss.weight_lbs * (1 + ss.reps / 30.0)) as estimated_1rm_lbs,
                MAX(ss.weight_lbs) as max_weight_lbs,
                (SELECT reps FROM strength_sets s2
                 WHERE s2.exercise_name = ss.exercise_name
                   AND s2.weight_lbs = MAX(ss.weight_lbs)
                 LIMIT 1) as reps_at_max
            FROM strength_sets ss
            WHERE ss.weight_lbs > 0
            GROUP BY ss.exercise_name
            ORDER BY estimated_1rm_lbs DESC
            LIMIT 20
            """,
            (),
        )

        if all_time_prs:
            context_parts.append("\n## Strength: All-Time Personal Records")
            context_parts.append("(Use these for any 'what's my max?' questions)")
            for pr in all_time_prs:
                if pr["max_weight_lbs"] is None:
                    continue
                reps_str = f" x {pr['reps_at_max']} reps" if pr["reps_at_max"] else ""
                e1rm_str = f" (est. 1RM: {pr['estimated_1rm_lbs']:.1f} lbs)" if pr["estimated_1rm_lbs"] is not None else ""
                context_parts.append(
                    f"- {pr['exercise_name']}: {pr['max_weight_lbs']:.1f} lbs{reps_str}{e1rm_str}"
                )
            summary["strength_exercises_all_time"] = len(all_time_prs)

        # ── 5. Strength: recent sessions in the window ───────────────────────
        recent_strength = execute_query(
            """
            SELECT
                DATE(a.start_time) as date,
                ss.exercise_name,
                MAX(ss.weight_lbs) as max_weight_lbs,
                MAX(ss.reps) as max_reps,
                COUNT(*) as sets
            FROM strength_sets ss
            JOIN activities a ON ss.activity_id = a.id
            WHERE DATE(a.start_time) >= ? AND ss.weight_lbs > 0
            GROUP BY DATE(a.start_time), ss.exercise_name
            ORDER BY date DESC, max_weight_lbs DESC
            """,
            (start_date,),
        )

        if recent_strength:
            context_parts.append(f"\n## Strength: Recent Work ({start_date} to {today})")
            current_date = None
            for r in recent_strength:
                if r["max_weight_lbs"] is None:
                    continue
                if r["date"] != current_date:
                    current_date = r["date"]
                    context_parts.append(f"\n{current_date}:")
                reps_str = f" x {r['max_reps']} reps" if r["max_reps"] is not None else ""
                context_parts.append(
                    f"  - {r['exercise_name']}: {r['max_weight_lbs']:.1f} lbs"
                    f"{reps_str} ({r['sets']} sets)"
                )

        # ── 6. Cycling summary (if applicable) ───────────────────────────────
        cycling_activities = execute_query(
            """
            SELECT
                DATE(start_time) as date,
                name,
                ROUND(duration_seconds / 60.0) as minutes,
                calories,
                raw_json
            FROM activities
            WHERE DATE(start_time) >= ?
              AND activity_type IN ('cycling', 'road_biking', 'indoor_cycling', 'virtual_ride',
                                    'gravel_cycling', 'mountain_biking')
            ORDER BY start_time DESC
            """,
            (start_date,),
        )

        if cycling_activities:
            import json
            context_parts.append(f"\n## Cycling ({len(cycling_activities)} rides)")
            power_rides = []
            for ride in cycling_activities:
                raw = {}
                try:
                    raw = json.loads(ride["raw_json"]) if ride["raw_json"] else {}
                except Exception:
                    pass
                avg_power = raw.get("avgPower") or raw.get("averagePower")
                power_str = f", avg power {int(avg_power)} W" if avg_power else ""
                minutes_str = f"{ride['minutes']:.0f} min" if ride["minutes"] is not None else "? min"
                context_parts.append(
                    f"- {ride['date']}: {ride['name']} — {minutes_str}{power_str}"
                )
                if avg_power:
                    power_rides.append(avg_power)

            if power_rides:
                # Simple FTP estimate: best 20-min average power × 0.95
                # Here we just note the best avg power seen across rides as a proxy
                best_avg = max(float(p) for p in power_rides)
                ftp_estimate = round(best_avg * 0.95)
                context_parts.append(
                    f"\nEstimated FTP (rough): ~{ftp_estimate} W "
                    f"(based on best avg power of {int(best_avg)} W)"
                )

        context_text = "\n".join(context_parts)
        return context_text, summary

    async def chat(self, message: str, context_text: str) -> str:
        """
        Send a message to the AI coach and get a response.

        Args:
            message: User's question or message
            context_text: Pre-built fitness context string

        Returns:
            The AI response text
        """
        full_message = f"""Here is my recent fitness data:

{context_text}

---

My question: {message}"""

        response = await self.client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            messages=[
                {"role": "user", "content": full_message}
            ],
            timeout=60,
        )

        return response.content[0].text


# Singleton instance
_coach_service: Optional[CoachService] = None


def get_coach_service() -> CoachService:
    """Get or create the coach service singleton."""
    global _coach_service
    if _coach_service is None:
        _coach_service = CoachService()
    return _coach_service
