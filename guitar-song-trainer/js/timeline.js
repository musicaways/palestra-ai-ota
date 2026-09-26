// Trasforma la descrizione di un brano (sezioni, battute, accordi) in una timeline
// con tempi assoluti in secondi, allineata al video.

const HOLD = new Set(['%', '-', '']);

// Una battuta: "Gm" | ["D7sus4", "D7"] | ["F5:3", "C5:1"] | "%" (continua l'accordo precedente)
function parseBar(barDef, beatsPerBar) {
  const raw = Array.isArray(barDef) ? barDef : [barDef];
  if (raw.length === 1 && HOLD.has(String(raw[0]).trim())) return [];
  const items = raw.map((it) => {
    if (typeof it === 'object' && it) return { name: it.chord ?? it.name, beats: it.beats ?? null };
    const [name, beats] = String(it).split(':');
    return { name: name.trim(), beats: beats ? Number(beats) : null };
  });
  const fixed = items.reduce((s, it) => s + (it.beats ?? 0), 0);
  const free = items.filter((it) => it.beats == null).length;
  const each = free ? Math.max(0, beatsPerBar - fixed) / free : 0;
  return items.map((it) => ({ name: it.name, beats: it.beats ?? each }));
}

/**
 * @param song   oggetto brano (vedi README)
 * @param opts.offset  correzione di sincronia in secondi (+ = accordi più tardi)
 * @param opts.sync    tempi registrati (secondi) per ogni cambio accordo, anche parziali
 */
export function buildTimeline(song, { offset = 0, sync = null } = {}) {
  const bpb = song.timeSignature?.[0] ?? 4;
  const beatDur = 60 / song.bpm;
  const barDur = bpb * beatDur;
  const t0 = (song.offset ?? 0) + offset;
  const bars = [];
  const events = [];
  const rows = [];
  const sections = [];
  let held = null;

  song.sections.forEach((sec, si) => {
    const pattern = sec.bars ?? song.patterns?.[sec.pattern];
    if (!pattern) throw new Error(`Sezione "${sec.name}": nessuna battuta definita`);
    const reps = sec.repeat ?? 1;
    const barsPerRow = sec.barsPerRow ?? song.barsPerRow ?? pattern.length;
    const secInfo = { name: sec.name, index: si, barStart: bars.length, rowStart: rows.length };
    let rowInSection = 0;
    let barInSection = 0;
    for (let r = 0; r < reps; r++) {
      for (const barDef of pattern) {
        if (barInSection++ % barsPerRow === 0) {
          rows.push({ index: rows.length, section: si, n: rowInSection++, barStart: bars.length });
        }
        const bar = { index: bars.length, section: si, row: rows.length - 1, chords: [], held: null };
        bar.gridStart = t0 + bar.index * barDur;
        let beatOffset = 0;
        for (const c of parseBar(barDef, bpb)) {
          if (c.beats <= 0) continue;
          const ev = { index: events.length, name: c.name, bar: bar.index, section: si, beatOffset, beats: c.beats };
          ev.gridStart = bar.gridStart + beatOffset * beatDur;
          events.push(ev);
          bar.chords.push(ev);
          beatOffset += c.beats;
          held = ev;
        }
        if (!bar.chords.length) {
          bar.held = held;
          if (held) held.beats += bpb;
        }
        bars.push(bar);
      }
    }
    secInfo.barEnd = bars.length;
    secInfo.rowEnd = rows.length;
    sections.push(secInfo);
  });
  rows.forEach((row, i) => {
    row.barEnd = i + 1 < rows.length ? rows[i + 1].barStart : bars.length;
  });
  const gridEnd = t0 + bars.length * barDur;

  // Tempi reali: la griglia regolare del BPM viene "deformata" in modo continuo
  // per passare dai tempi registrati (tap) quando ci sono.
  const synced = Array.isArray(sync) ? sync.filter((x) => typeof x === 'number') : [];
  const anchors = events.slice(0, synced.length).map((ev, i) => [ev.gridStart, synced[i] + offset]);
  for (let i = 1; i < anchors.length; i++) {
    if (anchors[i][1] <= anchors[i - 1][1]) anchors[i][1] = anchors[i - 1][1] + 0.05;
  }
  const warp = (g) => {
    if (!anchors.length) return g;
    if (g <= anchors[0][0]) return g + (anchors[0][1] - anchors[0][0]);
    const last = anchors[anchors.length - 1];
    if (g >= last[0]) return g + (last[1] - last[0]);
    let lo = 0;
    let hi = anchors.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (anchors[mid][0] <= g) lo = mid; else hi = mid;
    }
    const [g0, r0] = anchors[lo];
    const [g1, r1] = anchors[hi];
    return r0 + ((g - g0) / (g1 - g0)) * (r1 - r0);
  };

  events.forEach((ev) => { ev.start = warp(ev.gridStart); });
  bars.forEach((bar, i) => {
    bar.start = warp(bar.gridStart);
    bar.end = warp(i + 1 < bars.length ? bars[i + 1].gridStart : gridEnd);
  });
  events.forEach((ev, i) => {
    ev.end = i + 1 < events.length ? events[i + 1].start : bars.at(-1).end;
  });
  const span = (a, b) => ({ start: bars[a]?.start ?? 0, end: bars[b - 1]?.end ?? 0 });
  rows.forEach((row) => Object.assign(row, span(row.barStart, row.barEnd)));
  sections.forEach((sec) => Object.assign(sec, span(sec.barStart, sec.barEnd)));

  return {
    bpb,
    beatDur,
    bars,
    events,
    rows,
    sections,
    end: bars.at(-1)?.end ?? 0,
    strum: song.strum ?? null,
  };
}

function lastIndexAtOrBefore(list, t) {
  let lo = 0;
  let hi = list.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].start <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

export const eventIndexAt = (tl, t) => lastIndexAtOrBefore(tl.events, t);
export const barIndexAt = (tl, t) => lastIndexAtOrBefore(tl.bars, t);
export const sectionAt = (tl, t) => lastIndexAtOrBefore(tl.sections, t);

// Posizione ritmica: indice della battuta e battito (con decimali) al tempo t.
export function beatAt(tl, t) {
  const bi = barIndexAt(tl, t);
  if (bi < 0 || t >= tl.end) {
    const first = tl.bars[0];
    const beatsBefore = first && bi < 0 ? (first.start - t) / tl.beatDur : 0;
    return { bar: bi < 0 ? -1 : bi, beat: bi < 0 ? -beatsBefore : NaN, beatDur: tl.beatDur };
  }
  const bar = tl.bars[bi];
  const len = bar.end - bar.start;
  const beatDur = len > 0 ? len / tl.bpb : tl.beatDur;
  return { bar: bi, beat: (t - bar.start) / beatDur, beatDur };
}

// Tempi di tutti i battiti fra a e b (per disegnare la griglia ritmica).
export function beatsBetween(tl, a, b) {
  const out = [];
  let i = Math.max(0, barIndexAt(tl, a));
  for (; i < tl.bars.length; i++) {
    const bar = tl.bars[i];
    if (bar.start > b) break;
    const bd = (bar.end - bar.start) / tl.bpb;
    for (let k = 0; k < tl.bpb; k++) {
      const t = bar.start + k * bd;
      if (t >= a && t <= b) out.push({ t, downbeat: k === 0 });
    }
  }
  return out;
}
