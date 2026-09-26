// Pannello karaoke: righe del testo sincronizzato con gli accordi posizionati nel punto
// in cui cambiano, riga corrente illuminata progressivamente.
import { displayChord, chordColor } from './music.js';
import { eventIndexAt, sectionAt } from './timeline.js';
import { icon } from './icons.js';

const MAX_LINE_GAP = 7; // oltre questa pausa si inserisce una riga strumentale

export class Karaoke {
  constructor(container, { onSeek, onLoop }) {
    this.el = container;
    this.onSeek = onSeek;
    this.onLoop = onLoop;
    this.rows = [];
    this.cur = -2;
    this.userScrollUntil = 0;
    const mark = () => { this.userScrollUntil = performance.now() + 4000; };
    this.el.addEventListener('wheel', mark, { passive: true });
    this.el.addEventListener('touchmove', mark, { passive: true });
  }

  render(lines, tl, settings, lyricsOffset = 0) {
    this.rows = buildRows(lines, tl, lyricsOffset);
    this.cur = -2;
    const frag = document.createDocumentFragment();
    let lastSection = -1;
    this.rows.forEach((row, i) => {
      const si = sectionAt(tl, row.start + 0.05);
      if (si >= 0 && si !== lastSection) {
        lastSection = si;
        const sec = tl.sections[si];
        const h = document.createElement('div');
        h.className = 'k-sec';
        h.innerHTML = `<span></span><button class="k-sec-loop" title="Ripeti in loop la sezione">${icon('loop', 14)}</button>`;
        h.firstChild.textContent = sec.name;
        h.querySelector('button').addEventListener('click', (e) => {
          e.stopPropagation();
          this.onLoop(sec.start, sec.end, sec.name);
        });
        frag.append(h);
      }
      const r = document.createElement('div');
      r.className = 'k-row' + (row.instrumental ? ' instrumental' : '');
      r.dataset.i = i;
      const line = document.createElement('div');
      line.className = 'k-line';
      const chords = document.createElement('div');
      chords.className = 'k-chords';
      if (placeChords(row, chords, settings)) line.classList.add('flow');
      const text = document.createElement('div');
      text.className = 'k-text';
      text.textContent = row.instrumental ? '♪' : row.text;
      line.append(chords, text);
      const loop = document.createElement('button');
      loop.className = 'k-loop';
      loop.title = 'Ripeti in loop questa riga';
      loop.innerHTML = icon('loop', 14);
      loop.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onLoop(row.start - 0.15, row.end, 'riga');
      });
      r.append(line, loop);
      r.addEventListener('click', () => this.onSeek(row.start - 0.3));
      frag.append(r);
    });
    this.el.replaceChildren(frag);
    this.rowEls = [...this.el.querySelectorAll('.k-row')];
  }

  update(t, settings) {
    const i = rowIndexAt(this.rows, t);
    if (i !== this.cur) {
      this.rowEls[this.cur]?.classList.remove('active');
      this.rowEls[this.cur]?.style.removeProperty('--p');
      this.rowEls.forEach((el, k) => el.classList.toggle('past', k < i));
      const el = this.rowEls[i];
      el?.classList.add('active');
      this.cur = i;
      if (el && settings.autoScroll && performance.now() > this.userScrollUntil) scrollIntoPanel(this.el, el);
    }
    const row = this.rows[i];
    const el = this.rowEls[i];
    if (row && el) {
      const p = Math.max(0, Math.min(1, (t - row.start) / Math.max(0.3, row.sing)));
      el.style.setProperty('--p', `${(p * 100).toFixed(1)}%`);
    }
  }
}

function buildRows(lines, tl, lyricsOffset) {
  const src = lines.map((l) => ({ t: l.t + lyricsOffset, text: l.text }));
  const rows = [];
  const end = Math.max(tl.end, src.at(-1)?.t ?? 0);
  const firstChord = tl.events[0]?.start ?? 0;
  if (src.length && src[0].t - firstChord > 1.5) {
    rows.push({ start: firstChord, end: src[0].t, instrumental: true, text: '' });
  }
  src.forEach((l, i) => {
    const next = src[i + 1]?.t ?? end;
    const gap = next - l.t;
    if (!l.text) {
      rows.push({ start: l.t, end: next, instrumental: true, text: '' });
      return;
    }
    const lineEnd = gap > MAX_LINE_GAP ? l.t + Math.min(gap, 5) : next;
    // Durata stimata del cantato (per l'effetto di riempimento): ~12 caratteri al secondo.
    const sing = Math.min(lineEnd - l.t, 0.5 + l.text.length / 12);
    rows.push({ start: l.t, end: lineEnd, text: l.text, sing });
    if (gap > MAX_LINE_GAP) rows.push({ start: lineEnd, end: next, instrumental: true, text: '' });
  });
  for (const row of rows) {
    row.sing ??= row.end - row.start;
    row.chords = [];
    const first = eventIndexAt(tl, row.start + 0.05);
    if (first >= 0 && tl.events[first].end > row.start + 0.1) {
      row.chords.push({ name: tl.events[first].name, pos: 0, carried: tl.events[first].start < row.start - 0.15 });
    }
    for (let k = first + 1; k < tl.events.length; k++) {
      const ev = tl.events[k];
      if (ev.start >= row.end - 0.05) break;
      row.chords.push({ name: ev.name, pos: (ev.start - row.start) / (row.end - row.start), carried: false });
    }
  }
  return rows;
}

function placeChords(row, box, settings) {
  // posizioni proporzionali al tempo, con uno spazio minimo fra un accordo e l'altro
  const pos = [];
  for (const c of row.chords) {
    let p = Math.min(0.9, Math.max(0, c.pos));
    if (pos.length && p - pos.at(-1) < 0.14) p = pos.at(-1) + 0.14;
    pos.push(p);
  }
  // troppi accordi per la riga: si mostrano in sequenza (vanno a capo) invece che sovrapposti
  const flow = pos.length && pos.at(-1) > 0.92;
  box.classList.toggle('flow', flow);
  row.chords.forEach((c, i) => {
    const s = document.createElement('span');
    s.className = 'k-chord' + (c.carried ? ' carried' : '');
    s.textContent = displayChord(c.name, settings.notation);
    if (!flow) s.style.left = `${(pos[i] * 100).toFixed(1)}%`;
    s.style.setProperty('--c', chordColor(c.name));
    box.append(s);
  });
  return flow;
}

function rowIndexAt(rows, t) {
  let lo = 0;
  let hi = rows.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].start <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

export function scrollIntoPanel(panel, el) {
  if (panel.scrollHeight > panel.clientHeight + 4) {
    const top = el.offsetTop - panel.clientHeight * 0.32;
    panel.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    return;
  }
  // Telefono: scorre la pagina tenendo conto del palco fisso in alto.
  const sticky = document.querySelector('.stage')?.getBoundingClientRect().height ?? 0;
  const r = el.getBoundingClientRect();
  const top = sticky + 8;
  const bottom = window.innerHeight - 8;
  if (r.top < top || r.bottom > bottom) {
    window.scrollBy({ top: r.top - top - (bottom - top) * 0.25, behavior: 'smooth' });
  }
}
