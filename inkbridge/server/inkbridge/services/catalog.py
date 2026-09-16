"""One catalogue over two very different back ends."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from ..adapters.base import AdapterError
from ..adapters.calibre import CalibreAdapter
from ..adapters.calibre import parse_uid as parse_calibre_uid
from ..adapters.suwayomi import SuwayomiAdapter
from ..adapters.suwayomi import parse_uid as parse_suwayomi_uid
from ..config import Settings
from ..db import Database
from ..models import Chapter, Item, ItemPage, Kind, Source

log = logging.getLogger("inkbridge.catalog")

CALIBRE = "calibre"
SUWAYOMI = "suwayomi"


class TTLCache:
    def __init__(self, ttl: float) -> None:
        self._ttl = ttl
        self._data: dict[Any, tuple[float, Any]] = {}

    def get(self, key: Any) -> Any | None:
        entry = self._data.get(key)
        if not entry:
            return None
        expires, value = entry
        if expires < time.monotonic():
            self._data.pop(key, None)
            return None
        return value

    def put(self, key: Any, value: Any) -> Any:
        self._data[key] = (time.monotonic() + self._ttl, value)
        return value

    def clear(self) -> None:
        self._data.clear()


class CatalogService:
    def __init__(self, settings: Settings, db: Database) -> None:
        self.settings = settings
        self.db = db
        self.calibre: CalibreAdapter | None = None
        self.suwayomi: SuwayomiAdapter | None = None
        if settings.calibre_enabled:
            self.calibre = CalibreAdapter(
                settings.calibre_url,
                username=settings.calibre_username,
                password=settings.calibre_password,
                library=settings.calibre_library,
                auth_mode=settings.calibre_auth_mode,
                timeout=settings.http_timeout,
                formats=settings.calibre_formats,
                write_positions=settings.calibre_write_positions,
            )
        if settings.suwayomi_enabled:
            self.suwayomi = SuwayomiAdapter(
                settings.suwayomi_url,
                username=settings.suwayomi_username,
                password=settings.suwayomi_password,
                timeout=settings.http_timeout,
                write_positions=settings.suwayomi_write_positions,
                read_threshold=settings.manga_read_threshold,
            )
        self._cache = TTLCache(settings.catalog_ttl)
        self._item_cache = TTLCache(settings.catalog_ttl)

    async def aclose(self) -> None:
        for adapter in (self.calibre, self.suwayomi):
            if adapter:
                await adapter.aclose()

    def invalidate(self) -> None:
        self._cache.clear()
        self._item_cache.clear()

    # -- sources ------------------------------------------------------------

    async def sources(self) -> list[Source]:
        out: list[Source] = []
        probes: list[tuple[str, str, Kind, Any]] = [
            (CALIBRE, "Calibre", Kind.BOOK, self.calibre),
            (SUWAYOMI, "Suwayomi", Kind.MANGA, self.suwayomi),
        ]
        results = await asyncio.gather(
            *[adapter.ping() if adapter else _unconfigured() for _, _, _, adapter in probes]
        )
        for (source_id, name, kind, adapter), (available, detail) in zip(probes, results,
                                                                          strict=True):
            out.append(Source(
                id=source_id, name=name, kind=kind,
                enabled=adapter is not None, available=available, detail=detail,
            ))
        return out

    def adapter_for(self, uid: str) -> CalibreAdapter | SuwayomiAdapter:
        if uid.startswith(CALIBRE + ":"):
            if not self.calibre:
                raise AdapterError(CALIBRE, "sorgente Calibre non configurata")
            return self.calibre
        if uid.startswith(SUWAYOMI + ":"):
            if not self.suwayomi:
                raise AdapterError(SUWAYOMI, "sorgente Suwayomi non configurata")
            return self.suwayomi
        raise AdapterError("catalog", f"UID sconosciuto: {uid}")

    # -- listing ------------------------------------------------------------

    async def list_items(self, *, source: str | None = None, query: str = "",
                         offset: int = 0, limit: int = 60, sort: str = "timestamp",
                         sort_order: str = "desc", with_progress: bool = True) -> ItemPage:
        key = (source, query, offset, limit, sort, sort_order)
        cached: ItemPage | None = self._cache.get(key)
        if cached is None:
            items, total = await self._fetch(source, query, offset, limit, sort, sort_order)
            for item in items:
                self._item_cache.put(item.uid, item)
            cached = self._cache.put(key, ItemPage(items=items, total=total,
                                                   offset=offset, limit=limit))
        page = cached.model_copy(deep=True)
        if with_progress:
            self.attach_progress(page.items)
        return page

    async def _fetch(self, source: str | None, query: str, offset: int, limit: int,
                     sort: str, sort_order: str) -> tuple[list[Item], int]:
        if source == CALIBRE or (source is None and not self.suwayomi):
            if not self.calibre:
                return [], 0
            return await self.calibre.list_items(query, offset=offset, limit=limit,
                                                 sort=sort, sort_order=sort_order)
        if source == SUWAYOMI or (source is None and not self.calibre):
            if not self.suwayomi:
                return [], 0
            return await self.suwayomi.list_items(query, offset=offset, limit=limit)
        # Both sources: used by search.  Each back end contributes a window of
        # the same size and the merged list is paginated locally, so the total
        # is exact while the ordering is "books first, then manga" by relevance
        # of each back end's own sort.
        window = offset + limit
        results = await asyncio.gather(
            self.calibre.list_items(query, offset=0, limit=window, sort=sort,
                                    sort_order=sort_order) if self.calibre else _empty(),
            self.suwayomi.list_items(query, offset=0, limit=window) if self.suwayomi else _empty(),
            return_exceptions=True,
        )
        items: list[Item] = []
        total = 0
        for result in results:
            if isinstance(result, BaseException):
                log.warning("sorgente non raggiungibile durante la ricerca: %s", result)
                continue
            part, part_total = result
            items.extend(part)
            total += part_total
        return items[offset:offset + limit], total

    async def item(self, uid: str, *, with_progress: bool = True) -> Item:
        item: Item | None = self._item_cache.get(uid)
        if item is None:
            adapter = self.adapter_for(uid)
            item = self._item_cache.put(uid, await adapter.item(uid))
        item = item.model_copy(deep=True)
        if with_progress:
            self.attach_progress([item])
        return item

    def attach_progress(self, items: list[Item]) -> None:
        records = self.db.get_many(item.uid for item in items)
        for item in items:
            item.progress = records.get(item.uid)

    async def chapters(self, uid: str) -> list[Chapter]:
        if not uid.startswith(SUWAYOMI + ":"):
            raise AdapterError("catalog", "solo i manga hanno capitoli")
        assert self.suwayomi is not None
        return await self.suwayomi.chapters(uid)

    # -- files --------------------------------------------------------------

    async def cover_source(self, uid: str, size: str = "400x600") -> tuple[str, Any]:
        """Return ``(path, adapter)`` for the cover of ``uid``."""
        if uid.startswith(CALIBRE + ":"):
            assert self.calibre is not None
            library, book_id = parse_calibre_uid(uid)
            return self.calibre.cover_path(library, book_id, size=size), self.calibre
        kind, manga_id = parse_suwayomi_uid(uid)
        assert self.suwayomi is not None
        if kind != "manga":
            raise AdapterError(SUWAYOMI, "copertina disponibile solo per i manga")
        return self.suwayomi.thumbnail_path(manga_id), self.suwayomi

    async def book_download(self, uid: str, fmt: str | None = None) -> tuple[str, str, str]:
        """Return ``(path, format, filename)`` for an ebook download."""
        assert self.calibre is not None
        library, book_id = parse_calibre_uid(uid)
        item = await self.item(uid, with_progress=False)
        chosen = (fmt or self.calibre.best_format(item.formats) or "epub").lower()
        if item.formats and chosen not in item.formats:
            raise AdapterError(CALIBRE, f"formato {chosen} non disponibile per «{item.title}»")
        return (self.calibre.download_path(library, book_id, chosen), chosen,
                f"{safe_filename(item.title)}.{chosen}")

    async def chapter_pages(self, chapter_uid: str) -> list[str]:
        assert self.suwayomi is not None
        kind, chapter_id = parse_suwayomi_uid(chapter_uid)
        if kind != "chapter":
            raise AdapterError(SUWAYOMI, "atteso un UID di capitolo")
        return await self.suwayomi.page_urls(chapter_id)


async def _unconfigured() -> tuple[bool, str]:
    return False, "non configurata"


async def _empty() -> tuple[list[Item], int]:
    return [], 0


_UNSAFE = '<>:"/\\|?*\0'


def safe_filename(name: str, *, max_length: int = 120) -> str:
    cleaned = "".join("_" if ch in _UNSAFE or ord(ch) < 32 else ch for ch in name).strip(" .")
    cleaned = " ".join(cleaned.split())
    return (cleaned[:max_length].rstrip() or "senza_titolo")
