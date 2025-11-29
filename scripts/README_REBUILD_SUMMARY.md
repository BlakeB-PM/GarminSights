# Rebuild Summary Data for Historical Dates

## Problem
The `days_summary` table is missing most data fields (sleep, RHR, calories, etc.) for dates before 11/23/2025. This happened because the summary table was rebuilt around that date and only properly populated data from 11/23 onwards.

## Solution
Run the rebuild script to recalculate summary statistics for all dates before 11/23/2025.

## Usage

### Option 1: Rebuild all dates before 11/23/2025 (Recommended)
```bash
cd Projects/GarminSights/garmin
python ../scripts/rebuild_summary_before_date.py
```

### Option 2: Rebuild with a different cutoff date
```bash
cd Projects/GarminSights/garmin
python ../scripts/rebuild_summary_before_date.py --cutoff-date 2025-11-20
```

### Option 3: Only fill in missing data (don't overwrite existing)
```bash
cd Projects/GarminSights/garmin
python ../scripts/rebuild_summary_before_date.py --no-overwrite
```

## What the script does
1. Finds all years that have monitoring, activity, or sleep data
2. For each year, finds all days with data
3. Filters to only dates before the cutoff date
4. For each day, recalculates:
   - Heart rate intensity data
   - Sleep summaries (from sleep events)
   - Daily statistics (steps, sleep, stress, RHR, calories, etc.)
5. Updates the `days_summary` table in both `garmin_summary.db` and `garmin.db`

## Alternative: Full Rebuild
If you want to rebuild ALL summary data (not just before a date), you can run:
```bash
cd Projects/GarminSights/garmin
python scripts/garmindb_cli.py --analyze
```

This will rebuild all summary tables for all dates, but takes longer.

## Verification
After running the script, check the data:
```bash
cd Projects/GarminSights
python check_data_before_1123.py
```

You should see that data before 11/23 now has sleep, RHR, and other fields populated.

