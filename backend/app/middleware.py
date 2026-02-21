"""Security middleware for production deployment."""

import os
import secrets
import logging
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

# Paths that don't require authentication
PUBLIC_PATHS = {"/", "/api/health"}


class APIKeyAuthMiddleware(BaseHTTPMiddleware):
    """
    Simple API-key authentication for single-user deployment.

    Set the APP_SECRET_KEY environment variable to a long random string.
    Clients must pass it as either:
      - Header:  Authorization: Bearer <key>
      - Query:   ?token=<key>

    When APP_SECRET_KEY is empty/unset the middleware is a no-op so that
    local development continues to work without friction.
    """

    async def dispatch(self, request: Request, call_next):
        secret = os.environ.get("APP_SECRET_KEY", "")

        # Skip auth when no key is configured (local dev)
        if not secret:
            return await call_next(request)

        # Allow CORS preflight through
        if request.method == "OPTIONS":
            return await call_next(request)

        # Allow public paths
        if request.url.path in PUBLIC_PATHS:
            return await call_next(request)

        # Check Authorization header
        auth_header = request.headers.get("Authorization", "")
        token = None
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

        # Fallback to query parameter
        if not token:
            token = request.query_params.get("token")

        if not token or not secrets.compare_digest(token, secret):
            return JSONResponse(
                status_code=401,
                content={"detail": "Unauthorized"},
            )

        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add standard security headers to every response."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        # HSTS is set by the reverse proxy / Cloud Run, but belt-and-suspenders:
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = (
                "max-age=63072000; includeSubDomains; preload"
            )
        return response
