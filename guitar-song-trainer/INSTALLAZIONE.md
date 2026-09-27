# Installare e usare Guitar Song Trainer sul tuo computer

L'app è una pagina web: non va compilata e non installa nulla nel sistema. Serve solo un piccolo
"server locale" per aprirla nel browser, che parte con un doppio clic.

## 1. Scarica ed estrai

- **Dal pacchetto zip**: estrai `guitar-song-trainer-vX.Y.Z.zip` in una cartella a tua scelta
  (es. `Documenti/guitar-song-trainer`).
- **Da GitHub**: pulsante verde *Code → Download ZIP*, oppure
  `git clone <indirizzo-del-repository>`.

## 2. Requisito: Node.js oppure Python (una volta sola)

- **Windows**: installa **Node.js LTS** da <https://nodejs.org> (Avanti, Avanti, Fine).
  In alternativa va bene Python da <https://python.org> (spunta *Add Python to PATH*).
- **macOS**: Python 3 di solito è già presente. Se no, installa Node.js LTS da <https://nodejs.org>.
- **Linux**: `sudo apt install nodejs npm` oppure usa Python 3, già presente.

## 3. Avvia

| Sistema | Cosa fare |
|---|---|
| Windows | doppio clic su **`avvia.bat`** |
| macOS | doppio clic su **`avvia.command`** (la prima volta: tasto destro → *Apri* → *Apri*) |
| Linux | `./avvia.sh` dal terminale |

Si apre il browser su **http://localhost:8080**. Per fermare l'app chiudi la finestra nera
(o premi `Ctrl+C`). Da terminale funziona anche `npm start` e poi apri http://localhost:8080.

Con Node.js l'avvio usa il server incluso: non scarica pacchetti e non richiede `npm install`.

Consigliati: **Chrome** o **Edge** (sono quelli con il miglior supporto per microfono e ingressi USB).

## 4. Collegare la chitarra

### Cavo Rocksmith (Real Tone Cable)
1. Collega il cavo alla chitarra e a una porta USB del computer. Non servono driver.
2. Nell'app: ⚙ *Impostazioni* → **Ingresso audio**. Il cavo viene riconosciuto da solo
   ("Cavo Rocksmith rilevato") e compare con 🎸 nell'elenco.
3. Pizzica una corda: l'indicatore di livello deve muoversi. Se è basso alza il **Guadagno**.
4. Vuoi sentire la chitarra? Attiva **Ascolta la chitarra in cuffia** (usa le cuffie per evitare fischi).
5. Ora funzionano **Accordatore** e **Ascolto** (l'app ti dice se l'accordo è giusto).

### Microfono
Senza cavo l'app usa il microfono del computer: avvicina la chitarra e scegli il dispositivo giusto
in *Ingresso audio*.

## 5. Sul telefono o tablet Android

Il microfono e il cavo funzionano solo su pagine **https** (o su `localhost`). Per il telefono la
strada più semplice è pubblicare l'app online gratis:
- **Vercel**: *Add New → Project*, importa il repository, *Framework Preset: Other*, nessuna build.
- **GitHub Pages**: se disponibile per il repository, *Settings → Pages → Source: GitHub Actions*,
  poi esegui manualmente il workflow *Pubblica su GitHub Pages*. Il push non pubblica il sito.

Poi apri l'indirizzo in Chrome sul telefono → menu ⋮ → **Installa app**. Il cavo Rocksmith sul
telefono si collega con un adattatore **USB-OTG** (USB-C o micro-USB → USB-A).

Solo per provare accordi, testo e video (senza microfono) puoi anche aprire dal telefono
`http://<indirizzo-IP-del-computer>:8080` se telefono e computer sono sulla stessa rete Wi-Fi.
Il server Node ascolta solo sul computer: per questa prova avvialo con `HOST=0.0.0.0 npm start`
su macOS/Linux, oppure `$env:HOST='0.0.0.0'; npm start` in PowerShell.

## Backup e pratica quotidiana

Dalla libreria apri **Backup dei dati → Scarica backup JSON**. Sul browser di destinazione apri
la stessa pagina, scegli il file, leggi l'anteprima e premi **Sostituisci i dati personali con questo backup**.
Il ripristino sostituisce i dati precedenti dell'app; esportali prima se vuoi conservarli. I video in
*Registrazioni* si salvano separatamente. Cache LRCLIB e dispositivo audio scelto non sono trasferiti.

In **Progressi** scegli un obiettivo di 5–60 minuti: vengono mostrati il tempo di oggi e gli ultimi
sette giorni. I giorni raggiunti sono ricalcolati rispetto all'obiettivo selezionato.

Offline sono disponibili le pagine dell'app e i brani già aperti dopo l'installazione della cache
su HTTPS o localhost. YouTube richiede rete; i testi sono disponibili se già memorizzati nel browser.

## 6. Problemi frequenti

- **"Serve il permesso del microfono"**: clicca sul lucchetto accanto all'indirizzo → Microfono → Consenti.
- **Il video non parte**: serve internet (YouTube). Accordi e testo funzionano lo stesso.
- **Il testo non compare**: serve internet (arriva da LRCLIB); in alternativa incollane uno tuo
  da *Sincronia → Incolla il tuo testo*.
- **Gli accordi sono in anticipo o in ritardo**: *Sincronia* (±0,05 s) oppure *Registra tempi*.
- **La porta 8080 è occupata**: su macOS/Linux `PORT=9090 ./avvia.sh`; su Windows apri il Prompt dei comandi
  nella cartella e scrivi `set PORT=9090` e poi `avvia.bat`. Poi apri http://localhost:9090.
