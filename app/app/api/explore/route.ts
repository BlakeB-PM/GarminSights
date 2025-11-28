import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../lib/db';

// Valid view types
type ViewType = 'exercise' | 'muscle_group' | 'workout_type';

// Valid metrics for each view type
const VALID_METRICS = {
  exercise: ['total_tonnage', 'total_sets', 'total_reps'],
  muscle_group: ['total_tonnage', 'total_sets', 'total_reps'],
  workout_type: ['total_duration_min', 'total_sessions', 'total_distance_km', 'total_tonnage'],
} as const;

// Table mappings
const TABLE_MAP: Record<ViewType, string> = {
  exercise: 'fact_exercise_weekly',
  muscle_group: 'fact_muscle_group_weekly',
  workout_type: 'fact_workout_type_weekly',
};

interface QueryParams {
  view: ViewType | null;
  metric: string | null;
  period: string | null;
  exercise_name?: string | null;
  muscle_group?: string | null;
  workout_type?: string | null;
  start?: string | null;
  end?: string | null;
}

/**
 * Validate and parse query parameters
 */
function parseQueryParams(searchParams: URLSearchParams): QueryParams {
  return {
    view: searchParams.get('view') as ViewType | null,
    metric: searchParams.get('metric'),
    period: searchParams.get('period') || 'week',
    exercise_name: searchParams.get('exercise_name'),
    muscle_group: searchParams.get('muscle_group'),
    workout_type: searchParams.get('workout_type'),
    start: searchParams.get('start'),
    end: searchParams.get('end'),
  };
}

/**
 * Validate query parameters
 */
function validateParams(params: QueryParams): { valid: boolean; error?: string } {
  // Validate required parameters
  if (!params.view) {
    return { valid: false, error: 'Missing required parameter: view' };
  }

  if (!VALID_METRICS[params.view]) {
    return { valid: false, error: `Invalid view: ${params.view}. Must be one of: exercise, muscle_group, workout_type` };
  }

  if (!params.metric) {
    return { valid: false, error: 'Missing required parameter: metric' };
  }

  const validMetrics = VALID_METRICS[params.view];
  if (!validMetrics.includes(params.metric as any)) {
    return {
      valid: false,
      error: `Invalid metric for view "${params.view}": ${params.metric}. Must be one of: ${validMetrics.join(', ')}`,
    };
  }

  if (params.period && params.period !== 'week') {
    return { valid: false, error: `Invalid period: ${params.period}. Currently only "week" is supported` };
  }

  return { valid: true };
}

/**
 * Build SQL query based on view, metric, and filters
 */
function buildQuery(
  view: ViewType,
  metric: string,
  filters: {
    exercise_name?: string | null;
    muscle_group?: string | null;
    workout_type?: string | null;
    start?: string | null;
    end?: string | null;
  }
): { query: string; params: any[] } {
  const table = TABLE_MAP[view];
  const whereClauses: string[] = [];
  const params: any[] = [];

  // Build WHERE clauses based on filters
  if (filters.exercise_name && view === 'exercise') {
    whereClauses.push('exercise_name = ?');
    params.push(filters.exercise_name);
  }

  if (filters.muscle_group && (view === 'exercise' || view === 'muscle_group')) {
    whereClauses.push('muscle_group = ?');
    params.push(filters.muscle_group);
  }

  if (filters.workout_type && view === 'workout_type') {
    whereClauses.push('workout_type = ?');
    params.push(filters.workout_type);
  }

  if (filters.start) {
    whereClauses.push('week_start_date >= ?');
    params.push(filters.start);
  }

  if (filters.end) {
    whereClauses.push('week_start_date <= ?');
    params.push(filters.end);
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Build SELECT clause based on view
  let selectColumns: string;
  if (view === 'exercise') {
    selectColumns = 'week_start_date, exercise_name, muscle_group, total_tonnage, total_sets, total_reps';
  } else if (view === 'muscle_group') {
    selectColumns = 'week_start_date, muscle_group, total_tonnage, total_sets, total_reps';
  } else {
    // workout_type
    selectColumns = 'week_start_date, workout_type, total_duration_min, total_sessions, total_distance_km, total_tonnage';
  }

  // Add the metric as 'value' for consistent response format
  const query = `
    SELECT ${selectColumns}, ${metric} as value
    FROM ${table}
    ${whereClause}
    ORDER BY week_start_date ASC
  `;

  return { query, params };
}

export async function GET(request: NextRequest) {
  try {
    // Parse query parameters
    const params = parseQueryParams(request.nextUrl.searchParams);

    // Validate parameters
    const validation = validateParams(params);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    // Get database connection
    const db = getDatabase();

    // Build and execute query
    const { query, params: queryParams } = buildQuery(
      params.view!,
      params.metric!,
      {
        exercise_name: params.exercise_name,
        muscle_group: params.muscle_group,
        workout_type: params.workout_type,
        start: params.start,
        end: params.end,
      }
    );

    const rows = db.prepare(query).all(...queryParams) as any[];

    // Format response
    const response = {
      data: rows,
      meta: {
        view: params.view,
        metric: params.metric,
        period: params.period || 'week',
        count: rows.length,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('API Error:', error);
    
    if (error instanceof Error) {
      // Check if it's a database not found error
      if (error.message.includes('Database not found')) {
        return NextResponse.json(
          { error: error.message },
          { status: 404 }
        );
      }
      
      // Check if it's a database query error
      if (error.message.includes('no such table') || error.message.includes('Failed to open database')) {
        return NextResponse.json(
          { error: `Database error: ${error.message}` },
          { status: 500 }
        );
      }
      
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
