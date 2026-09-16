"""The bidirectional loop, end to end.

Kobo -> hub -> Calibre/Suwayomi, and Calibre/Suwayomi -> hub -> Kobo.
"""

from __future__ import annotations

import pytest

BOOK = "calibre:Lib:12"
MANGA = "suwayomi:manga:7"
CHAPTER = "suwayomi:chapter:101"


def push(client, **kwargs):
    record = {"uid": BOOK, "kind": "book", "percent": 0.42, "locator": "/body/DocFragment[7]",
              "status": "reading", "device_id": "kobo-libra", "device_name": "Kobo Libra Color",
              "updated_at": 1_700_000_100_000}
    record.update(kwargs)
    return client.post("/v1/progress", json={"records": [record],
                                             "device_id": record["device_id"],
                                             "device_name": record["device_name"]})


def test_push_then_pull_round_trip(client):
    result = push(client).json()
    assert result["outcomes"][0]["result"] == "applied"
    cursor = result["cursor"]

    pulled = client.get("/v1/progress", params={"since": 0}).json()
    assert pulled["records"][0]["percent"] == pytest.approx(0.42)
    assert pulled["cursor"] == cursor

    # Nothing new since that cursor.
    assert client.get("/v1/progress", params={"since": cursor}).json()["records"] == []


def test_stale_push_is_rejected_and_the_device_is_told_the_truth(client):
    push(client, percent=0.80, updated_at=2_000_000_000_000)
    result = push(client, percent=0.10, updated_at=1_000_000_000_000).json()
    outcome = result["outcomes"][0]
    assert outcome["result"] == "stale"
    assert outcome["record"]["percent"] == pytest.approx(0.80)  # authoritative value


def test_writeback_reaches_calibre(client, fake_calibre):
    push(client, percent=0.42)
    report = client.post("/v1/sync/run").json()
    assert report["written_back"] == 1
    assert report["pending"] == 0

    call = fake_calibre.set_calls[-1]
    assert call["book_id"] == 12
    assert call["format"] == "EPUB"
    assert call["pos_frac"] == pytest.approx(0.42)
    assert call["device"].startswith("inkbridge:")
    # A KOReader xpointer is not a CFI: calibre must not be fed one.
    assert call["cfi"] == ""


def test_epub_cfi_is_forwarded_untouched(client, fake_calibre):
    push(client, locator="epubcfi(/6/14[c1]!/4/2/2/1:0)")
    client.post("/v1/sync/run")
    assert fake_calibre.set_calls[-1]["cfi"] == "epubcfi(/6/14[c1]!/4/2/2/1:0)"


def test_writeback_failure_keeps_the_record_queued(client, fake_calibre):
    def broken(request):
        import httpx
        if request.url.path.startswith("/book-set-last-read-position/"):
            return httpx.Response(500, json={"error": "boom"})
        return fake_calibre.handler(request)

    import httpx
    client.app.state.catalog.calibre._client = httpx.AsyncClient(
        base_url="http://calibre.test", transport=httpx.MockTransport(broken))

    push(client)
    assert client.post("/v1/sync/run").json()["pending"] == 1
    record = client.get(f"/v1/progress/{BOOK}").json()
    assert "500" in record["upstream_error"]

    # Once calibre is back, the retry clears the queue without the device
    # having to send anything again.
    client.app.state.catalog.calibre._client = httpx.AsyncClient(
        base_url="http://calibre.test", transport=httpx.MockTransport(fake_calibre.handler))
    assert client.post("/v1/sync/run").json()["pending"] == 0


def test_manga_writeback_updates_the_chapter(client, fake_suwayomi):
    client.post("/v1/progress", json={"records": [{
        "uid": MANGA, "kind": "manga", "percent": 0.3, "chapter_uid": CHAPTER,
        "page": 12, "pages": 20, "status": "reading", "device_id": "kobo-libra",
        "updated_at": 1_800_000_000_000}]})
    client.post("/v1/sync/run")
    update = fake_suwayomi.updates[-1]
    assert update["id"] == 101
    assert update["lastPageRead"] == 11       # device pages are 1-based
    assert update["isRead"] is False


def test_finishing_a_chapter_marks_it_read_upstream(client, fake_suwayomi):
    client.post("/v1/progress", json={"records": [{
        "uid": MANGA, "kind": "manga", "percent": 0.5, "chapter_uid": CHAPTER,
        "page": 20, "pages": 20, "status": "reading", "device_id": "kobo-libra",
        "updated_at": 1_800_000_000_000}]})
    client.post("/v1/sync/run")
    assert fake_suwayomi.updates[-1]["isRead"] is True


def test_progress_made_in_calibre_reaches_the_device(client, fake_calibre):
    """NAS -> Kobo: someone read in calibre's web viewer."""
    push(client, percent=0.20, updated_at=1_600_000_000_000)
    cursor = client.get("/v1/progress").json()["cursor"]

    fake_calibre.positions["12:EPUB"] = {
        "device": "calibre-web-viewer", "cfi": "epubcfi(/6/20!/4/2/10)",
        "pos_frac": 0.77, "epoch": 1_700_000_000.0,
    }
    client.post("/v1/sync/run")

    delta = client.get("/v1/progress", params={"since": cursor}).json()
    imported = next(r for r in delta["records"] if r["uid"] == BOOK)
    assert imported["percent"] == pytest.approx(0.77)
    assert imported["device_id"] == "upstream:calibre"
    assert imported["locator"] == "epubcfi(/6/20!/4/2/10)"


def test_the_hub_does_not_reimport_its_own_writeback(client, fake_calibre):
    """Without this, every sync would bounce a record back and forth forever."""
    push(client, percent=0.42)
    client.post("/v1/sync/run")
    cursor = client.get("/v1/progress").json()["cursor"]
    report = client.post("/v1/sync/run").json()
    assert report["imported"] == 0
    assert client.get("/v1/progress", params={"since": cursor}).json()["records"] == []


def test_older_upstream_position_never_overwrites_a_newer_device_one(client, fake_calibre):
    push(client, percent=0.90, updated_at=1_800_000_000_000)
    fake_calibre.positions["12:EPUB"] = {
        "device": "vecchio-tablet", "cfi": "", "pos_frac": 0.05, "epoch": 1_700_000_000.0}
    client.post("/v1/sync/run")
    assert client.get(f"/v1/progress/{BOOK}").json()["percent"] == pytest.approx(0.90)
    # ...and the device's newer position is the one that reached calibre.
    assert fake_calibre.positions["12:EPUB"]["pos_frac"] == pytest.approx(0.90)


def test_a_queued_record_never_rolls_back_a_fresher_calibre_position(client, fake_calibre):
    """The device was offline; meanwhile the web viewer moved on."""
    push(client, percent=0.20, updated_at=1_600_000_000_000)
    fake_calibre.positions["12:EPUB"] = {
        "device": "calibre-web-viewer", "cfi": "epubcfi(/6/30!/4)",
        "pos_frac": 0.65, "epoch": 1_700_000_000.0}
    client.post("/v1/sync/run")
    assert fake_calibre.positions["12:EPUB"]["pos_frac"] == pytest.approx(0.65)
    assert client.get(f"/v1/progress/{BOOK}").json()["percent"] == pytest.approx(0.65)


def test_manga_progress_from_suwayomi_is_imported_as_a_series_percentage(client, fake_suwayomi):
    # Chapter 2 of 4 (index 1), page 10 of 20 -> (1 + 0.5) / 4.
    assert client.post("/v1/sync/run").json()["imported"] == 1
    record = client.get(f"/v1/progress/{MANGA}").json()
    assert record["percent"] == pytest.approx(0.375)
    assert record["chapter_uid"] == CHAPTER
    assert record["page"] == 10


def test_catalogue_items_carry_their_progress(client):
    push(client, percent=0.42)
    page = client.get("/v1/library/items", params={"source": "calibre"}).json()
    book = next(i for i in page["items"] if i["uid"] == BOOK)
    assert book["progress"]["percent"] == pytest.approx(0.42)
    other = next(i for i in page["items"] if i["uid"] != BOOK)
    assert other["progress"] is None


def test_unknown_progress_is_404(client):
    assert client.get("/v1/progress/calibre:Lib:999").status_code == 404
