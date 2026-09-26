// Schermata di studio di un brano: manico animato, video, controlli, spartito.
import { YouTubeClock, FreeClock } from './clock.js';
import { buildTimeline, eventIndexAt, beatAt } from './timeline.js';
import { Fretboard } from './fretboard.js';
import { Sheet } from './sheet.js';
import { displayChord, chordColor } from './music.js';
import { store, loadSettings, saveSettings, getFavorites, toggleFavorite } from './store.js';

const fmt = (t) => {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

export async function openPlayer(root, song) {
  const settings = loadSettings();
  const key = (k) => `${k}:${song.id}`;
  let offset = store.get(key('offset'), 0);
  let sync = store.get(key('sync'), null) ?? song.sync ?? null;
  let lyrics = store.get(key('lyrics'), []);
  let tl = buildTimeline(song, { offset, sync });
  let loop = { on: false, a: null, b: null, label: '' };
  let clock = null;
  let raf = 0;
  let lastSeekAt = 0;
  let lastBeatKey = '';
  let recorder = null; // modalità sincronizzazione
  let destroyed = false;

  root.innerHTML = `
  <div class="player">
    <header class="player-head">
      <a class="icon-btn" href="#/" aria-label="Torna alla libreria">←</a>
      <div class="player-title">
        <div class="title"></div>
        <div class="artist"></div>
      </div>
      <button class="icon-btn fav" aria-label="Preferito"></button>
      <button class="icon-btn" data-act="settings" aria-label="Impostazioni">⚙</button>
    </header>

    <section class="stage">
      <div class="hud">
        <div class="hud-now">
          <div class="hud-label">Adesso</div>
          <div class="hud-chord now"></div>
        </div>
        <div class="hud-next">
          <div class="hud-label">Prossimo <span class="countdown"></span></div>
          <div class="hud-chord next"></div>
        </div>
        <div class="hud-rhythm">
          <div class="hud-label"><span class="section-name"></span></div>
          <div class="beats"></div>
          <div class="strum"></div>
        </div>
      </div>
      <canvas class="fretboard" aria-label="Manico della chitarra"></canvas>
    </section>

    <div class="player-main">
      <div class="left-col">
        <div class="video-wrap"><div class="video"></div><div class="video-msg" hidden></div></div>
        <div class="scrubber" title="Posizione nel brano">
          <div class="scrub-sections"></div>
          <div class="scrub-loop" hidden></div>
          <div class="scrub-head"></div>
        </div>
        <div class="time-row"><span class="t-cur">0:00</span><span class="loop-label"></span><span class="t-tot">0:00</span></div>
        <div class="controls">
          <button class="ctl" data-act="back" title="Indietro 5 s (←)">⏪</button>
          <button class="ctl primary" data-act="play" title="Play / Pausa (spazio)">▶</button>
          <button class="ctl" data-act="fwd" title="Avanti 5 s (→)">⏩</button>
          <label class="ctl-group" title="Velocità">
            <span>Velocità</span>
            <select class="speed"></select>
          </label>
        </div>
        <div class="controls">
          <button class="ctl" data-act="loopA" title="Inizio loop qui ([)">A</button>
          <button class="ctl" data-act="loopB" title="Fine loop qui (])">B</button>
          <button class="ctl" data-act="loopToggle" title="Loop on/off (L)">⟲ Loop</button>
          <button class="ctl" data-act="loopClear" title="Cancella loop">✕</button>
        </div>
        <div class="controls">
          <span class="ctl-group" title="Sposta gli accordi rispetto al video">
            <span>Sincronia</span>
            <button class="ctl small" data-act="offMinus">−</button>
            <output class="offset"></output>
            <button class="ctl small" data-act="offPlus">+</button>
          </span>
          <button class="ctl" data-act="metro" title="Click del metronomo">🥁 Click</button>
          <button class="ctl" data-act="sync" title="Registra i cambi accordo toccando a tempo">🎯 Registra tempi</button>
          <button class="ctl" data-act="lyrics" title="Incolla il tuo testo">✎ Testo</button>
        </div>
        <details class="song-info"><summary>Info brano</summary><div class="song-info-body"></div></details>
      </div>
      <aside class="sheet" aria-label="Accordi e testo"></aside>
    </div>

    <div class="recorder" hidden>
      <div class="rec-info"></div>
      <button class="rec-tap">TAP</button>
      <div class="rec-actions">
        <button class="ctl" data-rec="undo">Annulla ultimo</button>
        <button class="ctl" data-rec="restart">Ricomincia</button>
        <button class="ctl" data-rec="export">Esporta JSON</button>
        <button class="ctl primary" data-rec="done">Fine</button>
      </div>
    </div>

    <dialog class="dlg dlg-settings">
      <form method="dialog">
        <h3>Impostazioni</h3>
        <label><span>Notazione</span>
          <select name="notation"><option value="intl">Internazionale (C D E)</option><option value="it">Italiana (Do Re Mi)</option></select></label>
        <label class="check"><input type="checkbox" name="leftHanded"> Chitarra mancina (manico specchiato)</label>
        <label class="check"><input type="checkbox" name="highStringOnTop"> Mi cantino in alto (come le tablature)</label>
        <label class="check"><input type="checkbox" name="showNoteNames"> Mostra il nome delle note invece delle dita</label>
        <label class="check"><input type="checkbox" name="autoScroll"> Scorrimento automatico dello spartito</label>
        <p class="hint">Scorciatoie: spazio = play/pausa · ← → = ±5 s · [ ] = punti A/B · L = loop · T = tap (in registrazione)</p>
        <menu><button value="ok" class="ctl primary">Chiudi</button></menu>
      </form>
    </dialog>

    <dialog class="dlg dlg-lyrics">
      <form method="dialog">
        <h3>Il tuo testo</h3>
        <p class="hint">Incolla qui il testo del brano. Separa le strofe con una <b>riga vuota</b>: ogni blocco viene
        mostrato sotto una riga di accordi, nell'ordine. Il testo resta salvato solo su questo dispositivo.</p>
        <textarea name="text" rows="14" spellcheck="false"></textarea>
        <menu>
          <button value="cancel" class="ctl">Annulla</button>
          <button value="save" class="ctl primary">Salva</button>
        </menu>
      </form>
    </dialog>
  </div>`;

  const $ = (s) => root.querySelector(s);
  const hudNow = $('.hud-chord.now');
  const hudNext = $('.hud-chord.next');
  const countdown = $('.countdown');
  const beatsEl = $('.beats');
  const strumEl = $('.strum');
  const sectionName = $('.section-name');
  const playBtn = $('[data-act="play"]');
  const speedSel = $('.speed');
  const tCur = $('.t-cur');
  const tTot = $('.t-tot');
  const scrub = $('.scrubber');
  const scrubHead = $('.scrub-head');
  const scrubLoop = $('.scrub-loop');
  const loopLabel = $('.loop-label');
  const offsetOut = $('.offset');
  const videoMsg = $('.video-msg');

  $('.player-title .title').textContent = song.title;
  $('.player-title .artist').textContent = song.artist;
  document.title = `${song.title} · ${song.artist}`;

  const favBtn = $('.player-head .fav');
  const paintFav = (on) => { favBtn.textContent = on ? '★' : '☆'; favBtn.classList.toggle('on', on); };
  paintFav(getFavorites().has(song.id));
  favBtn.addEventListener('click', () => paintFav(toggleFavorite(song.id)));

  const info = $('.song-info-body');
  const infoRows = [
    ['Album', song.album], ['Anno', song.year], ['Genere', song.genre], ['Tonalità', song.key],
    ['BPM', song.bpm], ['Tempo', song.timeSignature?.join('/')], ['Capotasto', song.capo ? `${song.capo}° tasto` : 'nessuno'],
    ['Accordatura', song.tuning ?? 'Standard (E A D G B E)'],
  ];
  const dl = document.createElement('dl');
  for (const [k, v] of infoRows) {
    if (v == null || v === '') continue;
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    dl.append(dt, dd);
  }
  info.append(dl);
  for (const note of [song.notes, song.syncNote].filter(Boolean)) {
    const p = document.createElement('p'); p.className = 'hint'; p.textContent = note; info.append(p);
  }

  // ---------- Manico e spartito ----------
  const fretboard = new Fretboard($('.fretboard'));
  fretboard.customShapes = song.shapes ?? null;
  const sheet = new Sheet($('.sheet'), {
    onSeek: (t) => seek(t - 0.05),
    onLoop: (a, b, label) => setLoop(a, b, label),
  });

  function rebuild() {
    tl = buildTimeline(song, { offset, sync });
    sheet.render(tl, song, settings, lyrics);
    drawScrubSections();
    paintLoop();
    beatsEl.replaceChildren(...Array.from({ length: tl.bpb }, (_, i) => {
      const d = document.createElement('span');
      d.className = 'beat' + (i === 0 ? ' downbeat' : '');
      return d;
    }));
    drawStrum();
  }

  function drawStrum() {
    strumEl.replaceChildren();
    const pat = tl.strum;
    if (!pat) return;
    for (const ch of pat.replace(/\s+/g, '')) {
      const s = document.createElement('span');
      s.className = 'strum-slot';
      s.textContent = ch === 'D' ? '↓' : ch === 'U' ? '↑' : ch === 'X' ? '✕' : '·';
      strumEl.append(s);
    }
  }

  // ---------- Orologio: YouTube o interno ----------
  const onState = (playing) => { playBtn.textContent = playing ? '⏸' : '▶'; };
  try {
    if (!song.youtubeId) throw new Error('Nessun video associato al brano');
    clock = await YouTubeClock.create($('.video'), song.youtubeId, { onStateChange: onState });
  } catch (err) {
    if (destroyed) return () => {};
    clock = new FreeClock(tl.end + 4, { onStateChange: onState });
    videoMsg.hidden = false;
    videoMsg.textContent = `${err.message}. Puoi comunque esercitarti: accordi e metronomo funzionano senza video.`;
    $('.video').remove();
  }
  if (destroyed) { clock.destroy(); return () => {}; }

  for (const r of clock.rates()) {
    const o = document.createElement('option');
    o.value = r;
    o.textContent = `${Math.round(r * 100)}%`;
    if (r === 1) o.selected = true;
    speedSel.append(o);
  }
  speedSel.addEventListener('change', () => clock.setRate(Number(speedSel.value)));

  rebuild();

  // ---------- Loop ----------
  function setLoop(a, b, label = '') {
    loop = { on: true, a, b, label };
    paintLoop();
    seek(a);
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
      ? `⟲ ${loop.label || `${fmt(loop.a)} – ${fmt(loop.b)}`}${loop.on ? '' : ' (pausa)'}`
      : loop.a != null ? `A = ${fmt(loop.a)}` : '';
  }

  function totalDuration() {
    return Math.max(clock?.duration() || 0, tl.end + 2);
  }

  function drawScrubSections() {
    const dur = totalDuration();
    const box = $('.scrub-sections');
    box.replaceChildren(...tl.sections.map((s, i) => {
      const d = document.createElement('div');
      d.className = 'scrub-sec';
      d.style.left = `${(s.start / dur) * 100}%`;
      d.style.width = `${((s.end - s.start) / dur) * 100}%`;
      d.style.opacity = i % 2 ? 0.55 : 0.8;
      d.title = s.name;
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

  // ---------- Metronomo ----------
  let audio = null;
  function click(accent) {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = accent ? 1500 : 1000;
    g.gain.setValueAtTime(0.25, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.06);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + 0.07);
  }

  // ---------- Registrazione dei tempi (tap) ----------
  const recEl = $('.recorder');
  const recInfo = $('.rec-info');

  function startRecorder() {
    recorder = { times: [] };
    recEl.hidden = false;
    paintRecorder();
    const first = tl.events[0];
    seek(Math.max(0, (first?.start ?? 0) - 4));
    clock.play();
  }

  function paintRecorder() {
    if (!recorder) return;
    const i = recorder.times.length;
    const ev = tl.events[i];
    recInfo.innerHTML = ev
      ? `Tocca <b>TAP</b> (o premi <kbd>T</kbd>) esattamente quando arriva <b class="rec-chord"></b>
         <span class="muted">— cambio ${i + 1} di ${tl.events.length}, sezione “${tl.sections[ev.section].name}”</span>`
      : 'Hai registrato tutti i cambi! Premi <b>Fine</b> per salvarli, oppure <b>Esporta JSON</b>.';
    const c = recInfo.querySelector('.rec-chord');
    if (c) {
      c.textContent = displayChord(ev.name, settings.notation);
      c.style.color = chordColor(ev.name);
    }
  }

  function tap() {
    if (!recorder || recorder.times.length >= tl.events.length) return;
    // I tempi si salvano senza l'offset, che resta una correzione separata.
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
    delete out.lyrics;
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${song.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    navigator.clipboard?.writeText(JSON.stringify({ id: song.id, sync: times }, null, 0)).catch(() => {});
  }

  recEl.addEventListener('click', (e) => {
    const act = e.target.closest('[data-rec]')?.dataset.rec;
    if (e.target.closest('.rec-tap')) return tap();
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
  $('.rec-tap').addEventListener('click', (e) => e.stopPropagation());

  // ---------- Pulsanti ----------
  function paintOffset() {
    offsetOut.textContent = `${offset >= 0 ? '+' : ''}${offset.toFixed(2)} s`;
  }
  paintOffset();

  function paintToggles() {
    $('[data-act="metro"]').classList.toggle('active', settings.metronome);
  }
  paintToggles();

  $('.player').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    const t = clock.getTime();
    switch (act) {
      case 'play': audio?.resume(); clock.toggle(); break;
      case 'back': seek(t - 5); break;
      case 'fwd': seek(t + 5); break;
      case 'loopA': loop.a = t; if (loop.b != null && loop.b <= t) loop.b = null; loop.label = ''; paintLoop(); break;
      case 'loopB':
        if (loop.a == null || t <= loop.a) break;
        loop.b = t; loop.on = true; loop.label = ''; paintLoop(); seek(loop.a); break;
      case 'loopToggle': if (loop.a != null && loop.b != null) { loop.on = !loop.on; paintLoop(); } break;
      case 'loopClear': loop = { on: false, a: null, b: null, label: '' }; paintLoop(); break;
      case 'offMinus': case 'offPlus':
        offset = Math.round((offset + (act === 'offPlus' ? 0.05 : -0.05)) * 100) / 100;
        store.set(key('offset'), offset); paintOffset(); rebuild(); break;
      case 'metro': settings.metronome = !settings.metronome; saveSettings(settings); paintToggles(); break;
      case 'sync': startRecorder(); break;
      case 'lyrics': openLyrics(); break;
      case 'settings': openSettings(); break;
    }
  });

  function openSettings() {
    const dlg = $('.dlg-settings');
    const f = dlg.querySelector('form');
    f.notation.value = settings.notation;
    for (const k of ['leftHanded', 'highStringOnTop', 'showNoteNames', 'autoScroll']) f[k].checked = settings[k];
    f.onchange = () => {
      settings.notation = f.notation.value;
      for (const k of ['leftHanded', 'highStringOnTop', 'showNoteNames', 'autoScroll']) settings[k] = f[k].checked;
      saveSettings(settings);
      rebuild();
    };
    dlg.showModal();
  }

  function openLyrics() {
    const dlg = $('.dlg-lyrics');
    const f = dlg.querySelector('form');
    f.text.value = lyrics.join('\n\n');
    dlg.onclose = () => {
      if (dlg.returnValue !== 'save') return;
      lyrics = f.text.value.replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
      store.set(key('lyrics'), lyrics);
      rebuild();
    };
    dlg.showModal();
  }

  const onKey = (e) => {
    if (e.target.closest('input, textarea, select') || root.querySelector('dialog[open]')) return;
    const t = clock.getTime();
    switch (e.key) {
      case ' ': e.preventDefault(); clock.toggle(); break;
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

    if (loop.on && loop.a != null && loop.b != null && t >= loop.b && performance.now() - lastSeekAt > 300) {
      seek(loop.a);
    }

    const idx = eventIndexAt(tl, t);
    const { bar, beat } = beatAt(tl, t);
    fretboard.render(t, tl, idx, settings, clock.getRate());
    sheet.update(bar, settings);

    if (idx !== lastIdx) {
      lastIdx = idx;
      const cur = tl.events[idx];
      const nxt = tl.events[idx + 1] ?? (idx < 0 ? tl.events[0] : null);
      hudNow.textContent = cur ? displayChord(cur.name, settings.notation) : '—';
      hudNow.style.color = cur ? chordColor(cur.name) : '';
      hudNext.textContent = nxt ? displayChord(nxt.name, settings.notation) : 'Fine';
      hudNext.style.color = nxt ? chordColor(nxt.name) : '';
      sectionName.textContent = cur ? tl.sections[cur.section].name : 'Intro';
      hudNow.classList.remove('bump');
      void hudNow.offsetWidth;
      hudNow.classList.add('bump');
    }

    const nxt = tl.events[idx + 1] ?? (idx < 0 ? tl.events[0] : null);
    if (nxt) {
      const beatsLeft = Math.ceil((nxt.start - t) / (bar >= 0 ? (tl.bars[bar].end - tl.bars[bar].start) / tl.bpb : tl.beatDur) - 0.001);
      countdown.textContent = beatsLeft <= tl.bpb * 2 ? `tra ${beatsLeft} ${beatsLeft === 1 ? 'battito' : 'battiti'}` : '';
      countdown.classList.toggle('soon', beatsLeft <= 1);
    } else countdown.textContent = '';

    const beatInt = Math.floor(beat);
    const beatDots = beatsEl.children;
    for (let i = 0; i < beatDots.length; i++) beatDots[i].classList.toggle('on', bar >= 0 && i === beatInt);
    const slots = strumEl.children;
    if (slots.length) {
      const pos = bar >= 0 ? Math.floor(((beat / tl.bpb) * slots.length)) : -1;
      for (let i = 0; i < slots.length; i++) slots[i].classList.toggle('on', i === pos);
    }

    if (settings.metronome && clock.playing && bar >= 0) {
      const k = `${bar}:${beatInt}`;
      if (k !== lastBeatKey) {
        lastBeatKey = k;
        click(beatInt === 0);
      }
    }

    scrubHead.style.left = `${Math.min(100, (t / dur) * 100)}%`;
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
    window.removeEventListener('keydown', onKey);
    fretboard.destroy();
    clock?.destroy();
    audio?.close?.();
  };
}
