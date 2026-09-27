// Regressioni 1.10: dati personali, pratica, libreria e cache offline reale.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';

// versione della cache e numero di brani letti dai file (il test non va aggiornato a ogni rilascio)
const swVersion = /VERSION = `\$\{PREFIX\}([^`]+)`/.exec(readFileSync(new URL('../sw.js', import.meta.url), 'utf8'))[1];
const catalogSize = JSON.parse(readFileSync(new URL('../songs/index.json', import.meta.url), 'utf8')).length;

const base = process.argv[2] ?? 'http://127.0.0.1:8080';
const shots = process.argv[3] ?? 'test-results';
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [];
try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['telefono', { width: 390, height: 844 }]]) {
    const ctx = await browser.newContext({ viewport, serviceWorkers: 'block', acceptDownloads: true });
    await ctx.route('**/*', (r) => new URL(r.request().url()).origin === new URL(base).origin ? r.continue() : r.abort());
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    await page.goto(base);
    await page.waitForSelector('.song-card');
    await page.evaluate(async () => {
      const { addPractice } = await import('./js/stats.js');
      const { saveUserSong } = await import('./js/usersongs.js');
      const { store } = await import('./js/store.js');
      const catalog = await (await fetch('songs/index.json')).json();
      const song = await (await fetch(`songs/${catalog[0].file}`)).json();
      saveUserSong({ ...song, id: catalog[0].id });
      addPractice(catalog[0].id, 600);
      store.set('favorites', [catalog[0].id]);
      store.set('setlists', [{ id: 'demo', name: 'La mia pratica', songs: [catalog[0].id] }]);
      store.set('settings', { inputDeviceId: 'dispositivo-locale', monitor: true });
      localStorage.setItem('altra-app', 'conservare');
    });
    await page.goto(`${base}/#/progressi`);
    await page.waitForSelector('#practice-goal');
    assert.equal(await page.locator('.practice-day').count(), 7);
    assert.equal(await page.locator('[role="progressbar"]').getAttribute('aria-valuenow'), '600');
    await page.selectOption('#practice-goal', '20');
    assert.equal(await page.locator('[role="progressbar"]').getAttribute('aria-valuemax'), '1200');
    await page.reload();
    await page.waitForSelector('#practice-goal');
    assert.equal(await page.inputValue('#practice-goal'), '20');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${shots}/${name}-progressi.png`, fullPage: true });

    await page.goto(`${base}/#/backup`);
    await page.waitForSelector('.backup-export');
    const downloadPromise = page.waitForEvent('download');
    await page.click('.backup-export');
    const download = await downloadPromise;
    const file = `${shots}/${name}-backup.json`;
    await download.saveAs(file);
    const exported = await readFile(file, 'utf8');
    const parsed = JSON.parse(exported);
    assert.equal(parsed.data.practiceGoal, 20);
    assert.equal(parsed.data.settings.inputDeviceId, undefined);
    assert.equal(parsed.data.favorites.length, 1);
    await page.evaluate(() => localStorage.setItem('gst:practiceGoal', '5'));
    await page.setInputFiles('.backup-file', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(exported) });
    await page.waitForSelector('.backup-confirm:not([hidden])');
    assert.equal(await page.evaluate(() => localStorage.getItem('gst:practiceGoal')), '5', 'anteprima senza scritture');
    await page.click('.backup-confirm');
    assert.match(await page.textContent('.backup-status'), /Dati ripristinati/);
    assert.equal(await page.evaluate(() => localStorage.getItem('gst:practiceGoal')), '20');
    assert.equal(await page.evaluate(() => localStorage.getItem('altra-app')), 'conservare');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('gst:settings')).monitor), false);
    const before = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    await page.setInputFiles('.backup-file', { name: 'errato.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"altro"}') });
    await page.waitForFunction(() => document.querySelector('.backup-status').textContent.includes('File non valido'));
    assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage })), before);
    assert.ok(await page.locator('.backup-confirm').isHidden());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${shots}/${name}-backup.png`, fullPage: true });

    await page.goto(`${base}/#/`);
    await page.waitForSelector('.song-card');
    await page.click('[data-tab="favorites"]');
    assert.equal(await page.locator('.song-card').count(), 1);
    const expected = await page.locator('.song-card').getAttribute('href');
    await page.click('.random-btn');
    await page.waitForURL(`**/${expected}`);
    await page.waitForSelector('.panel-tab');
    assert.equal(new URL(page.url()).hash, expected, 'A caso rispetta Preferiti');
    await page.goto(`${base}/#/`);
    await page.waitForSelector('.search');
    await page.fill('.search', 'nessun-risultato-12345');
    assert.ok(await page.locator('.random-btn').isDisabled());
    await page.click('[data-tab="setlists"]');
    assert.ok(await page.locator('.sl-new').isVisible(), 'scalette accessibili anche con ricerca vuota');
    assert.match(await page.textContent('.setlist-head'), /La mia pratica/);

    // I metadati digitati nell'editor restano testo, anche se contengono markup.
    await page.evaluate(() => {
      localStorage.setItem('gst:userSongs', JSON.stringify({ demo: { id: 'demo', title: 'Prova', artist: 'Autore', genre: '<img src=x onerror="window.injected=true">', youtubeId: '" onerror="window.injected=true', bpm: 80, timeSignature: [4, 4], sections: [{ name: 'Giro', bars: ['Em'] }] } }));
      localStorage.setItem('gst:libraryTab', 'all');
    });
    await page.reload();
    await page.waitForSelector('.song-card');
    assert.equal(await page.locator('.lib-filters img').count(), 0);
    assert.equal(await page.evaluate(() => window.injected), undefined);
    await page.goto(`${base}/#/song/%E0%A4%A`);
    await page.waitForSelector('.error a');
    await page.click('.error a');
    await page.waitForSelector('.song-card');
    console.log(`✓ ${name}: obiettivo, backup completo, import invalido, filtri, metadati e router`);
    await ctx.close();
  }

  // Qui il SW non è simulato: installazione, cache di un brano e ricarica senza rete.
  const ctx = await browser.newContext();
  await ctx.route('**/*', (r) => new URL(r.request().url()).origin === new URL(base).origin ? r.continue() : r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`offline: ${e.message}`));
  await page.goto(base);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((done) => navigator.serviceWorker.addEventListener('controllerchange', done, { once: true }));
  });
  const cachedSong = await page.evaluate(async () => {
    const songs = await (await fetch('songs/index.json')).json();
    await fetch(`songs/${songs[0].file}`);
    return songs[0];
  });
  await page.waitForFunction(async ({ file, swVersion }) => {
    const names = await caches.keys();
    const cache = await caches.open(names.find((name) => name.endsWith(`:${swVersion}`)));
    return !!(await cache.match(`songs/${file}`));
  }, { file: cachedSong.file, swVersion });
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('.song-card');
  assert.equal(await page.locator('.song-card').count(), catalogSize);
  await page.goto(`${base}/#/progressi`);
  await page.waitForSelector('#practice-goal');
  await page.goto(`${base}/#/backup`);
  await page.waitForSelector('.backup-export');
  await page.goto(`${base}/#/song/${cachedSong.id}`);
  await page.waitForSelector('.panel-tab', { timeout: 30000 });
  await page.click('.panel-tab[data-tab="chords"]');
  assert.ok(await page.locator('.sheet-bar').count() > 0);
  await ctx.close();
  assert.deepEqual(errors, [], 'nessuna eccezione JavaScript non gestita');
  console.log('✓ PWA reale: libreria, nuove pagine e brano già aperto funzionano offline');
} finally {
  await browser.close();
}
