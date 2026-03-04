"""FastAPI application entry point for GarminSights."""

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db
from app.middleware import APIKeyAuthMiddleware, SecurityHeadersMiddleware
from app.routers import auth, sync, activities, wellness, strength, chat, cycling

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Detect environment
IS_PRODUCTION = os.environ.get("ENV", "development") == "production"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    logger.info("Starting GarminSights API...")
    init_db()
    logger.info("Database initialized")

    yield

    # Shutdown
    logger.info("Shutting down GarminSights API...")


# Create FastAPI app — disable interactive docs in production
app = FastAPI(
    title="GarminSights API",
    description="Personal fitness analytics powered by Garmin Connect data",
    version="2.0.0",
    lifespan=lifespan,
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
)

# ── Middleware (outermost first) ─────────────────────────────────
# Security headers on every response
app.add_middleware(SecurityHeadersMiddleware)

# CORS — must come before auth so preflight requests work
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Single-user API key authentication (no-op when APP_SECRET_KEY unset)
app.add_middleware(APIKeyAuthMiddleware)

# ── Routers ──────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(sync.router)
app.include_router(activities.router)
app.include_router(wellness.router)
app.include_router(strength.router)
app.include_router(chat.router)
app.include_router(cycling.router)


@app.get("/api/health")
async def health_check():
    """Detailed health check."""
    from app.database import execute_query

    try:
        result = execute_query("SELECT COUNT(*) as count FROM activities")
        db_status = "connected"
        activity_count = result[0]["count"] if result else 0
    except Exception:
        db_status = "error"
        activity_count = 0

    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "database": db_status,
        "activity_count": activity_count
    }


# ── Static frontend (production only) ───────────────────────────
# When running in production the built frontend is served from /static.
# The SPA catch-all is handled by mounting the static directory and
# returning index.html for non-API routes.
_static_dir = Path(__file__).resolve().parent.parent / "static"
if _static_dir.is_dir():
    from fastapi.responses import FileResponse

    # Serve static assets (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=_static_dir / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """SPA catch-all — return index.html for non-API routes."""
        file_path = _static_dir / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(_static_dir / "index.html")
else:
    @app.get("/")
    async def root():
        """Health check endpoint (dev mode — no static build)."""
        return {
            "name": "GarminSights API",
            "version": "2.0.0",
            "status": "running"
        }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
