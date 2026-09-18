#!/usr/bin/env bash
# Estrae InkBridge in una cartella autonoma, con la sua storia git, pronta per
# un repository dedicato.
#
#   ./scripts/export-standalone.sh ~/progetti/inkbridge
#
# Quello che ottieni è una copia indipendente: il repository di partenza non
# viene toccato in alcun modo. La storia dei commit non viene riscritta — il
# nuovo repository parte da un primo commit che contiene lo stato attuale, e il
# messaggio dice da dove arriva.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESTINAZIONE="${1:-}"

if [ -z "$DESTINAZIONE" ]; then
    echo "Uso: $0 <cartella-di-destinazione>" >&2
    echo "Esempio: $0 ~/progetti/inkbridge" >&2
    exit 1
fi

if [ -e "$DESTINAZIONE" ]; then
    echo "Errore: $DESTINAZIONE esiste già. Scegli un percorso libero." >&2
    exit 1
fi

ORIGINE_COMMIT="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo sconosciuto)"
ORIGINE_REMOTO="$(git -C "$ROOT" remote get-url origin 2>/dev/null || echo 'origine locale')"

mkdir -p "$DESTINAZIONE"
# Copia tutto tranne ciò che si rigenera o che non deve uscire di qui.
tar -C "$ROOT" \
    --exclude='.venv' \
    --exclude='__pycache__' \
    --exclude='.pytest_cache' \
    --exclude='.ruff_cache' \
    --exclude='*.egg-info' \
    --exclude='server/data' \
    --exclude='server/.env' \
    -cf - . | tar -C "$DESTINAZIONE" -xf -

# Il .gitignore della radice del repository originale copre anche noi: qui serve
# una copia autonoma.
cat > "$DESTINAZIONE/.gitignore" <<'IGNORA'
__pycache__/
*.py[cod]
.pytest_cache/
.ruff_cache/
*.egg-info/
.venv/
server/data/
server/.env
IGNORA

# Le istruzioni per gli assistenti stanno nella radice del repository originale:
# in un repository dedicato devono stare nella radice nuova.
if [ -f "$ROOT/../AGENTS.md" ]; then
    sed -e 's|inkbridge/memoria/|memoria/|g' \
        -e 's|(inkbridge/|(|g' \
        -e 's|cd inkbridge && ||g' \
        "$ROOT/../AGENTS.md" > "$DESTINAZIONE/AGENTS.md.originale"
    echo "Nota: AGENTS.md.originale va riletto e adattato (i percorsi cambiano)."
fi

cd "$DESTINAZIONE"
git init --quiet
git add -A
git -c user.email="$(git -C "$ROOT" config user.email || echo inkbridge@localhost)" \
    -c user.name="$(git -C "$ROOT" config user.name || echo InkBridge)" \
    commit --quiet -m "InkBridge: progetto autonomo

Estratto da $ORIGINE_REMOTO (commit $ORIGINE_COMMIT), dove viveva in
inkbridge/. Contenuto identico, percorsi accorciati di un livello."

cat <<FINE

Fatto: $DESTINAZIONE

Ora, se vuoi pubblicarlo:

  cd "$DESTINAZIONE"
  git remote add origin git@github.com:<utente>/inkbridge.git
  git push -u origin main

Ricorda di rileggere AGENTS.md e i riferimenti a «inkbridge/» nella
documentazione: in un repository dedicato quel livello di cartella non c'è più.
FINE
