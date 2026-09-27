import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { scoreToParsed, isGuitarPro } from '../js/gpfile.js';

// alphaTab è una dipendenza di sviluppo (nell'app arriva dal CDN solo quando serve)
const AT = new URL('../node_modules/@coderline/alphatab/dist/alphaTab.core.mjs', import.meta.url);

test('file Guitar Pro: corde, tasti, capotasto, tecniche e legature', { skip: !existsSync(AT) && 'alphaTab non installato (npm ci)' }, async () => {
  const at = await import(AT);
  const settings = new at.Settings();
  // parte scritta in alphaTex, esportata in .gp e riletta: lo stesso percorso di un file vero
  const tex = `\\title "Prova" \\tempo 90 . \\track "Chitarra" \\staff {tabs} \\capo 2 .
    :8 5.3{h} 7.3 5.3{b (0 4)} 0.6{pm} 0.6{pm} x.5 7.4{sl} 9.4 | :4 3.6 2.5 0.4 2.3 | :2 3.6 3.6{-}`;
  const imp = new at.importer.AlphaTexImporter();
  imp.initFromString(tex, settings);
  const bytes = new at.exporter.Gp7Exporter().export(imp.readScore(), settings);
  assert.ok(isGuitarPro(bytes, 'prova.gp'));
  const score = at.importer.ScoreLoader.loadScoreFromBytes(bytes, settings);
  const p = scoreToParsed(score);
  assert.equal(p.bpm, 90);
  const t = p.tracks[0];
  assert.equal(t.capo, 2);
  assert.ok(t.frettable);
  const n = t.notes;
  // primo: tasto 5 sulla corda del Sol (terza dal cantino) → indice 3 dal Mi grave; suona 55 + 5 + capo 2
  assert.deepEqual([n[0].string, n[0].fret, n[0].pitch, n[0].b], [3, 5, 62, 0]);
  assert.equal(n[1].tech, 'h');
  assert.equal(n[2].tech, 'b');
  assert.equal(n[3].tech, 'pm');
  assert.equal(n[5].tech, 'x');
  assert.equal(n[7].tech, 's');
  // battuta 2 inizia al battito 4; il Sol grave (3.6) è sulla corda 0
  const b2 = n.find((x) => x.b === 4);
  assert.deepEqual([b2.string, b2.fret], [0, 3]);
  // ultima battuta: due minime legate → una nota sola lunga 4 battiti
  const last = n.filter((x) => x.b >= 8);
  assert.equal(last.length, 1);
  assert.equal(last[0].bd, 4);
});

test('riconoscimento del formato dai primi byte', () => {
  const gp5 = new Uint8Array([24, ...[...'FICHIER GUITAR PRO v5.00'].map((c) => c.charCodeAt(0))]);
  assert.ok(isGuitarPro(gp5, 'x.gp5'));
  assert.ok(!isGuitarPro(new Uint8Array([77, 84, 104, 100, 0, 0]), 'x.mid'));
});
