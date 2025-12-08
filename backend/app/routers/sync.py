"""Data sync router."""

from fastapi import APIRouter, HTTPException

from app.models.schemas import SyncRequest, SyncStatus
from app.services.garmin_service import get_garmin_service
from app.services.sync_service import get_sync_service

router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.post("/", response_model=SyncStatus)
async def sync_data(request: SyncRequest = None):
    """
    Sync data from Garmin Connect.
    
    Requires authentication first.
    """
    # Check authentication
    garmin = get_garmin_service()
    if not garmin.check_session():
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
        return status
    except Exception as e:
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

