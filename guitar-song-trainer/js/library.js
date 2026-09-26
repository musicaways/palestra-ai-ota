// Libreria brani: ricerca, preferiti, raggruppamento per artista / genere.
import { getFavorites, toggleFavorite, store } from './store.js';

const TABS = [
  { id: 'all', label: 'Tutti' },
  { id: 'favorites', label: '★ Preferiti' },
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
      <div class="library-head">
        <input type="search" class="search" placeholder="Cerca titolo, artista, genere…" aria-label="Cerca">
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
    const thumb = song.youtubeId ? `https://i.ytimg.com/vi/${song.youtubeId}/mqdefault.jpg` : '';
    a.innerHTML = `
      <div class="thumb">${thumb ? `<img loading="lazy" alt="" src="${thumb}">` : ''}</div>
      <div class="meta">
        <div class="title"></div>
        <div class="artist"></div>
        <div class="tags"></div>
      </div>
      <button class="fav" aria-label="Preferito"></button>`;
    a.querySelector('.title').textContent = song.title;
    a.querySelector('.artist').textContent = song.artist;
    const tags = a.querySelector('.tags');
    for (const text of [song.genre, song.key && `Tonalità ${song.key}`, DIFFICULTY[song.difficulty]].filter(Boolean)) {
      const s = document.createElement('span');
      s.className = 'tag';
      s.textContent = text;
      tags.append(s);
    }
    const fav = a.querySelector('.fav');
    const paint = (on) => {
      fav.textContent = on ? '★' : '☆';
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

  function grouped(list, keyFn, favs, labelFn = (k) => k) {
    const groups = new Map();
    for (const s of list) {
      const k = keyFn(s) ?? 'Altro';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(s);
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

  function draw() {
    tabsEl.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    const favs = getFavorites();
    let list = songs.filter((s) =>
      !query || [s.title, s.artist, s.genre, s.album].filter(Boolean).some((v) => v.toLowerCase().includes(query)));
    list = [...list].sort((a, b) => a.title.localeCompare(b.title, 'it'));
    body.replaceChildren();
    if (tab === 'favorites') list = list.filter((s) => favs.has(s.id));
    if (!list.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = tab === 'favorites'
        ? 'Nessun preferito: tocca la stella ☆ su un brano per aggiungerlo.'
        : 'Nessun brano trovato.';
      body.append(p);
      return;
    }
    if (tab === 'artist') body.append(grouped(list, (s) => s.artist, favs));
    else if (tab === 'genre') body.append(grouped(list, (s) => s.genre, favs));
    else if (tab === 'difficulty') body.append(grouped(list, (s) => s.difficulty, favs, (k) => DIFFICULTY[k] ?? k));
    else body.append(grid(list, favs));
  }

  draw();
}
