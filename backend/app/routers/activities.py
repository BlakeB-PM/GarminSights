"""Activities data router."""

from typing import Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Query

from app.database import execute_query
from app.models.schemas import (
    Activity, 
    ActivityWithSets,
    ActivityDetails,
    HeartRateMetrics,
    TrainingMetrics,
    StrengthSet,
    DashboardSummary,
    ActivityHeatmapDay
)
from app.services.activity_parser import parse_activity_data

router = APIRouter(prefix="/api/activities", tags=["activities"])


@router.get("/", response_model=list[Activity])
async def get_activities(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    activity_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """
    Get list of activities with optional filters.
    
    Args:
        limit: Maximum number of activities
        offset: Pagination offset
        activity_type: Filter by activity type (e.g., 'strength_training')
        start_date: Filter activities after this date (YYYY-MM-DD)
        end_date: Filter activities before this date (YYYY-MM-DD)
    """
    query = "SELECT * FROM activities WHERE 1=1"
    params = []
    
    if activity_type:
        query += " AND activity_type = ?"
        params.append(activity_type)
    
    if start_date:
        query += " AND start_time >= ?"
        params.append(start_date)
    
    if end_date:
        query += " AND start_time <= ?"
        params.append(end_date + " 23:59:59")
    
    query += " ORDER BY start_time DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    
    return execute_query(query, tuple(params))


@router.get("/count")
async def get_activity_count(activity_type: Optional[str] = None):
    """Get total count of activities."""
    if activity_type:
        result = execute_query(
            "SELECT COUNT(*) as count FROM activities WHERE activity_type = ?",
            (activity_type,)
        )
    else:
        result = execute_query("SELECT COUNT(*) as count FROM activities")
    
    return {"count": result[0]["count"] if result else 0}


@router.get("/types")
async def get_activity_types():
    """Get list of unique activity types."""
    result = execute_query(
        "SELECT DISTINCT activity_type FROM activities WHERE activity_type IS NOT NULL ORDER BY activity_type"
    )
    return {"types": [r["activity_type"] for r in result]}


@router.get("/heatmap", response_model=list[ActivityHeatmapDay])
async def get_activity_heatmap(days: int = Query(30, ge=7, le=90)):
    """
    Get activity heatmap data for the last N days.
    
    Returns activity count and duration per day for visualization.
    """
    start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    
    result = execute_query(
        """
        SELECT 
            DATE(start_time) as date,
            COUNT(*) as activity_count,
            COALESCE(SUM(duration_seconds) / 60, 0) as total_duration_minutes,
            GROUP_CONCAT(DISTINCT activity_type) as activity_types
        FROM activities
        WHERE start_time >= ?
        GROUP BY DATE(start_time)
        ORDER BY date
        """,
        (start_date,)
    )
    
    # Convert activity_types string to list
    heatmap = []
    for row in result:
        types_str = row.get("activity_types", "")
        types_list = types_str.split(",") if types_str else []
        heatmap.append(ActivityHeatmapDay(
            date=row["date"],
            activity_count=row["activity_count"],
            total_duration_minutes=int(row["total_duration_minutes"]),
            activity_types=types_list
        ))
    
    return heatmap


@router.get("/{activity_id}", response_model=ActivityWithSets)
async def get_activity(activity_id: int):
    """Get a single activity with all available metrics and strength sets if applicable."""
    activities = execute_query(
        "SELECT * FROM activities WHERE id = ?",
        (activity_id,)
    )
    
    if not activities:
        return {"error": "Activity not found"}
    
    activity = activities[0]
    
    # Parse raw_json to extract all available metrics
    raw_json = activity.get("raw_json")
    parsed_metrics = parse_activity_data(raw_json)
    
    # Convert nested dictionaries to Pydantic models if present
    heart_rate_dict = parsed_metrics.pop("heart_rate", None)
    if heart_rate_dict and isinstance(heart_rate_dict, dict):
        activity["heart_rate"] = HeartRateMetrics(**heart_rate_dict)
    else:
        activity["heart_rate"] = None
    
    training_dict = parsed_metrics.pop("training", None)
    if training_dict and isinstance(training_dict, dict):
        activity["training"] = TrainingMetrics(**training_dict)
    else:
        activity["training"] = None
    
    # Merge remaining parsed metrics into activity dict
    activity.update(parsed_metrics)
    
    # Get strength sets if any
    sets = execute_query(
        "SELECT * FROM strength_sets WHERE activity_id = ? ORDER BY set_number",
        (activity_id,)
    )
    
    activity["strength_sets"] = sets
    return activity


@router.get("/dashboard/summary", response_model=DashboardSummary)
async def get_dashboard_summary():
    """Get dashboard at-a-glance summary."""
    today = datetime.now().date()
    week_ago = today - timedelta(days=7)
    
    # Get last sleep score
    sleep_result = execute_query(
        "SELECT sleep_score FROM sleep ORDER BY date DESC LIMIT 1"
    )
    last_sleep = sleep_result[0]["sleep_score"] if sleep_result else None
    
    # Get last body battery
    daily_result = execute_query(
        "SELECT body_battery_high FROM dailies ORDER BY date DESC LIMIT 1"
    )
    last_bb = daily_result[0]["body_battery_high"] if daily_result else None
    
    # Get weekly steps
    steps_result = execute_query(
        "SELECT COALESCE(SUM(steps), 0) as total FROM dailies WHERE date >= ?",
        (week_ago.isoformat(),)
    )
    weekly_steps = steps_result[0]["total"] if steps_result else 0
    
    # Get weekly activity count
    activity_result = execute_query(
        "SELECT COUNT(*) as count FROM activities WHERE start_time >= ?",
        (week_ago.isoformat(),)
    )
    weekly_activities = activity_result[0]["count"] if activity_result else 0
    
    return DashboardSummary(
        last_sleep_score=last_sleep,
        last_body_battery=last_bb,
        weekly_steps=weekly_steps,
        weekly_activities=weekly_activities,
        last_updated=datetime.now()
    )

