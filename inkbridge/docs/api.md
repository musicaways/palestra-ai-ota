# API dell'hub

Base URL: `http://<nas>:8577`. Tutti gli endpoint `/v1/*` richiedono il token,
in intestazione (`Authorization: Bearer <token>`, oppure
`X-InkBridge-Token`) o — per le immagini — come parametro `?token=`.

La documentazione interattiva generata da FastAPI sta su `/docs`.

## Stato

| Metodo | Percorso | Descrizione |
|---|---|---|
| `GET` | `/health` | liveness, **senza** token (per Docker) |
| `GET` | `/v1/health` | stato delle sorgenti e writeback in coda |
| `GET` | `/` | pagina di stato leggibile |

```jsonc
// GET /v1/health
{
  "ok": true,
  "version": "1.0.0",
  "server_time": 1789575571309,
  "sources": [
    {"id": "calibre",  "name": "Calibre",  "kind": "book",  "enabled": true,
     "available": true, "detail": "libreria «Calibre_Library»"},
    {"id": "suwayomi", "name": "Suwayomi", "kind": "manga", "enabled": true,
     "available": true, "detail": "38 manga in libreria"}
  ],
  "queued_writebacks": 0
}
```

## Catalogo

| Metodo | Percorso | Note |
|---|---|---|
| `GET` | `/v1/library/sources` | sorgenti configurate |
| `GET` | `/v1/library/items` | `source`, `query`, `offset`, `limit`, `sort`, `sort_order` |
| `GET` | `/v1/library/items/{uid}` | scheda singola, con il progresso noto |
| `GET` | `/v1/library/items/{uid}/chapters` | solo manga |
| `GET` | `/v1/library/items/{uid}/cover` | immagine, `Cache-Control: 1 giorno` |
| `GET` | `/v1/library/items/{uid}/file` | ebook in streaming, `?format=epub` |
| `GET` | `/v1/library/chapters/{uid}/cbz` | capitolo impacchettato al volo |

`uid` è `calibre:<libreria>:<id>` oppure `suwayomi:manga:<id>` /
`suwayomi:chapter:<id>`.

```jsonc
// GET /v1/library/items?source=calibre&limit=2
{
  "items": [
    {
      "uid": "calibre:Calibre_Library:4213",
      "kind": "book", "source": "calibre",
      "title": "Il nome della rosa",
      "authors": ["Umberto Eco"],
      "series": null, "series_index": null,
      "tags": ["Giallo", "Storico"],
      "description": "Un'abbazia, sette giorni.",
      "language": "ita",
      "cover_url": "/v1/library/items/calibre:Calibre_Library:4213/cover",
      "formats": ["kepub", "epub"],
      "size": 812345,
      "progress": {"uid": "…", "percent": 0.41, "status": "reading", "…": "…"}
    }
  ],
  "total": 1274, "offset": 0, "limit": 2
}
```

## Progressi

| Metodo | Percorso | Note |
|---|---|---|
| `GET` | `/v1/progress?since=<cursore>` | delta: solo ciò che è cambiato |
| `POST` | `/v1/progress` | invio in blocco, con esito per record |
| `GET` | `/v1/progress/{uid}` | singolo record (404 se mai letto) |
| `POST` | `/v1/sync/run` | forza poll upstream + writeback |
| `POST` | `/v1/aliases` | lega un hash KOSync a un `uid` |
| `GET` | `/v1/devices` | dispositivi visti, con l'ultimo cursore |

```jsonc
// POST /v1/progress
{
  "device_id": "kobo-libra-a1b2",
  "device_name": "Kobo Libra Color",
  "records": [{
    "uid": "calibre:Calibre_Library:4213",
    "kind": "book",
    "percent": 0.4123,
    "locator": "/body/DocFragment[12]/body/div/p[7]/text().0",
    "status": "reading",
    "device_id": "kobo-libra-a1b2",
    "device_name": "Kobo Libra Color",
    "updated_at": 1789512345678
  }]
}

// risposta
{
  "outcomes": [{"uid": "calibre:Calibre_Library:4213", "result": "applied",
                "record": {"…": "…", "revision": 918}}],
  "cursor": 918
}
```

`result` vale `applied` (accettato), `stale` (ne esisteva uno più recente: nel
campo `record` c'è quello autorevole, che il device applica) oppure `unchanged`
(identico a quello che c'era: nessuna revisione consumata).

### Manga

Per un manga il record descrive **la serie**, non il capitolo:

```jsonc
{
  "uid": "suwayomi:manga:87",
  "kind": "manga",
  "percent": 0.375,                      // (capitolo 2 di 4, a metà)
  "chapter_uid": "suwayomi:chapter:19044",
  "page": 10, "pages": 20,
  "status": "reading",
  "updated_at": 1789512345678
}
```

`page` è 1-based come sul lettore; l'hub sottrae uno scrivendo `lastPageRead`
su Suwayomi, e marca il capitolo letto oltre `INKBRIDGE_MANGA_READ_THRESHOLD`.

## KOSync

| Metodo | Percorso |
|---|---|
| `GET` | `/users/auth` |
| `POST` | `/users/create` |
| `PUT` | `/syncs/progress` |
| `GET` | `/syncs/progress/{document}` |

Compatibili con il plugin «Progress sync» di KOReader: basta puntarlo
all'hub. Con un alias registrato (`POST /v1/aliases`) i progressi di un device
senza plugin finiscono sullo stesso record del catalogo, e da lì su Calibre.

## Errori

| Codice | Significato |
|---|---|
| `401` | token assente o sbagliato |
| `404` | nessun progresso per quell'`uid`, o capitolo senza pagine |
| `502` | Calibre o Suwayomi hanno risposto male (il dettaglio lo dice) |
