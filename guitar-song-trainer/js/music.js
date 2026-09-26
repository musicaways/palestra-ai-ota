// Teoria musicale minima: note, parsing degli accordi, diteggiature per chitarra.

const NOTE_BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const IT_NAMES = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };

// Accordatura standard, dalla corda più grave (Mi basso) alla più acuta (Mi cantino).
export const STANDARD_TUNING = [4, 9, 2, 7, 11, 4];
export const STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'e'];
// Colori delle corde in stile Rocksmith (Mi grave → Mi cantino).
export const STRING_COLORS = ['#ff4d5e', '#ffd23f', '#3fa7ff', '#ff9f1c', '#3ddc84', '#b574ff'];

export function noteIndex(note) {
  let i = NOTE_BASE[note[0]];
  for (const ch of note.slice(1)) {
    if (ch === '#') i++;
    else if (ch === 'b') i--;
  }
  return (i + 12) % 12;
}

export function noteName(index, notation = 'intl') {
  const n = SHARP_NAMES[((index % 12) + 12) % 12];
  return notation === 'it' ? IT_NAMES[n[0]] + n.slice(1) : n;
}

const QUALITY_ALIASES = {
  '': 'maj', M: 'maj', maj: 'maj',
  m: 'm', min: 'm', '-': 'm',
  '7': '7',
  m7: 'm7', min7: 'm7', '-7': 'm7',
  maj7: 'maj7', M7: 'maj7', '7+': 'maj7', 'Δ': 'maj7', 'Δ7': 'maj7',
  sus4: 'sus4', '4': 'sus4', sus: 'sus4',
  sus2: 'sus2', '2': 'sus2',
  '7sus4': '7sus4', '7/4': '7sus4', '74': '7sus4',
  '5': '5',
  dim: 'dim', '°': 'dim',
  aug: 'aug', '+': 'aug',
  '6': '6', add9: 'add9', add2: 'add9',
};

export function parseChord(name) {
  const m = /^([A-G](?:#|b)?)([^/]*)(?:\/([A-G](?:#|b)?))?$/.exec(String(name).trim());
  if (!m) return null;
  return {
    root: m[1],
    rootIndex: noteIndex(m[1]),
    rawQuality: m[2],
    quality: QUALITY_ALIASES[m[2]] ?? null,
    bass: m[3] || null,
  };
}

// Nome dell'accordo da mostrare, con notazione internazionale (C D E) o italiana (Do Re Mi).
export function displayChord(name, notation = 'intl') {
  if (notation !== 'it') return name;
  const p = parseChord(name);
  if (!p) return name;
  const it = (n) => IT_NAMES[n[0]] + n.slice(1);
  return it(p.root) + p.rawQuality + (p.bass ? '/' + it(p.bass) : '');
}

export function chordColor(name) {
  const p = parseChord(name);
  if (!p) return 'hsl(0 0% 60%)';
  const hue = (p.rootIndex * 30 + 200) % 360;
  const light = p.quality === 'm' || p.quality === 'm7' ? 52 : 60;
  return `hsl(${hue} 75% ${light}%)`;
}

// Diteggiature esplicite (frets: Mi grave → Mi cantino, null = corda non suonata).
// fingers: 0 = corda a vuoto / nessun dito, 1-4 = indice…mignolo.
const n = null;
const EXPLICIT = {
  C: { frets: [n, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
  C7: { frets: [n, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0] },
  Cmaj7: { frets: [n, 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0] },
  Cadd9: { frets: [n, 3, 2, 0, 3, 0], fingers: [0, 2, 1, 0, 3, 0] },
  Gadd9: { frets: [3, 0, 0, 2, 0, 3], fingers: [2, 0, 0, 1, 0, 3] },
  D: { frets: [n, n, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] },
  Dm: { frets: [n, n, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] },
  D7: { frets: [n, n, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3] },
  Dm7: { frets: [n, n, 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1] },
  Dmaj7: { frets: [n, n, 0, 2, 2, 2], fingers: [0, 0, 0, 1, 1, 1] },
  Dsus4: { frets: [n, n, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 3, 4] },
  Dsus2: { frets: [n, n, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 3, 0] },
  D7sus4: { frets: [n, n, 0, 2, 1, 3], fingers: [0, 0, 0, 2, 1, 4] },
  G: { frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3] },
  G7: { frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] },
  Gm: { frets: [3, 5, 5, 3, 3, 3], fingers: [1, 3, 4, 1, 1, 1] },
  'Gm/F': { frets: [1, n, 0, 3, 3, 3], fingers: [1, 0, 0, 3, 3, 3] },
  Ebmaj7: { frets: [n, n, 1, 3, 3, 3], fingers: [0, 0, 1, 3, 3, 3] },
  Fmaj7: { frets: [n, n, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0] },
  E7: { frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] },
  'Em/D': { frets: [n, n, 0, 0, 0, 0], fingers: [0, 0, 0, 0, 0, 0] },
  B7: { frets: [n, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4] },
  Em7: { frets: [0, 2, 0, 0, 0, 0], fingers: [0, 2, 0, 0, 0, 0] },
  Am: { frets: [n, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] },
  Em: { frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] },
  A: { frets: [n, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] },
  E: { frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] },
  A7: { frets: [n, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0] },
  Am7: { frets: [n, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0] },
};

// Forme mobili: offset rispetto al tasto della fondamentale (null = non suonata).
const E_SHAPES = {
  maj: { off: [0, 2, 2, 1, 0, 0], fingers: [1, 3, 4, 2, 1, 1] },
  m: { off: [0, 2, 2, 0, 0, 0], fingers: [1, 3, 4, 1, 1, 1] },
  '7': { off: [0, 2, 0, 1, 0, 0], fingers: [1, 3, 1, 2, 1, 1] },
  m7: { off: [0, 2, 0, 0, 0, 0], fingers: [1, 3, 1, 1, 1, 1] },
  maj7: { off: [0, n, 1, 1, 0, n], fingers: [1, 0, 3, 4, 2, 0] },
  sus4: { off: [0, 2, 2, 2, 0, 0], fingers: [1, 2, 3, 4, 1, 1] },
  '7sus4': { off: [0, 2, 0, 2, 0, 0], fingers: [1, 3, 1, 4, 1, 1] },
  '5': { off: [0, 2, 2, n, n, n], fingers: [1, 3, 4, 0, 0, 0] },
  aug: { off: [0, 3, 2, 1, 1, 0], fingers: [1, 4, 3, 2, 2, 1] },
  '6': { off: [0, 2, 2, 1, 2, 0], fingers: [1, 3, 3, 2, 4, 1] },
  add9: { off: [0, 2, 4, 1, 0, 0], fingers: [1, 2, 4, 3, 1, 1] },
};
const A_SHAPES = {
  maj: { off: [n, 0, 2, 2, 2, 0], fingers: [0, 1, 3, 3, 3, 1] },
  m: { off: [n, 0, 2, 2, 1, 0], fingers: [0, 1, 3, 4, 2, 1] },
  '7': { off: [n, 0, 2, 0, 2, 0], fingers: [0, 1, 3, 1, 4, 1] },
  m7: { off: [n, 0, 2, 0, 1, 0], fingers: [0, 1, 3, 1, 2, 1] },
  maj7: { off: [n, 0, 2, 1, 2, 0], fingers: [0, 1, 3, 2, 4, 1] },
  sus2: { off: [n, 0, 2, 2, 0, 0], fingers: [0, 1, 3, 4, 1, 1] },
  sus4: { off: [n, 0, 2, 2, 3, 0], fingers: [0, 1, 2, 3, 4, 1] },
  '7sus4': { off: [n, 0, 2, 0, 3, 0], fingers: [0, 1, 3, 1, 4, 1] },
  '5': { off: [n, 0, 2, 2, n, n], fingers: [0, 1, 3, 4, 0, 0] },
  dim: { off: [n, 0, 1, 2, 1, n], fingers: [0, 1, 2, 4, 3, 0] },
  '6': { off: [n, 0, 2, 2, 2, 2], fingers: [0, 1, 3, 3, 3, 3] },
  add9: { off: [n, 0, 2, 4, 2, 0], fingers: [0, 1, 2, 4, 3, 1] },
};

function fromShape(shape, rootFret) {
  const frets = shape.off.map((o) => (o === null ? null : o + rootFret));
  // Con la fondamentale a vuoto l'indice non serve: le dita scalano di uno.
  const fingers = frets.map((f, i) => {
    if (f === null || f === 0) return 0;
    return rootFret === 0 ? Math.max(1, shape.fingers[i] - 1) : shape.fingers[i];
  });
  return { frets, fingers };
}

function withBarres(shape) {
  const barres = [];
  const byFinger = {};
  shape.frets.forEach((f, s) => {
    const fg = shape.fingers[s];
    if (!fg || f === null || f === 0) return;
    (byFinger[fg + ':' + f] ||= []).push(s);
  });
  for (const [key, strings] of Object.entries(byFinger)) {
    if (strings.length < 2) continue;
    const [finger, fret] = key.split(':').map(Number);
    barres.push({ fret, finger, from: Math.min(...strings), to: Math.max(...strings) });
  }
  return { ...shape, barres };
}

const shapeCache = new Map();

// Restituisce { frets, fingers, barres } oppure null se l'accordo non è riconosciuto.
export function getShape(name, custom) {
  if (custom && custom[name]) return withBarres(custom[name]);
  if (shapeCache.has(name)) return shapeCache.get(name);
  let result = null;
  if (EXPLICIT[name]) {
    result = withBarres(EXPLICIT[name]);
  } else {
    const p = parseChord(name);
    if (p && p.quality) {
      const eFret = (p.rootIndex - STANDARD_TUNING[0] + 12) % 12;
      const aFret = (p.rootIndex - STANDARD_TUNING[1] + 12) % 12;
      const e = E_SHAPES[p.quality];
      const a = A_SHAPES[p.quality];
      let shape = null;
      if (e && a) shape = aFret < eFret ? fromShape(a, aFret) : fromShape(e, eFret);
      else if (e) shape = fromShape(e, eFret);
      else if (a) shape = fromShape(a, aFret);
      if (shape && p.bass) shape = addBass(shape, noteIndex(p.bass));
      if (shape) result = withBarres(shape);
    }
  }
  shapeCache.set(name, result);
  return result;
}

// Aggiunge il basso di un accordo "slash" sulla corda più grave libera, se raggiungibile.
function addBass(shape, bassIndex) {
  const frets = [...shape.frets];
  const fingers = [...shape.fingers];
  const used = frets.filter((f) => f !== null && f > 0);
  const lo = used.length ? Math.min(...used) : 0;
  for (let s = 0; s < 2; s++) {
    if (frets[s] !== null && s === 1) break;
    const f = (bassIndex - STANDARD_TUNING[s] + 12) % 12;
    if (Math.abs(f - lo) <= 3 || f === 0) {
      frets[s] = f;
      fingers[s] = f === 0 ? 0 : 2;
      for (let k = 0; k < s; k++) { frets[k] = null; fingers[k] = 0; }
      return { frets, fingers };
    }
  }
  return shape;
}

export function fretNote(stringIndex, fret) {
  return (STANDARD_TUNING[stringIndex] + fret) % 12;
}

// ---------- Trasposizione e capotasto ----------

const FLAT_KEYS = new Set([10, 3, 8]); // Bb Eb Ab: di solito si scrivono coi bemolle
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

function spell(index, preferFlat) {
  const i = ((index % 12) + 12) % 12;
  return preferFlat ? FLAT_NAMES[i] : SHARP_NAMES[i];
}

// Trasporta un accordo di n semitoni ("Gm/F", -3 → "Em/D").
export function transposeChord(name, semitones) {
  if (!semitones) return name;
  const p = parseChord(name);
  if (!p) return name;
  const root = (p.rootIndex + semitones + 12) % 12;
  const flat = p.root.includes('b') || (!p.root.includes('#') && FLAT_KEYS.has(root));
  const out = spell(root, flat) + p.rawQuality;
  return p.bass ? `${out}/${spell(noteIndex(p.bass) + semitones, flat)}` : out;
}

// Con il capotasto al tasto c si suona la forma dell'accordo trasportato di -c.
export function shapeNameWithCapo(name, capo) {
  return capo ? transposeChord(name, -capo) : name;
}

// Quanto è difficile una diteggiatura: barrè e tasti alti pesano di più.
export function shapeDifficulty(shape) {
  if (!shape) return 10;
  const fretted = shape.frets.filter((f) => f != null && f > 0);
  const hasBarre = shape.barres.some((b) => b.to - b.from >= 2);
  const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
  const high = fretted.length ? Math.max(...fretted) : 0;
  return (hasBarre ? 4 : 0) + Math.max(0, span - 2) + (high > 5 ? 1 : 0) + fretted.length * 0.1;
}

// Suggerisce il capotasto (0-7) che rende più facili gli accordi del brano.
export function suggestCapo(chordNames, custom) {
  const names = [...new Set(chordNames)];
  let best = { capo: 0, score: Infinity };
  const scores = [];
  for (let c = 0; c <= 7; c++) {
    const score = names.reduce((s, n) => s + shapeDifficulty(getShape(shapeNameWithCapo(n, c), c ? null : custom)), 0) + c * 0.7 * Math.max(1, names.length / 4); // un capotasto alto conviene solo se aiuta davvero
    scores.push({ capo: c, score });
    if (score < best.score - 1e-9) best = { capo: c, score };
  }
  return { ...best, scores };
}
