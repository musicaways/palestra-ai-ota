# AGENTS.md — memoria condivisa del progetto

> File letto dagli assistenti AI (Claude Code, Codex, Cursor, Gemini, Copilot…) per riprendere il
> lavoro senza perdere il contesto. **Aggiornalo a fine sessione**: sezioni "Stato attuale",
> "Diario delle sessioni" e "Prossimi passi". Scrivi in italiano, come il resto del progetto.

## Il progetto in breve

**Guitar Song Trainer** è una web app (PWA) per imparare canzoni alla chitarra in stile
Rocksmith, usabile su PC, tablet e telefono Android. Proprietario: `musicaways` (GitHub).

- In alto un palco su canvas: corsia in prospettiva da cui arrivano le cornici degli accordi,
  manico al neon con la diteggiatura corrente e transizione verso la successiva.
- Sotto: video YouTube sincronizzato (pausa, velocità, loop A-B, loop di sezione, velocità progressiva).
- Pannello a schede: testo karaoke sincronizzato con gli accordi sopra le parole, griglia degli
  accordi per battuta, diagrammi delle diteggiature.
- Libreria con ricerca, preferiti, recenti, artisti, generi, difficoltà e tempo di pratica.
- Strumenti: capotasto con suggerimento automatico, accordatore dal microfono, allenamento dei
  cambi accordo, conteggio d'attacco, metronomo, registrazione dei tempi a TAP.
- Modalità ascolto: il microfono riconosce l'accordo suonato (chroma) e dà punteggio e serie.
- Editor dei brani nell'app (formato testuale degli accordi), brani dell'utente salvati in locale.
- Ingresso audio: microfono o **cavo USB Rocksmith (Real Tone Cable)**, riconosciuto da solo; guadagno e monitor in cuffia.
- **Sincronia garantita**: controllo automatico di coerenza fra testo e accordi (indicatore accanto al testo),
  allineamento al video con un tocco o ascoltando il video dal microfono, regolatore unico testo+accordi.
- **I brani vengono aggiunti dall'AI su richiesta dell'utente, uno alla volta** (vedi sotto).

## Regole da rispettare sempre

1. **Mai testi delle canzoni nel repository** (diritti d'autore), né nei commit, né nelle PR, né nei
   messaggi. Il testo arriva a runtime da LRCLIB (`lyricsSource.lrclibId` nel JSON del brano) oppure
   lo incolla l'utente (salvato solo nel suo browser). Nei test non stampare mai il testo.
2. **Niente build e niente dipendenze a runtime**: HTML + CSS + moduli ES nativi. Si apre con un
   qualsiasi server statico. Le uniche risorse esterne sono YouTube, LRCLIB e Google Fonts.
3. **Interfaccia e commenti in italiano.** Nomi di variabili in inglese.
4. Ogni modifica passa da `npm test` (unitari) e `node tests/e2e.mjs` (browser). Aggiungi test per le
   nuove funzioni. La logica pura (music, timeline, lyrics, stats, tuner) va tenuta senza DOM, così
   si testa con `node --test`.
5. Quando aggiungi un file JS, aggiungilo anche all'elenco `SHELL` di `sw.js` e alza `VERSION`.
6. Accordi: nomi internazionali nei dati (`Gm`, `Ebmaj7`, `D7sus4`, `Gm/F`); la notazione italiana
   (Do Re Mi) è solo di visualizzazione.

## Architettura

```
index.html            pagina unica, carica js/app.js
css/style.css         tema "neon stage" (variabili in :root), responsive (≤960px, ≤560px)
js/app.js             router a hash: #/ libreria · #/song/<id> player · #/allenamento · #/editor[/<id>]
js/library.js         libreria (schede, ricerca, preferiti, statistiche sulle card)
js/player.js          schermata di studio: orchestra clock, palco, pannelli, dialoghi, loop
js/fretboard.js       canvas: corsia 3D (proiezione prospettica verso un punto di fuga) + manico
js/timeline.js        brano → timeline in secondi (battute, eventi accordo, righe, sezioni)
js/music.js           note, parsing accordi, diteggiature, trasposizione, suggerimento capotasto
js/clock.js           YouTubeClock (IFrame API, tempo interpolato) e FreeClock (riserva)
js/karaoke.js         righe LRC + accordi posizionati per tempo, riempimento progressivo
js/lyrics.js          download da LRCLIB, cache locale, parsing LRC
js/sheet.js           griglia accordi per battuta
js/diagram.js         diagrammi SVG degli accordi
js/tuner.js           accordatore (autocorrelazione)
js/drill.js           allenamento cambi accordo (usa un "brano sintetico" e lo stesso palco)
js/stats.js           tempo di pratica, recenti, record dell'allenamento (localStorage)
js/audio.js           click del metronomo, Wake Lock dello schermo
js/detect.js          riconoscimento accordi: FFT, chroma, confronto con i modelli; Listener dal microfono
js/songtext.js        formato testuale degli accordi (parse/serializza), slug, ID YouTube, tap tempo
js/usersongs.js       brani creati/modificati dall'utente (localStorage) e fusione con la libreria
js/editor.js          pagina #/editor e #/editor/<id>
js/input.js           ingresso audio condiviso (GuitarInput): dispositivo, cavo Rocksmith, guadagno, monitor
js/syncmath.js        coerenza testo/accordi (lyricGridCheck), stima dello sfasamento dall'audio, tocco
js/arrangement.js     parti di chitarra: ritmica, arpeggio (buildArpeggio → tl.notes), power chord, facile
tools/checklyrics.py  verifica che ogni brano abbia il testo sincronizzato su LRCLIB (stampa solo numeri)
tools/checksync.mjs   coerenza griglia/testo per ogni brano; con --fix corregge l'offset se affidabile
tools/lrcgrid.py      analisi dei SOLI tempi LRCLIB: BPM ottimale, offset, blocchi e ritornelli
avvia.bat / avvia.sh / avvia.command   avvio locale con doppio clic (Node.js o Python)
INSTALLAZIONE.md      guida per l'utente: scaricare, avviare, collegare la chitarra
js/store.js           localStorage con prefisso `gst:` e impostazioni
js/icons.js           icone SVG in linea
songs/index.json      elenco dei brani (metadati per la libreria)
songs/<id>.json       un file per brano
tests/*.test.mjs      test unitari (node --test)
tests/e2e.mjs         test end-to-end Playwright (desktop + telefono)
```

Flusso del player: `buildTimeline(song, {offset, sync})` → ogni frame `clock.getTime()` →
`eventIndexAt` / `beatAt` → `fretboard.render(...)`, `karaoke.update(...)` / `sheet.update(...)`, HUD.
Catena dei nomi in `rebuild()`: nome del brano → `transposeChord` (trasposizione) → `arrangeName`
(parte: power/facile) = `ev.sounding` (ciò che suona) → `shapeNameWithCapo` = `ev.name` (forma da suonare).
`Fretboard.capo` sposta le forme in su; con la parte arpeggio `tl.notes` contiene le note singole.
Preferenze per brano in `gst:prefs:<id>` {transpose, arrangement, view, rate, loop}; vista predefinita in
`settings.view`. Viste = classi `.player.view-<id>` (full, stage, videolyrics, video, lyrics); il video
nascosto resta acceso fuori schermo; senza manico il canvas non viene disegnato.
Comandi del trasporto: velocità, loop e strumenti sono pannelli `[data-popbody]` aperti da `[data-pop]`.

## Formato di un brano

Documentato nel README (sezione "Aggiungere un brano"). Punti chiave:
- `bpm`, `timeSignature`, `offset` (secondo del video in cui inizia la prima battuta).
- `patterns` (giri riutilizzabili) + `sections` (`pattern` + `repeat`, oppure `bars`).
- Una battuta: `"Gm"`, `["D7sus4", "D7"]`, `["F5:3", "C5:1"]`, `"%"` = l'accordo prosegue.
- `strum`: pennata su 8 crome (o 6 in 3/4): `D` giù, `U` su, `-` pausa, `X` stoppata.
- `lyricsSource`: `{ "lrclibId": 123, "offset": 0 }` oppure ricerca per artista/titolo.
- `sync`: tempi registrati di ogni cambio accordo (dall'app, "Registra tempi" → "Esporta JSON").
- `shapes`: diteggiature personalizzate; `capo`: capotasto consigliato di default.

### Procedura per aggiungere un brano (per l'AI)

1. Trova il video ufficiale su YouTube (ID dopo `watch?v=`).
2. Ricava tonalità, BPM, metro e giro di accordi da fonti di accordi pubbliche (solo accordi, niente testo).
3. Cerca il brano su LRCLIB: `https://lrclib.net/api/search?artist_name=…&track_name=…` e scegli
   l'id della versione album (durata simile al video). Poi `python3 tools/lrcgrid.py <id> <bpm> <battiti>`:
   usa **solo i timestamp** e dà BPM ottimale, `offset` e i blocchi cantati in battute (con i ritornelli
   riconosciuti). Costruisci le sezioni su quei numeri di battute.
   Regola pratica: un accordo per battuta se la battuta dura ≥ 2,2 s, altrimenti due battute per accordo.
4. Scrivi `songs/<artista>-<titolo>.json` (con `lyricsSource: { lrclibId, duration }`) e aggiungi la voce
   in `songs/index.json`. Brani rap/elettronici: adattali a un giro d'accordi suonabile e scrivilo in `notes`.
5. Verifica: `npm test`, `python3 tools/checklyrics.py` (testo presente), `node tools/checksync.mjs --fix`
   (coerenza testo/accordi) e il test e2e (apre ogni brano). LRCLIB limita le richieste: se risponde 503,
   aspetta qualche secondo fra una chiamata e l'altra. I tempi restano stime finché l'utente non allinea.

## Comandi

```bash
npm test                                   # test unitari
npm start                                  # server statico su :8080
node tests/e2e.mjs http://localhost:8080   # test nel browser (serve Playwright installato)
```
Nel test e2e YouTube è bloccato di proposito (si prova il clock di riserva); il microfono è finto.

## Stato attuale (v1.6.0 — 2026-09-26)

- Funziona tutto quanto descritto sopra; 51 test unitari e 222 controlli e2e verdi (desktop + telefono,
  incluso: ogni brano si apre con tutte le diteggiature, nessuno scorrimento orizzontale, nessuna
  sovrapposizione fra componenti in tutte e cinque le viste, comandi compatti).
- **33 brani**, tutti con testo sincronizzato disponibile (verificato con tools/checklyrics.py).
  Aggiunti in v1.5.0: Blanco (Mi fai impazzire, Paraocchi, Blu celeste), PTN (Giovani Wannabe, Scrivile
  scemo, La storia infinita), Olly (Depresso fortunato), Cremonini (Nessuno vuole essere Robin), Rino Gaetano
  (A mano a mano, Aida, Mio fratello è figlio unico, Berta filava), Fedez (Cigno nero, Bella storia, Mille),
  Salmo (90MIN). Scartati per fonti incoerenti: Il campione (Olly), 50 Special, Buon viaggio, Perdonami.
- checksync: 26/33 coerenti; 7 con coerenza bassa ma senza correzione affidabile (righe fuori battere,
  tipico del rap): per quelli serve l'allineamento col tocco nell'app.
- **Brani in libreria: 17.** Salmo (Cartine corte, Il cielo nella stanza), MACE/Blanco/Salmo (La canzone
  nostra), Blanco (Notti in bianco), Pinguini Tattici Nucleari (Ringo Starr, Pastello bianco), Olly
  (Balorda nostalgia, Per due come noi), Cesare Cremonini (Poetica, Marmellata #25), Rino Gaetano
  (Ma il cielo è sempre più blu, Gianna), Fedez con Francesca Michielin (Chiamami per nome, Magnifico),
  Ultimo (Pianeti), Måneskin (Coraline), Calcutta (Paracetamolo). Tutti: griglia da `tools/lrcgrid.py`,
  accordi da fonti pubbliche (accordiespartiti.it, mbutozone.it, accordiindieesimili), BPM da
  songbpm/tunebat. **Strutture e tempi stimati**; video di Magnifico e Coraline da verificare.
  Scartati per dati poco affidabili: Brividi (Mahmood & Blanco), Soldi (Mahmood).
- Primo brano: Salmo, *Cartine corte* (RANCH, 2025). 3/4 a 95 BPM, griglia ricavata
  dai tempi del cantato (una riga ogni 3,79 s = 2 battute). Giro Gm – Gm/F – Ebmaj7 – D7sus4 → D7,
  bridge G5 F5 Eb5 C5. Capotasto suggerito: 3 (Em – Em/D – Cmaj7 – B7). **Tempi dei cambi stimati,
  non ancora verificati sul video reale.**
- **Non verificato**: video YouTube reale, accordatore e modalità ascolto con una chitarra vera
  (la sandbox li blocca; sono verificati con segnali sintetici nei test). Le soglie di `matchChord`
  (0.62 e 0.92 del migliore) e del volume (0.012) potrebbero richiedere taratura sul campo.

## Dove vive il codice

- Temporaneamente nella cartella `guitar-song-trainer/` del repo `musicaways/palestra-ai-ota`,
  branch `claude/guitar-learning-app-iy0h24`, PR #2 (in bozza, **da non unire**: quel repo è il
  canale OTA di un'altra app, Palestra AI; non toccare `version.json` né le sue release).
- **Da fare**: spostarlo in un repository dedicato (l'integrazione non ha potuto crearlo: 403).
- **Vercel**: il team è `musicaways-projects`; il connettore non ha il permesso di creare progetti
  (403). L'utente deve creare il progetto (Root Directory `guitar-song-trainer`, preset *Other*,
  nessuna build) oppure dare i permessi. `vercel.json` è già pronto.

## Decisioni prese (e perché)

- **JS vanilla senza build**: si pubblica ovunque (Vercel, GitHub Pages) e si modifica da qualsiasi AI.
- **Canvas 2D con proiezione a mano** invece di WebGL: più leggero, funziona su telefoni modesti.
- **Testo da LRCLIB a runtime**: niente materiale protetto nel repo; timestamp riga per riga gratuiti.
- **Due clock con la stessa interfaccia**: l'app resta usabile senza YouTube (e testabile).
- **Tempi reali tramite "warp" della griglia**: i TAP registrati deformano la griglia del BPM in modo
  continuo, così battute tenute e battiti restano coerenti.
- **Capotasto come ridenominazione degli eventi**: tutto il resto dell'interfaccia non deve saperne nulla.
  Lo stesso vale per trasposizione e parti (power/facile).
- **Parti ricavate dagli accordi**, non riff originali trascritti: niente materiale protetto e funziona per ogni brano.
  Il motore delle note singole (`tl.notes`) è pronto per ospitare tablature vere in futuro.
- **Interfaccia sobria**: niente etichette permanenti per stati rari (sincronia → pallino), strumenti rari dietro ⋯.
- Il suggerimento del capotasto penalizza barrè, estensioni ampie e tasti alti (`shapeDifficulty`).

## Diario delle sessioni

- **2026-09-26 · sessione 1 (Claude Code)**: prima versione (manico 2D, video, loop, spartito,
  libreria, registrazione tempi) + brano Cartine corte. Restyling in stile Rocksmith (corsia 3D,
  neon, icone SVG), karaoke da LRCLIB, pannello Testo/Accordi, finestra Sincronia.
  Test unitari ed e2e, diteggiature, accordatore, velocità progressiva, conteggio d'attacco.
  Capotasto con suggerimento, allenamento cambi accordo, statistiche di pratica e scheda Recenti,
  schermo sempre acceso, modalità concentrazione. Memoria condivisa (questo file) e pacchetto sorgenti.
  Poi v1.3.0: modalità ascolto (riconoscimento accordi dal microfono, punteggio e serie), frecce della
  pennata sulla corsia, editor dei brani con brani dell'utente e badge in libreria. Bug corretto: il
  punteggio dell'ascolto era nascosto sui telefoni.
  Poi v1.4.0: cavo USB Rocksmith e scelta dell'ingresso audio, 16 nuovi brani, accordi 6 e add9,
  suggerimento del capotasto più prudente, duetti raggruppati sotto ogni artista, avvio con doppio
  clic e guida INSTALLAZIONE.md, strumento tools/lrcgrid.py.
  Poi v1.5.0: sincronia garantita (controllo di coerenza, tocco, ascolto del video, regolatore unico),
  testo con ricerca di riserva, 16 nuovi brani, riga del testo sotto il manico, riprendi, guida rapida,
  ordinamento e "Continua" in libreria. Bug corretti: errore se il testo arrivava prima del video,
  pagina più larga dello schermo su telefono (pulsanti velocità, schede, accordi del karaoke).
  Poi v1.6.0 (richieste dell'utente): tolta l'etichetta di sincronia, viste (manico nascondibile),
  parti di chitarra (arpeggio, power chord, facile), trasposizione e "senza capotasto", preferenze
  per brano, stampa accordi, comandi compatti a scomparsa (l'utente li trovava troppo ingombranti),
  schermata ad altezza fissa senza sovrapposizioni. Bug corretto: errore TDZ su `lastIdx`.

## Prossimi passi (idee in ordine di utilità)

1. Spostare il progetto in un repo dedicato e pubblicarlo (Vercel o GitHub Pages).
2. Verificare *Cartine corte* sul video reale e salvare i tempi `sync` registrati dall'utente.
3. Aggiungere i brani che l'utente chiede, uno alla volta, con la procedura sopra.
4. Tarare la modalità ascolto con una chitarra vera (soglie, latenza del microfono; col cavo
   Rocksmith il segnale è pulito e forse si possono alzare le soglie).
4b. Verificare sul video reale offset e strutture dei 17 brani e salvare i tempi `sync`.
4c. Miniature dei brani offline (oggi arrivano da YouTube) e ordinamento per popolarità.
5. Tablature per riff e intro: il formato può aggiungere `riffs` per sezione che finiscono in `tl.notes`
   (fretboard le disegna già come gemme); l'utente le ha chieste "dove possibile".
6. Importare nell'editor gli accordi da testo incollato (formato "accordi sopra le parole").
7. Sincronizzare i brani dell'utente fra dispositivi (oggi sono solo nel browser).
