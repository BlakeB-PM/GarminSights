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
    
    For accounts with MFA enabled:
    1. First request with email/password returns needs_mfa=True and mfa_token
    2. Second request with mfa_code and mfa_token completes login
    """
    try:
        garmin = get_garmin_service()
        
        # Try to use existing session first (skip if completing MFA)
        mfa_code = request.mfa_code if request and request.mfa_code else None
        mfa_token = request.mfa_token if request and request.mfa_token else None
        if not (mfa_code and mfa_token) and garmin.check_session():
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
        
        # MFA step 2: mfa_code + mfa_token from two-step flow
        if mfa_code and mfa_token:
            success, _, error = garmin.login(mfa_code=mfa_code, mfa_token=mfa_token)
            if success:
                return AuthStatus(authenticated=True, username=garmin.username)
            return AuthStatus(
                authenticated=False,
                error=error or "MFA verification failed."
            )

        # Single-step MFA: user provides email, password, mfa_code together (e.g. retry with code)
        if mfa_code and (email or settings.garmin_email) and (password or settings.garmin_password):
            success, _, error = garmin.login(
                email=email or settings.garmin_email,
                password=password or settings.garmin_password,
                mfa_code_upfront=mfa_code,
            )
            if success:
                return AuthStatus(authenticated=True, username=garmin.username)
            return AuthStatus(
                authenticated=False,
                error=error or "Login with verification code failed."
            )
        
        logger.info("Login request received - credentials %s", "provided" if email else "from env")
        
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
        
        logger.info("Attempting Garmin Connect login")
        
        success, returned_mfa_token, error = garmin.login(email, password)
        
        if success:
            return AuthStatus(authenticated=True, username=garmin.username)
        
        # MFA required - return token for second step
        if returned_mfa_token:
            return AuthStatus(
                authenticated=False,
                needs_mfa=True,
                mfa_token=returned_mfa_token,
                error="Enter the verification code sent to your email."
            )
        
        logger.warning("Login failed: %s", error)
        return AuthStatus(
            authenticated=False,
            error=error or "Login failed. Check your email and password, or verify your Garmin account credentials."
        )
    except Exception as e:
        logger.exception("Login error: %s", e)
        raise HTTPException(status_code=500, detail="An internal error occurred during login.")


@router.post("/logout", response_model=AuthStatus)
async def logout():
    """Logout and clear session tokens."""
    garmin = get_garmin_service()
    garmin.logout()
    
    return AuthStatus(authenticated=False)

