@echo off
echo Starting GarminSights Explorer...
echo.

REM Change to the app directory
cd /d "%~dp0"

REM Check if node_modules exists, if not install dependencies
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    echo.
)

REM Start the Next.js development server and open browser
echo Starting development server...
echo Browser will open automatically to http://localhost:3000/explore
echo.
echo Press Ctrl+C to stop the server
echo.

REM Wait a few seconds for server to start, then open browser
start "GarminSights Dev Server" cmd /k "npm run dev"
timeout /t 3 /nobreak >nul
start http://localhost:3000/explore

REM Keep the window open
pause

