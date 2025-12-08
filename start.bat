@echo off
title GarminSights
echo ==========================================
echo        GarminSights v2 Launcher
echo ==========================================
echo.

:: Check if backend venv exists
if not exist "backend\venv" (
    echo [1/4] Creating Python virtual environment...
    cd backend
    python -m venv venv
    cd ..
)

:: Install backend dependencies
echo [2/4] Installing backend dependencies...
cd backend
call venv\Scripts\activate.bat
pip install -r requirements.txt -q
cd ..

:: Check if frontend node_modules exists
if not exist "frontend\node_modules" (
    echo [3/4] Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
) else (
    echo [3/4] Frontend dependencies already installed.
)

echo [4/4] Starting servers...
echo.
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:5173
echo.
echo   Press Ctrl+C to stop both servers.
echo ==========================================
echo.

:: Start backend in background
start "GarminSights Backend" cmd /c "cd backend && call venv\Scripts\activate.bat && python -m uvicorn app.main:app --reload --port 8000"

:: Wait a moment for backend to start
timeout /t 3 /nobreak > nul

:: Start frontend in background
start "GarminSights Frontend" cmd /c "cd frontend && npm run dev"

:: Wait for frontend to be ready then open browser
timeout /t 4 /nobreak > nul
echo.
echo Opening browser...
start http://localhost:5173

echo.
echo ==========================================
echo   GarminSights is running!
echo   
echo   Close this window to stop all servers.
echo ==========================================
pause > nul

