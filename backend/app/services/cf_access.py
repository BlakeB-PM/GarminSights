"""Validate the Cf-Access-Jwt-Assertion header that Cloudflare Access attaches
to every request reaching the origin.

The presence of a *valid* JWT proves the request passed through Cloudflare Access
(which in turn validated the OAuth access token issued by Managed OAuth). The
origin therefore does not need to know about MCP OAuth tokens directly — it only
needs to confirm Cloudflare signed off on the request.

This closes the bypass where someone discovers the underlying Fly hostname and
hits /mcp without going through Cloudflare.
"""

import logging
import time
from typing import Optional

import httpx
import jwt
from jwt import PyJWKClient

from app.config import settings

logger = logging.getLogger(__name__)


class CFAccessError(Exception):
    """Raised when a Cf-Access-Jwt-Assertion header is missing or invalid."""


_jwks_client: Optional[PyJWKClient] = None
_jwks_client_ts: float = 0.0
_JWKS_TTL_SECONDS = 3600  # refresh JWKS hourly


def _certs_url() -> str:
    return f"https://{settings.cf_access_team_domain}/cdn-cgi/access/certs"


def _issuer() -> str:
    return f"https://{settings.cf_access_team_domain}"


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client, _jwks_client_ts
    now = time.time()
    if _jwks_client is None or (now - _jwks_client_ts) > _JWKS_TTL_SECONDS:
        _jwks_client = PyJWKClient(_certs_url())
        _jwks_client_ts = now
    return _jwks_client


def validate_access_jwt(token: str) -> dict:
    """Verify a Cloudflare Access JWT and return its claims.

    Raises CFAccessError on any validation failure.
    """
    if not settings.cf_access_team_domain or not settings.cf_access_aud:
        raise CFAccessError("Cloudflare Access is not configured on the server")

    if not token:
        raise CFAccessError("Missing Cf-Access-Jwt-Assertion header")

    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            audience=settings.cf_access_aud,
            issuer=_issuer(),
        )
    except jwt.InvalidTokenError as exc:
        raise CFAccessError(f"Invalid Cloudflare Access JWT: {exc}") from exc
    except httpx.HTTPError as exc:
        raise CFAccessError(f"Could not fetch Cloudflare JWKS: {exc}") from exc

    return claims
