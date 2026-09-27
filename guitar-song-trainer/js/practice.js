// Obiettivo giornaliero e riepilogo degli ultimi sette giorni, nel calendario locale.
import { store } from './store.js';
import { dayKey } from './stats.js';

export const PRACTICE_GOALS = Object.freeze([5, 10, 15, 20, 30, 45, 60]);
export const DEFAULT_PRACTICE_GOAL = 10;

export function validPracticeGoal(value) {
  return typeof value === 'number' && PRACTICE_GOALS.includes(value);
}

export function getPracticeGoal() {
  const value = store.get('practiceGoal', DEFAULT_PRACTICE_GOAL);
  return validPracticeGoal(value) ? value : DEFAULT_PRACTICE_GOAL;
}

export function setPracticeGoal(minutes) {
  if (!validPracticeGoal(minutes)) return false;
  store.set('practiceGoal', minutes);
  return true;
}

export function summarizePractice(days = {}, goalMinutes = DEFAULT_PRACTICE_GOAL, now = Date.now()) {
  const goal = validPracticeGoal(goalMinutes) ? goalMinutes : DEFAULT_PRACTICE_GOAL;
  const goalSeconds = goal * 60;
  const date = new Date(now);
  // Mezzogiorno evita ore locali inesistenti o ripetute durante il cambio d'ora.
  const cursor = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const week = [];
  for (let offset = 6; offset >= 0; offset--) {
    const d = new Date(cursor);
    d.setDate(d.getDate() - offset);
    const key = dayKey(d);
    const raw = days?.[key];
    const seconds = Number.isFinite(raw) && raw > 0 ? raw : 0;
    week.push({ key, seconds, reached: seconds >= goalSeconds });
  }
  const todaySeconds = week[6].seconds;
  return {
    goalMinutes: goal,
    goalSeconds,
    todaySeconds,
    todayReached: todaySeconds >= goalSeconds,
    todayPct: Math.min(100, Math.floor(todaySeconds / goalSeconds * 100)),
    week,
    weekSeconds: week.reduce((total, day) => total + day.seconds, 0),
    reachedDays: week.filter((day) => day.reached).length,
  };
}
