// Allenamento dei cambi accordo: 2-4 accordi alternati a tempo col metronomo,
// round da un minuto, BPM che sale da solo, record per ogni combinazione.
import { FreeClock } from './clock.js';
import { buildTimeline, eventIndexAt, beatAt } from './timeline.js';
import { Fretboard } from './fretboard.js';
import { chordDiagram } from './diagram.js';
import { displayChord, chordColor, getShape } from './music.js';
import { click, WakeLock } from './audio.js';
import { icon } from './icons.js';
import { store, loadSettings } from './store.js';
import { getDrillBest, saveDrillResult } from './stats.js';

export const COMMON_CHORDS = ['C', 'G', 'D', 'A', 'E', 'Am', 'Em', 'Dm', 'F', 'Bm', 'B7', 'E7', 'A7', 'D7', 'G7', 'C7', 'Cmaj7', 'Fmaj7', 'Gm', 'Cm'];

const PRESETS = [
  { label: 'Primi passi', chords: ['Em', 'G'] },
  { label: 'Classico', chords: ['C', 'G', 'Am', 'F'] },
  { label: 'Aperti', chords: ['D', 'A', 'E'] },
  { label: 'Il barrè di Fa', chords: ['C', 'F'] },
  { label: 'Cartine corte', chords: ['Gm', 'Gm/F', 'Ebmaj7', 'D7'] },
  { label: 'Cartine corte (capo 3)', chords: ['Em', 'Em/D', 'Cmaj7', 'B7'] },
];

const drillKey = (chords, beats) => `${chords.join('-')}@${beats}`;

// Brano "sintetico": una battuta di conteggio, poi gli accordi a rotazione.
export function buildDrillSong({ chords, bpm, beatsPerChord, seconds }) {
  const barDur = (60 / bpm) * beatsPerChord;
  const bars = Math.ceil(seconds / barDur);
  const reps = Math.max(1, Math.ceil(bars / chords.length));
  return {
    bpm,
    timeSignature: [beatsPerChord, 4],
    offset: 0,
    sections: [
      { name: 'Conteggio', bars: ['%'] },
      { name: 'Cambi', bars: chords, repeat: reps },
    ],
  };
}

export function openDrill(root) {
  const settings = loadSettings();
  const cfg = {
    chords: ['Em', 'G'],
    bpm: 60,
    beatsPerChord: 4,
    autoUp: true,
    ...store.get('drillCfg', {}),
  };
  let clock = null;
  let tl = null;
  let raf = 0;
  let running = false;
  let lastBeatKey = '';
  let roundChanges = 0;
  let destroyed = false;
  const wake = new WakeLock();
  const ROUND = 60;

  root.innerHTML = `
  <div class="player drill">
    <header class="player-head">
      <a class="icon-btn" href="#/" aria-label="Torna alla libreria">${icon('back')}</a>
      <div class="player-title"><div class="title">Allenamento cambi</div><div class="artist">Alterna gli accordi a tempo, un minuto alla volta</div></div>
    </header>
    <section class="stage">
      <canvas class="fretboard" aria-label="Manico della chitarra"></canvas>
      <div class="hud">
        <div class="hud-block now"><div class="hud-label">Adesso</div><div class="hud-chord now-chord">—</div></div>
        <div class="hud-center"><div class="beats"></div><div class="drill-timer">1:00</div></div>
        <div class="hud-block next"><div class="hud-label">Prossimo</div><div class="hud-chord next-chord">—</div></div>
      </div>
    </section>
    <div class="player-main">
      <div class="left-col">
        <div class="card drill-cfg">
          <div class="drill-section-title">Accordi <span class="hint">(tocca per aggiungere o togliere, massimo 4)</span></div>
          <div class="drill-selected"></div>
          <div class="drill-presets"></div>
          <div class="drill-chords"></div>
          <div class="drill-row">
            <label class="drill-field">Tempo <b class="bpm-out"></b>
              <input type="range" class="bpm" min="40" max="180" step="5"></label>
            <div class="drill-field">Battiti per accordo
              <div class="speed-pills beats-pills">${[1, 2, 4].map((b) => `<button class="seg" data-beats="${b}">${b}</button>`).join('')}</div>
            </div>
          </div>
          <label class="check-line"><input type="checkbox" class="autoup"> Alza il tempo di 5 BPM a ogni minuto completato</label>
          <div class="drill-actions">
            <button class="round big drill-start" title="Inizia / ferma">${icon('play', 26)}</button>
            <div class="drill-score"></div>
          </div>
        </div>
      </div>
      <aside class="panel card"><div class="panel-body drill-diagrams"></div></aside>
    </div>
  </div>`;

  const $ = (s) => root.querySelector(s);
  const fretboard = new Fretboard($('.fretboard'));
  const startBtn = $('.drill-start');
  const bpmIn = $('.bpm');
  const scoreEl = $('.drill-score');
  const timerEl = $('.drill-timer');
  bpmIn.value = cfg.bpm;
  $('.autoup').checked = cfg.autoUp;

  const save = () => store.set('drillCfg', cfg);

  function paintConfig() {
    $('.bpm-out').textContent = `${cfg.bpm} BPM`;
    root.querySelectorAll('[data-beats]').forEach((b) => b.classList.toggle('active', Number(b.dataset.beats) === cfg.beatsPerChord));
    $('.drill-selected').innerHTML = cfg.chords.length
      ? cfg.chords.map((c, i) => `<span class="chip big" style="--chip:${chordColor(c)}">${displayChord(c, settings.notation)}</span>${i < cfg.chords.length - 1 ? '<span class="arrow">→</span>' : ''}`).join('')
      : '<span class="hint">Scegli almeno due accordi</span>';
    $('.drill-presets').innerHTML = PRESETS.map((p, i) => `<button class="chip-btn" data-preset="${i}">${p.label}</button>`).join('');
    const all = [...new Set([...COMMON_CHORDS, ...cfg.chords])].filter((c) => getShape(c));
    $('.drill-chords').innerHTML = all.map((c) =>
      `<button class="seg${cfg.chords.includes(c) ? ' active' : ''}" data-chord="${c}">${displayChord(c, settings.notation)}</button>`).join('');
    $('.drill-diagrams').innerHTML = `<div class="diagram-grid">${cfg.chords.map((c) => chordDiagram(c, settings)).join('')}</div>`;
    const best = getDrillBest(drillKey(cfg.chords, cfg.beatsPerChord));
    scoreEl.innerHTML = best
      ? `Record per questa combinazione: <b>${best.bpm} BPM</b> (${best.changes} cambi in un minuto)`
      : 'Nessun record ancora per questa combinazione.';
  }

  root.querySelector('.drill-cfg').addEventListener('click', (e) => {
    const chord = e.target.closest('[data-chord]')?.dataset.chord;
    const preset = e.target.closest('[data-preset]')?.dataset.preset;
    const beats = e.target.closest('[data-beats]')?.dataset.beats;
    if (running && (chord || preset || beats)) stop();
    if (chord) {
      if (cfg.chords.includes(chord)) cfg.chords = cfg.chords.filter((c) => c !== chord);
      else if (cfg.chords.length < 4) cfg.chords = [...cfg.chords, chord];
    }
    if (preset) cfg.chords = [...PRESETS[preset].chords];
    if (beats) cfg.beatsPerChord = Number(beats);
    if (chord || preset || beats) { save(); paintConfig(); prepare(); }
  });
  bpmIn.addEventListener('input', () => { cfg.bpm = Number(bpmIn.value); save(); paintConfig(); if (!running) prepare(); });
  $('.autoup').addEventListener('change', (e) => { cfg.autoUp = e.target.checked; save(); });

  function prepare() {
    if (cfg.chords.length < 2) { tl = null; return; }
    tl = buildTimeline(buildDrillSong({ ...cfg, seconds: ROUND }));
    clock?.destroy();
    clock = new FreeClock(tl.bars[0].end + ROUND, { onStateChange: () => {} });
    $('.beats').replaceChildren(...Array.from({ length: tl.bpb }, (_, i) => {
      const d = document.createElement('span');
      d.className = 'beat' + (i === 0 ? ' downbeat' : '');
      return d;
    }));
    roundChanges = 0;
    timerEl.textContent = '1:00';
  }

  function start() {
    if (!tl) return;
    click(false); // sblocca l'audio al primo tocco
    running = true;
    startBtn.innerHTML = icon('pause', 26);
    startBtn.classList.add('playing');
    wake.on();
    clock.seek(0);
    clock.play();
  }

  function stop() {
    running = false;
    startBtn.innerHTML = icon('play', 26);
    startBtn.classList.remove('playing');
    clock?.pause();
    wake.off();
  }

  function endRound() {
    const key = drillKey(cfg.chords, cfg.beatsPerChord);
    const record = saveDrillResult(key, { bpm: cfg.bpm, changes: roundChanges });
    const msg = `${roundChanges} cambi a ${cfg.bpm} BPM${record ? ' · nuovo record!' : ''}`;
    if (cfg.autoUp && cfg.bpm < 180) {
      cfg.bpm += 5;
      bpmIn.value = cfg.bpm;
      save();
      paintConfig();
      scoreEl.innerHTML = `<b>${msg}</b> Si riparte a ${cfg.bpm} BPM…`;
      prepare();
      start();
    } else {
      stop();
      paintConfig();
      scoreEl.innerHTML = `<b>${msg}</b>`;
      prepare();
    }
  }

  startBtn.addEventListener('click', () => (running ? stop() : start()));

  let lastIdx = -2;
  function frame() {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    if (!tl) return;
    const t = clock.getTime();
    const idx = eventIndexAt(tl, t);
    const { bar, beat } = beatAt(tl, t);
    fretboard.render(t, tl, idx, settings, running);
    if (idx !== lastIdx) {
      if (running && idx > 0) roundChanges++;
      lastIdx = idx;
      const cur = tl.events[idx];
      const nxt = tl.events[idx + 1] ?? (idx < 0 ? tl.events[0] : null);
      $('.now-chord').textContent = cur ? displayChord(cur.name, settings.notation) : 'Pronto';
      $('.now-chord').style.setProperty('--c', cur ? chordColor(cur.name) : '#fff');
      $('.next-chord').textContent = nxt ? displayChord(nxt.name, settings.notation) : '—';
      $('.next-chord').style.setProperty('--c', nxt ? chordColor(nxt.name) : '#fff');
      root.querySelectorAll('.drill-diagrams .diagram').forEach((d) => d.classList.toggle('active', d.dataset.chord === cur?.name));
    }
    const beatInt = Math.floor(beat);
    const dots = root.querySelector('.beats').children;
    for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('on', bar >= 0 && i === beatInt);
    if (running && bar >= 0 && beatInt >= 0) {
      const k = `${bar}:${beatInt}`;
      if (k !== lastBeatKey) { lastBeatKey = k; click(beatInt === 0); }
    }
    const start0 = tl.bars[0].end;
    const left = Math.max(0, ROUND - Math.max(0, t - start0));
    timerEl.textContent = t < start0 ? `${Math.ceil(start0 - t)}…` : `0:${String(Math.ceil(left)).padStart(2, '0')}`.replace('0:60', '1:00');
    if (running && t - start0 >= ROUND) endRound();
  }

  paintConfig();
  prepare();
  raf = requestAnimationFrame(frame);

  return () => {
    destroyed = true;
    cancelAnimationFrame(raf);
    stop();
    fretboard.destroy();
  };
}
