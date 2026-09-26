// Libreria brani: ricerca, preferiti, raggruppamento per artista / genere.
import { getFavorites, toggleFavorite, store } from './store.js';
import { icon } from './icons.js';
import { getAllStats, formatDuration, formatAgo } from './stats.js';
import { loadProgress } from './progress.js';
import { getSetlists, createSetlist, removeSetlist, renameSetlist, songHref } from './setlists.js';

const TABS = [
  { id: 'all', label: 'Tutti' },
  { id: 'favorites', label: 'Preferiti' },
  { id: 'recent', label: 'Recenti' },
  { id: 'artist', label: 'Artisti' },
  { id: 'genre', label: 'Generi' },
  { id: 'difficulty', label: 'Difficoltà' },
  { id: 'setlists', label: 'Scalette' },
];

// Genere principale ("Pop / Rap" → "Pop") e decennio ("1983" → "anni '80")
export const mainGenre = (g) => String(g ?? 'Altro').split('/')[0].trim() || 'Altro';
export const decadeOf = (y) => (y ? `${Math.floor(y / 10) * 10}` : null);
const decadeLabel = (d) => (Number(d) >= 2000 ? `${d}` : `anni '${String(d).slice(2)}`);

const DIFFICULTY = { 1: 'Principiante', 2: 'Facile', 3: 'Intermedio', 4: 'Avanzato', 5: 'Esperto' };

export function renderLibrary(root, songs) {
  let tab = store.get('libraryTab', 'all');
  let query = '';
  let filt = { genre: null, decade: null, ...store.get('libFilter', {}) };

  root.innerHTML = `
    <div class="library home">
      <section class="hero">
        <div class="hero-kicker">${icon('guitar', 16)} Guitar Song Trainer</div>
        <h1>Scegli un brano,<br><span>suonalo a tempo.</span></h1>
        <p>Manico animato, video sincronizzato, testo karaoke. Rallenta, ripeti in loop, impara.</p>
        <div class="hero-actions">
          <a class="chip-btn primary" href="#/impara">${icon('study', 16)} Impara: lezioni ed esercizi</a>
          <button class="chip-btn random-btn" title="Apri un brano a caso fra quelli filtrati">🎲 A caso</button>
          <a class="chip-btn" href="#/accordi">${icon('hand', 16)} Accordi</a>
          <a class="chip-btn" href="#/allenamento">${icon('drill', 16)} Allenamento cambi</a>
          <a class="chip-btn" href="#/registrazioni">${icon('camera', 16)} Registrazioni</a>
          <a class="chip-btn" href="#/editor">${icon('text', 16)} Crea un brano</a>
          <a class="chip-btn continue-btn" hidden></a>
          <a class="chip-btn level-chip" href="#/progressi"></a>
          <span class="hero-stats"></span>
        </div>
      </section>
      <div class="library-head">
        <label class="search-wrap">${icon('search', 18)}
          <input type="search" class="search" placeholder="Cerca titolo, artista, genere…  ( / )" aria-label="Cerca">
          <span class="search-count"></span>
        </label>
        <label class="sort-wrap">Ordina
          <select class="sort">
            <option value="title">Titolo</option>
            <option value="artist">Artista</option>
            <option value="easy">Più facili</option>
            <option value="played">Più suonati</option>
            <option value="year">Più recenti</option>
          </select>
        </label>
        <nav class="tabs" role="tablist"></nav>
        <div class="lib-filters" role="group" aria-label="Filtra per genere e decennio"></div>
      </div>
      <div class="library-body"></div>
    </div>`;
  const tabsEl = root.querySelector('.tabs');
  const body = root.querySelector('.library-body');
  const search = root.querySelector('.search');
  const sortSel = root.querySelector('.sort');
  let sort = store.get('librarySort', 'title');
  sortSel.value = sort;
  sortSel.addEventListener('change', () => { sort = sortSel.value; store.set('librarySort', sort); draw(); });
  // "/" porta subito nella ricerca
  const onSlash = (e) => {
    if (e.key === '/' && !e.target.closest('input, textarea, select') && document.body.contains(search)) {
      e.preventDefault();
      search.focus();
    }
  };
  if (window.__gstSlash) window.removeEventListener('keydown', window.__gstSlash);
  window.__gstSlash = onSlash;
  window.addEventListener('keydown', onSlash);

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
    const pg = loadProgress();
    root.querySelector('.level-chip').innerHTML = `${icon('starFill', 14)} Livello ${pg.level}${pg.streak ? ` · ${pg.streak} ${pg.streak === 1 ? 'giorno' : 'giorni'} di fila` : ''}`;
    tabsEl.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    const favs = getFavorites();
    // filtri: genere principale e decennio
    const genres = [...new Set(songs.map((x) => mainGenre(x.genre)))].sort((a, b) => a.localeCompare(b, 'it'));
    const decades = [...new Set(songs.map((x) => decadeOf(x.year)).filter(Boolean))].sort();
    const fEl = root.querySelector('.lib-filters');
    fEl.innerHTML = `<button class="seg${!filt.genre && !filt.decade ? ' active' : ''}" data-f="all">Tutti</button>`
      + genres.map((g) => `<button class="seg${filt.genre === g ? ' active' : ''}" data-fg="${g}">${g}</button>`).join('')
      + decades.map((d) => `<button class="seg${filt.decade === d ? ' active' : ''}" data-fd="${d}">${decadeLabel(d)}</button>`).join('');
    let list = songs.filter((s) =>
      (!query || [s.title, s.artist, s.genre, s.album].filter(Boolean).some((v) => v.toLowerCase().includes(query)))
      && (!filt.genre || mainGenre(s.genre) === filt.genre) && (!filt.decade || decadeOf(s.year) === filt.decade));
    lastList = list;
    const byTitle = (a, b) => a.title.localeCompare(b.title, 'it');
    const sorters = {
      title: byTitle,
      artist: (a, b) => a.artist.localeCompare(b.artist, 'it') || byTitle(a, b),
      easy: (a, b) => (a.difficulty ?? 3) - (b.difficulty ?? 3) || byTitle(a, b),
      played: (a, b) => (stats[b.id]?.seconds ?? 0) - (stats[a.id]?.seconds ?? 0) || byTitle(a, b),
      year: (a, b) => (b.year ?? 0) - (a.year ?? 0) || byTitle(a, b),
    };
    list = [...list].sort(sorters[sort] ?? byTitle);
    root.querySelector('.search-count').textContent = query ? `${list.length}` : `${songs.length} brani`;
    // "Continua": l'ultimo brano suonato
    const last = songs.filter((x) => stats[x.id]?.lastPlayed).sort((a, b) => stats[b.id].lastPlayed - stats[a.id].lastPlayed)[0];
    const cont = root.querySelector('.continue-btn');
    cont.hidden = !last;
    if (last) {
      cont.href = `#/song/${encodeURIComponent(last.id)}`;
      cont.innerHTML = `${icon('play', 14)} Continua: <b></b>`;
      cont.querySelector('b').textContent = last.title;
    }
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
    if (tab === 'setlists') { body.replaceChildren(); drawSetlists(favs); return; }
    if (tab === 'artist') {
      // indice A–Z degli artisti
      const letters = [...new Set(list.flatMap((s) => splitArtists(s.artist)).map((a) => a[0].toUpperCase()))].sort();
      const az = document.createElement('nav');
      az.className = 'az';
      az.innerHTML = letters.map((l) => `<a href="#" data-az="${l}">${l}</a>`).join('');
      body.append(az, grouped(list, (s) => splitArtists(s.artist), favs));
    }
    else if (tab === 'genre') body.append(grouped(list, (s) => mainGenre(s.genre), favs));
    else if (tab === 'difficulty') body.append(grouped(list, (s) => s.difficulty, favs, (k) => DIFFICULTY[k] ?? k));
    else body.append(grid(list, favs));
  }

  let lastList = songs;
  root.querySelector('.lib-filters').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.f === 'all') filt = { genre: null, decade: null };
    if (b.dataset.fg) filt.genre = filt.genre === b.dataset.fg ? null : b.dataset.fg;
    if (b.dataset.fd) filt.decade = filt.decade === b.dataset.fd ? null : b.dataset.fd;
    store.set('libFilter', filt);
    draw();
  });
  root.querySelector('.random-btn').addEventListener('click', () => {
    const pool = lastList.length ? lastList : songs;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick) location.hash = `#/song/${encodeURIComponent(pick.id)}`;
  });
  body.addEventListener('click', (e) => {
    const l = e.target.closest('[data-az]')?.dataset.az;
    if (l) {
      e.preventDefault();
      const h = [...body.querySelectorAll('.group-title')].find((x) => x.textContent.toUpperCase().startsWith(l));
      h?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  // Scheda Scalette: elenchi di brani da suonare in fila
  function drawSetlists(favs) {
    const lists = getSetlists();
    const head = document.createElement('div');
    head.className = 'tr-actions';
    head.innerHTML = '<input class="sl-new" placeholder="Nome della nuova scaletta" maxlength="40"><button class="chip-btn primary" data-sl="new">Crea scaletta</button>';
    body.append(head);
    if (!lists.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = 'Nessuna scaletta. Creane una qui sopra, poi aggiungi i brani dal player: ⋯ → Scaletta.';
      body.append(p);
    }
    const byId = new Map(songs.map((x) => [x.id, x]));
    for (const l of lists) {
      const h = document.createElement('div');
      h.className = 'setlist-head';
      h.innerHTML = `<h2 class="group-title"></h2>
        ${l.songs.length ? `<a class="chip-btn primary" href="${songHref(l.songs[0], l.id)}">${icon('play', 14)} Suona</a>` : ''}
        <button class="chip-btn" data-slren="${l.id}">Rinomina</button><button class="chip-btn" data-sldel="${l.id}">${icon('close', 14)} Elimina</button>`;
      h.querySelector('h2').textContent = `${l.name} (${l.songs.length})`;
      const g = document.createElement('div');
      g.className = 'song-grid';
      l.songs.map((id) => byId.get(id)).filter(Boolean).forEach((s, i) => {
        const c = card(s, favs);
        c.href = songHref(s.id, l.id);
        const o = document.createElement('span');
        o.className = 'sl-order';
        o.textContent = i + 1;
        c.querySelector('.thumb').append(o);
        g.append(c);
      });
      body.append(h, g);
    }
    body.onclick = null;
    head.querySelector('[data-sl="new"]').addEventListener('click', () => {
      const v = head.querySelector('.sl-new').value.trim();
      if (v) { createSetlist(v); draw(); }
    });
    body.querySelectorAll('[data-sldel]').forEach((b) => b.addEventListener('click', () => {
      if (confirm('Eliminare la scaletta? I brani restano in libreria.')) { removeSetlist(b.dataset.sldel); draw(); }
    }));
    body.querySelectorAll('[data-slren]').forEach((b) => b.addEventListener('click', () => {
      const n = prompt('Nuovo nome della scaletta');
      if (n) { renameSetlist(b.dataset.slren, n); draw(); }
    }));
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
