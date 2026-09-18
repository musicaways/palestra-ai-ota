# Invarianti

Regole che il codice rispetta oggi e che non vanno rotte senza una nuova voce
in [`DECISIONI.md`](DECISIONI.md). Se una modifica le contraddice, la modifica è
sbagliata finché non è la regola a cambiare — esplicitamente.

## Dati e sincronizzazione

1. **Vince il più recente.** Fra due progressi dello stesso elemento vince
   `updated_at` più alto. A parità esatta vince il `device_id` maggiore in
   ordine lessicografico: non è «giusto», è *deterministico*, ed è ciò che fa
   convergere due dispositivi che sincronizzano nello stesso millisecondo.
2. **Nessun ritorno indietro silenzioso.** Prima di scrivere una posizione su
   Calibre, l'hub controlla che lassù non ce ne sia una più recente: in quel
   caso importa quella invece di sovrascriverla.
3. **Nessun eco.** Un writeback fatto dall'hub è marcato `inkbridge:…` e il
   poll lo ignora. Senza questa regola ogni sincronizzazione rimbalzerebbe
   all'infinito.
4. **Stesso stato, nessuna revisione.** Un record identico a quello già salvato
   non consuma una revisione e non sveglia gli altri dispositivi.
5. **La percentuale di un manga è quella della serie**, non del capitolo:
   `(indice_capitolo + frazione_nel_capitolo) / capitoli_totali`. È l'unico modo
   perché il numero significhi la stessa cosa sul Kobo, su Suwayomi e nel catalogo.
6. **Le pagine sul dispositivo sono 1-based**, quelle di Suwayomi 0-based. La
   conversione avviene in un punto solo: il writeback.
7. **Niente è perso se la rete non c'è.** Ogni progresso entra prima nella coda
   su disco, poi parte. La coda tiene un solo record per elemento, il più recente.

## Confini

8. **L'UID dice da dove viene una cosa**: `calibre:<libreria>:<id>`,
   `suwayomi:manga:<id>`, `suwayomi:chapter:<id>`. Non esistono identificativi
   senza sorgente.
9. **L'hub non possiede il catalogo.** Le uniche cose che gli appartengono sono
   i progressi, i dispositivi e gli alias. Titoli, copertine e file vengono
   sempre da Calibre o da Suwayomi: nessuna copia, nessuna verità parallela.
10. **Le credenziali del NAS non arrivano al dispositivo** in modalità hub. In
    modalità diretta sì, e la documentazione lo dice a chiare lettere.
11. **Un xpointer di KOReader non è un CFI di Calibre.** Verso Calibre si manda
    sempre la percentuale e un CFI solo se è davvero un CFI.

## Qualità

12. **Un test non si salta, non si disabilita, non si mette in quarantena** per
    far passare la verifica. Se è rosso, o il codice è sbagliato o il test lo è:
    si sistema quello giusto.
13. **`./scripts/check.sh` verde prima di ogni commit.** Nessuna eccezione, né
    per gli umani né per gli assistenti.
14. **Degradare, non rompere.** Quando un back end risponde in modo inatteso
    (campo GraphQL sconosciuto, endpoint assente su una versione vecchia), si
    ripiega su una variante ridotta e si continua. Un manga che non si scarica
    non deve impedire di leggere i libri.
15. **Gli errori si scrivono nella lingua di chi legge**: «connessione rifiutata:
    il servizio è avviato?», non `ECONNREFUSED`.
