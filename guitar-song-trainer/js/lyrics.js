// Testo sincronizzato (formato LRC). Il testo NON è salvato nel repository:
// viene scaricato al momento da LRCLIB (https://lrclib.net), archivio pubblico e gratuito,
// oppure incollato dall'utente. Resta solo nella cache locale del dispositivo.
import { store } from './store.js';
import { parseEnhanced } from './wordtiming.js';

const API = 'https://lrclib.net/api';

export function parseLrc(text) {
  const lines = [];
  let offsetMs = 0;
  for (const raw of String(text).replace(/\r/g, '').split('\n')) {
    const off = /^\[offset:\s*([+-]?\d+)\]/i.exec(raw);
    if (off) { offsetMs = Number(off[1]); continue; }
    const tags = [...raw.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g)];
    if (!tags.length) continue;
    const body = raw.replace(/\[[^\]]*\]/g, '');
    // formato "esteso": tempi per parola <mm:ss.xx>parola
    const words = parseEnhanced(body);
    const content = body.replace(/<\d+:\d+(?:\.\d+)?>/g, '').replace(/\s+/g, ' ').trim();
    for (const m of tags) {
      const t = Number(m[1]) * 60 + Number(m[2].replace(':', '.'));
      lines.push(words.length && tags.length === 1 ? { t, text: content, words } : { t, text: content });
    }
  }
  lines.sort((a, b) => a.t - b.t);
  // Nel formato LRC un offset positivo anticipa il testo.
  if (offsetMs) lines.forEach((l) => { l.t -= offsetMs / 1000; l.words?.forEach((w) => { w.t -= offsetMs / 1000; }); });
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
    if (lrc === false) break; // non c'è con questo id: si prova la ricerca
    if (lrc) {
      store.set(cacheKey, { lrc });
      return { lines: parseLrc(lrc), source: 'LRCLIB' };
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  // Riserva: ricerca per artista e titolo, versione sincronizzata con la durata più vicina.
  const found = await searchLrc(song);
  if (found) {
    store.set(cacheKey, { lrc: found });
    return { lines: parseLrc(found), source: 'LRCLIB' };
  }
  return null;
}

export function pickBestLyrics(results, duration) {
  const synced = (results ?? []).filter((r) => r.syncedLyrics);
  if (!synced.length) return null;
  if (!duration) return synced[0];
  return synced.reduce((a, b) => (Math.abs(b.duration - duration) < Math.abs(a.duration - duration) ? b : a));
}

async function searchLrc(song) {
  const src = song.lyricsSource ?? {};
  const mainArtist = String(song.artist).split(/\s*(?:,|&|feat\.?)\s*/i)[0];
  const q = new URLSearchParams({ artist_name: mainArtist, track_name: src.trackName ?? song.title });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${API}/search?${q}`, { signal: ctrl.signal });
    if (!res.ok) return null;
    return pickBestLyrics(await res.json(), src.duration)?.syncedLyrics ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
