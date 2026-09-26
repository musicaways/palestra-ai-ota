// Progressi: livello (punti esperienza), serie di giorni e obiettivi sbloccati. Tutto sul dispositivo;
// è la base del futuro profilo nella community.
import { getAllStats, getDays, streak, formatDuration } from './stats.js';
import { store } from './store.js';
import { icon } from './icons.js';
import { LESSONS } from './lessons.js';

export const levelFor = (xp) => {
  let lv = 1;
  while (xp >= 50 * lv * (lv + 1) / 2) lv++;
  const lo = 50 * (lv - 1) * lv / 2;
  const hi = 50 * lv * (lv + 1) / 2;
  return { level: lv, from: lo, to: hi, pct: (xp - lo) / (hi - lo) };
};

const BADGES = [
  { id: 'primo', label: 'Prima nota', desc: 'Hai suonato il tuo primo brano.', ok: (d) => d.songs >= 1 },
  { id: 'ora', label: 'Un\'ora sul manico', desc: 'Un\'ora di pratica in tutto.', ok: (d) => d.seconds >= 3600 },
  { id: 'dieci-ore', label: 'Dieci ore', desc: 'Dieci ore di pratica in tutto.', ok: (d) => d.seconds >= 36000 },
  { id: 'repertorio', label: 'Repertorio', desc: 'Almeno 5 minuti su 5 brani diversi.', ok: (d) => d.songs5 >= 5 },
  { id: 'serie3', label: 'Tre giorni di fila', desc: 'Hai suonato tre giorni consecutivi.', ok: (d) => d.bestStreak >= 3 },
  { id: 'serie7', label: 'Una settimana', desc: 'Sette giorni consecutivi.', ok: (d) => d.bestStreak >= 7 },
  { id: 'serie30', label: 'Un mese', desc: 'Trenta giorni consecutivi.', ok: (d) => d.bestStreak >= 30 },
  { id: 'studente', label: 'Studente', desc: '5 lezioni completate.', ok: (d) => d.lessons >= 5 },
  { id: 'diplomato', label: 'Diplomato', desc: 'Tutte le lezioni completate.', ok: (d) => d.lessons >= d.lessonsTotal },
  { id: 'sezione', label: 'Pezzo per pezzo', desc: 'Una sezione imparata con lo Studio guidato.', ok: (d) => d.sections >= 1 },
  { id: 'imparato', label: 'Brano imparato', desc: 'Tutte le sezioni di un brano imparate.', ok: (d) => d.fullSongs >= 1 },
  { id: 'orecchio', label: 'Orecchio fino', desc: 'Precisione di almeno 80% in modalità ascolto.', ok: (d) => d.bestAccuracy >= 0.8 },
  { id: 'veloce', label: 'A tempo pieno', desc: 'Un loop portato al 100% con la velocità progressiva.', ok: (d) => d.fullRate },
];

// Punti: 1 al minuto di pratica, 20 per lezione, 10 per sezione imparata, 30 per brano imparato.
export function computeProgress({ stats = {}, days = {}, lessonsDone = [], study = {}, now = Date.now() } = {}) {
  const list = Object.values(stats);
  const seconds = list.reduce((s, x) => s + (x.seconds || 0), 0);
  const sections = Object.values(study).reduce((s, x) => s + (x.learned?.length ?? 0), 0);
  const fullSongs = Object.values(study).filter((x) => x.total && x.learned?.length >= x.total).length;
  const d = {
    seconds,
    songs: list.filter((x) => x.seconds >= 60).length,
    songs5: list.filter((x) => x.seconds >= 300).length,
    lessons: lessonsDone.length,
    lessonsTotal: LESSONS.length,
    sections,
    fullSongs,
    bestAccuracy: Math.max(0, ...list.map((x) => x.bestAccuracy ?? 0)),
    fullRate: list.some((x) => (x.bestRate ?? 0) >= 1),
    streak: streak(days, now),
    bestStreak: bestStreak(days),
  };
  const xp = Math.floor(seconds / 60) + lessonsDone.length * 20 + sections * 10 + fullSongs * 30;
  return { ...d, xp, ...levelFor(xp), badges: BADGES.map((b) => ({ id: b.id, label: b.label, desc: b.desc, unlocked: !!b.ok(d) })) };
}

export function bestStreak(days) {
  const keys = Object.keys(days).filter((k) => days[k] >= 60).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const k of keys) {
    const t = Date.parse(`${k}T12:00:00`);
    run = prev != null && Math.round((t - prev) / 86400000) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

export function loadProgress() {
  const study = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('gst:study:')) study[k.slice(10)] = JSON.parse(localStorage.getItem(k));
    }
  } catch { /* niente */ }
  return computeProgress({ stats: getAllStats(), days: getDays(), lessonsDone: store.get('lessonsDone', []), study });
}

export function renderProgress(root) {
  const p = loadProgress();
  root.innerHTML = `
  <div class="library progress">
    <section class="hero">
      <div class="hero-kicker">${icon('star', 16)} I tuoi progressi</div>
      <h1>Livello ${p.level}<br><span>${p.streak ? `${p.streak} ${p.streak === 1 ? 'giorno' : 'giorni'} di fila` : 'suona oggi per iniziare la serie'}</span></h1>
      <div class="level-bar"><i style="width:${Math.round(p.pct * 100)}%"></i></div>
      <p>${p.xp} punti · ${p.to - p.xp} al livello ${p.level + 1}. Pratica totale ${formatDuration(p.seconds)} ·
        ${p.lessons} lezioni · ${p.sections} sezioni imparate · serie migliore ${p.bestStreak} giorni.</p>
      <div class="hero-actions"><a class="chip-btn" href="#/">${icon('back', 16)} Libreria brani</a><a class="chip-btn" href="#/impara">${icon('study', 16)} Impara</a></div>
    </section>
    <h2 class="group-title">Obiettivi (${p.badges.filter((b) => b.unlocked).length}/${p.badges.length})</h2>
    <div class="badge-grid">${p.badges.map((b) => `<div class="badge card${b.unlocked ? ' on' : ''}"><span class="badge-ico">${icon(b.unlocked ? 'starFill' : 'star', 22)}</span><b>${b.label}</b><span class="hint">${b.desc}</span></div>`).join('')}</div>
    <p class="hint">Punti: 1 al minuto di pratica, 20 per lezione completata, 10 per sezione imparata, 30 per brano imparato tutto.
      Presto potrai mostrarli nel tuo profilo della community.</p>
  </div>`;
}
