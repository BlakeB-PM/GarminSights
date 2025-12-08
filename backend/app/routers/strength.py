"""Strength training analytics router."""

from typing import Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Query

from app.database import execute_query
from app.models.schemas import StrengthSet, ExerciseProgress, ExerciseList

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

