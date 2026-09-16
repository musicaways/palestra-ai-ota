"""Adapter for calibre's own content server (``calibre-server``).

Only the JSON endpoints are used — the OPDS feed is not rich enough to build a
cover grid from, and ``/ajax`` gives us formats, series and tags in one shot.

Endpoints in play (calibre 4 and later):

``GET  /ajax/search``                                    ids matching a query
``GET  /ajax/books``                                     metadata for those ids
``GET  /get/<fmt>/<book_id>/<library_id>``               the file itself
``GET  /get/thumb/<book_id>/<library_id>?sz=WxH``        cover thumbnail
``GET  /book-get-last-read-position/<library>/<which>``  positions, ``which`` is
                                                         ``book_id:fmt`` items
``POST /book-set-last-read-position/<library>/<id>/<fmt>``
"""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import quote

import httpx

from ..models import Item, Kind
from .base import AdapterError, BaseAdapter

log = logging.getLogger("inkbridge.calibre")

UID_PREFIX = "calibre"


def make_uid(library_id: str, book_id: int | str) -> str:
    return f"{UID_PREFIX}:{library_id}:{book_id}"


def parse_uid(uid: str) -> tuple[str, int]:
    parts = uid.split(":")
    if len(parts) != 3 or parts[0] != UID_PREFIX:
        raise ValueError(f"UID Calibre non valido: {uid}")
    return parts[1], int(parts[2])


class CalibreAdapter(BaseAdapter):
    source = "calibre"

    def __init__(self, url: str, *, username: str = "", password: str = "",
                 library: str = "", auth_mode: str = "auto", timeout: float = 30.0,
                 formats: list[str] | None = None, write_positions: bool = True) -> None:
        auth: httpx.Auth | None = None
        if username:
            auth = (httpx.BasicAuth(username, password) if auth_mode == "basic"
                    else httpx.DigestAuth(username, password))
        super().__init__(url, timeout=timeout, auth=auth)
        self._username = username
        self._password = password
        self._auth_mode = auth_mode
        self._library = library
        self._library_names: dict[str, str] = {}
        self.formats = [f.lower() for f in (formats or ["kepub", "epub", "cbz", "pdf"])]
        self.write_positions = write_positions

    # -- library ------------------------------------------------------------

    async def library_id(self) -> str:
        """The library we operate on, resolved once from the server."""
        if self._library:
            return self._library
        data = await self.get_json("/ajax/library-info")
        self._library = data.get("default_library") or next(iter(data.get("library_map", {})), "")
        self._library_names = dict(data.get("library_map", {}))
        if not self._library:
            raise AdapterError(self.source, "nessuna libreria esposta da calibre-server")
        return self._library

    async def libraries(self) -> dict[str, str]:
        if not self._library_names:
            data = await self.get_json("/ajax/library-info")
            self._library_names = dict(data.get("library_map", {}))
        return self._library_names

    async def ping(self) -> tuple[bool, str]:
        try:
            library = await self.library_id()
        except AdapterError as exc:
            # A digest server answers 401 to our basic probe (and vice versa):
            # flip the scheme once before giving up.
            if exc.status == 401 and self._username and self._auth_mode == "auto":
                await self._flip_auth()
                try:
                    library = await self.library_id()
                except AdapterError as exc2:
                    return False, exc2.message
            else:
                return False, exc.message
        return True, f"libreria «{library}»"

    async def _flip_auth(self) -> None:
        await self.aclose()
        current = self._auth
        if isinstance(current, httpx.DigestAuth):
            self._auth = httpx.BasicAuth(self._username, self._password)
            self._auth_mode = "basic"
        else:
            self._auth = httpx.DigestAuth(self._username, self._password)
            self._auth_mode = "digest"
        log.info("calibre: passo all'autenticazione %s", self._auth_mode)

    # -- catalogue ----------------------------------------------------------

    async def search_ids(self, query: str = "", *, offset: int = 0, limit: int = 60,
                         sort: str = "timestamp",
                         sort_order: str = "desc") -> tuple[list[int], int]:
        library = await self.library_id()
        params = {
            "library_id": library,
            "num": limit,
            "offset": offset,
            "sort": sort,
            "sort_order": sort_order,
        }
        if query:
            params["query"] = query
        data = await self.get_json("/ajax/search", params=params)
        return [int(i) for i in data.get("book_ids", [])], int(data.get("total_num", 0))

    async def books(self, ids: list[int]) -> dict[int, dict[str, Any]]:
        if not ids:
            return {}
        library = await self.library_id()
        out: dict[int, dict[str, Any]] = {}
        # calibre chokes on very long query strings; 100 ids per call is safe.
        for start in range(0, len(ids), 100):
            chunk = ids[start:start + 100]
            data = await self.get_json(
                "/ajax/books",
                params={"ids": ",".join(str(i) for i in chunk), "library_id": library},
            )
            for key, value in (data or {}).items():
                if value:
                    out[int(key)] = value
        return out

    async def list_items(self, query: str = "", *, offset: int = 0, limit: int = 60,
                         sort: str = "timestamp",
                         sort_order: str = "desc") -> tuple[list[Item], int]:
        ids, total = await self.search_ids(query, offset=offset, limit=limit,
                                           sort=sort, sort_order=sort_order)
        metadata = await self.books(ids)
        library = await self.library_id()
        # search_ids already returns the requested order; keep it.
        items = [self.to_item(library, book_id, metadata[book_id])
                 for book_id in ids if book_id in metadata]
        return items, total

    async def item(self, uid: str) -> Item:
        library, book_id = parse_uid(uid)
        metadata = await self.books([book_id])
        if book_id not in metadata:
            raise AdapterError(self.source, f"libro {book_id} non trovato")
        return self.to_item(library, book_id, metadata[book_id])

    def to_item(self, library: str, book_id: int, meta: dict[str, Any]) -> Item:
        formats = [f.lower() for f in (meta.get("formats") or [])]
        size = None
        format_meta = meta.get("format_metadata") or {}
        best = self.best_format(formats)
        if best and best in format_meta:
            try:
                size = int(format_meta[best].get("size") or 0) or None
            except (TypeError, ValueError):
                size = None
        languages = meta.get("languages") or []
        return Item(
            uid=make_uid(library, book_id),
            kind=Kind.BOOK,
            source=self.source,
            title=meta.get("title") or f"#{book_id}",
            authors=list(meta.get("authors") or []),
            series=meta.get("series"),
            series_index=meta.get("series_index"),
            tags=list(meta.get("tags") or []),
            description=_strip_html(meta.get("comments")),
            language=languages[0] if languages else None,
            cover_url=f"/v1/library/items/{make_uid(library, book_id)}/cover",
            formats=formats,
            size=size,
        )

    def best_format(self, formats: list[str]) -> str | None:
        available = [f.lower() for f in formats]
        for preferred in self.formats:
            if preferred in available:
                return preferred
        return available[0] if available else None

    # -- files --------------------------------------------------------------

    def download_path(self, library: str, book_id: int, fmt: str) -> str:
        return f"/get/{fmt.upper()}/{book_id}/{quote(library, safe='')}"

    def cover_path(self, library: str, book_id: int, *, thumbnail: bool = True,
                   size: str = "400x600") -> str:
        library_q = quote(library, safe="")
        if thumbnail:
            return f"/get/thumb/{book_id}/{library_q}?sz={size}"
        return f"/get/cover/{book_id}/{library_q}"

    async def open_stream(self, path: str) -> tuple[httpx.Response, httpx.AsyncClient]:
        """Open a streaming GET; the caller must close the response."""
        client = await self.client()
        request = client.build_request("GET", path)
        response = await client.send(request, stream=True)
        if response.status_code >= 400:
            await response.aclose()
            raise AdapterError(self.source, f"GET {path} -> HTTP {response.status_code}",
                               status=response.status_code)
        return response, client

    # -- reading positions --------------------------------------------------

    async def get_positions(self, book_id: int, fmt: str) -> list[dict[str, Any]]:
        """Positions calibre knows for a book, newest first.

        The payload shape moved around between calibre releases (a bare list in
        some, a dict keyed by ``book_id:fmt`` in others), so normalise both.
        """
        library = await self.library_id()
        which = f"{book_id}:{fmt.upper()}"
        try:
            data = await self.get_json(
                f"/book-get-last-read-position/{quote(library, safe='')}/{quote(which, safe='')}"
            )
        except AdapterError as exc:
            if exc.status in (404, 405):  # calibre too old for the endpoint
                return []
            raise
        entries: list[dict[str, Any]] = []
        if isinstance(data, dict):
            for value in data.values():
                if isinstance(value, list):
                    entries.extend(x for x in value if isinstance(x, dict))
                elif isinstance(value, dict):
                    entries.append(value)
        elif isinstance(data, list):
            entries = [x for x in data if isinstance(x, dict)]
        entries.sort(key=lambda e: float(e.get("epoch") or 0), reverse=True)
        return entries

    async def set_position(self, book_id: int, fmt: str, *, pos_frac: float,
                           cfi: str | None, device: str) -> None:
        if not self.write_positions:
            return
        library = await self.library_id()
        payload = {
            "device": device or "inkbridge",
            "cfi": cfi or "",
            "pos_frac": max(0.0, min(1.0, float(pos_frac))),
        }
        await self.request(
            "POST",
            f"/book-set-last-read-position/{quote(library, safe='')}/{book_id}/{fmt.upper()}",
            json=payload,
        )


def _strip_html(value: str | None) -> str | None:
    """calibre comments are HTML; the device renders plain text."""
    if not value:
        return None
    import re
    text = re.sub(r"<br\s*/?>", "\n", value, flags=re.I)
    text = re.sub(r"</p\s*>", "\n\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = (text.replace("&nbsp;", " ").replace("&amp;", "&")
                .replace("&lt;", "<").replace("&gt;", ">").replace("&#39;", "'")
                .replace("&quot;", '"'))
    return re.sub(r"\n{3,}", "\n\n", text).strip() or None
