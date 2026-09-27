// Modalità "Aspetta" (idea presa da StringTheory, gioco open source per imparare la chitarra): il brano si ferma a
// ogni accordo, o a ogni nota della parte vera, finché il microfono non sente che l'hai suonato giusto.
// Parte pura: bersagli e verifica; il player mette in pausa e riparte.
import { template, cosine } from './detect.js';

const OPEN = [40, 45, 50, 55, 59, 64];
const GROUP = 0.04; // note entro 40 ms = suonate insieme

// Altezza MIDI di una nota della parte: quella del file, oppure dalla corda e dal tasto (col capotasto).
// (i tasti delle parti sono contati dal capotasto: 0 = corda libera sul capotasto)
export const notePitch = (n, capo = 0) => n.pitch ?? OPEN[n.string] + capo + n.fret;

/**
 * Bersagli in ordine di tempo: un accordo per cambio (parte ritmica) oppure una nota o un gruppo di note (parte a note).
 * @returns [{ key, t, kind: 'chord'|'note'|'notes', name?, pitches? }]
 */
export function waitTargets(tl, { capo = 0 } = {}) {
  if (tl.notes?.length) {
    const out = [];
    for (let i = 0; i < tl.notes.length;) {
      let j = i;
      while (j < tl.notes.length && tl.notes[j].t - tl.notes[i].t < GROUP) j++;
      const pitches = tl.notes.slice(i, j).map((n) => notePitch(n, capo));
      out.push({ key: `n${i}`, t: tl.notes[i].t, kind: pitches.length > 1 ? 'notes' : 'note', pitches });
      i = j;
    }
    return out;
  }
  return tl.events.map((ev, i) => ({ key: `c${i}`, t: ev.start, kind: 'chord', name: ev.sounding ?? ev.name }));
}

const midiOf = (f) => 69 + 12 * Math.log2(f / 440);

/**
 * Il suono ascoltato corrisponde al bersaglio?
 * @param frame { chroma, level, pitch (Hz o null) }
 */
export function hitsTarget(target, frame, { matchChord = null } = {}) {
  if (!frame || frame.level < 0.012) return false;
  if (target.kind === 'chord') return matchChord ? matchChord(frame.chroma, target.name).hit : cosine(frame.chroma, template(target.name) ?? new Float32Array(12)) >= 0.7;
  if (target.kind === 'note') {
    if (!frame.pitch) return false;
    // la nota giusta, perdonando l'ottava (il microfono spesso sente l'armonica)
    const d = Math.abs(midiOf(frame.pitch) - target.pitches[0]);
    return Math.abs(d - 12 * Math.round(d / 12)) < 0.5;
  }
  // più note insieme: il cromagramma deve contenere le loro classi di altezza
  const tp = new Float32Array(12);
  for (const p of target.pitches) tp[((p % 12) + 12) % 12] = 1;
  return cosine(frame.chroma, tp) >= 0.7;
}

// Prossimo bersaglio non ancora superato a partire dal tempo t (−50 ms di tolleranza).
export function nextTarget(targets, t, cleared) {
  for (const x of targets) if (x.t >= t - 0.05 && !cleared.has(x.key)) return x;
  return null;
}
