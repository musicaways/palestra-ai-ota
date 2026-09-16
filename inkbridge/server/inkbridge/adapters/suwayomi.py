"""Adapter for Suwayomi-Server (Tachidesk).

Suwayomi moved from REST to GraphQL during the 1.x series and kept renaming
fields along the way, so every query here is written twice: a rich version and
a minimal fallback used when the server rejects a field.  The image endpoints
(``/api/v1/manga/...``) are the one part that stayed stable across versions and
are also what ``fetchChapterPages`` hands back, so page URLs are used verbatim
when the server provides them.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from ..models import Chapter, Item, Kind
from .base import AdapterError, BaseAdapter

log = logging.getLogger("inkbridge.suwayomi")

UID_PREFIX = "suwayomi"


def manga_uid(manga_id: int | str) -> str:
    return f"{UID_PREFIX}:manga:{manga_id}"


def chapter_uid(chapter_id: int | str) -> str:
    return f"{UID_PREFIX}:chapter:{chapter_id}"


def parse_uid(uid: str) -> tuple[str, int]:
    parts = uid.split(":")
    if len(parts) != 3 or parts[0] != UID_PREFIX or parts[1] not in ("manga", "chapter"):
        raise ValueError(f"UID Suwayomi non valido: {uid}")
    return parts[1], int(parts[2])


LIBRARY_QUERY = """
query InkBridgeLibrary($offset: Int, $first: Int) {
  mangas(condition: {inLibrary: true}, offset: $offset, first: $first, order: [{by: TITLE}]) {
    totalCount
    nodes {
      id title author artist description genre status thumbnailUrl unreadCount
      chapters { totalCount }
      lastReadChapter { id name sourceOrder pageCount lastPageRead isRead lastReadAt }
    }
  }
}
"""

LIBRARY_QUERY_MINIMAL = """
query InkBridgeLibraryMin($offset: Int, $first: Int) {
  mangas(condition: {inLibrary: true}, offset: $offset, first: $first) {
    totalCount
    nodes { id title author description genre thumbnailUrl unreadCount }
  }
}
"""

MANGA_QUERY = """
query InkBridgeManga($id: Int!) {
  manga(id: $id) {
    id title author artist description genre status thumbnailUrl unreadCount
    chapters { totalCount }
    lastReadChapter { id name sourceOrder pageCount lastPageRead isRead lastReadAt }
  }
}
"""

MANGA_QUERY_MINIMAL = """
query InkBridgeMangaMin($id: Int!) {
  manga(id: $id) { id title author description genre thumbnailUrl unreadCount }
}
"""

CHAPTERS_QUERY = """
query InkBridgeChapters($id: Int!) {
  chapters(condition: {mangaId: $id}, order: [{by: SOURCE_ORDER}]) {
    totalCount
    nodes {
      id name chapterNumber sourceOrder pageCount isRead lastPageRead uploadDate isDownloaded
    }
  }
}
"""

CHAPTERS_QUERY_MINIMAL = """
query InkBridgeChaptersMin($id: Int!) {
  chapters(condition: {mangaId: $id}) {
    totalCount
    nodes { id name sourceOrder pageCount isRead lastPageRead }
  }
}
"""

PAGES_MUTATION = """
mutation InkBridgePages($id: Int!) {
  fetchChapterPages(input: {chapterId: $id}) { pages }
}
"""

UPDATE_CHAPTER_MUTATION = """
mutation InkBridgeUpdateChapter($id: Int!, $patch: UpdateChapterPatchInput!) {
  updateChapter(input: {id: $id, patch: $patch}) {
    chapter { id isRead lastPageRead lastReadAt }
  }
}
"""


class SuwayomiAdapter(BaseAdapter):
    source = "suwayomi"

    def __init__(self, url: str, *, username: str = "", password: str = "",
                 timeout: float = 30.0, write_positions: bool = True,
                 read_threshold: float = 0.95) -> None:
        auth = httpx.BasicAuth(username, password) if username else None
        super().__init__(url, timeout=timeout, auth=auth)
        self.write_positions = write_positions
        self.read_threshold = read_threshold
        # Remembers which query variant this server accepts, per query name.
        self._variant: dict[str, str] = {}

    # -- GraphQL ------------------------------------------------------------

    async def gql(self, query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        response = await self.request(
            "POST", "/api/graphql", json={"query": query, "variables": variables or {}}
        )
        try:
            payload = response.json()
        except ValueError as exc:
            raise AdapterError(self.source, f"risposta GraphQL non JSON: {exc}") from exc
        if payload.get("errors"):
            message = "; ".join(str(e.get("message", e)) for e in payload["errors"])
            raise AdapterError(self.source, f"GraphQL: {message}")
        data = payload.get("data")
        if data is None:
            raise AdapterError(self.source, "GraphQL: risposta senza dati")
        return data

    async def gql_with_fallback(self, name: str, rich: str, minimal: str,
                                variables: dict[str, Any] | None = None) -> dict[str, Any]:
        """Run ``rich``; if this server rejects a field, fall back to ``minimal``.

        The choice is remembered so the failing query is attempted only once.
        """
        if self._variant.get(name) == "minimal":
            return await self.gql(minimal, variables)
        try:
            data = await self.gql(rich, variables)
        except AdapterError as exc:
            if "GraphQL" not in exc.message:
                raise
            log.warning("suwayomi: query %s rifiutata (%s), uso la variante ridotta",
                        name, exc.message)
            self._variant[name] = "minimal"
            return await self.gql(minimal, variables)
        self._variant[name] = "rich"
        return data

    async def ping(self) -> tuple[bool, str]:
        try:
            data = await self.gql("query { mangas(condition: {inLibrary: true}) { totalCount } }")
        except AdapterError as exc:
            return False, exc.message
        total = (data.get("mangas") or {}).get("totalCount", 0)
        return True, f"{total} manga in libreria"

    # -- catalogue ----------------------------------------------------------

    async def list_items(self, query: str = "", *, offset: int = 0,
                         limit: int = 60) -> tuple[list[Item], int]:
        # Suwayomi has no free-text filter that is stable across versions, so a
        # text query is applied here over a wider window.
        fetch_limit = limit if not query else max(limit, 500)
        data = await self.gql_with_fallback(
            "library", LIBRARY_QUERY, LIBRARY_QUERY_MINIMAL,
            {"offset": 0 if query else offset, "first": fetch_limit},
        )
        block = data.get("mangas") or {}
        nodes = block.get("nodes") or []
        items = [self.to_item(node) for node in nodes]
        if query:
            needle = query.casefold()
            items = [i for i in items
                     if needle in i.title.casefold()
                     or any(needle in a.casefold() for a in i.authors)
                     or any(needle in t.casefold() for t in i.tags)]
            total = len(items)
            items = items[offset:offset + limit]
        else:
            total = int(block.get("totalCount") or len(items))
        return items, total

    async def item(self, uid: str) -> Item:
        _, manga_id = parse_uid(uid)
        data = await self.gql_with_fallback(
            "manga", MANGA_QUERY, MANGA_QUERY_MINIMAL, {"id": manga_id}
        )
        node = data.get("manga")
        if not node:
            raise AdapterError(self.source, f"manga {manga_id} non trovato")
        return self.to_item(node)

    def to_item(self, node: dict[str, Any]) -> Item:
        manga_id = int(node["id"])
        genres = node.get("genre") or []
        if isinstance(genres, str):
            genres = [g.strip() for g in genres.split(",") if g.strip()]
        authors = [a for a in (node.get("author"), node.get("artist")) if a]
        chapters = node.get("chapters") or {}
        return Item(
            uid=manga_uid(manga_id),
            kind=Kind.MANGA,
            source=self.source,
            title=node.get("title") or f"#{manga_id}",
            authors=list(dict.fromkeys(authors)),
            tags=list(genres),
            description=(node.get("description") or None),
            cover_url=f"/v1/library/items/{manga_uid(manga_id)}/cover",
            formats=["cbz"],
            chapter_count=int(chapters.get("totalCount") or 0) or None,
            unread_count=node.get("unreadCount"),
        )

    async def chapters(self, uid: str) -> list[Chapter]:
        _, manga_id = parse_uid(uid)
        data = await self.gql_with_fallback(
            "chapters", CHAPTERS_QUERY, CHAPTERS_QUERY_MINIMAL, {"id": manga_id}
        )
        nodes = (data.get("chapters") or {}).get("nodes") or []
        out: list[Chapter] = []
        for node in nodes:
            out.append(Chapter(
                uid=chapter_uid(node["id"]),
                manga_uid=manga_uid(manga_id),
                name=node.get("name") or f"Capitolo {node.get('chapterNumber') or ''}".strip(),
                index=int(node.get("sourceOrder") or 0),
                pages=node.get("pageCount") or None,
                read=bool(node.get("isRead")),
                last_page_read=int(node.get("lastPageRead") or 0),
                uploaded_at=_as_ms(node.get("uploadDate")),
                downloaded=bool(node.get("isDownloaded")),
            ))
        out.sort(key=lambda c: c.index)
        return out

    async def chapter_state(self, chapter_id: int) -> dict[str, Any] | None:
        data = await self.gql(
            "query InkBridgeChapter($id: Int!) { chapter(id: $id) "
            "{ id mangaId name sourceOrder pageCount lastPageRead isRead } }",
            {"id": chapter_id},
        )
        return data.get("chapter")

    async def page_urls(self, chapter_id: int) -> list[str]:
        """Page image URLs for a chapter, absolute or server-relative."""
        data = await self.gql(PAGES_MUTATION, {"id": chapter_id})
        pages = ((data.get("fetchChapterPages") or {}).get("pages")) or []
        urls = [str(p) for p in pages if p]
        if urls:
            return urls
        # Older servers answer with an empty list but still serve the indexed
        # REST route; rebuild it from the chapter's own metadata.
        state = await self.chapter_state(chapter_id)
        if not state:
            return []
        count = int(state.get("pageCount") or 0)
        manga_id = int(state.get("mangaId") or 0)
        index = int(state.get("sourceOrder") or 0)
        return [f"/api/v1/manga/{manga_id}/chapter/{index}/page/{i}" for i in range(count)]

    def thumbnail_path(self, manga_id: int) -> str:
        return f"/api/v1/manga/{manga_id}/thumbnail"

    async def open_stream(self, path: str) -> httpx.Response:
        client = await self.client()
        request = client.build_request("GET", path)
        response = await client.send(request, stream=True)
        if response.status_code >= 400:
            await response.aclose()
            raise AdapterError(self.source, f"GET {path} -> HTTP {response.status_code}",
                               status=response.status_code)
        return response

    async def fetch_bytes(self, path: str) -> bytes:
        response = await self.request("GET", path)
        return response.content

    # -- reading positions --------------------------------------------------

    async def set_chapter_progress(self, chapter_id: int, *, last_page_read: int,
                                   read: bool | None = None) -> None:
        if not self.write_positions:
            return
        patch: dict[str, Any] = {"lastPageRead": max(0, int(last_page_read))}
        if read is not None:
            patch["isRead"] = bool(read)
        await self.gql(UPDATE_CHAPTER_MUTATION, {"id": chapter_id, "patch": patch})

    async def library_progress(self) -> list[dict[str, Any]]:
        """Per-manga reading state, used to detect changes made outside InkBridge."""
        data = await self.gql_with_fallback(
            "library", LIBRARY_QUERY, LIBRARY_QUERY_MINIMAL, {"offset": 0, "first": 1000}
        )
        nodes = (data.get("mangas") or {}).get("nodes") or []
        out = []
        for node in nodes:
            last = node.get("lastReadChapter")
            if not last:
                continue
            total = int((node.get("chapters") or {}).get("totalCount") or 0)
            out.append({
                "uid": manga_uid(int(node["id"])),
                "chapter_uid": chapter_uid(int(last["id"])),
                "chapter_index": int(last.get("sourceOrder") or 0),
                "page": int(last.get("lastPageRead") or 0),
                "pages": int(last.get("pageCount") or 0) or None,
                "read": bool(last.get("isRead")),
                "chapters_total": total,
                "updated_at": _as_ms(last.get("lastReadAt")),
            })
        return out

    def manga_percent(self, *, chapter_index: int, chapters_total: int,
                      page: int, pages: int | None, chapter_read: bool) -> float:
        """Share of the whole series, not of the current chapter.

        ``chapter_index`` is 0-based in source order, so a reader halfway
        through chapter 3 of 10 sits at 0.25 — two finished chapters plus half
        of the third.
        """
        if chapters_total <= 0:
            return 1.0 if chapter_read else 0.0
        if chapter_read:
            within = 1.0
        elif pages and pages > 0:
            within = min(1.0, max(0.0, (page + 1) / pages))
        else:
            within = 0.0
        index = max(0, min(chapter_index, chapters_total - 1))
        return min(1.0, (index + within) / chapters_total)


def _as_ms(value: Any) -> int | None:
    """Suwayomi reports timestamps as ms, as seconds, or as strings."""
    if value in (None, "", 0, "0"):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number <= 0:
        return None
    return int(number if number > 1e11 else number * 1000)
