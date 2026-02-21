"""Application configuration loaded from environment variables."""

import os
from pathlib import Path
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# Load .env file
load_dotenv()


class Settings(BaseSettings):
    """Application settings."""

    # Garmin Connect
    garmin_email: str = ""
    garmin_password: str = ""

    # Database
    database_path: str = "./fitness.db"

    # Garth tokens
    garth_tokens_path: str = "./.garth_tokens"

    # Anthropic
    anthropic_api_key: str = ""

    # CORS - set via CORS_ORIGINS env variable as a comma-separated list of origins.
    # e.g. CORS_ORIGINS=https://app.example.com,https://www.example.com
    # Defaults to localhost for local development.
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    class Config:
        env_file = ".env"
        extra = "ignore"


def _parse_cors_origins() -> list[str]:
    """Read CORS_ORIGINS from the environment and split by comma."""
    raw = os.environ.get("CORS_ORIGINS", "")
    if raw:
        return [origin.strip() for origin in raw.split(",") if origin.strip()]
    return []


settings = Settings()

# Merge any comma-separated CORS_ORIGINS from the environment into the list.
_extra_origins = _parse_cors_origins()
if _extra_origins:
    combined = list(dict.fromkeys(settings.cors_origins + _extra_origins))
    settings.cors_origins = combined


def get_database_path() -> Path:
    """Get the absolute path to the database file."""
    return Path(settings.database_path).resolve()


def get_garth_tokens_path() -> Path:
    """Get the absolute path to the garth tokens directory."""
    path = Path(settings.garth_tokens_path).resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path
