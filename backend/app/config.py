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
    
    # CORS
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    
    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()


def get_database_path() -> Path:
    """Get the absolute path to the database file."""
    return Path(settings.database_path).resolve()


def get_garth_tokens_path() -> Path:
    """Get the absolute path to the garth tokens directory."""
    path = Path(settings.garth_tokens_path).resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path

