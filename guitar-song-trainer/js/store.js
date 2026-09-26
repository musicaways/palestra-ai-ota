// Salvataggio locale (solo su questo dispositivo/browser).
const PREFIX = 'gst:';

export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(PREFIX + key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* storage non disponibile: si continua senza salvare */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      /* ignorato */
    }
  },
};

const DEFAULT_SETTINGS = {
  notation: 'intl', // 'intl' (C D E) | 'it' (Do Re Mi)
  leftHanded: false,
  highStringOnTop: true, // come nelle tablature
  showNoteNames: false,
  metronome: false,
  autoScroll: true,
};

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...store.get('settings', {}) };
}

export function saveSettings(settings) {
  store.set('settings', settings);
}

export function getFavorites() {
  return new Set(store.get('favorites', []));
}

export function toggleFavorite(id) {
  const favs = getFavorites();
  if (favs.has(id)) favs.delete(id);
  else favs.add(id);
  store.set('favorites', [...favs]);
  return favs.has(id);
}
