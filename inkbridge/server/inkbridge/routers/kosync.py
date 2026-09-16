"""KOSync-compatible endpoints.

A KOReader device without the InkBridge plugin speaks this protocol out of the
box (Tools -> Progress sync).  Pointing it at the hub puts its progress in the
same store, so a book read on a plain KOReader install still lands in Calibre.

Documents are identified by KOReader's own hash, not by a catalogue UID.  The
plugin registers the mapping through ``POST /v1/aliases``; without a mapping the
record is still stored, just under a ``kosync:<hash>`` UID, and it syncs between
KOSync devices even though it has nowhere upstream to go.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from ..db import Database
from ..deps import get_db, get_progress
from ..models import Kind, ProgressRecord, Status, now_ms
from ..services.progress import ProgressService

router = APIRouter(tags=["kosync"])


class AuthOk(BaseModel):
    authorized: str = "OK"


class PutProgress(BaseModel):
    document: str
    progress: str = ""
    percentage: float = 0.0
    device: str = ""
    device_id: str = Field(default="", alias="device_id")

    model_config = {"populate_by_name": True}


class PutProgressResult(BaseModel):
    document: str
    timestamp: int


class GetProgressResult(BaseModel):
    document: str
    progress: str = ""
    percentage: float = 0.0
    device: str = ""
    device_id: str = ""
    timestamp: int = 0


def _uid_for(db: Database, document: str) -> str:
    return db.resolve_alias(f"kosync:{document}") or db.resolve_alias(document) \
        or f"kosync:{document}"


@router.get("/users/auth", response_model=AuthOk)
def auth(x_auth_user: str = Header(default=""), x_auth_key: str = Header(default="")) -> AuthOk:
    # The hub's own bearer token is the real gate; KOSync credentials are
    # accepted as-is so any username/password pair configured on the device works.
    if not x_auth_user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return AuthOk()


@router.post("/users/create", response_model=AuthOk, status_code=201)
def create_user(payload: dict) -> AuthOk:
    if not payload.get("username"):
        raise HTTPException(status_code=400, detail="username mancante")
    return AuthOk()


@router.put("/syncs/progress", response_model=PutProgressResult)
def put_progress(payload: PutProgress, db: Database = Depends(get_db),
                 progress: ProgressService = Depends(get_progress)) -> PutProgressResult:
    uid = _uid_for(db, payload.document)
    percent = payload.percentage
    percent = percent / 100.0 if percent > 1.0 else percent
    record = ProgressRecord(
        uid=uid,
        kind=Kind.MANGA if uid.startswith("suwayomi:") else Kind.BOOK,
        percent=percent,
        locator=payload.progress or None,
        status=Status.FINISHED if percent >= 0.99 else Status.READING,
        device_id=payload.device_id or payload.device or "kosync",
        device_name=payload.device or "KOReader",
        updated_at=now_ms(),
    )
    progress.push([record], device_id=record.device_id, device_name=record.device_name)
    return PutProgressResult(document=payload.document, timestamp=record.updated_at // 1000)


@router.get("/syncs/progress/{document}", response_model=GetProgressResult)
def get_progress(document: str, db: Database = Depends(get_db)) -> GetProgressResult:
    record = db.get(_uid_for(db, document))
    if record is None:
        return GetProgressResult(document=document)
    return GetProgressResult(
        document=document,
        progress=record.locator or "",
        percentage=record.percent,
        device=record.device_name,
        device_id=record.device_id,
        timestamp=record.updated_at // 1000,
    )
