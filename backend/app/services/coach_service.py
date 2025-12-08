"""AI Coach service using RAG with Anthropic Claude."""

import os
import logging
from datetime import datetime, timedelta
from typing import Optional

import anthropic

from app.database import execute_query
from app.config import settings

logger = logging.getLogger(__name__)

# System prompt for the AI Coach
SYSTEM_PROMPT = """You are an expert fitness coach and sports scientist analyzing personal training data.
You have access to the user's recent workout history, sleep metrics, recovery data, and strength training progress.

Your role is to:
- Provide actionable, personalized advice based on the data provided
- Be encouraging but honest about areas for improvement
- Use specific numbers from the data to support your recommendations
- Consider recovery, sleep quality, and training balance in your advice
- When discussing strength exercises, reference specific weights, reps, and estimated 1RMs

Keep responses concise but informative. Use bullet points for clarity when appropriate.
If asked about data you don't have, acknowledge the limitation and suggest what might help."""


class CoachService:
    """Service for AI-powered fitness coaching using RAG."""
    
    def __init__(self):
        """Initialize the coach service."""
        self._client: Optional[anthropic.Anthropic] = None
    
    @property
    def client(self) -> anthropic.Anthropic:
        """Get or create the Anthropic client."""
        if self._client is None:
            api_key = settings.anthropic_api_key
            if not api_key:
                raise ValueError("ANTHROPIC_API_KEY not set in environment")
            self._client = anthropic.Anthropic(api_key=api_key)
        return self._client
    
    def build_fitness_context(self, days: int = 7) -> tuple[str, dict]:
        """
        Build a text summary of recent fitness data for LLM context.
        
        Args:
            days: Number of days to include in context
            
        Returns:
            Tuple of (context_text, summary_dict)
        """
        start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        context_parts = []
        summary = {
            "data_range": f"Last {days} days",
            "start_date": start_date,
        }
        
        # 1. Activities summary
        activities = execute_query(
            """
            SELECT 
                activity_type,
                COUNT(*) as count,
                SUM(duration_seconds) / 60.0 as total_minutes,
                SUM(calories) as total_calories
            FROM activities 
            WHERE start_time >= ?
            GROUP BY activity_type
            ORDER BY count DESC
            """,
            (start_date,)
        )
        
        if activities:
            context_parts.append("## Recent Activities")
            total_activities = 0
            for a in activities:
                activity_type = a["activity_type"] or "unknown"
                count = a["count"]
                minutes = a["total_minutes"] or 0
                total_activities += count
                context_parts.append(
                    f"- {activity_type.replace('_', ' ').title()}: {count} sessions, {minutes:.0f} minutes total"
                )
            summary["activities_count"] = total_activities
        else:
            context_parts.append("## Recent Activities\nNo activities recorded in this period.")
            summary["activities_count"] = 0
        
        # 2. Sleep summary
        sleep = execute_query(
            """
            SELECT 
                AVG(sleep_score) as avg_score,
                AVG(total_sleep_seconds) / 3600.0 as avg_hours,
                AVG(hrv_average) as avg_hrv,
                AVG(resting_hr) as avg_rhr,
                MIN(sleep_score) as min_score,
                MAX(sleep_score) as max_score,
                COUNT(*) as days_with_data
            FROM sleep 
            WHERE date >= ?
            """,
            (start_date,)
        )
        
        if sleep and sleep[0]["days_with_data"]:
            s = sleep[0]
            context_parts.append("\n## Sleep Quality")
            context_parts.append(f"- Average sleep score: {s['avg_score']:.0f}/100 (range: {s['min_score']:.0f}-{s['max_score']:.0f})")
            context_parts.append(f"- Average sleep duration: {s['avg_hours']:.1f} hours")
            if s["avg_hrv"]:
                context_parts.append(f"- Average HRV: {s['avg_hrv']:.0f} ms")
            if s["avg_rhr"]:
                context_parts.append(f"- Average resting heart rate: {s['avg_rhr']:.0f} bpm")
            summary["avg_sleep_score"] = round(s["avg_score"]) if s["avg_score"] else None
        else:
            context_parts.append("\n## Sleep Quality\nNo sleep data recorded in this period.")
        
        # 3. Daily wellness summary
        dailies = execute_query(
            """
            SELECT 
                AVG(steps) as avg_steps,
                SUM(steps) as total_steps,
                AVG(body_battery_high) as avg_battery,
                AVG(stress_average) as avg_stress,
                COUNT(*) as days_with_data
            FROM dailies 
            WHERE date >= ?
            """,
            (start_date,)
        )
        
        if dailies and dailies[0]["days_with_data"]:
            d = dailies[0]
            context_parts.append("\n## Daily Wellness")
            context_parts.append(f"- Average daily steps: {d['avg_steps']:,.0f}")
            context_parts.append(f"- Total steps: {d['total_steps']:,.0f}")
            if d["avg_battery"]:
                context_parts.append(f"- Average Body Battery: {d['avg_battery']:.0f}/100")
            if d["avg_stress"]:
                context_parts.append(f"- Average stress level: {d['avg_stress']:.0f}/100")
        else:
            context_parts.append("\n## Daily Wellness\nNo daily metrics recorded in this period.")
        
        # 4. Strength training PRs and recent lifts
        strength_prs = execute_query(
            """
            SELECT 
                ss.exercise_name,
                MAX(ss.weight_kg) as max_weight,
                MAX(ss.weight_kg * (1 + ss.reps / 30.0)) as estimated_1rm,
                COUNT(*) as total_sets
            FROM strength_sets ss
            JOIN activities a ON ss.activity_id = a.id
            WHERE a.start_time >= ? AND ss.weight_kg > 0
            GROUP BY ss.exercise_name
            ORDER BY estimated_1rm DESC
            LIMIT 10
            """,
            (start_date,)
        )
        
        if strength_prs:
            context_parts.append("\n## Strength Training (Top Exercises)")
            for pr in strength_prs:
                context_parts.append(
                    f"- {pr['exercise_name']}: {pr['max_weight']:.1f}kg max, Est 1RM: {pr['estimated_1rm']:.1f}kg ({pr['total_sets']} sets)"
                )
            summary["strength_exercises"] = len(strength_prs)
        
        # 5. Recent activity details (last 5)
        recent = execute_query(
            """
            SELECT name, activity_type, start_time, duration_seconds / 60.0 as minutes
            FROM activities
            WHERE start_time >= ?
            ORDER BY start_time DESC
            LIMIT 5
            """,
            (start_date,)
        )
        
        if recent:
            context_parts.append("\n## Most Recent Workouts")
            for r in recent:
                date = r["start_time"].split("T")[0] if r["start_time"] else "Unknown"
                context_parts.append(
                    f"- {date}: {r['name'] or r['activity_type']} ({r['minutes']:.0f} min)"
                )
        
        context_text = "\n".join(context_parts)
        return context_text, summary
    
    async def chat(self, message: str, context_days: int = 7) -> tuple[str, dict]:
        """
        Send a message to the AI coach and get a response.
        
        Args:
            message: User's question or message
            context_days: Number of days of data to include in context
            
        Returns:
            Tuple of (response_text, context_summary)
        """
        # Build context from database
        context_text, summary = self.build_fitness_context(context_days)
        
        # Compose the full user message with data context
        full_message = f"""Here is my recent fitness data:

{context_text}

---

My question: {message}"""
        
        try:
            response = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=1024,
                system=SYSTEM_PROMPT,
                messages=[
                    {"role": "user", "content": full_message}
                ]
            )
            
            response_text = response.content[0].text
            return response_text, summary
            
        except anthropic.APIError as e:
            logger.error(f"Anthropic API error: {e}")
            raise
        except Exception as e:
            logger.error(f"Chat error: {e}")
            raise


# Singleton instance
_coach_service: Optional[CoachService] = None


def get_coach_service() -> CoachService:
    """Get or create the coach service singleton."""
    global _coach_service
    if _coach_service is None:
        _coach_service = CoachService()
    return _coach_service

