"""Bearer-token authentication.

The token is shared, not per user: this guards a service that lives on a home
NAS and is spoken to by two or three devices.  What it buys is that a guest on
the same Wi-Fi cannot walk the library or rewrite reading positions.
"""

from __future__ import annotations

import hmac

from fastapi import HTTPException, Query, Request, status

from .config import Settings, get_settings


def _presented(request: Request, token_param: str | None) -> str:
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return (request.headers.get("x-inkbridge-token") or token_param or "").strip()


def settings_of(request: Request) -> Settings:
    """The settings the running app was built with, not a fresh read of the env."""
    return getattr(request.app.state, "settings", None) or get_settings()


async def require_token(
    request: Request,
    token: str | None = Query(default=None, include_in_schema=False),
) -> None:
    """Reject the request unless it carries the configured token.

    The query-string form exists for image widgets on the device that cannot
    set headers; it is accepted only when a token is configured at all.
    """
    expected = settings_of(request).token
    if not expected:
        return
    if not hmac.compare_digest(_presented(request, token), expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="token non valido",
            headers={"WWW-Authenticate": "Bearer"},
        )
