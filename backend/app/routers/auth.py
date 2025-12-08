"""Authentication router for Garmin Connect."""

import logging
from fastapi import APIRouter, HTTPException

from app.models.schemas import AuthStatus, LoginRequest
from app.services.garmin_service import get_garmin_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/status", response_model=AuthStatus)
async def get_auth_status():
    """Check current authentication status."""
    garmin = get_garmin_service()
    
    if garmin.check_session():
        return AuthStatus(
            authenticated=True,
            username=garmin.username
        )
    
    return AuthStatus(authenticated=False)


@router.post("/login", response_model=AuthStatus)
async def login(request: LoginRequest = None):
    """
    Login to Garmin Connect.
    
    If email/password not provided, uses environment variables.
    """
    try:
        garmin = get_garmin_service()
        
        # Try to use existing session first
        if garmin.check_session():
            return AuthStatus(
                authenticated=True,
                username=garmin.username
            )
        
        # Login with provided or env credentials
        email = request.email if request else None
        password = request.password if request else None
        
        logger.info(f"Attempting login for email: {email}")
        
        if garmin.login(email, password):
            return AuthStatus(
                authenticated=True,
                username=garmin.username
            )
        
        return AuthStatus(
            authenticated=False,
            error="Login failed. Check credentials."
        )
    except Exception as e:
        logger.exception(f"Login error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/logout", response_model=AuthStatus)
async def logout():
    """Logout and clear session tokens."""
    garmin = get_garmin_service()
    garmin.logout()
    
    return AuthStatus(authenticated=False)

