// Ingresso audio della chitarra: microfono oppure interfaccia USB, compreso il cavo
// "Real Tone Cable" di Rocksmith (scheda audio USB standard: niente driver su Windows, macOS,
// Linux e Android con adattatore OTG). Qui si sceglie il dispositivo, si regola il guadagno e,
// volendo, si ascolta la chitarra in cuffia ("monitor").
import { loadSettings, saveSettings } from './store.js';

const ROCKSMITH = /rocksmith|real\s*tone|guitar\s*adapter/i;

export const isRocksmith = (label) => ROCKSMITH.test(label ?? '');

/**
 * Dispositivo da usare: quello salvato se c'è ancora, altrimenti il cavo Rocksmith se collegato,
 * altrimenti quello predefinito (null).
 */
export function pickInput(devices, savedId) {
  const inputs = devices.filter((d) => d.kind === 'audioinput');
  if (savedId && inputs.some((d) => d.deviceId === savedId)) return inputs.find((d) => d.deviceId === savedId);
  return inputs.find((d) => isRocksmith(d.label)) ?? null;
}

// Elenco degli ingressi; i nomi sono visibili solo dopo aver concesso il permesso almeno una volta.
export async function listInputs({ ask = false } = {}) {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  let devices = await navigator.mediaDevices.enumerateDevices();
  const unnamed = devices.some((d) => d.kind === 'audioinput' && !d.label);
  if (ask && unnamed) {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
    devices = await navigator.mediaDevices.enumerateDevices();
  }
  return devices.filter((d) => d.kind === 'audioinput');
}

export async function openInputStream(settings = loadSettings()) {
  const devices = await listInputs();
  const chosen = pickInput(devices, settings.inputDeviceId);
  const audio = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
    latency: 0,
  };
  if (chosen) audio.deviceId = { exact: chosen.deviceId };
  const stream = await navigator.mediaDevices.getUserMedia({ audio });
  const track = stream.getAudioTracks()[0];
  return { stream, label: track?.label ?? '', rocksmith: isRocksmith(track?.label) };
}

/**
 * Catena audio: ingresso → guadagno → analizzatore (+ uscita in cuffia se il monitor è attivo).
 * Usata da accordatore, modalità ascolto e dal pannello di configurazione.
 */
export class GuitarInput {
  static async open({ fftSize = 4096, settings = loadSettings() } = {}) {
    const g = new GuitarInput();
    const { stream, label, rocksmith } = await openInputStream(settings);
    g.stream = stream;
    g.label = label;
    g.rocksmith = rocksmith;
    g.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    g.source = g.ctx.createMediaStreamSource(stream);
    g.gain = g.ctx.createGain();
    g.gain.gain.value = settings.inputGain ?? 1;
    g.analyser = g.ctx.createAnalyser();
    g.analyser.fftSize = fftSize;
    g.source.connect(g.gain).connect(g.analyser);
    g.monitorGain = g.ctx.createGain();
    g.gain.connect(g.monitorGain);
    g.setMonitor(settings.monitor, settings.monitorVolume ?? 0.8);
    return g;
  }

  get sampleRate() { return this.ctx.sampleRate; }

  setGain(v) { this.gain.gain.value = v; }

  setMonitor(on, volume = 0.8) {
    this.monitorGain.gain.value = on ? volume : 0;
    if (on && !this.monitoring) { this.monitorGain.connect(this.ctx.destination); this.monitoring = true; }
    if (!on && this.monitoring) { this.monitorGain.disconnect(); this.monitoring = false; }
  }

  // Livello RMS attuale (0..1) dal buffer nel tempo.
  level(buf = new Float32Array(this.analyser.fftSize)) {
    this.analyser.getFloatTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / buf.length);
  }

  close() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
  }
}

/**
 * Pannello "Ingresso audio": scelta del dispositivo, livello, guadagno, monitor.
 * @param container elemento in cui disegnarlo; restituisce una funzione per chiuderlo.
 */
export async function mountInputPanel(container) {
  const settings = loadSettings();
  container.innerHTML = `
    <label>Dispositivo<select class="in-device"><option value="">Predefinito (microfono)</option></select></label>
    <div class="in-detected hint"></div>
    <div class="in-meter" title="Livello del segnale"><div class="in-meter-fill"></div></div>
    <label>Guadagno <b class="in-gain-out"></b><input type="range" class="in-gain" min="0.5" max="8" step="0.5"></label>
    <label class="check"><input type="checkbox" class="in-monitor"> Ascolta la chitarra in cuffia (monitor)</label>
    <label>Volume del monitor<input type="range" class="in-monvol" min="0" max="1.5" step="0.05"></label>
    <p class="hint">Cavo Rocksmith (Real Tone Cable): collegalo alla porta USB; sul telefono serve un adattatore
    USB-OTG. Non servono driver: viene riconosciuto e scelto da solo. Usa le cuffie col monitor attivo per evitare fischi.</p>`;
  const sel = container.querySelector('.in-device');
  const detected = container.querySelector('.in-detected');
  const fill = container.querySelector('.in-meter-fill');
  const gainIn = container.querySelector('.in-gain');
  const gainOut = container.querySelector('.in-gain-out');
  const mon = container.querySelector('.in-monitor');
  const monVol = container.querySelector('.in-monvol');
  gainIn.value = settings.inputGain ?? 1;
  gainOut.textContent = `×${gainIn.value}`;
  mon.checked = !!settings.monitor;
  monVol.value = settings.monitorVolume ?? 0.8;

  let input = null;
  let raf = 0;
  let closed = false;

  async function refreshDevices() {
    let devices = [];
    try { devices = await listInputs({ ask: true }); } catch { detected.textContent = 'Serve il permesso del microfono.'; }
    sel.length = 1;
    for (const d of devices) {
      if (d.deviceId === 'default' || d.deviceId === '') continue;
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = (isRocksmith(d.label) ? '🎸 ' : '') + (d.label || 'Ingresso audio');
      sel.append(o);
    }
    const chosen = pickInput(devices, settings.inputDeviceId);
    sel.value = chosen?.deviceId ?? '';
    const rs = devices.find((d) => isRocksmith(d.label));
    detected.textContent = rs ? `Cavo Rocksmith rilevato: ${rs.label}` : 'Cavo Rocksmith non rilevato: si usa il microfono.';
    detected.classList.toggle('ok', !!rs);
  }

  async function restart() {
    cancelAnimationFrame(raf);
    input?.close();
    input = null;
    try {
      input = await GuitarInput.open({ settings });
    } catch {
      detected.textContent = 'Impossibile aprire l\'ingresso audio.';
      return;
    }
    if (closed) { input.close(); return; }
    const buf = new Float32Array(input.analyser.fftSize);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const lv = input.level(buf);
      const pct = Math.min(100, Math.sqrt(lv) * 180);
      fill.style.width = `${pct}%`;
      fill.classList.toggle('hot', lv > 0.5);
    };
    loop();
  }

  const persist = () => saveSettings(settings);
  sel.addEventListener('change', () => { settings.inputDeviceId = sel.value; persist(); restart(); });
  gainIn.addEventListener('input', () => {
    settings.inputGain = Number(gainIn.value);
    gainOut.textContent = `×${gainIn.value}`;
    input?.setGain(settings.inputGain);
    persist();
  });
  const monitorChanged = () => {
    settings.monitor = mon.checked;
    settings.monitorVolume = Number(monVol.value);
    input?.setMonitor(settings.monitor, settings.monitorVolume);
    persist();
  };
  mon.addEventListener('change', monitorChanged);
  monVol.addEventListener('input', monitorChanged);
  navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);

  await refreshDevices();
  await restart();

  return () => {
    closed = true;
    cancelAnimationFrame(raf);
    input?.close();
    navigator.mediaDevices?.removeEventListener?.('devicechange', refreshDevices);
  };
}
