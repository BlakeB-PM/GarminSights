#!/usr/bin/env python3
"""Check monitoring data import status."""

import sqlite3
import os

monitoring_db = os.path.join(os.path.expanduser('~'), 'HealthData', 'DBs', 'garmin_monitoring.db')

if not os.path.exists(monitoring_db):
    print(f"[X] Monitoring database not found: {monitoring_db}")
else:
    conn = sqlite3.connect(monitoring_db)
    cursor = conn.cursor()
    
    # Check monitoring table
    cursor.execute('SELECT COUNT(*) FROM monitoring')
    count = cursor.fetchone()[0]
    print(f"Monitoring table rows: {count}")
    
    if count > 0:
        # Check date range
        cursor.execute('SELECT MIN(timestamp), MAX(timestamp) FROM monitoring')
        min_date, max_date = cursor.fetchone()
        print(f"Date range: {min_date} to {max_date}")
        
        # Check for steps data
        cursor.execute('PRAGMA table_info(monitoring)')
        columns = [col[1] for col in cursor.fetchall()]
        if 'steps' in columns:
            cursor.execute('SELECT COUNT(*) FROM monitoring WHERE steps > 0')
            steps_count = cursor.fetchone()[0]
            print(f"Rows with steps > 0: {steps_count}")
    
    conn.close()

