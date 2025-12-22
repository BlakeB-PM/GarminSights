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
    limit: int = Query(50, ge=1, le=1000),
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
async def get_dashboard_summary(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD). If not provided, uses last 7 days."),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD). If not provided, uses today.")
):
    """Get dashboard at-a-glance summary."""
    today = datetime.now().date()
    
    # Determine date range
    if start_date and end_date:
        period_start = datetime.strptime(start_date, "%Y-%m-%d").date()
        period_end = datetime.strptime(end_date, "%Y-%m-%d").date()
    else:
        # Default to last 7 days
        period_start = today - timedelta(days=7)
        period_end = today
    
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
    
    # Get steps for the period
    steps_result = execute_query(
        "SELECT COALESCE(SUM(steps), 0) as total FROM dailies WHERE date >= ? AND date <= ?",
        (period_start.isoformat(), period_end.isoformat())
    )
    weekly_steps = steps_result[0]["total"] if steps_result else 0
    
    # Get activity count for the period
    activity_result = execute_query(
        "SELECT COUNT(*) as count FROM activities WHERE DATE(start_time) >= ? AND DATE(start_time) <= ?",
        (period_start.isoformat(), period_end.isoformat())
    )
    weekly_activities = activity_result[0]["count"] if activity_result else 0
    
    return DashboardSummary(
        last_sleep_score=last_sleep,
        last_body_battery=last_bb,
        weekly_steps=weekly_steps,
        weekly_activities=weekly_activities,
        last_updated=datetime.now()
    )


@router.get("/training-load")
async def get_training_load(
    start_date: Optional[str] = Query(None, description="Start date for acute load (YYYY-MM-DD). If not provided, uses last 7 days."),
    end_date: Optional[str] = Query(None, description="End date for acute load (YYYY-MM-DD). If not provided, uses today."),
    chronic_days: int = Query(28, ge=7, le=90, description="Number of days for chronic load calculation")
):
    """
    Calculate acute (custom date range or 7-day) and chronic (28-day) training load.
    Training load = sum of (duration_minutes * intensity_factor)
    Intensity factor based on activity type and calories.
    """
    now = datetime.now()
    
    # Determine acute load date range
    if start_date and end_date:
        acute_start = start_date
        acute_end = end_date
    else:
        # Default to last 7 days
        seven_days_ago = (now - timedelta(days=7)).strftime("%Y-%m-%d")
        acute_start = seven_days_ago
        acute_end = now.strftime("%Y-%m-%d")
    
    # Chronic load uses the period ending at acute_end, going back chronic_days
    chronic_start_date = (datetime.strptime(acute_end, "%Y-%m-%d") - timedelta(days=chronic_days)).strftime("%Y-%m-%d")
    
    # Get activities for acute load (custom date range)
    # Use DATE() function for proper date comparison and handle NULL values
    acute_activities = execute_query(
        """
        SELECT 
            COALESCE(duration_seconds, 0) as duration_seconds,
            COALESCE(calories, 0) as calories,
            activity_type
        FROM activities
        WHERE DATE(start_time) >= ? 
          AND DATE(start_time) <= ?
          AND COALESCE(duration_seconds, 0) > 0
        """,
        (acute_start, acute_end)
    )
    
    # Get activities for chronic load (chronic_days period)
    chronic_activities = execute_query(
        """
        SELECT 
            COALESCE(duration_seconds, 0) as duration_seconds,
            COALESCE(calories, 0) as calories,
            activity_type
        FROM activities
        WHERE DATE(start_time) >= ? 
          AND DATE(start_time) <= ?
          AND COALESCE(duration_seconds, 0) > 0
        """,
        (chronic_start_date, acute_end)
    )
    
    def calculate_intensity_factor(activity_type: str, calories: float, duration_minutes: float) -> float:
        """Calculate intensity factor based on activity type and calories per minute."""
        if duration_minutes == 0:
            return 0
        
        calories_per_min = calories / duration_minutes if calories else 0
        
        # Base intensity by activity type
        type_factors = {
            "strength_training": 1.5,
            "running": 1.3,
            "cycling": 1.2,
            "swimming": 1.2,
            "hiking": 1.1,
            "walking": 0.8,
            "yoga": 0.7,
        }
        
        base_factor = type_factors.get(activity_type or "", 1.0)
        
        # Adjust based on calories per minute (higher = more intense)
        if calories_per_min > 10:
            intensity_multiplier = 1.5
        elif calories_per_min > 7:
            intensity_multiplier = 1.2
        elif calories_per_min > 4:
            intensity_multiplier = 1.0
        else:
            intensity_multiplier = 0.8
        
        return base_factor * intensity_multiplier
    
    # Calculate acute load
    acute_load = 0.0
    for activity in acute_activities:
        duration_min = (activity.get("duration_seconds") or 0) / 60
        calories = activity.get("calories") or 0
        activity_type = activity.get("activity_type") or ""
        intensity = calculate_intensity_factor(activity_type, calories, duration_min)
        acute_load += duration_min * intensity
    
    # Calculate chronic load (average per day over 28 days)
    chronic_load_total = 0.0
    for activity in chronic_activities:
        duration_min = (activity.get("duration_seconds") or 0) / 60
        calories = activity.get("calories") or 0
        activity_type = activity.get("activity_type") or ""
        intensity = calculate_intensity_factor(activity_type, calories, duration_min)
        chronic_load_total += duration_min * intensity
    
    # Calculate number of days in chronic period
    chronic_days_count = chronic_days
    chronic_load = chronic_load_total / chronic_days_count if chronic_load_total > 0 else 0.0
    
    # Calculate load ratio
    # If we have acute load but no chronic load (insufficient data), use acute load as baseline
    if chronic_load == 0 and acute_load > 0:
        # Not enough historical data - use acute load as both values
        chronic_load = acute_load
        load_ratio = 1.0
    else:
        load_ratio = acute_load / chronic_load if chronic_load > 0 else 0.0
    
    # Determine status and recommendation
    if acute_load == 0 and chronic_load == 0:
        status = "no_data"
        recommendation = "No training data available. Start tracking activities to see training load."
    elif chronic_load == 0 and acute_load > 0:
        status = "insufficient_data"
        recommendation = "Insufficient historical data (need 28 days). Training load calculated from recent week only."
    elif load_ratio < 0.8:
        status = "under_training"
        recommendation = "Training load is below optimal. Consider increasing volume gradually."
    elif load_ratio <= 1.3:
        status = "optimal"
        recommendation = "Training load is in the optimal range. Maintain current volume."
    elif load_ratio <= 1.5:
        status = "caution"
        recommendation = "Training load is elevated. Monitor recovery closely and consider a lighter week."
    else:
        status = "danger"
        recommendation = "Training load is very high. High injury risk. Consider a deload week."
    
    return {
        "acute_load": round(acute_load, 1),
        "chronic_load": round(chronic_load, 1),
        "load_ratio": round(load_ratio, 2),
        "status": status,
        "recommendation": recommendation
    }


@router.get("/breakdown")
async def get_activity_breakdown(
    days: int = Query(None, ge=1, le=365, description="Number of days back (alternative to date range)"),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)")
):
    """
    Get activity breakdown by type.
    Returns counts, durations, and calories by activity_type.
    """
    if start_date and end_date:
        period_start = start_date
        period_end = end_date
    elif days:
        period_start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        period_end = datetime.now().strftime("%Y-%m-%d")
    else:
        # Default to last 7 days
        period_start = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        period_end = datetime.now().strftime("%Y-%m-%d")
    
    result = execute_query(
        """
        SELECT 
            activity_type,
            COUNT(*) as count,
            COALESCE(SUM(duration_seconds) / 60, 0) as total_minutes,
            COALESCE(SUM(calories), 0) as total_calories
        FROM activities
        WHERE DATE(start_time) >= ? 
          AND DATE(start_time) <= ?
          AND activity_type IS NOT NULL
        GROUP BY activity_type
        ORDER BY total_minutes DESC
        """,
        (period_start, period_end)
    )
    
    # Calculate totals
    total_sessions = sum(r["count"] for r in result)
    total_minutes = sum(r["total_minutes"] for r in result)
    total_calories = sum(r["total_calories"] for r in result)
    
    # Calculate period days
    start = datetime.strptime(period_start, "%Y-%m-%d")
    end = datetime.strptime(period_end, "%Y-%m-%d")
    period_days = (end - start).days + 1
    
    return {
        "period_days": period_days,
        "breakdown": result,
        "totals": {
            "sessions": total_sessions,
            "minutes": round(total_minutes, 1),
            "calories": total_calories
        }
    }

