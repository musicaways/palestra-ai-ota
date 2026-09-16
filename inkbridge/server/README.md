# InkBridge Hub

Servizio da installare sul NAS: unifica il catalogo di **Calibre** e **Suwayomi**,
serve i file al Kobo e tiene allineata la posizione di lettura nei due sensi.

```bash
cp .env.example .env
$EDITOR .env          # URL di Calibre/Suwayomi e token condiviso
docker compose up -d
```

Poi apri `http://<nas>:8577/` per la pagina di stato e `/docs` per l'API.

Senza Docker:

```bash
pip install -e ".[dev]"
INKBRIDGE_DATA_DIR=./data inkbridge
```

Documentazione completa: [`../docs/`](../docs/) — architettura, installazione sul
Kobo Libra Color, riferimento API.
