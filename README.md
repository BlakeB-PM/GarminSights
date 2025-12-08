# GarminSights v2

A premium personal fitness analytics dashboard powered by your Garmin Connect data and AI coaching.

## Features

- **Dashboard** - At-a-glance view of sleep score, recovery status, weekly steps, and activity heatmap
- **Activity Log** - Searchable, filterable list of all your workouts
- **Strength Analytics** - Track lifting progress with estimated 1RM, volume charts, and personal records
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
- Anthropic API key (for AI Coach - optional)

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
# Terminal 1 - Backend
cd backend
python -m venv venv
.\venv\Scripts\activate  # Windows
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000

# Terminal 2 - Frontend
cd frontend
npm install
npm run dev
```

## Project Structure

```
GarminSights/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI entry point
│   │   ├── config.py         # Environment settings
│   │   ├── database.py       # SQLite setup
│   │   ├── models/
│   │   │   └── schemas.py    # Pydantic models
│   │   ├── services/
│   │   │   ├── garmin_service.py   # Garmin API
│   │   │   ├── sync_service.py     # Data sync
│   │   │   └── coach_service.py    # AI Coach
│   │   └── routers/
│   │       ├── auth.py       # Authentication
│   │       ├── sync.py       # Data sync
│   │       ├── activities.py # Activity data
│   │       ├── wellness.py   # Sleep & dailies
│   │       ├── strength.py   # Strength analytics
│   │       └── chat.py       # AI Coach
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── components/       # React components
│   │   ├── pages/            # Page components
│   │   ├── lib/              # Utils & API client
│   │   ├── App.tsx           # Main app
│   │   └── main.tsx          # Entry point
│   ├── tailwind.config.js
│   └── package.json
│
├── _legacy_v1/               # Archived v1 code
└── start.bat                 # One-click launcher
```

## API Endpoints

### Authentication
- `GET /api/auth/status` - Check auth status
- `POST /api/auth/login` - Login to Garmin
- `POST /api/auth/logout` - Logout

### Data Sync
- `POST /api/sync/` - Sync all data
- `POST /api/sync/activities` - Sync activities only
- `POST /api/sync/sleep` - Sync sleep only
- `POST /api/sync/dailies` - Sync dailies only

### Activities
- `GET /api/activities/` - List activities
- `GET /api/activities/{id}` - Get activity with strength sets
- `GET /api/activities/heatmap` - Get activity heatmap
- `GET /api/activities/dashboard/summary` - Dashboard summary

### Wellness
- `GET /api/wellness/sleep` - Get sleep data
- `GET /api/wellness/dailies` - Get daily metrics
- `GET /api/wellness/recovery` - Get recovery status

### Strength
- `GET /api/strength/exercises` - List exercises
- `GET /api/strength/progress/{exercise}` - Get progress data
- `GET /api/strength/prs` - Get personal records
- `GET /api/strength/muscle-groups` - Get volume by muscle group

### AI Coach
- `POST /api/chat` - Send message to AI coach
- `GET /api/chat/context` - Preview fitness context

## Environment Variables

Create a `.env` file in the `backend/` directory:

```env
GARMIN_EMAIL=your@email.com
GARMIN_PASSWORD=your_password
DATABASE_PATH=./fitness.db
GARTH_TOKENS_PATH=./.garth_tokens
ANTHROPIC_API_KEY=sk-ant-...
```

## License

MIT

