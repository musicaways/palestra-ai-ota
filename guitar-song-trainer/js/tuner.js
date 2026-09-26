// Accordatore cromatico dal microfono (autocorrelazione), con le 6 corde in accordatura standard.
import { noteName, STRING_COLORS, STRING_NAMES } from './music.js';

const STRINGS_HZ = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63];

// Frequenza fondamentale col metodo dell'autocorrelazione (ACF2+), null se il segnale è debole.
export function detectPitch(buf, sampleRate) {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  if (Math.sqrt(rms / n) < 0.01) return null;
  // taglia gli estremi silenziosi
  let a = 0;
  let b = n - 1;
  const thr = 0.2;
  for (let i = 0; i < n / 2; i++) if (Math.abs(buf[i]) < thr) { a = i; break; }
  for (let i = 1; i < n / 2; i++) if (Math.abs(buf[n - i]) < thr) { b = n - i; break; }
  const x = buf.slice(a, b);
  const len = x.length;
  const c = new Float32Array(len);
  for (let lag = 0; lag < len; lag++) {
    let sum = 0;
    for (let i = 0; i < len - lag; i++) sum += x[i] * x[i + lag];
    c[lag] = sum;
  }
  let d = 0;
  while (d < len - 1 && c[d] > c[d + 1]) d++;
  let maxV = -1;
  let maxP = -1;
  for (let i = d; i < len; i++) if (c[i] > maxV) { maxV = c[i]; maxP = i; }
  if (maxP <= 0 || maxP >= len - 1) return null;
  // interpolazione parabolica attorno al picco
  const [y1, y2, y3] = [c[maxP - 1], c[maxP], c[maxP + 1]];
  const A = (y1 + y3 - 2 * y2) / 2;
  const B = (y3 - y1) / 2;
  const T0 = A ? maxP - B / (2 * A) : maxP;
  const f = sampleRate / T0;
  return f > 60 && f < 1400 ? f : null;
}

export function describePitch(freq, notation) {
  const midi = 69 + 12 * Math.log2(freq / 440);
  const nearest = Math.round(midi);
  const cents = Math.round((midi - nearest) * 100);
  let string = 0;
  let best = Infinity;
  STRINGS_HZ.forEach((hz, i) => {
    const d = Math.abs(1200 * Math.log2(freq / hz));
    if (d < best) { best = d; string = i; }
  });
  return {
    note: noteName(nearest % 12, notation),
    octave: Math.floor(nearest / 12) - 1,
    cents,
    string,
    stringCents: Math.round(1200 * Math.log2(freq / STRINGS_HZ[string])),
  };
}

export class Tuner {
  constructor(container, settings) {
    this.el = container;
    this.settings = settings;
    this.el.innerHTML = `
      <div class="tuner-strings">${STRING_NAMES.map((s, i) => `<span data-s="${i}" style="--c:${STRING_COLORS[i]}">${s}</span>`).join('')}</div>
      <div class="tuner-note">—</div>
      <div class="tuner-meter">
        <div class="tuner-scale"><i></i><i></i><i></i><i></i><i class="mid"></i><i></i><i></i><i></i><i></i></div>
        <div class="tuner-needle"></div>
        <div class="tuner-labels"><span>−50</span><span>0</span><span>+50</span></div>
      </div>
      <div class="tuner-info">Suona una corda alla volta</div>`;
    this.noteEl = this.el.querySelector('.tuner-note');
    this.needle = this.el.querySelector('.tuner-needle');
    this.info = this.el.querySelector('.tuner-info');
    this.smooth = null;
  }

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch {
      this.info.textContent = 'Serve il permesso di usare il microfono (e una pagina https).';
      return;
    }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 4096;
    src.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.analyser.getFloatTimeDomainData(this.buf);
      const f = detectPitch(this.buf, this.ctx.sampleRate);
      if (!f) return;
      this.smooth = this.smooth && Math.abs(Math.log2(f / this.smooth)) < 0.05 ? this.smooth * 0.7 + f * 0.3 : f;
      this.paint(describePitch(this.smooth, this.settings.notation), this.smooth);
    };
    loop();
  }

  paint(p, freq) {
    const inTune = Math.abs(p.cents) <= 5;
    this.noteEl.textContent = `${p.note}${p.octave}`;
    this.noteEl.classList.toggle('ok', inTune);
    this.needle.style.left = `${50 + Math.max(-50, Math.min(50, p.cents))}%`;
    this.needle.classList.toggle('ok', inTune);
    this.el.querySelectorAll('.tuner-strings span').forEach((s) => s.classList.toggle('on', Number(s.dataset.s) === p.string));
    const dir = p.stringCents > 5 ? 'scendi ↓' : p.stringCents < -5 ? 'sali ↑' : 'accordata ✓';
    this.info.textContent = `${freq.toFixed(1)} Hz · corda ${STRING_NAMES[p.string]}: ${p.stringCents > 0 ? '+' : ''}${p.stringCents} cent · ${dir}`;
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
  }
}
