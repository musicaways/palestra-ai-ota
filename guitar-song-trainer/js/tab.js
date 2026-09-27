// Tablatura della parte a note singole (arpeggio o parte vera da MIDI): battuta per battuta, sei righe
// (cantino in alto, come nelle tablature), il numero è il tasto. Segue la musica e un tocco porta lì.
import { scrollIntoPanel } from './karaoke.js';

const LINES = ['e', 'B', 'G', 'D', 'A', 'E'];

/**
 * Parte pura: le note nelle battute, su una griglia di `perBeat` colonne per battito.
 * @returns [{ index, start, end, cols: [{ slot, frets: [6 × numero|null] }], size }]
 */
export function tabBars(tl, notes, { perBeat = 4 } = {}) {
  const size = tl.bpb * perBeat;
  const out = tl.bars.map((b, index) => ({ index, start: b.start, end: b.end, size, map: new Map() }));
  let bi = 0;
  for (const n of notes ?? []) {
    while (bi < out.length - 1 && n.t >= out[bi].end) bi++;
    const bar = out[bi];
    if (!bar || n.t < bar.start - 0.05) continue;
    const slot = Math.max(0, Math.min(size - 1, Math.round(((n.t - bar.start) / Math.max(0.01, bar.end - bar.start)) * size)));
    if (!bar.map.has(slot)) bar.map.set(slot, Array(6).fill(null));
    const col = bar.map.get(slot);
    if (col[n.string] == null) col[n.string] = n.fret;
  }
  return out.map(({ map, ...b }) => ({ ...b, cols: [...map.entries()].sort((a, c) => a[0] - c[0]).map(([slot, frets]) => ({ slot, frets })) }));
}

export class Tab {
  constructor(container, { onSeek }) {
    this.el = container;
    this.onSeek = onSeek;
    this.cur = -2;
    this.userScrollUntil = 0;
    const mark = () => { this.userScrollUntil = performance.now() + 4000; };
    this.el.addEventListener('wheel', mark, { passive: true });
    this.el.addEventListener('touchmove', mark, { passive: true });
  }

  render(tl, notes, { capo = 0, source = '' } = {}) {
    this.cur = -2;
    this.bars = [];
    if (!notes?.length) {
      this.el.innerHTML = `<div class="panel-empty">La tablatura c'è quando suoni note singole: scegli <b>Parte → Arpeggio</b>,
        oppure <b>Parte → Parte vera (MIDI)</b> per le note esatte del brano.</div>`;
      return;
    }
    const bars = tabBars(tl, notes);
    const frag = document.createDocumentFragment();
    const head = document.createElement('p');
    head.className = 'hint';
    head.textContent = `${source}${capo ? ` · capotasto al ${capo}° tasto (i numeri partono dal capotasto)` : ''} · la riga in alto è il cantino (Mi acuto).`;
    frag.append(head);
    const wrap = document.createElement('div');
    wrap.className = 'tab-wrap';
    let secIdx = -1;
    for (const b of bars) {
      const s = tl.sections.findIndex((x) => b.index >= x.barStart && b.index < x.barEnd);
      if (s !== secIdx && s >= 0) {
        secIdx = s;
        const h = document.createElement('div');
        h.className = 'tab-sec';
        h.textContent = tl.sections[s].name;
        wrap.append(h);
      }
      const el = document.createElement('div');
      el.className = 'tab-bar';
      el.style.setProperty('--cols', b.size);
      el.title = `Battuta ${b.index + 1}`;
      const cells = [];
      for (let line = 0; line < 6; line++) {
        const string = 5 - line;
        for (let slot = 0; slot < b.size; slot++) {
          const col = b.cols.find((c) => c.slot === slot);
          const f = col?.frets[string];
          cells.push(`<i style="grid-row:${line + 1};grid-column:${slot + 1}"${f != null ? ` class="n" data-slot="${slot}"` : ''}>${f != null ? f : ''}</i>`);
        }
      }
      el.innerHTML = `<b class="tab-num">${b.index + 1}</b>${cells.join('')}<span class="tab-cursor"></span>`;
      el.addEventListener('click', () => this.onSeek(b.start));
      wrap.append(el);
      this.bars.push({ el, ...b });
    }
    frag.append(wrap);
    this.el.replaceChildren(frag);
  }

  update(t, settings) {
    if (!this.bars?.length) return;
    let i = -1;
    for (let k = 0; k < this.bars.length; k++) if (this.bars[k].start <= t) i = k; else break;
    const bar = this.bars[i];
    if (i !== this.cur) {
      this.bars[this.cur]?.el.classList.remove('now');
      this.cur = i;
      if (bar) {
        bar.el.classList.add('now');
        if (settings.autoScroll && performance.now() > this.userScrollUntil) scrollIntoPanel(this.el, bar.el);
      }
    }
    if (bar) bar.el.style.setProperty('--pos', Math.max(0, Math.min(1, (t - bar.start) / Math.max(0.01, bar.end - bar.start))).toFixed(4));
  }
}
