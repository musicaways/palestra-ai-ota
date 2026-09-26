// Tempi delle singole parole di una riga cantata, per il karaoke parola per parola.
// Se il testo LRC ha i tempi per parola (formato "esteso": <mm:ss.xx>parola) si usano quelli;
// altrimenti si stimano dividendo il tempo cantato della riga in proporzione alle sillabe.

const VOWELS = /[aeiouyàáâäèéêëìíîïòóôöùúûüæœ]+/gi;

// Sillabe (approssimate) di una parola: gruppi di vocali, almeno 1.
export function syllables(word) {
  const m = String(word).match(VOWELS);
  return Math.max(1, m ? m.length : 1);
}

// "<00:12.34>Nel <00:12.80>blu" → [{ w: 'Nel', t: 12.34 }, { w: 'blu', t: 12.8 }]
export function parseEnhanced(text) {
  const re = /<(\d+):(\d+(?:\.\d+)?)>([^<]*)/g;
  const out = [];
  let m;
  while ((m = re.exec(text))) {
    const t = Number(m[1]) * 60 + Number(m[2]);
    for (const w of m[3].trim().split(/\s+/).filter(Boolean)) out.push({ w, t });
  }
  return out;
}

/**
 * @param text   testo della riga (senza tempi) oppure con tag <mm:ss.xx>
 * @param start  inizio della riga (s)
 * @param end    inizio della riga successiva (s)
 * @param words  eventuali tempi per parola già noti [{ w, t }]
 * @returns [{ w, t0, t1 }] una voce per parola
 */
export function wordTimes(text, start, end, words = null) {
  const gap = Math.max(0.3, end - start);
  if (words?.length) {
    return words.map((x, i) => ({ w: x.w, t0: x.t, t1: i + 1 < words.length ? words[i + 1].t : Math.min(end, x.t + 0.6) }));
  }
  const ws = String(text).trim().split(/\s+/).filter(Boolean);
  if (!ws.length) return [];
  const syl = ws.map(syllables);
  const total = syl.reduce((a, b) => a + b, 0);
  // circa 0,28 s per sillaba, ma mai oltre la riga (nel rap le sillabe sono più fitte)
  const sing = Math.min(gap * 0.95, Math.max(0.5, total * 0.28));
  const out = [];
  let t = start;
  ws.forEach((w, i) => {
    const d = (sing * syl[i]) / total;
    out.push({ w, t0: t, t1: t + d });
    t += d;
  });
  return out;
}

// Indice della parola in corso (−1 prima della prima) e avanzamento 0..1 dentro quella parola.
export function wordAt(times, t) {
  let i = -1;
  for (let k = 0; k < times.length; k++) if (times[k].t0 <= t) i = k; else break;
  if (i < 0) return { i: -1, p: 0 };
  const w = times[i];
  return { i, p: Math.max(0, Math.min(1, (t - w.t0) / Math.max(0.05, w.t1 - w.t0))) };
}
