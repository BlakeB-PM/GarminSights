#!/usr/bin/env python3
"""
Check which databases contain daily summary tables and their row counts.
"""

import sqlite3
from pathlib import Path

def check_database_tables():
    """Check all Garmin databases for summary tables."""
    db_dir = Path(r'C:\Users\Blake\HealthData\DBs')
    
    if not db_dir.exists():
        print(f"Database directory not found: {db_dir}")
        return
    
    db_files = list(db_dir.glob('*.db'))
    print(f"Found {len(db_files)} database files:\n")
    
    summary_databases = []
    
    for db_file in db_files:
        print(f"=== {db_file.name} ===")
        try:
            conn = sqlite3.connect(str(db_file))
            cursor = conn.cursor()
            
            # Get all tables
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            tables = [row[0] for row in cursor.fetchall()]
            
            # Look for summary tables
            summary_tables = [t for t in tables if 'summary' in t.lower() or 'daily' in t.lower()]
            
            # Check for days_summary or daily_summary specifically
            target_tables = ['days_summary', 'daily_summary']
            found_target = [t for t in target_tables if t in tables]
            
            if found_target:
                summary_databases.append((db_file, found_target))
                print(f"  [FOUND] Target tables: {found_target}")
                for table in found_target:
                    cursor.execute(f'SELECT COUNT(*) FROM "{table}"')
                    count = cursor.fetchone()[0]
                    print(f"    - {table}: {count} rows")
                    if count > 0:
                        # Get date range
                        cursor.execute(f'SELECT MIN(day), MAX(day) FROM "{table}"')
                        result = cursor.fetchone()
                        if result[0]:
                            print(f"      Date range: {result[0]} to {result[1]}")
            elif summary_tables:
                print(f"  Found summary tables: {summary_tables}")
                for table in summary_tables:
                    try:
                        cursor.execute(f'SELECT COUNT(*) FROM "{table}"')
                        count = cursor.fetchone()[0]
                        print(f"    - {table}: {count} rows")
                    except:
                        print(f"    - {table}: (could not count)")
            else:
                print(f"  No summary tables found")
                print(f"  Total tables: {len(tables)}")
                if len(tables) <= 15:
                    print(f"  Tables: {', '.join(tables)}")
            
            conn.close()
            print()
            
        except Exception as e:
            print(f"  Error: {e}\n")
    
    print("\n" + "="*60)
    if summary_databases:
        print(f"[OK] Found {len(summary_databases)} database(s) with target tables:")
        for db_file, tables in summary_databases:
            print(f"  - {db_file.name}: {', '.join(tables)}")
    else:
        print("[X] No databases found with 'days_summary' or 'daily_summary' tables")
        print("\n  Possible issues:")
        print("  1. The analyze step hasn't been run yet")
        print("  2. Tables are in a different database")
        print("  3. Tables have different names")

if __name__ == '__main__':
    check_database_tables()

