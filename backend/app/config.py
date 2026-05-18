"""Application configuration loaded from environment variables."""

import os
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

    # Cloudflare Access — used to validate the Cf-Access-Jwt-Assertion header on
    # the /mcp endpoint. When both values are empty the MCP endpoint is disabled.
    # cf_access_team_domain: your team's <team>.cloudflareaccess.com hostname.
    # cf_access_aud: the Application AUD tag for the GarminSights Access app.
    cf_access_team_domain: str = ""
    cf_access_aud: str = ""


    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: object) -> list[str]:
        # pydantic-settings v2 passes the raw env-var string here before its
        # own type coercion runs.  Without this validator, pydantic would try
        # json.loads() on the value; if that fails it iterates the string
        # character-by-character, producing ['h','t','t','p','s',...].
        if isinstance(v, str):
            import json as _json
            stripped = v.strip()
            # Handle JSON array format: '["https://..."]' (used in fly.toml)
            if stripped.startswith("["):
                try:
                    parsed = _json.loads(stripped)
                    if isinstance(parsed, list):
                        origins = [str(o).strip() for o in parsed if str(o).strip()]
                        # fall through to the wildcard check below
                    else:
                        origins = [stripped]
                except _json.JSONDecodeError:
                    origins = [origin.strip() for origin in v.split(",") if origin.strip()]
            else:
                # Comma-separated format: 'https://foo.com,https://bar.com'
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

# Clear garth token env vars AFTER Settings() - pydantic-settings may re-load .env and
# restore GARMINTOKENS. These vars cause FileNotFoundError when token files don't exist
# (first login). GarminSights manages tokens via garth_tokens_path instead.
for _var in ("GARTH_HOME", "GARTH_TOKEN", "GARMINTOKENS"):
    os.environ.pop(_var, None)


def get_database_path() -> Path:
    """Get the absolute path to the database file."""
    return Path(settings.database_path).resolve()


def get_garth_tokens_path() -> Path:
    """Get the absolute path to the garth tokens directory."""
    path = Path(settings.garth_tokens_path).resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path
