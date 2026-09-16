# Limiti noti e scelte consapevoli

Meglio saperlo prima.

## Compatibilità con Suwayomi

Suwayomi ha cambiato API e nomi dei campi più volte fra le versioni 1.x e 2.x.
InkBridge scrive ogni query GraphQL in due varianti: una completa e una ridotta,
usata quando il server rifiuta un campo (`lastReadChapter`, `lastReadAt`,
`isDownloaded`). La scelta viene ricordata per la durata del processo, quindi la
query sbagliata viene tentata una volta sola.

Conseguenze pratiche:

* su un Suwayomi che non espone `lastReadAt`, l'hub **non sa quando** un
  capitolo è stato letto altrove. In quel caso importa lo stato solo la prima
  volta, e da lì in poi lascia vincere il dispositivo. Non perde dati, ma la
  direzione Suwayomi → Kobo diventa "solo all'inizio";
* gli URL delle pagine arrivano da `fetchChapterPages`; se il server risponde
  con una lista vuota, InkBridge ricostruisce il percorso REST
  `/api/v1/manga/<id>/chapter/<indice>/page/<n>`. Se una versione futura
  cambiasse anche quello, i manga smetterebbero di scaricarsi (i libri no).

Il codice non è stato provato contro tutte le versioni di Suwayomi in
circolazione: è scritto per degradare invece di rompersi, ma la compatibilità
reale va verificata sulla tua installazione. La pagina `/v1/health` e
`docker compose logs` dicono subito quale query è stata rifiutata.

## Posizione esatta fra Calibre e KOReader

Calibre memorizza la posizione come **CFI EPUB**, KOReader come **xpointer**:
sono due sistemi di coordinate diversi e non c'è una conversione onesta fra i
due. Quindi:

* verso Calibre viene sempre scritta la **percentuale** (`pos_frac`), che è
  quello che vedi nella libreria e nel visualizzatore web;
* il CFI viene inoltrato solo se il record ne contiene davvero uno;
* fra due dispositivi KOReader la posizione è invece **esatta**: l'xpointer
  viaggia intero e ti ritrovi sulla stessa riga, non sulla stessa percentuale.

## Polling di Calibre

Calibre non ha un endpoint "cosa è cambiato". L'hub interroga quindi solo i
libri di cui conosce già un progresso (al massimo gli ultimi 200). Un libro
iniziato **soltanto** nel visualizzatore web, e mai toccato dal Kobo, non viene
importato finché non lo apri sul Kobo — a quel punto l'apertura fa una
richiesta mirata e la posizione arriva.

## Modalità diretta

Senza l'hub:

* le credenziali di Calibre e Suwayomi stanno **in chiaro** nelle impostazioni
  del plugin, sul dispositivo;
* Calibre deve accettare l'autenticazione **basic** (`--auth-mode=basic`) o
  nessuna: il digest non è implementato in Lua;
* non esiste merge multi-dispositivo: il confronto è solo fra device e sorgente;
* i CBZ vengono costruiti sul Kobo. Funziona (l'archivio è ZIP *stored*, senza
  compressione) ma è più lento e consuma più batteria che farlo sul NAS;
* il "delta pull" non c'è: i progressi remoti si leggono all'apertura di ogni
  documento.

## Orologio

Il merge confronta timestamp. Se l'ora del Kobo è sbagliata di ore, i suoi
progressi possono sembrare più vecchi (e perdere) o più nuovi (e vincere a
torto) di quanto dovrebbero. Il Kobo aggiorna l'ora da solo quando si collega
al Wi-Fi.

## Sicurezza

Il token è **condiviso**, non per utente: protegge da un ospite sulla stessa
rete, non è un sistema di identità. Se esponi l'hub fuori dalla LAN, mettilo
dietro un reverse proxy con TLS o una VPN — il traffico in HTTP semplice
include il token in chiaro.

## Cosa non c'è

* Nessuna gestione delle **collezioni/scaffali** di Calibre (solo ricerca, tag,
  serie).
* Nessun **download automatico** dei nuovi capitoli: si scaricano a richiesta,
  al massimo cinque per volta dal menu dei capitoli.
* Nessuna conversione di formato: se un libro esiste solo in un formato che
  KOReader non legge, InkBridge non lo converte.
* L'integrazione **KOSync** funziona per i progressi, ma un device KOSync non
  vede il catalogo: per quello serve il plugin.
