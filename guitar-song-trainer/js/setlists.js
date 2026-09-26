// Scalette: elenchi di brani da suonare uno dopo l'altro (salvati sul dispositivo).
import { store } from './store.js';

const KEY = 'setlists';

export const getSetlists = () => store.get(KEY, []);
const save = (lists) => store.set(KEY, lists);

export function createSetlist(name, songs = []) {
  const lists = getSetlists();
  const list = { id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name: String(name).trim() || 'Scaletta', songs: [...songs] };
  lists.push(list);
  save(lists);
  return list;
}

export function toggleInSetlist(listId, songId) {
  const lists = getSetlists();
  const l = lists.find((x) => x.id === listId);
  if (!l) return false;
  const i = l.songs.indexOf(songId);
  if (i >= 0) l.songs.splice(i, 1); else l.songs.push(songId);
  save(lists);
  return i < 0;
}

export function moveInSetlist(listId, songId, dir) {
  const lists = getSetlists();
  const l = lists.find((x) => x.id === listId);
  const i = l?.songs.indexOf(songId) ?? -1;
  const j = i + dir;
  if (i < 0 || j < 0 || j >= l.songs.length) return;
  [l.songs[i], l.songs[j]] = [l.songs[j], l.songs[i]];
  save(lists);
}

export function renameSetlist(listId, name) {
  const lists = getSetlists();
  const l = lists.find((x) => x.id === listId);
  if (l && name.trim()) { l.name = name.trim(); save(lists); }
}

export function removeSetlist(listId) {
  save(getSetlists().filter((x) => x.id !== listId));
}

export const setlistById = (id) => getSetlists().find((x) => x.id === id) ?? null;

// Brano successivo in scaletta (null alla fine).
export function nextInSetlist(list, songId) {
  if (!list) return null;
  const i = list.songs.indexOf(songId);
  return i >= 0 && i + 1 < list.songs.length ? list.songs[i + 1] : null;
}

// "#/song/<id>?s=<scaletta>" → { id, setlist }
export function parseSongHash(hash) {
  const m = /^#\/song\/([^?]+)(?:\?(.*))?$/.exec(hash);
  if (!m) return null;
  const q = new URLSearchParams(m[2] ?? '');
  return { id: decodeURIComponent(m[1]), setlist: q.get('s') };
}

export const songHref = (id, setlist) => `#/song/${encodeURIComponent(id)}${setlist ? `?s=${encodeURIComponent(setlist)}` : ''}`;
