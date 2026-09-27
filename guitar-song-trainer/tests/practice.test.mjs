import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: (key) => mem.get(key) ?? null,
  setItem: (key, value) => mem.set(key, String(value)),
  removeItem: (key) => mem.delete(key),
};

const { PRACTICE_GOALS, DEFAULT_PRACTICE_GOAL, getPracticeGoal, setPracticeGoal, summarizePractice } = await import('../js/practice.js');
const { renderProgress } = await import('../js/progress.js');

beforeEach(() => mem.clear());

test('obiettivi consentiti e persistenza', () => {
  assert.deepEqual(PRACTICE_GOALS, [5, 10, 15, 20, 30, 45, 60]);
  assert.equal(getPracticeGoal(), DEFAULT_PRACTICE_GOAL);
  assert.equal(setPracticeGoal(45), true);
  assert.equal(mem.get('gst:practiceGoal'), '45');
  assert.equal(getPracticeGoal(), 45);
  for (const invalid of [0, 12, 90, '20', NaN, Infinity]) {
    assert.equal(setPracticeGoal(invalid), false);
    assert.equal(getPracticeGoal(), 45);
  }
  mem.set('gst:practiceGoal', '999');
  assert.equal(getPracticeGoal(), DEFAULT_PRACTICE_GOAL);
});

test('settimana mobile comprende oggi e sei giorni prima, con giorni mancanti', () => {
  const now = new Date(2026, 8, 26, 18).getTime();
  const p = summarizePractice({
    '2026-09-20': 301,
    '2026-09-21': 300,
    '2026-09-23': 600,
    '2026-09-26': 299,
    '2026-09-19': 6000,
  }, 5, now);
  assert.deepEqual(p.week.map((day) => day.key), [
    '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23',
    '2026-09-24', '2026-09-25', '2026-09-26',
  ]);
  assert.deepEqual(p.week.map((day) => day.reached), [true, true, false, true, false, false, false]);
  assert.equal(p.week[2].seconds, 0);
  assert.equal(p.weekSeconds, 1500);
  assert.equal(p.reachedDays, 3);
  assert.equal(p.todaySeconds, 299);
  assert.equal(p.todayReached, false);
  assert.equal(p.todayPct, 99);
  const next = summarizePractice({ '2026-09-26': 300 }, 5, now);
  assert.equal(next.todayReached, true);
});

test('settimana mobile mantiene sette date locali attraverso il cambio ora', () => {
  const previousTZ = process.env.TZ;
  process.env.TZ = 'Europe/Rome';
  try {
    const spring = summarizePractice({}, 10, new Date(2026, 2, 30, 0, 15).getTime());
    assert.deepEqual(spring.week.map((day) => day.key), [
      '2026-03-24', '2026-03-25', '2026-03-26', '2026-03-27',
      '2026-03-28', '2026-03-29', '2026-03-30',
    ]);
    const autumn = summarizePractice({}, 10, new Date(2026, 9, 26, 0, 15).getTime());
    assert.equal(autumn.week[0].key, '2026-10-20');
    assert.equal(autumn.week[6].key, '2026-10-26');
  } finally {
    if (previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = previousTZ;
  }
});

test('la pagina espone riepilogo e aggiorna il selettore persistente', () => {
  mem.set('gst:days', JSON.stringify({ '2026-09-26': 600 }));
  const handlers = new Map();
  const root = {
    innerHTML: '',
    querySelector(selector) {
      assert.equal(selector, '#practice-goal');
      return { addEventListener(type, handler) { handlers.set(type, handler); } };
    },
  };
  renderProgress(root);
  assert.match(root.innerHTML, /role="progressbar"/);
  assert.match(root.innerHTML, /aria-valuetext="/);
  assert.match(root.innerHTML, /Ultimi 7 giorni/);
  assert.match(root.innerHTML, /name="practiceGoal"/);
  handlers.get('change')({ target: { value: '20' } });
  assert.equal(getPracticeGoal(), 20);
  assert.match(root.innerHTML, /value="20" selected/);
});
