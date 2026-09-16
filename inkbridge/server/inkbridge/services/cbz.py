"""Turn a Suwayomi chapter into a CBZ, without buffering it whole.

KOReader reads CBZ natively, Suwayomi serves loose images: this module is the
join between the two.  The archive is produced as a stream, so a 300 MB chapter
never sits in the NAS's RAM and the Kobo starts receiving bytes immediately.
"""

from __future__ import annotations

import logging
import zipfile
from collections.abc import AsyncIterator

log = logging.getLogger("inkbridge.cbz")

_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
}


class StreamBuffer:
    """A write-only file object that hands each written chunk to the caller.

    ``zipfile`` only needs ``write``/``tell``/``flush`` when it cannot seek, and
    entries whose size is known upfront never make it seek back to patch a
    header — which is exactly how :func:`stream_cbz` writes them.
    """

    def __init__(self) -> None:
        self._chunks: list[bytes] = []
        self._offset = 0

    def write(self, data: bytes) -> int:
        self._chunks.append(bytes(data))
        self._offset += len(data)
        return len(data)

    def tell(self) -> int:
        return self._offset

    def flush(self) -> None:  # pragma: no cover - zipfile calls it, we buffer anyway
        return None

    def seekable(self) -> bool:
        return False

    def drain(self) -> bytes:
        if not self._chunks:
            return b""
        data = b"".join(self._chunks)
        self._chunks.clear()
        return data


def page_name(index: int, content_type: str | None, url: str = "") -> str:
    """Zero-padded name so readers keep the page order."""
    extension = _EXTENSIONS.get((content_type or "").split(";")[0].strip().lower())
    if not extension:
        tail = url.rsplit("/", 1)[-1].split("?")[0]
        if "." in tail:
            candidate = "." + tail.rsplit(".", 1)[-1].lower()
            extension = candidate if len(candidate) <= 6 else None
    return f"{index + 1:04d}{extension or '.jpg'}"


async def stream_cbz(
    pages: AsyncIterator[tuple[int, bytes, str | None, str]],
) -> AsyncIterator[bytes]:
    """Yield the bytes of a CBZ built from ``(index, data, content_type, url)``.

    Images are stored uncompressed: JPEG and WebP do not shrink further, and
    deflating them would only cost the NAS CPU time the Kobo is waiting on.
    """
    buffer = StreamBuffer()
    archive = zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_STORED)
    try:
        async for index, data, content_type, url in pages:
            archive.writestr(page_name(index, content_type, url), data)
            chunk = buffer.drain()
            if chunk:
                yield chunk
    finally:
        archive.close()
    tail = buffer.drain()
    if tail:
        yield tail
