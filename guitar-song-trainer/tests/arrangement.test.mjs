import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { simplifyChord, powerChord, easyShape, buildArpeggio, arrangeName } from '../js/arrangement.js';
import { getShape, suggestTranspose, transposeChord, fretNote, noteIndex } from '../js/music.js';
import { buildTimeline } from '../js/timeline.js';

test('semplificazione degli accordi', () => {
  assert.equal(simplifyChord('Ebmaj7'), 'Eb');
  assert.equal(simplifyChord('Gm7'), 'Gm');
  assert.equal(simplifyChord('D7sus4'), 'D');
  assert.equal(simplifyChord('Gm/F'), 'Gm');
  assert.equal(simplifyChord('F#m7'), 'F#m');
  assert.equal(powerChord('Bbm'), 'Bb5');
  assert.equal(arrangeName('Cmaj7', 'rhythm'), 'Cmaj7');
});

test('forma facile: niente barrè completo, stesse note dell\'accordo', () => {
  for (const n of ['F', 'Bm', 'Gm', 'F#m', 'Bb']) {
    const full = getShape(n);
    const easy = easyShape(full);
    assert.equal(easy.frets[0], null, `${n}: corda 6 non suonata`);
    assert.equal(easy.frets[1], null, `${n}: corda 5 non suonata`);
    const notes = new Set(easy.frets.flatMap((f, s) => (f === null ? [] : [fretNote(s, f)])));
    const all = new Set(full.frets.flatMap((f, s) => (f === null ? [] : [fretNote(s, f)])));
    for (const x of notes) assert.ok(all.has(x), `${n}: nota estranea`);
    assert.ok(notes.size >= 2);
  }
  // accordi aperti restano uguali
  assert.deepEqual(easyShape(getShape('C')), getShape('C'));
});

test('arpeggio: basso sul primo ottavo, note dentro l\'accordo, a tempo', async () => {
  const song = JSON.parse(await readFile(new URL('../songs/rino-gaetano-aida.json', import.meta.url)));
  const tl = buildTimeline(song);
  const notes = buildArpeggio(tl, (n) => getShape(n));
  assert.equal(notes.length, tl.bars.length * 8);
  for (const nt of notes.slice(0, 64)) {
    const ev = tl.events[nt.ev];
    const shape = getShape(ev.name);
    assert.equal(shape.frets[nt.string], nt.fret, 'la nota appartiene alla diteggiatura');
  }
  const firstOfBar = notes.filter((_, i) => i % 8 === 0);
  for (const nt of firstOfBar.slice(0, 8)) {
    const shape = getShape(tl.events[nt.ev].name);
    const lowest = shape.frets.findIndex((f) => f !== null);
    assert.equal(nt.string, lowest, 'basso sul battere');
  }
  for (let i = 1; i < notes.length; i++) assert.ok(notes[i].t > notes[i - 1].t);
});

test('arpeggio in 3/4: 6 crome per battuta', async () => {
  const song = JSON.parse(await readFile(new URL('../songs/salmo-cartine-corte.json', import.meta.url)));
  const tl = buildTimeline(song);
  assert.equal(buildArpeggio(tl, (n) => getShape(n)).length, tl.bars.length * 6);
});

test('tonalità più facile senza capotasto', () => {
  const r = suggestTranspose(['Gm', 'Gm/F', 'Ebmaj7', 'D7sus4', 'D7']);
  assert.ok(r.semitones !== 0, 'Cartine corte: conviene trasporre');
  const moved = ['Gm', 'Ebmaj7', 'D7'].map((c) => transposeChord(c, r.semitones));
  assert.ok(moved.every((c) => getShape(c)), moved.join(' '));
  assert.equal(suggestTranspose(['G', 'C', 'D', 'Em']).semitones, 0, 'già facile');
  assert.equal(noteIndex(transposeChord('A', 2).replace('m', '')), noteIndex('B'));
});

test('ogni brano del catalogo si suona in tutte le parti e trasposizioni', async () => {
  const { readFileSync } = await import('node:fs');
  const { buildTimeline } = await import('../js/timeline.js');
  const { transposeChord, getShape } = await import('../js/music.js');
  const index = JSON.parse(readFileSync(new URL('../songs/index.json', import.meta.url)));
  for (const entry of index) {
    const song = JSON.parse(readFileSync(new URL(`../songs/${entry.file ?? entry.id + '.json'}`, import.meta.url)));
    const names = [...new Set(buildTimeline(song).events.map((e) => e.name))];
    for (const tr of [-5, -2, 0, 3, 6]) {
      for (const arr of ['rhythm', 'power', 'easy']) {
        for (const n of names) {
          const name = arrangeName(transposeChord(n, tr), arr);
          assert.ok(getShape(name), `${entry.id}: manca la forma di ${name} (${arr}, ${tr})`);
        }
      }
    }
    const tl = buildTimeline(song);
    const notes = buildArpeggio(tl, (n) => getShape(n, song.shapes));
    assert.ok(notes.length >= tl.bars.length * 4, `${entry.id}: arpeggio con poche note`);
  }
});
