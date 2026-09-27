// Diagramma verticale di un accordo (come nei libri di chitarra), in SVG.
import { getShape, displayChord, chordColor, STRING_COLORS } from './music.js';

export function chordDiagram(name, settings, custom) {
  const shape = getShape(name, custom);
  const color = chordColor(name);
  const title = displayChord(name, settings.notation);
  if (!shape) {
    return `<figure class="diagram"><figcaption style="color:${color}">${escapeHtml(title)}</figcaption>
      <div class="diagram-missing">diteggiatura non disponibile</div></figure>`;
  }
  const fretted = shape.frets.filter((f) => f != null && f > 0);
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  const minF = fretted.length ? Math.min(...fretted) : 0;
  const base = maxF <= 4 ? 1 : minF; // primo tasto mostrato
  const rows = 4;
  const W = 120;
  const H = 150;
  const x0 = 22;
  const y0 = 30;
  const gw = (W - x0 - 12) / 5;
  const gh = (H - y0 - 14) / rows;
  const sx = (s) => (settings.leftHanded ? x0 + (5 - s) * gw : x0 + s * gw);
  const fy = (f) => y0 + (f - base + 0.5) * gh;
  let svg = '';
  // capotasto o numero del tasto di partenza
  if (base === 1) svg += `<rect x="${x0 - 1}" y="${y0 - 4}" width="${5 * gw + 2}" height="5" rx="1.5" fill="#f1ecff"/>`;
  else svg += `<text x="${x0 - 8}" y="${y0 + gh * 0.62}" class="dg-base" text-anchor="end">${base}</text>`;
  for (let r = 0; r <= rows; r++) svg += `<line x1="${x0}" x2="${x0 + 5 * gw}" y1="${y0 + r * gh}" y2="${y0 + r * gh}" class="dg-fret"/>`;
  for (let s = 0; s < 6; s++) svg += `<line x1="${sx(s)}" x2="${sx(s)}" y1="${y0}" y2="${y0 + rows * gh}" stroke="${STRING_COLORS[s]}" stroke-opacity=".7" stroke-width="${1 + (5 - s) * 0.25}"/>`;
  for (const b of shape.barres) {
    if (b.fret < base || b.fret >= base + rows) continue;
    const a = sx(b.from);
    const c = sx(b.to);
    svg += `<rect x="${Math.min(a, c) - 8}" y="${fy(b.fret) - 8}" width="${Math.abs(c - a) + 16}" height="16" rx="8" fill="${color}" fill-opacity=".45"/>`;
  }
  shape.frets.forEach((f, s) => {
    const x = sx(s);
    if (f === null) svg += `<text x="${x}" y="${y0 - 10}" text-anchor="middle" class="dg-mark">×</text>`;
    else if (f === 0) svg += `<circle cx="${x}" cy="${y0 - 14}" r="5" fill="none" stroke="${STRING_COLORS[s]}" stroke-width="2"/>`;
    else if (f >= base && f < base + rows) {
      svg += `<circle cx="${x}" cy="${fy(f)}" r="8.5" fill="${STRING_COLORS[s]}" stroke="#fff" stroke-width="1.5"/>`;
      if (shape.fingers[s]) svg += `<text x="${x}" y="${fy(f) + 4}" text-anchor="middle" class="dg-finger">${shape.fingers[s]}</text>`;
    }
  });
  return `<figure class="diagram" data-chord="${escapeHtml(name)}">
    <figcaption style="color:${color}">${escapeHtml(title)}</figcaption>
    <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Diteggiatura di ${escapeHtml(title)}">${svg}</svg>
  </figure>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
