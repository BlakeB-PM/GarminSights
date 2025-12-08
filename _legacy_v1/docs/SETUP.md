# Setup Guide

Complete setup instructions for GarminSights.

## Prerequisites

1. **Python 3.8+** - For GarminDB and data processing scripts
2. **Node.js 18+** - For Next.js application (download from [nodejs.org](https://nodejs.org/))
3. **Garmin Connect Account** - With training data to export

## Step 1: GarminDB Setup

### 1.1 Activate Virtual Environment

```powershell
cd garmin
.\venv\Scripts\Activate.ps1
```

### 1.2 Configure Garmin Connect (First Time Only)

On first run, GarminDB will prompt for your Garmin Connect credentials. You'll need to:
- Enter your Garmin Connect email and password
- Complete 2FA if enabled
- The credentials will be saved for future use

### 1.3 Export Data from Garmin Connect

```powershell
# Export all activities (full history)
python scripts\garmindb_cli.py --all --download --import --analyze

# Or export only latest activities
python scripts\garmindb_cli.py --all --download --import --analyze --latest

# Or export only strength training activities
python scripts\garmindb_cli.py --activities --download --import --analyze --latest
```

This will:
- Download activity data from Garmin Connect
- Import it into SQLite databases
- Create summary tables

**Expected output:**
- `garmin_activities.db` - Main activities database
- JSON files in `garmin/Json/ActivityDetails/` (or similar)

## Step 2: Build Derived Tables

### 2.1 Check Database

First, verify the database was created successfully:

```powershell
cd ..  # Back to project root
python scripts\check_database.py
```

This will show:
- ✅ Database exists and is valid
- ✅ Number of activities found
- ✅ Number of strength training activities
- ⚠️  Status of derived tables

### 2.2 Build Derived Tables

```powershell
python scripts\build_derived_tables.py
```

This creates:
- `fact_exercise_weekly` - Exercise-level metrics
- `fact_muscle_group_weekly` - Muscle group aggregations
- `fact_workout_type_weekly` - Workout type comparisons

### 2.3 Verify Derived Tables

Run the check script again:

```powershell
python scripts\check_database.py
```

You should now see all derived tables with data.

## Step 3: Next.js Application Setup

### 3.1 Install Node.js

If not already installed:
1. Download from [nodejs.org](https://nodejs.org/)
2. Install the LTS version
3. Restart your terminal/PowerShell

Verify installation:
```powershell
node --version
npm --version
```

### 3.2 Configure Environment Variables

Copy the example environment file:

```powershell
cd app
copy .env.example .env.local
```

Edit `.env.local` and optionally set:
- `DATABASE_PATH` - Path to your SQLite database (leave empty for auto-detection)

If `DATABASE_PATH` is not set, the app will automatically look for the database in:
- `garmin/garmin_activities.db` (relative to project root)
- `~/HealthData/DBs/garmin_activities.db` (default GarminDB location)

**Note:** The `.env.local` file is gitignored and will not be committed to version control.

### 3.3 Install Dependencies

```powershell
npm install
```

This installs:
- Next.js framework
- React
- Recharts (for charts)
- better-sqlite3 (for database access)
- TypeScript and other dev dependencies

### 3.4 Run Development Server

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

Navigate to [http://localhost:3000/explore](http://localhost:3000/explore) for the Explorer UI.

## Step 4: Update Exercise Mappings (Optional)

If you have exercises that aren't mapped to muscle groups:

1. Edit `data/exercise_muscles.csv`
2. Add rows: `exercise_name,muscle_group`
3. Re-run `build_derived_tables.py`

## Troubleshooting

### Database Not Found

**Error:** `Database not found at: garmin/garmin_activities.db`

**Solution:**
- Make sure you've run GarminDB CLI export first
- Check the database path in the script
- Verify you're in the project root directory

### No Strength Training Activities

**Error:** `Found 0 strength training activities`

**Solution:**
- Verify you have strength training activities in Garmin Connect
- Check that activities are marked as "Strength Training" sport type
- Try exporting all activities (not just latest)

### Derived Tables Empty

**Error:** Derived tables exist but have 0 rows

**Solution:**
- Check that JSON files exist in `garmin/Json/ActivityDetails/`
- Verify JSON files contain exercise set data
- Check script logs for parsing errors

### Node.js Not Found

**Error:** `'node' is not recognized`

**Solution:**
- Install Node.js from [nodejs.org](https://nodejs.org/)
- Restart terminal/PowerShell after installation
- Verify with `node --version`

## Regular Updates

To update your data:

1. **Export new data:**
   ```powershell
   cd garmin
   .\venv\Scripts\Activate.ps1
   python scripts\garmindb_cli.py --all --download --import --analyze --latest
   ```

2. **Rebuild derived tables:**
   ```powershell
   cd ..
   python scripts\build_derived_tables.py
   ```

3. **Refresh the Explorer UI** (it will automatically pick up new data)

## Next Steps

Once setup is complete:
- Explore your data at `/explore`
- Customize exercise mappings in `data/exercise_muscles.csv`
- Check data quality with `scripts/check_database.py`

