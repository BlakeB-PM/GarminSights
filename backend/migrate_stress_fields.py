"""Migration script to replace stress_low with stress duration fields."""

import sqlite3
from pathlib import Path
import sys

# Add app directory to path to import config
sys.path.insert(0, str(Path(__file__).parent))

from app.config import get_database_path

# Get the database path using the same logic as the app
db_path = get_database_path()

if not db_path.exists():
    print(f"Database not found at {db_path}")
    exit(1)

conn = sqlite3.connect(str(db_path))
cursor = conn.cursor()

try:
    # Check if stress_low column exists
    cursor.execute("PRAGMA table_info(dailies)")
    columns = [col[1] for col in cursor.fetchall()]
    
    if 'stress_low' in columns:
        print("Migrating stress_low to stress duration fields...")
        
        # Add new columns if they don't exist
        if 'low_stress_duration' not in columns:
            cursor.execute("ALTER TABLE dailies ADD COLUMN low_stress_duration INTEGER")
        if 'medium_stress_duration' not in columns:
            cursor.execute("ALTER TABLE dailies ADD COLUMN medium_stress_duration INTEGER")
        if 'high_stress_duration' not in columns:
            cursor.execute("ALTER TABLE dailies ADD COLUMN high_stress_duration INTEGER")
        
        # Try to extract values from raw_json for existing records
        import json
        cursor.execute("SELECT id, raw_json FROM dailies WHERE raw_json IS NOT NULL")
        records = cursor.fetchall()
        
        updated = 0
        for record_id, raw_json_str in records:
            try:
                data = json.loads(raw_json_str)
                low_duration = data.get("lowStressDuration")
                medium_duration = data.get("mediumStressDuration")
                high_duration = data.get("highStressDuration")
                
                updates = []
                params = []
                if low_duration is not None:
                    updates.append("low_stress_duration = ?")
                    params.append(low_duration)
                if medium_duration is not None:
                    updates.append("medium_stress_duration = ?")
                    params.append(medium_duration)
                if high_duration is not None:
                    updates.append("high_stress_duration = ?")
                    params.append(high_duration)
                
                if updates:
                    params.append(record_id)
                    cursor.execute(
                        f"UPDATE dailies SET {', '.join(updates)} WHERE id = ?",
                        tuple(params)
                    )
                    updated += 1
            except Exception as e:
                print(f"Error processing record {record_id}: {e}")
        
        print(f"Updated {updated} records with stress duration data")
        
        # Drop the old stress_low column
        # SQLite doesn't support DROP COLUMN directly, so we'll recreate the table
        print("Recreating table without stress_low column...")
        
        # Get all data
        cursor.execute("SELECT * FROM dailies")
        all_data = cursor.fetchall()
        
        # Get column names (excluding stress_low)
        cursor.execute("PRAGMA table_info(dailies)")
        all_columns = [col[1] for col in cursor.fetchall() if col[1] != 'stress_low']
        
        # Create new table
        cursor.execute("""
            CREATE TABLE dailies_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date DATE UNIQUE NOT NULL,
                steps INTEGER,
                distance_meters REAL,
                active_calories INTEGER,
                calories_total INTEGER,
                calories_bmr INTEGER,
                body_battery_high INTEGER,
                body_battery_low INTEGER,
                body_battery_charged INTEGER,
                body_battery_drained INTEGER,
                stress_average INTEGER,
                stress_high INTEGER,
                low_stress_duration INTEGER,
                medium_stress_duration INTEGER,
                high_stress_duration INTEGER,
                rest_stress_duration INTEGER,
                activity_stress_duration INTEGER,
                intensity_minutes_moderate INTEGER,
                intensity_minutes_vigorous INTEGER,
                intensity_minutes_goal INTEGER,
                avg_heart_rate INTEGER,
                max_heart_rate INTEGER,
                min_heart_rate INTEGER,
                resting_heart_rate INTEGER,
                raw_json TEXT
            )
        """)
        
        # Copy data (excluding stress_low)
        placeholders = ','.join(['?' for _ in all_columns])
        for row in all_data:
            row_dict = dict(zip([col[1] for col in cursor.execute("PRAGMA table_info(dailies)").fetchall()], row))
            new_row = [row_dict.get(col) for col in all_columns]
            cursor.execute(f"INSERT INTO dailies_new ({','.join(all_columns)}) VALUES ({placeholders})", tuple(new_row))
        
        # Replace old table
        cursor.execute("DROP TABLE dailies")
        cursor.execute("ALTER TABLE dailies_new RENAME TO dailies")
        
        conn.commit()
        print("Migration complete!")
    else:
        print("stress_low column doesn't exist. Migration may have already been run.")
        
except Exception as e:
    conn.rollback()
    print(f"Migration failed: {e}")
    raise
finally:
    conn.close()

