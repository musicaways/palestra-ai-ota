# Istruzioni per gli assistenti (Codex, Claude Code, chiunque altro)

Questo file è il punto d'ingresso comune. Leggilo per intero prima di toccare
qualcosa: sono due minuti e evitano il novanta per cento dei danni.

## Cosa contiene questo repository

Due cose distinte, che non si mescolano:

| Percorso | Cos'è | Regola |
|---|---|---|
| `version.json`, `README.md` (radice) | canale di aggiornamento OTA dell'app **Palestra AI** | **non toccare**: lo aggiorna la pipeline di rilascio di un altro progetto |
| `inkbridge/` | il progetto **InkBridge** | è qui che si lavora |

**InkBridge** collega un Kobo Libra Color (con KOReader) a un NAS dove girano
Calibre (ebook) e Suwayomi (manga), e tiene sincronizzata la posizione di
lettura nei due sensi. Due componenti: `inkbridge/server/` (hub Python/FastAPI
sul NAS) e `inkbridge/koplugin/` (plugin Lua dentro KOReader).

## Prima di iniziare: leggi la memoria

La memoria condivisa sta in [`inkbridge/memoria/`](inkbridge/memoria/) ed è fatta
di file di testo versionati, non di stato nascosto dentro un assistente. Ordine
di lettura:

1. [`memoria/STATO.md`](inkbridge/memoria/STATO.md) — dove siamo adesso
2. [`memoria/ATTIVITA.md`](inkbridge/memoria/ATTIVITA.md) — cosa è in corso, cosa è libero
3. [`memoria/INVARIANTI.md`](inkbridge/memoria/INVARIANTI.md) — le regole che non si rompono
4. [`memoria/DECISIONI.md`](inkbridge/memoria/DECISIONI.md) — almeno le ultime voci, per non ridiscutere il già deciso

Il protocollo completo (quando scrivere, cosa, come risolvere i conflitti) è in
[`memoria/README.md`](inkbridge/memoria/README.md).

## Comandi

Dalla cartella `inkbridge/`:

```bash
./scripts/setup-dev.sh    # una volta sola: dipendenze Python e Lua
./scripts/check.sh        # tutti i controlli: ruff, pytest, test Lua, sintassi Lua
make test                 # equivalente, se preferisci make
```

Solo una parte:

```bash
cd server   && python -m pytest -q && ruff check .
cd koplugin && lua5.1 tests/run.lua
```

`check.sh` deve essere **verde prima di ogni commit**. Senza eccezioni.

## Come si lavora

* **Una attività alla volta**, presa da `memoria/ATTIVITA.md` scrivendo il
  proprio nome nella colonna *Assegnato*.
* **Test insieme al codice**: ogni correzione di un bug porta con sé il test che
  lo avrebbe intercettato. I test esistenti non si saltano, non si disabilitano,
  non si mettono in quarantena per far passare la verifica (invariante 12).
* **Nessun segreto nel repository**: token, password e indirizzi privati stanno
  in `server/.env`, che è in `.gitignore`. Nella memoria si scrive «il token del
  NAS», non il token.
* **Lingua**: documentazione, memoria e testi mostrati all'utente in
  **italiano**; commenti e identificatori nel codice in **inglese**, come già
  sono. Non mescolare le due cose nello stesso file.
* **Commit**: prima riga breve e in italiano, con l'identificativo dell'attività
  quando esiste — `IB-004: pubblica l'immagine Docker`. Corpo che spiega il
  perché, non il cosa.
* **Branch**: si lavora su `claude/kobo-reader-ebook-manga-app-8zqkn4` finché la
  pull request [#1](https://github.com/musicaways/palestra-ai-ota/pull/1) è
  aperta; dopo, un branch per attività (`ib-004-immagine-docker`).
* **A fine sessione**: `./scripts/check.sh`, poi una voce di diario
  (`./scripts/memoria.sh diario <chi> "…"`), poi commit e push. Una sessione
  senza riga di diario costringe il prossimo a ricostruire tutto dal `git log`.

## Stile del codice

* **Python**: 3.11+, `ruff` con le regole in `server/pyproject.toml` (riga da 100
  colonne), type hint ovunque, `async` per tutto ciò che tocca la rete.
* **Lua**: compatibile con LuaJIT (è quello che usa KOReader), niente
  dipendenze fuori da KOReader, ogni file deve passare `luac5.1 -p`. I moduli
  del plugin si richiamano come `require("lib/nome")`.
* **Commenti**: spiegano il *perché*. Il *cosa* si legge nel codice.
* Le API di KOReader cambiano fra le versioni: dove una chiamata può non esistere
  si usa `pcall` con un ripiego sensato (invariante 14).

## Cose da non fare

* Non modificare `version.json` né il README di radice.
* Non riscrivere la storia di git su un branch condiviso (niente `rebase`,
  `amend` o `push --force` su branch altrui).
* Non aggiungere dipendenze al plugin: sul Kobo c'è solo quello che KOReader
  porta con sé.
* Non cambiare un invariante di nascosto: prima una voce in `DECISIONI.md`.
