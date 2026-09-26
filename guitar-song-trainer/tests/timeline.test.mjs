import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, eventIndexAt, beatAt, beatsBetween } from '../js/timeline.js';

const song = {
  bpm: 120, // battito = 0,5 s
  timeSignature: [4, 4], // battuta = 2 s
  offset: 1,
  patterns: { giro: ['C', '%', ['F', 'G'], 'Am:3'] },
  sections: [{ name: 'A', pattern: 'giro', repeat: 2 }],
};

test('battute e accordi sulla griglia del BPM', () => {
  const tl = buildTimeline(song);
  assert.equal(tl.bars.length, 8);
  assert.deepEqual(tl.events.slice(0, 4).map((e) => [e.name, e.start]), [['C', 1], ['F', 5], ['G', 6], ['Am', 7]]);
  assert.equal(tl.events[0].beats, 8, "'%' allunga l'accordo precedente");
  assert.equal(tl.events[0].end, 5);
  assert.equal(tl.bars[1].held.name, 'C');
  assert.equal(tl.end, 17);
});

test('offset di sincronia sposta tutto', () => {
  const tl = buildTimeline(song, { offset: 0.25 });
  assert.equal(tl.events[0].start, 1.25);
  assert.equal(tl.bars[3].start, 7.25);
});

test('i tempi registrati deformano la griglia senza salti', () => {
  // cambi reali un po' più lenti del previsto
  const tl = buildTimeline(song, { sync: [1, 5.4, 6.6] });
  assert.deepEqual(tl.events.slice(0, 3).map((e) => e.start), [1, 5.4, 6.6]);
  // dopo l'ultimo tempo registrato si mantiene lo scarto
  assert.ok(Math.abs(tl.events[3].start - 7.6) < 1e-9);
  // la battuta 2 (tenuta) cade a metà fra 1 e 5.4
  assert.ok(Math.abs(tl.bars[1].start - 3.2) < 1e-9);
  for (let i = 1; i < tl.events.length; i++) assert.ok(tl.events[i].start > tl.events[i - 1].start);
});

test('ricerca per tempo', () => {
  const tl = buildTimeline(song);
  assert.equal(eventIndexAt(tl, 0.5), -1);
  assert.equal(eventIndexAt(tl, 4.9), 0);
  assert.equal(eventIndexAt(tl, 5), 1);
  const b = beatAt(tl, 3.75);
  assert.equal(b.bar, 1);
  assert.equal(b.beat, 1.5);
  assert.equal(beatsBetween(tl, 1, 2.9).length, 4);
});

test('il brano Cartine corte si costruisce ed è lungo quanto il video', async () => {
  const { readFile } = await import('node:fs/promises');
  const s = JSON.parse(await readFile(new URL('../songs/salmo-cartine-corte.json', import.meta.url)));
  const tl = buildTimeline(s);
  assert.ok(tl.end > 140 && tl.end < 160, `durata ${tl.end}`);
  assert.equal(tl.sections.length, s.sections.length);
  const index = JSON.parse(await readFile(new URL('../songs/index.json', import.meta.url)));
  for (const entry of index) {
    const data = JSON.parse(await readFile(new URL(`../songs/${entry.file}`, import.meta.url)));
    assert.ok(buildTimeline({ ...entry, ...data }).events.length > 0, entry.id);
  }
});
