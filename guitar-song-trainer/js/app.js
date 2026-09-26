// Avvio e navigazione (hash router): #/ = libreria, #/song/<id> = studio del brano.
import { renderLibrary } from './library.js';
import { openPlayer } from './player.js';

const root = document.getElementById('app');
let index = null;
let destroyCurrent = null;
let navToken = 0;

async function loadIndex() {
  if (index) return index;
  const res = await fetch('songs/index.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Impossibile caricare la libreria');
  index = await res.json();
  return index;
}

async function loadSong(id) {
  const list = await loadIndex();
  const entry = list.find((s) => s.id === id);
  if (!entry) throw new Error(`Brano "${id}" non trovato`);
  const res = await fetch(`songs/${entry.file}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error('Impossibile caricare il brano');
  return { ...entry, ...(await res.json()) };
}

function showError(err) {
  root.innerHTML = `<div class="error"><p></p><a class="ctl" href="#/">Torna alla libreria</a></div>`;
  root.querySelector('p').textContent = err.message;
}

async function route() {
  const token = ++navToken;
  destroyCurrent?.();
  destroyCurrent = null;
  document.body.classList.remove('in-player');
  const m = /^#\/song\/(.+)$/.exec(location.hash);
  try {
    if (m) {
      document.body.classList.add('in-player');
      root.innerHTML = '<div class="loading">Caricamento…</div>';
      const song = await loadSong(decodeURIComponent(m[1]));
      if (token !== navToken) return;
      const destroy = await openPlayer(root, song);
      if (token !== navToken) destroy();
      else destroyCurrent = destroy;
    } else {
      document.title = 'Guitar Song Trainer';
      const songs = await loadIndex();
      if (token !== navToken) return;
      renderLibrary(root, songs);
    }
  } catch (err) {
    console.error(err);
    if (token === navToken) showError(err);
  }
}

window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
