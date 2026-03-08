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
        last_sync_result = execute_query("SELECT MAX(start_time) as ts FROM activities")
        last_synced = last_sync_result[0]["ts"] if last_sync_result and last_sync_result[0].get("ts") else None
    except Exception as e:
        activities_count = 0
        sleep_count = 0
        dailies_count = 0
        last_synced = None

    # Check session
    session_valid = garmin.check_session()

    return {
        "authenticated": session_valid,
        "username": garmin._username if session_valid else None,
        "last_synced": last_synced,
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


@router.post("/backfill-strength")
async def backfill_strength_data():
    """
    Backfill strength training details for existing activities.
    
    This fetches detailed exercise data (sets, reps, weight) for 
    strength training activities that don't have this data yet.
    """
    garmin = get_garmin_service()
    if not garmin.check_session():
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    sync_service = get_sync_service()
    
    try:
        activities_processed, sets_extracted = sync_service.backfill_strength_details()
        return {
            "success": True,
            "activities_processed": activities_processed,
            "sets_extracted": sets_extracted
        }
    except Exception as e:
        logger.error(f"Backfill strength error: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e)
        }


@router.post("/backfill-wellness")
async def backfill_wellness_fields(days_back: int = 30):
    """
    Backfill missing wellness fields (avg_heart_rate, hrv_average, resting_hr, stress durations)
    from raw_json for existing records.
    
    This re-extracts these fields from the stored raw_json without re-fetching from Garmin.
    Useful for fixing missing data after improving extraction logic.
    """
    sync_service = get_sync_service()
    
    try:
        result = sync_service.backfill_wellness_fields(days_back=days_back)
        return {
            "success": True,
            **result
        }
    except Exception as e:
        logger.error(f"Backfill wellness error: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e)
        }

