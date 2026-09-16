# InkBridge — Architettura

InkBridge collega un **Kobo Libra Color** (con KOReader) a un **NAS** che ospita
**Calibre** (ebook) e **Suwayomi** (manga/fumetti), con sincronizzazione
**bidirezionale** dello stato e della percentuale di lettura.

```
        ┌──────────────────────────────────────────┐
        │                 NAS                      │
        │                                          │
        │  ┌────────────────┐   ┌───────────────┐  │
        │  │ calibre-server │   │   Suwayomi    │  │
        │  │  :8080 /opds   │   │ :4567 /api    │  │
        │  └───────▲────────┘   └──────▲────────┘  │
        │          │  HTTP            │ GraphQL    │
        │      ┌───┴──────────────────┴────────┐   │
        │      │      InkBridge Hub  :8577     │   │
        │      │  catalogo unificato · file    │   │
        │      │  progress store (SQLite)      │   │
        │      │  writeback + polling upstream │   │
        │      │  API KOSync-compatibile       │   │
        │      └───────────────▲───────────────┘   │
        └──────────────────────┼───────────────────┘
                               │ HTTP/JSON (LAN o VPN)
                    ┌──────────┴───────────┐
                    │  Kobo Libra Color    │
                    │  KOReader            │
                    │  inkbridge.koplugin  │
                    └──────────────────────┘
```

## Perché un hub e non solo il plugin

Il plugin può funzionare in **modalità diretta** (parla direttamente con Calibre e
Suwayomi), ed è supportata. L'hub però risolve tre problemi che sul device sono
scomodi o impossibili:

1. **Un solo endpoint, un solo token.** Il Kobo non deve conoscere due API
   diverse, due autenticazioni e due schemi di paginazione.
2. **Merge dei progressi.** La risoluzione dei conflitti (last-writer-wins con
   tolleranza + storico per device) richiede uno stato persistente condiviso:
   sul device non c'è modo di sapere cosa ha fatto il tablet ieri sera.
3. **Confezionamento CBZ.** Suwayomi serve le pagine dei manga come singole
   immagini: l'hub le impacchetta in un CBZ (formato che KOReader legge nativamente)
   in streaming, senza scrivere file temporanei sul NAS.

| | Modalità hub | Modalità diretta |
|---|---|---|
| Catalogo unificato | sì | sì (due sorgenti separate) |
| CBZ manga | costruito dall'hub | costruito sul device |
| Merge multi-device | completo | solo device ↔ upstream |
| Poll dei cambiamenti esterni | sì (background) | solo alla sync manuale |
| Componenti da installare | 1 container | nessuno |

## Modello dati unificato

Ogni elemento del catalogo ha un **UID stabile** che ne codifica la provenienza:

| Tipo | UID | Esempio |
|---|---|---|
| Libro Calibre | `calibre:<library_id>:<book_id>` | `calibre:Calibre_Library:4213` |
| Manga Suwayomi | `suwayomi:manga:<manga_id>` | `suwayomi:manga:87` |
| Capitolo Suwayomi | `suwayomi:chapter:<chapter_id>` | `suwayomi:chapter:19044` |

Il record di progresso è identico per libri e manga:

```jsonc
{
  "uid": "calibre:Calibre_Library:4213",
  "kind": "book",              // book | manga
  "percent": 0.4123,           // 0..1, sempre valorizzato
  "locator": "/body/DocFragment[12]/body/div/p[7]/text().0",  // xpointer KOReader o CFI
  "chapter_uid": null,         // solo manga: capitolo corrente
  "page": 132, "pages": 320,
  "status": "reading",         // new | reading | finished
  "device_id": "kobo-libra-a1b2",
  "device_name": "Kobo Libra Color",
  "updated_at": 1789512345678, // epoch ms: è l'orologio logico del LWW
  "revision": 918              // assegnata dal server, cursore di delta-sync
}
```

`percent` è la lingua franca: per un libro è la frazione del documento, per un
manga è `(capitoli letti + frazione del capitolo corrente) / capitoli totali`.
Così la percentuale ha lo stesso significato su Calibre, Suwayomi e sul device.

## Sincronizzazione

### Delta pull

Il server mantiene un contatore `revision` monotono. Il device chiede
`GET /v1/progress?since=<ultima_revision_vista>` e riceve solo ciò che è cambiato,
più il nuovo cursore. Il cursore è persistito sul device: dopo un riavvio non
riscarica tutto.

### Push e risoluzione conflitti

Il device invia un batch a `POST /v1/progress`. Per ogni UID il server confronta
`updated_at` con il record che ha già:

- record in arrivo **più recente** → accettato, `revision` incrementata,
  writeback verso Calibre/Suwayomi accodato;
- record in arrivo **più vecchio** → rifiutato, e nella risposta il server
  restituisce la versione autorevole (il device la applica subito);
- **parità di `updated_at`** → vince il `device_id` con ordinamento
  lessicografico maggiore. Non è "giusto", ma è *deterministico*: due device
  che sincronizzano lo stesso millisecondo convergono comunque.

La tolleranza serve lato device: se al momento di aprire un documento la
posizione remota differisce da quella locale di più di `conflict_tolerance`
(default 1%) **e** l'aggiornamento remoto è più recente, il plugin chiede
all'utente cosa fare invece di saltare la pagina sotto le dita. Sotto la
tolleranza applica la più recente in silenzio.

### Writeback verso upstream

Accettato un progresso, un task in background lo scrive su:

- **Calibre** → `POST /book-set-last-read-position/<library>/<book>/<fmt>` con
  `{device, cfi, pos_frac}`. `pos_frac` è la percentuale, così la libreria e il
  viewer web di Calibre mostrano lo stesso avanzamento del Kobo.
- **Suwayomi** → mutation `updateChapter` con `lastPageRead` e `isRead`.
  Il capitolo è marcato letto quando si supera `manga_read_threshold` (default 0.95).

Gli errori di writeback non fanno fallire la sync: restano su `upstream_error`
nel record e vengono ritentati al ciclo successivo.

### Poll dei cambiamenti esterni

Ogni `poll_interval` secondi l'hub interroga Calibre e Suwayomi per intercettare
letture fatte altrove (viewer web di Calibre, Tachiyomi/Mihon sul telefono).
Le differenze entrano nello store come se arrivassero da un device chiamato
`upstream:calibre` / `upstream:suwayomi`, e da lì raggiungono il Kobo al pull
successivo. È questo che rende la sincronizzazione davvero bidirezionale:
NAS → Kobo funziona anche quando il cambiamento non è nato nell'hub.

### Coda offline

Il Kobo è offline quasi sempre: il Wi-Fi si accende a richiesta. Il plugin
persiste ogni progresso in una coda su disco (`inkbridge_queue.lua`) e la svuota
quando la rete torna. Nessun progresso viene perso se la batteria muore o se si
esce dalla portata dell'access point.

## Compatibilità KOSync

L'hub espone anche `/users/auth` e `/syncs/progress`, l'API di
[kosync](https://github.com/koreader/koreader-sync-server). Un secondo device
con KOReader stock, senza il plugin InkBridge, può usare l'hub come server di
sincronizzazione standard: i progressi finiscono nello stesso store e
raggiungono comunque Calibre e Suwayomi.

## Sicurezza

- Autenticazione a **token bearer** (`INKBRIDGE_TOKEN`), obbligatorio se il
  servizio è esposto fuori dalla LAN.
- Le credenziali di Calibre e Suwayomi restano sul NAS: il device non le vede mai.
  In modalità diretta invece stanno nelle impostazioni del plugin, in chiaro sul
  device: è il compromesso di quella modalità ed è documentato.
- Nessun dato lascia la rete locale: non ci sono servizi terzi nel percorso.
