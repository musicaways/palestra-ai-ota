# Diario delle sessioni

In **sola aggiunta**, dal più vecchio al più recente. Il passato non si
riscrive: se una voce era sbagliata, lo dice una voce nuova.

Formato di una voce:

```
## AAAA-MM-GG · assistente/persona
Cosa è stato fatto. Cosa resta. Cosa ha sorpreso.
```

Si aggiunge con `./scripts/memoria.sh diario <chi> "<testo>"` oppure a mano.

---

## 2026-09-16 · claude

Prima stesura completa di InkBridge, dal nulla a due componenti funzionanti.

Fatto: hub FastAPI con adapter Calibre e Suwayomi, catalogo unificato, CBZ in
streaming, motore di merge dei progressi con writeback e poll, endpoint
KOSync (63 test); plugin KOReader con griglia di copertine, download,
sincronizzazione bidirezionale con coda offline, secondo back end diretto e
writer CBZ in Lua puro (59 test); documentazione in italiano.

Tre bug veri emersi dai test, tutti corretti: il token veniva letto dalle
variabili d'ambiente invece che dalla configurazione dell'app (autenticazione di
fatto disattivata nei test); un writeback rimasto in coda poteva riportare
indietro una posizione più recente su Calibre — da qui l'ordine «prima importa,
poi scrivi» e il controllo preventivo; la mappa documenti resuscitava un file
appena rimosso perché il sidecar ne conservava una copia.

Resta: nessuna riga di questo codice ha mai parlato con hardware vero. È
l'attività IB-001 ed è quella che conta.

## 2026-09-18 · claude

Aggiunta l'impalcatura che mancava per lavorare in più di uno: questa memoria
condivisa (`memoria/`), `AGENTS.md` e `CLAUDE.md` perché Codex e Claude Code
trovino le stesse regole, changelog, roadmap, guida allo sviluppo locale,
`scripts/setup-dev.sh`, `scripts/check.sh`, `scripts/memoria.sh`,
`scripts/export-standalone.sh`, un `Makefile` e una CI GitHub che esegue gli
stessi controlli di `check.sh`.

Nessuna modifica al codice di InkBridge: i test restano 63 + 59.
