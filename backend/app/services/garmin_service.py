"""Garmin Connect API service using garminconnect library."""

import json
import logging
import os
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Any

# Config must load first - it clears GARTH_* env vars after load_dotenv
from app.config import settings, get_garth_tokens_path

# Patch os.getenv BEFORE garminconnect loads so GARMINTOKENS is never used.
# garminconnect does tokenstore = tokenstore or os.getenv("GARMINTOKENS") and
# tries to load from that path, causing FileNotFoundError when token files don't exist.
_original_getenv = os.getenv
def _patched_getenv(key, default=None):
    if key == "GARMINTOKENS":
        return default
    return _original_getenv(key, default)
os.getenv = _patched_getenv

from garminconnect import Garmin

logger = logging.getLogger(__name__)


class GarminAuthError(Exception):
    """Garmin rejected our stored session and a fresh login is required.

    Raised instead of returning an empty result so a dead token surfaces as
    "re-authenticate" rather than "you have no activities".
    """


def _login_url() -> str:
    """Best guess at where Blake can complete a Garmin login in the browser."""
    explicit = _original_getenv("APP_PUBLIC_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")
    for origin in settings.cors_origins:
        if origin.startswith("https://"):
            return origin.rstrip("/")
    return "the GarminSights web app"


def login_required_message() -> str:
    return (
        "Garmin Connect is not authenticated. Sign in to Garmin again at "
        f"{_login_url()}. The refreshed token is saved and reused for future syncs."
    )


def mfa_required_message() -> str:
    return (
        "Garmin is asking for a verification code, which cannot be entered from "
        f"here. Open {_login_url()}, sign in to Garmin, and enter the emailed code."
    )


def _is_auth_error(exc: BaseException) -> bool:
    """True when a garth/garminconnect exception is a 401/403 rejection.

    garth wraps requests' HTTPError inside GarthHTTPError.error, so check both
    levels before falling back to matching the message text.
    """
    for candidate in (getattr(exc, "error", None), exc):
        response = getattr(candidate, "response", None)
        status = getattr(response, "status_code", None)
        if status in (401, 403):
            return True
    text = str(exc).lower()
    return any(
        marker in text
        for marker in ("401 client error", "403 client error", "invalid_token", "unauthorized")
    )


def _patch_garth_load_handle_missing_files():
    """Patch garth.Client.load to clear GARMINTOKENS on FileNotFoundError before re-raising.
    Ensures our Garmin.login retry has a clean env when it retries with tokenstore=None.
    """
    try:
        import garth.http as garth_http

        _original_load = garth_http.Client.load

        def _patched_load(self, dir_path: str):
            try:
                return _original_load(self, dir_path)
            except FileNotFoundError as e:
                if "oauth1_token" in str(e) or "oauth2_token" in str(e):
                    os.environ.pop("GARMINTOKENS", None)
                    os.environ.pop("GARTH_HOME", None)
                raise

        garth_http.Client.load = _patched_load
        logger.info("Patched garth.Client.load to clear token env vars on FileNotFoundError")
    except Exception as e:
        logger.warning("Could not patch garth.Client.load: %s", e)


def _patch_garminconnect_handle_missing_tokens():
    """Patch Garmin.login to avoid FileNotFoundError when token files don't exist.
    
    garminconnect uses tokenstore = tokenstore or os.getenv("GARMINTOKENS"). If that
    path has no oauth1_token.json, garth.load() raises. We validate the path BEFORE
    the original runs: if it's a path and the files don't exist, we clear GARMINTOKENS
    and pass None so credential login runs instead.
    """
    _original_login = Garmin.login

    def _patched_login(self, tokenstore=None):
        # Only use tokenstore when BOTH oauth files exist at that path; otherwise force credential login
        resolved = tokenstore or _original_getenv("GARMINTOKENS")
        use_tokenstore = None
        if resolved and len(str(resolved)) < 512:
            p = Path(str(resolved).strip()).expanduser().resolve()
            if p.suffix == ".json":
                p = p.parent
            oauth1_exists = (p / "oauth1_token.json").exists()
            oauth2_exists = (p / "oauth2_token.json").exists()
            if oauth1_exists and oauth2_exists:
                use_tokenstore = str(p)
            else:
                logger.info("Token path missing oauth files, forcing credential login: %s", p)

        try:
            return _original_login(self, tokenstore=use_tokenstore)
        except FileNotFoundError as e:
            if "oauth1_token" in str(e) or "oauth2_token" in str(e):
                logger.info("Token files missing, retrying without tokenstore: %s", e)
                os.environ.pop("GARMINTOKENS", None)
                os.environ.pop("GARTH_HOME", None)
                return _original_login(self, tokenstore=None)  # use_tokenstore already None
            raise

    Garmin.login = _patched_login
    logger.info("Patched Garmin.login to handle missing token files")


_patch_garth_load_handle_missing_files()
_patch_garminconnect_handle_missing_tokens()


def _patch_garth_mfa_title_check():
    """Patch garth to recognize more MFA page titles. Garmin may use titles that don't contain 'MFA'."""
    try:
        import garth.sso as sso_mod

        _original_get_title = sso_mod.get_title

        # Substrings Garmin uses in MFA/verification page titles (don't contain "MFA")
        MFA_TITLE_SUBSTRINGS = ("garmin authentication application", "verification", "enter verification code")

        def _patched_get_title(html: str) -> str:
            title = _original_get_title(html)
            title_lower = title.lower()
            # If title matches known MFA page or page has MFA form, treat as MFA
            mfa_title = any(s in title_lower for s in MFA_TITLE_SUBSTRINGS) or "mfa" in title_lower
            mfa_in_page = (
                "mfa-code" in html.lower()
                or "setupentermfacode" in html.lower()
                or "loginentermfacode" in html.lower()
                or "verification code" in html.lower()
            )
            if mfa_title or mfa_in_page:
                if "mfa" not in title_lower:
                    logger.debug("Garth MFA patch: treating as MFA page (title=%s)", title[:60])
                return "MFA"
            return title

        sso_mod.get_title = _patched_get_title
        logger.info("Applied garth MFA title patch (handles 'GARMIN Authentication Application' and similar)")
    except Exception as e:
        logger.warning("Could not patch garth MFA detection: %s", e)


_patch_garth_mfa_title_check()

# In-memory store for pending MFA sessions (mfa_token -> session data)
# Sessions expire after 5 minutes
MFA_SESSION_TTL_SECONDS = 300
_mfa_sessions: dict[str, dict] = {}

# Garmin locks accounts that retry credential logins in a loop, so the headless
# fallback login gets at most one attempt per cooldown window per process.
CREDENTIAL_LOGIN_COOLDOWN_SECONDS = 300
_last_credential_login_attempt: float = 0.0


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
            tokens_path = get_garth_tokens_path()
            oauth1_exists = (tokens_path / "oauth1_token.json").exists()
            oauth2_exists = (tokens_path / "oauth2_token.json").exists()
            if not (oauth1_exists and oauth2_exists):
                logger.info("Session file exists but garth token files missing - re-login required")
                return False
            self._client = Garmin()
            try:
                self._client.garth.load(str(tokens_path))
            except FileNotFoundError as e:
                if "oauth1_token" in str(e) or "oauth2_token" in str(e):
                    logger.info("Token files missing during load, re-login required: %s", e)
                    self._client = None
                    return False
                raise
            
            # Set the display name on the client for API calls that need it
            if self._display_name:
                self._client.display_name = self._display_name
            
            logger.info(f"Session loaded from disk (username: {self._username}, display_name: {self._display_name})")
            return True
        except FileNotFoundError:
            logger.info("Token files not found - re-login required")
            return False
        except Exception as e:
            logger.error(f"Failed to load session: {e}")
            return False
    
    def check_session(self) -> bool:
        """Check if we have a valid session (token files present and loadable).

        Avoids a live Garmin API call so this stays fast; actual token validity
        is verified lazily when data-fetching endpoints are called.
        """
        if self._client is not None:
            return True
        return self._load_session()

    def _persist_tokens(self) -> None:
        """Write the client's current garth tokens back to the token directory."""
        if not self._client:
            return
        try:
            self._client.garth.dump(str(get_garth_tokens_path()))
        except Exception as e:
            logger.warning("Could not persist refreshed Garmin tokens: %s", e)

    def refresh_tokens_if_needed(self) -> None:
        """Exchange the long-lived OAuth1 token for a fresh OAuth2 token if expired.

        garth already does this lazily on the next API call, but doing it up
        front means a dead token raises GarminAuthError here instead of being
        swallowed by a fetch helper and reported as "no data". The refreshed
        token is written back to disk so the next cold start skips the exchange.
        """
        if not self._client:
            return

        garth = self._client.garth
        token = getattr(garth, "oauth2_token", None)
        if token is not None and not getattr(token, "expired", True):
            return

        try:
            garth.refresh_oauth2()
        except Exception as e:
            if _is_auth_error(e):
                raise GarminAuthError(login_required_message()) from e
            raise

        self._persist_tokens()
        logger.info("Refreshed Garmin OAuth2 token from the stored OAuth1 token")

    def ensure_client(self) -> tuple[bool, Optional[str]]:
        """Guarantee a usable Garmin client, rehydrating from disk when needed.

        The client only ever lives in memory, so every fresh process starts with
        `_client = None` even though valid tokens are sitting in the token
        directory. The REST routes happened to rehydrate as a side effect of
        their check_session() gate; the MCP tools called straight into
        SyncService and saw an unauthenticated service on any cold start (Fly
        machine waking from auto-stop, container redeploy, worker restart).
        Every caller that needs the Garmin API now goes through here instead of
        reading `_client` directly.

        Returns (ready, error_message).
        """
        if self._client is None and not self._load_session():
            return self._login_with_env_credentials()

        try:
            self.refresh_tokens_if_needed()
        except GarminAuthError as e:
            logger.warning("Stored Garmin tokens were rejected: %s", e)
            self._client = None
            return self._login_with_env_credentials()
        except Exception as e:
            # A network blip during the pre-emptive refresh shouldn't block the
            # sync — garth retries the exchange on the next API call anyway.
            logger.warning("Could not pre-refresh the Garmin token: %s", e)

        return True, None

    def _login_with_env_credentials(self) -> tuple[bool, Optional[str]]:
        """Fall back to a credential login from GARMIN_EMAIL / GARMIN_PASSWORD.

        MFA-protected accounts cannot finish this headlessly, so the caller gets
        an explicit "complete the login in the browser" message rather than a
        generic failure.
        """
        global _last_credential_login_attempt

        if not (settings.garmin_email and settings.garmin_password):
            return False, login_required_message()

        if time.time() - _last_credential_login_attempt < CREDENTIAL_LOGIN_COOLDOWN_SECONDS:
            logger.info("Skipping credential login, still inside the retry cooldown")
            return False, login_required_message()
        _last_credential_login_attempt = time.time()

        logger.info("No usable stored session, attempting a credential login")
        success, mfa_token, error = self.login()
        if success:
            return True, None
        if mfa_token:
            _mfa_sessions.pop(mfa_token, None)
            return False, mfa_required_message()
        return False, f"{login_required_message()} Garmin reported: {error}"
    
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
            # When token files don't exist, clear garth env vars so garth.Client doesn't try
            # to auto-resume on init, and garminconnect doesn't load from GARMINTOKENS
            tokens_path = get_garth_tokens_path()
            if not (tokens_path / "oauth1_token.json").exists():
                saved_home = os.environ.pop("GARTH_HOME", None)
                saved_token = os.environ.pop("GARTH_TOKEN", None)
                saved_garmin_tokens = os.environ.pop("GARMINTOKENS", None)
            else:
                saved_home = saved_token = saved_garmin_tokens = None

            # When user provides mfa_code upfront (single-step retry), use prompt_mfa
            # Otherwise use return_on_mfa for two-step flow
            try:
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
                # Only pass tokenstore when BOTH token files exist; otherwise garth.load() raises FileNotFoundError
                oauth1 = tokens_path / "oauth1_token.json"
                oauth2 = tokens_path / "oauth2_token.json"
                tokenstore = str(tokens_path) if (oauth1.exists() and oauth2.exists()) else None
                # When doing credential login, ensure GARMINTOKENS is unset so garminconnect
                # doesn't try to load from a path that may not have token files yet
                if tokenstore is None:
                    os.environ.pop("GARMINTOKENS", None)
                try:
                    token1, token2 = client.login(tokenstore=tokenstore)
                except FileNotFoundError as e:
                    # Token files missing (e.g. first login) - retry without tokenstore
                    os.environ.pop("GARMINTOKENS", None)
                    logger.info("Token load failed (%s), retrying with credentials only", e)
                    if mfa_code_upfront and mfa_code_upfront.strip():
                        code = mfa_code_upfront.strip()
                        client = Garmin(email, password, return_on_mfa=False, prompt_mfa=lambda: code)
                    else:
                        client = Garmin(email, password, return_on_mfa=True)
                    token1, token2 = client.login(tokenstore=None)
            finally:
                if saved_home is not None:
                    os.environ["GARTH_HOME"] = saved_home
                if saved_token is not None:
                    os.environ["GARTH_TOKEN"] = saved_token
                # Do NOT restore GARMINTOKENS - we want it cleared so credential login works
            
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
        ready, error = self.ensure_client()
        if not ready:
            raise GarminAuthError(error or login_required_message())
        
        try:
            return self._client.get_activities(start, limit) or []
        except Exception as e:
            if _is_auth_error(e):
                raise GarminAuthError(login_required_message()) from e
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
        ready, error = self.ensure_client()
        if not ready:
            raise GarminAuthError(error or login_required_message())
        
        try:
            return self._client.get_activity(activity_id)
        except Exception as e:
            if _is_auth_error(e):
                raise GarminAuthError(login_required_message()) from e
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
        ready, error = self.ensure_client()
        if not ready:
            raise GarminAuthError(error or login_required_message())
        
        try:
            return self._client.get_activity_exercise_sets(activity_id)
        except Exception as e:
            if _is_auth_error(e):
                raise GarminAuthError(login_required_message()) from e
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
        ready, error = self.ensure_client()
        if not ready:
            raise GarminAuthError(error or login_required_message())
        
        try:
            return self._client.get_sleep_data(date_str)
        except Exception as e:
            if _is_auth_error(e):
                raise GarminAuthError(login_required_message()) from e
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
        ready, error = self.ensure_client()
        if not ready:
            raise GarminAuthError(error or login_required_message())
        
        try:
            return self._client.get_stats(date_str)
        except Exception as e:
            if _is_auth_error(e):
                raise GarminAuthError(login_required_message()) from e
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
