// Archivio portabile dei dati locali. La versione identifica il formato, non la versione dell'app.
const PREFIX = 'gst:';
const VERSION = 1;
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const id = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const plain = (x) => x !== null && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
const fail = (s) => { throw new Error(s); };
const ok = (condition, path) => { if (!condition) fail(`Dato non valido: ${path}`); };
const number = (x, min, max, p) => ok(typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max, p);
const str = (x, p, max = 2000) => ok(typeof x === 'string' && x.length <= max && !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x), p);
const freeText = (x, p, max = 2000) => ok(typeof x === 'string' && x.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x), p);
const bool = (x, p) => ok(typeof x === 'boolean', p);
const stringList = (x, p, max = 10000) => { ok(Array.isArray(x) && x.length <= max, p); x.forEach((v, i) => str(v, `${p}[${i}]`, 500)); };
const object = (x, p, max = 10000) => { ok(plain(x) && Object.keys(x).length <= max, p); for (const k of Object.keys(x)) ok(!forbidden.has(k) && k.length <= 128, `${p}.${k}`); };

// Protegge anche i valori che altre pagine inseriscono in HTML con template string.
function safeTree(x, p = 'dati', depth = 0) {
  ok(depth <= 24, p);
  if (typeof x === 'string') return (/^userSongs\.[^.]+\.(title|artist|album|genre|key|notes|syncNote|tuning)$/.test(p) || /^userSongs\.[^.]+\.sections\[\d+\]\.name$/.test(p) || /^userSongs\.[^.]+\.lyricsSource\.trackName$/.test(p) || /^setlists\[\d+\]\.name$/.test(p) || /^prefs:[^.]+\.loop\.label$/.test(p) || /^libFilter\.genre$/.test(p)) ? freeText(x, p, 100000) : str(x, p, 100000);
  if (typeof x === 'number') return number(x, -1e13, 1e13, p);
  if (x === null || typeof x === 'boolean') return;
  if (Array.isArray(x)) { ok(x.length <= 50000, p); x.forEach((v, i) => safeTree(v, `${p}[${i}]`, depth + 1)); return; }
  object(x, p); for (const [k, v] of Object.entries(x)) { str(k, p, 128); safeTree(v, `${p}.${k}`, depth + 1); }
}

function validateSong(song, key) {
  object(song, key, 60);
  ok(song.id === key && id.test(key), key);
  for (const field of ['title', 'artist']) { freeText(song[field], `${key}.${field}`, 300); ok(song[field].trim().length > 0, key); }
  number(song.bpm, 20, 400, `${key}.bpm`);
  ok(Array.isArray(song.timeSignature) && song.timeSignature.length === 2, `${key}.timeSignature`);
  song.timeSignature.forEach((n) => number(n, 1, 16, `${key}.timeSignature`));
  for (const f of ['offset', 'capo', 'difficulty', 'barsPerRow', 'updatedAt']) if (song[f] !== undefined) number(song[f], f === 'offset' ? -1e6 : 0, f === 'updatedAt' ? 1e13 : f === 'offset' ? 1e7 : 1000, `${key}.${f}`);
  if (song.year !== undefined) ok((Number.isInteger(song.year) && song.year >= 1800 && song.year <= 2200) || (typeof song.year === 'string' && /^\d{4}$/.test(song.year)), `${key}.year`);
  if (song.sync !== undefined) { ok(Array.isArray(song.sync) && song.sync.length <= 20000, `${key}.sync`); song.sync.forEach((n) => number(n, 0, 1e7, `${key}.sync`)); }
  if (song.warp !== undefined) { ok(Array.isArray(song.warp) && song.warp.length <= 20000, `${key}.warp`); song.warp.forEach((pair) => { ok(Array.isArray(pair) && pair.length === 2, `${key}.warp`); number(pair[0], 0, 1e7, `${key}.warp`); number(pair[1], -1e6, 1e7, `${key}.warp`); }); }
  if (song.lyricsSource !== undefined) { object(song.lyricsSource, `${key}.lyricsSource`, 10); if (song.lyricsSource.lrclibId !== undefined) number(song.lyricsSource.lrclibId, 1, 1e12, `${key}.lyricsSource.lrclibId`); if (song.lyricsSource.offset !== undefined) number(song.lyricsSource.offset, -1e6, 1e6, `${key}.lyricsSource.offset`); if (song.lyricsSource.duration !== undefined) number(song.lyricsSource.duration, 0, 1e7, `${key}.lyricsSource.duration`); if (song.lyricsSource.trackName !== undefined) freeText(song.lyricsSource.trackName, `${key}.lyricsSource.trackName`, 300); }
  ok(Array.isArray(song.sections) && song.sections.length > 0 && song.sections.length <= 500, `${key}.sections`);
  if (song.barsPerRow !== undefined) number(song.barsPerRow, 1, 1000, `${key}.barsPerRow`);
  let totalBars = 0;
  for (const sec of song.sections) {
    object(sec, `${key}.sections`, 12); freeText(sec.name, `${key}.sections.name`, 300);
    ok((Array.isArray(sec.bars) && sec.bars.length <= 10000) || typeof sec.pattern === 'string', `${key}.sections.bars`);
    if (sec.pattern !== undefined) str(sec.pattern, `${key}.sections.pattern`, 128);
    if (sec.repeat !== undefined) number(sec.repeat, 1, 1000, `${key}.sections.repeat`);
    if (sec.barsPerRow !== undefined) number(sec.barsPerRow, 1, 1000, `${key}.sections.barsPerRow`);
    if (sec.bars) for (const bar of sec.bars) {
      ok(typeof bar === 'string' || (Array.isArray(bar) && bar.length <= 16), `${key}.sections.bar`);
      if (Array.isArray(bar)) bar.forEach((chord) => str(chord, `${key}.sections.chord`, 100));
      else str(bar, `${key}.sections.chord`, 100);
    }
  }
  if (song.youtubeId !== undefined) ok(typeof song.youtubeId === 'string' && /^[\w-]{11}$/.test(song.youtubeId), `${key}.youtubeId`);
  if (song.patterns !== undefined) {
    object(song.patterns, `${key}.patterns`, 200);
    for (const bars of Object.values(song.patterns)) {
      ok(Array.isArray(bars) && bars.length <= 10000, `${key}.patterns`);
      for (const bar of bars) ok(typeof bar === 'string' || (Array.isArray(bar) && bar.length <= 16 && bar.every((chord) => typeof chord === 'string')), `${key}.patterns.bar`);
    }
  }
  if (song.shapes !== undefined) {
    object(song.shapes, `${key}.shapes`, 500);
    for (const [chord, shape] of Object.entries(song.shapes)) {
      str(chord, `${key}.shapes`, 100); object(shape, `${key}.shapes.${chord}`, 10);
      for (const field of ['frets', 'fingers']) { ok(Array.isArray(shape[field]) && shape[field].length === 6, `${key}.shapes.${chord}.${field}`); shape[field].forEach((n) => { if (n !== null) number(n, 0, 36, `${key}.shapes.${chord}.${field}`); }); }
    }
  }
  for (const sec of song.sections) {
    const bars = sec.bars ?? song.patterns?.[sec.pattern];
    ok(Array.isArray(bars) && bars.length > 0, `${key}.sections.pattern`);
    totalBars += bars.length * (sec.repeat ?? 1);
    ok(totalBars <= 50000, `${key}.sections: troppe battute`);
  }
  safeTree(song, `userSongs.${key}`);
}

function validateEntry(key, value) {
  ok(typeof key === 'string' && key.length <= 160 && !forbidden.has(key), 'chiave');
  const songKey = /^(prefs|study|offset|lyricsOffset|sync|lyrics|lrc|capo|pos):(.+)$/.exec(key);
  const lessonKey = /^(lessonBpm|quizBest):(.+)$/.exec(key);
  if (songKey) {
    ok(id.test(songKey[2]), `chiave ${key}`);
    const type = songKey[1];
    if (type === 'prefs') {
      object(value, key, 30);
      if (value.rate !== undefined) number(value.rate, 0.1, 4, key);
      if (value.transpose !== undefined) number(value.transpose, -12, 12, key);
      if (value.arrangement !== undefined) ok(['rhythm', 'arpeggio', 'power', 'easy'].includes(value.arrangement), `${key}.arrangement`);
      if (value.view !== undefined) ok(['full', 'stage', 'videolyrics', 'video', 'lyrics'].includes(value.view), `${key}.view`);
      if (value.backing !== undefined) bool(value.backing, `${key}.backing`);
      if (value.loop !== undefined && value.loop !== null) { object(value.loop, `${key}.loop`, 5); number(value.loop.a, 0, 1e7, key); number(value.loop.b, 0, 1e7, key); ok(value.loop.b > value.loop.a, key); if (value.loop.label !== undefined) freeText(value.loop.label, `${key}.loop.label`, 300); }
      if (value.tone !== undefined) validateTone(value.tone, `${key}.tone`);
    }
    else if (type === 'study') { object(value, key, 10); ok(Array.isArray(value.learned) && value.learned.length <= 10000, key); value.learned.forEach((v) => number(v, 0, 10000, key)); number(value.total, 0, 10000, key); }
    else if (type === 'sync') { ok(Array.isArray(value) && value.length <= 20000, key); value.forEach((v) => number(v, 0, 1e7, key)); }
    else if (type === 'lyrics') { ok(Array.isArray(value) && value.length <= 5000, key); value.forEach((line, i) => freeText(line, `${key}[${i}]`, 500)); }
    else if (type === 'lrc') freeText(value, key, 500000);
    else number(value, type === 'lyricsOffset' || type === 'offset' ? -1e6 : 0, 1e7, key);
  } else if (lessonKey) { ok(id.test(lessonKey[2]), key); number(value, 0, 10000, key); }
  else switch (key) {
    case 'settings': object(value, key, 50); break;
    case 'favorites': case 'lessonsDone': stringList(value, key); value.forEach((v) => ok(id.test(v), key)); break;
    case 'userSongs': object(value, key, 2000); for (const [k, song] of Object.entries(value)) validateSong(song, k); break;
    case 'setlists': ok(Array.isArray(value) && value.length <= 2000, key); for (const list of value) { object(list, key, 10); ok(id.test(list.id), key); freeText(list.name, key, 300); stringList(list.songs, key); list.songs.forEach((s) => ok(id.test(s), key)); } break;
    case 'stats': object(value, key); for (const [k, stat] of Object.entries(value)) { ok(id.test(k), key); object(stat, key, 20); for (const f of ['seconds', 'sessions', 'lastPlayed', 'bestRate', 'bestAccuracy']) if (stat[f] !== undefined) number(stat[f], 0, 1e13, `${key}.${f}`); } break;
    case 'days': object(value, key); for (const [k, n] of Object.entries(value)) { ok(/^\d{4}-\d{2}-\d{2}$/.test(k), key); number(n, 0, 1e9, key); } break;
    case 'drills': object(value, key); for (const record of Object.values(value)) { object(record, key, 10); number(record.bpm, 0, 1000, key); number(record.changes, 0, 1e6, key); if (record.at !== undefined) number(record.at, 0, 1e13, key); } break;
    case 'drillCfg': object(value, key, 10); stringList(value.chords, key, 4); number(value.bpm, 20, 400, key); number(value.beatsPerChord, 1, 16, key); bool(value.autoUp, key); break;
    case 'chordDict': object(value, key, 10); ok(['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'].includes(value.root), key); ok(['', 'm', '7', 'm7', 'maj7', 'sus2', 'sus4', '7sus4', '5', '6', 'add9', 'dim', 'aug'].includes(value.q), key); break;
    case 'libFilter': object(value, key, 10); for (const f of ['genre', 'decade']) if (value[f] !== undefined && value[f] !== null) freeText(value[f], `${key}.${f}`, 100); break;
    case 'libraryTab': ok(['all', 'favorites', 'recent', 'artist', 'genre', 'difficulty', 'setlists'].includes(value), key); break;
    case 'librarySort': ok(['title', 'artist', 'easy', 'played', 'year'].includes(value), key); break;
    case 'panelTab': ok(['lyrics', 'chords', 'shapes'].includes(value), key); break;
    case 'learnInstrument': ok(['guitar', 'bass', 'ukulele', 'piano'].includes(value), key); break;
    case 'practiceGoal': ok([5, 10, 15, 20, 30, 45, 60].includes(value), key); break;
    case 'lessonSound': case 'lessonMetro': case 'helpSeen': bool(value, key); break;
    default: fail(`Chiave non riconosciuta: ${key}`);
  }
  if (key !== 'userSongs' && !/^(lrc|lyrics):/.test(key)) safeTree(value, key);
  if (key === 'settings') {
    const booleanFields = ['leftHanded', 'highStringOnTop', 'showNoteNames', 'metronome', 'autoScroll', 'countIn', 'stageLyrics', 'monitor', 'toneAuto', 'focus'];
    for (const f of booleanFields) if (value[f] !== undefined) bool(value[f], `${key}.${f}`);
    for (const f of ['inputGain', 'monitorVolume']) if (value[f] !== undefined) number(value[f], 0, 10, `${key}.${f}`);
    if (value.notation !== undefined) ok(['intl', 'it'].includes(value.notation), `${key}.notation`);
    if (value.view !== undefined) ok(['full', 'stage', 'videolyrics', 'video', 'lyrics'].includes(value.view), `${key}.view`);
    if (value.inputDeviceId !== undefined) fail('ID dispositivo audio non consentito nel backup');
    if (value.tone !== undefined) validateTone(value.tone, `${key}.tone`);
  }
}

function validateTone(tone, path) {
  object(tone, path, 5);
  ok(['pulito', 'pulito-chorus', 'acustico', 'crunch', 'rock', 'lead', 'metal', 'ambient'].includes(tone.preset), `${path}.preset`);
  if (tone.params !== undefined) {
    object(tone.params, `${path}.params`, 12);
    for (const [k, v] of Object.entries(tone.params)) { ok(['drive', 'bass', 'mid', 'treble', 'chorus', 'delay', 'delayTime', 'reverb', 'volume', 'cab'].includes(k), path); number(v, -20, 20000, `${path}.${k}`); }
  }
}

const included = (key) => key.startsWith(PREFIX) && !key.startsWith('gst:lrcCache:');
const asStorage = (storage) => storage ?? globalThis.localStorage;

export function createBackup(storage = asStorage()) {
  const data = {};
  for (let i = 0; i < storage.length; i++) {
    const full = storage.key(i);
    if (!included(full)) continue;
    const key = full.slice(PREFIX.length);
    const value = JSON.parse(storage.getItem(full));
    if (key === 'settings') { delete value.inputDeviceId; }
    validateEntry(key, value);
    data[key] = value;
  }
  const backup = { format: 'guitar-song-trainer-backup', version: VERSION, exportedAt: new Date().toISOString(), data };
  const text = JSON.stringify(backup, null, 2);
  ok(new TextEncoder().encode(text).length <= MAX_BACKUP_BYTES, 'archivio troppo grande');
  return text;
}

export function parseBackup(text) {
  ok(typeof text === 'string' && new TextEncoder().encode(text).length <= MAX_BACKUP_BYTES, 'dimensione archivio');
  const backup = JSON.parse(text);
  ok(plain(backup) && Object.keys(backup).sort().join(',') === 'data,exportedAt,format,version', 'formato archivio');
  ok(backup.format === 'guitar-song-trainer-backup' && backup.version === VERSION, 'versione archivio');
  str(backup.exportedAt, 'data esportazione', 40);
  ok(!Number.isNaN(Date.parse(backup.exportedAt)), 'data esportazione');
  object(backup.data, 'dati');
  for (const [key, value] of Object.entries(backup.data)) validateEntry(key, value);
  return backup;
}

export function restoreBackup(backup, storage = asStorage()) {
  // Ripassa il validatore: il chiamante potrebbe aver mutato l'oggetto dopo l'anteprima.
  const valid = parseBackup(JSON.stringify(backup));
  const before = new Map();
  for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key?.startsWith(PREFIX)) before.set(key, storage.getItem(key)); }
  const data = { ...valid.data };
  if (data.settings) data.settings = { ...data.settings, monitor: false }; // il monitor audio richiede una nuova scelta dell'utente
  try {
    for (const key of before.keys()) storage.removeItem(key);
    for (const [key, value] of Object.entries(data)) storage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (error) {
    try {
      for (let i = storage.length - 1; i >= 0; i--) { const key = storage.key(i); if (key?.startsWith(PREFIX)) storage.removeItem(key); }
      for (const [key, value] of before) storage.setItem(key, value);
    } catch { fail('Ripristino interrotto e rollback incompleto: spazio di archiviazione insufficiente.'); }
    throw error;
  }
  return Object.keys(data).length;
}

export function renderBackup(root) {
  root.innerHTML = `<div class="library backup backup-page"><section class="hero"><div class="hero-kicker">I tuoi dati</div><h1>Backup e<br><span>ripristino.</span></h1><p>Salva brani personali, preferiti, scalette, progressi e impostazioni in un file JSON.</p><div class="hero-actions"><a class="chip-btn" href="#/">← Libreria brani</a></div></section><section class="card" style="padding:1.5rem;margin:1.5rem 0"><h2>Esporta</h2><p class="hint">Il file resta sul tuo dispositivo finché non decidi di condividerlo.</p><button class="chip-btn backup-export" type="button">Scarica backup JSON</button></section><section class="card" style="padding:1.5rem;margin:1.5rem 0"><h2>Ripristina</h2><p class="hint">Scegli un backup JSON (massimo 5 MB). Prima di sostituire i dati attuali vedrai un'anteprima.</p><input class="backup-file" type="file" accept=".json,application/json" aria-label="Seleziona backup JSON"><div class="backup-preview" aria-live="polite"></div><button class="chip-btn backup-confirm" type="button" hidden>Sostituisci i dati personali con questo backup</button></section><p class="hint">Le registrazioni video in IndexedDB e la cache dei testi LRCLIB non sono incluse. L'ingresso audio scelto non viene trasferito; dopo il ripristino il monitor audio resta spento.</p><p class="backup-status" role="status" aria-live="polite"></p></div>`;
  const status = root.querySelector('.backup-status');
  const preview = root.querySelector('.backup-preview');
  const confirm = root.querySelector('.backup-confirm');
  let pending = null;
  let selection = 0;
  root.querySelector('.backup-export').addEventListener('click', () => {
    try {
      const blob = new Blob([createBackup()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = `guitar-song-trainer-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      status.textContent = 'Backup scaricato.';
    } catch (error) { status.textContent = `Esportazione non riuscita: ${error.message}`; }
  });
  root.querySelector('.backup-file').addEventListener('change', async (event) => {
    const current = ++selection;
    pending = null; confirm.hidden = true; preview.textContent = ''; status.textContent = '';
    const file = event.target.files?.[0]; if (!file) return;
    try {
      ok(file.size <= MAX_BACKUP_BYTES, 'file troppo grande (massimo 5 MB)');
      const parsed = parseBackup(await file.text());
      if (current !== selection) return;
      pending = parsed;
      const d = pending.data;
      preview.textContent = `Backup del ${new Date(pending.exportedAt).toLocaleString('it-IT')}: ${Object.keys(d.userSongs ?? {}).length} brani personali, ${(d.setlists ?? []).length} scalette, ${(d.favorites ?? []).length} preferiti, ${Object.keys(d.stats ?? {}).length} brani con progressi. La conferma sostituirà tutti i dati Guitar Song Trainer presenti in questo browser.`;
      confirm.hidden = false;
    } catch (error) { if (current === selection) status.textContent = `File non valido: ${error.message}`; }
  });
  confirm.addEventListener('click', () => {
    if (!pending) return;
    try { restoreBackup(pending); pending = null; confirm.hidden = true; status.textContent = 'Dati ripristinati. Torna alla libreria per vedere le modifiche.'; }
    catch (error) { status.textContent = `Ripristino non riuscito: ${error.message}`; }
  });
}
