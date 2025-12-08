import { NextResponse } from 'next/server';
import { findAllDatabaseFiles } from '@/app/lib/db';
import Database from 'better-sqlite3';
import { existsSync, statSync } from 'fs';
import { join } from 'path';
import os from 'os';

/**
 * GET /api/sync/status
 * Returns sync status and data freshness information
 */
export async function GET() {
  try {
    const allDbFiles = findAllDatabaseFiles();
    
    // Find summary database for checking data freshness
    const homedir = os.homedir();
    const defaultDbDir = join(homedir, 'HealthData', 'DBs');
    const summaryDbPath = join(defaultDbDir, 'garmin_summary.db');
    
    let lastSyncTime: Date | null = null;
    let dataFreshness: 'fresh' | 'stale' | 'unknown' = 'unknown';
    let daysSinceLastSync: number | null = null;
    let rowCounts: Record<string, number> = {};
    let dataCompleteness: Record<string, { total: number; withData: number; percent: number }> = {};
    
    // Check if summary database exists and get last update time
    if (existsSync(summaryDbPath)) {
      try {
        const stats = statSync(summaryDbPath);
        lastSyncTime = stats.mtime;
        const now = new Date();
        const diffMs = now.getTime() - lastSyncTime.getTime();
        daysSinceLastSync = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        // Determine freshness (fresh = < 2 days, stale = > 7 days)
        if (daysSinceLastSync < 2) {
          dataFreshness = 'fresh';
        } else if (daysSinceLastSync > 7) {
          dataFreshness = 'stale';
        } else {
          dataFreshness = 'stale'; // Consider anything > 2 days as stale
        }
        
        // Check data in summary database
        const db = new Database(summaryDbPath, { readonly: true });
        
        try {
          // Check days_summary table
          const daysSummaryCount = db.prepare('SELECT COUNT(*) as count FROM days_summary').get() as { count: number };
          rowCounts.days_summary = daysSummaryCount.count;
          
          // Check for data completeness (rows with actual data)
          const daysWithSteps = db.prepare('SELECT COUNT(*) as count FROM days_summary WHERE steps > 0').get() as { count: number };
          const daysWithSleep = db.prepare('SELECT COUNT(*) as count FROM days_summary WHERE sleep_avg IS NOT NULL').get() as { count: number };
          const daysWithHR = db.prepare('SELECT COUNT(*) as count FROM days_summary WHERE hr_avg IS NOT NULL').get() as { count: number };
          
          dataCompleteness = {
            steps: {
              total: daysSummaryCount.count,
              withData: daysWithSteps.count,
              percent: daysSummaryCount.count > 0 ? (daysWithSteps.count / daysSummaryCount.count) * 100 : 0,
            },
            sleep: {
              total: daysSummaryCount.count,
              withData: daysWithSleep.count,
              percent: daysSummaryCount.count > 0 ? (daysWithSleep.count / daysSummaryCount.count) * 100 : 0,
            },
            heartRate: {
              total: daysSummaryCount.count,
              withData: daysWithHR.count,
              percent: daysSummaryCount.count > 0 ? (daysWithHR.count / daysSummaryCount.count) * 100 : 0,
            },
          };
          
          db.close();
        } catch (error) {
          db.close();
          // Table might not exist yet
        }
      } catch (error) {
        // Couldn't read file stats
      }
    }
    
    // Check activities database
    const activitiesDbPath = join(defaultDbDir, 'garmin_activities.db');
    if (existsSync(activitiesDbPath)) {
      try {
        const db = new Database(activitiesDbPath, { readonly: true });
        const activitiesCount = db.prepare('SELECT COUNT(*) as count FROM activities').get() as { count: number };
        rowCounts.activities = activitiesCount.count;
        db.close();
      } catch (error) {
        // Table might not exist
      }
    }
    
    // Check monitoring database
    const monitoringDbPath = join(defaultDbDir, 'garmin_monitoring.db');
    if (existsSync(monitoringDbPath)) {
      try {
        const db = new Database(monitoringDbPath, { readonly: true });
        const monitoringCount = db.prepare('SELECT COUNT(*) as count FROM monitoring').get() as { count: number };
        rowCounts.monitoring = monitoringCount.count;
        db.close();
      } catch (error) {
        // Table might not exist
      }
    }
    
    return NextResponse.json({
      lastSyncTime: lastSyncTime?.toISOString() || null,
      daysSinceLastSync,
      dataFreshness,
      rowCounts,
      dataCompleteness,
      databasesFound: allDbFiles.length,
      needsSync: dataFreshness === 'stale' || daysSinceLastSync === null,
    });
  } catch (error) {
    console.error('Error checking sync status:', error);
    return NextResponse.json(
      { error: 'Failed to check sync status' },
      { status: 500 }
    );
  }
}

