// Stampa la timeline di un brano in JSON (tempi, accordi con le note), per gli strumenti di analisi.
// Uso: node tools/tlinfo.mjs <id>
import { readFileSync } from 'node:fs';
import { buildTimeline } from '../js/timeline.js';
import { chordPitchClasses } from '../js/detect.js';
const root = new URL('../songs/', import.meta.url);
const index = JSON.parse(readFileSync(new URL('index.json', root)));
const e = index.find((x) => x.id === process.argv[2]);
const song = JSON.parse(readFileSync(new URL(e.file, root)));
const tl = buildTimeline(song);
console.log(JSON.stringify({
  bpm: song.bpm, bpb: tl.bpb, offset: song.offset ?? 0, beatDur: tl.beatDur, end: tl.end,
  events: tl.events.map((x) => ({ s: +x.start.toFixed(3), e: +x.end.toFixed(3), n: x.name, pc: chordPitchClasses(x.name)?.notes ?? [] })),
}));
