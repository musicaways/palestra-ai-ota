#!/bin/sh
# Copia il plugin InkBridge su un Kobo collegato via USB.
#
#   ./scripts/install-kobo.sh /media/$USER/KOBOeReader
#
# Il lettore deve avere KOReader già installato (cartella .adds/koreader).

set -eu

MOUNT="${1:-}"
if [ -z "$MOUNT" ]; then
    echo "Uso: $0 <punto-di-mount-del-kobo>" >&2
    echo "Esempi: /media/$USER/KOBOeReader   /Volumes/KOBOeReader" >&2
    exit 1
fi

if [ ! -d "$MOUNT" ]; then
    echo "Errore: $MOUNT non esiste. Il Kobo è collegato e montato?" >&2
    exit 1
fi

PLUGINS="$MOUNT/.adds/koreader/plugins"
if [ ! -d "$PLUGINS" ]; then
    echo "Errore: $PLUGINS non trovato." >&2
    echo "KOReader non sembra installato su questo dispositivo." >&2
    exit 1
fi

SOURCE="$(cd "$(dirname "$0")/.." && pwd)/koplugin/inkbridge.koplugin"
TARGET="$PLUGINS/inkbridge.koplugin"

if [ -d "$TARGET" ]; then
    echo "Aggiorno l'installazione esistente in $TARGET"
    rm -rf "$TARGET"
else
    echo "Installo in $TARGET"
fi

cp -R "$SOURCE" "$TARGET"
# I sorgenti Lua non devono essere eseguibili: su FAT32 non cambia nulla, su
# altri filesystem evita permessi strani.
find "$TARGET" -type f -name '*.lua' -exec chmod 644 {} + 2>/dev/null || true

echo
echo "Fatto. Ora:"
echo "  1. espelli il Kobo;"
echo "  2. apri KOReader;"
echo "  3. Strumenti → InkBridge → Server → indirizzo dell'hub e token;"
echo "  4. Prova la connessione, poi «Apri la libreria»."
