import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const scope = 'https://example.test/trainer/';
// versione attuale della cache, letta da sw.js (così il test non va aggiornato a ogni rilascio)
const current = /VERSION = `\$\{PREFIX\}([^`]+)`/.exec(source)[1];

function worker({ network = async () => new Response('online'), quota = false } = {}) {
  const handlers = {};
  const data = new Map();
  const removed = [];
  let shell = [];
  const cache = {
    async addAll(paths) { shell = paths; },
    async match(request) { return data.get(typeof request === 'string' ? request : request.url)?.clone(); },
    async put(request, response) {
      if (quota) throw new Error('Quota');
      data.set(request.url, response);
    },
  };
  const caches = {
    async open() { return cache; },
    async keys() { return ['other-app-v1', `gst:${scope}:old`, `gst:${scope}:${current}`, 'gst:https://example.test/other/:v1']; },
    async delete(key) { removed.push(key); },
  };
  runInNewContext(source, {
    self: { registration: { scope }, addEventListener: (name, callback) => { handlers[name] = callback; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches, fetch: network, URL, Response,
  });
  async function dispatch(name, request) {
    const tasks = [];
    let response;
    handlers[name]({ request, waitUntil: (promise) => tasks.push(promise), respondWith: (promise) => { response = promise; } });
    const result = await response;
    await Promise.all(tasks);
    return result;
  }
  return { dispatch, data, removed, get shell() { return shell; } };
}

test('la cache iniziale include tutti i moduli JS importati e il catalogo', async () => {
  const w = worker();
  await w.dispatch('install');
  for (const path of w.shell) assert.ok(existsSync(new URL(`../${path}`, import.meta.url)), path);
  assert.ok(w.shell.includes('songs/index.json'));
  for (const path of w.shell.filter((x) => x.endsWith('.js'))) {
    const module = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    for (const [, dependency] of module.matchAll(/from\s+['"]\.\/([^'"]+)['"]/g)) {
      assert.ok(w.shell.includes(`js/${dependency}`), `${path} richiede ${dependency}`);
    }
  }
});

test('aggiornare il worker elimina solo vecchie cache di questa installazione', async () => {
  const w = worker();
  await w.dispatch('activate');
  assert.deepEqual(w.removed, [`gst:${scope}:old`]);
});

test('offline usa la copia del brano; una risorsa mai aperta restituisce 503', async () => {
  const w = worker({ network: async () => { throw new Error('offline'); } });
  const req = new Request(`${scope}songs/example.json`);
  w.data.set(req.url, new Response('{"title":"Prova"}'));
  assert.equal(await (await w.dispatch('fetch', req)).text(), '{"title":"Prova"}');
  assert.equal((await w.dispatch('fetch', new Request(`${scope}songs/missing.json`))).status, 503);
});

test('una risposta 500 non sovrascrive la copia valida', async () => {
  const w = worker({ network: async () => new Response('errore', { status: 500 }) });
  const req = new Request(`${scope}songs/index.json`);
  w.data.set(req.url, new Response('catalogo valido'));
  assert.equal(await (await w.dispatch('fetch', req)).text(), 'catalogo valido');
  assert.equal(await w.data.get(req.url).text(), 'catalogo valido');
});

test('quota piena non interrompe la navigazione online', async () => {
  const w = worker({ quota: true });
  assert.equal(await (await w.dispatch('fetch', new Request(`${scope}index.html`))).text(), 'online');
});

test('richieste esterne, fuori scope e POST non vengono intercettate', async () => {
  const w = worker();
  for (const req of [new Request('https://external.test/'), new Request('https://example.test/other/'), new Request(`${scope}post`, { method: 'POST' })]) {
    assert.equal(await w.dispatch('fetch', req), undefined);
  }
});

test('navigazione offline con query usa la pagina iniziale in cache', async () => {
  const w = worker({ network: async () => { throw new Error('offline'); } });
  w.data.set(`${scope}index.html`, new Response('<main>Trainer</main>'));
  const response = await w.dispatch('fetch', { url: `${scope}?source=home`, method: 'GET', mode: 'navigate' });
  assert.equal(await response.text(), '<main>Trainer</main>');
});
