# Decisioni

Una voce per ogni scelta che cambia la forma del progetto. Si aggiunge **prima**
di implementare, non dopo: il codice racconta cosa fa, non perché è così e non
in uno dei tre modi alternativi. Le voci non si cancellano: si superano con una
voce nuova che dice «sostituisce la D-00n».

---

## D-001 · Un hub sul NAS, ma il plugin funziona anche senza
**2026-09-16 · claude · attiva**

Il plugin potrebbe parlare direttamente a Calibre e Suwayomi, e infatti può
farlo. L'hub esiste perché tre cose sul dispositivo sono scomode o impossibili:
un solo endpoint e un solo token invece di due API diverse; il merge dei
progressi, che ha bisogno di uno stato condiviso (il Kobo non può sapere cosa ha
fatto il tablet ieri sera); il confezionamento dei CBZ, che a bordo costa tempo
e batteria.

Entrambe le modalità restano supportate perché non tutti vogliono un container
in più sul NAS. La modalità diretta è documentata con i suoi limiti invece di
essere venduta come equivalente.

## D-002 · Last-writer-wins, non CRDT
**2026-09-16 · claude · attiva**

Una posizione di lettura non si «fonde»: o sei a pagina 100 o sei a pagina 140.
Un CRDT qui non aggiungerebbe nulla se non complessità. La regola è quindi
last-writer-wins con tie-break deterministico sul `device_id` (invariante 1),
più una tolleranza lato dispositivo che decide quando chiedere all'utente invece
di spostarlo di sorpresa.

Il prezzo è la dipendenza dall'orologio dei dispositivi: se il Kobo ha l'ora
sbagliata di ore, sbaglia anche il confronto. È scritto nei limiti.

## D-003 · La percentuale come lingua franca
**2026-09-16 · claude · attiva**

Calibre parla di CFI, KOReader di xpointer, Suwayomi di numero di pagina dentro
un capitolo. L'unica grandezza che significa la stessa cosa ovunque è la
frazione letta. Il record di progresso la porta sempre, e porta in più la
posizione esatta quando esiste: fra due KOReader ci si ritrova sulla stessa
riga, verso Calibre almeno sulla stessa percentuale.

## D-004 · CBZ costruito in streaming
**2026-09-16 · claude · attiva**

Suwayomi serve le pagine come immagini sciolte, KOReader legge i CBZ. L'hub le
impacchetta al volo, senza scrivere niente su disco: un capitolo da 300 MB non
occupa RAM sul NAS e il Kobo comincia a ricevere subito. L'archivio è *stored*,
non compresso: JPEG e WebP non si comprimono ulteriormente e deflate brucerebbe
solo CPU mentre il lettore aspetta.

## D-005 · Query GraphQL in due varianti
**2026-09-16 · claude · attiva**

Suwayomi ha rinominato più volte i campi fra le versioni. Ogni query esiste in
forma completa e in forma ridotta: se il server rifiuta un campo si ripiega
sulla seconda e la scelta viene ricordata, così la query sbagliata si tenta una
volta sola. Preferibile a fissare una versione minima che taglierebbe fuori metà
delle installazioni.

## D-006 · Il progetto vive dentro il repository OTA, sotto `inkbridge/`
**2026-09-16 · claude · attiva**

`musicaways/palestra-ai-ota` nasce come canale di aggiornamento di Palestra AI.
InkBridge ci sta dentro perché è lì che è stato chiesto il lavoro, in una
cartella separata che non tocca `version.json` né il README originale.
`scripts/export-standalone.sh` estrae il progetto in una cartella con la sua
storia git, pronta per un repository dedicato il giorno in cui serve: la
decisione è rimandabile senza costi.

## D-007 · La memoria condivisa sta in git, non nella testa degli assistenti
**2026-09-18 · claude · attiva**

La memoria interna di un assistente finisce con la sessione, e due assistenti
diversi (Claude Code e Codex) non la condividono comunque. `memoria/` è fatta di
file di testo versionati: si leggono senza strumenti speciali, si sincronizzano
con `git pull`, e un conflitto è visibile invece che silenzioso. Il formato è
Markdown perché deve restare leggibile da un umano; `stato.json` affianca
`STATO.md` per chi preferisce leggerlo da un programma.
