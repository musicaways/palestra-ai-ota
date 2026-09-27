import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
const S = await import('../js/setlists.js');
const { mainGenre, decadeOf } = await import('../js/library.js').catch(() => ({}));
const { chordInfo, ROOTS, QUALITIES } = await import('../js/chords.js').catch(() => ({}));

beforeEach(() => mem.clear());

test('scalette: crea, aggiungi, togli, ordina, prossimo', () => {
  const l = S.createSetlist('Serata', ['a']);
  assert.equal(S.toggleInSetlist(l.id, 'b'), true);
  assert.equal(S.toggleInSetlist(l.id, 'c'), true);
  assert.deepEqual(S.setlistById(l.id).songs, ['a', 'b', 'c']);
  S.moveInSetlist(l.id, 'c', -1);
  assert.deepEqual(S.setlistById(l.id).songs, ['a', 'c', 'b']);
  assert.equal(S.nextInSetlist(S.setlistById(l.id), 'c'), 'b');
  assert.equal(S.nextInSetlist(S.setlistById(l.id), 'b'), null);
  assert.equal(S.toggleInSetlist(l.id, 'a'), false);
  S.renameSetlist(l.id, 'Prove');
  assert.equal(S.getSetlists()[0].name, 'Prove');
  S.removeSetlist(l.id);
  assert.equal(S.getSetlists().length, 0);
});

test('indirizzo del brano con la scaletta', () => {
  assert.deepEqual(S.parseSongHash('#/song/salmo-lunedi?s=abc'), { id: 'salmo-lunedi', setlist: 'abc' });
  assert.deepEqual(S.parseSongHash('#/song/883-gli-anni'), { id: '883-gli-anni', setlist: null });
  assert.equal(S.parseSongHash('#/impara'), null);
  assert.equal(S.songHref('a b', 'x'), '#/song/a%20b?s=x');
});

test('genere principale e decennio', { skip: !mainGenre }, () => {
  assert.equal(mainGenre('Pop / Rap'), 'Pop');
  assert.equal(mainGenre(undefined), 'Altro');
  assert.equal(decadeOf(1983), '1980');
  assert.equal(decadeOf(null), null);
});

test('dizionario: ogni accordo ha forma e note giuste', { skip: !chordInfo }, () => {
  for (const r of ROOTS) {
    for (const { q } of QUALITIES) {
      const i = chordInfo(r + q);
      assert.ok(i.shape, `forma di ${r + q}`);
      // le corde suonate producono solo note dell'accordo
      for (const n of i.played) assert.ok(i.notes.includes(n), `${r + q}: nota ${n} fuori accordo`);
    }
  }
});
