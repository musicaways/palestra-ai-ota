// Controlla (e con --fix corregge) la coerenza fra la griglia degli accordi di ogni brano e i tempi
// delle righe cantate su LRCLIB. Usa SOLO i timestamp: il testo non viene mai stampato né salvato.
// Uso:  node tools/checksync.mjs          (solo controllo)
//       node tools/checksync.mjs --fix    (aggiorna "offset" nei file dei brani da verificare)
import { readFile, writeFile } from 'node:fs/promises';
import { buildTimeline } from '../js/timeline.js';
import { lyricGridCheck } from '../js/syncmath.js';

const FIX = process.argv.includes('--fix');
const dir = new URL('../songs/', import.meta.url);
const index = JSON.parse(await readFile(new URL('index.json', dir)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function lrcTimes(id) {
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(`https://lrclib.net/api/get/${id}`);
      if (res.ok) {
        const d = await res.json();
        return (d.syncedLyrics ?? '').split('\n')
          .map((l) => /^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/.exec(l))
          .filter((m) => m && m[3].trim())
          .map((m) => Number(m[1]) * 60 + Number(m[2]));
      }
    } catch { /* riprova */ }
    await sleep(2000 * (i + 1));
  }
  return null;
}

let fixed = 0;
for (const e of index) {
  const url = new URL(e.file, dir);
  const song = JSON.parse(await readFile(url));
  const id = song.lyricsSource?.lrclibId;
  const times = id ? await lrcTimes(id) : null;
  if (!times) { console.log(`?    ${e.id}: tempi non disponibili`); continue; }
  const lo = (song.lyricsSource?.offset ?? 0);
  const r = lyricGridCheck(times.map((t) => t + lo), buildTimeline(song));
  const tag = r.status === 'ok' ? 'OK  ' : 'CHK ';
  let note = '';
  if (FIX && r.status === 'check' && Math.abs(r.shift) >= 0.05) {
    // si applica solo se dopo la correzione la griglia risulta davvero in sincronia
    const trial = { ...song, offset: Math.round(((song.offset ?? 0) + r.shift) * 100) / 100 };
    const r2 = lyricGridCheck(times.map((t) => t + lo), buildTimeline(trial));
    if (r2.status === 'ok') {
      await writeFile(url, JSON.stringify(trial, null, 1) + '\n');
      note = ` → corretto offset ${trial.offset}s (ora ${Math.round(r2.coherence * 100)}%)`;
      fixed++;
    } else note = ' → correzione non affidabile, lasciato com\'è';
  }
  console.log(`${tag} ${e.id.padEnd(46)} coerenza ${String(Math.round(r.coherence * 100)).padStart(3)}%  spostamento ${r.shift >= 0 ? '+' : ''}${r.shift.toFixed(2)}s${note}`);
  await sleep(600);
}
if (FIX) console.log(`\n${fixed} brani corretti`);
