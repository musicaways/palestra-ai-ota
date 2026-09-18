# Lavorare a InkBridge

Vale per te, per Claude Code e per Codex: le regole sono le stesse, e le
istruzioni che leggono gli assistenti stanno in [`../AGENTS.md`](../AGENTS.md).

## Preparare la macchina

```bash
git clone https://github.com/musicaways/palestra-ai-ota.git
cd palestra-ai-ota/inkbridge
./scripts/setup-dev.sh
```

Servono **Python 3.11+** e **Lua 5.1** (o LuaJIT). Lo script crea `.venv`,
installa l'hub in modalità modificabile con gli strumenti di sviluppo, prova a
installare Lua con il gestore pacchetti del sistema e chiude eseguendo tutti i
controlli.

## Il ciclo di lavoro

1. Leggi [`memoria/STATO.md`](memoria/STATO.md) e prendi un'attività da
   [`memoria/ATTIVITA.md`](memoria/ATTIVITA.md), scrivendo il tuo nome nella
   colonna *Assegnato*.
2. Scrivi il test **insieme** al codice: se stai correggendo un bug, il test che
   lo avrebbe preso viene prima.
3. `./scripts/check.sh` finché non è verde.
4. Commit, con l'identificativo dell'attività nella prima riga.
5. A fine sessione: `./scripts/memoria.sh diario <chi> "…"`, poi push.

## Verifica

```bash
./scripts/check.sh           # tutto
./scripts/check.sh server    # solo l'hub
./scripts/check.sh plugin    # solo il plugin
```

Sotto il cofano:

| Componente | Comando | Cosa copre |
|---|---|---|
| hub | `cd server && python -m pytest -q` | router, servizi e adapter veri, con Calibre e Suwayomi simulati da `httpx.MockTransport` |
| hub | `cd server && ruff check .` | stile e errori statici |
| plugin | `cd koplugin && lua5.1 tests/run.lua` | logica di sincronizzazione, coda, mappa documenti, CBZ, back end — con KOReader simulato |
| plugin | `luac5.1 -p <file>` | sintassi di ogni file Lua |

I test del plugin **non** richiedono KOReader: `koplugin/tests/stubs.lua` simula
i moduli che servono. Se ne usi uno nuovo, aggiungilo lì.

## Stile

**Python** — 3.11+, riga da 100 colonne, type hint ovunque, `async` per tutto
ciò che tocca la rete. `ruff` decide le questioni di gusto: se passa, va bene.

**Lua** — compatibile con LuaJIT, nessuna dipendenza fuori da KOReader, moduli
richiamati come `require("lib/nome")`. Dove un'API di KOReader può non esistere
su una versione diversa, `pcall` con un ripiego sensato.

**Commenti** — spiegano il *perché*. Il *cosa* si legge dal codice. In inglese
nei sorgenti, come sono già.

**Testi per l'utente** — in italiano, compresi i messaggi d'errore, che devono
dire cosa fare: «connessione rifiutata: il servizio è avviato?», non `ECONNREFUSED`.

## Commit e branch

* Prima riga breve, in italiano, con l'identificativo quando esiste:
  `IB-004: pubblica l'immagine Docker su GHCR`.
* Corpo: perché, non cosa.
* Un branch per attività (`ib-004-immagine-docker`) una volta chiusa la pull
  request iniziale.
* Niente riscrittura della storia su branch condivisi.

## Regole che non si negoziano

Stanno in [`memoria/INVARIANTI.md`](memoria/INVARIANTI.md). Le due che si
violano più spesso per fretta:

* un test non si salta e non si disabilita per far passare la verifica;
* un invariante non si cambia di nascosto: prima una voce in
  [`memoria/DECISIONI.md`](memoria/DECISIONI.md).

## Segreti

Nel repository non entrano token, password né indirizzi privati. Stanno in
`server/.env` (ignorato da git) e nelle impostazioni del plugin sul dispositivo.
Nella memoria condivisa si scrive «il token del NAS», mai il token.
