#!/usr/bin/env python3
"""
Diagnostic and fix script for empty steps/activity minutes in the dashboard.

The issue is that monitoring data (steps, activity minutes) wasn't imported.
This script helps identify and fix the problem.
"""

import sqlite3
import os
from pathlib import Path

def check_current_status():
    """Check the current state of the databases."""
    print("="*70)
    print("GarminSights Data Diagnostic")
    print("="*70)
    
    homedir = os.path.expanduser('~')
    db_dir = os.path.join(homedir, 'HealthData', 'DBs')
    
    # Check monitoring database
    monitoring_db = os.path.join(db_dir, 'garmin_monitoring.db')
    print(f"\n[1] Checking monitoring database...")
    if os.path.exists(monitoring_db):
        conn = sqlite3.connect(monitoring_db)
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM monitoring')
        count = cursor.fetchone()[0]
        print(f"    Monitoring table rows: {count}")
        conn.close()
        
        if count == 0:
            print("    [X] PROBLEM: Monitoring table is empty!")
            print("    [X] This is why steps and activity minutes are zero.")
    else:
        print(f"    [X] Monitoring database not found: {monitoring_db}")
    
    # Check summary database
    summary_db = os.path.join(db_dir, 'garmin_summary.db')
    print(f"\n[2] Checking summary database...")
    if os.path.exists(summary_db):
        conn = sqlite3.connect(summary_db)
        cursor = conn.cursor()
        
        # Check days_summary
        cursor.execute('SELECT COUNT(*) FROM days_summary')
        count = cursor.fetchone()[0]
        print(f"    days_summary rows: {count}")
        
        if count > 0:
            cursor.execute('SELECT COUNT(*) FROM days_summary WHERE steps > 0')
            steps_count = cursor.fetchone()[0]
            print(f"    Rows with steps > 0: {steps_count}")
            
            cursor.execute('SELECT COUNT(*) FROM days_summary WHERE intensity_time > 0')
            intensity_count = cursor.fetchone()[0]
            print(f"    Rows with intensity_time > 0: {intensity_count}")
        
        conn.close()
    else:
        print(f"    [X] Summary database not found: {summary_db}")
    
    # Check for downloaded monitoring files
    print(f"\n[3] Checking for downloaded monitoring files...")
    gc_dir = os.path.join(homedir, '.GarminDb', 'Downloads')
    monitoring_dir = os.path.join(gc_dir, 'Monitoring')
    
    if os.path.exists(monitoring_dir):
        files = [f for f in os.listdir(monitoring_dir) if f.endswith('.fit') or f.endswith('.json')]
        print(f"    Found {len(files)} monitoring files in {monitoring_dir}")
        if len(files) > 0:
            print(f"    Sample files: {files[:5]}")
    else:
        print(f"    [X] Monitoring download directory not found: {monitoring_dir}")
        print(f"    This suggests monitoring data was never downloaded.")
    
    print("\n" + "="*70)

def print_fix_instructions():
    """Print instructions to fix the issue."""
    print("\n" + "="*70)
    print("HOW TO FIX: Re-sync with monitoring data")
    print("="*70)
    print("""
The monitoring data (steps, activity minutes) wasn't imported. You need to:

1. Navigate to the garmin directory:
   cd "C:\\Users\\Blake\\OneDrive\\Documents\\AI Repo\\Projects\\GarminSights\\garmin"

2. Activate the virtual environment:
   .\\venv\\Scripts\\Activate.ps1

3. Re-sync ALL data including monitoring:
   python scripts\\garmindb_cli.py --all --download --import --analyze --latest

   OR if you want to re-sync everything (not just latest):
   python scripts\\garmindb_cli.py --all --download --import --analyze

The key flags:
   --all          : Include monitoring data (steps, activity minutes, etc.)
   --download     : Download data from Garmin Connect
   --import       : Import downloaded data into database
   --analyze      : Create summary tables (days_summary) with aggregated data
   --latest       : Only process recent data (faster, use this first)

After running this, the monitoring table should have data, and the 
days_summary table should have non-zero steps and activity minutes.

Note: This may take a while depending on how much data you have.
""")
    print("="*70)

def main():
    check_current_status()
    print_fix_instructions()
    
    # Check if we can detect the issue
    homedir = os.path.expanduser('~')
    monitoring_db = os.path.join(homedir, 'HealthData', 'DBs', 'garmin_monitoring.db')
    
    if os.path.exists(monitoring_db):
        conn = sqlite3.connect(monitoring_db)
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM monitoring')
        count = cursor.fetchone()[0]
        conn.close()
        
        if count == 0:
            print("\n[DIAGNOSIS] Monitoring data is missing. Re-sync required.")
        else:
            print("\n[DIAGNOSIS] Monitoring data exists. Issue may be in summary tables.")
            print("            Try running: --analyze flag to rebuild summary tables.")

if __name__ == '__main__':
    main()

