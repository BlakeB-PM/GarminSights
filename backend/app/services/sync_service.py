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
        status = SyncStatus(success=False, warnings=[], details={})
        
        # Check if Garmin client is available
        if not self._garmin:
            error_msg = "Garmin service not initialized"
            logger.error(error_msg)
            status.error = error_msg
            return status
        
        if not self._garmin._client:
            error_msg = "Garmin client not authenticated. Please login first."
            logger.error(error_msg)
            status.error = error_msg
            status.details = {"auth_check": "failed", "username": self._garmin._username}
            return status
        
        logger.info(f"Starting full sync for last {days_back} days")
        status.details["days_back"] = days_back
        status.details["username"] = self._garmin._username
        
        try:
            # Sync activities - use days_back to limit scope
            logger.info("Syncing activities...")
            activities_count, sets_count = self.sync_activities(limit=100, days_back=days_back)
            status.activities_synced = activities_count
            status.strength_sets_extracted = sets_count
            logger.info(f"Activities sync complete: {activities_count} activities, {sets_count} strength sets")
            
            if activities_count == 0:
                status.warnings.append("No new activities synced. This may indicate: all activities already exist, API returned no data, or authentication issue.")
            
            # Sync sleep and daily data
            logger.info("Syncing sleep data...")
            status.sleep_days_synced = self.sync_sleep(days_back)
            logger.info(f"Sleep sync complete: {status.sleep_days_synced} days")
            
            if status.sleep_days_synced == 0:
                status.warnings.append("No sleep data synced or updated. This may indicate: no sleep data in Garmin Connect for this date range, API returned no data, or all records are already up to date.")
            
            logger.info("Syncing daily metrics...")
            status.dailies_synced = self.sync_dailies(days_back)
            logger.info(f"Dailies sync complete: {status.dailies_synced} days")
            
            if status.dailies_synced == 0:
                status.warnings.append("No daily metrics synced or updated. This may indicate: no daily data in Garmin Connect for this date range, API returned no data, or all records are already up to date.")
            
            status.success = True
            logger.info(f"Full sync complete: {status.activities_synced} activities, {status.sleep_days_synced} sleep days, {status.dailies_synced} daily records")
            
        except Exception as e:
            logger.error(f"Sync failed: {e}", exc_info=True)
            status.error = f"{type(e).__name__}: {str(e)}"
            status.details["exception_type"] = type(e).__name__
        
        return status
    
    def sync_activities(self, limit: int = 50, days_back: int = 30) -> tuple[int, int]:
        """
        Sync activities from Garmin.
        
        Fetches activities in batches until we find new ones or reach the date cutoff.
        This ensures recent activities are captured even if older ones already exist.
        
        Args:
            limit: Batch size for fetching activities
            days_back: Only sync activities from the last N days
            
        Returns:
            Tuple of (activities_synced, strength_sets_extracted)
        """
        activities_synced = 0
        sets_extracted = 0
        start = 0
        batch_size = limit
        cutoff_date = (datetime.now() - timedelta(days=days_back)).date()
        consecutive_existing = 0
        max_consecutive_existing = 50  # Stop after 50 consecutive existing activities
        
        # Check if Garmin client is available
        if not self._garmin or not self._garmin._client:
            logger.error("Garmin client not initialized. Cannot sync activities.")
            return 0, 0
        
        logger.info(f"Starting activity sync (days_back={days_back}, batch_size={batch_size})")
        
        while True:
            # Fetch next batch
            try:
                activities = self._garmin.fetch_activities(limit=batch_size, start=start)
            except Exception as e:
                error_msg = f"Failed to fetch activities batch (start={start}): {e}"
                logger.error(error_msg)
                # If first batch fails, likely an auth or API issue
                if start == 0:
                    logger.error("Initial activity fetch failed - check authentication and API access")
                    break
                # For later batches, continue trying
                start += batch_size
                continue
            
            if not activities:
                if start == 0:
                    logger.warning("No activities returned from Garmin API. Possible causes: authentication expired, no activities in account, or API access issue.")
                else:
                    logger.info("No more activities to fetch")
                break
            
            logger.info(f"Fetched {len(activities)} activities (start={start})")
            
            batch_synced = 0
            
            for activity in activities:
                garmin_id = str(activity.get("activityId"))
                
                # Check if already exists
                existing = execute_query(
                    "SELECT id FROM activities WHERE garmin_id = ?",
                    (garmin_id,)
                )
                
                if existing:
                    consecutive_existing += 1
                    # If we've seen many consecutive existing activities, we've likely caught up
                    if consecutive_existing >= max_consecutive_existing:
                        logger.info(f"Reached {max_consecutive_existing} consecutive existing activities, stopping sync")
                        return activities_synced, sets_extracted
                    continue
                
                # Reset counter when we find a new activity
                consecutive_existing = 0
                
                # Check date cutoff - stop if activity is too old
                start_time_str = activity.get("startTimeLocal")
                if start_time_str:
                    try:
                        # Parse date from ISO format
                        activity_date = datetime.fromisoformat(start_time_str.replace('Z', '+00:00')).date()
                        if activity_date < cutoff_date:
                            logger.info(f"Reached date cutoff ({cutoff_date}), stopping sync")
                            return activities_synced, sets_extracted
                    except (ValueError, AttributeError):
                        # If date parsing fails, continue anyway
                        pass
                
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
                        start_time_str,
                        activity.get("duration"),
                        activity.get("distance"),
                        activity.get("calories"),
                        json.dumps(activity)
                    )
                )
                activities_synced += 1
                batch_synced += 1
                
                # Deep fetch for strength training
                if activity_type == "strength_training":
                    sets_count = self._deep_fetch_strength(activity_id, garmin_id)
                    sets_extracted += sets_count
            
            # If this batch had no new activities and we've checked enough, stop
            if batch_synced == 0 and start > 0:
                logger.info("No new activities in this batch, stopping sync")
                break
            
            # Move to next batch
            start += batch_size
            
            # Safety limit: don't fetch more than 1000 activities in one sync
            if start >= 1000:
                logger.info("Reached safety limit of 1000 activities, stopping sync")
                break
        
        logger.info(f"Synced {activities_synced} activities, {sets_extracted} strength sets")
        return activities_synced, sets_extracted
    
    def _deep_fetch_strength(self, activity_id: int, garmin_id: str) -> int:
        """
        Perform deep fetch for strength training activity.
        
        Fetches detailed exercise data including sets, reps, and weights
        using the exercise_sets API endpoint.
        
        Args:
            activity_id: Local database activity ID
            garmin_id: Garmin activity ID
            
        Returns:
            Number of strength sets extracted
        """
        try:
            # Use the dedicated exercise sets endpoint
            exercise_data = self._garmin.fetch_exercise_sets(garmin_id)
            if not exercise_data:
                logger.debug(f"No exercise sets data for {garmin_id}")
                return 0
            
            exercise_sets = exercise_data.get("exerciseSets", [])
            if not exercise_sets:
                logger.debug(f"Empty exercise sets for {garmin_id}")
                return 0
            
            # Update activity with exercise data
            execute_write(
                "UPDATE activities SET raw_json = ? WHERE id = ?",
                (json.dumps(exercise_data), activity_id)
            )
            
            # Process and insert all sets (including REST periods)
            sets_inserted = 0
            for set_num, exercise_set in enumerate(exercise_sets, 1):
                set_type = exercise_set.get("setType", "")
                duration = exercise_set.get("duration")
                
                # Handle rest periods
                if set_type == "REST":
                    exercise_name = "Rest"
                    reps = None
                    weight_lbs = None
                else:
                    # Get exercise name from exercises array
                    exercises = exercise_set.get("exercises", [])
                    exercise_name = "Unknown"
                    exercise_category = "Unknown"
                    
                    if exercises:
                        # Use the first exercise's name/category
                        first_exercise = exercises[0]
                        exercise_name = first_exercise.get("name") or first_exercise.get("category", "Unknown")
                        exercise_category = first_exercise.get("category", "Unknown")
                        
                        # Format name nicely (ROMANIAN_DEADLIFT -> Romanian Deadlift)
                        if exercise_name and exercise_name != "Unknown":
                            exercise_name = exercise_name.replace("_", " ").title()
                        elif exercise_category and exercise_category != "Unknown":
                            exercise_name = exercise_category.replace("_", " ").title()
                    
                    reps = exercise_set.get("repetitionCount")
                    weight_raw = exercise_set.get("weight")
                    
                    # Weight appears to be in grams, convert directly to lbs to avoid rounding errors
                    # 1 gram = 0.00220462 lbs
                    weight_lbs = None
                    if weight_raw and weight_raw > 0:
                        weight_lbs = weight_raw * 0.00220462  # Convert grams directly to lbs
                    
                    # Skip warmup cardio sets (no reps, no meaningful data)
                    if exercise_category == "CARDIO" and not reps:
                        continue
                
                execute_write(
                    """INSERT INTO strength_sets 
                       (activity_id, exercise_name, set_number, reps, weight_lbs, 
                        duration_seconds, raw_json)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (
                        activity_id,
                        exercise_name,
                        set_num,  # Use actual sequence number including rests
                        reps,
                        weight_lbs,
                        duration,
                        json.dumps(exercise_set)
                    )
                )
                sets_inserted += 1
            
            if sets_inserted > 0:
                logger.info(f"Extracted {sets_inserted} sets from activity {garmin_id}")
            return sets_inserted
            
        except Exception as e:
            logger.error(f"Deep fetch failed for {garmin_id}: {e}", exc_info=True)
            return 0
    
    def backfill_strength_details(self) -> tuple[int, int]:
        """
        Backfill strength training details for existing activities.
        
        Finds strength training activities without sets and performs deep fetch.
        
        Returns:
            Tuple of (activities_processed, sets_extracted)
        """
        # Find strength activities without sets
        activities = execute_query(
            """
            SELECT a.id, a.garmin_id, a.name
            FROM activities a
            WHERE a.activity_type = 'strength_training'
            AND NOT EXISTS (
                SELECT 1 FROM strength_sets s WHERE s.activity_id = a.id
            )
            ORDER BY a.start_time DESC
            LIMIT 50
            """
        )
        
        if not activities:
            logger.info("No strength activities need backfilling")
            return 0, 0
        
        logger.info(f"Found {len(activities)} strength activities to backfill")
        
        total_sets = 0
        processed = 0
        
        for activity in activities:
            activity_id = activity["id"]
            garmin_id = activity["garmin_id"]
            name = activity.get("name", "Unknown")
            
            logger.info(f"Deep fetching strength data for: {name} (ID: {garmin_id})")
            
            sets_count = self._deep_fetch_strength(activity_id, garmin_id)
            total_sets += sets_count
            processed += 1
            
            logger.info(f"  -> Extracted {sets_count} sets")
        
        logger.info(f"Backfill complete: {processed} activities, {total_sets} total sets")
        return processed, total_sets
    
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
            
            try:
                sleep_data = self._garmin.fetch_sleep(date_str)
                if not sleep_data:
                    # Log only occasionally to avoid spam
                    if i % 7 == 0:  # Log every 7 days
                        logger.debug(f"No sleep data available for {date_str}")
                    continue
                
                # Extract relevant fields
                daily_sleep = sleep_data.get("dailySleepDTO", {}) or sleep_data.get("sleepData", {})
                
                # Helper function to safely get nested values
                def get_nested_sleep(data, *keys, default=None):
                    """Get value from nested dict using multiple keys."""
                    for key in keys:
                        if isinstance(data, dict):
                            data = data.get(key)
                        else:
                            return default
                        if data is None:
                            return default
                    return data if data is not None else default
                
                # HRV is at TOP LEVEL of sleep_data, not in dailySleepDTO
                hrv_value = (
                    sleep_data.get("avgOvernightHrv") or
                    daily_sleep.get("avgOvernightHrv")
                )
                
                # Resting HR is at TOP LEVEL of sleep_data, not in dailySleepDTO  
                resting_hr_value = (
                    sleep_data.get("restingHeartRate") or
                    daily_sleep.get("restingHeartRate")
                )
                
                # Check if this is an update or new record
                existing = execute_query(
                    "SELECT id FROM sleep WHERE date = ?",
                    (date_str,)
                )
                is_update = bool(existing)
                
                execute_write(
                    """INSERT OR REPLACE INTO sleep 
                       (date, sleep_score, total_sleep_seconds, deep_sleep_seconds,
                        light_sleep_seconds, rem_sleep_seconds, awake_seconds,
                        hrv_average, resting_hr, raw_json)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        date_str,
                        daily_sleep.get("sleepScores", {}).get("overall", {}).get("value") if isinstance(daily_sleep.get("sleepScores"), dict) else daily_sleep.get("sleepScore"),
                        daily_sleep.get("sleepTimeSeconds"),
                        daily_sleep.get("deepSleepSeconds"),
                        daily_sleep.get("lightSleepSeconds"),
                        daily_sleep.get("remSleepSeconds"),
                        daily_sleep.get("awakeSleepSeconds"),
                        hrv_value,
                        resting_hr_value,
                        json.dumps(sleep_data)
                    )
                )
                synced += 1
                if is_update:
                    logger.debug(f"Updated existing sleep record for {date_str}")
                
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
            
            try:
                daily_data = self._garmin.fetch_daily_summary(date_str)
                if not daily_data:
                    # Log only occasionally to avoid spam
                    if i % 7 == 0:  # Log every 7 days
                        logger.debug(f"No daily data available for {date_str}")
                    continue
                
                # Helper function to safely get nested values
                def get_nested(data, *keys, default=None):
                    """Get value from nested dict using multiple keys."""
                    for key in keys:
                        if isinstance(data, dict):
                            data = data.get(key)
                        else:
                            return default
                        if data is None:
                            return default
                    return data if data is not None else default
                
                # Extract values - Garmin API has these fields at top level
                body_battery = daily_data.get("bodyBattery") or daily_data.get("bodyBatteryDTO") or {}
                intensity = daily_data.get("intensity") or daily_data.get("intensityMinutes") or {}
                
                # Check if this is an update or new record
                existing = execute_query(
                    "SELECT id FROM dailies WHERE date = ?",
                    (date_str,)
                )
                is_update = bool(existing)
                
                execute_write(
                    """INSERT OR REPLACE INTO dailies 
                       (date, steps, distance_meters,
                        active_calories, calories_total, calories_bmr,
                        body_battery_high, body_battery_low, body_battery_charged, body_battery_drained,
                        stress_average, stress_high, low_stress_duration, medium_stress_duration, high_stress_duration,
                        rest_stress_duration, activity_stress_duration,
                        intensity_minutes_moderate, intensity_minutes_vigorous, intensity_minutes_goal,
                        avg_heart_rate, max_heart_rate, min_heart_rate, resting_heart_rate,
                        raw_json)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        date_str,
                        daily_data.get("totalSteps") or daily_data.get("steps"),
                        daily_data.get("totalDistanceMeters") or daily_data.get("distanceMeters"),
                        daily_data.get("activeKilocalories") or daily_data.get("activeCalories"),
                        daily_data.get("totalKilocalories") or daily_data.get("totalCalories"),
                        daily_data.get("bmrKilocalories") or daily_data.get("bmrCalories"),
                        daily_data.get("bodyBatteryHighestValue") or get_nested(body_battery, "highestValue") or get_nested(body_battery, "high"),
                        daily_data.get("bodyBatteryLowestValue") or get_nested(body_battery, "lowestValue") or get_nested(body_battery, "low"),
                        daily_data.get("bodyBatteryChargedValue") or get_nested(body_battery, "chargedValue") or get_nested(body_battery, "charged"),
                        daily_data.get("bodyBatteryDrainedValue") or get_nested(body_battery, "drainedValue") or get_nested(body_battery, "drained"),
                        daily_data.get("averageStressLevel"),  # Stored as stress_average
                        daily_data.get("maxStressLevel"),  # Stored as stress_high
                        daily_data.get("lowStressDuration"),  # Stored as low_stress_duration
                        daily_data.get("mediumStressDuration"),  # Stored as medium_stress_duration
                        daily_data.get("highStressDuration"),  # Stored as high_stress_duration
                        daily_data.get("restStressDuration"),
                        daily_data.get("activityStressDuration"),
                        daily_data.get("moderateIntensityMinutes") or get_nested(intensity, "moderateIntensityMinutes") or get_nested(intensity, "moderate") or daily_data.get("moderateMinutes"),
                        daily_data.get("vigorousIntensityMinutes") or get_nested(intensity, "vigorousIntensityMinutes") or get_nested(intensity, "vigorous") or daily_data.get("vigorousMinutes"),
                        daily_data.get("intensityMinutesGoal") or get_nested(intensity, "goal") or daily_data.get("intensityGoal"),
                        # averageHeartRate doesn't exist in Garmin API - calculate from min/max if both exist
                        (int((daily_data.get("minAvgHeartRate") + daily_data.get("maxAvgHeartRate")) / 2) if daily_data.get("minAvgHeartRate") is not None and daily_data.get("maxAvgHeartRate") is not None else None),
                        daily_data.get("maxHeartRate"),
                        daily_data.get("minHeartRate"),
                        daily_data.get("restingHeartRate"),
                        json.dumps(daily_data)
                    )
                )
                synced += 1
                if is_update:
                    logger.debug(f"Updated existing daily record for {date_str}")
                
            except Exception as e:
                logger.warning(f"Failed to sync dailies for {date_str}: {e}")
        
        logger.info(f"Synced {synced} days of daily data")
        return synced
    
    def backfill_wellness_fields(self, days_back: int = 30) -> dict:
        """
        Backfill missing wellness fields (avg_heart_rate, hrv_average, resting_hr, stress durations)
        from raw_json for existing records.
        
        Returns:
            Dict with counts of updated records
        """
        today = datetime.now().date()
        updated_dailies = 0
        updated_sleep = 0
        
        # Helper function to safely get nested values
        def get_nested(data, *keys, default=None):
            """Get value from nested dict using multiple keys."""
            for key in keys:
                if isinstance(data, dict):
                    data = data.get(key)
                else:
                    return default
                if data is None:
                    return default
            return data if data is not None else default
        
        # Backfill daily data
        for i in range(days_back):
            date = today - timedelta(days=i)
            date_str = date.isoformat()
            
            # Get existing daily record with missing fields
            dailies = execute_query(
                """SELECT id, raw_json, low_stress_duration, medium_stress_duration, high_stress_duration, avg_heart_rate 
                   FROM dailies 
                   WHERE date = ? AND (low_stress_duration IS NULL OR medium_stress_duration IS NULL OR high_stress_duration IS NULL OR avg_heart_rate IS NULL)""",
                (date_str,)
            )
            
            for daily in dailies:
                if not daily.get("raw_json"):
                    continue
                
                try:
                    daily_data = json.loads(daily["raw_json"])
                    
                    # Extract values with fallbacks
                    stress = daily_data.get("stress") or daily_data.get("stressDTO") or {}
                    stress_levels = stress.get("stressLevelsDTO") if isinstance(stress, dict) else {}
                    heart_rate = daily_data.get("heartRate") or daily_data.get("heartRateDTO") or {}
                    hr_values = heart_rate.get("heartRateValues") if isinstance(heart_rate, dict) else []
                    
                    # Extract missing fields - use actual field names from Garmin API
                    low_stress_duration = daily_data.get("lowStressDuration")
                    medium_stress_duration = daily_data.get("mediumStressDuration")
                    high_stress_duration = daily_data.get("highStressDuration")
                    
                    # averageHeartRate doesn't exist - calculate from min/max if both exist
                    avg_heart_rate = None
                    min_avg_hr = daily_data.get("minAvgHeartRate")
                    max_avg_hr = daily_data.get("maxAvgHeartRate")
                    if min_avg_hr is not None and max_avg_hr is not None:
                        avg_heart_rate = (min_avg_hr + max_avg_hr) / 2
                    
                    # Update only if we found a value and the current value is NULL
                    updates = []
                    params = []
                    
                    if low_stress_duration is not None and daily.get("low_stress_duration") is None:
                        updates.append("low_stress_duration = ?")
                        params.append(low_stress_duration)
                    
                    if medium_stress_duration is not None and daily.get("medium_stress_duration") is None:
                        updates.append("medium_stress_duration = ?")
                        params.append(medium_stress_duration)
                    
                    if high_stress_duration is not None and daily.get("high_stress_duration") is None:
                        updates.append("high_stress_duration = ?")
                        params.append(high_stress_duration)
                    
                    if avg_heart_rate is not None and daily.get("avg_heart_rate") is None:
                        updates.append("avg_heart_rate = ?")
                        params.append(avg_heart_rate)
                    
                    if updates:
                        params.append(daily["id"])
                        execute_write(
                            f"UPDATE dailies SET {', '.join(updates)} WHERE id = ?",
                            tuple(params)
                        )
                        updated_dailies += 1
                        logger.debug(f"Updated daily {date_str}: {', '.join(updates)}")
                        
                except Exception as e:
                    logger.warning(f"Failed to backfill daily {date_str}: {e}")
            
            # Get existing sleep record with missing fields
            sleep_records = execute_query(
                """SELECT id, raw_json, hrv_average, resting_hr 
                   FROM sleep 
                   WHERE date = ? AND (hrv_average IS NULL OR resting_hr IS NULL)""",
                (date_str,)
            )
            
            for sleep in sleep_records:
                if not sleep.get("raw_json"):
                    continue
                
                try:
                    sleep_data = json.loads(sleep["raw_json"])
                    daily_sleep = sleep_data.get("dailySleepDTO", {}) or sleep_data.get("sleepData", {})
                    
                    # HRV is at TOP LEVEL of sleep_data, not in dailySleepDTO
                    hrv_value = sleep_data.get("avgOvernightHrv") or daily_sleep.get("avgOvernightHrv")
                    
                    # Resting HR is at TOP LEVEL of sleep_data, not in dailySleepDTO
                    resting_hr_value = sleep_data.get("restingHeartRate") or daily_sleep.get("restingHeartRate")
                    
                    # Update only if we found a value and the current value is NULL
                    updates = []
                    params = []
                    
                    if hrv_value is not None and sleep.get("hrv_average") is None:
                        updates.append("hrv_average = ?")
                        params.append(hrv_value)
                    
                    if resting_hr_value is not None and sleep.get("resting_hr") is None:
                        updates.append("resting_hr = ?")
                        params.append(resting_hr_value)
                    
                    if updates:
                        params.append(sleep["id"])
                        execute_write(
                            f"UPDATE sleep SET {', '.join(updates)} WHERE id = ?",
                            tuple(params)
                        )
                        updated_sleep += 1
                        logger.debug(f"Updated sleep {date_str}: {', '.join(updates)}")
                        
                except Exception as e:
                    logger.warning(f"Failed to backfill sleep {date_str}: {e}")
        
        logger.info(f"Backfill complete: {updated_dailies} daily records, {updated_sleep} sleep records updated")
        return {
            "daily_updated": updated_dailies,
            "sleep_updated": updated_sleep
        }


def get_sync_service() -> SyncService:
    """Get a sync service instance."""
    return SyncService()

