# Novità

## 2.1.0 — 2026-09-27
- **Spotify come sorgente audio**: il brano del disco, sincronizzato con testo e accordi (è la stessa versione dei
  tempi del testo). Parte da solo se il video YouTube non va; si può scegliere per un brano o per tutti, oppure
  incollare il link del brano. Brano intero se nel browser sei entrato in Spotify (anche account gratuito).
- **Parte vera trovata online**: «Trova la parte online» cerca i file MIDI gratuiti su BitMidi, li prova tutti e tiene
  quello che suona davvero gli accordi del brano; link alla tablatura su Songsterr.
- **Scheda Tab**: tablatura della parte (MIDI o arpeggio), battuta per battuta, con il cursore che segue la musica.
- Telefono: elenco dei brani compatto (molti brani per schermata), comandi sempre visibili mentre il testo scorre,
  menu Ordina leggibile; quando non c'è video il riquadro diventa una riga.
- YouTube più affidabile con i server locali (errore 153); avviso se l'app è aperta come file.

## 2.0.0 — 2026-09-26
- **Avvio immediato**: il brano si usa subito (prima si aspettava il video fino a 25 s e il carattere del titolo);
  il video si aggancia quando è pronto.
- **Video bloccati**: controllati tutti i video del catalogo nel browser; quelli che YouTube non lascia incorporare
  (errore 150/101) sono stati sostituiti con una versione incorporabile della stessa durata. Se un video non va,
  l'app lo dice e propone un'altra sorgente.
- **Il tuo file audio** come sorgente (⋯ → Audio), con **allineamento automatico** ascoltando la musica e rallentamento
  senza cambiare intonazione; oppure un altro link YouTube.
- **Parte vera da file MIDI**: note esatte, agganciate da sole alle battute del brano, suonate dalla Base.
- **Pennate per brano e per sezione** (trascritte da Ultimate Guitar dove ci sono, altrimenti stimate da genere e
  tempo), con accenti, palm muting, stoppate; **stili di arpeggio** diversi; scelta dello stile nella finestra Parte.
- **Karaoke parola per parola** nel testo e sotto il manico (anche con i tempi per parola dei testi LRC estesi).

## 1.9.0 — 2026-09-26
- **Catalogo: 614 brani di 217 artisti** (171 nuovi), tutti sincronizzati sul canto: rap e urban italiano (Salmo, Fedez,
  Lazza, Geolier, Anna, Ghali…), Sanremo recenti, cantautori, rock, indie e classici stranieri.
- **Sincronia per tutti**: i brani cantati liberamente (rubato) hanno ogni riga agganciata alla sua battuta; i brani rap
  arrangiati a mano sono stati rigenerati riga per riga. Controllo di coerenza ok per 614 su 614.
- **Seconda fonte di accordi** (Ultimate Guitar) quando la prima manca o si aggancia male: recuperati 60 brani.
- **Pagella di fine brano** in modalità ascolto (stelle, precisione, serie, record, "Riprova"); **condividi il brano**.
- Pagina iniziale compatta su telefono; Base anche con il manico nascosto.
- Importazione in un comando (`tools/importbatch.py`) e test del catalogo (indice coerente, nessun video doppio).
- Corretti: 32 campi dell'indice non allineati ai brani (video, tonalità, difficoltà); video doppi; LRCLIB senza durata.

## 1.8.0 — 2026-09-26
- **Sincronia di default per tutti i brani**: la griglia degli accordi è agganciata ai tempi del canto lungo tutto il
  brano (campo `warp`): niente deriva anche se il BPM stimato non è perfetto o il brano è suonato senza metronomo;
  per il rap l'aggancio è al battito. Coerenza testo/accordi ok per **tutti i 443 brani** (prima 183 su 213): per i brani cantati
  liberamente ogni riga è agganciata alla sua battuta; i brani rap arrangiati sono stati rigenerati riga per riga.
- **Catalogo: 443 brani di 162 artisti** (230 nuovi).
- **Base**: una chitarra sintetica suona gli accordi con la pennata del brano (o le note dell'arpeggio).
- **Dizionario degli accordi** con suono; **quiz d'ascolto** in Impara; nuove lezioni (pentatonica 2ª posizione,
  blues in 12 battute, riff boogie).
- **Scalette**: brani in fila con passaggio automatico al successivo; libreria con filtri per genere e decennio,
  brano a caso, indice A–Z degli artisti.
- Corretto: gli strumenti di controllo non leggevano i testi LRC con fine riga Windows (\r\n).

## 1.7.0 — 2026-09-26
- **Catalogo: 213 brani di 101 artisti** (179 nuovi) con un generatore automatico (`tools/autosong.py`): gli accordi di una pagina pubblica vengono
  agganciati riga per riga ai tempi del canto di LRCLIB (il testo resta solo in memoria), con BPM, sezioni e video.
- **Impara**: 29 lezioni con esercizi animati (scale con la forma in trasparenza, tecniche con etichette H/P/slide/bend,
  ritmi, accordi), suono della nota, BPM regolabile; predisposta per basso, ukulele e pianoforte.
- **Ampli ed effetti** per la chitarra collegata: distorsione, equalizzatore, cassa, chorus, delay, riverbero; 8 preset,
  suono suggerito per ogni brano, scelta per brano o predefinita.
- **Video mentre suoni** con la fotocamera, pagina Registrazioni, condivisione.
- **Studio guidato** sezione per sezione; **Progressi** con livello, serie di giorni e obiettivi.
- Telefono: velocità con poche scelte più − e +; sezioni in una riga di chip scorrevole e leggibile.

## 1.6.0 — 2026-09-26
- **Vista**: si può nascondere il manico o il video — completa, manico e testo, video e testo, solo video,
  solo testo. Senza manico resta una barra compatta con accordo attuale e prossimo; il video nascosto continua a suonare.
- **Parti di chitarra**: ritmica, arpeggio (note singole a crome sulla corsia e sul manico), power chord, facile
  (accordi semplificati, forme ridotte senza barrè). Arrangiamenti ricavati dagli accordi, non trascrizioni.
- **Tonalità**: trasposizione ±6 semitoni, "suonala senza capotasto", tonalità più facile senza capotasto.
- **Preferenze per brano** ricordate: tonalità, capotasto, parte, vista, velocità e loop.
- **Comandi compatti**: una sola riga (play, velocità, loop, ⋯); gli strumenti usati di rado stanno in una
  riga di icone scorrevole che si apre con ⋯. Da ~330 px a ~105 px.
- Niente più etichetta "In sincronia": il controllo resta, e se serve compare un pallino sul pulsante Sincronia.
- **Stampa accordi**: griglia per sezioni e diagrammi, pronta per stampa o PDF (senza testo).
- Schermata ad altezza fissa su computer e telefono: nulla scorre sotto il palco, le schede del testo restano visibili.
- Test: controllo automatico delle sovrapposizioni in ogni vista, tutte le parti e trasposizioni per ogni brano.

## 1.5.0 — 2026-09-26
- Sincronia garantita: controllo automatico di coerenza fra testo e accordi con indicatore, correzione
  automatica, allineamento al video con un tocco o ascoltando il video dal microfono, regolatore "Tutto".
- Testo: ricerca di riserva su LRCLIB se l'id non risponde; tutti i 33 brani verificati.
- 16 nuovi brani (Blanco, Pinguini Tattici Nucleari, Olly, Cremonini, Rino Gaetano, Fedez, Salmo),
  i brani rap adattati a giri d'accordi per chitarra.
- Riga del testo sotto il manico, "Riprendi da…", guida rapida, "Continua" e ordinamento in libreria, tasto /.
- Corretti: errore se il testo arrivava prima del video; pagina più larga dello schermo su telefono.
- Strumenti: tools/checklyrics.py, tools/checksync.mjs. Test: sincronia, ricerca di riserva, e2e esteso.

## 1.4.0 — 2026-09-26
- Ingresso audio: cavo USB Rocksmith (Real Tone Cable) riconosciuto da solo, scelta del dispositivo,
  guadagno, indicatore di livello, ascolto della chitarra in cuffia. Usato da accordatore e modalità ascolto.
- 16 nuovi brani: Blanco, MACE/Blanco/Salmo, Pinguini Tattici Nucleari (2), Olly (2), Cesare Cremonini (2),
  Rino Gaetano (2), Fedez con Francesca Michielin (2), Salmo, Ultimo, Måneskin, Calcutta.
- Accordi di sesta (6) e add9 nelle diteggiature e nel riconoscimento.
- Suggerimento del capotasto più prudente (non propone capotasti alti per brani già facili).
- Libreria: i duetti compaiono sotto ogni artista.
- Avvio locale con doppio clic (avvia.bat / avvia.command / avvia.sh) e guida INSTALLAZIONE.md.
- tools/lrcgrid.py: analisi dei tempi LRCLIB per costruire nuovi brani.

## 1.3.0 — 2026-09-26
- Modalità ascolto: riconoscimento dell'accordo suonato dal microfono, esito verde/rosso sul manico,
  precisione, serie e record per brano.
- Frecce della pennata sulla corsia.
- Editor dei brani (#/editor): formato testuale degli accordi, controllo degli errori, tap tempo,
  ricerca su LRCLIB, prova immediata, esportazione JSON; brani dell'utente in libreria con badge.
- Pulsante "Modifica" nel player; "Crea un brano" nella pagina iniziale.
- Corretto: su telefono il punteggio della modalità ascolto non era visibile.
- Test: riconoscimento accordi (segnali sintetici), editor e formato testuale, brani dell'utente, e2e esteso.

## 1.2.0 — 2026-09-26
- Capotasto con suggerimento automatico della posizione più comoda (Cartine corte: capo 3 → forme aperte).
- Allenamento cambi accordo: 2-4 accordi a tempo col metronomo, round da un minuto, BPM che sale, record.
- Statistiche di pratica sulle card, scheda "Recenti", totale nella pagina iniziale.
- Schermo sempre acceso durante la riproduzione; modalità concentrazione (nasconde video e controlli).
- Memoria condivisa per gli assistenti AI (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`).
- Nuovi test: trasposizione e capotasto, statistiche, allenamento, e2e esteso.

## 1.1.0
- Diteggiature del brano, accordatore dal microfono, velocità progressiva nel loop, conteggio d'attacco.
- Test unitari (node --test) ed end-to-end (Playwright). `vercel.json`.

## 1.0.0
- Restyling in stile Rocksmith: corsia 3D, manico al neon, icone SVG, nuova libreria.
- Testo karaoke sincronizzato da LRCLIB con gli accordi sopra le parole; finestra Sincronia.

## 0.1.0
- Prima versione: manico animato, video YouTube sincronizzato, loop, velocità, spartito, libreria,
  registrazione dei tempi; primo brano (Salmo – Cartine corte).
