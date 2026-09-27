import { chromium } from 'playwright';
const b = await chromium.launch();
for (const id of process.argv.slice(2)) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 768 }, ignoreHTTPSErrors: true });
  await ctx.route(/youtube\.com|ytimg\.com|spotify|deezer|musicbrainz/, (r) => r.abort());
  await ctx.addInitScript(() => localStorage.setItem('gst:helpSeen', 'true'));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto(`http://localhost:8080/#/song/${id}`);
  await p.waitForTimeout(2000);
  await p.evaluate(() => document.querySelector('[data-act="part"]').click());
  const t0 = Date.now();
  await p.click('.dlg-part [data-midi="find"]');
  await p.waitForFunction(() => !document.querySelector('.dlg-part [data-midi="find"][disabled]'), null, { timeout: 120000 }).catch(() => {});
  const r = await p.evaluate(() => ({ status: document.querySelector('.midi-status')?.textContent, info: document.querySelector('.midi-info')?.textContent,
    cands: [...document.querySelectorAll('.midi-cand')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()) }));
  console.log(id, Math.round((Date.now() - t0) / 1000) + 's', JSON.stringify(r));
  await ctx.close();
}
await b.close();
