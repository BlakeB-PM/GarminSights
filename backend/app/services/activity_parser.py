"""Service to parse activity raw_json data and extract all available metrics."""

import json
import logging
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)


def parse_activity_data(raw_json: Optional[str]) -> Dict[str, Any]:
    """
    Parse activity raw_json and extract all available metrics.
    
    Args:
        raw_json: JSON string containing activity data from Garmin
        
    Returns:
        Dictionary with parsed metrics organized by category
    """
    if not raw_json:
        return {}
    
    try:
        data = json.loads(raw_json)
    except (json.JSONDecodeError, TypeError) as e:
        logger.warning(f"Failed to parse activity raw_json: {e}")
        return {}
    
    parsed = {}
    
    # Extract basic metrics (from basic activity fetch)
    parsed['elevation_gain'] = data.get('elevationGain')
    parsed['elevation_loss'] = data.get('elevationLoss')
    parsed['average_speed'] = data.get('averageSpeed')  # m/s
    parsed['max_speed'] = data.get('maxSpeed')  # m/s
    parsed['elapsed_duration'] = data.get('elapsedDuration')  # seconds
    parsed['moving_duration'] = data.get('movingDuration')  # seconds
    
    # Extract heart rate metrics from multiple possible locations
    hr_metrics = {}
    
    # Check summaryDTO first (from detailed fetch)
    summary = data.get('summaryDTO', {})
    if summary:
        if summary.get('averageHR') is not None:
            hr_metrics['avg'] = summary.get('averageHR')
        if summary.get('maxHR') is not None:
            hr_metrics['max'] = summary.get('maxHR')
        if summary.get('minHR') is not None:
            hr_metrics['min'] = summary.get('minHR')
        if summary.get('restingHeartRate') is not None:
            hr_metrics['resting'] = summary.get('restingHeartRate')
    
    # Fallback: Check top-level fields (some activities store HR here)
    if not hr_metrics.get('avg') and data.get('averageHR') is not None:
        hr_metrics['avg'] = data.get('averageHR')
    if not hr_metrics.get('max') and data.get('maxHR') is not None:
        hr_metrics['max'] = data.get('maxHR')
    if not hr_metrics.get('min') and data.get('minHR') is not None:
        hr_metrics['min'] = data.get('minHR')
    if not hr_metrics.get('resting') and data.get('restingHeartRate') is not None:
        hr_metrics['resting'] = data.get('restingHeartRate')
    
    if hr_metrics:
        parsed['heart_rate'] = hr_metrics
    
    # Extract training metrics from summaryDTO
    if summary:
        training_metrics = {}
        if summary.get('aerobicTrainingEffect') is not None:
            training_metrics['aerobic_effect'] = summary.get('aerobicTrainingEffect')
        if summary.get('anaerobicTrainingEffect') is not None:
            training_metrics['anaerobic_effect'] = summary.get('anaerobicTrainingEffect')
        if summary.get('vo2MaxValue') is not None:
            training_metrics['vo2_max'] = summary.get('vo2MaxValue')
        if summary.get('recoveryTime') is not None:
            training_metrics['recovery_time'] = summary.get('recoveryTime')  # seconds
        if summary.get('trainingEffectLabel') is not None:
            training_metrics['training_effect_label'] = summary.get('trainingEffectLabel')
        if summary.get('performanceCondition') is not None:
            training_metrics['performance_condition'] = summary.get('performanceCondition')
        
        if training_metrics:
            parsed['training'] = training_metrics
        
        # Performance metrics
        if summary.get('averageRunningCadenceInStepsPerMinute') is not None:
            parsed['cadence'] = summary.get('averageRunningCadenceInStepsPerMinute')
        elif summary.get('averageBikeCadenceInRevPerMinute') is not None:
            parsed['cadence'] = summary.get('averageBikeCadenceInRevPerMinute')
        
        if summary.get('strideLength') is not None:
            parsed['stride_length'] = summary.get('strideLength')  # meters
        
        if summary.get('averagePower') is not None:
            parsed['average_power'] = summary.get('averagePower')  # watts
        if summary.get('maxPower') is not None:
            parsed['max_power'] = summary.get('maxPower')  # watts
        if summary.get('normalizedPower') is not None:
            parsed['normalized_power'] = summary.get('normalizedPower')  # watts
        
        # Additional metrics
        if summary.get('totalAscent') is not None:
            parsed['elevation_gain'] = summary.get('totalAscent')
        if summary.get('totalDescent') is not None:
            parsed['elevation_loss'] = summary.get('totalDescent')
        if summary.get('averageSpeed') is not None:
            parsed['average_speed'] = summary.get('averageSpeed')  # m/s
        if summary.get('maxSpeed') is not None:
            parsed['max_speed'] = summary.get('maxSpeed')  # m/s
    
    # Extract splits/splits summaries
    splits_data = data.get('splitSummaries', [])
    if splits_data:
        parsed['splits'] = _parse_splits(splits_data)
    
    # Extract laps if available
    laps_data = data.get('laps', [])
    if laps_data:
        parsed['laps'] = _parse_laps(laps_data)
    
    # Remove None values
    return {k: v for k, v in parsed.items() if v is not None}


def _parse_splits(splits: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Parse split summaries into structured format."""
    parsed_splits = []
    
    for split in splits:
        split_data = {}
        
        split_data['split_type'] = split.get('splitType')
        split_data['duration'] = split.get('duration')  # seconds
        split_data['distance'] = split.get('distance')  # meters
        split_data['average_speed'] = split.get('averageSpeed')  # m/s
        split_data['max_speed'] = split.get('maxSpeed')  # m/s
        split_data['calories'] = split.get('calories')
        split_data['average_hr'] = split.get('averageHR')
        split_data['max_hr'] = split.get('maxHR')
        split_data['elevation_gain'] = split.get('elevationGain')
        
        # Remove None values
        parsed_splits.append({k: v for k, v in split_data.items() if v is not None})
    
    return parsed_splits


def _parse_laps(laps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Parse lap data into structured format."""
    parsed_laps = []
    
    for lap in laps:
        lap_data = {}
        
        lap_data['lap_number'] = lap.get('lapNumber')
        lap_data['duration'] = lap.get('duration')  # seconds
        lap_data['distance'] = lap.get('distance')  # meters
        lap_data['average_speed'] = lap.get('averageSpeed')  # m/s
        lap_data['max_speed'] = lap.get('maxSpeed')  # m/s
        lap_data['calories'] = lap.get('calories')
        lap_data['average_hr'] = lap.get('averageHR')
        lap_data['max_hr'] = lap.get('maxHR')
        
        # Remove None values
        parsed_laps.append({k: v for k, v in lap_data.items() if v is not None})
    
    return parsed_laps


def calculate_pace_from_speed(speed_ms: Optional[float]) -> Optional[float]:
    """
    Convert speed in m/s to pace in min/km.
    
    Args:
        speed_ms: Speed in meters per second
        
    Returns:
        Pace in minutes per kilometer, or None if speed is None/zero
    """
    if not speed_ms or speed_ms <= 0:
        return None
    
    # Convert m/s to min/km
    # 1 m/s = 3.6 km/h = 60/3.6 = 16.67 min/km
    pace_min_per_km = (1000 / speed_ms) / 60
    return pace_min_per_km


def format_pace(pace_min_per_km: Optional[float]) -> Optional[str]:
    """
    Format pace as MM:SS per km.
    
    Args:
        pace_min_per_km: Pace in minutes per kilometer
        
    Returns:
        Formatted string like "5:30" or None
    """
    if not pace_min_per_km:
        return None
    
    minutes = int(pace_min_per_km)
    seconds = int((pace_min_per_km - minutes) * 60)
    return f"{minutes}:{seconds:02d}"

