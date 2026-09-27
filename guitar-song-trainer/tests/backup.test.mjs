import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createBackup, parseBackup, restoreBackup, MAX_BACKUP_BYTES } from '../js/backup.js';

function storage(initial = {}, failOn = null) {
  const data = new Map(Object.entries(initial));
  return {
    get length() { return data.size; },
    key(i) { return [...data.keys()][i] ?? null; },
    getItem(k) { return data.get(k) ?? null; },
    setItem(k, v) { if (k === failOn) throw new Error('quota'); data.set(k, String(v)); },
    removeItem(k) { data.delete(k); },
    dump() { return Object.fromEntries(data); },
  };
}

const sample = {
  'gst:settings': JSON.stringify({ notation: 'it', inputDeviceId: 'hardware-id', monitor: true }),
  'gst:favorites': JSON.stringify(['canzone-1']),
  'gst:userSongs': JSON.stringify({ 'mio-brano': { id: 'mio-brano', title: 'Mio brano', artist: 'Io', bpm: 90, timeSignature: [4, 4], sections: [{ name: 'Strofa', bars: ['C', 'G'] }] } }),
  'gst:setlists': JSON.stringify([{ id: 's123', name: 'Concerto', songs: ['mio-brano'] }]),
  'gst:stats': JSON.stringify({ 'mio-brano': { seconds: 180, sessions: 2, lastPlayed: 1000 } }),
  'gst:study:mio-brano': JSON.stringify({ learned: [0], total: 1 }),
  'gst:lrcCache:mio-brano': JSON.stringify({ lrc: 'cache' }),
  'other:auth': 'preserved',
};

test('roundtrip trasferisce dati personali, senza cache e ID audio', () => {
  const source = storage(sample);
  const backup = parseBackup(createBackup(source));
  assert.equal(backup.data.settings.inputDeviceId, undefined);
  assert.equal(backup.data['lrcCache:mio-brano'], undefined);
  const target = storage({ 'gst:old': '1', 'other:auth': 'preserved' });
  assert.equal(restoreBackup(backup, target), 6);
  assert.equal(target.getItem('gst:old'), null);
  assert.equal(target.getItem('other:auth'), 'preserved');
  assert.equal(JSON.parse(target.getItem('gst:settings')).monitor, false);
  assert.deepEqual(JSON.parse(target.getItem('gst:userSongs')), backup.data.userSongs);
  assert.deepEqual(JSON.parse(target.getItem('gst:study:mio-brano')), { learned: [0], total: 1 });
});

test('rifiuta versione incompatibile, chiavi estranee, prototype pollution e valori malformati', () => {
  const raw = JSON.parse(createBackup(storage(sample)));
  assert.throws(() => parseBackup(JSON.stringify({ ...raw, version: 2 })), /versione/);
  assert.throws(() => parseBackup(JSON.stringify({ ...raw, data: { ...raw.data, surprise: 1 } })), /non riconosciuta/);
  const polluted = '{"format":"guitar-song-trainer-backup","version":1,"exportedAt":"2026-09-26T00:00:00.000Z","data":{"__proto__":{}}}';
  assert.throws(() => parseBackup(polluted), /non valido/);
  assert.throws(() => parseBackup(JSON.stringify({ ...raw, data: { stats: { song: { seconds: '180' } } } })), /non valido/);
  assert.throws(() => parseBackup(JSON.stringify({ ...raw, data: { userSongs: { evil: { id: 'evil', title: 'Titolo', artist: 'x', bpm: 90, timeSignature: [4, 4], sections: [{ name: 'x', bars: ['<img src=x onerror=alert(1)>'] }] } } } })), /non valido/);
  assert.throws(() => parseBackup('x'.repeat(MAX_BACKUP_BYTES + 1)), /dimensione/);
});

test('errore in scrittura ripristina i valori iniziali e lascia intatto lo storage terzo', () => {
  const backup = parseBackup(createBackup(storage(sample)));
  const target = storage({ 'gst:settings': JSON.stringify({ notation: 'intl' }), 'gst:old': '7', 'other:auth': 'token' }, 'gst:userSongs');
  const original = target.dump();
  assert.throws(() => restoreBackup(backup, target), /quota/);
  assert.deepEqual(target.dump(), original);
});

test('nessuna scrittura se il payload cambia dopo la validazione', () => {
  const backup = parseBackup(createBackup(storage(sample)));
  backup.data.userSongs['mio-brano'].sections[0].bars[0] = '<script>';
  const target = storage({ 'gst:settings': '{}', 'third-party': 'ok' });
  const original = target.dump();
  assert.throws(() => restoreBackup(backup, target), /non valido/);
  assert.deepEqual(target.dump(), original);
});

test('accetta timestamp correnti, testo LRC multilinea, preferenze ampli e obiettivo pratica', () => {
  const now = Date.now();
  const source = storage({
    'gst:userSongs': JSON.stringify({ tune: { id: 'tune', title: 'A < B', artist: 'Io', bpm: 95, timeSignature: [3, 4], updatedAt: now, sections: [{ name: 'Intro "speciale"', bars: ['Am', '%'] }] } }),
    'gst:stats': JSON.stringify({ tune: { seconds: 90, sessions: 1, lastPlayed: now, bestAccuracy: 0.8 } }),
    'gst:drills': JSON.stringify({ 'C-G@4': { bpm: 80, changes: 25, at: now } }),
    'gst:lrc:tune': JSON.stringify('[00:01.00]Prima riga <3\n[00:02.00]Seconda riga'),
    'gst:prefs:tune': JSON.stringify({ transpose: 0, arrangement: 'rhythm', view: 'full', rate: 1, loop: { a: 1, b: 3, label: 'Ritornello <3' }, tone: { preset: 'rock', params: { reverb: 0.8 } } }),
    'gst:setlists': JSON.stringify([{ id: 's1', name: 'A < B', songs: ['tune'] }]),
    'gst:practiceGoal': '20',
  });
  const parsed = parseBackup(createBackup(source));
  const restored = storage();
  restoreBackup(parsed, restored);
  assert.deepEqual(JSON.parse(restored.getItem('gst:stats')), parsed.data.stats);
  assert.equal(JSON.parse(restored.getItem('gst:lrc:tune')).split('\n').length, 2);
  assert.equal(JSON.parse(restored.getItem('gst:userSongs')).tune.title, 'A < B');
  assert.equal(JSON.parse(restored.getItem('gst:userSongs')).tune.sections[0].name, 'Intro "speciale"');
  assert.equal(JSON.parse(restored.getItem('gst:setlists'))[0].name, 'A < B');
  assert.equal(JSON.parse(restored.getItem('gst:practiceGoal')), 20);
});

test('rifiuta campi opzionali numerici e diteggiature malformate', () => {
  const raw = parseBackup(createBackup(storage(sample)));
  const song = raw.data.userSongs['mio-brano'];
  song.offset = 'un secondo';
  assert.throws(() => restoreBackup(raw, storage()), /non valido/);
  song.offset = 1;
  song.shapes = { C: { frets: [0, 3], fingers: [0, 1] } };
  assert.throws(() => restoreBackup(raw, storage()), /non valido/);
});

test('tutti i brani del catalogo sopravvivono al roundtrip come brani utente', async () => {
  const directory = new URL('../songs/', import.meta.url);
  const files = (await readdir(directory)).filter((name) => name.endsWith('.json') && name !== 'index.json');
  const songs = Object.fromEntries(await Promise.all(files.map(async (name) => [
    name.slice(0, -5),
    { id: name.slice(0, -5), ...JSON.parse(await readFile(new URL(name, directory), 'utf8')) },
  ])));
  const index = JSON.parse(await readFile(new URL('index.json', directory), 'utf8'));
  assert.equal(files.length, index.length, 'un file per ogni brano dell\'indice');
  const backup = parseBackup(createBackup(storage({ 'gst:userSongs': JSON.stringify(songs) })));
  const target = storage();
  restoreBackup(backup, target);
  assert.deepEqual(JSON.parse(target.getItem('gst:userSongs')), songs);
});
