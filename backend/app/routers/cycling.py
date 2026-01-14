"""Cycling analytics router."""

import json
import logging
from typing import Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Query

from app.database import execute_query
from app.services.activity_parser import parse_activity_data

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cycling", tags=["cycling"])

# Activity types that are considered cycling
CYCLING_TYPES = ('virtual_ride', 'cycling', 'indoor_cycling')


def get_cycling_activities(start_date: str, end_date: Optional[str] = None):
    """
    Get cycling activities with parsed metrics for a date range.
    
    Args:
        start_date: Start date (YYYY-MM-DD)
        end_date: Optional end date (YYYY-MM-DD)
        
    Returns:
        List of activities with parsed metrics
    """
    query = """
        SELECT id, garmin_id, activity_type, name, start_time, 
               duration_seconds, distance_meters, calories, raw_json
        FROM activities
        WHERE activity_type IN (?, ?, ?)
          AND DATE(start_time) >= ?
    """
    params = list(CYCLING_TYPES) + [start_date]
    
    if end_date:
        query += " AND DATE(start_time) <= ?"
        params.append(end_date)
    
    query += " ORDER BY start_time DESC"
    
    activities = execute_query(query, tuple(params))
    
    # Parse raw_json for each activity
    result = []
    for activity in activities:
        parsed = parse_activity_data(activity.get("raw_json"))
        activity_data = {
            "id": activity["id"],
            "garmin_id": activity["garmin_id"],
            "activity_type": activity["activity_type"],
            "name": activity["name"],
            "start_time": activity["start_time"],
            "duration_seconds": activity["duration_seconds"],
            "distance_meters": activity["distance_meters"],
            "calories": activity["calories"],
        }
        # Merge parsed metrics
        activity_data.update(parsed)
        result.append(activity_data)
    
    return result


@router.get("/summary")
async def get_cycling_summary(
    days: int = Query(30, ge=1, le=365, description="Number of days to include"),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)")
):
    """
    Get aggregated cycling metrics for a date range.
    
    Returns total rides, average power, cadence, EF, and estimated FTP.
    """
    # Determine date range
    if start_date and end_date:
        period_start = start_date
        period_end = end_date
    else:
        period_end = datetime.now().strftime("%Y-%m-%d")
        period_start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    
    activities = get_cycling_activities(period_start, period_end)
    
    if not activities:
        return {
            "total_rides": 0,
            "total_duration_minutes": 0,
            "avg_power": None,
            "avg_normalized_power": None,
            "avg_cadence": None,
            "avg_ef": None,
            "estimated_ftp": None,
            "period_start": period_start,
            "period_end": period_end,
        }
    
    # Calculate aggregates
    total_rides = len(activities)
    total_duration_seconds = sum(a.get("duration_seconds") or 0 for a in activities)
    
    # Power metrics (weighted by duration)
    power_values = []
    np_values = []
    cadence_values = []
    ef_values = []
    max_20min_powers = []
    
    for a in activities:
        duration = a.get("duration_seconds") or 0
        
        if a.get("average_power") and duration > 0:
            power_values.append((a["average_power"], duration))
        
        if a.get("normalized_power") and duration > 0:
            np_values.append((a["normalized_power"], duration))
        
        if a.get("cadence") and duration > 0:
            cadence_values.append((a["cadence"], duration))
        
        # EF = NP / Avg HR (only when both exist)
        hr = a.get("heart_rate", {})
        avg_hr = hr.get("avg") if isinstance(hr, dict) else None
        if a.get("normalized_power") and avg_hr and avg_hr > 0:
            ef = a["normalized_power"] / avg_hr
            ef_values.append((ef, duration))
        
        if a.get("max_20min_power"):
            max_20min_powers.append(a["max_20min_power"])
    
    # Calculate weighted averages
    def weighted_avg(values_weights):
        if not values_weights:
            return None
        total_weight = sum(w for _, w in values_weights)
        if total_weight == 0:
            return None
        return sum(v * w for v, w in values_weights) / total_weight
    
    avg_power = weighted_avg(power_values)
    avg_np = weighted_avg(np_values)
    avg_cadence = weighted_avg(cadence_values)
    avg_ef = weighted_avg(ef_values)
    
    # FTP estimation from best 20-min power
    estimated_ftp = None
    if max_20min_powers:
        estimated_ftp = max(max_20min_powers) * 0.95
    
    return {
        "total_rides": total_rides,
        "total_duration_minutes": round(total_duration_seconds / 60, 1),
        "avg_power": round(avg_power, 1) if avg_power else None,
        "avg_normalized_power": round(avg_np, 1) if avg_np else None,
        "avg_cadence": round(avg_cadence, 1) if avg_cadence else None,
        "avg_ef": round(avg_ef, 3) if avg_ef else None,
        "estimated_ftp": round(estimated_ftp, 1) if estimated_ftp else None,
        "period_start": period_start,
        "period_end": period_end,
    }


@router.get("/trends")
async def get_cycling_trends(
    days: int = Query(90, ge=1, le=365, description="Number of days to include"),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)")
):
    """
    Get time-series data for power, NP, cadence, and EF per ride.
    
    Used for trend line charts.
    """
    # Determine date range
    if start_date and end_date:
        period_start = start_date
        period_end = end_date
    else:
        period_end = datetime.now().strftime("%Y-%m-%d")
        period_start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    
    activities = get_cycling_activities(period_start, period_end)
    
    # Get FTP for IF calculation (from summary)
    summary = await get_cycling_summary(days=days, start_date=start_date, end_date=end_date)
    ftp = summary.get("estimated_ftp")
    
    result = []
    for a in activities:
        # Parse date from start_time
        start_time = a.get("start_time", "")
        try:
            date = datetime.fromisoformat(start_time.replace("Z", "+00:00")).strftime("%Y-%m-%d")
        except (ValueError, AttributeError):
            date = start_time[:10] if start_time else None
        
        duration_seconds = a.get("duration_seconds") or 0
        avg_power = a.get("average_power")
        np_power = a.get("normalized_power")
        cadence = a.get("cadence")
        
        # EF calculation
        hr = a.get("heart_rate", {})
        avg_hr = hr.get("avg") if isinstance(hr, dict) else None
        ef = None
        if np_power and avg_hr and avg_hr > 0:
            ef = np_power / avg_hr
        
        # VI calculation
        vi = None
        if np_power and avg_power and avg_power > 0:
            vi = np_power / avg_power
        
        # IF calculation
        intensity_factor = None
        if np_power and ftp and ftp > 0:
            intensity_factor = np_power / ftp
        
        # Distance in miles
        distance_meters = a.get("distance_meters") or 0
        distance_miles = distance_meters / 1609.34 if distance_meters > 0 else None
        
        result.append({
            "date": date,
            "activity_id": a["id"],
            "name": a.get("name"),
            "duration_minutes": round(duration_seconds / 60, 1),
            "avg_power": round(avg_power, 1) if avg_power else None,
            "normalized_power": round(np_power, 1) if np_power else None,
            "cadence": round(cadence, 1) if cadence else None,
            "efficiency_factor": round(ef, 3) if ef else None,
            "variability_index": round(vi, 3) if vi else None,
            "intensity_factor": round(intensity_factor, 3) if intensity_factor else None,
            "distance_miles": round(distance_miles, 2) if distance_miles else None,
        })
    
    # Sort by date ascending for charting
    result.sort(key=lambda x: x["date"] or "")
    
    return result


@router.get("/power-curve")
async def get_power_curve(
    days: int = Query(30, ge=1, le=365, description="Days for current period"),
    compare_weeks_back: Optional[int] = Query(None, ge=1, le=52, description="Weeks back for comparison period")
):
    """
    Get best power at each duration interval.
    
    Optionally includes a comparison to a previous period.
    """
    now = datetime.now()
    period_end = now.strftime("%Y-%m-%d")
    period_start = (now - timedelta(days=days)).strftime("%Y-%m-%d")
    
    activities = get_cycling_activities(period_start, period_end)
    
    # Standard power curve intervals (in seconds)
    intervals = ["1", "2", "5", "10", "20", "30", "60", "120", "300", "600", "1200", "1800"]
    
    # Find best power at each interval
    current_curve = {}
    max_20min_power = None
    
    for a in activities:
        power_curve = a.get("power_curve", {})
        
        for interval in intervals:
            if interval in power_curve:
                power = power_curve[interval]
                if interval not in current_curve or power > current_curve[interval]:
                    current_curve[interval] = power
        
        # Track max 20-min power for FTP
        if a.get("max_20min_power"):
            if max_20min_power is None or a["max_20min_power"] > max_20min_power:
                max_20min_power = a["max_20min_power"]
    
    # FTP estimate
    ftp_estimate = None
    if max_20min_power:
        ftp_estimate = max_20min_power * 0.95
    elif "1200" in current_curve:
        ftp_estimate = current_curve["1200"] * 0.95
    
    result = {
        "current": current_curve,
        "ftp_estimate": round(ftp_estimate, 1) if ftp_estimate else None,
        "period_start": period_start,
        "period_end": period_end,
    }
    
    # Comparison period if requested
    if compare_weeks_back:
        comp_end = (now - timedelta(weeks=compare_weeks_back)).strftime("%Y-%m-%d")
        comp_start = (now - timedelta(weeks=compare_weeks_back) - timedelta(days=days)).strftime("%Y-%m-%d")
        
        comp_activities = get_cycling_activities(comp_start, comp_end)
        
        comparison_curve = {}
        for a in comp_activities:
            power_curve = a.get("power_curve", {})
            for interval in intervals:
                if interval in power_curve:
                    power = power_curve[interval]
                    if interval not in comparison_curve or power > comparison_curve[interval]:
                        comparison_curve[interval] = power
        
        result["comparison"] = comparison_curve
        result["comparison_start"] = comp_start
        result["comparison_end"] = comp_end
    
    return result


@router.get("/power-zones")
async def get_power_zones(
    days: int = Query(30, ge=1, le=365, description="Number of days to include"),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)")
):
    """
    Aggregate time-in-power-zone across rides for a period.
    
    Returns seconds and percentage in each power zone.
    """
    # Determine date range
    if start_date and end_date:
        period_start = start_date
        period_end = end_date
    else:
        period_end = datetime.now().strftime("%Y-%m-%d")
        period_start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    
    activities = get_cycling_activities(period_start, period_end)
    
    # Zone labels based on typical power zones
    zone_labels = {
        "zone_1": "Active Recovery",
        "zone_2": "Endurance",
        "zone_3": "Tempo",
        "zone_4": "Threshold",
        "zone_5": "VO2max",
        "zone_6": "Anaerobic",
        "zone_7": "Neuromuscular",
    }
    
    # Aggregate zone times
    zone_totals = {}
    total_seconds = 0
    
    for a in activities:
        power_zones = a.get("power_zones", {})
        for zone_key, seconds in power_zones.items():
            if seconds and seconds > 0:
                zone_totals[zone_key] = zone_totals.get(zone_key, 0) + seconds
                total_seconds += seconds
    
    # Build result with percentages
    result = {}
    for zone_key in ["zone_1", "zone_2", "zone_3", "zone_4", "zone_5", "zone_6", "zone_7"]:
        seconds = zone_totals.get(zone_key, 0)
        percent = (seconds / total_seconds * 100) if total_seconds > 0 else 0
        result[zone_key] = {
            "seconds": seconds,
            "percent": round(percent, 1),
            "label": zone_labels.get(zone_key, zone_key),
        }
    
    result["total_seconds"] = total_seconds
    result["period_start"] = period_start
    result["period_end"] = period_end
    
    return result


@router.get("/distance")
async def get_distance_data(
    days: int = Query(365, ge=1, le=730, description="Number of days to include"),
    aggregation: str = Query("session", regex="^(session|week|month)$", description="Aggregation level"),
    cumulative: bool = Query(False, description="Return cumulative totals")
):
    """
    Get distance data with various aggregation options.
    
    Args:
        days: Number of days to include
        aggregation: 'session', 'week', or 'month'
        cumulative: If true, return running cumulative total
    """
    period_end = datetime.now().strftime("%Y-%m-%d")
    period_start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    
    activities = get_cycling_activities(period_start, period_end)
    
    if not activities:
        return {
            "data": [],
            "total_miles": 0,
            "period_start": period_start,
            "period_end": period_end,
            "aggregation": aggregation,
            "cumulative": cumulative,
        }
    
    # Sort by date ascending
    activities.sort(key=lambda x: x.get("start_time") or "")
    
    if aggregation == "session":
        # Per-session data
        data = []
        running_total = 0
        for a in activities:
            distance_meters = a.get("distance_meters") or 0
            distance_miles = distance_meters / 1609.34 if distance_meters > 0 else 0
            running_total += distance_miles
            
            start_time = a.get("start_time", "")
            try:
                date = datetime.fromisoformat(start_time.replace("Z", "+00:00")).strftime("%Y-%m-%d")
            except (ValueError, AttributeError):
                date = start_time[:10] if start_time else None
            
            data.append({
                "date": date,
                "label": date,
                "activity_id": a["id"],
                "name": a.get("name"),
                "miles": round(distance_miles, 2),
                "cumulative_miles": round(running_total, 2) if cumulative else None,
            })
    
    elif aggregation == "week":
        # Weekly aggregation
        from collections import defaultdict
        weekly_data = defaultdict(float)
        
        for a in activities:
            start_time = a.get("start_time", "")
            try:
                dt = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                continue
            
            # Get Monday of the week
            week_start = dt - timedelta(days=dt.weekday())
            week_key = week_start.strftime("%Y-%m-%d")
            
            distance_meters = a.get("distance_meters") or 0
            distance_miles = distance_meters / 1609.34 if distance_meters > 0 else 0
            weekly_data[week_key] += distance_miles
        
        # Sort and build result
        data = []
        running_total = 0
        for week_key in sorted(weekly_data.keys()):
            miles = weekly_data[week_key]
            running_total += miles
            week_start = datetime.strptime(week_key, "%Y-%m-%d")
            week_end = week_start + timedelta(days=6)
            
            data.append({
                "date": week_key,
                "label": f"{week_start.strftime('%b %d')} - {week_end.strftime('%b %d')}",
                "miles": round(miles, 2),
                "cumulative_miles": round(running_total, 2) if cumulative else None,
            })
    
    elif aggregation == "month":
        # Monthly aggregation
        from collections import defaultdict
        monthly_data = defaultdict(float)
        
        for a in activities:
            start_time = a.get("start_time", "")
            try:
                dt = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                continue
            
            month_key = dt.strftime("%Y-%m")
            
            distance_meters = a.get("distance_meters") or 0
            distance_miles = distance_meters / 1609.34 if distance_meters > 0 else 0
            monthly_data[month_key] += distance_miles
        
        # Sort and build result
        data = []
        running_total = 0
        for month_key in sorted(monthly_data.keys()):
            miles = monthly_data[month_key]
            running_total += miles
            month_dt = datetime.strptime(month_key, "%Y-%m")
            
            data.append({
                "date": month_key,
                "label": month_dt.strftime("%b %Y"),
                "miles": round(miles, 2),
                "cumulative_miles": round(running_total, 2) if cumulative else None,
            })
    
    total_miles = sum(
        (a.get("distance_meters") or 0) / 1609.34
        for a in activities
    )
    
    return {
        "data": data,
        "total_miles": round(total_miles, 2),
        "period_start": period_start,
        "period_end": period_end,
        "aggregation": aggregation,
        "cumulative": cumulative,
    }


@router.get("/cadence-analysis")
async def get_cadence_analysis(
    days: int = Query(90, ge=1, le=365, description="Number of days to include"),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)")
):
    """
    Get cadence distribution and power-at-cadence data.
    
    Helps identify optimal cadence range for power production.
    """
    # Determine date range
    if start_date and end_date:
        period_start = start_date
        period_end = end_date
    else:
        period_end = datetime.now().strftime("%Y-%m-%d")
        period_start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    
    activities = get_cycling_activities(period_start, period_end)
    
    # Define cadence buckets
    buckets = [
        (50, 60, "50-60"),
        (60, 70, "60-70"),
        (70, 80, "70-80"),
        (80, 90, "80-90"),
        (90, 100, "90-100"),
        (100, 110, "100-110"),
        (110, 120, "110-120"),
    ]
    
    # Collect cadence/power pairs
    cadence_data = {b[2]: {"count": 0, "total_power": 0, "total_duration": 0} for b in buckets}
    all_cadences = []
    all_powers = []
    
    for a in activities:
        cadence = a.get("cadence")
        avg_power = a.get("average_power")
        duration = a.get("duration_seconds") or 0
        
        if cadence and cadence > 0:
            all_cadences.append(cadence)
            
            # Find bucket
            for low, high, label in buckets:
                if low <= cadence < high:
                    cadence_data[label]["count"] += 1
                    cadence_data[label]["total_duration"] += duration
                    if avg_power:
                        cadence_data[label]["total_power"] += avg_power * duration
                        all_powers.append((cadence, avg_power))
                    break
    
    # Build distribution
    distribution = []
    best_power_bucket = None
    best_power = 0
    
    for low, high, label in buckets:
        data = cadence_data[label]
        avg_power = None
        if data["total_duration"] > 0:
            avg_power = data["total_power"] / data["total_duration"]
            if avg_power > best_power:
                best_power = avg_power
                best_power_bucket = label
        
        distribution.append({
            "bucket": label,
            "count": data["count"],
            "avg_power": round(avg_power, 1) if avg_power else None,
            "total_minutes": round(data["total_duration"] / 60, 1),
        })
    
    # Calculate overall average cadence
    avg_cadence = sum(all_cadences) / len(all_cadences) if all_cadences else None
    
    return {
        "distribution": distribution,
        "optimal_cadence_range": best_power_bucket,
        "avg_cadence": round(avg_cadence, 1) if avg_cadence else None,
        "total_rides": len(activities),
        "period_start": period_start,
        "period_end": period_end,
    }


@router.get("/power-cadence-scatter")
async def get_power_cadence_scatter(
    days: int = Query(90, ge=1, le=365, description="Number of days to include")
):
    """
    Get power/cadence pairs for scatter plot visualization.
    
    Returns data points with cadence, power, efficiency factor, and duration
    for each cycling activity. Useful for identifying optimal cadence range.
    """
    period_end = datetime.now().strftime("%Y-%m-%d")
    period_start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    
    activities = get_cycling_activities(period_start, period_end)
    
    result = []
    for a in activities:
        cadence = a.get("cadence")
        avg_power = a.get("average_power")
        
        # Skip if missing core data
        if not cadence or not avg_power:
            continue
        
        # Parse date
        start_time = a.get("start_time", "")
        try:
            date = datetime.fromisoformat(start_time.replace("Z", "+00:00")).strftime("%Y-%m-%d")
        except (ValueError, AttributeError):
            date = start_time[:10] if start_time else None
        
        # Calculate efficiency factor
        hr = a.get("heart_rate", {})
        avg_hr = hr.get("avg") if isinstance(hr, dict) else None
        ef = None
        if a.get("normalized_power") and avg_hr and avg_hr > 0:
            ef = a["normalized_power"] / avg_hr
        
        duration_minutes = (a.get("duration_seconds") or 0) / 60
        
        result.append({
            "activity_id": a["id"],
            "date": date,
            "name": a.get("name"),
            "cadence": round(cadence, 1),
            "avg_power": round(avg_power, 1),
            "normalized_power": round(a["normalized_power"], 1) if a.get("normalized_power") else None,
            "efficiency_factor": round(ef, 3) if ef else None,
            "avg_hr": avg_hr,
            "duration_minutes": round(duration_minutes, 1),
        })
    
    # Sort by date
    result.sort(key=lambda x: x["date"] or "")
    
    return {
        "data": result,
        "total_rides": len(result),
        "period_start": period_start,
        "period_end": period_end,
    }


@router.get("/power-curve-history")
async def get_power_curve_history(
    months: int = Query(6, ge=1, le=12, description="Number of months to include")
):
    """
    Get monthly power curve data for heatmap visualization.
    
    Returns best power at each duration interval for each month,
    along with all-time bests for comparison.
    """
    from collections import defaultdict
    
    now = datetime.now()
    period_end = now.strftime("%Y-%m-%d")
    period_start = (now - timedelta(days=months * 30)).strftime("%Y-%m-%d")
    
    activities = get_cycling_activities(period_start, period_end)
    
    # Standard power curve intervals
    intervals = ["5", "10", "30", "60", "300", "600", "1200"]
    interval_labels = {
        "5": "5s",
        "10": "10s", 
        "30": "30s",
        "60": "1min",
        "300": "5min",
        "600": "10min",
        "1200": "20min",
    }
    
    # Group activities by month and find best power at each interval
    monthly_curves = defaultdict(lambda: {interval: None for interval in intervals})
    all_time_best = {interval: None for interval in intervals}
    
    for a in activities:
        # Parse month from start_time
        start_time = a.get("start_time", "")
        try:
            dt = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
            month_key = dt.strftime("%Y-%m")
            month_label = dt.strftime("%b %Y")
        except (ValueError, AttributeError):
            continue
        
        power_curve = a.get("power_curve", {})
        
        for interval in intervals:
            if interval in power_curve:
                power = power_curve[interval]
                
                # Update monthly best
                if monthly_curves[month_key][interval] is None or power > monthly_curves[month_key][interval]:
                    monthly_curves[month_key][interval] = power
                
                # Update all-time best
                if all_time_best[interval] is None or power > all_time_best[interval]:
                    all_time_best[interval] = power
    
    # Build heatmap data: rows are months, columns are intervals
    # Value is percentage of all-time best (0-100)
    heatmap_data = []
    
    for month_key in sorted(monthly_curves.keys()):
        month_dt = datetime.strptime(month_key, "%Y-%m")
        month_label = month_dt.strftime("%b %Y")
        
        row = {
            "month": month_key,
            "label": month_label,
        }
        
        for interval in intervals:
            monthly_power = monthly_curves[month_key][interval]
            best_power = all_time_best[interval]
            
            if monthly_power and best_power:
                # Calculate as percentage of all-time best
                pct = (monthly_power / best_power) * 100
                row[interval_labels[interval]] = {
                    "power": monthly_power,
                    "percent_of_best": round(pct, 1),
                }
            else:
                row[interval_labels[interval]] = None
        
        heatmap_data.append(row)
    
    return {
        "data": heatmap_data,
        "intervals": [interval_labels[i] for i in intervals],
        "all_time_best": {interval_labels[k]: v for k, v in all_time_best.items() if v},
        "period_start": period_start,
        "period_end": period_end,
    }


@router.get("/sleep-performance")
async def get_sleep_performance_correlation(
    days: int = Query(90, ge=1, le=365, description="Number of days to include")
):
    """
    Get sleep metrics correlated with next-day cycling performance.
    
    Joins sleep data with cycling activities to show how recovery
    affects workout quality. Useful for scatter plot visualization.
    """
    period_end = datetime.now().strftime("%Y-%m-%d")
    period_start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    
    # Get all cycling activities in the period
    activities = get_cycling_activities(period_start, period_end)
    
    if not activities:
        return {
            "data": [],
            "correlation_stats": None,
            "period_start": period_start,
            "period_end": period_end,
        }
    
    # Get sleep data for the period (need day before each activity)
    sleep_query = """
        SELECT date, sleep_score, hrv_average, resting_hr, 
               total_sleep_seconds, deep_sleep_seconds
        FROM sleep
        WHERE date >= ? AND date <= ?
    """
    sleep_data = execute_query(sleep_query, (period_start, period_end))
    
    # Get daily data for body battery
    daily_query = """
        SELECT date, body_battery_high, body_battery_low, stress_average
        FROM dailies
        WHERE date >= ? AND date <= ?
    """
    daily_data = execute_query(daily_query, (period_start, period_end))
    
    # Create lookup dictionaries
    sleep_by_date = {s["date"]: s for s in sleep_data}
    daily_by_date = {d["date"]: d for d in daily_data}
    
    result = []
    
    for a in activities:
        # Parse activity date
        start_time = a.get("start_time", "")
        try:
            activity_dt = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
            activity_date = activity_dt.strftime("%Y-%m-%d")
            # Get previous night's sleep (same date in sleep table)
            sleep_date = activity_date
        except (ValueError, AttributeError):
            continue
        
        # Get sleep and daily data for the night before
        sleep = sleep_by_date.get(sleep_date, {})
        daily = daily_by_date.get(sleep_date, {})
        
        # Skip if no sleep data for correlation
        if not sleep.get("sleep_score"):
            continue
        
        # Calculate cycling performance metrics
        hr = a.get("heart_rate", {})
        avg_hr = hr.get("avg") if isinstance(hr, dict) else None
        ef = None
        if a.get("normalized_power") and avg_hr and avg_hr > 0:
            ef = a["normalized_power"] / avg_hr
        
        duration_minutes = (a.get("duration_seconds") or 0) / 60
        
        result.append({
            "activity_id": a["id"],
            "activity_date": activity_date,
            "activity_name": a.get("name"),
            # Sleep metrics (previous night)
            "sleep_score": sleep.get("sleep_score"),
            "hrv": sleep.get("hrv_average"),
            "resting_hr": sleep.get("resting_hr"),
            "sleep_hours": round((sleep.get("total_sleep_seconds") or 0) / 3600, 1) if sleep.get("total_sleep_seconds") else None,
            "deep_sleep_hours": round((sleep.get("deep_sleep_seconds") or 0) / 3600, 1) if sleep.get("deep_sleep_seconds") else None,
            # Daily metrics
            "body_battery": daily.get("body_battery_high"),
            "stress_avg": daily.get("stress_average"),
            # Cycling performance
            "avg_power": round(a["average_power"], 1) if a.get("average_power") else None,
            "normalized_power": round(a["normalized_power"], 1) if a.get("normalized_power") else None,
            "efficiency_factor": round(ef, 3) if ef else None,
            "duration_minutes": round(duration_minutes, 1),
            "avg_hr": avg_hr,
        })
    
    # Calculate simple correlation stats if we have enough data
    correlation_stats = None
    if len(result) >= 5:
        sleep_scores = [r["sleep_score"] for r in result if r["sleep_score"] and r["avg_power"]]
        powers = [r["avg_power"] for r in result if r["sleep_score"] and r["avg_power"]]
        
        if len(sleep_scores) >= 5:
            # Simple correlation calculation
            n = len(sleep_scores)
            mean_sleep = sum(sleep_scores) / n
            mean_power = sum(powers) / n
            
            numerator = sum((s - mean_sleep) * (p - mean_power) for s, p in zip(sleep_scores, powers))
            denom_sleep = sum((s - mean_sleep) ** 2 for s in sleep_scores) ** 0.5
            denom_power = sum((p - mean_power) ** 2 for p in powers) ** 0.5
            
            if denom_sleep > 0 and denom_power > 0:
                correlation = numerator / (denom_sleep * denom_power)
                correlation_stats = {
                    "sleep_power_correlation": round(correlation, 3),
                    "data_points": n,
                    "interpretation": "positive" if correlation > 0.1 else "negative" if correlation < -0.1 else "neutral",
                }
    
    return {
        "data": result,
        "correlation_stats": correlation_stats,
        "total_matched": len(result),
        "period_start": period_start,
        "period_end": period_end,
    }
