#!/usr/bin/env python3
"""
Build health, recovery, and performance derived tables for insights.

This script creates weekly aggregated tables from days_summary:
1. fact_health_weekly - Aggregated health metrics (sleep, HR, stress, steps)
2. fact_recovery_weekly - Recovery metrics (sleep quality, resting HR trends, stress patterns)
3. fact_performance_weekly - Activity performance metrics (pace, HR zones, intensity)
"""

import argparse
import logging
import os
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def get_week_start(date):
    """Get the Monday (week start) for a given date."""
    if isinstance(date, str):
        date = datetime.fromisoformat(date).date()
    days_since_monday = date.weekday()
    return date - timedelta(days=days_since_monday)


def find_summary_database():
    """Find GarminDB summary database."""
    homedir = os.path.expanduser('~')
    default_db_dir = os.path.join(homedir, 'HealthData', 'DBs')
    default_summary_path = os.path.join(default_db_dir, 'garmin_summary.db')
    
    # Project location
    project_root = Path(__file__).parent.parent
    project_summary_path = project_root / 'garmin' / 'garmin_summary.db'
    
    # Check both locations
    if os.path.exists(default_summary_path):
        return default_summary_path
    
    if project_summary_path.exists():
        return str(project_summary_path)
    
    # Return default path (will fail gracefully if doesn't exist)
    return default_summary_path


def find_activities_database():
    """Find GarminDB activities database."""
    homedir = os.path.expanduser('~')
    default_db_dir = os.path.join(homedir, 'HealthData', 'DBs')
    default_activities_path = os.path.join(default_db_dir, 'garmin_activities.db')
    
    # Project location
    project_root = Path(__file__).parent.parent
    project_activities_path = project_root / 'garmin' / 'garmin_activities.db'
    
    # Check both locations
    if os.path.exists(default_activities_path):
        return default_activities_path
    
    if project_activities_path.exists():
        return str(project_activities_path)
    
    return default_activities_path


def build_fact_health_weekly(summary_db_path):
    """Build fact_health_weekly table from days_summary."""
    logger.info("Building fact_health_weekly table...")
    
    conn = sqlite3.connect(summary_db_path)
    cursor = conn.cursor()
    
    # Create table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fact_health_weekly (
            week_start_date TEXT NOT NULL PRIMARY KEY,
            avg_sleep_hours REAL,
            avg_rem_sleep_hours REAL,
            avg_steps INTEGER,
            avg_hr INTEGER,
            avg_rhr INTEGER,
            avg_stress REAL,
            avg_bb_max INTEGER,
            avg_bb_min INTEGER,
            total_intensity_time_min REAL,
            avg_distance_km REAL,
            avg_floors INTEGER
        )
    """)
    
    # Clear existing data
    cursor.execute("DELETE FROM fact_health_weekly")
    
    # Check if days_summary table exists
    cursor.execute("""
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='days_summary'
    """)
    
    if not cursor.fetchone():
        logger.warning("days_summary table not found. Skipping fact_health_weekly.")
        conn.close()
        return
    
    # Aggregate weekly health metrics from days_summary
    cursor.execute("""
        SELECT 
            DATE(day, 'weekday 0', '-6 days') as week_start,
            AVG(CASE WHEN sleep_avg IS NOT NULL THEN 
                (CAST(substr(sleep_avg, 1, 2) AS INTEGER) * 60 + CAST(substr(sleep_avg, 4, 2) AS INTEGER)) / 60.0 
            END) as avg_sleep_hours,
            AVG(CASE WHEN rem_sleep_avg IS NOT NULL THEN 
                (CAST(substr(rem_sleep_avg, 1, 2) AS INTEGER) * 60 + CAST(substr(rem_sleep_avg, 4, 2) AS INTEGER)) / 60.0 
            END) as avg_rem_sleep_hours,
            AVG(steps) as avg_steps,
            AVG(hr_avg) as avg_hr,
            AVG(rhr_avg) as avg_rhr,
            AVG(stress_avg) as avg_stress,
            AVG(bb_max) as avg_bb_max,
            AVG(bb_min) as avg_bb_min,
            SUM(CASE WHEN intensity_time IS NOT NULL THEN 
                (CAST(substr(intensity_time, 1, 2) AS INTEGER) * 60 + CAST(substr(intensity_time, 4, 2) AS INTEGER)) 
            END) as total_intensity_time_min,
            AVG(distance) as avg_distance_km,
            AVG(floors) as avg_floors
        FROM days_summary
        WHERE day IS NOT NULL
        GROUP BY week_start
        ORDER BY week_start
    """)
    
    rows = cursor.fetchall()
    
    for row in rows:
        cursor.execute("""
            INSERT INTO fact_health_weekly 
            (week_start_date, avg_sleep_hours, avg_rem_sleep_hours, avg_steps, avg_hr, avg_rhr, 
             avg_stress, avg_bb_max, avg_bb_min, total_intensity_time_min, avg_distance_km, avg_floors)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, row)
    
    conn.commit()
    logger.info(f"Inserted {len(rows)} health-week records")
    conn.close()


def build_fact_recovery_weekly(summary_db_path):
    """Build fact_recovery_weekly table from days_summary."""
    logger.info("Building fact_recovery_weekly table...")
    
    conn = sqlite3.connect(summary_db_path)
    cursor = conn.cursor()
    
    # Create table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fact_recovery_weekly (
            week_start_date TEXT NOT NULL PRIMARY KEY,
            avg_sleep_quality REAL,
            avg_rhr_trend REAL,
            avg_stress_level REAL,
            avg_bb_range INTEGER,
            recovery_score REAL,
            rest_days INTEGER,
            active_days INTEGER
        )
    """)
    
    # Clear existing data
    cursor.execute("DELETE FROM fact_recovery_weekly")
    
    # Check if days_summary table exists
    cursor.execute("""
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='days_summary'
    """)
    
    if not cursor.fetchone():
        logger.warning("days_summary table not found. Skipping fact_recovery_weekly.")
        conn.close()
        return
    
    # Calculate recovery metrics
    # Sleep quality: rem_sleep / total_sleep ratio
    # Recovery score: composite of sleep, stress, and body battery
    cursor.execute("""
        SELECT 
            DATE(day, 'weekday 0', '-6 days') as week_start,
            AVG(CASE 
                WHEN sleep_avg IS NOT NULL AND rem_sleep_avg IS NOT NULL THEN
                    (CAST(substr(rem_sleep_avg, 1, 2) AS INTEGER) * 60 + CAST(substr(rem_sleep_avg, 4, 2) AS INTEGER)) /
                    NULLIF(CAST(substr(sleep_avg, 1, 2) AS INTEGER) * 60 + CAST(substr(sleep_avg, 4, 2) AS INTEGER), 0)
            END) as avg_sleep_quality,
            AVG(rhr_avg) as avg_rhr_trend,
            AVG(stress_avg) as avg_stress_level,
            AVG(bb_max - bb_min) as avg_bb_range,
            COUNT(CASE WHEN steps < 5000 THEN 1 END) as rest_days,
            COUNT(CASE WHEN steps >= 5000 THEN 1 END) as active_days
        FROM days_summary
        WHERE day IS NOT NULL
        GROUP BY week_start
        ORDER BY week_start
    """)
    
    rows = cursor.fetchall()
    
    for row in rows:
        week_start, sleep_quality, rhr_trend, stress_level, bb_range, rest_days, active_days = row
        
        # Calculate recovery score (0-100)
        # Higher sleep quality, lower stress, higher body battery range = better recovery
        recovery_score = None
        if sleep_quality is not None and stress_level is not None and bb_range is not None:
            # Normalize components (rough estimates)
            sleep_component = min(100, (sleep_quality or 0) * 200) if sleep_quality else 50
            stress_component = max(0, 100 - (stress_level or 50))
            bb_component = min(100, (bb_range or 0) * 0.5)
            recovery_score = (sleep_component * 0.4 + stress_component * 0.3 + bb_component * 0.3)
        
        cursor.execute("""
            INSERT INTO fact_recovery_weekly 
            (week_start_date, avg_sleep_quality, avg_rhr_trend, avg_stress_level, 
             avg_bb_range, recovery_score, rest_days, active_days)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (week_start, sleep_quality, rhr_trend, stress_level, bb_range, recovery_score, rest_days, active_days))
    
    conn.commit()
    logger.info(f"Inserted {len(rows)} recovery-week records")
    conn.close()


def build_fact_performance_weekly(activities_db_path):
    """Build fact_performance_weekly table from activities."""
    logger.info("Building fact_performance_weekly table...")
    
    conn = sqlite3.connect(activities_db_path)
    cursor = conn.cursor()
    
    # Create table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fact_performance_weekly (
            week_start_date TEXT NOT NULL,
            activity_type TEXT NOT NULL,
            avg_pace_min_per_km REAL,
            avg_hr INTEGER,
            max_hr INTEGER,
            avg_speed_kmh REAL,
            total_distance_km REAL,
            total_duration_min REAL,
            total_sessions INTEGER,
            avg_training_load REAL,
            PRIMARY KEY (week_start_date, activity_type)
        )
    """)
    
    # Clear existing data
    cursor.execute("DELETE FROM fact_performance_weekly")
    
    # Check if activities table exists
    cursor.execute("""
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='activities'
    """)
    
    if not cursor.fetchone():
        logger.warning("activities table not found. Skipping fact_performance_weekly.")
        conn.close()
        return
    
    # Aggregate performance metrics by week and activity type
    cursor.execute("""
        SELECT 
            DATE(start_time, 'weekday 0', '-6 days') as week_start,
            sport as activity_type,
            AVG(CASE WHEN avg_pace IS NOT NULL THEN 
                (CAST(substr(avg_pace, 1, 2) AS INTEGER) * 60 + CAST(substr(avg_pace, 4, 2) AS INTEGER)) / (distance / 1000.0)
            END) as avg_pace_min_per_km,
            AVG(avg_hr) as avg_hr,
            MAX(max_hr) as max_hr,
            AVG(avg_speed) as avg_speed_kmh,
            SUM(distance) / 1000.0 as total_distance_km,
            SUM(CAST((julianday(stop_time) - julianday(start_time)) * 24 * 60 AS REAL)) as total_duration_min,
            COUNT(*) as total_sessions,
            AVG(training_load) as avg_training_load
        FROM activities
        WHERE start_time IS NOT NULL
        GROUP BY week_start, sport
        ORDER BY week_start, sport
    """)
    
    rows = cursor.fetchall()
    
    for row in rows:
        cursor.execute("""
            INSERT INTO fact_performance_weekly 
            (week_start_date, activity_type, avg_pace_min_per_km, avg_hr, max_hr, 
             avg_speed_kmh, total_distance_km, total_duration_min, total_sessions, avg_training_load)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, row)
    
    conn.commit()
    logger.info(f"Inserted {len(rows)} performance-week records")
    conn.close()


def main():
    parser = argparse.ArgumentParser(description='Build health, recovery, and performance derived tables')
    parser.add_argument('--summary-db-path', type=str, default=None,
                       help='Path to GarminDB summary database (auto-detected if not provided)')
    parser.add_argument('--activities-db-path', type=str, default=None,
                       help='Path to GarminDB activities database (auto-detected if not provided)')
    parser.add_argument('--dry-run', action='store_true',
                       help='Show what would be done without making changes')
    
    args = parser.parse_args()
    
    # Auto-detect databases if not provided
    if args.summary_db_path:
        summary_db_path = args.summary_db_path
    else:
        summary_db_path = find_summary_database()
    
    if args.activities_db_path:
        activities_db_path = args.activities_db_path
    else:
        activities_db_path = find_activities_database()
    
    logger.info(f"Summary database: {summary_db_path}")
    logger.info(f"Activities database: {activities_db_path}")
    
    # Check if databases exist
    if not os.path.exists(summary_db_path):
        logger.error(f"Summary database not found at {summary_db_path}")
        logger.error("Please run GarminDB CLI with --analyze flag to create summary tables")
        return 1
    
    if not os.path.exists(activities_db_path):
        logger.error(f"Activities database not found at {activities_db_path}")
        logger.error("Please run GarminDB CLI to export activities data first")
        return 1
    
    if args.dry_run:
        logger.info("DRY RUN MODE - No changes will be made")
        return 0
    
    # Build derived tables
    try:
        build_fact_health_weekly(summary_db_path)
        build_fact_recovery_weekly(summary_db_path)
        build_fact_performance_weekly(activities_db_path)
        
        logger.info("✅ Health, recovery, and performance tables built successfully!")
        return 0
    except Exception as e:
        logger.error(f"Error building health tables: {e}", exc_info=True)
        return 1


if __name__ == '__main__':
    sys.exit(main())

