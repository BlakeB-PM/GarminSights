import { NextRequest, NextResponse } from 'next/server';
import { findAllDatabaseFiles } from '@/app/lib/db';
import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { join } from 'path';
import os from 'os';
import { calculateRecoveryScore, detectOvertraining, calculateRecoveryTrend } from '@/app/lib/insights/recovery';

/**
 * GET /api/insights/recovery
 * Returns recovery insights and scores
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '7', 10);
    
    const homedir = os.homedir();
    const defaultDbDir = join(homedir, 'HealthData', 'DBs');
    const summaryDbPath = join(defaultDbDir, 'garmin_summary.db');
    
    // Try to find summary database
    let db: Database.Database | null = null;
    const allDbFiles = findAllDatabaseFiles();
    
    for (const dbFile of allDbFiles) {
      if (dbFile.includes('summary')) {
        try {
          const testDb = new Database(dbFile, { readonly: true });
          const tables = testDb.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='days_summary'
          `).all() as Array<{ name: string }>;
          
          if (tables.length > 0) {
            db = testDb;
            break;
          } else {
            testDb.close();
          }
        } catch {
          continue;
        }
      }
    }
    
    if (!db && existsSync(summaryDbPath)) {
      db = new Database(summaryDbPath, { readonly: true });
    }
    
    if (!db) {
      return NextResponse.json(
        { error: 'Summary database not found. Please sync your data first.' },
        { status: 404 }
      );
    }
    
    try {
      // Get recent daily data
      const recentData = db.prepare(`
        SELECT * FROM days_summary 
        ORDER BY day DESC 
        LIMIT ?
      `).all(days) as any[];
      
      if (recentData.length === 0) {
        return NextResponse.json({
          recoveryScore: null,
          overtraining: null,
          trend: null,
          message: 'No data available for recovery analysis.',
        });
      }
      
      // Get most recent day for current recovery score
      const mostRecent = recentData[0];
      
      // Calculate sleep quality (REM / total sleep)
      let sleepQuality = 0.2; // Default
      if (mostRecent.sleep_avg && mostRecent.rem_sleep_avg) {
        const sleepParts = mostRecent.sleep_avg.split(':');
        const remParts = mostRecent.rem_sleep_avg.split(':');
        const totalSleepMinutes = parseInt(sleepParts[0]) * 60 + parseInt(sleepParts[1]);
        const remSleepMinutes = parseInt(remParts[0]) * 60 + parseInt(remParts[1]);
        if (totalSleepMinutes > 0) {
          sleepQuality = remSleepMinutes / totalSleepMinutes;
        }
      }
      
      // Calculate activity load (normalized intensity time)
      const avgIntensityTime = recentData
        .map((d) => {
          if (!d.intensity_time) return 0;
          const parts = d.intensity_time.split(':');
          return parseInt(parts[0]) * 60 + parseInt(parts[1]);
        })
        .filter((v) => v > 0)
        .reduce((a, b, _, arr) => a + b / arr.length, 0);
      const activityLoad = Math.min(1, avgIntensityTime / 150); // Normalize to 0-1 (150 min = max)
      
      const recoveryMetrics = {
        sleepQuality,
        stressLevel: mostRecent.stress_avg || 50,
        restingHR: mostRecent.rhr_avg || 60,
        bodyBatteryRange: (mostRecent.bb_max || 50) - (mostRecent.bb_min || 0),
        activityLoad,
      };
      
      const recoveryScore = calculateRecoveryScore(recoveryMetrics);
      const overtraining = detectOvertraining(recentData);
      
      // Get weekly recovery data for trend
      let weeklyRecoveryData: any[] = [];
      try {
        weeklyRecoveryData = db.prepare(`
          SELECT * FROM fact_recovery_weekly 
          ORDER BY week_start_date DESC 
          LIMIT 8
        `).all() as any[];
      } catch {
        // Table doesn't exist yet
      }
      
      const trend = weeklyRecoveryData.length >= 2
        ? calculateRecoveryTrend(weeklyRecoveryData)
        : null;
      
      db.close();
      
      return NextResponse.json({
        recoveryScore,
        overtraining,
        trend,
        recentMetrics: recoveryMetrics,
        dataRange: {
          start: recentData[recentData.length - 1]?.day,
          end: recentData[0]?.day,
        },
      });
    } catch (error) {
      db.close();
      throw error;
    }
  } catch (error) {
    console.error('Error fetching recovery insights:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recovery insights' },
      { status: 500 }
    );
  }
}

