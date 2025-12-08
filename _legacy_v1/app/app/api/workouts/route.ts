import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../lib/db';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import os from 'os';

interface ExerciseSet {
  reps: number;
  weight: number;
}

interface Exercise {
  name: string;
  sets: ExerciseSet[];
  totalTonnage: number;
  totalSets: number;
  totalReps: number;
}

interface Workout {
  activityId: string;
  name: string | null;
  sport: string | null;
  subSport: string | null;
  startTime: string | null;
  stopTime: string | null;
  duration: string | null;
  avgHr: number | null;
  maxHr: number | null;
  calories: number | null;
  trainingLoad: number | null;
  trainingEffect: number | null;
  exercises: Exercise[];
}

/**
 * Find activity JSON files directory
 */
function findJsonFilesDirectory(): string | null {
  // Check project location first
  const appDir = process.cwd();
  const projectRoot = resolve(appDir, '..');
  const possiblePaths = [
    join(projectRoot, 'garmin', 'Json', 'ActivityDetails'),
    join(projectRoot, 'garmin', 'json', 'activity'),
    join(projectRoot, 'garmin', 'activity_details'),
    join(projectRoot, 'garmin', 'Json'),
    join(projectRoot, 'garmin', 'json'),
  ];
  
  for (const path of possiblePaths) {
    if (existsSync(path)) {
      // Check if it's a directory with JSON files
      try {
        const files = require('fs').readdirSync(path);
        if (files.some((f: string) => f.includes('activity_details') && f.endsWith('.json'))) {
          return path;
        }
      } catch {
        // Continue to next path
      }
    }
  }
  
  // Check default GarminDB location
  const homedir = os.homedir();
  const defaultPaths = [
    join(homedir, 'HealthData', 'Json', 'ActivityDetails'),
    join(homedir, 'HealthData', 'json', 'activity'),
    join(homedir, 'HealthData', 'Json'),
    join(homedir, 'HealthData', 'json'),
  ];
  
  for (const path of defaultPaths) {
    if (existsSync(path)) {
      try {
        const files = require('fs').readdirSync(path);
        if (files.some((f: string) => f.includes('activity_details') && f.endsWith('.json'))) {
          return path;
        }
      } catch {
        // Continue to next path
      }
    }
  }
  
  return null;
}

/**
 * Read exercise data from JSON file
 */
function extractExercisesFromJson(jsonPath: string): Exercise[] {
  try {
    const fileContent = readFileSync(jsonPath, 'utf-8');
    const data = JSON.parse(fileContent);
    
    const exerciseSets = data.exerciseSetsDTOs || [];
    const exercises: Exercise[] = [];
    
    for (const exerciseSet of exerciseSets) {
      const exerciseName = exerciseSet.exerciseName || 'Unknown';
      const sets = exerciseSet.sets || [];
      
      let totalTonnage = 0;
      let totalReps = 0;
      const exerciseSets: ExerciseSet[] = [];
      
      for (const setData of sets) {
        const reps = setData.reps || 0;
        const weight = setData.weight || 0;
        totalReps += reps;
        totalTonnage += reps * weight;
        exerciseSets.push({ reps, weight });
      }
      
      if (sets.length > 0) {
        exercises.push({
          name: exerciseName,
          sets: exerciseSets,
          totalTonnage,
          totalSets: sets.length,
          totalReps,
        });
      }
    }
    
    return exercises;
  } catch (error) {
    console.error(`Error reading JSON file ${jsonPath}:`, error);
    return [];
  }
}

/**
 * GET /api/workouts
 * Returns list of workouts with exercise details
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('start');
    const endDate = searchParams.get('end');
    const sport = searchParams.get('sport');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;
    
    const db = getDatabase();
    
    // Build query
    let query = `
      SELECT 
        activity_id,
        name,
        sport,
        sub_sport,
        start_time,
        stop_time,
        elapsed_time,
        avg_hr,
        max_hr,
        calories,
        training_load,
        training_effect
      FROM activities
      WHERE 1=1
    `;
    
    const params: any[] = [];
    
    if (startDate) {
      query += ' AND DATE(start_time) >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      query += ' AND DATE(start_time) <= ?';
      params.push(endDate);
    }
    
    if (sport) {
      query += ' AND (sport = ? OR sub_sport = ?)';
      params.push(sport, sport);
    }
    
    query += ' ORDER BY start_time DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const rows = db.prepare(query).all(...params) as any[];
    
    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM activities
      WHERE 1=1
    `;
    const countParams: any[] = [];
    
    if (startDate) {
      countQuery += ' AND DATE(start_time) >= ?';
      countParams.push(startDate);
    }
    
    if (endDate) {
      countQuery += ' AND DATE(start_time) <= ?';
      countParams.push(endDate);
    }
    
    if (sport) {
      countQuery += ' AND (sport = ? OR sub_sport = ?)';
      countParams.push(sport, sport);
    }
    
    const countResult = db.prepare(countQuery).get(...countParams) as { total: number };
    const total = countResult.total;
    
    // Find JSON files directory
    const jsonDir = findJsonFilesDirectory();
    if (!jsonDir) {
      console.warn('JSON files directory not found. Exercise details will not be available.');
    } else {
      console.log('Found JSON files directory:', jsonDir);
    }
    
    // Process workouts and add exercise data
    const workouts: Workout[] = [];
    
    for (const row of rows) {
      const workout: Workout = {
        activityId: row.activity_id,
        name: row.name,
        sport: row.sport,
        subSport: row.sub_sport,
        startTime: row.start_time,
        stopTime: row.stop_time,
        duration: row.elapsed_time,
        avgHr: row.avg_hr,
        maxHr: row.max_hr,
        calories: row.calories,
        trainingLoad: row.training_load,
        trainingEffect: row.training_effect,
        exercises: [],
      };
      
      // Try to load exercise data from JSON file if it's a strength training workout
      if (jsonDir && (row.sport === 'strength_training' || row.sub_sport === 'strength_training')) {
        // Try multiple possible file name patterns
        const possibleFileNames = [
          `activity_details_${row.activity_id}.json`,
          `${row.activity_id}.json`,
          `activity_${row.activity_id}.json`,
        ];
        
        let found = false;
        for (const fileName of possibleFileNames) {
          const jsonPath = join(jsonDir, fileName);
          if (existsSync(jsonPath)) {
            workout.exercises = extractExercisesFromJson(jsonPath);
            found = true;
            console.log(`Found JSON file for activity ${row.activity_id}: ${jsonPath}`);
            break;
          }
        }
        
        // If not found in main directory, search subdirectories
        if (!found) {
          try {
            const fs = require('fs');
            const files = fs.readdirSync(jsonDir, { withFileTypes: true });
            for (const file of files) {
              if (file.isDirectory()) {
                for (const fileName of possibleFileNames) {
                  const jsonPath = join(jsonDir, file.name, fileName);
                  if (existsSync(jsonPath)) {
                    workout.exercises = extractExercisesFromJson(jsonPath);
                    found = true;
                    console.log(`Found JSON file for activity ${row.activity_id} in subdirectory: ${jsonPath}`);
                    break;
                  }
                }
                if (found) break;
              } else if (file.name.includes(row.activity_id) && file.name.endsWith('.json')) {
                // Try any JSON file that contains the activity ID
                const jsonPath = join(jsonDir, file.name);
                workout.exercises = extractExercisesFromJson(jsonPath);
                found = true;
                console.log(`Found JSON file for activity ${row.activity_id}: ${jsonPath}`);
                break;
              }
            }
          } catch (err) {
            console.error(`Error searching for JSON file for activity ${row.activity_id}:`, err);
          }
        }
        
        if (!found) {
          console.warn(`No JSON file found for strength training activity ${row.activity_id}`);
        }
      }
      
      workouts.push(workout);
    }
    
    return NextResponse.json({
      workouts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('API Error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('Database not found')) {
        return NextResponse.json(
          { error: error.message, workouts: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } },
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        { error: error.message, workouts: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: 'Internal server error', workouts: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } },
      { status: 500 }
    );
  }
}

