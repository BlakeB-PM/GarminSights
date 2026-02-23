"""Garmin Connect API service using garminconnect library."""

import json
import logging
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Any

from garminconnect import Garmin

from app.config import settings, get_garth_tokens_path

logger = logging.getLogger(__name__)


def _patch_garth_mfa_title_check():
    """Patch garth to recognize more MFA page titles. Garmin may use titles that don't contain 'MFA'."""
    try:
        import garth.sso as sso_mod

        _original_get_title = sso_mod.get_title

        def _patched_get_title(html: str) -> str:
            title = _original_get_title(html)
            # If title doesn't contain MFA but page has MFA form, treat as MFA page
            title_lower = title.lower()
            mfa_in_title = "mfa" in title_lower
            mfa_in_page = "mfa-code" in html.lower() or "setupentermfacode" in html.lower()
            if not mfa_in_title and mfa_in_page:
                logger.debug("Garth MFA patch: page has MFA form, treating as MFA page (title=%s)", title[:50])
                return "MFA"  # Make the existing "MFA" in title check pass
            return title

        sso_mod.get_title = _patched_get_title
        logger.debug("Applied garth MFA title patch")
    except Exception as e:
        logger.warning("Could not patch garth MFA detection: %s", e)


_patch_garth_mfa_title_check()

# In-memory store for pending MFA sessions (mfa_token -> session data)
# Sessions expire after 5 minutes
MFA_SESSION_TTL_SECONDS = 300
_mfa_sessions: dict[str, dict] = {}


class GarminService:
    """Service for interacting with Garmin Connect API via garminconnect."""
    
    def __init__(self):
        """Initialize the Garmin service."""
        self._client: Optional[Garmin] = None
        self._username: Optional[str] = None
        self._display_name: Optional[str] = None
        self._tokens_file = get_garth_tokens_path() / "session.json"
    
    def _save_session(self) -> None:
        """Save the current session tokens to disk."""
        try:
            self._tokens_file.parent.mkdir(parents=True, exist_ok=True)
            # Save tokens, username, and display name together
            session_data = {
                "garth_home": str(get_garth_tokens_path()),
                "username": self._username,
                "display_name": self._display_name
            }
            with open(self._tokens_file, "w", encoding="utf-8") as f:
                json.dump(session_data, f)
            
            # Also save garth tokens via garminconnect
            if self._client:
                self._client.garth.dump(str(get_garth_tokens_path()))
            
            logger.info(f"Session saved to {self._tokens_file}")
        except Exception as e:
            logger.error(f"Failed to save session: {e}")
    
    def _load_session(self) -> bool:
        """Load session tokens from disk."""
        if not self._tokens_file.exists():
            logger.info("No saved session found")
            return False
        
        try:
            with open(self._tokens_file, "r", encoding="utf-8") as f:
                session_data = json.load(f)
            
            self._username = session_data.get("username")
            self._display_name = session_data.get("display_name")
            
            # Initialize client and load garth tokens
            self._client = Garmin()
            self._client.garth.load(str(get_garth_tokens_path()))
            
            # Set the display name on the client for API calls that need it
            if self._display_name:
                self._client.display_name = self._display_name
            
            logger.info(f"Session loaded from disk (username: {self._username}, display_name: {self._display_name})")
            return True
        except Exception as e:
            logger.error(f"Failed to load session: {e}")
            return False
    
    def check_session(self) -> bool:
        """Check if we have a valid session."""
        if not self._load_session():
            return False
        
        # If we loaded a username from the session file, verify client is actually working
        if self._username and self._display_name and self._client:
            # Try a simple API call to verify the session is still valid
            try:
                # Quick test - try to get full name (lightweight call that requires auth)
                self._client.get_full_name()
                logger.info(f"Session valid for user: {self._username}")
                return True
            except Exception as e:
                logger.warning(f"Session check failed: {e}. Session may be expired.")
                return False
        
        return False
    
    def login(
        self,
        email: Optional[str] = None,
        password: Optional[str] = None,
        mfa_code: Optional[str] = None,
        mfa_token: Optional[str] = None,
        mfa_code_upfront: Optional[str] = None,
    ) -> tuple[bool, Optional[str], Optional[str]]:
        """
        Login to Garmin Connect.
        
        Supports two-step MFA flow:
        1. First call with email/password: returns (False, mfa_token, None) if MFA required
        2. Second call with mfa_code/mfa_token: completes login
        
        Args:
            email: Garmin email (uses env var if not provided)
            password: Garmin password (uses env var if not provided)
            mfa_code: MFA code from email/app (for second step)
            mfa_token: Token from first step when MFA was required
            
        Returns:
            Tuple of (success, mfa_token_if_needed, error_message)
        """
        # Step 2: Complete MFA login
        if mfa_code and mfa_token:
            return self._complete_mfa_login(mfa_token, mfa_code)
        
        # Step 1: Initial login (may require MFA)
        email = email or settings.garmin_email
        password = password or settings.garmin_password
        
        if not email or not password:
            logger.error("Missing Garmin credentials")
            return False, None, "Missing email or password"
        
        try:
            # When user provides mfa_code upfront (single-step retry), use prompt_mfa
            # Otherwise use return_on_mfa for two-step flow
            if mfa_code_upfront and mfa_code_upfront.strip():
                code = mfa_code_upfront.strip()
                client = Garmin(
                    email,
                    password,
                    return_on_mfa=False,
                    prompt_mfa=lambda: code,
                )
            else:
                client = Garmin(email, password, return_on_mfa=True)
            token1, token2 = client.login(tokenstore=str(get_garth_tokens_path()))
            
            # Check if MFA is required
            if token1 == "needs_mfa":
                client_state = token2
                mfa_token_id = str(uuid.uuid4())
                _mfa_sessions[mfa_token_id] = {
                    "garmin_client": client,
                    "client_state": client_state,
                    "email": email,
                    "created_at": time.time(),
                }
                logger.info("MFA required - returning mfa_token for user to complete")
                return False, mfa_token_id, None
            
            # Login succeeded
            self._client = client
            self._display_name = self._client.display_name
            self._username = email
            self._save_session()
            logger.info(f"Logged in as {self._username} (display_name: {self._display_name})")
            return True, None, None
        except Exception as e:
            logger.error(f"Login failed: {e}")
            return False, None, str(e)
    
    def _complete_mfa_login(self, mfa_token: str, mfa_code: str) -> tuple[bool, Optional[str], Optional[str]]:
        """Complete login after user provides MFA code."""
        # Clean expired sessions first
        now = time.time()
        expired = [k for k, v in _mfa_sessions.items() if now - v["created_at"] > MFA_SESSION_TTL_SECONDS]
        for k in expired:
            del _mfa_sessions[k]
        
        if mfa_token not in _mfa_sessions:
            return False, None, "MFA session expired or invalid. Please try logging in again."
        
        session = _mfa_sessions.pop(mfa_token)
        client = session["garmin_client"]
        client_state = session["client_state"]
        email = session["email"]
        
        try:
            client.resume_login(client_state, mfa_code.strip())
            self._client = client
            self._display_name = self._client.display_name
            self._username = email
            self._save_session()
            logger.info(f"Logged in as {self._username} after MFA (display_name: {self._display_name})")
            return True, None, None
        except Exception as e:
            logger.error(f"MFA login failed: {e}")
            return False, None, f"MFA verification failed: {e}"
    
    def logout(self) -> None:
        """Clear stored session tokens."""
        if self._tokens_file.exists():
            self._tokens_file.unlink()
        # Also clear garth tokens
        garth_dir = get_garth_tokens_path()
        for f in garth_dir.glob("*"):
            try:
                f.unlink()
            except Exception:
                pass
        self._username = None
        self._display_name = None
        self._client = None
        logger.info("Logged out and cleared session")
    
    @property
    def username(self) -> Optional[str]:
        """Get the current username."""
        return self._username
    
    def fetch_activities(
        self,
        limit: int = 50,
        start: int = 0
    ) -> list[dict]:
        """
        Fetch list of activities.
        
        Args:
            limit: Maximum number of activities to fetch
            start: Offset for pagination
            
        Returns:
            List of activity summaries
        """
        if not self._client:
            logger.error("Not logged in")
            return []
        
        try:
            return self._client.get_activities(start, limit) or []
        except Exception as e:
            logger.error(f"Failed to fetch activities: {e}")
            return []
    
    def fetch_activity_details(self, activity_id: str) -> Optional[dict]:
        """
        Fetch detailed activity data (Deep Fetch).
        
        This is critical for strength training activities to get
        sets, reps, weight, and exercise names.
        
        Args:
            activity_id: Garmin activity ID
            
        Returns:
            Detailed activity data including exercise sets
        """
        if not self._client:
            logger.error("Not logged in")
            return None
        
        try:
            return self._client.get_activity(activity_id)
        except Exception as e:
            logger.error(f"Failed to fetch activity details: {e}")
            return None
    
    def fetch_exercise_sets(self, activity_id: str) -> Optional[dict]:
        """
        Fetch exercise sets for a strength training activity.
        
        This returns detailed set data including exercises, reps, and weights.
        
        Args:
            activity_id: Garmin activity ID
            
        Returns:
            Exercise sets data with sets, reps, weights, and exercise names
        """
        if not self._client:
            logger.error("Not logged in")
            return None
        
        try:
            return self._client.get_activity_exercise_sets(activity_id)
        except Exception as e:
            logger.error(f"Failed to fetch exercise sets for {activity_id}: {e}")
            return None
    
    def fetch_sleep(self, date_str: str) -> Optional[dict]:
        """
        Fetch sleep data for a specific date.
        
        Args:
            date_str: Date in YYYY-MM-DD format
            
        Returns:
            Sleep data for the date
        """
        if not self._client:
            logger.error("Not logged in")
            return None
        
        try:
            return self._client.get_sleep_data(date_str)
        except Exception as e:
            logger.error(f"Failed to fetch sleep data for {date_str}: {e}")
            return None
    
    def fetch_daily_summary(self, date_str: str) -> Optional[dict]:
        """
        Fetch daily summary (steps, body battery, stress).
        
        Args:
            date_str: Date in YYYY-MM-DD format
            
        Returns:
            Daily summary data
        """
        if not self._client:
            logger.error("Not logged in")
            return None
        
        try:
            return self._client.get_stats(date_str)
        except Exception as e:
            logger.error(f"Failed to fetch daily summary for {date_str}: {e}")
            return None


# Singleton instance
_garmin_service: Optional[GarminService] = None


def get_garmin_service() -> GarminService:
    """Get or create the Garmin service singleton."""
    global _garmin_service
    if _garmin_service is None:
        _garmin_service = GarminService()
    return _garmin_service
