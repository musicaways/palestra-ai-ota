# Roadmap

Le voci rimandano agli identificativi di
[`memoria/ATTIVITA.md`](memoria/ATTIVITA.md), dove c'è il dettaglio e lo stato
aggiornato. Le date non ci sono di proposito: questo è un progetto di una
persona sola, e una data inventata è peggio di nessuna data.

## Adesso — far funzionare la cosa davvero

Una sola priorità: **il primo collaudo su hardware reale** (`IB-001`). Finché
non succede, ogni altra funzione è costruita sopra un'ipotesi.

Da verificare per primi, perché sono i punti dove le API divergono fra versioni:

* quale variante GraphQL risponde sul Suwayomi di casa (`IB-002`);
* se il writeback su Calibre arriva davvero in libreria (`IB-003`).

Esito atteso: la checklist di `IB-001` tutta spuntata, oppure una lista di
errori veri da correggere. In entrambi i casi il progetto esce dal limbo.

## Poi — renderlo comodo da tenere

* **Immagine Docker pubblicata** (`IB-004`): oggi l'hub si costruisce in locale;
  un'immagine su GitHub Container Registry rende l'aggiornamento un `pull`.
* **Nuovi capitoli scaricati da soli** (`IB-005`): seguire una serie e trovarsi
  i capitoli nuovi sul lettore senza doverli chiedere.
* **Pulizia automatica** (`IB-008`): i capitoli già letti si possono rimuovere
  dal dispositivo senza toccare il NAS.

## Più avanti — completezza

* **Collezioni e scaffali di Calibre** (`IB-006`), oggi assenti: ci sono solo
  ricerca, tag e serie.
* **Autenticazione digest per Calibre in modalità diretta** (`IB-007`): oggi
  quella modalità richiede `--auth-mode=basic`.
* **Interfaccia traducibile** (`IB-009`): le stringhe sono in italiano nel
  codice; con `gettext` diventerebbero traducibili senza toccarlo.

## Fuori portata, per scelta

Non perché siano brutte idee, ma perché cambierebbero la natura del progetto:

* **Conversione di formato a bordo**: se un libro esiste solo in un formato che
  KOReader non legge, lo converte Calibre sul NAS, che ha CPU e batteria
  illimitate.
* **Un'app fuori da KOReader**: l'interfaccia è un plugin perché il lettore è
  già lì, ed è già il migliore che esista su questi dispositivi.
* **Un servizio in cloud**: tutto resta sulla rete di casa. È una caratteristica,
  non una mancanza.
