import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { resolve, join } from 'path';
import { existsSync, readFileSync, statSync, createReadStream } from 'fs';
import os from 'os';

/**
 * Find the Python executable to use
 */
function findPythonCommand(garminDir: string): string {
  const isWindows = os.platform() === 'win32';
  
  // Try venv Python first
  if (isWindows) {
    const venvPython = resolve(garminDir, 'venv', 'Scripts', 'python.exe');
    if (existsSync(venvPython)) {
      return venvPython;
    }
  } else {
    const venvPython = resolve(garminDir, 'venv', 'bin', 'python');
    if (existsSync(venvPython)) {
      return venvPython;
    }
  }
  
  // Fall back to system python
  return 'python';
}

/**
 * Parse log line to extract meaningful status
 */
function parseLogLine(line: string, currentDataType?: string, currentPhase?: string): { stage: string; message: string; dataType?: string; phase?: string } | null {
  const trimmedLine = line.trim();
  if (!trimmedLine) return null;
  
  // Suppress individual "Downloading daily data for X" messages - they're too noisy
  if (trimmedLine.includes('Downloading daily data for') || trimmedLine.match(/Downloading.*for \d{4}-\d{2}-\d{2}/)) {
    return null;
  }
  
  // Parse tqdm-style progress bars (e.g., "▲ 31%###1 | 64/204 [01:08<02:29, 1.07s/days]")
  // Format: symbol %bar| current/total [elapsed<remaining, rate]
  // Also handles variations like "▲ 32%|###1 | 65/204 [01:09<02:28, 1.07s/days]"
  // Pattern: optional symbol, percentage, bar section (any chars), pipe, current/total, time bracket
  // Match: symbol (optional), percentage, anything until "| digits/digits ["
  const tqdmMatch = trimmedLine.match(/(?:[▲▶▸●]|[\d\s]+)?\s*(\d+)%.*?\|\s*(\d+)\/(\d+)\s*\[([^\]]+)\]/);
  if (tqdmMatch) {
    const percent = parseInt(tqdmMatch[1]);
    const current = parseInt(tqdmMatch[2]);
    const total = parseInt(tqdmMatch[3]);
    const timeInfo = tqdmMatch[4];
    
    // Parse time info: "00:04<03:35, 1.08s/days" or "00:04<03:35 1.08s/davsl" (with or without comma)
    let elapsed = '';
    let remaining = '';
    let rate = '';
    
    // Extract elapsed and remaining time (format: "00:04<03:35")
    const timeMatch = timeInfo.match(/([^<]+)<([^,\s]+)/);
    if (timeMatch) {
      elapsed = timeMatch[1].trim();
      remaining = timeMatch[2].trim();
    }
    
    // Extract rate (format: "1.08s/days" or "1.08s/davsl" - handle typos)
    const rateMatch = timeInfo.match(/([\d.]+s\/[^\s,\]]+)/);
    if (rateMatch) {
      rate = rateMatch[1];
    }
    
    // Use provided context or detect from line
    let phase = currentPhase || '';
    let dataType = currentDataType || '';
    const lowerLine = line.toLowerCase();
    
    // Detect phase if not provided
    if (!phase) {
      if (lowerLine.includes('import') || lowerLine.includes('importing')) {
        phase = 'Importing';
      } else if (lowerLine.includes('analyze') || lowerLine.includes('analyzing')) {
        phase = 'Analyzing';
      } else if (lowerLine.includes('download') || lowerLine.includes('downloading') || lowerLine.includes('getting')) {
        phase = 'Downloading';
      } else {
        phase = 'Processing';
      }
    }
    
    // Detect data type if not provided
    if (!dataType) {
      if (lowerLine.includes('activity') || lowerLine.includes('activities')) {
        dataType = 'activities';
      } else if (lowerLine.includes('monitoring') || lowerLine.includes('monitor')) {
        dataType = 'monitoring data';
      } else if (lowerLine.includes('sleep')) {
        dataType = 'sleep data';
      } else if (lowerLine.includes('hydration')) {
        dataType = 'hydration data';
      } else if (lowerLine.includes('weight')) {
        dataType = 'weight data';
      } else if (lowerLine.includes('rhr') || lowerLine.includes('resting heart rate')) {
        dataType = 'resting heart rate data';
      } else if (lowerLine.includes('day') || lowerLine.includes('daily') || lowerLine.includes('days') || lowerLine.includes('summary')) {
        dataType = 'daily summary data';
      } else if (lowerLine.includes('file') || lowerLine.includes('files')) {
        dataType = 'files';
      } else {
        dataType = 'data';
      }
    }
    
    // Build a clear, user-friendly message with phase and data type
    let message = `${phase} ${dataType}: ${current} of ${total} days (${percent}% complete)`;
    
    // Add time information in a readable format
    if (elapsed || remaining) {
      message += ` - `;
      if (elapsed) {
        message += `Elapsed: ${elapsed}`;
      }
      if (remaining) {
        if (elapsed) message += ', ';
        message += `Est. remaining: ${remaining}`;
      }
    }
    
    if (rate) {
      // Clean up rate (e.g., "1.08s/days" or "1.08s/davsl" -> "1.08 seconds per day")
      const cleanRate = rate
        .replace(/s\//, ' seconds per ')
        .replace(/\/days?/, ' per day')
        .replace(/\/davsl/, ' per day') // Handle typo
        .replace(/\/day/, ' per day');
      message += ` (Rate: ${cleanRate})`;
    }
    
    return { 
      stage: 'processing', 
      message,
      dataType,
      phase
    };
  }
  
  // Parse simpler progress indicators (like "50%" or "100/204")
  const percentMatch = trimmedLine.match(/(\d+)%/);
  const progressMatch = trimmedLine.match(/(\d+)\/(\d+)/);
  
  // Determine context from surrounding text
  let context = 'items';
  const lowerLine = line.toLowerCase();
  if (lowerLine.includes('activity') || lowerLine.includes('activities')) {
    context = 'activities';
  } else if (lowerLine.includes('monitoring') || lowerLine.includes('monitor')) {
    context = 'monitoring data';
  } else if (lowerLine.includes('day') || lowerLine.includes('daily') || lowerLine.includes('days')) {
    context = 'days';
  } else if (lowerLine.includes('file') || lowerLine.includes('files')) {
    context = 'files';
  } else if (lowerLine.includes('import')) {
    context = 'importing';
  } else if (lowerLine.includes('download')) {
    context = 'downloading';
  }
  
  // Check for standalone progress indicators on their own line
  if (trimmedLine.match(/^\d+%$/)) {
    const percent = parseInt(trimmedLine.replace('%', ''));
    return { 
      stage: 'processing', 
      message: `Progress: ${percent}% complete` 
    };
  }
  
  if (trimmedLine.match(/^\d+\/\d+$/)) {
    const parts = trimmedLine.split('/');
    const current = parseInt(parts[0]);
    const total = parseInt(parts[1]);
    const percent = Math.round((current / total) * 100);
    return { 
      stage: 'processing', 
      message: `Processing: ${current} of ${total} (${percent}%)` 
    };
  }
  
  if (percentMatch) {
    const percent = parseInt(percentMatch[1]);
    return { 
      stage: 'processing', 
      message: `Progress: ${percent}% complete (${context})` 
    };
  }
  
  if (progressMatch) {
    const current = parseInt(progressMatch[1]);
    const total = parseInt(progressMatch[2]);
    const percent = Math.round((current / total) * 100);
    return { 
      stage: 'processing', 
      message: `Processing ${context}: ${current} of ${total} (${percent}%)` 
    };
  }
  
  // Extract stage from log messages
  if (line.includes('Downloading') || line.includes('Getting activities') || line.includes('get_activities')) {
    const activityMatch = line.match(/get_activities:\s*(.+?)\s*\(/);
    if (activityMatch) {
      return { stage: 'downloading', message: `Downloading activity: ${activityMatch[1]}` };
    }
    return { stage: 'downloading', message: 'Downloading data from Garmin Connect...' };
  }
  
  if (line.includes('Importing') || line.includes('Import') || line.includes('Processing')) {
    return { stage: 'importing', message: 'Importing data into database...' };
  }
  
  if (line.includes('Analyzing') || line.includes('Analyze') || line.includes('calculate')) {
    return { stage: 'analyzing', message: 'Analyzing data and creating summaries...' };
  }
  
  if (line.includes('get_summary_day')) {
    const dateMatch = line.match(/get_summary_day:\s*(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      // Don't show individual date messages - they're too noisy
      // The tqdm progress bar will show overall progress
      return null;
    }
  }
  
  if (line.includes('get_monitoring_day') || line.includes('Getting monitoring')) {
    return { stage: 'downloading', message: 'Starting download of monitoring data...', dataType: 'monitoring data', phase: 'Downloading' };
  }
  
  if (line.includes('Getting hydration') || line.includes('get_hydration')) {
    // Suppress individual date messages - progress bar will show overall progress
    return { stage: 'downloading', message: 'Starting download of hydration data...', dataType: 'hydration data', phase: 'Downloading' };
  }
  
  if (line.includes('Getting sleep') || line.includes('get_sleep')) {
    return { stage: 'downloading', message: 'Downloading sleep data...' };
  }
  
  if (line.includes('Getting weight') || line.includes('get_weight')) {
    return { stage: 'downloading', message: 'Downloading weight data...' };
  }
  
  if (line.includes('Getting rhr') || line.includes('get_rhr') || line.includes('resting heart rate')) {
    return { stage: 'downloading', message: 'Downloading resting heart rate data...' };
  }
  
  // Filter "data not found" informational messages - they're not errors, just info
  if (line.includes('data not found') || line.includes('Recent') && line.includes('not found')) {
    // These are informational - only show once per data type
    // Extract the data type for context
    const dataTypeMatch = line.match(/Recent\s+(\w+)\s+data not found/);
    if (dataTypeMatch) {
      const dataType = dataTypeMatch[1];
      // Show as info message, not warning
      return {
        stage: 'processing',
        message: `No recent ${dataType} data found, using configured start date`,
        dataType: `${dataType} data`,
        phase: currentPhase || 'Downloading'
      };
    }
    // Suppress generic "not found" messages
    return null;
  }
  
  // More inclusive patterns for common log messages
  if (line.includes('Enabled statistics')) {
    return { stage: 'starting', message: 'Preparing to sync data...' };
  }
  
  if (line.includes('Copying') || line.includes('copy')) {
    return { stage: 'downloading', message: 'Copying data from device...' };
  }
  
  if (line.includes('activities') && (line.includes('INFO') || line.match(/\d+/))) {
    const activityMatch = line.match(/(\d+)\s+activities?/i);
    if (activityMatch) {
      return { stage: 'downloading', message: `Found ${activityMatch[1]} activities to process` };
    }
  }
  
  if (line.includes('Error') || line.includes('Exception') || line.includes('Traceback')) {
    return { stage: 'error', message: line };
  }
  
  // Show INFO level messages that aren't just noise
  if (line.includes('INFO') && !line.includes('DEBUG') && trimmedLine.length > 20) {
    // Extract meaningful part of INFO messages
    const infoMatch = line.match(/INFO[:\s]+(.+)/i);
    if (infoMatch) {
      const infoMsg = infoMatch[1].trim();
      // Skip very verbose or unhelpful messages
      if (!infoMsg.includes('__') && !infoMsg.match(/^[a-z_]+$/i)) {
        return { stage: 'processing', message: infoMsg };
      }
    }
  }
  
  // Detect SQLAlchemy enum errors and provide user-friendly message
  if (line.includes('UnknownEnumValue') || (line.includes('is not among the defined enum values') && line.includes('activity_type'))) {
    const enumMatch = line.match(/UnknownEnumValue_(\d+)/);
    const enumValue = enumMatch ? enumMatch[1] : 'unknown';
    return {
      stage: 'processing',
      message: `Note: Some activity types couldn't be imported (unknown type ${enumValue}). This is usually harmless and sync will continue.`,
      phase: currentPhase || 'Importing',
      dataType: currentDataType || 'data'
    };
  }
  
  // Detect and summarize SQLAlchemy/stack trace errors
  if (line.includes('File "') && line.includes('line ') && (line.includes('Error') || line.includes('Exception'))) {
    // This is a stack trace line - extract the error message if it's the first line
    const errorMatch = line.match(/(\w+Error|Exception):\s*(.+)/);
    if (errorMatch) {
      const errorType = errorMatch[1];
      const errorMsg = errorMatch[2].substring(0, 200); // Limit length
      return {
        stage: 'error',
        message: `${errorType}: ${errorMsg}${errorMsg.length >= 200 ? '...' : ''}`
      };
    }
    // Skip stack trace lines (they're too verbose)
    return null;
  }
  
  // Detect common error patterns and provide summaries
  if (line.includes('Traceback') || line.includes('File "') || line.includes('raise ') || line.includes('^')) {
    // Skip stack trace formatting lines
    return null;
  }
  
  // Show any non-empty line that looks meaningful (not just whitespace or single characters)
  if (trimmedLine.length > 10 && !line.match(/^[\s\-=]+$/) && !line.includes('DEBUG')) {
    // Clean up common log prefixes
    const cleaned = trimmedLine
      .replace(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[,\d]+\s+/, '') // Remove timestamp
      .replace(/^[A-Z]+\s+[^\s]+\s+/, '') // Remove log level and logger name
      .trim();
    
    if (cleaned.length > 5) {
      return { stage: 'processing', message: cleaned };
    }
  }
  
  return null;
}

/**
 * GET /api/garmin/sync/stream
 * Streams sync progress using Server-Sent Events
 */
export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      // Track current context for better progress messages
      let currentDataType = '';
      let currentPhase = '';
      let lastProgressMessage = '';
      let lastProgressTime = 0;
      const seenErrors = new Set<string>(); // Track duplicate errors
      const seenInfoMessages = new Set<string>(); // Track duplicate info messages
      
      const send = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      
      // Helper to send error with deduplication
      const sendError = (message: string, details?: string) => {
        // Create a key for deduplication (first 100 chars)
        const errorKey = message.substring(0, 100);
        if (!seenErrors.has(errorKey)) {
          seenErrors.add(errorKey);
          send({
            type: 'error',
            message: message,
            details: details
          });
        }
      };

      try {
        // Find the garmindb_cli.py script
        const appDir = process.cwd();
        const projectRoot = resolve(appDir, '..');
        const garminDir = resolve(projectRoot, 'garmin');
        const scriptPath = resolve(garminDir, 'scripts', 'garmindb_cli.py');
        const logPath = resolve(garminDir, 'garmindb.log');
        
        // Verify script exists
        if (!existsSync(scriptPath)) {
          send({ 
            type: 'error', 
            message: `GarminDB CLI script not found at ${scriptPath}`,
            details: 'Please ensure the garmin directory is properly set up.'
          });
          controller.close();
          return;
        }
        
        // Check if script exists
        if (!existsSync(scriptPath)) {
          send({ type: 'error', message: `GarminDB CLI script not found at ${scriptPath}` });
          controller.close();
          return;
        }

        // Check if config file exists and has valid credentials
        const homedir = os.homedir();
        const configDir = join(homedir, '.GarminDb');
        const configFile = join(configDir, 'GarminConnectConfig.json');
        
        if (!existsSync(configFile)) {
          send({ 
            type: 'error', 
            message: 'Garmin Connect credentials not configured. Please save your credentials first before syncing.',
            details: `Config file not found at: ${configFile}`
          });
          controller.close();
          return;
        }

        // Verify config file has credentials
        try {
          const configContent = readFileSync(configFile, 'utf-8');
          const config = JSON.parse(configContent);
          
          if (!config.credentials || !config.credentials.user || !config.credentials.password) {
            send({ 
              type: 'error', 
              message: 'Garmin Connect credentials are incomplete. Please save your credentials first.',
              details: 'The config file exists but is missing username or password.'
            });
            controller.close();
            return;
          }
        } catch (parseError) {
          send({ 
            type: 'error', 
            message: 'Config file is corrupted or invalid. Please save your credentials again.',
            details: `Failed to parse config file: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`
          });
          controller.close();
          return;
        }

        // Find Python command
        const pythonCmd = findPythonCommand(garminDir);

        // Run the GarminDB CLI command
        const isWindows = os.platform() === 'win32';
        
        send({ type: 'start', message: 'Starting sync process...' });
        
        // Spawn the process
        // On Windows, we need to use shell mode for proper path handling
        // Use quoted paths to handle spaces
        const isAbsolutePath = resolve(pythonCmd) === pythonCmd || pythonCmd.startsWith('/') || /^[A-Za-z]:[\\/]/.test(pythonCmd);
        
        // For Windows, use shell mode with properly quoted paths
        // For Unix, use array format
        let child;
        if (isWindows) {
          // Windows: use shell mode with quoted paths
          const command = `"${pythonCmd}" "${scriptPath}" --all --download --import --analyze --latest`;
          child = spawn(command, {
            cwd: garminDir,
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {
              ...process.env,
              PYTHONPATH: garminDir,
            },
          });
        } else {
          // Unix: use array format
          child = spawn(
            pythonCmd,
            [scriptPath, '--all', '--download', '--import', '--analyze', '--latest'],
            {
              cwd: garminDir,
              shell: !isAbsolutePath,
              stdio: ['ignore', 'pipe', 'pipe'],
              env: {
                ...process.env,
                PYTHONPATH: garminDir,
              },
            }
          );
        }

        let lastLogPosition = 0;
        let logWatcher: NodeJS.Timeout | null = null;
        let heartbeatInterval: NodeJS.Timeout | null = null;
        let lastActivityTime = Date.now();
        const stderrBuffer: string[] = [];
        const stdoutBuffer: string[] = [];

        // Watch log file for updates
        if (existsSync(logPath)) {
          try {
            const stats = statSync(logPath);
            lastLogPosition = stats.size;
          } catch (err) {
            // File might not be readable yet
          }
          
          logWatcher = setInterval(() => {
            try {
              if (!existsSync(logPath)) return;
              
              const currentStats = statSync(logPath);
              if (currentStats.size > lastLogPosition) {
                lastActivityTime = Date.now();
                const logStream = createReadStream(logPath, {
                  start: lastLogPosition,
                  end: currentStats.size,
                });
                
                let buffer = '';
                logStream.on('data', (chunk: string | Buffer) => {
                  buffer += chunk.toString();
                });
                
                logStream.on('end', () => {
                  const lines = buffer.split('\n').filter((line: string) => line.trim());
                  for (const line of lines) {
                    const parsed = parseLogLine(line, currentDataType, currentPhase);
                    if (parsed) {
                      // Update context if provided
                      if (parsed.dataType) currentDataType = parsed.dataType;
                      if (parsed.phase) currentPhase = parsed.phase;
                      
                      // Filter duplicate info messages (like "data not found")
                      if (parsed.message.includes('not found') || parsed.message.includes('No recent')) {
                        const infoKey = parsed.message.substring(0, 50);
                        if (seenInfoMessages.has(infoKey)) {
                          continue; // Skip duplicate info messages
                        }
                        seenInfoMessages.add(infoKey);
                      }
                      
                      // Only send if it's different from last message or enough time has passed
                      const now = Date.now();
                      if (parsed.message !== lastProgressMessage || now - lastProgressTime > 2000) {
                        send({ 
                          type: 'progress', 
                          stage: parsed.stage,
                          message: parsed.message 
                        });
                        lastProgressMessage = parsed.message;
                        lastProgressTime = now;
                      }
                    }
                  }
                  lastLogPosition = currentStats.size;
                });
                
                logStream.on('error', () => {
                  // Ignore read errors
                });
              }
            } catch (err) {
              // Log file might be locked or deleted, ignore
            }
          }, 500); // Check every 500ms
        }

        // Heartbeat mechanism - send a keepalive message every 10 seconds if no activity
        heartbeatInterval = setInterval(() => {
          const timeSinceLastActivity = Date.now() - lastActivityTime;
          // If no activity for 10 seconds, send a heartbeat
          if (timeSinceLastActivity > 10000) {
            send({ 
              type: 'progress', 
              stage: 'processing',
              message: 'Sync in progress... (this may take several minutes)' 
            });
          }
        }, 10000); // Check every 10 seconds

        // Handle stdout
        child.stdout?.on('data', (data: Buffer) => {
          lastActivityTime = Date.now();
          const output = data.toString();
          const lines = output.split('\n').filter((line: string) => line.trim());
          
          for (const line of lines) {
            stdoutBuffer.push(line);
            const parsed = parseLogLine(line, currentDataType, currentPhase);
            if (parsed) {
              // Update context if provided
              if (parsed.dataType) currentDataType = parsed.dataType;
              if (parsed.phase) currentPhase = parsed.phase;
              
              // Only send if it's different from last message or enough time has passed
              const now = Date.now();
              if (parsed.message !== lastProgressMessage || now - lastProgressTime > 2000) {
                send({ 
                  type: 'progress', 
                  stage: parsed.stage,
                  message: parsed.message 
                });
                lastProgressMessage = parsed.message;
                lastProgressTime = now;
              }
            } else if (line.length > 0 && !line.includes('DEBUG') && !line.match(/^[\s\-=]+$/) && !line.includes('Downloading daily data for')) {
              // Send other meaningful output (more inclusive), but skip individual date messages
              const cleaned = line.trim();
              if (cleaned.length > 5) {
                send({ 
                  type: 'progress', 
                  stage: 'processing',
                  message: cleaned 
                });
              }
            }
          }
        });

        // Handle stderr
        child.stderr?.on('data', (data: Buffer) => {
          lastActivityTime = Date.now();
          const output = data.toString();
          const lines = output.split('\n').filter((line: string) => line.trim());
          
          for (const line of lines) {
            stderrBuffer.push(line);
            
            // Try to parse as progress first (tqdm often goes to stderr)
            const parsed = parseLogLine(line, currentDataType, currentPhase);
            if (parsed) {
              // Update context if provided
              if (parsed.dataType) currentDataType = parsed.dataType;
              if (parsed.phase) currentPhase = parsed.phase;
              
              // Filter duplicate info messages (like "data not found")
              if (parsed.message.includes('not found') || parsed.message.includes('No recent')) {
                const infoKey = parsed.message.substring(0, 50);
                if (seenInfoMessages.has(infoKey)) {
                  continue; // Skip duplicate info messages
                }
                seenInfoMessages.add(infoKey);
              }
              
              // Only send if it's different from last message or enough time has passed
              const now = Date.now();
              if (parsed.message !== lastProgressMessage || now - lastProgressTime > 2000) {
                send({ 
                  type: 'progress', 
                  stage: parsed.stage,
                  message: parsed.message 
                });
                lastProgressMessage = parsed.message;
                lastProgressTime = now;
              }
            } else if (line.includes('Error') || line.includes('Exception') || line.includes('Traceback')) {
              // Parse error to extract meaningful message
              const parsed = parseLogLine(line, currentDataType, currentPhase);
              if (parsed) {
                // Update context if provided
                if (parsed.dataType) currentDataType = parsed.dataType;
                if (parsed.phase) currentPhase = parsed.phase;
                
                if (parsed.stage === 'error') {
                  sendError(parsed.message);
                } else if (parsed.stage === 'processing' && parsed.message.includes("couldn't be imported")) {
                  // Enum error - show as warning, not error
                  send({
                    type: 'warning',
                    message: parsed.message
                  });
                } else {
                  send({
                    type: 'progress',
                    stage: parsed.stage,
                    message: parsed.message
                  });
                }
              } else {
                // Extract error message from line
                const errorMatch = line.match(/(\w+Error|Exception|Error):\s*(.+?)(?:\n|$)/);
                if (errorMatch) {
                  const errorMsg = errorMatch[2].substring(0, 200);
                  sendError(`${errorMatch[1]}: ${errorMsg}`);
                } else {
                  // Truncate long error lines
                  const errorMsg = line.length > 200 ? line.substring(0, 200) + '...' : line;
                  sendError(errorMsg);
                }
              }
            } else if (line.includes('WARNING') || line.includes('Warning')) {
              send({ 
                type: 'warning', 
                message: line 
              });
            } else if (line.length > 0 && !line.match(/^[\s\-=]+$/) && !line.includes('Downloading daily data for')) {
              // Show other stderr output as warnings/info, but skip individual date messages
              const cleaned = line.trim();
              if (cleaned.length > 5 && !cleaned.match(/Downloading.*for \d{4}-\d{2}-\d{2}/)) {
                send({ 
                  type: 'warning', 
                  message: cleaned 
                });
              }
            }
          }
        });

        // Handle process completion
        child.on('close', async (code) => {
          if (logWatcher) {
            clearInterval(logWatcher);
          }
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
          }
          
          if (code === 0) {
            send({ 
              type: 'success', 
              message: 'Sync completed successfully!' 
            });
          } else {
            // Try to get the actual error from the log file
            let errorSummary = '';
            try {
              if (existsSync(logPath)) {
                const logContent = readFileSync(logPath, 'utf-8');
                const logLines = logContent.split('\n');
                // Get the last 50 lines that might contain errors
                const recentLines = logLines.slice(-50);
                const errorLines = recentLines.filter((line: string) => 
                  (line.includes('ERROR') || 
                  line.includes('Error') || 
                  line.includes('Exception')) &&
                  !line.includes('File "') && // Skip stack trace lines
                  !line.includes('^') // Skip traceback markers
                );
                
                if (errorLines.length > 0) {
                  // Extract just the error messages (first 3 unique ones)
                  const uniqueErrors = Array.from(new Set(errorLines.map((l: string) => {
                    const match = l.match(/(\w+Error|Exception):\s*(.+?)(?:\n|$)/);
                    return match ? `${match[1]}: ${match[2].substring(0, 150)}` : l.substring(0, 150);
                  })));
                  errorSummary = uniqueErrors.slice(-3).join('; ');
                } else if (stderrBuffer.length > 0) {
                  // Use stderr buffer if available, but filter out stack traces
                  const errorStderr = stderrBuffer.filter((line: string) => 
                    (line.includes('Error') || line.includes('Exception')) &&
                    !line.includes('File "') &&
                    !line.includes('Traceback')
                  );
                  if (errorStderr.length > 0) {
                    const uniqueErrors = Array.from(new Set(errorStderr.map((l: string) => {
                      const match = l.match(/(\w+Error|Exception):\s*(.+?)(?:\n|$)/);
                      return match ? `${match[1]}: ${match[2].substring(0, 150)}` : l.substring(0, 150);
                    })));
                    errorSummary = uniqueErrors.slice(-3).join('; ');
                  }
                }
              }
            } catch (err) {
              // If we can't read the log, use stderr buffer
              if (stderrBuffer.length > 0) {
                const errorStderr = stderrBuffer.filter((line: string) => 
                  (line.includes('Error') || line.includes('Exception')) &&
                  !line.includes('File "') &&
                  !line.includes('Traceback')
                );
                if (errorStderr.length > 0) {
                  errorSummary = errorStderr.slice(-1)[0].substring(0, 200);
                }
              }
            }
            
            const errorMessage = errorSummary 
              ? `Sync process exited with code ${code}. ${errorSummary}`
              : `Sync process exited with code ${code}. Check the log file at ${logPath} for details.`;
            
            sendError(errorMessage, errorSummary || `Process exited with code ${code}. Please check the log file for more details.`);
          }
          
          setTimeout(() => {
            controller.close();
          }, 1000);
        });

        // Handle process errors
        child.on('error', (error) => {
          if (logWatcher) {
            clearInterval(logWatcher);
          }
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
          }
          
          send({ 
            type: 'error', 
            message: `Failed to start sync process: ${error.message}` 
          });
          
          setTimeout(() => {
            controller.close();
          }, 1000);
        });

        // Cleanup on abort
        request.signal.addEventListener('abort', () => {
          if (logWatcher) {
            clearInterval(logWatcher);
          }
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
          }
          child.kill();
          controller.close();
        });

      } catch (error: any) {
        send({ 
          type: 'error', 
          message: `Unexpected error: ${error.message}` 
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

