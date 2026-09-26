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

export function pluck(string, fret, volume = 0.35) {
  const a = audioContext();
  const data = karplus(noteFreq(string, fret), a.sampleRate);
  const b = a.createBuffer(1, data.length, a.sampleRate);
  b.copyToChannel(data, 0);
  const src = a.createBufferSource();
  src.buffer = b;
  const g = a.createGain();
  g.gain.value = volume;
  src.connect(g).connect(a.destination);
  src.start();
}
