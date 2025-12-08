import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/app/lib/db';
import { getDatabasePath, findAllDatabaseFiles } from '@/app/lib/db';
import Database from 'better-sqlite3';
import { existsSync } from 'fs';

/**
 * GET /api/daily-data
 * Returns all daily summary data from the database
 * Query params:
 *   - start: start date (YYYY-MM-DD)
 *   - end: end date (YYYY-MM-DD)
 *   - limit: max number of records to return (default: 1000)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    const startDate = searchParams.get('start') || null;
    const endDate = searchParams.get('end') || null;
    const limit = parseInt(searchParams.get('limit') || '1000', 10);
    const showTables = searchParams.get('debug') === 'true'; // Debug flag to show all tables
    
    // Find all database files
    const allDbFiles = findAllDatabaseFiles();
    
    // Try to find the database file that contains summary tables
    let db: Database.Database | null = null;
    let dbPath: string | null = null;
    let allTables: Array<{ name: string }> = [];
    let tables: Array<{ name: string }> = [];
    
    // Try each database file to find one with summary tables that has data
    // Prefer databases with data, and prefer days_summary over daily_summary
    // Also prefer databases that have the intensity_time column
    let bestDb: Database.Database | null = null;
    let bestDbPath: string | null = null;
    let bestTables: Array<{ name: string }> = [];
    let bestAllTables: Array<{ name: string }> = [];
    let bestRowCount = 0;
    let bestHasIntensityTime = false;
    
    for (const dbFile of allDbFiles) {
      try {
        const testDb = new Database(dbFile, { readonly: true });
        const testTables = testDb.prepare(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND (name='days_summary' OR name='daily_summary')
          ORDER BY name
        `).all() as Array<{ name: string }>;
        
        if (testTables.length > 0) {
          // Check if this table has data and prefer days_summary
          const targetTable = testTables.find(t => t.name === 'days_summary') || testTables[0];
          
          // Check if the table has intensity_time column (required for correct data)
          let hasIntensityTime = false;
          try {
            const tableInfo = testDb.prepare(`PRAGMA table_info("${targetTable.name}")`).all() as Array<{ name: string }>;
            hasIntensityTime = tableInfo.some(col => col.name === 'intensity_time');
          } catch {
            // If we can't check, assume it doesn't have it
          }
          
          try {
            const rowCountStmt = testDb.prepare(`SELECT COUNT(*) as count FROM "${targetTable.name}"`);
            const rowCountResult = rowCountStmt.get() as { count: number };
            const rowCount = rowCountResult.count;
            
            // Prefer databases with:
            // 1. intensity_time column (REQUIRED - highest priority)
            // 2. days_summary table (over daily_summary)
            // 3. More rows
            const isBetter = 
              bestDb === null || // First database found
              (hasIntensityTime && !bestHasIntensityTime) || // Has required column (highest priority)
              (hasIntensityTime === bestHasIntensityTime && targetTable.name === 'days_summary' && bestTables[0]?.name === 'daily_summary') || // Same column status, better table
              (hasIntensityTime === bestHasIntensityTime && targetTable.name === bestTables[0]?.name && rowCount > bestRowCount); // Same table/column status, more rows
            
            if (isBetter || bestDb === null) {
              // Close previous database if we're switching
              if (bestDb && bestDb !== testDb) {
                bestDb.close();
              }
              
              bestDb = testDb;
              bestDbPath = dbFile;
              bestTables = testTables;
              bestRowCount = rowCount;
              bestHasIntensityTime = hasIntensityTime;
              bestAllTables = testDb.prepare(`
                SELECT name FROM sqlite_master 
                WHERE type='table'
                ORDER BY name
              `).all() as Array<{ name: string }>;
            } else {
              // This database isn't better, close it
              testDb.close();
            }
          } catch (countError) {
            // Couldn't count rows, skip this database
            testDb.close();
            continue;
          }
        } else {
          testDb.close();
        }
      } catch (error) {
        // Skip this database file and try the next one
        continue;
      }
    }
    
    // Use the best database we found
    if (bestDb) {
      db = bestDb;
      dbPath = bestDbPath;
      tables = bestTables;
      allTables = bestAllTables;
    }
    
    // If we haven't found a database with summary tables yet, use the default one for debugging
    if (!db) {
      db = getDatabase();
      dbPath = getDatabasePath();
      allTables = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table'
        ORDER BY name
      `).all() as Array<{ name: string }>;
      
      tables = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND (name='days_summary' OR name='daily_summary')
        ORDER BY name
      `).all() as Array<{ name: string }>;
    }
    
    // If debug mode, return all tables info
    if (showTables) {
      return NextResponse.json({
        allTables: allTables.map(t => t.name),
        summaryTables: tables.map(t => t.name),
        message: 'Debug: List of all tables in database',
        databasePath: dbPath || 'unknown',
        checkedDatabases: allDbFiles,
        foundDatabase: dbPath
      });
    }
    
    if (tables.length === 0) {
      // Try to find activities table or other data tables as a fallback
      const activitiesTable = allTables.find(t => t.name.toLowerCase().includes('activit'));
      const monitoringTable = allTables.find(t => t.name.toLowerCase().includes('monitoring'));
      
      return NextResponse.json(
        { 
          error: 'No daily summary tables found in any database',
          hint: `Checked databases: ${allDbFiles.length} file(s). Available tables in current database (${allTables.length}): ${allTables.slice(0, 20).map(t => t.name).join(', ')}${allTables.length > 20 ? '...' : ''}`,
          suggestion: 'The daily summary tables (days_summary or daily_summary) might not be created yet. You need to run the GarminDB sync with the --analyze flag to create summary tables. The summary tables are typically in garmin_summary.db or garmin.db files.',
          checkedDatabaseFiles: allDbFiles,
          foundActivities: !!activitiesTable,
          foundMonitoring: !!monitoringTable,
          debug: 'Add ?debug=true to the URL to see all tables and checked databases'
        },
        { status: 404 }
      );
    }
    
    // Build the query
    let query = '';
    let params: any[] = [];
    
    // Prefer days_summary if available, otherwise use daily_summary
    // Validate table name against whitelist for safety
    const validTableNames = ['days_summary', 'daily_summary'];
    const foundTable = tables.find(t => t.name === 'days_summary') || tables.find(t => t.name === 'daily_summary');
    const tableName = foundTable?.name || tables[0]?.name;
    
    // Double-check that table name is valid (security check)
    if (!validTableNames.includes(tableName)) {
      return NextResponse.json(
        { error: 'Invalid table name detected' },
        { status: 500 }
      );
    }
    
    // Check if summary table exists but has all zero steps (common issue)
    try {
      const stepsCheck = db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN steps > 0 THEN 1 ELSE 0 END) as with_steps FROM "${tableName}"`).get() as { total: number; with_steps: number };
      if (stepsCheck.total > 0 && stepsCheck.with_steps === 0) {
        // Table exists but all steps are zero - likely monitoring data wasn't imported
        return NextResponse.json(
          {
            error: 'Summary table found but all steps are zero',
            hint: `Found ${stepsCheck.total} rows in ${tableName}, but all steps values are zero. This usually means monitoring data (steps, activity minutes) wasn't imported.`,
            suggestion: 'Re-sync your Garmin data with monitoring included. Run: python scripts\\garmindb_cli.py --all --download --import --analyze --latest (in the garmin directory with venv activated). The --all flag ensures monitoring data is included.',
            table: tableName,
            rowCount: stepsCheck.total,
            hasStepsData: false,
            debug: 'Add ?debug=true to the URL to see all tables and checked databases'
          },
          { status: 200 } // Return 200 but with error info so frontend can display it
        );
      }
    } catch (checkError) {
      // If we can't check steps (column might not exist), continue normally
    }
    
    // Check if summary table exists but has all zero steps (common issue)
    try {
      const stepsCheck = db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN steps > 0 THEN 1 ELSE 0 END) as with_steps FROM "${tableName}"`).get() as { total: number; with_steps: number };
      if (stepsCheck.total > 0 && stepsCheck.with_steps === 0) {
        // Table exists but all steps are zero - likely monitoring data wasn't imported
        return NextResponse.json(
          {
            error: 'Summary table found but all steps are zero',
            hint: `Found ${stepsCheck.total} rows in ${tableName}, but all steps values are zero. This usually means monitoring data (steps, activity minutes) wasn't imported.`,
            suggestion: 'Re-sync your Garmin data with monitoring included. Run: python scripts\\garmindb_cli.py --all --download --import --analyze --latest (in the garmin directory with venv activated). The --all flag ensures monitoring data is included.',
            table: tableName,
            rowCount: stepsCheck.total,
            hasStepsData: false,
            debug: 'Add ?debug=true to the URL to see all tables and checked databases'
          },
          { status: 200 } // Return 200 but with error info so frontend can display it
        );
      }
    } catch (checkError) {
      // If we can't check steps (column might not exist), continue normally
    }
    
    // Get all columns from the table
    // Using double quotes to safely quote the table name (SQLite standard)
    const tableInfo = db.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: any;
      pk: number;
    }>;
    
    const columns = tableInfo.map(col => col.name);
    
    // Debug: Log if intensity_time column exists
    if (!columns.includes('intensity_time')) {
      console.warn(`WARNING: intensity_time column not found in ${tableName}. Available columns:`, columns.filter(c => c.includes('intensity')));
    }
    
    // Build WHERE clause for date filtering
    const whereConditions: string[] = [];
    if (startDate) {
      whereConditions.push('day >= ?');
      params.push(startDate);
    }
    if (endDate) {
      whereConditions.push('day <= ?');
      params.push(endDate);
    }
    
    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';
    
    // Build SELECT query - explicitly include intensity_time to ensure it's returned
    // Using double quotes to safely quote the table name (SQLite standard)
    // Note: We use * but also explicitly check for intensity_time column
    query = `
      SELECT * 
      FROM "${tableName}"
      ${whereClause}
      ORDER BY day DESC
      LIMIT ?
    `;
    params.push(limit);
    
    // Verify intensity_time column exists in the table
    if (!columns.includes('intensity_time')) {
      console.warn(`WARNING: intensity_time column missing from ${tableName} in ${dbPath}. Available intensity columns:`, columns.filter(c => c.toLowerCase().includes('intensity')));
    }
    
    if (!db) {
      throw new Error('Database connection not available');
    }
    
    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as any[];
    
    // Debug: Check if intensity_time is in the first row and log database info
    if (rows.length > 0) {
      const firstRow = rows[0];
      const hasIntensityTime = 'intensity_time' in firstRow;
      console.log(`[API Debug] Using database: ${dbPath}, table: ${tableName}`);
      console.log(`[API Debug] intensity_time in response: ${hasIntensityTime}`);
      console.log(`[API Debug] intensity_time value: ${firstRow.intensity_time}`);
      console.log(`[API Debug] Available intensity columns in response:`, Object.keys(firstRow).filter(k => k.toLowerCase().includes('intensity') || k.toLowerCase().includes('moderate') || k.toLowerCase().includes('vigorous')));
      if (!hasIntensityTime) {
        console.warn(`[API Debug] WARNING: intensity_time column missing from API response!`);
        console.warn(`[API Debug] Table schema columns:`, columns.filter(c => c.toLowerCase().includes('intensity')));
      }
    }
    
    // Close the database if we opened it (not the singleton)
    // Don't close if it's the singleton instance from getDatabase()
    
    // Format the data - convert dates and handle nulls
    // IMPORTANT: Preserve all columns including intensity_time even if null
    const formattedRows = rows.map(row => {
      const formatted: any = {};
      // Ensure we include all columns from the table schema, even if they're null in the row
      for (const col of columns) {
        const value = row[col];
        if (value === null || value === undefined) {
          formatted[col] = null;
        } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
          // It's a date string, keep as is
          formatted[col] = value;
        } else {
          formatted[col] = value;
        }
      }
      // Also include any extra columns that might be in the row but not in schema
      for (const [key, value] of Object.entries(row)) {
        if (!(key in formatted)) {
          formatted[key] = value;
        }
      }
      return formatted;
    });
    
    return NextResponse.json({
      data: formattedRows,
      meta: {
        table: tableName,
        columns: columns,
        count: formattedRows.length,
        startDate: startDate || null,
        endDate: endDate || null,
        databasePath: dbPath || 'unknown',
      },
    });
  } catch (error) {
    console.error('Error fetching daily data:', error);
    
    if (error instanceof Error) {
      // Check if it's a database error
      if (error.message.includes('no such table')) {
        return NextResponse.json(
          { error: 'Daily summary table not found. Please sync your Garmin data first.' },
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch daily data' },
      { status: 500 }
    );
  }
}

