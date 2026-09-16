# InkBridge per KOReader

Il plugin da installare sul Kobo. Struttura:

```
inkbridge.koplugin/
  main.lua            innesto in KOReader: menu, gesti, eventi del lettore
  _meta.lua           descrizione mostrata da KOReader
  lib/
    backend*.lua      hub InkBridge oppure Calibre/Suwayomi diretti
    browser.lua       schermata principale, ricerca, elenco/griglia
    covergrid.lua     la griglia di copertine
    detail.lua        scheda di un titolo e azioni rapide
    chapters.lua      capitoli di un manga
    sync.lua          motore di sincronizzazione bidirezionale
    queue.lua         coda offline dei progressi
    docmap.lua        file sul dispositivo ⇄ elemento del catalogo
    downloader.lua    download con avanzamento
    cbz.lua           confezionamento CBZ (solo modalità diretta)
    http.lua          rete, con messaggi d'errore comprensibili
    catalog.lua       cache di catalogo e copertine
    config.lua        impostazioni persistenti
    settings_ui.lua   voci di menu
```

Installazione: `../scripts/install-kobo.sh /media/$USER/KOBOeReader`, oppure
copia `inkbridge.koplugin` in `.adds/koreader/plugins/`.

## Test

I moduli di KOReader sono simulati in `tests/stubs.lua`, così la logica gira
sotto un Lua 5.1 qualunque:

```bash
lua5.1 tests/run.lua
```

Verificano la costruzione dei record di progresso (libri e capitoli manga), la
coda offline, la risoluzione dei conflitti all'apertura, la mappa
file ⇄ catalogo, il writer CBZ (confrontato con un vero lettore ZIP) e i due
back end con la rete sostituita da un registratore.

Controllo sintattico di tutti i file:

```bash
luac5.1 -p inkbridge.koplugin/*.lua inkbridge.koplugin/lib/*.lua
```
