import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getShape, fretNote, STANDARD_TUNING } from '../js/music.js';
import { chromaFromSpectrum, matchChord, fftMagnitudes, chordPitchClasses } from '../js/detect.js';

const SR = 44100;
const N = 8192;
const E2 = 82.41; // Mi grave a vuoto

// Simula una pennata: ogni corda suonata con le sue armoniche, frequenze esatte dalla diteggiatura.
function strum(name, { noise = 0, detune = 0 } = {}) {
  const shape = getShape(name);
  const buf = new Float32Array(N);
  const open = [0, 5, 10, 15, 19, 24]; // semitoni sopra il Mi grave
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  shape.frets.forEach((f, s) => {
    if (f === null) return;
    const hz = E2 * 2 ** ((open[s] + f) / 12) * 2 ** (detune / 1200);
    for (let h = 1; h <= 5; h++) {
      const amp = 0.25 / h ** 1.2;
      const ph = rnd() * 6;
      for (let i = 0; i < N; i++) buf[i] += amp * Math.sin((2 * Math.PI * hz * h * i) / SR + ph);
    }
  });
  if (noise) for (let i = 0; i < N; i++) buf[i] += noise * rnd();
  return buf;
}

const chromaOf = (buf) => chromaFromSpectrum(fftMagnitudes(buf), SR / N);

test('modelli degli accordi', () => {
  assert.deepEqual(chordPitchClasses('Gm').notes.sort((a, b) => a - b), [2, 7, 10]);
  assert.deepEqual(chordPitchClasses('Gm/F').notes.sort((a, b) => a - b), [2, 5, 7, 10]);
  assert.equal(chordPitchClasses('Xyz'), null);
  assert.equal(STANDARD_TUNING.length, 6);
  assert.equal(fretNote(0, 3), 7);
});

test('riconosce gli accordi suonati (anche un po\' scordati e con rumore)', () => {
  const song = ['Gm', 'Gm/F', 'Ebmaj7', 'D7', 'C', 'G', 'D', 'Am', 'Em', 'F', 'A', 'E'];
  for (const name of song) {
    const r = matchChord(chromaOf(strum(name, { noise: 0.05, detune: 12 })), name, song);
    assert.ok(r.hit, `${name}: non riconosciuto (score ${r.score.toFixed(2)}, più simile ${r.best})`);
  }
});

test('segnala un accordo sbagliato', () => {
  const pairs = [['C', 'Gm'], ['Em', 'F'], ['D', 'Ebmaj7'], ['A', 'Gm/F'], ['G', 'Bb']];
  for (const [played, expected] of pairs) {
    const r = matchChord(chromaOf(strum(played)), expected);
    assert.ok(!r.hit, `${played} scambiato per ${expected} (score ${r.score.toFixed(2)})`);
  }
});

test('FFT: un seno puro finisce nel bin giusto', () => {
  const buf = Float32Array.from({ length: N }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / SR));
  const mags = fftMagnitudes(buf);
  const peak = mags.indexOf(Math.max(...mags));
  assert.ok(Math.abs(peak * (SR / N) - 440) < SR / N);
});
