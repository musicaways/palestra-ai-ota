// Brani creati o modificati dall'utente nell'editor (solo su questo dispositivo).
import { store } from './store.js';

const KEY = 'userSongs';

export const listUserSongs = () => Object.values(store.get(KEY, {}));
export const getUserSong = (id) => store.get(KEY, {})[id] ?? null;

export function saveUserSong(song) {
  const all = store.get(KEY, {});
  all[song.id] = { ...song, updatedAt: Date.now() };
  store.set(KEY, all);
}

export function deleteUserSong(id) {
  const all = store.get(KEY, {});
  delete all[id];
  store.set(KEY, all);
}

// Unisce la libreria del repository con i brani dell'utente (che hanno la precedenza).
export function mergeLibrary(index, userSongs = listUserSongs()) {
  const byId = new Map(index.map((s) => [s.id, { ...s }]));
  for (const u of userSongs) {
    const base = byId.get(u.id);
    const { sections, patterns, sync, shapes, ...meta } = u;
    byId.set(u.id, { ...(base ?? {}), ...meta, user: base ? 'modified' : 'created' });
  }
  return [...byId.values()];
}
