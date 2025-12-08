"""Garmin Connect API service using garminconnect library."""

import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Any

from garminconnect import Garmin

from app.config import settings, get_garth_tokens_path

logger = logging.getLogger(__name__)


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
        
        # If we loaded a username from the session file, consider it valid
        if self._username and self._display_name:
            logger.info(f"Session valid for user: {self._username}")
            return True
        
        return False
    
    def login(self, email: Optional[str] = None, password: Optional[str] = None) -> bool:
        """
        Login to Garmin Connect.
        
        Args:
            email: Garmin email (uses env var if not provided)
            password: Garmin password (uses env var if not provided)
            
        Returns:
            True if login successful
        """
        email = email or settings.garmin_email
        password = password or settings.garmin_password
        
        if not email or not password:
            logger.error("Missing Garmin credentials")
            return False
        
        try:
            self._client = Garmin(email, password)
            self._client.login()
            
            # Get the internal display name (UUID used for API calls)
            # This is different from get_full_name() which returns the user's name
            self._display_name = self._client.display_name
            
            self._username = email
            self._save_session()
            logger.info(f"Logged in as {self._username} (display_name: {self._display_name})")
            return True
        except Exception as e:
            logger.error(f"Login failed: {e}")
            return False
    
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
