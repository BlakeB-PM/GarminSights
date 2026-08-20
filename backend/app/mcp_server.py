"""GarminSights MCP server.

Exposes coaching tools over the synced Garmin data in fitness.db so a remote MCP
client (Claude chat on desktop or Android) can answer any fitness question. Chat
is the primary interface for this data, so the server carries more than queries:
it also holds Blake's training policy and the programs built with him.

Three groups of tools:

* **Data** (read-only): self-contained queries against activities, sleep,
  dailies and strength_sets, reusing the curated reference tables in
  muscle_mapping.py / rep_ranges.py and the raw_json parser in
  activity_parser.py. These deliberately do NOT use the old in-app chat coach.
* **Rules**: Blake's durable training constraints and preferences. Read via
  get_coaching_context, extended through conversation via propose_rule.
* **Plans**: programs saved so they outlive the chat that produced them.

The split that makes this work: the `instructions` string below carries the
*protocol* (what to always do) and changes only on deploy, while the database
carries the *content* (the actual rules) and changes by talking to the server.
Putting rules in the instructions would mean a deploy for every lesson learned.
See services/coaching_store.py for the storage layer.
"""

import re
import json
import logging
from datetime import datetime, timedelta

from fastmcp import FastMCP

from app.database import execute_query, SCHEMA
from app.services.activity_parser import parse_activity_data
from app.services.sync_service import SyncService
from app.services.muscle_mapping import (
    MUSCLE_GROUPS,
    get_all_muscle_groups,
    get_primary_muscle_group,
)
from app.services.rep_ranges import classify_rep_range
from app.services import coaching_store

logger = logging.getLogger(__name__)

mcp = FastMCP(
    name="GarminSights",
    instructions=(
        "You are Blake's strength and endurance coach. This server holds his Garmin "
        "history, his training rules, and his saved programs.\n"
        "\n"
        "PROTOCOL, follow it in this order:\n"
        "1. Call sync_garmin_data before answering any question about workouts, "
        "sleep, or wellness, so the data is current. Sync first, then query.\n"
        "2. Before you program, plan, or answer 'what should I train', call "
        "get_coaching_context. It returns Blake's rules and his active plan. "
        "Constraints and limitations in it are binding; preferences are defaults you "
        "may deviate from with a stated reason. Never ask Blake to re-state a rule "
        "that this tool already returns.\n"
        "3. When programming, audit before prescribing: get_training_frequency and "
        "get_muscle_group_volume to find undertrained muscle groups, then "
        "get_recovery_status to set intensity. Then build the session.\n"
        "4. When Blake states a durable preference, or corrects your programming, "
        "call propose_rule and show him the proposal. It only takes effect once he "
        "says yes and you call confirm_rule. Do not save passing remarks, only rules "
        "he would want applied months from now.\n"
        "5. When you build a program with him, call save_training_plan so it "
        "survives the conversation. Revise with update_training_plan rather than "
        "rebuilding from scratch.\n"
        "\n"
        "DATA NOTES: prefer the curated tools; use describe_data + run_sql for "
        "anything granular (e.g. rest times, a specific muscle, custom date slices). "
        "All weights are in pounds (lbs); durations are in seconds unless noted."
    ),
)

CYCLING_TYPES = (
    "cycling",
    "indoor_cycling",
    "virtual_ride",
    "road_biking",
    "gravel_cycling",
    "mountain_biking",
)


# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------

def _start_date(days: int) -> str:
    """Return the YYYY-MM-DD cutoff for `days` ago."""
    return (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")


def _epley_1rm(weight_lbs: float, reps: int) -> float:
    """Estimated one-rep max via the Epley formula."""
    return weight_lbs * (1 + reps / 30.0)


def _weighted_avg(pairs: list[tuple[float, float]]):
    """Duration-weighted average of (value, weight) pairs."""
    total_w = sum(w for _, w in pairs)
    if not total_w:
        return None
    return sum(v * w for v, w in pairs) / total_w


def _round(value, digits: int = 1):
    return round(value, digits) if isinstance(value, (int, float)) else value


# ----------------------------------------------------------------------------
# Overview & activities
# ----------------------------------------------------------------------------

@mcp.tool
def get_fitness_summary(days: int = 30) -> dict:
    """High-level snapshot for the last `days`: activity counts by type, totals,
    top all-time strength PRs, and the latest recovery/sleep readout. Good first
    call to orient before drilling into a specific question.
    """
    start = _start_date(days)
    today = datetime.now().strftime("%Y-%m-%d")

    breakdown = execute_query(
        """
        SELECT activity_type,
               COUNT(*) AS sessions,
               COALESCE(SUM(duration_seconds) / 60, 0) AS minutes,
               COALESCE(SUM(calories), 0) AS calories
        FROM activities
        WHERE DATE(start_time) >= ? AND activity_type IS NOT NULL
        GROUP BY activity_type
        ORDER BY minutes DESC
        """,
        (start,),
    )

    totals = {
        "sessions": sum(r["sessions"] for r in breakdown),
        "minutes": sum(r["minutes"] for r in breakdown),
        "calories": sum(r["calories"] for r in breakdown),
    }

    prs = execute_query(
        """
        SELECT exercise_name,
               MAX(weight_lbs * (1 + reps / 30.0)) AS estimated_1rm_lbs,
               MAX(weight_lbs) AS max_weight_lbs
        FROM strength_sets
        WHERE weight_lbs > 0
        GROUP BY exercise_name
        ORDER BY estimated_1rm_lbs DESC
        LIMIT 5
        """,
    )
    for p in prs:
        p["estimated_1rm_lbs"] = _round(p["estimated_1rm_lbs"])
        p["max_weight_lbs"] = _round(p["max_weight_lbs"])

    sleep_avg = execute_query(
        """
        SELECT ROUND(AVG(sleep_score), 1) AS avg_sleep_score,
               ROUND(AVG(total_sleep_seconds) / 3600.0, 1) AS avg_sleep_hours,
               ROUND(AVG(hrv_average), 1) AS avg_hrv,
               ROUND(AVG(resting_hr), 1) AS avg_resting_hr,
               COUNT(*) AS nights
        FROM sleep
        WHERE date >= ?
        """,
        (start,),
    )

    latest = execute_query(
        """
        SELECT d.date, d.body_battery_high, d.body_battery_low, d.stress_average,
               s.sleep_score, s.hrv_average
        FROM dailies d
        LEFT JOIN sleep s ON d.date = s.date
        ORDER BY d.date DESC
        LIMIT 1
        """,
    )

    return {
        "period": {"start": start, "end": today, "days": days},
        "activity_breakdown": breakdown,
        "totals": totals,
        "top_strength_prs": prs,
        "sleep_averages": sleep_avg[0] if sleep_avg else None,
        "latest_day": latest[0] if latest else None,
        "note": "Weights in lbs. Use get_personal_records for the full PR list.",
    }


@mcp.tool
def list_activities(
    days: int = 30,
    activity_type: str | None = None,
    limit: int = 50,
) -> list[dict]:
    """List activities (newest first) in the last `days`, optionally filtered by
    activity_type (e.g. 'strength_training', 'cycling', 'running'). Returns summary
    fields; call get_activity_detail for full metrics.
    """
    limit = max(1, min(limit, 500))
    query = (
        "SELECT id, garmin_id, activity_type, name, start_time, "
        "duration_seconds, distance_meters, calories "
        "FROM activities WHERE DATE(start_time) >= ?"
    )
    params: list = [_start_date(days)]
    if activity_type:
        query += " AND activity_type = ?"
        params.append(activity_type)
    query += " ORDER BY start_time DESC LIMIT ?"
    params.append(limit)
    return execute_query(query, tuple(params))


@mcp.tool
def get_activity_detail(activity_id: int) -> dict:
    """Full detail for one activity by its local id: parsed metrics from raw_json
    (heart rate, power, cadence, zones, splits, training effect) plus every
    strength set in order, including rest periods (exercise_name = 'Rest').
    """
    rows = execute_query("SELECT * FROM activities WHERE id = ?", (activity_id,))
    if not rows:
        return {"error": f"No activity with id {activity_id}"}

    activity = rows[0]
    raw_json = activity.pop("raw_json", None)
    activity["parsed_metrics"] = parse_activity_data(raw_json)
    activity["strength_sets"] = execute_query(
        "SELECT set_number, exercise_name, reps, weight_lbs, duration_seconds "
        "FROM strength_sets WHERE activity_id = ? ORDER BY set_number",
        (activity_id,),
    )
    return activity


@mcp.tool
def get_activity_breakdown(days: int = 30) -> dict:
    """Sessions, minutes, and calories grouped by activity type over the last
    `days`. Useful for training-balance questions (lifting vs cardio volume).
    """
    start = _start_date(days)
    rows = execute_query(
        """
        SELECT activity_type,
               COUNT(*) AS sessions,
               COALESCE(SUM(duration_seconds) / 60, 0) AS minutes,
               COALESCE(SUM(calories), 0) AS calories
        FROM activities
        WHERE DATE(start_time) >= ? AND activity_type IS NOT NULL
        GROUP BY activity_type
        ORDER BY minutes DESC
        """,
        (start,),
    )
    return {
        "period_days": days,
        "start": start,
        "breakdown": rows,
        "totals": {
            "sessions": sum(r["sessions"] for r in rows),
            "minutes": sum(r["minutes"] for r in rows),
            "calories": sum(r["calories"] for r in rows),
        },
    }


@mcp.tool
def get_training_load(acute_days: int = 7, chronic_days: int = 28) -> dict:
    """Acute vs chronic training load and the acute:chronic ratio with a status
    band (under/optimal/caution/danger). Load = sum(minutes * intensity factor),
    where intensity is derived from activity type and calories/minute.
    """
    acute_days = max(1, min(acute_days, 60))
    chronic_days = max(7, min(chronic_days, 120))
    now = datetime.now()
    acute_start = (now - timedelta(days=acute_days)).strftime("%Y-%m-%d")
    chronic_start = (now - timedelta(days=chronic_days)).strftime("%Y-%m-%d")
    end = now.strftime("%Y-%m-%d")

    type_factors = {
        "strength_training": 1.5,
        "running": 1.3,
        "treadmill_running": 1.3,
        "cycling": 1.2,
        "virtual_ride": 1.2,
        "indoor_cycling": 1.2,
        "swimming": 1.2,
        "hiking": 1.1,
        "walking": 0.8,
        "yoga": 0.7,
    }

    def _load(start: str) -> float:
        rows = execute_query(
            """
            SELECT COALESCE(duration_seconds, 0) AS dur,
                   COALESCE(calories, 0) AS cal,
                   activity_type
            FROM activities
            WHERE DATE(start_time) >= ? AND DATE(start_time) <= ?
              AND COALESCE(duration_seconds, 0) > 0
            """,
            (start, end),
        )
        total = 0.0
        for r in rows:
            minutes = r["dur"] / 60
            cpm = (r["cal"] / minutes) if minutes else 0
            mult = 1.5 if cpm > 10 else 1.2 if cpm > 7 else 1.0 if cpm > 4 else 0.8
            total += minutes * type_factors.get(r["activity_type"] or "", 1.0) * mult
        return total

    acute = _load(acute_start)
    chronic_total = _load(chronic_start)
    chronic = chronic_total / chronic_days if chronic_total else 0.0

    if chronic == 0 and acute > 0:
        chronic, ratio = acute, 1.0
    else:
        ratio = (acute / chronic) if chronic else 0.0

    if acute == 0 and chronic == 0:
        status, rec = "no_data", "No training data in this window."
    elif ratio < 0.8:
        status, rec = "under_training", "Below optimal; room to add volume gradually."
    elif ratio <= 1.3:
        status, rec = "optimal", "Load is in the sweet spot; maintain."
    elif ratio <= 1.5:
        status, rec = "caution", "Elevated load; watch recovery, consider a lighter day."
    else:
        status, rec = "danger", "Very high load; high injury risk, consider a deload."

    return {
        "acute_load": _round(acute),
        "chronic_load": _round(chronic),
        "acute_chronic_ratio": _round(ratio, 2),
        "acute_days": acute_days,
        "chronic_days": chronic_days,
        "status": status,
        "recommendation": rec,
    }


# ----------------------------------------------------------------------------
# Strength
# ----------------------------------------------------------------------------

@mcp.tool
def list_exercises() -> dict:
    """List every distinct strength exercise name on record (excludes 'Rest'),
    plus the primary muscle group inferred for each. Use the exact names returned
    here when calling other strength tools.
    """
    rows = execute_query(
        "SELECT DISTINCT exercise_name FROM strength_sets "
        "WHERE exercise_name IS NOT NULL AND exercise_name != 'Rest' "
        "ORDER BY exercise_name",
    )
    exercises = [
        {"exercise_name": r["exercise_name"],
         "primary_muscle": get_primary_muscle_group(r["exercise_name"])}
        for r in rows
    ]
    return {"count": len(exercises), "exercises": exercises}


@mcp.tool
def get_exercise_progress(exercise_name: str, days: int = 180) -> dict:
    """Per-session progression for one exercise over `days`: estimated 1RM (Epley),
    total volume (sum reps*weight), max weight, total reps/sets, and average rest
    between sets that day. Includes the all-time best for context.
    """
    start = _start_date(days)
    sessions = execute_query(
        """
        SELECT DATE(a.start_time) AS date,
               MAX(ss.weight_lbs * (1 + ss.reps / 30.0)) AS estimated_1rm_lbs,
               SUM(ss.weight_lbs * ss.reps) AS total_volume_lbs,
               MAX(ss.weight_lbs) AS max_weight_lbs,
               SUM(ss.reps) AS total_reps,
               COUNT(*) AS work_sets
        FROM strength_sets ss
        JOIN activities a ON ss.activity_id = a.id
        WHERE ss.exercise_name = ? AND DATE(a.start_time) >= ? AND ss.weight_lbs > 0
        GROUP BY DATE(a.start_time)
        ORDER BY date
        """,
        (exercise_name, start),
    )
    for s in sessions:
        s["estimated_1rm_lbs"] = _round(s["estimated_1rm_lbs"])
        s["total_volume_lbs"] = _round(s["total_volume_lbs"])
        s["max_weight_lbs"] = _round(s["max_weight_lbs"])

    all_time = execute_query(
        """
        SELECT MAX(weight_lbs * (1 + reps / 30.0)) AS estimated_1rm_lbs,
               MAX(weight_lbs) AS max_weight_lbs
        FROM strength_sets WHERE exercise_name = ? AND weight_lbs > 0
        """,
        (exercise_name,),
    )

    return {
        "exercise_name": exercise_name,
        "period_days": days,
        "sessions": sessions,
        "session_count": len(sessions),
        "all_time_best": {
            "estimated_1rm_lbs": _round(all_time[0]["estimated_1rm_lbs"]) if all_time else None,
            "max_weight_lbs": _round(all_time[0]["max_weight_lbs"]) if all_time else None,
        },
    }


@mcp.tool
def get_personal_records(limit: int = 25) -> list[dict]:
    """All-time personal records per exercise: estimated 1RM (Epley), heaviest
    weight lifted, and the date it was hit. Sorted by estimated 1RM descending.
    """
    limit = max(1, min(limit, 100))
    return execute_query(
        """
        SELECT ss.exercise_name,
               ROUND(MAX(ss.weight_lbs * (1 + ss.reps / 30.0)), 1) AS estimated_1rm_lbs,
               ROUND(MAX(ss.weight_lbs), 1) AS max_weight_lbs,
               (SELECT DATE(a2.start_time)
                  FROM strength_sets s2 JOIN activities a2 ON s2.activity_id = a2.id
                 WHERE s2.exercise_name = ss.exercise_name
                 ORDER BY (s2.weight_lbs * (1 + s2.reps / 30.0)) DESC LIMIT 1) AS pr_date
        FROM strength_sets ss
        WHERE ss.weight_lbs > 0
        GROUP BY ss.exercise_name
        ORDER BY estimated_1rm_lbs DESC
        LIMIT ?
        """,
        (limit,),
    )


@mcp.tool
def get_recent_strength_workouts(limit: int = 10) -> list[dict]:
    """Most recent strength sessions with summary stats: exercises hit, work sets,
    total reps, and total volume (lbs). Rest periods are excluded from these counts.
    """
    limit = max(1, min(limit, 50))
    return execute_query(
        """
        SELECT a.id, a.name, a.start_time, a.duration_seconds,
               COUNT(DISTINCT ss.exercise_name) AS exercises,
               COUNT(ss.id) AS work_sets,
               SUM(ss.reps) AS total_reps,
               ROUND(SUM(ss.weight_lbs * ss.reps), 1) AS total_volume_lbs
        FROM activities a
        JOIN strength_sets ss ON a.id = ss.activity_id
        WHERE a.activity_type = 'strength_training'
          AND ss.exercise_name != 'Rest' AND ss.weight_lbs > 0
        GROUP BY a.id
        ORDER BY a.start_time DESC
        LIMIT ?
        """,
        (limit,),
    )


@mcp.tool
def get_muscle_group_volume(days: int = 30) -> dict:
    """Volume and set counts per muscle group over `days`, inferred from exercise
    names via the curated mapping. Each exercise counts toward its primary and
    secondary muscle groups. Answers 'is my back lagging my chest?' type questions.
    """
    start = _start_date(days)
    rows = execute_query(
        """
        SELECT ss.exercise_name,
               SUM(ss.weight_lbs * ss.reps) AS volume,
               COUNT(*) AS sets
        FROM strength_sets ss
        JOIN activities a ON ss.activity_id = a.id
        WHERE DATE(a.start_time) >= ? AND ss.weight_lbs > 0
          AND ss.exercise_name IS NOT NULL AND ss.exercise_name != 'Rest'
        GROUP BY ss.exercise_name
        """,
        (start,),
    )
    result = {mg: {"volume_lbs": 0.0, "sets": 0} for mg in MUSCLE_GROUPS}
    result["Other"] = {"volume_lbs": 0.0, "sets": 0}
    for r in rows:
        for mg in get_all_muscle_groups(r["exercise_name"]):
            bucket = result.setdefault(mg, {"volume_lbs": 0.0, "sets": 0})
            bucket["volume_lbs"] += r["volume"] or 0
            bucket["sets"] += r["sets"] or 0
    for bucket in result.values():
        bucket["volume_lbs"] = _round(bucket["volume_lbs"])
    return {"period_days": days, "start": start, "by_muscle_group": result}


@mcp.tool
def get_training_frequency(weeks: int = 8) -> list[dict]:
    """Per muscle group over the last `weeks`: average sessions per week, days
    since last trained, total sets, and total volume. Flags neglected or
    overworked muscle groups. Sorted by frequency (most trained first).
    """
    weeks = max(1, min(weeks, 52))
    start = (datetime.now() - timedelta(weeks=weeks)).strftime("%Y-%m-%d")
    rows = execute_query(
        """
        SELECT ss.exercise_name, DATE(a.start_time) AS d,
               COUNT(*) AS sets, SUM(ss.weight_lbs * ss.reps) AS volume
        FROM strength_sets ss
        JOIN activities a ON ss.activity_id = a.id
        WHERE DATE(a.start_time) >= ? AND ss.weight_lbs > 0
          AND ss.exercise_name IS NOT NULL AND ss.exercise_name != 'Rest'
        GROUP BY ss.exercise_name, DATE(a.start_time)
        """,
        (start,),
    )
    stats = {mg: {"days": set(), "sets": 0, "volume": 0.0, "last": None} for mg in MUSCLE_GROUPS}
    for r in rows:
        day = datetime.strptime(r["d"], "%Y-%m-%d").date()
        for mg in get_all_muscle_groups(r["exercise_name"]):
            if mg not in stats:
                continue
            stats[mg]["days"].add(day)
            stats[mg]["sets"] += r["sets"]
            stats[mg]["volume"] += r["volume"] or 0
            if stats[mg]["last"] is None or day > stats[mg]["last"]:
                stats[mg]["last"] = day
    today = datetime.now().date()
    out = []
    for mg in MUSCLE_GROUPS:
        s = stats[mg]
        out.append({
            "muscle_group": mg,
            "avg_sessions_per_week": round(len(s["days"]) / weeks, 2),
            "days_since_last": (today - s["last"]).days if s["last"] else None,
            "total_sets": s["sets"],
            "total_volume_lbs": _round(s["volume"]),
        })
    out.sort(key=lambda x: x["avg_sessions_per_week"], reverse=True)
    return out


@mcp.tool
def get_volume_trends(weeks: int = 12, muscle_group: str | None = None) -> list[dict]:
    """Weekly strength tonnage and set counts for the last `weeks`, optionally
    filtered to one muscle_group (e.g. 'Chest', 'Back'). Use to see if weekly
    volume is trending up, flat, or down.
    """
    weeks = max(1, min(weeks, 52))
    start = (datetime.now() - timedelta(weeks=weeks)).strftime("%Y-%m-%d")
    rows = execute_query(
        """
        SELECT DATE(a.start_time) AS d, ss.exercise_name,
               SUM(ss.weight_lbs * ss.reps) AS tonnage, COUNT(*) AS sets
        FROM strength_sets ss
        JOIN activities a ON ss.activity_id = a.id
        WHERE DATE(a.start_time) >= ? AND ss.weight_lbs > 0
          AND ss.exercise_name IS NOT NULL AND ss.exercise_name != 'Rest'
        GROUP BY DATE(a.start_time), ss.exercise_name
        """,
        (start,),
    )
    weekly: dict[str, dict] = {}
    for r in rows:
        if muscle_group and muscle_group not in get_all_muscle_groups(r["exercise_name"]):
            continue
        d = datetime.strptime(r["d"], "%Y-%m-%d").date()
        week_start = (d - timedelta(days=d.weekday())).isoformat()
        w = weekly.setdefault(week_start, {"week_start": week_start, "tonnage_lbs": 0.0, "sets": 0})
        w["tonnage_lbs"] += r["tonnage"] or 0
        w["sets"] += r["sets"]
    out = sorted(weekly.values(), key=lambda x: x["week_start"])
    for w in out:
        w["tonnage_lbs"] = _round(w["tonnage_lbs"])
    return out


@mcp.tool
def get_sets(
    exercise_name: str | None = None,
    activity_id: int | None = None,
    include_rest: bool = False,
    limit: int = 200,
) -> list[dict]:
    """Raw individual sets (newest first) with reps, weight, set duration, rep-range
    classification, and the workout date. Filter by exercise_name and/or activity_id.
    Set include_rest=True to also return rest periods (exercise_name = 'Rest', where
    duration_seconds is the rest length).
    """
    limit = max(1, min(limit, 1000))
    query = (
        "SELECT ss.id, ss.activity_id, DATE(a.start_time) AS date, ss.set_number, "
        "ss.exercise_name, ss.reps, ss.weight_lbs, ss.duration_seconds "
        "FROM strength_sets ss JOIN activities a ON ss.activity_id = a.id WHERE 1=1"
    )
    params: list = []
    if not include_rest:
        query += " AND ss.exercise_name != 'Rest'"
    if exercise_name:
        query += " AND ss.exercise_name = ?"
        params.append(exercise_name)
    if activity_id:
        query += " AND ss.activity_id = ?"
        params.append(activity_id)
    query += " ORDER BY a.start_time DESC, ss.set_number LIMIT ?"
    params.append(limit)
    rows = execute_query(query, tuple(params))
    for r in rows:
        r["rep_range"] = classify_rep_range(r.get("reps"))
    return rows


@mcp.tool
def get_rest_times(exercise_name: str | None = None, days: int = 90) -> dict:
    """Rest-period analysis over `days`. Rest is recorded as sets with
    exercise_name = 'Rest' and duration_seconds = rest length. Returns overall
    average/min/max/median rest and a per-session breakdown. If exercise_name is
    given, only rests inside sessions that included that exercise are considered.
    """
    start = _start_date(days)
    if exercise_name:
        rows = execute_query(
            """
            SELECT DATE(a.start_time) AS date, ss.duration_seconds AS rest_seconds
            FROM strength_sets ss
            JOIN activities a ON ss.activity_id = a.id
            WHERE ss.exercise_name = 'Rest' AND ss.duration_seconds > 0
              AND DATE(a.start_time) >= ?
              AND ss.activity_id IN (
                  SELECT DISTINCT activity_id FROM strength_sets WHERE exercise_name = ?
              )
            ORDER BY a.start_time DESC, ss.set_number
            """,
            (start, exercise_name),
        )
    else:
        rows = execute_query(
            """
            SELECT DATE(a.start_time) AS date, ss.duration_seconds AS rest_seconds
            FROM strength_sets ss
            JOIN activities a ON ss.activity_id = a.id
            WHERE ss.exercise_name = 'Rest' AND ss.duration_seconds > 0
              AND DATE(a.start_time) >= ?
            ORDER BY a.start_time DESC, ss.set_number
            """,
            (start,),
        )

    rests = [r["rest_seconds"] for r in rows]
    by_session: dict[str, list[int]] = {}
    for r in rows:
        by_session.setdefault(r["date"], []).append(r["rest_seconds"])

    def _stats(values: list[int]) -> dict:
        if not values:
            return {}
        s = sorted(values)
        n = len(s)
        median = s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2
        return {
            "rest_periods": n,
            "avg_rest_seconds": round(sum(s) / n, 1),
            "min_rest_seconds": s[0],
            "max_rest_seconds": s[-1],
            "median_rest_seconds": median,
        }

    sessions = [
        {"date": d, **_stats(v)} for d, v in sorted(by_session.items(), reverse=True)
    ]
    return {
        "exercise_name": exercise_name,
        "period_days": days,
        "overall": _stats(rests),
        "by_session": sessions,
    }


# ----------------------------------------------------------------------------
# Cycling
# ----------------------------------------------------------------------------

def _cycling_rides(start: str, end: str | None = None) -> list[dict]:
    """Fetch cycling activities with raw_json parsed into metrics."""
    placeholders = ",".join("?" for _ in CYCLING_TYPES)
    query = (
        f"SELECT id, name, start_time, duration_seconds, distance_meters, calories, "
        f"raw_json FROM activities WHERE activity_type IN ({placeholders}) "
        f"AND DATE(start_time) >= ?"
    )
    params = list(CYCLING_TYPES) + [start]
    if end:
        query += " AND DATE(start_time) <= ?"
        params.append(end)
    query += " ORDER BY start_time DESC"
    out = []
    for a in execute_query(query, tuple(params)):
        parsed = parse_activity_data(a.pop("raw_json", None))
        out.append({**a, **parsed})
    return out


@mcp.tool
def get_cycling_summary(days: int = 30) -> dict:
    """Aggregate cycling metrics over `days`: ride count, total duration/distance,
    duration-weighted average power, normalized power, cadence, efficiency factor
    (NP/avg HR), and an estimated FTP (0.95 x best 20-min power).
    """
    start = _start_date(days)
    rides = _cycling_rides(start)
    if not rides:
        return {"period_days": days, "start": start, "total_rides": 0}

    power, npwr, cad, ef, best20 = [], [], [], [], []
    total_dur = total_dist = 0
    for r in rides:
        dur = r.get("duration_seconds") or 0
        total_dur += dur
        total_dist += r.get("distance_meters") or 0
        if r.get("average_power") and dur:
            power.append((r["average_power"], dur))
        if r.get("normalized_power") and dur:
            npwr.append((r["normalized_power"], dur))
        if r.get("cadence") and dur:
            cad.append((r["cadence"], dur))
        hr = r.get("heart_rate") or {}
        avg_hr = hr.get("avg") if isinstance(hr, dict) else None
        if r.get("normalized_power") and avg_hr:
            ef.append((r["normalized_power"] / avg_hr, dur))
        if r.get("max_20min_power"):
            best20.append(r["max_20min_power"])

    return {
        "period_days": days,
        "start": start,
        "total_rides": len(rides),
        "total_duration_minutes": _round(total_dur / 60),
        "total_distance_miles": _round(total_dist / 1609.34, 2),
        "avg_power_watts": _round(_weighted_avg(power)),
        "avg_normalized_power_watts": _round(_weighted_avg(npwr)),
        "avg_cadence_rpm": _round(_weighted_avg(cad)),
        "avg_efficiency_factor": _round(_weighted_avg(ef), 3),
        "estimated_ftp_watts": _round(max(best20) * 0.95) if best20 else None,
    }


@mcp.tool
def get_power_curve(days: int = 90) -> dict:
    """Best power output at each standard duration (1s to 1800s) across all rides
    in the last `days`, plus an FTP estimate. Shows where you're strong (sprint vs
    sustained). Values in watts.
    """
    start = _start_date(days)
    rides = _cycling_rides(start)
    intervals = ["1", "2", "5", "10", "20", "30", "60", "120", "300", "600", "1200", "1800"]
    curve: dict[str, int] = {}
    best20 = None
    for r in rides:
        pc = r.get("power_curve") or {}
        for i in intervals:
            if i in pc and (i not in curve or pc[i] > curve[i]):
                curve[i] = pc[i]
        if r.get("max_20min_power") and (best20 is None or r["max_20min_power"] > best20):
            best20 = r["max_20min_power"]
    ftp = best20 * 0.95 if best20 else (curve.get("1200", 0) * 0.95 or None)
    return {
        "period_days": days,
        "start": start,
        "best_power_by_duration_seconds": curve,
        "estimated_ftp_watts": _round(ftp) if ftp else None,
    }


@mcp.tool
def get_power_zones(days: int = 30) -> dict:
    """Time spent in each cycling power zone (1-7) aggregated over `days`, with
    seconds and percentage per zone. Use to judge whether riding skews easy
    (endurance) or hard (threshold/VO2).
    """
    start = _start_date(days)
    rides = _cycling_rides(start)
    labels = {
        "zone_1": "Active Recovery", "zone_2": "Endurance", "zone_3": "Tempo",
        "zone_4": "Threshold", "zone_5": "VO2max", "zone_6": "Anaerobic",
        "zone_7": "Neuromuscular",
    }
    totals: dict[str, int] = {}
    grand = 0
    for r in rides:
        for z, secs in (r.get("power_zones") or {}).items():
            if secs:
                totals[z] = totals.get(z, 0) + secs
                grand += secs
    zones = {}
    for z in labels:
        secs = totals.get(z, 0)
        zones[z] = {
            "label": labels[z],
            "seconds": secs,
            "percent": round(secs / grand * 100, 1) if grand else 0,
        }
    return {"period_days": days, "start": start, "total_seconds": grand, "zones": zones}


@mcp.tool
def list_cycling_rides(days: int = 90) -> list[dict]:
    """Per-ride cycling metrics (newest first) over `days`: duration, distance,
    avg/normalized power, cadence, efficiency factor (NP/HR), variability index
    (NP/avg power), and intensity factor (NP/FTP) using the period FTP estimate.
    """
    start = _start_date(days)
    rides = _cycling_rides(start)
    best20 = [r["max_20min_power"] for r in rides if r.get("max_20min_power")]
    ftp = max(best20) * 0.95 if best20 else None
    out = []
    for r in rides:
        np_ = r.get("normalized_power")
        ap = r.get("average_power")
        hr = r.get("heart_rate") or {}
        avg_hr = hr.get("avg") if isinstance(hr, dict) else None
        dist = r.get("distance_meters") or 0
        out.append({
            "activity_id": r["id"],
            "name": r.get("name"),
            "date": (r.get("start_time") or "")[:10],
            "duration_minutes": _round((r.get("duration_seconds") or 0) / 60),
            "distance_miles": _round(dist / 1609.34, 2) if dist else None,
            "avg_power_watts": _round(ap),
            "normalized_power_watts": _round(np_),
            "cadence_rpm": _round(r.get("cadence")),
            "avg_hr": avg_hr,
            "efficiency_factor": _round(np_ / avg_hr, 3) if np_ and avg_hr else None,
            "variability_index": _round(np_ / ap, 3) if np_ and ap else None,
            "intensity_factor": _round(np_ / ftp, 3) if np_ and ftp else None,
        })
    return out


# ----------------------------------------------------------------------------
# Wellness & recovery
# ----------------------------------------------------------------------------

@mcp.tool
def get_sleep(days: int = 14) -> list[dict]:
    """Nightly sleep records (newest first) for the last `days`: sleep score, total
    and stage durations (deep/light/REM/awake) in seconds, overnight HRV, and
    resting HR.
    """
    days = max(1, min(days, 365))
    return execute_query(
        """
        SELECT date, sleep_score, total_sleep_seconds, deep_sleep_seconds,
               light_sleep_seconds, rem_sleep_seconds, awake_seconds,
               hrv_average, resting_hr
        FROM sleep WHERE date >= ? ORDER BY date DESC
        """,
        (_start_date(days),),
    )


@mcp.tool
def get_sleep_average(days: int = 7) -> dict:
    """Average sleep metrics over the last `days`: sleep score, hours, deep/REM
    hours, HRV, and resting HR, with the count of nights that had data.
    """
    days = max(1, min(days, 365))
    rows = execute_query(
        """
        SELECT ROUND(AVG(sleep_score), 1) AS avg_sleep_score,
               ROUND(AVG(total_sleep_seconds) / 3600.0, 2) AS avg_sleep_hours,
               ROUND(AVG(deep_sleep_seconds) / 3600.0, 2) AS avg_deep_hours,
               ROUND(AVG(rem_sleep_seconds) / 3600.0, 2) AS avg_rem_hours,
               ROUND(AVG(hrv_average), 1) AS avg_hrv,
               ROUND(AVG(resting_hr), 1) AS avg_resting_hr,
               COUNT(*) AS nights_with_data
        FROM sleep WHERE date >= ?
        """,
        (_start_date(days),),
    )
    return {"period_days": days, **(rows[0] if rows else {})}


@mcp.tool
def get_daily_wellness(days: int = 14) -> list[dict]:
    """Daily wellness records (newest first) for the last `days`: steps, total/
    active calories, Body Battery high/low, average and max stress, intensity
    minutes, and resting HR.
    """
    days = max(1, min(days, 365))
    return execute_query(
        """
        SELECT date, steps, calories_total, active_calories,
               body_battery_high, body_battery_low,
               stress_average, stress_high,
               intensity_minutes_moderate, intensity_minutes_vigorous,
               resting_heart_rate
        FROM dailies WHERE date >= ? ORDER BY date DESC
        """,
        (_start_date(days),),
    )


@mcp.tool
def get_stress_distribution(days: int = 7) -> dict:
    """Total time (seconds) in each stress band (rest/low/medium/high/activity)
    summed over `days`, plus average stress and days with data. Use for stress
    and recovery-load context.
    """
    days = max(1, min(days, 365))
    rows = execute_query(
        """
        SELECT COALESCE(SUM(rest_stress_duration), 0) AS rest_seconds,
               COALESCE(SUM(low_stress_duration), 0) AS low_seconds,
               COALESCE(SUM(medium_stress_duration), 0) AS medium_seconds,
               COALESCE(SUM(high_stress_duration), 0) AS high_seconds,
               COALESCE(SUM(activity_stress_duration), 0) AS activity_seconds,
               ROUND(AVG(stress_average), 1) AS avg_stress,
               COUNT(*) AS days_with_data
        FROM dailies WHERE date >= ?
        """,
        (_start_date(days),),
    )
    return {"period_days": days, **(rows[0] if rows else {})}


@mcp.tool
def get_recovery_status() -> dict:
    """Composite recovery readout from the latest day: a 0-100 recovery score
    (sleep 40%, Body Battery 40%, inverse stress 20%, slight HRV adjustment) with
    a status band and the underlying numbers plus a short recent trend.
    """
    trend = execute_query(
        """
        SELECT d.date, d.body_battery_high, d.body_battery_low, d.stress_average,
               s.sleep_score, s.hrv_average
        FROM dailies d LEFT JOIN sleep s ON d.date = s.date
        ORDER BY d.date DESC LIMIT 3
        """,
    )
    if not trend:
        return {"status": "unknown", "message": "No wellness data available."}

    latest = trend[0]
    seven = execute_query(
        "SELECT AVG(sleep_score) AS avg FROM sleep WHERE date >= ?",
        (_start_date(7),),
    )
    sleep_7day = seven[0]["avg"] if seven and seven[0]["avg"] else None

    sleep_score = latest.get("sleep_score") or 0
    body_battery = latest.get("body_battery_high") or 0
    stress = latest.get("stress_average") or 50
    hrv = latest.get("hrv_average")

    effective_sleep = (sleep_score * 0.6 + sleep_7day * 0.4) if sleep_7day else sleep_score
    stress_factor = max(0, 100 - stress) / 100
    score = effective_sleep * 0.4 + body_battery * 0.4 + stress_factor * 100 * 0.2
    if hrv and hrv > 0:
        hrv_factor = min(1.0, max(0, (hrv - 20) / 60))
        score = score * 0.95 + hrv_factor * 100 * 0.05

    if score >= 80:
        status, msg = "excellent", "Well recovered; good day for intense training."
    elif score >= 60:
        status, msg = "good", "Recovery is good; moderate training recommended."
    elif score >= 40:
        status, msg = "fair", "Recovery is moderate; consider lighter activity."
    else:
        status, msg = "low", "Recovery is low; rest or very light activity."

    return {
        "recovery_score": round(score),
        "status": status,
        "message": msg,
        "details": {
            "sleep_score": sleep_score,
            "sleep_7day_avg": _round(sleep_7day) if sleep_7day else None,
            "body_battery_high": body_battery,
            "stress_average": stress,
            "hrv_average": _round(hrv) if hrv else None,
        },
        "recent_trend": trend,
    }


# ----------------------------------------------------------------------------
# Coaching rules: Blake's durable training policy
# ----------------------------------------------------------------------------

@mcp.tool
def get_coaching_context() -> dict:
    """Blake's training rules and his active plan. CALL THIS BEFORE PROGRAMMING,
    planning a session, or answering "what should I train today".

    Returns rules grouped by type, with a how_to_apply key explaining how binding
    each type is: constraints and limitations must be obeyed, equipment bounds
    what is possible, targets are goals to work toward, preferences are defaults
    you may deviate from with a stated reason, observations are context.

    This is the single source of truth for how Blake wants to train. Never ask
    him to re-state something this returns.
    """
    return coaching_store.get_context()


@mcp.tool
def get_coaching_rules(
    rule_type: str | None = None,
    scope: str | None = None,
    status: str = "active",
) -> dict:
    """List coaching rules with their IDs, for reviewing or editing them by hand.

    Use get_coaching_context instead when you just need the rules to program
    against. Use this one when Blake asks what rules exist, or when you need an
    ID to pass to update_rule or retire_rule.

    Args:
        rule_type: constraint, limitation, equipment, target, preference, observation.
        scope: strength, cycling, cardio, recovery, nutrition, global.
        status: active (default), proposed, retired, or all.
    """
    if rule_type and rule_type not in coaching_store.RULE_TYPES:
        return {"error": f"Unknown rule_type. Use one of: {', '.join(coaching_store.RULE_TYPES)}."}
    if scope and scope not in coaching_store.RULE_SCOPES:
        return {"error": f"Unknown scope. Use one of: {', '.join(coaching_store.RULE_SCOPES)}."}
    if status not in coaching_store.RULE_STATUSES + ("all",):
        return {"error": "status must be active, proposed, retired, or all."}

    rules = coaching_store.list_rules(rule_type=rule_type, scope=scope, status=status)
    return {"count": len(rules), "rules": rules}


@mcp.tool
def propose_rule(
    rule: str,
    rule_type: str,
    scope: str = "strength",
    rationale: str | None = None,
    supersedes_id: int | None = None,
) -> dict:
    """Capture something Blake taught you, so it survives this conversation.

    Call this when he states a durable training preference or corrects your
    programming. The rule is saved as "proposed" and does NOT take effect until
    you show it to him and he agrees, at which point you call confirm_rule.

    Only propose rules Blake would want applied months from now. A passing
    complaint about a session is not a rule.

    Args:
        rule: The rule itself, phrased as an instruction to a coach.
        rule_type: constraint (hard), limitation (injury), equipment,
            target (numeric goal), preference (soft default), or
            observation (learned pattern, context only).
        scope: strength, cycling, cardio, recovery, nutrition, global.
        rationale: Why this rule exists. Worth capturing, it prevents the rule
            being retired later for the wrong reason.
        supersedes_id: If this replaces an existing rule, its ID. Confirming
            the new rule retires the old one in the same step.
    """
    return coaching_store.propose_rule(
        rule=rule,
        rule_type=rule_type,
        scope=scope,
        rationale=rationale,
        supersedes_id=supersedes_id,
    )


@mcp.tool
def confirm_rule(rule_id: int) -> dict:
    """Activate a proposed rule after Blake has agreed to it. Only call this once
    he has actually said yes. If the rule supersedes another, the old one is
    retired automatically.
    """
    return coaching_store.confirm_rule(rule_id)


@mcp.tool
def update_rule(
    rule_id: int,
    rule: str | None = None,
    rule_type: str | None = None,
    scope: str | None = None,
    rationale: str | None = None,
) -> dict:
    """Edit an existing rule in place. Use this for wording and classification
    fixes. When the substance of a rule changes, prefer propose_rule with
    supersedes_id so the history of what changed stays on the record.
    """
    return coaching_store.update_rule(
        rule_id=rule_id,
        rule=rule,
        rule_type=rule_type,
        scope=scope,
        rationale=rationale,
    )


@mcp.tool
def retire_rule(rule_id: int, reason: str) -> dict:
    """Retire a rule that no longer applies. Nothing is deleted: retired rules
    stay queryable via get_coaching_rules(status='retired'). Always record why.
    """
    return coaching_store.retire_rule(rule_id, reason)


@mcp.tool
def review_rules() -> dict:
    """Surface the rule set for pruning: what is awaiting Blake's confirmation,
    what has not been touched in a year, and which rules share a type and scope
    and may be fighting each other. Overlap is a prompt to read, not a detected
    conflict. Ask Blake before retiring anything.
    """
    return coaching_store.review_rules()


# ----------------------------------------------------------------------------
# Training plans: programs that outlive the conversation
# ----------------------------------------------------------------------------

@mcp.tool
def get_active_training_plan() -> dict:
    """The training program currently in effect, if one has been saved. Check
    this before building anything new, so you revise the existing program
    instead of replacing it by accident.
    """
    plan = coaching_store.get_active_plan()
    if plan is None:
        return {
            "active_plan": None,
            "note": "No saved plan. Build one with Blake and call save_training_plan.",
        }
    return {"active_plan": plan}


@mcp.tool
def list_training_plans(include_archived: bool = False) -> dict:
    """List saved training plans (metadata only, no day-by-day detail). Use
    get_active_training_plan for the current program's full structure.
    """
    plans = coaching_store.list_plans(include_archived=include_archived)
    return {"count": len(plans), "plans": plans}


@mcp.tool
def save_training_plan(
    name: str,
    plan: dict,
    goal: str | None = None,
    days_per_week: int | None = None,
    starts_on: str | None = None,
    ends_on: str | None = None,
    notes: str | None = None,
    status: str = "active",
) -> dict:
    """Save a program you built with Blake so it outlives this conversation.

    Saving an active plan archives whichever plan was active before, so there is
    always exactly one current program. Use status='draft' to park an option
    without displacing the current plan.

    The plan is checked against the constraints that can be verified from its
    structure (currently the squat/hinge separation rule). Violations come back
    as rule_warnings and the plan still saves, so raise them with Blake.

    Args:
        name: Short name, e.g. "Aug 2026 upper/lower".
        plan: {"days": [{"day": "Monday", "focus": "Lower (squat anchor)",
            "blocks": [{"type": "straight"|"superset", "exercises": [
            {"name": "Barbell Back Squat", "sets": 4, "reps": "5-8",
            "notes": "optional"}]}]}]}. Put antagonist pairs in one block with
            type "superset"; solo compounds get their own "straight" block.
        goal: What the block of training is for.
        days_per_week: Defaults to the number of days in the plan.
        starts_on / ends_on: YYYY-MM-DD, optional.
        notes: Anything that did not fit the structure.
        status: active (default) or draft.
    """
    return coaching_store.save_plan(
        name=name,
        plan=plan,
        goal=goal,
        days_per_week=days_per_week,
        starts_on=starts_on,
        ends_on=ends_on,
        notes=notes,
        status=status,
    )


@mcp.tool
def update_training_plan(
    plan_id: int,
    name: str | None = None,
    plan: dict | None = None,
    goal: str | None = None,
    days_per_week: int | None = None,
    starts_on: str | None = None,
    ends_on: str | None = None,
    notes: str | None = None,
) -> dict:
    """Revise a saved plan. Pass only the fields that change. Prefer this over
    saving a whole new plan when Blake is tweaking the current program, so the
    plan keeps its identity and history.
    """
    return coaching_store.update_plan(
        plan_id=plan_id,
        name=name,
        plan=plan,
        goal=goal,
        days_per_week=days_per_week,
        starts_on=starts_on,
        ends_on=ends_on,
        notes=notes,
    )


@mcp.tool
def archive_training_plan(plan_id: int, reason: str | None = None) -> dict:
    """Retire a training plan. It stays queryable via
    list_training_plans(include_archived=True).
    """
    return coaching_store.archive_plan(plan_id, reason)


# ----------------------------------------------------------------------------
# Escape hatch: schema + read-only SQL
# ----------------------------------------------------------------------------

@mcp.tool
def describe_data() -> dict:
    """Describe what's queryable: the full SQLite schema, row counts and date
    ranges per table, the distinct activity types, and the strength exercise names.
    Call this before run_sql to know exactly which tables and columns exist.
    """
    counts = {}
    for table in (
        "activities", "sleep", "dailies", "strength_sets",
        "coaching_rules", "training_plans",
    ):
        rows = execute_query(f"SELECT COUNT(*) AS c FROM {table}")
        counts[table] = rows[0]["c"] if rows else 0

    act_range = execute_query(
        "SELECT MIN(DATE(start_time)) AS first, MAX(DATE(start_time)) AS last FROM activities"
    )
    sleep_range = execute_query("SELECT MIN(date) AS first, MAX(date) AS last FROM sleep")
    daily_range = execute_query("SELECT MIN(date) AS first, MAX(date) AS last FROM dailies")

    types = execute_query(
        "SELECT DISTINCT activity_type FROM activities WHERE activity_type IS NOT NULL ORDER BY activity_type"
    )
    exercises = execute_query(
        "SELECT DISTINCT exercise_name FROM strength_sets "
        "WHERE exercise_name IS NOT NULL ORDER BY exercise_name"
    )

    return {
        "schema": SCHEMA,
        "row_counts": counts,
        "date_ranges": {
            "activities": act_range[0] if act_range else None,
            "sleep": sleep_range[0] if sleep_range else None,
            "dailies": daily_range[0] if daily_range else None,
        },
        "activity_types": [t["activity_type"] for t in types],
        "exercise_names": [e["exercise_name"] for e in exercises],
        "notes": [
            "All weights are stored in pounds (weight_lbs).",
            "Rest periods are strength_sets rows where exercise_name = 'Rest'; "
            "duration_seconds is the rest length.",
            "Activity-level power/HR/zones live in activities.raw_json; use "
            "get_activity_detail to parse them.",
            "coaching_rules and training_plans hold Blake's policy and saved "
            "programs. Read them through get_coaching_context, not run_sql, and "
            "write them only through the dedicated rule/plan tools.",
        ],
    }


# ----------------------------------------------------------------------------
# Sync
# ----------------------------------------------------------------------------

@mcp.tool
def sync_garmin_data(days_back: int = 7) -> dict:
    """Pull the latest data from Garmin Connect into the local database.

    Syncs activities (including strength sets), sleep records, and daily
    wellness metrics for the past `days_back` days.  Safe to call at any
    time — already-synced records are silently skipped (idempotent).

    Args:
        days_back: How many days of history to sync (1–90, default 7).

    Returns a summary with counts of newly synced records plus any warnings.
    Call this before querying when you need up-to-date data.
    """
    days_back = max(1, min(days_back, 90))
    try:
        svc = SyncService()
        result = svc.sync_all(days_back=days_back)
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}

    out: dict = {
        "success": result.success,
        "days_synced": days_back,
        "activities_synced": result.activities_synced,
        "strength_sets_extracted": result.strength_sets_extracted,
        "sleep_days_synced": result.sleep_days_synced,
        "dailies_synced": result.dailies_synced,
    }
    if result.error:
        out["error"] = result.error
    # Flag the auth case explicitly so the chat client tells Blake to re-login
    # instead of guessing at why the sync came back empty.
    if (result.details or {}).get("auth_required"):
        out["auth_required"] = True
    if result.warnings:
        out["warnings"] = result.warnings
    return out


# Single-statement read-only guard for run_sql.
_FORBIDDEN_SQL = re.compile(
    r"\b(insert|update|delete|drop|alter|create|replace|attach|detach|"
    r"pragma|vacuum|reindex|truncate|grant|revoke)\b",
    re.IGNORECASE,
)


@mcp.tool
def run_sql(query: str, limit: int = 200) -> dict:
    """Run a read-only SQL SELECT against fitness.db and return rows. Only a single
    SELECT (or WITH ... SELECT) statement is allowed; writes, multiple statements,
    and PRAGMA are rejected. Results are capped at `limit` rows. Use describe_data
    first to learn the schema. This is the escape hatch for any question the
    curated tools don't cover (custom slices, joins, rest times, etc.).
    """
    limit = max(1, min(limit, 1000))
    cleaned = query.strip().rstrip(";").strip()
    if not cleaned:
        return {"error": "Empty query."}

    lowered = cleaned.lower()
    if not (lowered.startswith("select") or lowered.startswith("with")):
        return {"error": "Only SELECT (or WITH ... SELECT) queries are allowed."}
    if ";" in cleaned:
        return {"error": "Multiple statements are not allowed."}
    if _FORBIDDEN_SQL.search(cleaned):
        return {"error": "Query contains a forbidden (write/DDL) keyword."}

    try:
        rows = execute_query(cleaned)
    except Exception as exc:  # surface SQL errors back to the model
        return {"error": f"{type(exc).__name__}: {exc}"}

    truncated = len(rows) > limit
    return {
        "row_count": min(len(rows), limit),
        "truncated": truncated,
        "rows": rows[:limit],
    }


# ----------------------------------------------------------------------------
# ASGI app for mounting into FastAPI (Streamable HTTP). Mounted under the secret
# path in main.py, so the MCP endpoint is /<MCP_SECRET>/mcp.
# ----------------------------------------------------------------------------

mcp_app = mcp.http_app(path="/mcp", stateless_http=True)




