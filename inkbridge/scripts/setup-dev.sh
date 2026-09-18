#!/usr/bin/env bash
# Prepara la macchina per lavorare a InkBridge: dipendenze Python in un
# ambiente virtuale locale, interprete Lua, e una verifica finale.
#
#   ./scripts/setup-dev.sh
#
# Non serve sul NAS (lì gira Docker) né sul Kobo: è solo per sviluppare.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

titolo() { printf '\n\033[1m── %s\033[0m\n' "$1"; }
nota()   { printf '   %s\n' "$1"; }

titolo "Python"
if ! command -v python3 >/dev/null 2>&1; then
    echo "Errore: serve Python 3.11 o superiore." >&2
    echo "  macOS:  brew install python@3.12" >&2
    echo "  Debian: sudo apt install python3 python3-venv" >&2
    exit 1
fi
VERSIONE="$(python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
nota "trovato Python $VERSIONE"
python3 - <<'PY' || { echo "Errore: serve Python 3.11 o superiore." >&2; exit 1; }
import sys
raise SystemExit(0 if sys.version_info >= (3, 11) else 1)
PY

if [ ! -d .venv ]; then
    nota "creo l'ambiente virtuale in .venv"
    python3 -m venv .venv
fi
# shellcheck disable=SC1091
. .venv/bin/activate
nota "installo l'hub e gli strumenti di sviluppo"
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -e "./server[dev]"
nota "fatto: $(python -m pytest --version 2>&1 | head -1)"

titolo "Lua"
if command -v lua5.1 >/dev/null 2>&1 || command -v luajit >/dev/null 2>&1; then
    nota "interprete già presente: $(command -v lua5.1 || command -v luajit)"
else
    nota "nessun interprete Lua trovato: provo a installarlo"
    if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get install -y lua5.1 || nota "installazione non riuscita, fallo a mano"
    elif command -v brew >/dev/null 2>&1; then
        brew install lua@5.1 || nota "installazione non riuscita, fallo a mano"
    else
        nota "installa Lua 5.1 (o LuaJIT) con il gestore pacchetti del tuo sistema"
    fi
fi

titolo "Verifica"
./scripts/check.sh

cat <<'FINE'

Pronto. Da qui in avanti:

  . .venv/bin/activate     attiva l'ambiente Python (una volta per terminale)
  ./scripts/check.sh       tutti i controlli, prima di ogni commit
  make test                lo stesso, se preferisci make

La memoria condivisa del progetto è in memoria/: comincia da memoria/STATO.md.
FINE
