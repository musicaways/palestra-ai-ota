"""Adapter behaviour that the API tests would not exercise."""

from __future__ import annotations

import httpx
import pytest
from conftest import FakeCalibre, FakeSuwayomi

from inkbridge.adapters.base import AdapterError
from inkbridge.adapters.calibre import CalibreAdapter
from inkbridge.adapters.suwayomi import SuwayomiAdapter, _as_ms
from inkbridge.adapters.suwayomi import parse_uid as parse_suwayomi_uid


def calibre_adapter(fake: FakeCalibre) -> CalibreAdapter:
    adapter = CalibreAdapter("http://calibre.test", formats=["kepub", "epub", "pdf"])
    adapter._client = httpx.AsyncClient(base_url="http://calibre.test",
                                        transport=httpx.MockTransport(fake.handler))
    return adapter


def suwayomi_adapter(fake: FakeSuwayomi) -> SuwayomiAdapter:
    adapter = SuwayomiAdapter("http://suwayomi.test")
    adapter._client = httpx.AsyncClient(base_url="http://suwayomi.test",
                                        transport=httpx.MockTransport(fake.handler))
    return adapter


async def test_calibre_resolves_the_default_library_once(fake_calibre):
    adapter = calibre_adapter(fake_calibre)
    assert await adapter.library_id() == "Lib"
    assert await adapter.libraries() == {"Lib": "Libreria"}


async def test_calibre_ping_reports_the_library(fake_calibre):
    available, detail = await calibre_adapter(fake_calibre).ping()
    assert available is True
    assert "Lib" in detail


async def test_calibre_ping_survives_an_unreachable_server():
    adapter = CalibreAdapter("http://calibre.test")
    adapter._client = httpx.AsyncClient(
        base_url="http://calibre.test",
        transport=httpx.MockTransport(lambda r: httpx.Response(503, json={})))
    available, detail = await adapter.ping()
    assert available is False
    assert "503" in detail


async def test_calibre_missing_position_endpoint_is_not_an_error(fake_calibre):
    """calibre 3 has no last-read-position API; that must not break sync."""
    def old_calibre(request: httpx.Request) -> httpx.Response:
        if request.url.path.startswith("/book-get-last-read-position/"):
            return httpx.Response(404, json={})
        return fake_calibre.handler(request)

    adapter = CalibreAdapter("http://calibre.test")
    adapter._client = httpx.AsyncClient(base_url="http://calibre.test",
                                        transport=httpx.MockTransport(old_calibre))
    assert await adapter.get_positions(12, "epub") == []


async def test_calibre_positions_come_back_newest_first(fake_calibre):
    adapter = calibre_adapter(fake_calibre)
    fake_calibre.positions["12:EPUB"] = {"device": "a", "cfi": "", "pos_frac": 0.1,
                                         "epoch": 1_000.0}

    def multi(request: httpx.Request) -> httpx.Response:
        if request.url.path.startswith("/book-get-last-read-position/"):
            return httpx.Response(200, json=[
                {"device": "vecchio", "pos_frac": 0.1, "epoch": 1_000.0},
                {"device": "nuovo", "pos_frac": 0.8, "epoch": 9_000.0},
            ])
        return fake_calibre.handler(request)

    adapter._client = httpx.AsyncClient(base_url="http://calibre.test",
                                        transport=httpx.MockTransport(multi))
    entries = await adapter.get_positions(12, "epub")
    assert [e["device"] for e in entries] == ["nuovo", "vecchio"]


async def test_suwayomi_falls_back_when_a_field_is_unknown():
    """Older servers reject lastReadChapter; the catalogue must still load."""
    fake = FakeSuwayomi(reject_rich=True)
    adapter = suwayomi_adapter(fake)
    items, total = await adapter.list_items()
    assert total == 1
    assert items[0].title == "Vinland Saga"
    # The reduced variant is remembered, so the rich query is not retried.
    assert adapter._variant["library"] == "minimal"


async def test_suwayomi_page_urls_are_rebuilt_when_the_server_returns_none(fake_suwayomi):
    adapter = suwayomi_adapter(fake_suwayomi)

    def empty_pages(request: httpx.Request) -> httpx.Response:
        import json as _json
        body = _json.loads(request.content or b"{}")
        if "InkBridgePages" in body.get("query", ""):
            return httpx.Response(200, json={"data": {"fetchChapterPages": {"pages": []}}})
        return fake_suwayomi.handler(request)

    adapter._client = httpx.AsyncClient(base_url="http://suwayomi.test",
                                        transport=httpx.MockTransport(empty_pages))
    urls = await adapter.page_urls(101)
    assert len(urls) == 20
    assert urls[0] == "/api/v1/manga/7/chapter/1/page/0"


async def test_suwayomi_graphql_errors_surface_as_adapter_errors(fake_suwayomi):
    adapter = suwayomi_adapter(fake_suwayomi)
    with pytest.raises(AdapterError) as excinfo:
        await adapter.gql("query Sconosciuta { nulla }")
    assert "GraphQL" in str(excinfo.value)


async def test_suwayomi_library_progress_shape(fake_suwayomi):
    states = await suwayomi_adapter(fake_suwayomi).library_progress()
    assert states == [{
        "uid": "suwayomi:manga:7", "chapter_uid": "suwayomi:chapter:101",
        "chapter_index": 1, "page": 9, "pages": 20, "read": False,
        "chapters_total": 4, "updated_at": 1_700_000_500_000,
    }]


def test_suwayomi_uid_parsing_rejects_nonsense():
    assert parse_suwayomi_uid("suwayomi:chapter:5") == ("chapter", 5)
    with pytest.raises(ValueError):
        parse_suwayomi_uid("calibre:Lib:5")


def test_timestamp_normalisation():
    assert _as_ms(1_700_000_000) == 1_700_000_000_000     # seconds
    assert _as_ms(1_700_000_000_000) == 1_700_000_000_000  # already ms
    assert _as_ms("0") is None
    assert _as_ms("nonsense") is None
