"""SQLite database connection and schema management."""

import sqlite3
import json
from pathlib import Path
from contextlib import contextmanager
from typing import Generator, Any

from app.config import get_database_path


# SQL Schema
SCHEMA = """
-- activities: All activity types
CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    garmin_id TEXT UNIQUE NOT NULL,
    activity_type TEXT,
    name TEXT,
    start_time DATETIME,
    duration_seconds INTEGER,
    distance_meters REAL,
    calories INTEGER,
    raw_json TEXT
);

-- sleep: Daily sleep data
CREATE TABLE IF NOT EXISTS sleep (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE UNIQUE NOT NULL,
    sleep_score INTEGER,
    total_sleep_seconds INTEGER,
    deep_sleep_seconds INTEGER,
    light_sleep_seconds INTEGER,
    rem_sleep_seconds INTEGER,
    awake_seconds INTEGER,
    hrv_average REAL,
    resting_hr INTEGER,
    raw_json TEXT
);

-- dailies: Daily wellness metrics
CREATE TABLE IF NOT EXISTS dailies (
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
);

-- strength_sets: Extracted from strength_training activities
CREATE TABLE IF NOT EXISTS strength_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id INTEGER REFERENCES activities(id),
    exercise_name TEXT,
    set_number INTEGER,
    reps INTEGER,
    weight_kg REAL,
    duration_seconds INTEGER,
    raw_json TEXT
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_activities_start_time ON activities(start_time);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_sleep_date ON sleep(date);
CREATE INDEX IF NOT EXISTS idx_dailies_date ON dailies(date);
CREATE INDEX IF NOT EXISTS idx_strength_sets_activity ON strength_sets(activity_id);
CREATE INDEX IF NOT EXISTS idx_strength_sets_exercise ON strength_sets(exercise_name);
"""


def dict_factory(cursor: sqlite3.Cursor, row: tuple) -> dict:
    """Convert sqlite row to dictionary."""
    fields = [column[0] for column in cursor.description]
    return dict(zip(fields, row))


@contextmanager
def get_db() -> Generator[sqlite3.Connection, None, None]:
    """Get a database connection with row factory set to dict."""
    db_path = get_database_path()
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = dict_factory
    try:
        yield conn
    finally:
        conn.close()


def init_db() -> None:
    """Initialize the database with the schema and run migrations."""
    db_path = get_database_path()
    
    # Ensure parent directory exists
    db_path.parent.mkdir(parents=True, exist_ok=True)
    
    conn = sqlite3.connect(str(db_path))
    try:
        conn.executescript(SCHEMA)
        conn.commit()
        print(f"Database initialized at {db_path}")
    finally:
        conn.close()
    
    # Run migrations after schema initialization
    from app.migrations import run_migrations
    run_migrations()


def execute_query(query: str, params: tuple = ()) -> list[dict]:
    """Execute a SELECT query and return results as list of dicts."""
    with get_db() as conn:
        cursor = conn.execute(query, params)
        return cursor.fetchall()


def execute_write(query: str, params: tuple = ()) -> int:
    """Execute an INSERT/UPDATE/DELETE query and return lastrowid."""
    with get_db() as conn:
        cursor = conn.execute(query, params)
        conn.commit()
        return cursor.lastrowid


def execute_many(query: str, params_list: list[tuple]) -> None:
    """Execute a query with multiple parameter sets."""
    with get_db() as conn:
        conn.executemany(query, params_list)
        conn.commit()

