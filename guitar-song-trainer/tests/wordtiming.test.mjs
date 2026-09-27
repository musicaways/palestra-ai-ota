import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syllables, parseEnhanced, wordTimes, wordAt } from '../js/wordtiming.js';
import { parseLrc } from '../js/lyrics.js';

test('sillabe approssimate', () => {
  assert.equal(syllables('ciao'), 1);
  assert.equal(syllables('chitarra'), 3);
  assert.equal(syllables('x'), 1);
});

test('tempi stimati: in ordine, dentro la riga, proporzionali alle sillabe', () => {
  const w = wordTimes('uno due tre quattro', 10, 14);
  assert.equal(w.length, 4);
  assert.equal(w[0].t0, 10);
  for (let i = 1; i < w.length; i++) assert.ok(w[i].t0 >= w[i - 1].t1 - 1e-9);
  assert.ok(w.at(-1).t1 <= 14);
  assert.ok(w[3].t1 - w[3].t0 > w[1].t1 - w[1].t0, 'quattro (2 sillabe) dura più di due');
  // riga cortissima (rap): tutto compresso nel tempo disponibile
  const r = wordTimes('una frase molto lunga con tantissime sillabe', 5, 6);
  assert.ok(r.at(-1).t1 <= 6);
});

test('tempi per parola dal formato esteso', () => {
  const words = parseEnhanced('<00:12.00>Nel <00:12.50>blu <00:13.20>dipinto');
  assert.deepEqual(words.map((x) => x.w), ['Nel', 'blu', 'dipinto']);
  const lines = parseLrc('[00:12.00]<00:12.00>Nel <00:12.50>blu <00:13.20>dipinto\n[00:15.00]poi');
  assert.equal(lines[0].text, 'Nel blu dipinto');
  assert.equal(lines[0].words[1].t, 12.5);
  const wt = wordTimes(lines[0].text, lines[0].t, 15, lines[0].words);
  assert.equal(wt[2].t0, 13.2);
  const at = wordAt(wt, 12.6);
  assert.equal(at.i, 1);
  assert.ok(Math.abs(at.p - 0.1 / 0.7) < 1e-9);
  assert.equal(wordAt(wt, 11).i, -1);
});
