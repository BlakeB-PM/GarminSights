import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

/**
 * POST /api/garmin/sync/cancel
 * Cancel any running sync processes
 */
export async function POST(request: NextRequest) {
  try {
    const isWindows = os.platform() === 'win32';
    let killedCount = 0;
    const errors: string[] = [];

    if (isWindows) {
      // On Windows, find and kill Python processes that might be running garmindb_cli
      try {
        // First, try to find processes by checking command line
        const findCommand = 'Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like "*garmindb_cli*" -or ($_.Name -eq "python.exe" -and $_.CommandLine -like "*garmin*") } | Select-Object -ExpandProperty ProcessId';
        const { stdout: pids } = await execAsync(findCommand, {
          shell: 'powershell.exe',
          timeout: 5000
        });

        const pidList = pids.trim().split('\n').filter(pid => pid.trim());
        
        if (pidList.length === 0) {
          // Fallback: kill all python processes (more aggressive)
          const { stdout: allPids } = await execAsync('Get-Process python* -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id', {
            shell: 'powershell.exe',
            timeout: 5000
          });
          const allPidList = allPids.trim().split('\n').filter(pid => pid.trim());
          
          for (const pid of allPidList) {
            try {
              await execAsync(`Stop-Process -Id ${pid} -Force -ErrorAction Stop`, {
                shell: 'powershell.exe',
                timeout: 5000
              });
              killedCount++;
            } catch (err: any) {
              errors.push(`Failed to kill process ${pid}: ${err.message}`);
            }
          }
        } else {
          // Kill specific processes
          for (const pid of pidList) {
            try {
              await execAsync(`Stop-Process -Id ${pid.trim()} -Force -ErrorAction Stop`, {
                shell: 'powershell.exe',
                timeout: 5000
              });
              killedCount++;
            } catch (err: any) {
              errors.push(`Failed to kill process ${pid}: ${err.message}`);
            }
          }
        }
      } catch (error: any) {
        return NextResponse.json(
          { 
            error: 'Failed to cancel sync processes',
            details: error.message,
            killed: killedCount
          },
          { status: 500 }
        );
      }
    } else {
      // On Unix, use pkill or kill
      try {
        const { stdout } = await execAsync('pkill -f garmindb_cli || true', {
          timeout: 5000
        });
        killedCount = 1; // pkill doesn't return count, assume success
      } catch (error: any) {
        // Try alternative method
        try {
          const { stdout: pids } = await execAsync('pgrep -f garmindb_cli', {
            timeout: 5000
          });
          const pidList = pids.trim().split('\n').filter(pid => pid.trim());
          for (const pid of pidList) {
            try {
              await execAsync(`kill -9 ${pid}`, { timeout: 5000 });
              killedCount++;
            } catch (err: any) {
              errors.push(`Failed to kill process ${pid}: ${err.message}`);
            }
          }
        } catch (err: any) {
          return NextResponse.json(
            { 
              error: 'Failed to find or kill sync processes',
              details: err.message,
              killed: killedCount
            },
            { status: 500 }
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: killedCount > 0 
        ? `Cancelled ${killedCount} sync process(es)` 
        : 'No sync processes found to cancel',
      killed: killedCount,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error: any) {
    return NextResponse.json(
      { 
        error: 'Failed to cancel sync',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

