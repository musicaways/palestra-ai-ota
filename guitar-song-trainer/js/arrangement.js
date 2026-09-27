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
  { id: 'midi', label: 'Parte vera', desc: 'Le note esatte della chitarra del brano, da un file MIDI o Guitar Pro: si agganciano da sole alle battute.' },
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

// Stili di arpeggio, dita della mano destra: p pollice (basso), q pollice sul basso alternato,
// i indice, m medio, a anulare (le tre corde acute suonate dell'accordo, a = la più acuta).
export const PICKINGS = {
  broken: { label: 'Arpeggio classico', 4: 'p i m a m i m a', 3: 'p i m a m i', 2: 'p i m a' },
  travis: { label: 'Travis (fingerpicking folk)', 4: 'p m q i p m q i', 3: 'p m q i p m', 2: 'p m q i' },
  pima: { label: 'Ballata p-i-m-a', 4: 'p i m a p i m a', 3: 'p i m a m i', 2: 'p i m a' },
  waltz: { label: 'Valzer', 4: 'p i m a m i m a', 3: 'p i m i a i', 2: 'p i m i' },
  pinch: { label: 'Basso e pizzico', 4: 'p a i m q a i m', 3: 'p a i m i a', 2: 'p a q a' },
};

// Stile adatto al brano: campo "picking" del brano, altrimenti dal genere, dal metro e dal tempo.
export function pickingFor(song) {
  if (song?.picking && PICKINGS[song.picking]) return song.picking;
  const g = `${song?.genre ?? ''}`.toLowerCase();
  const bpb = song?.timeSignature?.[0] ?? 4;
  if (bpb === 3 || bpb === 6) return 'waltz';
  if (/folk|country|cantautor/.test(g)) return 'travis';
  if ((song?.bpm ?? 100) < 80) return 'pima';
  if (/rock|metal|punk/.test(g)) return 'pinch';
  return 'broken';
}

/**
 * Note dell'arpeggio per ogni battuta, nello stile scelto.
 * @param tl        timeline (con ev.name = nome della forma da suonare)
 * @param shapeOf   funzione nome → diteggiatura (frets relativi al capotasto)
 * @param picking   stile (vedi PICKINGS)
 * @returns [{ t, dur, string, fret, ev, finger }]
 */
export function buildArpeggio(tl, shapeOf, picking = 'broken') {
  const notes = [];
  const style = PICKINGS[picking] ?? PICKINGS.broken;
  const pat = (style[tl.bpb] ?? style[4]).split(' ');
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
      const bass = played[0];
      const alt = played.find((s) => s > bass && s <= 3 && s !== bass) ?? played[Math.min(1, played.length - 1)];
      const treble = played.filter((s) => s >= 2).slice(-3); // i m a
      const pickT = (n) => treble[Math.max(0, treble.length - n)] ?? played.at(-1);
      const s = { p: bass, q: alt, i: pickT(3), m: pickT(2), a: pickT(1) }[pat[k]];
      if (s == null) continue;
      notes.push({ t, dur: step, string: s, fret: shape.frets[s], ev: evIdx, finger: pat[k] });
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
