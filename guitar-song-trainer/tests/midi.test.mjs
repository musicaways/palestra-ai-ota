import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMidi, guessGuitarTrack, fingerNotes, midiChromaFrames, alignMidi, placeMidi, beatChords } from '../js/midi.js';
import { buildTimeline } from '../js/timeline.js';

// Costruisce un piccolo file MIDI (formato 1) in memoria.
const vlq = (n) => { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };
const chunk = (id, bytes) => [...id].map((c) => c.charCodeAt(0)).concat([bytes.length >>> 24, (bytes.length >> 16) & 255, (bytes.length >> 8) & 255, bytes.length & 255], bytes);
function track(events) {
  const out = [];
  for (const [dt, ...b] of events) out.push(...vlq(dt), ...b);
  out.push(0, 0xff, 0x2f, 0);
  return chunk('MTrk', out);
}
function file(tracks, division = 480) {
  return new Uint8Array([...chunk('MThd', [0, 1, 0, tracks.length, division >> 8, division & 255]), ...tracks.flat()]);
}
const name = (s) => [0xff, 0x03, s.length, ...[...s].map((c) => c.charCodeAt(0))];

test('MIDI: tracce, tempi in secondi con cambio di tempo, batteria esclusa', () => {
  const tempo100 = [0, 0xff, 0x51, 3, 0x09, 0x27, 0xc0]; // 600000 µs = 100 BPM
  const t0 = track([tempo100, [960, 0xff, 0x51, 3, 0x07, 0xa1, 0x20]]); // a tick 960 → 120 BPM
  const gtr = track([[0, ...name('Guitar')], [0, 0xc0, 25], [0, 0x90, 40, 90], [480, 0x80, 40, 0],
    [0, 0x90, 48, 80], [0, 0x90, 52, 80], [0, 0x90, 55, 80], [480, 0x80, 48, 0], [0, 0x80, 52, 0], [0, 0x80, 55, 0],
    [0, 0x90, 64, 80], [480, 0x80, 64, 0]]);
  const drums = track([[0, 0x99, 36, 100], [240, 0x89, 36, 0]]);
  const bass = track([[0, ...name('Bass')], [0, 0xc1, 33], [0, 0x91, 28, 90], [960, 0x81, 28, 0]]);
  const m = parseMidi(file([t0, gtr, drums, bass]));
  assert.equal(m.bpm, 100);
  assert.equal(m.tracks.length, 2, 'la batteria (canale 10) non c\'è');
  const g = m.tracks[guessGuitarTrack(m.tracks)];
  assert.equal(g.name, 'Guitar');
  assert.equal(g.notes.length, 5);
  assert.ok(Math.abs(g.notes[1].t - 0.6) < 1e-9, 'una semiminima a 100 BPM = 0,6 s');
  // l'ultima nota inizia al tick 960, quando il tempo passa a 120: 1,2 s, dura 0,5 s
  assert.ok(Math.abs(g.notes[4].t - 1.2) < 1e-9 && Math.abs(g.notes[4].dur - 0.5) < 1e-9);
});

test('diteggiatura: note dello stesso accordo su corde diverse, posizione comoda', () => {
  const notes = [
    { t: 0, dur: 0.5, pitch: 40 }, // Mi grave a vuoto
    { t: 1, dur: 0.5, pitch: 48 }, { t: 1, dur: 0.5, pitch: 52 }, { t: 1, dur: 0.5, pitch: 55 }, // Do maggiore
    { t: 2, dur: 0.5, pitch: 69 }, // La al 5° tasto del cantino
  ];
  const f = fingerNotes(notes);
  assert.equal(f.length, 5);
  assert.deepEqual([f[0].string, f[0].fret], [0, 0]);
  const chord = f.filter((x) => x.t === 1);
  assert.equal(new Set(chord.map((x) => x.string)).size, 3);
  const OPEN = [40, 45, 50, 55, 59, 64];
  for (const x of f) assert.equal(OPEN[x.string] + x.fret, x.pitch, 'ogni posizione suona la nota giusta');
  const frets = chord.map((x) => x.fret).filter((x) => x > 0);
  assert.ok(Math.max(...frets) - Math.min(...frets) <= 4);
});

test('cromagramma della parte MIDI', () => {
  const fr = midiChromaFrames([{ t: 0, dur: 1, pitch: 60 }, { t: 0, dur: 1, pitch: 64 }], { hop: 0.25 });
  assert.equal(fr[0].chroma[0], 1);
  assert.equal(fr[0].chroma[4], 1);
  assert.ok(fr[0].level > 0);
});

// Brano di prova: giro C Am F G, due battute di intro prima, e ancore warp che rallentano la seconda metà.
const SONG = {
  bpm: 100, timeSignature: [4, 4], offset: 2,
  patterns: { giro: ['C', 'Am', 'F', 'G', 'C', 'G', 'Am', 'F'] },
  sections: [{ name: 'Intro', bars: ['C', 'C'] }, { name: 'Strofa', pattern: 'giro', repeat: 3 }],
};
const CHORD = { C: [48, 52, 55, 60], Am: [45, 52, 57, 60], F: [41, 48, 53, 57], G: [43, 47, 50, 55] };
// parte MIDI che parte dalla strofa (battuta 2 del brano), un accordo arpeggiato per battuta
function midiPart(bars, pickup = 0) {
  const out = [];
  bars.forEach((name, i) => CHORD[name].forEach((p, k) => out.push({ pitch: p, vel: 80, b: pickup + i * 4 + k, bd: 1 })));
  return out;
}

test('allineamento della parte MIDI agli accordi della griglia', () => {
  const tl = buildTimeline(SONG);
  assert.equal(beatChords(tl).length, tl.bars.length * 4);
  const giro = SONG.patterns.giro;
  const notes = midiPart([...giro, ...giro]);
  const r = alignMidi(notes, tl);
  assert.equal(r.scale, 1);
  assert.equal(r.shift, 8, 'la parte comincia alla terza battuta (8 battiti)');
  assert.ok(r.score > 0.5 && r.confidence > 0.5);
  // stessa parte scritta a tempo doppio (ogni battito del brano = 2 battiti del MIDI)
  const dbl = notes.map((n) => ({ ...n, b: n.b * 2, bd: n.bd * 2 }));
  const r2 = alignMidi(dbl, tl);
  assert.equal(r2.scale, 0.5);
  assert.equal(r2.shift, 8);
});

test('la parte MIDI segue i tempi veri del brano (warp) e il capotasto', () => {
  const song = { ...SONG, warp: [[0, 2], [10, 26], [26, 70]] }; // la seconda parte rallenta
  const tl = buildTimeline(song);
  const notes = midiPart(SONG.patterns.giro);
  const placed = placeMidi(notes, tl, { shift: 8 });
  // la prima nota cade sull'inizio della battuta 2, l'ultima dentro la battuta 9
  assert.ok(Math.abs(placed[0].t - tl.bars[2].start) < 1e-6);
  const last = placed.at(-1);
  assert.ok(last.t > tl.bars[9].start && last.t < tl.bars[9].end);
  const f = fingerNotes(placed, { capo: 3 });
  const OPEN = [40, 45, 50, 55, 59, 64];
  for (const x of f) assert.equal(OPEN[x.string] + 3 + x.fret, x.pitch, 'con il capotasto il tasto è contato dal capo');
  // trasposizione: +2 semitoni
  assert.equal(placeMidi(notes, tl, { shift: 8, transpose: 2 })[0].pitch, notes[0].pitch + 2);
});
