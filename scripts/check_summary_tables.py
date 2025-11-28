#!/usr/bin/env python3
"""
Check for summary tables (days_summary) that are needed for the daily data dashboard.
These tables are created by GarminDB's --analyze flag.
"""

import sqlite3
import os
from pathlib import Path

def find_databases():
    """Find all potential GarminDB database files."""
    databases = []
    
    # Default GarminDB location
    homedir = os.path.expanduser('~')
    default_db_dir = os.path.join(homedir, 'HealthData', 'DBs')
    if os.path.exists(default_db_dir):
        for file in os.listdir(default_db_dir):
            if file.endswith('.db') and 'garmin' in file.lower():
                databases.append(os.path.join(default_db_dir, file))
    
    # Project location
    project_root = Path(__file__).parent.parent
    project_db_dir = project_root / 'garmin'
    if project_db_dir.exists():
        for file in os.listdir(project_db_dir):
            if file.endswith('.db') and 'garmin' in file.lower():
                databases.append(str(project_db_dir / file))
    
    return databases

def check_database(db_path):
    """Check a database for summary tables and data."""
    print(f"\n{'='*60}")
    print(f"Checking: {db_path}")
    print(f"{'='*60}")
    
    if not os.path.exists(db_path):
        print(f"[X] Database file does not exist")
        return False
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get all tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        all_tables = [row[0] for row in cursor.fetchall()]
        print(f"\n[Tables] Found {len(all_tables)} tables:")
        for table in all_tables[:20]:  # Show first 20
            print(f"  - {table}")
        if len(all_tables) > 20:
            print(f"  ... and {len(all_tables) - 20} more")
        
        # Check for summary tables
        summary_tables = ['days_summary', 'daily_summary']
        found_summary = []
        
        for table_name in summary_tables:
            cursor.execute("""
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name=?
            """, (table_name,))
            if cursor.fetchone():
                found_summary.append(table_name)
                
                # Check row count
                cursor.execute(f'SELECT COUNT(*) FROM "{table_name}"')
                count = cursor.fetchone()[0]
                print(f"\n[OK] Found table: {table_name}")
                print(f"     Row count: {count}")
                
                # Check for non-zero data
                if count > 0:
                    # Check a few sample columns
                    cursor.execute(f'PRAGMA table_info("{table_name}")')
                    columns = [col[1] for col in cursor.fetchall()]
                    
                    # Check for steps column
                    if 'steps' in columns:
                        cursor.execute(f'SELECT COUNT(*) FROM "{table_name}" WHERE steps > 0')
                        steps_count = cursor.fetchone()[0]
                        print(f"     Rows with steps > 0: {steps_count}")
                    
                    # Check for intensity_time column
                    if 'intensity_time' in columns:
                        cursor.execute(f'SELECT COUNT(*) FROM "{table_name}" WHERE intensity_time > 0')
                        intensity_count = cursor.fetchone()[0]
                        print(f"     Rows with intensity_time > 0: {intensity_count}")
                    
                    # Show sample row
                    cursor.execute(f'SELECT * FROM "{table_name}" ORDER BY day DESC LIMIT 1')
                    sample = cursor.fetchone()
                    if sample:
                        print(f"\n     Sample row (most recent):")
                        col_names = [col[1] for col in cursor.execute(f'PRAGMA table_info("{table_name}")').fetchall()]
                        for i, (col, val) in enumerate(zip(col_names[:10], sample[:10])):  # Show first 10 columns
                            print(f"       {col}: {val}")
                        if len(col_names) > 10:
                            print(f"       ... and {len(col_names) - 10} more columns")
        
        if not found_summary:
            print(f"\n[X] No summary tables found (looking for: {', '.join(summary_tables)})")
            print(f"    These tables are created by running GarminDB with --analyze flag")
            
            # Check for raw data tables that could be used
            raw_tables = ['monitoring', 'activities', 'sleep_events']
            found_raw = [t for t in raw_tables if t in all_tables]
            if found_raw:
                print(f"\n    However, found raw data tables: {', '.join(found_raw)}")
                for table in found_raw:
                    cursor.execute(f'SELECT COUNT(*) FROM "{table}"')
                    count = cursor.fetchone()[0]
                    print(f"      - {table}: {count} rows")
        
        conn.close()
        return len(found_summary) > 0
        
    except Exception as e:
        print(f"[X] Error checking database: {e}")
        return False

def main():
    print("GarminSights Summary Tables Diagnostic")
    print("="*60)
    print("\nThis script checks for days_summary tables needed by the dashboard.")
    print("These tables are created by GarminDB's --analyze flag.\n")
    
    databases = find_databases()
    
    if not databases:
        print("[X] No GarminDB database files found")
        print("\nExpected locations:")
        homedir = os.path.expanduser('~')
        print(f"  - {os.path.join(homedir, 'HealthData', 'DBs', '*.db')}")
        print(f"  - {Path(__file__).parent.parent / 'garmin' / '*.db'}")
        return
    
    print(f"Found {len(databases)} database file(s) to check\n")
    
    found_summary = False
    for db_path in databases:
        if check_database(db_path):
            found_summary = True
    
    print(f"\n{'='*60}")
    if found_summary:
        print("[OK] Summary tables found! Your dashboard should work.")
    else:
        print("[X] No summary tables found in any database.")
        print("\nTo fix this, run GarminDB with the --analyze flag:")
        print("  cd garmin")
        print("  .\\venv\\Scripts\\Activate.ps1")
        print("  python scripts\\garmindb_cli.py --all --analyze")
        print("\nOr if you need to re-sync everything:")
        print("  python scripts\\garmindb_cli.py --all --download --import --analyze --latest")

if __name__ == '__main__':
    main()

