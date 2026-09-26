// Due "orologi" con la stessa interfaccia: il video YouTube oppure un clock interno
// (usato quando YouTube non è raggiungibile, così si può comunque esercitarsi col metronomo).

let ytApiPromise = null;

export function loadYouTubeApi(timeoutMs = 10000) {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ytApiPromise = null;
      reject(new Error('YouTube non raggiungibile'));
    }, timeoutMs);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer);
      prev?.();
      resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => {
      clearTimeout(timer);
      ytApiPromise = null;
      reject(new Error('YouTube non raggiungibile'));
    };
    document.head.appendChild(s);
  });
  return ytApiPromise;
}

export class YouTubeClock {
  // onError: errori che arrivano DOPO il caricamento (video non incorporabile, rimosso, ecc.)
  static async create(element, videoId, { onStateChange, onError } = {}) {
    const YT = await loadYouTubeApi();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Il video non si è caricato')), 15000);
      const clock = new YouTubeClock();
      let ready = false;
      clock.player = new YT.Player(element, {
        videoId,
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 1 },
        events: {
          onReady: () => {
            clearTimeout(timer);
            ready = true;
            resolve(clock);
          },
          onStateChange: (e) => {
            clock._playing = e.data === YT.PlayerState.PLAYING;
            clock._anchor = null;
            onStateChange?.(clock._playing);
          },
          onError: (e) => {
            clearTimeout(timer);
            const err = new Error(youTubeErrorText(e.data));
            err.code = e.data;
            if (ready) onError?.(err); else reject(err);
          },
        },
      });
    });
  }

  constructor() {
    this.kind = 'youtube';
    this._playing = false;
    this._anchor = null; // { yt, now } per interpolare fra un aggiornamento e l'altro
    this._lastYt = -1;
  }

  get playing() {
    return this._playing;
  }

  play() { this.player.playVideo(); }
  pause() { this.player.pauseVideo(); }
  toggle() { this._playing ? this.pause() : this.play(); }

  seek(t) {
    this.player.seekTo(Math.max(0, t), true);
    this._anchor = { yt: Math.max(0, t), now: performance.now() };
    this._lastYt = -1;
  }

  setRate(r) { this.player.setPlaybackRate(r); }
  getRate() { return this.player.getPlaybackRate?.() ?? 1; }
  rates() { return this.player.getAvailablePlaybackRates?.() ?? [0.25, 0.5, 0.75, 1, 1.25, 1.5]; }
  duration() { return this.player.getDuration?.() || 0; }

  // getCurrentTime() di YouTube si aggiorna a scatti: interpoliamo per un'animazione fluida.
  getTime() {
    const yt = this.player.getCurrentTime?.() ?? 0;
    const now = performance.now();
    if (!this._playing) {
      this._anchor = { yt, now };
      return yt;
    }
    if (yt !== this._lastYt || !this._anchor) {
      const predicted = this._anchor ? this._anchor.yt + ((now - this._anchor.now) / 1000) * this.getRate() : yt;
      // Riallinea all'ultimo valore reale, senza salti all'indietro visibili se lo scarto è minimo.
      this._anchor = { yt: Math.abs(predicted - yt) < 0.08 ? predicted : yt, now };
      this._lastYt = yt;
    }
    return this._anchor.yt + ((now - this._anchor.now) / 1000) * this.getRate();
  }

  destroy() { this.player?.destroy?.(); }
}

export function youTubeErrorText(code) {
  if (code === 101 || code === 150) return 'Il proprietario del video non permette di guardarlo fuori da YouTube';
  if (code === 153) return 'YouTube non accetta la pagina aperta così: avvia l\'app con avvia.bat / avvia.command (indirizzo http://localhost)';
  if (code === 100) return 'Il video non esiste più';
  if (code === 2) return 'Video non valido';
  if (code === 5) return 'Il browser non riesce a riprodurre il video';
  return `Errore del video YouTube (codice ${code})`;
}

// File audio scelto dall'utente (MP3, M4A…): velocità regolabile senza cambiare l'intonazione.
export class AudioClock {
  constructor(src, { onStateChange } = {}) {
    this.kind = 'audio';
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.preservesPitch = true;
    this.audio.mozPreservesPitch = true;
    this.audio.webkitPreservesPitch = true;
    this.audio.src = src;
    this._anchor = null;
    this.audio.addEventListener('play', () => onStateChange?.(true));
    this.audio.addEventListener('pause', () => onStateChange?.(false));
    this.audio.addEventListener('ended', () => onStateChange?.(false));
  }

  static load(src, opts) {
    const c = new AudioClock(src, opts);
    return new Promise((resolve, reject) => {
      c.audio.addEventListener('loadedmetadata', () => resolve(c), { once: true });
      c.audio.addEventListener('error', () => reject(new Error('File audio non leggibile')), { once: true });
    });
  }

  get playing() { return !this.audio.paused && !this.audio.ended; }
  play() { this.audio.play().catch(() => {}); }
  pause() { this.audio.pause(); }
  toggle() { this.playing ? this.pause() : this.play(); }
  seek(t) { this.audio.currentTime = Math.max(0, Math.min(t, this.duration() || t)); this._anchor = null; }
  setRate(r) { this.audio.playbackRate = r; this._anchor = null; }
  getRate() { return this.audio.playbackRate; }
  rates() { return [0.25, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.1, 1.25]; }
  duration() { return Number.isFinite(this.audio.duration) ? this.audio.duration : 0; }

  // currentTime si aggiorna a scatti: si interpola come per YouTube
  getTime() {
    const a = this.audio.currentTime;
    const now = performance.now();
    if (!this.playing) { this._anchor = { a, now }; return a; }
    if (!this._anchor || a !== this._anchor.last) {
      const pred = this._anchor ? this._anchor.a + ((now - this._anchor.now) / 1000) * this.getRate() : a;
      this._anchor = { a: Math.abs(pred - a) < 0.08 ? pred : a, now, last: a };
    }
    return this._anchor.a + ((now - this._anchor.now) / 1000) * this.getRate();
  }

  destroy() { this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); }
}

/**
 * Orologio che può cambiare sorgente mentre si suona (interno → YouTube → file audio) senza perdere
 * posizione, velocità e stato di riproduzione. Così la schermata è subito utilizzabile.
 */
export class SwitchClock {
  constructor(inner) { this.inner = inner; }
  get kind() { return this.inner.kind; }
  get playing() { return this.inner.playing; }
  use(next) {
    const prev = this.inner;
    const t = prev.getTime();
    const rate = prev.getRate();
    const wasPlaying = prev.playing;
    prev.pause?.();
    this.inner = next;
    const nearest = [...next.rates()].sort((a, b) => Math.abs(a - rate) - Math.abs(b - rate))[0] ?? 1;
    next.setRate(nearest);
    next.seek(t);
    if (wasPlaying) next.play();
    if (prev !== next) prev.destroy?.();
  }
  play() { this.inner.play(); }
  pause() { this.inner.pause(); }
  toggle() { this.inner.toggle(); }
  seek(t) { this.inner.seek(t); }
  setRate(r) { this.inner.setRate(r); }
  getRate() { return this.inner.getRate(); }
  rates() { return this.inner.rates(); }
  duration() { return this.inner.duration(); }
  getTime() { return this.inner.getTime(); }
  destroy() { this.inner.destroy(); }
}

export class FreeClock {
  constructor(duration, { onStateChange } = {}) {
    this.kind = 'free';
    this._duration = duration;
    this._rate = 1;
    this._pos = 0;
    this._startedAt = null;
    this._onStateChange = onStateChange;
  }

  get playing() { return this._startedAt !== null; }

  play() {
    if (this.playing) return;
    this._startedAt = performance.now();
    this._onStateChange?.(true);
  }

  pause() {
    if (!this.playing) return;
    this._pos = this.getTime();
    this._startedAt = null;
    this._onStateChange?.(false);
  }

  toggle() { this.playing ? this.pause() : this.play(); }

  seek(t) {
    this._pos = Math.max(0, Math.min(t, this._duration));
    if (this.playing) this._startedAt = performance.now();
  }

  setRate(r) {
    this._pos = this.getTime();
    if (this.playing) this._startedAt = performance.now();
    this._rate = r;
  }

  getRate() { return this._rate; }
  rates() { return [0.25, 0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1, 1.1, 1.25]; }
  duration() { return this._duration; }

  getTime() {
    if (!this.playing) return this._pos;
    const t = this._pos + ((performance.now() - this._startedAt) / 1000) * this._rate;
    if (t >= this._duration) {
      this._pos = this._duration;
      this._startedAt = null;
      this._onStateChange?.(false);
      return this._duration;
    }
    return t;
  }

  destroy() {}
}
