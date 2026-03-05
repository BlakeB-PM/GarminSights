"""Seed the demo database with realistic dummy data for local development and UI testing.

Always writes to the demo database (fitness_demo.db) so production data is
never touched.  The app must be started with DEMO_MODE=true to read from it.

Usage:
    cd backend && python3 seed_data.py

Generates ~16 weeks of:
  - Strength training workouts (3-4/week) with progressive overload
  - Running activities (2-3/week)
  - Cycling activities (1-2/week)
  - Daily sleep records
  - Daily wellness metrics
"""

import json
import os
import random
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path

os.environ["DEMO_MODE"] = "true"

from app.config import get_database_path
from app.database import init_db

random.seed(42)

WEEKS = 16
TODAY = date.today()
START_DATE = TODAY - timedelta(weeks=WEEKS)

# ---------------------------------------------------------------------------
# Workout templates: each maps to exercises that hit specific muscle groups
# via the keyword matching in muscle_mapping.py
# ---------------------------------------------------------------------------

PUSH_EXERCISES = [
    ("Bench Press", 135, 10),
    ("Incline Bench Press", 115, 10),
    ("Overhead Press", 85, 8),
    ("Lateral Raise", 20, 12),
    ("Tricep Pushdown", 50, 12),
    ("Cable Fly", 30, 12),
]

PULL_EXERCISES = [
    ("Barbell Row", 135, 10),
    ("Lat Pulldown", 120, 10),
    ("Cable Row", 100, 12),
    ("Face Pull", 40, 15),
    ("Barbell Curl", 65, 10),
    ("Hammer Curl", 30, 10),
]

LEG_EXERCISES = [
    ("Squat", 185, 8),
    ("Romanian Deadlift", 155, 10),
    ("Leg Press", 270, 12),
    ("Leg Curl", 80, 12),
    ("Calf Raise", 135, 15),
    ("Hip Thrust", 135, 10),
]

FULL_BODY_EXERCISES = [
    ("Deadlift", 225, 5),
    ("Bench Press", 135, 8),
    ("Squat", 185, 6),
    ("Pull Up", 0, 8),
    ("Plank", 0, 1),
    ("Lunge", 50, 10),
]

UPPER_EXERCISES = [
    ("Bench Press", 135, 10),
    ("Barbell Row", 135, 10),
    ("Overhead Press", 85, 8),
    ("Lat Pulldown", 120, 10),
    ("Dumbbell Curl", 30, 10),
    ("Skull Crusher", 55, 10),
]

WORKOUT_SPLITS = [
    ("Push Day", PUSH_EXERCISES),
    ("Pull Day", PULL_EXERCISES),
    ("Leg Day", LEG_EXERCISES),
    ("Full Body", FULL_BODY_EXERCISES),
    ("Upper Body", UPPER_EXERCISES),
]


def _jitter(value: float, pct: float = 0.10) -> float:
    return round(value * random.uniform(1 - pct, 1 + pct), 1)


def _progress(base_weight: float, week_index: int) -> float:
    """Simulate progressive overload: ~1-2% increase per week with noise."""
    return round(base_weight * (1 + 0.012 * week_index) * random.uniform(0.95, 1.05), 1)


def generate_activities_and_sets(conn: sqlite3.Connection) -> None:
    activity_id = 0
    current = START_DATE

    while current <= TODAY:
        week_index = (current - START_DATE).days // 7
        weekday = current.weekday()

        # Strength: Mon(0), Wed(2), Fri(4), sometimes Sat(5)
        if weekday in (0, 2, 4) or (weekday == 5 and random.random() < 0.4):
            split_name, exercises = WORKOUT_SPLITS[activity_id % len(WORKOUT_SPLITS)]
            start = datetime.combine(current, datetime.min.time().replace(hour=random.randint(6, 9), minute=random.randint(0, 59)))
            duration = random.randint(2700, 4500)
            garmin_id = f"strength-{activity_id}"

            conn.execute(
                "INSERT INTO activities (garmin_id, activity_type, name, start_time, duration_seconds, calories, raw_json) VALUES (?,?,?,?,?,?,?)",
                (garmin_id, "strength_training", split_name, start.isoformat(), duration, random.randint(250, 500), "{}"),
            )
            db_activity_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

            for exercise_name, base_weight, base_reps in exercises:
                num_sets = random.randint(3, 4)
                for s in range(1, num_sets + 1):
                    weight = _progress(base_weight, week_index) if base_weight > 0 else 0
                    reps = max(1, base_reps + random.randint(-2, 1))
                    conn.execute(
                        "INSERT INTO strength_sets (activity_id, exercise_name, set_number, reps, weight_lbs, raw_json) VALUES (?,?,?,?,?,?)",
                        (db_activity_id, exercise_name, s, reps, weight, "{}"),
                    )
            activity_id += 1

        # Running: Tue(1), Thu(3), sometimes Sun(6)
        if weekday in (1, 3) or (weekday == 6 and random.random() < 0.5):
            start = datetime.combine(current, datetime.min.time().replace(hour=random.randint(6, 8), minute=random.randint(0, 59)))
            distance = random.uniform(3000, 10000)
            pace_per_km = random.uniform(280, 360)
            duration = int((distance / 1000) * pace_per_km)
            calories = int(distance / 1000 * random.uniform(70, 90))
            garmin_id = f"run-{activity_id}"

            raw = json.dumps({
                "averageSpeed": round(1000 / pace_per_km, 2),
                "maxSpeed": round(1000 / (pace_per_km * random.uniform(0.75, 0.9)), 2),
                "averageHR": random.randint(140, 165),
                "maxHR": random.randint(170, 190),
                "elevationGain": round(random.uniform(10, 80), 1),
                "elevationLoss": round(random.uniform(10, 80), 1),
            })

            conn.execute(
                "INSERT INTO activities (garmin_id, activity_type, name, start_time, duration_seconds, distance_meters, calories, raw_json) VALUES (?,?,?,?,?,?,?,?)",
                (garmin_id, "running", "Running", start.isoformat(), duration, round(distance, 1), calories, raw),
            )
            activity_id += 1

        # Cycling: Sat(5) or Sun(6)
        if weekday in (5, 6) and random.random() < 0.45:
            start = datetime.combine(current, datetime.min.time().replace(hour=random.randint(8, 11), minute=random.randint(0, 59)))
            distance = random.uniform(15000, 50000)
            speed_mps = random.uniform(5.5, 8.5)
            duration = int(distance / speed_mps)
            calories = int(distance / 1000 * random.uniform(25, 40))
            garmin_id = f"ride-{activity_id}"

            raw = json.dumps({
                "averageSpeed": round(speed_mps, 2),
                "maxSpeed": round(speed_mps * random.uniform(1.2, 1.6), 2),
                "averagePower": random.randint(140, 220),
                "maxPower": random.randint(350, 700),
                "normalizedPower": random.randint(160, 240),
                "averageHR": random.randint(130, 155),
                "maxHR": random.randint(165, 185),
                "averageCadence": random.randint(78, 95),
                "elevationGain": round(random.uniform(50, 400), 1),
                "elevationLoss": round(random.uniform(50, 400), 1),
            })

            conn.execute(
                "INSERT INTO activities (garmin_id, activity_type, name, start_time, duration_seconds, distance_meters, calories, raw_json) VALUES (?,?,?,?,?,?,?,?)",
                (garmin_id, "cycling", "Cycling", start.isoformat(), duration, round(distance, 1), calories, raw),
            )
            activity_id += 1

        current += timedelta(days=1)

    conn.commit()


def generate_sleep(conn: sqlite3.Connection) -> None:
    current = START_DATE
    rows = []
    while current <= TODAY:
        total = random.randint(5 * 3600, 9 * 3600)
        deep = int(total * random.uniform(0.12, 0.22))
        rem = int(total * random.uniform(0.18, 0.28))
        awake = random.randint(600, 3600)
        light = total - deep - rem - awake

        rows.append((
            current.isoformat(),
            random.randint(55, 95),
            total,
            deep,
            max(light, 0),
            rem,
            awake,
            round(random.uniform(25, 70), 1),
            random.randint(48, 68),
            "{}",
        ))
        current += timedelta(days=1)

    conn.executemany(
        "INSERT OR IGNORE INTO sleep (date, sleep_score, total_sleep_seconds, deep_sleep_seconds, light_sleep_seconds, rem_sleep_seconds, awake_seconds, hrv_average, resting_hr, raw_json) VALUES (?,?,?,?,?,?,?,?,?,?)",
        rows,
    )
    conn.commit()


def generate_dailies(conn: sqlite3.Connection) -> None:
    current = START_DATE
    rows = []
    while current <= TODAY:
        weekday = current.weekday()
        is_active_day = weekday in (0, 1, 2, 3, 4, 5)
        steps = random.randint(6000, 15000) if is_active_day else random.randint(2000, 8000)
        distance = steps * random.uniform(0.7, 0.85)
        active_cal = random.randint(300, 900) if is_active_day else random.randint(100, 400)
        bmr = random.randint(1600, 1900)
        total_cal = bmr + active_cal

        bb_high = random.randint(60, 100)
        bb_low = random.randint(5, 40)
        stress_avg = random.randint(20, 55)

        rows.append((
            current.isoformat(),
            steps,
            round(distance, 1),
            active_cal,
            total_cal,
            bmr,
            bb_high,
            bb_low,
            random.randint(20, 60),
            random.randint(30, 70),
            stress_avg,
            stress_avg + random.randint(5, 25),
            random.randint(100, 400),
            random.randint(60, 300),
            random.randint(10, 120),
            random.randint(200, 600),
            random.randint(10, 90),
            random.randint(10, 60) if is_active_day else random.randint(0, 15),
            random.randint(5, 40) if is_active_day else random.randint(0, 10),
            random.randint(30, 60),
            random.randint(60, 85),
            random.randint(100, 180),
            random.randint(45, 60),
            random.randint(48, 68),
            "{}",
        ))
        current += timedelta(days=1)

    conn.executemany(
        """INSERT OR IGNORE INTO dailies
        (date, steps, distance_meters, active_calories, calories_total, calories_bmr,
         body_battery_high, body_battery_low, body_battery_charged, body_battery_drained,
         stress_average, stress_high,
         low_stress_duration, medium_stress_duration, high_stress_duration,
         rest_stress_duration, activity_stress_duration,
         intensity_minutes_moderate, intensity_minutes_vigorous, intensity_minutes_goal,
         avg_heart_rate, max_heart_rate, min_heart_rate, resting_heart_rate,
         raw_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        rows,
    )
    conn.commit()


def main() -> None:
    db_path = get_database_path()
    if db_path.exists():
        db_path.unlink()
        print(f"Removed existing database at {db_path}")

    init_db()

    conn = sqlite3.connect(str(db_path))
    try:
        generate_activities_and_sets(conn)
        generate_sleep(conn)
        generate_dailies(conn)

        counts = {
            "activities": conn.execute("SELECT COUNT(*) FROM activities").fetchone()[0],
            "strength_sets": conn.execute("SELECT COUNT(*) FROM strength_sets").fetchone()[0],
            "sleep": conn.execute("SELECT COUNT(*) FROM sleep").fetchone()[0],
            "dailies": conn.execute("SELECT COUNT(*) FROM dailies").fetchone()[0],
        }
        strength = conn.execute("SELECT COUNT(*) FROM activities WHERE activity_type = 'strength_training'").fetchone()[0]
        running = conn.execute("SELECT COUNT(*) FROM activities WHERE activity_type = 'running'").fetchone()[0]
        cycling = conn.execute("SELECT COUNT(*) FROM activities WHERE activity_type = 'cycling'").fetchone()[0]

        print(f"\nSeeded database at {db_path}")
        print(f"  Activities : {counts['activities']} (strength={strength}, running={running}, cycling={cycling})")
        print(f"  Strength sets: {counts['strength_sets']}")
        print(f"  Sleep records: {counts['sleep']}")
        print(f"  Daily records: {counts['dailies']}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
