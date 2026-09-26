// Dizionario degli accordi (#/accordi): fondamentale + tipo → diteggiatura, note e suono.
import { getShape, displayChord, noteName, fretNote } from './music.js';
import { chordPitchClasses } from './detect.js';
import { chordDiagram } from './diagram.js';
import { strumChord } from './audio.js';
import { icon } from './icons.js';
import { store, loadSettings } from './store.js';

export const ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const QUALITIES = [
  { q: '', label: 'Maggiore', desc: 'Fondamentale, terza maggiore, quinta: il suono "pieno" e luminoso.' },
  { q: 'm', label: 'Minore', desc: 'La terza scende di un semitono: suono malinconico.' },
  { q: '7', label: 'Settima', desc: 'Maggiore con la settima minore: tensione che chiede di risolvere (blues).' },
  { q: 'm7', label: 'Minore settima', desc: 'Minore con la settima: morbido, jazz e soul.' },
  { q: 'maj7', label: 'Settima maggiore', desc: 'Maggiore con la settima maggiore: sognante, indie e bossa.' },
  { q: 'sus2', label: 'Sus2', desc: 'Al posto della terza la seconda: aperto, sospeso.' },
  { q: 'sus4', label: 'Sus4', desc: 'Al posto della terza la quarta: sospeso, spesso risolve sul maggiore.' },
  { q: '7sus4', label: '7sus4', desc: 'Settima con la quarta sospesa.' },
  { q: '5', label: 'Power chord', desc: 'Solo fondamentale e quinta: il suono del rock con la distorsione.' },
  { q: '6', label: 'Sesta', desc: 'Maggiore con la sesta: retrò, swing.' },
  { q: 'add9', label: 'Add9', desc: 'Maggiore con la nona: brillante, pop moderno.' },
  { q: 'dim', label: 'Diminuito', desc: 'Terza minore e quinta diminuita: passaggio teso.' },
  { q: 'aug', label: 'Aumentato', desc: 'Quinta aumentata: sospeso e misterioso.' },
];

export function chordInfo(name) {
  const pc = chordPitchClasses(name);
  const shape = getShape(name);
  const played = shape ? shape.frets.map((f, s) => (f == null ? null : fretNote(s, f))).filter((x) => x != null) : [];
  return { name, notes: pc ? pc.notes : [], root: pc?.root ?? null, shape, played };
}

export function renderChords(root) {
  const settings = loadSettings();
  let sel = { root: 'C', q: '', ...store.get('chordDict', {}) };
  root.innerHTML = `
  <div class="library chord-dict">
    <section class="hero">
      <div class="hero-kicker">${icon('hand', 16)} Dizionario degli accordi</div>
      <h1>Ogni accordo,<br><span>come si suona.</span></h1>
      <p>Scegli la nota e il tipo: diteggiatura, note che lo compongono e suono. Tocca un diagramma per ascoltarlo.</p>
      <div class="hero-actions"><a class="chip-btn" href="#/impara">${icon('back', 16)} Impara</a><a class="chip-btn" href="#/">${icon('guitar', 16)} Libreria brani</a></div>
    </section>
    <div class="cd-pick card">
      <div class="cd-row cd-roots"></div>
      <div class="cd-row cd-quals"></div>
    </div>
    <div class="cd-main card"></div>
    <h2 class="group-title cd-all-title"></h2>
    <div class="diagram-grid cd-all"></div>
  </div>`;
  const $ = (s) => root.querySelector(s);
  function paint() {
    store.set('chordDict', sel);
    $('.cd-roots').innerHTML = ROOTS.map((r) => `<button class="seg${r === sel.root ? ' active' : ''}" data-root="${r}">${displayChord(r, settings.notation)}</button>`).join('');
    $('.cd-quals').innerHTML = QUALITIES.map((x) => `<button class="seg${x.q === sel.q ? ' active' : ''}" data-q="${x.q}">${x.label}</button>`).join('');
    const name = sel.root + sel.q;
    const info = chordInfo(name);
    const qd = QUALITIES.find((x) => x.q === sel.q);
    $('.cd-main').innerHTML = `
      <div class="cd-diagram" data-play="${name}">${chordDiagram(name, settings)}</div>
      <div class="cd-text">
        <div class="cd-name">${displayChord(name, settings.notation)}</div>
        <p class="hint">${qd.desc}</p>
        <p>Note: ${info.notes.map((n) => `<b class="cd-note${n === info.root ? ' root' : ''}">${noteName(n, settings.notation)}</b>`).join(' ')}</p>
        <button class="chip-btn primary" data-play="${name}">${icon('play', 16)} Ascolta</button>
        <button class="chip-btn" data-arp="${name}">Arpeggiato</button>
      </div>`;
    $('.cd-all-title').textContent = `${qd.label}: tutte le note`;
    $('.cd-all').innerHTML = ROOTS.map((r) => `<div data-play="${r + sel.q}" class="cd-cell">${chordDiagram(r + sel.q, settings)}</div>`).join('');
  }
  root.addEventListener('click', (e) => {
    const r = e.target.closest('[data-root]')?.dataset.root;
    const q = e.target.closest('[data-q]')?.dataset.q;
    if (r) { sel.root = r; paint(); return; }
    if (q != null) { sel.q = q; paint(); return; }
    const arp = e.target.closest('[data-arp]')?.dataset.arp;
    if (arp) {
      const sh = getShape(arp);
      if (sh) sh.frets.forEach((f, s) => { if (f != null) strumChord(sh.frets.map((x, k) => (k === s ? x : null)), { when: s * 0.18 }); });
      return;
    }
    const play = e.target.closest('[data-play]')?.dataset.play;
    if (play) {
      const sh = getShape(play);
      if (sh) strumChord(sh.frets, { volume: 0.3 });
      if (e.target.closest('.cd-cell')) { sel.root = ROOTS.find((x) => play === x + sel.q) ?? sel.root; paint(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    }
  });
  paint();
}
