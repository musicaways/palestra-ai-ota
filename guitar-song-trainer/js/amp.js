// Amplificatore ed effetti per la chitarra collegata (cavo Rocksmith o scheda audio), in Web Audio.
// Catena: ingresso → gain/distorsione → equalizzatore (bassi, medi, alti) → cassa simulata
//         → chorus → delay → riverbero → volume.
// La parte "pura" (preset, curva di distorsione, suggerimento per brano) è testabile senza browser.

export const TONE_PRESETS = [
  { id: 'pulito', label: 'Pulito', desc: 'Suono clean, un filo di riverbero. Pop, cantautori, arpeggi.',
    p: { drive: 0, bass: 0, mid: 0, treble: 2, chorus: 0, delay: 0, delayTime: 0.35, reverb: 0.15, volume: 1, cab: 9000 } },
  { id: 'pulito-chorus', label: 'Pulito con chorus', desc: 'Clean luminoso e largo: indie, anni \'80, ballate.',
    p: { drive: 0.03, bass: -1, mid: 0, treble: 3, chorus: 0.55, delay: 0.12, delayTime: 0.3, reverb: 0.25, volume: 1, cab: 9000 } },
  { id: 'acustico', label: 'Acustico', desc: 'Simula una chitarra acustica: bassi asciutti, alti brillanti.',
    p: { drive: 0, bass: -5, mid: -3, treble: 6, chorus: 0.1, delay: 0, delayTime: 0.3, reverb: 0.2, volume: 1.1, cab: 14000 } },
  { id: 'crunch', label: 'Crunch', desc: 'Leggera saturazione: blues, rock classico, cantautori elettrici.',
    p: { drive: 0.35, bass: 2, mid: 2, treble: 1, chorus: 0, delay: 0, delayTime: 0.3, reverb: 0.15, volume: 0.9, cab: 6500 } },
  { id: 'rock', label: 'Distorsione rock', desc: 'Power chord pieni: rock italiano, punk, grunge.',
    p: { drive: 0.65, bass: 3, mid: 0, treble: 2, chorus: 0, delay: 0, delayTime: 0.3, reverb: 0.12, volume: 0.8, cab: 5500 } },
  { id: 'lead', label: 'Assolo', desc: 'Distorsione con medi in evidenza, delay e riverbero: per le scale e gli assoli.',
    p: { drive: 0.75, bass: 1, mid: 5, treble: 1, chorus: 0, delay: 0.3, delayTime: 0.38, reverb: 0.28, volume: 0.8, cab: 5200 } },
  { id: 'metal', label: 'Metal', desc: 'Tanto guadagno, medi scavati.',
    p: { drive: 0.95, bass: 5, mid: -6, treble: 4, chorus: 0, delay: 0, delayTime: 0.3, reverb: 0.08, volume: 0.7, cab: 5000 } },
  { id: 'ambient', label: 'Ambient', desc: 'Delay lunghi e tanto riverbero: atmosfere, arpeggi lenti.',
    p: { drive: 0.05, bass: 0, mid: -1, treble: 2, chorus: 0.3, delay: 0.45, delayTime: 0.5, reverb: 0.55, volume: 0.9, cab: 9000 } },
];

export const KNOBS = [
  { k: 'drive', label: 'Gain', min: 0, max: 1, step: 0.01 },
  { k: 'bass', label: 'Bassi', min: -12, max: 12, step: 0.5 },
  { k: 'mid', label: 'Medi', min: -12, max: 12, step: 0.5 },
  { k: 'treble', label: 'Alti', min: -12, max: 12, step: 0.5 },
  { k: 'chorus', label: 'Chorus', min: 0, max: 1, step: 0.01 },
  { k: 'delay', label: 'Delay', min: 0, max: 1, step: 0.01 },
  { k: 'reverb', label: 'Riverbero', min: 0, max: 1, step: 0.01 },
  { k: 'volume', label: 'Volume', min: 0, max: 1.5, step: 0.01 },
];

export const presetById = (id) => TONE_PRESETS.find((p) => p.id === id) ?? TONE_PRESETS[0];

// Parametri effettivi: preset + regolazioni dell'utente.
export function toneParams(tone) {
  const base = presetById(tone?.preset);
  return { ...base.p, ...(tone?.params ?? {}) };
}

// Suono adatto al brano: campo "tone" del brano, altrimenti dal genere e dalle note.
export function suggestTone(song) {
  if (song?.tone && TONE_PRESETS.some((p) => p.id === song.tone)) return song.tone;
  const g = `${song?.genre ?? ''}`.toLowerCase();
  const notes = `${song?.notes ?? ''}`.toLowerCase();
  if (/metal/.test(g)) return 'metal';
  if (/distors|power chord|riff/.test(notes) && !/acustic/.test(notes)) return 'rock';
  if (/blues/.test(g)) return 'crunch';
  if (/^rock|punk|grunge/.test(g)) return 'rock';
  if (/pop \/ rock|rock \/ pop/.test(g)) return 'crunch';
  if (/cantautor|folk|country|acustic/.test(g)) return 'acustico';
  if (/indie|reggae|soul/.test(g)) return 'pulito-chorus';
  return 'pulito';
}

// Curva di saturazione "morbida" (simmetrica, monotona): più drive, più compressione dei picchi.
export function distortionCurve(drive, n = 2048) {
  const k = drive * 120;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    curve[i] = k < 0.01 ? x : ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

// Risposta all'impulso del riverbero: rumore che decade esponenzialmente (stereo).
export function impulse(sampleRate, seconds = 2.2, decay = 3) {
  const n = Math.floor(sampleRate * seconds);
  const ch = [new Float32Array(n), new Float32Array(n)];
  let seed = 7;
  for (const c of ch) {
    for (let i = 0; i < n; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      c[i] = ((seed / 0x7fffffff) * 2 - 1) * Math.pow(1 - i / n, decay);
    }
  }
  return ch;
}

export class Amp {
  constructor(ctx, params = TONE_PRESETS[0].p) {
    this.ctx = ctx;
    const c = ctx;
    this.input = c.createGain();
    this.pre = c.createGain();
    this.shaper = c.createWaveShaper();
    this.shaper.oversample = '4x';
    this.post = c.createGain();
    this.hp = c.createBiquadFilter(); this.hp.type = 'highpass'; this.hp.frequency.value = 70;
    this.bass = c.createBiquadFilter(); this.bass.type = 'lowshelf'; this.bass.frequency.value = 120;
    this.mid = c.createBiquadFilter(); this.mid.type = 'peaking'; this.mid.frequency.value = 750; this.mid.Q.value = 0.8;
    this.treble = c.createBiquadFilter(); this.treble.type = 'highshelf'; this.treble.frequency.value = 3200;
    this.cab = c.createBiquadFilter(); this.cab.type = 'lowpass'; this.cab.Q.value = 0.7;
    this.input.connect(this.pre).connect(this.shaper).connect(this.post)
      .connect(this.hp).connect(this.bass).connect(this.mid).connect(this.treble).connect(this.cab);
    // chorus: copia ritardata di pochi ms modulata da un oscillatore lento
    this.dry = c.createGain();
    this.chorusDelay = c.createDelay(0.05); this.chorusDelay.delayTime.value = 0.018;
    this.lfo = c.createOscillator(); this.lfo.frequency.value = 0.9;
    this.lfoGain = c.createGain(); this.lfoGain.gain.value = 0.004;
    this.lfo.connect(this.lfoGain).connect(this.chorusDelay.delayTime);
    this.lfo.start();
    this.chorusMix = c.createGain();
    this.mixBus = c.createGain();
    this.cab.connect(this.dry).connect(this.mixBus);
    this.cab.connect(this.chorusDelay).connect(this.chorusMix).connect(this.mixBus);
    // delay con ripetizioni
    this.echo = c.createDelay(1.5);
    this.feedback = c.createGain(); this.feedback.gain.value = 0.35;
    this.echoMix = c.createGain();
    this.mixBus.connect(this.echo);
    this.echo.connect(this.feedback).connect(this.echo);
    this.echo.connect(this.echoMix);
    // riverbero
    this.conv = c.createConvolver();
    const ir = impulse(c.sampleRate);
    const buf = c.createBuffer(2, ir[0].length, c.sampleRate);
    buf.copyToChannel(ir[0], 0); buf.copyToChannel(ir[1], 1);
    this.conv.buffer = buf;
    this.revMix = c.createGain();
    this.mixBus.connect(this.conv).connect(this.revMix);
    this.output = c.createGain();
    this.mixBus.connect(this.output);
    this.echoMix.connect(this.output);
    this.revMix.connect(this.output);
    this.set(params);
  }

  set(p) {
    const t = this.ctx.currentTime;
    const ramp = (param, v) => param.setTargetAtTime(v, t, 0.02);
    this.shaper.curve = distortionCurve(p.drive);
    ramp(this.pre.gain, 1 + p.drive * 24);
    ramp(this.post.gain, 1 / (1 + p.drive * 5));
    ramp(this.bass.gain, p.bass);
    ramp(this.mid.gain, p.mid);
    ramp(this.treble.gain, p.treble);
    ramp(this.cab.frequency, p.cab ?? 8000);
    ramp(this.dry.gain, 1 - p.chorus * 0.35);
    ramp(this.chorusMix.gain, p.chorus * 0.7);
    ramp(this.echo.delayTime, p.delayTime ?? 0.35);
    ramp(this.echoMix.gain, p.delay * 0.6);
    ramp(this.revMix.gain, p.reverb * 0.9);
    ramp(this.output.gain, p.volume);
  }

  disconnect() {
    try { this.lfo.stop(); } catch { /* già fermo */ }
    this.output.disconnect();
  }
}
