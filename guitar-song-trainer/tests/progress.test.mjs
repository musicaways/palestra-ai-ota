import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeProgress, levelFor, bestStreak } from '../js/progress.js';
import { streak, dayKey } from '../js/stats.js';

const day = (n) => Date.parse('2026-09-26T12:00:00') - n * 86400000;

test('livelli crescenti', () => {
  assert.equal(levelFor(0).level, 1);
  assert.equal(levelFor(49).level, 1);
  assert.equal(levelFor(50).level, 2);
  assert.equal(levelFor(150).level, 3);
  assert.ok(levelFor(100).pct > 0 && levelFor(100).pct < 1);
});

test('serie di giorni', () => {
  const days = { [dayKey(day(0))]: 300, [dayKey(day(1))]: 120, [dayKey(day(2))]: 90, [dayKey(day(4))]: 600 };
  assert.equal(streak(days, day(0)), 3);
  assert.equal(streak(days, day(-1)), 3, 'oggi non ancora suonato: conta fino a ieri');
  assert.equal(streak({ [dayKey(day(0))]: 20 }, day(0)), 0, 'meno di un minuto non conta');
  assert.equal(bestStreak(days), 3);
});

test('serie migliore attraversa entrambi i cambi di ora senza usare millisecondi', () => {
  assert.equal(bestStreak({ '2026-03-28': 60, '2026-03-29': 60, '2026-03-30': 60 }), 3);
  assert.equal(bestStreak({ '2026-10-24': 60, '2026-10-25': 60, '2026-10-26': 60 }), 3);
});

test('punti e obiettivi', () => {
  const p = computeProgress({
    stats: { a: { seconds: 3700, bestAccuracy: 0.85 }, b: { seconds: 30 } },
    lessonsDone: ['x', 'y'],
    study: { a: { learned: [0, 1, 2], total: 3 } },
    now: day(0),
  });
  assert.equal(p.xp, 62 + 40 + 30 + 30); // 3730 s = 62 minuti
  const on = new Set(p.badges.filter((b) => b.unlocked).map((b) => b.id));
  for (const id of ['primo', 'ora', 'sezione', 'imparato', 'orecchio']) assert.ok(on.has(id), id);
  assert.ok(!on.has('studente'));
});
