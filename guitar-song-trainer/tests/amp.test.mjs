import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TONE_PRESETS, KNOBS, distortionCurve, suggestTone, toneParams, presetById, impulse } from '../js/amp.js';

test('preset completi e regolazioni nei limiti', () => {
  for (const p of TONE_PRESETS) {
    for (const k of KNOBS) {
      assert.ok(typeof p.p[k.k] === 'number', `${p.id}: manca ${k.k}`);
      assert.ok(p.p[k.k] >= k.min && p.p[k.k] <= k.max, `${p.id}: ${k.k} fuori scala`);
    }
  }
  assert.equal(new Set(TONE_PRESETS.map((p) => p.id)).size, TONE_PRESETS.length);
});

test('curva di distorsione: simmetrica, monotona, limitata', () => {
  for (const d of [0, 0.3, 1]) {
    const c = distortionCurve(d, 1025);
    assert.ok(Math.abs(c[0] + c[1024]) < 1e-6, 'simmetrica');
    for (let i = 1; i < c.length; i++) assert.ok(c[i] >= c[i - 1] - 1e-9, 'monotona');
    assert.ok(Math.max(...c) <= 1.0001);
  }
  // più drive = più saturazione a metà corsa
  assert.ok(distortionCurve(1, 1025)[768] > distortionCurve(0.2, 1025)[768]);
});

test('suono suggerito dal brano', () => {
  assert.equal(suggestTone({ genre: 'Rock' }), 'rock');
  assert.equal(suggestTone({ genre: 'Metal' }), 'metal');
  assert.equal(suggestTone({ genre: 'Cantautori' }), 'acustico');
  assert.equal(suggestTone({ genre: 'Pop / Rock' }), 'crunch');
  assert.equal(suggestTone({ genre: 'Indie' }), 'pulito-chorus');
  assert.equal(suggestTone({ genre: 'Pop' }), 'pulito');
  assert.equal(suggestTone({ genre: 'Pop', tone: 'lead' }), 'lead', 'il campo tone del brano vince');
});

test('parametri: preset + regolazioni', () => {
  const p = toneParams({ preset: 'crunch', params: { reverb: 0.9 } });
  assert.equal(p.reverb, 0.9);
  assert.equal(p.drive, presetById('crunch').p.drive);
  assert.equal(toneParams(null).drive, TONE_PRESETS[0].p.drive);
});

test('riverbero: risposta che decade', () => {
  const [l] = impulse(8000, 1);
  const rms = (a, b) => Math.sqrt(l.slice(a, b).reduce((s, x) => s + x * x, 0) / (b - a));
  assert.ok(rms(0, 800) > rms(6400, 7200) * 3);
});
