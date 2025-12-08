import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import os from 'os';

/**
 * GET /api/garmin/credentials
 * Checks if credentials are already saved (returns username only, not password)
 */
export async function GET(request: NextRequest) {
  try {
    const homedir = os.homedir();
    const configDir = join(homedir, '.GarminDb');
    const configFile = join(configDir, 'GarminConnectConfig.json');

    if (!existsSync(configFile)) {
      return NextResponse.json({ 
        hasCredentials: false,
        username: null,
      });
    }

    const content = await readFile(configFile, 'utf-8');
    const config = JSON.parse(content);
    
    const username = config.credentials?.user || null;
    const hasCredentials = !!username && !!config.credentials?.password;

    return NextResponse.json({
      hasCredentials,
      username: hasCredentials ? username : null,
    });
  } catch (error) {
    console.error('Error checking credentials:', error);
    return NextResponse.json({
      hasCredentials: false,
      username: null,
    });
  }
}

/**
 * POST /api/garmin/credentials
 * Saves Garmin Connect credentials to the config file
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    // If password is not provided, check if we have existing credentials
    if (!password) {
      const homedir = os.homedir();
      const configDir = join(homedir, '.GarminDb');
      const configFile = join(configDir, 'GarminConnectConfig.json');
      
      if (existsSync(configFile)) {
        const existingContent = await readFile(configFile, 'utf-8');
        const existingConfig = JSON.parse(existingContent);
        
        // If we have existing password, keep it
        if (existingConfig.credentials?.password) {
          // Just update username, keep existing password
          existingConfig.credentials.user = username;
          await writeFile(configFile, JSON.stringify(existingConfig, null, 4), 'utf-8');
          return NextResponse.json({ 
            success: true,
            message: 'Username updated successfully',
          });
        }
      }
      
      return NextResponse.json(
        { error: 'Password is required for new credentials' },
        { status: 400 }
      );
    }

    // Get the config directory (~/.GarminDb on Windows/Linux/Mac)
    const homedir = os.homedir();
    const configDir = join(homedir, '.GarminDb');
    const configFile = join(configDir, 'GarminConnectConfig.json');

    // Create config directory if it doesn't exist
    if (!existsSync(configDir)) {
      await mkdir(configDir, { recursive: true });
    }

    // Read existing config if it exists, or use default structure
    let config: any = {};
    if (existsSync(configFile)) {
      const existingContent = await readFile(configFile, 'utf-8');
      config = JSON.parse(existingContent);
    } else {
      // Use default structure from example
      config = {
        db: {
          type: 'sqlite',
        },
        garmin: {
          domain: 'garmin.com',
        },
        data: {
          weight_start_date: '12/31/2019',
          sleep_start_date: '12/31/2019',
          rhr_start_date: '12/31/2019',
          monitoring_start_date: '12/31/2019',
          download_latest_activities: 25,
          download_all_activities: 1000,
        },
        directories: {
          relative_to_home: true,
          base_dir: 'HealthData',
        },
        enabled_stats: {
          monitoring: true,
          steps: true,
          itime: true,
          sleep: true,
          rhr: true,
          weight: true,
          activities: true,
        },
        settings: {
          metric: false,
          default_display_activities: ['walking', 'running', 'cycling'],
        },
        checkup: {
          look_back_days: 90,
        },
      };
    }

    // Update credentials
    config.credentials = {
      user: username,
      secure_password: false,
      password: password,
      password_file: null,
    };

    // Write config file
    await writeFile(configFile, JSON.stringify(config, null, 4), 'utf-8');

    return NextResponse.json({ 
      success: true,
      message: 'Credentials saved successfully',
    });
  } catch (error) {
    console.error('Error saving credentials:', error);
    
    if (error instanceof Error) {
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
