# Glossario

I termini del progetto, con un significato solo. Se serve una parola nuova, si
aggiunge qui prima di spargerla nel codice.

| Termine | Significato |
|---|---|
| **hub** | Il servizio `server/` che gira sul NAS. Mai «server» da solo: ce ne sono altri tre in giro. |
| **plugin** | `koplugin/inkbridge.koplugin/`, ciò che gira dentro KOReader sul Kobo. |
| **sorgente** | Calibre o Suwayomi. Non «backend»: quello è il modulo del plugin che parla con qualcosa. |
| **back end** (plugin) | `backend_hub.lua` o `backend_direct.lua`: l'oggetto Lua che implementa l'interfaccia di accesso ai dati. |
| **modalità hub / diretta** | Con o senza il servizio sul NAS in mezzo. |
| **elemento** (*item*) | Un libro o un manga nel catalogo. Un capitolo **non** è un elemento: è un capitolo. |
| **UID** | Identificativo stabile di un elemento: `calibre:<libreria>:<id>`, `suwayomi:manga:<id>`, `suwayomi:chapter:<id>`. |
| **record di progresso** | La posizione di lettura di un elemento: percentuale, posizione esatta, capitolo, dispositivo, istante. |
| **percentuale** | Frazione 0–1 dell'**intera opera**. Per un manga è la frazione della serie, non del capitolo. |
| **locator** | La posizione esatta dentro il documento: xpointer per KOReader, CFI per Calibre. |
| **revisione** | Contatore monotono dell'hub. Il dispositivo lo usa come cursore per chiedere «cosa è cambiato da…». |
| **cursore** | L'ultima revisione vista da un dispositivo, salvata sul dispositivo. |
| **writeback** | Scrittura di un progresso verso Calibre o Suwayomi. |
| **poll upstream** | La lettura periodica che l'hub fa di Calibre e Suwayomi per scoprire letture fatte altrove. |
| **eco** | Il writeback dell'hub che torna indietro al poll successivo. Va riconosciuto e ignorato. |
| **coda** | I progressi in attesa di partire dal dispositivo, salvati su disco finché la rete non torna. |
| **sidecar** | Il file `.sdr` con cui KOReader ricorda le impostazioni e la posizione di un documento. |
| **mappa documenti** | `docmap.lua`: lega un file sul dispositivo al suo UID nel catalogo. |
| **alias** | Legame fra un identificativo esterno (per esempio l'hash KOSync) e un UID. |
| **tolleranza di conflitto** | La differenza di percentuale sotto la quale il plugin decide da solo invece di chiedere. |
