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
// Cromagramma della parte per battito del brano (pesato con la durata delle note).
function beatChroma(notes, scale, transpose) {
  const nb = Math.ceil(Math.max(0, ...notes.map((n) => (n.b + n.bd) * scale))) + 1;
  const mc = Array.from({ length: nb }, () => new Float32Array(12));
  for (const n of notes) {
    const a = n.b * scale;
    const e = (n.b + Math.max(n.bd, 0.1)) * scale;
    const pc = (((n.pitch + transpose) % 12) + 12) % 12;
    for (let k = Math.floor(a); k < Math.ceil(e) && k < nb; k++) mc[k][pc] += Math.min(e, k + 1) - Math.max(a, k);
  }
  const active = mc.map((v) => v.some((x) => x > 0));
  return { nb, mc, active };
}

export function alignMidi(notes, tl, { transpose = 0, scales = [1, 2, 0.5] } = {}) {
  const chords = beatChords(tl);
  const tpls = chords.map((n) => (n ? template(n) : null));
  let best = { shift: 0, scale: 1, score: 0, confidence: 0 };
  const all = [];
  const cands = [];
  for (const scale of scales) {
    const { nb, mc, active: act } = beatChroma(notes, scale, transpose);
    const active = [];
    for (let k = 0; k < nb; k++) if (act[k]) active.push(k);
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
      cands.push({ shift, scale, score: s, cnt, inside: cnt / active.length });
    }
  }
  // un giro che si ripete dà più picchi quasi pari: si preferisce la parte che copre più battiti del brano,
  // poi lo spostamento più piccolo
  const top = Math.max(0, ...cands.map((c) => c.score));
  const near = cands.filter((c) => c.score >= top - 0.01)
    .sort((a, b) => b.cnt - a.cnt || Math.abs(a.shift) - Math.abs(b.shift) || (a.scale === 1 ? -1 : 1));
  if (near.length) best = { shift: near[0].shift, scale: near[0].scale, score: near[0].score, inside: near[0].inside, confidence: 0 };
  if (all.length) {
    all.sort((a, b) => a - b);
    const median = all[all.length >> 1];
    best.confidence = Math.max(0, Math.min(1, (best.score - median) / 0.2));
  }
  best.score = Math.round(best.score * 1000) / 1000;
  return best;
}

/**
 * Aggancio a sezioni: ogni battito della parte va su un battito del brano; si procede in parallelo e si può
 * saltare (all'inizio di una battuta del brano) quando il file ha ripetizioni o parti in più o in meno, oppure
 * lasciare fuori battiti del file che nel brano non ci sono. Programmazione dinamica su battiti × battiti.
 * @returns { map: Int32Array (battito del file → battito del brano, −1 = fuori), score, mapped }
 */
export function alignMidiPath(notes, tl, { scale = 1, transpose = 0, jump = 3, skip = 0.6, dist = 0.01 } = {}) {
  const chords = beatChords(tl);
  const tpls = chords.map((n) => (n ? template(n) : null));
  const { nb: K, mc, active } = beatChroma(notes, scale, transpose);
  const J = chords.length;
  const bpb = tl.bpb;
  const sim = (k, j) => (!active[k] ? 0.5 : tpls[j] ? cosine(mc[k], tpls[j]) : 0.3);
  // D[j]: battito del file sul battito j del brano; V[j]: battito del file lasciato fuori, brano fermo a j
  // backD ≥ 0: da D[j'] (avanti o salto); backD < 0: da V[−1−backD]. backV: 0 da V[j], 1 da D[j].
  const backD = new Int32Array(K * J);
  const backV = new Uint8Array(K * J);
  let D = new Float64Array(J);
  let V = new Float64Array(J);
  let nD = new Float64Array(J);
  let nV = new Float64Array(J);
  // il file di solito comincia con il brano: partire più avanti costa (come un salto in avanti)
  for (let j = 0; j < J; j++) { D[j] = 1 - sim(0, j) + dist * j; V[j] = skip + jump / 2; backD[j] = j; backV[j] = 0; }
  const jt = new Float64Array(J);
  const ja = new Int32Array(J);
  for (let k = 1; k < K; k++) {
    // salto verso j: min su j' di D[j'] + dist·|j − (j'+1)| (trasformata della distanza in due passate)
    for (let j = 0; j < J; j++) { jt[j] = j > 0 ? D[j - 1] : Infinity; ja[j] = j - 1; }
    for (let j = 1; j < J; j++) if (jt[j - 1] + dist < jt[j]) { jt[j] = jt[j - 1] + dist; ja[j] = ja[j - 1]; }
    for (let j = J - 2; j >= 0; j--) if (jt[j + 1] + dist < jt[j]) { jt[j] = jt[j + 1] + dist; ja[j] = ja[j + 1]; }
    // l'ultimo battito del brano verso l'inizio (salto all'indietro dalla fine)
    for (let j = 0; j < J; j++) {
      let v = j > 0 ? D[j - 1] : Infinity;
      let src = j - 1;
      if (j > 0 && V[j - 1] < v) { v = V[j - 1]; src = -1 - (j - 1); }
      if (j % bpb === 0 && jt[j] + jump < v) { v = jt[j] + jump; src = ja[j]; }
      nD[j] = 1 - sim(k, j) + v;
      backD[k * J + j] = src;
      if (V[j] <= D[j] + jump / 2) { nV[j] = V[j] + skip; backV[k * J + j] = 0; } else { nV[j] = D[j] + jump / 2 + skip; backV[k * J + j] = 1; }
    }
    [D, nD] = [nD, D];
    [V, nV] = [nV, V];
  }
  let end = 0;
  let inV = false;
  let best = Infinity;
  for (let j = 0; j < J; j++) {
    if (D[j] < best) { best = D[j]; end = j; inV = false; }
    if (V[j] < best) { best = V[j]; end = j; inV = true; }
  }
  const map = new Int32Array(K).fill(-1);
  let j = end;
  for (let k = K - 1; k >= 0; k--) {
    if (inV) {
      map[k] = -1;
      if (k > 0 && backV[k * J + j] === 1) inV = false;
    } else {
      map[k] = j;
      if (k > 0) {
        const src = backD[k * J + j];
        if (src < 0) { j = -1 - src; inV = true; } else j = src;
      }
    }
  }
  let sum = 0;
  let cnt = 0;
  let act = 0;
  for (let k = 0; k < K; k++) {
    if (!active[k]) continue;
    act++;
    if (map[k] >= 0 && tpls[map[k]]) { sum += cosine(mc[k], tpls[map[k]]); cnt++; }
  }
  return { map, score: cnt ? Math.round((sum / cnt) * 1000) / 1000 : 0, mapped: act ? cnt / act : 0 };
}

/**
 * Aggancio completo: tempo (normale, doppio, dimezzato), tonalità del file (0..11 semitoni) e poi, se serve,
 * aggancio a sezioni. `transpose` sono i semitoni da aggiungere al file per suonare nella tonalità del brano.
 */
// Tempo del file rispetto al brano: se il BPM scritto nel file è circa uguale, doppio o metà di quello del brano,
// la scala giusta è quella (i MIDI trovati in rete a volte sono scritti a tempo doppio).
export function scalesFor(midiBpm, songBpm) {
  const r = midiBpm && songBpm ? midiBpm / songBpm : 0;
  if (r >= 0.75 && r <= 1.35) return [1];
  if (r >= 1.6 && r <= 2.5) return [0.5, 1];
  if (r >= 0.4 && r <= 0.62) return [2, 1];
  return [1, 2, 0.5];
}

export function alignMidiFull(notes, tl, { bpm = 0 } = {}) {
  const scales = scalesFor(bpm, tl.bpm ?? 60 / (tl.beatDur || 0.5));
  let g = { ...alignMidi(notes, tl, { scales }), transpose: 0 };
  // tonalità candidate: dal profilo delle note del file contro quello degli accordi (poi la prova vera)
  const prof = new Float32Array(12);
  for (const n of notes) prof[((n.pitch % 12) + 12) % 12] += n.bd;
  const songProf = new Float32Array(12);
  for (const ev of tl.events) {
    const tp = template(ev.sounding ?? ev.name);
    if (tp) for (let i = 0; i < 12; i++) songProf[i] += tp[i] * (ev.end - ev.start);
  }
  const rot = (t) => { let d = 0; for (let i = 0; i < 12; i++) d += prof[i] * songProf[(i + t) % 12]; return d; };
  const cands = Array.from({ length: 11 }, (_, i) => i + 1).sort((a, b) => rot(b) - rot(a)).slice(0, 3);
  for (const t of cands) {
    const r = alignMidi(notes, tl, { transpose: t, scales });
    if (r.score > g.score + 0.05) g = { ...r, transpose: t };
  }
  const path = alignMidiPath(notes, tl, { scale: g.scale, transpose: g.transpose });
  // si confronta anche quanta parte del file finisce dentro il brano (uno spostamento unico ne lascia fuori)
  // un file che combacia bene tutto di fila resta intero (è la stessa struttura del disco); il taglio a sezioni
  // solo quando uno spostamento unico non basta
  const wholeOk = g.score >= 0.65 && (g.inside ?? 1) >= 0.85;
  if (!wholeOk && path.mapped >= 0.5 && path.score * path.mapped > g.score * (g.inside ?? 1) + 0.02) {
    return { mode: 'path', map: Array.from(path.map), scale: g.scale, transpose: g.transpose, score: path.score, confidence: Math.min(1, g.confidence + (path.score - g.score) * 2), shift: g.shift };
  }
  return { mode: 'shift', ...g };
}

// Note MIDI portate sui tempi del brano (seguono le battute vere), con trasposizione in semitoni.
// Con `map` (aggancio a sezioni) ogni battito del file ha il suo battito nel brano; `nudge` sposta tutto di N battiti.
export function placeMidi(notes, tl, { shift = 0, scale = 1, transpose = 0, map = null, nudge = 0 } = {}) {
  const out = [];
  for (const n of notes) {
    const x = n.b * scale;
    let sb;
    if (map) {
      const k = Math.floor(x);
      if (k < 0 || k >= map.length || map[k] < 0) continue; // parte del file che nel brano non c'è
      sb = map[k] + (x - k) + nudge;
    } else sb = x + shift + nudge;
    const t = songBeatTime(tl, sb);
    const t1 = songBeatTime(tl, sb + n.bd * scale);
    out.push({ t, dur: Math.max(0.05, t1 - t), pitch: n.pitch + transpose, vel: n.vel });
  }
  return out.sort((a, b) => a.t - b.t || a.pitch - b.pitch);
}
