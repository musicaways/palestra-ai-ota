"""Application-wide singletons, resolved through FastAPI's dependency system."""

from __future__ import annotations

from fastapi import Request

from .db import Database
from .services.catalog import CatalogService
from .services.progress import ProgressService


def get_db(request: Request) -> Database:
    return request.app.state.db


def get_catalog(request: Request) -> CatalogService:
    return request.app.state.catalog


def get_progress(request: Request) -> ProgressService:
    return request.app.state.progress
