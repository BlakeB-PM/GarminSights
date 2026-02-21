"""Application configuration loaded from environment variables."""

from pathlib import Path
from pydantic import field_validator
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

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: object) -> list[str]:
        # pydantic-settings v2 passes the raw env-var string here before its
        # own type coercion runs.  Without this validator, pydantic would try
        # json.loads() on the value; if that fails it iterates the string
        # character-by-character, producing ['h','t','t','p','s',...].
        if isinstance(v, str):
            origins = [origin.strip() for origin in v.split(",") if origin.strip()]
        else:
            # Already a list (JSON-parsed env var or the field default).
            origins = list(v)  # type: ignore[arg-type]

        # The CORS spec forbids Access-Control-Allow-Origin: * combined with
        # Access-Control-Allow-Credentials: true — browsers will reject the
        # response.  Since allow_credentials=True is hardcoded in main.py,
        # using '*' here would silently break every cross-origin API call.
        if "*" in origins:
            raise ValueError(
                "CORS_ORIGINS cannot contain '*' when allow_credentials=True. "
                "List the exact frontend origin(s) instead, e.g. "
                "CORS_ORIGINS=https://app.example.com"
            )

        return origins

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

