import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

/**
 * GET /api/garmin/sync/status
 * Check the status of any running sync processes
 */
export async function GET(request: NextRequest) {
  try {
    const isWindows = os.platform() === 'win32';
    
    // Find Python processes that might be running garmindb_cli
    let command: string;
    if (isWindows) {
      // On Windows, check for python processes with garmindb_cli in command line
      command = 'Get-Process python* -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*garmin*" -or $_.CommandLine -like "*garmindb_cli*" } | Select-Object Id, ProcessName, StartTime, CPU, @{Name="Runtime";Expression={(Get-Date) - $_.StartTime}} | ConvertTo-Json';
    } else {
      // On Unix, use ps to find processes
      command = 'ps aux | grep "[g]armindb_cli" | awk \'{print $2, $9, $10}\'';
    }

    try {
      const { stdout } = await execAsync(command, { 
        shell: isWindows ? 'powershell.exe' : '/bin/bash',
        timeout: 5000 
      });
      
      const processes = isWindows 
        ? JSON.parse(stdout || '[]')
        : stdout.split('\n').filter(line => line.trim()).map(line => {
            const parts = line.trim().split(/\s+/);
            return { pid: parts[0], startTime: parts[1], cpu: parts[2] };
          });

      return NextResponse.json({
        running: processes.length > 0,
        processes: processes,
        message: processes.length > 0 
          ? `Found ${processes.length} running sync process(es)` 
          : 'No sync processes currently running'
      });
    } catch (error: any) {
      // If command fails, try a simpler check
      if (isWindows) {
        const { stdout } = await execAsync('Get-Process python* -ErrorAction SilentlyContinue | Measure-Object | Select-Object -ExpandProperty Count', {
          shell: 'powershell.exe'
        });
        const count = parseInt(stdout.trim()) || 0;
        return NextResponse.json({
          running: count > 0,
          processes: [],
          message: count > 0 
            ? `Found ${count} Python process(es) running (may include sync)` 
            : 'No Python processes running'
        });
      } else {
        return NextResponse.json({
          running: false,
          processes: [],
          message: 'Unable to check process status'
        });
      }
    }
  } catch (error: any) {
    return NextResponse.json(
      { 
        error: 'Failed to check sync status',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

