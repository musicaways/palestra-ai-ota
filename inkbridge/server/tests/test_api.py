"""End-to-end over the real routers, with fake Calibre/Suwayomi back ends."""

from __future__ import annotations

import io
import zipfile


def test_token_is_required(client):
    del client.headers["Authorization"]
    assert client.get("/v1/library/items").status_code == 401
    assert client.get("/health").status_code == 200  # probes stay open


def test_a_wrong_token_is_rejected(client):
    response = client.get("/v1/library/items",
                          headers={"Authorization": "Bearer sbagliato"})
    assert response.status_code == 401


def test_token_accepted_in_the_query_string_for_image_widgets(client):
    del client.headers["Authorization"]
    response = client.get("/v1/library/items/calibre:Lib:12/cover", params={"token": "segreto"})
    assert response.status_code == 200


def test_sources_report_both_back_ends(client):
    sources = {s["id"]: s for s in client.get("/v1/library/sources").json()}
    assert sources["calibre"]["available"] is True
    assert sources["suwayomi"]["available"] is True
    assert sources["calibre"]["kind"] == "book"
    assert sources["suwayomi"]["kind"] == "manga"


def test_calibre_items_are_normalised(client):
    page = client.get("/v1/library/items", params={"source": "calibre"}).json()
    assert page["total"] == 2
    book = next(i for i in page["items"] if i["uid"] == "calibre:Lib:12")
    assert book["title"] == "Il nome della rosa"
    assert book["authors"] == ["Umberto Eco"]
    assert book["formats"] == ["epub", "pdf"]
    assert book["description"] == "Un'abbazia, sette giorni."   # HTML stripped
    assert book["kind"] == "book"


def test_suwayomi_items_are_normalised(client):
    page = client.get("/v1/library/items", params={"source": "suwayomi"}).json()
    manga = page["items"][0]
    assert manga["uid"] == "suwayomi:manga:7"
    assert manga["kind"] == "manga"
    assert manga["chapter_count"] == 4
    assert manga["formats"] == ["cbz"]


def test_search_spans_both_sources(client):
    page = client.get("/v1/library/items", params={"query": "vinland"}).json()
    assert [i["uid"] for i in page["items"]] == ["suwayomi:manga:7"]
    page = client.get("/v1/library/items", params={"query": "rosa"}).json()
    assert [i["uid"] for i in page["items"]] == ["calibre:Lib:12"]


def test_chapters_are_ordered_by_source_order(client):
    chapters = client.get("/v1/library/items/suwayomi:manga:7/chapters").json()
    assert [c["index"] for c in chapters] == [0, 1, 2, 3]
    assert chapters[0]["read"] is True
    assert chapters[1]["last_page_read"] == 9
    assert chapters[1]["uid"] == "suwayomi:chapter:101"


def test_ebook_download_streams_with_a_filename(client):
    response = client.get("/v1/library/items/calibre:Lib:12/file")
    assert response.status_code == 200
    assert response.content.startswith(b"EPUB-PAYLOAD")
    assert "Il%20nome%20della%20rosa.epub" in response.headers["content-disposition"]


def test_download_rejects_a_format_the_book_does_not_have(client):
    response = client.get("/v1/library/items/calibre:Lib:12/file", params={"format": "mobi"})
    assert response.status_code == 502
    assert "mobi" in response.json()["detail"]


def test_preferred_format_wins_when_available(client):
    # Book 34 has KEPUB and EPUB; kepub is first in the configured preference.
    response = client.get("/v1/library/items/calibre:Lib:34/file")
    assert "Le%20citt%C3%A0%20invisibili.kepub" in response.headers["content-disposition"]


def test_chapter_is_delivered_as_a_readable_cbz(client):
    response = client.get("/v1/library/chapters/suwayomi:chapter:101/cbz",
                          params={"name": "Vinland Saga - Cap. 2"})
    assert response.status_code == 200
    archive = zipfile.ZipFile(io.BytesIO(response.content))
    assert archive.testzip() is None
    assert archive.namelist() == [f"{i:04d}.jpg" for i in range(1, 21)]
    assert archive.read("0001.jpg").startswith(b"PAGE0")
    assert "Vinland%20Saga%20-%20Cap.%202.cbz" in response.headers["content-disposition"]


def test_covers_are_proxied_with_their_media_type(client):
    book = client.get("/v1/library/items/calibre:Lib:12/cover")
    assert book.headers["content-type"] == "image/jpeg"
    manga = client.get("/v1/library/items/suwayomi:manga:7/cover")
    assert manga.headers["content-type"] == "image/png"


def test_unknown_uid_is_a_client_error(client):
    assert client.get("/v1/library/items/spotify:track:1").status_code == 502
