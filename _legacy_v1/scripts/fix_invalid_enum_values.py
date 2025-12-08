#!/usr/bin/env python3
"""
Fix invalid enum values in monitoring_info and monitoring tables.

This script removes rows with invalid activity_type enum values (UnknownEnumValue)
that cause SQLAlchemy errors when querying the database.

The specific error addressed: activity_type value 13 (UnknownEnumValue_13)
"""

import sqlite3
import os
import sys
from pathlib import Path

# Add parent directory to path to import garmindb modules
script_dir = Path(__file__).parent
project_root = script_dir.parent
garmin_dir = project_root / 'garmin'
sys.path.insert(0, str(garmin_dir))

from garmindb.garmin_connect_config_manager import GarminConnectConfigManager


def find_monitoring_database():
    """Find the monitoring database path."""
    gc_config = GarminConnectConfigManager()
    db_params = gc_config.get_db_params()
    # db_params should have a path or we can construct it
    if 'db_dir' in db_params:
        db_path = os.path.join(db_params['db_dir'], 'garmin_monitoring.db')
    else:
        # Fallback to default location
        homedir = os.path.expanduser('~')
        db_path = os.path.join(homedir, 'HealthData', 'DBs', 'garmin_monitoring.db')
    return db_path


def check_invalid_enums(db_path):
    """Check for invalid enum values in the database using raw SQL."""
    if not os.path.exists(db_path):
        print(f"Database not found: {db_path}")
        return None
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check monitoring_info table
    print("Checking monitoring_info table...")
    
    # SQLAlchemy stores enum values - check for value 13 directly
    # Also check for string representations containing UnknownEnumValue
    cursor.execute("""
        SELECT timestamp, activity_type 
        FROM monitoring_info 
        WHERE activity_type = 13 
           OR activity_type = '13'
           OR CAST(activity_type AS TEXT) LIKE '%UnknownEnumValue%'
    """)
    invalid_rows_monitoring_info = cursor.fetchall()
    
    invalid_activity_types = []
    if invalid_rows_monitoring_info:
        # Get unique invalid activity_type values
        cursor.execute("""
            SELECT DISTINCT activity_type 
            FROM monitoring_info 
            WHERE activity_type = 13 
               OR activity_type = '13'
               OR CAST(activity_type AS TEXT) LIKE '%UnknownEnumValue%'
        """)
        invalid_activity_types = [row[0] for row in cursor.fetchall()]
        print(f"Found {len(invalid_rows_monitoring_info)} rows with invalid enum values: {invalid_activity_types}")
        
        # Show sample rows
        print("Sample invalid rows:")
        for i, (ts, at) in enumerate(invalid_rows_monitoring_info[:5]):
            print(f"  {i+1}. timestamp={ts}, activity_type={at} (type: {type(at).__name__})")
        if len(invalid_rows_monitoring_info) > 5:
            print(f"  ... and {len(invalid_rows_monitoring_info) - 5} more")
    else:
        print("No invalid enum values found in monitoring_info table.")
    
    # Check monitoring table
    print("\nChecking monitoring table...")
    cursor.execute("""
        SELECT timestamp, activity_type 
        FROM monitoring 
        WHERE activity_type = 13 
           OR activity_type = '13'
           OR CAST(activity_type AS TEXT) LIKE '%UnknownEnumValue%'
    """)
    invalid_rows_monitoring = cursor.fetchall()
    
    invalid_activity_types_monitoring = []
    if invalid_rows_monitoring:
        cursor.execute("""
            SELECT DISTINCT activity_type 
            FROM monitoring 
            WHERE activity_type = 13 
               OR activity_type = '13'
               OR CAST(activity_type AS TEXT) LIKE '%UnknownEnumValue%'
        """)
        invalid_activity_types_monitoring = [row[0] for row in cursor.fetchall()]
        print(f"Found {len(invalid_rows_monitoring)} rows with invalid enum values: {invalid_activity_types_monitoring}")
        
        # Show sample rows
        print("Sample invalid rows:")
        for i, (ts, at) in enumerate(invalid_rows_monitoring[:5]):
            print(f"  {i+1}. timestamp={ts}, activity_type={at} (type: {type(at).__name__})")
        if len(invalid_rows_monitoring) > 5:
            print(f"  ... and {len(invalid_rows_monitoring) - 5} more")
    else:
        print("No invalid enum values found in monitoring table.")
    
    conn.close()
    
    return {
        'monitoring_info': {
            'invalid_types': invalid_activity_types,
            'invalid_rows': invalid_rows_monitoring_info
        },
        'monitoring': {
            'invalid_types': invalid_activity_types_monitoring,
            'invalid_rows': invalid_rows_monitoring
        }
    }


def fix_invalid_enums(db_path, dry_run=True):
    """Remove invalid enum values from the database."""
    if not os.path.exists(db_path):
        print(f"Database not found: {db_path}")
        return
    
    print(f"\n{'[DRY RUN] ' if dry_run else ''}Fixing invalid enum values in {db_path}")
    
    invalid_data = check_invalid_enums(db_path)
    if not invalid_data:
        print("No invalid enum values found!")
        return
    
    if not invalid_data['monitoring_info']['invalid_rows'] and not invalid_data['monitoring']['invalid_rows']:
        print("No invalid rows found to delete!")
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    deleted_count = 0
    
    # Delete from monitoring_info
    if invalid_data['monitoring_info']['invalid_rows']:
        print(f"\n{'Would delete' if dry_run else 'Deleting'} {len(invalid_data['monitoring_info']['invalid_rows'])} rows from monitoring_info...")
        if not dry_run:
            cursor.execute("""
                DELETE FROM monitoring_info 
                WHERE activity_type = 13 
                   OR activity_type = '13'
                   OR CAST(activity_type AS TEXT) LIKE '%UnknownEnumValue%'
            """)
            deleted_count += cursor.rowcount
            print(f"Deleted {cursor.rowcount} rows from monitoring_info")
    
    # Delete from monitoring
    if invalid_data['monitoring']['invalid_rows']:
        print(f"\n{'Would delete' if dry_run else 'Deleting'} {len(invalid_data['monitoring']['invalid_rows'])} rows from monitoring...")
        if not dry_run:
            cursor.execute("""
                DELETE FROM monitoring 
                WHERE activity_type = 13 
                   OR activity_type = '13'
                   OR CAST(activity_type AS TEXT) LIKE '%UnknownEnumValue%'
            """)
            deleted_count += cursor.rowcount
            print(f"Deleted {cursor.rowcount} rows from monitoring")
    
    if not dry_run:
        conn.commit()
        print(f"\nTotal deleted: {deleted_count} rows")
    else:
        total = len(invalid_data['monitoring_info']['invalid_rows']) + len(invalid_data['monitoring']['invalid_rows'])
        print(f"\n[DRY RUN] Would delete {total} rows total")
        print("Run with --fix to actually delete the rows")
    
    conn.close()


def main():
    """Main function."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Fix invalid enum values in monitoring tables')
    parser.add_argument('--fix', action='store_true', help='Actually delete invalid rows (default is dry-run)')
    parser.add_argument('--db-path', help='Path to monitoring database (default: auto-detect)')
    
    args = parser.parse_args()
    
    if args.db_path:
        db_path = args.db_path
    else:
        db_path = find_monitoring_database()
    
    print("="*70)
    print("GarminSights: Fix Invalid Enum Values")
    print("="*70)
    print(f"Database: {db_path}")
    print()
    
    # First check what we have
    invalid_data = check_invalid_enums(db_path)
    
    if not invalid_data or (not invalid_data['monitoring_info']['invalid_rows'] and not invalid_data['monitoring']['invalid_rows']):
        print("\n✓ No invalid enum values found in the database!")
        return
    
    # Then fix if requested
    fix_invalid_enums(db_path, dry_run=not args.fix)
    
    print("\n" + "="*70)
    print("Done!")
    print("="*70)


if __name__ == '__main__':
    main()
