"""Strength training analytics router."""

from typing import Optional
from datetime import datetime, timedelta, date
from fastapi import APIRouter, Query
import json

from app.database import execute_query
from app.models.schemas import (
    StrengthSet, ExerciseProgress, ExerciseList,
    KeyLiftCard, TrainingBalanceData, MuscleFrequency,
    VolumeTrendData, MuscleComparisonData, DrillDownResponse, DrillDownActivity
)
from app.services.muscle_mapping import get_primary_muscle_group, get_all_muscle_groups

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
            MAX(ss.weight_lbs * (1 + ss.reps / 30.0)) as estimated_1rm,
            SUM(ss.weight_lbs * ss.reps) as total_volume,
            MAX(ss.weight_lbs) as max_weight,
            SUM(ss.reps) as total_reps,
            COUNT(*) as total_sets
        FROM strength_sets ss
        JOIN activities a ON ss.activity_id = a.id
        WHERE ss.exercise_name = ? 
          AND a.start_time >= ?
          AND ss.weight_lbs > 0
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
            SUM(ss.weight_lbs * ss.reps) as total_volume,
            COUNT(*) as total_sets,
            SUM(ss.reps) as total_reps
        FROM activities a
        JOIN strength_sets ss ON a.id = ss.activity_id
        WHERE a.start_time >= ?
          AND ss.weight_lbs > 0
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
            MAX(ss.weight_lbs * (1 + ss.reps / 30.0)) as estimated_1rm,
            MAX(ss.weight_lbs) as max_weight_lifted,
            DATE(a.start_time) as date_achieved
        FROM strength_sets ss
        JOIN activities a ON ss.activity_id = a.id
        WHERE ss.weight_lbs > 0
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
            SUM(ss.weight_lbs * ss.reps) as total_volume
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
    
    Uses muscle_mapping service as single source of truth.
    Exercises count toward ALL relevant muscle groups (primary + secondary).
    """
    from app.services.muscle_mapping import MUSCLE_GROUPS
    
    start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    
    # Get all exercises with their volumes
    exercises = execute_query(
        """
        SELECT 
            ss.exercise_name,
            SUM(ss.weight_lbs * ss.reps) as total_volume,
            COUNT(*) as total_sets
        FROM strength_sets ss
        JOIN activities a ON ss.activity_id = a.id
        WHERE a.start_time >= ? AND ss.weight_lbs > 0
        GROUP BY ss.exercise_name
        """,
        (start_date,)
    )
    
    # Initialize result with all muscle groups (lowercase for frontend compatibility)
    # Map from capitalized MUSCLE_GROUPS to lowercase keys
    result = {group.lower(): {"volume": 0, "sets": 0, "exercises": []} for group in MUSCLE_GROUPS}
    result["other"] = {"volume": 0, "sets": 0, "exercises": []}
    
    for ex in exercises:
        exercise_name = ex["exercise_name"] or ""
        if not exercise_name:
            continue
        
        # Get ALL muscle groups (primary + secondary) for this exercise
        muscle_groups = get_all_muscle_groups(exercise_name)
        
        # Count this exercise toward ALL relevant muscle groups
        for muscle_group in muscle_groups:
            if muscle_group == "Other":
                group_key = "other"
            else:
                group_key = muscle_group.lower()
                # Ensure the group exists (in case MUSCLE_GROUPS list changes)
                if group_key not in result:
                    result[group_key] = {"volume": 0, "sets": 0, "exercises": []}
            
            result[group_key]["volume"] += ex["total_volume"] or 0
            result[group_key]["sets"] += ex["total_sets"] or 0
            result[group_key]["exercises"].append(exercise_name)
    
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
          AND ss.weight_lbs > 0
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
                ss.weight_lbs,
                ss.reps,
                ss.weight_lbs * (1 + ss.reps / 30.0) as estimated_1rm,
                a.start_time
            FROM strength_sets ss
            JOIN activities a ON ss.activity_id = a.id
            WHERE ss.exercise_name = ?
              AND a.start_time >= ?
              AND ss.weight_lbs > 0
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
                MAX(ss.weight_lbs * (1 + ss.reps / 30.0)) as estimated_1rm
            FROM strength_sets ss
            JOIN activities a ON ss.activity_id = a.id
            WHERE ss.exercise_name = ?
              AND a.start_time >= ?
              AND a.start_time < ?
              AND ss.weight_lbs > 0
              AND ss.reps > 0
            """,
            (exercise_name, (datetime.now() - timedelta(days=56)).strftime("%Y-%m-%d"), four_weeks_ago)
        )
        
        # Get volume trend (current 4 weeks vs previous 4 weeks)
        current_volume = execute_query(
            """
            SELECT SUM(ss.weight_lbs * ss.reps) as total_volume
            FROM strength_sets ss
            JOIN activities a ON ss.activity_id = a.id
            WHERE ss.exercise_name = ?
              AND a.start_time >= ?
              AND ss.weight_lbs > 0
            """,
            (exercise_name, four_weeks_ago)
        )
        
        prev_volume = execute_query(
            """
            SELECT SUM(ss.weight_lbs * ss.reps) as total_volume
            FROM strength_sets ss
            JOIN activities a ON ss.activity_id = a.id
            WHERE ss.exercise_name = ?
              AND a.start_time >= ?
              AND a.start_time < ?
              AND ss.weight_lbs > 0
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
              AND ss.weight_lbs > 0
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
            best_recent_weight=best_recent["weight_lbs"] if best_recent else None,
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
    Includes all data up to current date.
    """
    now = datetime.now()
    weeks_ago = now - timedelta(weeks=weeks)
    
    # Calculate the range of weeks to include (from start week to current week)
    start_week_start = get_week_start(weeks_ago)
    current_week_start = get_week_start(now)
    
    # Initialize all weeks in the range with zero values
    # Calculate number of weeks between start and current (inclusive)
    days_diff = (current_week_start - start_week_start).days
    num_weeks = (days_diff // 7) + 1  # +1 to include both start and end weeks
    
    # Use the week start (Monday) for SQL filter to include all days in the first week
    # Convert date to datetime for SQL comparison (ISO format: YYYY-MM-DD HH:MM:SS)
    start_datetime = datetime.combine(start_week_start, datetime.min.time()).strftime("%Y-%m-%d %H:%M:%S")
    
    weekly_data = {}
    for i in range(num_weeks):
        week_start = start_week_start + timedelta(days=i * 7)
        week_key = week_start.isoformat()
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
        ORDER BY a.start_time DESC
        """,
        (start_datetime,)
    )
    
    # Populate weeks with actual data
    for activity in activities:
        start_time = datetime.fromisoformat(activity["start_time"].replace("Z", "+00:00"))
        if start_time.tzinfo:
            start_time = start_time.replace(tzinfo=None)
        
        week_start = get_week_start(start_time)
        week_key = week_start.isoformat()
        
        # Only add to weeks that are in our range
        if week_key not in weekly_data:
            continue
        
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
            SUM(ss.weight_lbs * ss.reps) as volume
        FROM strength_sets ss
        JOIN activities a ON ss.activity_id = a.id
        WHERE a.start_time >= ?
          AND ss.exercise_name IS NOT NULL
          AND ss.weight_lbs > 0
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
        # Get ALL muscle groups (primary + secondary) for this exercise
        muscle_groups = get_all_muscle_groups(exercise_name)
        
        workout_date = datetime.strptime(set_data["workout_date"], "%Y-%m-%d").date()
        
        # Count toward ALL relevant muscle groups
        for muscle_group in muscle_groups:
            if muscle_group in muscle_stats:
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
async def get_volume_trends(
    weeks: int = Query(12, ge=4, le=52),
    muscle_group: str = Query(None, description="Filter by muscle group (e.g., 'Chest', 'Back'). If not provided, returns total volume.")
):
    """
    Get volume trends by week, optionally filtered by muscle group.
    
    Returns weekly tonnage and sets with week-over-week deltas.
    Includes all data up to current date.
    """
    now = datetime.now()
    weeks_ago = now - timedelta(weeks=weeks)
    
    # Calculate the range of weeks to include (from start week to current week)
    start_week_start = get_week_start(weeks_ago)
    current_week_start = get_week_start(now)
    
    # Initialize all weeks in the range with zero values
    # Calculate number of weeks between start and current (inclusive)
    days_diff = (current_week_start - start_week_start).days
    num_weeks = (days_diff // 7) + 1  # +1 to include both start and end weeks
    
    # Ensure we have at least the requested number of weeks
    # If the calculation gives us fewer weeks, extend to ensure we have the full range
    if num_weeks < weeks:
        # Extend backwards to ensure we have the full requested range
        start_week_start = current_week_start - timedelta(days=(weeks - 1) * 7)
        days_diff = (current_week_start - start_week_start).days
        num_weeks = (days_diff // 7) + 1
    
    # Use the week start (Monday) for SQL filter to include all days in the first week
    # Convert date to datetime for SQL comparison (ISO format: YYYY-MM-DD HH:MM:SS)
    start_datetime = datetime.combine(start_week_start, datetime.min.time()).strftime("%Y-%m-%d %H:%M:%S")
    
    weekly_totals = {}
    for i in range(num_weeks):
        week_start = start_week_start + timedelta(days=i * 7)
        week_key = week_start.isoformat()
        weekly_totals[week_key] = {
            "week_start": week_start,
            "week_end": week_start + timedelta(days=6),
            "tonnage": 0.0,
            "sets": 0
        }
    
    # Get weekly aggregations
    try:
        if muscle_group:
            # If filtering by muscle group, we need to get exercise-level data and filter
            exercise_data = execute_query(
                """
                SELECT 
                    DATE(a.start_time) as workout_date,
                    ss.exercise_name,
                    SUM(ss.weight_lbs * ss.reps * 1.0) as tonnage,
                    COUNT(*) as sets_count
                FROM strength_sets ss
                JOIN activities a ON ss.activity_id = a.id
                WHERE a.start_time >= ?
                  AND ss.weight_lbs > 0
                GROUP BY DATE(a.start_time), ss.exercise_name
                ORDER BY workout_date DESC
                """,
                (start_datetime,)
            )
            
            # Filter exercises by muscle group
            filtered_data = {}
            for data in exercise_data:
                exercise_name = data["exercise_name"] or ""
                if not exercise_name:
                    continue
                
                # Check if this exercise targets the specified muscle group
                muscle_groups = get_all_muscle_groups(exercise_name)
                if muscle_group not in muscle_groups:
                    continue
                
                # Aggregate by date
                workout_date = data["workout_date"]
                if workout_date not in filtered_data:
                    filtered_data[workout_date] = {"tonnage": 0.0, "sets_count": 0}
                filtered_data[workout_date]["tonnage"] += (data["tonnage"] or 0)
                filtered_data[workout_date]["sets_count"] += (data["sets_count"] or 0)
            
            weekly_data = [
                {"workout_date": date, "tonnage": data["tonnage"], "sets_count": data["sets_count"]}
                for date, data in filtered_data.items()
            ]
        else:
            # Total volume (no muscle group filter)
            weekly_data = execute_query(
                """
                SELECT 
                    DATE(a.start_time) as workout_date,
                    SUM(ss.weight_lbs * ss.reps * 1.0) as tonnage,
                    COUNT(*) as sets_count
                FROM strength_sets ss
                JOIN activities a ON ss.activity_id = a.id
                WHERE a.start_time >= ?
                  AND ss.weight_lbs > 0
                GROUP BY DATE(a.start_time)
                ORDER BY workout_date DESC
                """,
                (start_datetime,)
            )
    except Exception as e:
        raise
    
    # Populate weeks with actual data
    for data in weekly_data:
        workout_date = datetime.strptime(data["workout_date"], "%Y-%m-%d")
        week_start = get_week_start(workout_date)
        week_key = week_start.isoformat()
        
        # Only add to weeks that are in our range
        if week_key in weekly_totals:
            weekly_totals[week_key]["tonnage"] += (data["tonnage"] or 0)
            weekly_totals[week_key]["sets"] += (data["sets_count"] or 0)
    
    # Convert to list and calculate deltas
    # Sort by week_start to ensure chronological order
    sorted_weeks = sorted(weekly_totals.items(), key=lambda x: x[1]["week_start"])
    result = []
    prev_tonnage = None
    
    for week_key, week in sorted_weeks:
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
    
    # Validate (allow up to 10 groups now that frontend defaults to all)
    if len(selected_groups) < 2 or len(selected_groups) > 10:
        raise ValueError("Must select 2-10 muscle groups")
    
    for mg in selected_groups:
        if mg not in MUSCLE_GROUPS:
            raise ValueError(f"Invalid muscle group: {mg}")
    
    now = datetime.now()
    weeks_ago = now - timedelta(weeks=weeks)
    
    # Calculate the range of weeks to include (from start week to current week)
    start_week_start = get_week_start(weeks_ago)
    current_week_start = get_week_start(now)
    
    # Initialize all weeks in the range with zero values
    # Calculate number of weeks between start and current (inclusive)
    days_diff = (current_week_start - start_week_start).days
    num_weeks = (days_diff // 7) + 1  # +1 to include both start and end weeks
    
    # Use the week start (Monday) for SQL filter to include all days in the first week
    # Convert date to datetime for SQL comparison (ISO format: YYYY-MM-DD HH:MM:SS)
    start_datetime = datetime.combine(start_week_start, datetime.min.time()).strftime("%Y-%m-%d %H:%M:%S")
    
    weekly_data = {}
    for i in range(num_weeks):
        week_start = start_week_start + timedelta(days=i * 7)
        week_key = week_start.isoformat()
        weekly_data[week_key] = {
            "week_start": week_start,
            "week_end": week_start + timedelta(days=6),
            "muscle_groups": {mg: 0 for mg in selected_groups}
        }
    
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
          AND ss.weight_lbs > 0
        GROUP BY ss.exercise_name, DATE(a.start_time)
        ORDER BY workout_date DESC
        """,
        (start_datetime,)
    )
    
    # Populate weeks with actual data
    import json
    for set_data in sets_data:
        exercise_name = set_data["exercise_name"]
        # Get ALL muscle groups (primary + secondary) for this exercise
        muscle_groups = get_all_muscle_groups(exercise_name)
        
        workout_date = datetime.strptime(set_data["workout_date"], "%Y-%m-%d")
        week_start = get_week_start(workout_date)
        week_key = week_start.isoformat()
        
        # Only add to weeks that are in our range
        if week_key not in weekly_data:
            continue
        
        # Count toward ALL relevant muscle groups that are in selected_groups
        for muscle_group in muscle_groups:
            if muscle_group in selected_groups:
                weekly_data[week_key]["muscle_groups"][muscle_group] += set_data["sets_count"]
                
                # #region agent log
                log_data = {"sessionId":"debug-session","runId":"run1","hypothesisId":"A,B","location":"strength.py:883","message":"Muscle comparison counting","data":{"week_key":week_key,"exercise_name":exercise_name,"muscle_group":muscle_group,"sets_count":set_data["sets_count"],"workout_date":set_data["workout_date"]},"timestamp":int(datetime.now().timestamp()*1000)}
                try:
                    log_path = r'c:\Users\Blake\OneDrive\Documents\AI Repo\.cursor\debug.log'
                    with open(log_path, 'a', encoding='utf-8') as f:
                        f.write(json.dumps(log_data)+'\n')
                        f.flush()
                except Exception as e:
                    pass  # Don't log errors in muscle comparison loop to avoid spam
                # #endregion
    
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


@router.get("/drill-down", response_model=DrillDownResponse)
async def get_drill_down(
    week_start: Optional[date] = Query(None, description="Start of week for weekly aggregations"),
    week_end: Optional[date] = Query(None, description="End of week for weekly aggregations"),
    date: Optional[date] = Query(None, description="Single date for daily data"),
    date_range_start: Optional[date] = Query(None, description="Start of custom date range"),
    date_range_end: Optional[date] = Query(None, description="End of custom date range"),
    muscle_group: Optional[str] = Query(None, description="Filter by muscle group"),
    exercise_name: Optional[str] = Query(None, description="Filter by exercise name"),
    activity_type: Optional[str] = Query(None, description="Filter by activity type (e.g., strength_training)")
):
    """
    Get drill-down data showing activities and sets for a specific period.
    
    Returns activities with their strength sets, grouped by activity.
    Supports filtering by date range, muscle group, exercise name, and activity type.
    """
    import json
    import os
    import logging
    from app.services.muscle_mapping import get_all_muscle_groups
    
    logger = logging.getLogger(__name__)
    
    # #region agent log
    log_data = {"sessionId":"debug-session","runId":"run1","hypothesisId":"A,B,C","location":"strength.py:917","message":"Drill-down entry","data":{"week_start":str(week_start) if week_start else None,"week_end":str(week_end) if week_end else None,"muscle_group":muscle_group,"exercise_name":exercise_name,"activity_type":activity_type},"timestamp":int(datetime.now().timestamp()*1000)}
    try:
        # Try to get workspace root from common locations
        log_path = r'c:\Users\Blake\OneDrive\Documents\AI Repo\.cursor\debug.log'
        os.makedirs(os.path.dirname(log_path), exist_ok=True)
        with open(log_path, 'a', encoding='utf-8') as f:
            f.write(json.dumps(log_data)+'\n')
            f.flush()
        logger.info(f"DEBUG LOG: Drill-down entry - {muscle_group}")
    except Exception as e:
        logger.error(f"DEBUG LOG ERROR: {e}", exc_info=True)
    # #endregion
    
    # Determine date range
    start_date = None
    end_date = None
    
    if week_start and week_end:
        start_date = week_start
        end_date = week_end
    elif date:
        start_date = date
        end_date = date
    elif date_range_start and date_range_end:
        start_date = date_range_start
        end_date = date_range_end
    else:
        raise ValueError("Must provide either (week_start, week_end), date, or (date_range_start, date_range_end)")
    
    # Build base query - get all activities in date range that have strength sets
    # We'll filter by muscle group and exercise later when getting sets
    # Use datetime comparison to match muscle comparison endpoint logic
    # Include the full end date by using < (end_date + 1 day)
    from datetime import timedelta
    end_date_inclusive = end_date + timedelta(days=1)
    start_datetime_str = datetime.combine(start_date, datetime.min.time()).strftime("%Y-%m-%d %H:%M:%S")
    end_datetime_str = datetime.combine(end_date_inclusive, datetime.min.time()).strftime("%Y-%m-%d %H:%M:%S")
    
    # #region agent log
    log_data = {"sessionId":"debug-session","runId":"run1","hypothesisId":"A","location":"strength.py:940","message":"Date range calculated","data":{"start_date":str(start_date),"end_date":str(end_date),"start_datetime_str":start_datetime_str,"end_datetime_str":end_datetime_str},"timestamp":int(datetime.now().timestamp()*1000)}
    try:
        log_path = r'c:\Users\Blake\OneDrive\Documents\AI Repo\.cursor\debug.log'
        with open(log_path, 'a', encoding='utf-8') as f:
            f.write(json.dumps(log_data)+'\n')
            f.flush()
    except Exception as e:
        logger.error(f"DEBUG LOG ERROR: {e}", exc_info=True)
    # #endregion
    
    query = """
        SELECT DISTINCT
            a.id as activity_id,
            a.name as activity_name,
            a.start_time,
            a.duration_seconds,
            a.activity_type
        FROM activities a
        WHERE EXISTS (
            SELECT 1 
            FROM strength_sets ss 
            WHERE ss.activity_id = a.id 
              AND ss.weight_lbs > 0
              AND ss.exercise_name IS NOT NULL
        )
        AND a.start_time >= ? AND a.start_time < ?
    """
    params = [start_datetime_str, end_datetime_str]
    
    # Apply activity_type filter
    # Special handling: if activity_type is provided and not 'strength_training',
    # we want to exclude strength_training activities
    if activity_type:
        if activity_type == 'strength_training':
            query += " AND a.activity_type = ?"
            params.append(activity_type)
        else:
            # For cardio/other types, exclude strength_training
            query += " AND a.activity_type != 'strength_training'"
    
    query += " ORDER BY a.start_time"
    
    # Get activities
    activities_data = execute_query(query, tuple(params))
    
    # #region agent log
    log_data = {"sessionId":"debug-session","runId":"run1","hypothesisId":"C","location":"strength.py:975","message":"Activities found","data":{"count":len(activities_data),"activity_ids":[a["activity_id"] for a in activities_data[:5]]},"timestamp":int(datetime.now().timestamp()*1000)}
    try:
        log_path = r'c:\Users\Blake\OneDrive\Documents\AI Repo\.cursor\debug.log'
        with open(log_path, 'a', encoding='utf-8') as f:
            f.write(json.dumps(log_data)+'\n')
            f.flush()
        logger.info(f"DEBUG LOG: Found {len(activities_data)} activities")
    except Exception as e:
        logger.error(f"DEBUG LOG ERROR: {e}", exc_info=True)
    # #endregion
    
    # Get sets for each activity
    result_activities = []
    total_sets = 0
    
    for act in activities_data:
        sets_query = """
            SELECT ss.*
            FROM strength_sets ss
            WHERE ss.activity_id = ?
              AND ss.weight_lbs > 0
              AND ss.exercise_name IS NOT NULL
        """
        sets_params = [act["activity_id"]]
        
        # Apply exercise_name filter to sets if provided
        if exercise_name:
            sets_query += " AND ss.exercise_name = ?"
            sets_params.append(exercise_name)
        
        # Get all sets for this activity
        all_sets = execute_query(sets_query, tuple(sets_params))
        
        # #region agent log
        log_data = {"sessionId":"debug-session","runId":"run1","hypothesisId":"D","location":"strength.py:997","message":"Sets found for activity","data":{"activity_id":act["activity_id"],"total_sets":len(all_sets),"exercise_names":[s.get("exercise_name") for s in all_sets[:3] if s.get("exercise_name")]},"timestamp":int(datetime.now().timestamp()*1000)}
        try:
            log_path = r'c:\Users\Blake\OneDrive\Documents\AI Repo\.cursor\debug.log'
            with open(log_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps(log_data)+'\n')
                f.flush()
        except Exception as e:
            logger.error(f"DEBUG LOG ERROR: {e}", exc_info=True)
        # #endregion
        
        # Apply muscle_group filter to sets if provided
        if muscle_group:
            filtered_sets = []
            muscle_match_details = []
            for s in all_sets:
                exercise_name = s.get("exercise_name")
                if exercise_name:
                    # Get ALL muscle groups (primary + secondary) for this exercise
                    muscle_groups = get_all_muscle_groups(exercise_name)
                    matches = muscle_group in muscle_groups
                    muscle_match_details.append({"exercise":exercise_name,"muscle_groups":muscle_groups,"matches":matches})
                    if matches:
                        filtered_sets.append(s)
            activity_sets = filtered_sets
            
            # #region agent log
            log_data = {"sessionId":"debug-session","runId":"run1","hypothesisId":"B","location":"strength.py:1010","message":"Muscle group filtering","data":{"activity_id":act["activity_id"],"muscle_group":muscle_group,"total_sets":len(all_sets),"filtered_sets":len(filtered_sets),"matches":muscle_match_details[:3]},"timestamp":int(datetime.now().timestamp()*1000)}
            try:
                log_path = r'c:\Users\Blake\OneDrive\Documents\AI Repo\.cursor\debug.log'
                with open(log_path, 'a', encoding='utf-8') as f:
                    f.write(json.dumps(log_data)+'\n')
                    f.flush()
                logger.info(f"DEBUG LOG: Activity {act['activity_id']} - {len(all_sets)} total sets, {len(filtered_sets)} filtered for {muscle_group}")
            except Exception as e:
                logger.error(f"DEBUG LOG ERROR: {e}", exc_info=True)
            # #endregion
        else:
            activity_sets = all_sets
        
        # Only include activities that have sets (after filtering)
        if activity_sets:
            # Convert sets to StrengthSet models
            strength_sets = [
                StrengthSet(
                    id=s["id"],
                    activity_id=s["activity_id"],
                    exercise_name=s.get("exercise_name"),
                    set_number=s.get("set_number"),
                    reps=s.get("reps"),
                    weight_lbs=s.get("weight_lbs"),
                    duration_seconds=s.get("duration_seconds")
                )
                for s in activity_sets
            ]
            
            result_activities.append(DrillDownActivity(
                activity_id=act["activity_id"],
                activity_name=act.get("activity_name") or "Untitled Activity",
                start_time=datetime.fromisoformat(act["start_time"].replace("Z", "+00:00")).replace(tzinfo=None),
                duration_seconds=act.get("duration_seconds"),
                sets=strength_sets
            ))
            total_sets += len(strength_sets)
    
    # #region agent log
    log_data = {"sessionId":"debug-session","runId":"run1","hypothesisId":"A,B,C,D","location":"strength.py:1037","message":"Drill-down result","data":{"total_activities":len(result_activities),"total_sets":total_sets,"muscle_group":muscle_group},"timestamp":int(datetime.now().timestamp()*1000)}
    try:
        log_path = r'c:\Users\Blake\OneDrive\Documents\AI Repo\.cursor\debug.log'
        with open(log_path, 'a', encoding='utf-8') as f:
            f.write(json.dumps(log_data)+'\n')
            f.flush()
        logger.info(f"DEBUG LOG: Drill-down result - {len(result_activities)} activities, {total_sets} sets for {muscle_group}")
    except Exception as e:
        logger.error(f"DEBUG LOG ERROR: {e}", exc_info=True)
    # #endregion
    
    return DrillDownResponse(
        period_start=start_date,
        period_end=end_date,
        total_activities=len(result_activities),
        total_sets=total_sets,
        activities=result_activities
    )

