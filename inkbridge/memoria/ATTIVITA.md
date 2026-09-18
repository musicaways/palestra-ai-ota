# Attività

Identificativo `IB-nnn`, da citare nei messaggi di commit (`IB-004: …`).
Stati: `da fare` · `in corso` · `bloccata` · `fatta` · `annullata`.
La colonna *Assegnato* si riempie **prima** di iniziare, così non si lavora in
due sulla stessa cosa.

## In corso

_(nessuna)_

## Da fare — prima il collaudo, poi il resto

| ID | Attività | Priorità | Assegnato | Note |
|---|---|---|---|---|
| IB-001 | Primo collaudo end-to-end su hardware reale | **alta** | — | Vedi la checklist qui sotto: è il lavoro che sblocca tutti gli altri |
| IB-002 | Verificare quale variante GraphQL risponde sul Suwayomi di casa | alta | — | `docker compose logs` dice se la query completa è stata rifiutata; annotare il risultato in `DECISIONI.md` |
| IB-003 | Verificare il writeback su Calibre 4+ (`/book-set-last-read-position`) | alta | — | Controllare che `/v1/health` non accumuli writeback in coda |
| IB-004 | Immagine Docker pubblicata (GitHub Container Registry) | media | — | Oggi l'hub si costruisce in locale; serve un workflow di rilascio |
| IB-005 | Download automatico dei nuovi capitoli di una serie seguita | media | — | Oggi al massimo cinque a richiesta dal menu capitoli |
| IB-006 | Supporto alle collezioni/scaffali di Calibre | bassa | — | Oggi ci sono solo ricerca, tag e serie |
| IB-007 | Autenticazione digest per Calibre in modalità diretta | bassa | — | Oggi la modalità diretta richiede `--auth-mode=basic` |
| IB-008 | Pulizia automatica dei capitoli già letti sul dispositivo | bassa | — | Liberare spazio senza toccare il NAS |
| IB-009 | Traduzione dell'interfaccia del plugin con `gettext` | bassa | — | Oggi le stringhe sono in italiano nel codice |

## Fatte

| ID | Attività | Chiusa il | Da |
|---|---|---|---|
| IB-000 | Progetto iniziale: hub, plugin, test, documentazione | 2026-09-16 | claude |
| IB-010 | Memoria condivisa, changelog, roadmap, script di sviluppo, CI | 2026-09-18 | claude |

## Checklist del collaudo (IB-001)

Da spuntare sul campo, in quest'ordine — ogni riga che fallisce diventa
un'attività nuova con il messaggio d'errore esatto.

**Hub sul NAS**

- [ ] `docker compose up -d` si avvia e resta su
- [ ] `http://<nas>:8577/` mostra Calibre **attiva** e Suwayomi **attiva**
- [ ] `GET /v1/library/items?source=calibre` restituisce i libri veri
- [ ] `GET /v1/library/items?source=suwayomi` restituisce i manga veri
- [ ] una copertina si apre nel browser
- [ ] `GET /v1/library/items/<uid>/file` scarica un EPUB apribile
- [ ] `GET /v1/library/chapters/<uid>/cbz` produce un CBZ che si apre

**Plugin sul Kobo**

- [ ] il plugin compare in Strumenti → InkBridge
- [ ] «Prova la connessione» elenca le due sorgenti
- [ ] la griglia mostra le copertine (non i riquadri di ripiego)
- [ ] un libro si scarica e si apre
- [ ] un capitolo manga si scarica e si legge

**Sincronizzazione, nei due sensi**

- [ ] leggi qualche pagina, chiudi il libro, e la percentuale compare in Calibre
- [ ] leggi un capitolo sul Kobo e Suwayomi lo segna letto
- [ ] leggi nel visualizzatore web di Calibre, sincronizza, e il Kobo si allinea
- [ ] leggi su Mihon/Tachiyomi, sincronizza, e il Kobo si allinea
- [ ] con il Wi-Fi spento la lettura resta in coda e parte da sola al ritorno
- [ ] con posizioni molto diverse il Kobo **chiede** invece di saltare
