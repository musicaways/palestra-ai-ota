#!/usr/bin/env bash
# Manutenzione della memoria condivisa.
#
#   ./scripts/memoria.sh leggi                     stampa lo stato attuale
#   ./scripts/memoria.sh diario <chi> "<testo>"    aggiunge una voce al diario
#   ./scripts/memoria.sh stato                     riallinea memoria/stato.json
#   ./scripts/memoria.sh domanda "<testo>"         apre una domanda per l'umano
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MEMORIA="$ROOT/memoria"
OGGI="$(date +%Y-%m-%d)"

comando="${1:-leggi}"

case "$comando" in

leggi)
    echo "════ STATO ════"
    sed -n '1,40p' "$MEMORIA/STATO.md"
    echo
    echo "════ ATTIVITÀ IN CORSO ════"
    sed -n '/^## In corso/,/^## Da fare/p' "$MEMORIA/ATTIVITA.md"
    echo "════ ULTIMA VOCE DI DIARIO ════"
    awk '/^## /{ultima=NR} {righe[NR]=$0} END{for(i=ultima;i<=NR;i++) print righe[i]}' \
        "$MEMORIA/DIARIO.md"
    ;;

diario)
    chi="${2:-}"
    testo="${3:-}"
    if [ -z "$chi" ] || [ -z "$testo" ]; then
        echo "Uso: $0 diario <chi> \"<testo>\"" >&2
        echo "Esempio: $0 diario codex \"Rivisto il merge, aggiunto un test\"" >&2
        exit 1
    fi
    printf '\n## %s · %s\n\n%s\n' "$OGGI" "$chi" "$testo" >> "$MEMORIA/DIARIO.md"
    echo "Voce aggiunta a memoria/DIARIO.md ($OGGI · $chi)."
    ;;

domanda)
    testo="${2:-}"
    if [ -z "$testo" ]; then
        echo "Uso: $0 domanda \"<testo>\"" >&2
        exit 1
    fi
    # Il prossimo numero libero fra le domande già aperte o risposte.
    ultimo="$(grep -o 'Q-[0-9]\{3\}' "$MEMORIA/DOMANDE.md" | sort -u | tail -1 || true)"
    numero="$(( ${ultimo#Q-} + 1 ))"
    id="$(printf 'Q-%03d' "$numero")"
    riga="| $id | $testo | — | $OGGI |"
    # Inserisce la riga in coda alla tabella delle domande aperte, cioè prima
    # delle righe vuote che precedono "## Risposte date" (altrimenti la tabella
    # si spezza in due).
    awk -v riga="$riga" '
        /^[[:space:]]*$/ && !inserita { vuote[++n] = $0; next }
        /^## Risposte date/ && !inserita {
            print riga
            for (i = 1; i <= n; i++) print vuote[i]
            n = 0
            inserita = 1
            print
            next
        }
        {
            for (i = 1; i <= n; i++) print vuote[i]
            n = 0
            print
        }
        END { for (i = 1; i <= n; i++) print vuote[i] }
    ' "$MEMORIA/DOMANDE.md" > "$MEMORIA/DOMANDE.md.tmp"
    mv "$MEMORIA/DOMANDE.md.tmp" "$MEMORIA/DOMANDE.md"
    echo "Domanda $id aggiunta a memoria/DOMANDE.md."
    ;;

stato)
    python3 - "$MEMORIA" <<'PY'
import json, re, subprocess, sys
from datetime import date
from pathlib import Path

memoria = Path(sys.argv[1])
percorso = memoria / "stato.json"
stato = json.loads(percorso.read_text(encoding="utf-8"))

radice = memoria.parent

def conta(comando, cartella, schema):
    """Esegue i test e ne estrae il numero, senza inventarlo."""
    try:
        esito = subprocess.run(comando, cwd=radice / cartella, shell=True,
                               capture_output=True, text=True, timeout=600)
    except Exception:
        return None
    trovato = re.search(schema, esito.stdout + esito.stderr)
    return int(trovato.group(1)) if trovato else None

python = ".venv/bin/python" if (radice / ".venv/bin/python").exists() else "python3"
misure = {
    "hub": conta(f"{python} -m pytest -q", "server", r"(\d+) passed"),
    "plugin": conta("lua5.1 tests/run.lua", "koplugin", r"(\d+) superati"),
}

for componente in stato["componenti"]:
    misurato = misure.get("hub" if componente["nome"] == "hub" else "plugin")
    if misurato:
        componente["test"] = misurato

stato["aggiornato_il"] = date.today().isoformat()
try:
    branch = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=radice,
                            capture_output=True, text=True).stdout.strip()
    if branch:
        stato["branch"] = branch
except Exception:
    pass

percorso.write_text(json.dumps(stato, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"stato.json aggiornato: hub {misure['hub']} test, plugin {misure['plugin']} test")
print("Ricorda di allineare a mano anche memoria/STATO.md se è cambiato qualcosa.")
PY
    ;;

*)
    echo "Comando sconosciuto: $comando" >&2
    sed -n '3,9p' "$0" >&2
    exit 1
    ;;
esac
