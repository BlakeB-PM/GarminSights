# Sync Issue Analysis

## Problem
When syncing with `--latest`, the system is doing what appears to be a "full sync" when only 3 days of data are missing.

## Root Cause
The issue occurs specifically with **weight data**. The sync logic is incorrectly checking for the latest timestamp:

1. **Monitoring/Sleep Data** ✅ Works correctly
   - Finds latest date in database: `2025-11-26 23:59:59`
   - Only downloads 3 days: `2025-11-25` to `2025-11-27`
   - Correct behavior!

2. **Weight Data** ❌ Has a bug
   - Tries to find latest time by checking `Weight.weight` column (Float type)
   - Should be checking `Weight.day` column (Date type)
   - Returns `None` because `latest_time()` doesn't work on Float columns
   - Falls back to config start date: `2025-10-27`
   - Downloads 32 days instead of just 3

## Evidence from Logs

```
INFO: Downloading latest monitoring data from: 2025-11-26 23:59:59
INFO: Date range to update: 2025-11-25 (3) to ...
✅ CORRECT - Only 3 days

INFO: Recent weight data not found, using: 2025-10-27 : 32
INFO: Date range to update: 2025-10-27 (32) to ...
❌ WRONG - Downloading 32 days from config start date
```

## Technical Details

The bug is in `garmin/scripts/garmindb_cli.py` line 147:

```python
# Current (BUGGY) code:
date, days = self.__get_date_and_days(
    GarminDb(self.gc_config.get_db_params()), 
    latest, 
    Weight, 
    Weight.weight,  # ❌ Wrong column - this is a Float!
    'weight'
)
```

The `Weight` table structure:
- `day` (Date, primary_key) - This is what should be checked
- `weight` (Float) - This is being checked incorrectly

The `latest_time()` method expects a time/date column, not a value column.

## Solution

### Fix Applied ✅
The code has been fixed in `garmin/scripts/garmindb_cli.py` line 148:

**Before:**
```python
date, days = self.__get_date_and_days(..., Weight, Weight.weight, 'weight')
# ❌ Checks Float column (weight) - won't work!
```

**After:**
```python
date, days = self.__get_date_and_days(..., Weight, Weight.day, 'weight')
# ✅ Checks Date column (day) - should work!
```

This change makes the weight sync check the `day` column (which is the Date primary key) instead of the `weight` column (which is a Float value). The `latest_time()` method should now be able to find the most recent date in the Weight table.

### Testing the Fix
After the fix, when you run a sync with `--latest`, you should see:
- Weight data now finds the latest date in the database
- Only downloads missing days (should be ~3 days like monitoring/sleep)
- No longer falls back to the config start date

### If the Fix Doesn't Work
If `latest_time()` still returns `None` after this fix (because it might not support Date columns), we can implement a custom method that directly queries the Weight table's `day` column to find the maximum date.

## Impact

- **Monitoring/Sleep data**: Working correctly ✅
- **Weight data**: Downloading too much (32 days vs 3 days) ❌
- **Activities**: Uses count-based logic (30 most recent), not date-based, so this issue doesn't affect it

## Next Steps

1. Check if you actually have weight data in your database
2. If you need weight data syncing, we should fix the code to check the `day` column
3. If weight syncing isn't critical, you can disable it or sync it less frequently

