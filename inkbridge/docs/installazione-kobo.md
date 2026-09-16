# Installazione sul Kobo Libra Color

Tre passaggi: KOReader sul lettore, l'hub sul NAS, il plugin nel mezzo.
Se KOReader è già installato, salta il primo.

---

## 1. KOReader sul Kobo Libra Color

Il Libra Color è supportato da KOReader dalla versione 2024.04 in poi.

1. Scarica l'ultima release Kobo da
   <https://github.com/koreader/koreader/releases> — il file
   `koreader-kobo-*.zip` (**non** quello `-arm-linux-gnueabihf`).
2. Collega il Kobo al computer con il cavo USB e sbloccalo (sul lettore compare
   «Connesso»).
3. Scompatta l'archivio nella radice della memoria del Kobo: deve comparire la
   cartella `.adds/koreader` e il file `KoboRoot.tgz` va copiato in `.kobo/`.
   Le release recenti contengono un unico `KoboRoot.tgz`: copialo in
   `.kobo/` e basta.
4. Espelli il dispositivo. Il Kobo si riavvia e installa KOReader.
5. Apri KOReader dal menu «Altro» / NickelMenu: la prima apertura può chiedere
   30 secondi.

> **Nota sul colore.** Il Libra Color ha uno schermo Kaleido 3: KOReader lo
> gestisce e le copertine a colori nella griglia di InkBridge si vedono, con la
> saturazione tipica dell'e-ink a colori.

---

## 2. L'hub sul NAS

Serve Docker (Synology: «Container Manager», QNAP: «Container Station», oppure
`docker compose` da riga di comando).

```bash
git clone <questo-repo> inkbridge
cd inkbridge/server
cp .env.example .env
```

In `.env` vanno **almeno** tre cose:

```ini
INKBRIDGE_TOKEN=un-token-lungo-e-casuale
INKBRIDGE_CALIBRE_URL=http://192.168.1.10:8080
INKBRIDGE_SUWAYOMI_URL=http://192.168.1.10:4567
```

Genera il token con:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(24))"
```

Poi:

```bash
docker compose up -d
docker compose logs -f     # deve dire: InkBridge 1.0.0 avviato
```

Apri `http://<nas>:8577/` dal browser: la tabella deve mostrare **attiva** per
Calibre e per Suwayomi. Se una delle due è rossa, la colonna «Dettaglio» dice
perché (host sbagliato, autenticazione, servizio spento).

### Calibre: quale server?

InkBridge parla con **`calibre-server`**, quello che espone `/opds` e `/ajax`.
Se lo lanci a mano:

```bash
calibre-server --port 8080 /percorso/della/libreria
```

Con autenticazione attiva, aggiungi utente e password in `.env`. Se usi
**calibre-web** (un progetto diverso) punta comunque InkBridge a un
`calibre-server` sulla stessa libreria: i due possono convivere.

### Suwayomi

Basta l'URL del server (porta 4567 di default). Se hai attivato
l'autenticazione base, mettila in `.env`. InkBridge usa l'API GraphQL e, dove
serve, gli endpoint immagine `/api/v1/...`.

---

## 3. Il plugin sul Kobo

Col Kobo collegato via USB:

```bash
./scripts/install-kobo.sh /media/$USER/KOBOeReader
```

Su macOS il percorso è di solito `/Volumes/KOBOeReader`.

A mano: copia la cartella `koplugin/inkbridge.koplugin` dentro
`.adds/koreader/plugins/` sul lettore. Alla fine deve esistere:

```
.adds/koreader/plugins/inkbridge.koplugin/main.lua
.adds/koreader/plugins/inkbridge.koplugin/_meta.lua
.adds/koreader/plugins/inkbridge.koplugin/lib/…
```

Espelli il Kobo e riapri KOReader.

### Configurazione

Sul lettore: **Strumenti → InkBridge**.

1. **Server → Hub**: indirizzo `http://192.168.1.10:8577` e il token scelto
   prima.
2. **Prova la connessione**: deve elencare le due sorgenti.
3. **Apri la libreria**.

Se preferisci non installare nulla sul NAS, in **Server** passa a
«collegamento diretto» e compila Calibre e Suwayomi separatamente — leggi prima
i [limiti](limitazioni.md) di quella modalità.

---

## 4. Uso quotidiano

| Gesto | Effetto |
|---|---|
| Tocco su una copertina | scheda del libro, o elenco capitoli per un manga |
| Pressione prolungata | azioni rapide (scarica, leggi, rimuovi, aggiorna copertina) |
| Tasti pagina del Libra | pagina precedente/successiva del catalogo |
| Scorrimento orizzontale | come i tasti pagina |
| Scorrimento verso il basso | ricarica il catalogo dal NAS |
| Lente in alto a sinistra | ricerca per titolo, autore, tag |

I libri scaricati finiscono in `/mnt/onboard/InkBridge` e restano visibili anche
dal normale gestore file di KOReader. I manga hanno una cartella per serie, con
un CBZ per capitolo.

### Sincronizzazione

Di default:

* alla **chiusura** di un libro e in **sospensione** il progresso parte verso il
  NAS (se il Wi-Fi è spento resta in coda);
* ogni **20 pagine** viene registrato un aggiornamento;
* all'**apertura** di un libro InkBridge controlla se altrove sei più avanti;
* **Strumenti → InkBridge → Sincronizza adesso** forza tutto, in entrambe le
  direzioni.

Tutto è regolabile in **InkBridge → Sincronizzazione**. Se vuoi lanciare la
sincronizzazione con un gesto, assegnala da **Impostazioni → Gesti**: le azioni
si chiamano «InkBridge: libreria» e «InkBridge: sincronizza».

---

## Problemi frequenti

**«Wi-Fi spento. Attivalo e riprova.»**
: InkBridge accende la rete da solo solo se è attivo *Accendi il Wi-Fi quando
  serve* (InkBridge → Sincronizzazione).

**«Connessione rifiutata: il servizio è avviato?»**
: L'hub non risponde su quell'indirizzo. Verificalo dal browser del computer:
  `http://<nas>:8577/health`.

**«Autenticazione rifiutata»**
: Token diverso fra `.env` sul NAS e impostazioni sul Kobo.

**Le copertine non si vedono**
: InkBridge disegna il titolo in un riquadro quando la copertina non arriva.
  Prova *Svuota la cache delle copertine* e ricarica; se restano vuote, controlla
  che Calibre abbia davvero le copertine (`/get/thumb/...` dal browser).

**La percentuale su Calibre non cambia**
: L'hub scrive la posizione solo se `INKBRIDGE_CALIBRE_WRITE_POSITIONS=true` e
  la versione di Calibre espone `/book-set-last-read-position` (Calibre 4+).
  La pagina `/v1/health` mostra quanti writeback sono in coda; se il numero
  cresce, `docker compose logs` dice perché.

**L'ora del Kobo è sbagliata**
: La sincronizzazione decide chi ha ragione confrontando gli orari. Se il Kobo
  ha l'orologio indietro, i suoi progressi sembrano vecchi. Collegalo al Wi-Fi
  e lascia che Nickel aggiorni l'ora.
