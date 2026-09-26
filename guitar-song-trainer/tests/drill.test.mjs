import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDrillSong, COMMON_CHORDS } from '../js/drill.js';
import { buildTimeline } from '../js/timeline.js';
import { getShape } from '../js/music.js';

test('il brano sintetico copre il minuto con una battuta di conteggio', () => {
  const tl = buildTimeline(buildDrillSong({ chords: ['Em', 'G'], bpm: 60, beatsPerChord: 4, seconds: 60 }));
  assert.equal(tl.bars[0].chords.length, 0, 'prima battuta = conteggio');
  assert.equal(tl.events[0].start, 4);
  assert.ok(tl.end - 4 >= 60);
  assert.deepEqual(tl.events.slice(0, 3).map((e) => e.name), ['Em', 'G', 'Em']);
});

test('tutti gli accordi proposti hanno una diteggiatura', () => {
  for (const c of COMMON_CHORDS) assert.ok(getShape(c), c);
});
