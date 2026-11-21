"""Data synchronization service for Garmin data."""

import json
import logging
from app.services import observations
from datetime import datetime, timedelta
from typing import Optional

from app.database import execute_query, execute_write, get_db
from app.services.garmin_service import (
    GarminAuthError,
    GarminService,
    get_garmin_service,
)
from app.models.schemas import SyncStatus

logger = logging.getLogger(__name__)


def first_present(*values):
    return next((v for v in values if v is not None), None)


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
        
        # Load the saved session if this process hasn't yet. Only the REST
        # routes used to do this (as a side effect of their check_session
        # gate), so an MCP-driven sync on a cold process failed even with valid
        # tokens sitting on disk.
        ready, auth_error = self._garmin.ensure_client()
        if not ready:
            logger.error("Sync aborted, no Garmin session: %s", auth_error)
            status.error = auth_error
            status.details = {
                "auth_check": "failed",
                "auth_required": True,
                "username": self._garmin._username,
            }
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
                status.warnings.append("Garmin returned no activities in this window.")
            
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
            
            end = datetime.now().date()
            # Restore a historical day each run. The old sets envelope is
            # already archived by migration 5. A failed repair remains due.
            pending = execute_query("""SELECT date(a.start_time) day FROM activities a
                LEFT JOIN garmin_fetches f ON f.source='summary_repair' AND f.record_key=date(a.start_time)
                WHERE (f.checked_at IS NULL OR f.checked_at<datetime('now','-1 day')) AND json_valid(raw_json) AND json_type(raw_json,'$.exerciseSets')='array'
                ORDER BY start_time DESC LIMIT 1""")
            if pending and pending[0]["day"]:
                repair_day = datetime.fromisoformat(pending[0]["day"]).date()
                restored, _ = self.refresh_activities(repair_day, repair_day)
                with get_db() as conn, conn:
                    observations.mark(conn, "summary_repair", repair_day.isoformat(), repair_day.isoformat(),
                                      "saved" if restored else "empty")
            extra = observations.collect(self._garmin, end - timedelta(days=days_back-1), end, 32)
            status.details["observations"] = extra
            first_day = execute_query("""SELECT min(day) day FROM (
                SELECT min(date(start_time)) day FROM activities UNION ALL
                SELECT min(date) FROM sleep WHERE total_sleep_seconds>0 UNION ALL
                SELECT min(date) FROM dailies WHERE steps IS NOT NULL)""")[0]["day"]
            history_end = end - timedelta(days=min(days_back, 3))
            if first_day and first_day <= history_end.isoformat() and not extra.get("rate_limited"):
                status.details["historical_observations"] = observations.collect(
                    self._garmin, max(datetime.fromisoformat(first_day).date(), history_end-timedelta(days=3659)),
                    history_end, 8, oldest_first=True)

            if extra["errors"] or status.details.get("historical_observations", {}).get("errors"):
                status.warnings.append("Some additional Garmin requests failed. See Garmin data coverage.")
            status.success = True
            logger.info(f"Full sync complete: {status.activities_synced} activities, {status.sleep_days_synced} sleep days, {status.dailies_synced} daily records")
            
        except GarminAuthError as e:
            logger.error(f"Sync aborted, Garmin rejected the session: {e}")
            status.error = str(e)
            status.details["auth_check"] = "rejected"
            status.details["auth_required"] = True
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
        end = datetime.now().date()
        return self.refresh_activities(end - timedelta(days=days_back - 1), end)

    def refresh_window(self, start, end):
        if end < start or end > datetime.now().date() or (end-start).days > 30:
            raise ValueError("Choose up to 31 days ending today or earlier")
        activities, sets = self.refresh_activities(start, end)
        return {"activities": activities, "sets": sets}

    def refresh_activities(self, start, end):
        activities = self._garmin.fetch_activity_range(start.isoformat(), end.isoformat())
        sets_count = 0
        for activity in activities:
            if not activity.get("activityId") or not activity.get("startTimeLocal"):
                raise ValueError("Garmin activity is missing an ID or local timestamp")
            key = str(activity["activityId"])
            stamp = activity["startTimeLocal"]
            kind = activity.get("activityType", {}).get("typeKey", "unknown")
            with get_db() as conn, conn:
                row = conn.execute("""
                    INSERT INTO activities(garmin_id,activity_type,name,start_time,duration_seconds,
                                           distance_meters,calories,raw_json) VALUES(?,?,?,?,?,?,?,?)
                    ON CONFLICT(garmin_id) DO UPDATE SET activity_type=excluded.activity_type,
                        name=excluded.name,start_time=excluded.start_time,duration_seconds=excluded.duration_seconds,
                        distance_meters=excluded.distance_meters,calories=excluded.calories,raw_json=excluded.raw_json
                    RETURNING id
                """, (key, kind, activity.get("activityName"), stamp, activity.get("duration"),
                      activity.get("distance"), activity.get("calories"), json.dumps(activity))).fetchone()
                observations.index_metrics(conn, "summary", key, stamp[:10], activity)
                observations.mark(conn, "summary", key, stamp[:10], "saved")
            if kind == "strength_training":
                sets_count += self._deep_fetch_strength(row["id"], key)
        return len(activities), sets_count

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
            
            exercise_sets = exercise_data.get("exerciseSets")
            if not isinstance(exercise_sets, list):
                raise ValueError("Missing exerciseSets collection")
            rows = []
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
                
                rows.append(
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
            
            with get_db() as conn, conn:
                day = conn.execute("SELECT date(start_time) day FROM activities WHERE id=?", (activity_id,)).fetchone()["day"]
                observations.save_payload(conn, "sets", garmin_id, day, exercise_data)
                observations.mark(conn, "sets", garmin_id, day, "saved")
                conn.execute("DELETE FROM strength_sets WHERE activity_id=?", (activity_id,))
                conn.executemany("""INSERT INTO strength_sets(activity_id,exercise_name,set_number,reps,
                    weight_lbs,duration_seconds,raw_json) VALUES(?,?,?,?,?,?,?)""", rows)
            if sets_inserted > 0:
                logger.info(f"Extracted {sets_inserted} sets from activity {garmin_id}")
            return sets_inserted
            
        except GarminAuthError:
            raise
        except Exception as e:
            logger.error(f"Deep fetch failed for {garmin_id}: {e}", exc_info=True)
            raise
    
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
                    with get_db() as conn, conn:
                        observations.mark(conn, "sleep", date_str, date_str, "empty")
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
                    "SELECT id,total_sleep_seconds FROM sleep WHERE date = ?",
                    (date_str,)
                )
                if existing and existing[0]["total_sleep_seconds"] and not daily_sleep.get("sleepTimeSeconds"):
                    with get_db() as conn, conn:
                        observations.mark(conn, "sleep", date_str, date_str, "empty")
                    continue
                is_update = bool(existing)
                
                with get_db() as conn, conn:
                    conn.execute(
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
                    observations.index_metrics(conn, "sleep", date_str, date_str, sleep_data)
                    observations.mark(conn, "sleep", date_str, date_str, "saved")
                synced += 1
                if is_update:
                    logger.debug(f"Updated existing sleep record for {date_str}")
                
            except GarminAuthError:
                raise
            except Exception as e:
                with get_db() as conn, conn:
                    observations.mark(conn, "sleep", date_str, date_str, "error")
                raise
        
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
                    with get_db() as conn, conn:
                        observations.mark(conn, "daily", date_str, date_str, "empty")
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
                    "SELECT id,steps,resting_heart_rate FROM dailies WHERE date = ?",
                    (date_str,)
                )
                if (existing and (existing[0]["steps"] is not None or existing[0]["resting_heart_rate"] is not None)
                        and all(daily_data.get(k) is None for k in ("totalSteps", "steps", "restingHeartRate"))):
                    with get_db() as conn, conn:
                        observations.mark(conn, "daily", date_str, date_str, "empty")
                    continue
                is_update = bool(existing)
                
                with get_db() as conn, conn:
                    conn.execute(
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
                            first_present(daily_data.get("totalSteps"), daily_data.get("steps")),
                            first_present(daily_data.get("totalDistanceMeters"), daily_data.get("distanceMeters")),
                            first_present(daily_data.get("activeKilocalories"), daily_data.get("activeCalories")),
                            first_present(daily_data.get("totalKilocalories"), daily_data.get("totalCalories")),
                            first_present(daily_data.get("bmrKilocalories"), daily_data.get("bmrCalories")),
                            first_present(daily_data.get("bodyBatteryHighestValue"), get_nested(body_battery, "highestValue"), get_nested(body_battery, "high")),
                            first_present(daily_data.get("bodyBatteryLowestValue"), get_nested(body_battery, "lowestValue"), get_nested(body_battery, "low")),
                            first_present(daily_data.get("bodyBatteryChargedValue"), get_nested(body_battery, "chargedValue"), get_nested(body_battery, "charged")),
                            first_present(daily_data.get("bodyBatteryDrainedValue"), get_nested(body_battery, "drainedValue"), get_nested(body_battery, "drained")),
                            daily_data.get("averageStressLevel"),  # Stored as stress_average
                            daily_data.get("maxStressLevel"),  # Stored as stress_high
                            daily_data.get("lowStressDuration"),  # Stored as low_stress_duration
                            daily_data.get("mediumStressDuration"),  # Stored as medium_stress_duration
                            daily_data.get("highStressDuration"),  # Stored as high_stress_duration
                            daily_data.get("restStressDuration"),
                            daily_data.get("activityStressDuration"),
                            first_present(daily_data.get("moderateIntensityMinutes"), get_nested(intensity, "moderateIntensityMinutes"), get_nested(intensity, "moderate"), daily_data.get("moderateMinutes")),
                            first_present(daily_data.get("vigorousIntensityMinutes"), get_nested(intensity, "vigorousIntensityMinutes"), get_nested(intensity, "vigorous"), daily_data.get("vigorousMinutes")),
                            first_present(daily_data.get("intensityMinutesGoal"), get_nested(intensity, "goal"), daily_data.get("intensityGoal")),
                            None,  # No measured daily average in this payload.
                            daily_data.get("maxHeartRate"),
                            daily_data.get("minHeartRate"),
                            daily_data.get("restingHeartRate"),
                            json.dumps(daily_data)
                        )
                    )
                    observations.index_metrics(conn, "daily", date_str, date_str, daily_data)
                    observations.update_observed_hr(conn, date_str)
                    observations.mark(conn, "daily", date_str, date_str, "saved")
                synced += 1
                if is_update:
                    logger.debug(f"Updated existing daily record for {date_str}")
                
            except GarminAuthError:
                raise
            except Exception as e:
                with get_db() as conn, conn:
                    observations.mark(conn, "daily", date_str, date_str, "error")
                raise
        
        logger.info(f"Synced {synced} days of daily data")
        return synced
    
    def backfill_wellness_fields(self, days_back: int = 30) -> dict:
        """
        Backfill missing overnight HRV, resting HR, and stress durations
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
                """SELECT id, raw_json, low_stress_duration, medium_stress_duration, high_stress_duration
                   FROM dailies 
                   WHERE date = ? AND (low_stress_duration IS NULL OR medium_stress_duration IS NULL OR high_stress_duration IS NULL )""",
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

