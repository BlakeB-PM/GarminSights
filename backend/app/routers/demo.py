"""Demo mode router — toggle synthetic data for testing."""

from fastapi import APIRouter

from app.services.demo_data import (
    is_demo_active,
    generate_demo_data,
    clear_demo_data,
)

router = APIRouter(prefix="/api/demo", tags=["demo"])


@router.get("/status")
async def demo_status():
    """Check whether demo mode is currently active."""
    return {"active": is_demo_active()}


@router.post("/enable")
async def enable_demo():
    """Generate demo data and activate demo mode."""
    if is_demo_active():
        return {"active": True, "message": "Demo mode is already active"}

    counts = generate_demo_data(days_back=90)
    return {
        "active": True,
        "message": "Demo mode enabled with synthetic data",
        "data_generated": counts,
    }


@router.post("/disable")
async def disable_demo():
    """Clear demo data and deactivate demo mode."""
    if not is_demo_active():
        return {"active": False, "message": "Demo mode is already inactive"}

    counts = clear_demo_data()
    return {
        "active": False,
        "message": "Demo data cleared",
        "data_removed": counts,
    }
