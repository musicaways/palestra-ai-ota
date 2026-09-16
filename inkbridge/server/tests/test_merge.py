"""The conflict rule, in isolation."""

from __future__ import annotations

from inkbridge.adapters.suwayomi import SuwayomiAdapter
from inkbridge.models import Kind, ProgressRecord, Status
from inkbridge.services.progress import _status_for, decide


def record(**kwargs) -> ProgressRecord:
    base = {"uid": "calibre:Lib:12", "kind": Kind.BOOK, "percent": 0.5,
            "updated_at": 1000, "device_id": "kobo"}
    return ProgressRecord(**{**base, **kwargs})


def test_first_record_always_applies():
    assert decide(record(), None) == "applied"


def test_newer_wins():
    assert decide(record(updated_at=2000, percent=0.6), record()) == "applied"


def test_older_is_stale():
    assert decide(record(updated_at=500, percent=0.1), record()) == "stale"


def test_identical_state_is_unchanged_even_if_newer():
    """A writeback echo must not burn a revision and wake every device."""
    assert decide(record(updated_at=9999), record()) == "unchanged"


def test_tie_break_is_deterministic():
    a = record(device_id="aaa", percent=0.2)
    b = record(device_id="bbb", percent=0.8)
    assert decide(b, a) == "applied"
    assert decide(a, b) == "stale"


def test_percent_noise_below_epsilon_is_unchanged():
    assert decide(record(percent=0.50001, updated_at=5000), record()) == "unchanged"


def test_locator_change_alone_is_a_real_change():
    older = record(locator="/body/DocFragment[3]")
    newer = record(locator="/body/DocFragment[4]", updated_at=2000)
    assert decide(newer, older) == "applied"


def test_status_thresholds():
    assert _status_for(0.0) is Status.NEW
    assert _status_for(0.42) is Status.READING
    assert _status_for(1.0) is Status.FINISHED


def test_manga_percent_spans_the_series_not_the_chapter():
    adapter = SuwayomiAdapter("http://x")
    # Halfway through chapter 3 of 10 (0-based index 2).
    assert adapter.manga_percent(chapter_index=2, chapters_total=10, page=4, pages=10,
                                 chapter_read=False) == 0.25
    # A finished last chapter is a finished series.
    assert adapter.manga_percent(chapter_index=9, chapters_total=10, page=0, pages=None,
                                 chapter_read=True) == 1.0
    # Unknown page count: the chapter counts as not started.
    assert adapter.manga_percent(chapter_index=1, chapters_total=4, page=0, pages=None,
                                 chapter_read=False) == 0.25


def test_manga_percent_never_leaves_the_unit_interval():
    adapter = SuwayomiAdapter("http://x")
    assert adapter.manga_percent(chapter_index=99, chapters_total=3, page=500, pages=10,
                                 chapter_read=True) == 1.0
    assert adapter.manga_percent(chapter_index=0, chapters_total=0, page=0, pages=0,
                                 chapter_read=False) == 0.0
