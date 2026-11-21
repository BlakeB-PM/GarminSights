"""Recorded Garmin sources and read models shared by REST and MCP."""
import json
import logging
import hashlib
from io import BytesIO
from zipfile import is_zipfile
from datetime import date, timedelta

from app.database import execute_query, get_db

# Only read methods that describe sensor observations or recorded sessions.
DAILY = {
    "fitness": "get_max_metrics", "hrv": "get_hrv_data",
    "readiness": "get_training_readiness", "training_status": "get_training_status",
    "heart_rate": "get_heart_rates", "stress": "get_stress_data",
    "body_battery": "get_body_battery", "battery_events": "get_body_battery_events",
    "respiration": "get_respiration_data", "pulse_ox": "get_spo2_data",
    "intensity": "get_intensity_minutes_data", "steps": "get_steps_data",
    "floors": "get_floors", "daily_events": "get_all_day_events",
    "body_composition": "get_body_composition", "fitness_age": "get_fitnessage_data",
    "endurance": "get_endurance_score", "hill_score": "get_hill_score",
}
SNAPSHOTS = {
    "devices": "get_devices", "personal_records": "get_personal_record",
    "lactate_threshold": "get_lactate_threshold", "race_predictions": "get_race_predictions",
}
ACTIVITY = {
    "original_activity": "download_activity", "workout": "get_activity", "workout_samples": "get_activity_details",
    "laps": "get_activity_splits", "hr_zones": "get_activity_hr_in_timezones",
    "workout_gear": "get_activity_gear", "weather": "get_activity_weather",
    "typed_laps": "get_activity_typed_splits", "split_summaries": "get_activity_split_summaries",
}
# Each entry identifies an observed Garmin field, not just a returned envelope.
FIELDS = {
    "training_status": {"acuteTrainingLoadDTO.dailyTrainingLoadAcute": ("Acute training load", "points")},
    "stress": {"avgStressLevel": ("Average stress", "points")},
    "body_battery": {"charged": ("Body Battery charged", "points"), "drained": ("Body Battery drained", "points")},
    "fitness_age": {"fitnessAge": ("Fitness age", "years")},
    "endurance": {"overallScore": ("Endurance score", "points")},
    "hill_score": {"overallScore": ("Hill score", "points")},
    "sleep": {"dailySleepDTO.sleepTimeSeconds": ("Sleep duration", "s"),
              "dailySleepDTO.sleepScores.overall.value": ("Sleep score", "points"), "avgSkinTempDeviationC": ("Skin temperature deviation", "°C"),
              "hrvStatus": ("Overnight HRV status", ""), "avgOvernightHrv": ("Overnight HRV", "ms"),
              "sleepHeartRate": ("Sleep heart rate", "samples"), "hrvData": ("Sleep HRV", "samples"),
              "breathingDisruptionData": ("Breathing disruptions", "samples"),
              "sleepMovement": ("Sleep movement", "samples")},
    "daily": {"totalSteps": ("Steps", "steps"), "restingHeartRate": ("Resting heart rate", "bpm"),
              "moderateIntensityMinutes": ("Moderate intensity", "min"), "vigorousIntensityMinutes": ("Vigorous intensity", "min"),
              "avgWakingRespirationValue": ("Waking respiration", "breaths/min"),
              "bodyBatteryAtWakeTime": ("Body Battery at wake", "points"),
              "floorsAscended": ("Floors climbed", "floors"), "sedentarySeconds": ("Sedentary time", "s")},
    "summary": {"vO2MaxValue": ("Activity VO₂ max", "mL/kg/min"), "activityTrainingLoad": ("Activity load", "points"),
                "aerobicTrainingEffect": ("Aerobic training effect", ""), "anaerobicTrainingEffect": ("Anaerobic training effect", "")},
    "fitness": {"generic.vo2MaxValue": ("VO₂ max", "mL/kg/min"), "cycling.vo2MaxValue": ("Cycling VO₂ max", "mL/kg/min")},
    "readiness": {"score": ("Garmin training readiness", "points"), "recoveryTime": ("Recovery time", "min")},
    "hrv": {"hrvSummary.weeklyAvg": ("Weekly HRV", "ms"), "hrvSummary.status": ("HRV status", ""),
            "hrvSummary.baseline.balancedLow": ("HRV baseline low", "ms"), "hrvSummary.baseline.balancedUpper": ("HRV baseline high", "ms")},
    "heart_rate": {"heartRateValues": ("Daytime heart rate", "samples")},
    "respiration": {"avgWakingRespirationValue": ("Daytime respiration", "breaths/min")},
    "pulse_ox": {"averageSpO2": ("Average Pulse Ox", "%")},
}


def field_values(source, payload):
    records = payload if isinstance(payload, list) else [payload]
    # Preserve multiple readiness readings in the original payload. The trend
    # shows the last dated reading for a day where Garmin returns several.
    records = sorted((r for r in records if isinstance(r, dict)),
                     key=lambda r: str(r.get("timestamp") or r.get("timestampLocal") or ""))
    values = {}
    for path, (label, unit) in FIELDS.get(source, {}).items():
        for record in records:
            value = record
            for key in path.split("."):
                value = value.get(key) if isinstance(value, dict) else None
            if isinstance(value, list):
                if path == "heartRateValues":
                    value = [v for v in value if isinstance(v, list) and len(v) >= 2 and isinstance(v[1], (int,float)) and v[1] > 0]
                value = len(value) if value else None
            if path in {"dailySleepDTO.sleepTimeSeconds", "avgWakingRespirationValue", "averageSpO2",
                        "vO2MaxValue", "restingHeartRate"} and isinstance(value, (int, float)) and value <= 0:
                continue
            if isinstance(value, (int, float, str)) and value != "":
                values[label] = (value, unit)
    if source == "heart_rate" and isinstance(payload, dict):
        samples = payload.get("heartRateValues") or []
        duration = weighted = 0
        for left, right in zip(samples, samples[1:]):
            if not all(isinstance(pair, list) and len(pair) >= 2 and
                       all(isinstance(v, (float, int)) for v in pair[:2]) for pair in (left, right)):
                continue
            gap = (right[0] - left[0]) / 1000
            if 0 < gap <= 300 and left[1] > 0 and right[1] > 0:
                weighted += gap * (left[1] + right[1]) / 2
                duration += gap
        if duration:
            values["Mean HR during observed intervals"] = (round(weighted / duration, 1), "bpm")
            values["HR observation time"] = (round(duration / 60, 1), "min")
    return values


def index_metrics(conn, source, key, day, payload):
    conn.execute("DELETE FROM garmin_metrics WHERE source=? AND record_key=?", (source, key))
    conn.executemany(
        "INSERT INTO garmin_metrics(source,record_key,day,metric,value,unit) VALUES(?,?,?,?,?,?)",
        [(source, key, day, label, value, unit) for label, (value, unit) in field_values(source, payload).items()],
    )


def update_observed_hr(conn, day):
    conn.execute("""UPDATE dailies SET avg_heart_rate=(
        SELECT round(value) FROM garmin_metrics WHERE source='heart_rate'
        AND record_key=? AND metric='Mean HR during observed intervals') WHERE date=?""", (day, day))


def save_payload(conn, source, key, day, payload):
    conn.execute("""
        INSERT INTO garmin_records(source,record_key,day,payload) VALUES(?,?,?,?)
        ON CONFLICT(source,record_key) DO UPDATE SET day=excluded.day,payload=excluded.payload
    """, (source, key, day, json.dumps(payload, separators=(",", ":"))))
    index_metrics(conn, source, key, day, payload)
    if source == 'heart_rate':
        update_observed_hr(conn, day)


def mark(conn, source, key, day, state):
    conn.execute("""
        INSERT INTO garmin_fetches(source,record_key,day,state) VALUES(?,?,?,?)
        ON CONFLICT(source,record_key) DO UPDATE SET day=excluded.day,state=excluded.state,
            checked_at=CURRENT_TIMESTAMP
    """, (source, key, day, state))


def coverage():
    rows = execute_query("""
        SELECT source,count(*) AS records,min(day) AS first_day,max(day) AS latest_day
        FROM garmin_records GROUP BY source
        UNION ALL SELECT 'daily',count(*),min(date),max(date) FROM dailies WHERE raw_json IS NOT NULL
        UNION ALL SELECT 'sleep',count(*),min(date),max(date) FROM sleep WHERE raw_json IS NOT NULL
        UNION ALL SELECT 'summary',count(*),min(date(start_time)),max(date(start_time)) FROM activities
            WHERE json_valid(raw_json) AND json_type(raw_json,'$.exerciseSets') IS NULL
    """)
    sources = {name: {"source": name, "records": 0} for name in [*DAILY, *ACTIVITY, *SNAPSHOTS, "sets", "sleep", "daily", "summary"]}
    for row in rows:
        sources[row["source"]] = row
    for row in execute_query("""
        SELECT source,max(checked_at) AS checked_at,max(CASE WHEN state='saved' THEN checked_at END) AS last_saved_at,sum(state='error') AS errors,
               sum(state='empty') AS empty FROM garmin_fetches GROUP BY source
    """):
        sources.setdefault(row["source"], {"records": 0}).update(row)
    return {"sources": list(sources.values()), "metrics": execute_query("""
        SELECT source,metric,unit,count(DISTINCT day) AS days,min(day) AS first_day,max(day) AS latest_day
        FROM garmin_metrics GROUP BY source,metric,unit ORDER BY metric
    """)}


def observations(source: str, start: date, end: date, offset: int = 0, limit: int = 100):
    if end < start or offset < 0 or not 1 <= limit <= 500:
        raise ValueError("Invalid date range or page")
    params = (source, start.isoformat(), end.isoformat(), limit, offset)
    return {"metrics": execute_query("""
        SELECT day,record_key,metric,value,unit FROM garmin_metrics
        WHERE source=? AND day BETWEEN ? AND ? ORDER BY day DESC,record_key,metric LIMIT ? OFFSET ?
    """, params), "records": execute_query("""
        SELECT day,record_key FROM garmin_payloads WHERE source=? AND day BETWEEN ? AND ?
        ORDER BY day DESC,record_key LIMIT ? OFFSET ?
    """, params)}


def read_record(source: str, key: str, path: list[str], offset: int = 0, limit: int = 50):
    """Browse large nested records without returning an entire workout trace."""
    if offset < 0 or not 1 <= limit <= 200:
        raise ValueError("Invalid page")
    rows = execute_query("SELECT payload FROM garmin_payloads WHERE source=? AND record_key=?", (source, key))
    if not rows:
        raise ValueError("Record unavailable")
    node = json.loads(rows[0]["payload"])
    for part in path:
        if isinstance(node, list) and part.isdecimal() and int(part) < len(node):
            node = node[int(part)]
        elif isinstance(node, dict) and part in node:
            node = node[part]
        else:
            raise ValueError("Unknown field")
    def preview(value):
        if isinstance(value, list) and len(value) <= 40 and all(not isinstance(v, (list, dict)) for v in value):
            return {"value": value}
        if isinstance(value, dict) and len(value) <= 12 and all(not isinstance(v, (list, dict)) for v in value.values()):
            return {"value": value}
        if isinstance(value, (dict, list)):
            return {"kind": "object" if isinstance(value, dict) else "list", "size": len(value)}
        return {"value": value}
    if isinstance(node, dict):
        keys = list(node)[offset:offset + limit]
    elif isinstance(node, list):
        keys = range(offset, min(len(node), offset + limit))
    else:
        return {"value": node}
    return {"total": len(node), "fields": [{"key": str(k), **preview(node[k])} for k in keys]}


def collect(garmin, start: date, end: date, budget: int, source: str | None = None, *, oldest_first: bool = False):
    """Repeat a bounded range to resume. Failed and recent keys become due again."""
    from app.services.garmin_service import GarminAuthError
    if end < start or end > date.today() or (end-start).days > 3659 or not 1 <= budget <= 100:
        raise ValueError("Invalid collection window or request budget")
    if source is not None and source not in {**DAILY, **ACTIVITY, **SNAPSHOTS}:
        raise ValueError("Unknown Garmin source")
    attempts = execute_query("""
        SELECT source,record_key,state FROM garmin_fetches WHERE day BETWEEN ? AND ?
        AND ((state='error' AND checked_at > datetime('now','-1 hour')) OR
             (state!='error' AND (source='original_activity' OR day < date('now','-2 days') OR checked_at > datetime('now','-6 hours'))))
    """, (start, end))
    skip = {(r["source"], r["record_key"]) for r in attempts}
    activities = {}
    for row in execute_query("SELECT garmin_id,date(start_time) day FROM activities WHERE date(start_time) BETWEEN ? AND ?", (start, end)):
        activities.setdefault(row["day"], []).append(row["garmin_id"])
    result = {"attempted": 0, "errors": 0, "empty": 0, "saved": 0, "range_complete": not any(r["state"] == "error" and (source is None or r["source"] == source) for r in attempts)}
    for age in range((end-start).days + 1):
        day = ((start + timedelta(days=age)) if oldest_first else (end - timedelta(days=age))).isoformat()
        jobs = [(s, day, m) for s, m in DAILY.items()]
        if day == date.today().isoformat():
            jobs = [(s, day, m) for s, m in SNAPSHOTS.items()] + jobs
        jobs.extend((s, key, m) for key in activities.get(day, []) for s, m in ACTIVITY.items())
        for name, key, method in jobs:
            if (source and name != source) or (name, key) in skip:
                continue
            if result["attempted"] >= budget:
                result["range_complete"] = False
                return result
            result["attempted"] += 1
            try:
                if name in SNAPSHOTS:
                    payload = garmin.fetch_observation(method)
                elif name == "original_activity":
                    from garminconnect import Garmin
                    payload = garmin.fetch_observation(method, key, Garmin.ActivityDownloadFormat.ORIGINAL)
                    if payload and not is_zipfile(BytesIO(payload)):
                        raise ValueError("Invalid original activity archive")
                else:
                    payload = garmin.fetch_observation(method, key)
                state = "saved" if payload else "empty"
            except GarminAuthError:
                raise
            except Exception as exc:
                status = getattr(getattr(getattr(exc, "error", exc), "response", None), "status_code", None)
                state = "empty" if status in (204, 404) else "error"
                if status == 429 or "TooManyRequests" in type(exc).__name__:
                    result["rate_limited"] = True
                logging.getLogger(__name__).warning("Garmin %s %s: %s", name, key, type(exc).__name__)
            with get_db() as conn, conn:
                if state == "saved":
                    if name == "original_activity":
                        conn.execute("""INSERT INTO garmin_originals(garmin_id,archive) VALUES(?,?)
                            ON CONFLICT(garmin_id) DO UPDATE SET archive=excluded.archive""", (key, payload))
                        payload = {"bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest(),
                                   "format": "Garmin original ZIP"}
                    save_payload(conn, name, key, day, payload)
                mark(conn, name, key, day, state)
            result["errors" if state == "error" else state] += 1
            if state == "error":
                result["range_complete"] = False
            if result.get("rate_limited"):
                return result
    return result


def migrate_history():
    """Index the retained responses in one transaction, without network calls."""
    zeros = {
        "steps": "totalSteps", "distance_meters": "totalDistanceMeters",
        "active_calories": "activeKilocalories", "calories_total": "totalKilocalories",
        "calories_bmr": "bmrKilocalories", "body_battery_high": "bodyBatteryHighestValue",
        "body_battery_low": "bodyBatteryLowestValue", "body_battery_charged": "bodyBatteryChargedValue",
        "body_battery_drained": "bodyBatteryDrainedValue", "intensity_minutes_moderate": "moderateIntensityMinutes",
        "intensity_minutes_vigorous": "vigorousIntensityMinutes", "intensity_minutes_goal": "intensityMinutesGoal",
    }
    with get_db() as conn, conn:
        conn.execute("""CREATE VIEW IF NOT EXISTS garmin_payloads AS
    SELECT source,record_key,day,payload FROM garmin_records
    UNION ALL SELECT 'daily',date,date,raw_json FROM dailies WHERE raw_json IS NOT NULL
    UNION ALL SELECT 'sleep',date,date,raw_json FROM sleep WHERE raw_json IS NOT NULL
    UNION ALL SELECT 'summary',garmin_id,date(start_time),raw_json FROM activities
        WHERE raw_json IS NOT NULL AND json_valid(raw_json) AND json_type(raw_json,'$.exerciseSets') IS NULL;""")
        for column, field in zeros.items():
            conn.execute(f"UPDATE dailies SET {column}=0 WHERE json_valid(raw_json) AND json_extract(raw_json,?)=0",
                         ("$." + field,))
        conn.execute("UPDATE dailies SET avg_heart_rate=NULL")
        for source, sql in (
            ("sleep", "SELECT date key,date day,raw_json FROM sleep"),
            ("daily", "SELECT date key,date day,raw_json FROM dailies"),
            ("summary", "SELECT garmin_id key,date(start_time) day,raw_json FROM activities"),
        ):
            for row in conn.execute(sql):
                if not row["day"] or not row["raw_json"]:
                    continue
                try:
                    payload = json.loads(row["raw_json"])
                except ValueError:
                    continue
                if source == "summary" and isinstance(payload, dict) and "exerciseSets" in payload:
                    save_payload(conn, "sets", row["key"], row["day"], payload)
                else:
                    index_metrics(conn, source, row["key"], row["day"], payload)

def trend(source: str, metric: str, start: date, end: date, offset: int = 0, limit: int = 365):
    if end < start or not 1 <= limit <= 1000 or offset < 0:
        raise ValueError("Invalid trend window or page")
    return execute_query("""SELECT day,record_key,value,unit FROM garmin_metrics
        WHERE source=? AND metric=? AND day BETWEEN ? AND ?
        ORDER BY day,record_key LIMIT ? OFFSET ?""", (source, metric, start.isoformat(), end.isoformat(), limit, offset))
