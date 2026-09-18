# CLAUDE.md

Le istruzioni di questo repository sono in **[`AGENTS.md`](AGENTS.md)**, condivise
con Codex e con qualunque altro assistente: leggile da lì, sono la stessa cosa.

In breve, per non sbagliare i primi passi:

* si lavora **solo** dentro `inkbridge/` (il resto è il canale OTA di Palestra AI
  e non si tocca);
* prima di iniziare si leggono `inkbridge/memoria/STATO.md`,
  `ATTIVITA.md` e `INVARIANTI.md`;
* si verifica con `cd inkbridge && ./scripts/check.sh`, che deve essere verde
  prima di ogni commit;
* a fine sessione si scrive una voce di diario:
  `./scripts/memoria.sh diario claude "cosa ho fatto e cosa resta"`.
