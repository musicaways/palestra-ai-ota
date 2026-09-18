# Portare il progetto sul tuo PC

Tutto il progetto vive nel repository: per averlo in locale basta clonarlo. Non
c'è niente da ricostruire a mano e niente da scaricare a parte.

## 1. Cosa serve

| | Versione | A cosa serve |
|---|---|---|
| **git** | qualunque recente | scaricare e sincronizzare il progetto |
| **Python** | 3.11 o superiore | eseguire e testare l'hub |
| **Lua** | 5.1 o LuaJIT | eseguire i test del plugin |
| **Docker** | facoltativo | far girare l'hub sul NAS (o provarlo in locale) |

Su Windows conviene lavorare dentro **WSL2** (Ubuntu): gli script sono `sh`/`bash`
e lì funzionano senza adattamenti. In alternativa vanno bene Git Bash o il
terminale di macOS e Linux.

## 2. Clonare

```bash
# scegli dove tenere i progetti
mkdir -p ~/progetti && cd ~/progetti

git clone https://github.com/musicaways/palestra-ai-ota.git
cd palestra-ai-ota

# il lavoro su InkBridge è su questo branch finché la PR #1 è aperta
git checkout claude/kobo-reader-ebook-manga-app-8zqkn4
cd inkbridge
```

La cartella che ti ritrovi è questa:

```
inkbridge/
├── AGENTS.md            regole di lavoro per gli assistenti
├── CHANGELOG.md         cosa è cambiato, versione per versione
├── CONTRIBUTING.md      come si lavora al progetto
├── LICENSE              MIT
├── Makefile             scorciatoie: make test, make hub, make memoria…
├── README.md            presentazione e avvio rapido
├── ROADMAP.md           cosa viene dopo, e perché
├── docs/                architettura, installazione sul Kobo, API, limiti
├── koplugin/            il plugin KOReader + i suoi test
├── memoria/             ⭐ la memoria condivisa fra gli assistenti
├── scripts/             setup, verifica, memoria, installazione, export
└── server/              l'hub per il NAS + i suoi test
```

## 3. Preparare l'ambiente

```bash
./scripts/setup-dev.sh
```

Crea `.venv`, installa l'hub e gli strumenti di sviluppo, sistema Lua se manca e
chiude eseguendo tutti i controlli. Se finisce con *«Tutto a posto»* sei pronto.

Da lì in avanti, il comando che userai più spesso:

```bash
./scripts/check.sh      # oppure: make test
```

## 4. Provare l'hub in locale, senza NAS

Utile per vedere l'interfaccia dell'API prima di installare qualcosa:

```bash
cd server
cp .env.example .env     # puoi lasciare vuoti gli URL: le sorgenti risulteranno spente
INKBRIDGE_DATA_DIR=./data ../.venv/bin/python -m inkbridge
```

Poi apri <http://127.0.0.1:8577/> (pagina di stato) e <http://127.0.0.1:8577/docs>
(API interattiva). Con gli URL veri di Calibre e Suwayomi in `.env`, lo stesso
comando ti dà l'hub completo senza Docker.

## 5. Lavorare con Codex e con Claude Code sulla stessa cartella

Entrambi gli assistenti trovano le istruzioni da soli: **Codex** legge
`AGENTS.md` (sia quello di radice sia quello dentro `inkbridge/`), **Claude
Code** legge `CLAUDE.md`, che rimanda allo stesso file. Non devi spiegargli il
progetto ogni volta.

```bash
cd ~/progetti/palestra-ai-ota    # Codex parte dalla radice del repository
codex

cd ~/progetti/palestra-ai-ota
claude
```

Un buon primo messaggio, per l'uno o per l'altro:

> Leggi `inkbridge/memoria/STATO.md`, `ATTIVITA.md` e `INVARIANTI.md`, poi dimmi
> a che punto siamo e quale attività conviene affrontare.

### Come fanno a non pestarsi i piedi

La memoria condivisa è in [`memoria/`](../memoria/), in file di testo
versionati: niente stato nascosto dentro un assistente, niente sessione che
porta via con sé quello che sapeva.

* **prima di iniziare** entrambi leggono `STATO.md`, `ATTIVITA.md`,
  `INVARIANTI.md` e le ultime `DECISIONI.md`;
* **prendendo un'attività** scrivono il proprio nome nella colonna *Assegnato*
  di `ATTIVITA.md` e fanno commit subito: è così che l'altro vede che è occupata;
* **a fine sessione** aggiungono una voce al diario:

  ```bash
  ./scripts/memoria.sh diario codex "Rivisto il merge, aggiunto un test, resta IB-003"
  ```

* poi `git push`, perché una memoria che resta sul tuo disco non è condivisa.

Prima di ogni sessione, e dopo ogni pausa lunga:

```bash
git pull --rebase
```

Se git segnala un conflitto su `DIARIO.md`, la soluzione è tenere **entrambe** le
voci in ordine di data: è un registro, non una classifica. Sugli altri file di
memoria vince la versione più recente, e la differenza si annota in una voce di
diario.

### Una divisione dei ruoli che funziona

Non è obbligatoria, ma evita il lavoro doppio: **uno implementa, l'altro
rivede**. Per esempio Claude Code scrive l'attività `IB-00n` e la mette in PR;
Codex la rilegge contro `INVARIANTI.md`, cerca i casi non coperti dai test e
scrive cosa ha trovato — nella pull request o in una voce di diario. Poi ci si
scambia. Il controllo incrociato è utile perché i due sbagliano in modi diversi.

## 6. Tenere allineato quello che c'è sul NAS e sul Kobo

```bash
# NAS: aggiorna l'hub dopo un git pull
cd inkbridge/server && docker compose up -d --build

# Kobo collegato via USB: reinstalla il plugin
cd inkbridge && ./scripts/install-kobo.sh /media/$USER/KOBOeReader
```

## 7. Se un giorno vuoi un repository solo per InkBridge

```bash
./scripts/export-standalone.sh ~/progetti/inkbridge
cd ~/progetti/inkbridge
git remote add origin git@github.com:musicaways/inkbridge.git
git push -u origin main
```

Ottieni una copia autonoma con la sua storia git; il repository di partenza
resta intatto. Perché la decisione sia stata rimandata è spiegato nella
decisione D-006 in [`memoria/DECISIONI.md`](../memoria/DECISIONI.md).
