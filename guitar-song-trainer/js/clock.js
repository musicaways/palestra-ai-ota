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
  static async create(element, videoId, { onStateChange } = {}) {
    const YT = await loadYouTubeApi();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Il video non si è caricato')), 15000);
      const clock = new YouTubeClock();
      clock.player = new YT.Player(element, {
        videoId,
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 1 },
        events: {
          onReady: () => {
            clearTimeout(timer);
            resolve(clock);
          },
          onStateChange: (e) => {
            clock._playing = e.data === YT.PlayerState.PLAYING;
            clock._anchor = null;
            onStateChange?.(clock._playing);
          },
          onError: (e) => {
            clearTimeout(timer);
            reject(new Error('Errore del video YouTube (codice ' + e.data + ')'));
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
