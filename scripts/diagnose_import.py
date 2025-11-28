#!/usr/bin/env python3
"""
Diagnostic script to identify where Garmin import is getting stuck.

This script checks:
1. Virtual environment activation
2. Configuration file existence
3. Database connectivity
4. File processing status
5. Network/authentication issues
"""

import os
import sys
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def check_venv():
    """Check if virtual environment is activated."""
    print("\n[1] Checking virtual environment...")
    venv_path = Path(__file__).parent.parent / 'garmin' / 'venv'
    
    if not venv_path.exists():
        print(f"  [X] Virtual environment not found at: {venv_path}")
        print(f"     -> Run: python -m venv garmin/venv")
        return False
    
    # Check if we're in the venv
    if hasattr(sys, 'real_prefix') or (hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix):
        print("  [OK] Virtual environment is activated")
        return True
    else:
        print("  [!] Virtual environment exists but may not be activated")
        print(f"     -> Activate with: .\\garmin\\venv\\Scripts\\Activate.ps1")
        return False

def check_config():
    """Check if GarminConnectConfig.json exists."""
    print("\n[2] Checking configuration file...")
    homedir = os.path.expanduser('~')
    config_dir = os.path.join(homedir, '.GarminDb')
    config_file = os.path.join(config_dir, 'GarminConnectConfig.json')
    
    if not os.path.exists(config_file):
        print(f"  [X] Configuration file not found at: {config_file}")
        print(f"     -> Copy from: GarminSights/garmin/garmindb/GarminConnectConfig.json.example")
        print(f"     -> Edit to add your Garmin Connect username and password")
        return False
    
    print(f"  [OK] Configuration file found: {config_file}")
    
    # Try to read and validate config
    try:
        import json
        with open(config_file, 'r') as f:
            config = json.load(f)
        
        username = config.get('credentials', {}).get('user', '')
        password = config.get('credentials', {}).get('password', '')
        
        if not username or not password:
            print(f"  [!] Configuration file exists but username/password may be missing")
            print(f"     -> Check credentials.user and credentials.password in config")
        else:
            print(f"  [OK] Username configured: {username[:3]}***")
        
        return True
    except Exception as e:
        print(f"  [X] Error reading config file: {e}")
        return False

def check_database():
    """Check database files."""
    print("\n[3] Checking database files...")
    homedir = os.path.expanduser('~')
    db_dir = os.path.join(homedir, 'HealthData', 'DBs')
    
    if not os.path.exists(db_dir):
        print(f"  [!] Database directory not found: {db_dir}")
        print(f"     -> This is normal if no data has been imported yet")
        return False
    
    db_files = [f for f in os.listdir(db_dir) if f.endswith('.db')]
    if db_files:
        print(f"  [OK] Found {len(db_files)} database file(s):")
        for db_file in db_files:
            db_path = os.path.join(db_dir, db_file)
            size = os.path.getsize(db_path)
            print(f"     - {db_file} ({size:,} bytes)")
        return True
    else:
        print(f"  [!] No database files found in: {db_dir}")
        return False

def check_downloaded_files():
    """Check for downloaded Garmin data files."""
    print("\n[4] Checking downloaded data files...")
    homedir = os.path.expanduser('~')
    base_dir = os.path.join(homedir, 'HealthData')
    
    if not os.path.exists(base_dir):
        print(f"  [!] Data directory not found: {base_dir}")
        print(f"     -> This is normal if no data has been downloaded yet")
        return False
    
    # Check for activity files
    activities_dir = os.path.join(base_dir, 'Activities')
    if os.path.exists(activities_dir):
        json_files = [f for f in os.listdir(activities_dir) if f.endswith('.json')]
        fit_files = [f for f in os.listdir(activities_dir) if f.endswith('.fit')]
        print(f"  [OK] Activities directory found:")
        print(f"     - {len(json_files)} JSON files")
        print(f"     - {len(fit_files)} FIT files")
    else:
        print(f"  [!] Activities directory not found: {activities_dir}")
    
    # Check for monitoring files
    monitoring_base = os.path.join(base_dir, 'Monitoring')
    if os.path.exists(monitoring_base):
        # Find year directories
        year_dirs = [d for d in os.listdir(monitoring_base) if os.path.isdir(os.path.join(monitoring_base, d))]
        print(f"  [OK] Monitoring directory found with {len(year_dirs)} year(s)")
    else:
        print(f"  [!] Monitoring directory not found: {monitoring_base}")
    
    return True

def check_import_status():
    """Check if import process might be running or stuck."""
    print("\n[5] Checking for stuck processes...")
    
    # Check log file for recent activity
    log_file = Path(__file__).parent.parent / 'garmin' / 'garmindb.log'
    if log_file.exists():
        print(f"  [OK] Log file found: {log_file}")
        
        # Read last few lines
        try:
            with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
                if lines:
                    print(f"     Last log entries:")
                    for line in lines[-5:]:
                        print(f"     {line.strip()}")
                else:
                    print(f"     Log file is empty")
        except Exception as e:
            print(f"  [!] Could not read log file: {e}")
    else:
        print(f"  [!] Log file not found: {log_file}")

def check_network_auth():
    """Check network and authentication status."""
    print("\n[6] Checking network/authentication...")
    
    homedir = os.path.expanduser('~')
    config_dir = os.path.join(homedir, '.GarminDb')
    session_file = os.path.join(config_dir, 'garth_session')
    
    if os.path.exists(session_file):
        print(f"  [OK] Session file found: {session_file}")
        print(f"     -> Garmin Connect session may be cached")
    else:
        print(f"  [!] No session file found")
        print(f"     -> Will need to login on next run")

def main():
    """Run all diagnostic checks."""
    print("=" * 60)
    print("Garmin Import Diagnostic Tool")
    print("=" * 60)
    
    results = []
    results.append(("Virtual Environment", check_venv()))
    results.append(("Configuration", check_config()))
    results.append(("Database", check_database()))
    results.append(("Downloaded Files", check_downloaded_files()))
    check_import_status()
    check_network_auth()
    
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    
    for name, result in results:
        status = "[OK]" if result else "[!]"
        print(f"{status} {name}")
    
    print("\nCommon Issues:")
    print("1. Virtual environment not activated")
    print("   -> Activate: .\\garmin\\venv\\Scripts\\Activate.ps1")
    print("2. Missing configuration file")
    print("   -> Copy GarminConnectConfig.json.example to ~/.GarminDb/")
    print("3. Import stuck on large file")
    print("   -> Check log file for specific file causing issues")
    print("4. Network timeout")
    print("   -> Try running with --latest flag to process fewer files")
    print("5. Authentication expired")
    print("   -> Delete ~/.GarminDb/garth_session and re-run")

if __name__ == '__main__':
    main()

