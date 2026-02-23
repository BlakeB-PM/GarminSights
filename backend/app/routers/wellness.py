"""Wellness data router (sleep and daily metrics)."""

from enum import Enum
from typing import Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Query

from app.database import execute_query
from app.models.schemas import Sleep, Daily


class DailyMetric(str, Enum):
    """Allowed column names for daily trend queries."""
    steps = "steps"
    body_battery_high = "body_battery_high"
    stress_average = "stress_average"


# Allowlist mapping enum value → safe column name
_METRIC_COLUMNS: dict[DailyMetric, str] = {
    DailyMetric.steps: "steps",
    DailyMetric.body_battery_high: "body_battery_high",
    DailyMetric.stress_average: "stress_average",
}

router = APIRouter(prefix="/api/wellness", tags=["wellness"])


# ============================================
# Sleep Endpoints
# ============================================

@router.get("/sleep", response_model=list[Sleep])
async def get_sleep_data(
    limit: int = Query(30, ge=1, le=365),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """
    Get sleep data with optional date filters.
    
    Args:
        limit: Maximum number of records
        start_date: Filter data after this date (YYYY-MM-DD)
        end_date: Filter data before this date (YYYY-MM-DD)
    """
    query = "SELECT * FROM sleep WHERE 1=1"
    params = []
    
    if start_date:
        query += " AND date >= ?"
        params.append(start_date)
    
    if end_date:
        query += " AND date <= ?"
        params.append(end_date)
    
    query += " ORDER BY date DESC LIMIT ?"
    params.append(limit)
    
    return execute_query(query, tuple(params))


@router.get("/sleep/latest", response_model=Optional[Sleep])
async def get_latest_sleep():
    """Get the most recent sleep data."""
    result = execute_query(
        "SELECT * FROM sleep ORDER BY date DESC LIMIT 1"
    )
    return result[0] if result else None


@router.get("/sleep/average")
async def get_sleep_average(days: int = Query(7, ge=1, le=90)):
    """Get average sleep metrics over the past N days."""
    start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    
    result = execute_query(
        """
        SELECT 
            AVG(sleep_score) as avg_sleep_score,
            AVG(total_sleep_seconds) / 3600.0 as avg_sleep_hours,
            AVG(deep_sleep_seconds) / 3600.0 as avg_deep_hours,
            AVG(rem_sleep_seconds) / 3600.0 as avg_rem_hours,
            AVG(hrv_average) as avg_hrv,
            AVG(resting_hr) as avg_resting_hr,
            COUNT(*) as days_with_data
        FROM sleep
        WHERE date >= ?
        """,
        (start_date,)
    )
    
    return result[0] if result else {}


@router.get("/sleep/trend")
async def get_sleep_trend(days: int = Query(30, ge=7, le=90)):
    """Get sleep score trend over time."""
    start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    
    return execute_query(
        """
        SELECT date, sleep_score, total_sleep_seconds / 3600.0 as sleep_hours, hrv_average
        FROM sleep
        WHERE date >= ? AND sleep_score IS NOT NULL
        ORDER BY date
        """,
        (start_date,)
    )


# ============================================
# Daily Metrics Endpoints
# ============================================

@router.get("/dailies", response_model=list[Daily])
async def get_daily_data(
    limit: int = Query(30, ge=1, le=365),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """
    Get daily metrics with optional date filters.
    
    Args:
        limit: Maximum number of records
        start_date: Filter data after this date (YYYY-MM-DD)
        end_date: Filter data before this date (YYYY-MM-DD)
    """
    query = "SELECT * FROM dailies WHERE 1=1"
    params = []
    
    if start_date:
        query += " AND date >= ?"
        params.append(start_date)
    
    if end_date:
        query += " AND date <= ?"
        params.append(end_date)
    
    query += " ORDER BY date DESC LIMIT ?"
    params.append(limit)
    
    return execute_query(query, tuple(params))


@router.get("/dailies/latest", response_model=Optional[Daily])
async def get_latest_daily():
    """Get the most recent daily metrics."""
    result = execute_query(
        "SELECT * FROM dailies ORDER BY date DESC LIMIT 1"
    )
    return result[0] if result else None


@router.get("/dailies/average")
async def get_daily_average(days: int = Query(7, ge=1, le=90)):
    """Get average daily metrics over the past N days."""
    start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    
    result = execute_query(
        """
        SELECT 
            AVG(steps) as avg_steps,
            AVG(body_battery_high) as avg_body_battery_high,
            AVG(body_battery_low) as avg_body_battery_low,
            AVG(stress_average) as avg_stress,
            AVG(calories_total) as avg_calories,
            SUM(steps) as total_steps,
            COUNT(*) as days_with_data
        FROM dailies
        WHERE date >= ?
        """,
        (start_date,)
    )
    
    return result[0] if result else {}


@router.get("/dailies/trend")
async def get_daily_trend(
    metric: DailyMetric = Query(DailyMetric.steps),
    days: Optional[int] = Query(None, ge=1, le=365),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)")
):
    """
    Get trend data for a specific daily metric.

    Args:
        metric: One of 'steps', 'body_battery_high', 'stress_average'
        days: Number of days to include (alternative to date range)
        start_date: Start date (YYYY-MM-DD)
        end_date: End date (YYYY-MM-DD)
    """
    col = _METRIC_COLUMNS[metric]

    if start_date and end_date:
        period_start = start_date
        period_end = end_date
    elif days:
        period_start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        period_end = datetime.now().strftime("%Y-%m-%d")
    else:
        period_start = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        period_end = datetime.now().strftime("%Y-%m-%d")

    if start_date and end_date:
        query = f"""
            SELECT date, {col} as value
            FROM dailies
            WHERE date >= ? AND date <= ? AND {col} IS NOT NULL
            ORDER BY date
        """
        params = (period_start, period_end)
    else:
        query = f"""
            SELECT date, {col} as value
            FROM dailies
            WHERE date >= ? AND {col} IS NOT NULL
            ORDER BY date
        """
        params = (period_start,)

    return execute_query(query, params)


@router.get("/stress/distribution")
async def get_stress_distribution(
    days: int = Query(None, ge=1, le=365, description="Number of days back (alternative to date range)"),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)")
):
    """
    Get stress duration breakdown by category.
    Returns seconds in each stress level.
    """
    if start_date and end_date:
        period_start = start_date
    elif days:
        period_start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    else:
        # Default to last 7 days
        period_start = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    
    # Build query with optional end_date
    if start_date and end_date:
        query = """
            SELECT 
                COALESCE(SUM(low_stress_duration), 0) as low_stress_seconds,
                COALESCE(SUM(medium_stress_duration), 0) as medium_stress_seconds,
                COALESCE(SUM(high_stress_duration), 0) as high_stress_seconds,
                COALESCE(SUM(rest_stress_duration), 0) as rest_stress_seconds,
                COALESCE(SUM(activity_stress_duration), 0) as activity_stress_seconds,
                AVG(stress_average) as avg_stress,
                COUNT(*) as days_with_data
            FROM dailies
            WHERE date >= ? AND date <= ?
        """
        params = (period_start, end_date)
    else:
        query = """
            SELECT 
                COALESCE(SUM(low_stress_duration), 0) as low_stress_seconds,
                COALESCE(SUM(medium_stress_duration), 0) as medium_stress_seconds,
                COALESCE(SUM(high_stress_duration), 0) as high_stress_seconds,
                COALESCE(SUM(rest_stress_duration), 0) as rest_stress_seconds,
                COALESCE(SUM(activity_stress_duration), 0) as activity_stress_seconds,
                AVG(stress_average) as avg_stress,
                COUNT(*) as days_with_data
            FROM dailies
            WHERE date >= ?
        """
        params = (period_start,)
    
    result = execute_query(query, params)
    
    if not result or not result[0]:
        return {
            "low_stress_seconds": 0,
            "medium_stress_seconds": 0,
            "high_stress_seconds": 0,
            "rest_stress_seconds": 0,
            "activity_stress_seconds": 0,
            "avg_stress": None,
            "days_with_data": 0
        }
    
    data = result[0]
    total_seconds = (
        (data.get("low_stress_seconds") or 0) +
        (data.get("medium_stress_seconds") or 0) +
        (data.get("high_stress_seconds") or 0) +
        (data.get("rest_stress_seconds") or 0) +
        (data.get("activity_stress_seconds") or 0)
    )
    
    return {
        "low_stress_seconds": int(data.get("low_stress_seconds") or 0),
        "medium_stress_seconds": int(data.get("medium_stress_seconds") or 0),
        "high_stress_seconds": int(data.get("high_stress_seconds") or 0),
        "rest_stress_seconds": int(data.get("rest_stress_seconds") or 0),
        "activity_stress_seconds": int(data.get("activity_stress_seconds") or 0),
        "total_seconds": int(total_seconds),
        "avg_stress": round(data.get("avg_stress") or 0, 1) if data.get("avg_stress") else None,
        "days_with_data": data.get("days_with_data") or 0
    }


@router.get("/recovery")
async def get_recovery_status():
    """
    Get recovery status based on sleep and body battery.
    Enhanced with 7-day sleep average and HRV trend.
    
    Returns a composite recovery score and status.
    """
    # Get last 3 days of data for trend
    result = execute_query(
        """
        SELECT 
            d.date,
            d.body_battery_high,
            d.body_battery_low,
            d.stress_average,
            s.sleep_score,
            s.hrv_average
        FROM dailies d
        LEFT JOIN sleep s ON d.date = s.date
        ORDER BY d.date DESC
        LIMIT 3
        """
    )
    
    if not result:
        return {"status": "unknown", "message": "No data available"}
    
    latest = result[0]
    
    # Get 7-day sleep average for better context
    seven_days_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    sleep_avg_result = execute_query(
        """
        SELECT AVG(sleep_score) as avg_sleep_score
        FROM sleep
        WHERE date >= ?
        """,
        (seven_days_ago,)
    )
    sleep_7day_avg = sleep_avg_result[0]["avg_sleep_score"] if sleep_avg_result and sleep_avg_result[0].get("avg_sleep_score") else None
    
    # Calculate simple recovery score
    sleep_score = latest.get("sleep_score") or 0
    body_battery = latest.get("body_battery_high") or 0
    stress = latest.get("stress_average") or 50
    hrv = latest.get("hrv_average")
    
    # Weighted average (sleep 40%, body battery 40%, inverse stress 20%)
    # If 7-day sleep avg is available, use average of last night and 7-day avg
    effective_sleep = sleep_score
    if sleep_7day_avg:
        effective_sleep = (sleep_score * 0.6) + (sleep_7day_avg * 0.4)
    
    stress_factor = max(0, (100 - stress)) / 100
    recovery_score = (effective_sleep * 0.4) + (body_battery * 0.4) + (stress_factor * 100 * 0.2)
    
    # HRV adjustment if available (small boost if HRV is good)
    if hrv and hrv > 0:
        # Normalize HRV (assuming typical range 20-80ms, adjust based on your data)
        hrv_factor = min(1.0, max(0, (hrv - 20) / 60))
        recovery_score = recovery_score * 0.95 + (hrv_factor * 100 * 0.05)
    
    # Determine status
    if recovery_score >= 80:
        status = "excellent"
        message = "You're well recovered. Great day for intense training!"
    elif recovery_score >= 60:
        status = "good"
        message = "Recovery is good. Moderate training recommended."
    elif recovery_score >= 40:
        status = "fair"
        message = "Recovery is moderate. Consider lighter activity."
    else:
        status = "low"
        message = "Recovery is low. Rest or very light activity suggested."
    
    return {
        "status": status,
        "recovery_score": round(recovery_score),
        "message": message,
        "details": {
            "sleep_score": sleep_score,
            "sleep_7day_avg": round(sleep_7day_avg, 1) if sleep_7day_avg else None,
            "body_battery": body_battery,
            "stress_average": stress,
            "hrv_average": round(hrv, 1) if hrv else None
        },
        "trend": result
    }

