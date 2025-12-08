"""
Script to rebuild days_summary table for dates before a specific date.
This fixes the issue where summary data was only populated from 11/23/2025 onwards.

The simplest approach is to just re-run the analyze process, which will rebuild
all summary tables. However, this script provides a way to target specific dates.
"""

import sys
import os
import datetime
from pathlib import Path

# Add the garmin directory to the path
garmin_dir = Path(__file__).parent.parent / 'garmin'
sys.path.insert(0, str(garmin_dir))

from garmindb import GarminConnectConfigManager
from garmindb.analyze import Analyze
from garmindb.garmindb import Monitoring, SleepEvents, Activities

def rebuild_summary_before_date(cutoff_date_str='2025-11-23', overwrite=True):
    """
    Rebuild days_summary for all dates before the cutoff date.
    
    Args:
        cutoff_date_str: Date string in YYYY-MM-DD format. All dates before this will be rebuilt.
        overwrite: If True, overwrite existing summary data. If False, only fill in missing data.
    """
    cutoff_date = datetime.datetime.strptime(cutoff_date_str, '%Y-%m-%d').date()
    
    print(f"Rebuilding days_summary for dates before {cutoff_date_str}")
    print(f"Overwrite existing data: {overwrite}")
    print("-" * 80)
    
    # Initialize the analyze class
    gc_config = GarminConnectConfigManager()
    analyze = Analyze(gc_config, debug=False)
    
    # Get all years that have data (using the same method as Analyze.summary())
    years_mon = Monitoring.get_years(analyze.garmin_mon_db)
    years_act = Activities.get_years(analyze.garmin_act_db)
    years_sleep = SleepEvents.get_years(analyze.garmin_db)
    years_all = sorted(list(set(years_mon + years_act + years_sleep)))
    
    print(f"Found data in years: {years_all}")
    
    # Process each year
    for year in years_all:
        print(f"\nProcessing year {year}...")
        
        with analyze.garmin_db.managed_session() as garmin_session, \
             analyze.garmin_mon_db.managed_session() as garmin_mon_session, \
             analyze.garmin_act_db.managed_session() as garmin_act_session, \
             analyze.garmin_sum_db.managed_session() as garmin_sum_session, \
             analyze.sum_db.managed_session() as sum_session:
            
            # Get all days with data for this year (using the same method as Analyze.__calculate_days())
            days_mon = Monitoring.s_get_days(garmin_mon_session, year) or []
            days_sleep = SleepEvents.s_get_days(garmin_session, year) or []
            days_all = sorted(set(days_mon) | set(days_sleep))
            
            # Filter to only dates before cutoff
            days_to_process = []
            for day in days_all:
                day_date = datetime.date(year, 1, 1) + datetime.timedelta(day - 1)
                if day_date < cutoff_date:
                    days_to_process.append((day, day_date))
            
            print(f"  Found {len(days_to_process)} days before {cutoff_date_str} in year {year}")
            
            if not days_to_process:
                continue
            
            # Process each day
            for idx, (day, day_date) in enumerate(days_to_process, 1):
                # Check if we should overwrite or skip existing data
                if not overwrite:
                    from garmindb.garmindb.garmin_summary_db import DaysSummary
                    existing = DaysSummary.s_get_day(garmin_sum_session, day_date)
                    if existing and existing.sleep_avg and existing.sleep_avg != '00:00:00.000000':
                        # Skip if data already exists and looks complete
                        continue
                
                # Recalculate stats for this day
                try:
                    analyze._Analyze__populate_hr_intensity(day_date, garmin_mon_session, garmin_sum_session, overwrite=overwrite)
                    analyze._Analyze__populate_sleep_for_day(day_date, garmin_session, overwrite=overwrite)
                    analyze._Analyze__calculate_day_stats(day_date, garmin_session, garmin_mon_session, garmin_act_session, garmin_sum_session, sum_session)
                    
                    if idx % 10 == 0 or idx == len(days_to_process):
                        print(f"    Processed {day_date} ({idx}/{len(days_to_process)})")
                except Exception as e:
                    print(f"    ERROR processing {day_date}: {e}")
                    import traceback
                    traceback.print_exc()
                    continue
    
    print("\n" + "=" * 80)
    print("Rebuild complete!")
    print("=" * 80)

if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Rebuild days_summary for dates before a cutoff date')
    parser.add_argument('--cutoff-date', type=str, default='2025-11-23',
                        help='Cutoff date in YYYY-MM-DD format (default: 2025-11-23)')
    parser.add_argument('--no-overwrite', action='store_true',
                        help='Only fill in missing data, do not overwrite existing')
    
    args = parser.parse_args()
    
    rebuild_summary_before_date(
        cutoff_date_str=args.cutoff_date,
        overwrite=not args.no_overwrite
    )

