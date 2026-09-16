# InkBridge

Leggi sul **Kobo Libra Color** tutta la libreria **Calibre** e tutti i manga
**Suwayomi** che stanno sul NAS, con la posizione di lettura sincronizzata nei
due sensi.

```
Calibre  ─┐                        ┌─ griglia di copertine
          ├─ InkBridge Hub ─ Wi-Fi ─┤  download o lettura
Suwayomi ─┘   (NAS, Docker)        └─ progressi NAS ⇄ Kobo
```

Due pezzi:

| | Dove | Cosa fa |
|---|---|---|
| [`server/`](server/) | NAS, in Docker | catalogo unificato, file, CBZ, merge dei progressi, writeback su Calibre e Suwayomi |
| [`koplugin/`](koplugin/) | Kobo, dentro KOReader | griglia di copertine, download, lettura, sincronizzazione bidirezionale |

Il plugin funziona anche **senza l'hub**, parlando direttamente a Calibre e
Suwayomi: si perde il merge multi-dispositivo e il confezionamento dei CBZ resta
a carico del lettore. L'hub è la strada consigliata.

## Installazione in breve

**1. Sul NAS**

```bash
cd server
cp .env.example .env     # URL di Calibre e Suwayomi, token condiviso
docker compose up -d
```

Verifica su `http://<nas>:8577/`: devono risultare attive entrambe le sorgenti.

**2. Sul Kobo** (con KOReader già installato)

```bash
./scripts/install-kobo.sh /media/$USER/KOBOeReader
```

oppure copia a mano `koplugin/inkbridge.koplugin` in
`.adds/koreader/plugins/` sul lettore. Poi, sul dispositivo:
**Strumenti → InkBridge → Server**, inserisci indirizzo dell'hub e token,
**Prova la connessione**, e apri la libreria.

Istruzioni per esteso: [`docs/installazione-kobo.md`](docs/installazione-kobo.md).

## Come funziona la sincronizzazione

Ogni posizione di lettura è un record con una percentuale, un punto esatto nel
testo e l'istante in cui è stata registrata. Vince sempre il record più recente;
a parità di istante vince un criterio deterministico, così due dispositivi
convergono comunque sulla stessa risposta.

* **Kobo → NAS**: alla chiusura del libro, in sospensione, ogni N pagine. Se il
  Wi-Fi è spento il progresso resta in coda sul dispositivo e parte da solo alla
  prima connessione.
* **NAS → Kobo**: a ogni sincronizzazione. Per i libri non aperti la posizione
  viene scritta nel sidecar, così la percentuale è giusta già nell'elenco dei
  file. Per il libro che stai aprendo, se la differenza è rilevante InkBridge
  chiede prima di spostarti.
* **Verso Calibre e Suwayomi**: l'hub scrive la posizione in Calibre
  (`pos_frac`, visibile anche nel visualizzatore web) e aggiorna
  `lastPageRead`/`isRead` del capitolo su Suwayomi.
* **Da Calibre e Suwayomi**: l'hub li interroga a intervalli regolari, così una
  lettura fatta sul telefono o nel visualizzatore web arriva comunque al Kobo.

Il dettaglio sta in [`docs/architettura.md`](docs/architettura.md).

## Sviluppo

```bash
# hub
cd server && pip install -e ".[dev]" && python -m pytest -q && ruff check .

# plugin (Lua 5.1, nessuna dipendenza da KOReader: i moduli sono simulati)
cd koplugin && lua5.1 tests/run.lua
```

## Limiti noti

Sono elencati senza sconti in [`docs/limitazioni.md`](docs/limitazioni.md):
vale la pena leggerli prima di installare.
