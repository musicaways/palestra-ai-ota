// Trasforma la descrizione di un brano (sezioni, battute, accordi) in una timeline
// con tempi assoluti in secondi, allineata al video.

function parseBar(barDef, beatsPerBar) {
  const items = (Array.isArray(barDef) ? barDef : [barDef]).map((it) => {
    if (typeof it === 'object' && it) return { name: it.chord ?? it.name, beats: it.beats ?? null };
    const [name, beats] = String(it).split(':');
    return { name, beats: beats ? Number(beats) : null };
  });
  const fixed = items.reduce((s, it) => s + (it.beats ?? 0), 0);
  const free = items.filter((it) => it.beats == null).length;
  const each = free ? Math.max(0, beatsPerBar - fixed) / free : 0;
  return items.map((it) => ({ name: it.name, beats: it.beats ?? each }));
}

/**
 * @param song   oggetto brano (vedi songs/README.md)
 * @param opts.offset  correzione di sincronia in secondi (+ = accordi più tardi)
 * @param opts.sync    tempi registrati (secondi) per ogni cambio accordo, anche parziali
 */
export function buildTimeline(song, { offset = 0, sync = null } = {}) {
  const bpb = song.timeSignature?.[0] ?? 4;
  const beatDur = 60 / song.bpm;
  const t0 = (song.offset ?? 0) + offset;
  const bars = [];
  const events = [];
  const rows = [];
  const sections = [];

  song.sections.forEach((sec, si) => {
    const pattern = sec.bars ?? song.patterns?.[sec.pattern];
    if (!pattern) throw new Error(`Sezione "${sec.name}": nessuna battuta definita`);
    const reps = sec.repeat ?? 1;
    const barsPerRow = sec.barsPerRow ?? pattern.length;
    const secInfo = { name: sec.name, index: si, barStart: bars.length, rowStart: rows.length };
    let rowInSection = 0;
    for (let r = 0; r < reps; r++) {
      pattern.forEach((barDef, bi) => {
        if (bi % barsPerRow === 0) {
          rows.push({ index: rows.length, section: si, n: rowInSection++, barStart: bars.length });
        }
        const bar = { index: bars.length, section: si, row: rows.length - 1, chords: [] };
        let beatOffset = 0;
        for (const c of parseBar(barDef, bpb)) {
          if (c.beats <= 0) continue;
          const ev = { index: events.length, name: c.name, bar: bar.index, section: si, beatOffset, beats: c.beats };
          ev.gridStart = t0 + (bar.index * bpb + beatOffset) * beatDur;
          events.push(ev);
          bar.chords.push(ev);
          beatOffset += c.beats;
        }
        bars.push(bar);
      });
    }
    secInfo.barEnd = bars.length;
    secInfo.rowEnd = rows.length;
    sections.push(secInfo);
  });
  rows.forEach((row, i) => {
    row.barEnd = i + 1 < rows.length ? rows[i + 1].barStart : bars.length;
  });

  // Tempi: griglia regolare dal BPM, sostituita dai tempi registrati quando presenti.
  const synced = Array.isArray(sync) ? sync.filter((x) => typeof x === 'number') : [];
  const last = Math.min(synced.length, events.length) - 1;
  const drift = last >= 0 ? synced[last] + offset - events[last].gridStart : 0;
  events.forEach((ev, i) => {
    ev.start = i <= last ? synced[i] + offset : ev.gridStart + drift;
  });
  // Garantisce tempi crescenti anche con registrazioni imprecise.
  for (let i = 1; i < events.length; i++) {
    if (events[i].start <= events[i - 1].start) events[i].start = events[i - 1].start + 0.05;
  }
  events.forEach((ev, i) => {
    ev.end = i + 1 < events.length ? events[i + 1].start : ev.start + ev.beats * beatDur * (last >= 0 ? localRatio(events, i, beatDur) : 1);
  });
  bars.forEach((bar, i) => {
    bar.start = bar.chords[0]?.start ?? (i ? bars[i - 1].end : t0);
    const next = bars[i + 1];
    bar.end = next ? next.chords[0]?.start ?? bar.start + bpb * beatDur : bar.chords.at(-1).end;
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

// Rapporto fra durata reale e durata teorica dell'evento precedente (per stimare l'ultimo).
function localRatio(events, i, beatDur) {
  const prev = events[i - 1];
  if (!prev) return 1;
  return Math.max(0.5, Math.min(2, (prev.end - prev.start) / (prev.beats * beatDur)));
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

// Posizione ritmica: indice della battuta e battito (con decimali) al tempo t.
export function beatAt(tl, t) {
  const bi = barIndexAt(tl, t);
  if (bi < 0) {
    const first = tl.bars[0];
    const beatsBefore = first ? (first.start - t) / tl.beatDur : 0;
    return { bar: -1, beat: -beatsBefore, beatDur: tl.beatDur };
  }
  const bar = tl.bars[bi];
  const len = bar.end - bar.start;
  const beatDur = len > 0 ? len / tl.bpb : tl.beatDur;
  return { bar: bi, beat: (t - bar.start) / beatDur, beatDur };
}
