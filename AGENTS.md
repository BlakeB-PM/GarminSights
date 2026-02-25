# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

GarminSights v2 is a personal fitness analytics dashboard (Python FastAPI backend + React/Vite frontend) that syncs data from Garmin Connect. See `README.md` for full architecture, API endpoints, and database schema.

### Services

| Service | Port | Command |
|---------|------|---------|
| Backend (FastAPI) | 8000 | `cd backend && source venv/bin/activate && python -m uvicorn app.main:app --reload --port 8000` |
| Frontend (Vite) | 5173 | `cd frontend && npm run dev` |

The Vite dev server proxies `/api` requests to the backend on port 8000 (configured in `frontend/vite.config.ts`).

### Running checks

- **Lint**: `cd frontend && npx eslint .` (pre-existing lint errors exist in the codebase)
- **TypeScript check**: `cd frontend && npx tsc -b` (pre-existing TS errors exist)
- **Vite build**: `cd frontend && npx vite build` (succeeds despite TS errors because Vite uses esbuild)
- **Backend**: No automated test suite; verify by starting uvicorn and hitting API endpoints (e.g. `curl http://localhost:8000/api/auth/status`)

### Gotchas

- `python3.12-venv` must be installed via apt before creating the backend virtualenv (`sudo apt-get install -y python3.12-venv`). The update script handles this.
- The backend uses SQLite (file-based, auto-created on first startup) — no external database server is needed.
- The app works without Garmin credentials — pages show empty states. To populate data, set `GARMIN_EMAIL` and `GARMIN_PASSWORD` in `backend/.env` and use the Settings page to sync.
- The AI Coach feature requires `ANTHROPIC_API_KEY` in `backend/.env` (optional).
- The `tsc -b` command fails with pre-existing type errors, but `vite build` (and `vite dev`) still work because Vite transpiles TypeScript with esbuild, not tsc.
