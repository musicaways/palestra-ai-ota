// Service worker: l'app funziona anche offline (il video YouTube ovviamente no).
const VERSION = 'gst-v8';
const SHELL = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icons/icon.svg',
  'js/app.js', 'js/library.js', 'js/player.js', 'js/fretboard.js', 'js/sheet.js',
  'js/timeline.js', 'js/music.js', 'js/clock.js', 'js/store.js', 'js/icons.js', 'js/lyrics.js', 'js/karaoke.js', 'js/diagram.js', 'js/tuner.js', 'js/audio.js', 'js/stats.js', 'js/drill.js', 'js/detect.js', 'js/songtext.js', 'js/usersongs.js', 'js/editor.js', 'js/input.js', 'js/syncmath.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Rete prima (così i brani nuovi arrivano subito), cache come riserva offline.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
