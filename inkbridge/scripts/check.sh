#!/usr/bin/env bash
# Tutti i controlli del progetto, nell'ordine in cui conviene vederli fallire.
# Esce al primo errore: se questo script è verde, il commit si può fare.
#
#   ./scripts/check.sh            tutto
#   ./scripts/check.sh server     solo l'hub
#   ./scripts/check.sh plugin     solo il plugin
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-tutto}"
FALLITI=0

titolo() { printf '\n\033[1m── %s\033[0m\n' "$1"; }
ok()     { printf '   \033[32m✓\033[0m %s\n' "$1"; }
ko()     { printf '   \033[31m✗\033[0m %s\n' "$1"; FALLITI=$((FALLITI + 1)); }

python_bin() {
    if [ -x "$ROOT/.venv/bin/python" ]; then
        echo "$ROOT/.venv/bin/python"
    elif command -v python3 >/dev/null 2>&1; then
        echo python3
    else
        echo python
    fi
}

lua_bin() {
    for candidate in lua5.1 luajit lua; do
        if command -v "$candidate" >/dev/null 2>&1; then echo "$candidate"; return; fi
    done
    echo ""
}

luac_bin() {
    for candidate in luac5.1 luac; do
        if command -v "$candidate" >/dev/null 2>&1; then echo "$candidate"; return; fi
    done
    echo ""
}

controlla_server() {
    local python; python="$(python_bin)"
    titolo "Hub (server/)"

    if "$python" -c "import ruff" >/dev/null 2>&1 || command -v ruff >/dev/null 2>&1; then
        if (cd "$ROOT/server" && ruff check . >/dev/null); then
            ok "ruff"
        else
            ko "ruff — esegui: cd server && ruff check ."
        fi
    else
        printf '   \033[33m–\033[0m ruff non installato (./scripts/setup-dev.sh)\n'
    fi

    if "$python" -c "import pytest" >/dev/null 2>&1; then
        local uscita
        if uscita="$(cd "$ROOT/server" && "$python" -m pytest -q 2>&1)"; then
            ok "pytest — $(echo "$uscita" | tail -1)"
        else
            ko "pytest"
            echo "$uscita" | tail -25
        fi
    else
        ko "pytest non installato — esegui ./scripts/setup-dev.sh"
    fi
}

controlla_plugin() {
    local lua luac; lua="$(lua_bin)"; luac="$(luac_bin)"
    titolo "Plugin (koplugin/)"

    if [ -n "$lua" ]; then
        local uscita
        if uscita="$(cd "$ROOT/koplugin" && "$lua" tests/run.lua 2>&1)"; then
            ok "test Lua — $(echo "$uscita" | tail -1)"
        else
            ko "test Lua"
            echo "$uscita" | tail -25
        fi
    else
        ko "nessun interprete Lua — esegui ./scripts/setup-dev.sh"
    fi

    if [ -n "$luac" ]; then
        local rotti=0
        while IFS= read -r file; do
            "$luac" -p "$file" 2>/dev/null || { ko "sintassi: $file"; rotti=1; }
        done < <(find "$ROOT/koplugin" -name '*.lua' | sort)
        [ "$rotti" -eq 0 ] && ok "sintassi Lua (tutti i file)"
    else
        printf '   \033[33m–\033[0m luac non disponibile, salto il controllo di sintassi\n'
    fi
}

controlla_memoria() {
    titolo "Memoria condivisa"
    local python; python="$(python_bin)"
    if "$python" -c "import json,sys; json.load(open('$ROOT/memoria/stato.json'))" 2>/dev/null; then
        ok "stato.json valido"
    else
        ko "stato.json non è JSON valido"
    fi
    for file in STATO.md ATTIVITA.md DECISIONI.md INVARIANTI.md DIARIO.md; do
        [ -s "$ROOT/memoria/$file" ] || ko "memoria/$file mancante o vuoto"
    done
}

case "$TARGET" in
    server) controlla_server ;;
    plugin) controlla_plugin ;;
    *)      controlla_server; controlla_plugin; controlla_memoria ;;
esac

printf '\n'
if [ "$FALLITI" -eq 0 ]; then
    printf '\033[32mTutto a posto.\033[0m Il commit si può fare.\n'
    exit 0
fi
printf '\033[31m%d controlli falliti.\033[0m Niente commit finché non sono verdi.\n' "$FALLITI"
exit 1
