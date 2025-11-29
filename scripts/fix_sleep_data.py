"""
Script to fix sleep data that spans midnight.
Recalculates sleep from sleep_events for days where sleep might span midnight.
"""
import sys
import os
import datetime

# Add the garmin directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'garmin'))

from garmindb import GarminDb, Sleep, SleepEvents
from garmindb.garmindb.garmin_summary_db import GarminSummaryDb, DaysSummary
from garmindb.analyze import Analyze
from garmindb.garmin_connect_config_manager import GarminConnectConfigManager

def fix_sleep_data(year=None, overwrite=True):
    """Fix sleep data by recalculating from sleep events."""
    gc_config = GarminConnectConfigManager()
    analyzer = Analyze(gc_config, debug=2)
    
    if year is None:
        # Get the current year
        year = datetime.datetime.now().year
    
    print(f"Recalculating sleep data for year {year}...")
    print("This will fix sleep sessions that span midnight.")
    
    # Recalculate days - this will use the updated get_day_stats method
    with analyzer.garmin_db.managed_session() as garmin_session:
        # Get all days with sleep events
        days_sleep = SleepEvents.s_get_days(garmin_session, year) or []
        
        if not days_sleep:
            print(f"No sleep events found for year {year}")
            return
        
        print(f"Found {len(days_sleep)} days with sleep events")
        
        # For each day, recalculate sleep stats
        for day_num in days_sleep:
            day_date = datetime.date(year, 1, 1) + datetime.timedelta(day_num - 1)
            
            # Recalculate sleep for this day (this will include events from previous day if sleep spans midnight)
            analyzer._Analyze__populate_sleep_for_day(day_date, garmin_session, overwrite=overwrite)
            
            # Get the updated stats
            stats = SleepEvents.get_day_stats(garmin_session, day_date)
            sleep_record = Sleep.s_get_for_day(garmin_session, day_date)
            
            if sleep_record:
                print(f"  {day_date}: {sleep_record.total_sleep} (was recalculated from events)")
            else:
                print(f"  {day_date}: No sleep record found")
    
    # Now recalculate the summary tables
    print("\nRecalculating summary tables...")
    analyzer.summary()
    
    print("\nDone! Sleep data has been recalculated.")

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Fix sleep data that spans midnight')
    parser.add_argument('--year', type=int, help='Year to fix (default: current year)')
    parser.add_argument('--no-overwrite', action='store_true', help='Do not overwrite existing sleep records')
    args = parser.parse_args()
    
    fix_sleep_data(year=args.year, overwrite=not args.no_overwrite)

