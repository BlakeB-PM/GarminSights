import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../lib/db';

// Upper body muscle groups
const UPPER_BODY_GROUPS = ['chest', 'back', 'shoulders', 'biceps', 'triceps'];
// Lower body muscle groups
const LOWER_BODY_GROUPS = ['legs', 'glutes'];

/**
 * Classify a muscle group as upper, lower, or other
 */
function classifyMuscleGroup(muscleGroup: string): 'upper' | 'lower' | 'other' {
  const lower = muscleGroup.toLowerCase();
  if (UPPER_BODY_GROUPS.includes(lower)) {
    return 'upper';
  }
  if (LOWER_BODY_GROUPS.includes(lower)) {
    return 'lower';
  }
  return 'other';
}

/**
 * GET /api/muscle-groups
 * Returns distinct muscle groups from fact tables with upper/lower classification
 */
export async function GET(request: NextRequest) {
  try {
    const db = getDatabase();
    
    // Get distinct muscle groups from fact_exercise_weekly
    const query = `
      SELECT DISTINCT muscle_group
      FROM fact_exercise_weekly
      WHERE muscle_group IS NOT NULL AND muscle_group != ''
      ORDER BY muscle_group ASC
    `;
    
    const rows = db.prepare(query).all() as Array<{ muscle_group: string }>;
    const muscleGroups = rows.map(row => row.muscle_group);
    
    // Classify each muscle group
    const classified = muscleGroups.map(mg => ({
      name: mg,
      category: classifyMuscleGroup(mg),
    }));
    
    // Group by category
    const grouped = {
      upper: classified.filter(mg => mg.category === 'upper').map(mg => mg.name),
      lower: classified.filter(mg => mg.category === 'lower').map(mg => mg.name),
      other: classified.filter(mg => mg.category === 'other').map(mg => mg.name),
    };
    
    return NextResponse.json({
      muscleGroups: classified,
      grouped,
      all: muscleGroups,
    });
  } catch (error) {
    console.error('API Error:', error);
    
    if (error instanceof Error) {
      // Check if it's a database not found error
      if (error.message.includes('Database not found')) {
        return NextResponse.json(
          { error: error.message, muscleGroups: [], grouped: { upper: [], lower: [], other: [] }, all: [] },
          { status: 404 }
        );
      }
      
      // Check if it's a table not found error (table might not exist yet)
      if (error.message.includes('no such table')) {
        return NextResponse.json(
          { error: 'Muscle group table not found. Please sync your Garmin data first.', muscleGroups: [], grouped: { upper: [], lower: [], other: [] }, all: [] },
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        { error: error.message, muscleGroups: [], grouped: { upper: [], lower: [], other: [] }, all: [] },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: 'Internal server error', muscleGroups: [], grouped: { upper: [], lower: [], other: [] }, all: [] },
      { status: 500 }
    );
  }
}

