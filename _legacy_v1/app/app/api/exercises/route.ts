import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../lib/db';

/**
 * GET /api/exercises
 * Returns a list of distinct exercise names from the fact_exercise_weekly table
 */
export async function GET(request: NextRequest) {
  try {
    const db = getDatabase();
    
    // Get distinct exercise names, ordered alphabetically
    const query = `
      SELECT DISTINCT exercise_name
      FROM fact_exercise_weekly
      ORDER BY exercise_name ASC
    `;
    
    const rows = db.prepare(query).all() as Array<{ exercise_name: string }>;
    const exercises = rows.map(row => row.exercise_name);
    
    return NextResponse.json({ exercises });
  } catch (error) {
    console.error('API Error:', error);
    
    if (error instanceof Error) {
      // Check if it's a database not found error
      if (error.message.includes('Database not found')) {
        return NextResponse.json(
          { error: error.message, exercises: [] },
          { status: 404 }
        );
      }
      
      // Check if it's a table not found error (table might not exist yet)
      if (error.message.includes('no such table')) {
        return NextResponse.json(
          { error: 'Exercise table not found. Please sync your Garmin data first.', exercises: [] },
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        { error: error.message, exercises: [] },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: 'Internal server error', exercises: [] },
      { status: 500 }
    );
  }
}

