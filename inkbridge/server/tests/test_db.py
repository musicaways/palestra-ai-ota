from __future__ import annotations

from inkbridge.db import Database
from inkbridge.models import Kind, ProgressRecord


def make_db(tmp_path) -> Database:
    return Database(tmp_path / "test.db")


def record(uid: str, **kwargs) -> ProgressRecord:
    return ProgressRecord(uid=uid, kind=Kind.BOOK, **kwargs)


def test_store_assigns_monotonic_revisions(tmp_path):
    db = make_db(tmp_path)
    first = db.store(record("a", percent=0.1))
    second = db.store(record("b", percent=0.2))
    third = db.store(record("a", percent=0.3))
    assert first.revision < second.revision < third.revision
    assert db.cursor() == third.revision


def test_since_returns_only_newer_revisions(tmp_path):
    db = make_db(tmp_path)
    db.store(record("a"))
    cursor = db.cursor()
    db.store(record("b"))
    assert [r.uid for r in db.since(cursor)] == ["b"]
    assert [r.uid for r in db.since(0)] == ["a", "b"]


def test_updating_a_uid_moves_it_to_the_end_of_the_delta(tmp_path):
    db = make_db(tmp_path)
    db.store(record("a"))
    db.store(record("b"))
    db.store(record("a", percent=0.9))
    assert [r.uid for r in db.since(0)] == ["b", "a"]


def test_writeback_bookkeeping(tmp_path):
    db = make_db(tmp_path)
    db.store(record("a"))
    assert db.count_pending() == 1
    db.mark_upstream("a", error="calibre offline")
    assert db.count_pending() == 1
    assert db.get("a").upstream_error == "calibre offline"
    db.mark_upstream("a", error=None)
    assert db.count_pending() == 0
    assert db.get("a").upstream_synced_at is not None


def test_store_without_dirtying_upstream(tmp_path):
    db = make_db(tmp_path)
    db.store(record("a"), upstream_dirty=False)
    db.mark_upstream("a", error=None)
    assert db.pending_writebacks() == []


def test_get_many_handles_large_id_lists(tmp_path):
    db = make_db(tmp_path)
    uids = [f"calibre:Lib:{i}" for i in range(900)]
    for uid in uids:
        db.store(record(uid))
    found = db.get_many(uids + ["missing"])
    assert len(found) == 900


def test_aliases_and_devices(tmp_path):
    db = make_db(tmp_path)
    db.add_alias("kosync:abc", "calibre:Lib:12")
    assert db.resolve_alias("kosync:abc") == "calibre:Lib:12"
    db.add_alias("kosync:abc", "calibre:Lib:34")
    assert db.resolve_alias("kosync:abc") == "calibre:Lib:34"
    db.touch_device("kobo-1", "Kobo Libra Color", 5)
    db.touch_device("kobo-1", "", 3)
    device = db.devices()[0]
    assert device["name"] == "Kobo Libra Color"
    assert device["last_cursor"] == 5  # never goes backwards
