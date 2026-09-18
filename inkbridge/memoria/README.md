# Memoria condivisa di InkBridge

Questa cartella è il **cervello comune** del progetto: la leggono e la scrivono
sia Claude Code sia Codex (sia tu, quando vuoi capire a che punto siamo).
Vive dentro il repository, quindi si sincronizza con `git pull` / `git push` e
non dipende dalla memoria interna di nessun assistente — che con la fine di una
sessione svanisce.

## I file

| File | Cos'è | Chi lo tocca |
|---|---|---|
| [`STATO.md`](STATO.md) | dove siamo **adesso**: versione, cosa funziona, cosa manca | chi chiude un lavoro |
| [`ATTIVITA.md`](ATTIVITA.md) | l'elenco dei lavori, con identificativo e stato | chi prende o chiude un lavoro |
| [`DECISIONI.md`](DECISIONI.md) | le scelte di progetto e **perché** sono state fatte | chi decide qualcosa di strutturale |
| [`INVARIANTI.md`](INVARIANTI.md) | le regole che non si violano mai | si modifica solo con una nuova decisione |
| [`DIARIO.md`](DIARIO.md) | registro cronologico delle sessioni, in sola aggiunta | tutti, a fine sessione |
| [`DOMANDE.md`](DOMANDE.md) | cosa serve sapere da te, e le risposte già date | chi resta bloccato |
| [`GLOSSARIO.md`](GLOSSARIO.md) | i termini del dominio, con un significato solo | chi introduce un termine nuovo |
| [`stato.json`](stato.json) | gli stessi dati di `STATO.md` in forma leggibile da un programma | `scripts/memoria.sh` |

## Protocollo (vale per Claude, per Codex e per chiunque altro)

**A inizio sessione** — nell'ordine, sono cinque minuti di lettura:

1. `memoria/STATO.md` — il punto della situazione;
2. `memoria/ATTIVITA.md` — cosa è in corso e cosa è libero;
3. `memoria/INVARIANTI.md` — le regole da non rompere;
4. `memoria/DECISIONI.md` — almeno le ultime tre voci, per non ridiscutere il già deciso.

**Durante il lavoro**

* prendi un'attività scrivendo il tuo nome nella colonna *Assegnato* di
  `ATTIVITA.md` (`claude`, `codex`, `musicaways`), così non si lavora in due
  sulla stessa cosa;
* se una scelta cambia la forma del progetto (un'API, un formato dati, una
  dipendenza), aggiungi una voce in `DECISIONI.md` **prima** di implementarla:
  il codice si legge, il motivo no;
* se ti manca un'informazione che solo l'umano ha, scrivila in `DOMANDE.md` e
  vai avanti con il resto invece di fermarti.

**A fine sessione** — sempre, anche se il lavoro è rimasto a metà:

```bash
cd inkbridge
./scripts/check.sh                       # tutti i test devono passare
./scripts/memoria.sh diario claude "Cosa ho fatto e cosa resta"
./scripts/memoria.sh stato               # riallinea stato.json
git add -A && git commit -m "…" && git push
```

Una sessione che finisce senza una riga di diario è una sessione che l'altro
assistente dovrà ricostruire leggendo il `git log`: fattibile, ma è tempo
sprecato due volte.

## Regole di igiene

* `DIARIO.md` è **in sola aggiunta**: non si riscrive il passato, al massimo si
  corregge con una nuova voce.
* `STATO.md` descrive solo il **presente**: quando una cosa non è più vera, si
  sostituisce, non si accumula.
* Niente segreti qui dentro: token, password e indirizzi privati stanno in
  `server/.env` (che è in `.gitignore`) o nelle impostazioni del lettore.
  In memoria si scrive «il token è quello del NAS», non il token.
* Se due assistenti modificano lo stesso file di memoria e git segnala un
  conflitto: `DIARIO.md` si risolve tenendo **entrambe** le voci in ordine di
  data; per gli altri file vince la versione più recente e la differenza si
  annota in una voce di diario.
