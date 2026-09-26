import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS, CATEGORIES, INSTRUMENTS, buildLessonTimeline, lessonById } from '../js/lessons.js';
import { getShape, fretNote } from '../js/music.js';
import { karplus, noteFreq } from '../js/audio.js';
import { fileName, extFor } from '../js/camera.js';

test('lezioni: dati coerenti', () => {
  const ids = new Set();
  for (const l of LESSONS) {
    assert.ok(!ids.has(l.id), `id doppio ${l.id}`); ids.add(l.id);
    assert.ok(CATEGORIES.some((c) => c.id === l.cat), `${l.id}: categoria`);
    assert.ok(INSTRUMENTS.some((i) => i.id === l.instrument), `${l.id}: strumento`);
    assert.ok(l.title && l.summary && l.body, `${l.id}: testi`);
  }
  assert.ok(LESSONS.length >= 25);
  assert.equal(lessonById('blues').cat, 'scale');
});

test('ogni esercizio si costruisce, a tempo, con forme note', () => {
  for (const l of LESSONS.filter((x) => x.exercise)) {
    const tl = buildLessonTimeline(l.exercise, 80);
    assert.ok(tl.events.length > 0, l.id);
    for (const n of new Set(tl.events.map((e) => e.name))) assert.ok(getShape(n), `${l.id}: forma di ${n}`);
    if (tl.notes) {
      assert.ok(tl.notes.length > 3, l.id);
      for (let i = 1; i < tl.notes.length; i++) assert.ok(tl.notes[i].t >= tl.notes[i - 1].t, `${l.id}: note in ordine`);
      assert.ok(tl.notes.at(-1).t < tl.end + 1e-6, `${l.id}: note dentro l'esercizio`);
      for (const n of tl.notes) assert.ok(n.string >= 0 && n.string <= 5 && n.fret >= 0 && n.fret <= 15, `${l.id}: nota fuori manico`);
    }
    // una battuta di conteggio prima di iniziare
    const first = tl.notes?.[0]?.t ?? tl.events.find((e) => e.name)?.start;
    assert.ok(first >= tl.bars[0].end - 1e-6, `${l.id}: conteggio`);
  }
});

test('pentatonica di La: solo le note A C D E G, radici giuste', () => {
  const tl = buildLessonTimeline(lessonById('pentatonica-minore').exercise, 60);
  const allowed = new Set([9, 0, 2, 4, 7]);
  for (const n of tl.notes) assert.ok(allowed.has(fretNote(n.string, n.fret)), `nota ${n.string}:${n.fret}`);
  for (const b of tl.box.filter((x) => x.root)) assert.equal(fretNote(b.string, b.fret), 9);
  assert.ok(tl.noteMode);
});

test('corda pizzicata: frequenza e decadimento', () => {
  assert.ok(Math.abs(noteFreq(5, 5) - 440) < 0.01, 'La al 5° tasto del cantino');
  assert.ok(Math.abs(noteFreq(0, 0) - 82.41) < 0.05);
  const d = karplus(220, 8000, 1);
  const e = (a, b) => d.slice(a, b).reduce((s, x) => s + x * x, 0);
  assert.ok(e(0, 800) > e(7000, 7800));
});

test('nomi dei file video', () => {
  const n = fileName('Cartine corte · Salmo', new Date(2026, 8, 26, 18, 5).getTime(), 'video/webm');
  assert.equal(n, 'cartine-corte-salmo-20260926-1805.webm');
  assert.equal(extFor('video/mp4;codecs=avc1'), 'mp4');
});

test('quiz d\'ascolto: domande valide e suonabili', async () => {
  const { LESSONS, quizQuestion } = await import('../js/lessons.js');
  const { getShape } = await import('../js/music.js');
  const quizzes = LESSONS.filter((l) => l.quiz);
  assert.ok(quizzes.length >= 4);
  for (const l of quizzes) {
    for (let i = 0; i < 30; i++) {
      const q = quizQuestion(l.quiz);
      assert.ok(getShape(q.chord), `${l.id}: ${q.chord}`);
      const values = l.quiz.options.map((o) => (typeof o === 'string' ? o : o.q));
      assert.ok(values.includes(q.answer), `${l.id}: risposta ${q.answer}`);
    }
  }
});
