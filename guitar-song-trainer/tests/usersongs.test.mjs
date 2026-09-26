import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
const { saveUserSong, getUserSong, deleteUserSong, mergeLibrary, listUserSongs } = await import('../js/usersongs.js');

test('salva, unisce alla libreria ed elimina', () => {
  const index = [{ id: 'a', title: 'A', artist: 'X', file: 'a.json' }];
  saveUserSong({ id: 'b', title: 'Nuovo', artist: 'Y', bpm: 90, sections: [{ name: 'S', bars: ['C'] }] });
  saveUserSong({ id: 'a', title: 'A (mio)', artist: 'X', bpm: 100, sections: [{ name: 'S', bars: ['G'] }] });
  const lib = mergeLibrary(index);
  assert.equal(lib.length, 2);
  assert.equal(lib.find((s) => s.id === 'a').user, 'modified');
  assert.equal(lib.find((s) => s.id === 'a').title, 'A (mio)');
  assert.equal(lib.find((s) => s.id === 'b').user, 'created');
  assert.ok(!('sections' in lib[1]), 'nella libreria solo i metadati');
  assert.equal(getUserSong('b').bpm, 90);
  deleteUserSong('b');
  assert.equal(listUserSongs().length, 1);
});
