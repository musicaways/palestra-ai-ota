import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spotifyId, midiNameScore, searchMidi, pickDeezer, songsterrUrl } from '../js/online.js';

test('ID Spotify da link, URI o ID', () => {
  assert.equal(spotifyId('https://open.spotify.com/intl-it/track/1qPbGZqppFwLwcBC1JQ6Vr?si=abc'), '1qPbGZqppFwLwcBC1JQ6Vr');
  assert.equal(spotifyId('spotify:track:1qPbGZqppFwLwcBC1JQ6Vr'), '1qPbGZqppFwLwcBC1JQ6Vr');
  assert.equal(spotifyId('1qPbGZqppFwLwcBC1JQ6Vr'), '1qPbGZqppFwLwcBC1JQ6Vr');
  assert.equal(spotifyId('https://youtu.be/abc'), null);
});

test('nomi dei MIDI: titolo obbligatorio, artista premia, versioni strane penalizzate', () => {
  const song = { title: 'Wonderwall', artist: 'Oasis' };
  assert.ok(midiNameScore('Oasis - Wonderwall.mid', song) > midiNameScore('Wonderwall.mid', song));
  assert.ok(midiNameScore('Wonderwall.mid', song) > midiNameScore('Ganar & Dimension - Wonderwall (pads).mid', song));
  assert.equal(midiNameScore('Champagne Supernova.mid', song), 0);
  assert.ok(midiNameScore('wonderwall-oasis.mid', song) >= 0.9);
  assert.ok(midiNameScore('Albachiara.mid', { title: 'Albachiara', artist: 'Vasco Rossi' }) > 0);
  // stesso titolo, altro artista
  assert.ok(midiNameScore('Diana Ross - Upside Down.mid', { title: 'Upside Down', artist: 'Jack Johnson' }) <= 0.2);
  assert.ok(midiNameScore('Jack Johnson - Upside Down.mid', { title: 'Upside Down', artist: 'Jack Johnson' }) >= 0.9);
});

test('ricerca MIDI (fetch finto): ordina e toglie i doppioni', async () => {
  const fake = async () => ({ ok: true, json: async () => ({ result: { results: [
    { id: 1, name: 'Wonderwall (piano).mid', downloadUrl: '/uploads/1.mid' },
    { id: 2, name: 'Oasis - Wonderwall.mid', downloadUrl: '/uploads/2.mid' },
    { id: 3, name: 'Other song.mid', downloadUrl: '/uploads/3.mid' },
  ] } }) });
  const r = await searchMidi({ title: 'Wonderwall', artist: 'Oasis' }, { fetchFn: fake });
  assert.deepEqual(r.map((x) => x.id), [2, 1]);
  assert.equal(r[0].url, 'https://bitmidi.com/uploads/2.mid');
});

test('traccia Deezer: titolo, artista e durata del testo', () => {
  const res = [
    { id: 1, title: 'Wonderwall (Live)', title_short: 'Wonderwall', duration: 300, artist: { name: 'Oasis' } },
    { id: 2, title: 'Wonderwall', title_short: 'Wonderwall', duration: 258, artist: { name: 'Oasis' } },
    { id: 3, title: 'Wonderwall', title_short: 'Wonderwall', duration: 259, artist: { name: 'Ryan Adams' } },
  ];
  assert.equal(pickDeezer(res, { title: 'Wonderwall', artist: 'Oasis' }, 259).id, 2);
  assert.equal(pickDeezer(res, { title: 'Wonderwall', artist: 'Oasis' }, 100), null);
  assert.ok(songsterrUrl({ title: 'Wonderwall', artist: 'Oasis' }).includes('Oasis%20Wonderwall'));
});
