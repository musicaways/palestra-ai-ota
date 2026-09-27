import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitTargets, hitsTarget, nextTarget, notePitch } from '../js/waitmode.js';
import { buildTimeline } from '../js/timeline.js';
import { template } from '../js/detect.js';

const tl = buildTimeline({ bpm: 120, timeSignature: [4, 4], offset: 0, sections: [{ name: 'A', bars: ['C', 'G', 'Am', 'F'] }] });

test('bersagli: un accordo per cambio, oppure note e gruppi di note', () => {
  const chords = waitTargets(tl);
  assert.deepEqual(chords.map((x) => x.name), ['C', 'G', 'Am', 'F']);
  const withNotes = { ...tl, notes: [{ t: 0, string: 5, fret: 0 }, { t: 0.01, string: 4, fret: 1 }, { t: 1, string: 0, fret: 3 }] };
  const n = waitTargets(withNotes, { capo: 2 });
  assert.equal(n.length, 2);
  assert.equal(n[0].kind, 'notes');
  assert.deepEqual(n[0].pitches, [66, 62]); // Mi cantino e Si al 1° tasto, col capotasto al 2°
  assert.equal(n[1].kind, 'note');
  assert.equal(notePitch({ string: 0, fret: 3 }), 43);
  assert.equal(notePitch({ pitch: 50, string: 0, fret: 3 }), 50);
});

test('verifica: accordo dal cromagramma, nota dall\'altezza (ottava perdonata)', () => {
  const [c] = waitTargets(tl);
  assert.ok(hitsTarget(c, { chroma: template('C'), level: 0.1 }));
  assert.ok(!hitsTarget(c, { chroma: template('F#'), level: 0.1 }));
  assert.ok(!hitsTarget(c, { chroma: template('C'), level: 0.001 }), 'silenzio');
  const note = { kind: 'note', pitches: [45] }; // La grave, 110 Hz
  assert.ok(hitsTarget(note, { chroma: new Float32Array(12), level: 0.1, pitch: 110.5 }));
  assert.ok(hitsTarget(note, { chroma: new Float32Array(12), level: 0.1, pitch: 220 }), 'un\'ottava sopra va bene');
  assert.ok(!hitsTarget(note, { chroma: new Float32Array(12), level: 0.1, pitch: 116.5 }), 'un semitono sopra no');
});

test('prossimo bersaglio: salta quelli già superati', () => {
  const t = waitTargets(tl);
  const cleared = new Set(['c0']);
  assert.equal(nextTarget(t, 0, cleared).name, 'G');
  assert.equal(nextTarget(t, 4.5, cleared).name, 'F');
  assert.equal(nextTarget(t, 99, cleared), null);
});
