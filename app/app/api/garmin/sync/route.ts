import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { resolve, join } from 'path';
import { existsSync, readFileSync } from 'fs';
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
 * POST /api/garmin/sync
 * Triggers GarminDB CLI to download and import data from Garmin Connect
 */
export async function POST(request: NextRequest) {
  try {
    // Find the garmindb_cli.py script
    // From app directory, go up to project root, then to garmin/scripts
    const appDir = process.cwd();
    const projectRoot = resolve(appDir, '..');
    const garminDir = resolve(projectRoot, 'garmin');
    const scriptPath = resolve(garminDir, 'scripts', 'garmindb_cli.py');
    
    // Check if script exists
    if (!existsSync(scriptPath)) {
      return NextResponse.json(
        { error: `GarminDB CLI script not found at ${scriptPath}` },
        { status: 404 }
      );
    }

    // Check if config file exists and has valid credentials
    const homedir = os.homedir();
    const configDir = join(homedir, '.GarminDb');
    const configFile = join(configDir, 'GarminConnectConfig.json');
    
    if (!existsSync(configFile)) {
      return NextResponse.json(
        { 
          error: 'Garmin Connect credentials not configured. Please save your credentials first before syncing.',
          details: `Config file not found at: ${configFile}\n\nPlease go to the Garmin Connection section and save your credentials.`
        },
        { status: 400 }
      );
    }

    // Verify config file has credentials
    try {
      const configContent = readFileSync(configFile, 'utf-8');
      const config = JSON.parse(configContent);
      
      if (!config.credentials || !config.credentials.user || !config.credentials.password) {
        return NextResponse.json(
          { 
            error: 'Garmin Connect credentials are incomplete. Please save your credentials first.',
            details: 'The config file exists but is missing username or password. Please update your credentials in the Garmin Connection section.'
          },
          { status: 400 }
        );
      }
    } catch (parseError) {
      return NextResponse.json(
        { 
          error: 'Config file is corrupted or invalid. Please save your credentials again.',
          details: `Failed to parse config file: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`
        },
        { status: 400 }
      );
    }

    // Find Python command
    const pythonCmd = findPythonCommand(garminDir);

    // Run the GarminDB CLI command
    // This will download, import, and analyze all available Garmin data
    const isWindows = os.platform() === 'win32';
    const command = isWindows
      ? `"${pythonCmd}" "${scriptPath}" --all --download --import --analyze --latest`
      : `${pythonCmd} "${scriptPath}" --all --download --import --analyze --latest`;
    
    console.log(`Executing: ${command}`);
    console.log(`Working directory: ${garminDir}`);
    
    // Execute with a timeout (15 minutes for full syncs)
    const execOptions: any = {
      cwd: garminDir,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      timeout: 900000, // 15 minutes
    };
    
    // Use shell on Windows for proper path handling
    if (isWindows) {
      execOptions.shell = true;
    }
    
    const { stdout, stderr } = await execAsync(command, execOptions);

    // Check for errors in stderr (but some warnings are normal)
    if (stderr && !stderr.includes('INFO') && !stderr.includes('WARNING')) {
      console.error('GarminDB stderr:', stderr);
    }

    return NextResponse.json({
      success: true,
      message: 'Sync completed successfully',
      output: stdout,
    });
  } catch (error: any) {
    console.error('Error syncing Garmin data:', error);
    
    // Extract actual error message from stderr/stdout if available
    let errorMessage = 'Failed to sync Garmin data';
    let errorDetails = '';
    
    if (error.stderr) {
      errorDetails = error.stderr;
      // Try to extract the actual Python error, not just the command failed message
      const lines = error.stderr.split('\n').filter((line: string) => line.trim());
      const errorLines = lines.filter((line: string) => 
        line.includes('Error') || 
        line.includes('Exception') || 
        line.includes('Traceback') ||
        line.includes('ModuleNotFoundError') ||
        line.includes('ImportError') ||
        line.includes('FileNotFoundError')
      );
      
      if (errorLines.length > 0) {
        errorMessage = errorLines.join('\n');
      } else if (lines.length > 0) {
        // Use the last few lines as they often contain the actual error
        errorMessage = lines.slice(-3).join('\n');
      } else {
        errorMessage = error.stderr;
      }
    } else if (error.stdout) {
      errorDetails = error.stdout;
      const lines = error.stdout.split('\n').filter((line: string) => line.trim());
      if (lines.length > 0) {
        errorMessage = lines.slice(-3).join('\n');
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    // Log full error details for debugging
    console.error('Full error details:', {
      message: error.message,
      code: error.code,
      signal: error.signal,
      stdout: error.stdout,
      stderr: error.stderr,
    });
    
    // Handle timeout
    if (error.code === 'ETIMEDOUT' || error.signal === 'SIGTERM') {
      return NextResponse.json(
        { 
          error: 'Sync operation timed out after 15 minutes.',
          details: 'The sync process is still running in the background. Please check the log file at Projects/GarminSights/garmin/garmindb.log for progress, or try using the streaming sync endpoint for real-time updates.',
          suggestion: 'For long-running syncs, use the streaming endpoint which provides real-time progress updates.'
        },
        { status: 504 }
      );
    }

    // Handle command execution errors
    if (error.code === 'ENOENT') {
      return NextResponse.json(
        { error: 'Python or GarminDB CLI not found. Please ensure Python and GarminDB are installed.' },
        { status: 500 }
      );
    }

    // Return the actual error message with details
    return NextResponse.json(
      { 
        error: errorMessage,
        details: errorDetails || undefined,
      },
      { status: 500 }
    );
  }
}

