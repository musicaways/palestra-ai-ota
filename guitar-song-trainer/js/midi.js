// File MIDI (Standard MIDI File, formato 0 e 1): lettura delle tracce, tempi in secondi con la mappa
// dei tempi, e diteggiatura sulla chitarra (corda e tasto per ogni nota). Tutto puro, senza DOM.
// Le note tengono anche la posizione in battiti (b, bd): così la parte si aggancia alla griglia del brano
// e ne segue il tempo reale (rallentamenti, accelerazioni), anche se il file MIDI ha un tempo fisso.
import { template, cosine } from './detect.js';

const OPEN = [40, 45, 50, 55, 59, 64]; // Mi La Re Sol Si Mi (numeri MIDI)
const MAX_FRET = 20;

function readVar(d, p) {
  let v = 0;
  let b;
  do { b = d[p.i++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80);
  return v;
}

const PROGRAMS = ['Pianoforte', 'Pianoforte', 'Pianoforte', 'Pianoforte', 'Piano elettrico', 'Piano elettrico', 'Clavicembalo', 'Clavinet'];
export function programName(p) {
  if (p >= 24 && p <= 31) return ['Chitarra classica', 'Chitarra acustica', 'Chitarra jazz', 'Chitarra elettrica pulita', 'Chitarra stoppata', 'Chitarra distorta (overdrive)', 'Chitarra distorta', 'Armonici'][p - 24];
  if (p >= 32 && p <= 39) return 'Basso';
  if (p >= 40 && p <= 55) return 'Archi';
  if (p < 8) return PROGRAMS[p];
  return `Strumento ${p}`;
}

/**
 * @param buf ArrayBuffer | Uint8Array
 * @returns { tracks: [{ name, program, channel, notes: [{ t, dur, pitch, vel }] }], duration }
 */
export function parseMidi(buf) {
  const d = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const str = (o, n) => String.fromCharCode(...d.slice(o, o + n));
  if (str(0, 4) !== 'MThd') throw new Error('Non è un file MIDI');
  const u16 = (o) => (d[o] << 8) | d[o + 1];
  const u32 = (o) => ((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0;
  const ntrk = u16(10);
  const division = u16(12);
  if (division & 0x8000) throw new Error('MIDI a tempo SMPTE non supportato');
  let off = 8 + u32(4);
  const raw = [];
  const tempos = [{ tick: 0, usPerQ: 500000 }];
  for (let k = 0; k < ntrk && off < d.length; k++) {
    if (str(off, 4) !== 'MTrk') break;
    const len = u32(off + 4);
    const p = { i: off + 8 };
    const end = p.i + len;
    let tick = 0;
    let status = 0;
    const tr = { name: '', program: null, channel: null, events: [] };
    while (p.i < end) {
      tick += readVar(d, p);
      let b = d[p.i];
      if (b & 0x80) { status = b; p.i++; } else b = status; // running status
      const type = status & 0xf0;
      if (status === 0xff) {
        const meta = d[p.i++];
        const l = readVar(d, p);
        if (meta === 0x51) tempos.push({ tick, usPerQ: (d[p.i] << 16) | (d[p.i + 1] << 8) | d[p.i + 2] });
        if (meta === 0x03 && !tr.name) tr.name = new TextDecoder().decode(d.slice(p.i, p.i + l));
        p.i += l;
        if (meta === 0x2f) break;
      } else if (status === 0xf0 || status === 0xf7) {
        p.i += readVar(d, p);
      } else if (type === 0x90 || type === 0x80) {
        const pitch = d[p.i++];
        const vel = d[p.i++];
        tr.channel ??= status & 0x0f;
        tr.events.push({ tick, on: type === 0x90 && vel > 0, pitch, vel, ch: status & 0x0f });
      } else if (type === 0xc0) {
        tr.program ??= d[p.i];
        p.i += 1;
      } else if (type === 0xd0) p.i += 1;
      else p.i += 2; // a0, b0, e0
    }
    raw.push(tr);
    off = end;
  }
  tempos.sort((a, b) => a.tick - b.tick);
  // ticks → secondi con la mappa dei tempi
  const segs = [];
  let sec = 0;
  for (let i = 0; i < tempos.length; i++) {
    const tp = tempos[i];
    if (i > 0) sec += ((tp.tick - tempos[i - 1].tick) * tempos[i - 1].usPerQ) / 1e6 / division;
    segs.push({ tick: tp.tick, sec, usPerQ: tp.usPerQ });
  }
  const toSec = (tick) => {
    let s = segs[0];
    for (const x of segs) if (x.tick <= tick) s = x; else break;
    return s.sec + ((tick - s.tick) * s.usPerQ) / 1e6 / division;
  };
  let duration = 0;
  const tracks = raw.map((tr) => {
    const open = new Map();
    const notes = [];
    for (const e of tr.events) {
      const k = `${e.ch}:${e.pitch}`;
      if (e.on) { if (!open.has(k)) open.set(k, e); continue; }
      const st = open.get(k);
      if (!st) continue;
      open.delete(k);
      const t = toSec(st.tick);
      const t1 = toSec(e.tick);
      notes.push({ t, dur: Math.max(0.03, t1 - t), pitch: e.pitch, vel: st.vel, b: st.tick / division, bd: (e.tick - st.tick) / division });
      duration = Math.max(duration, t1);
    }
    notes.sort((a, b) => a.t - b.t || a.pitch - b.pitch);
    return { name: tr.name.trim(), program: tr.program ?? 0, channel: tr.channel, notes };
  }).filter((t) => t.notes.length && t.channel !== 9); // la batteria (canale 10) non serve
  const first = [...tempos].reverse().find((x) => x.tick === 0) ?? tempos[0];
  const bpm = Math.round(60e6 / first.usPerQ);
  return { tracks, duration, bpm };
}

// Traccia di chitarra più probabile: programma 24–31, oppure nome che contiene "guitar/chitarra".
export function guessGuitarTrack(tracks) {
  const score = (t) => (t.program >= 24 && t.program <= 31 ? 10 : 0) + (/guit|chitarr|gtr/i.test(t.name) ? 8 : 0)
    - (/bass|basso/i.test(t.name) || (t.program >= 32 && t.program <= 39) ? 20 : 0) + Math.min(5, t.notes.length / 200);
  return tracks.reduce((best, t, i) => (score(t) > score(tracks[best]) ? i : best), 0);
}

/**
 * Diteggiatura: a ogni nota una corda e un tasto. Le note insieme vanno su corde diverse; fra un gruppo
 * e il successivo si preferisce restare nella stessa posizione della mano e sui tasti bassi.
 * @returns [{ t, dur, string, fret, pitch }]
 */
export function fingerNotes(notes, { capo = 0 } = {}) {
  const out = [];
  let hand = 3; // tasto medio della mano sinistra
  for (let i = 0; i < notes.length;) {
    let j = i;
    while (j < notes.length && notes[j].t - notes[i].t < 0.03) j++;
    const group = notes.slice(i, j).sort((a, b) => a.pitch - b.pitch).slice(0, 6);
    const choice = assign(group, hand, capo);
    if (choice) {
      choice.forEach((c, k) => out.push({ t: group[k].t, dur: group[k].dur, string: c.s, fret: c.f, pitch: group[k].pitch, vel: group[k].vel }));
      const fretted = choice.filter((c) => c.f > 0).map((c) => c.f);
      if (fretted.length) hand = hand * 0.4 + (fretted.reduce((a, b) => a + b, 0) / fretted.length) * 0.6;
    }
    i = j;
  }
  return out;
}

// Con il capotasto i tasti sono contati dal capotasto (0 = corda "a vuoto" sul capotasto).
function positions(pitch, capo = 0) {
  const out = [];
  for (let s = 0; s < 6; s++) {
    const f = pitch - OPEN[s] - capo;
    if (f >= 0 && f + capo <= MAX_FRET) out.push({ s, f });
  }
  return out;
}

function assign(group, hand, capo = 0) {
  let best = null;
  let bestCost = Infinity;
  const cur = [];
  const used = new Set();
  const rec = (k) => {
    if (k === group.length) {
      const fr = cur.filter((c) => c.f > 0).map((c) => c.f);
      const span = fr.length ? Math.max(...fr) - Math.min(...fr) : 0;
      if (span > 4) return;
      const cost = cur.reduce((a, c) => a + (c.f === 0 ? 0.5 : Math.abs(c.f - hand) + c.f * 0.08), 0) + span * 0.5;
      if (cost < bestCost) { bestCost = cost; best = cur.map((c) => ({ ...c })); }
      return;
    }
    for (const p of positions(group[k].pitch, capo)) {
      if (used.has(p.s)) continue;
      used.add(p.s); cur.push(p);
      rec(k + 1);
      cur.pop(); used.delete(p.s);
    }
  };
  rec(0);
  return best;
}

// Cromagramma di una parte MIDI a intervalli regolari (per allinearla al brano).
export function midiChromaFrames(notes, { hop = 0.2, duration } = {}) {
  const end = duration ?? Math.max(0, ...notes.map((n) => n.t + n.dur));
  const frames = [];
  for (let t = 0; t < end; t += hop) {
    const chroma = new Float32Array(12);
    let on = 0;
    for (const n of notes) {
      if (n.t > t + hop) break;
      if (n.t + n.dur < t) continue;
      chroma[n.pitch % 12] += 1;
      on++;
    }
    frames.push({ t: t + hop / 2, chroma, level: on ? 0.1 : 0 });
  }
  return frames;
}

// Battito del brano → secondi, seguendo le battute vere della timeline (estrapola prima e dopo).
function songBeatTime(tl, sb) {
  const bars = tl.bars;
  const bpb = tl.bpb;
  let i = Math.floor(sb / bpb);
  if (i < 0) i = 0;
  if (i >= bars.length) i = bars.length - 1;
  const bar = bars[i];
  return bar.start + (sb / bpb - i) * (bar.end - bar.start);
}

// Accordo (nome che suona) su ogni battito del brano.
export function beatChords(tl) {
  const out = [];
  for (const bar of tl.bars) {
    for (let j = 0; j < tl.bpb; j++) {
      let ev = bar.held ?? null;
      for (const c of bar.chords ?? []) if (c.beatOffset <= j) ev = c;
      out.push(ev ? ev.sounding ?? ev.name : null);
    }
  }
  return out;
}

/**
 * Dove cade la parte MIDI nel brano: si prova ogni spostamento in battiti (e il tempo doppio o dimezzato)
 * e si sceglie quello in cui le note suonano gli accordi della griglia.
 * @param notes note MIDI con b/bd (tutte le tracce armoniche, per avere l'armonia completa)
 * @returns { shift, scale, score, confidence } battito del brano = b · scale + shift
 */
export function alignMidi(notes, tl, { transpose = 0 } = {}) {
  const chords = beatChords(tl);
  const tpls = chords.map((n) => (n ? template(n) : null));
  let best = { shift: 0, scale: 1, score: 0, confidence: 0 };
  const all = [];
  const cands = [];
  for (const scale of [1, 2, 0.5]) {
    // cromagramma della parte per battito (pesato con la durata)
    const nb = Math.ceil(Math.max(0, ...notes.map((n) => (n.b + n.bd) * scale))) + 1;
    const mc = Array.from({ length: nb }, () => new Float32Array(12));
    for (const n of notes) {
      const a = n.b * scale;
      const e = (n.b + Math.max(n.bd, 0.1)) * scale;
      const pc = (((n.pitch + transpose) % 12) + 12) % 12;
      for (let k = Math.floor(a); k < Math.ceil(e) && k < nb; k++) mc[k][pc] += Math.min(e, k + 1) - Math.max(a, k);
    }
    const active = [];
    for (let k = 0; k < nb; k++) if (mc[k].some((v) => v > 0)) active.push(k);
    if (active.length < 8) continue;
    for (let shift = -nb; shift <= chords.length; shift++) {
      let sum = 0;
      let cnt = 0;
      for (const k of active) {
        const tp = tpls[k + shift];
        if (!tp) continue;
        sum += cosine(mc[k], tp);
        cnt++;
      }
      // pochi battiti in comune non bastano: la parte deve stare dentro il brano
      if (cnt < active.length * 0.6) continue;
      const s = sum / cnt;
      all.push(s);
      cands.push({ shift, scale, score: s, cnt });
    }
  }
  // un giro che si ripete dà più picchi quasi pari: si preferisce la parte che copre più battiti del brano,
  // poi lo spostamento più piccolo
  const top = Math.max(0, ...cands.map((c) => c.score));
  const near = cands.filter((c) => c.score >= top - 0.01)
    .sort((a, b) => b.cnt - a.cnt || Math.abs(a.shift) - Math.abs(b.shift) || (a.scale === 1 ? -1 : 1));
  if (near.length) best = { shift: near[0].shift, scale: near[0].scale, score: near[0].score, confidence: 0 };
  if (all.length) {
    all.sort((a, b) => a - b);
    const median = all[all.length >> 1];
    best.confidence = Math.max(0, Math.min(1, (best.score - median) / 0.2));
  }
  best.score = Math.round(best.score * 1000) / 1000;
  return best;
}

// Note MIDI portate sui tempi del brano (seguono le battute vere), con trasposizione in semitoni.
export function placeMidi(notes, tl, { shift = 0, scale = 1, transpose = 0 } = {}) {
  return notes.map((n) => {
    const sb = n.b * scale + shift;
    const t = songBeatTime(tl, sb);
    const t1 = songBeatTime(tl, sb + n.bd * scale);
    return { t, dur: Math.max(0.05, t1 - t), pitch: n.pitch + transpose, vel: n.vel };
  }).sort((a, b) => a.t - b.t || a.pitch - b.pitch);
}
