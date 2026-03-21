# AGENTS.md — GarminSights

Developer and AI-agent reference for the GarminSights codebase.

---

## Project Overview

GarminSights is a personal fitness analytics dashboard that syncs data from Garmin Connect and presents it through a web UI. An AI coaching feature (powered by Anthropic Claude) provides natural-language analysis of activity trends, strength training, and wellness metrics.

The app is a single deployable container: a Python FastAPI backend serves both the REST API and the pre-built React frontend as static files.

---

## Repository Structure

```
GarminSights/
├── backend/                  # Python FastAPI application
│   ├── app/
│   │   ├── main.py           # App entry point, router registration, static file serving
│   │   ├── config.py         # Pydantic settings (env vars)
│   │   ├── database.py       # SQLite init & connection helpers
│   │   ├── migrations.py     # Schema migration logic (run at startup)
│   │   ├── middleware.py     # CORS and request middleware
│   │   ├── models/
│   │   │   └── schemas.py    # Pydantic request/response models
│   │   ├── routers/          # One file per feature area (auth, sync, activities, etc.)
│   │   └── services/         # Business logic (Garmin API, AI coach, parsers)
│   ├── requirements.txt
│   └── env.example.txt
├── frontend/                 # React + TypeScript + Vite SPA
│   ├── src/
│   │   ├── components/       # UI primitives and feature components
│   │   ├── pages/            # Top-level route pages
│   │   ├── hooks/            # Custom React hooks
│   │   ├── lib/              # API client (api.ts) and utilities
│   │   └── main.tsx          # App entry point
│   ├── public/               # Static assets and PWA icons
│   ├── package.json
│   ├── vite.config.ts        # Vite + PWA config; dev proxy for /api → :8000
│   ├── tailwind.config.js
│   └── eslint.config.js
├── Dockerfile                # Multi-stage build (Node builder → Python runtime)
├── docker-compose.yml        # Local production image test
├── fly.toml                  # Fly.io deployment config
├── .github/workflows/
│   └── deploy.yml            # CI: push to main → deploy to Fly.io
├── .env.example              # Root-level env template
└── start.bat                 # Windows convenience launcher
```

**Auto-generated / never commit:**
- `frontend/dist/` — Vite build output
- `frontend/node_modules/`
- `backend/__pycache__/`, `**/*.pyc`
- `*.db`, `*.sqlite` — SQLite database files
- `.garth_tokens/` — Garmin session tokens
- `.env` — actual secrets file (use `.env.example` as template)

---

## Environment Setup

### Prerequisites
- Python 3.12+
- Node.js 20+
- A Garmin Connect account
- An Anthropic API key (for AI Coach)

### Environment Variables

Copy `.env.example` to `.env` in the repo root and fill in values:

```
GARMIN_EMAIL=your@email.com
GARMIN_PASSWORD=yourpassword
ANTHROPIC_API_KEY=sk-ant-...
APP_SECRET_KEY=some-random-secret   # optional: enables simple API key auth
DATABASE_PATH=./fitness.db          # path to SQLite file
GARTH_TOKENS_PATH=./.garth_tokens  # Garmin session token cache
CORS_ORIGINS=http://localhost:5173  # comma-separated allowed origins
ENV=development
COACH_MODEL=claude-sonnet-4-6       # optional override for AI coach model
```

The frontend has its own `frontend/.env.example` with `VITE_API_URL`. In dev the Vite proxy handles `/api` routing automatically; `VITE_API_URL` is only needed when building for a non-same-origin deployment.

---

## Local Development

### On Windows (with WSL recommended)

The repo ships `start.bat` as a convenience launcher for Windows, but WSL is preferred for a Unix-like workflow:

```bash
# Inside WSL (Ubuntu or similar):

# Backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev        # starts at http://localhost:5173
```

The Vite dev server proxies all `/api/*` requests to `http://localhost:8000`, so the frontend talks to the local backend automatically.

### On macOS / Linux

Same as the WSL steps above.

---

## Build Commands

### Frontend

```bash
cd frontend
npm install           # install dependencies
npm run dev           # dev server (http://localhost:5173)
npm run build         # production build → frontend/dist/
npm run typecheck     # run TypeScript compiler check (tsc -b), no emit
npm run lint          # run ESLint
npm run preview       # preview the production build locally
```

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The backend runs database migrations automatically at startup (`migrations.py`).

### Docker (production image)

```bash
# Build and run the full production image locally
docker-compose up --build

# App available at http://localhost:8080
```

---

## Testing

**No test suite currently exists.** Do not invent or run tests that aren't present. When tests are eventually added:

- **Backend:** use `pytest`. Place tests in `backend/tests/`. Run with `pytest backend/tests/`.
- **Frontend:** use `Vitest` (compatible with the existing Vite setup). Place tests alongside source files as `*.test.ts` / `*.test.tsx`. Run with `npm test` from `frontend/`.

Until a test framework is set up, validate backend changes by running the dev server and exercising the relevant API endpoints manually.

---

## Code Conventions

### Backend (Python)

- **Framework:** FastAPI with Pydantic v2 for all request/response models.
- **Settings:** All configuration comes from `app/config.py` via `pydantic-settings`. Never hardcode credentials or paths.
- **Database:** Raw SQLite via `app/database.py`. No ORM. Use parameterized queries — never string-interpolate SQL.
- **Schema changes:** Add a migration step in `backend/app/migrations.py`. Migrations run at startup; they must be idempotent (use `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, etc.).
- **Routers:** One file per domain (auth, activities, wellness, strength, cycling, sync, chat). Keep route handlers thin; put logic in `services/`.
- **AI Coach model:** Always respect the `COACH_MODEL` environment variable (defaulting to `claude-sonnet-4-6`). Never hardcode a model name in `coach_service.py`.
- Follow PEP 8. Use type hints throughout.

### Frontend (TypeScript / React)

- **Language:** TypeScript with strict mode. Fix type errors; do not use `any` or `// @ts-ignore` as a shortcut.
- **Styling:** Tailwind CSS utility classes. Custom design tokens are defined in `tailwind.config.js` — use them (`bg-card`, `text-accent`, etc.) instead of arbitrary values.
- **Data fetching:** TanStack React Query (`@tanstack/react-query`). All API calls go through `src/lib/api.ts`.
- **Routing:** React Router v7. Routes are defined in `src/App.tsx`.
- **Components:** UI primitives live in `src/components/ui/`. Feature components live in their domain subfolder (`dashboard/`, `strength/`, `activities/`).
- **Charts:** Recharts. Match the existing dark-theme color palette defined in other chart components.
- **Icons:** Lucide React only.
- **No test runner is configured yet** — do not add Jest/Vitest config without explicit instruction.
- Always run `npm run typecheck` and `npm run lint` after making frontend changes.

---

## API Structure

The backend exposes a REST API under `/api/`:

| Router file       | Prefix            | Purpose                              |
|-------------------|-------------------|--------------------------------------|
| `auth.py`         | `/api/auth`       | Garmin login / logout                |
| `sync.py`         | `/api/sync`       | Trigger Garmin data sync             |
| `activities.py`   | `/api/activities` | Activity list and detail             |
| `wellness.py`     | `/api/wellness`   | Sleep, daily metrics, body battery   |
| `strength.py`     | `/api/strength`   | Strength training analytics          |
| `cycling.py`      | `/api/cycling`    | Cycling analytics                    |
| `chat.py`         | `/api/chat`       | AI Coach (streams Claude responses)  |

A health check endpoint lives at `GET /api/health`.

In production, the FastAPI app also serves the built React SPA from `frontend/dist/` as static files, with a catch-all that returns `index.html` for client-side routing.

---

## Deployment

Deployments are triggered automatically by pushing to `main` via GitHub Actions (`.github/workflows/deploy.yml`), which runs `flyctl deploy --remote-only` to Fly.io.

The production app runs at `https://garminsights.blakebeal.com`.

**Do not manually push Docker images or run `flyctl deploy` unless explicitly asked.**

---

## Things Agents Should Not Do

- **Do not modify `.garth_tokens/` or any `*.db` file.** These are runtime data, not source code.
- **Do not commit `.env` files** containing real credentials.
- **Do not push to `main` directly.** All changes go through a feature branch and PR.
- **Do not change `fly.toml`** without explicit instruction — it controls the production deployment.
- **Do not hardcode the Anthropic model name** in `coach_service.py`. Always use the `COACH_MODEL` setting.
- **Do not add `any` types or `// @ts-ignore`** to silence TypeScript errors; fix the underlying type issue.
- **Do not modify `migrations.py` to drop or rename columns** without explicit instruction — this can destroy user data.
- **Do not run `flyctl deploy`** or any command that affects the production environment unless explicitly instructed.
- **Do not install new Python or npm packages** without confirming with the user — the dependency list is intentionally minimal.
