"""Wellness data router (sleep and daily metrics)."""

from typing import Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Query

from app.database import execute_query
from app.models.schemas import Sleep, Daily

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
    metric: str = Query("steps", pattern="^(steps|body_battery_high|stress_average)$"),
    days: int = Query(30, ge=7, le=90)
):
    """
    Get trend data for a specific daily metric.
    
    Args:
        metric: One of 'steps', 'body_battery_high', 'stress_average'
        days: Number of days to include
    """
    start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    
    return execute_query(
        f"""
        SELECT date, {metric} as value
        FROM dailies
        WHERE date >= ? AND {metric} IS NOT NULL
        ORDER BY date
        """,
        (start_date,)
    )


@router.get("/recovery")
async def get_recovery_status():
    """
    Get recovery status based on sleep and body battery.
    
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
    
    # Calculate simple recovery score
    sleep_score = latest.get("sleep_score") or 0
    body_battery = latest.get("body_battery_high") or 0
    stress = latest.get("stress_average") or 50
    
    # Weighted average (sleep 40%, body battery 40%, inverse stress 20%)
    stress_factor = max(0, (100 - stress)) / 100
    recovery_score = (sleep_score * 0.4) + (body_battery * 0.4) + (stress_factor * 100 * 0.2)
    
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
            "body_battery": body_battery,
            "stress_average": stress
        },
        "trend": result
    }

