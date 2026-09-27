import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromaFrames, alignToAudio } from '../js/audioanalysis.js';
import { buildTimeline } from '../js/timeline.js';
import { chordPitchClasses } from '../js/detect.js';

// "Registrazione" sintetica: gli accordi del brano suonati come note pure, spostati di `delay` secondi.
function render(tl, delay, sr = 8000, dur = 70) {
  const out = new Float32Array(sr * dur);
  for (const ev of tl.events) {
    const pcs = chordPitchClasses(ev.name).notes;
    const f = pcs.map((pc) => 220 * 2 ** (((pc - 9 + 12) % 12) / 12));
    const a = Math.max(0, Math.floor((ev.start + delay) * sr));
    const b = Math.min(out.length, Math.floor((ev.end + delay) * sr));
    for (let i = a; i < b; i++) {
      let v = 0;
      for (const x of f) v += Math.sin((2 * Math.PI * x * i) / sr) + 0.5 * Math.sin((4 * Math.PI * x * i) / sr);
      out[i] += v * 0.1;
    }
  }
  return out;
}

test('il file audio fa trovare lo spostamento giusto (anche di molti secondi)', () => {
  const song = { bpm: 100, timeSignature: [4, 4], offset: 1, sections: [{ name: 'A', bars: ['C', 'G', 'Am', 'F', 'Dm', 'G', 'C', 'Em'], repeat: 3 }] };
  const tl = buildTimeline(song);
  for (const delay of [3.4, -1.2]) {
    const sr = 8000;
    const frames = chromaFrames(render(tl, delay, sr), sr, { hop: 0.2, size: 2048 });
    const r = alignToAudio(frames, tl, { range: 8 });
    assert.ok(Math.abs(r.shift - delay) < 0.15, `atteso ${delay}, trovato ${r.shift}`);
    assert.ok(Math.abs(r.drift) < 0.2, `deriva ${r.drift}`);
  }
});

test('giro che si ripete: fra picchi pari si sceglie lo spostamento più piccolo', async () => {
  const { readFileSync } = await import('node:fs');
  const { wavForSong } = await import('./fixtures.mjs');
  const { buildTimeline } = await import('../js/timeline.js');
  const song = JSON.parse(readFileSync(new URL('../songs/salmo-cartine-corte.json', import.meta.url)));
  const buf = wavForSong(song, { delay: 1.5, seconds: 70 });
  const pcm = new Int16Array(buf.buffer.slice(buf.byteOffset + 44, buf.byteOffset + buf.length));
  const frames = chromaFrames(Float32Array.from(pcm, (v) => v / 32768), 22050, { hop: 0.15 });
  const r = alignToAudio(frames, buildTimeline(song), { range: 25 });
  assert.ok(Math.abs(r.shift - 1.5) < 0.1, `spostamento ${r.shift}`);
});
