import { NextResponse } from 'next/server';
import { findAllDatabaseFiles } from '@/app/lib/db';
import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { join } from 'path';
import os from 'os';

/**
 * GET /api/insights/summary
 * Returns overall dashboard summary with key insights
 */
export async function GET() {
  try {
    const homedir = os.homedir();
    const defaultDbDir = join(homedir, 'HealthData', 'DBs');
    const summaryDbPath = join(defaultDbDir, 'garmin_summary.db');
    
    if (!existsSync(summaryDbPath)) {
      return NextResponse.json(
        { error: 'Summary database not found. Please sync your data first.' },
        { status: 404 }
      );
    }
    
    const db = new Database(summaryDbPath, { readonly: true });
    
    try {
      // Get most recent week's data
      const recentWeek = db.prepare(`
        SELECT * FROM days_summary 
        ORDER BY day DESC 
        LIMIT 7
      `).all() as any[];
      
      if (recentWeek.length === 0) {
        return NextResponse.json({
          insights: [],
          metrics: {},
          message: 'No data available. Please sync your Garmin data.',
        });
      }
      
      // Calculate key metrics
      const avgSteps = recentWeek
        .map((d) => d.steps || 0)
        .reduce((a, b) => a + b, 0) / recentWeek.length;
      
      const avgSleep = recentWeek
        .map((d) => {
          if (!d.sleep_avg) return null;
          const parts = d.sleep_avg.split(':');
          return parseInt(parts[0]) * 60 + parseInt(parts[1]);
        })
        .filter((v) => v !== null) as number[];
      const avgSleepMinutes = avgSleep.length > 0
        ? avgSleep.reduce((a, b) => a + b, 0) / avgSleep.length
        : 0;
      
      const avgStress = recentWeek
        .map((d) => d.stress_avg)
        .filter((v) => v !== null && v !== undefined)
        .reduce((a, b, _, arr) => a + b! / arr.length, 0);
      
      const avgRHR = recentWeek
        .map((d) => d.rhr_avg)
        .filter((v) => v !== null && v !== undefined)
        .reduce((a, b, _, arr) => a + b! / arr.length, 0);
      
      // Get previous week for comparison
      const previousWeek = db.prepare(`
        SELECT * FROM days_summary 
        WHERE day < DATE((SELECT MAX(day) FROM days_summary), '-7 days')
        ORDER BY day DESC 
        LIMIT 7
      `).all() as any[];
      
      const insights: Array<{
        type: string;
        message: string;
        trend: 'up' | 'down' | 'stable';
        value: number;
        change?: number;
      }> = [];
      
      if (previousWeek.length > 0) {
        const prevAvgSteps = previousWeek
          .map((d) => d.steps || 0)
          .reduce((a, b) => a + b, 0) / previousWeek.length;
        
        const stepsChange = avgSteps - prevAvgSteps;
        const stepsChangePercent = prevAvgSteps > 0 ? (stepsChange / prevAvgSteps) * 100 : 0;
        
        if (Math.abs(stepsChangePercent) > 10) {
          insights.push({
            type: 'steps',
            message: `Steps ${stepsChangePercent > 0 ? 'increased' : 'decreased'} by ${Math.abs(stepsChangePercent).toFixed(0)}%`,
            trend: stepsChangePercent > 0 ? 'up' : 'down',
            value: Math.round(avgSteps),
            change: Math.round(stepsChange),
          });
        }
      }
      
      // Add sleep insight
      if (avgSleepMinutes > 0) {
        const sleepHours = avgSleepMinutes / 60;
        if (sleepHours < 7) {
          insights.push({
            type: 'sleep',
            message: `Average sleep is ${sleepHours.toFixed(1)} hours - below recommended 7-9 hours`,
            trend: 'down',
            value: sleepHours,
          });
        } else if (sleepHours >= 8) {
          insights.push({
            type: 'sleep',
            message: `Great sleep! Averaging ${sleepHours.toFixed(1)} hours per night`,
            trend: 'up',
            value: sleepHours,
          });
        }
      }
      
      // Add stress insight
      if (avgStress > 0) {
        if (avgStress > 40) {
          insights.push({
            type: 'stress',
            message: `High stress levels detected (${avgStress.toFixed(0)}/100) - consider rest`,
            trend: 'down',
            value: avgStress,
          });
        } else if (avgStress < 25) {
          insights.push({
            type: 'stress',
            message: `Low stress levels (${avgStress.toFixed(0)}/100) - good recovery`,
            trend: 'up',
            value: avgStress,
          });
        }
      }
      
      db.close();
      
      return NextResponse.json({
        insights,
        metrics: {
          avgSteps: Math.round(avgSteps),
          avgSleepHours: (avgSleepMinutes / 60).toFixed(1),
          avgStress: avgStress.toFixed(0),
          avgRHR: avgRHR ? Math.round(avgRHR) : null,
        },
        dataRange: {
          start: recentWeek[recentWeek.length - 1]?.day,
          end: recentWeek[0]?.day,
        },
      });
    } catch (error) {
      db.close();
      throw error;
    }
  } catch (error) {
    console.error('Error fetching insights summary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch insights summary' },
      { status: 500 }
    );
  }
}

