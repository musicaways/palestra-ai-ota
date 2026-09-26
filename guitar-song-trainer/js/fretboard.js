// Disegno su canvas: "autostrada" degli accordi in arrivo + manico con la diteggiatura animata.
import { getShape, displayChord, chordColor, STRING_COLORS, noteName, fretNote } from './music.js';
import { beatAt } from './timeline.js';

const INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];
const DOUBLE_INLAYS = [12, 24];
const LOOKAHEAD_SEC = 6;

const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export class Fretboard {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camStart = 0; // primo tasto visibile (animato)
    this.customShapes = null;
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(canvas);
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  destroy() { this._ro.disconnect(); }

  shape(name) { return name ? getShape(name, this.customShapes) : null; }

  render(t, tl, idx, settings, rate = 1) {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    const hwH = Math.round(clamp(h * 0.3, 44, 84));
    this.drawHighway(t, tl, idx, settings, 0, hwH, rate);
    this.drawNeck(t, tl, idx, settings, hwH + 6, h - hwH - 6);
  }

  // ---------- Autostrada: blocchi accordo che scorrono verso la linea "adesso" ----------
  drawHighway(t, tl, idx, settings, y, hh, rate) {
    const { ctx, w } = this;
    const nowX = Math.round(w * 0.16);
    const window = LOOKAHEAD_SEC * Math.max(0.5, Math.min(1, rate));
    const pps = (w - nowX) / window;
    const mirror = settings.leftHanded;
    const X = (x) => (mirror ? w - x : x);

    const bg = ctx.createLinearGradient(0, y, 0, y + hh);
    bg.addColorStop(0, '#12161f');
    bg.addColorStop(1, '#1b2130');
    ctx.fillStyle = bg;
    ctx.fillRect(0, y, w, hh);

    // Battute e battiti
    const tStart = t - nowX / pps;
    const tEnd = t + window;
    for (const bar of tl.bars) {
      if (bar.end < tStart) continue;
      if (bar.start > tEnd) break;
      const bd = (bar.end - bar.start) / tl.bpb;
      for (let b = 0; b < tl.bpb; b++) {
        const bt = bar.start + b * bd;
        const x = nowX + (bt - t) * pps;
        if (x < 0 || x > w) continue;
        ctx.strokeStyle = b === 0 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.10)';
        ctx.lineWidth = b === 0 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(X(x), y + (b === 0 ? 0 : hh * 0.72));
        ctx.lineTo(X(x), y + hh);
        ctx.stroke();
      }
    }

    // Blocchi accordo
    const pad = 6;
    for (let i = Math.max(0, idx - 1); i < tl.events.length; i++) {
      const ev = tl.events[i];
      if (ev.start > tEnd) break;
      let x0 = nowX + (ev.start - t) * pps;
      let x1 = nowX + (ev.end - t) * pps;
      if (x1 < 0) continue;
      const active = i === idx;
      const color = chordColor(ev.name);
      const bx0 = Math.max(x0, active ? nowX : x0) + 2;
      const bx1 = x1 - 2;
      if (bx1 - bx0 < 2) continue;
      ctx.globalAlpha = active ? 1 : 0.85;
      ctx.fillStyle = color;
      roundRect(ctx, mirror ? w - bx1 : bx0, y + pad, bx1 - bx0, hh * 0.62 - pad, 7);
      ctx.fill();
      ctx.globalAlpha = 1;
      // Bordo d'attacco: il momento esatto del cambio accordo
      if (x0 >= nowX - 1) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(X(x0 + 1) - 1.5, y + pad, 3, hh * 0.62 - pad);
      }
      const label = displayChord(ev.name, settings.notation);
      ctx.font = `700 ${Math.round(hh * 0.28)}px system-ui, sans-serif`;
      ctx.fillStyle = '#0b0d12';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(label).width;
      if (bx1 - bx0 > tw + 10) {
        ctx.textAlign = 'left';
        const lx = mirror ? w - bx1 + 8 : bx0 + 8;
        ctx.fillText(label, lx, y + pad + (hh * 0.62 - pad) / 2);
      }
    }

    // Linea "adesso"
    const pulse = this.beatPulse(t, tl);
    ctx.fillStyle = `rgba(255,255,255,${0.55 + 0.45 * pulse})`;
    ctx.fillRect(X(nowX) - 2, y, 4, hh);
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 10 * pulse;
    ctx.fillRect(X(nowX) - 1, y, 2, hh);
    ctx.shadowBlur = 0;
  }

  beatPulse(t, tl) {
    const { beat } = beatAt(tl, t);
    if (!(beat >= 0)) return 0;
    const frac = beat - Math.floor(beat);
    return Math.max(0, 1 - frac * 3);
  }

  // ---------- Manico ----------
  drawNeck(t, tl, idx, settings, y, nh) {
    const { ctx, w } = this;
    const cur = tl.events[idx] ?? null;
    const next = tl.events[idx + 1] ?? (idx < 0 ? tl.events[0] : null);
    const shapeA = this.shape(cur?.name);
    const shapeB = this.shape(next?.name);

    // Transizione nell'ultimo battito prima del cambio
    let p = 0;
    if (next && cur) {
      const bd = (cur.end - cur.start) / Math.max(1, cur.beats);
      const morph = Math.min(bd, 0.6);
      p = ease(clamp((t - (next.start - morph)) / morph, 0, 1));
    }

    // Finestra dei tasti da mostrare (la "telecamera" segue la diteggiatura)
    const span = w < 520 ? 6 : w < 860 ? 9 : 12;
    const target = this.cameraTarget([shapeA, shapeB], span);
    this.camStart += (target - this.camStart) * 0.08;
    if (Math.abs(target - this.camStart) < 0.01) this.camStart = target;
    const f0 = this.camStart;

    const openW = 30;
    const left = openW + 8;
    const right = 10;
    const topPad = 8;
    const bottomPad = 20;
    const neckTop = y + topPad;
    const neckH = nh - topPad - bottomPad;
    const fretW = (w - left - right) / span;
    const mirror = settings.leftHanded;
    const X = (x) => (mirror ? w - x : x);
    const fretX = (f) => left + (f - f0) * fretW; // linea del tasto f (f=0: capotasto)
    const noteX = (f) => (f === 0 ? openW / 2 + 2 : fretX(f - 0.5));
    const stringY = (s) => {
      const k = settings.highStringOnTop ? 5 - s : s;
      return neckTop + neckH * (0.08 + (0.84 * k) / 5);
    };

    // Legno del manico
    ctx.save();
    ctx.beginPath();
    ctx.rect(mirror ? right : left, neckTop, w - left - right, neckH);
    ctx.clip();
    const wood = ctx.createLinearGradient(0, neckTop, 0, neckTop + neckH);
    wood.addColorStop(0, '#2a1d14');
    wood.addColorStop(0.5, '#3a281b');
    wood.addColorStop(1, '#241810');
    ctx.fillStyle = wood;
    ctx.fillRect(0, neckTop, w, neckH);

    const firstFret = Math.floor(f0);
    for (let f = firstFret; f <= firstFret + span + 1; f++) {
      if (f < 0) continue;
      const cx = X(fretX(f - 0.5));
      if (INLAYS.includes(f)) dot(ctx, cx, neckTop + neckH / 2, 5, 'rgba(230,220,200,0.35)');
      if (DOUBLE_INLAYS.includes(f)) {
        dot(ctx, cx, neckTop + neckH * 0.3, 5, 'rgba(230,220,200,0.35)');
        dot(ctx, cx, neckTop + neckH * 0.7, 5, 'rgba(230,220,200,0.35)');
      }
      const fx = X(fretX(f));
      ctx.fillStyle = f === 0 ? '#efe6d2' : '#9aa0a8';
      ctx.fillRect(fx - (f === 0 ? 3 : 1), neckTop, f === 0 ? 6 : 2, neckH);
    }
    ctx.restore();

    // Numeri dei tasti
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let f = Math.max(1, firstFret); f <= firstFret + span + 1; f++) {
      const cx = fretX(f - 0.5);
      if (cx < left || cx > w - right) continue;
      ctx.fillStyle = INLAYS.includes(f) || DOUBLE_INLAYS.includes(f) ? '#e6e9ef' : '#7d8594';
      ctx.fillText(String(f), X(cx), neckTop + neckH + 4);
    }

    // Corde
    for (let s = 0; s < 6; s++) {
      const sy = stringY(s);
      ctx.fillStyle = STRING_COLORS[s];
      ctx.globalAlpha = 0.9;
      ctx.fillRect(mirror ? 0 : left - 4, sy - (1 + (5 - s) * 0.25), w - left + 4, 2 + (5 - s) * 0.5);
      ctx.globalAlpha = 1;
    }

    if (!shapeA && !shapeB) {
      if (cur && !shapeA) this.unknown(cur.name, settings, y + nh / 2);
      return;
    }

    // Anteprima dell'accordo successivo (fantasma)
    if (shapeB && p < 1) {
      ctx.globalAlpha = 0.35 * (1 - p);
      for (let s = 0; s < 6; s++) {
        const f = shapeB.frets[s];
        if (f === null || f === 0) continue;
        ring(ctx, X(noteX(f)), stringY(s), 11, STRING_COLORS[s]);
      }
      ctx.globalAlpha = 1;
    }

    // Barré
    const drawBarres = (shape, alpha) => {
      if (!shape || alpha <= 0) return;
      ctx.globalAlpha = alpha * 0.55;
      for (const b of shape.barres) {
        const bx = X(noteX(b.fret));
        const y1 = stringY(b.from);
        const y2 = stringY(b.to);
        ctx.fillStyle = '#f5f7fb';
        roundRect(ctx, bx - 7, Math.min(y1, y2) - 7, 14, Math.abs(y2 - y1) + 14, 7);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    drawBarres(shapeA, 1 - p);
    drawBarres(shapeB, p);

    // Dita: interpolazione fra la posizione attuale e quella successiva
    const flash = cur ? Math.max(0, 1 - (t - cur.start) / 0.25) : 0;
    for (let s = 0; s < 6; s++) {
      const a = shapeA?.frets[s];
      const b = shapeB?.frets[s];
      const aOn = a != null && a > 0;
      const bOn = b != null && b > 0;
      const sy = stringY(s);
      if (aOn && bOn) {
        const x = noteX(a) + (noteX(b) - noteX(a)) * p;
        const finger = p < 0.5 ? shapeA.fingers[s] : shapeB.fingers[s];
        const fret = p < 0.5 ? a : b;
        this.fingerDot(X(x), sy, s, finger, fret, settings, 1, flash);
      } else {
        if (aOn) this.fingerDot(X(noteX(a)), sy, s, shapeA.fingers[s], a, settings, 1 - p, flash);
        if (bOn) this.fingerDot(X(noteX(b)), sy, s, shapeB.fingers[s], b, settings, p, 0);
      }
      // Indicatori a vuoto / non suonare
      const markerFor = (shape) => (shape ? (shape.frets[s] === null ? 'x' : shape.frets[s] === 0 ? 'o' : null) : null);
      const mA = markerFor(shapeA);
      const mB = markerFor(shapeB);
      const mx = X(openW / 2 + 2);
      if (mA) this.marker(mx, sy, mA, s, 1 - p);
      if (mB) this.marker(mx, sy, mB, s, p);
    }
  }

  cameraTarget(shapes, span) {
    const frets = shapes.flatMap((sh) => (sh ? sh.frets.filter((f) => f != null && f > 0) : []));
    if (!frets.length) return 0;
    const lo = Math.min(...frets);
    const hi = Math.max(...frets);
    if (hi <= span - 1) return 0;
    return Math.max(0, Math.min(lo - 1, hi - span + 1));
  }

  fingerDot(x, y, s, finger, fret, settings, alpha, flash) {
    if (alpha <= 0.01) return;
    const { ctx } = this;
    ctx.globalAlpha = alpha;
    const r = 11;
    ctx.shadowColor = STRING_COLORS[s];
    ctx.shadowBlur = 8 + 18 * flash;
    dot(ctx, x, y, r + 2 * flash, STRING_COLORS[s]);
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(x, y, r + 2 * flash, 0, Math.PI * 2);
    ctx.stroke();
    const label = settings.showNoteNames ? noteName(fretNote(s, fret), settings.notation) : finger ? String(finger) : '';
    if (label) {
      ctx.fillStyle = '#0b0d12';
      ctx.font = `800 ${label.length > 2 ? 9 : 12}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, y + 0.5);
    }
    ctx.globalAlpha = 1;
  }

  marker(x, y, kind, s, alpha) {
    if (alpha <= 0.01) return;
    const { ctx } = this;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 2.5;
    if (kind === 'o') {
      ctx.strokeStyle = STRING_COLORS[s];
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#8a92a3';
      ctx.beginPath();
      ctx.moveTo(x - 5, y - 5);
      ctx.lineTo(x + 5, y + 5);
      ctx.moveTo(x + 5, y - 5);
      ctx.lineTo(x - 5, y + 5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  unknown(name, settings, cy) {
    const { ctx, w } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(w / 2 - 120, cy - 16, 240, 32);
    ctx.fillStyle = '#fff';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Diteggiatura di ${displayChord(name, settings.notation)} non disponibile`, w / 2, cy);
  }
}

function dot(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function ring(ctx, x, y, r, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
