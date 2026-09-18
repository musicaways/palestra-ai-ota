# InkBridge — istruzioni per gli assistenti

Le regole generali stanno in [`../AGENTS.md`](../AGENTS.md). Qui c'è solo quello
che serve avendo già le mani in questa cartella.

## Mappa

```
inkbridge/
  memoria/        memoria condivisa fra gli assistenti — si legge per prima
  server/         hub FastAPI sul NAS (Python 3.11+)
    inkbridge/adapters/   Calibre e Suwayomi
    inkbridge/services/   catalogo, merge dei progressi, CBZ
    inkbridge/routers/    API HTTP
    tests/                63 test, pytest
  koplugin/       plugin KOReader (Lua, LuaJIT)
    inkbridge.koplugin/lib/   moduli del plugin
    tests/                    59 test, runner autonomo con KOReader simulato
  docs/           architettura, installazione, API, limiti
  scripts/        setup, verifica, memoria, installazione sul Kobo, export
```

## Verifica

```bash
./scripts/check.sh       # tutto: ruff, pytest, test Lua, sintassi Lua
make test                # lo stesso
```

Su un file solo, mentre lavori:

```bash
cd server && python -m pytest tests/test_sync_flow.py -q
luac5.1 -p koplugin/inkbridge.koplugin/lib/sync.lua
```

## Dove mettere le mani, per tipo di modifica

| Se cambi… | Guarda anche |
|---|---|
| la forma di un record di progresso | `server/inkbridge/models.py`, `koplugin/…/lib/sync.lua`, `docs/api.md`, `memoria/GLOSSARIO.md` |
| la regola di merge | `server/inkbridge/services/progress.py` (`decide`), `memoria/INVARIANTI.md`, `server/tests/test_merge.py` |
| un endpoint | `server/inkbridge/routers/`, `koplugin/…/lib/backend_hub.lua`, `docs/api.md` |
| l'interfaccia del plugin | `koplugin/…/lib/browser.lua`, `covergrid.lua`, `detail.lua`, `chapters.lua` |
| le impostazioni | `koplugin/…/lib/config.lua` (default) **e** `lib/settings_ui.lua` (voce di menu) |

Una modifica al protocollo che tocca un solo lato lo rompe: hub e plugin
parlano la stessa lingua e vanno cambiati insieme.

## Trappole note

* I moduli Lua del plugin si richiamano con `require("lib/nome")`; `main.lua`
  aggiunge da sé la cartella del plugin a `package.path`, non fidarti del
  caricatore.
* I test Lua girano con KOReader **simulato** (`koplugin/tests/stubs.lua`): se usi
  un modulo di KOReader non ancora simulato, aggiungilo lì.
* `server/tests/conftest.py` simula Calibre e Suwayomi con `httpx.MockTransport`:
  i test esercitano davvero router, servizi e adapter, solo i socket sono finti.
* Le pagine sono 1-based sul dispositivo e 0-based su Suwayomi. La conversione
  sta in un punto solo (`_writeback_suwayomi`): non replicarla altrove.
