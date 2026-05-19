"""FastAPI application entry point for GarminSights."""

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db
from app.middleware import APIKeyAuthMiddleware, SecurityHeadersMiddleware
from app.routers import auth, sync, activities, wellness, strength, chat, cycling
from app.services.cf_access import CFAccessError, validate_access_jwt

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Detect environment
IS_PRODUCTION = os.environ.get("ENV", "development") == "production"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    logger.info("Starting GarminSights API...")
    init_db()
    logger.info("Database initialized")

    yield

    # Shutdown
    logger.info("Shutting down GarminSights API...")


# Create FastAPI app — disable interactive docs in production
app = FastAPI(
    title="GarminSights API",
    description="Personal fitness analytics powered by Garmin Connect data",
    version="2.0.0",
    lifespan=lifespan,
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
)

# ── Middleware (outermost first) ─────────────────────────────────
# Security headers on every response
app.add_middleware(SecurityHeadersMiddleware)

# CORS — must come before auth so preflight requests work
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Single-user API key authentication (no-op when APP_SECRET_KEY unset)
app.add_middleware(APIKeyAuthMiddleware)

# ── Routers ──────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(sync.router)
app.include_router(activities.router)
app.include_router(wellness.router)
app.include_router(strength.router)
app.include_router(chat.router)
app.include_router(cycling.router)


# ── MCP endpoint (read-only, Cloudflare-Access-gated) ────────────
# The /mcp endpoint is mounted only when Cloudflare Access is configured.
# Cloudflare Access handles OAuth at the edge via Managed OAuth and attaches a
# signed JWT to the request as Cf-Access-Jwt-Assertion. The gate below verifies
# that JWT before the request reaches the MCP ASGI app, which closes the
# origin-bypass hole (someone hitting the underlying Fly hostname directly).
import json as _json


class _CFAccessMCPGate:
    """Validate Cf-Access-Jwt-Assertion before forwarding to the MCP app."""

    def __init__(self, inner_app):
        self.inner = inner_app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.inner(scope, receive, send)
            return

        headers = {k.decode("latin-1").lower(): v.decode("latin-1")
                   for k, v in scope.get("headers", [])}
        token = headers.get("cf-access-jwt-assertion", "")
        try:
            validate_access_jwt(token)
        except CFAccessError as exc:
            logger.warning("MCP request rejected: %s", exc)
            await send({
                "type": "http.response.start",
                "status": 401,
                "headers": [(b"content-type", b"application/json")],
            })
            await send({
                "type": "http.response.body",
                "body": _json.dumps({"detail": str(exc)}).encode(),
            })
            return

        await self.inner(scope, receive, send)


if settings.cf_access_team_domain and settings.cf_access_aud:
    from app.mcp_server import mcp_asgi_app
    app.mount("/mcp", _CFAccessMCPGate(mcp_asgi_app))
    logger.info("MCP server mounted at /mcp (Cloudflare Access gate enabled)")
elif not IS_PRODUCTION:
    # Local development: mount /mcp without auth so the server can be exercised
    # with the MCP inspector or a local client. Refuses to do this in production.
    from app.mcp_server import mcp_asgi_app
    app.mount("/mcp", mcp_asgi_app)
    logger.warning(
        "MCP server mounted at /mcp WITHOUT auth (development mode). "
        "Set CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD for production."
    )
else:
    logger.info(
        "MCP server not mounted: CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD not set"
    )


@app.get("/api/health")
async def health_check():
    """Detailed health check."""
    from app.database import execute_query

    try:
        result = execute_query("SELECT COUNT(*) as count FROM activities")
        db_status = "connected"
        activity_count = result[0]["count"] if result else 0
    except Exception:
        db_status = "error"
        activity_count = 0

    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "database": db_status,
        "activity_count": activity_count
    }


# ── Static frontend (production only) ───────────────────────────
# When running in production the built frontend is served from /static.
# The SPA catch-all is handled by mounting the static directory and
# returning index.html for non-API routes.
_static_dir = Path(__file__).resolve().parent.parent / "static"
if _static_dir.is_dir():
    from fastapi.responses import FileResponse

    # Serve static assets (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=_static_dir / "assets"), name="assets")

    # Files that must never be cached so the browser always fetches the latest
    # version. The service worker file is the key one: if the browser caches
    # sw.js it will never detect that a new version has been deployed.
    _NO_CACHE_HEADERS = {"Cache-Control": "no-cache, no-store, must-revalidate"}
    _NO_CACHE_FILES = {"sw.js", "registerSW.js", "index.html"}

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """SPA catch-all — return index.html for non-API routes."""
        file_path = _static_dir / full_path
        if file_path.is_file():
            headers = _NO_CACHE_HEADERS if file_path.name in _NO_CACHE_FILES else None
            return FileResponse(file_path, headers=headers)
        return FileResponse(_static_dir / "index.html", headers=_NO_CACHE_HEADERS)
else:
    @app.get("/")
    async def root():
        """Health check endpoint (dev mode — no static build)."""
        return {
            "name": "GarminSights API",
            "version": "2.0.0",
            "status": "running"
        }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
