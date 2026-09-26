// Controlli e correzioni automatiche della sincronia fra video, accordi e testo.
// Tutto qui è puro (niente DOM): si testa con node --test.
import { buildTimeline, eventIndexAt, beatAt } from './timeline.js';
import { template, cosine } from './detect.js';

/**
 * Quanto le righe del testo cadono "a tempo" sulla griglia degli accordi.
 * Le righe cantate di solito partono sul battere (o appena prima): se la griglia è giusta
 * la loro fase dentro la battuta è concentrata vicino a 0.
 * @param lineTimes inizi delle righe (secondi, già con lo spostamento del testo)
 * @returns { coherence 0..1, shift: secondi di cui spostare gli accordi, status: 'ok'|'check'|'unknown' }
 */
export function lyricGridCheck(lineTimes, tl) {
  const pts = [];
  for (const t of lineTimes) {
    const { bar, beat } = beatAt(tl, t);
    if (bar < 0 || !Number.isFinite(beat)) continue;
    const b = tl.bars[bar];
    const len = b.end - b.start;
    pts.push({ phase: beat / tl.bpb, len });
  }
  if (pts.length < 6) return { coherence: 0, shift: 0, status: 'unknown', lines: pts.length };
  const barLen = pts.reduce((a, p) => a + p.len, 0) / pts.length;
  // Le righe partono sul battere oppure a metà battuta (rap, pop moderno): si valutano entrambe
  // le suddivisioni e si tiene la più coerente (a parità, la battuta intera).
  const stat = (k) => {
    let c = 0;
    let s2 = 0;
    for (const p of pts) {
      c += Math.cos(2 * Math.PI * p.phase * k);
      s2 += Math.sin(2 * Math.PI * p.phase * k);
    }
    const mean = Math.atan2(s2, c) / (2 * Math.PI); // in [-0.5, 0.5) della suddivisione
    return { k, coherence: Math.hypot(c, s2) / pts.length, shift: (mean / k) * barLen, mean };
  };
  const whole = stat(1);
  const half = stat(2);
  const best = half.coherence > whole.coherence * 1.25 ? half : whole;
  // tolleriamo un'anacrusi o un ritardo fino a 1/5 della suddivisione
  const ok = best.coherence >= 0.3 && Math.abs(best.mean) <= 0.2;
  return { coherence: best.coherence, shift: best.shift, status: ok ? 'ok' : 'check', lines: pts.length, subdivision: best.k };
}

/**
 * Stima di quanto spostare accordi (e testo) rispetto al video, dall'audio ascoltato.
 * @param frames [{ t: tempo del video, chroma: Float32Array(12), level }]
 * @param tl     timeline attuale
 * @returns { shift: secondi (+ = accordi più tardi), confidence 0..1, score, scores }
 */
export function estimateOffsetFromAudio(frames, tl, { range = 6, step = 0.05, minLevel = 0.01 } = {}) {
  const usable = frames.filter((f) => f.level >= minLevel && f.chroma);
  if (usable.length < 20) return { shift: 0, confidence: 0, score: 0, scores: [] };
  const names = tl.events.map((e) => e.sounding ?? e.name);
  const templates = new Map();
  const tpl = (n) => {
    if (!templates.has(n)) templates.set(n, template(n));
    return templates.get(n);
  };
  const scores = [];
  for (let d = -range; d <= range + 1e-9; d += step) {
    let sum = 0;
    let n = 0;
    for (const f of usable) {
      const i = eventIndexAt(tl, f.t - d);
      if (i < 0) continue;
      const tp = tpl(names[i]);
      if (!tp) continue;
      sum += cosine(f.chroma, tp);
      n++;
    }
    scores.push({ d: Math.round(d * 100) / 100, s: n ? sum / n : 0 });
  }
  const best = scores.reduce((a, b) => (b.s > a.s ? b : a));
  const sorted = scores.map((x) => x.s).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  // affidabilità: quanto il picco si stacca dal resto (normalizzata)
  const confidence = Math.max(0, Math.min(1, (best.s - median) / 0.15));
  return { shift: best.d, confidence, score: best.s, scores };
}

// Sfasamento da un solo tocco: l'utente tocca quando inizia il canto.
export function tapAlignShift(tapTime, firstLineTime) {
  return Math.round((tapTime - firstLineTime) * 100) / 100;
}

// ---------- Ancore della griglia sui tempi del canto (sincronia di default dei brani) ----------
// Fase media (circolare) di tempi rispetto a una griglia di periodo p con origine o; R = concentrazione 0..1.
function phaseStats(times, o, p) {
  let c = 0;
  let s = 0;
  for (const t of times) {
    const a = (2 * Math.PI * (t - o)) / p;
    c += Math.cos(a); s += Math.sin(a);
  }
  const n = Math.max(1, times.length);
  let ph = (Math.atan2(s, c) / (2 * Math.PI)) * p;
  return { phase: ph, R: Math.hypot(c, s) / n };
}

const median = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[b.length >> 1] : 0; };

/**
 * Ancore [battuta (anche frazionaria), secondo] per un brano.
 * unit = battuta o battito, scelto dove le righe sono più concentrate.
 */
export function computeWarp(song, lines) {
  const tl = buildTimeline({ ...song, warp: undefined, sync: undefined });
  const bpb = tl.bpb;
  const bar = tl.beatDur * bpb;
  const t0 = song.offset ?? 0;
  const ts = lines.filter((t) => t >= t0 - 0.5 && t <= tl.end + 2);
  if (ts.length < 8) return null;
  const sBar = phaseStats(ts, t0, bar);
  const sBeat = phaseStats(ts, t0, tl.beatDur);
  const useBar = sBar.R >= 0.8 * sBeat.R;
  const unit = useBar ? bar : tl.beatDur;
  // i generatori mettono l'inizio della battuta sull'inizio della riga cantata: le ancore stanno sulle righe
  // (la fase media rispetto alla vecchia griglia sarebbe falsata proprio dalla deriva da correggere)
  const phi = 0;
  const R = useBar ? sBar.R : sBeat.R;
  if (R < 0.12) return { anchors: null, R, unit: useBar ? 'battuta' : 'battito', reason: 'righe troppo irregolari' };
  // si segue la deriva riga per riga: residuo rispetto all'unità più vicina, con uno stimatore che si adatta piano
  let drift = 0;
  const pts = [];
  for (const t of ts) {
    const x = t - phi - drift - t0; // posizione sulla griglia
    const k = Math.round(x / unit);
    const r = x - k * unit;
    if (Math.abs(r) > unit * 0.35) continue; // riga fuori posto (pausa, anticipo): ignorata
    drift += 0.35 * r;
    pts.push({ g: k * unit, real: t - phi, e: t - phi - t0 - k * unit });
  }
  if (pts.length < 6) return { anchors: null, R, reason: 'poche righe agganciate' };
  // scostamento levigato (mediana mobile su 7 righe), poi ancore ogni 4 battute circa
  const sm = pts.map((p, i) => median(pts.slice(Math.max(0, i - 3), i + 4).map((q) => q.e)));
  const spread = Math.max(...sm) - Math.min(...sm);
  if (spread < 0.06) return { anchors: [], R, spread, reason: 'già in sincronia' };
  const anchors = [];
  let lastG = -Infinity;
  pts.forEach((p, i) => {
    if (p.g - lastG < bar * 4 && i !== pts.length - 1) return;
    const barPos = p.g / bar;
    const real = t0 + p.g + sm[i];
    if (anchors.length && real <= anchors.at(-1)[1] + 0.2) return;
    anchors.push([Math.round(barPos * 1000) / 1000, Math.round(real * 1000) / 1000]);
    lastG = p.g;
  });
  return { anchors, R, spread, unit: useBar ? 'battuta' : 'battito' };
}

