# Scripts

This directory contains Python scripts for processing GarminDB data and building derived tables.

## build_derived_tables.py

Builds the three derived fact tables used by the Explorer:

- `fact_exercise_weekly` - Exercise-level strength training metrics
- `fact_muscle_group_weekly` - Muscle group aggregations  
- `fact_workout_type_weekly` - Workout type comparisons

### Usage

```bash
# From project root
python scripts/build_derived_tables.py

# With custom paths
python scripts/build_derived_tables.py --db-path garmin/garmin_activities.db --exercise-csv data/exercise_muscles.csv
```

### Requirements

- GarminDB activities database must exist (created via GarminDB CLI)
- Exercise mapping CSV at `data/exercise_muscles.csv`
- Activity JSON files (downloaded by GarminDB CLI)

### When to Run

Run this script after:
1. Exporting new data from Garmin Connect using GarminDB CLI
2. Adding new exercises to the mapping CSV
3. Before using the Explorer UI

The script will:
- Extract strength training exercise data from JSON files
- Aggregate by week and exercise/muscle group
- Create or update the derived tables in the SQLite database

