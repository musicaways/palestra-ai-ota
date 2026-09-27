// Service worker: l'app funziona anche offline (il video YouTube ovviamente no).
// Ogni installazione ha una cache propria, anche su siti con più applicazioni.
const PREFIX = `gst:${self.registration.scope}:`;
const VERSION = `${PREFIX}v2.2.0`;
const SHELL = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icons/icon.svg',
  'icons/icon-192.png', 'icons/icon-512.png', 'songs/index.json',
  'js/backup.js', 'js/practice.js',
  'js/app.js', 'js/library.js', 'js/player.js', 'js/fretboard.js', 'js/sheet.js',
  'js/timeline.js', 'js/music.js', 'js/clock.js', 'js/store.js', 'js/icons.js', 'js/lyrics.js', 'js/karaoke.js', 'js/diagram.js', 'js/tuner.js', 'js/audio.js', 'js/stats.js', 'js/drill.js', 'js/detect.js', 'js/songtext.js', 'js/usersongs.js', 'js/editor.js', 'js/input.js', 'js/syncmath.js', 'js/arrangement.js', 'js/amp.js', 'js/lessons.js', 'js/learn.js', 'js/camera.js', 'js/recordings.js', 'js/progress.js', 'js/chords.js', 'js/setlists.js', 'js/audiofiles.js', 'js/wordtiming.js', 'js/audioanalysis.js', 'js/midi.js', 'js/online.js', 'js/tab.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Rete prima (così i brani nuovi arrivano subito), cache come riserva offline.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const scope = new URL(self.registration.scope);
  if (e.request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    let response;
    try {
      response = await fetch(e.request);
      if (response.ok) {
        // Un errore/quota di cache non deve interrompere una risposta di rete valida.
        e.waitUntil(cache.put(e.request, response.clone()).catch(() => {}));
        return response;
      }
    } catch { /* rete assente: prova la copia locale */ }
    const cached = await cache.match(e.request, { ignoreSearch: true });
    if (cached) return cached;
    // I link alla SPA possono includere query diverse dalla pagina salvata.
    if (e.request.mode === 'navigate') {
      const shell = await cache.match(new URL('index.html', scope).href);
      if (shell) return shell;
    }
    return response ?? new Response('Risorsa non disponibile offline. Aprila prima con una connessione.', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  })());
});
