# GarminSights - Personal Strength & Training Explorer

A lightweight dashboard for analyzing personal training data from Garmin Connect, focusing on strength progression, muscle group balance, and training type comparisons.

## Project Structure

```
GarminSights/
├── app/              # Next.js application (to be created)
├── data/             # Data files (exercise mappings, etc.)
├── docs/             # Documentation
├── garmin/           # GarminDB repository and CLI
├── scripts/           # Python scripts for data processing
└── PRD.md            # Product Requirements Document
```

## Quick Start

### 1. Set Up GarminDB

See `garmin/README.md` for instructions on:
- Activating the Python virtual environment
- Running the GarminDB CLI to export data from Garmin Connect
- Creating the SQLite database

### 2. Build Derived Tables

After exporting data with GarminDB, run:

```bash
python scripts/build_derived_tables.py
```

This creates the derived fact tables needed by the Explorer.

### 3. Verify Setup

Check that everything is set up correctly:

```bash
python scripts/check_database.py
```

### 4. Set Up Next.js App

(Requires Node.js installation - see [SETUP.md](docs/SETUP.md))

```bash
cd app
npm install
npm run dev
```

**📖 For detailed setup instructions, see [docs/SETUP.md](docs/SETUP.md)**

## Features (v1)

- **Exercise Progression**: Track weekly strength progression by exercise
- **Muscle Group Balance**: Monitor training volume by muscle group
- **Workout Type Comparison**: Compare strength vs treadmill vs other cardio
- **Explorer UI**: Simple interface for slicing and dicing your data

## Data Flow

1. **Garmin Connect** → GarminDB CLI → **SQLite Database** (`garmin_activities.db`)
2. **SQLite Database** → `build_derived_tables.py` → **Derived Fact Tables**
3. **Derived Tables** → Next.js API → **Explorer UI**

## Exercise Mapping

Exercises are mapped to muscle groups via `data/exercise_muscles.csv`. Edit this file to add new exercises or adjust mappings.

## Development Status

- ✅ GarminDB setup and CLI
- ✅ Derived tables script
- ✅ Exercise mapping CSV
- ⏳ Next.js application (pending Node.js installation)
- ⏳ Explorer API endpoint
- ⏳ Explorer UI

## Requirements

- Python 3.8+ (for GarminDB and scripts)
- Node.js 18+ (for Next.js app)
- Garmin Connect account with training data

