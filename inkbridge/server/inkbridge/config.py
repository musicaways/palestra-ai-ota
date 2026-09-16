"""Configuration for the InkBridge hub.

Every setting can be provided through the environment with the ``INKBRIDGE_``
prefix (``INKBRIDGE_CALIBRE_URL=...``) or through a ``.env`` file sitting next
to the service.  See ``.env.example`` for a commented template.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="INKBRIDGE_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- service -----------------------------------------------------------
    host: str = "0.0.0.0"
    port: int = 8577
    data_dir: Path = Path("/data")
    log_level: str = "INFO"

    # Bearer token required by every /v1 endpoint.  Empty disables auth, which
    # is only reasonable on a trusted LAN segment.
    token: str = ""

    # --- Calibre -----------------------------------------------------------
    # URL of calibre-server (the one that serves /opds and /ajax), not calibre-web.
    calibre_url: str = ""
    calibre_username: str = ""
    calibre_password: str = ""
    calibre_library: str = ""  # empty -> the server's default library
    # calibre-server defaults to digest auth; "auto" probes once and remembers.
    calibre_auth_mode: Literal["auto", "basic", "digest"] = "auto"
    # Write reading positions back into calibre's own last-read-position store.
    calibre_write_positions: bool = True
    # Formats we are willing to hand to the device, best first.
    calibre_formats: list[str] = Field(default_factory=lambda: ["kepub", "epub", "cbz", "pdf"])

    # --- Suwayomi ----------------------------------------------------------
    suwayomi_url: str = ""
    suwayomi_username: str = ""
    suwayomi_password: str = ""
    suwayomi_write_positions: bool = True
    # A chapter counts as read past this fraction of its pages.
    manga_read_threshold: float = 0.95

    # --- sync --------------------------------------------------------------
    # Seconds between two polls of Calibre/Suwayomi for externally made changes.
    poll_interval: int = 900
    # Retry cadence for progress records whose upstream writeback failed.
    writeback_retry_interval: int = 120
    # Catalogue cache lifetime in seconds.
    catalog_ttl: int = 300
    http_timeout: float = 30.0

    @field_validator("calibre_url", "suwayomi_url")
    @classmethod
    def _strip_slash(cls, value: str) -> str:
        return value.rstrip("/")

    @field_validator("calibre_formats", mode="before")
    @classmethod
    def _split_formats(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip().lower() for item in value.split(",") if item.strip()]
        return value

    @property
    def db_path(self) -> Path:
        return self.data_dir / "inkbridge.db"

    @property
    def calibre_enabled(self) -> bool:
        return bool(self.calibre_url)

    @property
    def suwayomi_enabled(self) -> bool:
        return bool(self.suwayomi_url)


@lru_cache
def get_settings() -> Settings:
    return Settings()
