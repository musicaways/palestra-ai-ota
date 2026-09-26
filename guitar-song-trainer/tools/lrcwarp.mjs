// Sincronizzazione di default di ogni brano: aggancia la griglia degli accordi ai tempi delle righe cantate
// (LRCLIB, che segue la registrazione) lungo tutto il brano. Così non c'è deriva anche se il BPM stimato non è
// perfetto o se il brano è suonato senza metronomo; per il rap (righe fuori dal battere) si aggancia al battito.
// Usa SOLO i timestamp: il testo non viene mai stampato né salvato.
//
// Uso: node tools/lrcwarp.mjs [id ...] [--write]
import { readFile, writeFile } from 'node:fs/promises';
import { buildTimeline } from '../js/timeline.js';
import { parseLrc } from '../js/lyrics.js';
import { lyricGridCheck, computeWarp } from '../js/syncmath.js';

const WRITE = process.argv.includes('--write');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const dir = new URL('../songs/', import.meta.url);
const index = JSON.parse(await readFile(new URL('index.json', dir))).filter((e) => !only.length || only.includes(e.id));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function lrcTimes(id) {
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(`https://lrclib.net/api/get/${id}`);
      if (res.ok) {
        const d = await res.json();
        // stesso parser dell'app (gestisce \r\n, [offset:], più tempi per riga)
        return parseLrc(d.syncedLyrics ?? '').filter((l) => l.text).map((l) => l.t);
      }
    } catch { /* riprova */ }
    await sleep(1500 * (i + 1));
  }
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let changed = 0;
  for (const e of index) {
    const path = new URL(e.file, dir);
    const song = JSON.parse(await readFile(path));
    const lid = song.lyricsSource?.lrclibId;
    if (!lid) continue;
    const lines = await lrcTimes(lid);
    if (!lines) { console.log(`?    ${e.id}: testo non raggiungibile`); continue; }
    const before = lyricGridCheck(lines, buildTimeline({ ...song, warp: undefined }));
    const w = computeWarp(song, lines);
    let after = before;
    if (w?.anchors?.length) after = lyricGridCheck(lines, buildTimeline({ ...song, warp: w.anchors }));
    const tag = !w?.anchors ? 'NO  ' : !w.anchors.length ? 'OK  ' : 'WARP';
    console.log(`${tag} ${e.id.padEnd(46)} R ${(w?.R ?? 0).toFixed(2)} ${w?.unit ?? ''} coerenza ${Math.round(before.coherence * 100)}% → ${Math.round(after.coherence * 100)}%` +
      `${w?.spread != null ? ` · deriva ${w.spread.toFixed(2)} s` : ''}${w?.anchors?.length ? ` · ${w.anchors.length} ancore` : ''}${w?.reason ? ` · ${w.reason}` : ''}`);
    if (WRITE) {
      const keep = w?.anchors?.length && after.coherence >= before.coherence + 0.02;
      if (keep || song.warp) {
        if (keep) song.warp = w.anchors; else delete song.warp;
        await writeFile(path, JSON.stringify(song, null, 1));
        changed++;
      }
    }
    await sleep(150);
  }
  if (WRITE) console.log(`\n${changed} brani aggiornati`);
}
