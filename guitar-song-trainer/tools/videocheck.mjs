// Controlla nel browser (Playwright) che i video dei brani si possano davvero guardare dentro l'app
// e, con --fix, sostituisce quelli bloccati (errore 101/150: incorporamento vietato) con un video
// incorporabile della stessa durata del testo sincronizzato.
// Uso: node tools/videocheck.mjs [id ...] [--fix] [--base http://localhost:8080] [--skip file-con-id] [--pages 4]
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const FIX = args.includes('--fix');
const BASE = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://localhost:8080';
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const only = args.filter((a, i) => !a.startsWith('--') && !['--base', '--skip', '--pages'].includes(args[i - 1]));
const skip = new Set(opt('--skip') ? (await readFile(opt('--skip'), 'utf8')).split(/\s+/).filter(Boolean) : []);
const NPAGES = Number(opt('--pages') ?? 4);
const dir = new URL('../songs/', import.meta.url);
const index = JSON.parse(await readFile(new URL('index.json', dir)));
const todo = index.filter((e) => (!only.length || only.includes(e.id)) && !skip.has(e.id));

const browser = await chromium.launch();
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });

async function makePage() {
  // l'API di YouTube a volte non risponde: si riprova con una pagina nuova
  for (let attempt = 0; attempt < 4; attempt++) {
    const p = await ctx.newPage();
    await p.goto(`${BASE}/tools/yt-probe.html`);
    const ok = await p.evaluate(() => new Promise((r) => {
      if (window.YT?.Player) return r(true);
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      window.onYouTubeIframeAPIReady = () => r(true);
      document.head.append(s);
      setTimeout(() => r(false), 20000);
    }));
    if (ok) return p;
    await p.close();
  }
  throw new Error('API di YouTube non raggiungibile');
}

// 'ok' | 'errore N' | 'timeout'
async function probe(page, id) {
  return page.evaluate((vid) => new Promise((resolve) => {
    const d = document.createElement('div');
    document.body.append(d);
    let pl;
    const done = (v) => { clearTimeout(t); try { pl?.destroy(); } catch { /* niente */ } d.remove(); resolve(v); };
    const t = setTimeout(() => done('timeout'), 20000);
    pl = new YT.Player(d, {
      videoId: vid, playerVars: { playsinline: 1, mute: 1 },
      events: {
        onReady: () => { pl.mute(); pl.playVideo(); setTimeout(() => done('ok'), 3000); },
        onError: (e) => done(`errore ${e.data}`),
      },
    });
  }), id);
}

const norm = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function candidates(song) {
  const q = encodeURIComponent(`${song.artist.split(',')[0]} ${song.title}`);
  const res = await fetch(`https://www.youtube.com/results?search_query=${q}&hl=it`, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/124', 'Accept-Language': 'it-IT' } });
  const html = await res.text();
  const out = [];
  for (const chunk of html.split('"videoRenderer":{"videoId":"').slice(1)) {
    const vid = chunk.slice(0, 11);
    const c = chunk.slice(0, 20000);
    const L = /"lengthText":\{.*?"simpleText":"(?:(\d+):)?(\d+):(\d+)"/s.exec(c);
    const T = /"title":\{"runs":\[\{"text":"([^"]*)"/.exec(c);
    if (!L) continue;
    out.push({ vid, dur: Number(L[1] ?? 0) * 3600 + Number(L[2]) * 60 + Number(L[3]), title: T?.[1] ?? '' });
  }
  let dur = song.lyricsSource?.duration ?? 0;
  if (!dur && song.lyricsSource?.lrclibId) {
    // durata della versione del testo sincronizzato: il video deve durare uguale (±8 s)
    try { dur = (await (await fetch(`https://lrclib.net/api/get/${song.lyricsSource.lrclibId}`)).json()).duration ?? 0; } catch { /* niente */ }
  }
  if (!dur) return [];
  const t0 = norm(song.title).slice(0, 12);
  return out
    .filter((c) => c.vid !== song.youtubeId && !index.some((x) => x.youtubeId === c.vid) && Math.abs(c.dur - dur) <= 8 && norm(c.title).includes(t0)
      && !/live|cover|karaoke|reaction|piano|remix|sped|slowed|8d|tutorial|lezione/i.test(c.title))
    .sort((a, b) => Math.abs(a.dur - dur) - Math.abs(b.dur - dur))
    .slice(0, 5);
}

const pages = [];
for (let i = 0; i < NPAGES; i++) pages.push(await makePage());
const results = [];
let next = 0;
await Promise.all(pages.map(async (page) => {
  while (next < todo.length) {
    const e = todo[next++];
    let r = await probe(page, e.youtubeId);
    for (let k = 0; k < 2 && r === 'timeout'; k++) r = await probe(page, e.youtubeId); // rete lenta: si riprova
    results.push({ e, r });
    // si sostituisce solo un video che YouTube dichiara non guardabile (non per un tempo scaduto)
    const blocked = /^errore (100|101|150|2|5)$/.test(r);
    if (blocked && FIX) {
      const song = JSON.parse(await readFile(new URL(e.file, dir)));
      let fixed = null;
      for (const c of await candidates(song).catch(() => [])) {
        if ((await probe(page, c.vid)) === 'ok') { fixed = c; break; }
      }
      if (fixed) {
        song.youtubeId = fixed.vid;
        await writeFile(new URL(e.file, dir), JSON.stringify(song, null, 1));
        e.youtubeId = fixed.vid;
        // indice aggiornato subito: se il controllo si interrompe non resta disallineato
        await writeFile(new URL('index.json', dir), JSON.stringify(index, null, 2) + '\n');
        console.log(`↻ ${e.id}: ${r} → ${fixed.vid} (${fixed.dur} s)`);
      } else console.log(`✗ ${e.id}: ${r}, nessuna alternativa incorporabile`);
    } else console.log(`${r === 'ok' ? '✓' : '✗'} ${e.id}: ${r}`);
  }
}));
if (FIX) {
  await writeFile(new URL('index.json', dir), JSON.stringify(index, null, 2) + '\n');
}
const bad = results.filter((x) => x.r !== 'ok').length;
console.log(`\n${results.length - bad}/${results.length} video incorporabili${FIX ? ' (prima della correzione)' : ''}`);
await browser.close();
