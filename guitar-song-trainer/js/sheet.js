// Spartito testuale: accordi per battuta + testo, con evidenziazione e scorrimento automatico.
import { displayChord, chordColor } from './music.js';

export class Sheet {
  /**
   * @param container elemento scrollabile
   * @param handlers  { onSeek(t), onLoop(start, end, label) }
   */
  constructor(container, handlers) {
    this.el = container;
    this.handlers = handlers;
    this.curBar = -2;
    this.curRow = -2;
    this.userScrollUntil = 0;
    const markUserScroll = () => { this.userScrollUntil = performance.now() + 4000; };
    this.el.addEventListener('wheel', markUserScroll, { passive: true });
    this.el.addEventListener('touchmove', markUserScroll, { passive: true });
  }

  /**
   * @param lyrics array di blocchi di testo, uno per riga dello spartito (può essere vuoto)
   */
  render(tl, song, settings, lyrics = []) {
    this.tl = tl;
    this.curBar = -2;
    this.curRow = -2;
    const frag = document.createDocumentFragment();
    tl.sections.forEach((sec) => {
      const head = el('div', 'sheet-section');
      head.append(el('span', 'sheet-section-name', sec.name));
      const loopBtn = el('button', 'icon-btn small', '⟲');
      loopBtn.title = `Ripeti in loop: ${sec.name}`;
      loopBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handlers.onLoop(sec.start, sec.end, sec.name);
      });
      head.append(loopBtn);
      head.addEventListener('click', () => this.handlers.onSeek(sec.start));
      frag.append(head);

      for (let r = sec.rowStart; r < sec.rowEnd; r++) {
        const row = tl.rows[r];
        const rowEl = el('div', 'sheet-row');
        rowEl.dataset.row = r;
        const bars = el('div', 'sheet-bars');
        for (let b = row.barStart; b < row.barEnd; b++) {
          const bar = tl.bars[b];
          const barEl = el('button', 'sheet-bar');
          barEl.dataset.bar = b;
          barEl.title = `Battuta ${b + 1}`;
          for (const ev of bar.chords) {
            const c = el('span', 'chip', displayChord(ev.name, settings.notation));
            c.style.setProperty('--chip', chordColor(ev.name));
            c.style.flexGrow = ev.beats;
            barEl.append(c);
          }
          barEl.addEventListener('click', () => this.handlers.onSeek(bar.start));
          bars.append(barEl);
        }
        const loopRow = el('button', 'icon-btn small row-loop', '⟲');
        loopRow.title = 'Ripeti in loop questa frase';
        loopRow.addEventListener('click', () => this.handlers.onLoop(row.start, row.end, `${sec.name} · frase ${row.n + 1}`));
        rowEl.append(bars, loopRow);

        const text = lyrics[r] ?? song.lyrics?.[r] ?? '';
        const lyr = el('div', 'sheet-lyric' + (text ? '' : ' empty'));
        lyr.textContent = text || '—';
        rowEl.append(lyr);
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
      if (rowEl && settings.autoScroll && performance.now() > this.userScrollUntil) this.scrollTo(rowEl);
    }
  }

  scrollTo(rowEl) {
    if (this.el.scrollHeight > this.el.clientHeight + 4) {
      // Spartito con scorrimento proprio (schermi larghi)
      const top = rowEl.offsetTop - this.el.clientHeight * 0.3;
      this.el.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      return;
    }
    // Telefono: scorre la pagina, tenendo conto del manico fisso in alto
    const sticky = document.querySelector('.stage')?.getBoundingClientRect().height ?? 0;
    const r = rowEl.getBoundingClientRect();
    const visibleTop = sticky + 8;
    const visibleBottom = window.innerHeight - 8;
    if (r.top < visibleTop || r.bottom > visibleBottom) {
      window.scrollBy({ top: r.top - visibleTop - (visibleBottom - visibleTop) * 0.2, behavior: 'smooth' });
    }
  }
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
