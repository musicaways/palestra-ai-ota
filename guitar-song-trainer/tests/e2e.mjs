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
  const ctx = await browser.newContext({ viewport, ignoreHTTPSErrors: true, permissions: ['microphone'], acceptDownloads: true });
  await ctx.route(/youtube\.com|ytimg\.com/, (r) => r.abort());
  await ctx.addInitScript(() => { try { localStorage.setItem('gst:helpSeen', 'true'); } catch {} });
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

  // Tutti i brani della libreria si aprono senza errori
  if (name === 'desktop') {
    const ids = await page.evaluate(async () => (await (await fetch('songs/index.json')).json()).map((x) => x.id));
    check(ids.length >= 17, `libreria con ${ids.length} brani`);
    for (const id of ids) {
      await page.goto(`${BASE}/#/song/${id}`);
      await page.waitForSelector('.panel-tab[data-tab="chords"]', { timeout: 30000 });
      await page.click('.panel-tab[data-tab="chords"]');
      const bars = await page.locator('.sheet-bar').count();
      const missing = await page.evaluate(() => document.querySelectorAll('.diagram-missing').length);
      await page.click('.panel-tab[data-tab="shapes"]');
      const noShape = await page.locator('.diagram-missing').count();
      check(bars > 30 && noShape === 0, `${id}: ${bars} battute, diteggiature complete`);
      await page.click('.panel-tab[data-tab="lyrics"]');
    }
    await page.goto(BASE);
    await page.waitForSelector('.song-card');
    await page.fill('.search', 'salmo');
    await page.click('.tab[data-tab="artist"]');
  }

  // Player
  await page.locator('.song-card', { hasText: 'Cartine corte' }).first().click();
  await page.waitForSelector('.player');
  await page.waitForFunction(() => document.querySelector('.k-row')
    || (document.querySelector('.panel-empty') && !document.querySelector('.panel-empty').textContent.includes('Caricamento')), null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const rows = await page.locator('.k-row').count();
  check(rows > 10, `testo karaoke caricato (${rows} righe)`);
  check(await page.locator('.k-chord').count() > 10, 'accordi posizionati sul testo');
  check(await page.isVisible('.sync-badge'), `indicatore di sincronia: ${await page.textContent('.sync-badge')}`);

  // Guida rapida
  await page.click('[data-act="help"]');
  check(await page.locator('.dlg-help .help-list li').count() >= 5, 'guida rapida');
  await page.click('.dlg-help button[value="ok"]');

  // Allineamento col tocco: si tocca 1 s dopo l'inizio del canto → tutto si sposta di ~+1 s
  await page.click('[data-act="sync"]');
  await page.click('[data-sync="tap"]');
  check(await page.isVisible('.tapnow'), 'allineamento col tocco: pulsante ADESSO');
  const firstLine = await page.evaluate(() => {
    const lrc = JSON.parse(localStorage.getItem('gst:lrcCache:salmo-cartine-corte') || '{}').lrc || '';
    const m = /\[(\d+):(\d+(?:\.\d+)?)\][^\n]*\S/.exec(lrc);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  });
  await page.waitForFunction((t) => {
    const txt = document.querySelector('.t-cur').textContent.split(':');
    return Number(txt[0]) * 60 + Number(txt[1]) >= t + 1;
  }, firstLine, { timeout: 15000 });
  await page.click('.tapnow-btn');
  const shifted = await page.evaluate(() => ({ o: Number(localStorage.getItem('gst:offset:salmo-cartine-corte')), l: Number(localStorage.getItem('gst:lyricsOffset:salmo-cartine-corte')) }));
  check(shifted.o > 0.5 && shifted.o < 2.5 && Math.abs(shifted.o - shifted.l) < 0.01, `allineamento col tocco: testo e accordi spostati insieme (+${shifted.o.toFixed(2)} s)`);
  await page.click('[data-act="sync"]');
  await page.click('[data-step="all:-0.1"]');
  const after = await page.evaluate(() => Number(localStorage.getItem('gst:offset:salmo-cartine-corte')));
  check(Math.abs(after - (shifted.o - 0.1)) < 0.01, 'regolatore "Tutto"');
  await page.click('.dlg-sync button[value="ok"]');
  await page.evaluate(() => { localStorage.removeItem('gst:offset:salmo-cartine-corte'); localStorage.removeItem('gst:lyricsOffset:salmo-cartine-corte'); });

  await page.click('[data-act="play"]');
  await page.waitForTimeout(3000);
  const now = await page.textContent('.now-chord');
  check(now && now !== '—', `HUD mostra l'accordo corrente (${now})`);
  check(await page.isVisible('.stage-lyric'), 'riga del testo sul palco');
  const pageW = await page.evaluate(() => document.documentElement.scrollWidth);
  check(pageW <= viewport.width + 1, `nessuno scorrimento orizzontale (${pageW}px su ${viewport.width}px)`);
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
  const parseOut = (t) => Number(t.replace('−', '-').replace(' s', ''));
  const before = parseOut(await page.textContent('.out-chords'));
  await page.click('[data-step="chords:0.05"]');
  const afterStep = parseOut(await page.textContent('.out-chords'));
  check(Math.abs(afterStep - before - 0.05) < 0.001, `offset accordi regolabile (${before} → ${afterStep})`);
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
  await page.click('[data-act="settings"]');
  await page.selectOption('.dlg-settings select[name="notation"]', 'intl');
  await page.click('.dlg-settings button[value="ok"]');

  // Ingresso audio (microfono finto; il cavo Rocksmith viene scelto da solo se collegato)
  await page.click('[data-act="settings"]');
  await page.click('.dlg-settings [data-act="input"]');
  await page.waitForSelector('.dlg-input .in-device');
  await page.waitForTimeout(1200);
  check(await page.locator('.dlg-input .in-device option').count() >= 1, 'ingresso audio: elenco dei dispositivi');
  check((await page.textContent('.dlg-input .in-detected')).length > 0, `ingresso audio: ${await page.textContent('.dlg-input .in-detected')}`);
  // il microfono finto di Chromium emette un bip al secondo: si aspetta il primo
  const heard = await page.waitForFunction(() => (parseFloat(document.querySelector('.in-meter-fill').style.width) || 0) > 1, null, { timeout: 4000 }).then(() => true, () => false);
  check(heard, 'ingresso audio: l\'indicatore di livello si muove');
  await page.click('.dlg-input button[value="ok"]');

  // Capotasto: suggerito 3 → le forme diventano Em, Em/D, Cmaj7…
  await page.click('[data-act="capo"]');
  check((await page.textContent('.capo-suggest')).includes('3°'), 'capotasto suggerito al 3° tasto');
  await page.click('.capo-suggest [data-capo="3"]');
  await page.click('.dlg-capo button[value="ok"]');
  await page.click('.panel-tab[data-tab="shapes"]');
  const capoNames = await page.$$eval('.diagram figcaption', (els) => els.map((e) => e.textContent));
  check(capoNames.includes('Em') && capoNames.includes('Cmaj7') && !capoNames.includes('Gm'), `forme col capo 3 (${capoNames.slice(0, 4).join(' ')}…)`);
  check(await page.isVisible('.capo-badge'), 'badge "capo 3" nel palco');
  await shot('capo');
  await page.click('[data-act="capo"]');
  await page.click('.capo-grid [data-capo="0"]');
  await page.click('.dlg-capo button[value="ok"]');
  await page.click('.panel-tab[data-tab="lyrics"]');

  // Modalità ascolto (microfono finto di Chromium)
  await page.click('[data-act="listen"]');
  await page.waitForTimeout(1500);
  check(await page.isVisible('.score-hud'), 'modalità ascolto: punteggio visibile');
  check((await page.getAttribute('[data-act="listen"]', 'class')).includes('active'), 'modalità ascolto attiva');
  await page.click('[data-act="listen"]');
  check(!(await page.isVisible('.score-hud')), 'modalità ascolto si spegne');

  // Modalità concentrazione
  await page.click('[data-act="focus"]');
  check(!(await page.isVisible('.video-wrap')), 'modalità concentrazione nasconde il video');
  await page.click('[data-act="focus"]');
  check(await page.isVisible('.video-wrap'), 'e lo rimostra');

  // Ritorno alla libreria
  await page.click('.player-head a');
  await page.waitForSelector('.library');
  check(true, 'si torna alla libreria');
  check(await page.isVisible('.continue-btn'), `pulsante Continua (${await page.textContent('.continue-btn')})`);
  await page.selectOption('.sort', 'easy');
  const firstEasy = await page.locator('.song-card .level i.on').count();
  check(firstEasy > 0, 'ordinamento "Più facili"');
  await page.selectOption('.sort', 'title');
  await page.click('.tab[data-tab="recent"]');
  check(await page.locator('.song-card').count() === 1, 'scheda Recenti con il brano appena suonato');
  check(await page.locator('.song-card .practice').count() === 1, 'tempo di pratica sulla card');

  // Allenamento cambi accordo
  await page.click('a[href="#/allenamento"]');
  await page.waitForSelector('.drill-cfg');
  await page.click('[data-preset="0"]');
  await page.fill('.bpm', '120');
  await page.dispatchEvent('.bpm', 'input');
  await page.click('[data-beats="1"]');
  await page.click('.drill-start');
  await page.waitForTimeout(3500);
  const drillNow = await page.textContent('.now-chord');
  check(['Em', 'G'].includes(drillNow), `allenamento: alterna gli accordi (${drillNow})`);
  check(await page.locator('.drill-diagrams .diagram.active').count() === 1, 'allenamento: diagramma attivo');
  await shot('allenamento');
  await page.click('.drill-start');
  await page.click('.player-head a');
  await page.waitForSelector('.library');
  // Editor: nuovo brano → prova → libreria → modifica → esporta → elimina
  await page.click('a[href="#/editor"]');
  await page.waitForSelector('.editor-form');
  await page.fill('.editor-form [name="title"]', 'Prova Editor');
  await page.fill('.editor-form [name="artist"]', 'Test');
  await page.fill('.editor-form [name="chords"]', '[Strofa] x2\nC G Am F\n[Ritornello]\nF % C,G C');
  await page.fill('.editor-form [name="youtube"]', 'ciao');
  check((await page.textContent('.ed-check')).includes('YouTube'), 'editor: link YouTube sbagliato segnalato');
  await page.fill('.editor-form [name="youtube"]', 'https://youtu.be/OGgBYJsekX0');
  const edOk = await page.textContent('.ed-check .ed-ok');
  check(edOk.includes('12 battute'), `editor: riepilogo (${edOk})`);
  await shot('editor');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('.ed-export')]);
  check(download.suggestedFilename() === 'test-prova-editor.json', `editor: esporta ${download.suggestedFilename()}`);
  await page.click('.editor-form button[type="submit"]');
  await page.waitForSelector('.player');
  check((await page.textContent('.player-title .title')) === 'Prova Editor', 'editor: il brano si apre nel player');
  await page.click('.panel-tab[data-tab="chords"]');
  check(await page.locator('.sheet-bar').count() === 12, 'editor: 12 battute nel player');
  await page.click('.player-head a[aria-label="Torna alla libreria"]');
  await page.waitForSelector('.library');
  await page.click('.tab[data-tab="all"]');
  await page.fill('.search', '');
  check(await page.locator('.user-badge').count() === 1, 'libreria: badge "Tuo" sul brano creato');
  await page.goto(`${BASE}/#/editor/test-prova-editor`);
  await page.waitForSelector('.ed-delete');
  page.once('dialog', (d) => d.accept());
  await page.click('.ed-delete');
  await page.waitForSelector('.library');
  check(await page.locator('.user-badge').count() === 0, 'editor: brano eliminato');
  await page.goto(`${BASE}/#/editor/salmo-cartine-corte`);
  await page.waitForSelector('.editor-form');
  const txt = await page.inputValue('.editor-form [name="chords"]');
  check(txt.includes('[Bridge]') && txt.includes('G5 % F5 %'), 'editor: apre gli accordi di un brano esistente');
  await page.goto(BASE);
  await page.waitForSelector('.library');
  await page.waitForSelector('.library');
  await ctx.close();
}
await browser.close();

if (errors.length) {
  console.log('\nErrori JavaScript:');
  errors.forEach((e) => console.log('  ' + e));
}
console.log(`\n${failed || errors.length ? 'FALLITO' : 'TUTTO OK'} (${failed} controlli falliti, ${errors.length} errori JS)`);
process.exit(failed || errors.length ? 1 : 0);
