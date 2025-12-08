import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { resolve, join } from 'path';
import { existsSync } from 'fs';
import os from 'os';

const execAsync = promisify(exec);

/**
 * Find the Python executable to use
 */
function findPythonCommand(garminDir: string): string {
  const isWindows = os.platform() === 'win32';
  
  // Try venv Python first
  if (isWindows) {
    const venvPython = join(garminDir, 'venv', 'Scripts', 'python.exe');
    if (existsSync(venvPython)) {
      return venvPython;
    }
  } else {
    const venvPython = join(garminDir, 'venv', 'bin', 'python');
    if (existsSync(venvPython)) {
      return venvPython;
    }
  }
  
  // Fall back to system python
  return 'python';
}

/**
 * POST /api/build-tables
 * Builds the derived fact tables by running the build_derived_tables.py script
 */
export async function POST(request: NextRequest) {
  try {
    // Get the project root directory
    const appDir = process.cwd();
    const projectRoot = resolve(appDir, '..');
    const garminDir = resolve(projectRoot, 'garmin');
    const scriptPath = resolve(projectRoot, 'scripts', 'build_derived_tables.py');
    
    // Check if script exists
    if (!existsSync(scriptPath)) {
      return NextResponse.json(
        { error: `Script not found at ${scriptPath}` },
        { status: 404 }
      );
    }
    
    // Find Python command (prefer venv if available)
    const pythonCmd = findPythonCommand(garminDir);
    const isWindows = os.platform() === 'win32';
    
    // Run the Python script
    const command = isWindows
      ? `"${pythonCmd}" "${scriptPath}"`
      : `${pythonCmd} "${scriptPath}"`;
    
    console.log(`Executing: ${command}`);
    console.log(`Working directory: ${projectRoot}`);
    
    const execOptions: any = {
      cwd: projectRoot,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      timeout: 300000, // 5 minutes
    };
    
    // Use shell on Windows for proper path handling
    if (isWindows) {
      execOptions.shell = true;
    }
    
    const { stdout, stderr } = await execAsync(command, execOptions);
    
    // Check for errors in stderr (Python scripts often output warnings to stderr)
    if (stderr && !stderr.includes('INFO') && !stderr.includes('WARNING')) {
      // If stderr contains actual errors (not just info/warnings), return error
      if (stderr.toLowerCase().includes('error') || stderr.toLowerCase().includes('traceback')) {
        return NextResponse.json(
          { 
            error: 'Failed to build tables',
            details: stderr,
            stdout: stdout
          },
          { status: 500 }
        );
      }
    }
    
    return NextResponse.json({
      success: true,
      message: 'Derived tables built successfully',
      output: stdout,
      warnings: stderr || null,
    });
  } catch (error) {
    console.error('Error building tables:', error);
    
    if (error instanceof Error) {
      // Check if Python is not found
      if (error.message.includes('python') && error.message.includes('not found')) {
        return NextResponse.json(
          { 
            error: 'Python not found. Please ensure Python is installed and available in your PATH.',
            details: error.message
          },
          { status: 500 }
        );
      }
      
      return NextResponse.json(
        { 
          error: 'Failed to build tables',
          details: error.message
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/build-tables
 * Checks if the derived tables exist
 */
export async function GET(request: NextRequest) {
  try {
    const { getDatabase } = require('../../lib/db');
    const db = getDatabase();
    
    // Check if fact tables exist
    const tables = [
      'fact_exercise_weekly',
      'fact_muscle_group_weekly',
      'fact_workout_type_weekly',
      'fact_exercise_monthly',
      'fact_muscle_group_monthly',
      'fact_workout_type_monthly',
    ];
    
    const tableStatus: Record<string, boolean> = {};
    let allExist = true;
    
    for (const table of tables) {
      try {
        const result = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
        tableStatus[table] = !!result;
        if (!result) {
          allExist = false;
        }
      } catch {
        tableStatus[table] = false;
        allExist = false;
      }
    }
    
    return NextResponse.json({
      tablesExist: allExist,
      tableStatus,
      needsBuild: !allExist,
    });
  } catch (error) {
    console.error('Error checking tables:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { 
          error: 'Failed to check tables',
          details: error.message,
          tablesExist: false,
          needsBuild: true,
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        tablesExist: false,
        needsBuild: true,
      },
      { status: 500 }
    );
  }
}

