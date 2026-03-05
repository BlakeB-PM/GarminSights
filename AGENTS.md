# GarminSights - Development Guide

## Project Overview

GarminSights is a fitness analytics dashboard built with:
- **Backend**: Python 3 / FastAPI / SQLite (port 8000)
- **Frontend**: React 18 / TypeScript / Vite / Tailwind CSS / Recharts (port 5173)

## Quick Start

### 1. Seed the database with dummy data

```bash
cd backend && python3 seed_data.py
```

This creates `backend/fitness.db` with ~16 weeks of realistic data:
- 53 strength training workouts with sets covering all 10 muscle groups
- 42 running activities
- 13 cycling activities
- 113 daily sleep + wellness records

### 2. Start the backend

```bash
cd backend && python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
```

No environment variables are required for local dev (auth middleware is disabled when `APP_SECRET_KEY` is unset). Verify with:

```bash
curl http://localhost:8000/api/health
```

### 3. Start the frontend

```bash
cd frontend && npm install && npm run dev -- --host 0.0.0.0 --port 5173 &
```

The Vite dev server proxies `/api` requests to `http://localhost:8000`.

### 4. Open the app

Navigate to `http://localhost:5173` in Chrome.

## Cursor Cloud specific instructions

### Installing dependencies

```bash
# Backend
cd /workspace/backend && pip install -r requirements.txt

# Frontend
cd /workspace/frontend && npm install
```

### Running the full stack for UI testing

```bash
# Seed data (only needed once, or to reset)
cd /workspace/backend && python3 seed_data.py

# Start backend (background)
cd /workspace/backend && python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &

# Start frontend (background)
cd /workspace/frontend && npm run dev -- --host 0.0.0.0 --port 5173 &
```

Wait a few seconds for both servers, then use the `computerUse` subagent to navigate to `http://localhost:5173` for GUI testing.

### Key pages for testing

| Page | URL | What it shows |
|------|-----|---------------|
| Dashboard | `/` | Recovery score, sleep, steps, activity breakdown |
| Strength Lab | `/strength` | Volume trends, training balance, muscle group comparison, training frequency, key lifts |
| Cycling | `/cycling` | Ride summaries, power data, trends |
| Activities | `/activities` | Activity log with filters |

### Architecture notes

- **Database**: SQLite at `backend/fitness.db` (auto-created by `init_db()`)
- **No auth needed**: Leave `APP_SECRET_KEY` unset to bypass API key middleware
- **No Garmin account needed**: Sync endpoints require Garmin login, but all read endpoints work with seeded data
- **Muscle mapping**: `backend/app/services/muscle_mapping.py` maps exercise names to 10 muscle groups via keyword matching
- **Frontend API client**: `frontend/src/lib/api.ts` contains all API functions
- **Main pages**: `frontend/src/pages/` (StrengthAnalytics.tsx is the largest)

## Code Guidelines

- Frontend uses TypeScript with React function components and hooks
- Styling via Tailwind CSS utility classes
- Charts rendered with Recharts
- Backend uses FastAPI with async endpoints and raw SQL (no ORM)
