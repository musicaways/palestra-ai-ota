# 🎸 Guitar Song Trainer

Web app (PWA) per imparare le canzoni alla chitarra, in stile Rocksmith.
Funziona nel browser di **PC, tablet e telefono Android** e si può installare come app
(Chrome → menu ⋮ → *Installa app* / *Aggiungi a schermata Home*).

## Cosa fa

- **Palco in stile Rocksmith**: corsia in prospettiva da cui arrivano verso di te le cornici degli
  accordi, con le gemme colorate su corde e tasti giusti; le cornici tratteggiate segnano le battute
  in cui l'accordo prosegue, le linee sulla corsia sono battute e battiti.
- **Manico al neon**: diteggiatura corrente (colori per corda, numero del dito, barrè, corde a vuoto
  `O` e da non suonare `✕`), corde che vibrano e scintille a ogni cambio; nell'ultimo battito le dita
  **scivolano verso l'accordo successivo**, già visibile tratteggiato.
- **Ritmo**: indicatore dei battiti (il primo della battuta è arancione), pattern di pennata
  suggerito (↓ ↑) che si illumina a tempo, conto alla rovescia "prossimo accordo tra N battiti",
  click del metronomo opzionale.
- **Video YouTube sincronizzato** sotto il manico: pausa, ±5 s, **velocità** (25%–200%),
  **loop A-B** oppure loop di una sezione/frase con un tocco su ⟲.
- **Testo karaoke sincronizzato**: la riga cantata si illumina man mano, con gli accordi sopra le parole
  nel punto in cui cambiano. Il testo viene scaricato al momento da [LRCLIB](https://lrclib.net)
  (archivio pubblico di testi sincronizzati) e **non è incluso nel repository**.
- **Scheda Accordi**: griglia delle battute (`%` = l'accordo prosegue), un tocco per saltare lì.
- **Scheda Diteggiature**: i diagrammi di tutti gli accordi del brano; quello che stai suonando si illumina.
- **Velocità progressiva** (stile Riff Repeater): attiva il loop su una sezione e a ogni ripetizione la
  velocità sale (50% → 60% → … → 100%).
- **Conteggio d'attacco**: una battuta di click prima di partire.
- **Accordatore** cromatico col microfono (serve la pagina in https e il permesso del microfono).
- **Capotasto** con suggerimento automatico: il brano suona uguale ma usi forme più facili
  (per Cartine corte il capo al 3° trasforma Gm – Gm/F – Ebmaj7 – D7 in Em – Em/D – Cmaj7 – B7).
- **Allenamento cambi accordo**: scegli 2-4 accordi e un tempo; li alterni col metronomo in round da
  un minuto, con il BPM che sale da solo e il record salvato per ogni combinazione.
- **Statistiche di pratica**: tempo suonato e ultima volta su ogni brano, scheda *Recenti*.
- Schermo sempre acceso mentre suoni e **modalità concentrazione** (solo palco e testo).
- **Modalità ascolto** (stile Rocksmith): il microfono riconosce l'accordo che suoni; a ogni cambio il
  manico si illumina di verde o di rosso, con precisione, serie e record.
- **Frecce della pennata** (↓ ↑) che scorrono sulla corsia a tempo.
- **Cavo USB Rocksmith** (Real Tone Cable) o qualsiasi scheda audio: riconosciuto da solo, con guadagno,
  indicatore di livello e ascolto della chitarra in cuffia (*Impostazioni → Ingresso audio*).
- **Editor dei brani**: crea o modifica un brano dall'app (accordi scritti come testo, tap tempo,
  ricerca del testo su LRCLIB), provalo subito ed esporta il JSON. I brani creati hanno il badge *Tuo*.
- **Libreria** con ricerca e schede *Tutti / Preferiti / Artisti / Generi / Difficoltà*.
- **Sincronia**: correzione fine ±0,05 s e modalità **🎯 Registra tempi** (tocchi TAP a ogni cambio
  accordo mentre il video suona: i tempi vengono salvati e si possono esportare in JSON).
- **Il tuo testo**: da *Sincronia → Incolla il tuo testo* puoi usare un testo tuo, anche in formato LRC;
  resta salvato solo sul tuo dispositivo.
- Notazione internazionale (C D E) o italiana (Do Re Mi), modalità mancini, nomi delle note sul manico.
- Funziona anche offline (tranne il video) e anche se YouTube non è raggiungibile (clock interno).

Scorciatoie da tastiera: `spazio` play/pausa · `←` `→` ±5 s · `[` `]` punti A/B · `L` loop ·
`T` tap in registrazione.

## Installazione in locale

Guida passo passo in [`INSTALLAZIONE.md`](INSTALLAZIONE.md): estrai lo zip e fai doppio clic su
`avvia.bat` (Windows), `avvia.command` (macOS) o `./avvia.sh` (Linux).

## Riprendere il progetto con un altro assistente AI

La memoria condivisa del progetto è in [`AGENTS.md`](AGENTS.md): architettura, regole, formato dei
brani, procedura per aggiungerne di nuovi, stato attuale, decisioni e prossimi passi. È letto
automaticamente da Codex, Cursor e altri; `CLAUDE.md` e `GEMINI.md` rimandano allo stesso file.

## Avvio in locale

Nessuna installazione o build: bastano file statici.

```bash
npx http-server -c-1 .     # oppure: python3 -m http.server
# poi apri http://localhost:8080
```

## Test

```bash
npm test                              # test unitari: accordi, timeline, testo LRC, accordatore
npm start &                           # server locale su :8080
node tests/e2e.mjs http://localhost:8080   # test nel browser (serve Playwright)
```

## Pubblicazione

**Vercel**: progetto statico senza build (`vercel.json` imposta solo le intestazioni di cache).

**GitHub Pages**

Il workflow `.github/workflows/pages.yml` pubblica la cartella a ogni push su `main`.
Una volta sola: *Settings → Pages → Source: GitHub Actions*. L'app sarà su
`https://<utente>.github.io/<repository>/`, apribile da qualsiasi dispositivo.

## Aggiungere un brano

1. Crea `songs/<id>.json` (formato qui sotto).
2. Aggiungi una voce in `songs/index.json` con `id`, `file`, `title`, `artist`, `genre`,
   `difficulty` (1–5), `youtubeId`.

```jsonc
{
  "title": "Titolo",
  "artist": "Artista",
  "genre": "Rock",
  "difficulty": 2,                 // 1 principiante … 5 esperto
  "youtubeId": "XXXXXXXXXXX",      // l'ID dopo watch?v=
  "bpm": 95,
  "timeSignature": [4, 4],
  "offset": 0.4,                   // secondo del video in cui cade il primo accordo
  "strum": "D-DU-UDU",             // pennata su 8 crome: D giù, U su, - pausa, X stoppata
  "patterns": {                    // giri di accordi riutilizzabili: una voce = una battuta
    "giro": [["Gm"], ["Gm/F"], ["Ebmaj7"], ["D7sus4", "D7"]]
  },
  "sections": [
    { "name": "Strofa", "pattern": "giro", "repeat": 4 },
    { "name": "Bridge", "bars": [["G5"], ["F5:3", "C5:1"]] }   // "Accordo:battiti"
  ],
  "lyricsSource": { "lrclibId": 21128462, "offset": 0 },  // testo karaoke da LRCLIB (id o ricerca per titolo)
  "sync": [0.41, 2.93, 5.46],      // opzionale: tempi registrati di ogni cambio accordo
  "shapes": {                      // opzionale: diteggiature personalizzate (Mi grave → Mi cantino)
    "Gm": { "frets": [null, null, 5, 3, 3, 3], "fingers": [0, 0, 3, 1, 1, 1] }
  }
}
```

- Più accordi in una battuta si dividono i battiti in parti uguali, oppure con `"Accordo:battiti"`.
- `"%"` come battuta significa "l'accordo precedente prosegue".
- Senza `lrclibId` l'app cerca il testo su LRCLIB per artista e titolo.
- Ogni ripetizione del pattern è una riga dello spartito (`barsPerRow` per spezzarla).
- Le diteggiature di accordi maggiori, minori, 7, m7, maj7, sus2, sus4, 7sus4, 5, dim, aug e degli
  accordi con basso (`/`) sono generate automaticamente; `shapes` serve solo per forme diverse.
- Il testo delle canzoni non è incluso nel repository (diritti d'autore): arriva da LRCLIB o lo incolli dall'app.

### Allineare gli accordi al video

1. Apri il brano e premi **🎯 Registra tempi**: il video riparte qualche secondo prima del primo accordo.
2. Tocca **TAP** (o premi `T`) nel momento esatto di ogni cambio accordo indicato. Conviene
   abbassare la velocità al 50–75%: i tempi sono registrati sul tempo del video, quindi restano giusti.
3. **Fine** salva sul dispositivo; **Esporta JSON** scarica il brano con i tempi (e copia `sync` negli appunti)
   così può essere aggiunto al repository per tutti i dispositivi.

## Struttura

```
index.html            pagina unica
css/style.css         stile (tema scuro, responsive)
js/app.js             avvio e navigazione
js/library.js         libreria, ricerca, preferiti
js/player.js          schermata di studio: controlli, loop, registrazione tempi
js/fretboard.js       canvas: corsia 3D + manico animato
js/karaoke.js         testo karaoke sincronizzato con gli accordi
js/lyrics.js          download da LRCLIB e parsing LRC
js/sheet.js           griglia degli accordi
js/diagram.js         diagrammi SVG degli accordi
js/tuner.js           accordatore (microfono, autocorrelazione)
js/drill.js           allenamento cambi accordo
js/stats.js           statistiche di pratica e record
js/audio.js           metronomo e schermo sempre acceso
js/detect.js          riconoscimento degli accordi dal microfono
js/songtext.js        formato testuale degli accordi dell'editor
js/usersongs.js       brani creati dall'utente
js/editor.js          editor dei brani
tests/                test unitari (node --test) ed end-to-end (Playwright)
js/icons.js           icone SVG
js/timeline.js        da sezioni/battute a tempi assoluti
js/music.js           note, parsing accordi, diteggiature
js/clock.js           sincronizzazione con YouTube (IFrame API) o clock interno
songs/                libreria dei brani (JSON)
sw.js, manifest.webmanifest, icons/   PWA
```
