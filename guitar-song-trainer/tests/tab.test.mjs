import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tabBars } from '../js/tab.js';
import { buildTimeline } from '../js/timeline.js';

test('tablatura: note nelle battute giuste, sulla colonna del loro battito', () => {
  const tl = buildTimeline({ bpm: 120, timeSignature: [4, 4], offset: 0, sections: [{ name: 'A', bars: ['C', 'G', 'Am', 'F'] }] });
  // battuta = 2 s; 16 colonne per battuta (semicrome)
  const notes = [
    { t: 0, string: 1, fret: 3 }, { t: 0, string: 3, fret: 0 }, // accordo sul primo battito
    { t: 0.5, string: 4, fret: 1 }, // secondo battito → colonna 4
    { t: 2.25, string: 5, fret: 3 }, // battuta 2, a metà del primo battito → colonna 2
    { t: 0.5, string: 4, fret: 5 }, // stessa corda e colonna: resta la prima
  ].sort((a, b) => a.t - b.t);
  const bars = tabBars(tl, notes);
  assert.equal(bars.length, 4);
  assert.equal(bars[0].size, 16);
  assert.deepEqual(bars[0].cols.map((c) => c.slot), [0, 4]);
  assert.equal(bars[0].cols[0].frets[1], 3);
  assert.equal(bars[0].cols[0].frets[3], 0);
  assert.equal(bars[0].cols[1].frets[4], 1);
  assert.equal(bars[1].cols[0].slot, 2);
  assert.equal(bars[2].cols.length, 0);
  // tecniche scritte accanto al tasto
  const t2 = tabBars(tl, [{ t: 4, string: 2, fret: 7, tech: 'h' }, { t: 4.5, string: 2, fret: 5, tech: 'x' }, { t: 5, string: 0, fret: 0, tech: 'pm' }]);
  assert.deepEqual(t2[2].cols.map((c) => c.frets.find((f) => f != null)), ['h7', 'x', '0·']);
});
