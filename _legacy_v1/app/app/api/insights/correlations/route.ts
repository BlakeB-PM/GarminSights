import { NextRequest, NextResponse } from 'next/server';
import { findAllDatabaseFiles } from '@/app/lib/db';
import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { join } from 'path';
import os from 'os';
import { analyzeCommonCorrelations, findCorrelations } from '@/app/lib/insights/correlations';

/**
 * GET /api/insights/correlations
 * Returns correlation analysis between metrics
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const targetMetric = searchParams.get('target');
    const candidateMetrics = searchParams.get('candidates')?.split(',') || [];
    const weeks = parseInt(searchParams.get('weeks') || '12', 10);
    
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
      // Get weekly aggregated data
      let weeklyData: any[] = [];
      
      try {
        weeklyData = db.prepare(`
          SELECT * FROM fact_health_weekly 
          ORDER BY week_start_date DESC 
          LIMIT ?
        `).all(weeks) as any[];
      } catch {
        // Table doesn't exist, aggregate from days_summary
        weeklyData = db.prepare(`
          SELECT 
            DATE(day, 'weekday 0', '-6 days') as week_start_date,
            AVG(steps) as avg_steps,
            AVG(CASE WHEN sleep_avg IS NOT NULL THEN 
              (CAST(substr(sleep_avg, 1, 2) AS INTEGER) * 60 + CAST(substr(sleep_avg, 4, 2) AS INTEGER)) / 60.0 
            END) as avg_sleep_hours,
            AVG(stress_avg) as avg_stress,
            AVG(rhr_avg) as avg_rhr,
            AVG(hr_avg) as avg_hr,
            SUM(CASE WHEN intensity_time IS NOT NULL THEN 
              (CAST(substr(intensity_time, 1, 2) AS INTEGER) * 60 + CAST(substr(intensity_time, 4, 2) AS INTEGER)) 
            END) as total_intensity_time_min
          FROM days_summary
          WHERE day IS NOT NULL
          GROUP BY week_start_date
          ORDER BY week_start_date DESC
          LIMIT ?
        `).all(weeks) as any[];
      }
      
      if (weeklyData.length < 3) {
        return NextResponse.json({
          correlations: [],
          message: 'Not enough data for correlation analysis (need at least 3 weeks).',
        });
      }
      
      // Reverse to chronological order for correlation calculation
      const chronologicalData = weeklyData.reverse();
      
      let correlations;
      if (targetMetric && candidateMetrics.length > 0) {
        // Find correlations for specific target metric
        correlations = findCorrelations(chronologicalData, targetMetric, candidateMetrics);
      } else {
        // Analyze common correlations
        correlations = analyzeCommonCorrelations(chronologicalData);
      }
      
      db.close();
      
      return NextResponse.json({
        correlations,
        dataPoints: weeklyData.length,
        weeksAnalyzed: weeks,
      });
    } catch (error) {
      db.close();
      throw error;
    }
  } catch (error) {
    console.error('Error fetching correlations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch correlations' },
      { status: 500 }
    );
  }
}

