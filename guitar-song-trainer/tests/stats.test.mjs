import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// localStorage minimale per Node
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
const { addPractice, getStats, getDays, streak, recordRate, formatDuration, formatAgo, saveDrillResult, getDrillBest } = await import('../js/stats.js');

beforeEach(() => mem.clear());

test('accumula tempo e conta le sessioni', () => {
  const t0 = Date.UTC(2026, 0, 1, 10);
  addPractice('x', 30, t0);
  addPractice('x', 30, t0 + 60_000); // stessa sessione
  addPractice('x', 60, t0 + 2 * 3600_000); // nuova sessione
  const s = getStats('x');
  assert.equal(s.seconds, 120);
  assert.equal(s.sessions, 2);
  assert.equal(s.lastPlayed, t0 + 2 * 3600_000);
});

test('prima pratica conta una sessione anche con timestamp zero; valori non finiti non sono salvati', () => {
  assert.equal(addPractice('x', 5, 0).sessions, 1);
  const before = mem.get('gst:stats');
  const daysBefore = mem.get('gst:days');
  for (const seconds of [NaN, Infinity, -Infinity, 0, -1, '3']) {
    assert.equal(addPractice('x', seconds, 1).seconds, 5);
  }
  assert.equal(mem.get('gst:stats'), before);
  assert.equal(mem.get('gst:days'), daysBefore);
  assert.equal(Object.values(getDays()).reduce((sum, seconds) => sum + seconds, 0), 5);
});

test('streak usa giorni locali durante il cambio ora in Europe/Rome', () => {
  const previousTZ = process.env.TZ;
  process.env.TZ = 'Europe/Rome';
  try {
    const spring = {
      '2026-03-27': 60,
      '2026-03-28': 60,
      '2026-03-29': 60,
      '2026-03-30': 60,
    };
    assert.equal(streak(spring, new Date(2026, 2, 30, 0, 15).getTime()), 4);
    const autumn = {
      '2026-10-24': 60,
      '2026-10-25': 60,
      '2026-10-26': 60,
    };
    assert.equal(streak(autumn, new Date(2026, 9, 27, 0, 15).getTime()), 3);
  } finally {
    if (previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = previousTZ;
  }
});

test('velocità migliore', () => {
  recordRate('x', 0.75);
  recordRate('x', 0.5);
  assert.equal(getStats('x').bestRate, 0.75);
});

test('formati leggibili', () => {
  assert.equal(formatDuration(0), '0 min');
  assert.equal(formatDuration(45), '< 1 min');
  assert.equal(formatDuration(600), '10 min');
  assert.equal(formatDuration(3900), '1 h 05 min');
  const now = Date.UTC(2026, 5, 10, 12);
  assert.equal(formatAgo(0, now), 'mai');
  assert.equal(formatAgo(now - 30_000, now), 'adesso');
  assert.equal(formatAgo(now - 20 * 60_000, now), '20 min fa');
  assert.equal(formatAgo(now - 86400_000, now), 'ieri');
  assert.equal(formatAgo(now - 5 * 86400_000, now), '5 giorni fa');
});

test('record dell\'allenamento: vince il BPM più alto', () => {
  assert.ok(saveDrillResult('Em-G@4', { bpm: 60, changes: 15 }));
  assert.ok(!saveDrillResult('Em-G@4', { bpm: 55, changes: 30 }));
  assert.ok(saveDrillResult('Em-G@4', { bpm: 60, changes: 16 }));
  assert.equal(getDrillBest('Em-G@4').changes, 16);
});
