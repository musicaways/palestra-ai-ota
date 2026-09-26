import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transposeChord, shapeNameWithCapo, suggestCapo, getShape, fretNote, noteIndex } from '../js/music.js';

test('trasposizione con la grafia giusta', () => {
  assert.equal(transposeChord('Gm/F', -3), 'Em/D');
  assert.equal(transposeChord('Ebmaj7', -3), 'Cmaj7');
  assert.equal(transposeChord('D7sus4', -3), 'B7sus4');
  assert.equal(transposeChord('C', 1), 'C#');
  assert.equal(transposeChord('C', 3), 'Eb');
  assert.equal(transposeChord('Bb', 2), 'C');
  assert.equal(transposeChord('Am', 0), 'Am');
});

test('capotasto + forma = stesso accordo che suona', () => {
  // forma di Em col capo al 3° → suona Gm
  const shape = getShape(shapeNameWithCapo('Gm', 3));
  const notes = new Set(shape.frets.flatMap((f, s) => (f === null ? [] : [fretNote(s, f + 3)])));
  assert.deepEqual(notes, new Set(['G', 'Bb', 'D'].map(noteIndex)));
});

test('per Cartine corte suggerisce il capo al 3° (niente barrè)', () => {
  const r = suggestCapo(['Gm', 'Gm/F', 'Ebmaj7', 'D7sus4', 'D7']);
  assert.equal(r.capo, 3);
});

test('per accordi già aperti non suggerisce il capotasto', () => {
  assert.equal(suggestCapo(['G', 'C', 'D', 'Em']).capo, 0);
});
