// Avvio e navigazione (hash router): #/ = libreria, #/song/<id> = studio del brano.
import { renderLibrary } from './library.js';
import { openPlayer } from './player.js';
import { openDrill } from './drill.js';
import { openEditor } from './editor.js';
import { getUserSong, mergeLibrary } from './usersongs.js';
import { renderLearn, openLesson } from './learn.js';
import { renderRecordings } from './recordings.js';

const root = document.getElementById('app');
let index = null;
let destroyCurrent = null;
let navToken = 0;

async function loadIndex() {
  if (!index) {
    const res = await fetch('songs/index.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Impossibile caricare la libreria');
    index = await res.json();
  }
  return mergeLibrary(index); // + brani creati o modificati dall'utente
}

async function loadSong(id) {
  const own = getUserSong(id);
  if (own) return own;
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
    const ed = /^#\/editor(?:\/(.+))?$/.exec(location.hash);
    if (ed) {
      document.body.classList.add('in-player');
      document.title = 'Editor · Guitar Song Trainer';
      const song = ed[1] ? await loadSong(decodeURIComponent(ed[1])) : null;
      if (token !== navToken) return;
      destroyCurrent = openEditor(root, song);
    } else if (/^#\/impara\/(.+)$/.test(location.hash)) {
      document.body.classList.add('in-player');
      destroyCurrent = openLesson(root, decodeURIComponent(location.hash.slice('#/impara/'.length)));
    } else if (location.hash === '#/impara') {
      document.title = 'Impara · Guitar Song Trainer';
      renderLearn(root);
      window.scrollTo(0, 0);
    } else if (location.hash === '#/registrazioni') {
      document.title = 'Registrazioni · Guitar Song Trainer';
      const cleanup = await renderRecordings(root);
      if (token !== navToken) cleanup(); else destroyCurrent = cleanup;
    } else if (location.hash === '#/allenamento') {
      document.body.classList.add('in-player');
      document.title = 'Allenamento cambi · Guitar Song Trainer';
      destroyCurrent = openDrill(root);
    } else if (m) {
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
