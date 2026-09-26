// Test end-to-end nel browser (Playwright). Uso:
//   npx http-server -p 8080 . &   node tests/e2e.mjs [http://localhost:8080] [cartella-screenshot]
// YouTube viene bloccato apposta: così si prova anche il clock interno di riserva.
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:8080';
const SHOTS = process.argv[3] ?? null;
const errors = [];
let failed = 0;

function check(cond, msg) {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failed++;
}

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});

for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['telefono', { width: 390, height: 844 }]]) {
  console.log(`\n— ${name} —`);
  const ctx = await browser.newContext({ viewport, ignoreHTTPSErrors: true, permissions: ['microphone'] });
  await ctx.route(/youtube\.com|ytimg\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  const shot = (n) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}-${n}.png` });

  // Libreria
  await page.goto(BASE);
  await page.waitForSelector('.song-card');
  check(await page.locator('.song-card').count() >= 1, 'la libreria mostra i brani');
  await page.fill('.search', 'zzzz');
  check(await page.locator('.song-card').count() === 0, 'la ricerca filtra');
  await page.fill('.search', 'salmo');
  await page.locator('.song-card .fav').first().click();
  await page.click('.tab[data-tab="favorites"]');
  check(await page.locator('.song-card').count() === 1, 'preferiti');
  await page.click('.tab[data-tab="artist"]');
  check(await page.locator('.group-title').count() >= 1, 'raggruppamento per artista');
  await shot('libreria');

  // Player
  await page.locator('.song-card').first().click();
  await page.waitForSelector('.player');
  await page.waitForFunction(() => document.querySelector('.k-row')
    || (document.querySelector('.panel-empty') && !document.querySelector('.panel-empty').textContent.includes('Caricamento')), null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const rows = await page.locator('.k-row').count();
  check(rows > 10, `testo karaoke caricato (${rows} righe)`);
  check(await page.locator('.k-chord').count() > 10, 'accordi posizionati sul testo');

  await page.click('[data-act="play"]');
  await page.waitForTimeout(3000);
  const now = await page.textContent('.now-chord');
  check(now && now !== '—', `HUD mostra l'accordo corrente (${now})`);
  check(await page.locator('.k-row.active').count() === 1, 'una riga del testo è attiva');
  await shot('player');

  await page.click('.panel-tab[data-tab="chords"]');
  check(await page.locator('.sheet-bar').count() > 40, 'scheda Accordi con le battute');
  await page.click('.panel-tab[data-tab="shapes"]');
  const diagrams = await page.locator('.diagram svg').count();
  check(diagrams >= 9, `scheda Diteggiature (${diagrams} diagrammi)`);
  await page.waitForTimeout(3000);
  check(await page.locator('.diagram.active').count() === 1, 'il diagramma dell\'accordo corrente si illumina');
  await shot('diteggiature');
  await page.click('.panel-tab[data-tab="lyrics"]');

  // Loop di una sezione + velocità progressiva
  await page.locator('.k-sec-loop').nth(1).click();
  check((await page.textContent('.loop-label')).startsWith('Loop'), 'loop di sezione attivo');
  await page.click('[data-act="ramp"]');
  await page.waitForTimeout(400);
  const speed0 = await page.textContent('.speed-pills .seg.active');
  check(speed0 === '50%', `velocità progressiva parte lenta (${speed0})`);
  // porta il tempo quasi alla fine del loop e verifica che accelera al giro
  await page.evaluate(() => {
    const lbl = document.querySelector('.scrub-loop');
    const sc = document.querySelector('.scrubber').getBoundingClientRect();
    const right = lbl.getBoundingClientRect().right - 2;
    const ev = (type) => new PointerEvent(type, { clientX: right, clientY: sc.top + 5, bubbles: true, pointerId: 1 });
    document.querySelector('.scrubber').dispatchEvent(ev('pointerdown'));
    document.querySelector('.scrubber').dispatchEvent(ev('pointerup'));
  });
  await page.waitForTimeout(2500);
  const speed1 = await page.textContent('.speed-pills .seg.active');
  check(speed1 !== '50%', `al giro del loop accelera (${speed1})`);
  await page.click('[data-act="loopClear"]');
  check(!(await page.locator('[data-act="ramp"].active').count()), 'cancellare il loop spegne la velocità progressiva');

  // Conteggio d'attacco
  await page.click('[data-act="play"]'); // pausa
  await page.click('[data-act="countin"]');
  await page.click('[data-act="play"]');
  await page.waitForTimeout(200);
  check(await page.isVisible('.count-overlay'), 'conteggio d\'attacco visibile');
  await page.waitForTimeout(4500); // 3 battiti al 60% di velocità
  check(!(await page.isVisible('.count-overlay')) && (await page.getAttribute('[data-act="play"]', 'class')).includes('playing'), 'dopo il conteggio parte');
  await page.click('[data-act="countin"]');

  // Accordatore con microfono finto (Chromium genera un tono)
  await page.click('[data-act="tuner"]');
  await page.waitForTimeout(2500);
  const tunerNote = await page.textContent('.tuner-note');
  check(tunerNote && tunerNote !== '—', `accordatore rileva una nota (${tunerNote})`);
  await shot('accordatore');
  await page.click('.dlg-tuner button[value="ok"]');

  // Sincronia e registrazione tempi
  await page.click('[data-act="sync"]');
  await page.click('[data-step="chords:0.05"]');
  check((await page.textContent('.out-chords')) === '+0.05 s', 'offset accordi regolabile');
  await page.click('[data-step="chords:-0.05"]');
  await page.click('.dlg-sync button[value="ok"]');
  await page.click('[data-act="record"]');
  for (let i = 0; i < 3; i++) { await page.waitForTimeout(400); await page.keyboard.press('t'); }
  check((await page.textContent('.rec-info')).includes('cambio 4/'), 'registrazione tempi con il tasto T');
  await page.click('[data-rec="done"]');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('gst:sync:salmo-cartine-corte') || '[]').length);
  check(saved === 3, 'tempi registrati salvati');
  await page.click('[data-act="sync"]');
  await page.click('[data-sync="resetTimes"]');

  // Impostazioni
  await page.click('[data-act="settings"]');
  await page.selectOption('.dlg-settings select[name="notation"]', 'it');
  await page.click('.dlg-settings button[value="ok"]');
  await page.waitForTimeout(300);
  check((await page.textContent('.k-chord')).match(/^(Do|Re|Mi|Fa|Sol|La|Si)/) !== null, 'notazione italiana');

  // Ritorno alla libreria
  await page.click('.player-head a');
  await page.waitForSelector('.library');
  check(true, 'si torna alla libreria');
  await ctx.close();
}
await browser.close();

if (errors.length) {
  console.log('\nErrori JavaScript:');
  errors.forEach((e) => console.log('  ' + e));
}
console.log(`\n${failed || errors.length ? 'FALLITO' : 'TUTTO OK'} (${failed} controlli falliti, ${errors.length} errori JS)`);
process.exit(failed || errors.length ? 1 : 0);
