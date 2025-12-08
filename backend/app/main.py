"""FastAPI application entry point for GarminSights."""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.routers import auth, sync, activities, wellness, strength, chat

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


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


# Create FastAPI app
app = FastAPI(
    title="GarminSights API",
    description="Personal fitness analytics powered by Garmin Connect data",
    version="2.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(sync.router)
app.include_router(activities.router)
app.include_router(wellness.router)
app.include_router(strength.router)
app.include_router(chat.router)


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "name": "GarminSights API",
        "version": "2.0.0",
        "status": "running"
    }


@app.get("/api/health")
async def health_check():
    """Detailed health check."""
    from app.database import execute_query
    
    try:
        # Check database
        result = execute_query("SELECT COUNT(*) as count FROM activities")
        db_status = "connected"
        activity_count = result[0]["count"] if result else 0
    except Exception as e:
        db_status = f"error: {e}"
        activity_count = 0
    
    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "database": db_status,
        "activity_count": activity_count
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

