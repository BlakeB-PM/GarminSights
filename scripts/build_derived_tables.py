#!/usr/bin/env python3
"""
Build derived tables for the GarminSights fitness explorer.

This script creates three derived tables in the GarminDB SQLite database:
1. fact_exercise_weekly - Exercise-level strength training metrics
2. fact_muscle_group_weekly - Muscle group aggregations
3. fact_workout_type_weekly - Workout type comparisons (strength vs cardio)

Usage:
    python scripts/build_derived_tables.py [--db-path PATH]
"""

import argparse
import csv
import json
import logging
import os
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def load_exercise_mapping(csv_path):
    """Load exercise to muscle group mapping from CSV."""
    mapping = {}
    if not os.path.exists(csv_path):
        logger.warning(f"Exercise mapping CSV not found at {csv_path}, using empty mapping")
        return mapping
    
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            exercise_name = row['exercise_name'].strip()
            muscle_group = row['muscle_group'].strip()
            mapping[exercise_name] = muscle_group
    
    logger.info(f"Loaded {len(mapping)} exercise mappings")
    return mapping


def get_week_start(date):
    """Get the Monday (week start) for a given date."""
    days_since_monday = date.weekday()
    return date - timedelta(days=days_since_monday)


def parse_date(date_str):
    """Parse date string from various formats."""
    if isinstance(date_str, str):
        # Try ISO format first
        try:
            return datetime.fromisoformat(date_str.replace('Z', '+00:00')).date()
        except:
            # Try other common formats
            for fmt in ['%Y-%m-%d', '%Y-%m-%d %H:%M:%S']:
                try:
                    return datetime.strptime(date_str, fmt).date()
                except:
                    pass
    elif isinstance(date_str, datetime):
        return date_str.date()
    return None


def extract_strength_exercises_from_json(json_file_path, exercise_mapping):
    """Extract exercise data from a Garmin activity JSON file."""
    exercises = []
    
    try:
        with open(json_file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Garmin strength training JSON structure
        # Activities have exerciseSetsDTOs which contain sets with reps/weight
        activity_id = data.get('activityId')
        start_time_str = data.get('summaryDTO', {}).get('startTimeGMT')
        
        if not start_time_str:
            return exercises
        
        try:
            start_time = datetime.fromisoformat(start_time_str.replace('Z', '+00:00'))
        except:
            logger.warning(f"Could not parse start time: {start_time_str}")
            return exercises
        
        # Extract exercise sets
        exercise_sets = data.get('exerciseSetsDTOs', [])
        
        for exercise_set in exercise_sets:
            exercise_name = exercise_set.get('exerciseName', 'Unknown')
            sets = exercise_set.get('sets', [])
            
            total_tonnage = 0
            total_sets = len(sets)
            total_reps = 0
            
            for set_data in sets:
                reps = set_data.get('reps', 0) or 0
                weight = set_data.get('weight', 0) or 0
                total_reps += reps
                total_tonnage += reps * weight
            
            if total_sets > 0:  # Only include exercises with at least one set
                muscle_group = exercise_mapping.get(exercise_name, 'unknown')
                
                exercises.append({
                    'activity_id': activity_id,
                    'exercise_name': exercise_name,
                    'muscle_group': muscle_group,
                    'start_time': start_time,
                    'total_tonnage': total_tonnage,
                    'total_sets': total_sets,
                    'total_reps': total_reps,
                })
    
    except Exception as e:
        logger.warning(f"Error processing {json_file_path}: {e}")
    
    return exercises


def find_activity_json_files(garmin_dir):
    """Find all activity detail JSON files in GarminDB download directory."""
    json_files = []
    
    # GarminDB typically stores JSON files in a downloads directory
    # Common locations: garmin/Json/ActivityDetails/ or similar
    possible_paths = [
        Path(garmin_dir) / 'Json' / 'ActivityDetails',
        Path(garmin_dir) / 'json' / 'activity',
        Path(garmin_dir) / 'activity_details',
    ]
    
    for path in possible_paths:
        if path.exists():
            json_files.extend(path.glob('activity_details_*.json'))
            logger.info(f"Found {len(json_files)} JSON files in {path}")
            break
    
    return json_files


def get_activities_from_db(db_path):
    """Get strength training activities from GarminDB."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    
    query = """
        SELECT activity_id, start_time, sport, sub_sport, name
        FROM activities
        WHERE sport = 'strength_training' OR sub_sport = 'strength_training'
        ORDER BY start_time
    """
    
    activities = []
    try:
        cursor = conn.execute(query)
        activities = [dict(row) for row in cursor.fetchall()]
        logger.info(f"Found {len(activities)} strength training activities in database")
    except sqlite3.OperationalError as e:
        logger.warning(f"Could not query activities table: {e}")
        logger.info("This is normal if the database hasn't been created yet")
    
    conn.close()
    return activities


def build_fact_exercise_weekly(db_path, exercise_mapping, json_files=None):
    """Build fact_exercise_weekly table."""
    logger.info("Building fact_exercise_weekly table...")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Create table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fact_exercise_weekly (
            week_start_date TEXT NOT NULL,
            exercise_name TEXT NOT NULL,
            muscle_group TEXT NOT NULL,
            total_tonnage REAL DEFAULT 0,
            total_sets INTEGER DEFAULT 0,
            total_reps INTEGER DEFAULT 0,
            PRIMARY KEY (week_start_date, exercise_name)
        )
    """)
    
    # Clear existing data
    cursor.execute("DELETE FROM fact_exercise_weekly")
    
    # Aggregate exercise data by week
    weekly_data = defaultdict(lambda: defaultdict(lambda: {
        'total_tonnage': 0,
        'total_sets': 0,
        'total_reps': 0,
        'muscle_group': 'unknown'
    }))
    
    # Process JSON files if provided
    if json_files:
        logger.info(f"Processing {len(json_files)} JSON files...")
        for json_file in json_files:
            exercises = extract_strength_exercises_from_json(json_file, exercise_mapping)
            for ex in exercises:
                week_start = get_week_start(ex['start_time'].date())
                week_key = week_start.isoformat()
                exercise_key = ex['exercise_name']
                
                weekly_data[week_key][exercise_key]['total_tonnage'] += ex['total_tonnage']
                weekly_data[week_key][exercise_key]['total_sets'] += ex['total_sets']
                weekly_data[week_key][exercise_key]['total_reps'] += ex['total_reps']
                weekly_data[week_key][exercise_key]['muscle_group'] = ex['muscle_group']
    
    # Insert aggregated data
    for week_start, exercises in weekly_data.items():
        for exercise_name, data in exercises.items():
            cursor.execute("""
                INSERT INTO fact_exercise_weekly 
                (week_start_date, exercise_name, muscle_group, total_tonnage, total_sets, total_reps)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                week_start,
                exercise_name,
                data['muscle_group'],
                data['total_tonnage'],
                data['total_sets'],
                data['total_reps']
            ))
    
    conn.commit()
    logger.info(f"Inserted {sum(len(ex) for ex in weekly_data.values())} exercise-week records")
    conn.close()


def build_fact_muscle_group_weekly(db_path):
    """Build fact_muscle_group_weekly table from fact_exercise_weekly."""
    logger.info("Building fact_muscle_group_weekly table...")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Create table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fact_muscle_group_weekly (
            week_start_date TEXT NOT NULL,
            muscle_group TEXT NOT NULL,
            total_tonnage REAL DEFAULT 0,
            total_sets INTEGER DEFAULT 0,
            total_reps INTEGER DEFAULT 0,
            PRIMARY KEY (week_start_date, muscle_group)
        )
    """)
    
    # Clear existing data
    cursor.execute("DELETE FROM fact_muscle_group_weekly")
    
    # Aggregate from fact_exercise_weekly
    cursor.execute("""
        INSERT INTO fact_muscle_group_weekly
        (week_start_date, muscle_group, total_tonnage, total_sets, total_reps)
        SELECT 
            week_start_date,
            muscle_group,
            SUM(total_tonnage) as total_tonnage,
            SUM(total_sets) as total_sets,
            SUM(total_reps) as total_reps
        FROM fact_exercise_weekly
        GROUP BY week_start_date, muscle_group
    """)
    
    conn.commit()
    count = cursor.execute("SELECT COUNT(*) FROM fact_muscle_group_weekly").fetchone()[0]
    logger.info(f"Inserted {count} muscle group-week records")
    conn.close()


def build_fact_workout_type_weekly(db_path):
    """Build fact_workout_type_weekly table from activities."""
    logger.info("Building fact_workout_type_weekly table...")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Create table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fact_workout_type_weekly (
            week_start_date TEXT NOT NULL,
            workout_type TEXT NOT NULL,
            total_duration_min REAL DEFAULT 0,
            total_sessions INTEGER DEFAULT 0,
            total_distance_km REAL DEFAULT 0,
            total_tonnage REAL DEFAULT 0,
            PRIMARY KEY (week_start_date, workout_type)
        )
    """)
    
    # Clear existing data
    cursor.execute("DELETE FROM fact_workout_type_weekly")
    
    # Classify activities by workout type
    # Note: This requires the activities table to exist
    try:
        cursor.execute("""
            SELECT 
                DATE(start_time, 'weekday 0', '-6 days') as week_start,
                CASE 
                    WHEN sport = 'strength_training' OR sub_sport = 'strength_training' THEN 'strength'
                    WHEN sport = 'running' AND (name LIKE '%treadmill%' OR name LIKE '%Treadmill%') THEN 'treadmill'
                    WHEN sport = 'running' THEN 'run'
                    WHEN sport = 'walking' THEN 'walk'
                    ELSE 'other'
                END as workout_type,
                CAST((julianday(stop_time) - julianday(start_time)) * 24 * 60 AS REAL) as duration_min,
                distance / 1000.0 as distance_km
            FROM activities
            WHERE start_time IS NOT NULL
        """)
        
        weekly_data = defaultdict(lambda: defaultdict(lambda: {
            'total_duration_min': 0,
            'total_sessions': 0,
            'total_distance_km': 0,
            'total_tonnage': 0
        }))
        
        for row in cursor.fetchall():
            week_start, workout_type, duration_min, distance_km = row
            if week_start and workout_type:
                weekly_data[week_start][workout_type]['total_duration_min'] += duration_min or 0
                weekly_data[week_start][workout_type]['total_sessions'] += 1
                weekly_data[week_start][workout_type]['total_distance_km'] += distance_km or 0
        
        # Add strength tonnage from fact_exercise_weekly
        cursor.execute("""
            SELECT week_start_date, SUM(total_tonnage) as total_tonnage
            FROM fact_exercise_weekly
            GROUP BY week_start_date
        """)
        
        for row in cursor.fetchall():
            week_start, tonnage = row
            if week_start in weekly_data and 'strength' in weekly_data[week_start]:
                weekly_data[week_start]['strength']['total_tonnage'] = tonnage or 0
        
        # Insert data
        for week_start, types in weekly_data.items():
            for workout_type, data in types.items():
                cursor.execute("""
                    INSERT INTO fact_workout_type_weekly
                    (week_start_date, workout_type, total_duration_min, total_sessions, total_distance_km, total_tonnage)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    week_start,
                    workout_type,
                    data['total_duration_min'],
                    data['total_sessions'],
                    data['total_distance_km'],
                    data['total_tonnage']
                ))
        
        conn.commit()
        count = cursor.execute("SELECT COUNT(*) FROM fact_workout_type_weekly").fetchone()[0]
        logger.info(f"Inserted {count} workout type-week records")
    
    except sqlite3.OperationalError as e:
        logger.warning(f"Could not build workout type table: {e}")
        logger.info("This is normal if the activities table doesn't exist yet")
    
    conn.close()


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
    parser = argparse.ArgumentParser(description='Build derived tables for GarminSights')
    parser.add_argument('--db-path', type=str, default=None,
                       help='Path to GarminDB activities database (auto-detected if not provided)')
    parser.add_argument('--exercise-csv', type=str, default='data/exercise_muscles.csv',
                       help='Path to exercise to muscle group mapping CSV')
    parser.add_argument('--json-dir', type=str, default=None,
                       help='Directory containing Garmin activity JSON files (auto-detected if not provided)')
    parser.add_argument('--dry-run', action='store_true',
                       help='Show what would be done without making changes')
    
    args = parser.parse_args()
    
    # Resolve paths relative to project root
    project_root = Path(__file__).parent.parent
    
    # Auto-detect database if not provided
    if args.db_path:
        db_path = Path(args.db_path)
    else:
        detected_path = find_garmindb_database()
        db_path = Path(detected_path)
    
    exercise_csv = project_root / args.exercise_csv
    
    logger.info(f"Database path: {db_path}")
    logger.info(f"Exercise mapping: {exercise_csv}")
    
    # Check if database exists
    if not db_path.exists():
        logger.error(f"Database not found at {db_path}")
        logger.error("Please run GarminDB CLI to export data first")
        return 1
    
    # Load exercise mapping
    exercise_mapping = load_exercise_mapping(exercise_csv)
    
    if args.dry_run:
        logger.info("DRY RUN MODE - No changes will be made")
    
    # Find JSON files if needed
    json_files = None
    if args.json_dir:
        json_dir = Path(args.json_dir)
        if json_dir.exists():
            json_files = list(json_dir.glob('activity_details_*.json'))
            logger.info(f"Found {len(json_files)} JSON files in {json_dir}")
        else:
            logger.warning(f"JSON directory not found: {json_dir}")
    else:
        # Try to auto-detect
        garmin_dir = project_root / 'garmin'
        json_files = find_activity_json_files(garmin_dir)
    
    if json_files:
        logger.info(f"Processing {len(json_files)} JSON files")
    else:
        logger.warning("No JSON files found. Derived tables will only use database data.")
    
    if args.dry_run:
        logger.info("Would build derived tables...")
        return 0
    
    # Build derived tables
    try:
        build_fact_exercise_weekly(str(db_path), exercise_mapping, json_files)
        build_fact_muscle_group_weekly(str(db_path))
        build_fact_workout_type_weekly(str(db_path))
        
        logger.info("✅ Derived tables built successfully!")
        logger.info("Run 'python scripts/check_database.py' to verify")
        logger.info("Note: Health/recovery tables are built separately with scripts/build_health_tables.py")
        return 0
    except Exception as e:
        logger.error(f"Error building derived tables: {e}", exc_info=True)
        return 1


if __name__ == '__main__':
    sys.exit(main())

