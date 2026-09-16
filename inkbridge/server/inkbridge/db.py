"""SQLite persistence for progress records, devices and the delta cursor.

The store is deliberately tiny: a handful of rows per book.  It is the only
piece of state the hub owns — the catalogue itself always comes from Calibre
and Suwayomi, never from here.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from collections.abc import Iterable, Iterator
from contextlib import contextmanager
from pathlib import Path

from .models import Kind, ProgressRecord, Status, now_ms

SCHEMA = """
CREATE TABLE IF NOT EXISTS progress (
    uid                 TEXT PRIMARY KEY,
    kind                TEXT NOT NULL,
    percent             REAL NOT NULL DEFAULT 0,
    locator             TEXT,
    chapter_uid         TEXT,
    page                INTEGER,
    pages               INTEGER,
    status              TEXT NOT NULL DEFAULT 'reading',
    device_id           TEXT NOT NULL DEFAULT '',
    device_name         TEXT NOT NULL DEFAULT '',
    updated_at          INTEGER NOT NULL,
    revision            INTEGER NOT NULL,
    upstream_synced_at  INTEGER,
    upstream_error      TEXT
);
CREATE INDEX IF NOT EXISTS progress_revision ON progress(revision);
CREATE INDEX IF NOT EXISTS progress_dirty ON progress(upstream_synced_at, revision);

CREATE TABLE IF NOT EXISTS devices (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL DEFAULT '',
    last_seen     INTEGER NOT NULL,
    last_cursor   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS meta (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);

-- Maps a device-side document (by its content hash or file name) to a catalogue
-- UID, so a book copied to the Kobo by hand can still be recognised.
CREATE TABLE IF NOT EXISTS aliases (
    alias  TEXT PRIMARY KEY,
    uid    TEXT NOT NULL,
    added  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS aliases_uid ON aliases(uid);
"""

_COLUMNS = (
    "uid", "kind", "percent", "locator", "chapter_uid", "page", "pages",
    "status", "device_id", "device_name", "updated_at", "revision",
    "upstream_synced_at", "upstream_error",
)


class Database:
    def __init__(self, path: Path | str) -> None:
        self._path = Path(path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        # check_same_thread=False + an explicit lock: FastAPI runs handlers on a
        # thread pool and the write volume here is a few rows per minute.
        self._conn = sqlite3.connect(self._path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA foreign_keys=ON")
        self._lock = threading.RLock()
        with self._lock:
            self._conn.executescript(SCHEMA)
            self._conn.commit()

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    @contextmanager
    def _tx(self) -> Iterator[sqlite3.Connection]:
        with self._lock:
            try:
                yield self._conn
                self._conn.commit()
            except Exception:
                self._conn.rollback()
                raise

    # -- cursor -------------------------------------------------------------

    def cursor(self) -> int:
        with self._lock:
            row = self._conn.execute("SELECT value FROM meta WHERE key='cursor'").fetchone()
        return int(row["value"]) if row else 0

    def _next_revision(self, conn: sqlite3.Connection) -> int:
        row = conn.execute("SELECT value FROM meta WHERE key='cursor'").fetchone()
        nxt = (int(row["value"]) if row else 0) + 1
        conn.execute(
            "INSERT INTO meta(key, value) VALUES('cursor', ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (str(nxt),),
        )
        return nxt

    # -- progress -----------------------------------------------------------

    @staticmethod
    def _to_record(row: sqlite3.Row) -> ProgressRecord:
        return ProgressRecord(
            uid=row["uid"],
            kind=Kind(row["kind"]),
            percent=row["percent"],
            locator=row["locator"],
            chapter_uid=row["chapter_uid"],
            page=row["page"],
            pages=row["pages"],
            status=Status(row["status"]),
            device_id=row["device_id"],
            device_name=row["device_name"],
            updated_at=row["updated_at"],
            revision=row["revision"],
            upstream_synced_at=row["upstream_synced_at"],
            upstream_error=row["upstream_error"],
        )

    def get(self, uid: str) -> ProgressRecord | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM progress WHERE uid=?", (uid,)).fetchone()
        return self._to_record(row) if row else None

    def get_many(self, uids: Iterable[str]) -> dict[str, ProgressRecord]:
        uids = list(uids)
        if not uids:
            return {}
        out: dict[str, ProgressRecord] = {}
        with self._lock:
            # Chunked to stay clear of SQLite's variable limit on big libraries.
            for start in range(0, len(uids), 400):
                chunk = uids[start:start + 400]
                placeholders = ",".join("?" * len(chunk))
                rows = self._conn.execute(
                    f"SELECT * FROM progress WHERE uid IN ({placeholders})", chunk
                ).fetchall()
                for row in rows:
                    out[row["uid"]] = self._to_record(row)
        return out

    def since(self, cursor: int, limit: int = 500) -> list[ProgressRecord]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM progress WHERE revision > ? ORDER BY revision ASC LIMIT ?",
                (cursor, limit),
            ).fetchall()
        return [self._to_record(row) for row in rows]

    def store(self, record: ProgressRecord, *, upstream_dirty: bool = True) -> ProgressRecord:
        """Write ``record`` unconditionally and hand back the stored version."""
        with self._tx() as conn:
            revision = self._next_revision(conn)
            synced_at = None if upstream_dirty else record.upstream_synced_at
            conn.execute(
                """
                INSERT INTO progress (uid, kind, percent, locator, chapter_uid, page, pages,
                                      status, device_id, device_name, updated_at, revision,
                                      upstream_synced_at, upstream_error)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(uid) DO UPDATE SET
                    kind=excluded.kind, percent=excluded.percent, locator=excluded.locator,
                    chapter_uid=excluded.chapter_uid, page=excluded.page, pages=excluded.pages,
                    status=excluded.status, device_id=excluded.device_id,
                    device_name=excluded.device_name, updated_at=excluded.updated_at,
                    revision=excluded.revision, upstream_synced_at=excluded.upstream_synced_at,
                    upstream_error=excluded.upstream_error
                """,
                (
                    record.uid, str(record.kind), record.percent, record.locator,
                    record.chapter_uid, record.page, record.pages, str(record.status),
                    record.device_id, record.device_name, record.updated_at, revision,
                    synced_at, record.upstream_error,
                ),
            )
        stored = record.model_copy(update={"revision": revision, "upstream_synced_at": synced_at})
        return stored

    def mark_upstream(self, uid: str, *, error: str | None) -> None:
        with self._tx() as conn:
            conn.execute(
                "UPDATE progress SET upstream_synced_at=?, upstream_error=? WHERE uid=?",
                (None if error else now_ms(), error, uid),
            )

    def pending_writebacks(self, limit: int = 200) -> list[ProgressRecord]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM progress WHERE upstream_synced_at IS NULL "
                "ORDER BY revision ASC LIMIT ?",
                (limit,),
            ).fetchall()
        return [self._to_record(row) for row in rows]

    def count_pending(self) -> int:
        with self._lock:
            row = self._conn.execute(
                "SELECT COUNT(*) AS n FROM progress WHERE upstream_synced_at IS NULL"
            ).fetchone()
        return int(row["n"])

    # -- devices ------------------------------------------------------------

    def touch_device(self, device_id: str, name: str = "", cursor: int | None = None) -> None:
        if not device_id:
            return
        with self._tx() as conn:
            conn.execute(
                "INSERT INTO devices(id, name, last_seen, last_cursor) VALUES(?,?,?,?) "
                "ON CONFLICT(id) DO UPDATE SET "
                "  name=CASE WHEN excluded.name <> '' THEN excluded.name ELSE devices.name END,"
                "  last_seen=excluded.last_seen,"
                "  last_cursor=MAX(devices.last_cursor, excluded.last_cursor)",
                (device_id, name, now_ms(), cursor or 0),
            )

    def devices(self) -> list[dict]:
        with self._lock:
            rows = self._conn.execute("SELECT * FROM devices ORDER BY last_seen DESC").fetchall()
        return [dict(row) for row in rows]

    # -- aliases ------------------------------------------------------------

    def resolve_alias(self, alias: str) -> str | None:
        with self._lock:
            row = self._conn.execute("SELECT uid FROM aliases WHERE alias=?", (alias,)).fetchone()
        return row["uid"] if row else None

    def add_alias(self, alias: str, uid: str) -> None:
        with self._tx() as conn:
            conn.execute(
                "INSERT INTO aliases(alias, uid, added) VALUES(?,?,?) "
                "ON CONFLICT(alias) DO UPDATE SET uid=excluded.uid",
                (alias, uid, now_ms()),
            )

    # -- misc ---------------------------------------------------------------

    def get_meta(self, key: str, default: object = None) -> object:
        with self._lock:
            row = self._conn.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        if not row:
            return default
        try:
            return json.loads(row["value"])
        except json.JSONDecodeError:
            return row["value"]

    def set_meta(self, key: str, value: object) -> None:
        with self._tx() as conn:
            conn.execute(
                "INSERT INTO meta(key, value) VALUES(?,?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (key, json.dumps(value)),
            )
