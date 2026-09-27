// Griglia degli accordi per battuta, con evidenziazione e scorrimento automatico.
import { displayChord, chordColor } from './music.js';
import { scrollIntoPanel } from './karaoke.js';
import { icon } from './icons.js';

export class Sheet {
  /** @param handlers { onSeek(t), onLoop(start, end, label) } */
  constructor(container, handlers) {
    this.el = container;
    this.handlers = handlers;
    this.curBar = -2;
    this.curRow = -2;
    this.userScrollUntil = 0;
    const mark = () => { this.userScrollUntil = performance.now() + 4000; };
    this.el.addEventListener('wheel', mark, { passive: true });
    this.el.addEventListener('touchmove', mark, { passive: true });
  }

  /** @param lyrics blocchi di testo (non sincronizzato), uno per riga della griglia */
  render(tl, settings, lyrics = []) {
    this.tl = tl;
    this.curBar = -2;
    this.curRow = -2;
    const frag = document.createDocumentFragment();
    tl.sections.forEach((sec) => {
      const head = document.createElement('div');
      head.className = 'k-sec';
      head.innerHTML = `<span></span><button class="k-sec-loop" title="Ripeti in loop la sezione">${icon('loop', 14)}</button>`;
      head.firstChild.textContent = sec.name;
      head.querySelector('button').addEventListener('click', (e) => {
        e.stopPropagation();
        this.handlers.onLoop(sec.start, sec.end, sec.name);
      });
      head.addEventListener('click', () => this.handlers.onSeek(sec.start));
      frag.append(head);

      for (let r = sec.rowStart; r < sec.rowEnd; r++) {
        const row = tl.rows[r];
        const rowEl = document.createElement('div');
        rowEl.className = 'sheet-row';
        const bars = document.createElement('div');
        bars.className = 'sheet-bars';
        for (let b = row.barStart; b < row.barEnd; b++) {
          const bar = tl.bars[b];
          const barEl = document.createElement('button');
          barEl.className = 'sheet-bar';
          barEl.title = `Battuta ${b + 1}`;
          const chips = bar.chords.length ? bar.chords : [{ name: bar.held?.name ?? '', beats: 1, held: true }];
          for (const ev of chips) {
            const c = document.createElement('span');
            c.className = 'chip' + (ev.held ? ' held' : '');
            c.textContent = ev.held ? '%' : displayChord(ev.name, settings.notation);
            if (ev.name) c.style.setProperty('--chip', chordColor(ev.name));
            c.style.flexGrow = ev.beats;
            barEl.append(c);
          }
          barEl.addEventListener('click', () => this.handlers.onSeek(bar.start));
          bars.append(barEl);
        }
        const loopRow = document.createElement('button');
        loopRow.className = 'k-loop';
        loopRow.title = 'Ripeti in loop questa riga';
        loopRow.innerHTML = icon('loop', 14);
        loopRow.addEventListener('click', () => this.handlers.onLoop(row.start, row.end, `${sec.name} · riga ${row.n + 1}`));
        rowEl.append(bars, loopRow);
        const text = lyrics[r];
        if (text) {
          const lyr = document.createElement('div');
          lyr.className = 'sheet-lyric';
          lyr.textContent = text;
          rowEl.append(lyr);
        }
        frag.append(rowEl);
      }
    });
    this.el.replaceChildren(frag);
    this.barEls = [...this.el.querySelectorAll('.sheet-bar')];
    this.rowEls = [...this.el.querySelectorAll('.sheet-row')];
  }

  update(barIdx, settings) {
    if (barIdx === this.curBar) return;
    this.barEls[this.curBar]?.classList.remove('active');
    this.barEls[barIdx]?.classList.add('active');
    this.curBar = barIdx;
    const rowIdx = barIdx >= 0 ? this.tl.bars[barIdx].row : -1;
    if (rowIdx !== this.curRow) {
      this.rowEls[this.curRow]?.classList.remove('active');
      const rowEl = this.rowEls[rowIdx];
      rowEl?.classList.add('active');
      this.curRow = rowIdx;
      if (rowEl && settings.autoScroll && performance.now() > this.userScrollUntil && this.el.offsetParent) {
        scrollIntoPanel(this.el, rowEl);
      }
    }
  }
}
