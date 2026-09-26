# 🎸 Guitar Song Trainer

Web app (PWA) per imparare le canzoni alla chitarra, in stile Rocksmith.
Funziona nel browser di **PC, tablet e telefono Android** e si può installare come app
(Chrome → menu ⋮ → *Installa app* / *Aggiungi a schermata Home*).

## Cosa fa

- **Manico animato** in alto: diteggiatura dell'accordo corrente (colori per corda, numero del dito,
  barrè, corde a vuoto `O` e da non suonare `✕`). Nell'ultimo battito le dita **scivolano verso
  l'accordo successivo**, che è già visibile in trasparenza.
- **"Autostrada" degli accordi**: i blocchi arrivano da destra verso la linea bianca (il momento del
  cambio); la lunghezza del blocco è la durata dell'accordo, le linee verticali sono battute e battiti.
- **Ritmo**: indicatore dei battiti (il primo della battuta è arancione), pattern di pennata
  suggerito (↓ ↑) che si illumina a tempo, conto alla rovescia "prossimo accordo tra N battiti",
  click del metronomo opzionale.
- **Video YouTube sincronizzato** sotto il manico: pausa, ±5 s, **velocità** (25%–200%),
  **loop A-B** oppure loop di una sezione/frase con un tocco su ⟲.
- **Spartito a scorrimento**: accordi per battuta e testo, con la battuta corrente evidenziata;
  un tocco su una battuta ci salta sopra.
- **Libreria** con ricerca e schede *Tutti / Preferiti / Artisti / Generi / Difficoltà*.
- **Sincronia**: correzione fine ±0,05 s e modalità **🎯 Registra tempi** (tocchi TAP a ogni cambio
  accordo mentre il video suona: i tempi vengono salvati e si possono esportare in JSON).
- **Il tuo testo**: con ✎ *Testo* incolli il testo del brano; resta salvato solo sul tuo dispositivo.
- Notazione internazionale (C D E) o italiana (Do Re Mi), modalità mancini, nomi delle note sul manico.
- Funziona anche offline (tranne il video) e anche se YouTube non è raggiungibile (clock interno).

Scorciatoie da tastiera: `spazio` play/pausa · `←` `→` ±5 s · `[` `]` punti A/B · `L` loop ·
`T` tap in registrazione.

## Avvio in locale

Nessuna installazione o build: bastano file statici.

```bash
npx http-server -c-1 .     # oppure: python3 -m http.server
# poi apri http://localhost:8080
```

## Pubblicazione (GitHub Pages)

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
  "sync": [0.41, 2.93, 5.46],      // opzionale: tempi registrati di ogni cambio accordo
  "shapes": {                      // opzionale: diteggiature personalizzate (Mi grave → Mi cantino)
    "Gm": { "frets": [null, null, 5, 3, 3, 3], "fingers": [0, 0, 3, 1, 1, 1] }
  }
}
```

- Più accordi in una battuta si dividono i battiti in parti uguali, oppure con `"Accordo:battiti"`.
- Ogni ripetizione del pattern è una riga dello spartito (`barsPerRow` per spezzarla).
- Le diteggiature di accordi maggiori, minori, 7, m7, maj7, sus2, sus4, 7sus4, 5, dim, aug e degli
  accordi con basso (`/`) sono generate automaticamente; `shapes` serve solo per forme diverse.
- Il testo delle canzoni non è incluso nel repository (diritti d'autore): lo incolli dall'app.

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
js/fretboard.js       canvas: autostrada accordi + manico animato
js/sheet.js           spartito a scorrimento
js/timeline.js        da sezioni/battute a tempi assoluti
js/music.js           note, parsing accordi, diteggiature
js/clock.js           sincronizzazione con YouTube (IFrame API) o clock interno
songs/                libreria dei brani (JSON)
sw.js, manifest.webmanifest, icons/   PWA
```
