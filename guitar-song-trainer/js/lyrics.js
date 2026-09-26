// Testo sincronizzato (formato LRC). Il testo NON è salvato nel repository:
// viene scaricato al momento da LRCLIB (https://lrclib.net), archivio pubblico e gratuito,
// oppure incollato dall'utente. Resta solo nella cache locale del dispositivo.
import { store } from './store.js';

const API = 'https://lrclib.net/api';

export function parseLrc(text) {
  const lines = [];
  let offsetMs = 0;
  for (const raw of String(text).replace(/\r/g, '').split('\n')) {
    const off = /^\[offset:\s*([+-]?\d+)\]/i.exec(raw);
    if (off) { offsetMs = Number(off[1]); continue; }
    const tags = [...raw.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g)];
    if (!tags.length) continue;
    const content = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of tags) {
      const t = Number(m[1]) * 60 + Number(m[2].replace(':', '.'));
      lines.push({ t, text: content });
    }
  }
  lines.sort((a, b) => a.t - b.t);
  // Nel formato LRC un offset positivo anticipa il testo.
  if (offsetMs) lines.forEach((l) => { l.t -= offsetMs / 1000; });
  return lines;
}

export function looksLikeLrc(text) {
  return /^\s*\[\d+:\d+(?:[.:]\d+)?\]/m.test(text);
}

/**
 * Restituisce { lines, source } oppure null.
 * Priorità: testo LRC incollato dall'utente → cache locale → LRCLIB.
 */
export async function loadSyncedLyrics(song) {
  const pasted = store.get(`lrc:${song.id}`, null);
  if (pasted) return { lines: parseLrc(pasted), source: 'tuo testo' };

  const cacheKey = `lrcCache:${song.id}`;
  const cached = store.get(cacheKey, null);
  if (cached?.lrc) return { lines: parseLrc(cached.lrc), source: 'LRCLIB' };

  const src = song.lyricsSource ?? {};
  let url;
  if (src.lrclibId) url = `${API}/get/${src.lrclibId}`;
  else {
    const q = new URLSearchParams({ artist_name: song.artist, track_name: src.trackName ?? song.title });
    if (src.duration) q.set('duration', src.duration);
    url = `${API}/get?${q}`;
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const lrc = await fetchLrc(url);
    if (lrc === false) return null; // il brano non è nell'archivio
    if (lrc) {
      store.set(cacheKey, { lrc });
      return { lines: parseLrc(lrc), source: 'LRCLIB' };
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

// Restituisce il testo LRC, false se non esiste, null se la rete ha fallito.
async function fetchLrc(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (res.status === 404) return false;
    if (!res.ok) return null;
    const data = await res.json();
    return data?.syncedLyrics || false;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function clearLyricsCache(song) {
  store.remove(`lrcCache:${song.id}`);
}
