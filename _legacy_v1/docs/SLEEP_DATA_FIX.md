# Sleep Data Fix for Midnight-Spanning Sleep Sessions

## Problem
Sleep data was incorrect for sleep sessions that span midnight. For example:
- 11/27 showed 5:38 hours but should be 6:34 hours
- Days from 11/22 onwards showed 0 hours of sleep

## Root Cause
When sleep spans midnight (e.g., starts on 11/26 at 11:34 PM and ends on 11/27 at 5:55 AM), the sleep events from the previous day (11/26) were not being included when calculating sleep for the current day (11/27).

The `SleepEvents.get_level_time()` method only looked at events within a single day (00:00 to 23:59), missing events from the previous day that are part of the same sleep session.

## Solution
Updated two methods to handle sleep sessions that span midnight:

1. **`SleepEvents.get_level_time()`** - Now looks back up to 12 hours to find sleep events from the previous day that are part of a continuous sleep session ending on the current day.

2. **`Analyze.__populate_sleep_for_day()`** - Updated to find the actual start of sleep sessions that may have begun on the previous day.

## How to Apply the Fix

### Option 1: Re-run Analyze (Recommended)
Re-run the analyze step to recalculate all sleep data:

```bash
cd Projects/GarminSights/garmin
# Activate your virtual environment first
python scripts/garmindb_cli.py --analyze
```

This will recalculate all sleep data using the updated logic.

### Option 2: Use the Fix Script
A dedicated script is available to fix sleep data:

```bash
cd Projects/GarminSights
python scripts/fix_sleep_data.py
```

This script will:
- Recalculate sleep from sleep_events for all affected days
- Update the sleep table with correct values
- Recalculate the days_summary table

### Option 3: Fix Specific Year
To fix a specific year:

```bash
python scripts/fix_sleep_data.py --year 2025
```

## Verification

After running the fix, verify the data:

1. Check the sleep table:
   ```sql
   SELECT day, total_sleep, start, end 
   FROM sleep 
   WHERE day >= '2024-11-22' 
   ORDER BY day DESC;
   ```

2. Check the days_summary table:
   ```sql
   SELECT day, sleep_avg 
   FROM days_summary 
   WHERE day >= '2024-11-22' 
   ORDER BY day DESC;
   ```

3. Verify 11/27 shows 6:34 hours (or close to it) instead of 5:38 hours.

## Technical Details

### Changes Made

1. **`garmin/garmindb/garmindb/garmin_db.py`**:
   - Updated `SleepEvents.get_level_time()` to look back 12 hours for sleep events from the previous day when early morning events (before 6 AM) are detected.

2. **`garmin/garmindb/analyze.py`**:
   - Updated `__populate_sleep_for_day()` to find the actual start of sleep sessions that may have begun on the previous day.

### How It Works

1. When calculating sleep for a day, the system first gets all sleep events within that day (00:00 to 23:59).

2. If there are early morning events (before 6 AM), it looks back up to 12 hours to find the start of the sleep session.

3. Sleep events from the previous day that are part of the same continuous sleep session are included in the calculation.

4. The total sleep time is recalculated from all relevant events, giving the correct total.

## Notes

- The fix only affects sleep sessions that span midnight. Regular sleep sessions are unaffected.
- The 12-hour lookback window should be sufficient for most sleep patterns, but can be adjusted if needed.
- After applying the fix, you may need to refresh your GarminSights app to see the updated data.

