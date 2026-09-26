import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../songs/', import.meta.url);
const index = JSON.parse(readFileSync(new URL('index.json', root)));

test('catalogo: indice coerente con i file dei brani', () => {
  const ids = new Set();
  const videos = new Map();
  for (const e of index) {
    assert.ok(!ids.has(e.id), `id doppio ${e.id}`); ids.add(e.id);
    assert.ok(existsSync(new URL(e.file, root)), `file mancante ${e.file}`);
    const s = JSON.parse(readFileSync(new URL(e.file, root)));
    assert.equal(e.youtubeId, s.youtubeId, `${e.id}: video diverso fra indice e brano`);
    assert.equal(e.title, s.title, `${e.id}: titolo`);
    assert.ok(s.lyricsSource?.lrclibId || s.lyricsSource?.query || true, `${e.id}: fonte del testo`);
    assert.ok(!videos.has(s.youtubeId), `${e.id}: stesso video di ${videos.get(s.youtubeId)}`);
    videos.set(s.youtubeId, e.id);
    // niente testo delle canzoni nei file: solo accordi, tempi e metadati
    for (const k of ['lyrics', 'syncedLyrics', 'plainLyrics']) assert.ok(!(k in s), `${e.id}: campo ${k} vietato`);
    if (s.warp) {
      for (let i = 1; i < s.warp.length; i++) assert.ok(s.warp[i][0] > s.warp[i - 1][0] && s.warp[i][1] > s.warp[i - 1][1], `${e.id}: ancore non in ordine`);
    }
  }
  assert.ok(index.length >= 500, `${index.length} brani`);
});
