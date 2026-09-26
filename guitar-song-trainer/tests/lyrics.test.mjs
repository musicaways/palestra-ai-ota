import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLrc, looksLikeLrc } from '../js/lyrics.js';

test('parsing LRC con righe vuote, tag multipli e offset', () => {
  const lrc = '[ar:Prova]\n[offset:+500]\n[00:01.50]prima\n[00:04.00][00:10.00]ritornello\n[00:07.25]\n';
  const lines = parseLrc(lrc);
  assert.deepEqual(lines.map((l) => [l.t, l.text]), [[1, 'prima'], [3.5, 'ritornello'], [6.75, ''], [9.5, 'ritornello']]);
});

test('riconosce il formato LRC', () => {
  assert.ok(looksLikeLrc('[00:12.34] riga'));
  assert.ok(!looksLikeLrc('solo testo\nsenza tempi'));
});

test('ricerca di riserva: sceglie la versione sincronizzata con la durata più vicina', async () => {
  const { pickBestLyrics } = await import('../js/lyrics.js');
  const results = [
    { id: 1, duration: 300, syncedLyrics: null },
    { id: 2, duration: 240, syncedLyrics: '[00:01.00]a' },
    { id: 3, duration: 199, syncedLyrics: '[00:01.00]b' },
  ];
  assert.equal(pickBestLyrics(results, 200).id, 3);
  assert.equal(pickBestLyrics(results, null).id, 2);
  assert.equal(pickBestLyrics([], 200), null);
});
