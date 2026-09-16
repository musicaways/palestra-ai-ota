"""Fixtures: a hub wired to fake Calibre and Suwayomi back ends.

The fakes answer on httpx MockTransports, so the whole stack — routers,
services, adapters — runs for real and only the sockets are imaginary.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from inkbridge.app import create_app
from inkbridge.config import Settings

CALIBRE_BOOKS: dict[int, dict[str, Any]] = {
    12: {
        "title": "Il nome della rosa",
        "authors": ["Umberto Eco"],
        "series": "Nessuna",
        "series_index": None,
        "tags": ["Giallo", "Storico"],
        "comments": "<p>Un'abbazia, <b>sette</b> giorni.</p>",
        "languages": ["ita"],
        "formats": ["EPUB", "PDF"],
        "format_metadata": {"epub": {"size": 812345}},
    },
    34: {
        "title": "Le città invisibili",
        "authors": ["Italo Calvino"],
        "tags": ["Narrativa"],
        "comments": None,
        "languages": ["ita"],
        "formats": ["KEPUB", "EPUB"],
        "format_metadata": {"kepub": {"size": 234567}},
    },
}


class FakeCalibre:
    """Minimal calibre-server: /ajax, /get and the last-read-position pair."""

    def __init__(self) -> None:
        self.positions: dict[str, dict[str, Any]] = {}
        self.set_calls: list[dict[str, Any]] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/ajax/library-info":
            return httpx.Response(200, json={"library_map": {"Lib": "Libreria"},
                                             "default_library": "Lib"})
        if path == "/ajax/search":
            query = request.url.params.get("query", "")
            ids = [i for i, meta in CALIBRE_BOOKS.items()
                   if not query or query.lower() in meta["title"].lower()]
            offset = int(request.url.params.get("offset", 0))
            num = int(request.url.params.get("num", 60))
            return httpx.Response(200, json={"book_ids": ids[offset:offset + num],
                                             "total_num": len(ids)})
        if path == "/ajax/books":
            ids = [int(i) for i in request.url.params.get("ids", "").split(",") if i]
            return httpx.Response(200, json={str(i): CALIBRE_BOOKS.get(i) for i in ids})
        if path.startswith("/get/thumb/") or path.startswith("/get/cover/"):
            return httpx.Response(200, content=b"\xff\xd8\xff-jpeg",
                                  headers={"content-type": "image/jpeg"})
        if path.startswith("/get/"):
            return httpx.Response(200, content=b"EPUB-PAYLOAD" * 10,
                                  headers={"content-type": "application/epub+zip"})
        if path.startswith("/book-get-last-read-position/"):
            which = path.rsplit("/", 1)[-1]
            entry = self.positions.get(which)
            return httpx.Response(200, json={which: [entry]} if entry else {})
        if path.startswith("/book-set-last-read-position/"):
            _, _, _library, book_id, fmt = path.split("/")
            payload = json.loads(request.content or b"{}")
            payload.update({"book_id": int(book_id), "format": fmt})
            self.set_calls.append(payload)
            self.positions[f"{book_id}:{fmt}"] = {
                "device": payload.get("device", ""),
                "cfi": payload.get("cfi", ""),
                "pos_frac": payload.get("pos_frac", 0.0),
                "epoch": 1_700_000_000.0,
            }
            return httpx.Response(200, json={"ok": True})
        return httpx.Response(404, json={"error": path})


MANGA = {
    "id": 7,
    "title": "Vinland Saga",
    "author": "Makoto Yukimura",
    "artist": None,
    "description": "Thorfinn.",
    "genre": ["Azione", "Storico"],
    "status": "ONGOING",
    "thumbnailUrl": "/api/v1/manga/7/thumbnail",
    "unreadCount": 3,
    "chapters": {"totalCount": 4},
    "lastReadChapter": {"id": 101, "name": "Cap. 2", "sourceOrder": 1, "pageCount": 20,
                        "lastPageRead": 9, "isRead": False, "lastReadAt": 1_700_000_500},
}

CHAPTERS = [
    {"id": 100, "name": "Cap. 1", "chapterNumber": 1.0, "sourceOrder": 0, "pageCount": 18,
     "isRead": True, "lastPageRead": 17, "uploadDate": 1_600_000_000_000, "isDownloaded": True},
    {"id": 101, "name": "Cap. 2", "chapterNumber": 2.0, "sourceOrder": 1, "pageCount": 20,
     "isRead": False, "lastPageRead": 9, "uploadDate": 1_600_100_000_000, "isDownloaded": False},
    {"id": 102, "name": "Cap. 3", "chapterNumber": 3.0, "sourceOrder": 2, "pageCount": 22,
     "isRead": False, "lastPageRead": 0, "uploadDate": 1_600_200_000_000, "isDownloaded": False},
    {"id": 103, "name": "Cap. 4", "chapterNumber": 4.0, "sourceOrder": 3, "pageCount": 16,
     "isRead": False, "lastPageRead": 0, "uploadDate": 1_600_300_000_000, "isDownloaded": False},
]


class FakeSuwayomi:
    """Minimal Suwayomi: GraphQL for metadata, REST for page images."""

    def __init__(self, *, reject_rich: bool = False) -> None:
        self.reject_rich = reject_rich
        self.updates: list[dict[str, Any]] = []
        self.manga = json.loads(json.dumps(MANGA))
        self.chapters = json.loads(json.dumps(CHAPTERS))

    def handler(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/api/graphql":
            return self._graphql(json.loads(request.content or b"{}"))
        if path.endswith("/thumbnail"):
            return httpx.Response(200, content=b"\x89PNG-thumb",
                                  headers={"content-type": "image/png"})
        if "/page/" in path:
            index = int(path.rsplit("/", 1)[-1])
            return httpx.Response(200, content=b"PAGE" + str(index).encode() * 8,
                                  headers={"content-type": "image/jpeg"})
        return httpx.Response(404, json={"error": path})

    def _graphql(self, body: dict[str, Any]) -> httpx.Response:
        query = body.get("query", "")
        variables = body.get("variables", {})
        if self.reject_rich and "lastReadChapter" in query:
            return httpx.Response(200, json={"errors": [
                {"message": "Unknown field 'lastReadChapter'"}]})
        if "InkBridgeLibrary" in query or "mangas(condition: {inLibrary: true}) { totalCount }" in query:
            node = self.manga if "lastReadChapter" in query else {
                k: v for k, v in self.manga.items()
                if k not in ("lastReadChapter", "chapters", "status", "artist")
            }
            return httpx.Response(200, json={"data": {"mangas": {
                "totalCount": 1, "nodes": [node]}}})
        if "InkBridgeManga" in query:
            node = self.manga if "lastReadChapter" in query else {
                k: v for k, v in self.manga.items()
                if k not in ("lastReadChapter", "chapters", "status", "artist")
            }
            return httpx.Response(200, json={"data": {"manga": node}})
        if "InkBridgeChapters" in query:
            return httpx.Response(200, json={"data": {"chapters": {
                "totalCount": len(self.chapters), "nodes": self.chapters}}})
        if "InkBridgeChapter(" in query:
            chapter = next((c for c in self.chapters if c["id"] == variables["id"]), None)
            if chapter:
                chapter = dict(chapter, mangaId=7)
            return httpx.Response(200, json={"data": {"chapter": chapter}})
        if "InkBridgePages" in query:
            chapter = next((c for c in self.chapters if c["id"] == variables["id"]), None)
            pages = [f"/api/v1/manga/7/chapter/{chapter['sourceOrder']}/page/{i}"
                     for i in range(chapter["pageCount"])] if chapter else []
            return httpx.Response(200, json={"data": {"fetchChapterPages": {"pages": pages}}})
        if "InkBridgeUpdateChapter" in query:
            patch = variables.get("patch", {})
            self.updates.append({"id": variables["id"], **patch})
            for chapter in self.chapters:
                if chapter["id"] == variables["id"]:
                    chapter["lastPageRead"] = patch.get("lastPageRead", chapter["lastPageRead"])
                    chapter["isRead"] = patch.get("isRead", chapter["isRead"])
                    if chapter["id"] == self.manga["lastReadChapter"]["id"]:
                        self.manga["lastReadChapter"].update({
                            "lastPageRead": chapter["lastPageRead"],
                            "isRead": chapter["isRead"],
                            "lastReadAt": 1_700_000_900,
                        })
            return httpx.Response(200, json={"data": {"updateChapter": {"chapter": {
                "id": variables["id"], "isRead": patch.get("isRead", False),
                "lastPageRead": patch.get("lastPageRead", 0), "lastReadAt": 1_700_000_900}}}})
        return httpx.Response(200, json={"errors": [{"message": f"query sconosciuta: {query[:40]}"}]})


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(
        data_dir=tmp_path,
        token="segreto",
        calibre_url="http://calibre.test",
        suwayomi_url="http://suwayomi.test",
        poll_interval=10_000,          # background loop must not interfere
        writeback_retry_interval=10_000,
        catalog_ttl=0.0,               # tests assert on fresh upstream state
    )


@pytest.fixture
def fake_calibre() -> FakeCalibre:
    return FakeCalibre()


@pytest.fixture
def fake_suwayomi() -> FakeSuwayomi:
    return FakeSuwayomi()


@pytest.fixture
def client(settings, fake_calibre, fake_suwayomi):
    from fastapi.testclient import TestClient

    app = create_app(settings)

    with TestClient(app) as test_client:
        wire(app.state.catalog, fake_calibre, fake_suwayomi)
        test_client.headers["Authorization"] = "Bearer segreto"
        yield test_client


def wire(catalog, fake_calibre: FakeCalibre, fake_suwayomi: FakeSuwayomi) -> None:
    """Replace each adapter's client with one backed by a mock transport."""
    catalog.calibre._client = httpx.AsyncClient(
        base_url="http://calibre.test", transport=httpx.MockTransport(fake_calibre.handler))
    catalog.suwayomi._client = httpx.AsyncClient(
        base_url="http://suwayomi.test", transport=httpx.MockTransport(fake_suwayomi.handler))
