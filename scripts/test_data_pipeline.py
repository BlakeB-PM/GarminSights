#!/usr/bin/env python3
"""
Comprehensive test script for the GarminSights data pipeline.

This script tests the entire data pipeline step by step:
1. GarminDB configuration and database location
2. Database existence and structure
3. Activities data presence
4. Strength training activities found
5. JSON files for strength exercises
6. Derived tables build process
7. Derived tables data quality

Usage:
    python scripts/test_data_pipeline.py [--verbose]
"""

import argparse
import json
import logging
import os
import sqlite3
import sys
from pathlib import Path
from collections import defaultdict

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)


def find_garmindb_database():
    """
    Find GarminDB database in default location or project location.
    Returns the path if found, None otherwise.
    """
    # Default GarminDB location: ~/HealthData/DBs/
    homedir = os.path.expanduser('~')
    default_db_dir = os.path.join(homedir, 'HealthData', 'DBs')
    default_db_path = os.path.join(default_db_dir, 'garmin_activities.db')
    
    # Project location
    project_root = Path(__file__).parent.parent
    project_db_path = project_root / 'garmin' / 'garmin_activities.db'
    
    # Check both locations
    if os.path.exists(default_db_path):
        logger.info(f"Found database at default GarminDB location: {default_db_path}")
        return default_db_path
    
    if project_db_path.exists():
        logger.info(f"Found database at project location: {project_db_path}")
        return str(project_db_path)
    
    # Check if DBs directory exists but database doesn't
    if os.path.exists(default_db_dir):
        logger.warning(f"DBs directory exists at {default_db_dir} but garmin_activities.db not found")
        # List files in directory
        try:
            files = os.listdir(default_db_dir)
            db_files = [f for f in files if f.endswith('.db')]
            if db_files:
                logger.info(f"Found database files: {', '.join(db_files)}")
                # Check if any match expected pattern
                for db_file in db_files:
                    if 'activities' in db_file.lower():
                        suggested_path = os.path.join(default_db_dir, db_file)
                        logger.info(f"Possible activities database: {suggested_path}")
        except Exception as e:
            logger.debug(f"Could not list DBs directory: {e}")
    
    logger.error(f"Database not found at:")
    logger.error(f"  - Default: {default_db_path}")
    logger.error(f"  - Project: {project_db_path}")
    return None


def test_database_connection(db_path):
    """Test if database can be opened and is valid."""
    logger.info("\n" + "="*60)
    logger.info("TEST 1: Database Connection")
    logger.info("="*60)
    
    if not db_path or not os.path.exists(db_path):
        logger.error("❌ Database file does not exist")
        return False
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Integrity check
        cursor.execute("PRAGMA integrity_check")
        result = cursor.fetchone()
        if result[0] != 'ok':
            logger.error(f"❌ Database integrity check failed: {result[0]}")
            conn.close()
            return False
        
        logger.info("✅ Database exists and is valid")
        logger.info(f"   Path: {db_path}")
        conn.close()
        return True
    
    except sqlite3.Error as e:
        logger.error(f"❌ Error opening database: {e}")
        return False


def test_activities_table(db_path):
    """Test if activities table exists and has data."""
    logger.info("\n" + "="*60)
    logger.info("TEST 2: Activities Table")
    logger.info("="*60)
    
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Check if table exists
        cursor.execute("""
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='activities'
        """)
        
        if not cursor.fetchone():
            logger.error("❌ 'activities' table does not exist")
            conn.close()
            return False
        
        logger.info("✅ 'activities' table exists")
        
        # Count total activities
        cursor.execute("SELECT COUNT(*) FROM activities")
        total_count = cursor.fetchone()[0]
        logger.info(f"   Total activities: {total_count}")
        
        if total_count == 0:
            logger.warning("⚠️  No activities found in database")
            logger.warning("   Run GarminDB CLI to export data first")
            conn.close()
            return False
        
        # Check for strength training activities
        cursor.execute("""
            SELECT COUNT(*) FROM activities 
            WHERE sport = 'strength_training' OR sub_sport = 'strength_training'
        """)
        strength_count = cursor.fetchone()[0]
        logger.info(f"   Strength training activities: {strength_count}")
        
        if strength_count == 0:
            logger.warning("⚠️  No strength training activities found")
            logger.warning("   This is normal if you haven't logged strength workouts in Garmin")
        
        # Show sample activities
        cursor.execute("""
            SELECT activity_id, start_time, sport, sub_sport, name 
            FROM activities 
            LIMIT 5
        """)
        samples = cursor.fetchall()
        logger.info("\n   Sample activities:")
        for row in samples:
            logger.info(f"     - {row['sport']}/{row.get('sub_sport', 'N/A')}: {row.get('name', 'N/A')} ({row['start_time']})")
        
        conn.close()
        return True
    
    except sqlite3.Error as e:
        logger.error(f"❌ Error querying activities: {e}")
        return False


def find_activity_json_files():
    """Find Garmin activity JSON files."""
    logger.info("\n" + "="*60)
    logger.info("TEST 3: Activity JSON Files")
    logger.info("="*60)
    
    project_root = Path(__file__).parent.parent
    garmin_dir = project_root / 'garmin'
    homedir = os.path.expanduser('~')
    default_base = os.path.join(homedir, 'HealthData')
    
    # Possible locations for JSON files
    possible_paths = [
        garmin_dir / 'Json' / 'ActivityDetails',
        garmin_dir / 'json' / 'activity',
        Path(default_base) / 'Json' / 'ActivityDetails',
        Path(default_base) / 'json' / 'activity',
    ]
    
    json_files = []
    found_dir = None
    
    for path in possible_paths:
        if path.exists():
            files = list(path.glob('activity_details_*.json'))
            if files:
                json_files.extend(files)
                found_dir = path
                break
    
    if json_files:
        logger.info(f"✅ Found {len(json_files)} JSON files")
        logger.info(f"   Location: {found_dir}")
        
        # Check if any have exercise data
        exercise_files = 0
        for json_file in json_files[:10]:  # Sample first 10
            try:
                with open(json_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if 'exerciseSetsDTOs' in data and data['exerciseSetsDTOs']:
                        exercise_files += 1
            except Exception:
                pass
        
        logger.info(f"   Files with exercise data (sample): {exercise_files}/10")
        
        if exercise_files == 0:
            logger.warning("⚠️  No exercise data found in sampled JSON files")
            logger.warning("   Exercise data is needed for strength training analysis")
        
        return json_files, found_dir
    else:
        logger.warning("⚠️  No JSON files found in expected locations:")
        for path in possible_paths:
            logger.warning(f"   - {path}")
        logger.warning("   JSON files are needed to extract exercise set data")
        return [], None


def test_exercise_mapping():
    """Test exercise to muscle group mapping."""
    logger.info("\n" + "="*60)
    logger.info("TEST 4: Exercise Mapping")
    logger.info("="*60)
    
    project_root = Path(__file__).parent.parent
    csv_path = project_root / 'data' / 'exercise_muscles.csv'
    
    if not csv_path.exists():
        logger.error(f"❌ Exercise mapping CSV not found: {csv_path}")
        return False
    
    logger.info(f"✅ Exercise mapping CSV found: {csv_path}")
    
    try:
        import csv
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            mappings = list(reader)
        
        logger.info(f"   Mapped exercises: {len(mappings)}")
        
        # Count by muscle group
        muscle_groups = defaultdict(int)
        for row in mappings:
            muscle_groups[row['muscle_group']] += 1
        
        logger.info(f"   Muscle groups: {len(muscle_groups)}")
        for mg, count in sorted(muscle_groups.items()):
            logger.info(f"     - {mg}: {count} exercises")
        
        return True
    
    except Exception as e:
        logger.error(f"❌ Error reading exercise mapping: {e}")
        return False


def test_derived_tables_build(db_path):
    """Test if derived tables can be built."""
    logger.info("\n" + "="*60)
    logger.info("TEST 5: Derived Tables Build")
    logger.info("="*60)
    
    # Import the build script functions
    project_root = Path(__file__).parent.parent
    sys.path.insert(0, str(project_root))
    
    try:
        from scripts.build_derived_tables import (
            load_exercise_mapping,
            build_fact_exercise_weekly,
            build_fact_muscle_group_weekly,
            build_fact_workout_type_weekly,
            find_activity_json_files as find_json
        )
        
        # Load exercise mapping
        csv_path = project_root / 'data' / 'exercise_muscles.csv'
        exercise_mapping = load_exercise_mapping(str(csv_path))
        
        # Find JSON files
        garmin_dir = project_root / 'garmin'
        json_files = find_json(garmin_dir)
        
        logger.info("Building derived tables...")
        logger.info("   (This will create/update tables in the database)")
        
        # Build tables
        build_fact_exercise_weekly(str(db_path), exercise_mapping, json_files if json_files else None)
        build_fact_muscle_group_weekly(str(db_path))
        build_fact_workout_type_weekly(str(db_path))
        
        logger.info("✅ Derived tables built successfully")
        return True
    
    except Exception as e:
        logger.error(f"❌ Error building derived tables: {e}")
        import traceback
        if logger.level <= logging.DEBUG:
            traceback.print_exc()
        return False


def test_derived_tables_data(db_path):
    """Test derived tables have data."""
    logger.info("\n" + "="*60)
    logger.info("TEST 6: Derived Tables Data Quality")
    logger.info("="*60)
    
    tables = {
        'fact_exercise_weekly': ['week_start_date', 'exercise_name', 'total_tonnage'],
        'fact_muscle_group_weekly': ['week_start_date', 'muscle_group', 'total_tonnage'],
        'fact_workout_type_weekly': ['week_start_date', 'workout_type', 'total_duration_min']
    }
    
    all_good = True
    
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        for table_name, key_cols in tables.items():
            cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            count = cursor.fetchone()[0]
            
            if count == 0:
                logger.warning(f"⚠️  {table_name}: 0 rows")
                all_good = False
            else:
                logger.info(f"✅ {table_name}: {count} rows")
                
                # Show sample data
                cursor.execute(f"SELECT * FROM {table_name} LIMIT 3")
                samples = cursor.fetchall()
                logger.info(f"   Sample data:")
                for row in samples:
                    values = ', '.join(f"{col}={row[col]}" for col in key_cols)
                    logger.info(f"     - {values}")
        
        # Check for unknown muscle groups
        cursor.execute("""
            SELECT COUNT(DISTINCT exercise_name) 
            FROM fact_exercise_weekly 
            WHERE muscle_group = 'unknown'
        """)
        unknown_count = cursor.fetchone()[0]
        if unknown_count > 0:
            logger.warning(f"⚠️  {unknown_count} exercises mapped to 'unknown' muscle group")
            cursor.execute("""
                SELECT DISTINCT exercise_name 
                FROM fact_exercise_weekly 
                WHERE muscle_group = 'unknown'
                LIMIT 5
            """)
            exercises = [row[0] for row in cursor.fetchall()]
            logger.warning(f"   Examples: {', '.join(exercises)}")
            logger.warning(f"   → Add these to data/exercise_muscles.csv")
        
        conn.close()
        return all_good
    
    except sqlite3.Error as e:
        logger.error(f"❌ Error checking derived tables: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description='Test GarminSights data pipeline')
    parser.add_argument('--verbose', '-v', action='store_true',
                       help='Enable verbose output')
    parser.add_argument('--build', action='store_true',
                       help='Build derived tables as part of test')
    parser.add_argument('--db-path', type=str, default=None,
                       help='Override database path')
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    logger.info("="*60)
    logger.info("GarminSights Data Pipeline Test")
    logger.info("="*60)
    
    # Find database
    if args.db_path:
        db_path = args.db_path
        logger.info(f"Using specified database path: {db_path}")
    else:
        db_path = find_garmindb_database()
    
    if not db_path:
        logger.error("\n❌ DATABASE NOT FOUND")
        logger.error("\nNext steps:")
        logger.error("1. Activate GarminDB venv: cd garmin && .\\venv\\Scripts\\Activate.ps1")
        logger.error("2. Run GarminDB CLI to export data:")
        logger.error("   python scripts\\garmindb_cli.py --activities --download --import --analyze --latest")
        return 1
    
    # Run tests
    tests = [
        ("Database Connection", lambda: test_database_connection(db_path)),
        ("Activities Table", lambda: test_activities_table(db_path)),
        ("Exercise Mapping", test_exercise_mapping),
        ("JSON Files", lambda: find_activity_json_files()[1] is not None),
    ]
    
    results = {}
    for test_name, test_func in tests:
        try:
            results[test_name] = test_func()
        except Exception as e:
            logger.error(f"❌ {test_name} failed with exception: {e}")
            results[test_name] = False
    
    # Build derived tables if requested and previous tests passed
    if args.build and all(results.values()):
        results["Derived Tables Build"] = test_derived_tables_build(db_path)
        results["Derived Tables Data"] = test_derived_tables_data(db_path)
    elif args.build:
        logger.warning("\n⚠️  Skipping derived tables build due to previous test failures")
    else:
        # Just check if they exist
        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute("""
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name LIKE 'fact_%'
            """)
            existing_tables = [row[0] for row in cursor.fetchall()]
            conn.close()
            
            if existing_tables:
                logger.info("\n" + "="*60)
                logger.info("Derived Tables Status")
                logger.info("="*60)
                logger.info(f"Found existing tables: {', '.join(existing_tables)}")
                logger.info("Run with --build to rebuild or verify")
                results["Derived Tables Data"] = test_derived_tables_data(db_path)
            else:
                logger.warning("\n⚠️  No derived tables found")
                logger.warning("Run with --build to create them")
        except Exception as e:
            logger.error(f"Error checking derived tables: {e}")
    
    # Summary
    logger.info("\n" + "="*60)
    logger.info("Test Summary")
    logger.info("="*60)
    
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        logger.info(f"{status}: {test_name}")
    
    all_passed = all(results.values())
    
    if all_passed:
        logger.info("\n🎉 All tests passed! Data pipeline is ready.")
        return 0
    else:
        logger.error("\n⚠️  Some tests failed. Review the output above.")
        return 1


if __name__ == '__main__':
    sys.exit(main())

