import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPitch, describePitch } from '../js/tuner.js';

// Nota sintetica "da chitarra": fondamentale + armoniche.
function tone(freq, sampleRate = 48000, n = 4096) {
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    buf[i] = 0.5 * Math.sin(2 * Math.PI * freq * t) + 0.25 * Math.sin(4 * Math.PI * freq * t) + 0.12 * Math.sin(6 * Math.PI * freq * t);
  }
  return buf;
}

test('riconosce le sei corde a vuoto entro 3 cent', () => {
  const strings = [82.41, 110, 146.83, 196, 246.94, 329.63];
  strings.forEach((hz, i) => {
    const f = detectPitch(tone(hz), 48000);
    assert.ok(f, `corda ${i}: nessuna nota`);
    const cents = 1200 * Math.log2(f / hz);
    assert.ok(Math.abs(cents) < 3, `corda ${i}: ${cents.toFixed(1)} cent`);
    assert.equal(describePitch(f, 'intl').string, i);
  });
});

test('indica di quanto è scordata', () => {
  const p = describePitch(110 * 2 ** (20 / 1200), 'it');
  assert.equal(p.note, 'La');
  assert.equal(p.cents, 20);
  assert.equal(p.stringCents, 20);
});

test('silenzio = nessuna nota', () => {
  assert.equal(detectPitch(new Float32Array(4096), 48000), null);
});
