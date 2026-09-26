// File di prova per i test nel browser: una parte MIDI e un file audio WAV ricavati dagli accordi di un brano.
// Niente testo: solo accordi e tempi della griglia.
import { buildTimeline } from '../js/timeline.js';
import { chordPitchClasses } from '../js/detect.js';
import { beatChords } from '../js/midi.js';

const vlq = (n) => { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };
const chunk = (id, bytes) => [...id].map((c) => c.charCodeAt(0)).concat([bytes.length >>> 24, (bytes.length >> 16) & 255, (bytes.length >> 8) & 255, bytes.length & 255], bytes);

// Voci dell'accordo fra Mi2 (40) e Mi4 (64): basso + tre note sopra.
function voicing(name) {
  const pc = chordPitchClasses(name);
  if (!pc) return [];
  const bass = 40 + ((pc.root - 4 + 12) % 12);
  const up = pc.notes.map((n) => 52 + ((n - 4 + 12) % 12)).sort((a, b) => a - b);
  return [bass, ...up.slice(0, 3)];
}

/**
 * MIDI (formato 1, 480 tick per battito) con una traccia "Guitar" che arpeggia gli accordi del brano
 * battito per battito, a partire dalla battuta `fromBar` del brano (il file comincia lì).
 */
export function midiForSong(song, { fromBar = 1, bpm = song.bpm } = {}) {
  const tl = buildTimeline(song);
  const chords = beatChords(tl).slice(fromBar * tl.bpb);
  const us = Math.round(60e6 / bpm);
  const tempo = chunk('MTrk', [0, 0xff, 0x51, 3, us >> 16, (us >> 8) & 255, us & 255, 0, 0xff, 0x2f, 0]);
  const ev = [0, 0xff, 0x03, 6, ...[...'Guitar'].map((c) => c.charCodeAt(0)), 0, 0xc0, 25];
  let pending = 0;
  chords.forEach((name, i) => {
    const v = voicing(name);
    if (!v.length) { pending += 480; return; }
    const p = v[i % tl.bpb === 0 ? 0 : 1 + (i % 3)];
    ev.push(...vlq(pending), 0x90, p, 90, ...vlq(440), 0x80, p, 0);
    pending = 40;
  });
  ev.push(0, 0xff, 0x2f, 0);
  const trk = chunk('MTrk', ev);
  return Buffer.from([...chunk('MThd', [0, 1, 0, 2, 480 >> 8, 480 & 255]), ...tempo, ...trk]);
}

/**
 * WAV mono 16 bit con gli accordi del brano suonati da onde sinusoidali, spostati di `delay` secondi
 * rispetto alla griglia (come un file audio che parte prima o dopo del video).
 */
export function wavForSong(song, { delay = 0, seconds = 60, rate = 22050 } = {}) {
  const tl = buildTimeline(song);
  const n = Math.floor(seconds * rate);
  const pcm = new Int16Array(n);
  for (const e of tl.events) {
    const v = voicing(e.name);
    const a = Math.max(0, Math.floor((e.start + delay) * rate));
    const b = Math.min(n, Math.floor((e.end + delay) * rate));
    for (let i = a; i < b; i++) {
      const tt = (i - a) / rate;
      let s = 0;
      for (const p of v) s += Math.sin(2 * Math.PI * 440 * 2 ** ((p - 69) / 12) * tt);
      pcm[i] += Math.round(s * 3000 * Math.exp(-tt * 0.8));
    }
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + n * 2, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(n * 2, 40);
  return Buffer.concat([head, Buffer.from(pcm.buffer)]);
}
