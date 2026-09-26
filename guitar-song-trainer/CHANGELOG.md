# Novità

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
