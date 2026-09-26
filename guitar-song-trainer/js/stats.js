// Statistiche di pratica, salvate solo su questo dispositivo.
import { store } from './store.js';

const KEY = 'stats';

export function getAllStats() {
  return store.get(KEY, {});
}

export function getStats(id) {
  return { seconds: 0, sessions: 0, lastPlayed: 0, bestRate: 0, ...(getAllStats()[id] ?? {}) };
}

function save(id, s) {
  const all = getAllStats();
  all[id] = s;
  store.set(KEY, all);
}

// Aggiunge tempo di pratica; una nuova "sessione" se l'ultima risale a più di 30 minuti fa.
export function addPractice(id, seconds, now = Date.now()) {
  if (!(seconds > 0)) return getStats(id);
  const s = getStats(id);
  if (now - s.lastPlayed > 30 * 60 * 1000) s.sessions++;
  s.seconds += seconds;
  s.lastPlayed = now;
  save(id, s);
  const days = getDays();
  const k = dayKey(now);
  days[k] = (days[k] ?? 0) + seconds;
  store.set('days', days);
  return s;
}

// Pratica giorno per giorno (per la serie di giorni consecutivi).
export const dayKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const getDays = () => store.get('days', {});

// Giorni consecutivi con almeno un minuto di pratica, fino a oggi (o fino a ieri, se oggi non hai ancora suonato).
export function streak(days, now = Date.now()) {
  let n = 0;
  let t = now;
  if (!((days[dayKey(t)] ?? 0) >= 60)) t -= 86400000;
  while ((days[dayKey(t)] ?? 0) >= 60) { n++; t -= 86400000; }
  return n;
}

// Precisione migliore in modalità ascolto (0..1).
export function recordAccuracy(id, acc) {
  const s = getStats(id);
  if (acc > (s.bestAccuracy ?? 0)) {
    s.bestAccuracy = acc;
    save(id, s);
  }
  return s;
}

// Velocità più alta completata in un loop con velocità progressiva.
export function recordRate(id, rate) {
  const s = getStats(id);
  if (rate > s.bestRate) {
    s.bestRate = rate;
    save(id, s);
  }
  return s;
}

export function formatDuration(seconds) {
  const m = Math.round(seconds / 60);
  if (seconds < 60) return seconds > 0 ? '< 1 min' : '0 min';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, '0')} min`;
}

export function formatAgo(ts, now = Date.now()) {
  if (!ts) return 'mai';
  const d = Math.max(0, now - ts) / 1000;
  if (d < 90) return 'adesso';
  if (d < 3600) return `${Math.round(d / 60)} min fa`;
  if (d < 86400) return `${Math.round(d / 3600)} h fa`;
  const days = Math.round(d / 86400);
  if (days === 1) return 'ieri';
  if (days < 30) return `${days} giorni fa`;
  return new Date(ts).toLocaleDateString('it-IT');
}

// Record dell'allenamento cambi accordo, per coppia/gruppo di accordi.
export function getDrillBest(key) {
  return store.get('drills', {})[key] ?? null;
}

export function saveDrillResult(key, result) {
  const all = store.get('drills', {});
  const prev = all[key];
  if (!prev || result.bpm > prev.bpm || (result.bpm === prev.bpm && result.changes > prev.changes)) {
    all[key] = { ...result, at: Date.now() };
    store.set('drills', all);
    return true;
  }
  return false;
}
