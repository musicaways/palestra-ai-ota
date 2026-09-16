"""Catalogue endpoints: what is on the NAS, and how to get it onto the Kobo."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response, StreamingResponse

from ..adapters.base import AdapterError
from ..deps import get_catalog
from ..models import Chapter, ItemPage, Source
from ..security import require_token
from ..services.catalog import CatalogService, safe_filename
from ..services.cbz import stream_cbz

log = logging.getLogger("inkbridge.api.library")

router = APIRouter(prefix="/v1/library", tags=["library"],
                   dependencies=[Depends(require_token)])


def _fail(exc: AdapterError) -> HTTPException:
    return HTTPException(status_code=502, detail=str(exc))


@router.get("/sources", response_model=list[Source])
async def sources(catalog: CatalogService = Depends(get_catalog)) -> list[Source]:
    return await catalog.sources()


@router.get("/items", response_model=ItemPage)
async def items(
    source: str | None = Query(default=None, pattern="^(calibre|suwayomi)$"),
    query: str = "",
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=60, ge=1, le=200),
    sort: str = "timestamp",
    sort_order: str = Query(default="desc", pattern="^(asc|desc)$"),
    catalog: CatalogService = Depends(get_catalog),
) -> ItemPage:
    try:
        return await catalog.list_items(source=source, query=query, offset=offset,
                                        limit=limit, sort=sort, sort_order=sort_order)
    except AdapterError as exc:
        raise _fail(exc) from exc


@router.get("/items/{uid}")
async def item(uid: str, catalog: CatalogService = Depends(get_catalog)):
    try:
        return await catalog.item(uid)
    except AdapterError as exc:
        raise _fail(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/items/{uid}/chapters", response_model=list[Chapter])
async def chapters(uid: str, catalog: CatalogService = Depends(get_catalog)) -> list[Chapter]:
    try:
        return await catalog.chapters(uid)
    except AdapterError as exc:
        raise _fail(exc) from exc


@router.get("/items/{uid}/cover")
async def cover(uid: str, size: str = "400x600",
                catalog: CatalogService = Depends(get_catalog)) -> Response:
    try:
        path, adapter = await catalog.cover_source(uid, size)
        response = await adapter.request("GET", path)
    except AdapterError as exc:
        raise _fail(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return Response(
        content=response.content,
        media_type=response.headers.get("content-type", "image/jpeg"),
        # Covers change about never; let the device keep them.
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/items/{uid}/file")
async def download(uid: str, format: str | None = None,
                   catalog: CatalogService = Depends(get_catalog)) -> StreamingResponse:
    """Stream an ebook straight from calibre, without staging it on the NAS."""
    try:
        path, fmt, filename = await catalog.book_download(uid, format)
        assert catalog.calibre is not None
        upstream, _client = await catalog.calibre.open_stream(path)
    except AdapterError as exc:
        raise _fail(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    async def body() -> AsyncIterator[bytes]:
        try:
            async for chunk in upstream.aiter_bytes(64 * 1024):
                yield chunk
        finally:
            await upstream.aclose()

    headers = {"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"}
    length = upstream.headers.get("content-length")
    if length:
        headers["Content-Length"] = length
    return StreamingResponse(
        body(),
        media_type=upstream.headers.get("content-type", "application/octet-stream"),
        headers=headers,
    )


@router.get("/chapters/{chapter_uid}/cbz")
async def chapter_cbz(chapter_uid: str, name: str = "",
                      catalog: CatalogService = Depends(get_catalog)) -> StreamingResponse:
    """Pack a Suwayomi chapter into a CBZ on the fly."""
    try:
        urls = await catalog.chapter_pages(chapter_uid)
    except AdapterError as exc:
        raise _fail(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not urls:
        raise HTTPException(status_code=404, detail="capitolo senza pagine")
    adapter = catalog.suwayomi
    assert adapter is not None

    async def pages() -> AsyncIterator[tuple[int, bytes, str | None, str]]:
        for index, url in enumerate(urls):
            path = url if url.startswith("http") else url if url.startswith("/") else "/" + url
            response = await adapter.request("GET", path)
            yield index, response.content, response.headers.get("content-type"), url

    filename = f"{safe_filename(name or chapter_uid)}.cbz"
    return StreamingResponse(
        stream_cbz(pages()),
        media_type="application/vnd.comicbook+zip",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )
