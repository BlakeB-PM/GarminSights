"""Demo data generator for GarminSights.

Populates the SQLite database with realistic mock fitness data so
all charts and analytics pages render with meaningful content.
"""

import json
import random
import math
from datetime import datetime, timedelta, date
from typing import Any

from app.database import execute_query, execute_write, execute_many, get_db

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

_demo_active = False

DEMO_GARMIN_PREFIX = "DEMO_"


def is_demo_active() -> bool:
    return _demo_active


def set_demo_active(active: bool) -> None:
    global _demo_active
    _demo_active = active


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _rand_between(low: float, high: float) -> float:
    return low + random.random() * (high - low)


def _date_range(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


# ---------------------------------------------------------------------------
# Activity templates
# ---------------------------------------------------------------------------

STRENGTH_WORKOUTS = [
    {
        "name": "Upper Body Strength",
        "exercises": [
            ("BARBELL_BENCH_PRESS", 4, (135, 225), (5, 10)),
            ("DUMBBELL_SHOULDER_PRESS", 3, (35, 65), (8, 12)),
            ("LAT_PULLDOWN", 3, (100, 160), (8, 12)),
            ("CABLE_ROW", 3, (90, 150), (8, 12)),
            ("DUMBBELL_CURL", 3, (25, 45), (8, 15)),
            ("TRICEP_PUSHDOWN", 3, (40, 80), (10, 15)),
        ],
        "duration_range": (3000, 4200),
        "calories_range": (280, 420),
    },
    {
        "name": "Lower Body Power",
        "exercises": [
            ("BARBELL_SQUAT", 4, (155, 315), (4, 8)),
            ("ROMANIAN_DEADLIFT", 3, (135, 225), (6, 10)),
            ("LEG_PRESS", 3, (200, 400), (8, 12)),
            ("LEG_CURL", 3, (60, 120), (8, 12)),
            ("CALF_RAISE", 3, (100, 200), (12, 20)),
        ],
        "duration_range": (2700, 3900),
        "calories_range": (320, 480),
    },
    {
        "name": "Push Day",
        "exercises": [
            ("BARBELL_BENCH_PRESS", 4, (155, 245), (4, 8)),
            ("INCLINE_DUMBBELL_PRESS", 3, (50, 80), (8, 12)),
            ("OVERHEAD_PRESS", 3, (85, 145), (5, 8)),
            ("LATERAL_RAISE", 3, (15, 30), (10, 15)),
            ("TRICEP_EXTENSION", 3, (30, 60), (10, 15)),
            ("CABLE_FLY", 3, (20, 40), (10, 15)),
        ],
        "duration_range": (3000, 4500),
        "calories_range": (300, 450),
    },
    {
        "name": "Pull Day",
        "exercises": [
            ("BARBELL_DEADLIFT", 4, (185, 365), (3, 6)),
            ("BARBELL_ROW", 3, (115, 195), (6, 10)),
            ("PULL_UP", 3, (0, 45), (5, 12)),
            ("FACE_PULL", 3, (30, 60), (12, 20)),
            ("BARBELL_CURL", 3, (45, 85), (8, 12)),
            ("HAMMER_CURL", 3, (25, 45), (8, 12)),
        ],
        "duration_range": (3000, 4200),
        "calories_range": (340, 500),
    },
]

CYCLING_NAMES = [
    "Morning Ride", "Evening Spin", "Zwift Race", "Recovery Ride",
    "Tempo Intervals", "Zone 2 Endurance", "Hill Repeats",
    "Sweet Spot Training", "Indoor Cycling",
]

RUNNING_NAMES = [
    "Morning Run", "Easy Recovery Run", "Tempo Run",
    "Long Run", "Interval Training",
]


# ---------------------------------------------------------------------------
# Data generation
# ---------------------------------------------------------------------------

def _generate_cycling_raw_json(duration_seconds: int, distance_meters: float,
                                day_index: int) -> dict:
    """Generate realistic cycling raw_json metrics."""
    base_power = 160 + day_index * 0.3
    avg_power = base_power + _rand_between(-20, 20)
    np_power = avg_power * _rand_between(1.02, 1.12)
    max_power = avg_power * _rand_between(1.8, 2.5)
    cadence = _rand_between(78, 98)
    avg_hr = int(_rand_between(130, 165))
    max_hr = int(avg_hr + _rand_between(15, 35))

    max_20min = avg_power * _rand_between(1.05, 1.25)

    power_curve = {}
    for interval_sec in [1, 2, 5, 10, 20, 30, 60, 120, 300, 600, 1200, 1800]:
        decay = math.log(max(interval_sec, 1) + 1) / math.log(1800)
        power_curve[str(interval_sec)] = int(max_power * (1 - decay * 0.55) + _rand_between(-10, 10))

    zone_total = duration_seconds
    z2_pct = _rand_between(0.30, 0.50)
    z3_pct = _rand_between(0.15, 0.25)
    z4_pct = _rand_between(0.08, 0.18)
    z5_pct = _rand_between(0.02, 0.08)
    z6_pct = _rand_between(0.01, 0.04)
    z7_pct = _rand_between(0.0, 0.02)
    z1_pct = max(0, 1 - z2_pct - z3_pct - z4_pct - z5_pct - z6_pct - z7_pct)

    power_zones = {
        "zone_1": int(zone_total * z1_pct),
        "zone_2": int(zone_total * z2_pct),
        "zone_3": int(zone_total * z3_pct),
        "zone_4": int(zone_total * z4_pct),
        "zone_5": int(zone_total * z5_pct),
        "zone_6": int(zone_total * z6_pct),
        "zone_7": int(zone_total * z7_pct),
    }

    # Build raw_json matching the keys that activity_parser.py expects.
    # The parser checks top-level keys for virtual/indoor cycling activities.
    raw: dict[str, Any] = {
        "summaryDTO": {
            "averagePower": avg_power,
            "normalizedPower": np_power,
            "maxPower": max_power,
            "averageBikeCadenceInRevPerMinute": cadence,
            "averageHR": avg_hr,
            "maxHR": max_hr,
            "minHR": int(avg_hr - _rand_between(20, 40)),
            "restingHR": int(_rand_between(48, 58)),
            "totalAscent": _rand_between(50, 500),
            "totalDescent": _rand_between(50, 500),
            "averageSpeed": distance_meters / duration_seconds if duration_seconds else 0,
            "maxSpeed": (distance_meters / duration_seconds * _rand_between(1.5, 2.2)) if duration_seconds else 0,
        },
        # Top-level keys the parser also checks for cycling
        "max20MinPower": max_20min,
        "averageBikingCadenceInRevPerMinute": int(cadence),
        "maxBikingCadenceInRevPerMinute": int(cadence + _rand_between(5, 20)),
    }

    # Power curve: parser looks for maxAvgPower_{interval} at top level
    for interval_str, watts in power_curve.items():
        raw[f"maxAvgPower_{interval_str}"] = watts

    # Power zones: parser looks for powerTimeInZone_{n} at top level
    for i in range(1, 8):
        raw[f"powerTimeInZone_{i}"] = power_zones.get(f"zone_{i}", 0)

    return raw


def generate_demo_data(days_back: int = 90) -> dict[str, int]:
    """Generate and insert demo data into the database.

    Returns counts of inserted records.
    """
    random.seed(42)
    today = date.today()
    start_date = today - timedelta(days=days_back)

    counts: dict[str, int] = {
        "activities": 0,
        "sleep": 0,
        "dailies": 0,
        "strength_sets": 0,
    }

    # ----- Sleep data (daily) -----
    sleep_rows = []
    for d in _date_range(start_date, today):
        day_idx = (d - start_date).days
        base_score = 72 + 8 * math.sin(day_idx / 14 * math.pi)
        sleep_score = int(base_score + _rand_between(-8, 8))
        sleep_score = max(45, min(98, sleep_score))

        total_sleep = int(_rand_between(5.5, 8.5) * 3600)
        deep_pct = _rand_between(0.12, 0.22)
        rem_pct = _rand_between(0.18, 0.28)
        awake_pct = _rand_between(0.02, 0.08)
        light_pct = max(0, 1 - deep_pct - rem_pct - awake_pct)

        hrv = round(35 + 15 * math.sin(day_idx / 10 * math.pi) + _rand_between(-8, 8), 1)
        hrv = max(18, min(75, hrv))
        resting_hr = int(52 + _rand_between(-4, 6))

        sleep_rows.append((
            d.isoformat(), sleep_score, total_sleep,
            int(total_sleep * deep_pct), int(total_sleep * light_pct),
            int(total_sleep * rem_pct), int(total_sleep * awake_pct),
            hrv, resting_hr, None,
        ))

    with get_db() as conn:
        conn.executemany(
            """INSERT OR IGNORE INTO sleep
               (date, sleep_score, total_sleep_seconds, deep_sleep_seconds,
                light_sleep_seconds, rem_sleep_seconds, awake_seconds,
                hrv_average, resting_hr, raw_json)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            sleep_rows,
        )
        conn.commit()
    counts["sleep"] = len(sleep_rows)

    # ----- Dailies data (daily) -----
    daily_rows = []
    for d in _date_range(start_date, today):
        day_idx = (d - start_date).days
        is_weekend = d.weekday() >= 5

        steps = int(_rand_between(6000, 14000) if not is_weekend else _rand_between(3500, 10000))
        bb_high = int(_rand_between(60, 100))
        bb_low = int(_rand_between(10, 40))
        stress_avg = int(30 + _rand_between(-10, 20))
        stress_high = int(stress_avg + _rand_between(15, 40))

        low_stress = int(_rand_between(10000, 25000))
        med_stress = int(_rand_between(5000, 15000))
        high_stress = int(_rand_between(1000, 8000))
        rest_stress = int(_rand_between(20000, 32000))
        act_stress = int(_rand_between(1000, 5000))

        daily_rows.append((
            d.isoformat(), steps, steps * 0.75,
            int(_rand_between(200, 600)), int(_rand_between(1800, 2800)),
            int(_rand_between(1400, 1700)),
            bb_high, bb_low,
            int(_rand_between(30, 60)), int(_rand_between(20, 50)),
            stress_avg, stress_high,
            low_stress, med_stress, high_stress, rest_stress, act_stress,
            int(_rand_between(10, 40)), int(_rand_between(0, 25)), 150,
            int(_rand_between(62, 82)), int(_rand_between(100, 160)),
            int(_rand_between(45, 60)), int(_rand_between(50, 62)),
            None,
        ))

    with get_db() as conn:
        conn.executemany(
            """INSERT OR IGNORE INTO dailies
               (date, steps, distance_meters,
                active_calories, calories_total, calories_bmr,
                body_battery_high, body_battery_low,
                body_battery_charged, body_battery_drained,
                stress_average, stress_high,
                low_stress_duration, medium_stress_duration,
                high_stress_duration, rest_stress_duration, activity_stress_duration,
                intensity_minutes_moderate, intensity_minutes_vigorous, intensity_minutes_goal,
                avg_heart_rate, max_heart_rate, min_heart_rate, resting_heart_rate,
                raw_json)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            daily_rows,
        )
        conn.commit()
    counts["dailies"] = len(daily_rows)

    # ----- Activities & strength sets -----
    # Schedule: iterate day by day, assign workouts
    activity_rows: list[tuple] = []
    strength_set_rows: list[tuple] = []
    activity_id_counter = 1000

    for d in _date_range(start_date, today):
        day_idx = (d - start_date).days
        weekday = d.weekday()  # 0=Mon

        workouts_today: list[dict[str, Any]] = []

        # Strength: Mon, Wed, Fri  (weekday 0, 2, 4)
        if weekday in (0, 2, 4):
            template = STRENGTH_WORKOUTS[day_idx % len(STRENGTH_WORKOUTS)]
            workouts_today.append({
                "type": "strength_training",
                "template": template,
            })

        # Cycling: Tue, Thu, Sat  (weekday 1, 3, 5)
        if weekday in (1, 3, 5):
            workouts_today.append({"type": "cycling"})

        # Running: Sunday  (weekday 6) – ~60% chance
        if weekday == 6 and random.random() < 0.6:
            workouts_today.append({"type": "running"})

        # Occasional extra yoga (Wed, ~30% chance)
        if weekday == 2 and random.random() < 0.3:
            workouts_today.append({"type": "yoga"})

        for workout in workouts_today:
            garmin_id = f"{DEMO_GARMIN_PREFIX}{activity_id_counter}"
            activity_id_counter += 1
            hour = random.choice([6, 7, 8, 16, 17, 18])
            start_time = datetime(d.year, d.month, d.day, hour,
                                  random.randint(0, 59))

            if workout["type"] == "strength_training":
                tmpl = workout["template"]
                duration = int(_rand_between(*tmpl["duration_range"]))
                calories = int(_rand_between(*tmpl["calories_range"]))

                activity_rows.append((
                    garmin_id, "strength_training", tmpl["name"],
                    start_time.isoformat(), duration, None, calories, None,
                ))

            elif workout["type"] == "cycling":
                duration = int(_rand_between(2400, 5400))
                distance = _rand_between(15000, 50000)
                calories = int(duration / 60 * _rand_between(7, 12))
                raw = _generate_cycling_raw_json(duration, distance, day_idx)

                activity_rows.append((
                    garmin_id, "cycling",
                    random.choice(CYCLING_NAMES),
                    start_time.isoformat(), duration, distance, calories,
                    json.dumps(raw),
                ))

            elif workout["type"] == "running":
                duration = int(_rand_between(1800, 4200))
                pace_mps = _rand_between(2.5, 4.0)
                distance = pace_mps * duration
                calories = int(duration / 60 * _rand_between(9, 14))

                activity_rows.append((
                    garmin_id, "running",
                    random.choice(RUNNING_NAMES),
                    start_time.isoformat(), duration, distance, calories, None,
                ))

            elif workout["type"] == "yoga":
                duration = int(_rand_between(2400, 3600))
                calories = int(duration / 60 * _rand_between(3, 5))

                activity_rows.append((
                    garmin_id, "yoga", "Morning Yoga Flow",
                    start_time.isoformat(), duration, None, calories, None,
                ))

    # Insert activities
    with get_db() as conn:
        conn.executemany(
            """INSERT OR IGNORE INTO activities
               (garmin_id, activity_type, name, start_time,
                duration_seconds, distance_meters, calories, raw_json)
               VALUES (?,?,?,?,?,?,?,?)""",
            activity_rows,
        )
        conn.commit()
    counts["activities"] = len(activity_rows)

    # Retrieve inserted activity IDs for strength sets
    demo_activities = execute_query(
        "SELECT id, garmin_id, activity_type, start_time FROM activities WHERE garmin_id LIKE ?",
        (f"{DEMO_GARMIN_PREFIX}%",),
    )

    # Build a lookup: garmin_id -> db id
    gid_to_id: dict[str, int] = {a["garmin_id"]: a["id"] for a in demo_activities}

    # Generate strength sets
    set_id = 0
    for row_idx, row in enumerate(activity_rows):
        garmin_id = row[0]
        activity_type = row[1]
        if activity_type != "strength_training":
            continue

        db_id = gid_to_id.get(garmin_id)
        if db_id is None:
            continue

        # Find which template was used
        day_for_row = start_date + timedelta(days=row_idx // 4)  # approximate
        tmpl_idx = 0
        # Recover template from activity name
        act_name = row[2]
        for i, t in enumerate(STRENGTH_WORKOUTS):
            if t["name"] == act_name:
                tmpl_idx = i
                break
        tmpl = STRENGTH_WORKOUTS[tmpl_idx]

        # Calculate a day_index for progressive overload
        start_dt_str = row[3]
        try:
            act_date = datetime.fromisoformat(start_dt_str).date()
            day_idx = (act_date - start_date).days
        except Exception:
            day_idx = 0

        for exercise_name, num_sets, weight_range, rep_range in tmpl["exercises"]:
            progression = day_idx / days_back * 0.15
            for s in range(1, num_sets + 1):
                base_weight = _rand_between(*weight_range)
                weight = round(base_weight * (1 + progression), 1)
                reps = int(_rand_between(*rep_range))
                set_duration = int(_rand_between(20, 60))

                strength_set_rows.append((
                    db_id, exercise_name, s, reps, weight, set_duration, None,
                ))

    with get_db() as conn:
        conn.executemany(
            """INSERT INTO strength_sets
               (activity_id, exercise_name, set_number, reps, weight_lbs,
                duration_seconds, raw_json)
               VALUES (?,?,?,?,?,?,?)""",
            strength_set_rows,
        )
        conn.commit()
    counts["strength_sets"] = len(strength_set_rows)

    set_demo_active(True)
    return counts


def clear_demo_data() -> dict[str, int]:
    """Remove all demo data from the database."""
    counts: dict[str, int] = {}

    # Delete strength sets linked to demo activities
    demo_ids = execute_query(
        "SELECT id FROM activities WHERE garmin_id LIKE ?",
        (f"{DEMO_GARMIN_PREFIX}%",),
    )
    if demo_ids:
        id_list = ",".join(str(r["id"]) for r in demo_ids)
        with get_db() as conn:
            cursor = conn.execute(f"DELETE FROM strength_sets WHERE activity_id IN ({id_list})")
            counts["strength_sets"] = cursor.rowcount
            conn.commit()
    else:
        counts["strength_sets"] = 0

    # Delete demo activities
    with get_db() as conn:
        cursor = conn.execute(
            "DELETE FROM activities WHERE garmin_id LIKE ?",
            (f"{DEMO_GARMIN_PREFIX}%",),
        )
        counts["activities"] = cursor.rowcount
        conn.commit()

    # For sleep and dailies, we delete records that were inserted in the
    # demo date range.  Since these use INSERT OR IGNORE, they only exist
    # if there was no real data.  We'll delete all sleep/dailies and note
    # that real data would need to be re-synced.
    with get_db() as conn:
        cursor = conn.execute("DELETE FROM sleep")
        counts["sleep"] = cursor.rowcount
        cursor = conn.execute("DELETE FROM dailies")
        counts["dailies"] = cursor.rowcount
        conn.commit()

    set_demo_active(False)
    return counts
