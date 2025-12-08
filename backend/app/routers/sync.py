"""Data sync router."""

import logging
from fastapi import APIRouter, HTTPException

from app.models.schemas import SyncRequest, SyncStatus
from app.services.garmin_service import get_garmin_service
from app.services.sync_service import get_sync_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.get("/status")
async def sync_status():
    """Get sync status and database statistics."""
    from app.database import execute_query
    
    garmin = get_garmin_service()
    
    # Check database counts
    try:
        activities_count = execute_query("SELECT COUNT(*) as count FROM activities")[0]["count"]
        sleep_count = execute_query("SELECT COUNT(*) as count FROM sleep")[0]["count"]
        dailies_count = execute_query("SELECT COUNT(*) as count FROM dailies")[0]["count"]
    except Exception as e:
        activities_count = 0
        sleep_count = 0
        dailies_count = 0
    
    # Check session
    session_valid = garmin.check_session()
    
    return {
        "authenticated": session_valid,
        "username": garmin._username if session_valid else None,
        "database": {
            "activities_count": activities_count,
            "sleep_count": sleep_count,
            "dailies_count": dailies_count
        }
    }


@router.post("/", response_model=SyncStatus)
async def sync_data(request: SyncRequest = None):
    """
    Sync data from Garmin Connect.
    
    Requires authentication first.
    """
    # Check authentication
    garmin = get_garmin_service()
    
    if not garmin.check_session():
        logger.warning("Sync attempted without valid session")
        raise HTTPException(
            status_code=401,
            detail="Not authenticated. Please login first."
        )
    
    # Set defaults
    if request is None:
        request = SyncRequest()
    
    sync_service = get_sync_service()
    
    try:
        status = sync_service.sync_all(days_back=request.days_back)
        # Log the result
        logger.info(f"Sync complete: {status.activities_synced} activities, {status.sleep_days_synced} sleep, {status.dailies_synced} dailies")
        return status
    except Exception as e:
        logger.error(f"Sync endpoint error: {e}", exc_info=True)
        return SyncStatus(
            success=False,
            error=str(e)
        )


@router.post("/activities", response_model=SyncStatus)
async def sync_activities_only(limit: int = 50):
    """Sync only activities."""
    garmin = get_garmin_service()
    if not garmin.check_session():
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    sync_service = get_sync_service()
    
    try:
        activities, sets = sync_service.sync_activities(limit=limit)
        return SyncStatus(
            success=True,
            activities_synced=activities,
            strength_sets_extracted=sets
        )
    except Exception as e:
        return SyncStatus(success=False, error=str(e))


@router.post("/sleep", response_model=SyncStatus)
async def sync_sleep_only(days_back: int = 30):
    """Sync only sleep data."""
    garmin = get_garmin_service()
    if not garmin.check_session():
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    sync_service = get_sync_service()
    
    try:
        days = sync_service.sync_sleep(days_back=days_back)
        return SyncStatus(
            success=True,
            sleep_days_synced=days
        )
    except Exception as e:
        return SyncStatus(success=False, error=str(e))


@router.post("/dailies", response_model=SyncStatus)
async def sync_dailies_only(days_back: int = 30):
    """Sync only daily metrics."""
    garmin = get_garmin_service()
    if not garmin.check_session():
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    sync_service = get_sync_service()
    
    try:
        days = sync_service.sync_dailies(days_back=days_back)
        return SyncStatus(
            success=True,
            dailies_synced=days
        )
    except Exception as e:
        return SyncStatus(success=False, error=str(e))

