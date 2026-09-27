// Registrazione video mentre suoni: fotocamera frontale o posteriore + audio (microfono e, se attivo,
// la chitarra che passa dall'amplificatore). Le registrazioni restano sul dispositivo (IndexedDB)
// e si possono condividere o scaricare. Base per una futura community fra gli utenti.

const DB = 'gst-media';
const STORE = 'recordings';

function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
  });
}

export const saveRecording = (rec) => tx('readwrite', (s) => s.put(rec));
export const deleteRecording = (id) => tx('readwrite', (s) => s.delete(id));
export async function listRecordings() {
  const all = await tx('readonly', (s) => s.getAll());
  return (all ?? []).sort((a, b) => b.date - a.date);
}

export function pickMime() {
  const types = ['video/mp4;codecs=avc1,mp4a', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return types.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) ?? '';
}

export const extFor = (mime) => (mime.includes('mp4') ? 'mp4' : 'webm');

export function fileName(title, date = Date.now(), mime = 'video/webm') {
  const d = new Date(date);
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  const base = String(title || 'registrazione').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase();
  return `${base || 'registrazione'}-${stamp}.${extFor(mime)}`;
}

export class CameraRecorder {
  constructor() {
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    this.facing = 'user';
  }

  /** Apre la fotocamera. extraAudio: MediaStreamTrack (per esempio la chitarra dall'amplificatore). */
  async open({ facing = this.facing, extraAudio = null } = {}) {
    this.close();
    this.facing = facing;
    const cam = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.camStream = cam;
    // audio: microfono + eventuale chitarra, mixati in un'unica traccia
    const tracks = [...cam.getVideoTracks()];
    if (extraAudio) {
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      if (cam.getAudioTracks().length) ctx.createMediaStreamSource(new MediaStream(cam.getAudioTracks())).connect(dest);
      ctx.createMediaStreamSource(new MediaStream([extraAudio])).connect(dest);
      this.mixCtx = ctx;
      tracks.push(...dest.stream.getAudioTracks());
    } else tracks.push(...cam.getAudioTracks());
    this.stream = new MediaStream(tracks);
    return this.stream;
  }

  start() {
    this.mime = pickMime();
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream, this.mime ? { mimeType: this.mime } : undefined);
    this.recorder.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.startedAt = performance.now();
    this.recorder.start(1000);
  }

  get recording() { return this.recorder?.state === 'recording'; }

  stop() {
    return new Promise((resolve) => {
      if (!this.recorder || this.recorder.state === 'inactive') { resolve(null); return; }
      this.recorder.onstop = () => {
        const type = this.recorder.mimeType || this.mime || 'video/webm';
        resolve({ blob: new Blob(this.chunks, { type }), mime: type, duration: (performance.now() - this.startedAt) / 1000 });
      };
      this.recorder.stop();
    });
  }

  close() {
    this.camStream?.getTracks().forEach((t) => t.stop());
    this.mixCtx?.close();
    this.camStream = this.stream = this.mixCtx = null;
  }
}

// Condivide con le app del telefono (WhatsApp, Instagram…) se possibile, altrimenti scarica il file.
export async function shareOrDownload(rec) {
  const name = fileName(rec.title, rec.date, rec.mime);
  const file = new File([rec.blob], name, { type: rec.mime });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: rec.title, text: `${rec.title} · suonata con Guitar Song Trainer` });
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'aborted';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(rec.blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}
