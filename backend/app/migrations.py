"""Database migration utilities."""

import sqlite3
import logging
from pathlib import Path
from typing import Optional

from app.config import get_database_path

logger = logging.getLogger(__name__)


def get_schema_version(db_path: Path) -> int:
    """Get current schema version from database."""
    conn = sqlite3.connect(str(db_path))
    try:
        cursor = conn.execute(
            "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1"
        )
        result = cursor.fetchone()
        return result[0] if result else 0
    except sqlite3.OperationalError:
        # Table doesn't exist, return 0
        return 0
    finally:
        conn.close()


def set_schema_version(db_path: Path, version: int) -> None:
    """Set schema version in database."""
    conn = sqlite3.connect(str(db_path))
    try:
        # Create schema_version table if it doesn't exist
        conn.execute("""
            CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Insert or update version
        conn.execute(
            "INSERT OR REPLACE INTO schema_version (version) VALUES (?)",
            (version,)
        )
        conn.commit()
    finally:
        conn.close()


def migration_2_rebuild_dailies_table() -> None:
    """
    Migration 2: Rebuild dailies table with complete schema.
    
    The original dailies table was incomplete. This migration rebuilds it with all necessary columns.
    """
    db_path = get_database_path()
    
    if not db_path.exists():
        logger.info("Database doesn't exist yet, migration not needed")
        return
    
    conn = sqlite3.connect(str(db_path))
    try:
        # Check current columns
        cursor = conn.execute("PRAGMA table_info(dailies)")
        columns = [row[1] for row in cursor.fetchall()]
        
        # List of all required columns in the new schema
        required_columns = [
            'distance_meters', 'active_calories', 'calories_bmr',
            'body_battery_charged', 'body_battery_drained',
            'stress_high', 'low_stress_duration', 'medium_stress_duration', 'high_stress_duration',
            'rest_stress_duration', 'activity_stress_duration',
            'intensity_minutes_moderate', 'intensity_minutes_vigorous', 'intensity_minutes_goal',
            'avg_heart_rate', 'max_heart_rate', 'min_heart_rate', 'resting_heart_rate'
        ]
        
        missing_columns = [col for col in required_columns if col not in columns]
        
        if not missing_columns:
            logger.info("Migration 2: Dailies table already has all columns, skipping")
            return
        
        logger.info(f"Migration 2: Dailies table missing columns: {missing_columns}. Rebuilding table...")
        
        # Create new table with full schema
        conn.execute("""
            CREATE TABLE IF NOT EXISTS dailies_new (
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
        
        # Copy data - only include columns that exist in both old and new tables
        new_columns = [
            'id', 'date', 'steps', 'distance_meters', 'active_calories', 'calories_total', 'calories_bmr',
            'body_battery_high', 'body_battery_low', 'body_battery_charged', 'body_battery_drained',
            'stress_average', 'stress_high', 'stress_low', 'rest_stress_duration', 'activity_stress_duration',
            'intensity_minutes_moderate', 'intensity_minutes_vigorous', 'intensity_minutes_goal',
            'avg_heart_rate', 'max_heart_rate', 'min_heart_rate', 'resting_heart_rate', 'raw_json'
        ]
        
        columns_to_copy = [col for col in new_columns if col in columns]
        
        if columns_to_copy:
            columns_str = ', '.join(columns_to_copy)
            conn.execute(f"""
                INSERT INTO dailies_new ({columns_str})
                SELECT {columns_str}
                FROM dailies
            """)
            logger.info(f"Migration 2: Copied columns: {columns_to_copy}")
        
        # Drop old table and rename new one
        conn.execute("DROP TABLE dailies")
        conn.execute("ALTER TABLE dailies_new RENAME TO dailies")
        
        # Recreate indexes
        conn.execute("CREATE INDEX IF NOT EXISTS idx_dailies_date ON dailies(date)")
        
        conn.commit()
        logger.info("Migration 2: Successfully rebuilt dailies table with full schema")
        
    except Exception as e:
        conn.rollback()
        logger.error(f"Migration 2 failed: {e}")
        raise
    finally:
        conn.close()


def migrate_remove_unused_daily_fields() -> None:
    """
    Migration 1: This migration is now a no-op since migration 2 handles the complete rebuild.
    Kept for version tracking.
    """
    logger.info("Migration 1: Skipped (superseded by migration 2)")


def migration_3_convert_weight_to_lbs() -> None:
    """
    Migration 3: Convert weight_kg to weight_lbs in strength_sets table.
    
    Converts all existing weight values from kg to lbs to avoid rounding errors
    when displaying weights, since the app now uses imperial units throughout.
    """
    db_path = get_database_path()
    
    if not db_path.exists():
        logger.info("Database doesn't exist yet, migration not needed")
        return
    
    conn = sqlite3.connect(str(db_path))
    try:
        # Check if weight_lbs column already exists
        cursor = conn.execute("PRAGMA table_info(strength_sets)")
        columns = {row[1]: row for row in cursor.fetchall()}
        
        if 'weight_lbs' in columns:
            logger.info("Migration 3: weight_lbs column already exists, skipping")
            return
        
        logger.info("Migration 3: Converting weight_kg to weight_lbs...")
        
        # Add weight_lbs column
        conn.execute("ALTER TABLE strength_sets ADD COLUMN weight_lbs REAL")
        
        # Convert existing weight_kg values to lbs (kg * 2.20462)
        conn.execute("""
            UPDATE strength_sets 
            SET weight_lbs = weight_kg * 2.20462 
            WHERE weight_kg IS NOT NULL
        """)
        
        # Count converted rows
        cursor = conn.execute("SELECT COUNT(*) FROM strength_sets WHERE weight_lbs IS NOT NULL")
        converted_count = cursor.fetchone()[0]
        
        logger.info(f"Migration 3: Converted {converted_count} weight values from kg to lbs")
        
        # Drop the old weight_kg column by recreating the table
        # SQLite doesn't support DROP COLUMN directly, so we rebuild the table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS strength_sets_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                activity_id INTEGER REFERENCES activities(id),
                exercise_name TEXT,
                set_number INTEGER,
                reps INTEGER,
                weight_lbs REAL,
                duration_seconds INTEGER,
                raw_json TEXT
            )
        """)
        
        # Copy all data, using weight_lbs (which we just populated)
        conn.execute("""
            INSERT INTO strength_sets_new 
            (id, activity_id, exercise_name, set_number, reps, weight_lbs, duration_seconds, raw_json)
            SELECT id, activity_id, exercise_name, set_number, reps, weight_lbs, duration_seconds, raw_json
            FROM strength_sets
        """)
        
        # Drop old table and rename new one
        conn.execute("DROP TABLE strength_sets")
        conn.execute("ALTER TABLE strength_sets_new RENAME TO strength_sets")
        
        # Recreate indexes
        conn.execute("CREATE INDEX IF NOT EXISTS idx_strength_sets_activity ON strength_sets(activity_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_strength_sets_exercise ON strength_sets(exercise_name)")
        
        conn.commit()
        logger.info("Migration 3: Successfully converted weight_kg to weight_lbs")
        
    except Exception as e:
        conn.rollback()
        logger.error(f"Migration 3 failed: {e}")
        raise
    finally:
        conn.close()


def run_migrations() -> None:
    """Run all pending migrations."""
    db_path = get_database_path()
    
    if not db_path.exists():
        logger.info("Database doesn't exist, migrations will run on first init")
        return
    
    current_version = get_schema_version(db_path)
    target_version = 3
    
    if current_version >= target_version:
        logger.info(f"Database is at version {current_version}, no migrations needed")
        return
    
    logger.info(f"Running migrations from version {current_version} to {target_version}")
    
    # Migration 1: Remove unused daily fields (now a no-op, superseded by migration 2)
    if current_version < 1:
        migrate_remove_unused_daily_fields()
        set_schema_version(db_path, 1)
    
    # Migration 2: Rebuild dailies table with complete schema
    if current_version < 2:
        migration_2_rebuild_dailies_table()
        set_schema_version(db_path, 2)
    
    # Migration 3: Convert weight_kg to weight_lbs
    if current_version < 3:
        migration_3_convert_weight_to_lbs()
        set_schema_version(db_path, 3)
    
    logger.info("All migrations completed successfully")

