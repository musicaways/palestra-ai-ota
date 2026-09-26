// Palco in stile Rocksmith su canvas 2D con prospettiva:
// - in basso il manico visto di fronte (dove si suona "adesso");
// - dietro, una corsia in profondità da cui arrivano le cornici degli accordi con le gemme
//   colorate sulle corde e sui tasti giusti, che si posano sul manico nel momento del cambio.
import { getShape, displayChord, chordColor, STRING_COLORS, noteName, fretNote } from './music.js';
import { beatsBetween } from './timeline.js';

const INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];
const DOUBLE_INLAYS = [12, 24];
const LOOKAHEAD = 4.2; // secondi visibili sulla corsia
const FAR_SCALE = 0.3; // scala della cornice più lontana

const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function alpha(color, a) {
  // hsl(h s% l%) → hsl(h s% l% / a)
  return color.startsWith('hsl(') ? color.replace(')', ` / ${a})`) : color;
}

export class Fretboard {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camStart = 0;
    this.customShapes = null;
    this.capo = 0;
    this.particles = [];
    this.vibration = [0, 0, 0, 0, 0, 0];
    this.lastIdx = -2;
    this.verdict = null; // { ok, at } esito dell'ultimo accordo in modalità ascolto
    this.lastFrame = performance.now();
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(canvas);
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.bg = null;
  }

  destroy() { this._ro.disconnect(); }

  // Con il capotasto la forma resta la stessa ma si sposta in su di "capo" tasti.
  shape(name) {
    if (!name) return null;
    const base = getShape(name, this.capo ? null : this.customShapes);
    if (!base || !this.capo) return base;
    const c = this.capo;
    return {
      frets: base.frets.map((f) => (f === null || f === 0 ? f : f + c)),
      fingers: base.fingers,
      barres: base.barres.map((b) => ({ ...b, fret: b.fret + c })),
    };
  }

  render(t, tl, idx, settings, playing) {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const { ctx, w, h } = this;

    // ---- geometria ----
    const narrow = w < 560;
    const span = narrow ? 6 : w < 900 ? 9 : 12;
    const neckH = clamp(h * 0.36, 92, 150);
    const numH = 18;
    const neckBottom = h - numH;
    const neckTop = neckBottom - neckH;
    const openW = 30;
    const left = openW + 10;
    const right = 12;
    const fretW = (w - left - right) / span;
    const mirror = settings.leftHanded;
    const X = (x) => (mirror ? w - x : x);
    const cur = tl.events[idx] ?? null;
    const next = tl.events[idx + 1] ?? (idx < 0 ? tl.events[0] : null);
    const shapeA = this.shape(cur?.name);
    const shapeB = this.shape(next?.name);

    const target = this.cameraTarget([shapeA, shapeB], span);
    this.camStart += (target - this.camStart) * Math.min(1, dt * 5);
    if (Math.abs(target - this.camStart) < 0.005) this.camStart = target;
    const f0 = this.camStart;
    const fretX = (f) => left + (f - f0) * fretW;
    const noteX = (f) => (f === 0 ? openW / 2 + 2 : fretX(f - 0.5));
    const stringY = (s) => {
      const k = settings.highStringOnTop ? 5 - s : s;
      return neckTop + neckH * (0.13 + (0.74 * k) / 5);
    };
    const yTop = Math.min(stringY(0), stringY(5));
    const yBot = Math.max(stringY(0), stringY(5));

    const vpX = w / 2;
    const vpY = -h * 0.04;
    const kz = (1 / FAR_SCALE - 1) / LOOKAHEAD;
    const P = (x, y, d) => {
      const s = 1 / (1 + kz * d);
      return [vpX + (x - vpX) * s, vpY + (y - vpY) * s, s];
    };

    // ---- effetti al cambio accordo ----
    if (idx !== this.lastIdx) {
      if (cur && shapeA && playing && t - cur.start < 0.25) {
        for (let s = 0; s < 6; s++) {
          const f = shapeA.frets[s];
          if (f === null) continue;
          this.vibration[s] = 1;
          this.burst(X(noteX(f)), stringY(s), STRING_COLORS[s], f === 0 ? 4 : 10);
        }
      }
      this.lastIdx = idx;
    }
    this.vibration = this.vibration.map((v) => Math.max(0, v - dt * 2.2));

    // ---- sfondo ----
    this.drawBackground(vpX, neckTop);

    // ---- corsia ----
    const laneL = X(fretX(Math.floor(f0)));
    const laneR = X(fretX(Math.floor(f0) + span + 1));
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, neckTop);
    ctx.clip();

    // zona evidenziata sui tasti del prossimo accordo
    const zoneShape = shapeB ?? shapeA;
    if (zoneShape) {
      const [lo, hi] = fretRange(zoneShape);
      const c = chordColor((shapeB ? next : cur).name);
      const a0 = P(X(fretX(lo - 1)), neckTop, 0);
      const a1 = P(X(fretX(hi)), neckTop, 0);
      const b0 = P(X(fretX(lo - 1)), neckTop, LOOKAHEAD);
      const b1 = P(X(fretX(hi)), neckTop, LOOKAHEAD);
      const g = ctx.createLinearGradient(0, a0[1], 0, b0[1]);
      g.addColorStop(0, alpha(c, 0.22));
      g.addColorStop(1, alpha(c, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.lineTo(b1[0], b1[1]); ctx.lineTo(b0[0], b0[1]);
      ctx.closePath();
      ctx.fill();
    }

    // linee dei tasti che si perdono all'orizzonte
    for (let f = Math.floor(f0); f <= Math.floor(f0) + span + 1; f++) {
      const a = P(X(fretX(f)), neckTop, 0);
      const b = P(X(fretX(f)), neckTop, LOOKAHEAD);
      const g = ctx.createLinearGradient(0, a[1], 0, b[1]);
      g.addColorStop(0, 'rgba(140,160,255,0.35)');
      g.addColorStop(1, 'rgba(140,160,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = f === 0 ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }

    // griglia ritmica: battiti che scorrono verso il manico
    for (const b of beatsBetween(tl, t, t + LOOKAHEAD)) {
      const d = b.t - t;
      const p0 = P(laneL, neckTop, d);
      const p1 = P(laneR, neckTop, d);
      const fade = 1 - d / LOOKAHEAD;
      ctx.strokeStyle = b.downbeat ? `rgba(255,255,255,${0.55 * fade})` : `rgba(160,170,255,${0.22 * fade})`;
      ctx.lineWidth = (b.downbeat ? 3 : 1.2) * p0[2];
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    }

    // frecce della pennata sulle suddivisioni della battuta
    if (tl.strum) {
      const pat = tl.strum.replace(/\s+/g, '');
      const ax = laneL + (laneR - laneL) * (mirror ? 0.94 : 0.06);
      for (const bar of tl.bars) {
        if (bar.end < t) continue;
        if (bar.start > t + LOOKAHEAD) break;
        const step = (bar.end - bar.start) / pat.length;
        for (let i = 0; i < pat.length; i++) {
          const ch = pat[i];
          if (ch !== 'D' && ch !== 'U') continue;
          const d = bar.start + i * step - t;
          if (d < 0 || d > LOOKAHEAD) continue;
          const [px, py, sc] = P(ax, neckTop, d);
          strumArrow(ctx, px, py - 10 * sc, 11 * sc, ch === 'D', 1 - d / LOOKAHEAD);
        }
      }
    }

    // cornici in arrivo: piene ai cambi accordo, "fantasma" sulle battute in cui l'accordo prosegue
    const upcoming = [];
    for (let i = Math.max(0, idx); i < tl.events.length; i++) {
      const ev = tl.events[i];
      const d = ev.start - t;
      if (d > LOOKAHEAD) break;
      if (d > 0) upcoming.push({ ev, d, ghost: false });
    }
    for (const bar of tl.bars) {
      if (bar.start > t + LOOKAHEAD) break;
      if (bar.start <= t || bar.chords.length || !bar.held) continue;
      upcoming.push({ ev: bar.held, d: bar.start - t, ghost: true });
    }
    upcoming.sort((a, b) => b.d - a.d);
    const geo = { P, X, noteX, fretX, stringY, yTop, yBot };
    for (const u of upcoming) this.drawChordFrame(u.ev, u.d, settings, geo, u.ghost);
    ctx.restore();

    // ---- manico ----
    this.drawNeck({ X, fretX, stringY, neckTop, neckBottom, neckH, left, right, f0, span, mirror, openW, t, fretW });

    // ---- diteggiatura corrente con transizione verso la successiva ----
    let p = 0;
    if (next && cur) {
      const bd = (cur.end - cur.start) / Math.max(1, cur.beats);
      const morph = Math.min(bd, 0.55);
      p = ease(clamp((t - (next.start - morph)) / morph, 0, 1));
    }
    if (!shapeA && cur) this.unknown(cur.name, settings, neckTop + neckH / 2);
    this.drawFingering(shapeA, shapeB, p, t, cur, settings, { X, noteX, stringY, openW });

    // ---- esito in modalità ascolto ----
    if (this.verdict) {
      const age = (now - this.verdict.at) / 1000;
      if (age < 0.7) {
        const c = this.verdict.ok ? '61, 220, 132' : '255, 77, 94';
        const a = 1 - age / 0.7;
        ctx.strokeStyle = `rgba(${c}, ${a})`;
        ctx.lineWidth = 4;
        ctx.shadowColor = `rgb(${c})`;
        ctx.shadowBlur = 24 * a;
        ctx.strokeRect(2, neckTop - 2, w - 4, neckH + 4);
        ctx.shadowBlur = 0;
      } else this.verdict = null;
    }

    // ---- particelle ----
    this.drawParticles(dt);
  }

  drawBackground(vpX, horizon) {
    const { ctx, w, h } = this;
    if (!this.bg || this.bg.w !== w || this.bg.h !== h) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#05040c');
      g.addColorStop(0.55, '#0c0a1d');
      g.addColorStop(1, '#07060f');
      const r = ctx.createRadialGradient(vpX, 0, 10, vpX, 0, Math.max(w, h) * 0.7);
      r.addColorStop(0, 'rgba(124, 92, 255, 0.28)');
      r.addColorStop(0.5, 'rgba(34, 211, 238, 0.06)');
      r.addColorStop(1, 'rgba(0,0,0,0)');
      this.bg = { w, h, g, r };
    }
    ctx.fillStyle = this.bg.g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = this.bg.r;
    ctx.fillRect(0, 0, w, horizon);
  }

  drawChordFrame(ev, d, settings, geo, ghost = false) {
    const { ctx } = this;
    const { P, X, noteX, fretX, stringY, yTop, yBot } = geo;
    const shape = this.shape(ev.name);
    const color = chordColor(ev.name);
    const fadeIn = clamp((LOOKAHEAD - d) / 0.7, 0, 1);
    const [lo, hi] = shape ? fretRange(shape) : [1, 4];
    let xa = X(fretX(lo - 1) + 3);
    let xb = X(fretX(hi) - 3);
    if (xa > xb) [xa, xb] = [xb, xa];
    const a = P(xa, yTop - 16, d);
    const b = P(xb, yBot + 16, d);
    const s = a[2];

    if (ghost) {
      ctx.globalAlpha = fadeIn * 0.55;
      ctx.setLineDash([6 * s, 6 * s]);
      ctx.lineWidth = Math.max(1, 2 * s);
      ctx.strokeStyle = color;
      roundRect(ctx, a[0], a[1], b[0] - a[0], b[1] - a[1], 10 * s);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      return;
    }
    ctx.globalAlpha = fadeIn;
    ctx.fillStyle = alpha(color, 0.12);
    roundRect(ctx, a[0], a[1], b[0] - a[0], b[1] - a[1], 10 * s);
    ctx.fill();
    ctx.lineWidth = Math.max(1, 3 * s);
    ctx.strokeStyle = color;
    if (d < 1.4) { ctx.shadowColor = color; ctx.shadowBlur = 16 * s; }
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (shape) {
      for (let st = 0; st < 6; st++) {
        const f = shape.frets[st];
        if (f === null) continue;
        const y = stringY(st);
        if (f === 0) {
          const l = P(xa + 6, y, d);
          const r = P(xb - 6, y, d);
          ctx.strokeStyle = STRING_COLORS[st];
          ctx.lineWidth = Math.max(1, 4 * s);
          ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.lineTo(r[0], r[1]); ctx.stroke();
        } else {
          const g = P(X(noteX(f)), y, d);
          gem(ctx, g[0], g[1], 11 * s, STRING_COLORS[st]);
        }
      }
    }
    const fs = Math.round(11 + 16 * s);
    ctx.font = `700 ${fs}px Rajdhani, system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = color;
    ctx.fillText(displayChord(ev.name, settings.notation), a[0] + 2, a[1] - 3 * s);
    ctx.globalAlpha = 1;
  }

  drawNeck(g) {
    const { ctx, w } = this;
    const { X, fretX, stringY, neckTop, neckBottom, neckH, left, right, f0, span, mirror, openW, t, fretW } = g;
    const x0 = mirror ? right : left - 4;
    const x1 = mirror ? w - left + 4 : w - right;

    // corpo del manico
    const body = ctx.createLinearGradient(0, neckTop, 0, neckBottom);
    body.addColorStop(0, '#171325');
    body.addColorStop(0.5, '#1f1a31');
    body.addColorStop(1, '#120f1d');
    ctx.fillStyle = body;
    ctx.fillRect(x0, neckTop, x1 - x0, neckH);
    // bordi al neon
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(x0, neckTop - 1, x1 - x0, 2);
    ctx.shadowColor = '#7c5cff';
    ctx.fillStyle = '#7c5cff';
    ctx.fillRect(x0, neckBottom - 1, x1 - x0, 2);
    ctx.shadowBlur = 0;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, neckTop, x1 - x0, neckH);
    ctx.clip();
    const first = Math.floor(f0);
    for (let f = first; f <= first + span + 1; f++) {
      if (f < 0) continue;
      const cx = X(fretX(f - 0.5));
      if (INLAYS.includes(f)) inlay(ctx, cx, neckTop + neckH / 2);
      if (DOUBLE_INLAYS.includes(f)) {
        inlay(ctx, cx, neckTop + neckH * 0.3);
        inlay(ctx, cx, neckTop + neckH * 0.7);
      }
      const fx = X(fretX(f));
      if (f === 0) {
        ctx.fillStyle = '#f1ecff';
        ctx.fillRect(fx - 3, neckTop, 6, neckH);
      } else {
        const m = ctx.createLinearGradient(fx - 2, 0, fx + 2, 0);
        m.addColorStop(0, '#5b6070');
        m.addColorStop(0.5, '#d9dde6');
        m.addColorStop(1, '#5b6070');
        ctx.fillStyle = m;
        ctx.fillRect(fx - 1.5, neckTop, 3, neckH);
      }
    }
    ctx.restore();

    // corde (vibrano quando l'accordo viene suonato)
    for (let s = 0; s < 6; s++) {
      const y = stringY(s);
      const thick = 1.2 + (5 - s) * 0.35;
      const v = this.vibration[s];
      ctx.strokeStyle = STRING_COLORS[s];
      ctx.lineWidth = thick;
      ctx.shadowColor = STRING_COLORS[s];
      ctx.shadowBlur = 4 + 10 * v;
      ctx.beginPath();
      const sx = mirror ? 0 : left - 6;
      const ex = mirror ? w - left + 6 : w;
      if (v > 0.02) {
        const amp = v * 2.6;
        for (let x = sx; x <= ex; x += 8) {
          const yy = y + Math.sin(x * 0.09 + t * 70 + s) * amp * Math.sin(((x - sx) / (ex - sx)) * Math.PI);
          x === sx ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
        }
      } else {
        ctx.moveTo(sx, y);
        ctx.lineTo(ex, y);
      }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // capotasto
    if (this.capo > 0) {
      const cx = X(fretX(this.capo) - fretW * 0.18);
      const g2 = ctx.createLinearGradient(cx - 7, 0, cx + 7, 0);
      g2.addColorStop(0, '#2b2740');
      g2.addColorStop(0.5, '#6d6890');
      g2.addColorStop(1, '#2b2740');
      ctx.fillStyle = g2;
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 8;
      ctx.fillRect(cx - 7, neckTop - 6, 14, neckH + 12);
      ctx.shadowBlur = 0;
      ctx.save();
      ctx.translate(cx, neckTop + neckH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = '#e9e6ff';
      ctx.font = '700 10px Rajdhani, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('CAPO', 0, 0);
      ctx.restore();
    }

    // numeri dei tasti
    ctx.font = '600 12px Rajdhani, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let f = Math.max(1, first); f <= first + span + 1; f++) {
      const cx = fretX(f - 0.5);
      if (cx < left || cx > w - right) continue;
      const mark = INLAYS.includes(f) || DOUBLE_INLAYS.includes(f);
      ctx.fillStyle = mark ? '#e9e6ff' : '#6f6a8a';
      ctx.fillText(String(f), X(cx), neckBottom + 3);
    }
    // colonna delle corde a vuoto
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(mirror ? w - openW : 0, neckTop, openW, neckH);
  }

  drawFingering(shapeA, shapeB, p, t, cur, settings, geo) {
    const { X, noteX, stringY, openW } = geo;
    const { ctx } = this;
    // anteprima tratteggiata del prossimo accordo
    if (shapeB && p < 1) {
      ctx.globalAlpha = 0.45 * (1 - p);
      for (let s = 0; s < 6; s++) {
        const f = shapeB.frets[s];
        if (f === null || f === 0) continue;
        ring(ctx, X(noteX(f)), stringY(s), 12, STRING_COLORS[s]);
      }
      ctx.globalAlpha = 1;
    }
    const barres = (shape, a) => {
      if (!shape || a <= 0.01) return;
      ctx.globalAlpha = a * 0.5;
      ctx.fillStyle = '#e9e6ff';
      for (const b of shape.barres) {
        const bx = X(noteX(b.fret));
        const y1 = stringY(b.from);
        const y2 = stringY(b.to);
        roundRect(ctx, bx - 8, Math.min(y1, y2) - 8, 16, Math.abs(y2 - y1) + 16, 8);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    barres(shapeA, 1 - p);
    barres(shapeB, p);

    const flash = cur ? Math.max(0, 1 - (t - cur.start) / 0.3) : 0;
    for (let s = 0; s < 6; s++) {
      const a = shapeA?.frets[s];
      const b = shapeB?.frets[s];
      const aOn = a != null && a > 0;
      const bOn = b != null && b > 0;
      const y = stringY(s);
      if (aOn && bOn) {
        const x = noteX(a) + (noteX(b) - noteX(a)) * p;
        this.fingerGem(X(x), y, s, p < 0.5 ? shapeA.fingers[s] : shapeB.fingers[s], p < 0.5 ? a : b, settings, 1, flash);
      } else {
        if (aOn) this.fingerGem(X(noteX(a)), y, s, shapeA.fingers[s], a, settings, 1 - p, flash);
        if (bOn) this.fingerGem(X(noteX(b)), y, s, shapeB.fingers[s], b, settings, p, 0);
      }
      const marker = (shape) => (shape ? (shape.frets[s] === null ? 'x' : shape.frets[s] === 0 ? 'o' : null) : null);
      const mx = X(openW / 2 + 2);
      const mA = marker(shapeA);
      const mB = marker(shapeB);
      if (mA) this.marker(mx, y, mA, s, 1 - p);
      if (mB) this.marker(mx, y, mB, s, p);
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

  fingerGem(x, y, s, finger, fret, settings, a, flash) {
    if (a <= 0.01) return;
    const { ctx } = this;
    ctx.globalAlpha = a;
    const r = 12 + 3 * flash;
    ctx.shadowColor = STRING_COLORS[s];
    ctx.shadowBlur = 14 + 22 * flash;
    gem(ctx, x, y, r, STRING_COLORS[s]);
    ctx.shadowBlur = 0;
    const label = settings.showNoteNames ? noteName(fretNote(s, fret), settings.notation) : finger ? String(finger) : '';
    if (label) {
      ctx.fillStyle = '#0b0914';
      ctx.font = `800 ${label.length > 2 ? 10 : 14}px Rajdhani, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, y + 1);
    }
    ctx.globalAlpha = 1;
  }

  marker(x, y, kind, s, a) {
    if (a <= 0.01) return;
    const { ctx } = this;
    ctx.globalAlpha = a;
    ctx.lineWidth = 2.5;
    if (kind === 'o') {
      ctx.strokeStyle = STRING_COLORS[s];
      ctx.shadowColor = STRING_COLORS[s];
      ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
    } else {
      ctx.strokeStyle = '#6f6a8a';
      ctx.beginPath();
      ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5);
      ctx.moveTo(x + 5, y - 5); ctx.lineTo(x - 5, y + 5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  burst(x, y, color, n) {
    this.particles.push({ x, y, color, ring: true, life: 0.45, age: 0 });
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
      const sp = 60 + Math.random() * 160;
      this.particles.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, color, life: 0.35 + Math.random() * 0.35, age: 0 });
    }
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
  }

  drawParticles(dt) {
    const { ctx } = this;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      p.age += dt;
      const k = 1 - p.age / p.life;
      if (k <= 0) continue;
      if (p.ring) {
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = k * 0.8;
        ctx.lineWidth = 3 * k;
        ctx.beginPath(); ctx.arc(p.x, p.y, 12 + (1 - k) * 30, 0, Math.PI * 2); ctx.stroke();
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 420 * dt;
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.2 * k + 0.6, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this.particles = this.particles.filter((p) => p.age < p.life);
  }

  unknown(name, settings, cy) {
    const { ctx, w } = this;
    ctx.fillStyle = 'rgba(5,4,12,0.8)';
    roundRect(ctx, w / 2 - 150, cy - 17, 300, 34, 17);
    ctx.fill();
    ctx.fillStyle = '#e9e6ff';
    ctx.font = '600 14px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Diteggiatura di ${displayChord(name, settings.notation)} non disponibile`, w / 2, cy);
  }
}

function strumArrow(ctx, x, y, r, down, a) {
  ctx.globalAlpha = Math.max(0, Math.min(1, a * 1.4));
  ctx.fillStyle = down ? '#22d3ee' : '#ff4fd8';
  ctx.beginPath();
  if (down) { ctx.moveTo(x - r, y - r * 0.6); ctx.lineTo(x + r, y - r * 0.6); ctx.lineTo(x, y + r * 0.8); }
  else { ctx.moveTo(x - r, y + r * 0.6); ctx.lineTo(x + r, y + r * 0.6); ctx.lineTo(x, y - r * 0.8); }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

function fretRange(shape) {
  const fr = shape.frets.filter((f) => f != null && f > 0);
  if (!fr.length) return [1, 3];
  const lo = Math.min(...fr);
  const hi = Math.max(...fr);
  return [lo, Math.max(hi, lo + 1)];
}

function gem(ctx, x, y, r, color) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, color);
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.15);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.stroke();
}

function inlay(ctx, x, y) {
  ctx.fillStyle = 'rgba(160, 140, 255, 0.28)';
  ctx.shadowColor = '#7c5cff';
  ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
}

function ring(ctx, x, y, r, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
}

function roundRect(ctx, x, y, w, h, r) {
  if (w < 0) { x += w; w = -w; }
  if (h < 0) { y += h; h = -h; }
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
