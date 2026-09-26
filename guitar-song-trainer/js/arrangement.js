// Parti di chitarra ricavate dagli accordi del brano (arrangiamenti originali, non trascrizioni):
//   ritmica  → gli accordi del brano, pennata
//   arpeggio → note singole sulle corde dell'accordo (basso + corde acute), a crome
//   power    → power chord (fondamentale + quinta) sulle corde gravi, stile rock
//   facile   → accordi semplificati: solo triadi, senza basso alternativo, forme ridotte senza barrè
import { parseChord, getShape } from './music.js';

export const ARRANGEMENTS = [
  { id: 'rhythm', label: 'Ritmica', desc: 'Gli accordi del brano con la pennata.' },
  { id: 'arpeggio', label: 'Arpeggio', desc: 'Le note dell\'accordo una alla volta: basso e corde acute, a crome.' },
  { id: 'power', label: 'Power chord', desc: 'Fondamentale e quinta sulle corde gravi: suono rock, due dita.' },
  { id: 'easy', label: 'Facile', desc: 'Accordi semplificati, senza settime e con forme ridotte al posto del barrè.' },
];

// "Ebmaj7" → "Eb", "Gm7" → "Gm", "D7sus4" → "D", "Gm/F" → "Gm", "Dm7b5" → "Dm"
export function simplifyChord(name) {
  const p = parseChord(name);
  if (!p) return name;
  const minor = p.quality === 'm' || p.quality === 'm7' || p.quality === 'dim';
  return p.root + (minor ? 'm' : '');
}

export function powerChord(name) {
  const p = parseChord(name);
  return p ? `${p.root}5` : name;
}

// Forma ridotta: per accordi col barrè si tengono solo le 4 corde acute (tipico degli arrangiamenti facili).
export function easyShape(shape) {
  if (!shape) return shape;
  const big = shape.barres?.some((b) => b.to - b.from >= 3);
  if (!big) return shape;
  const frets = shape.frets.map((f, s) => (s < 2 ? null : f));
  const fingers = shape.fingers.map((f, s) => (s < 2 ? 0 : f));
  const fretted = frets.filter((f) => f != null && f > 0);
  if (!fretted.length) return shape;
  return { frets, fingers, barres: (shape.barres || []).map((b) => ({ ...b, from: Math.max(2, b.from) })).filter((b) => b.to - b.from >= 1) };
}

// Ordine delle corde per l'arpeggio: basso (corda più grave suonata) poi le corde acute a salire e scendere.
const PATTERNS = {
  4: [0, 2, 3, 4, 5, 4, 3, 2], // 8 crome
  3: [0, 2, 3, 4, 3, 2], // 6 crome
  6: [0, 2, 3, 4, 3, 2],
  2: [0, 2, 3, 4],
};

/**
 * Note dell'arpeggio per ogni battuta.
 * @param tl        timeline (con ev.name = nome della forma da suonare)
 * @param shapeOf   funzione nome → diteggiatura (frets relativi al capotasto)
 * @returns [{ t, dur, string, fret, ev }]
 */
export function buildArpeggio(tl, shapeOf) {
  const notes = [];
  const pat = PATTERNS[tl.bpb] ?? PATTERNS[4];
  for (const bar of tl.bars) {
    const step = (bar.end - bar.start) / pat.length;
    for (let k = 0; k < pat.length; k++) {
      const t = bar.start + k * step;
      const evIdx = lastStart(tl.events, t + 1e-6);
      const ev = tl.events[evIdx];
      if (!ev) continue;
      const shape = shapeOf(ev.name);
      if (!shape) continue;
      const played = shape.frets.map((f, s) => (f === null ? null : s)).filter((s) => s !== null);
      if (!played.length) continue;
      // posizione 0 = basso; le altre scelgono fra le corde acute suonate
      const upper = played.slice(1);
      let s;
      if (pat[k] === 0 || !upper.length) s = played[0];
      else s = upper[Math.min(upper.length - 1, pat[k] - 2 + Math.max(0, upper.length - 4))];
      notes.push({ t, dur: step, string: s, fret: shape.frets[s], ev: evIdx });
    }
  }
  return notes;
}

function lastStart(list, t) {
  let lo = 0;
  let hi = list.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].start <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

// Nome dell'accordo da suonare per la parte scelta (prima del capotasto).
export function arrangeName(name, arrangement) {
  if (arrangement === 'power') return powerChord(name);
  if (arrangement === 'easy') return simplifyChord(name);
  return name;
}

export function shapeForArrangement(name, arrangement, custom) {
  const sh = getShape(name, custom);
  return arrangement === 'easy' ? easyShape(sh) : sh;
}
