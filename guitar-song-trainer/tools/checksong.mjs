// Controlla i brani: ogni accordo ha una diteggiatura, la timeline si costruisce, durata plausibile.
// Uso: node tools/checksong.mjs [id ...]   (senza id: tutti)
import { readFileSync } from 'node:fs';
import { buildTimeline } from '../js/timeline.js';
import { getShape } from '../js/music.js';
const root = new URL('../songs/', import.meta.url);
const index = JSON.parse(readFileSync(new URL('index.json', root)));
const ids = process.argv.slice(2);
let bad = 0;
for (const e of index) {
  if (ids.length && !ids.includes(e.id)) continue;
  const song = JSON.parse(readFileSync(new URL(e.file, root)));
  const tl = buildTimeline(song);
  const missing = [...new Set(tl.events.map((x) => x.name))].filter((n) => !getShape(n, song.shapes));
  const dur = song.lyricsSource?.duration;
  const ok = !missing.length && tl.events.length > 10 && (!dur || Math.abs(tl.end - dur) < 25) && song.youtubeId;
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${e.id}: ${tl.events.length} cambi, fine ${tl.end.toFixed(0)} s / ${dur ?? '?'} s${missing.length ? ' · senza forma: ' + missing.join(' ') : ''}${song.youtubeId ? '' : ' · senza video'}`);
}
process.exit(bad ? 1 : 0);
