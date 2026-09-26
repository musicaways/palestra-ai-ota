// Editor dei brani: crea o modifica un brano, controlla gli errori, prova, esporta il JSON.
import { parseSongText, songToText, slugify, youtubeId, tapTempo } from './songtext.js';
import { buildTimeline } from './timeline.js';
import { getShape, displayChord, chordColor } from './music.js';
import { saveUserSong, getUserSong, deleteUserSong } from './usersongs.js';
import { loadSettings } from './store.js';
import { icon } from './icons.js';

const EMPTY = {
  title: '', artist: '', album: '', year: '', genre: '', difficulty: 2, youtubeId: '',
  bpm: 90, timeSignature: [4, 4], offset: 0, strum: 'D-DU-UDU', capo: 0, key: '',
  sections: [{ name: 'Strofa', bars: ['C', 'G', 'Am', 'F'] }],
};

/** @param existing brano da modificare (dal repository o dell'utente), null per uno nuovo */
export function openEditor(root, existing) {
  const settings = loadSettings();
  const base = existing ? { ...existing } : { ...EMPTY };
  const isUser = existing ? !!getUserSong(existing.id) : false;
  const taps = [];

  root.innerHTML = `
  <div class="editor">
    <header class="player-head">
      <a class="icon-btn" href="${existing ? `#/song/${encodeURIComponent(existing.id)}` : '#/'}" aria-label="Indietro">${icon('back')}</a>
      <div class="player-title"><div class="title">${existing ? 'Modifica brano' : 'Nuovo brano'}</div>
        <div class="artist">I brani salvati qui restano su questo dispositivo; esportali per condividerli</div></div>
    </header>
    <form class="editor-form" autocomplete="off">
      <section class="card ed-card">
        <h3>Il brano</h3>
        <div class="ed-grid">
          <label>Titolo<input name="title" required></label>
          <label>Artista<input name="artist" required></label>
          <label>Album<input name="album"></label>
          <label>Anno<input name="year" inputmode="numeric"></label>
          <label>Genere<input name="genre" list="genres"></label>
          <label>Difficoltà<select name="difficulty">
            <option value="1">1 · Principiante</option><option value="2">2 · Facile</option><option value="3">3 · Intermedio</option>
            <option value="4">4 · Avanzato</option><option value="5">5 · Esperto</option></select></label>
          <label class="wide">Video YouTube (link o ID)<input name="youtube" placeholder="https://www.youtube.com/watch?v=…"></label>
        </div>
        <datalist id="genres"><option>Rock</option><option>Pop</option><option>Rap / Hip-hop</option><option>Cantautori</option><option>Indie</option><option>Blues</option><option>Folk</option><option>Metal</option></datalist>
      </section>

      <section class="card ed-card">
        <h3>Ritmo e sincronia</h3>
        <div class="ed-grid">
          <label>BPM<span class="ed-inline"><input name="bpm" type="number" min="30" max="260" step="0.5"><button type="button" class="chip-btn ed-tap">Tap</button></span></label>
          <label>Metro<select name="meter"><option value="4">4/4</option><option value="3">3/4</option><option value="6">6/8</option><option value="2">2/4</option></select></label>
          <label>Primo accordo al secondo<input name="offset" type="number" step="0.01" min="0"></label>
          <label>Pennata<input name="strum" placeholder="D-DU-UDU"></label>
          <label>Capotasto consigliato<select name="capo">${Array.from({ length: 8 }, (_, c) => `<option value="${c}">${c ? c + '° tasto' : 'nessuno'}</option>`).join('')}</select></label>
          <label>Tonalità<input name="key" placeholder="es. Sol minore (Gm)"></label>
        </div>
        <p class="hint">Pennata: una lettera per croma — <b>D</b> giù, <b>U</b> su, <b>-</b> pausa, <b>X</b> stoppata.
          "Primo accordo al secondo" è il punto del video in cui inizia la prima battuta; poi si affina nel player con Sincronia o Registra tempi.</p>
      </section>

      <section class="card ed-card">
        <h3>Accordi</h3>
        <textarea name="chords" rows="12" spellcheck="false"></textarea>
        <p class="hint"><b>[Nome sezione] x2</b> apre una sezione (ripetuta 2 volte). Ogni parola è una battuta,
          <b>%</b> = l'accordo prosegue, <b>|</b> è solo per leggibilità, <b>D7sus4,D7</b> = due accordi nella stessa battuta,
          <b>F5:3,C5:1</b> = con i battiti. Ogni riga diventa una riga dello spartito.</p>
        <div class="ed-check"></div>
      </section>

      <section class="card ed-card">
        <h3>Testo karaoke</h3>
        <div class="ed-inline">
          <label class="grow">ID LRCLIB<input name="lrclib" inputmode="numeric" placeholder="vuoto = ricerca automatica per titolo"></label>
          <button type="button" class="chip-btn ed-lrc-search">${icon('search', 16)} Cerca su LRCLIB</button>
        </div>
        <div class="ed-lrc-results"></div>
        <p class="hint">Il testo non viene salvato nel brano: l'app lo scarica da LRCLIB quando lo apri. Scegli la versione con la durata del video.</p>
      </section>

      <div class="ed-actions">
        <button type="submit" class="chip-btn primary">${icon('play', 16)} Salva e prova</button>
        <button type="button" class="chip-btn ed-export">Esporta JSON</button>
        ${isUser ? '<button type="button" class="chip-btn ed-delete">Elimina la mia versione</button>' : ''}
        <span class="ed-status"></span>
      </div>
    </form>
  </div>`;

  const f = root.querySelector('.editor-form');
  const check = root.querySelector('.ed-check');
  const status = root.querySelector('.ed-status');

  f.title.value = base.title ?? '';
  f.artist.value = base.artist ?? '';
  f.album.value = base.album ?? '';
  f.year.value = base.year ?? '';
  f.genre.value = base.genre ?? '';
  f.difficulty.value = String(base.difficulty ?? 2);
  f.youtube.value = base.youtubeId ?? '';
  f.bpm.value = base.bpm ?? 90;
  f.meter.value = String(base.timeSignature?.[0] ?? 4);
  f.offset.value = base.offset ?? 0;
  f.strum.value = base.strum ?? '';
  f.capo.value = String(base.capo ?? 0);
  f.key.value = base.key ?? '';
  f.chords.value = songToText(base);
  f.lrclib.value = base.lyricsSource?.lrclibId ?? '';

  function collect() {
    const { sections, errors } = parseSongText(f.chords.value);
    const meter = Number(f.meter.value);
    const yt = f.youtube.value.trim() ? youtubeId(f.youtube.value) : '';
    if (f.youtube.value.trim() && !yt) errors.push('Link YouTube non riconosciuto.');
    if (!f.title.value.trim()) errors.push('Manca il titolo.');
    if (!f.artist.value.trim()) errors.push("Manca l'artista.");
    const bpm = Number(f.bpm.value);
    if (!(bpm >= 30 && bpm <= 260)) errors.push('BPM fra 30 e 260.');
    const song = {
      ...base,
      id: existing?.id ?? slugify(`${f.artist.value}-${f.title.value}`),
      title: f.title.value.trim(),
      artist: f.artist.value.trim(),
      album: f.album.value.trim() || undefined,
      year: f.year.value ? Number(f.year.value) || f.year.value : undefined,
      genre: f.genre.value.trim() || undefined,
      difficulty: Number(f.difficulty.value),
      youtubeId: yt || undefined,
      key: f.key.value.trim() || undefined,
      bpm,
      timeSignature: [meter, meter === 6 ? 8 : 4],
      offset: Number(f.offset.value) || 0,
      strum: f.strum.value.trim() || undefined,
      capo: Number(f.capo.value) || 0,
      sections,
      lyricsSource: f.lrclib.value.trim() ? { lrclibId: Number(f.lrclib.value), offset: base.lyricsSource?.offset ?? 0 } : undefined,
    };
    delete song.patterns; // l'editor salva le battute esplicite
    delete song.file;
    delete song.user;
    delete song.updatedAt;
    // Se la struttura è cambiata, i tempi registrati non corrispondono più.
    if (base.sync && JSON.stringify(sections) !== JSON.stringify(parseSongText(songToText(base)).sections)) delete song.sync;
    return { song, errors };
  }

  function validate() {
    const { song, errors } = collect();
    let html = '';
    if (!errors.length) {
      try {
        const tl = buildTimeline(song);
        const names = [...new Set(tl.events.map((e) => e.name))];
        const missing = names.filter((n) => !getShape(n, song.shapes));
        const min = Math.floor(tl.end / 60);
        const sec = String(Math.round(tl.end % 60)).padStart(2, '0');
        html += `<div class="ed-ok">${tl.bars.length} battute · ${tl.events.length} cambi · ${tl.sections.length} sezioni · durata ${min}:${sec}</div>`;
        html += `<div class="ed-chips">${names.map((n) => `<span class="chip${getShape(n, song.shapes) ? '' : ' warn'}" style="--chip:${chordColor(n)}">${displayChord(n, settings.notation)}</span>`).join('')}</div>`;
        if (missing.length) html += `<div class="ed-warn">Diteggiatura non disponibile per: ${missing.join(', ')} (il brano funziona, ma il manico non la mostrerà).</div>`;
      } catch (e) {
        errors.push(e.message);
      }
    }
    if (errors.length) html = `<ul class="ed-errors">${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>` + html;
    check.innerHTML = html;
    return { song, errors };
  }

  f.addEventListener('input', validate);
  validate();

  root.querySelector('.ed-tap').addEventListener('click', () => {
    const now = performance.now();
    if (taps.length && now - taps.at(-1) > 2000) taps.length = 0;
    taps.push(now);
    const bpm = tapTempo(taps);
    if (bpm) { f.bpm.value = bpm; validate(); }
  });

  root.querySelector('.ed-lrc-search').addEventListener('click', async () => {
    const box = root.querySelector('.ed-lrc-results');
    box.textContent = 'Ricerca…';
    try {
      const q = new URLSearchParams({ artist_name: f.artist.value, track_name: f.title.value });
      const res = await fetch(`https://lrclib.net/api/search?${q}`);
      const list = (await res.json()).filter((r) => r.syncedLyrics).slice(0, 8);
      if (!list.length) { box.textContent = 'Nessun testo sincronizzato trovato.'; return; }
      // solo i metadati: il testo non viene mostrato né salvato qui
      box.innerHTML = list.map((r) => `<button type="button" class="ed-lrc" data-id="${r.id}">
        <b></b><span></span><em>${fmtDur(r.duration)}</em></button>`).join('');
      box.querySelectorAll('.ed-lrc').forEach((b, i) => {
        b.querySelector('b').textContent = `${list[i].trackName} · ${list[i].artistName}`;
        b.querySelector('span').textContent = list[i].albumName ?? '';
        b.addEventListener('click', () => {
          f.lrclib.value = b.dataset.id;
          box.querySelectorAll('.ed-lrc').forEach((x) => x.classList.toggle('active', x === b));
        });
      });
    } catch {
      box.textContent = 'LRCLIB non raggiungibile.';
    }
  });

  root.querySelector('.ed-export').addEventListener('click', () => {
    const { song, errors } = validate();
    if (errors.length) { status.textContent = 'Correggi prima gli errori.'; return; }
    const { id, ...data } = song;
    const blob = new Blob([JSON.stringify({ ...data }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    status.textContent = `Esportato ${id}.json`;
  });

  root.querySelector('.ed-delete')?.addEventListener('click', () => {
    if (!confirm('Eliminare la tua versione di questo brano?')) return;
    deleteUserSong(existing.id);
    location.hash = '#/';
  });

  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const { song, errors } = validate();
    if (errors.length) { status.textContent = 'Correggi prima gli errori.'; return; }
    saveUserSong(JSON.parse(JSON.stringify(song)));
    location.hash = `#/song/${encodeURIComponent(song.id)}`;
  });

  return () => {};
}

function fmtDur(s) {
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
