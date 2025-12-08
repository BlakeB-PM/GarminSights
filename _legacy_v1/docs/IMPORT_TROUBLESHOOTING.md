# Garmin Import Troubleshooting Guide

## Current Issues Found

Based on the diagnostic tool, here are the issues preventing Garmin import:

### 1. ❌ Missing Configuration File
**Problem:** The `GarminConnectConfig.json` file is missing from `~/.GarminDb/`

**Solution:**
```powershell
# Create the config directory if it doesn't exist
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.GarminDb"

# Copy the example config file
Copy-Item "GarminSights\garmin\garmindb\GarminConnectConfig.json.example" "$env:USERPROFILE\.GarminDb\GarminConnectConfig.json"

# Edit the file to add your credentials
notepad "$env:USERPROFILE\.GarminDb\GarminConnectConfig.json"
```

**Required changes in the config file:**
- Set `credentials.user` to your Garmin Connect email/username
- Set `credentials.password` to your Garmin Connect password

### 2. ⚠️ Virtual Environment Not Activated
**Problem:** The Python virtual environment exists but isn't activated

**Solution:**
```powershell
# Navigate to the garmin directory
cd GarminSights\garmin

# Activate the virtual environment
.\venv\Scripts\Activate.ps1

# Verify activation (you should see (venv) in your prompt)
```

### 3. 📋 Complete Import Process

Once the configuration is set up, follow these steps:

```powershell
# 1. Activate virtual environment
cd GarminSights\garmin
.\venv\Scripts\Activate.ps1

# 2. Download data from Garmin Connect
python scripts\garmindb_cli.py --all --download --latest

# 3. Import downloaded data into database
python scripts\garmindb_cli.py --all --import --latest

# 4. Analyze and create summary tables
python scripts\garmindb_cli.py --all --analyze
```

Or do all three steps at once:
```powershell
python scripts\garmindb_cli.py --all --download --import --analyze --latest
```

## Common Import Issues

### Import Gets Stuck on a Specific File

**Symptoms:** Import process hangs and doesn't progress

**Solutions:**
1. Check the log file: `GarminSights\garmin\garmindb.log`
2. Look for the last file being processed
3. Try importing with `--latest` flag to process fewer files
4. If a specific file is problematic, you can skip it by moving it temporarily

### Authentication Errors

**Symptoms:** "Failed to login" or "Exception getting activity summary"

**Solutions:**
1. Delete the session file to force re-authentication:
   ```powershell
   Remove-Item "$env:USERPROFILE\.GarminDb\garth_session" -ErrorAction SilentlyContinue
   ```
2. Verify credentials in `GarminConnectConfig.json`
3. Try logging into Garmin Connect website to ensure account is active

### Network Timeouts

**Symptoms:** Downloads fail or hang during download phase

**Solutions:**
1. Check internet connection
2. Try downloading with `--latest` flag (fewer files)
3. Increase timeout in download.py if needed
4. Download in smaller batches by specifying specific stats:
   ```powershell
   python scripts\garmindb_cli.py --activities --download --latest
   ```

### Module Not Found Errors

**Symptoms:** `ModuleNotFoundError: No module named 'garmindb'`

**Solution:**
- Ensure virtual environment is activated
- If still failing, reinstall dependencies:
  ```powershell
  cd GarminSights\garmin
  .\venv\Scripts\Activate.ps1
  pip install -e .
  ```

## Running Diagnostics

To check your setup at any time:

```powershell
cd GarminSights
python scripts\diagnose_import.py
```

This will check:
- Virtual environment status
- Configuration file existence
- Database files
- Downloaded data files
- Log file status
- Authentication session

## Next Steps After Successful Import

1. Build derived tables:
   ```powershell
   python scripts\build_derived_tables.py
   ```

2. Verify database:
   ```powershell
   python scripts\check_database.py
   ```

3. Start the web app:
   ```powershell
   cd app
   npm run dev
   ```

