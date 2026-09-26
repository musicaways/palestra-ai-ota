import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseSongText, songToText, slugify, youtubeId, tapTempo } from '../js/songtext.js';
import { buildTimeline } from '../js/timeline.js';

test('testo → sezioni', () => {
  const { sections, errors } = parseSongText(`
    [Intro]
    Ebmaj7 % D7sus4,D7
    [Strofa] x2   # commento
    Gm % Gm/F % | Ebmaj7 % F5:3,C5:1 %
  `);
  assert.deepEqual(errors, []);
  assert.deepEqual(sections[0], { name: 'Intro', bars: ['Ebmaj7', '%', ['D7sus4', 'D7']] });
  assert.equal(sections[1].repeat, 2);
  assert.deepEqual(sections[1].bars[6], ['F5:3', 'C5:1']);
  assert.equal(sections[1].barsPerRow, undefined, 'una sola riga: niente barsPerRow');
});

test('segnala gli errori', () => {
  const { errors } = parseSongText('[A]\nGm Xq7 D:0');
  assert.equal(errors.length, 2);
  assert.ok(parseSongText('').errors.length === 1);
});

test('andata e ritorno: il brano del repository resta identico', async () => {
  const song = JSON.parse(await readFile(new URL('../songs/salmo-cartine-corte.json', import.meta.url)));
  const again = { ...song, patterns: undefined, sections: parseSongText(songToText(song)).sections };
  const a = buildTimeline(song);
  const b = buildTimeline(again);
  assert.deepEqual(b.events.map((e) => [e.name, e.start]), a.events.map((e) => [e.name, e.start]));
  assert.deepEqual(b.sections.map((s) => s.name), a.sections.map((s) => s.name));
  assert.equal(b.rows.length, a.rows.length);
});

test('utilità', () => {
  assert.equal(slugify('Salmo – Cartine corte!'), 'salmo-cartine-corte');
  assert.equal(slugify('Perché è così'), 'perche-e-cosi');
  assert.equal(youtubeId('https://www.youtube.com/watch?v=OGgBYJsekX0&t=10s'), 'OGgBYJsekX0');
  assert.equal(youtubeId('https://youtu.be/OGgBYJsekX0'), 'OGgBYJsekX0');
  assert.equal(youtubeId('OGgBYJsekX0'), 'OGgBYJsekX0');
  assert.equal(youtubeId('ciao'), null);
  assert.equal(tapTempo([0, 500, 1000, 1500, 2000]), 120);
  assert.equal(tapTempo([0, 500]), null);
});
