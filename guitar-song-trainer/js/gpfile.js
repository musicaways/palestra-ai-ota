// File Guitar Pro (.gp3 .gp4 .gp5 .gpx .gp): la parte vera con corda, tasto e tecniche scritte da chi l'ha trascritta.
// La lettura usa alphaTab (https://github.com/CoderLine/alphaTab, licenza MPL-2.0), caricato dal CDN solo quando
// serve (~1 MB); la conversione nel formato delle parti (note in battiti, come i MIDI) è pura e si prova con node.

export const ALPHATAB_URL = 'https://cdn.jsdelivr.net/npm/@coderline/alphatab@1.8.4/dist/alphaTab.core.min.mjs';
const STANDARD = [64, 59, 55, 50, 45, 40]; // alphaTab: dal cantino al basso

// Riconosce un file Guitar Pro dai primi byte (gp3–5: "FICHIER GUITAR PRO", gpx: "BCFS", gp7+: archivio zip).
export function isGuitarPro(bytes, name = '') {
  const d = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const head = String.fromCharCode(...d.slice(0, 32));
  if (head.includes('FICHIER GUITAR PRO') || head.startsWith('BCFS')) return true;
  return head.startsWith('PK') && /\.gp\d?$|\.gpx$/i.test(name || '.gp');
}

// Tecnica di una nota nelle sigle usate dal manico (h p s b v pm x).
function techOf(n, prev) {
  if (n.isDead) return 'x';
  if (n.isHammerPullDestination && prev) return n.fret >= prev.fret ? 'h' : 'p';
  if (n.slideInType || (prev && prev.slideOutType)) return 's';
  if (n.hasBend) return 'b';
  if (n.vibrato) return 'v';
  if (n.isPalmMute) return 'pm';
  return undefined;
}

/**
 * Partitura di alphaTab → { tracks: [{ name, program, capo, frettable, notes: [{ b, bd, pitch, vel, string, fret, tech }] }], bpm, duration }
 * b/bd in battiti (semiminime); string 0 = Mi grave come nel resto dell'app; fret contato dal capotasto del file.
 * `frettable`: accordatura standard o spostata tutta insieme (Mi♭, Re…): corde e tasti del file valgono sul nostro manico.
 */
export function scoreToParsed(score) {
  const q = 960;
  const tracks = [];
  for (const tr of score.tracks) {
    for (const st of tr.staves) {
      if (st.isPercussion || !st.tuning?.length) continue;
      const shift = st.tuning[0] - STANDARD[0];
      const frettable = st.tuning.length === 6 && st.tuning.every((p, i) => p - STANDARD[i] === shift);
      const notes = [];
      const lastOn = new Map(); // corda → { note, slideOutType } ultima nota (legature, hammer-on, slide)
      for (const bar of st.bars) {
        const mb = score.masterBars[bar.index];
        for (const v of bar.voices) {
          for (const beat of v.beats) {
            if (beat.isRest) continue;
            for (const n of beat.notes) {
              const string = st.tuning.length === 6 ? n.string - 1 : null; // alphaTab: 1 = corda più grave
              const prev = lastOn.get(n.string);
              const b = (mb.start + beat.playbackStart) / q;
              const bd = beat.playbackDuration / q;
              // nota legata: allunga quella di prima invece di suonarne un'altra
              if (n.isTieDestination && prev) { prev.note.bd = b + bd - prev.note.b; continue; }
              const note = { b, bd, pitch: n.realValue, vel: Math.min(127, 40 + (n.dynamics ?? 5) * 12), string, fret: n.fret,
                tech: techOf(n, prev && { fret: prev.note.fret, slideOutType: prev.slideOutType }) };
              notes.push(note);
              lastOn.set(n.string, { note, slideOutType: n.slideOutType });
            }
          }
        }
      }
      notes.sort((a, b) => a.b - b.b || a.pitch - b.pitch);
      if (notes.length) tracks.push({ name: tr.name || `Traccia ${tracks.length + 1}`, program: tr.playbackInfo?.program ?? 25, channel: 0, capo: st.capo ?? 0, frettable, notes });
    }
  }
  const bpm = score.tempo || 120;
  const endBeats = Math.max(0, ...tracks.flatMap((t) => t.notes.map((n) => n.b + n.bd)));
  return { tracks, bpm, duration: (endBeats * 60) / bpm, format: 'gp' };
}

let atPromise = null;
export function loadAlphaTab(url = ALPHATAB_URL) {
  atPromise ??= import(/* @vite-ignore */ url).catch((err) => { atPromise = null; throw new Error(`lettore Guitar Pro non raggiungibile (${err.message})`); });
  return atPromise;
}

// Legge un file Guitar Pro (ArrayBuffer/Uint8Array) e lo porta nel formato delle parti.
export async function parseGuitarPro(bytes) {
  const at = await loadAlphaTab();
  const settings = new at.Settings();
  const score = at.importer.ScoreLoader.loadScoreFromBytes(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), settings);
  return scoreToParsed(score);
}
