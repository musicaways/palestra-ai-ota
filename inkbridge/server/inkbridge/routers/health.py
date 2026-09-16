"""Liveness and a human-readable status page for the hub."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse

from .. import __version__
from ..db import Database
from ..deps import get_catalog, get_db
from ..models import HealthReport
from ..security import require_token
from ..services.catalog import CatalogService

router = APIRouter(tags=["health"])


def _label(source) -> str:
    if source.available:
        return "attiva"
    return "non configurata" if not source.enabled else "non raggiungibile"


@router.get("/health")
def liveness() -> dict:
    """Unauthenticated: container health checks live here."""
    return {"ok": True, "version": __version__}


@router.get("/v1/health", response_model=HealthReport,
            dependencies=[Depends(require_token)])
async def health(catalog: CatalogService = Depends(get_catalog),
                 db: Database = Depends(get_db)) -> HealthReport:
    return HealthReport(
        ok=True,
        version=__version__,
        sources=await catalog.sources(),
        queued_writebacks=db.count_pending(),
    )


@router.get("/", response_class=HTMLResponse, include_in_schema=False)
async def index(catalog: CatalogService = Depends(get_catalog),
                db: Database = Depends(get_db)) -> str:
    rows = []
    for source in await catalog.sources():
        state = "ok" if source.available else ("off" if not source.enabled else "ko")
        rows.append(
            f"<tr><td>{source.name}</td><td class='{state}'>"
            f"{_label(source)}"
            f"</td><td>{source.detail}</td></tr>"
        )
    return f"""<!doctype html>
<html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>InkBridge</title>
<style>
  :root {{ color-scheme: light dark; --fg:#101418; --bg:#fbfbfa; --mut:#6b7280; --line:#e5e7eb; }}
  @media (prefers-color-scheme: dark) {{
    :root {{ --fg:#e8eaed; --bg:#14171a; --mut:#9aa3ad; --line:#2a2f35; }}
  }}
  body {{ font: 16px/1.55 system-ui, sans-serif; color: var(--fg); background: var(--bg);
         margin: 0; padding: 48px 16px; }}
  main {{ max-width: 640px; margin: 0 auto; }}
  h1 {{ font-size: 1.6rem; margin: 0 0 .2em; }}
  p.sub {{ color: var(--mut); margin-top: 0; }}
  table {{ width: 100%; border-collapse: collapse; margin: 24px 0; }}
  td, th {{ text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--line); }}
  .ok {{ color: #15803d; }} .ko {{ color: #b91c1c; }} .off {{ color: var(--mut); }}
  code {{ background: rgba(127,127,127,.14); padding: 1px 5px; border-radius: 4px; }}
</style></head>
<body><main>
<h1>InkBridge</h1>
<p class="sub">Hub di sincronizzazione fra Calibre, Suwayomi e KOReader — v{__version__}</p>
<table><tr><th>Sorgente</th><th>Stato</th><th>Dettaglio</th></tr>{''.join(rows)}</table>
<p>Progressi in attesa di writeback: <strong>{db.count_pending()}</strong> ·
   cursore: <code>{db.cursor()}</code></p>
<p class="sub">API: <a href="/docs">/docs</a> · salute: <code>/health</code></p>
</main></body></html>"""
