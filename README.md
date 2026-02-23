# GarminSights v2

A premium personal fitness analytics dashboard powered by your Garmin Connect data and AI coaching.

## Features

- **Dashboard** - At-a-glance view of sleep score, recovery status, weekly steps, and activity heatmap
- **Activity Log** - Searchable, filterable list of all your workouts
- **Strength Analytics** - Track lifting progress with estimated 1RM, volume charts, personal records, muscle-group breakdown, and training balance
- **Cycling Analytics** - Power curve, power zones, cadence analysis, efficiency factor, estimated FTP, and sleep/performance correlation
- **Data Viewer** - Explore raw sleep and daily wellness records with inline activity detail
- **AI Coach** - Chat with an AI fitness coach that analyzes your actual training data

## Tech Stack

### Backend
- **FastAPI** - Modern Python web framework
- **garth** - Garmin Connect API client
- **SQLite** - Local database for fitness data
- **Anthropic Claude** - AI coaching powered by Claude

### Frontend
- **React 18** + **Vite** - Fast, modern frontend
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Recharts** - Data visualization
- **Lucide React** - Icons

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- Garmin Connect account
- Anthropic API key (for AI Coach — optional)

### Quick Start (Recommended)

**Just double-click `start.bat`!**

This will:
1. Create a Python virtual environment (first run only)
2. Install all dependencies (first run only)
3. Start both backend and frontend servers
4. Open the app at http://localhost:5173

### First Time Setup

1. Run `start.bat`
2. Open http://localhost:5173 in your browser
3. Go to **Settings**
4. Click **Enter Credentials** and enter your Garmin email/password
5. Click **Connect to Garmin**
6. Click **Sync Now** to download your data

**For AI Coach:** Add your Anthropic API key in Settings or in `backend/.env`

### Manual Setup (Alternative)

If you prefer to run servers separately:

```bash
# Terminal 1 — Backend
cd backend
python -m venv venv
.\venv\Scripts\activate  # Windows
# source venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev
```

### Docker (Local)

To run the production image locally with Docker:

```bash
cp backend/env.example.txt .env   # then fill in values
docker compose up --build
```

The app will be available at http://localhost:8080.

### Cloud Run Deployment (Google Cloud)

The project includes a multi-stage Dockerfile that builds the React frontend and serves it from the FastAPI backend as static files — a single-container deployment suitable for Cloud Run.

```bash
gcloud run deploy garminsights --source . --region us-central1
```

Set the required environment variables (see below) in the Cloud Run service configuration or via `--set-env-vars`.

## Project Structure

```
GarminSights/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI entry point & static file serving
│   │   ├── config.py               # Environment settings (pydantic-settings)
│   │   ├── database.py             # SQLite setup
│   │   ├── middleware.py           # Request middleware
│   │   ├── migrations.py           # Schema migrations
│   │   ├── models/
│   │   │   └── schemas.py          # Pydantic models
│   │   ├── services/
│   │   │   ├── garmin_service.py   # Garmin Connect API
│   │   │   ├── sync_service.py     # Data sync orchestration
│   │   │   ├── activity_parser.py  # Raw activity JSON parser
│   │   │   └── coach_service.py    # AI Coach
│   │   └── routers/
│   │       ├── auth.py             # Authentication
│   │       ├── sync.py             # Data sync
│   │       ├── activities.py       # Activity data
│   │       ├── wellness.py         # Sleep & dailies
│   │       ├── strength.py         # Strength analytics
│   │       ├── cycling.py          # Cycling analytics
│   │       └── chat.py             # AI Coach
│   ├── env.example.txt
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── components/             # Shared React components
│   │   │   ├── activities/         # Activity-related components
│   │   │   ├── dashboard/          # Dashboard widgets
│   │   │   ├── layout/             # Header, nav
│   │   │   ├── strength/           # Strength analytics components
│   │   │   └── ui/                 # Generic UI primitives
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── ActivityLog.tsx
│   │   │   ├── StrengthAnalytics.tsx
│   │   │   ├── CyclingAnalytics.tsx
│   │   │   ├── DataViewer.tsx
│   │   │   ├── Coach.tsx
│   │   │   └── Settings.tsx
│   │   ├── lib/
│   │   │   ├── api.ts              # Typed API client
│   │   │   └── utils.ts            # Helpers & formatters
│   │   ├── App.tsx                 # Router & layout
│   │   └── main.tsx                # Entry point
│   ├── tailwind.config.js
│   └── package.json
│
├── Dockerfile                      # Multi-stage build for Cloud Run
├── docker-compose.yml              # Local Docker testing
└── start.bat                       # One-click local launcher (Windows)
```

## API Endpoints

All endpoints are prefixed with `/api`.

### Authentication — `/api/auth`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/auth/status` | Check authentication status |
| `POST` | `/auth/login` | Login to Garmin Connect |
| `POST` | `/auth/logout` | Logout and clear tokens |

### Data Sync — `/api/sync`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/sync/status` | Get last sync timestamps |
| `POST` | `/sync/` | Sync all data |
| `POST` | `/sync/activities` | Sync activities only |
| `POST` | `/sync/sleep` | Sync sleep only |
| `POST` | `/sync/dailies` | Sync dailies only |
| `POST` | `/sync/backfill-strength` | Backfill strength sets from raw activity JSON |
| `POST` | `/sync/backfill-wellness` | Backfill historical wellness data |

### Activities — `/api/activities`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/activities/` | List activities (filterable) |
| `GET` | `/activities/count` | Total activity count |
| `GET` | `/activities/types` | Distinct activity types |
| `GET` | `/activities/heatmap` | Activity heatmap data |
| `GET` | `/activities/dashboard/summary` | Dashboard summary card |
| `GET` | `/activities/training-load` | Training load over time |
| `GET` | `/activities/breakdown` | Activity type breakdown |
| `GET` | `/activities/{id}` | Single activity with strength sets |

### Wellness — `/api/wellness`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/wellness/sleep` | Sleep records (date range) |
| `GET` | `/wellness/sleep/latest` | Most recent sleep record |
| `GET` | `/wellness/sleep/average` | Aggregated sleep averages |
| `GET` | `/wellness/sleep/trend` | Sleep trend over time |
| `GET` | `/wellness/dailies` | Daily metrics (date range) |
| `GET` | `/wellness/dailies/latest` | Most recent daily record |
| `GET` | `/wellness/dailies/average` | Aggregated daily averages |
| `GET` | `/wellness/dailies/trend` | Daily metrics trend |
| `GET` | `/wellness/stress/distribution` | Stress level distribution |
| `GET` | `/wellness/recovery` | Recovery status |

### Strength — `/api/strength`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/strength/exercises` | List tracked exercises |
| `GET` | `/strength/sets` | Raw strength sets (filterable) |
| `GET` | `/strength/progress/{exercise_name}` | Progress history for an exercise |
| `GET` | `/strength/volume` | Volume over time |
| `GET` | `/strength/prs` | Personal records |
| `GET` | `/strength/recent-workouts` | Recent workout summaries |
| `GET` | `/strength/muscle-groups` | Volume by muscle group |
| `GET` | `/strength/key-lifts` | Key lift cards with PR and trend |
| `GET` | `/strength/training-balance` | Push/pull/legs training balance |
| `GET` | `/strength/frequency` | Muscle group training frequency |
| `GET` | `/strength/volume-trends` | Volume trends per muscle group |
| `GET` | `/strength/muscle-comparison` | Period-over-period muscle comparison |
| `GET` | `/strength/drill-down` | Drill-down for a specific muscle group |

### Cycling — `/api/cycling`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/cycling/summary` | Aggregated metrics (rides, avg power, FTP estimate) |
| `GET` | `/cycling/trends` | Power, cadence, and efficiency factor trends |
| `GET` | `/cycling/power-curve` | Mean-max power curve |
| `GET` | `/cycling/power-zones` | Time in power zones |
| `GET` | `/cycling/distance` | Distance over time |
| `GET` | `/cycling/cadence-analysis` | Cadence distribution |
| `GET` | `/cycling/power-cadence-scatter` | Power vs cadence scatter data |
| `GET` | `/cycling/power-curve-history` | Power curve comparison across periods |
| `GET` | `/cycling/sleep-performance` | Sleep quality vs cycling performance correlation |

### AI Coach — `/api/chat`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/chat` | Send a message to the AI coach |
| `GET` | `/chat/context` | Preview the fitness context sent to the model |

## Environment Variables

Create a `.env` file in the `backend/` directory (copy from `backend/env.example.txt`):

```env
# Garmin Connect credentials
GARMIN_EMAIL=your@email.com
GARMIN_PASSWORD=your_password

# Database
DATABASE_PATH=./fitness.db

# Garth session tokens
GARTH_TOKENS_PATH=./.garth_tokens

# AI Coach (optional)
ANTHROPIC_API_KEY=sk-ant-...

# CORS — comma-separated list of allowed frontend origins (web/Cloud Run deployments)
# Defaults to http://localhost:5173,http://localhost:3000 for local dev
# CORS_ORIGINS=https://app.yourdomain.com
```

> **Note:** `CORS_ORIGINS` must list exact origins — wildcards (`*`) are not supported because the app uses credentialed requests.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser                                                        │
│  React + TypeScript (Vite)                                      │
│  Pages: Dashboard, Activity Log, Strength, Cycling,            │
│         Data Viewer, Coach, Settings                            │
└───────────────────────────┬─────────────────────────────────────┘
                            │ fetch() — JSON REST API
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  FastAPI (Python 3.11)                                          │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌────────────┐  │
│  │  routers/ │  │ services/ │  │  models/  │  │ database.py│  │
│  │ auth      │  │ garmin    │  │ schemas   │  │ SQLite     │  │
│  │ sync      │  │ sync      │  │ (pydantic)│  │ fitness.db │  │
│  │ activities│  │ coach     │  └───────────┘  └────────────┘  │
│  │ wellness  │  │ activity_ │                                  │
│  │ strength  │  │  parser   │                                  │
│  │ cycling   │  └─────┬─────┘                                  │
│  │ chat      │        │                                         │
│  └───────────┘        │                                         │
└───────────────────────┼─────────────────────────────────────────┘
                        │
           ┌────────────┴─────────────┐
           │                          │
           ▼                          ▼
  ┌─────────────────┐      ┌──────────────────────┐
  │ Garmin Connect  │      │ Anthropic Claude API  │
  │ (via garth /    │      │ (AI Coach — optional) │
  │  garminconnect) │      └──────────────────────┘
  └─────────────────┘
```

In production (Cloud Run), the FastAPI backend also serves the pre-built React bundle as static files — the frontend and backend run as a single container.

## Data Flow

### Syncing Data from Garmin Connect

```
User clicks "Sync Now"
        │
        ▼
POST /api/sync/
        │
        ▼
SyncService.sync_all()
        │
        ├── GarminService.fetch_activities()
        │       └── garminconnect → Garmin Connect API
        │               ▼
        │       For each new activity:
        │         • Save summary + raw_json → activities table
        │         • If strength_training:
        │             fetch_exercise_sets() → parse sets/reps/weight
        │             → strength_sets table
        │         • raw_json also stores power, cadence, HR for cycling
        │
        ├── GarminService.fetch_sleep(date) × N days
        │       └── → sleep table
        │
        └── GarminService.fetch_daily_summary(date) × N days
                └── → dailies table
```

Sync is **incremental** — records use `UNIQUE` constraints (`garmin_id` for activities, `date` for sleep/dailies) so re-syncing the same data is a safe no-op (skipped via `INSERT OR IGNORE`).

`backfill-strength` re-parses `raw_json` already in the database to extract strength sets without re-fetching from Garmin. `backfill-wellness` fetches historical sleep and daily data for a longer date range.

### Activity Parsing

The `activity_parser.py` service extracts structured metrics from the `raw_json` blob stored with each activity:

- **Cycling activities** — average power, normalized power, max power, cadence, heart rate, training stress score (TSS)
- **Strength activities** — exercise name, set number, reps, weight per set (also stored in `strength_sets` at sync time)

This means cycling analytics work entirely from locally stored data — no additional Garmin API calls are needed after the initial sync.

### AI Coach Request Flow

```
User sends message in Coach page
        │
        ▼
POST /api/chat  { message, context_days=7 }
        │
        ▼
CoachService.build_fitness_context(days=7)
        │  Queries local SQLite for:
        │  • Activity counts & minutes by type
        │  • Sleep score, duration, HRV, resting HR averages
        │  • Steps, Body Battery, stress averages
        │  • Top 10 strength exercises by estimated 1RM
        │  • Last 5 recent workouts
        │
        ▼
Anthropic Claude API (claude-sonnet-4-20250514)
  system: fitness coach persona
  user:   [fitness context summary] + user's question
        │
        ▼
Response streamed back to browser
```

The context window is limited to the last 7 days by default (configurable via `context_days`). Each chat turn is stateless — conversation history is not retained between requests.

## Database Schema

SQLite database stored at `backend/fitness.db` (configurable via `DATABASE_PATH`).

### `activities`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Internal row ID |
| `garmin_id` | TEXT UNIQUE | Garmin activity ID (deduplication key) |
| `activity_type` | TEXT | e.g. `strength_training`, `cycling`, `running` |
| `name` | TEXT | Activity name from Garmin |
| `start_time` | DATETIME | Activity start (UTC) |
| `duration_seconds` | INTEGER | Total duration |
| `distance_meters` | REAL | Distance (null for strength) |
| `calories` | INTEGER | Calories burned |
| `raw_json` | TEXT | Full Garmin JSON response (used for cycling metrics & backfill) |

### `sleep`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Internal row ID |
| `date` | DATE UNIQUE | Calendar date |
| `sleep_score` | INTEGER | Garmin sleep score (0–100) |
| `total_sleep_seconds` | INTEGER | Total sleep time |
| `deep_sleep_seconds` | INTEGER | Deep sleep duration |
| `light_sleep_seconds` | INTEGER | Light sleep duration |
| `rem_sleep_seconds` | INTEGER | REM sleep duration |
| `awake_seconds` | INTEGER | Awake time during sleep window |
| `hrv_average` | REAL | Average overnight HRV (ms) |
| `resting_hr` | INTEGER | Resting heart rate |
| `raw_json` | TEXT | Full Garmin sleep JSON |

### `dailies`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Internal row ID |
| `date` | DATE UNIQUE | Calendar date |
| `steps` | INTEGER | Total steps |
| `distance_meters` | REAL | Total walking/running distance |
| `active_calories` | INTEGER | Active calorie burn |
| `calories_total` | INTEGER | Total calories (active + BMR) |
| `calories_bmr` | INTEGER | Basal metabolic rate calories |
| `body_battery_high` | INTEGER | Peak Body Battery (0–100) |
| `body_battery_low` | INTEGER | Lowest Body Battery |
| `body_battery_charged` | INTEGER | Battery gained overnight |
| `body_battery_drained` | INTEGER | Battery used during day |
| `stress_average` | INTEGER | Average stress level (0–100) |
| `stress_high` | INTEGER | Peak stress |
| `low/medium/high_stress_duration` | INTEGER | Minutes in each stress tier |
| `intensity_minutes_moderate` | INTEGER | Moderate intensity minutes |
| `intensity_minutes_vigorous` | INTEGER | Vigorous intensity minutes |
| `avg/max/min/resting_heart_rate` | INTEGER | Heart rate metrics |
| `raw_json` | TEXT | Full Garmin daily JSON |

### `strength_sets`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Internal row ID |
| `activity_id` | INTEGER FK → `activities.id` | Parent activity |
| `exercise_name` | TEXT | Garmin exercise name (e.g. `BARBELL_BENCH_PRESS`) |
| `set_number` | INTEGER | Set order within the workout |
| `reps` | INTEGER | Repetitions |
| `weight_lbs` | REAL | Load in pounds |
| `duration_seconds` | INTEGER | Set duration |
| `raw_json` | TEXT | Raw set JSON from Garmin |

## Authentication & Session Management

GarminSights uses the `garth` library (via `garminconnect`) for Garmin authentication.

1. **Login** — credentials (email + password) are sent to the Garmin Connect SSO endpoint. On success, `garth` stores OAuth tokens to disk at `GARTH_TOKENS_PATH` (default `backend/.garth_tokens/`). The raw password is **never stored**.
2. **Session persistence** — subsequent requests load the saved tokens from disk, so credentials only need to be entered once. A lightweight API call (`get_full_name`) verifies the session is still valid on each startup.
3. **Token refresh** — `garth` handles OAuth token refresh automatically.
4. **Logout** — deletes all token files from `GARTH_TOKENS_PATH` and clears the in-memory session.

> **Privacy:** All fitness data is stored in a local SQLite file. No data is sent to any third-party service except Garmin Connect (to fetch your own data) and Anthropic (only when using the AI Coach, and only aggregated summaries — not raw records).

## License

MIT
