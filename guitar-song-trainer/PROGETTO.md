# Analisi e sviluppo — Guitar Song Trainer 1.10.0

## Scopo

Aiutare a imparare brani alla chitarra attraverso pratica ripetuta, indicazioni visive delle
diteggiature e controllo del tempo. Il riferimento è l'esperienza di Rocksmith, adattata al browser:
si sceglie una canzone, si rallenta una sezione, la si ripete e si misura il tempo dedicato allo studio.

L'archivio di partenza era la versione 1.9.0. La 1.10.0 conserva i 614 brani e la struttura statica;
non richiede un account, un backend o una compilazione.

## Funzioni e architettura verificate nel codice

| Area | Funzioni | Moduli principali |
|---|---|---|
| Repertorio | Ricerca, filtri, preferiti, recenti, scalette, editor dei propri brani | library, usersongs, editor, setlists |
| Studio | Video YouTube, timeline accordi, manico animato, spartito, karaoke, trasposizione, capotasto | player, clock, timeline, fretboard, karaoke, music |
| Ripetizione | Loop A–B, sezioni, velocità progressiva, studio guidato, metronomo | player, audio |
| Didattica | Lezioni, esercizi, dizionario accordi, quiz, allenamento cambi | learn, lessons, chords, drill |
| Audio/video | Accordatore, riconoscimento accordi, ingresso USB/microfono, effetti, registrazioni | tuner, detect, input, amp, camera |
| Dati personali | Pratica, progressi e preferenze nel browser; video in IndexedDB | store, stats, progress, recordings |
| Offline | Cache delle pagine e delle risorse già consultate | sw.js |

Il router a hash monta una pagina alla volta. I dati dei brani sono JSON; le funzioni musicali pure
producono timeline e diteggiature, mentre il player coordina DOM, canvas e Web Audio. YouTube e LRCLIB
sono servizi esterni: il clock interno permette lo studio quando il video non è disponibile.

## Lavoro realizzato nella 1.10.0

1. **Continuità dei dati:** backup JSON con anteprima, validazione, conferma di sostituzione e recupero
   dei dati precedenti in caso di errore durante la scrittura. Esclusi video, cache LRCLIB e identificatore
   del dispositivo audio. Il monitor viene disattivato al ripristino. Il backup resta un file locale.
2. **Costanza nella pratica:** obiettivo giornaliero da 5 a 60 minuti, avanzamento di oggi e ultimi sette
   giorni, sul tempo di riproduzione dei brani registrato dall'app. I conteggi rispettano il calendario
   locale anche durante il cambio d'ora; lezioni ed esercizi hanno i propri risultati separati.
3. **Affidabilità della libreria:** A caso rispetta Preferiti e Recenti, le scalette non spariscono per
   una ricerca senza risultati, i metadati non vengono interpretati come HTML, la scorciatoia di ricerca
   viene rimossa lasciando la pagina. Un URL malformato mostra un errore recuperabile.
4. **Offline:** cache isolata per installazione, catalogo incluso nella cache iniziale, riserva su
   errore HTTP e protezione delle copie valide. Funziona anche sul server localhost.
5. **Sviluppo riproducibile:** server incluso senza pacchetti runtime, test Node/Python multipiattaforma,
   dipendenze di test bloccate dal lockfile, test Chromium desktop/mobile con servizi esterni simulati,
   test service worker reale e workflow CI. Pubblicazione del sito solo manuale.

## Verifiche e limiti

`npm test` verifica la logica musicale, i dati del catalogo, i progressi, il backup, il service worker
e gli strumenti Python. `npm run test:e2e` apre tutti i 614 brani e prova i principali flussi su desktop
e telefono; la suite aggiuntiva verifica esportazione/importazione reale, filtri e ricarica offline.

I servizi esterni sono simulati nei test: questi controlli **non certificano** che ogni video sia oggi
raggiungibile né la precisione musicale dell'allineamento di tutte le canzoni. La sincronizzazione
preimpostata rimane correggibile con i comandi dell'app. Microfono e fotocamera dei test sono simulati:
latenza, qualità del riconoscimento, cavo Rocksmith reale e installazione su Android richiedono prove
con l'hardware. Non sono stati verificati Safari, Firefox o un iPhone fisico.

Non viene scaricato l'intero repertorio per uso offline: occorre aprire online i brani desiderati.
Il cambio di browser, porta, protocollo o dominio crea un'area dati distinta; il backup consente di trasferirla.
Le registrazioni vanno esportate separatamente. Non è stata aggiunta una sincronizzazione cloud.

## Prossime funzionalità proposte, in ordine di utilità

1. **Pacchetti offline per scaletta:** scaricamento esplicito degli accordi, indicatore di disponibilità,
   spazio occupato e rimozione selettiva. Non includerebbe i video YouTube.
2. **Routine guidate:** sessioni da 10/20/30 minuti che combinano riscaldamento, cambio accordi e
   sezioni da ripassare. Usare obiettivi scelti dall'utente e risultati realmente misurati.
3. **Calibrazione audio:** misura della latenza, soglia rumore e verifica pratica su cavo USB/microfono;
   separare il tempo dedicato dalla precisione del riconoscimento.
4. **Manutenzione del player:** estrarre trasporto, dialoghi, sincronizzazione e studio guidato dal
   grande modulo player.js, mantenendo test di regressione per ogni componente.
5. **Condivisione e sincronizzazione opzionale:** valutarle dopo aver definito autenticazione,
   conflitti fra dispositivi e trattamento dei dati personali; non necessarie per la versione locale.

Queste proposte sono una roadmap, non funzioni già implementate.
