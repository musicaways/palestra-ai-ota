"""Wire format shared by the hub and the KOReader plugin."""

from __future__ import annotations

import time
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field, field_validator


def now_ms() -> int:
    return int(time.time() * 1000)


class Kind(StrEnum):
    BOOK = "book"
    MANGA = "manga"


class Status(StrEnum):
    NEW = "new"
    READING = "reading"
    FINISHED = "finished"


class Source(BaseModel):
    id: str  # "calibre" | "suwayomi"
    name: str
    kind: Kind
    enabled: bool
    available: bool
    detail: str = ""


class ProgressRecord(BaseModel):
    uid: str
    kind: Kind
    percent: float = 0.0
    locator: str | None = None
    chapter_uid: str | None = None
    page: int | None = None
    pages: int | None = None
    status: Status = Status.READING
    device_id: str = ""
    device_name: str = ""
    updated_at: int = Field(default_factory=now_ms)
    revision: int = 0
    upstream_synced_at: int | None = None
    upstream_error: str | None = None

    @field_validator("percent")
    @classmethod
    def _clamp(cls, value: float) -> float:
        return min(1.0, max(0.0, float(value)))


class Item(BaseModel):
    """A book or a manga, normalised across both back ends."""

    uid: str
    kind: Kind
    source: str
    title: str
    authors: list[str] = Field(default_factory=list)
    series: str | None = None
    series_index: float | None = None
    tags: list[str] = Field(default_factory=list)
    description: str | None = None
    language: str | None = None
    cover_url: str | None = None
    formats: list[str] = Field(default_factory=list)
    size: int | None = None
    # Manga only.
    chapter_count: int | None = None
    unread_count: int | None = None
    # Progress is attached by the catalogue service when known.
    progress: ProgressRecord | None = None


class Chapter(BaseModel):
    uid: str
    manga_uid: str
    name: str
    index: int
    pages: int | None = None
    read: bool = False
    last_page_read: int = 0
    uploaded_at: int | None = None
    downloaded: bool = False


class ItemPage(BaseModel):
    items: list[Item]
    total: int
    offset: int
    limit: int


class ProgressPush(BaseModel):
    records: list[ProgressRecord]
    device_id: str = ""
    device_name: str = ""


class PushOutcome(BaseModel):
    uid: str
    result: Literal["applied", "stale", "unchanged"]
    record: ProgressRecord


class ProgressPushResult(BaseModel):
    outcomes: list[PushOutcome]
    cursor: int


class ProgressPull(BaseModel):
    records: list[ProgressRecord]
    cursor: int
    server_time: int = Field(default_factory=now_ms)


class HealthReport(BaseModel):
    ok: bool
    version: str
    server_time: int = Field(default_factory=now_ms)
    sources: list[Source]
    queued_writebacks: int = 0
