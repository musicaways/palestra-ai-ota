// Sezione "Impara": elenco delle lezioni (#/impara) e lezione con esercizio animato (#/impara/<id>).
import { FreeClock } from './clock.js';
import { eventIndexAt, beatAt } from './timeline.js';
import { Fretboard } from './fretboard.js';
import { chordDiagram } from './diagram.js';
import { displayChord, chordColor } from './music.js';
import { click, pluck, WakeLock } from './audio.js';
import { icon } from './icons.js';
import { store, loadSettings } from './store.js';
import { Tuner } from './tuner.js';
import { INSTRUMENTS, CATEGORIES, LESSONS, lessonById, buildLessonTimeline } from './lessons.js';

const LEVEL = { 1: 'Base', 2: 'Intermedio', 3: 'Avanzato' };
const doneSet = () => new Set(store.get('lessonsDone', []));

export function renderLearn(root) {
  const done = doneSet();
  const inst = store.get('learnInstrument', 'guitar');
  const total = LESSONS.filter((l) => l.instrument === inst).length;
  const ndone = LESSONS.filter((l) => l.instrument === inst && done.has(l.id)).length;
  root.innerHTML = `
  <div class="library learn">
    <section class="hero">
      <div class="hero-kicker">${icon('study', 16)} Impara</div>
      <h1>Lezioni ed esercizi,<br><span>passo dopo passo.</span></h1>
      <p>Accordi, ritmo, scale e tecniche con esercizi animati sul manico, a tempo e alla velocità che vuoi.</p>
      <div class="hero-actions">
        <a class="chip-btn" href="#/">${icon('back', 16)} Libreria brani</a>
        <a class="chip-btn" href="#/allenamento">${icon('drill', 16)} Allenamento cambi</a>
        <a class="chip-btn" href="#/accordi">${icon('hand', 16)} Dizionario accordi</a>
        <span class="hero-stats">${ndone} lezioni completate su ${total}</span>
      </div>
      <div class="learn-progress"><i style="width:${total ? (ndone / total) * 100 : 0}%"></i></div>
    </section>
    <nav class="tabs inst-tabs">${INSTRUMENTS.map((i) => `<button class="tab${i.id === inst ? ' active' : ''}" data-inst="${i.id}" ${i.ready ? '' : 'disabled'}>${i.label}${i.ready ? '' : ' <small>presto</small>'}</button>`).join('')}</nav>
    <div class="learn-cats"></div>
  </div>`;
  const cats = root.querySelector('.learn-cats');
  for (const c of CATEGORIES) {
    const list = LESSONS.filter((l) => l.cat === c.id && l.instrument === inst);
    if (!list.length) continue;
    const sec = document.createElement('section');
    sec.className = 'learn-cat';
    sec.innerHTML = `<h2 class="group-title">${c.label} <span class="hint">${c.desc}</span></h2><div class="lesson-grid"></div>`;
    sec.querySelector('.lesson-grid').innerHTML = list.map((l) => `
      <a class="lesson-card card${done.has(l.id) ? ' done' : ''}" href="#/impara/${l.id}">
        <span class="lesson-level l${l.level}">${LEVEL[l.level]}</span>
        <b></b><span class="lesson-sum"></span>
        ${done.has(l.id) ? `<span class="lesson-done">${icon('check', 16)}</span>` : ''}
      </a>`).join('');
    sec.querySelectorAll('.lesson-card').forEach((a, i) => {
      a.querySelector('b').textContent = list[i].title;
      a.querySelector('.lesson-sum').textContent = list[i].summary;
    });
    cats.append(sec);
  }
  root.querySelector('.inst-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-inst]');
    if (!b || b.disabled) return;
    store.set('learnInstrument', b.dataset.inst);
    renderLearn(root);
  });
}

export function openLesson(root, id) {
  const lesson = lessonById(id);
  if (!lesson) { location.hash = '#/impara'; return () => {}; }
  const settings = { ...loadSettings() };
  const ex = lesson.exercise;
  if (ex?.showNoteNames) settings.showNoteNames = true;
  const list = LESSONS.filter((l) => l.instrument === lesson.instrument);
  const next = list[list.indexOf(lesson) + 1];
  let bpm = store.get(`lessonBpm:${id}`, ex?.bpm ?? 70);
  let sound = store.get('lessonSound', true);
  let metro = store.get('lessonMetro', true);
  let looping = true;
  let tl = null;
  let clock = null;
  let raf = 0;
  let running = false;
  let destroyed = false;
  let lastBeatKey = '';
  let lastIdx = -2;
  let tuner = null;
  const wake = new WakeLock();

  root.innerHTML = `
  <div class="player drill lesson">
    <header class="player-head">
      <a class="icon-btn" href="#/impara" aria-label="Torna alle lezioni">${icon('back')}</a>
      <div class="player-title"><div class="title"></div><div class="artist"></div></div>
    </header>
    ${ex ? `<section class="stage">
      <canvas class="fretboard" aria-label="Manico della chitarra"></canvas>
      <div class="hud">
        <div class="hud-block now"><div class="hud-label">Adesso</div><div class="hud-chord now-chord">—</div></div>
        <div class="hud-center"><div class="beats"></div><div class="strum"></div></div>
        <div class="hud-block next"><div class="hud-label">Prossimo</div><div class="hud-chord next-chord">—</div></div>
      </div>
    </section>` : ''}
    <div class="player-main">
      <div class="left-col">
        <div class="card lesson-body"></div>
        ${ex ? `<div class="card transport lesson-ctl">
          <div class="transport-row">
            <div class="play-group"><button class="round big lesson-play" title="Inizia / ferma (spazio)">${icon('play', 26)}</button></div>
            <label class="drill-field lesson-bpm">Tempo <b class="bpm-out"></b><input type="range" class="bpm" min="40" max="180" step="2"></label>
          </div>
          <div class="tools-row pop">
            <button class="tool" data-t="metro">${icon('metronome', 18)}<span>Click</span></button>
            <button class="tool" data-t="loop">${icon('loop', 18)}<span>Ripeti</span></button>
            ${tlHasNotes(ex) ? `<button class="tool" data-t="sound">${icon('guitar', 18)}<span>Senti</span></button>` : ''}
            <button class="tool" data-t="slower">${icon('ramp', 18)}<span>−10 BPM</span></button>
          </div>
        </div>` : ''}
        <div class="lesson-foot">
          <button class="chip-btn lesson-mark"></button>
          ${next ? `<a class="chip-btn" href="#/impara/${next.id}">Prossima: <b></b> →</a>` : ''}
        </div>
      </div>
      <aside class="panel card"><div class="panel-body lesson-side"></div></aside>
    </div>
    <dialog class="dlg dlg-tuner"><form method="dialog"><h3>Accordatore</h3><div class="tuner"></div>
      <menu><button value="ok" class="chip-btn primary">Chiudi</button></menu></form></dialog>
  </div>`;
  const $ = (s) => root.querySelector(s);
  $('.player-title .title').textContent = lesson.title;
  $('.player-title .artist').textContent = `${CATEGORIES.find((c) => c.id === lesson.cat)?.label} · ${LEVEL[lesson.level]}`;
  document.title = `${lesson.title} · Impara`;
  $('.lesson-body').innerHTML = `<p class="lesson-lead"></p>${lesson.body}
    ${lesson.tuner ? `<button class="chip-btn primary open-tuner">${icon('tuner', 16)} Apri l'accordatore</button>` : ''}
    ${lesson.link ? `<a class="chip-btn primary" href="${lesson.link.href}">${lesson.link.label}</a>` : ''}
    ${ex?.tone ? `<p class="hint">Col cavo Rocksmith prova il suono <b>${ex.tone}</b> dall'Ampli di un brano.</p>` : ''}`;
  $('.lesson-lead').textContent = lesson.summary;
  if (next) $('.lesson-foot a b').textContent = next.title;
  $('.open-tuner')?.addEventListener('click', () => {
    const dlg = $('.dlg-tuner');
    tuner = new Tuner(dlg.querySelector('.tuner'), settings);
    dlg.onclose = () => { tuner?.stop(); tuner = null; };
    dlg.showModal();
    tuner.start();
  });
  const paintMark = () => {
    const d = doneSet().has(id);
    $('.lesson-mark').innerHTML = d ? `${icon('check', 16)} Completata` : 'Segna come completata';
    $('.lesson-mark').classList.toggle('active', d);
  };
  $('.lesson-mark').addEventListener('click', () => {
    const d = doneSet();
    if (d.has(id)) d.delete(id); else d.add(id);
    store.set('lessonsDone', [...d]);
    paintMark();
  });
  paintMark();

  // pannello laterale: diagrammi degli accordi o legenda
  const side = $('.lesson-side');
  if (ex?.chords) side.innerHTML = `<div class="diagram-grid">${[...new Set(ex.chords)].map((c) => chordDiagram(c, settings)).join('')}</div>`;
  else if (ex) side.innerHTML = `<p class="hint">Le note arrivano sulla corsia come gemme: suonale quando toccano il manico.
    Il numero è il dito da usare (1 indice … 4 mignolo, 0 corda a vuoto). In trasparenza vedi tutta la forma;
    le note <b style="color:#ff4fd8">rosa</b> sono la radice.</p>
    <p class="hint">H hammer-on · P pull-off · / slide · ↑ bend · ~ vibrato · PM palm muting</p>`;
  else side.innerHTML = '<p class="hint">Lezione di sola lettura: nessun esercizio a tempo.</p>';

  if (!ex) return () => { tuner?.stop(); };

  const fretboard = new Fretboard($('.fretboard'));
  fretboard.onNote = (n) => { if (sound && running) pluck(n.string, n.fret); };
  const bpmIn = $('.bpm');
  bpmIn.value = bpm;
  const playBtn = $('.lesson-play');

  function prepare() {
    tl = buildLessonTimeline(ex, bpm);
    clock?.destroy();
    clock = new FreeClock(tl.end + 0.5, { onStateChange: () => {} });
    fretboard.lastNote = -1;
    $('.bpm-out').textContent = `${bpm} BPM`;
    $('.beats').replaceChildren(...Array.from({ length: tl.bpb }, (_, i) => {
      const d = document.createElement('span');
      d.className = 'beat' + (i === 0 ? ' downbeat' : '');
      return d;
    }));
    $('.strum').replaceChildren(...[...(tl.strum ?? '').replace(/\s+/g, '')].map((ch) => {
      const s = document.createElement('span');
      s.className = 'strum-slot';
      s.textContent = ch === 'D' ? '↓' : ch === 'U' ? '↑' : ch === 'X' ? '✕' : '·';
      return s;
    }));
    lastIdx = -2;
  }
  const paintTools = () => {
    root.querySelector('[data-t="metro"]').classList.toggle('active', metro);
    root.querySelector('[data-t="loop"]').classList.toggle('active', looping);
    root.querySelector('[data-t="sound"]')?.classList.toggle('active', sound);
  };
  function start() {
    click(false);
    running = true;
    playBtn.innerHTML = icon('pause', 26);
    playBtn.classList.add('playing');
    wake.on();
    clock.seek(0);
    clock.play();
  }
  function stop() {
    running = false;
    playBtn.innerHTML = icon('play', 26);
    playBtn.classList.remove('playing');
    clock?.pause();
    wake.off();
  }
  playBtn.addEventListener('click', () => (running ? stop() : start()));
  bpmIn.addEventListener('input', () => {
    bpm = Number(bpmIn.value);
    store.set(`lessonBpm:${id}`, bpm);
    const was = running;
    stop();
    prepare();
    if (was) start();
  });
  root.querySelector('.tools-row').addEventListener('click', (e) => {
    const t = e.target.closest('[data-t]')?.dataset.t;
    if (t === 'metro') { metro = !metro; store.set('lessonMetro', metro); }
    if (t === 'loop') looping = !looping;
    if (t === 'sound') { sound = !sound; store.set('lessonSound', sound); }
    if (t === 'slower') { bpmIn.value = Math.max(40, bpm - 10); bpmIn.dispatchEvent(new Event('input')); }
    paintTools();
  });
  const onKey = (e) => {
    if (e.key === ' ' && !e.target.closest('input, textarea, select, button') && !root.querySelector('dialog[open]')) {
      e.preventDefault();
      running ? stop() : start();
    }
  };
  window.addEventListener('keydown', onKey);

  function frame() {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const t = clock.getTime();
    if (running && t >= tl.end - 0.02) {
      if (looping) { clock.seek(tl.bars[0].end); fretboard.lastNote = -1; } else stop();
    }
    const idx = eventIndexAt(tl, t);
    const { bar, beat } = beatAt(tl, t);
    fretboard.render(t, tl, idx, settings, running);
    if (idx !== lastIdx) {
      lastIdx = idx;
      const cur = tl.events[idx];
      const nxt = tl.events[idx + 1] ?? (idx < 0 ? tl.events[0] : null);
      const nowName = tl.noteMode ? (idx < 0 ? 'Pronto' : ex.context ?? '') : cur ? displayChord(cur.name, settings.notation) : 'Pronto';
      $('.now-chord').textContent = nowName;
      $('.now-chord').style.setProperty('--c', cur ? chordColor(cur.name) : '#fff');
      $('.next-chord').textContent = tl.noteMode ? '' : nxt ? displayChord(nxt.name, settings.notation) : '—';
      $('.next-chord').style.setProperty('--c', nxt ? chordColor(nxt.name) : '#fff');
      root.querySelectorAll('.lesson-side .diagram').forEach((d) => d.classList.toggle('active', d.dataset.chord === cur?.name));
    }
    const beatInt = Math.floor(beat);
    const dots = $('.beats').children;
    for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('on', bar >= 0 && i === beatInt);
    const slots = $('.strum').children;
    if (slots.length) {
      const pos = bar >= 0 ? Math.floor((beat / tl.bpb) * slots.length) : -1;
      for (let i = 0; i < slots.length; i++) slots[i].classList.toggle('on', i === pos);
    }
    if (running && bar >= 0 && beatInt >= 0) {
      const k = `${bar}:${beatInt}`;
      if (k !== lastBeatKey) { lastBeatKey = k; if (metro || bar === 0) click(beatInt === 0); }
    }
  }

  prepare();
  paintTools();
  raf = requestAnimationFrame(frame);
  return () => {
    destroyed = true;
    cancelAnimationFrame(raf);
    stop();
    tuner?.stop();
    window.removeEventListener('keydown', onKey);
    fretboard.destroy();
    clock?.destroy();
  };
}

function tlHasNotes(ex) {
  return ex.type === 'notes' || ex.type === 'arpeggio';
}
