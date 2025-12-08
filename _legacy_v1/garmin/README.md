# GarminDB Setup

This directory contains the GarminDB repository, which is used to export Garmin Connect data into a local SQLite database.

## Setup

The GarminDB package has been installed in a Python virtual environment. To use the CLI:

1. **Activate the virtual environment:**
   ```powershell
   .\venv\Scripts\Activate.ps1
   ```

2. **Run the CLI:**
   ```powershell
   python scripts\garmindb_cli.py --help
   ```

## Common Usage

### Export All Data (Full Sync)

To download and import all Garmin Connect data:

```powershell
python scripts\garmindb_cli.py --all --download --import --analyze --latest
```

This command will:
- `--all`: Process all data types (activities, monitoring, sleep, etc.)
- `--download`: Download data from Garmin Connect
- `--import`: Import downloaded data into the database
- `--analyze`: Create summary and derived tables
- `--latest`: Only process the latest/newest data

### Export Activities Only

```powershell
python scripts\garmindb_cli.py --activities --download --import --analyze --latest
```

### Export Activities (Full History)

To get all historical data (not just latest):

```powershell
python scripts\garmindb_cli.py --activities --download --import --analyze
```

## Configuration

Before first use, you may need to configure Garmin Connect credentials. The CLI will prompt you for login information on first run, or you can create a config file.

See the main GarminDB repository documentation for more details: https://github.com/tcgoetz/GarminDB

## Database Location

By default, GarminDB creates SQLite databases in the current directory or a configured location. The database files will typically be named:
- `garmin_activities.db` - Activity data
- `garmin_monitoring.db` - Daily monitoring data
- `garmin_sleep.db` - Sleep data
- etc.

## Notes

- The virtual environment (`venv/`) contains all required dependencies
- Always activate the virtual environment before running the CLI
- The `--analyze` flag is important as it creates derived tables needed for analysis
