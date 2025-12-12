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
        from app.config import settings
        
        # Extract credentials from request (handle both None request and None fields)
        email = None
        password = None
        if request:
            email = request.email if request.email else None
            password = request.password if request.password else None
        
        logger.info(f"Login request received - email provided: {bool(email)}, password provided: {bool(password)}, request object: {request is not None}")
        
        # Use env credentials if request credentials not provided
        if not email:
            email = settings.garmin_email
        if not password:
            password = settings.garmin_password
        
        # Check if we have credentials (either from request or env)
        if not email or not password:
            logger.warning("No credentials available - neither from request nor env")
            return AuthStatus(
                authenticated=False,
                error="No credentials provided. Please enter email/password or set GARMIN_EMAIL and GARMIN_PASSWORD in .env file."
            )
        
        logger.info(f"Attempting login for email: {email}")
        
        if garmin.login(email, password):
            return AuthStatus(
                authenticated=True,
                username=garmin.username
            )
        
        logger.warning(f"Login failed for email: {email}")
        return AuthStatus(
            authenticated=False,
            error="Login failed. Check your email and password, or verify your Garmin account credentials."
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

