# Stato del progetto

> Descrive **il presente**. Quando una riga non è più vera si sostituisce, non
> si accumula. Ultimo aggiornamento: 2026-09-18 · aggiornato da: claude

## In una riga

InkBridge v1.0.0 è **completo come codice e verificato dai test**, ma non è
ancora stato eseguito su hardware reale: manca il primo collaudo su un Kobo
Libra Color vero e contro un Calibre e un Suwayomi veri.

## Versione e collocazione

| | |
|---|---|
| Versione | `1.0.0` (nessuna release pubblicata) |
| Repository | `musicaways/palestra-ai-ota`, tutto sotto `inkbridge/` |
| Branch di lavoro | `claude/kobo-reader-ebook-manga-app-8zqkn4` |
| Pull request | [#1](https://github.com/musicaways/palestra-ai-ota/pull/1), in bozza |
| Base | `main` |

Il repository nasce come canale OTA di Palestra AI: InkBridge ci convive senza
toccare `version.json` né il README originale. Se un giorno diventa un
repository suo, `scripts/export-standalone.sh` lo estrae già pronto.

## Cosa funziona (verificato dai test)

**Hub (`server/`)** — FastAPI, Python 3.11+

* catalogo unificato Calibre + Suwayomi con UID stabili, cache TTL, copertine in proxy;
* download ebook in streaming, capitoli manga impacchettati in CBZ al volo;
* merge dei progressi last-writer-wins con tie-break deterministico;
* writeback verso Calibre (`pos_frac`) e Suwayomi (`lastPageRead`/`isRead`);
* poll delle letture fatte altrove, con difesa contro il rientro del proprio eco;
* endpoint KOSync-compatibili;
* **63 test** (`pytest`) verdi, `ruff` pulito.

**Plugin (`koplugin/inkbridge.koplugin/`)** — Lua, KOReader

* griglia di copertine, vista a elenco, ricerca, tasti pagina e gesti;
* download di libri e capitoli con avanzamento annullabile;
* motore di sincronizzazione con coda offline, delta pull, scrittura nel
  sidecar dei documenti chiusi, richiesta di conferma sui conflitti veri;
* secondo back end «diretto» senza hub, con writer CBZ in Lua puro;
* **59 test** (`lua5.1 tests/run.lua`) verdi, sintassi verificata con `luac5.1 -p`.

**Documentazione (`docs/`)** — architettura, installazione sul Libra Color,
riferimento API, limiti noti. Tutta in italiano.

## Cosa non è ancora successo

1. **Nessun collaudo reale.** Il codice non ha mai parlato con un Kobo, con un
   `calibre-server` o con un Suwayomi veri. È la cosa che conta di più:
   attività `IB-001`.
2. **Nessuna immagine Docker pubblicata**: l'hub si costruisce in locale con
   `docker compose build`.
3. **Nessuna release**, nessun tag git.
4. Le versioni di Suwayomi in circolazione hanno schemi GraphQL diversi: il
   codice degrada invece di rompersi, ma quale variante risponde sul NAS di casa
   si scopre solo provando.

## Come si verifica il lavoro

```bash
cd inkbridge
./scripts/setup-dev.sh     # una volta: dipendenze Python e Lua
./scripts/check.sh         # sempre, prima di ogni commit
```

`check.sh` esegue nell'ordine: `ruff`, `pytest`, i test Lua, il controllo di
sintassi su ogni file Lua. Esce diverso da zero al primo fallimento.

## Chi sta facendo cosa

Nessuna attività è in corso in questo momento. L'elenco completo, con gli
identificativi da citare nei commit, è in [`ATTIVITA.md`](ATTIVITA.md).
