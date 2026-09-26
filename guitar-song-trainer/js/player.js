// Schermata di studio di un brano: palco con manico 3D, video, trasporto, testo karaoke.
import { YouTubeClock, FreeClock } from './clock.js';
import { buildTimeline, eventIndexAt, beatAt } from './timeline.js';
import { Fretboard } from './fretboard.js';
import { Sheet } from './sheet.js';
import { Karaoke } from './karaoke.js';
import { loadSyncedLyrics, looksLikeLrc, clearLyricsCache } from './lyrics.js';
import { displayChord, chordColor, shapeNameWithCapo, suggestCapo } from './music.js';
import { click, WakeLock } from './audio.js';
import { addPractice, recordRate, recordAccuracy, getStats } from './stats.js';
import { Listener, matchChord } from './detect.js';
import { mountInputPanel } from './input.js';
import { icon } from './icons.js';
import { chordDiagram } from './diagram.js';
import { Tuner } from './tuner.js';
import { store, loadSettings, saveSettings, getFavorites, toggleFavorite } from './store.js';

const fmt = (t) => {
  if (!isFinite(t) || t < 0) t = 0;
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
};
const signed = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)} s`;

export async function openPlayer(root, song) {
  const settings = loadSettings();
  const key = (k) => `${k}:${song.id}`;
  let offset = store.get(key('offset'), 0);
  let lyricsOffset = store.get(key('lyricsOffset'), song.lyricsSource?.offset ?? 0);
  let sync = store.get(key('sync'), null) ?? song.sync ?? null;
  let plainLyrics = store.get(key('lyrics'), []);
  let synced = null; // { lines, source }
  let panelTab = store.get('panelTab', 'lyrics');
  let tl = buildTimeline(song, { offset, sync });
  let loop = { on: false, a: null, b: null, label: '' };
  let clock = null;
  let raf = 0;
  let lastSeekAt = 0;
  let lastBeatKey = '';
  let recorder = null;
  let destroyed = false;
  let lastDiagram = null;
  let ramp = false;
  let counting = null; // conteggio d'attacco in corso
  let tuner = null;
  let capo = store.get(key('capo'), song.capo ?? 0);
  let practiceAcc = 0;
  let lastFrameAt = performance.now();
  const wake = new WakeLock();
  let listener = null;
  let judge = null; // { idx, frames, hits } valutazione dell'accordo corrente
  let score = { hits: 0, total: 0, streak: 0, bestStreak: 0 };

  root.innerHTML = `
  <div class="player">
    <header class="player-head">
      <a class="icon-btn" href="#/" aria-label="Torna alla libreria">${icon('back')}</a>
      <div class="player-title"><div class="title"></div><div class="artist"></div></div>
      <button class="icon-btn fav" aria-label="Preferito"></button>
      <a class="icon-btn" href="#/editor/${encodeURIComponent(song.id)}" aria-label="Modifica il brano" title="Modifica il brano">${icon('text')}</a>
      <button class="icon-btn" data-act="focus" aria-label="Modalità concentrazione" title="Modalità concentrazione: nasconde video e controlli">${icon('focus')}</button>
      <button class="icon-btn" data-act="settings" aria-label="Impostazioni">${icon('settings')}</button>
    </header>

    <section class="stage">
      <canvas class="fretboard" aria-label="Manico della chitarra"></canvas>
      <div class="count-overlay" hidden></div>
      <div class="toast" hidden></div>
      <div class="hud">
        <div class="hud-block now">
          <div class="hud-label"><span class="section-name">Intro</span> <span class="capo-badge" hidden></span></div>
          <div class="hud-chord now-chord">—</div>
          <div class="score-hud" hidden><span class="acc">—</span><span class="streak"></span><span class="hear"></span></div>
        </div>
        <div class="hud-center">
          <div class="beats"></div>
          <div class="strum"></div>
        </div>
        <div class="hud-block next">
          <div class="hud-label">Prossimo <span class="countdown"></span></div>
          <div class="hud-chord next-chord">—</div>
        </div>
      </div>
    </section>

    <div class="player-main">
      <div class="left-col">
        <div class="video-wrap"><div class="video"></div><div class="video-msg" hidden></div></div>
        <div class="transport card">
          <div class="scrubber" title="Posizione nel brano">
            <div class="scrub-sections"></div>
            <div class="scrub-loop" hidden></div>
            <div class="scrub-fill"></div>
            <div class="scrub-head"></div>
          </div>
          <div class="time-row"><span class="t-cur">0:00</span><span class="loop-label"></span><span class="t-tot">0:00</span></div>
          <div class="transport-row">
            <div class="speed-pills" role="group" aria-label="Velocità"></div>
            <div class="play-group">
              <button class="round" data-act="back" title="Indietro 5 s (←)">${icon('rewind')}</button>
              <button class="round big" data-act="play" title="Play / Pausa (spazio)">${icon('play', 26)}</button>
              <button class="round" data-act="fwd" title="Avanti 5 s (→)">${icon('forward')}</button>
            </div>
            <div class="loop-group" role="group" aria-label="Loop">
              <button class="seg" data-act="loopA" title="Inizio loop qui ([)">A</button>
              <button class="seg" data-act="loopB" title="Fine loop qui (])">B</button>
              <button class="seg" data-act="loopToggle" title="Loop on/off (L)">${icon('loop', 16)}</button>
              <button class="seg" data-act="ramp" title="Velocità progressiva: a ogni ripetizione del loop accelera fino al 100%">${icon('ramp', 16)}</button>
              <button class="seg" data-act="loopClear" title="Cancella loop">${icon('close', 16)}</button>
            </div>
          </div>
          <div class="tools-row">
            <button class="chip-btn" data-act="metro" title="Click del metronomo">${icon('metronome', 16)} Click</button>
            <button class="chip-btn" data-act="countin" title="Una battuta di conteggio prima di partire">${icon('count', 16)} Conteggio</button>
            <button class="chip-btn" data-act="listen" title="Ascolta dal microfono e controlla se suoni l'accordo giusto">${icon('mic', 16)} Ascolto</button>
            <button class="chip-btn" data-act="capo" title="Capotasto: accordi più facili">${icon('capo', 16)} <span class="capo-label">Capotasto</span></button>
            <button class="chip-btn" data-act="tuner" title="Accorda la chitarra col microfono">${icon('tuner', 16)} Accordatore</button>
            <button class="chip-btn" data-act="sync" title="Allinea accordi e testo al video">${icon('sliders', 16)} Sincronia</button>
            <button class="chip-btn" data-act="record" title="Registra i cambi accordo toccando a tempo">${icon('target', 16)} Registra tempi</button>
            <button class="chip-btn" data-act="info" title="Informazioni sul brano">${icon('info', 16)} Info</button>
          </div>
        </div>
      </div>
      <aside class="panel card">
        <div class="panel-tabs" role="tablist">
          <button class="panel-tab" data-tab="lyrics">${icon('mic', 16)} Testo</button>
          <button class="panel-tab" data-tab="chords">${icon('grid', 16)} Accordi</button>
          <button class="panel-tab" data-tab="shapes">${icon('hand', 16)} Diteggiature</button>
          <span class="panel-source"></span>
        </div>
        <div class="panel-body lyrics-body"></div>
        <div class="panel-body chords-body"></div>
        <div class="panel-body shapes-body"></div>
      </aside>
    </div>

    <div class="recorder" hidden>
      <div class="rec-info"></div>
      <button class="rec-tap">TAP</button>
      <div class="rec-actions">
        <button class="chip-btn" data-rec="undo">Annulla ultimo</button>
        <button class="chip-btn" data-rec="restart">Ricomincia</button>
        <button class="chip-btn" data-rec="export">Esporta JSON</button>
        <button class="chip-btn primary" data-rec="done">Fine</button>
      </div>
    </div>

    <dialog class="dlg dlg-settings">
      <form method="dialog">
        <h3>Impostazioni</h3>
        <label><span>Notazione</span>
          <select name="notation"><option value="intl">Internazionale (C D E)</option><option value="it">Italiana (Do Re Mi)</option></select></label>
        <label class="check"><input type="checkbox" name="leftHanded"> Chitarra mancina (manico specchiato)</label>
        <label class="check"><input type="checkbox" name="highStringOnTop"> Mi cantino in alto (come le tablature)</label>
        <label class="check"><input type="checkbox" name="showNoteNames"> Nome delle note al posto delle dita</label>
        <label class="check"><input type="checkbox" name="autoScroll"> Scorrimento automatico del testo</label>
        <button type="button" class="chip-btn" data-act="input">${icon('guitar', 16)} Ingresso audio (microfono o cavo Rocksmith)</button>
        <p class="hint">Scorciatoie: spazio play/pausa · ← → ±5 s · [ ] punti A/B · L loop · T tap in registrazione</p>
        <menu><button value="ok" class="chip-btn primary">Chiudi</button></menu>
      </form>
    </dialog>

    <dialog class="dlg dlg-sync">
      <form method="dialog">
        <h3>Sincronia</h3>
        <div class="sync-line">
          <div><b>Accordi</b><span class="hint">se arrivano in ritardo premi −, se sono in anticipo +</span></div>
          <div class="stepper"><button type="button" class="round" data-step="chords:-0.05">−</button><output class="out-chords"></output><button type="button" class="round" data-step="chords:0.05">+</button></div>
        </div>
        <div class="sync-line">
          <div><b>Testo</b><span class="hint">sposta il testo karaoke rispetto al video</span></div>
          <div class="stepper"><button type="button" class="round" data-step="lyrics:-0.1">−</button><output class="out-lyrics"></output><button type="button" class="round" data-step="lyrics:0.1">+</button></div>
        </div>
        <p class="hint">Per un allineamento perfetto degli accordi usa <b>Registra tempi</b>: tocchi TAP a ogni cambio mentre il video suona.</p>
        <div class="sync-actions">
          <button type="button" class="chip-btn" data-sync="paste">${icon('text', 16)} Incolla il tuo testo</button>
          <button type="button" class="chip-btn" data-sync="reload">Riscarica testo</button>
          <button type="button" class="chip-btn" data-sync="resetTimes">Azzera tempi registrati</button>
        </div>
        <menu><button value="ok" class="chip-btn primary">Fatto</button></menu>
      </form>
    </dialog>

    <dialog class="dlg dlg-lyrics">
      <form method="dialog">
        <h3>Il tuo testo</h3>
        <p class="hint">Incolla il testo. Se è in formato <b>LRC</b> (righe come <code>[00:12.34] …</code>) diventa karaoke
        sincronizzato. Altrimenti separa i blocchi con una riga vuota: ogni blocco va sotto una riga di accordi.
        Resta salvato solo su questo dispositivo. Lascia vuoto per tornare al testo scaricato.</p>
        <textarea name="text" rows="14" spellcheck="false"></textarea>
        <menu>
          <button value="cancel" class="chip-btn">Annulla</button>
          <button value="save" class="chip-btn primary">Salva</button>
        </menu>
      </form>
    </dialog>

    <dialog class="dlg dlg-capo"><form method="dialog"><h3>Capotasto</h3>
      <p class="hint">Con il capotasto il brano suona uguale, ma usi forme di accordo diverse, spesso più facili.
      Il manico, i diagrammi e il testo mostrano le forme da suonare.</p>
      <div class="capo-grid"></div>
      <div class="capo-suggest"></div>
      <div class="capo-preview"></div>
      <menu><button value="ok" class="chip-btn primary">Fatto</button></menu></form></dialog>

    <dialog class="dlg dlg-input"><form method="dialog"><h3>Ingresso audio</h3><div class="input-panel"></div>
      <menu><button value="ok" class="chip-btn primary">Fatto</button></menu></form></dialog>

    <dialog class="dlg dlg-tuner"><form method="dialog"><h3>Accordatore</h3><div class="tuner"></div>
      <button type="button" class="chip-btn" data-act="input">${icon('guitar', 16)} Ingresso audio</button>
      <p class="hint">Accordatura standard: Mi La Re Sol Si Mi. Pizzica una corda e attendi che la lancetta si fermi al centro.</p>
      <menu><button value="ok" class="chip-btn primary">Chiudi</button></menu></form></dialog>

    <dialog class="dlg dlg-info"><form method="dialog"><h3></h3><div class="info-body"></div>
      <menu><button value="ok" class="chip-btn primary">Chiudi</button></menu></form></dialog>
  </div>`;

  const $ = (s) => root.querySelector(s);
  const hudNow = $('.now-chord');
  const hudNext = $('.next-chord');
  const countdown = $('.countdown');
  const beatsEl = $('.beats');
  const strumEl = $('.strum');
  const sectionName = $('.section-name');
  const playBtn = $('[data-act="play"]');
  const tCur = $('.t-cur');
  const tTot = $('.t-tot');
  const scrub = $('.scrubber');
  const scrubHead = $('.scrub-head');
  const scrubFill = $('.scrub-fill');
  const scrubLoop = $('.scrub-loop');
  const loopLabel = $('.loop-label');
  const videoMsg = $('.video-msg');
  const lyricsBody = $('.lyrics-body');
  const chordsBody = $('.chords-body');
  const panelSource = $('.panel-source');
  const shapesBody = $('.shapes-body');
  const countEl = $('.count-overlay');
  const toastEl = $('.toast');

  $('.player-title .title').textContent = song.title;
  $('.player-title .artist').textContent = song.artist;
  document.title = `${song.title} · ${song.artist}`;

  const favBtn = $('.player-head .fav');
  const paintFav = (on) => { favBtn.innerHTML = icon(on ? 'starFill' : 'star'); favBtn.classList.toggle('on', on); };
  paintFav(getFavorites().has(song.id));
  favBtn.addEventListener('click', () => paintFav(toggleFavorite(song.id)));

  // ---------- Palco, testo e griglia ----------
  const fretboard = new Fretboard($('.fretboard'));
  fretboard.customShapes = song.shapes ?? null;
  const handlers = { onSeek: (t) => seek(t), onLoop: (a, b, label) => setLoop(a, b, label) };
  const sheet = new Sheet(chordsBody, handlers);
  const karaoke = new Karaoke(lyricsBody, handlers);

  function renderPanel() {
    root.querySelectorAll('.panel-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === panelTab));
    lyricsBody.hidden = panelTab !== 'lyrics';
    chordsBody.hidden = panelTab !== 'chords';
    shapesBody.hidden = panelTab !== 'shapes';
    const names = [...new Set(tl.events.map((e) => e.name))];
    shapesBody.innerHTML = `<p class="hint">Gli accordi del brano, nell'ordine in cui compaiono. Quello che stai suonando si illumina.${capo ? ` <b>Capotasto al ${capo}° tasto</b>: i diagrammi partono dal capotasto.` : ''}</p>
      <div class="diagram-grid">${names.map((n) => chordDiagram(n, settings, capo ? null : song.shapes)).join('')}</div>`;
    lastDiagram = null;
    if (synced?.lines.length) {
      karaoke.render(synced.lines, tl, settings, lyricsOffset);
      panelSource.textContent = synced.source === 'LRCLIB' ? 'testo: LRCLIB' : 'testo: tuo';
    } else {
      lyricsBody.innerHTML = `<div class="panel-empty">${synced === null ? 'Caricamento del testo…' : 'Testo sincronizzato non disponibile.<br>Puoi incollarne uno da <b>Sincronia → Incolla il tuo testo</b>, oppure usare la scheda Accordi.'}</div>`;
      panelSource.textContent = '';
    }
    sheet.render(tl, settings, plainLyrics);
  }

  root.querySelectorAll('.panel-tab').forEach((b) => b.addEventListener('click', () => {
    panelTab = b.dataset.tab;
    store.set('panelTab', panelTab);
    renderPanel();
    karaoke.cur = -2;
    sheet.curBar = -2;
    lastIdx = -2;
  }));

  function rebuild() {
    tl = buildTimeline(song, { offset, sync });
    // con il capotasto si mostrano le forme da suonare (il brano suona uguale)
    if (capo) tl.events.forEach((ev) => { ev.sounding = ev.name; ev.name = shapeNameWithCapo(ev.name, capo); });
    fretboard.capo = capo;
    fretboard.customShapes = capo ? null : song.shapes ?? null;
    const badge = root.querySelector('.capo-badge');
    if (badge) { badge.hidden = !capo; badge.textContent = `capo ${capo}`; }
    const cl = root.querySelector('.capo-label');
    if (cl) cl.textContent = capo ? `Capo ${capo}` : 'Capotasto';
    root.querySelector('[data-act="capo"]')?.classList.toggle('active', !!capo);
    renderPanel();
    drawScrubSections();
    paintLoop();
    beatsEl.replaceChildren(...Array.from({ length: tl.bpb }, (_, i) => {
      const d = document.createElement('span');
      d.className = 'beat' + (i === 0 ? ' downbeat' : '');
      return d;
    }));
    strumEl.replaceChildren();
    for (const ch of (tl.strum ?? '').replace(/\s+/g, '')) {
      const s = document.createElement('span');
      s.className = 'strum-slot';
      s.textContent = ch === 'D' ? '↓' : ch === 'U' ? '↑' : ch === 'X' ? '✕' : '·';
      strumEl.append(s);
    }
  }

  async function loadLyrics() {
    synced = null;
    const res = await loadSyncedLyrics(song);
    if (destroyed) return;
    synced = res ?? { lines: [], source: null };
    renderPanel();
  }

  // ---------- Orologio: YouTube o interno ----------
  const onState = (playing) => {
    if (playing) wake.on(); else wake.off();
    playBtn.innerHTML = icon(playing ? 'pause' : 'play', 26);
    playBtn.classList.toggle('playing', playing);
  };
  rebuild();
  loadLyrics();
  try {
    if (!song.youtubeId) throw new Error('Nessun video associato al brano');
    clock = await YouTubeClock.create($('.video'), song.youtubeId, { onStateChange: onState });
  } catch (err) {
    if (destroyed) return () => {};
    clock = new FreeClock(Math.max(tl.end, 150) + 4, { onStateChange: onState });
    videoMsg.hidden = false;
    videoMsg.innerHTML = `<div>${icon('guitar', 40)}</div><p></p>`;
    videoMsg.querySelector('p').textContent = `${err.message}. Puoi comunque esercitarti: accordi, testo e metronomo funzionano anche senza video.`;
    $('.video').remove();
  }
  if (destroyed) { clock.destroy(); return () => {}; }

  const speedBox = $('.speed-pills');
  const rates = clock.rates().filter((r) => r >= 0.5 && r <= 1.25);
  function paintSpeed() {
    const cur = clock.getRate();
    speedBox.querySelectorAll('button').forEach((b) => b.classList.toggle('active', Math.abs(Number(b.dataset.rate) - cur) < 0.001));
  }
  for (const r of rates) {
    const b = document.createElement('button');
    b.className = 'seg';
    b.dataset.rate = r;
    b.textContent = `${Math.round(r * 100)}%`;
    b.addEventListener('click', () => { clock.setRate(r); setTimeout(paintSpeed, 150); });
    speedBox.append(b);
  }
  paintSpeed();
  drawScrubSections();

  // ---------- Loop ----------
  function setLoop(a, b, label = '') {
    loop = { on: true, a: Math.max(0, a), b, label };
    paintLoop();
    seek(loop.a);
    clock.play();
  }

  function paintLoop() {
    const dur = totalDuration();
    const valid = loop.a != null && loop.b != null && loop.b > loop.a;
    scrubLoop.hidden = !valid;
    if (valid) {
      scrubLoop.style.left = `${(loop.a / dur) * 100}%`;
      scrubLoop.style.width = `${((loop.b - loop.a) / dur) * 100}%`;
      scrubLoop.classList.toggle('off', !loop.on);
    }
    $('[data-act="loopToggle"]').classList.toggle('active', loop.on && valid);
    $('[data-act="loopA"]').classList.toggle('active', loop.a != null);
    $('[data-act="loopB"]').classList.toggle('active', loop.b != null);
    loopLabel.textContent = valid
      ? `Loop ${loop.label || `${fmt(loop.a)}–${fmt(loop.b)}`}${loop.on ? '' : ' (off)'}`
      : loop.a != null ? `A ${fmt(loop.a)}` : '';
  }

  function totalDuration() {
    return Math.max(clock?.duration() || 0, tl.end + 1);
  }

  function drawScrubSections() {
    const dur = totalDuration();
    $('.scrub-sections').replaceChildren(...tl.sections.map((s, i) => {
      const d = document.createElement('div');
      d.className = 'scrub-sec' + (i % 2 ? ' alt' : '');
      d.style.left = `${(s.start / dur) * 100}%`;
      d.style.width = `${((s.end - s.start) / dur) * 100}%`;
      d.title = s.name;
      d.textContent = s.name;
      return d;
    }));
  }

  function seek(t) {
    clock.seek(Math.max(0, t));
    lastSeekAt = performance.now();
  }

  scrub.addEventListener('pointerdown', (e) => {
    const r = scrub.getBoundingClientRect();
    const move = (ev) => seek(((ev.clientX - r.left) / r.width) * totalDuration());
    move(e);
    scrub.setPointerCapture(e.pointerId);
    scrub.onpointermove = move;
    scrub.onpointerup = () => { scrub.onpointermove = null; };
  });

  // ---------- Registrazione dei tempi (tap) ----------
  const recEl = $('.recorder');
  const recInfo = $('.rec-info');

  function startRecorder() {
    recorder = { times: [] };
    recEl.hidden = false;
    paintRecorder();
    seek(Math.max(0, (tl.events[0]?.start ?? 0) - 4));
    clock.play();
  }

  function paintRecorder() {
    if (!recorder) return;
    const i = recorder.times.length;
    const ev = tl.events[i];
    recInfo.innerHTML = ev
      ? `Tocca <b>TAP</b> (o <kbd>T</kbd>) quando arriva <b class="rec-chord"></b>
         <span class="muted">· cambio ${i + 1}/${tl.events.length} · ${tl.sections[ev.section].name}</span>`
      : 'Tutti i cambi registrati! Premi <b>Fine</b> per salvarli o <b>Esporta JSON</b>.';
    const c = recInfo.querySelector('.rec-chord');
    if (c) { c.textContent = displayChord(ev.name, settings.notation); c.style.color = chordColor(ev.name); }
  }

  function tap() {
    if (!recorder || recorder.times.length >= tl.events.length) return;
    recorder.times.push(Number((clock.getTime() - offset).toFixed(3)));
    applyRecorded();
    paintRecorder();
  }

  function applyRecorded() {
    sync = recorder.times.length ? [...recorder.times] : (store.get(key('sync'), null) ?? song.sync ?? null);
    rebuild();
  }

  function exportJson() {
    const times = recorder?.times.length ? recorder.times : sync;
    const out = { ...song, sync: times ?? undefined };
    delete out.file;
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${song.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    navigator.clipboard?.writeText(JSON.stringify({ id: song.id, sync: times })).catch(() => {});
  }

  recEl.addEventListener('click', (e) => {
    const act = e.target.closest('[data-rec]')?.dataset.rec;
    if (act === 'undo') { recorder.times.pop(); applyRecorded(); paintRecorder(); }
    if (act === 'restart') { recorder.times = []; applyRecorded(); startRecorder(); }
    if (act === 'export') exportJson();
    if (act === 'done') {
      if (recorder.times.length) store.set(key('sync'), recorder.times);
      recorder = null;
      recEl.hidden = true;
    }
  });
  $('.rec-tap').addEventListener('pointerdown', (e) => { e.preventDefault(); tap(); });

  // ---------- Avvisi, conteggio d'attacco, velocità progressiva ----------
  let toastTimer = 0;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    toastEl.classList.remove('show');
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 1600);
  }

  function togglePlay() {
    if (counting) { cancelCountIn(); return; }
    if (clock.playing || !settings.countIn) { clock.toggle(); return; }
    // una battuta di click prima di partire, al tempo (rallentato) del brano
    const beat = tl.beatDur / clock.getRate();
    let n = 0;
    const tick = () => {
      if (n >= tl.bpb) { cancelCountIn(); clock.play(); return; }
      countEl.hidden = false;
      countEl.textContent = String(n + 1);
      countEl.classList.remove('pop');
      void countEl.offsetWidth;
      countEl.classList.add('pop');
      click(n === 0);
      n++;
      counting = setTimeout(tick, beat * 1000);
    };
    counting = setTimeout(tick, 0);
  }

  function cancelCountIn() {
    clearTimeout(counting);
    counting = null;
    countEl.hidden = true;
  }

  function sortedRates() {
    return [...new Set(clock.rates())].filter((r) => r >= 0.5 && r <= 1).sort((a, b) => a - b);
  }

  function onLoopWrap() {
    if (!ramp) return;
    const cur = clock.getRate();
    recordRate(song.id, cur);
    const next = sortedRates().find((r) => r > cur + 0.001);
    if (next) {
      clock.setRate(next);
      setTimeout(paintSpeed, 150);
      toast(`Velocità ${Math.round(next * 100)}%`);
    } else toast('Velocità piena: ottimo lavoro!');
  }

  function toggleRamp() {
    ramp = !ramp;
    $('[data-act="ramp"]').classList.toggle('active', ramp);
    if (!ramp) return;
    if (loop.a == null || loop.b == null) {
      const sec = tl.sections[Math.max(0, sectionIndexAt(clock.getTime()))];
      setLoop(sec.start, sec.end, sec.name);
    }
    const first = sortedRates()[0];
    clock.setRate(first);
    setTimeout(paintSpeed, 150);
    seek(loop.a);
    toast(`Velocità progressiva: si parte dal ${Math.round(first * 100)}%`);
  }

  function sectionIndexAt(t) {
    let i = -1;
    tl.sections.forEach((s, k) => { if (s.start <= t) i = k; });
    return i;
  }

  function openCapo() {
    const dlg = $('.dlg-capo');
    const soundingNames = buildTimeline(song).events.map((e) => e.name);
    const sug = suggestCapo(soundingNames, song.shapes);
    const paint = () => {
      dlg.querySelector('.capo-grid').innerHTML = Array.from({ length: 8 }, (_, c) =>
        `<button type="button" class="seg${c === capo ? ' active' : ''}" data-capo="${c}">${c ? c + '°' : 'No'}</button>`).join('');
      dlg.querySelector('.capo-suggest').innerHTML = sug.capo
        ? `Suggerito: <b>capotasto al ${sug.capo}° tasto</b> (accordi più facili). <button type="button" class="chip-btn" data-capo="${sug.capo}">Usa il suggerito</button>`
        : 'Suggerito: <b>nessun capotasto</b>, le forme originali sono già le più comode.';
      const uniq = [...new Set(soundingNames)];
      dlg.querySelector('.capo-preview').innerHTML = uniq.map((n) =>
        `<span class="chip" style="--chip:${chordColor(n)}">${displayChord(shapeNameWithCapo(n, capo), settings.notation)}</span>`).join('');
    };
    paint();
    dlg.onclick = (e) => {
      const b = e.target.closest('[data-capo]');
      if (!b) return;
      capo = Number(b.dataset.capo);
      store.set(key('capo'), capo);
      rebuild();
      lastIdx = -2;
      paint();
    };
    dlg.showModal();
  }

  // ---------- Modalità ascolto: l'app sente cosa suoni ----------
  const scoreHud = $('.score-hud');
  function paintScore() {
    const acc = score.total ? Math.round((score.hits / score.total) * 100) : null;
    scoreHud.querySelector('.acc').textContent = acc == null ? 'In ascolto…' : `${acc}%`;
    scoreHud.querySelector('.streak').textContent = score.streak >= 2 ? `serie ×${score.streak}` : '';
  }

  async function toggleListen() {
    const btn = $('[data-act="listen"]');
    if (listener) {
      listener.stop();
      listener = null;
      btn.classList.remove('active');
      scoreHud.hidden = true;
      if (score.total >= 8) {
        const acc = score.hits / score.total;
        const prev = getStats(song.id).bestAccuracy ?? 0;
        recordAccuracy(song.id, acc);
        toast(`Precisione ${Math.round(acc * 100)}%${acc > prev ? ' · nuovo record!' : ''} · serie migliore ×${score.bestStreak}`);
      }
      return;
    }
    const names = [...new Set(tl.events.map((e) => e.sounding ?? e.name))];
    listener = new Listener(({ chroma, level }) => {
      const t = clock.getTime();
      const idx = eventIndexAt(tl, t);
      const ev = tl.events[idx];
      if (!ev || !clock.playing) return;
      if (!judge || judge.idx !== idx) judge = { idx, frames: 0, hits: 0 };
      if (t - ev.start < 0.18 || level < 0.012) return; // transizione o silenzio
      const r = matchChord(chroma, ev.sounding ?? ev.name, names);
      judge.frames++;
      if (r.hit) judge.hits++;
      scoreHud.querySelector('.hear').textContent = r.best ? `senti: ${displayChord(r.best, settings.notation)}` : '';
    });
    try {
      await listener.start();
    } catch {
      listener = null;
      toast('Serve il permesso del microfono');
      return;
    }
    score = { hits: 0, total: 0, streak: 0, bestStreak: 0 };
    judge = null;
    btn.classList.add('active');
    scoreHud.hidden = false;
    paintScore();
    toast(listener.rocksmith ? 'Ascolto dal cavo Rocksmith: suona insieme al brano' : 'Ascolto attivo: suona insieme al brano');
  }

  // Chiamata al cambio accordo: giudica quello appena finito.
  function judgePrevious() {
    if (!listener || !judge) return;
    const j = judge;
    judge = null;
    if (j.frames < 2) return; // non hai suonato: non conta
    const ok = j.hits / j.frames >= 0.5;
    score.total++;
    if (ok) { score.hits++; score.streak++; score.bestStreak = Math.max(score.bestStreak, score.streak); }
    else score.streak = 0;
    fretboard.verdict = { ok, at: performance.now() };
    paintScore();
  }

  async function openInput() {
    // chiude tutto ciò che usa l'ingresso, poi apre il pannello
    const tunerDlg = $('.dlg-tuner');
    if (tunerDlg.open) tunerDlg.close();
    if (listener) toggleListen();
    root.querySelectorAll('dialog[open]').forEach((d) => d.close());
    const dlg = $('.dlg-input');
    dlg.showModal();
    const unmount = await mountInputPanel(dlg.querySelector('.input-panel'));
    dlg.onclose = () => unmount();
  }

  function openTuner() {
    const dlg = $('.dlg-tuner');
    clock.pause();
    if (listener) toggleListen();
    tuner = new Tuner(dlg.querySelector('.tuner'), settings);
    dlg.onclose = () => { tuner?.stop(); tuner = null; };
    dlg.showModal();
    tuner.start();
  }

  // ---------- Pulsanti ----------
  root.querySelector('.player').classList.toggle('focus', !!settings.focus);
  const paintToggles = () => {
    $('[data-act="metro"]').classList.toggle('active', settings.metronome);
    $('[data-act="countin"]').classList.toggle('active', settings.countIn);
  };
  paintToggles();

  $('.player').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    const t = clock.getTime();
    switch (act) {
      case 'play': togglePlay(); break;
      case 'back': seek(t - 5); break;
      case 'fwd': seek(t + 5); break;
      case 'loopA': loop.a = t; if (loop.b != null && loop.b <= t) loop.b = null; loop.label = ''; paintLoop(); break;
      case 'loopB':
        if (loop.a == null || t <= loop.a) break;
        loop.b = t; loop.on = true; loop.label = ''; paintLoop(); seek(loop.a); break;
      case 'loopToggle': if (loop.a != null && loop.b != null) { loop.on = !loop.on; paintLoop(); } break;
      case 'loopClear':
        loop = { on: false, a: null, b: null, label: '' }; paintLoop();
        if (ramp) toggleRamp();
        break;
      case 'ramp': toggleRamp(); break;
      case 'countin': settings.countIn = !settings.countIn; saveSettings(settings); paintToggles(); break;
      case 'tuner': openTuner(); break;
      case 'listen': toggleListen(); break;
      case 'input': e.preventDefault(); openInput(); break;
      case 'capo': openCapo(); break;
      case 'focus':
        settings.focus = !settings.focus; saveSettings(settings);
        root.querySelector('.player').classList.toggle('focus', settings.focus);
        break;
      case 'metro': settings.metronome = !settings.metronome; saveSettings(settings); paintToggles(); break;
      case 'sync': openSync(); break;
      case 'record': startRecorder(); break;
      case 'info': openInfo(); break;
      case 'settings': openSettings(); break;
    }
  });

  function openSettings() {
    const dlg = $('.dlg-settings');
    const f = dlg.querySelector('form');
    const keys = ['leftHanded', 'highStringOnTop', 'showNoteNames', 'autoScroll'];
    f.notation.value = settings.notation;
    for (const k of keys) f[k].checked = settings[k];
    f.onchange = () => {
      settings.notation = f.notation.value;
      for (const k of keys) settings[k] = f[k].checked;
      saveSettings(settings);
      rebuild();
      lastIdx = -2;
    };
    dlg.showModal();
  }

  function openSync() {
    const dlg = $('.dlg-sync');
    const paint = () => {
      dlg.querySelector('.out-chords').textContent = signed(offset);
      dlg.querySelector('.out-lyrics').textContent = signed(lyricsOffset);
    };
    paint();
    dlg.onclick = async (e) => {
      const step = e.target.closest('[data-step]')?.dataset.step;
      if (step) {
        const [what, v] = step.split(':');
        if (what === 'chords') {
          offset = Math.round((offset + Number(v)) * 100) / 100;
          store.set(key('offset'), offset);
          rebuild();
        } else {
          lyricsOffset = Math.round((lyricsOffset + Number(v)) * 100) / 100;
          store.set(key('lyricsOffset'), lyricsOffset);
          renderPanel();
        }
        paint();
      }
      const act = e.target.closest('[data-sync]')?.dataset.sync;
      if (act === 'paste') { dlg.close(); openLyrics(); }
      if (act === 'reload') { clearLyricsCache(song); dlg.close(); loadLyrics(); }
      if (act === 'resetTimes') { store.remove(key('sync')); sync = song.sync ?? null; rebuild(); dlg.close(); }
    };
    dlg.showModal();
  }

  function openLyrics() {
    const dlg = $('.dlg-lyrics');
    const f = dlg.querySelector('form');
    f.text.value = store.get(key('lrc'), null) ?? plainLyrics.join('\n\n');
    dlg.onclose = () => {
      if (dlg.returnValue !== 'save') return;
      const text = f.text.value.trim();
      store.remove(key('lrc'));
      plainLyrics = [];
      if (looksLikeLrc(text)) store.set(key('lrc'), text);
      else if (text) plainLyrics = text.replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
      store.set(key('lyrics'), plainLyrics);
      if (plainLyrics.length) panelTab = 'chords';
      loadLyrics();
      rebuild();
    };
    dlg.showModal();
  }

  function openInfo() {
    const dlg = $('.dlg-info');
    dlg.querySelector('h3').textContent = `${song.title} · ${song.artist}`;
    const body = dlg.querySelector('.info-body');
    body.replaceChildren();
    const dl = document.createElement('dl');
    const rows = [
      ['Album', song.album], ['Anno', song.year], ['Genere', song.genre], ['Tonalità', song.key], ['BPM', song.bpm],
      ['Tempo', song.timeSignature?.join('/')], ['Capotasto', song.capo ? `${song.capo}° tasto` : 'nessuno'],
      ['Accordatura', song.tuning ?? 'Standard (E A D G B E)'],
    ];
    for (const [k, v] of rows) {
      if (v == null || v === '') continue;
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      dl.append(dt, dd);
    }
    body.append(dl);
    for (const note of [song.notes, song.syncNote].filter(Boolean)) {
      const p = document.createElement('p'); p.className = 'hint'; p.textContent = note; body.append(p);
    }
    const credit = document.createElement('p');
    credit.className = 'hint';
    credit.innerHTML = 'Testo sincronizzato fornito da <a href="https://lrclib.net" target="_blank" rel="noopener">LRCLIB</a>, scaricato al momento e non incluso nell\'app.';
    body.append(credit);
    dlg.showModal();
  }

  const onKey = (e) => {
    if (e.target.closest('input, textarea, select') || root.querySelector('dialog[open]')) return;
    const t = clock.getTime();
    switch (e.key) {
      case ' ': e.preventDefault(); togglePlay(); break;
      case 'ArrowLeft': seek(t - 5); break;
      case 'ArrowRight': seek(t + 5); break;
      case '[': $('[data-act="loopA"]').click(); break;
      case ']': $('[data-act="loopB"]').click(); break;
      case 'l': case 'L': $('[data-act="loopToggle"]').click(); break;
      case 't': case 'T': case 'Enter': if (recorder) { e.preventDefault(); tap(); } break;
      default: return;
    }
  };
  window.addEventListener('keydown', onKey);

  // ---------- Ciclo di animazione ----------
  let lastIdx = -2;
  let lastTimeText = '';
  function frame() {
    if (destroyed) return;
    const t = clock.getTime();
    const dur = totalDuration();
    const nowMs = performance.now();
    if (clock.playing) practiceAcc += Math.min(0.25, (nowMs - lastFrameAt) / 1000);
    lastFrameAt = nowMs;
    if (practiceAcc >= 10) { addPractice(song.id, practiceAcc); practiceAcc = 0; }

    if (loop.on && loop.a != null && loop.b != null && t >= loop.b && performance.now() - lastSeekAt > 300) {
      seek(loop.a);
      onLoopWrap();
    }

    const idx = eventIndexAt(tl, t);
    const { bar, beat } = beatAt(tl, t);
    fretboard.render(t, tl, idx, settings, clock.playing);
    if (panelTab === 'lyrics' && synced?.lines.length) karaoke.update(t, settings);
    else sheet.update(bar, settings);

    const cur = tl.events[idx];
    const nxt = tl.events[idx + 1] ?? (idx < 0 ? tl.events[0] : null);
    if (idx !== lastIdx) {
      if (lastIdx >= -1 && idx === lastIdx + 1) judgePrevious();
      else judge = null;
      lastIdx = idx;
      hudNow.textContent = cur ? displayChord(cur.name, settings.notation) : '—';
      hudNow.style.setProperty('--c', cur ? chordColor(cur.name) : '#fff');
      hudNext.textContent = nxt ? displayChord(nxt.name, settings.notation) : 'Fine';
      hudNext.style.setProperty('--c', nxt ? chordColor(nxt.name) : '#fff');
      sectionName.textContent = cur ? tl.sections[cur.section].name : tl.sections[0]?.name ?? '';

      hudNow.classList.remove('bump');
      void hudNow.offsetWidth;
      hudNow.classList.add('bump');
    }
    // diagramma dell'accordo corrente (si ricalcola anche se il pannello è stato ridisegnato)
    if (panelTab === 'shapes' && (lastDiagram?.dataset.chord !== cur?.name || !lastDiagram?.isConnected)) {
      lastDiagram?.classList.remove('active');
      lastDiagram = cur ? shapesBody.querySelector(`[data-chord="${CSS.escape(cur.name)}"]`) : null;
      lastDiagram?.classList.add('active');
    }
    if (nxt) {
      const bd = bar >= 0 && tl.bars[bar] ? (tl.bars[bar].end - tl.bars[bar].start) / tl.bpb : tl.beatDur;
      const left = Math.ceil((nxt.start - t) / bd - 0.001);
      countdown.textContent = left <= tl.bpb * 2 ? `tra ${left}` : '';
      countdown.classList.toggle('soon', left <= 1);
    } else countdown.textContent = '';

    const beatInt = Math.floor(beat);
    const dots = beatsEl.children;
    for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('on', bar >= 0 && i === beatInt);
    const slots = strumEl.children;
    if (slots.length) {
      const pos = bar >= 0 ? Math.floor((beat / tl.bpb) * slots.length) : -1;
      for (let i = 0; i < slots.length; i++) slots[i].classList.toggle('on', i === pos);
    }
    if (settings.metronome && clock.playing && bar >= 0 && beatInt >= 0) {
      const k = `${bar}:${beatInt}`;
      if (k !== lastBeatKey) { lastBeatKey = k; click(beatInt === 0); }
    }

    const pct = `${Math.min(100, (t / dur) * 100)}%`;
    scrubHead.style.left = pct;
    scrubFill.style.width = pct;
    const text = fmt(t);
    if (text !== lastTimeText) {
      lastTimeText = text;
      tCur.textContent = text;
      tTot.textContent = fmt(dur);
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return function destroy() {
    destroyed = true;
    cancelAnimationFrame(raf);
    cancelCountIn();
    tuner?.stop();
    listener?.stop();
    wake.off();
    addPractice(song.id, practiceAcc);
    window.removeEventListener('keydown', onKey);
    fretboard.destroy();
    clock?.destroy();
  };
}
