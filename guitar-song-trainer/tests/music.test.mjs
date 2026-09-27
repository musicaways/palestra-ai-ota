import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChord, getShape, displayChord, noteIndex, fretNote } from '../js/music.js';

// Note suonate da una diteggiatura (indici 0-11), per verificare che contenga le note giuste.
const notesOf = (shape) => new Set(shape.frets.flatMap((f, s) => (f === null ? [] : [fretNote(s, f)])));
const set = (...names) => new Set(names.map(noteIndex));

test('parseChord riconosce qualità e basso', () => {
  assert.deepEqual(
    { ...parseChord('Gm/F') },
    { root: 'G', rootIndex: 7, rawQuality: 'm', quality: 'm', bass: 'F' },
  );
  assert.equal(parseChord('Ebmaj7').quality, 'maj7');
  assert.equal(parseChord('D7sus4').quality, '7sus4');
  assert.equal(parseChord('C#m7').rootIndex, 1);
  assert.equal(parseChord('H'), null);
});

test('notazione italiana', () => {
  assert.equal(displayChord('Gm/F', 'it'), 'Solm/Fa');
  assert.equal(displayChord('Ebmaj7', 'it'), 'Mibmaj7');
  assert.equal(displayChord('Gm', 'intl'), 'Gm');
});

test('le diteggiature del brano contengono le note giuste', () => {
  const cases = {
    Gm: ['G', 'Bb', 'D'],
    'Gm/F': ['G', 'Bb', 'D', 'F'],
    Ebmaj7: ['Eb', 'G', 'Bb', 'D'],
    D7sus4: ['D', 'G', 'A', 'C'],
    D7: ['D', 'F#', 'A', 'C'],
    G5: ['G', 'D'],
    F5: ['F', 'C'],
    Eb5: ['Eb', 'Bb'],
    C5: ['C', 'G'],
  };
  for (const [name, notes] of Object.entries(cases)) {
    const shape = getShape(name);
    assert.ok(shape, `${name}: diteggiatura mancante`);
    assert.deepEqual(notesOf(shape), set(...notes), `${name}: note sbagliate`);
  }
});

test('le forme generate suonano le note dell\'accordo', () => {
  const triads = {
    A: ['A', 'C#', 'E'], Bm: ['B', 'D', 'F#'], F: ['F', 'A', 'C'], 'F#m': ['F#', 'A', 'C#'],
    Bb: ['Bb', 'D', 'F'], Cm: ['C', 'Eb', 'G'], E: ['E', 'G#', 'B'], Am: ['A', 'C', 'E'],
  };
  for (const [name, notes] of Object.entries(triads)) {
    assert.deepEqual(notesOf(getShape(name)), set(...notes), name);
  }
});

test('il barrè di Gm viene riconosciuto', () => {
  const b = getShape('Gm').barres.find((x) => x.finger === 1);
  assert.deepEqual({ fret: b.fret, from: b.from, to: b.to }, { fret: 3, from: 0, to: 5 });
});

test('accordi di sesta e add9', () => {
  const cases = { F6: ['F', 'A', 'C', 'D'], A6: ['A', 'C#', 'E', 'F#'], C6: ['C', 'E', 'G', 'A'], Ebadd9: ['Eb', 'G', 'Bb', 'F'], Dbadd9: ['Db', 'F', 'Ab', 'Eb'], Cadd9: ['C', 'E', 'G', 'D'], Eadd9: ['E', 'G#', 'B', 'F#'] };
  for (const [name, notes] of Object.entries(cases)) {
    const shape = getShape(name);
    assert.ok(shape, name);
    assert.deepEqual(notesOf(shape), set(...notes), name);
  }
});
