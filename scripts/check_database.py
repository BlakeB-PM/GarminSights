#!/usr/bin/env python3
"""
Check and validate GarminDB database and derived tables.

This script helps verify that:
1. The GarminDB database exists and is accessible
2. Derived tables are present and have data
3. Data quality checks pass

Usage:
    python scripts/check_database.py [--db-path PATH]
"""

import argparse
import sqlite3
import sys
from pathlib import Path

def check_database(db_path):
    """Check if database exists and is accessible."""
    db_file = Path(db_path)
    
    if not db_file.exists():
        print(f"[X] Database not found at: {db_path}")
        return False
    
    try:
        conn = sqlite3.connect(str(db_file))
        cursor = conn.cursor()
        
        # Check database integrity
        cursor.execute("PRAGMA integrity_check")
        result = cursor.fetchone()
        if result[0] != 'ok':
            print(f"[X] Database integrity check failed: {result[0]}")
            conn.close()
            return False
        
        print(f"[OK] Database exists and is valid: {db_path}")
        conn.close()
        return True
    
    except sqlite3.Error as e:
        print(f"[X] Error accessing database: {e}")
        return False


def check_table_exists(db_path, table_name):
    """Check if a table exists in the database."""
    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name=?
        """, (table_name,))
        
        exists = cursor.fetchone() is not None
        conn.close()
        return exists
    
    except sqlite3.Error:
        return False


def check_table_data(db_path, table_name):
    """Check if a table has data and return row count."""
    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()
        
        cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
        count = cursor.fetchone()[0]
        
        conn.close()
        return count
    
    except sqlite3.Error as e:
        print(f"  [!] Error checking {table_name}: {e}")
        return 0


def check_activities_table(db_path):
    """Check the base activities table."""
    print("\n[DB] Checking base activities table...")
    
    if not check_table_exists(db_path, 'activities'):
        print("  [X] 'activities' table does not exist")
        print("     → Run GarminDB CLI to export data first")
        return False
    
    count = check_table_data(db_path, 'activities')
    print(f"  [OK] Found {count} activities")
    
    # Check for strength training activities
    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT COUNT(*) FROM activities 
            WHERE sport = 'strength_training' OR sub_sport = 'strength_training'
        """)
        strength_count = cursor.fetchone()[0]
        
        print(f"  [*] Found {strength_count} strength training activities")
        conn.close()
        
        return True
    
    except sqlite3.Error as e:
        print(f"  [!] Error querying activities: {e}")
        return False


def check_derived_tables(db_path):
    """Check all derived fact tables."""
    print("\n[Tables] Checking derived tables...")
    
    tables = [
        'fact_exercise_weekly',
        'fact_muscle_group_weekly',
        'fact_workout_type_weekly'
    ]
    
    all_exist = True
    for table in tables:
        exists = check_table_exists(db_path, table)
        if exists:
            count = check_table_data(db_path, table)
            print(f"  [OK] {table}: {count} rows")
        else:
            print(f"  [X] {table}: does not exist")
            print(f"     → Run scripts/build_derived_tables.py to create it")
            all_exist = False
    
    return all_exist


def check_data_quality(db_path):
    """Run basic data quality checks."""
    print("\n[Quality] Running data quality checks...")
    
    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()
        
        # Check for exercises with unknown muscle groups
        if check_table_exists(db_path, 'fact_exercise_weekly'):
            cursor.execute("""
                SELECT COUNT(DISTINCT exercise_name) 
                FROM fact_exercise_weekly 
                WHERE muscle_group = 'unknown'
            """)
            unknown_count = cursor.fetchone()[0]
            
            if unknown_count > 0:
                print(f"  [!] {unknown_count} exercises mapped to 'unknown' muscle group")
                print(f"     → Consider adding them to data/exercise_muscles.csv")
                
                cursor.execute("""
                    SELECT DISTINCT exercise_name 
                    FROM fact_exercise_weekly 
                    WHERE muscle_group = 'unknown'
                    LIMIT 10
                """)
                exercises = [row[0] for row in cursor.fetchall()]
                print(f"     Examples: {', '.join(exercises)}")
            else:
                print("  [OK] All exercises have muscle group mappings")
        
        # Check for recent data
        if check_table_exists(db_path, 'fact_exercise_weekly'):
            cursor.execute("""
                SELECT MAX(week_start_date) 
                FROM fact_exercise_weekly
            """)
            latest_week = cursor.fetchone()[0]
            if latest_week:
                print(f"  [Date] Latest data week: {latest_week}")
        
        conn.close()
        return True
    
    except sqlite3.Error as e:
        print(f"  [!] Error running quality checks: {e}")
        return False


def find_garmindb_database():
    """Find GarminDB database in default location or project location."""
    import os
    
    # Default GarminDB location: ~/HealthData/DBs/
    homedir = os.path.expanduser('~')
    default_db_dir = os.path.join(homedir, 'HealthData', 'DBs')
    default_db_path = os.path.join(default_db_dir, 'garmin_activities.db')
    
    # Project location
    project_root = Path(__file__).parent.parent
    project_db_path = project_root / 'garmin' / 'garmin_activities.db'
    
    # Check both locations
    if os.path.exists(default_db_path):
        return default_db_path
    
    if project_db_path.exists():
        return str(project_db_path)
    
    # Return project path as default (will fail gracefully if doesn't exist)
    return str(project_db_path)


def main():
    parser = argparse.ArgumentParser(description='Check GarminDB database and derived tables')
    parser.add_argument('--db-path', type=str, default=None,
                       help='Path to GarminDB activities database (auto-detected if not provided)')
    
    args = parser.parse_args()
    
    # Resolve path
    if args.db_path:
        db_path = Path(args.db_path)
    else:
        # Auto-detect database location
        detected_path = find_garmindb_database()
        db_path = Path(detected_path)
        if not db_path.exists():
            print(f"[!] Database not found at: {db_path}")
            print(f"[!] Attempting to find database in default GarminDB location...")
            homedir = os.path.expanduser('~')
            default_db_dir = os.path.join(homedir, 'HealthData', 'DBs')
            if os.path.exists(default_db_dir):
                import glob
                db_files = glob.glob(os.path.join(default_db_dir, '*activities*.db'))
                if db_files:
                    db_path = Path(db_files[0])
                    print(f"[!] Found: {db_path}")
    
    print("[CHECK] GarminSights Database Check")
    print("=" * 50)
    
    # Check database
    if not check_database(str(db_path)):
        print("\n[X] Database check failed. Please ensure:")
        print("   1. GarminDB CLI has been run to export data")
        print("   2. Database path is correct")
        print(f"\n   Expected locations:")
        homedir = os.path.expanduser('~')
        print(f"   - Default: {os.path.join(homedir, 'HealthData', 'DBs', 'garmin_activities.db')}")
        print(f"   - Project: {Path(__file__).parent.parent / 'garmin' / 'garmin_activities.db'}")
        sys.exit(1)
    
    # Check activities table
    has_activities = check_activities_table(str(db_path))
    
    # Check derived tables
    has_derived = check_derived_tables(str(db_path))
    
    # Data quality checks
    if has_derived:
        check_data_quality(str(db_path))
    
    # Summary
    print("\n" + "=" * 50)
    if has_activities and has_derived:
        print("[OK] All checks passed! Database is ready.")
    elif has_activities:
        print("[!] Base data exists, but derived tables are missing.")
        print("   → Run: python scripts/build_derived_tables.py")
    else:
        print("[X] Database setup incomplete.")
        print("   → Run GarminDB CLI to export data first")


if __name__ == '__main__':
    main()

