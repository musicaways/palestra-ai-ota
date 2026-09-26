// Suoni brevi generati al volo (niente file audio da scaricare).
let ctx = null;

export function audioContext() {
  ctx ||= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Click del metronomo: più acuto sul primo battito della battuta.
export function click(accent = false) {
  const a = audioContext();
  const o = a.createOscillator();
  const g = a.createGain();
  o.frequency.value = accent ? 1500 : 1000;
  g.gain.setValueAtTime(0.25, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.06);
  o.connect(g).connect(a.destination);
  o.start();
  o.stop(a.currentTime + 0.07);
}

// Tiene lo schermo acceso mentre si suona (telefono e tablet).
export class WakeLock {
  async on() {
    try {
      if (!this.lock && 'wakeLock' in navigator) {
        this.lock = await navigator.wakeLock.request('screen');
        this.lock.addEventListener('release', () => { this.lock = null; });
      }
    } catch {
      /* non supportato o negato: nessun problema */
    }
  }

  off() {
    this.lock?.release().catch(() => {});
    this.lock = null;
  }
}

// Corda pizzicata sintetica (Karplus-Strong): fa sentire la nota dell'esercizio.
const OPEN_MIDI = [40, 45, 50, 55, 59, 64];
export const noteFreq = (string, fret) => 440 * 2 ** ((OPEN_MIDI[string] + fret - 69) / 12);

export function karplus(freq, sampleRate, seconds = 1.2, damping = 0.996) {
  const n = Math.floor(sampleRate * seconds);
  const out = new Float32Array(n);
  const period = Math.max(2, Math.round(sampleRate / freq));
  const buf = new Float32Array(period);
  let seed = 12345;
  for (let i = 0; i < period; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; buf[i] = (seed / 0x7fffffff) * 2 - 1; }
  let k = 0;
  for (let i = 0; i < n; i++) {
    const next = (k + 1) % period;
    const v = buf[k];
    out[i] = v;
    buf[k] = damping * 0.5 * (v + buf[next]);
    k = next;
  }
  return out;
}

export function pluck(string, fret, volume = 0.35, dur = null) {
  const a = audioContext();
  const src = a.createBufferSource();
  src.buffer = pluckBuffer(a, string, fret);
  const g = a.createGain();
  g.gain.value = volume;
  // nota con la sua durata (parte MIDI): si smorza quando finisce, come quando si alza il dito
  if (dur != null) {
    const end = a.currentTime + Math.max(0.08, dur);
    g.gain.setValueAtTime(volume, end);
    g.gain.exponentialRampToValueAtTime(0.0005, end + 0.12);
    src.stop(end + 0.15);
  }
  src.connect(g).connect(a.destination);
  src.start();
}

// Pennata sintetica di un accordo: le corde suonano una dopo l'altra (giù: dal basso; su: dall'alto).
const pluckCache = new Map();
function pluckBuffer(a, string, fret) {
  const k = `${a.sampleRate}:${string}:${fret}`;
  if (!pluckCache.has(k)) {
    const data = karplus(noteFreq(string, fret), a.sampleRate, 1.6, 0.997);
    const b = a.createBuffer(1, data.length, a.sampleRate);
    b.copyToChannel(data, 0);
    pluckCache.set(k, b);
  }
  return pluckCache.get(k);
}

let strumBus = null;
const ringing = [null, null, null, null, null, null]; // corda → nodo di volume della nota che suona

/**
 * Pennata sintetica realistica.
 *   kind: 'D' giù (tutte le corde) · 'U' su (corde acute) · 'X' stoppata · 'P' palm muting (corde basse, corte)
 *         · 'B' solo il basso dell'accordo
 *   accent: 1 = normale; i battiti forti si suonano un po' più forte
 * Le corde che stavano suonando vengono smorzate quando si ripizzicano, come su una chitarra vera.
 */
export function strumChord(frets, { up = false, mute = false, kind = up ? 'U' : mute ? 'X' : 'D', volume = 0.22, accent = 1, when = 0 } = {}) {
  const a = audioContext();
  if (!strumBus) {
    strumBus = a.createGain();
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5600;
    strumBus.connect(lp).connect(a.destination);
  }
  let order = [0, 1, 2, 3, 4, 5].filter((s) => frets[s] != null);
  if (!order.length) return;
  if (kind === 'U') order = order.slice(-4).reverse(); // in su si prendono le corde acute
  if (kind === 'B') order = order.slice(0, 1);
  if (kind === 'P') order = order.slice(0, 3);
  const human = () => (Math.random() - 0.5) * 0.012;
  const t0 = a.currentTime + when + 0.005 + human();
  const spread = kind === 'U' ? 0.009 : kind === 'B' ? 0 : 0.013;
  const vol = volume * accent * (kind === 'U' ? 0.62 : kind === 'P' ? 0.8 : kind === 'X' ? 0.5 : 1) * (0.92 + Math.random() * 0.16);
  const decay = kind === 'X' ? 0.035 : kind === 'P' ? 0.13 : 1.1;
  order.forEach((s, i) => {
    const at = t0 + i * spread;
    // smorza la nota precedente sulla stessa corda
    const prev = ringing[s];
    if (prev) { try { prev.gain.cancelScheduledValues(at); prev.gain.setTargetAtTime(0, at, 0.015); } catch { /* già fermo */ } }
    const src = a.createBufferSource();
    src.buffer = pluckBuffer(a, s, frets[s]);
    const g = a.createGain();
    const v = vol * (s < 2 ? 1.05 : 0.9);
    g.gain.setValueAtTime(v, at);
    g.gain.setTargetAtTime(0, at + decay, kind === 'X' ? 0.01 : kind === 'P' ? 0.04 : 0.35);
    src.connect(g).connect(strumBus);
    src.start(at);
    src.stop(at + (kind === 'X' || kind === 'P' ? 0.6 : 2.5));
    ringing[s] = g;
  });
  if (kind === 'X') {
    // il "chuck": rumore corto e sordo delle corde stoppate
    const n = a.createBuffer(1, Math.floor(a.sampleRate * 0.05), a.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    const src = a.createBufferSource();
    src.buffer = n;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8;
    const g = a.createGain(); g.gain.value = volume * 1.6;
    src.connect(f).connect(g).connect(strumBus);
    src.start(t0);
  }
}
