# AGENTS.md

## Cursor Cloud specific instructions

### Overview

GarminSights v2 is a two-service dev setup: a **Python/FastAPI backend** (port 8000) and a **React/Vite frontend** (port 5173). SQLite is embedded (no external DB). The Vite dev server proxies `/api/*` to the backend automatically.

### Running services

- **Backend:** `cd backend && source venv/bin/activate && python -m uvicorn app.main:app --reload --port 8000`
- **Frontend:** `cd frontend && npm run dev` (serves on port 5173)

Both must run simultaneously for full-stack development.

### Lint / Build / Test

- **Frontend lint:** `cd frontend && npm run lint` — pre-existing ESLint/TS errors exist in the repo.
- **Frontend build:** `cd frontend && npm run build` — runs `tsc -b && vite build`. Pre-existing TypeScript errors prevent a clean build, but the Vite dev server still works fine since it doesn't enforce strict type checking.
- No automated test suite exists in the repo.

### Key caveats

- `python3.12-venv` must be installed via apt before creating the backend virtualenv (`sudo apt-get install -y python3.12-venv`). The update script handles this.
- The backend virtualenv lives at `backend/venv/`. Always activate it before running backend commands.
- External API credentials (Garmin Connect, Anthropic) are optional for running the app but required for data sync and AI Coach features. Configure via `backend/.env` (see `backend/env.example.txt`).
- The SQLite database (`backend/fitness.db`) is auto-created on first backend startup.
