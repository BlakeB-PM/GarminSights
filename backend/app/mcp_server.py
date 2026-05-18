"""MCP server exposing read-only fitness data tools.

Mounted at /mcp on the FastAPI app. All requests must arrive through Cloudflare
Access (which handles OAuth via Managed OAuth) — the FastAPI middleware
validates the Cf-Access-Jwt-Assertion header before the request reaches this
module.

Tools wrap the same SQL queries used by the REST API routers, keeping a single
source of truth for the data model.
"""

from datetime import datetime, timedelta
from typing import Any, Optional

from mcp.server.fastmcp import FastMCP

from app.database import execute_query
from app.services.muscle_mapping import MUSCLE_GROUPS, get_all_muscle_groups

mcp = FastMCP("garminsights", stateless_http=True, json_response=True)


def _start_date(days: int) -> str:
    return (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")


# ── Strength tools ──────────────────────────────────────────────────


@mcp.tool()
def list_exercises() -> list[str]:
    """List every unique exercise name in the user's strength training history."""
    rows = execute_query(
        "SELECT DISTINCT exercise_name FROM strength_sets "
        "WHERE exercise_name IS NOT NULL ORDER BY exercise_name"
    )
    return [r["exercise_name"] for r in rows]


@mcp.tool()
def get_strength_sets(
    exercise_name: Optional[str] = None,
    activity_id: Optional[int] = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """Return individual strength sets, optionally filtered by exercise or activity.

    Each row includes set_number, reps, weight_lbs, duration_seconds, plus the
    parent activity's start_time and name. Use this for set-by-set analysis
    (e.g., "show me every set of squats from the last month").
    """
    limit = max(1, min(limit, 500))
    query = (
        "SELECT ss.exercise_name, ss.set_number, ss.reps, ss.weight_lbs, "
        "ss.duration_seconds, a.id AS activity_id, a.start_time, "
        "a.name AS activity_name "
        "FROM strength_sets ss JOIN activities a ON ss.activity_id = a.id "
        "WHERE 1=1"
    )
    params: list[Any] = []
    if exercise_name:
        query += " AND ss.exercise_name = ?"
        params.append(exercise_name)
    if activity_id is not None:
        query += " AND ss.activity_id = ?"
        params.append(activity_id)
    query += " ORDER BY a.start_time DESC, ss.set_number LIMIT ?"
    params.append(limit)
    return execute_query(query, tuple(params))


@mcp.tool()
def get_exercise_progress(exercise_name: str, days: int = 90) -> list[dict[str, Any]]:
    """Per-session progress for one exercise: estimated 1RM (Epley), total
    volume, max weight, total reps, total sets — grouped by date.

    Use this to answer "is my bench press going up?" or "show me the trend on
    deadlifts over the last quarter."
    """
    days = max(7, min(days, 365))
    return execute_query(
        """
        SELECT
            DATE(a.start_time) AS date,
            ss.exercise_name,
            MAX(ss.weight_lbs * (1 + ss.reps / 30.0)) AS estimated_1rm,
            SUM(ss.weight_lbs * ss.reps) AS total_volume,
            MAX(ss.weight_lbs) AS max_weight,
            SUM(ss.reps) AS total_reps,
            COUNT(*) AS total_sets
        FROM strength_sets ss
        JOIN activities a ON ss.activity_id = a.id
        WHERE ss.exercise_name = ? AND a.start_time >= ? AND ss.weight_lbs > 0
        GROUP BY DATE(a.start_time)
        ORDER BY date
        """,
        (exercise_name, _start_date(days)),
    )


@mcp.tool()
def get_personal_records(limit: int = 20) -> list[dict[str, Any]]:
    """Top estimated 1RM personal records across every exercise."""
    limit = max(1, min(limit, 50))
    return execute_query(
        """
        SELECT
            ss.exercise_name,
            MAX(ss.weight_lbs * (1 + ss.reps / 30.0)) AS estimated_1rm,
            MAX(ss.weight_lbs) AS max_weight_lifted,
            DATE(a.start_time) AS date_achieved
        FROM strength_sets ss
        JOIN activities a ON ss.activity_id = a.id
        WHERE ss.weight_lbs > 0
        GROUP BY ss.exercise_name
        ORDER BY estimated_1rm DESC
        LIMIT ?
        """,
        (limit,),
    )


@mcp.tool()
def get_recent_strength_workouts(limit: int = 10) -> list[dict[str, Any]]:
    """Most recent strength training sessions with summary stats:
    duration, exercise count, total sets, total reps, total volume.
    """
    limit = max(1, min(limit, 50))
    return execute_query(
        """
        SELECT
            a.id, a.name, a.start_time, a.duration_seconds,
            COUNT(DISTINCT ss.exercise_name) AS exercise_count,
            COUNT(ss.id) AS total_sets,
            SUM(ss.reps) AS total_reps,
            SUM(ss.weight_lbs * ss.reps) AS total_volume
        FROM activities a
        JOIN strength_sets ss ON a.id = ss.activity_id
        WHERE a.activity_type = 'strength_training'
        GROUP BY a.id
        ORDER BY a.start_time DESC
        LIMIT ?
        """,
        (limit,),
    )


@mcp.tool()
def get_volume_by_muscle_group(days: int = 30) -> dict[str, Any]:
    """Total volume and set count grouped by muscle group over the last N days.

    Exercises contribute to all muscle groups they hit (primary + secondary).
    Useful for spotting imbalances ("am I neglecting back?").
    """
    days = max(7, min(days, 365))
    exercises = execute_query(
        """
        SELECT ss.exercise_name,
               SUM(ss.weight_lbs * ss.reps) AS total_volume,
               COUNT(*) AS total_sets
        FROM strength_sets ss
        JOIN activities a ON ss.activity_id = a.id
        WHERE a.start_time >= ? AND ss.weight_lbs > 0
        GROUP BY ss.exercise_name
        """,
        (_start_date(days),),
    )

    result: dict[str, dict[str, Any]] = {
        group.lower(): {"volume": 0.0, "sets": 0, "exercises": []}
        for group in MUSCLE_GROUPS
    }
    result["other"] = {"volume": 0.0, "sets": 0, "exercises": []}

    for ex in exercises:
        name = ex["exercise_name"] or ""
        if not name:
            continue
        for group in get_all_muscle_groups(name):
            key = "other" if group == "Other" else group.lower()
            bucket = result.setdefault(
                key, {"volume": 0.0, "sets": 0, "exercises": []}
            )
            bucket["volume"] += ex["total_volume"] or 0
            bucket["sets"] += ex["total_sets"] or 0
            bucket["exercises"].append(name)
    return result


# ── Activities tools ────────────────────────────────────────────────


@mcp.tool()
def list_activities(
    limit: int = 50,
    activity_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> list[dict[str, Any]]:
    """List activities (any type), newest first. Filter by activity_type
    (e.g., 'running', 'cycling', 'strength_training') and/or date range
    (YYYY-MM-DD).
    """
    limit = max(1, min(limit, 200))
    query = (
        "SELECT id, garmin_id, activity_type, name, start_time, "
        "duration_seconds, distance_meters, calories FROM activities WHERE 1=1"
    )
    params: list[Any] = []
    if activity_type:
        query += " AND activity_type = ?"
        params.append(activity_type)
    if start_date:
        query += " AND DATE(start_time) >= ?"
        params.append(start_date)
    if end_date:
        query += " AND DATE(start_time) <= ?"
        params.append(end_date)
    query += " ORDER BY start_time DESC LIMIT ?"
    params.append(limit)
    return execute_query(query, tuple(params))


@mcp.tool()
def get_activity(activity_id: int) -> Optional[dict[str, Any]]:
    """Fetch one activity's full record including the raw Garmin JSON payload."""
    rows = execute_query(
        "SELECT * FROM activities WHERE id = ?", (activity_id,)
    )
    return rows[0] if rows else None


# ── Sleep & wellness tools ──────────────────────────────────────────


@mcp.tool()
def get_sleep(
    limit: int = 30,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Sleep records (most recent first). Each row has sleep_score, stage
    durations in seconds, hrv_average, resting_hr.
    """
    limit = max(1, min(limit, 365))
    query = "SELECT * FROM sleep WHERE 1=1"
    params: list[Any] = []
    if start_date:
        query += " AND date >= ?"
        params.append(start_date)
    if end_date:
        query += " AND date <= ?"
        params.append(end_date)
    query += " ORDER BY date DESC LIMIT ?"
    params.append(limit)
    return execute_query(query, tuple(params))


@mcp.tool()
def get_sleep_average(days: int = 7) -> dict[str, Any]:
    """Average sleep metrics over the last N days (1-90)."""
    days = max(1, min(days, 90))
    rows = execute_query(
        """
        SELECT AVG(sleep_score) AS avg_sleep_score,
               AVG(total_sleep_seconds) / 3600.0 AS avg_sleep_hours,
               AVG(deep_sleep_seconds) / 3600.0 AS avg_deep_hours,
               AVG(rem_sleep_seconds) / 3600.0 AS avg_rem_hours,
               AVG(hrv_average) AS avg_hrv,
               AVG(resting_hr) AS avg_resting_hr,
               COUNT(*) AS days_with_data
        FROM sleep WHERE date >= ?
        """,
        (_start_date(days),),
    )
    return rows[0] if rows else {}


@mcp.tool()
def get_dailies(
    limit: int = 30,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Daily wellness metrics: steps, body battery, stress, intensity minutes,
    heart rate ranges. Most recent first.
    """
    limit = max(1, min(limit, 365))
    query = "SELECT * FROM dailies WHERE 1=1"
    params: list[Any] = []
    if start_date:
        query += " AND date >= ?"
        params.append(start_date)
    if end_date:
        query += " AND date <= ?"
        params.append(end_date)
    query += " ORDER BY date DESC LIMIT ?"
    params.append(limit)
    return execute_query(query, tuple(params))


@mcp.tool()
def get_recovery_status() -> dict[str, Any]:
    """Composite recovery snapshot from the latest sleep + daily metrics.

    Returns a 0-100 recovery_score and a status label (excellent/good/fair/low)
    based on sleep score (weighted with 7-day average), body battery, stress,
    and HRV. Use this before recommending workout intensity.
    """
    rows = execute_query(
        """
        SELECT d.date, d.body_battery_high, d.body_battery_low, d.stress_average,
               s.sleep_score, s.hrv_average
        FROM dailies d LEFT JOIN sleep s ON d.date = s.date
        ORDER BY d.date DESC LIMIT 3
        """
    )
    if not rows:
        return {"status": "unknown", "message": "No data available"}

    latest = rows[0]
    avg_row = execute_query(
        "SELECT AVG(sleep_score) AS avg_sleep_score FROM sleep WHERE date >= ?",
        (_start_date(7),),
    )
    sleep_7day = avg_row[0]["avg_sleep_score"] if avg_row else None

    sleep_score = latest.get("sleep_score") or 0
    body_battery = latest.get("body_battery_high") or 0
    stress = latest.get("stress_average") or 50
    hrv = latest.get("hrv_average")

    effective_sleep = sleep_score
    if sleep_7day:
        effective_sleep = sleep_score * 0.6 + sleep_7day * 0.4
    stress_factor = max(0, 100 - stress) / 100
    score = effective_sleep * 0.4 + body_battery * 0.4 + stress_factor * 100 * 0.2
    if hrv and hrv > 0:
        hrv_factor = min(1.0, max(0, (hrv - 20) / 60))
        score = score * 0.95 + hrv_factor * 100 * 0.05

    if score >= 80:
        status, message = "excellent", "Well recovered — good day for hard training."
    elif score >= 60:
        status, message = "good", "Recovery is solid — moderate training appropriate."
    elif score >= 40:
        status, message = "fair", "Recovery is moderate — lean toward lighter work."
    else:
        status, message = "low", "Recovery is low — rest or very light activity."

    return {
        "status": status,
        "recovery_score": round(score),
        "message": message,
        "sleep_score": sleep_score,
        "sleep_7day_avg": round(sleep_7day, 1) if sleep_7day else None,
        "body_battery": body_battery,
        "stress_average": stress,
        "hrv_average": round(hrv, 1) if hrv else None,
    }


# ── Cycling tools ───────────────────────────────────────────────────


@mcp.tool()
def get_cycling_summary(days: int = 30) -> dict[str, Any]:
    """Aggregated cycling metrics over the last N days: total rides, total
    duration, weighted average power / normalized power / cadence /
    efficiency factor, plus an estimated FTP from the best 20-min power.
    """
    days = max(1, min(days, 365))
    from app.routers.cycling import get_cycling_activities

    period_end = datetime.now().strftime("%Y-%m-%d")
    period_start = _start_date(days)
    activities = get_cycling_activities(period_start, period_end)

    if not activities:
        return {
            "total_rides": 0,
            "total_duration_minutes": 0,
            "period_start": period_start,
            "period_end": period_end,
        }

    def weighted(pairs: list[tuple[float, float]]) -> Optional[float]:
        total_w = sum(w for _, w in pairs)
        if total_w == 0:
            return None
        return sum(v * w for v, w in pairs) / total_w

    powers, nps, cadences, efs, max_20min = [], [], [], [], []
    for a in activities:
        dur = a.get("duration_seconds") or 0
        if a.get("average_power") and dur:
            powers.append((a["average_power"], dur))
        if a.get("normalized_power") and dur:
            nps.append((a["normalized_power"], dur))
        if a.get("cadence") and dur:
            cadences.append((a["cadence"], dur))
        hr = a.get("heart_rate", {}) or {}
        avg_hr = hr.get("avg") if isinstance(hr, dict) else None
        if a.get("normalized_power") and avg_hr and avg_hr > 0:
            efs.append((a["normalized_power"] / avg_hr, dur))
        if a.get("max_20min_power"):
            max_20min.append(a["max_20min_power"])

    ftp = max(max_20min) * 0.95 if max_20min else None
    return {
        "total_rides": len(activities),
        "total_duration_minutes": round(
            sum(a.get("duration_seconds") or 0 for a in activities) / 60, 1
        ),
        "avg_power": round(weighted(powers), 1) if weighted(powers) else None,
        "avg_normalized_power": round(weighted(nps), 1) if weighted(nps) else None,
        "avg_cadence": round(weighted(cadences), 1) if weighted(cadences) else None,
        "avg_efficiency_factor": (
            round(weighted(efs), 3) if weighted(efs) else None
        ),
        "estimated_ftp": round(ftp, 1) if ftp else None,
        "period_start": period_start,
        "period_end": period_end,
    }


# Expose the Streamable HTTP ASGI app for mounting on FastAPI.
mcp_asgi_app = mcp.streamable_http_app()
