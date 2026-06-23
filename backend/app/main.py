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
from app.mcp_server import mcp_app
from app.routers import auth, sync, activities, wellness, strength, chat, cycling

# Secret path segment that gates the MCP endpoint (see middleware.py). The MCP
# server is reachable at /<MCP_SECRET>/mcp. Falls back to /local/mcp in dev.
MCP_SECRET = os.environ.get("MCP_SECRET", "")
MCP_MOUNT_PREFIX = f"/{MCP_SECRET}" if MCP_SECRET else "/local"

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
    """Application lifespan manager.

    Nests the FastMCP app's lifespan so the MCP session manager initializes
    (required for the Streamable HTTP transport when mounted into FastAPI).
    """
    # Startup
    logger.info("Starting GarminSights API...")
    init_db()
    logger.info("Database initialized")

    async with mcp_app.lifespan(app):
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

# ── MCP server (Streamable HTTP) ─────────────────────────────────
# Mounted BEFORE the SPA catch-all so the mount wins route matching.
# Reachable at /<MCP_SECRET>/mcp; gated by the secret path in middleware.
app.mount(MCP_MOUNT_PREFIX, mcp_app)


_PWA_RESET_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GarminSights — Resetting</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
         background:#0d1528;color:#e2e8f0;min-height:100vh;display:flex;
         align-items:center;justify-content:center;padding:24px;text-align:center}
    .card{background:#1e293b;border-radius:12px;padding:32px;max-width:420px;width:100%}
    h1{font-size:1.25rem;margin-bottom:12px;color:#f1f5f9}
    p{color:#94a3b8;font-size:.9rem;line-height:1.5;margin-bottom:20px}
    a{color:#38bdf8;text-decoration:none;font-size:.875rem}
  </style>
</head>
<body>
  <div class="card">
    <h1>Resetting GarminSights…</h1>
    <p>Clearing cached data and service worker. You'll be redirected to the app automatically.</p>
    <a href="/">Go to app &rarr;</a>
  </div>
  <script>
    (async function(){
      try{
        if('serviceWorker' in navigator){
          var r=await navigator.serviceWorker.getRegistrations();
          await Promise.all(r.map(function(x){return x.unregister()}));
        }
        if('caches' in window){
          var k=await caches.keys();
          await Promise.all(k.map(function(c){return caches.delete(c)}));
        }
      }catch(_){}
      window.location.replace('/');
    })();
  </script>
</body>
</html>"""


@app.get("/api/pwa-reset")
async def pwa_reset():
    """Unregisters the service worker and clears all caches, then redirects to /.

    Navigating here bypasses the service worker's cache (it never intercepts
    /api/* paths) and is safe to use whenever the app appears stuck. Useful
    when a stale service worker is caching a broken build.
    """
    from fastapi.responses import HTMLResponse
    return HTMLResponse(
        content=_PWA_RESET_HTML,
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
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
    # The web manifest must also be no-cached: Chrome reads it to decide
    # whether the site is installable, and a stale manifest sitting in the
    # browser HTTP cache (e.g. from before id/icons were fixed) will keep
    # the install option hidden even after the server has the new version.
    _NO_CACHE_FILES = {"sw.js", "registerSW.js", "index.html", "manifest.webmanifest"}

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
