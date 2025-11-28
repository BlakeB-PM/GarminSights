#!/usr/bin/env python3
"""
Script to wipe Garmin data from databases before re-importing.

This script clears all data tables in GarminDB databases while preserving
the database structure. This allows you to re-import data with the fixed
date parsing logic.

Usage:
    python scripts/wipe_garmin_data.py [--delete-dbs]
    
Options:
    --delete-dbs    Delete entire database files instead of just clearing tables
"""

import os
import sys
import sqlite3
import argparse
from pathlib import Path

# Add garmin directory to path for imports
project_root = Path(__file__).parent.parent
garmin_path = project_root / 'garmin'
sys.path.insert(0, str(garmin_path))

try:
    from garmindb import GarminConnectConfigManager
except ImportError:
    print("Warning: Could not import GarminConnectConfigManager. Using default paths.")
    GarminConnectConfigManager = None


def find_database_files():
    """Find all Garmin database files."""
    db_files = []
    
    # Try to get database directory from config
    if GarminConnectConfigManager:
        try:
            config = GarminConnectConfigManager()
            db_dir = config.get_db_dir()
            if os.path.exists(db_dir):
                for file in os.listdir(db_dir):
                    if file.endswith('.db') and 'garmin' in file.lower():
                        db_files.append(os.path.join(db_dir, file))
        except Exception as e:
            print(f"Warning: Could not get database directory from config: {e}")
    
    # Also check default locations
    default_locations = [
        os.path.join(os.path.expanduser('~'), 'HealthData', 'DBs'),
        project_root / 'garmin',
    ]
    
    for location in default_locations:
        if os.path.exists(location):
            for file in os.listdir(location):
                if file.endswith('.db') and 'garmin' in file.lower():
                    full_path = os.path.join(location, file)
                    if full_path not in db_files:
                        db_files.append(full_path)
    
    return db_files


def get_tables_to_clear(db_path):
    """Get list of data tables to clear for a given database."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Get all tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    all_tables = [row[0] for row in cursor.fetchall()]
    
    # Tables to clear (data tables, not metadata)
    data_tables = []
    skip_tables = ['attributes', 'devices', 'device_info', 'files']  # Keep metadata
    
    for table in all_tables:
        # Skip views
        cursor.execute("SELECT type FROM sqlite_master WHERE name=? AND type='view'", (table,))
        if cursor.fetchone():
            continue
        
        # Skip metadata tables
        if table.lower() in skip_tables:
            continue
        
        # Include all other tables (they're data tables)
        data_tables.append(table)
    
    conn.close()
    return data_tables


def clear_database_tables(db_path, dry_run=False):
    """Clear all data tables in a database."""
    print(f"\n{'[DRY RUN] ' if dry_run else ''}Processing: {os.path.basename(db_path)}")
    
    try:
        tables = get_tables_to_clear(db_path)
        
        if not tables:
            print(f"  No data tables found to clear.")
            return
        
        print(f"  Found {len(tables)} table(s) to clear:")
        for table in tables:
            print(f"    - {table}")
        
        if dry_run:
            print("  [DRY RUN] Would clear these tables")
            return
        
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Disable foreign key checks temporarily
        cursor.execute("PRAGMA foreign_keys = OFF")
        
        cleared_count = 0
        for table in tables:
            try:
                cursor.execute(f"DELETE FROM {table}")
                rowcount = cursor.rowcount
                if rowcount > 0:
                    print(f"  [OK] Cleared {table} ({rowcount:,} rows)")
                    cleared_count += 1
                else:
                    print(f"  - {table} (already empty)")
            except sqlite3.Error as e:
                print(f"  [ERROR] Error clearing {table}: {e}")
        
        # Re-enable foreign key checks
        cursor.execute("PRAGMA foreign_keys = ON")
        
        conn.commit()
        conn.close()
        
        # Vacuum to reclaim space (must be done outside transaction)
        conn = sqlite3.connect(db_path)
        conn.execute("VACUUM")
        conn.close()
        
        print(f"  [OK] Cleared {cleared_count} table(s)")
        
    except sqlite3.Error as e:
        print(f"  [ERROR] Error processing database: {e}")


def delete_database_files(db_files, dry_run=False):
    """Delete database files entirely."""
    print(f"\n{'[DRY RUN] ' if dry_run else ''}Deleting database files:")
    
    for db_path in db_files:
        if os.path.exists(db_path):
            size = os.path.getsize(db_path)
            size_mb = size / (1024 * 1024)
            if dry_run:
                print(f"  [DRY RUN] Would delete: {os.path.basename(db_path)} ({size_mb:.2f} MB)")
            else:
                try:
                    os.remove(db_path)
                    print(f"  [OK] Deleted: {os.path.basename(db_path)} ({size_mb:.2f} MB)")
                except Exception as e:
                    print(f"  [ERROR] Error deleting {os.path.basename(db_path)}: {e}")
        else:
            print(f"  - {os.path.basename(db_path)} (not found)")


def main():
    parser = argparse.ArgumentParser(
        description='Wipe Garmin data from databases before re-importing',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Clear all data tables (keeps database structure)
  python scripts/wipe_garmin_data.py
  
  # Delete entire database files
  python scripts/wipe_garmin_data.py --delete-dbs
  
  # Dry run to see what would be cleared
  python scripts/wipe_garmin_data.py --dry-run
        """
    )
    parser.add_argument(
        '--delete-dbs',
        action='store_true',
        help='Delete entire database files instead of just clearing tables'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be done without actually doing it'
    )
    parser.add_argument(
        '--yes',
        action='store_true',
        help='Skip confirmation prompt (use with caution)'
    )
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("Garmin Data Wipe Script")
    print("=" * 60)
    
    if args.dry_run:
        print("\n[DRY RUN MODE - No changes will be made]")
    
    # Find database files
    db_files = find_database_files()
    
    if not db_files:
        print("\n[ERROR] No Garmin database files found.")
        print("\nChecked locations:")
        if GarminConnectConfigManager:
            try:
                config = GarminConnectConfigManager()
                print(f"  - {config.get_db_dir()}")
            except:
                pass
        print(f"  - {os.path.join(os.path.expanduser('~'), 'HealthData', 'DBs')}")
        print(f"  - {project_root / 'garmin'}")
        return 1
    
    print(f"\nFound {len(db_files)} database file(s):")
    for db_file in db_files:
        if os.path.exists(db_file):
            size = os.path.getsize(db_file)
            size_mb = size / (1024 * 1024)
            print(f"  - {os.path.basename(db_file)} ({size_mb:.2f} MB)")
        else:
            print(f"  - {os.path.basename(db_file)} (not found)")
    
    if args.delete_dbs:
        # Delete entire database files
        if not args.dry_run and not args.yes:
            response = input("\nWARNING: This will DELETE entire database files. Continue? (yes/no): ")
            if response.lower() != 'yes':
                print("Cancelled.")
                return 0
        
        delete_database_files(db_files, dry_run=args.dry_run)
    else:
        # Clear tables but keep structure
        if not args.dry_run and not args.yes:
            response = input("\nWARNING: This will clear all data from the tables. Continue? (yes/no): ")
            if response.lower() != 'yes':
                print("Cancelled.")
                return 0
        
        for db_file in db_files:
            if os.path.exists(db_file):
                clear_database_tables(db_file, dry_run=args.dry_run)
    
    print("\n" + "=" * 60)
    if args.dry_run:
        print("Dry run complete. Run without --dry-run to apply changes.")
    else:
        print("[OK] Data wipe complete!")
        print("\nNext steps:")
        print("1. Re-import your Garmin data:")
        print("   cd garmin")
        print("   .\\venv\\Scripts\\Activate.ps1")
        print("   python scripts\\garmindb_cli.py --all --download --import --analyze")
        print("\n2. The date fix will be applied during import.")
    print("=" * 60)
    
    return 0


if __name__ == '__main__':
    sys.exit(main())

