#!/usr/bin/env bash
# Guitar Song Trainer - avvio su macOS e Linux.
# Serve Node.js (https://nodejs.org) oppure Python 3 (già presente su macOS e Linux).
cd "$(dirname "$0")"
PORT="${PORT:-8080}"   # porta diversa: PORT=9090 ./avvia.sh
URL="http://localhost:$PORT"
open_browser() { (sleep 1.5; if command -v open >/dev/null; then open "$URL"; else xdg-open "$URL" >/dev/null 2>&1; fi) & }
echo "Guitar Song Trainer su $URL  -  premi Ctrl+C per fermarlo."
if command -v npx >/dev/null 2>&1; then
  open_browser; exec npx --yes http-server -p "$PORT" -c-1 .
elif command -v python3 >/dev/null 2>&1; then
  open_browser; exec python3 -m http.server "$PORT"
else
  echo "Serve Node.js (https://nodejs.org) oppure Python 3."; exit 1
fi
