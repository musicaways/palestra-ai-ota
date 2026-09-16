"""Progress endpoints — the bidirectional half of InkBridge."""

from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel

from ..db import Database
from ..deps import get_db, get_progress
from ..models import ProgressPull, ProgressPush, ProgressPushResult, ProgressRecord
from ..security import require_token
from ..services.progress import ProgressService

router = APIRouter(prefix="/v1", tags=["progress"], dependencies=[Depends(require_token)])


@router.get("/progress", response_model=ProgressPull)
def pull(
    since: int = Query(default=0, ge=0, description="ultima revision vista dal device"),
    limit: int = Query(default=500, ge=1, le=2000),
    device_id: str = "",
    device_name: str = "",
    progress: ProgressService = Depends(get_progress),
    db: Database = Depends(get_db),
) -> ProgressPull:
    if device_id:
        db.touch_device(device_id, device_name, since)
    return progress.pull(since, limit)


@router.post("/progress", response_model=ProgressPushResult)
def push(
    payload: ProgressPush,
    progress: ProgressService = Depends(get_progress),
) -> ProgressPushResult:
    return progress.push(payload.records, device_id=payload.device_id,
                         device_name=payload.device_name)


@router.get("/progress/{uid}", response_model=ProgressRecord)
def one(uid: str, progress: ProgressService = Depends(get_progress)) -> ProgressRecord:
    record = progress.record_for(uid)
    if record is None:
        raise HTTPException(status_code=404, detail="nessun progresso per questo elemento")
    return record


class SyncReport(BaseModel):
    written_back: int
    imported: int
    pending: int
    cursor: int


@router.post("/sync/run", response_model=SyncReport)
async def run_sync(progress: ProgressService = Depends(get_progress),
                   db: Database = Depends(get_db)) -> SyncReport:
    """Force a writeback + upstream poll now, instead of waiting for the loop."""
    imported = await progress.poll_upstream()
    written = await progress.writeback_once()
    return SyncReport(written_back=written, imported=imported,
                      pending=db.count_pending(), cursor=db.cursor())


class AliasRequest(BaseModel):
    alias: str
    uid: str


@router.post("/aliases", status_code=204)
def add_alias(payload: AliasRequest = Body(...), db: Database = Depends(get_db)) -> None:
    """Bind a device-side document id (e.g. a KOSync hash) to a catalogue UID."""
    db.add_alias(payload.alias, payload.uid)


@router.get("/devices")
def devices(db: Database = Depends(get_db)) -> list[dict]:
    return db.devices()
