"""Strength training analytics router."""

from typing import Optional
from datetime import datetime, timedelta, date
from fastapi import APIRouter, Query
import json

from app.database import execute_query
from app.models.schemas import (
    StrengthSet, ExerciseProgress, ExerciseList,
    KeyLiftCard, TrainingBalanceData, MuscleFrequency,
    VolumeTrendData, MuscleComparisonData
)
from app.services.muscle_mapping import get_primary_muscle_group

router = APIRouter(prefix="/api/strength", tags=["strength"])


@router.get("/exercises", response_model=ExerciseList)
async def get_exercises():
    """Get list of all unique exercises."""
    result = execute_query(
        """
        SELECT DISTINCT exercise_name 
        FROM strength_sets 
        WHERE exercise_name IS NOT NULL 
        ORDER BY exercise_name
        """
    )
    return ExerciseList(exercises=[r["exercise_name"] for r in result])


@router.get("/sets", response_model=list[StrengthSet])
async def get_strength_sets(
    exercise_name: Optional[str] = None,
    activity_id: Optional[int] = None,
    limit: int = Query(100, ge=1, le=500)
):
    """
    Get strength sets with optional filters.
    
    Args:
        exercise_name: Filter by exercise name
        activity_id: Filter by activity ID
        limit: Maximum number of records
    """
    query = """
        SELECT ss.*, a.start_time, a.name as activity_name
        FROM strength_sets ss
        JOIN activities a ON ss.activity_id = a.id
        WHERE 1=1
    """
    params = []
    
    if exercise_name:
        query += " AND ss.exercise_name = ?"
        params.append(exercise_name)
    
    if activity_id:
        query += " AND ss.activity_id = ?"
        params.append(activity_id)
    
    query += " ORDER BY a.start_time DESC, ss.set_number LIMIT ?"
    params.append(limit)
    
    return execute_query(query, tuple(params))


@router.get("/progress/{exercise_name}", response_model=list[ExerciseProgress])
async def get_exercise_progress(
    exercise_name: str,
    days: int = Query(90, ge=7, le=365)
):
    """
    Get progress data for a specific exercise.
    
    Includes estimated 1RM and volume over time.
    Uses Epley formula for 1RM: weight * (1 + reps/30)
    """
    start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    
    result = execute_query(
        """
        SELECT 
            DATE(a.start_time) as date,
            ss.exercise_name,
            MAX(ss.weight_kg * (1 + ss.reps / 30.0)) as estimated_1rm,
            SUM(ss.weight_kg * ss.reps) as total_volume,
            MAX(ss.weight_kg) as max_weight,
            SUM(ss.reps) as total_reps,
            COUNT(*) as total_sets
        FROM strength_sets ss
        JOIN activities a ON ss.activity_id = a.id
        WHERE ss.exercise_name = ? 
          AND a.start_time >= ?
          AND ss.weight_kg > 0
        GROUP BY DATE(a.start_time)
        ORDER BY date
        """,
        (exercise_name, start_date)
    )
    
    return [
        ExerciseProgress(
            exercise_name=r["exercise_name"],
            date=r["date"],
            estimated_1rm=r["estimated_1rm"],
            total_volume=r["total_volume"],
            max_weight=r["max_weight"],
            total_reps=r["total_reps"],
            total_sets=r["total_sets"]
        )
        for r in result
    ]


@router.get("/volume")
async def get_volume_by_session(
    exercise_name: Optional[str] = None,
    days: int = Query(90, ge=7, le=365)
):
    """
    Get total volume per session.
    
    Volume = sum(sets * reps * weight)
    """
    start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    
    query = """
        SELECT 
            a.id as activity_id,
            DATE(a.start_time) as date,
            a.name as activity_name,
            SUM(ss.weight_kg * ss.reps) as total_volume,
            COUNT(*) as total_sets,
            SUM(ss.reps) as total_reps
        FROM activities a
        JOIN strength_sets ss ON a.id = ss.activity_id
        WHERE a.start_time >= ?
          AND ss.weight_kg > 0
    """
    params = [start_date]
    
    if exercise_name:
        query += " AND ss.exercise_name = ?"
        params.append(exercise_name)
    
    query += """
        GROUP BY a.id
        ORDER BY a.start_time DESC
    """
    
    return execute_query(query, tuple(params))


@router.get("/prs")
async def get_personal_records(limit: int = Query(10, ge=1, le=50)):
    """
    Get personal records (estimated 1RM) for each exercise.
    """
    return execute_query(
        """
        SELECT 
            ss.exercise_name,
            MAX(ss.weight_kg * (1 + ss.reps / 30.0)) as estimated_1rm,
            MAX(ss.weight_kg) as max_weight_lifted,
            DATE(a.start_time) as date_achieved
        FROM strength_sets ss
        JOIN activities a ON ss.activity_id = a.id
        WHERE ss.weight_kg > 0
        GROUP BY ss.exercise_name
        ORDER BY estimated_1rm DESC
        LIMIT ?
        """,
        (limit,)
    )


@router.get("/recent-workouts")
async def get_recent_strength_workouts(limit: int = Query(10, ge=1, le=50)):
    """
    Get recent strength training workouts with summary.
    """
    return execute_query(
        """
        SELECT 
            a.id,
            a.name,
            a.start_time,
            a.duration_seconds,
            COUNT(DISTINCT ss.exercise_name) as exercise_count,
            COUNT(ss.id) as total_sets,
            SUM(ss.reps) as total_reps,
            SUM(ss.weight_kg * ss.reps) as total_volume
        FROM activities a
        JOIN strength_sets ss ON a.id = ss.activity_id
        WHERE a.activity_type = 'strength_training'
        GROUP BY a.id
        ORDER BY a.start_time DESC
        LIMIT ?
        """,
        (limit,)
    )


@router.get("/muscle-groups")
async def get_volume_by_muscle_group(days: int = Query(30, ge=7, le=90)):
    """
    Get volume breakdown by muscle group (inferred from exercise names).
    
    Note: This is a simple keyword-based classification.
    """
    start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    
    # Get all exercises with their volumes
    exercises = execute_query(
        """
        SELECT 
            ss.exercise_name,
            SUM(ss.weight_kg * ss.reps) as total_volume,
            COUNT(*) as total_sets
        FROM strength_sets ss
        JOIN activities a ON ss.activity_id = a.id
        WHERE a.start_time >= ? AND ss.weight_kg > 0
        GROUP BY ss.exercise_name
        """,
        (start_date,)
    )
    
    # Simple keyword-based muscle group classification
    muscle_groups = {
        "chest": ["bench", "chest", "fly", "push up", "pushup", "pec"],
        "back": ["row", "pull", "lat", "back", "deadlift"],
        "shoulders": ["shoulder", "press", "delt", "lateral raise", "ohp"],
        "biceps": ["curl", "bicep"],
        "triceps": ["tricep", "extension", "pushdown", "skull"],
        "legs": ["squat", "leg", "lunge", "calf", "hamstring", "quad", "glute"],
        "core": ["ab", "core", "plank", "crunch", "sit up"]
    }
    
    result = {group: {"volume": 0, "sets": 0, "exercises": []} for group in muscle_groups}
    result["other"] = {"volume": 0, "sets": 0, "exercises": []}
    
    for ex in exercises:
        name = (ex["exercise_name"] or "").lower()
        categorized = False
        
        for group, keywords in muscle_groups.items():
            if any(kw in name for kw in keywords):
                result[group]["volume"] += ex["total_volume"] or 0
                result[group]["sets"] += ex["total_sets"] or 0
                result[group]["exercises"].append(ex["exercise_name"])
                categorized = True
                break
        
        if not categorized:
            result["other"]["volume"] += ex["total_volume"] or 0
            result["other"]["sets"] += ex["total_sets"] or 0
            result["other"]["exercises"].append(ex["exercise_name"])
    
    return result


def get_week_start(dt: datetime) -> date:
    """Get the Monday of the week containing the given date."""
    days_since_monday = dt.weekday()
    week_start = dt - timedelta(days=days_since_monday)
    return week_start.date()


@router.get("/key-lifts", response_model=list[KeyLiftCard])
async def get_key_lifts():
    """
    Get top 10 most frequent exercises in the last 2 months.
    
    Returns key lift cards with progress metrics.
    """
    two_months_ago = (datetime.now() - timedelta(days=60)).strftime("%Y-%m-%d")
    
    # Get exercise frequencies in last 2 months
    exercise_freq = execute_query(
        """
        SELECT 
            ss.exercise_name,
            COUNT(DISTINCT DATE(a.start_time)) as session_count
        FROM strength_sets ss
        JOIN activities a ON ss.activity_id = a.id
        WHERE a.start_time >= ?
          AND ss.exercise_name IS NOT NULL
          AND ss.weight_kg > 0
        GROUP BY ss.exercise_name
        ORDER BY session_count DESC
        LIMIT 10
        """,
        (two_months_ago,)
    )
    
    if not exercise_freq:
        return []
    
    key_lifts = []
    four_weeks_ago = (datetime.now() - timedelta(days=28)).strftime("%Y-%m-%d")
    
    for ex in exercise_freq:
        exercise_name = ex["exercise_name"]
        
        # Get best recent performance (last 4 weeks)
        recent_sets = execute_query(
            """
            SELECT 
                ss.weight_kg,
                ss.reps,
                ss.weight_kg * (1 + ss.reps / 30.0) as estimated_1rm,
                a.start_time
            FROM strength_sets ss
            JOIN activities a ON ss.activity_id = a.id
            WHERE ss.exercise_name = ?
              AND a.start_time >= ?
              AND ss.weight_kg > 0
              AND ss.reps > 0
            ORDER BY estimated_1rm DESC, a.start_time DESC
            LIMIT 1
            """,
            (exercise_name, four_weeks_ago)
        )
        
        # Get 4-week trend (estimated 1RM change)
        four_week_old = execute_query(
            """
            SELECT 
                MAX(ss.weight_kg * (1 + ss.reps / 30.0)) as estimated_1rm
            FROM strength_sets ss
            JOIN activities a ON ss.activity_id = a.id
            WHERE ss.exercise_name = ?
              AND a.start_time >= ?
              AND a.start_time < ?
              AND ss.weight_kg > 0
              AND ss.reps > 0
            """,
            (exercise_name, (datetime.now() - timedelta(days=56)).strftime("%Y-%m-%d"), four_weeks_ago)
        )
        
        # Get volume trend (current 4 weeks vs previous 4 weeks)
        current_volume = execute_query(
            """
            SELECT SUM(ss.weight_kg * ss.reps) as total_volume
            FROM strength_sets ss
            JOIN activities a ON ss.activity_id = a.id
            WHERE ss.exercise_name = ?
              AND a.start_time >= ?
              AND ss.weight_kg > 0
            """,
            (exercise_name, four_weeks_ago)
        )
        
        prev_volume = execute_query(
            """
            SELECT SUM(ss.weight_kg * ss.reps) as total_volume
            FROM strength_sets ss
            JOIN activities a ON ss.activity_id = a.id
            WHERE ss.exercise_name = ?
              AND a.start_time >= ?
              AND a.start_time < ?
              AND ss.weight_kg > 0
            """,
            (exercise_name, (datetime.now() - timedelta(days=56)).strftime("%Y-%m-%d"), four_weeks_ago)
        )
        
        # Get last trained date
        last_trained = execute_query(
            """
            SELECT DATE(MAX(a.start_time)) as last_date
            FROM strength_sets ss
            JOIN activities a ON ss.activity_id = a.id
            WHERE ss.exercise_name = ?
              AND ss.weight_kg > 0
            """,
            (exercise_name,)
        )
        
        best_recent = recent_sets[0] if recent_sets else None
        old_1rm = four_week_old[0]["estimated_1rm"] if four_week_old and four_week_old[0]["estimated_1rm"] else None
        current_vol = current_volume[0]["total_volume"] if current_volume and current_volume[0]["total_volume"] else 0
        prev_vol = prev_volume[0]["total_volume"] if prev_volume and prev_volume[0]["total_volume"] else 0
        last_date_str = last_trained[0]["last_date"] if last_trained and last_trained[0]["last_date"] else None
        
        # Calculate trends
        four_week_trend_lbs = None
        four_week_trend_percent = None
        if best_recent and old_1rm:
            four_week_trend_lbs = best_recent["estimated_1rm"] - old_1rm
            if old_1rm > 0:
                four_week_trend_percent = (four_week_trend_lbs / old_1rm) * 100
        
        volume_trend_percent = None
        if prev_vol > 0:
            volume_trend_percent = ((current_vol - prev_vol) / prev_vol) * 100
        
        # Determine status
        status = "stable"
        if four_week_trend_percent and four_week_trend_percent > 3:
            status = "progress"
        elif four_week_trend_percent and four_week_trend_percent < -3:
            status = "declining"
        elif last_date_str:
            last_date = datetime.strptime(last_date_str, "%Y-%m-%d").date()
            days_since = (date.today() - last_date).days
            if days_since >= 21:
                status = "plateau"
        
        days_since_last = None
        if last_date_str:
            last_date = datetime.strptime(last_date_str, "%Y-%m-%d").date()
            days_since_last = (date.today() - last_date).days
        
        key_lifts.append(KeyLiftCard(
            exercise_name=exercise_name,
            best_recent_weight=best_recent["weight_kg"] if best_recent else None,
            best_recent_reps=best_recent["reps"] if best_recent else None,
            estimated_1rm=best_recent["estimated_1rm"] if best_recent else None,
            four_week_trend_lbs=four_week_trend_lbs,
            four_week_trend_percent=four_week_trend_percent,
            volume_trend_percent=volume_trend_percent,
            last_trained_date=datetime.strptime(last_date_str, "%Y-%m-%d").date() if last_date_str else None,
            days_since_last=days_since_last,
            status=status
        ))
    
    return key_lifts


@router.get("/training-balance", response_model=list[TrainingBalanceData])
async def get_training_balance(weeks: int = Query(12, ge=4, le=52)):
    """
    Get training balance data (strength vs cardio) by week.
    
    Returns weekly aggregations of sessions and minutes.
    """
    weeks_ago = datetime.now() - timedelta(weeks=weeks)
    start_date = weeks_ago.strftime("%Y-%m-%d")
    
    # Get all activities in the period
    activities = execute_query(
        """
        SELECT 
            a.id,
            a.activity_type,
            a.name,
            a.start_time,
            a.duration_seconds
        FROM activities a
        WHERE a.start_time >= ?
        ORDER BY a.start_time
        """,
        (start_date,)
    )
    
    # Group by week
    weekly_data = {}
    for activity in activities:
        start_time = datetime.fromisoformat(activity["start_time"].replace("Z", "+00:00"))
        if start_time.tzinfo:
            start_time = start_time.replace(tzinfo=None)
        
        week_start = get_week_start(start_time)
        week_key = week_start.isoformat()
        
        if week_key not in weekly_data:
            weekly_data[week_key] = {
                "week_start": week_start,
                "week_end": week_start + timedelta(days=6),
                "strength_sessions": 0,
                "cardio_sessions": 0,
                "zone2_sessions": 0,
                "vo2_sessions": 0,
                "strength_minutes": 0,
                "zone2_minutes": 0,
                "vo2_minutes": 0,
            }
        
        week = weekly_data[week_key]
        duration_minutes = int((activity["duration_seconds"] or 0) / 60)
        activity_type = (activity["activity_type"] or "").lower()
        
        if activity_type == "strength_training":
            week["strength_sessions"] += 1
            week["strength_minutes"] += duration_minutes
        else:
            # Cardio activity - try to classify Zone 2 vs VO2 Max
            # For now, classify based on activity name patterns
            # TODO: Use heart rate zones if available
            activity_name = activity.get("name", "").lower()
            is_vo2 = any(keyword in activity_name for keyword in ["interval", "sprint", "vo2", "hiit", "tabata"])
            
            week["cardio_sessions"] += 1
            if is_vo2:
                week["vo2_sessions"] += 1
                week["vo2_minutes"] += duration_minutes
            else:
                week["zone2_sessions"] += 1
                week["zone2_minutes"] += duration_minutes
    
    # Convert to response models
    result = []
    for week_key in sorted(weekly_data.keys()):
        week = weekly_data[week_key]
        result.append(TrainingBalanceData(
            week_start=week["week_start"],
            week_end=week["week_end"],
            strength_sessions=week["strength_sessions"],
            cardio_sessions=week["cardio_sessions"],
            zone2_sessions=week["zone2_sessions"],
            vo2_sessions=week["vo2_sessions"],
            strength_minutes=week["strength_minutes"],
            zone2_minutes=week["zone2_minutes"],
            vo2_minutes=week["vo2_minutes"],
        ))
    
    return result


@router.get("/frequency", response_model=list[MuscleFrequency])
async def get_training_frequency(
    weeks: int = Query(12, ge=4, le=52),
    sort_by: str = Query("frequency", regex="^(frequency|days_since|volume|alphabetical)$")
):
    """
    Get training frequency analysis by muscle group.
    
    Returns average sessions per week, days since last trained, and total sets.
    """
    from app.services.muscle_mapping import MUSCLE_GROUPS
    
    weeks_ago = datetime.now() - timedelta(weeks=weeks)
    start_date = weeks_ago.strftime("%Y-%m-%d")
    
    # Get all strength sets with dates
    sets_data = execute_query(
        """
        SELECT 
            ss.exercise_name,
            DATE(a.start_time) as workout_date,
            COUNT(*) as sets_count,
            SUM(ss.weight_kg * ss.reps) as volume
        FROM strength_sets ss
        JOIN activities a ON ss.activity_id = a.id
        WHERE a.start_time >= ?
          AND ss.exercise_name IS NOT NULL
          AND ss.weight_kg > 0
        GROUP BY ss.exercise_name, DATE(a.start_time)
        ORDER BY workout_date DESC
        """,
        (start_date,)
    )
    
    # Aggregate by muscle group
    muscle_stats = {mg: {
        "sessions": set(),
        "total_sets": 0,
        "total_volume": 0.0,
        "last_date": None
    } for mg in MUSCLE_GROUPS}
    
    for set_data in sets_data:
        exercise_name = set_data["exercise_name"]
        muscle_group = get_primary_muscle_group(exercise_name)
        
        if muscle_group in muscle_stats:
            workout_date = datetime.strptime(set_data["workout_date"], "%Y-%m-%d").date()
            muscle_stats[muscle_group]["sessions"].add(workout_date)
            muscle_stats[muscle_group]["total_sets"] += set_data["sets_count"]
            muscle_stats[muscle_group]["total_volume"] += (set_data["volume"] or 0)
            
            if (muscle_stats[muscle_group]["last_date"] is None or 
                workout_date > muscle_stats[muscle_group]["last_date"]):
                muscle_stats[muscle_group]["last_date"] = workout_date
    
    # Calculate averages and days since last
    result = []
    total_weeks = weeks
    today = date.today()
    
    for muscle_group in MUSCLE_GROUPS:
        stats = muscle_stats[muscle_group]
        session_count = len(stats["sessions"])
        avg_sessions = session_count / total_weeks if total_weeks > 0 else 0.0
        
        days_since = None
        if stats["last_date"]:
            days_since = (today - stats["last_date"]).days
        
        result.append(MuscleFrequency(
            muscle_group=muscle_group,
            avg_sessions_per_week=round(avg_sessions, 2),
            days_since_last=days_since,
            total_sets=stats["total_sets"],
            total_volume=round(stats["total_volume"], 2)
        ))
    
    # Sort results
    if sort_by == "frequency":
        result.sort(key=lambda x: x.avg_sessions_per_week, reverse=True)
    elif sort_by == "days_since":
        result.sort(key=lambda x: (x.days_since_last is None, x.days_since_last or 999))
    elif sort_by == "volume":
        result.sort(key=lambda x: x.total_volume, reverse=True)
    elif sort_by == "alphabetical":
        result.sort(key=lambda x: x.muscle_group)
    
    return result


@router.get("/volume-trends", response_model=list[VolumeTrendData])
async def get_volume_trends(weeks: int = Query(12, ge=4, le=52)):
    """
    Get total volume trends by week.
    
    Returns weekly tonnage and sets with week-over-week deltas.
    """
    weeks_ago = datetime.now() - timedelta(weeks=weeks)
    start_date = weeks_ago.strftime("%Y-%m-%d")
    
    # Get weekly aggregations
    weekly_data = execute_query(
        """
        SELECT 
            DATE(a.start_time) as workout_date,
            SUM(ss.weight_kg * ss.reps * 1.0) as tonnage,
            COUNT(*) as sets_count
        FROM strength_sets ss
        JOIN activities a ON ss.activity_id = a.id
        WHERE a.start_time >= ?
          AND ss.weight_kg > 0
        GROUP BY DATE(a.start_time)
        ORDER BY workout_date
        """,
        (start_date,)
    )
    
    # Group by week
    weekly_totals = {}
    for data in weekly_data:
        workout_date = datetime.strptime(data["workout_date"], "%Y-%m-%d")
        week_start = get_week_start(workout_date)
        week_key = week_start.isoformat()
        
        if week_key not in weekly_totals:
            weekly_totals[week_key] = {
                "week_start": week_start,
                "week_end": week_start + timedelta(days=6),
                "tonnage": 0.0,
                "sets": 0
            }
        
        weekly_totals[week_key]["tonnage"] += (data["tonnage"] or 0)
        weekly_totals[week_key]["sets"] += (data["sets_count"] or 0)
    
    # Convert to list and calculate deltas
    result = []
    prev_tonnage = None
    
    for week_key in sorted(weekly_totals.keys()):
        week = weekly_totals[week_key]
        
        delta_percent = None
        if prev_tonnage is not None and prev_tonnage > 0:
            delta_percent = ((week["tonnage"] - prev_tonnage) / prev_tonnage) * 100
        
        result.append(VolumeTrendData(
            week_start=week["week_start"],
            week_end=week["week_end"],
            total_tonnage=round(week["tonnage"], 2),
            total_sets=week["sets"],
            week_over_week_delta_percent=round(delta_percent, 1) if delta_percent is not None else None
        ))
        
        prev_tonnage = week["tonnage"]
    
    return result


@router.get("/muscle-comparison", response_model=list[MuscleComparisonData])
async def get_muscle_comparison(
    muscle_groups: str = Query(..., description="Comma-separated muscle groups (2-4 groups)"),
    weeks: int = Query(12, ge=4, le=52)
):
    """
    Get muscle group comparison data by week.
    
    Returns weekly sets for selected muscle groups.
    """
    from app.services.muscle_mapping import MUSCLE_GROUPS
    
    # Parse muscle groups
    selected_groups = [mg.strip() for mg in muscle_groups.split(",")]
    
    # Validate
    if len(selected_groups) < 2 or len(selected_groups) > 4:
        raise ValueError("Must select 2-4 muscle groups")
    
    for mg in selected_groups:
        if mg not in MUSCLE_GROUPS:
            raise ValueError(f"Invalid muscle group: {mg}")
    
    weeks_ago = datetime.now() - timedelta(weeks=weeks)
    start_date = weeks_ago.strftime("%Y-%m-%d")
    
    # Get all strength sets with dates
    sets_data = execute_query(
        """
        SELECT 
            ss.exercise_name,
            DATE(a.start_time) as workout_date,
            COUNT(*) as sets_count
        FROM strength_sets ss
        JOIN activities a ON ss.activity_id = a.id
        WHERE a.start_time >= ?
          AND ss.exercise_name IS NOT NULL
          AND ss.weight_kg > 0
        GROUP BY ss.exercise_name, DATE(a.start_time)
        ORDER BY workout_date
        """,
        (start_date,)
    )
    
    # Group by week and muscle group
    weekly_data = {}
    for set_data in sets_data:
        exercise_name = set_data["exercise_name"]
        muscle_group = get_primary_muscle_group(exercise_name)
        
        if muscle_group not in selected_groups:
            continue
        
        workout_date = datetime.strptime(set_data["workout_date"], "%Y-%m-%d")
        week_start = get_week_start(workout_date)
        week_key = week_start.isoformat()
        
        if week_key not in weekly_data:
            weekly_data[week_key] = {
                "week_start": week_start,
                "week_end": week_start + timedelta(days=6),
                "muscle_groups": {mg: 0 for mg in selected_groups}
            }
        
        weekly_data[week_key]["muscle_groups"][muscle_group] += set_data["sets_count"]
    
    # Convert to response models
    result = []
    for week_key in sorted(weekly_data.keys()):
        week = weekly_data[week_key]
        result.append(MuscleComparisonData(
            week_start=week["week_start"],
            week_end=week["week_end"],
            muscle_groups=week["muscle_groups"]
        ))
    
    return result

