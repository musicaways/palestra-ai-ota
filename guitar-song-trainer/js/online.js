// Servizi gratuiti consultati a runtime (niente chiavi, niente dati protetti nel repository):
// - brano su Spotify: Deezer (ricerca, JSONP) → codice ISRC → MusicBrainz (collegamento "free streaming")
// - parte MIDI: ricerca su BitMidi, scelta del file che suona davvero gli accordi del brano
// Le parti "pure" (normalizzazione, punteggi, link) si provano con node.

export const norm = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

// ID di una traccia Spotify da un link, un URI o l'ID stesso.
export function spotifyId(text) {
  const m = /(?:open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/|spotify:track:)([A-Za-z0-9]{22})/.exec(String(text ?? ''))
    ?? /^([A-Za-z0-9]{22})$/.exec(String(text ?? '').trim());
  return m ? m[1] : null;
}

/** Punteggio 0..1 di un risultato BitMidi rispetto al brano (titolo obbligatorio, artista e parole "cattive"). */
export function midiNameScore(name, song) {
  const n = ` ${norm(String(name).replace(/\.midi?$/i, ''))} `;
  const t = norm(song.title);
  if (!t || !n.includes(` ${t} `) && !n.replace(/ /g, '').includes(t.replace(/ /g, ''))) return 0;
  let s = 0.6;
  const artist = norm(String(song.artist).split(/,| feat\.? | & /)[0]);
  if (artist && n.includes(artist)) s += 0.3;
  const raw = ` ${String(name).toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  // "Altro Artista - Titolo": stesso titolo, canzone diversa
  const parts = String(name).replace(/\.midi?$/i, '').split(/\s+-\s+/);
  if (parts.length === 2 && artist) {
    const other = parts.find((x) => !norm(x).includes(t));
    if (other && !norm(other).includes(artist) && !artist.includes(norm(other))) s -= 0.4;
  }
  if (/ (remix|pads|karaoke|piano|drum|drums|bass|cover|medley|intro|solo|live) /.test(raw)) s -= 0.25;
  return Math.round(Math.max(0, Math.min(1, s)) * 100) / 100;
}

const BITMIDI = 'https://bitmidi.com';

// Candidati BitMidi ordinati per nome (al massimo `limit`).
// fetch con un secondo tentativo (BitMidi a volte chiude la connessione)
async function fetchRetry(url, fetchFn) {
  try { return await fetchFn(url); } catch {
    await new Promise((r) => setTimeout(r, 800));
    return fetchFn(url);
  }
}

export async function searchMidi(song, { limit = 5, fetchFn = fetch } = {}) {
  const seen = new Map();
  for (const q of [`${String(song.artist).split(',')[0]} ${song.title}`, song.title]) {
    let r;
    try { r = await fetchRetry(`${BITMIDI}/api/midi/search?q=${encodeURIComponent(q)}`, fetchFn); } catch { continue; }
    if (!r.ok) continue;
    const d = await r.json();
    for (const x of d?.result?.results ?? []) {
      const score = midiNameScore(x.name, song);
      if (score > 0.25 && !seen.has(x.id)) seen.set(x.id, { id: x.id, name: x.name, url: BITMIDI + x.downloadUrl, score });
    }
    if (seen.size >= limit) break;
  }
  return [...seen.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function downloadMidi(c, { fetchFn = fetch } = {}) {
  const r = await fetchRetry(c.url, fetchFn);
  if (!r.ok) throw new Error(`download non riuscito (${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}

// Ricerca su Songsterr (tablature con ascolto): solo un link, si apre nel loro sito.
export const songsterrUrl = (song) => `https://www.songsterr.com/?pattern=${encodeURIComponent(`${String(song.artist).split(',')[0]} ${song.title}`)}`;

// --- Spotify ---
function jsonpOnce(url, timeout) {
  return new Promise((resolve, reject) => {
    const cb = `__dz${Math.random().toString(36).slice(2)}`;
    const s = document.createElement('script');
    const done = (fn, v) => { clearTimeout(t); delete window[cb]; s.remove(); fn(v); };
    const t = setTimeout(() => done(reject, new Error('Deezer non risponde')), timeout);
    window[cb] = (d) => done(resolve, d);
    s.src = `${url}${url.includes('?') ? '&' : '?'}output=jsonp&callback=${cb}`;
    s.onerror = () => done(reject, new Error('Deezer non raggiungibile'));
    document.head.appendChild(s);
  });
}

// Deezer a volte rifiuta richieste troppo fitte: si riprova una volta dopo una pausa
async function jsonp(url, timeout = 10000) {
  try { return await jsonpOnce(url, timeout); } catch {
    await new Promise((r) => setTimeout(r, 1200));
    return jsonpOnce(url, timeout);
  }
}

// Traccia Deezer più vicina: titolo uguale e durata vicina a quella del testo sincronizzato.
export function pickDeezer(results, song, duration = 0) {
  const t = norm(song.title);
  const a = norm(String(song.artist).split(/,| feat\.? | & /)[0]);
  const ok = (results ?? []).filter((x) => norm(x.title).startsWith(t) || norm(x.title_short) === t)
    .filter((x) => !a || norm(x.artist?.name).includes(a) || a.includes(norm(x.artist?.name)))
    .filter((x) => !duration || Math.abs(x.duration - duration) <= 10);
  return ok.sort((x, y) => Math.abs(x.duration - duration) - Math.abs(y.duration - duration))[0] ?? null;
}

/** { spotifyId, deezerId, isrc } del brano, oppure null. */
export async function findSpotify(song, duration = 0) {
  const q = `artist:"${String(song.artist).split(',')[0]}" track:"${song.title}"`;
  let res = await jsonp(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=10`);
  let tr = pickDeezer(res?.data, song, duration);
  if (!tr) {
    res = await jsonp(`https://api.deezer.com/search?q=${encodeURIComponent(`${String(song.artist).split(',')[0]} ${song.title}`)}&limit=10`);
    tr = pickDeezer(res?.data, song, duration);
  }
  if (!tr) return null;
  const full = await jsonp(`https://api.deezer.com/track/${tr.id}`);
  const isrc = full?.isrc;
  if (!isrc) return null;
  const r = await fetch(`https://musicbrainz.org/ws/2/isrc/${isrc}?inc=url-rels&fmt=json`);
  if (!r.ok) return { spotifyId: null, deezerId: tr.id, isrc };
  const mb = await r.json();
  const links = (mb.recordings ?? []).flatMap((x) => x.relations ?? []).map((x) => x.url?.resource ?? '');
  const sp = links.map(spotifyId).find(Boolean) ?? null;
  return { spotifyId: sp, deezerId: tr.id, isrc };
}
