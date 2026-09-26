// File audio dei brani scelti dall'utente (restano solo su questo dispositivo, in IndexedDB).
const DB = 'gst-audio';
const STORE = 'files';

function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r?.result);
    t.onerror = () => reject(t.error);
  });
}

export const saveAudio = (songId, file) => tx('readwrite', (s) => s.put({ id: songId, blob: file, name: file.name ?? 'audio', date: Date.now() }));
export const getAudio = (songId) => tx('readonly', (s) => s.get(songId)).catch(() => null);
export const removeAudio = (songId) => tx('readwrite', (s) => s.delete(songId));

// File MIDI con la parte vera del brano (stesso archivio, chiave "midi:<id>").
export const saveMidi = (songId, file) => tx('readwrite', (s) => s.put({ id: `midi:${songId}`, blob: file, name: file.name ?? 'parte.mid', date: Date.now() }));
export const getMidi = (songId) => tx('readonly', (s) => s.get(`midi:${songId}`)).catch(() => null);
export const removeMidi = (songId) => tx('readwrite', (s) => s.delete(`midi:${songId}`));
