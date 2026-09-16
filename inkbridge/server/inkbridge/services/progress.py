"""Progress merge, writeback and upstream polling.

This is the only place in the project where "who is right" gets decided, so the
rule is kept small enough to hold in your head:

    the record with the newest ``updated_at`` wins; ties go to the highest
    ``device_id`` so that two devices syncing in the same millisecond still
    converge on the same answer.

Everything else — writeback to Calibre/Suwayomi, polling them for changes made
elsewhere — feeds records into that same rule instead of bypassing it.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from typing import Literal

from ..adapters.base import AdapterError
from ..adapters.calibre import parse_uid as parse_calibre_uid
from ..adapters.suwayomi import parse_uid as parse_suwayomi_uid
from ..config import Settings
from ..db import Database
from ..models import (
    Kind,
    ProgressPull,
    ProgressPushResult,
    ProgressRecord,
    PushOutcome,
    Status,
    now_ms,
)
from .catalog import CALIBRE, SUWAYOMI, CatalogService

log = logging.getLogger("inkbridge.progress")

Decision = Literal["applied", "stale", "unchanged"]

# Percent differences below this are noise (a single page of a long novel).
EPSILON = 5e-4
# Writeback marks a calibre position with this device name; polling skips them
# so the hub never re-imports its own echo.
WRITEBACK_TAG = "inkbridge"


def decide(incoming: ProgressRecord, existing: ProgressRecord | None) -> Decision:
    """Pure conflict rule — see the module docstring."""
    if existing is None:
        return "applied"
    if _same_state(incoming, existing):
        return "unchanged"
    if incoming.updated_at > existing.updated_at:
        return "applied"
    if incoming.updated_at < existing.updated_at:
        return "stale"
    # Same instant, different content: break the tie deterministically.
    return "applied" if incoming.device_id > existing.device_id else "stale"


def _same_state(a: ProgressRecord, b: ProgressRecord) -> bool:
    return (
        abs(a.percent - b.percent) < EPSILON
        and (a.chapter_uid or "") == (b.chapter_uid or "")
        and a.status == b.status
        and (a.locator or "") == (b.locator or "")
    )


class ProgressService:
    def __init__(self, settings: Settings, db: Database, catalog: CatalogService) -> None:
        self.settings = settings
        self.db = db
        self.catalog = catalog
        self._writeback_lock = asyncio.Lock()
        self._poll_lock = asyncio.Lock()
        self._task: asyncio.Task | None = None
        self._stopping = asyncio.Event()

    # -- device facing ------------------------------------------------------

    def pull(self, cursor: int = 0, limit: int = 500) -> ProgressPull:
        records = self.db.since(cursor, limit)
        next_cursor = records[-1].revision if records else max(cursor, self.db.cursor())
        return ProgressPull(records=records, cursor=next_cursor)

    def push(self, records: list[ProgressRecord], *, device_id: str = "",
             device_name: str = "") -> ProgressPushResult:
        outcomes: list[PushOutcome] = []
        for incoming in records:
            if device_id and not incoming.device_id:
                incoming = incoming.model_copy(update={"device_id": device_id,
                                                       "device_name": device_name})
            existing = self.db.get(incoming.uid)
            result = decide(incoming, existing)
            # On "stale"/"unchanged" the device gets the authoritative record
            # back and applies it locally.
            stored = self.db.store(incoming) if result == "applied" else (existing or incoming)
            outcomes.append(PushOutcome(uid=incoming.uid, result=result, record=stored))
        cursor = self.db.cursor()
        self.db.touch_device(device_id, device_name, cursor)
        if any(o.result == "applied" for o in outcomes):
            # Don't make the device wait for Calibre/Suwayomi.
            _spawn(self.writeback_once())
        return ProgressPushResult(outcomes=outcomes, cursor=cursor)

    def record_for(self, uid: str) -> ProgressRecord | None:
        return self.db.get(uid)

    # -- writeback ----------------------------------------------------------

    async def writeback_once(self, limit: int = 100) -> int:
        """Push pending records to Calibre/Suwayomi.  Returns how many succeeded."""
        if self._writeback_lock.locked():
            return 0
        async with self._writeback_lock:
            pending = self.db.pending_writebacks(limit)
            done = 0
            for record in pending:
                try:
                    await self._writeback(record)
                except AdapterError as exc:
                    log.warning("writeback %s fallito: %s", record.uid, exc)
                    self.db.mark_upstream(record.uid, error=str(exc))
                except Exception as exc:  # noqa: BLE001 - never kill the loop
                    log.exception("writeback %s: errore inatteso", record.uid)
                    self.db.mark_upstream(record.uid, error=repr(exc))
                else:
                    self.db.mark_upstream(record.uid, error=None)
                    done += 1
            return done

    async def _writeback(self, record: ProgressRecord) -> None:
        if record.uid.startswith(CALIBRE + ":"):
            await self._writeback_calibre(record)
        elif record.uid.startswith(SUWAYOMI + ":"):
            await self._writeback_suwayomi(record)
        else:
            raise AdapterError("progress", f"UID non gestito: {record.uid}")

    async def _writeback_calibre(self, record: ProgressRecord) -> None:
        adapter = self.catalog.calibre
        if adapter is None:
            raise AdapterError(CALIBRE, "sorgente non configurata")
        if not adapter.write_positions:
            return
        _, book_id = parse_calibre_uid(record.uid)
        item = await self.catalog.item(record.uid, with_progress=False)
        fmt = adapter.best_format(item.formats) or "epub"
        if await self._calibre_is_ahead(record, book_id, fmt):
            # Someone read further in calibre while this record waited in the
            # queue (offline device, calibre restarting).  Writing now would
            # roll their position back, so import theirs instead.
            return
        # calibre's own store expects an EPUB CFI.  A KOReader xpointer would be
        # meaningless there, so only a real CFI is forwarded; the percentage is
        # always sent and is what calibre's library view shows.
        cfi = record.locator if (record.locator or "").startswith("epubcfi(") else ""
        await adapter.set_position(
            book_id, fmt, pos_frac=record.percent, cfi=cfi,
            device=f"{WRITEBACK_TAG}:{record.device_name or record.device_id or 'kobo'}",
        )

    async def _writeback_suwayomi(self, record: ProgressRecord) -> None:
        adapter = self.catalog.suwayomi
        if adapter is None:
            raise AdapterError(SUWAYOMI, "sorgente non configurata")
        if not adapter.write_positions:
            return
        if not record.chapter_uid:
            return  # series-level percentage only: nothing chapter-shaped to write
        _, chapter_id = parse_suwayomi_uid(record.chapter_uid)
        page = max(0, (record.page or 1) - 1)  # device pages are 1-based
        pages = record.pages or 0
        within = (page + 1) / pages if pages else 0.0
        read = bool(pages) and within >= self.settings.manga_read_threshold
        await adapter.set_chapter_progress(chapter_id, last_page_read=page, read=read)

    async def _calibre_is_ahead(self, record: ProgressRecord, book_id: int, fmt: str) -> bool:
        """True when calibre holds a newer position than ``record`` (and imports it)."""
        adapter = self.catalog.calibre
        assert adapter is not None
        try:
            entries = await adapter.get_positions(book_id, fmt)
        except AdapterError:
            return False  # can't tell: proceed with the write
        for entry in entries:  # newest first
            if str(entry.get("device") or "").startswith(WRITEBACK_TAG):
                continue
            epoch = entry.get("epoch")
            if not epoch:
                continue
            updated_at = int(float(epoch) * 1000)
            if updated_at <= record.updated_at:
                return False
            incoming = ProgressRecord(
                uid=record.uid,
                kind=Kind.BOOK,
                percent=float(entry.get("pos_frac") or 0.0),
                locator=entry.get("cfi") or None,
                status=_status_for(float(entry.get("pos_frac") or 0.0)),
                device_id=f"upstream:{CALIBRE}",
                device_name=str(entry.get("device") or "Calibre"),
                updated_at=updated_at,
            )
            if decide(incoming, self.db.get(record.uid)) == "applied":
                self.db.store(incoming, upstream_dirty=False)
            return True
        return False

    # -- upstream polling ---------------------------------------------------

    async def poll_upstream(self) -> int:
        """Import reading progress made outside InkBridge.  Returns records applied."""
        if self._poll_lock.locked():
            return 0
        async with self._poll_lock:
            applied = 0
            if self.catalog.calibre is not None:
                applied += await self._poll_calibre()
            if self.catalog.suwayomi is not None:
                applied += await self._poll_suwayomi()
            return applied

    async def _poll_calibre(self, limit: int = 200) -> int:
        """Re-read positions for books we already track.

        calibre has no "what changed since" endpoint, so polling the whole
        library would mean one request per book.  Books the hub has never seen
        have no progress to import anyway — they show up as unread either way —
        so the poll is scoped to what is already in the store.
        """
        adapter = self.catalog.calibre
        assert adapter is not None
        tracked = [r for r in self.db.since(0, 10_000)
                   if r.uid.startswith(CALIBRE + ":")][-limit:]
        applied = 0
        for record in tracked:
            try:
                item = await self.catalog.item(record.uid, with_progress=False)
                fmt = adapter.best_format(item.formats) or "epub"
                _, book_id = parse_calibre_uid(record.uid)
                entries = await adapter.get_positions(book_id, fmt)
            except (AdapterError, ValueError) as exc:
                log.debug("poll calibre %s: %s", record.uid, exc)
                continue
            for entry in entries:
                device = str(entry.get("device") or "")
                if device.startswith(WRITEBACK_TAG):
                    continue  # our own echo
                epoch = entry.get("epoch")
                updated_at = int(float(epoch) * 1000) if epoch else None
                if updated_at is None:
                    continue
                incoming = ProgressRecord(
                    uid=record.uid,
                    kind=Kind.BOOK,
                    percent=float(entry.get("pos_frac") or 0.0),
                    locator=entry.get("cfi") or None,
                    status=_status_for(float(entry.get("pos_frac") or 0.0)),
                    device_id=f"upstream:{CALIBRE}",
                    device_name=device or "Calibre",
                    updated_at=updated_at,
                )
                if decide(incoming, self.db.get(record.uid)) == "applied":
                    # upstream_dirty=False: it already knows, writing back would loop.
                    self.db.store(incoming, upstream_dirty=False)
                    self.db.mark_upstream(incoming.uid, error=None)
                    applied += 1
                break  # entries are newest-first
        return applied

    async def _poll_suwayomi(self) -> int:
        adapter = self.catalog.suwayomi
        assert adapter is not None
        try:
            states = await adapter.library_progress()
        except AdapterError as exc:
            log.debug("poll suwayomi: %s", exc)
            return 0
        applied = 0
        for state in states:
            existing = self.db.get(state["uid"])
            updated_at = state.get("updated_at")
            if updated_at is None:
                # This server does not report lastReadAt: import only as a seed,
                # never to overwrite something the device told us.
                if existing is not None:
                    continue
                updated_at = now_ms()
            percent = adapter.manga_percent(
                chapter_index=state["chapter_index"],
                chapters_total=state["chapters_total"],
                page=state["page"],
                pages=state["pages"],
                chapter_read=state["read"],
            )
            incoming = ProgressRecord(
                uid=state["uid"],
                kind=Kind.MANGA,
                percent=percent,
                chapter_uid=state["chapter_uid"],
                page=state["page"] + 1,
                pages=state["pages"],
                status=_status_for(percent),
                device_id=f"upstream:{SUWAYOMI}",
                device_name="Suwayomi",
                updated_at=int(updated_at),
            )
            if decide(incoming, existing) == "applied":
                self.db.store(incoming, upstream_dirty=False)
                self.db.mark_upstream(incoming.uid, error=None)
                applied += 1
        return applied

    # -- background loop ----------------------------------------------------

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._stopping.clear()
            self._task = asyncio.create_task(self._loop(), name="inkbridge-sync")

    async def stop(self) -> None:
        self._stopping.set()
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(Exception):
                await self._task
            self._task = None

    async def _loop(self) -> None:
        last_poll = 0.0
        while not self._stopping.is_set():
            try:
                # Import first, write second: a record that waited in the queue
                # must not overwrite a fresher position made elsewhere.
                if time.monotonic() - last_poll >= self.settings.poll_interval:
                    last_poll = time.monotonic()
                    count = await self.poll_upstream()
                    if count:
                        log.info("poll upstream: %d progressi importati", count)
                await self.writeback_once()
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001 - a bad cycle must not end the loop
                log.exception("ciclo di sincronizzazione fallito")
            try:
                await asyncio.wait_for(self._stopping.wait(),
                                       timeout=self.settings.writeback_retry_interval)
            except TimeoutError:
                continue


def _status_for(percent: float, *, finished_at: float = 0.99) -> Status:
    if percent >= finished_at:
        return Status.FINISHED
    if percent <= 0.0:
        return Status.NEW
    return Status.READING


def _spawn(coro) -> None:
    try:
        asyncio.get_running_loop().create_task(coro)
    except RuntimeError:  # no loop (unit tests calling push synchronously)
        coro.close()
