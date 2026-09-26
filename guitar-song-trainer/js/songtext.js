// Formato testuale degli accordi usato dall'editor, facile da scrivere a mano:
//
//   [Intro]
//   Ebmaj7 % D7sus4,D7
//   [Strofa 1] x2
//   Gm % Gm/F % | Ebmaj7 % D7sus4 D7
//
// - [Nome] apre una sezione, "xN" la ripete N volte;
// - ogni parola è una battuta; "%" = l'accordo prosegue; "|" è solo decorativo;
// - più accordi nella stessa battuta: separati da virgola (D7sus4,D7) o con i battiti (F5:3,C5:1);
// - ogni riga è una riga dello spartito (conta la lunghezza della prima riga della sezione).
import { parseChord } from './music.js';

export function parseSongText(text) {
  const sections = [];
  const errors = [];
  let cur = null;
  String(text).replace(/\r/g, '').split('\n').forEach((raw, i) => {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) return;
    const head = /^\[([^\]]+)\]\s*(?:x\s*(\d+))?\s*$/i.exec(line);
    if (head) {
      cur = { name: head[1].trim(), bars: [], repeat: head[2] ? Number(head[2]) : 1, firstLine: null };
      sections.push(cur);
      return;
    }
    if (!cur) {
      cur = { name: 'Brano', bars: [], repeat: 1, firstLine: null };
      sections.push(cur);
    }
    const bars = line.split(/\s+/).filter((tok) => tok && tok !== '|');
    for (const tok of bars) {
      if (tok === '%') { cur.bars.push('%'); continue; }
      const parts = tok.split(',').filter(Boolean);
      for (const part of parts) {
        const [name, beats] = part.split(':');
        if (!parseChord(name)) errors.push(`Riga ${i + 1}: accordo non valido "${name}"`);
        if (beats !== undefined && !(Number(beats) > 0)) errors.push(`Riga ${i + 1}: battiti non validi in "${part}"`);
      }
      cur.bars.push(parts.length > 1 ? parts : parts[0]);
    }
    cur.firstLine ??= bars.length;
  });
  const out = sections
    .filter((s) => s.bars.length)
    .map((s) => {
      const sec = { name: s.name, bars: s.bars };
      if (s.repeat > 1) sec.repeat = s.repeat;
      if (s.firstLine && s.firstLine < s.bars.length) sec.barsPerRow = s.firstLine;
      return sec;
    });
  if (!out.length) errors.push('Nessuna battuta: scrivi almeno una riga di accordi.');
  return { sections: out, errors };
}

// Da brano (con patterns o bars) a testo modificabile.
export function songToText(song) {
  const lines = [];
  for (const sec of song.sections ?? []) {
    const bars = sec.bars ?? song.patterns?.[sec.pattern] ?? [];
    const per = sec.barsPerRow ?? song.barsPerRow ?? bars.length;
    lines.push(`[${sec.name}]${(sec.repeat ?? 1) > 1 ? ` x${sec.repeat}` : ''}`);
    for (let i = 0; i < bars.length; i += per) {
      lines.push(bars.slice(i, i + per).map((b) => (Array.isArray(b) ? b.join(',') : b)).join(' '));
    }
  }
  return lines.join('\n');
}

export function slugify(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'brano';
}

// Accetta un link YouTube in qualsiasi forma oppure l'ID nudo.
export function youtubeId(input) {
  const s = String(input ?? '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = /(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/.exec(s);
  return m ? m[1] : null;
}

// BPM da una serie di tocchi (ms): media degli ultimi intervalli, ignorando le pause lunghe.
export function tapTempo(times) {
  const iv = [];
  for (let i = 1; i < times.length; i++) {
    const d = times[i] - times[i - 1];
    if (d > 200 && d < 2000) iv.push(d);
  }
  const last = iv.slice(-8);
  if (last.length < 2) return null;
  return Math.round(60000 / (last.reduce((a, b) => a + b, 0) / last.length));
}
