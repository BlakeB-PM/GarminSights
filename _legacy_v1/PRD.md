PRD — Personal Strength & Training Explorer (GarminDB + SQLite + Next.js)
1. Overview

This project builds a lightweight, flexible Explorer-style dashboard for analyzing my personal training data (strength + treadmill + other cardio) using GarminDB exported data stored in a local SQLite database.

Unlike Garmin Connect, this tool focuses on:

Strength progression (per exercise + per muscle group)

Weekly/multi-week trends

Strength vs treadmill/cardio comparisons

Simple, intuitive data exploration

A single clean Explorer UI

This is not a BI tool or a full analytics platform.
It is a personal training insight tool that I can actually finish.

2. Problem Statement

Garmin stores a massive amount of workout data, but it’s scattered and difficult to use for:

monitoring weekly strength progression,

comparing different exercises over time,

seeing muscle group balance,

understanding how strength training fits with treadmill/cardio volumes.

The Garmin UI is not built for strength-focused longitudinal analysis.
I want a simple way to explore my data without having to write SQL every time.

3. Goals
Primary Goals (v1)

Track weekly exercise-specific strength progression (tonnage, sets, reps).

Track weekly muscle group training balance.

Compare strength vs treadmill vs other cardio at the weekly level.

Provide a simple Explorer UI that allows slicing by:

exercise

muscle group

workout type

metric (tonnage, sets, reps, duration, distance)

Keep the system small, performant, and easy to maintain.

Secondary Goals (v2) – Not MVP

Weekly biomarker trends (sleep, resting HR, stress proxy)

Strength vs biomarker comparisons

Weekly or monthly AI-generated summary cards

More chart types (e.g., scatter plots, dual-axis charts)

4. Non-Goals

No mobile app

No auth, sharing, or multi-user support

No real-time syncing

No prescriptive recommendations (e.g., “You should sleep more”)

No auto-classification beyond exercise → muscle group mapping

5. User Stories
Strength Progression

I want to select a specific exercise (e.g., “Close-Grip Bench Press”) and see my weekly progression over time.

I want to compare one exercise to another (optional stretch goal).

I want to see if my upper-body or lower-body training has increased or decreased over the last few weeks.

Workout Type Comparisons

I want to compare weekly strength volume vs treadmill duration.

I want to see how often I’m doing treadmill vs strength workouts in a given month.

I want a quick read on how balanced my training is by type.

Muscle Group Balance

I want to see my total weekly volume for muscle groups (chest, back, legs, biceps, triceps, shoulders).

I want to understand which muscle groups I might be undertraining.

Explorer

I want a single UI page where I choose:

View by → exercise / muscle group / workout type

Metric → tonnage / sets / reps / duration / distance

Period → week (month can come later)

Optional filters

I want the data to update when I click “Run” and render as a simple chart.

6. Core Features (v1)
Feature 1 — Data Ingestion (GarminDB)

I will use GarminDB CLI manually to create/update garmin.db.

The app reads this SQLite DB directly.

No custom ingestion needed in v1.

Feature 2 — Derived Metrics Layer

Create three derived tables in garmin.db:

Table: fact_exercise_weekly

For strength exercise progression.

Columns:

week_start_date (ISO date string)

exercise_name

muscle_group

total_tonnage (sum reps * weight)

total_sets

total_reps

Logic:

Extract sets/reps/weights from Garmin strength activities.

Use a CSV mapping (data/exercise_muscles.csv) to classify exercises → muscle groups.

If unmapped, assign "unknown".

Table: fact_muscle_group_weekly

Aggregated from the previous table.

Columns:

week_start_date

muscle_group

total_tonnage

total_sets

total_reps

Table: fact_workout_type_weekly

Allows comparison of strength vs treadmill (and other cardio).

Columns:

week_start_date

workout_type (e.g., "strength", "treadmill", "run", "walk")

total_duration_min

total_sessions

total_distance_km

total_tonnage (tonnage = 0 for non-strength workouts)

Logic:

Activity classification:

Strength → "strength"

Treadmill running/walking → "treadmill"

Other running → "run"

Walking → "walk"

(Optional: add more later)

Feature 3 — Explorer API

Single endpoint:

GET /api/explore

Parameters:

view: "exercise" | "muscle_group" | "workout_type"

metric:

Strength: "total_tonnage" | "total_sets" | "total_reps"

Workout type: "total_duration_min" | "total_sessions" | "total_distance_km" | "total_tonnage"

period: "week" (MVP)

Optional:

exercise_name

muscle_group

workout_type

start

end

Behavior:

Query appropriate derived table.

Aggregate by week_start_date.

Return time series suitable for Recharts.

Feature 4 — Explorer UI (Next.js + Recharts)

Single page: /explore

Elements:

Dropdown: View by → Exercise / Muscle Group / Workout Type

Dropdown: Metric

For Exercise view:

Dropdown to pick a specific exercise

For Muscle Group view:

Dropdown to pick a muscle group (or “upper/lower” grouping)

For Workout Type view:

Dropdown to pick one or multiple types

Period selector (just “Week” in v1)

Date range picker (optional but useful)

“Run” button to trigger the query

Chart area:

Line or bar chart showing metric over time

Keep the layout clean and simple.

7. v2 Features (Not MVP)

Biomarker derived table (fact_biomarkers_weekly)

avg_sleep_hours

avg_resting_hr

avg_hrv_proxy

Overlay comparison (e.g., sleep vs strength tonnage)

AI weekly/monthly summary card

Compare two exercises on the same chart

Multi-chart view

Saved views

8. Technical Overview
Backend

Next.js API routes

SQLite reading via better-sqlite3 or similar

Python scripts for building derived tables

garmin.db lives in project folder or configurable path

Frontend

Next.js

React

shadcn/ui

Recharts for charts

Data Source

GarminDB CLI:

garmindb_cli.py --all --download --import --analyze --latest

Output SQLite DB is read directly

Exercise → Muscle Group Mapping

Simple CSV at data/exercise_muscles.csv

Editable by hand as needed


10. Success Criteria

I can pick an exercise and see weekly tonnage progression.

I can compare upper vs lower body volume week-to-week.

I can compare strength volume to treadmill duration.

I open the Explorer at least weekly.

The tool becomes my primary insight into training trends.

The system remains small, fast, and easy to maintain.