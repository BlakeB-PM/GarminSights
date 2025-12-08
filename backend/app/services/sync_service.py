"""Data synchronization service for Garmin data."""

import json
import logging
from datetime import datetime, timedelta
from typing import Optional

from app.database import execute_query, execute_write, execute_many, get_db
from app.services.garmin_service import get_garmin_service, GarminService
from app.models.schemas import SyncStatus

logger = logging.getLogger(__name__)


class SyncService:
    """Service for syncing Garmin data to local database."""
    
    def __init__(self, garmin_service: Optional[GarminService] = None):
        """Initialize the sync service."""
        self._garmin = garmin_service or get_garmin_service()
    
    def sync_all(self, days_back: int = 30) -> SyncStatus:
        """
        Sync all data types from Garmin.
        
        Args:
            days_back: Number of days to sync
            
        Returns:
            SyncStatus with counts of synced items
        """
        status = SyncStatus(success=False)
        
        try:
            # Sync activities
            activities_count, sets_count = self.sync_activities(limit=100)
            status.activities_synced = activities_count
            status.strength_sets_extracted = sets_count
            
            # Sync sleep and daily data
            status.sleep_days_synced = self.sync_sleep(days_back)
            status.dailies_synced = self.sync_dailies(days_back)
            
            status.success = True
            
        except Exception as e:
            logger.error(f"Sync failed: {e}")
            status.error = str(e)
        
        return status
    
    def sync_activities(self, limit: int = 50) -> tuple[int, int]:
        """
        Sync activities from Garmin.
        
        Returns:
            Tuple of (activities_synced, strength_sets_extracted)
        """
        activities = self._garmin.fetch_activities(limit=limit)
        activities_synced = 0
        sets_extracted = 0
        
        for activity in activities:
            garmin_id = str(activity.get("activityId"))
            
            # Check if already exists
            existing = execute_query(
                "SELECT id FROM activities WHERE garmin_id = ?",
                (garmin_id,)
            )
            
            if existing:
                continue
            
            # Determine activity type
            activity_type = activity.get("activityType", {}).get("typeKey", "unknown")
            
            # Insert activity
            activity_id = execute_write(
                """INSERT INTO activities 
                   (garmin_id, activity_type, name, start_time, duration_seconds, 
                    distance_meters, calories, raw_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    garmin_id,
                    activity_type,
                    activity.get("activityName"),
                    activity.get("startTimeLocal"),
                    activity.get("duration"),
                    activity.get("distance"),
                    activity.get("calories"),
                    json.dumps(activity)
                )
            )
            activities_synced += 1
            
            # Deep fetch for strength training
            if activity_type == "strength_training":
                sets_count = self._deep_fetch_strength(activity_id, garmin_id)
                sets_extracted += sets_count
        
        logger.info(f"Synced {activities_synced} activities, {sets_extracted} strength sets")
        return activities_synced, sets_extracted
    
    def _deep_fetch_strength(self, activity_id: int, garmin_id: str) -> int:
        """
        Perform deep fetch for strength training activity.
        
        Fetches detailed exercise data including sets, reps, and weights.
        
        Args:
            activity_id: Local database activity ID
            garmin_id: Garmin activity ID
            
        Returns:
            Number of strength sets extracted
        """
        try:
            details = self._garmin.fetch_activity_details(garmin_id)
            if not details:
                return 0
            
            # Update activity with full details
            execute_write(
                "UPDATE activities SET raw_json = ? WHERE id = ?",
                (json.dumps(details), activity_id)
            )
            
            # Extract strength sets
            sets_data = self._extract_strength_sets(details)
            
            if not sets_data:
                return 0
            
            # Insert strength sets
            for set_num, exercise_set in enumerate(sets_data, 1):
                execute_write(
                    """INSERT INTO strength_sets 
                       (activity_id, exercise_name, set_number, reps, weight_kg, 
                        duration_seconds, raw_json)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (
                        activity_id,
                        exercise_set.get("exerciseName"),
                        set_num,
                        exercise_set.get("reps"),
                        exercise_set.get("weight"),
                        exercise_set.get("duration"),
                        json.dumps(exercise_set)
                    )
                )
            
            logger.info(f"Extracted {len(sets_data)} sets from activity {garmin_id}")
            return len(sets_data)
            
        except Exception as e:
            logger.error(f"Deep fetch failed for {garmin_id}: {e}")
            return 0
    
    def _extract_strength_sets(self, details: dict) -> list[dict]:
        """
        Extract strength sets from activity details.
        
        Garmin stores exercise data in different fields depending on the format.
        We check multiple possible locations.
        """
        sets = []
        
        # Try summarizedExerciseSets (common format)
        summarized = details.get("summarizedExerciseSets", [])
        for exercise in summarized:
            exercise_name = exercise.get("exerciseName") or exercise.get("category", "Unknown")
            
            # Each exercise may have multiple sets
            exercise_sets = exercise.get("sets", [])
            if exercise_sets:
                for s in exercise_sets:
                    sets.append({
                        "exerciseName": exercise_name,
                        "reps": s.get("repetitionCount") or s.get("reps"),
                        "weight": s.get("weight"),
                        "duration": s.get("duration")
                    })
            else:
                # Single set format
                sets.append({
                    "exerciseName": exercise_name,
                    "reps": exercise.get("reps") or exercise.get("repetitionCount"),
                    "weight": exercise.get("weight"),
                    "duration": exercise.get("duration")
                })
        
        # Also try activityDetailMetrics or exerciseSets
        exercise_sets = details.get("exerciseSets", [])
        for exercise in exercise_sets:
            sets.append({
                "exerciseName": exercise.get("exerciseName") or exercise.get("name", "Unknown"),
                "reps": exercise.get("repetitions") or exercise.get("reps"),
                "weight": exercise.get("weight"),
                "duration": exercise.get("duration")
            })
        
        return sets
    
    def sync_sleep(self, days_back: int = 30) -> int:
        """
        Sync sleep data for the past N days.
        
        Returns:
            Number of days synced
        """
        synced = 0
        today = datetime.now().date()
        
        for i in range(days_back):
            date = today - timedelta(days=i)
            date_str = date.isoformat()
            
            # Check if already exists
            existing = execute_query(
                "SELECT id FROM sleep WHERE date = ?",
                (date_str,)
            )
            
            if existing:
                continue
            
            try:
                sleep_data = self._garmin.fetch_sleep(date_str)
                if not sleep_data:
                    continue
                
                # Extract relevant fields
                daily_sleep = sleep_data.get("dailySleepDTO", {})
                
                execute_write(
                    """INSERT OR REPLACE INTO sleep 
                       (date, sleep_score, total_sleep_seconds, deep_sleep_seconds,
                        light_sleep_seconds, rem_sleep_seconds, awake_seconds,
                        hrv_average, resting_hr, raw_json)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        date_str,
                        daily_sleep.get("sleepScores", {}).get("overall", {}).get("value"),
                        daily_sleep.get("sleepTimeSeconds"),
                        daily_sleep.get("deepSleepSeconds"),
                        daily_sleep.get("lightSleepSeconds"),
                        daily_sleep.get("remSleepSeconds"),
                        daily_sleep.get("awakeSleepSeconds"),
                        daily_sleep.get("avgOvernightHrv"),
                        daily_sleep.get("restingHeartRate"),
                        json.dumps(sleep_data)
                    )
                )
                synced += 1
                
            except Exception as e:
                logger.warning(f"Failed to sync sleep for {date_str}: {e}")
        
        logger.info(f"Synced {synced} days of sleep data")
        return synced
    
    def sync_dailies(self, days_back: int = 30) -> int:
        """
        Sync daily metrics for the past N days.
        
        Returns:
            Number of days synced
        """
        synced = 0
        today = datetime.now().date()
        
        for i in range(days_back):
            date = today - timedelta(days=i)
            date_str = date.isoformat()
            
            # Check if already exists
            existing = execute_query(
                "SELECT id FROM dailies WHERE date = ?",
                (date_str,)
            )
            
            if existing:
                continue
            
            try:
                daily_data = self._garmin.fetch_daily_summary(date_str)
                if not daily_data:
                    continue
                
                execute_write(
                    """INSERT OR REPLACE INTO dailies 
                       (date, steps, body_battery_high, body_battery_low,
                        stress_average, calories_total, raw_json)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (
                        date_str,
                        daily_data.get("totalSteps"),
                        daily_data.get("bodyBatteryHighestValue"),
                        daily_data.get("bodyBatteryLowestValue"),
                        daily_data.get("averageStressLevel"),
                        daily_data.get("totalKilocalories"),
                        json.dumps(daily_data)
                    )
                )
                synced += 1
                
            except Exception as e:
                logger.warning(f"Failed to sync dailies for {date_str}: {e}")
        
        logger.info(f"Synced {synced} days of daily data")
        return synced


def get_sync_service() -> SyncService:
    """Get a sync service instance."""
    return SyncService()

