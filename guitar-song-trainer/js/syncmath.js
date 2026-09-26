// Controlli e correzioni automatiche della sincronia fra video, accordi e testo.
// Tutto qui è puro (niente DOM): si testa con node --test.
import { eventIndexAt, beatAt } from './timeline.js';
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
