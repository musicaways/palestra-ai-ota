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
