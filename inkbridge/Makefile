# Scorciatoie per lavorare a InkBridge.  `make` da solo mostra questo elenco.
.DEFAULT_GOAL := aiuto
.PHONY: aiuto setup test check lint server-test plugin-test hub docker memoria stato pulisci

PYTHON := $(shell [ -x .venv/bin/python ] && echo .venv/bin/python || echo python3)

aiuto:  ## Mostra i comandi disponibili
	@echo "InkBridge — comandi disponibili:"
	@echo
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'
	@echo
	@echo "La memoria condivisa del progetto è in memoria/ — si comincia da STATO.md."

setup:  ## Installa le dipendenze di sviluppo (Python e Lua)
	./scripts/setup-dev.sh

test:  ## Esegue tutti i controlli (ruff, pytest, test Lua, sintassi)
	./scripts/check.sh

check: test  ## Sinonimo di «test»

server-test:  ## Solo i test dell'hub
	./scripts/check.sh server

plugin-test:  ## Solo i test del plugin
	./scripts/check.sh plugin

lint:  ## Solo ruff sull'hub
	cd server && ruff check .

hub:  ## Avvia l'hub in locale su http://127.0.0.1:8577
	cd server && INKBRIDGE_DATA_DIR=./data $(CURDIR)/$(PYTHON) -m inkbridge

docker:  ## Costruisce e avvia l'hub con Docker
	cd server && docker compose up -d --build

memoria:  ## Stampa lo stato corrente della memoria condivisa
	./scripts/memoria.sh leggi

stato:  ## Riallinea memoria/stato.json contando i test davvero presenti
	./scripts/memoria.sh stato

pulisci:  ## Rimuove cache e file temporanei
	find . -name '__pycache__' -type d -prune -exec rm -rf {} +
	rm -rf server/.pytest_cache server/.ruff_cache server/*.egg-info
