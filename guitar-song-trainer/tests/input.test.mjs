import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRocksmith, pickInput } from '../js/input.js';

const dev = (deviceId, label) => ({ kind: 'audioinput', deviceId, label });

test('riconosce il cavo Rocksmith dai nomi usati da Windows, macOS, Linux e Android', () => {
  for (const l of ['Rocksmith Guitar Adapter Mono', 'Microphone (Rocksmith USB Guitar Adapter)', 'Real Tone Cable', 'USB Audio: Rocksmith Guitar Adapter']) {
    assert.ok(isRocksmith(l), l);
  }
  assert.ok(!isRocksmith('Microfono (Realtek High Definition Audio)'));
  assert.ok(!isRocksmith(''));
});

test('sceglie il cavo da solo, ma rispetta la scelta dell\'utente', () => {
  const list = [dev('default', 'Predefinito'), dev('mic', 'Microfono interno'), dev('rs', 'Rocksmith Guitar Adapter Mono'), { kind: 'audiooutput', deviceId: 'x', label: 'Casse' }];
  assert.equal(pickInput(list, '').deviceId, 'rs');
  assert.equal(pickInput(list, 'mic').deviceId, 'mic');
  assert.equal(pickInput(list, 'scollegato').deviceId, 'rs', 'dispositivo salvato non più presente');
  assert.equal(pickInput([dev('mic', 'Microfono')], ''), null, 'senza cavo: predefinito');
});
