"""FastAPI application factory."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import Settings, get_settings
from .db import Database
from .routers import health, kosync, library, progress
from .services.catalog import CatalogService
from .services.progress import ProgressService

log = logging.getLogger("inkbridge")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = settings
        app.state.db = Database(settings.db_path)
        app.state.catalog = CatalogService(settings, app.state.db)
        app.state.progress = ProgressService(settings, app.state.db, app.state.catalog)
        app.state.progress.start()
        log.info("InkBridge %s avviato (calibre=%s, suwayomi=%s)", __version__,
                 settings.calibre_enabled, settings.suwayomi_enabled)
        try:
            yield
        finally:
            await app.state.progress.stop()
            await app.state.catalog.aclose()
            app.state.db.close()

    app = FastAPI(
        title="InkBridge",
        version=__version__,
        summary="Catalogo unificato e sincronizzazione della lettura fra Calibre, "
                "Suwayomi e KOReader.",
        lifespan=lifespan,
    )
    # The status page is same-origin; CORS is here only so a browser tool on the
    # LAN can poke the API while you debug.
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"https?://.*",
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(library.router)
    app.include_router(progress.router)
    app.include_router(kosync.router)
    return app


app = create_app()
