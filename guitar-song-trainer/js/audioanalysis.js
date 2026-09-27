// Analisi di un file audio dell'utente (nel browser): cromagramma nel tempo e allineamento della
// griglia degli accordi alla musica vera. Parte pura (frames → spostamento) testabile con node.
import { fftMagnitudes, chromaFromSpectrum } from './detect.js';
import { estimateOffsetFromAudio } from './syncmath.js';

/**
 * Cromagramma ogni `hop` secondi.
 * @param samples  Float32Array mono
 * @returns [{ t, chroma, level }]
 */
export function chromaFrames(samples, sampleRate, { hop = 0.1, size = 4096 } = {}) {
  const frames = [];
  const step = Math.round(hop * sampleRate);
  const buf = new Float32Array(size);
  for (let start = 0; start + size <= samples.length; start += step) {
    let e = 0;
    for (let i = 0; i < size; i++) { const v = samples[start + i]; buf[i] = v; e += v * v; }
    const level = Math.sqrt(e / size);
    const mags = fftMagnitudes(buf);
    frames.push({ t: (start + size / 2) / sampleRate, chroma: chromaFromSpectrum(mags, sampleRate / size), level });
  }
  return frames;
}

/**
 * Spostamento (s) da dare ad accordi e testo perché coincidano con il file audio.
 * Prima una ricerca larga (±range s, passo 0,1), poi fine (±0,3 s, passo 0,02).
 * Controlla anche la deriva confrontando inizio e fine del brano.
 */
export function alignToAudio(frames, tl, { range = 20 } = {}) {
  const coarse = estimateOffsetFromAudio(frames, tl, { range, step: 0.1 });
  // nei brani con un giro che si ripete ci sono più picchi quasi uguali, a distanza di un giro:
  // fra quelli praticamente pari si sceglie lo spostamento più piccolo (di solito il file è quasi allineato)
  const near = coarse.scores.filter((x) => x.s >= coarse.score - 0.012);
  const pick = near.length ? near.reduce((a, b) => (Math.abs(b.d) < Math.abs(a.d) ? b : a)).d : coarse.shift;
  const shifted = (d) => frames.map((f) => ({ ...f, t: f.t - d }));
  const fine = estimateOffsetFromAudio(shifted(pick), tl, { range: 0.3, step: 0.02 });
  const shift = Math.round((pick + fine.shift) * 100) / 100;
  // deriva: stima separata sulla prima e sull'ultima metà
  const half = frames.length >> 1;
  const a = estimateOffsetFromAudio(shifted(shift).slice(0, half), tl, { range: 1, step: 0.05 });
  const b = estimateOffsetFromAudio(shifted(shift).slice(half), tl, { range: 1, step: 0.05 });
  return { shift, confidence: coarse.confidence, drift: Math.round((b.shift - a.shift) * 100) / 100 };
}

// Decodifica un file (Blob) in campioni mono a 22 050 Hz.
export async function decodeToMono(blob, rate = 22050) {
  const data = await blob.arrayBuffer();
  const tmp = new (window.AudioContext || window.webkitAudioContext)();
  const buf = await tmp.decodeAudioData(data);
  tmp.close();
  const off = new OfflineAudioContext(1, Math.ceil(buf.duration * rate), rate);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start();
  const out = await off.startRendering();
  return { samples: out.getChannelData(0), sampleRate: rate, duration: buf.duration };
}
