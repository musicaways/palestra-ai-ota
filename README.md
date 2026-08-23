# Palestra AI — canale aggiornamenti OTA

Questo repository contiene **solo il bundle web compilato** di Palestra AI, non il codice sorgente.

- `version.json` — manifest letto dall'app a ogni avvio: versione disponibile e URL del pacchetto.
- Il pacchetto `dist.zip` è allegato alla **release** corrispondente, non versionato in git:
  così la cronologia non cresce di ~20 MB a ogni aggiornamento.

L'app confronta `version.json` con la propria versione (semver) e scarica solo se è più recente.
Il repository è pubblico perché il manifest va raggiunto senza autenticazione dal dispositivo.

Codice sorgente: repository privato `musicaways/palestra-ai`.
