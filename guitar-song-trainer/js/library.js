// Libreria brani: ricerca, preferiti, raggruppamento per artista / genere.
import { getFavorites, toggleFavorite, store } from './store.js';
import { icon } from './icons.js';
import { getAllStats, formatDuration, formatAgo } from './stats.js';

const TABS = [
  { id: 'all', label: 'Tutti' },
  { id: 'favorites', label: 'Preferiti' },
  { id: 'recent', label: 'Recenti' },
  { id: 'artist', label: 'Artisti' },
  { id: 'genre', label: 'Generi' },
  { id: 'difficulty', label: 'Difficoltà' },
];

const DIFFICULTY = { 1: 'Principiante', 2: 'Facile', 3: 'Intermedio', 4: 'Avanzato', 5: 'Esperto' };

export function renderLibrary(root, songs) {
  let tab = store.get('libraryTab', 'all');
  let query = '';

  root.innerHTML = `
    <div class="library">
      <section class="hero">
        <div class="hero-kicker">${icon('guitar', 16)} Guitar Song Trainer</div>
        <h1>Scegli un brano,<br><span>suonalo a tempo.</span></h1>
        <p>Manico animato, video sincronizzato, testo karaoke. Rallenta, ripeti in loop, impara.</p>
        <div class="hero-actions">
          <a class="chip-btn primary" href="#/allenamento">${icon('drill', 16)} Allenamento cambi accordo</a>
          <a class="chip-btn" href="#/editor">${icon('text', 16)} Crea un brano</a>
          <span class="hero-stats"></span>
        </div>
      </section>
      <div class="library-head">
        <label class="search-wrap">${icon('search', 18)}
          <input type="search" class="search" placeholder="Cerca titolo, artista, genere…" aria-label="Cerca">
        </label>
        <nav class="tabs" role="tablist"></nav>
      </div>
      <div class="library-body"></div>
    </div>`;
  const tabsEl = root.querySelector('.tabs');
  const body = root.querySelector('.library-body');
  const search = root.querySelector('.search');

  for (const t of TABS) {
    const b = document.createElement('button');
    b.className = 'tab';
    b.textContent = t.label;
    b.dataset.tab = t.id;
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => {
      tab = t.id;
      store.set('libraryTab', tab);
      draw();
    });
    tabsEl.append(b);
  }
  search.addEventListener('input', () => {
    query = search.value.trim().toLowerCase();
    draw();
  });

  function card(song, favs) {
    const a = document.createElement('a');
    a.className = 'song-card';
    a.href = `#/song/${encodeURIComponent(song.id)}`;
    const thumb = song.youtubeId ? `https://i.ytimg.com/vi/${song.youtubeId}/hqdefault.jpg` : '';
    const level = Number(song.difficulty) || 0;
    a.innerHTML = `
      <div class="thumb">${thumb ? `<img loading="lazy" alt="" src="${thumb}" onerror="this.remove()">` : ''}<div class="thumb-shade"></div>
        <span class="play-badge">${icon('play', 22)}</span>
        <span class="key-badge"></span>
      </div>
      <div class="meta">
        <div class="title"></div>
        <div class="artist"></div>
        <div class="meta-row">
          <span class="genre"></span>
          <span class="practice"></span>
          <span class="level" title="Difficoltà: ${DIFFICULTY[level] ?? '—'}">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= level ? 'on' : ''}"></i>`).join('')}
            <em>${DIFFICULTY[level] ?? ''}</em></span>
        </div>
      </div>
      <button class="fav" aria-label="Preferito"></button>`;
    a.querySelector('.title').textContent = song.title;
    a.querySelector('.artist').textContent = song.artist;
    a.querySelector('.genre').textContent = song.genre ?? '';
    const st = stats[song.id];
    const pr = a.querySelector('.practice');
    if (st?.seconds) {
      pr.innerHTML = `${icon('clock', 13)} ${formatDuration(st.seconds)} · ${formatAgo(st.lastPlayed)}`;
      pr.title = `Pratica totale: ${formatDuration(st.seconds)} in ${st.sessions} sessioni${st.bestRate ? ` · velocità migliore nel loop: ${Math.round(st.bestRate * 100)}%` : ''}`;
    } else pr.remove();
    if (song.user) {
      const ub = document.createElement('span');
      ub.className = 'user-badge';
      ub.textContent = song.user === 'created' ? 'Tuo' : 'Modificato';
      a.querySelector('.thumb').append(ub);
    }
    const kb = a.querySelector('.key-badge');
    if (song.key) kb.textContent = song.key; else kb.remove();
    const fav = a.querySelector('.fav');
    const paint = (on) => {
      fav.innerHTML = icon(on ? 'starFill' : 'star', 18);
      fav.classList.toggle('on', on);
    };
    paint(favs.has(song.id));
    fav.addEventListener('click', (e) => {
      e.preventDefault();
      paint(toggleFavorite(song.id));
      if (tab === 'favorites') draw();
    });
    return a;
  }

  function grid(list, favs) {
    const g = document.createElement('div');
    g.className = 'song-grid';
    list.forEach((s) => g.append(card(s, favs)));
    return g;
  }

  // keyFn può restituire più chiavi (duetti: il brano compare sotto ogni artista)
  function grouped(list, keyFn, favs, labelFn = (k) => k) {
    const groups = new Map();
    for (const s of list) {
      const keys = [keyFn(s) ?? 'Altro'].flat();
      for (const k of keys) {
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(s);
      }
    }
    const frag = document.createDocumentFragment();
    [...groups.keys()].sort((a, b) => String(a).localeCompare(String(b), 'it')).forEach((k) => {
      const h = document.createElement('h2');
      h.className = 'group-title';
      h.textContent = `${labelFn(k)} (${groups.get(k).length})`;
      frag.append(h, grid(groups.get(k), favs));
    });
    return frag;
  }

  let stats = {};

  function draw() {
    stats = getAllStats();
    const total = Object.values(stats).reduce((x, v) => x + (v.seconds || 0), 0);
    root.querySelector('.hero-stats').textContent = total ? `Hai suonato ${formatDuration(total)} in tutto` : '';
    tabsEl.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    const favs = getFavorites();
    let list = songs.filter((s) =>
      !query || [s.title, s.artist, s.genre, s.album].filter(Boolean).some((v) => v.toLowerCase().includes(query)));
    list = [...list].sort((a, b) => a.title.localeCompare(b.title, 'it'));
    body.replaceChildren();
    if (tab === 'favorites') list = list.filter((s) => favs.has(s.id));
    if (tab === 'recent') {
      list = list.filter((s) => stats[s.id]?.lastPlayed).sort((a, b) => stats[b.id].lastPlayed - stats[a.id].lastPlayed);
    }
    if (!list.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = tab === 'favorites'
        ? 'Nessun preferito: tocca la stella su un brano per aggiungerlo.'
        : tab === 'recent' ? 'Non hai ancora suonato nessun brano.' : 'Nessun brano trovato.';
      body.append(p);
      return;
    }
    if (tab === 'artist') body.append(grouped(list, (s) => splitArtists(s.artist), favs));
    else if (tab === 'genre') body.append(grouped(list, (s) => s.genre, favs));
    else if (tab === 'difficulty') body.append(grouped(list, (s) => s.difficulty, favs, (k) => DIFFICULTY[k] ?? k));
    else body.append(grid(list, favs));
  }

  draw();
}

// "MACE, Blanco, Salmo" / "Fedez feat. Francesca Michielin" → artisti singoli
export function splitArtists(artist) {
  return String(artist ?? '')
    .split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\be\b|\bcon\b|\bx\b)\s*/i)
    .map((a) => a.trim())
    .filter(Boolean);
}
