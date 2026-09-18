# Diario delle versioni

Formato [Keep a Changelog](https://keepachangelog.com/it/1.1.0/),
versioni secondo [SemVer](https://semver.org/lang/it/).

Le voci descrivono cosa cambia **per chi usa InkBridge**, non i commit: per
quelli c'è `git log`.

## [Non rilasciato]

### Aggiunto
- Memoria condivisa del progetto in `memoria/`: stato, attività, decisioni,
  invarianti, diario, domande aperte e glossario, in file di testo versionati
  che Claude Code e Codex leggono e aggiornano allo stesso modo.
- `AGENTS.md` e `CLAUDE.md`: stesse regole di lavoro per qualunque assistente.
- `scripts/setup-dev.sh` (prepara Python e Lua), `scripts/check.sh` (tutti i
  controlli in un comando), `scripts/memoria.sh` (diario, domande, stato),
  `scripts/export-standalone.sh` (estrae il progetto in un repository suo).
- `Makefile` con le scorciatoie di uso quotidiano.
- Integrazione continua su GitHub Actions: gli stessi controlli di `check.sh`
  a ogni push che tocca `inkbridge/`.
- Guida allo sviluppo in locale (`docs/sviluppo-locale.md`), guida al
  contributo (`CONTRIBUTING.md`), roadmap (`ROADMAP.md`), licenza MIT.

## [1.0.0] — 2026-09-16

Prima versione completa. Non ancora collaudata su hardware reale.

### Hub (`server/`)
- Catalogo unificato di Calibre e Suwayomi con identificativi stabili, cache a
  scadenza e copertine servite in proxy.
- Download degli ebook in streaming dal server Calibre, senza copie temporanee.
- Capitoli manga impacchettati in CBZ al volo a partire dalle pagine sciolte di
  Suwayomi: l'archivio comincia ad arrivare al lettore prima di essere finito.
- Sincronizzazione dei progressi con regola «vince il più recente» e spareggio
  deterministico, coda di scrittura verso Calibre (`pos_frac`) e Suwayomi
  (`lastPageRead`, `isRead`).
- Lettura periodica di Calibre e Suwayomi per intercettare le letture fatte
  altrove, con riconoscimento del proprio eco per non rimbalzare all'infinito.
- Endpoint compatibili con KOSync, per dispositivi KOReader senza il plugin.
- Pagina di stato leggibile su `/` e documentazione API su `/docs`.
- 63 test automatici.

### Plugin KOReader (`koplugin/`)
- Griglia di copertine con barra di avanzamento, vista a elenco alternativa,
  ricerca per titolo, autore e tag.
- Navigazione con i tasti pagina del Libra, gesti coerenti con KOReader.
- Download di libri e capitoli con avanzamento annullabile; i file restano
  visibili anche dal normale gestore file.
- Sincronizzazione nei due sensi: coda che sopravvive al Wi-Fi spento, recupero
  incrementale dei cambiamenti, scrittura della posizione nel sidecar dei libri
  chiusi, richiesta di conferma solo quando la differenza è rilevante.
- Modalità diretta senza hub, con confezionamento dei CBZ a bordo.
- 59 test automatici, con i moduli di KOReader simulati.

### Documentazione
- Architettura, installazione passo passo sul Kobo Libra Color, riferimento
  API e limiti noti — in italiano.
