import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildTimeline } from '../js/timeline.js';
import { template } from '../js/detect.js';
import { lyricGridCheck, estimateOffsetFromAudio, tapAlignShift } from '../js/syncmath.js';

const song = JSON.parse(await readFile(new URL('../songs/salmo-cartine-corte.json', import.meta.url)));
const tl = buildTimeline(song);

// righe "cantate" sul battere di una battuta ogni due, con un po' di imprecisione
function fakeLines(shift = 0) {
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  return tl.bars.filter((_, i) => i % 2 === 0 && i > 2).map((b) => b.start + shift + rnd() * 0.25);
}

test('testo a tempo con la griglia → sincronia ok', () => {
  const r = lyricGridCheck(fakeLines(0), tl);
  assert.equal(r.status, 'ok');
  assert.ok(r.coherence > 0.8);
  assert.ok(Math.abs(r.shift) < 0.1);
});

test('testo sfasato di mezza battuta → da verificare, con la correzione giusta', () => {
  const bar = tl.bars[1].end - tl.bars[1].start;
  const r = lyricGridCheck(fakeLines(bar * 0.4), tl);
  assert.equal(r.status, 'check');
  assert.ok(Math.abs(r.shift - bar * 0.4) < 0.15, `shift ${r.shift}`);
});

test('pochi dati → stato sconosciuto', () => {
  assert.equal(lyricGridCheck([10, 20], tl).status, 'unknown');
});

// audio simulato: il video è in ritardo di trueShift rispetto agli accordi del file
function fakeFrames(trueShift, { from = 20, to = 50, noise = 0.35 } = {}) {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const frames = [];
  for (let t = from; t < to; t += 0.1) {
    const i = tl.events.findLastIndex((e) => e.start <= t - trueShift);
    const tp = template(tl.events[i].name);
    const chroma = Float32Array.from(tp, (v) => v + noise * rnd());
    frames.push({ t, chroma, level: 0.1 });
  }
  return frames;
}

test('ricava lo sfasamento ascoltando il video', () => {
  for (const trueShift of [-2.4, -0.6, 0, 0.35, 1.9]) {
    const r = estimateOffsetFromAudio(fakeFrames(trueShift), tl);
    assert.ok(Math.abs(r.shift - trueShift) <= 0.1, `atteso ${trueShift}, stimato ${r.shift}`);
    assert.ok(r.confidence > 0.3, `affidabilità ${r.confidence}`);
  }
});

test('in silenzio non inventa niente', () => {
  const frames = fakeFrames(1).map((f) => ({ ...f, level: 0 }));
  assert.deepEqual({ ...estimateOffsetFromAudio(frames, tl), scores: [] }, { shift: 0, confidence: 0, score: 0, scores: [] });
});

test('allineamento con un tocco', () => {
  assert.equal(tapAlignShift(12.34, 11.9), 0.44);
  assert.equal(tapAlignShift(8, 9.5), -1.5);
});

test('ancore sul canto: la griglia segue un brano che rallenta', async () => {
  const { computeWarp, lyricGridCheck } = await import('../js/syncmath.js');
  const { buildTimeline } = await import('../js/timeline.js');
  // brano a 100 BPM sulla carta, ma registrato a 98 (battuta 2,449 s invece di 2,4): le righe cadono sul battere vero
  const song = { bpm: 100, timeSignature: [4, 4], offset: 1, sections: [{ name: 'A', bars: Array(80).fill('C') }] };
  const realBar = 240 / 98;
  const lines = Array.from({ length: 40 }, (_, i) => 1 + (i * 2) * realBar + 0.02 * Math.sin(i));
  const before = lyricGridCheck(lines, buildTimeline(song));
  const w = computeWarp(song, lines);
  assert.ok(w.anchors.length >= 4, 'ancore trovate');
  const after = lyricGridCheck(lines, buildTimeline({ ...song, warp: w.anchors }));
  assert.ok(after.coherence > 0.9 && after.coherence > before.coherence + 0.2, `coerenza ${before.coherence.toFixed(2)} → ${after.coherence.toFixed(2)}`);
  // la battuta 60 cade dove la registrazione la mette davvero
  const tl = buildTimeline({ ...song, warp: w.anchors });
  assert.ok(Math.abs(tl.bars[60].start - (1 + 60 * realBar)) < 0.25);
});

test('le correzioni dell\'utente valgono anche con le ancore', async () => {
  const { buildTimeline } = await import('../js/timeline.js');
  const song = { bpm: 120, timeSignature: [4, 4], offset: 0, sections: [{ name: 'A', bars: ['C', 'G', 'Am', 'F'] }], warp: [[0, 0.5], [3, 6.6]] };
  const a = buildTimeline(song);
  const b = buildTimeline(song, { offset: 0.3 });
  assert.ok(Math.abs(a.bars[0].start - 0.5) < 1e-9);
  assert.ok(Math.abs(b.bars[2].start - a.bars[2].start - 0.3) < 1e-9, 'offset dell\'utente');
  const c = buildTimeline(song, { sync: [1, 3, 5, 7] });
  assert.ok(Math.abs(c.events[1].start - 3) < 1e-9, 'i tempi registrati dall\'utente vincono');
});
