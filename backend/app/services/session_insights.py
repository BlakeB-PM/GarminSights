"""Session observations shared by the app and MCP."""
import json
import math
from statistics import median

from app.database import execute_query


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def timeline(payload):
    descriptors = {d["key"]: d["metricsIndex"] for d in payload.get("metricDescriptors", [])
                   if isinstance(d.get("metricsIndex"), int)}
    # Garmin's details JSON already contains decoded values in descriptor units.
    expected = {"sumElapsedDuration": "second", "directHeartRate": "bpm",
                "directSpeed": "mps", "directPower": "watt"}
    units = {d["key"]: (d.get("unit") or {}).get("key") for d in payload.get("metricDescriptors", [])}
    keys = {"elapsed_seconds": "sumElapsedDuration", "heart_rate": "directHeartRate",
            "speed_mps": "directSpeed", "power_watts": "directPower"}
    points = {}
    for row in payload.get("activityDetailMetrics", []):
        values = row.get("metrics", [])
        point = {}
        for label, key in keys.items():
            index = descriptors.get(key)
            value = values[index] if index is not None and 0 <= index < len(values) else None
            if number(value) and units.get(key) == expected[key] and value >= 0:
                point[label] = value
        if "elapsed_seconds" in point:
            if point.get("heart_rate") == 0:
                point.pop("heart_rate")
            points[point["elapsed_seconds"]] = point
    return [points[t] for t in sorted(points)]


def effort_windows(points):
    if len(points) < 2:
        return []
    gaps = [b["elapsed_seconds"]-a["elapsed_seconds"] for a,b in zip(points,points[1:])]
    max_gap = min(60, max(10, median(gaps)*3))
    totals = {}
    for left, right in zip(points, points[1:]):
        begin, end = left["elapsed_seconds"], right["elapsed_seconds"]
        if end-begin > max_gap:
            continue
        for bucket in range(int(begin//300), int(end//300)+1):
            seconds = max(0, min(end,(bucket+1)*300)-max(begin,bucket*300))
            if seconds == 0:
                continue
            entry = totals.setdefault(bucket, {"start_minute": bucket*5, "observed_seconds": 0,
                                               "weighted_hr": 0})
            if "heart_rate" in left and "heart_rate" in right:
                entry["observed_seconds"] += seconds
                entry["weighted_hr"] += seconds*(left["heart_rate"]+right["heart_rate"])/2
    return [{"start_minute": v["start_minute"], "observed_seconds": round(v["observed_seconds"]),
             "mean_hr": round(v["weighted_hr"]/v["observed_seconds"],1)}
            for v in totals.values() if v["observed_seconds"] > 0]


def strength_exercises(activity_id):
    rows = execute_query("""SELECT exercise_name,count(*) sets,sum(reps) reps,
        sum(CASE WHEN weight_lbs>0 THEN reps*weight_lbs END) volume_lbs,
        max(CASE WHEN weight_lbs>0 THEN weight_lbs END) heaviest_lbs,
        sum(CASE WHEN reps>0 AND weight_lbs>0 THEN 1 ELSE 0 END) weighted_sets
        FROM strength_sets WHERE activity_id=? AND exercise_name NOT IN ('Rest','Unknown')
        AND reps>0 GROUP BY exercise_name ORDER BY exercise_name""", (activity_id,))
    return rows


def session_insights(activity_id: int):
    activities = execute_query("SELECT * FROM activities WHERE id=?", (activity_id,))
    if not activities:
        raise ValueError("Activity unavailable")
    activity = activities[0]
    key = activity["garmin_id"]
    records = {r["source"]: json.loads(r["payload"]) for r in execute_query(
        "SELECT source,payload FROM garmin_records WHERE record_key=? AND source IN ('workout_samples','workout')", (key,))}
    points = timeline(records.get("workout_samples", {}))
    windows = effort_windows(points)
    notes = ["The timeline uses Garmin chart samples, which may condense the original recording."]
    observed = sum(w["observed_seconds"] for w in windows)
    if windows:
        mean = sum(w["mean_hr"]*w["observed_seconds"] for w in windows)/observed
        notes.append(f"Mean heart rate across {observed/60:.1f} observed minutes was {mean:.0f} bpm.")
    if len(windows) >= 4 and windows[0]["observed_seconds"] >= 240 and windows[-1]["observed_seconds"] >= 240:
        delta = windows[-1]["mean_hr"]-windows[0]["mean_hr"]
        notes.append(f"Heart rate changed by {delta:+.0f} bpm from the first to the last five-minute window. Warm-up, workload changes and recovery periods can all affect this comparison.")
    exercises = strength_exercises(activity_id)
    for exercise in exercises:
        previous = execute_query("""SELECT a.id,a.start_time FROM activities a
            WHERE a.activity_type='strength_training' AND a.start_time<?
            AND EXISTS(SELECT 1 FROM strength_sets s WHERE s.activity_id=a.id AND s.exercise_name=? AND s.reps>0)
            ORDER BY a.start_time DESC,a.id DESC LIMIT 1""", (activity["start_time"], exercise["exercise_name"]))
        if previous:
            prior = next(e for e in strength_exercises(previous[0]["id"]) if e["exercise_name"] == exercise["exercise_name"])
            exercise["previous"] = {**prior, "activity_id": previous[0]["id"], "date": previous[0]["start_time"][:10]}
    if exercises:
        notes.append("Exercise comparisons use the previous session with the same recorded exercise name. Volume changes also reflect changes in sets and reps.")
    elif activity["activity_type"] == "strength_training":
        notes.append("No recorded working sets are available for this session.")
    if not points:
        notes.append("A usable workout sample timeline has not been synced for this activity.")
    # Retain all windows for analysis. Bound the chart response by sampling the
    # display only, including both endpoints.
    step = max(1, math.ceil(len(points)/600))
    chart = points[::step]
    if points and chart[-1] != points[-1]:
        chart.append(points[-1])
    display = []
    for point in chart:
        if display and point["elapsed_seconds"] - display[-1]["elapsed_seconds"] > max(60, step * 15):
            display.append({"elapsed_seconds": (point["elapsed_seconds"] + display[-1]["elapsed_seconds"])/2})
        display.append(point)
    return {"activity_id": activity_id, "name": activity["name"], "activity_type": activity["activity_type"],
            "notes": notes, "observed_hr_minutes": round(observed/60,1),
            "sample_count": len(points), "timeline": display, "five_minute_windows": windows,
            "exercises": exercises, "source": "Garmin workout samples and recorded exercise sets"}

