"""Shared plumbing for the Calibre and Suwayomi adapters."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

log = logging.getLogger("inkbridge.adapters")


class AdapterError(RuntimeError):
    """A back end could not be reached or answered with something unusable."""

    def __init__(self, source: str, message: str, *, status: int | None = None) -> None:
        super().__init__(f"{source}: {message}")
        self.source = source
        self.message = message
        self.status = status


class BaseAdapter:
    """Thin async HTTP helper with a shared client, retries and error mapping."""

    source = "base"

    def __init__(self, base_url: str, *, timeout: float = 30.0,
                 auth: httpx.Auth | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._auth = auth
        self._client: httpx.AsyncClient | None = None
        self._lock = asyncio.Lock()

    async def client(self) -> httpx.AsyncClient:
        if self._client is None:
            async with self._lock:
                if self._client is None:
                    self._client = httpx.AsyncClient(
                        base_url=self.base_url,
                        timeout=self._timeout,
                        auth=self._auth,
                        follow_redirects=True,
                        headers={"User-Agent": "InkBridge/1.0"},
                    )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def request(self, method: str, path: str, *, retries: int = 2,
                      **kwargs: Any) -> httpx.Response:
        client = await self.client()
        last: Exception | None = None
        for attempt in range(retries + 1):
            try:
                response = await client.request(method, path, **kwargs)
            except httpx.HTTPError as exc:  # network-level failure, worth retrying
                last = exc
                if attempt == retries:
                    break
                await asyncio.sleep(0.4 * (attempt + 1))
                continue
            if response.status_code >= 500 and attempt < retries:
                await asyncio.sleep(0.4 * (attempt + 1))
                continue
            if response.status_code >= 400:
                raise AdapterError(
                    self.source,
                    f"{method} {path} -> HTTP {response.status_code}",
                    status=response.status_code,
                )
            return response
        raise AdapterError(self.source, f"{method} {path} -> {last}")

    async def get_json(self, path: str, **kwargs: Any) -> Any:
        response = await self.request("GET", path, **kwargs)
        try:
            return response.json()
        except ValueError as exc:
            raise AdapterError(self.source, f"risposta non JSON da {path}: {exc}") from exc

    async def ping(self) -> tuple[bool, str]:
        """Return ``(available, detail)`` — never raises, used by /health."""
        raise NotImplementedError
