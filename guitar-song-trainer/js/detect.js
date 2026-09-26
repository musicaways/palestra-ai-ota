// Riconoscimento degli accordi dal microfono tramite "chroma": l'energia dello spettro raccolta
// nelle 12 classi di nota (Do, Do#, … Si) e confrontata con i modelli degli accordi.
import { parseChord, noteIndex } from './music.js';
import { GuitarInput } from './input.js';

const INTERVALS = {
  maj: [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
  sus4: [0, 5, 7], sus2: [0, 2, 7], '7sus4': [0, 5, 7, 10], '5': [0, 7], dim: [0, 3, 6], aug: [0, 4, 8], '6': [0, 4, 7, 9], add9: [0, 2, 4, 7],
};

// Classi di nota di un accordo (null se non riconosciuto).
export function chordPitchClasses(name) {
  const p = parseChord(name);
  if (!p || !p.quality || !INTERVALS[p.quality]) return null;
  const set = new Set(INTERVALS[p.quality].map((i) => (p.rootIndex + i) % 12));
  if (p.bass) set.add(noteIndex(p.bass));
  return { root: p.rootIndex, notes: [...set] };
}

// Vettore modello: note dell'accordo a 1 (fondamentale un po' di più), il resto a 0.
export function template(name) {
  const pc = chordPitchClasses(name);
  if (!pc) return null;
  const v = new Float32Array(12);
  for (const n of pc.notes) v[n] = 1;
  v[pc.root] = 1.25;
  return v;
}

export function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < 12; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * Chroma da uno spettro di ampiezze lineari.
 * @param mags  ampiezze per bin (lunghezza fftSize/2)
 * @param binHz larghezza di un bin in Hz (sampleRate / fftSize)
 */
export function chromaFromSpectrum(mags, binHz, { minHz = 75, maxHz = 1800 } = {}) {
  const chroma = new Float32Array(12);
  const lo = Math.max(1, Math.floor(minHz / binHz));
  const hi = Math.min(mags.length - 1, Math.ceil(maxHz / binHz));
  // solo i picchi locali: riduce il rumore fra una nota e l'altra
  for (let i = lo; i <= hi; i++) {
    const m = mags[i];
    if (m <= mags[i - 1] || m < mags[i + 1]) continue;
    const f = i * binHz;
    const midi = 69 + 12 * Math.log2(f / 440);
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    // le armoniche alte pesano meno delle fondamentali
    chroma[pc] += Math.sqrt(m) / Math.pow(f / 110, 0.35);
  }
  const max = Math.max(...chroma);
  if (max > 0) for (let i = 0; i < 12; i++) chroma[i] /= max;
  return chroma;
}

const CANDIDATES = [];
for (const r of ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']) CANDIDATES.push(r, `${r}m`);

/**
 * Quanto il chroma somiglia all'accordo atteso.
 * @returns { score (0..1), best: nome dell'accordo più simile, hit: bool }
 */
export function matchChord(chroma, expected, extra = []) {
  const t = template(expected);
  if (!t) return { score: 0, best: null, hit: false };
  const score = cosine(chroma, t);
  let best = expected;
  let bestScore = score;
  for (const c of [...CANDIDATES, ...extra]) {
    const tc = template(c);
    if (!tc) continue;
    const s = cosine(chroma, tc);
    if (s > bestScore + 1e-6) { bestScore = s; best = c; }
  }
  // giusto se è fra i più simili (gli accordi con note in comune si confondono facilmente)
  const hit = score >= 0.62 && score >= bestScore * 0.92;
  return { score, best, hit };
}

// FFT radix-2 (per i test in Node e per chi non ha AnalyserNode): restituisce le ampiezze.
export function fftMagnitudes(signal) {
  const n = signal.length;
  const re = Float64Array.from(signal, (x, i) => x * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))));
  const im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
      }
    }
  }
  const out = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) out[i] = Math.hypot(re[i], im[i]);
  return out;
}

/**
 * Ascolto continuo dal microfono. onFrame({ chroma, level }) circa 10 volte al secondo.
 */
export class Listener {
  // input: un GuitarInput già aperto (per esempio quello dell'amplificatore) da condividere
  constructor(onFrame, { input = null } = {}) {
    this.onFrame = onFrame;
    this.shared = input;
  }

  async start() {
    this.input = this.shared ?? await GuitarInput.open({ fftSize: 8192 });
    this.rocksmith = this.input.rocksmith;
    this.ctx = this.input.ctx;
    this.analyser = this.input.analyser;
    this.analyser.smoothingTimeConstant = 0.5;
    const db = new Float32Array(this.analyser.frequencyBinCount);
    const time = new Float32Array(this.analyser.fftSize);
    const mags = new Float32Array(db.length);
    const binHz = this.ctx.sampleRate / this.analyser.fftSize;
    this.timer = setInterval(() => {
      this.analyser.getFloatTimeDomainData(time);
      let rms = 0;
      for (let i = 0; i < time.length; i++) rms += time[i] * time[i];
      const level = Math.sqrt(rms / time.length);
      this.analyser.getFloatFrequencyData(db);
      for (let i = 0; i < db.length; i++) mags[i] = Math.pow(10, db[i] / 20);
      this.onFrame({ chroma: chromaFromSpectrum(mags, binHz), level });
    }, 100);
  }

  stop() {
    clearInterval(this.timer);
    if (!this.shared) this.input?.close();
  }
}
