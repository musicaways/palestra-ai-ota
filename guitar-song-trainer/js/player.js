// Schermata di studio di un brano: palco con manico 3D, video, trasporto, testo karaoke.
import { YouTubeClock, FreeClock, AudioClock, SwitchClock, SpotifyClock } from './clock.js';
import { saveAudio, getAudio, removeAudio, saveMidi, getMidi, removeMidi } from './audiofiles.js';
import { findSpotify, spotifyId as parseSpotifyId, searchMidi, downloadMidi, songsterrUrl } from './online.js';
import { Tab } from './tab.js';
import { parseMidi, guessGuitarTrack, fingerNotes, alignMidi, placeMidi, programName } from './midi.js';
import { youtubeId as parseYouTubeId } from './songtext.js';
import { wordTimes, wordAt } from './wordtiming.js';
import { chromaFrames, alignToAudio, decodeToMono } from './audioanalysis.js';
import { buildTimeline, eventIndexAt, beatAt } from './timeline.js';
import { Fretboard } from './fretboard.js';
import { Sheet } from './sheet.js';
import { Karaoke } from './karaoke.js';
import { loadSyncedLyrics, looksLikeLrc, clearLyricsCache } from './lyrics.js';
import { displayChord, chordColor, shapeNameWithCapo, suggestCapo, transposeChord, suggestTranspose } from './music.js';
import { ARRANGEMENTS, arrangeName, buildArpeggio, shapeForArrangement, pickingFor, PICKINGS } from './arrangement.js';
import { click, WakeLock, strumChord, pluck } from './audio.js';
import { addPractice, recordRate, recordAccuracy, getStats } from './stats.js';
import { Listener, matchChord } from './detect.js';
import { mountInputPanel } from './input.js';
import { lyricGridCheck, estimateOffsetFromAudio, tapAlignShift } from './syncmath.js';
import { icon } from './icons.js';
import { chordDiagram } from './diagram.js';
import { Tuner } from './tuner.js';
import { GuitarInput } from './input.js';
import { TONE_PRESETS, KNOBS, presetById, suggestTone, toneParams } from './amp.js';
import { CameraRecorder, saveRecording, shareOrDownload } from './camera.js';
import { getSetlists, createSetlist, toggleInSetlist, setlistById, nextInSetlist, songHref } from './setlists.js';
import { store, loadSettings, saveSettings, getFavorites, toggleFavorite } from './store.js';

const fmt = (t) => {
  if (!isFinite(t) || t < 0) t = 0;
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
};
const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const signed = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)} s`;

export async function openPlayer(root, song, { setlist: setlistId = null, songInfo = () => null } = {}) {
  const settings = loadSettings();
  const key = (k) => `${k}:${song.id}`;
  let offset = store.get(key('offset'), 0);
  let lyricsOffset = store.get(key('lyricsOffset'), song.lyricsSource?.offset ?? 0);
  let sync = store.get(key('sync'), null) ?? song.sync ?? null;
  let plainLyrics = store.get(key('lyrics'), []);
  let synced = null; // { lines, source }
  let panelTab = store.get('panelTab', 'lyrics');
  let tl = buildTimeline(song, { offset, sync });
  let loop = { on: false, a: null, b: null, label: '' };
  let clock = null;
  let raf = 0;
  let lastSeekAt = 0;
  let lastBeatKey = '';
  let recorder = null;
  let destroyed = false;
  let lastIdx = -2; // ultimo accordo mostrato nell'HUD (-2 = da ridisegnare)
  let lastStrumKey = '';
  let lastNoteIdx = -1;
  let syncCheck = null; // esito del controllo di coerenza fra testo e accordi
  let lastDiagram = null;
  let ramp = false;
  let counting = null; // conteggio d'attacco in corso
  let tuner = null;
  let capo = store.get(key('capo'), song.capo ?? 0);
  // preferenze del brano, ricordate per la prossima volta: tonalità, parte, vista, velocità, loop
  const prefs = {
    transpose: 0, arrangement: 'rhythm', view: settings.focus ? 'stage' : (settings.view ?? 'full'), rate: 1, loop: null,
    ...store.get(key('prefs'), {}),
  };
  const savePrefs = () => store.set(key('prefs'), prefs);
  let midi = null; // { name, tracks, bpm } parte MIDI caricata dall'utente
  let study = { on: false, learned: [], ...store.get(key('study'), {}) }; // studio guidato sezione per sezione
  study.on = false;
  let ampIn = null; // chitarra che passa dall'amplificatore simulato
  let cam = null; // registrazione video
  let curSec = -2; // sezione evidenziata nella riga delle sezioni
  let practiceAcc = 0;
  let lastFrameAt = performance.now();
  const wake = new WakeLock();
  let listener = null;
  let judge = null; // { idx, frames, hits } valutazione dell'accordo corrente
  let score = { hits: 0, total: 0, streak: 0, bestStreak: 0 };

  root.innerHTML = `
  <div class="player">
    <header class="player-head">
      <a class="icon-btn" href="#/" aria-label="Torna alla libreria">${icon('back')}</a>
      <div class="player-title"><div class="title"></div><div class="artist"></div></div>
      <button class="icon-btn fav" aria-label="Preferito"></button>
      <a class="icon-btn edit-link" href="#/editor/${encodeURIComponent(song.id)}" aria-label="Modifica il brano" title="Modifica il brano">${icon('text')}</a>
      <button class="icon-btn" data-act="view" aria-label="Vista" title="Vista: scegli cosa mostrare (manico, video, testo)">${icon('focus')}</button>
      <button class="icon-btn" data-act="help" aria-label="Guida rapida" title="Guida rapida">?</button>
      <button class="icon-btn" data-act="settings" aria-label="Impostazioni">${icon('settings')}</button>
    </header>

    <section class="stage">
      <canvas class="fretboard" aria-label="Manico della chitarra"></canvas>
      <div class="count-overlay" hidden></div>
      <div class="stage-lyric" hidden><div class="sl-now"></div><div class="sl-next"></div></div>
      <div class="toast" hidden></div>
      <div class="hud">
        <div class="hud-block now">
          <div class="hud-label"><span class="section-name">Intro</span> <span class="capo-badge" hidden></span></div>
          <div class="hud-chord now-chord">—</div>
          <div class="score-hud" hidden><span class="acc">—</span><span class="streak"></span><span class="hear"></span></div>
        </div>
        <div class="hud-center">
          <div class="beats"></div>
          <div class="strum"></div>
        </div>
        <div class="hud-block next">
          <div class="hud-label">Prossimo <span class="countdown"></span></div>
          <div class="hud-chord next-chord">—</div>
        </div>
      </div>
    </section>

    <div class="player-main">
      <div class="left-col">
        <div class="video-wrap"><div class="video"></div><div class="video-msg" hidden></div></div>
        <div class="transport card">
          <div class="sec-strip" role="group" aria-label="Sezioni del brano: tocca per andarci"></div>
          <div class="scrub-row">
            <span class="t-cur">0:00</span>
            <div class="scrubber" title="Posizione nel brano">
              <div class="scrub-sections"></div>
              <div class="scrub-loop" hidden></div>
              <div class="scrub-fill"></div>
              <div class="scrub-head"></div>
            </div>
            <span class="t-tot">0:00</span>
          </div>
          <div class="transport-row">
            <div class="play-group">
              <button class="round" data-act="back" title="Indietro 5 s (←)">${icon('rewind')}</button>
              <button class="round big" data-act="play" title="Play / Pausa (spazio)">${icon('play', 26)}</button>
              <button class="round" data-act="fwd" title="Avanti 5 s (→)">${icon('forward')}</button>
            </div>
            <div class="status"><button class="resume-chip" hidden></button><a class="next-chip" hidden></a><span class="loop-label"></span></div>
            <div class="mini-group">
              <button class="mini" data-pop="speed" title="Velocità" aria-expanded="false"><span class="speed-val">1×</span></button>
              <button class="mini" data-pop="loop" title="Loop A–B e velocità progressiva" aria-expanded="false">${icon('loop', 18)}</button>
              <button class="mini" data-pop="tools" title="Strumenti: click, tonalità, parte, ascolto, accordatore, sincronia…" aria-expanded="false">${icon('more', 20)}</button>
            </div>
          </div>
          <div class="pop" data-popbody="speed" hidden>
            <button class="seg speed-step" data-speedstep="-1" title="Più lento" aria-label="Più lento">−</button>
            <div class="speed-pills" role="group" aria-label="Velocità"></div>
            <button class="seg speed-step" data-speedstep="1" title="Più veloce" aria-label="Più veloce">+</button>
          </div>
          <div class="pop" data-popbody="loop" hidden>
            <div class="loop-group" role="group" aria-label="Loop">
              <button class="seg" data-act="loopA" title="Inizio loop qui ([)">A</button>
              <button class="seg" data-act="loopB" title="Fine loop qui (])">B</button>
              <button class="seg" data-act="loopToggle" title="Loop on/off (L)">${icon('loop', 16)}</button>
              <button class="seg" data-act="ramp" title="Velocità progressiva: a ogni ripetizione del loop accelera fino al 100%">${icon('ramp', 16)}</button>
              <button class="seg" data-act="loopClear" title="Cancella loop">${icon('close', 16)}</button>
            </div>
            <span class="hint pop-hint">A e B segnano inizio e fine; ⟲ nel testo ripete una riga o una sezione</span>
          </div>
          <div class="pop tools-row" data-popbody="tools" hidden>
            <button class="tool" data-act="metro" title="Click del metronomo">${icon('metronome', 18)}<span>Click</span></button>
            <button class="tool" data-act="countin" title="Una battuta di conteggio prima di partire">${icon('count', 18)}<span>Conteggio</span></button>
            <button class="tool" data-act="capo" title="Tonalità e capotasto: trasponi o usa forme più facili">${icon('capo', 18)}<span class="capo-label">Tonalità</span></button>
            <button class="tool" data-act="part" title="Parte di chitarra: ritmica, arpeggio, power chord, facile">${icon('guitar', 18)}<span class="part-label">Ritmica</span></button>
            <button class="tool" data-act="source" title="Sorgente audio: video YouTube, un altro video o un tuo file audio">${icon('mic', 18)}<span>Audio</span></button>
            <button class="tool" data-act="setlist" title="Aggiungi il brano a una scaletta">${icon('grid', 18)}<span>Scaletta</span></button>
            <button class="tool" data-act="backing" title="Base: la chitarra sintetica suona gli accordi con la pennata del brano">${icon('guitar', 18)}<span>Base</span></button>
            <button class="tool" data-act="study" title="Studio guidato: sezione per sezione, dal lento al veloce">${icon('study', 18)}<span>Studio</span></button>
            <button class="tool" data-act="amp" title="Amplificatore ed effetti per la chitarra collegata">${icon('amp', 18)}<span>Ampli</span></button>
            <button class="tool" data-act="camera" title="Registra un video mentre suoni">${icon('camera', 18)}<span>Video</span></button>
            <button class="tool" data-act="listen" title="Ascolta dal microfono e controlla se suoni l'accordo giusto">${icon('mic', 18)}<span>Ascolto</span></button>
            <button class="tool" data-act="tuner" title="Accorda la chitarra col microfono">${icon('tuner', 18)}<span>Accorda</span></button>
            <button class="tool" data-act="sync" title="Allinea accordi e testo al video">${icon('sliders', 18)}<span>Sincronia</span></button>
            <button class="tool" data-act="record" title="Registra i cambi accordo toccando a tempo">${icon('target', 18)}<span>Registra</span></button>
            <button class="tool" data-act="print" title="Stampa o salva in PDF gli accordi del brano">${icon('print', 18)}<span>Stampa</span></button>
            <button class="tool" data-act="info" title="Informazioni sul brano">${icon('info', 18)}<span>Info</span></button>
          </div>
        </div>
      </div>
      <aside class="panel card">
        <div class="panel-tabs" role="tablist">
          <button class="panel-tab" data-tab="lyrics">${icon('mic', 16)} Testo</button>
          <button class="panel-tab" data-tab="chords">${icon('grid', 16)} Accordi</button>
          <button class="panel-tab" data-tab="shapes">${icon('hand', 16)} Diteggiature</button>
          <button class="panel-tab" data-tab="tab">${icon('guitar', 16)} Tab</button>
          <span class="panel-source"></span>
        </div>
        <div class="panel-body lyrics-body"></div>
        <div class="panel-body chords-body"></div>
        <div class="panel-body shapes-body"></div>
        <div class="panel-body tab-body"></div>
      </aside>
    </div>

    <div class="tapnow" hidden>
      <div class="tapnow-info">Fai partire il video e tocca <b>ADESSO</b> (o premi <kbd>T</kbd>) nell'istante in cui inizia a cantare</div>
      <button class="rec-tap tapnow-btn">ADESSO</button>
      <button class="chip-btn tapnow-cancel">Annulla</button>
    </div>
    <div class="recorder" hidden>
      <div class="rec-info"></div>
      <button class="rec-tap">TAP</button>
      <div class="rec-actions">
        <button class="chip-btn" data-rec="undo">Annulla ultimo</button>
        <button class="chip-btn" data-rec="restart">Ricomincia</button>
        <button class="chip-btn" data-rec="export">Esporta JSON</button>
        <button class="chip-btn primary" data-rec="done">Fine</button>
      </div>
    </div>

    <dialog class="dlg dlg-settings">
      <form method="dialog">
        <h3>Impostazioni</h3>
        <label><span>Notazione</span>
          <select name="notation"><option value="intl">Internazionale (C D E)</option><option value="it">Italiana (Do Re Mi)</option></select></label>
        <label class="check"><input type="checkbox" name="leftHanded"> Chitarra mancina (manico specchiato)</label>
        <label class="check"><input type="checkbox" name="highStringOnTop"> Mi cantino in alto (come le tablature)</label>
        <label class="check"><input type="checkbox" name="showNoteNames"> Nome delle note al posto delle dita</label>
        <label class="check"><input type="checkbox" name="autoScroll"> Scorrimento automatico del testo</label>
        <label class="check"><input type="checkbox" name="stageLyrics"> Riga del testo sul palco</label>
        <button type="button" class="chip-btn" data-act="input">${icon('guitar', 16)} Ingresso audio (microfono o cavo Rocksmith)</button>
        <a class="chip-btn" href="#/editor/${encodeURIComponent(song.id)}">${icon('text', 16)} Modifica il brano</a>
        <p class="hint">Scorciatoie: spazio play/pausa · ← → ±5 s · [ ] punti A/B · L loop · T tap in registrazione</p>
        <menu><button value="ok" class="chip-btn primary">Chiudi</button></menu>
      </form>
    </dialog>

    <dialog class="dlg dlg-sync">
      <form method="dialog">
        <h3>Sincronia</h3>
        <div class="sync-status"></div>
        <div class="sync-auto">
          <button type="button" class="chip-btn primary" data-sync="tap">${icon('target', 16)} Tocca quando inizia a cantare</button>
          <button type="button" class="chip-btn" data-sync="listen">${icon('mic', 16)} Allinea ascoltando il video</button>
          <button type="button" class="chip-btn primary" data-sync="audiofile" hidden>${icon('target', 16)} Allinea al file audio (automatico)</button>
          <button type="button" class="chip-btn" data-sync="fix" hidden>Correggi automaticamente</button>
        </div>
        <div class="sync-line">
          <div><b>Tutto</b><span class="hint">sposta insieme testo e accordi rispetto al video</span></div>
          <div class="stepper"><button type="button" class="round" data-step="all:-0.1">−</button><output class="out-all">±</output><button type="button" class="round" data-step="all:0.1">+</button></div>
        </div>
        <div class="sync-line">
          <div><b>Accordi</b><span class="hint">se arrivano in ritardo premi −, se sono in anticipo +</span></div>
          <div class="stepper"><button type="button" class="round" data-step="chords:-0.05">−</button><output class="out-chords"></output><button type="button" class="round" data-step="chords:0.05">+</button></div>
        </div>
        <div class="sync-line">
          <div><b>Testo</b><span class="hint">sposta il testo karaoke rispetto al video</span></div>
          <div class="stepper"><button type="button" class="round" data-step="lyrics:-0.1">−</button><output class="out-lyrics"></output><button type="button" class="round" data-step="lyrics:0.1">+</button></div>
        </div>
        <p class="hint">Per un allineamento perfetto degli accordi usa <b>Registra tempi</b>: tocchi TAP a ogni cambio mentre il video suona.</p>
        <div class="sync-actions">
          <button type="button" class="chip-btn" data-sync="paste">${icon('text', 16)} Incolla il tuo testo</button>
          <button type="button" class="chip-btn" data-sync="reload">Riscarica testo</button>
          <button type="button" class="chip-btn" data-sync="resetTimes">Azzera tempi registrati</button>
        </div>
        <menu><button value="ok" class="chip-btn primary">Fatto</button></menu>
      </form>
    </dialog>

    <dialog class="dlg dlg-lyrics">
      <form method="dialog">
        <h3>Il tuo testo</h3>
        <p class="hint">Incolla il testo. Se è in formato <b>LRC</b> (righe come <code>[00:12.34] …</code>) diventa karaoke
        sincronizzato. Altrimenti separa i blocchi con una riga vuota: ogni blocco va sotto una riga di accordi.
        Resta salvato solo su questo dispositivo. Lascia vuoto per tornare al testo scaricato.</p>
        <textarea name="text" rows="14" spellcheck="false"></textarea>
        <menu>
          <button value="cancel" class="chip-btn">Annulla</button>
          <button value="save" class="chip-btn primary">Salva</button>
        </menu>
      </form>
    </dialog>

    <dialog class="dlg dlg-capo"><form method="dialog"><h3>Tonalità e capotasto</h3>
      <div class="dlg-sub">Trasposizione</div>
      <div class="sync-line">
        <div><b class="tr-desc"></b><span class="hint">cambia la tonalità: utile per cantarla più comoda o per evitare il capotasto</span></div>
        <div class="stepper"><button type="button" class="round" data-tr="-1">−</button><output class="out-tr">0</output><button type="button" class="round" data-tr="1">+</button></div>
      </div>
      <div class="tr-actions"></div>
      <p class="tr-warn hint" hidden>Attenzione: il video resta nella tonalità originale, quindi suonandoci sopra non combacia. Usalo per suonare da solo o per cantare.</p>
      <div class="dlg-sub">Capotasto</div>
      <p class="hint">Con il capotasto il brano suona uguale, ma usi forme di accordo diverse, spesso più facili.
      Il manico, i diagrammi e il testo mostrano le forme da suonare.</p>
      <div class="capo-grid"></div>
      <div class="capo-suggest"></div>
      <div class="capo-preview"></div>
      <menu><button value="ok" class="chip-btn primary">Fatto</button></menu></form></dialog>

    <dialog class="dlg dlg-part"><form method="dialog"><h3>Parte di chitarra</h3>
      <p class="hint">Più modi di suonare lo stesso brano, ricavati dai suoi accordi. Non sono trascrizioni dei riff originali:
      sono arrangiamenti per studiare il brano a livelli diversi.</p>
      <div class="option-list part-list"></div>
      <div class="part-style"></div>
      <div class="part-midi"></div>
      <menu><button value="ok" class="chip-btn primary">Fatto</button></menu></form></dialog>

    <dialog class="dlg dlg-view"><form method="dialog"><h3>Vista</h3>
      <p class="hint">Scegli cosa tenere sullo schermo. Il video continua a suonare anche quando è nascosto. La scelta resta salvata per questo brano.</p>
      <div class="option-list view-list"></div>
      <label class="check"><input type="checkbox" name="viewDefault"> Usa questa vista per tutti i brani</label>
      <menu><button value="ok" class="chip-btn primary">Fatto</button></menu></form></dialog>

    <dialog class="dlg dlg-input"><form method="dialog"><h3>Ingresso audio</h3><div class="input-panel"></div>
      <menu><button value="ok" class="chip-btn primary">Fatto</button></menu></form></dialog>

    <dialog class="dlg dlg-tuner"><form method="dialog"><h3>Accordatore</h3><div class="tuner"></div>
      <button type="button" class="chip-btn" data-act="input">${icon('guitar', 16)} Ingresso audio</button>
      <p class="hint">Accordatura standard: Mi La Re Sol Si Mi. Pizzica una corda e attendi che la lancetta si fermi al centro.</p>
      <menu><button value="ok" class="chip-btn primary">Chiudi</button></menu></form></dialog>

    <dialog class="dlg dlg-amp"><form method="dialog"><h3>Amplificatore ed effetti</h3>
      <label class="check amp-on-line"><input type="checkbox" name="ampOn"> Suona attraverso l'ampli <span class="hint">· usa le cuffie</span></label>
      <div class="amp-live" hidden><div class="in-meter"><div class="in-meter-fill"></div></div><span class="hint amp-src"></span></div>
      <label class="check"><input type="checkbox" name="toneAuto"> Suono scelto in automatico per ogni brano</label>
      <div class="amp-suggest hint"></div>
      <div class="option-list amp-presets"></div>
      <div class="dlg-sub">Regolazioni</div>
      <div class="amp-knobs"></div>
      <div class="tr-actions"><button type="button" class="chip-btn" data-amp="default">Usa per tutti i brani</button><button type="button" class="chip-btn" data-amp="reset">Ripristina il preset</button></div>
      <p class="hint">Funziona con il cavo Rocksmith o una scheda audio (scegli l'ingresso in <b>Impostazioni → Ingresso audio</b>). Le regolazioni restano salvate per questo brano.</p>
      <menu><button value="ok" class="chip-btn primary">Fatto</button></menu></form></dialog>

    <div class="cam" hidden>
      <video class="cam-preview" playsinline muted autoplay></video>
      <div class="cam-bar">
        <span class="cam-time"></span>
        <button type="button" class="cam-btn cam-rec" data-cam="rec" title="Inizia / ferma la registrazione" aria-label="Registra"></button>
        <button type="button" class="cam-btn" data-cam="flip" title="Cambia fotocamera" aria-label="Cambia fotocamera">${icon('flip', 16)}</button>
        <button type="button" class="cam-btn" data-cam="close" title="Chiudi la fotocamera" aria-label="Chiudi">${icon('close', 16)}</button>
      </div>
    </div>

    <dialog class="dlg dlg-rec"><form method="dialog"><h3>La tua registrazione</h3>
      <video class="rec-video" controls playsinline></video>
      <label><span>Titolo</span><input name="recTitle" maxlength="80"></label>
      <p class="hint">Resta sul tuo dispositivo, in <a href="#/registrazioni">Registrazioni</a>. Il video di YouTube non viene registrato: si sente se esce dalle casse.</p>
      <div class="tr-actions">
        <button type="button" class="chip-btn primary" data-rec2="save">${icon('check', 16)} Salva</button>
        <button type="button" class="chip-btn" data-rec2="share">Condividi</button>
        <button type="button" class="chip-btn" data-rec2="discard">Scarta</button>
      </div>
      <menu><button value="ok" class="chip-btn">Chiudi</button></menu></form></dialog>

    <dialog class="dlg dlg-setlist"><form method="dialog"><h3>Scalette</h3>
      <p class="hint">Metti il brano in una o più scalette: dalla libreria (scheda Scalette) le suoni una dopo l'altra.</p>
      <div class="option-list setlist-list"></div>
      <div class="tr-actions"><input class="sl-new" placeholder="Nuova scaletta…" maxlength="40"><button type="button" class="chip-btn" data-sl="new">Crea</button></div>
      <menu><button value="ok" class="chip-btn primary">Fatto</button></menu></form></dialog>

    <dialog class="dlg dlg-score"><form method="dialog"><h3>Fine del brano</h3>
      <div class="score-stars"></div>
      <div class="score-acc"></div>
      <div class="hint score-detail"></div>
      <div class="score-rec" hidden>Nuovo record personale!</div>
      <menu><button type="button" class="chip-btn" data-score="again">${icon('loop', 16)} Riprova</button><button value="ok" class="chip-btn primary">Chiudi</button></menu></form></dialog>

    <dialog class="dlg dlg-source"><form method="dialog"><h3>Sorgente audio</h3>
      <p class="hint">Da dove arriva la musica mentre suoni. Con un tuo file audio (MP3, M4A…) la sincronia si calcola
      ascoltando proprio quel file, e puoi rallentare senza cambiare l'intonazione. Il file resta solo su questo dispositivo.</p>
      <div class="option-list src-list"></div>
      <label class="src-file-line chip-btn primary">${icon('mic', 16)} Scegli un file audio…<input type="file" accept="audio/*" class="src-file" hidden></label>
      <div class="tr-actions"><input class="sl-new src-link" placeholder="Incolla il link di un altro video YouTube"><button type="button" class="chip-btn" data-src="link">Usa questo video</button></div>
      <div class="tr-actions"><input class="sl-new src-splink" placeholder="…oppure il link del brano su Spotify"><button type="button" class="chip-btn" data-src="splink">Usa Spotify</button></div>
      <label class="check"><input type="checkbox" class="src-all"> Preferisci Spotify per tutti i brani</label>
      <p class="hint src-status"></p>
      <menu><button value="ok" class="chip-btn primary">Fatto</button></menu></form></dialog>

    <dialog class="dlg dlg-help"><form method="dialog"><h3>Guida rapida</h3>
      <ol class="help-list">
        <li><b>Accorda</b> la chitarra con l'<b>Accordatore</b> (col microfono o col cavo Rocksmith).</li>
        <li><b>Allinea</b> il brano al video: <b>Sincronia → Tocca quando inizia a cantare</b>. Se testo e accordi non combaciano, sul pulsante Sincronia compare un pallino arancione.</li>
        <li>Guarda le <b>cornici</b> che arrivano sulla corsia: quando toccano il manico, cambia accordo. Le frecce ↓↑ sono la pennata.</li>
        <li>Troppo veloce? Tocca <b>100%</b> accanto al play per rallentare, oppure ⟲ per il <b>loop</b> A–B e la <b>velocità progressiva</b> (↗).</li>
        <li>Gli strumenti meno usati (click, tonalità, parte, ascolto, accordatore, sincronia…) sono dietro al pulsante <b>⋯</b>.</li>
        <li>Accordi difficili? <b>Tonalità</b>: capotasto suggerito o trasposizione in una tonalità più facile. Con <b>Parte</b> scegli ritmica, arpeggio, power chord o versione facile.</li>
        <li>Troppe cose sullo schermo? Il pulsante <b>Vista</b> in alto nasconde il manico o il video: solo video, video e testo, solo testo.</li>
        <li>Attiva <b>Ascolto</b>: l'app sente cosa suoni e ti dice se l'accordo è giusto.</li>
      </ol>
      <p class="hint">Tastiera: spazio play/pausa · ← → ±5 s · [ ] punti A/B · L loop · T tocco (registrazione e allineamento)</p>
      <menu><button value="ok" class="chip-btn primary">Ho capito</button></menu></form></dialog>

    <dialog class="dlg dlg-info"><form method="dialog"><h3></h3><div class="info-body"></div>
      <menu><button value="ok" class="chip-btn primary">Chiudi</button></menu></form></dialog>
  </div>`;

  const $ = (s) => root.querySelector(s);
  $('.player').classList.add(`view-${prefs.view}`); // subito, prima che il video sia pronto
  const hudNow = $('.now-chord');
  const hudNext = $('.next-chord');
  const countdown = $('.countdown');
  const beatsEl = $('.beats');
  const strumEl = $('.strum');
  const sectionName = $('.section-name');
  const playBtn = $('[data-act="play"]');
  const tCur = $('.t-cur');
  const tTot = $('.t-tot');
  const scrub = $('.scrubber');
  const scrubHead = $('.scrub-head');
  const scrubFill = $('.scrub-fill');
  const scrubLoop = $('.scrub-loop');
  const loopLabel = $('.loop-label');
  const videoMsg = $('.video-msg');
  const lyricsBody = $('.lyrics-body');
  const chordsBody = $('.chords-body');
  const panelSource = $('.panel-source');
  const shapesBody = $('.shapes-body');
  const tabBody = $('.tab-body');
  const countEl = $('.count-overlay');
  const toastEl = $('.toast');

  $('.player-title .title').textContent = song.title;
  $('.player-title .artist').textContent = song.artist;
  document.title = `${song.title} · ${song.artist}`;

  const favBtn = $('.player-head .fav');
  const paintFav = (on) => { favBtn.innerHTML = icon(on ? 'starFill' : 'star'); favBtn.classList.toggle('on', on); };
  paintFav(getFavorites().has(song.id));
  favBtn.addEventListener('click', () => paintFav(toggleFavorite(song.id)));

  // ---------- Palco, testo e griglia ----------
  const fretboard = new Fretboard($('.fretboard'));
  fretboard.customShapes = song.shapes ?? null;
  const handlers = { onSeek: (t) => seek(t), onLoop: (a, b, label) => setLoop(a, b, label) };
  const sheet = new Sheet(chordsBody, handlers);
  const karaoke = new Karaoke(lyricsBody, handlers);
  const tabView = new Tab(tabBody, handlers);

  function diagramShapes(names) {
    if (prefs.arrangement !== 'easy') return customShapes();
    return Object.fromEntries(names.map((n) => [n, shapeForArrangement(n, 'easy', null)]).filter(([, sh]) => sh));
  }

  function renderPanel() {
    root.querySelectorAll('.panel-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === panelTab));
    lyricsBody.hidden = panelTab !== 'lyrics';
    chordsBody.hidden = panelTab !== 'chords';
    shapesBody.hidden = panelTab !== 'shapes';
    tabBody.hidden = panelTab !== 'tab';
    if (panelTab === 'tab') tabView.render(tl, tl.notes, { capo, source: prefs.arrangement === 'midi' && midi ? `Parte vera: ${midi.name}` : 'Arpeggio ricavato dagli accordi' });
    const names = [...new Set(tl.events.map((e) => e.name))];
    shapesBody.innerHTML = `<p class="hint">Gli accordi del brano, nell'ordine in cui compaiono. Quello che stai suonando si illumina.${capo ? ` <b>Capotasto al ${capo}° tasto</b>: i diagrammi partono dal capotasto.` : ''}</p>
      <div class="diagram-grid">${names.map((n) => chordDiagram(n, settings, diagramShapes(names))).join('')}</div>`;
    lastDiagram = null;
    if (synced?.lines.length) {
      karaoke.render(synced.lines, tl, settings, lyricsOffset);
      paintSyncBadge();
      panelSource.textContent = synced.source === 'LRCLIB' ? 'testo: LRCLIB' : 'testo: tuo';
    } else {
      lyricsBody.innerHTML = `<div class="panel-empty">${synced === null ? 'Caricamento del testo…' : 'Testo sincronizzato non disponibile.<br>Puoi incollarne uno da <b>Sincronia → Incolla il tuo testo</b>, oppure usare la scheda Accordi.'}</div>`;
      panelSource.textContent = '';
    }
    sheet.render(tl, settings, plainLyrics);
  }

  root.querySelectorAll('.panel-tab').forEach((b) => b.addEventListener('click', () => {
    panelTab = b.dataset.tab;
    store.set('panelTab', panelTab);
    renderPanel();
    karaoke.cur = -2;
    sheet.curBar = -2;
    lastIdx = -2;
  }));

  // Nome che suona dopo trasposizione e parte scelta (prima del capotasto).
  const playedName = (n) => arrangeName(transposeChord(n, prefs.transpose), prefs.arrangement);
  // Le diteggiature del brano valgono solo per gli accordi originali, senza capotasto.
  const customShapes = () => (capo || prefs.transpose || prefs.arrangement === 'power' || prefs.arrangement === 'easy' ? null : song.shapes ?? null);

  function rebuild() {
    tl = buildTimeline(song, { offset, sync });
    // trasposizione → parte → capotasto: si mostrano le forme da suonare, ev.sounding è ciò che suona
    tl.events.forEach((ev) => {
      ev.sounding = playedName(ev.name);
      ev.name = capo ? shapeNameWithCapo(ev.sounding, capo) : ev.sounding;
    });
    if (prefs.strum) { tl.strum = prefs.strum; tl.bars.forEach((b) => { b.strum = prefs.strum; }); }
    fretboard.capo = capo;
    fretboard.arrangement = prefs.arrangement;
    fretboard.customShapes = customShapes();
    fretboard.lastNote = -1;
    if (prefs.arrangement === 'midi' && midi) tl.notes = midiNotes();
    if (prefs.arrangement === 'arpeggio') tl.notes = buildArpeggio(tl, (n) => shapeForArrangement(n, 'rhythm', customShapes()), prefs.picking ?? pickingFor(song));
    const tags = [];
    if (prefs.transpose) tags.push(`${prefs.transpose > 0 ? '+' : '−'}${Math.abs(prefs.transpose)} st`);
    if (capo) tags.push(`capo ${capo}`);
    if (prefs.arrangement !== 'rhythm') tags.push(ARRANGEMENTS.find((a) => a.id === prefs.arrangement)?.label.toLowerCase());
    const badge = root.querySelector('.capo-badge');
    if (badge) { badge.hidden = !tags.length; badge.textContent = tags.join(' · '); }
    const cl = root.querySelector('.capo-label');
    if (cl) cl.textContent = [prefs.transpose ? `${prefs.transpose > 0 ? '+' : '−'}${Math.abs(prefs.transpose)}` : '', capo ? `Capo ${capo}` : ''].filter(Boolean).join(' · ') || 'Tonalità';
    root.querySelector('[data-act="capo"]')?.classList.toggle('active', !!capo || !!prefs.transpose);
    const pl = root.querySelector('.part-label');
    if (pl) pl.textContent = ARRANGEMENTS.find((a) => a.id === prefs.arrangement)?.label ?? 'Ritmica';
    root.querySelector('[data-act="part"]')?.classList.toggle('active', prefs.arrangement !== 'rhythm');
    renderPanel();
    drawScrubSections();
    paintLoop();
    beatsEl.replaceChildren(...Array.from({ length: tl.bpb }, (_, i) => {
      const d = document.createElement('span');
      d.className = 'beat' + (i === 0 ? ' downbeat' : '');
      return d;
    }));
    paintStrumSlots(tl.notes ? '' : tl.strum ?? '');
  }

  // Pattern della pennata nell'HUD: cambia con la sezione (strofa, ritornello…)
  let hudPattern = null;
  function paintStrumSlots(pattern) {
    const pat = (pattern ?? '').replace(/\s+/g, '');
    if (pat === hudPattern) return;
    hudPattern = pat;
    strumEl.replaceChildren(...[...pat].map((ch) => {
      const s = document.createElement('span');
      s.className = 'strum-slot' + (pat.length > 8 ? ' fine' : '');
      s.textContent = { D: '↓', U: '↑', X: '✕', P: '⇣', B: '●' }[ch] ?? '·';
      return s;
    }));
  }

  async function loadLyrics() {
    synced = null;
    const res = await loadSyncedLyrics(song);
    if (destroyed) return;
    synced = res ?? { lines: [], source: null };
    renderPanel();
  }

  // ---------- Orologio: YouTube o interno ----------
  const onState = (playing) => {
    if (playing) wake.on(); else wake.off();
    playBtn.innerHTML = icon(playing ? 'pause' : 'play', 26);
    playBtn.classList.toggle('playing', playing);
  };
  rebuild();
  loadLyrics();
  // Si parte subito con l'orologio interno: la schermata è utilizzabile da subito; la sorgente audio
  // (file dell'utente o video YouTube) si aggancia appena è pronta, senza perdere posizione e velocità.
  const freeClock = () => new FreeClock(Math.max(tl.end, 150) + 4, { onStateChange: onState });
  clock = new SwitchClock(freeClock());
  // compact: nessun video da mostrare, il riquadro diventa una riga (niente spazio sprecato)
  function showVideoMsg(text, { actions = true, compact = actions } = {}) {
    videoMsg.hidden = false;
    $('.video-wrap').classList.toggle('msg-only', compact);
    videoMsg.innerHTML = `<div>${icon('guitar', 36)}</div><p></p>${actions ? `<div class="tr-actions vm-actions">
      <button type="button" class="chip-btn primary" data-act="source">${icon('mic', 14)} Scegli la sorgente audio</button></div>` : ''}`;
    videoMsg.querySelector('p').textContent = text;
  }
  function videoFailed(err) {
    if (destroyed) return;
    if (clock.kind === 'youtube') clock.use(freeClock());
    $('.video')?.replaceChildren();
    // YouTube non va: si prova da soli il brano su Spotify, poi si propone un'altra sorgente
    lastYtErr = err.message;
    if (!triedSpotify) { triedSpotify = true; attachSpotify(sourceToken, `${err.message}: ascolti il brano da Spotify`); return; }
    showVideoMsg(`${err.message}. Puoi usare Spotify, un tuo file audio o un altro video; intanto accordi, testo, metronomo e Base funzionano.`);
  }
  let triedSpotify = false;
  let lastYtErr = '';
  const ytNote = () => (lastYtErr ? `Video: ${lastYtErr.toLowerCase()}. ` : '');
  function videoBox(cls = '') {
    let box = $('.video');
    if (!box) { box = document.createElement('div'); $('.video-wrap').prepend(box); }
    box.className = `video ${cls}`.trim();
    const target = document.createElement('div');
    box.replaceChildren(target);
    return target;
  }
  // ID Spotify del brano: scelto dall'utente, nel brano, già trovato prima, oppure cercato adesso
  async function spotifyTrack() {
    if (prefs.spotifyId) return prefs.spotifyId;
    if (song.spotifyId) return song.spotifyId;
    const cached = store.get(key('spotify'), undefined);
    if (cached !== undefined && Date.now() - (cached?.at ?? 0) < 7 * 864e5) return cached?.id ?? null;
    try {
      const r = await findSpotify(song, song.lyricsSource?.duration ?? 0);
      store.set(key('spotify'), { id: r?.spotifyId ?? null, at: Date.now() });
      return r?.spotifyId ?? null;
    } catch { return null; }
  }
  async function attachSpotify(token, note) {
    showVideoMsg('Cerco il brano su Spotify…', { actions: false });
    const id = await spotifyTrack();
    if (destroyed || token !== sourceToken) return false;
    if (!id) {
      showVideoMsg(`${ytNote()}Su Spotify il brano non è stato trovato: puoi incollarne il link o usare un tuo file audio (Scegli la sorgente audio). Accordi, testo e Base funzionano comunque.`);
      return false;
    }
    const target = videoBox('spotify');
    try {
      const sp = await SpotifyClock.create(target, id, {
        onStateChange: onState,
        onPreview: () => toast('Spotify fa sentire solo 30 s: entra in Spotify in questo browser (va bene anche l\'account gratuito) per il brano intero'),
      });
      if (destroyed || token !== sourceToken) { sp.destroy(); return false; }
      clock.use(sp);
      videoMsg.hidden = true;
      $('.video-wrap').classList.remove('msg-only');
      if (note) toast(note);
      paintSpeed?.();
      return true;
    } catch (err) {
      if (token === sourceToken) showVideoMsg(`${ytNote()}${err.message}. Puoi usare un tuo file audio o un altro video; accordi, testo e Base funzionano comunque.`);
      return false;
    }
  }
  let sourceToken = 0;
  async function attachSource() {
    const token = ++sourceToken;
    const own = ['youtube', 'spotify'].includes(prefs.source) ? null : await getAudio(song.id);
    if (destroyed || token !== sourceToken) return;
    if (own?.blob && prefs.source !== 'none') {
      try {
        const a = await AudioClock.load(URL.createObjectURL(own.blob), { onStateChange: onState });
        if (destroyed || token !== sourceToken) { a.destroy(); return; }
        clock.use(a);
        $('.video')?.replaceChildren();
        showVideoMsg(`Audio: ${own.name}`, { actions: false, compact: true });
        videoMsg.classList.add('audio-mode');
        paintSpeed?.();
        return;
      } catch (err) { showVideoMsg(err.message); }
    }
    videoMsg.classList.remove('audio-mode');
    if (prefs.source === 'none') { showVideoMsg('Senza audio: metronomo e Base'); return; }
    if (prefs.source === 'spotify' || (!prefs.source && settings.source === 'spotify')) {
      triedSpotify = true;
      if (await attachSpotify(token)) return;
      if (destroyed || token !== sourceToken || prefs.source === 'spotify') return;
    }
    const vid = prefs.youtubeId || song.youtubeId;
    if (!vid) { triedSpotify = true; await attachSpotify(token, 'Nessun video per questo brano: ascolti da Spotify'); return; }
    if (location.protocol === 'file:') { videoFailed(new Error('Aperta come file, YouTube non funziona: avvia l\'app con avvia.bat / avvia.command')); return; }
    const target = videoBox();
    showVideoMsg('Caricamento del video…', { actions: false });
    try {
      const yt = await YouTubeClock.create(target, vid, { onStateChange: onState, onError: videoFailed });
      if (destroyed || token !== sourceToken) { yt.destroy(); return; }
      clock.use(yt);
      videoMsg.hidden = true;
      $('.video-wrap').classList.remove('msg-only');
      paintSpeed?.();
    } catch (err) {
      if (token === sourceToken) videoFailed(err);
    }
  }
  attachSource();
  // altezza dei comandi: le schede del pannello si fermano subito sotto (telefono)
  const transportEl = $('.transport');
  const tpObs = new ResizeObserver(() => root.querySelector('.player')?.style.setProperty('--tp-h', `${transportEl.offsetHeight}px`));
  tpObs.observe(transportEl);

  const speedBox = $('.speed-pills');
  // poche velocità a portata di dito; con − e + si passa a quelle intermedie della sorgente attuale
  const allRates = () => [...new Set(clock.rates())].filter((r) => r >= 0.25 && r <= 1.5).sort((x, y) => x - y);
  const rates = [0.5, 0.75, 1, 1.25];
  const fmtRate = (r) => `${String(Math.round(r * 100) / 100).replace('.', ',')}×`;
  function paintSpeed() {
    if (destroyed) return; // può arrivare da un timer dopo l'uscita dal brano
    const cur = clock.getRate();
    $('.speed-val').textContent = fmtRate(cur);
    $('[data-pop="speed"]').classList.toggle('active', Math.abs(cur - 1) > 0.001);
    speedBox.querySelectorAll('button').forEach((b) => b.classList.toggle('active', Math.abs(Number(b.dataset.rate) - cur) < 0.001));
  }
  function setSpeed(r, close = true) {
    if (clock.kind === 'spotify' && Math.abs(r - 1) > 0.001) {
      toast('Spotify non permette di rallentare: per studiare lento usa il video YouTube o un tuo file audio (⋯ → Audio)');
      return;
    }
    clock.setRate(r);
    prefs.rate = r;
    savePrefs();
    if (close) togglePop(null);
    setTimeout(paintSpeed, 150);
  }
  for (const r of rates) {
    const b = document.createElement('button');
    b.className = 'seg';
    b.dataset.rate = r;
    b.textContent = fmtRate(r);
    b.addEventListener('click', () => setSpeed(r));
    speedBox.append(b);
  }
  root.querySelectorAll('[data-speedstep]').forEach((b) => b.addEventListener('click', () => {
    const cur = clock.getRate();
    const dir = Number(b.dataset.speedstep);
    const list = allRates();
    const next = dir > 0 ? list.find((r) => r > cur + 0.001) : [...list].reverse().find((r) => r < cur - 0.001);
    if (next) { setSpeed(next, false); toast(`Velocità ${fmtRate(next)}`); }
  }));
  if (prefs.rate !== 1 && allRates().includes(prefs.rate)) clock.setRate(prefs.rate);
  setTimeout(paintSpeed, 150);
  paintSpeed();
  drawScrubSections();
  // loop salvato l'ultima volta: torna pronto ma spento (L o ⟲ per attivarlo)
  if (prefs.loop && prefs.loop.b > prefs.loop.a) { loop = { on: false, ...prefs.loop }; paintLoop(); }

  // ---------- Loop ----------
  function setLoop(a, b, label = '') {
    loop = { on: true, a: Math.max(0, a), b, label };
    paintLoop();
    seek(loop.a);
    clock.play();
  }

  function paintLoop() {
    const dur = totalDuration();
    const valid = loop.a != null && loop.b != null && loop.b > loop.a;
    const saved = valid ? { a: loop.a, b: loop.b, label: loop.label } : null;
    if (clock && JSON.stringify(saved) !== JSON.stringify(prefs.loop ?? null) && (valid || loop.a == null)) { prefs.loop = saved; savePrefs(); }
    scrubLoop.hidden = !valid;
    if (valid) {
      scrubLoop.style.left = `${(loop.a / dur) * 100}%`;
      scrubLoop.style.width = `${((loop.b - loop.a) / dur) * 100}%`;
      scrubLoop.classList.toggle('off', !loop.on);
    }
    $('[data-act="loopToggle"]').classList.toggle('active', loop.on && valid);
    $('[data-pop="loop"]').classList.toggle('active', loop.on && valid);
    $('[data-act="loopA"]').classList.toggle('active', loop.a != null);
    $('[data-act="loopB"]').classList.toggle('active', loop.b != null);
    loopLabel.textContent = valid
      ? `Loop ${loop.label || `${fmt(loop.a)}–${fmt(loop.b)}`}${loop.on ? '' : ' (off)'}`
      : loop.a != null ? `A ${fmt(loop.a)}` : '';
  }

  function totalDuration() {
    return Math.max(clock?.duration() || 0, tl.end + 1);
  }

  function drawScrubSections() {
    const dur = totalDuration();
    $('.scrub-sections').replaceChildren(...tl.sections.map((s, i) => {
      const d = document.createElement('div');
      d.className = 'scrub-sec' + (i % 2 ? ' alt' : '');
      d.style.left = `${(s.start / dur) * 100}%`;
      d.style.width = `${((s.end - s.start) / dur) * 100}%`;
      d.title = s.name;
      d.textContent = s.name;
      return d;
    }));
    // riga delle sezioni: chip scorrevoli in orizzontale, la corrente evidenziata
    $('.sec-strip').innerHTML = tl.sections.map((s, i) =>
      `<button type="button" class="sec-chip${study.learned.includes(i) ? ' learned' : ''}" data-sec="${i}"><span class="sec-name"></span><span class="sec-loop" data-secloop="${i}" role="button" title="Ripeti in loop questa sezione" aria-label="Loop">${icon('loop', 13)}</span></button>`).join('');
    root.querySelectorAll('.sec-chip .sec-name').forEach((el, i) => { el.textContent = tl.sections[i].name; });
    curSec = -2;
  }
  function paintSection(t) {
    const i = sectionIndexAt(t);
    if (i === curSec) return;
    curSec = i;
    const chips = root.querySelectorAll('.sec-chip');
    chips.forEach((c, k) => c.classList.toggle('active', k === i));
    const c = chips[i];
    const strip = $('.sec-strip');
    if (c && strip.scrollWidth > strip.clientWidth) strip.scrollTo({ left: c.offsetLeft - strip.clientWidth / 2 + c.offsetWidth / 2, behavior: 'smooth' });
  }
  $('.sec-strip').addEventListener('click', (e) => {
    const lp = e.target.closest('[data-secloop]');
    if (lp) { const sec = tl.sections[Number(lp.dataset.secloop)]; setLoop(sec.start, sec.end, sec.name); return; }
    const b = e.target.closest('[data-sec]');
    if (!b) return;
    const k = Number(b.dataset.sec);
    if (study.on) { startStudySection(k); return; }
    seek(tl.sections[k].start);
  });

  function seek(t) {
    clock.seek(Math.max(0, t));
    lastSeekAt = performance.now();
  }

  scrub.addEventListener('pointerdown', (e) => {
    const r = scrub.getBoundingClientRect();
    const move = (ev) => seek(((ev.clientX - r.left) / r.width) * totalDuration());
    move(e);
    scrub.setPointerCapture(e.pointerId);
    scrub.onpointermove = move;
    scrub.onpointerup = () => { scrub.onpointermove = null; };
  });

  // ---------- Registrazione dei tempi (tap) ----------
  const recEl = $('.recorder');
  const recInfo = $('.rec-info');

  function startRecorder() {
    recorder = { times: [] };
    recEl.hidden = false;
    paintRecorder();
    seek(Math.max(0, (tl.events[0]?.start ?? 0) - 4));
    clock.play();
  }

  function paintRecorder() {
    if (!recorder) return;
    const i = recorder.times.length;
    const ev = tl.events[i];
    recInfo.innerHTML = ev
      ? `Tocca <b>TAP</b> (o <kbd>T</kbd>) quando arriva <b class="rec-chord"></b>
         <span class="muted">· cambio ${i + 1}/${tl.events.length} · ${tl.sections[ev.section].name}</span>`
      : 'Tutti i cambi registrati! Premi <b>Fine</b> per salvarli o <b>Esporta JSON</b>.';
    const c = recInfo.querySelector('.rec-chord');
    if (c) { c.textContent = displayChord(ev.name, settings.notation); c.style.color = chordColor(ev.name); }
  }

  function tap() {
    if (!recorder || recorder.times.length >= tl.events.length) return;
    recorder.times.push(Number((clock.getTime() - offset).toFixed(3)));
    applyRecorded();
    paintRecorder();
  }

  function applyRecorded() {
    sync = recorder.times.length ? [...recorder.times] : (store.get(key('sync'), null) ?? song.sync ?? null);
    rebuild();
  }

  function exportJson() {
    const times = recorder?.times.length ? recorder.times : sync;
    const out = { ...song, sync: times ?? undefined };
    delete out.file;
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${song.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    navigator.clipboard?.writeText(JSON.stringify({ id: song.id, sync: times })).catch(() => {});
  }

  recEl.addEventListener('click', (e) => {
    const act = e.target.closest('[data-rec]')?.dataset.rec;
    if (act === 'undo') { recorder.times.pop(); applyRecorded(); paintRecorder(); }
    if (act === 'restart') { recorder.times = []; applyRecorded(); startRecorder(); }
    if (act === 'export') exportJson();
    if (act === 'done') {
      if (recorder.times.length) store.set(key('sync'), recorder.times);
      recorder = null;
      recEl.hidden = true;
    }
  });
  $('.rec-tap').addEventListener('pointerdown', (e) => { e.preventDefault(); tap(); });

  // ---------- Avvisi, conteggio d'attacco, velocità progressiva ----------
  let toastTimer = 0;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    toastEl.classList.remove('show');
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 1600);
  }

  function togglePlay() {
    if (counting) { cancelCountIn(); return; }
    if (clock.playing || !settings.countIn) { clock.toggle(); return; }
    // una battuta di click prima di partire, al tempo (rallentato) del brano
    const beat = tl.beatDur / clock.getRate();
    let n = 0;
    const tick = () => {
      if (n >= tl.bpb) { cancelCountIn(); clock.play(); return; }
      countEl.hidden = false;
      countEl.textContent = String(n + 1);
      countEl.classList.remove('pop');
      void countEl.offsetWidth;
      countEl.classList.add('pop');
      click(n === 0);
      n++;
      counting = setTimeout(tick, beat * 1000);
    };
    counting = setTimeout(tick, 0);
  }

  function cancelCountIn() {
    clearTimeout(counting);
    counting = null;
    countEl.hidden = true;
  }

  function sortedRates() {
    return allRates().filter((r) => r >= 0.5 && r <= 1);
  }

  function onLoopWrap() {
    if (!ramp) return;
    const cur = clock.getRate();
    recordRate(song.id, cur);
    const next = sortedRates().find((r) => r > cur + 0.001);
    if (next) {
      clock.setRate(next);
      setTimeout(paintSpeed, 150);
      toast(`Velocità ${fmtRate(next)}`);
    } else if (study.on) {
      // sezione suonata a velocità piena: imparata, si passa alla successiva
      const k = study.section;
      if (!study.learned.includes(k)) study.learned.push(k);
      store.set(key('study'), { learned: study.learned, total: tl.sections.length });
      drawScrubSections();
      const nextSec = tl.sections.findIndex((_, i) => i > k && !study.learned.includes(i));
      if (nextSec >= 0) { toast(`«${tl.sections[k].name}» imparata! Ora: ${tl.sections[nextSec].name}`); startStudySection(nextSec); }
      else { toast('Hai imparato tutte le sezioni: ora suonalo tutto di fila!'); stopStudy(); }
    } else toast('Velocità piena: ottimo lavoro!');
  }

  // ---------- Studio guidato ----------
  function startStudySection(k) {
    study.on = true;
    study.section = k;
    const sec = tl.sections[k];
    loop = { on: true, a: Math.max(0, sec.start - 0.2), b: sec.end, label: sec.name };
    ramp = true;
    $('[data-act="ramp"]').classList.add('active');
    $('[data-act="study"]').classList.add('active');
    const first = sortedRates()[0];
    clock.setRate(first);
    setTimeout(paintSpeed, 150);
    paintLoop();
    seek(loop.a);
    clock.play();
  }
  function stopStudy() {
    study.on = false;
    $('[data-act="study"]').classList.remove('active');
    if (ramp) toggleRamp();
  }
  function toggleStudy() {
    if (study.on) { stopStudy(); toast('Studio guidato fermato'); return; }
    const k = Math.max(0, tl.sections.findIndex((_, i) => !study.learned.includes(i)));
    togglePop(null);
    startStudySection(k);
    toast(`Studio guidato: «${tl.sections[k].name}» in loop, dal ${fmtRate(sortedRates()[0])} alla velocità piena`);
  }

  function toggleRamp() {
    ramp = !ramp;
    $('[data-act="ramp"]').classList.toggle('active', ramp);
    if (!ramp) return;
    if (loop.a == null || loop.b == null) {
      const sec = tl.sections[Math.max(0, sectionIndexAt(clock.getTime()))];
      setLoop(sec.start, sec.end, sec.name);
    }
    const first = sortedRates()[0];
    clock.setRate(first);
    setTimeout(paintSpeed, 150);
    seek(loop.a);
    toast(`Velocità progressiva: si parte dal ${Math.round(first * 100)}%`);
  }

  function sectionIndexAt(t) {
    let i = -1;
    tl.sections.forEach((s, k) => { if (s.start <= t) i = k; });
    return i;
  }

  function openCapo() {
    const dlg = $('.dlg-capo');
    const origNames = buildTimeline(song).events.map((e) => e.name);
    const easiest = suggestTranspose(origNames.map((n) => arrangeName(n, prefs.arrangement)));
    const paint = () => {
      const soundingNames = origNames.map(playedName);
      const uniq = [...new Set(soundingNames)];
      const sug = suggestCapo(soundingNames, customShapes());
      const tr = prefs.transpose;
      dlg.querySelector('.out-tr').textContent = tr ? `${tr > 0 ? '+' : '−'}${Math.abs(tr)}` : '0';
      const key = song.key ? displayChord(transposeChord(song.key, tr), settings.notation) : '';
      dlg.querySelector('.tr-desc').textContent = tr
        ? `${Math.abs(tr)} semitoni ${tr > 0 ? 'sopra' : 'sotto'}${key ? ` · tonalità ${key}` : ''}`
        : `Tonalità originale${key ? ` (${key})` : ''}`;
      const acts = [];
      if (tr) acts.push('<button type="button" class="chip-btn" data-trset="0">Torna all\'originale</button>');
      // senza capotasto: si porta il brano alla tonalità che suona uguale con le forme "a capo"
      if ((song.capo ?? 0) > 0 && tr !== song.capo) {
        acts.push(`<button type="button" class="chip-btn" data-trset="${song.capo}" data-capoto="0">Suonala senza capotasto (+${song.capo})</button>`);
      }
      if (easiest.semitones !== tr && easiest.semitones !== 0) {
        acts.push(`<button type="button" class="chip-btn" data-trset="${easiest.semitones}" data-capoto="0">Tonalità più facile senza capotasto (${easiest.semitones > 0 ? '+' : '−'}${Math.abs(easiest.semitones)})</button>`);
      }
      dlg.querySelector('.tr-actions').innerHTML = acts.join('');
      dlg.querySelector('.tr-warn').hidden = !tr || !song.youtubeId;
      dlg.querySelector('.capo-grid').innerHTML = Array.from({ length: 8 }, (_, c) =>
        `<button type="button" class="seg${c === capo ? ' active' : ''}" data-capo="${c}">${c ? c + '°' : 'No'}</button>`).join('');
      dlg.querySelector('.capo-suggest').innerHTML = sug.capo
        ? `Suggerito: <b>capotasto al ${sug.capo}° tasto</b> (accordi più facili). <button type="button" class="chip-btn" data-capo="${sug.capo}">Usa il suggerito</button>`
        : 'Suggerito: <b>nessun capotasto</b>, le forme attuali sono già le più comode.';
      dlg.querySelector('.capo-preview').innerHTML = uniq.map((n) =>
        `<span class="chip" style="--chip:${chordColor(n)}">${displayChord(capo ? shapeNameWithCapo(n, capo) : n, settings.notation)}</span>`).join('');
    };
    paint();
    dlg.onclick = (e) => {
      const b = e.target.closest('[data-capo], [data-tr], [data-trset]');
      if (!b) return;
      if (b.dataset.tr) prefs.transpose = Math.max(-6, Math.min(6, prefs.transpose + Number(b.dataset.tr)));
      if (b.dataset.trset != null) prefs.transpose = Number(b.dataset.trset);
      const c = b.dataset.capo ?? b.dataset.capoto;
      if (c != null) { capo = Number(c); store.set(key('capo'), capo); }
      savePrefs();
      rebuild();
      lastIdx = -2;
      paint();
    };
    dlg.showModal();
  }

  const STRUM_PRESETS = [
    { id: null, label: 'Del brano', p: null },
    { id: 'ballata', label: 'Ballata', p: 'D---D-DU' },
    { id: 'pop', label: 'Pop', p: 'D-DU-UDU' },
    { id: 'rock', label: 'Rock (crome)', p: 'DDDDDDDD' },
    { id: 'palm', label: 'Palm muting', p: 'PPPPPPPP' },
    { id: 'reggae', label: 'Levare', p: '--X---X-' },
    { id: 'funk', label: 'Stoppate', p: 'D-XUD-XU' },
    { id: 'lenta', label: 'Una per battito', p: 'D-D-D-D-' },
  ];
  // ---------- Parte vera da file MIDI ----------
  function midiTrackIndex() {
    const i = prefs.midi?.track;
    return midi && i != null && midi.tracks[i] ? i : midi ? guessGuitarTrack(midi.tracks) : -1;
  }
  function midiNotes() {
    const trk = midi.tracks[midiTrackIndex()];
    if (!trk) return null;
    const placed = placeMidi(trk.notes, tl, { shift: prefs.midi?.shift ?? 0, scale: prefs.midi?.scale ?? 1, transpose: prefs.transpose });
    const notes = fingerNotes(placed, { capo });
    return notes.length ? notes : null;
  }
  // Aggancio automatico: tutte le tracce insieme danno l'armonia, confrontata con gli accordi della griglia.
  function autoAlignMidi(announce) {
    if (!midi) return;
    const all = midi.tracks.flatMap((x) => x.notes);
    const r = alignMidi(all, tl, { transpose: prefs.transpose });
    prefs.midi = { ...prefs.midi, shift: r.shift, scale: r.scale, score: r.score, confidence: r.confidence };
    savePrefs();
    rebuild();
    lastIdx = -2;
    if (announce) toast(r.confidence >= 0.4 ? `Parte agganciata alle battute (affidabilità ${Math.round(r.confidence * 100)}%)` : 'Aggancio incerto: controlla con ◀ ▶ nella finestra Parte');
  }
  // Traccia da studiare: la chitarra se c'è, altrimenti quella (non basso) che suona meglio gli accordi del brano.
  function bestTrack(tracks) {
    const g = guessGuitarTrack(tracks);
    if (tracks[g] && (tracks[g].program >= 24 && tracks[g].program <= 31 || /guit|chitarr|gtr/i.test(tracks[g].name))) return g;
    let best = g;
    let bestScore = -1;
    tracks.forEach((t, i) => {
      if (t.notes.length < 20 || /bass|basso/i.test(t.name) || (t.program >= 32 && t.program <= 39)) return;
      const pitches = t.notes.map((n) => n.pitch).sort((a, b) => a - b);
      if (pitches[pitches.length >> 1] < 45) return;
      const r = alignMidi(t.notes, tl, { transpose: prefs.transpose });
      if (r.score > bestScore) { bestScore = r.score; best = i; }
    });
    return best;
  }
  // Ricerca automatica su BitMidi: si scaricano i candidati e si tiene quello che suona gli accordi del brano.
  let midiSearch = { state: 'idle', cands: [], msg: '' };
  async function findMidiOnline(repaint) {
    midiSearch = { state: 'searching', cands: [], msg: 'Cerco su BitMidi…' };
    repaint();
    try {
      const list = await searchMidi(song, { limit: 6 });
      if (!list.length) { midiSearch = { state: 'done', cands: [], msg: 'Nessun file MIDI trovato per questo brano. Puoi caricarne uno tuo o cercare la tablatura su Songsterr.' }; repaint(); return; }
      const songBeats = tl.bars.length * tl.bpb;
      for (const c of list) {
        midiSearch.msg = `Provo ${c.name}…`;
        repaint();
        try {
          c.bytes = await downloadMidi(c);
          const parsed = parseMidi(c.bytes);
          const all = parsed.tracks.flatMap((x) => x.notes);
          if (all.length < 30) continue;
          const r = alignMidi(all, tl, { transpose: prefs.transpose });
          const span = (Math.max(...all.map((n) => n.b + n.bd)) - Math.min(...all.map((n) => n.b))) * r.scale;
          c.align = r;
          c.cover = Math.min(1, span / songBeats);
          c.quality = r.score * (0.5 + r.confidence) * (0.4 + 0.6 * c.cover) + c.score * 0.1;
          midiSearch.cands.push(c);
        } catch { /* file rovinato o non scaricabile: si passa al prossimo */ }
      }
      midiSearch.cands.sort((a, b) => b.quality - a.quality);
      const top = midiSearch.cands[0];
      if (top && top.align.confidence >= 0.35 && top.align.score >= 0.4 && top.cover >= 0.4) {
        await useMidiCandidate(top);
        midiSearch = { state: 'done', cands: midiSearch.cands, msg: `Trovata e agganciata: ${top.name}. Se non ti convince prova le altre versioni qui sotto.` };
      } else {
        midiSearch = { state: 'done', cands: midiSearch.cands, msg: midiSearch.cands.length
          ? 'Ho trovato dei file, ma nessuno combacia bene con gli accordi del brano: provali qui sotto.'
          : 'I file trovati non sono leggibili. Puoi caricarne uno tuo.' };
      }
    } catch (err) {
      midiSearch = { state: 'done', cands: [], msg: `Ricerca non riuscita: ${err.message}` };
    }
    repaint();
  }
  async function useMidiCandidate(c) {
    const file = new File([c.bytes], c.name, { type: 'audio/midi' });
    await loadMidiFile(file);
  }
  async function loadMidiFile(file) {
    try {
      const parsed = parseMidi(await file.arrayBuffer());
      if (!parsed.tracks.length) throw new Error('nessuna nota');
      await saveMidi(song.id, file);
      midi = { name: file.name, ...parsed };
      prefs.midi = { track: bestTrack(parsed.tracks) };
      prefs.arrangement = 'midi';
      autoAlignMidi(true);
    } catch (err) {
      toast(`File MIDI non leggibile: ${err.message}`);
    }
  }
  function paintMidiBlock(box) {
    const online = `<div class="tr-actions">
        <button type="button" class="chip-btn${midi ? '' : ' primary'}" data-midi="find"${midiSearch.state === 'searching' ? ' disabled' : ''}>${icon('search', 16)} ${midi ? 'Cerca altre versioni online' : 'Trova la parte online'}</button>
        <a class="chip-btn" href="${songsterrUrl(song)}" target="_blank" rel="noopener">Tablatura su Songsterr</a></div>
      ${midiSearch.msg ? `<p class="hint midi-status">${esc(midiSearch.msg)}</p>` : ''}
      ${midiSearch.cands.length ? `<div class="midi-cands">${midiSearch.cands.map((c, i) => `<div class="midi-cand"><span>${esc(c.name)}</span>
        <b class="${c.align.confidence >= 0.35 ? 'ok' : ''}">${Math.round(c.align.score * 100)}%</b>
        <button type="button" class="seg" data-midicand="${i}">${midi?.name === c.name ? 'In uso' : 'Usa'}</button></div>`).join('')}</div>` : ''}`;
    if (!midi) {
      box.innerHTML = `<div class="dlg-sub">Parte vera del brano</div>
        <p class="hint">Le note esatte da suonare, da un file MIDI: l'app lo cerca da sola online (BitMidi, gratuito) e tiene la versione
        che suona davvero gli accordi del brano, oppure ne carichi uno tuo (Guitar Pro, TuxGuitar, MuseScore…). Le note si agganciano
        alle battute e ne seguono il tempo.</p>${online}
        <label class="chip-btn">${icon('guitar', 16)} Carica un file MIDI…<input type="file" accept=".mid,.midi,audio/midi,audio/x-midi" class="midi-file" hidden></label>`;
      return;
    }
    const cur = midiTrackIndex();
    const m = prefs.midi ?? {};
    const sh = m.shift ?? 0;
    const at = `battuta ${Math.floor(sh / tl.bpb) + 1}${((sh % tl.bpb) + tl.bpb) % tl.bpb ? `, battito ${(((sh % tl.bpb) + tl.bpb) % tl.bpb) + 1}` : ''}`;
    box.innerHTML = `<div class="dlg-sub">Parte vera: ${esc(midi.name)}</div>
      <label class="field">Traccia <select class="midi-track">${midi.tracks.map((t, i) =>
        `<option value="${i}"${i === cur ? ' selected' : ''}>${esc(t.name || `Traccia ${i + 1}`)} · ${esc(programName(t.program))} · ${t.notes.length} note</option>`).join('')}</select></label>
      <p class="hint midi-info">Il file inizia alla ${at}${m.scale && m.scale !== 1 ? ` (tempo ${m.scale > 1 ? 'dimezzato' : 'doppio'} nel file)` : ''}${m.confidence != null ? ` · aggancio ${Math.round(m.confidence * 100)}%` : ''}.</p>
      <div class="cd-row"><button type="button" class="seg" data-midi="earlier" title="Un battito prima">◀ battito</button>
        <button type="button" class="seg" data-midi="later" title="Un battito dopo">battito ▶</button>
        <button type="button" class="seg" data-midi="align">Aggancia di nuovo</button>
        <button type="button" class="seg" data-midi="remove">Rimuovi</button>
        <label class="seg">Altro file…<input type="file" accept=".mid,.midi,audio/midi,audio/x-midi" class="midi-file" hidden></label></div>${online}`;
  }
  getMidi(song.id).then(async (rec) => {
    if (!rec?.blob || destroyed) return;
    try {
      midi = { name: rec.name, ...parseMidi(await rec.blob.arrayBuffer()) };
      if (prefs.arrangement === 'midi') { rebuild(); lastIdx = -2; }
    } catch { /* file rovinato: si ignora */ }
  });

  function openPart() {
    const dlg = $('.dlg-part');
    const paint = () => {
      dlg.querySelector('.part-list').innerHTML = ARRANGEMENTS.filter((a) => a.id !== 'midi' || midi).map((a) =>
        `<button type="button" class="option${a.id === prefs.arrangement ? ' active' : ''}" data-part="${a.id}"><b>${a.label}</b><span>${a.desc}</span></button>`).join('');
      // stile: dita per l'arpeggio, pennata per le altre parti
      const style = dlg.querySelector('.part-style');
      paintMidiBlock(dlg.querySelector('.part-midi'));
      if (prefs.arrangement === 'midi') {
        style.innerHTML = '';
      } else if (prefs.arrangement === 'arpeggio') {
        const cur = prefs.picking ?? pickingFor(song);
        style.innerHTML = `<div class="dlg-sub">Stile dell'arpeggio</div><div class="cd-row">${Object.entries(PICKINGS).map(([id, p]) =>
          `<button type="button" class="seg${id === cur ? ' active' : ''}" data-pick="${id}">${p.label}</button>`).join('')}</div>`;
      } else {
        const src = song.strumSource === 'ultimate-guitar' ? 'trascritta per questo brano' : 'stimata dal tempo e dal genere';
        style.innerHTML = `<div class="dlg-sub">Pennata</div><p class="hint">Del brano: ${src}${tl.bars.some((b) => b.strum && b.strum !== tl.strum) ? ', cambia fra strofa e ritornello' : ''}.</p>
          <div class="cd-row">${STRUM_PRESETS.map((x) => `<button type="button" class="seg${(prefs.strum ?? null) === x.p ? ' active' : ''}" data-strum="${x.id ?? ''}">${x.label}</button>`).join('')}</div>`;
      }
    };
    paint();
    dlg.onchange = async (e) => {
      if (e.target.matches('.midi-file') && e.target.files[0]) {
        await loadMidiFile(e.target.files[0]);
        e.target.value = '';
        paint();
      } else if (e.target.matches('.midi-track')) {
        prefs.midi = { ...prefs.midi, track: Number(e.target.value) };
        autoAlignMidi(false);
        paint();
      }
    };
    dlg.onclick = async (e) => {
      const mact = e.target.closest('[data-midi]')?.dataset.midi;
      if (mact === 'remove') {
        await removeMidi(song.id);
        midi = null;
        delete prefs.midi;
        if (prefs.arrangement === 'midi') prefs.arrangement = 'rhythm';
        savePrefs(); rebuild(); lastIdx = -2; paint();
        return;
      }
      if (mact === 'align') { autoAlignMidi(true); paint(); return; }
      if (mact === 'find') { findMidiOnline(paint); return; }
      const ci = e.target.closest('[data-midicand]')?.dataset.midicand;
      if (ci != null) { await useMidiCandidate(midiSearch.cands[Number(ci)]); paint(); return; }
      if (mact === 'earlier' || mact === 'later') {
        prefs.midi = { ...prefs.midi, shift: (prefs.midi?.shift ?? 0) + (mact === 'later' ? 1 : -1) };
        savePrefs(); rebuild(); lastIdx = -2; paint();
        return;
      }
      const pk = e.target.closest('[data-pick]')?.dataset.pick;
      const st = e.target.closest('[data-strum]');
      if (pk || st) {
        if (pk) prefs.picking = pk;
        if (st) prefs.strum = STRUM_PRESETS.find((x) => (x.id ?? '') === st.dataset.strum)?.p ?? null;
        savePrefs(); rebuild(); lastIdx = -2; paint();
        return;
      }
      const b = e.target.closest('[data-part]');
      if (!b) return;
      prefs.arrangement = b.dataset.part;
      savePrefs();
      rebuild();
      lastIdx = -2;
      paint();
    };
    dlg.showModal();
  }

  // ---------- Vista: cosa tenere sullo schermo ----------
  const VIEWS = [
    { id: 'full', label: 'Completa', desc: 'Manico, video e testo con gli accordi.' },
    { id: 'stage', label: 'Manico e testo', desc: 'Nasconde il video: più spazio al manico.' },
    { id: 'videolyrics', label: 'Video e testo', desc: 'Nasconde il manico: video grande e testo scorrevole con gli accordi.' },
    { id: 'video', label: 'Solo video', desc: 'Solo il video con accordo attuale e prossimo.' },
    { id: 'lyrics', label: 'Solo testo', desc: 'Testo scorrevole con gli accordi, a tutto schermo. L\'audio del video continua.' },
  ];
  const stageHidden = () => ['videolyrics', 'video', 'lyrics'].includes(prefs.view);
  function applyView() {
    if (!VIEWS.some((v) => v.id === prefs.view)) prefs.view = 'full';
    const el = root.querySelector('.player');
    for (const v of VIEWS) el.classList.toggle(`view-${v.id}`, v.id === prefs.view);
    $('[data-act="view"]').classList.toggle('active', prefs.view !== 'full');
    lastIdx = -2;
    karaoke.cur = -2;
    requestAnimationFrame(() => fretboard.resize?.());
  }
  function openView() {
    const dlg = $('.dlg-view');
    const f = dlg.querySelector('form');
    f.viewDefault.checked = (settings.view ?? 'full') === prefs.view;
    const paint = () => {
      dlg.querySelector('.view-list').innerHTML = VIEWS.map((v) =>
        `<button type="button" class="option${v.id === prefs.view ? ' active' : ''}" data-view="${v.id}"><b>${v.label}</b><span>${v.desc}</span></button>`).join('');
    };
    paint();
    const saveDefault = () => {
      if (f.viewDefault.checked) { settings.view = prefs.view; delete settings.focus; saveSettings(settings); }
    };
    f.viewDefault.onchange = saveDefault;
    dlg.onclick = (e) => {
      const b = e.target.closest('[data-view]');
      if (!b) return;
      prefs.view = b.dataset.view;
      savePrefs();
      applyView();
      saveDefault();
      paint();
    };
    dlg.showModal();
  }

  // ---------- Stampa degli accordi (senza testo) ----------
  function printSheet() {
    const names = [...new Set(tl.events.map((e) => e.name))];
    const rows = tl.sections.map((sec) => {
      const bars = tl.bars.filter((b) => b.start >= sec.start - 1e-6 && b.start < sec.end - 1e-6);
      const cells = bars.map((b) => {
        const evs = tl.events.filter((ev) => ev.start < b.end - 1e-6 && ev.end > b.start + 1e-6);
        const shown = evs.filter((ev, i) => i === 0 ? ev.start >= b.start - 1e-6 : true);
        return `<td>${shown.length ? shown.map((ev) => esc(displayChord(ev.name, settings.notation))).join(' ') : '%'}</td>`;
      });
      const per = song.barsPerRow ?? 4;
      const lines = [];
      for (let i = 0; i < cells.length; i += per) lines.push(`<tr>${cells.slice(i, i + per).join('')}</tr>`);
      return `<h2>${esc(sec.name)}</h2><table>${lines.join('')}</table>`;
    }).join('');
    const tags = [
      song.key && `Tonalità ${esc(displayChord(transposeChord(song.key, prefs.transpose), settings.notation))}`,
      song.bpm && `${song.bpm} BPM`, song.timeSignature && song.timeSignature.join('/'),
      capo && `Capotasto al ${capo}° tasto`, prefs.transpose && `Trasposto di ${prefs.transpose > 0 ? '+' : ''}${prefs.transpose}`,
      prefs.arrangement !== 'rhythm' && `Parte: ${ARRANGEMENTS.find((a) => a.id === prefs.arrangement)?.label}`,
      tl.strum && `Pennata ${esc(tl.strum)}`,
    ].filter(Boolean).join(' · ');
    const w = window.open('', '_blank');
    if (!w) { toast('Consenti i popup per stampare'); return; }
    w.document.write(`<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(song.title)} · accordi</title>
      <style>body{font:14px system-ui,sans-serif;color:#111;margin:24px}h1{margin:0;font-size:24px}.meta{color:#555;margin:4px 0 16px}
      h2{font-size:14px;text-transform:uppercase;letter-spacing:.08em;margin:18px 0 6px;color:#444}
      table{border-collapse:collapse;width:100%}td{border:1px solid #bbb;padding:8px 10px;font-weight:700;font-size:16px;width:25%}
      .diagrams{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px;break-inside:avoid}.diagrams>*{width:110px}
      .diagrams svg{width:100%;height:auto}.diagrams *{color:#111!important}</style></head><body>
      <h1>${esc(song.title)}</h1><div class="meta">${esc(song.artist)}${tags ? ' · ' + tags : ''}</div>${rows}
      <div class="diagrams">${names.map((n) => chordDiagram(n, { ...settings, showNoteNames: false }, diagramShapes(names))).join('')}</div>
      <script>setTimeout(()=>print(),300)<\/script></body></html>`);
    w.document.close();
  }

  // ---------- Modalità ascolto: l'app sente cosa suoni ----------
  const scoreHud = $('.score-hud');
  function paintScore() {
    const acc = score.total ? Math.round((score.hits / score.total) * 100) : null;
    scoreHud.querySelector('.acc').textContent = acc == null ? 'In ascolto…' : `${acc}%`;
    scoreHud.querySelector('.streak').textContent = score.streak >= 2 ? `serie ×${score.streak}` : '';
  }

  async function toggleListen({ summary = false } = {}) {
    const btn = $('[data-act="listen"]');
    if (listener) {
      listener.stop();
      listener = null;
      btn.classList.remove('active');
      scoreHud.hidden = true;
      if (score.total >= 8) {
        const acc = score.hits / score.total;
        const prev = getStats(song.id).bestAccuracy ?? 0;
        recordAccuracy(song.id, acc);
        if (summary) showScore(acc, acc > prev);
        else toast(`Precisione ${Math.round(acc * 100)}%${acc > prev ? ' · nuovo record!' : ''} · serie migliore ×${score.bestStreak}`);
      }
      return;
    }
    const names = [...new Set(tl.events.map((e) => e.sounding ?? e.name))];
    listener = new Listener(({ chroma, level }) => {
      const t = clock.getTime();
      const idx = eventIndexAt(tl, t);
      const ev = tl.events[idx];
      if (!ev || !clock.playing) return;
      if (!judge || judge.idx !== idx) judge = { idx, frames: 0, hits: 0 };
      if (t - ev.start < 0.18 || level < 0.012) return; // transizione o silenzio
      const r = matchChord(chroma, ev.sounding ?? ev.name, names);
      judge.frames++;
      if (r.hit) judge.hits++;
      scoreHud.querySelector('.hear').textContent = r.best ? `senti: ${displayChord(r.best, settings.notation)}` : '';
    }, { input: ampIn });
    try {
      await listener.start();
    } catch {
      listener = null;
      toast('Serve il permesso del microfono');
      return;
    }
    score = { hits: 0, total: 0, streak: 0, bestStreak: 0 };
    judge = null;
    btn.classList.add('active');
    scoreHud.hidden = false;
    paintScore();
    toast(listener.rocksmith ? 'Ascolto dal cavo Rocksmith: suona insieme al brano' : 'Ascolto attivo: suona insieme al brano');
  }

  // Pagella di fine brano (stile Rocksmith): stelle, precisione, serie migliore.
  const starsFor = (acc) => (acc >= 0.9 ? 5 : acc >= 0.75 ? 4 : acc >= 0.6 ? 3 : acc >= 0.4 ? 2 : 1);
  function showScore(acc, record) {
    const dlg = $('.dlg-score');
    const n = starsFor(acc);
    dlg.querySelector('.score-stars').innerHTML = Array.from({ length: 5 }, (_, i) => icon(i < n ? 'starFill' : 'star', 34)).join('');
    dlg.querySelector('.score-acc').textContent = `${Math.round(acc * 100)}%`;
    dlg.querySelector('.score-detail').textContent = `${score.hits} accordi giusti su ${score.total} · serie migliore ×${score.bestStreak}${record ? ' · nuovo record!' : ''}`;
    dlg.querySelector('.score-rec').hidden = !record;
    dlg.onclick = (e) => {
      if (e.target.closest('[data-score="again"]')) { dlg.close(); seek(0); toggleListen().then(() => clock.play()); }
    };
    dlg.showModal();
  }

  // Chiamata al cambio accordo: giudica quello appena finito.
  function judgePrevious() {
    if (!listener || !judge) return;
    const j = judge;
    judge = null;
    if (j.frames < 2) return; // non hai suonato: non conta
    const ok = j.hits / j.frames >= 0.5;
    score.total++;
    if (ok) { score.hits++; score.streak++; score.bestStreak = Math.max(score.bestStreak, score.streak); }
    else score.streak = 0;
    fretboard.verdict = { ok, at: performance.now() };
    paintScore();
  }

  async function openInput() {
    // chiude tutto ciò che usa l'ingresso, poi apre il pannello
    const tunerDlg = $('.dlg-tuner');
    if (tunerDlg.open) tunerDlg.close();
    if (listener) toggleListen();
    root.querySelectorAll('dialog[open]').forEach((d) => d.close());
    const dlg = $('.dlg-input');
    dlg.showModal();
    const unmount = await mountInputPanel(dlg.querySelector('.input-panel'));
    dlg.onclose = () => unmount();
  }

  function openTuner() {
    const dlg = $('.dlg-tuner');
    clock.pause();
    if (listener) toggleListen();
    tuner = new Tuner(dlg.querySelector('.tuner'), settings);
    dlg.onclose = () => { tuner?.stop(); tuner = null; };
    dlg.showModal();
    tuner.start();
  }

  // ---------- Pulsanti ----------
  applyView();
  if (!store.get('helpSeen', false)) { store.set('helpSeen', true); setTimeout(() => !destroyed && $('.dlg-help').showModal(), 600); }
  const paintToggles = () => {
    $('[data-act="metro"]').classList.toggle('active', settings.metronome);
    $('[data-act="countin"]').classList.toggle('active', settings.countIn);
    $('[data-act="backing"]').classList.toggle('active', !!prefs.backing);
  };
  paintToggles();

  // Comandi secondari a scomparsa: velocità, loop e strumenti si aprono uno alla volta sotto la barra.
  function togglePop(name) {
    root.querySelectorAll('[data-popbody]').forEach((p) => {
      const open = p.dataset.popbody === name && p.hidden;
      p.hidden = !open;
      const btn = root.querySelector(`[data-pop="${p.dataset.popbody}"]`);
      btn.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
    });
    // il pannello appena aperto deve vedersi anche se la barra è in fondo allo schermo
    const opened = name && root.querySelector(`[data-popbody="${name}"]:not([hidden])`);
    if (opened) requestAnimationFrame(() => opened.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }

  $('.player').addEventListener('click', (e) => {
    const pop = e.target.closest('[data-pop]')?.dataset.pop;
    if (pop) { togglePop(pop); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    const t = clock.getTime();
    switch (act) {
      case 'play': togglePlay(); break;
      case 'back': seek(t - 5); break;
      case 'fwd': seek(t + 5); break;
      case 'loopA': loop.a = t; if (loop.b != null && loop.b <= t) loop.b = null; loop.label = ''; paintLoop(); break;
      case 'loopB':
        if (loop.a == null || t <= loop.a) break;
        loop.b = t; loop.on = true; loop.label = ''; paintLoop(); seek(loop.a); break;
      case 'loopToggle': if (loop.a != null && loop.b != null) { loop.on = !loop.on; paintLoop(); } break;
      case 'loopClear':
        loop = { on: false, a: null, b: null, label: '' }; paintLoop();
        if (study.on) stopStudy();
        if (ramp) toggleRamp();
        break;
      case 'ramp': toggleRamp(); break;
      case 'countin': settings.countIn = !settings.countIn; saveSettings(settings); paintToggles(); break;
      case 'tuner': openTuner(); break;
      case 'listen': toggleListen(); break;
      case 'input': e.preventDefault(); openInput(); break;
      case 'capo': openCapo(); break;
      case 'help': $('.dlg-help').showModal(); break;
      case 'view': openView(); break;
      case 'study': toggleStudy(); break;
      case 'setlist': openSetlists(); break;
      case 'source': e.preventDefault(); openSource(); break;
      case 'backing':
        prefs.backing = !prefs.backing; savePrefs();
        $('[data-act="backing"]').classList.toggle('active', prefs.backing);
        toast(prefs.backing ? 'Base attiva: la chitarra sintetica suona gli accordi' : 'Base spenta');
        break;
      case 'amp': openAmp(); break;
      case 'camera': openCamera(); break;
      case 'part': openPart(); break;
      case 'print': printSheet(); break;
      case 'metro': settings.metronome = !settings.metronome; saveSettings(settings); paintToggles(); break;
      case 'sync': openSync(); break;
      case 'record': startRecorder(); break;
      case 'info': openInfo(); break;
      case 'settings': openSettings(); break;
    }
  });

  // ---------- Amplificatore ed effetti ----------
  // Suono del brano: scelta dell'utente per il brano, altrimenti automatico (dal brano) o predefinito.
  const currentTone = () => prefs.tone ?? (settings.toneAuto === false && settings.tone ? settings.tone : { preset: suggestTone(song) });
  async function startAmp() {
    ampIn = await GuitarInput.open({ fftSize: 8192, monitor: true, tone: currentTone() });
    return ampIn;
  }
  function stopAmp() {
    if (listener) toggleListen(); // l'ascolto usa lo stesso ingresso
    ampIn?.close();
    ampIn = null;
    $('[data-act="amp"]').classList.remove('active');
  }
  function openAmp() {
    const dlg = $('.dlg-amp');
    const f = dlg.querySelector('form');
    let meter = 0;
    const paint = () => {
      const tone = currentTone();
      const p = toneParams(tone);
      f.ampOn.checked = !!ampIn;
      f.toneAuto.checked = settings.toneAuto !== false;
      dlg.querySelector('.amp-live').hidden = !ampIn;
      if (ampIn) dlg.querySelector('.amp-src').textContent = ampIn.rocksmith ? 'Cavo Rocksmith' : (ampIn.label || 'Ingresso audio');
      const sug = presetById(suggestTone(song));
      dlg.querySelector('.amp-suggest').innerHTML = `Suggerito per questo brano: <b>${sug.label}</b>${prefs.tone ? ' · stai usando una tua scelta per questo brano' : ''}`;
      dlg.querySelector('.amp-presets').innerHTML = TONE_PRESETS.map((t) =>
        `<button type="button" class="option${t.id === tone.preset ? ' active' : ''}" data-preset="${t.id}"><b>${t.label}</b><span>${t.desc}</span></button>`).join('');
      dlg.querySelector('.amp-knobs').innerHTML = KNOBS.map((k) =>
        `<label class="knob"><span>${k.label}</span><input type="range" data-knob="${k.k}" min="${k.min}" max="${k.max}" step="${k.step}" value="${p[k.k]}"></label>`).join('');
    };
    const apply = () => { ampIn?.setTone(currentTone()); };
    paint();
    dlg.onclick = (e) => {
      const pr = e.target.closest('[data-preset]')?.dataset.preset;
      const act = e.target.closest('[data-amp]')?.dataset.amp;
      if (pr) { prefs.tone = { preset: pr }; savePrefs(); apply(); paint(); }
      if (act === 'default') { settings.tone = currentTone(); settings.toneAuto = false; saveSettings(settings); toast('Suono predefinito per tutti i brani'); paint(); }
      if (act === 'reset') { prefs.tone = { preset: currentTone().preset }; savePrefs(); apply(); paint(); }
    };
    dlg.oninput = (e) => {
      const k = e.target.dataset.knob;
      if (!k) return;
      const t = currentTone();
      prefs.tone = { preset: t.preset, params: { ...(t.params ?? {}), [k]: Number(e.target.value) } };
      savePrefs();
      apply();
    };
    dlg.onchange = async (e) => {
      if (e.target.name === 'toneAuto') { settings.toneAuto = e.target.checked; saveSettings(settings); apply(); paint(); }
      if (e.target.name === 'ampOn') {
        if (e.target.checked) {
          try { await startAmp(); $('[data-act="amp"]').classList.add('active'); } catch { toast('Serve il permesso per l\'ingresso audio'); }
        } else stopAmp();
        paint();
      }
    };
    const fill = dlg.querySelector('.in-meter-fill');
    const tick = () => {
      if (!dlg.open) return;
      if (ampIn) {
        const lv = ampIn.level();
        fill.style.width = `${Math.min(100, lv * 400)}%`;
        fill.classList.toggle('hot', lv > 0.22);
      }
      meter = requestAnimationFrame(tick);
    };
    dlg.onclose = () => cancelAnimationFrame(meter);
    dlg.showModal();
    tick();
  }

  // ---------- Registrazione video ----------
  const camEl = $('.cam');
  const camTime = $('.cam-time');
  let camTimer = 0;
  let lastRec = null;
  async function openCamera(facing) {
    togglePop(null);
    cam ??= new CameraRecorder();
    try {
      // se l'ampli è acceso si registra anche la chitarra con gli effetti
      const extra = ampIn ? ampIn.outputTrack() : null;
      const stream = await cam.open({ facing, extraAudio: extra });
      const v = camEl.querySelector('video');
      v.srcObject = stream;
      v.classList.toggle('mirror', cam.facing === 'user');
      camEl.hidden = false;
      $('[data-act="camera"]').classList.add('active');
      paintCam();
    } catch {
      toast('Serve il permesso della fotocamera');
    }
  }
  function closeCamera() {
    clearInterval(camTimer);
    cam?.close();
    camEl.hidden = true;
    camEl.classList.remove('recording');
    $('[data-act="camera"]').classList.remove('active');
  }
  function paintCam() {
    const rec = cam?.recording;
    camEl.classList.toggle('recording', !!rec);
    const secs = rec ? (performance.now() - cam.startedAt) / 1000 : 0;
    camTime.textContent = rec ? fmt(secs) : 'Pronto';
  }
  camEl.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-cam]')?.dataset.cam;
    if (act === 'close') closeCamera();
    if (act === 'flip' && !cam?.recording) openCamera(cam?.facing === 'user' ? 'environment' : 'user');
    if (act === 'rec') {
      if (cam?.recording) {
        clearInterval(camTimer);
        const out = await cam.stop();
        paintCam();
        if (out) showRecording(out);
      } else if (cam?.stream) {
        cam.start();
        camTimer = setInterval(paintCam, 500);
        paintCam();
        if (!clock.playing) togglePlay();
      }
    }
  });
  // l'anteprima si trascina dove non dà fastidio
  camEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = camEl.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    camEl.setPointerCapture(e.pointerId);
    camEl.onpointermove = (ev) => {
      camEl.style.left = `${Math.max(0, Math.min(innerWidth - r.width, ev.clientX - dx))}px`;
      camEl.style.top = `${Math.max(0, Math.min(innerHeight - r.height, ev.clientY - dy))}px`;
      camEl.style.right = 'auto';
      camEl.style.bottom = 'auto';
    };
    camEl.onpointerup = () => { camEl.onpointermove = null; };
  });
  function showRecording(out) {
    const dlg = $('.dlg-rec');
    const f = dlg.querySelector('form');
    const url = URL.createObjectURL(out.blob);
    const v = dlg.querySelector('video');
    v.src = url;
    lastRec = { id: `rec-${Date.now()}`, songId: song.id, title: `${song.title} · ${song.artist}`, date: Date.now(), duration: out.duration, mime: out.mime, blob: out.blob };
    f.recTitle.value = lastRec.title;
    let saved = false;
    dlg.onclick = async (e) => {
      const act = e.target.closest('[data-rec2]')?.dataset.rec2;
      if (!act) return;
      lastRec.title = f.recTitle.value.trim() || lastRec.title;
      if (act === 'save' || act === 'share') {
        if (!saved) { await saveRecording(lastRec); saved = true; toast('Registrazione salvata'); }
        if (act === 'share') await shareOrDownload(lastRec);
      }
      if (act === 'discard') dlg.close();
      dlg.querySelector('[data-rec2="save"]').disabled = saved;
    };
    dlg.onclose = () => { v.pause(); URL.revokeObjectURL(url); };
    dlg.querySelector('[data-rec2="save"]').disabled = false;
    if (clock.playing) clock.pause();
    dlg.showModal();
  }

  // ---------- Sorgente audio ----------
  async function openSource() {
    root.querySelectorAll('dialog[open]').forEach((d) => d.close());
    const dlg = $('.dlg-source');
    const own = await getAudio(song.id);
    const cur = clock.kind;
    const opts = [
      { id: 'youtube', label: 'Video YouTube', desc: `${prefs.youtubeId ? 'Il video che hai scelto tu' : 'Il video associato al brano'}. Gratis, velocità regolabile; per il solo audio scegli la Vista "Manico e testo".`, on: cur === 'youtube' },
      { id: 'spotify', label: 'Spotify', desc: 'Il brano del disco, sincronia più precisa. Intero se nel browser sei entrato in Spotify (anche gratis), altrimenti 30 s. Velocità fissa.', on: cur === 'spotify' },
      ...(own ? [{ id: 'file', label: `Il tuo file: ${own.name}`, desc: 'Sincronia calcolata sull\'audio, velocità senza cambiare intonazione', on: cur === 'audio' }] : []),
      { id: 'none', label: 'Nessuna musica', desc: 'Solo metronomo e Base (chitarra sintetica)', on: prefs.source === 'none' },
    ];
    dlg.querySelector('.src-list').innerHTML = opts.map((o) =>
      `<button type="button" class="option${o.on ? ' active' : ''}" data-srcopt="${o.id}"><b></b><span>${o.desc}</span></button>`).join('');
    dlg.querySelectorAll('[data-srcopt] b').forEach((b, i) => { b.textContent = opts[i].label; });
    dlg.querySelector('.src-all').checked = settings.source === 'spotify';
    const status = dlg.querySelector('.src-status');
    status.textContent = own ? 'Per togliere il file: scegli un\'altra sorgente e tocca "Dimentica il file".' : '';
    if (own) status.insertAdjacentHTML('beforeend', ' <button type="button" class="chip-btn" data-src="forget">Dimentica il file</button>');
    dlg.onclick = async (e) => {
      const o = e.target.closest('[data-srcopt]')?.dataset.srcopt;
      const act = e.target.closest('[data-src]')?.dataset.src;
      if (o) {
        prefs.source = o;
        settings.source = dlg.querySelector('.src-all').checked && o === 'spotify' ? 'spotify' : null;
        saveSettings(settings);
        savePrefs(); dlg.close(); attachSource();
      }
      if (act === 'splink') {
        const id = parseSpotifyId(dlg.querySelector('.src-splink').value);
        if (!id) { toast('Link Spotify non valido (serve il link di un brano: open.spotify.com/track/…)'); return; }
        prefs.spotifyId = id; prefs.source = 'spotify'; savePrefs(); dlg.close(); attachSource();
      }
      if (act === 'link') {
        const id = parseYouTubeId(dlg.querySelector('.src-link').value);
        if (!id) { toast('Link YouTube non valido'); return; }
        prefs.youtubeId = id; prefs.source = 'youtube'; savePrefs(); dlg.close(); attachSource();
        toast('Video cambiato: usa Sincronia → Tocca quando inizia a cantare se non combacia');
      }
      if (act === 'forget') { await removeAudio(song.id); if (prefs.source === 'file') prefs.source = 'youtube'; savePrefs(); dlg.close(); attachSource(); }
    };
    dlg.querySelector('.src-file').onchange = async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      await saveAudio(song.id, f);
      prefs.source = 'file'; savePrefs();
      dlg.close();
      await attachSource();
      alignAudioFile(); // allineamento automatico appena scelto il file
    };
    dlg.showModal();
  }

  // ---------- Scalette ----------
  function openSetlists() {
    const dlg = $('.dlg-setlist');
    const paint = () => {
      const lists = getSetlists();
      dlg.querySelector('.setlist-list').innerHTML = lists.length
        ? lists.map((l) => `<button type="button" class="option${l.songs.includes(song.id) ? ' active' : ''}" data-slid="${l.id}"><b></b><span>${l.songs.length} brani${l.songs.includes(song.id) ? ' · c\'è già: tocca per toglierlo' : ''}</span></button>`).join('')
        : '<p class="hint">Nessuna scaletta: creane una qui sotto.</p>';
      dlg.querySelectorAll('[data-slid] b').forEach((b, i) => { b.textContent = lists[i].name; });
    };
    paint();
    dlg.onclick = (e) => {
      const id = e.target.closest('[data-slid]')?.dataset.slid;
      if (id) { toggleInSetlist(id, song.id); paint(); }
      if (e.target.closest('[data-sl="new"]')) {
        const inp = dlg.querySelector('.sl-new');
        if (inp.value.trim()) { createSetlist(inp.value, [song.id]); inp.value = ''; paint(); }
      }
    };
    dlg.showModal();
  }
  // brano successivo quando si suona una scaletta
  const playlist = setlistId ? setlistById(setlistId) : null;
  const nextId = nextInSetlist(playlist, song.id);
  const nextChip = $('.next-chip');
  if (playlist) {
    nextChip.hidden = false;
    const info = nextId ? songInfo(nextId) : null;
    nextChip.textContent = nextId ? `⏭ ${info?.title ?? 'Prossimo'}` : `Fine di «${playlist.name}»`;
    nextChip.title = nextId ? `Prossimo in scaletta «${playlist.name}»` : '';
    if (nextId) nextChip.href = songHref(nextId, playlist.id); else nextChip.removeAttribute('href');
  }
  let advanced = false;
  function checkSetlistEnd(t) {
    if (!nextId || advanced || !clock.playing || loop.on) return;
    if (t >= Math.min(totalDuration() - 0.5, tl.end + 3)) {
      advanced = true;
      toast(`Prossimo: ${songInfo(nextId)?.title ?? ''}`);
      setTimeout(() => { if (!destroyed) location.hash = songHref(nextId, playlist.id); }, 2500);
    }
  }

  function openSettings() {
    const dlg = $('.dlg-settings');
    const f = dlg.querySelector('form');
    const keys = ['leftHanded', 'highStringOnTop', 'showNoteNames', 'autoScroll', 'stageLyrics'];
    f.notation.value = settings.notation;
    for (const k of keys) f[k].checked = settings[k];
    f.onchange = () => {
      settings.notation = f.notation.value;
      for (const k of keys) settings[k] = f[k].checked;
      saveSettings(settings);
      rebuild();
      lastIdx = -2;
    };
    dlg.showModal();
  }

  // ---------- Riga del testo sul palco ----------
  const stageLyric = $('.stage-lyric');
  let stageIdx = -2;
  let stageWords = null;
  let stageSpans = [];
  function paintStageLyric(t) {
    const lines = synced?.lines;
    if (!settings.stageLyrics || !lines?.length) { stageLyric.hidden = true; stageIdx = -2; return; }
    let lo = 0;
    let hi = lines.length - 1;
    let i = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lines[mid].t + lyricsOffset <= t) { i = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (i !== stageIdx) {
      stageIdx = i;
      const now = lines[i]?.text ?? '';
      const next = lines.slice(i + 1).find((l) => l.text)?.text ?? '';
      stageLyric.hidden = !now && !next;
      const box = stageLyric.querySelector('.sl-now');
      box.replaceChildren();
      stageWords = null;
      if (now) {
        const start = lines[i].t + lyricsOffset;
        const end = (lines[i + 1]?.t ?? lines[i].t + 5) + lyricsOffset;
        stageWords = wordTimes(now, start, Math.min(end, start + 12), lines[i].words?.map((w) => ({ w: w.w, t: w.t + lyricsOffset })));
        stageWords.forEach((w, k) => {
          const sp = document.createElement('span');
          sp.className = 'kw';
          sp.textContent = w.w;
          box.append(sp);
          if (k < stageWords.length - 1) box.append(' ');
        });
        stageSpans = [...box.querySelectorAll('.kw')];
      } else box.textContent = '♪';
      stageLyric.querySelector('.sl-next').textContent = next;
      stageLyric.classList.remove('in');
      void stageLyric.offsetWidth;
      stageLyric.classList.add('in');
    }
    if (stageWords) {
      const { i: wi, p } = wordAt(stageWords, t);
      stageSpans.forEach((sp, k) => { sp.classList.toggle('on', k < wi); sp.classList.toggle('now', k === wi); });
      stageSpans[wi]?.style.setProperty('--wp', `${(p * 100).toFixed(1)}%`);
    }
    return;
  }

  // ---------- Riprendi da dove eri rimasto ----------
  const resumeChip = $('.resume-chip');
  const savedPos = store.get(key('pos'), 0);
  if (savedPos > 10 && savedPos < tl.end - 10) {
    resumeChip.hidden = false;
    resumeChip.textContent = `Riprendi da ${fmt(savedPos)}`;
    resumeChip.addEventListener('click', () => { seek(savedPos); resumeChip.hidden = true; clock.play(); });
  }

  // ---------- Controllo e correzione della sincronia ----------
  // (syncCheck è dichiarato all'inizio: il testo può arrivare prima che il video sia pronto)
  function lyricLines() {
    return (synced?.lines ?? []).filter((l) => l.text).map((l) => l.t + lyricsOffset);
  }

  // Il controllo resta interno: se testo e accordi non combaciano compare solo un pallino sul pulsante Sincronia.
  function paintSyncBadge() {
    syncCheck = synced?.lines.length ? lyricGridCheck(lyricLines(), tl) : null;
    const btn = root.querySelector('.tools-row [data-act="sync"]');
    if (!btn) return;
    const warn = syncCheck?.status === 'check';
    btn.classList.toggle('warn', warn);
    root.querySelector('[data-pop="tools"]')?.classList.toggle('warn', warn);
    btn.title = warn
      ? `Testo e accordi da verificare (coerenza ${Math.round(syncCheck.coherence * 100)}%): apri per allinearli`
      : 'Allinea accordi e testo al video';
  }

  function applyShift(d, why) {
    if (!d) { toast('Già allineato'); return; }
    offset = Math.round((offset + d) * 100) / 100;
    lyricsOffset = Math.round((lyricsOffset + d) * 100) / 100;
    store.set(key('offset'), offset);
    store.set(key('lyricsOffset'), lyricsOffset);
    rebuild();
    lastIdx = -2;
    toast(`${why}: ${signed(d)}`);
  }

  // Allineamento con un tocco: l'utente tocca quando inizia il canto (o il primo accordo).
  let tapPending = false;
  const tapEl = $('.tapnow');
  function startTapAlign() {
    tapPending = true;
    tapEl.hidden = false;
    const first = lyricLines()[0] ?? tl.events[0]?.start ?? 0;
    tapEl.querySelector('.tapnow-info').innerHTML = lyricLines().length
      ? 'Fai partire il video e tocca <b>ADESSO</b> (o premi <kbd>T</kbd>) nell\'istante in cui <b>inizia a cantare</b>'
      : 'Fai partire il video e tocca <b>ADESSO</b> (o premi <kbd>T</kbd>) sul <b>primo accordo</b>';
    seek(Math.max(0, first - 6));
    clock.play();
  }
  function tapAlignNow() {
    if (!tapPending) return;
    tapPending = false;
    tapEl.hidden = true;
    const first = lyricLines()[0] ?? tl.events[0]?.start ?? 0;
    applyShift(tapAlignShift(clock.getTime(), first), 'Allineato col tocco');
  }
  tapEl.querySelector('.tapnow-btn').addEventListener('pointerdown', (e) => { e.preventDefault(); tapAlignNow(); });
  tapEl.querySelector('.tapnow-cancel').addEventListener('click', () => { tapPending = false; tapEl.hidden = true; });

  // Allineamento automatico: il microfono ascolta il video per 15 s.
  async function listenAlign() {
    if (listener) toggleListen();
    const frames = [];
    const probe = new Listener(({ chroma, level }) => {
      if (clock.playing) frames.push({ t: clock.getTime(), chroma, level });
    });
    try {
      await probe.start();
    } catch {
      toast('Serve il permesso del microfono');
      return;
    }
    if (clock.getTime() < (tl.events[0]?.start ?? 0)) seek(tl.events[0].start);
    clock.play();
    const secs = 15;
    for (let i = secs; i > 0 && !destroyed; i--) {
      toast(`Ascolto il video… ${i} s (volume alto, niente chitarra)`);
      await new Promise((r) => setTimeout(r, 1000));
    }
    probe.stop();
    const r = estimateOffsetFromAudio(frames, tl);
    if (r.confidence >= 0.35) applyShift(r.shift, `Allineato ascoltando (affidabilità ${Math.round(r.confidence * 100)}%)`);
    else toast('Non abbastanza sicuro: alza il volume e riprova, oppure usa il tocco');
  }

  // Allineamento automatico sul file audio dell'utente: si analizza la musica vera, niente microfono.
  async function alignAudioFile() {
    const own = await getAudio(song.id);
    if (!own?.blob) { toast('Scegli prima un file audio (⋯ → Audio)'); return; }
    toast('Analizzo l\'audio…');
    try {
      const { samples, sampleRate } = await decodeToMono(own.blob);
      const frames = chromaFrames(samples, sampleRate, { hop: 0.15, size: 4096 });
      const r = alignToAudio(frames, tl, { range: 25 });
      if (r.confidence < 0.25) { toast('Non sono sicuro dell\'allineamento: prova il tocco in Sincronia'); return; }
      applyShift(r.shift, `Allineato al file audio (affidabilità ${Math.round(r.confidence * 100)}%)`);
      store.set(key('audioAligned'), { name: own.name, shift: r.shift, drift: r.drift, at: Date.now() });
    } catch (err) {
      toast(`Analisi non riuscita: ${err.message}`);
    }
  }

  function openSync() {
    const dlg = $('.dlg-sync');
    dlg.querySelector('[data-sync="audiofile"]').hidden = clock.kind !== 'audio';
    const paint = () => {
      dlg.querySelector('.out-chords').textContent = signed(offset);
      dlg.querySelector('.out-lyrics').textContent = signed(lyricsOffset);
      const st = dlg.querySelector('.sync-status');
      const fix = dlg.querySelector('[data-sync="fix"]');
      if (syncCheck && syncCheck.status !== 'unknown') {
        const ok = syncCheck.status === 'ok';
        st.className = 'sync-status ' + (ok ? 'ok' : 'warn');
        st.textContent = ok
          ? `Testo e accordi sono coerenti (${Math.round(syncCheck.coherence * 100)}%). Se il video parte prima o dopo, allinealo con un tocco.`
          : `Testo e accordi non combaciano bene (${Math.round(syncCheck.coherence * 100)}%): prova "Correggi automaticamente" o allinea col tocco.`;
        fix.hidden = ok || Math.abs(syncCheck.shift) < 0.05;
      } else {
        st.className = 'sync-status';
        st.textContent = 'Allinea il brano al video: con un tocco quando inizia a cantare, oppure ascoltando il video dal microfono.';
        fix.hidden = true;
      }
    };
    paint();
    dlg.onclick = async (e) => {
      const step = e.target.closest('[data-step]')?.dataset.step;
      if (step) {
        const [what, v] = step.split(':');
        if (what === 'all') {
          applyShift(Number(v), 'Spostati testo e accordi');
        } else if (what === 'chords') {
          offset = Math.round((offset + Number(v)) * 100) / 100;
          store.set(key('offset'), offset);
          rebuild();
        } else {
          lyricsOffset = Math.round((lyricsOffset + Number(v)) * 100) / 100;
          store.set(key('lyricsOffset'), lyricsOffset);
          renderPanel();
        }
        paint();
      }
      const act = e.target.closest('[data-sync]')?.dataset.sync;
      if (act === 'paste') { dlg.close(); openLyrics(); }
      if (act === 'tap') { dlg.close(); startTapAlign(); }
      if (act === 'listen') { dlg.close(); listenAlign(); }
      if (act === 'audiofile') { dlg.close(); alignAudioFile(); }
      if (act === 'fix' && syncCheck) {
        // le righe partono dopo il battere → gli accordi vanno spostati avanti (solo gli accordi)
        offset = Math.round((offset + syncCheck.shift) * 100) / 100;
        store.set(key('offset'), offset);
        rebuild();
        toast(`Accordi riallineati al testo: ${signed(syncCheck.shift)}`);
        paint();
      }
      if (act === 'reload') { clearLyricsCache(song); dlg.close(); loadLyrics(); }
      if (act === 'resetTimes') { store.remove(key('sync')); sync = song.sync ?? null; rebuild(); dlg.close(); }
    };
    dlg.showModal();
  }

  function openLyrics() {
    const dlg = $('.dlg-lyrics');
    const f = dlg.querySelector('form');
    f.text.value = store.get(key('lrc'), null) ?? plainLyrics.join('\n\n');
    dlg.onclose = () => {
      if (dlg.returnValue !== 'save') return;
      const text = f.text.value.trim();
      store.remove(key('lrc'));
      plainLyrics = [];
      if (looksLikeLrc(text)) store.set(key('lrc'), text);
      else if (text) plainLyrics = text.replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
      store.set(key('lyrics'), plainLyrics);
      if (plainLyrics.length) panelTab = 'chords';
      loadLyrics();
      rebuild();
    };
    dlg.showModal();
  }

  function openInfo() {
    const dlg = $('.dlg-info');
    dlg.querySelector('h3').textContent = `${song.title} · ${song.artist}`;
    const body = dlg.querySelector('.info-body');
    body.replaceChildren();
    const dl = document.createElement('dl');
    const rows = [
      ['Album', song.album], ['Anno', song.year], ['Genere', song.genre], ['Tonalità', song.key], ['BPM', song.bpm],
      ['Tempo', song.timeSignature?.join('/')], ['Capotasto', song.capo ? `${song.capo}° tasto` : 'nessuno'],
      ['Accordatura', song.tuning ?? 'Standard (E A D G B E)'],
      ['Sincronia', sync?.length ? 'tempi registrati da te' : song.warp?.length ? `agganciata ai tempi del canto (${song.warp.length} punti)` : 'griglia a tempo costante'],
    ];
    for (const [k, v] of rows) {
      if (v == null || v === '') continue;
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      dl.append(dt, dd);
    }
    body.append(dl);
    for (const note of [song.notes, song.syncNote].filter(Boolean)) {
      const p = document.createElement('p'); p.className = 'hint'; p.textContent = note; body.append(p);
    }
    const share = document.createElement('button');
    share.type = 'button';
    share.className = 'chip-btn';
    share.textContent = '🔗 Condividi il brano';
    share.addEventListener('click', async () => {
      const url = location.href.split('?')[0];
      try {
        if (navigator.share) await navigator.share({ title: `${song.title} · ${song.artist}`, text: 'Impara a suonarla con Guitar Song Trainer', url });
        else { await navigator.clipboard.writeText(url); toast('Link copiato'); }
      } catch { /* annullato */ }
    });
    body.append(share);
    const credit = document.createElement('p');
    credit.className = 'hint';
    credit.innerHTML = 'Testo sincronizzato fornito da <a href="https://lrclib.net" target="_blank" rel="noopener">LRCLIB</a>, scaricato al momento e non incluso nell\'app.';
    body.append(credit);
    dlg.showModal();
  }

  const onKey = (e) => {
    if (e.target.closest('input, textarea, select') || root.querySelector('dialog[open]')) return;
    const t = clock.getTime();
    switch (e.key) {
      case ' ': e.preventDefault(); togglePlay(); break;
      case 'ArrowLeft': seek(t - 5); break;
      case 'ArrowRight': seek(t + 5); break;
      case '[': $('[data-act="loopA"]').click(); break;
      case ']': $('[data-act="loopB"]').click(); break;
      case 'l': case 'L': $('[data-act="loopToggle"]').click(); break;
      case 'Escape': togglePop(null); break;
      case 't': case 'T': case 'Enter':
        if (tapPending) { e.preventDefault(); tapAlignNow(); } else if (recorder) { e.preventDefault(); tap(); }
        break;
      default: return;
    }
  };
  window.addEventListener('keydown', onKey);

  // ---------- Ciclo di animazione ----------
  let lastTimeText = '';
  function frame() {
    if (destroyed) return;
    const t = clock.getTime();
    const dur = totalDuration();
    const nowMs = performance.now();
    if (clock.playing) practiceAcc += Math.min(0.25, (nowMs - lastFrameAt) / 1000);
    lastFrameAt = nowMs;
    if (practiceAcc >= 10) { addPractice(song.id, practiceAcc); practiceAcc = 0; }

    if (loop.on && loop.a != null && loop.b != null && t >= loop.b && performance.now() - lastSeekAt > 300) {
      seek(loop.a);
      onLoopWrap();
    }

    const idx = eventIndexAt(tl, t);
    const { bar, beat } = beatAt(tl, t);
    if (!stageHidden()) fretboard.render(t, tl, idx, settings, clock.playing);
    if (panelTab === 'lyrics' && synced?.lines.length) karaoke.update(t, settings);
    if (panelTab === 'tab') tabView.update(t, settings);
    else sheet.update(bar, settings);

    const cur = tl.events[idx];
    const nxt = tl.events[idx + 1] ?? (idx < 0 ? tl.events[0] : null);
    if (idx !== lastIdx) {
      if (lastIdx >= -1 && idx === lastIdx + 1) judgePrevious();
      else judge = null;
      lastIdx = idx;
      hudNow.textContent = cur ? displayChord(cur.name, settings.notation) : '—';
      hudNow.style.setProperty('--c', cur ? chordColor(cur.name) : '#fff');
      hudNext.textContent = nxt ? displayChord(nxt.name, settings.notation) : 'Fine';
      hudNext.style.setProperty('--c', nxt ? chordColor(nxt.name) : '#fff');
      sectionName.textContent = cur ? tl.sections[cur.section].name : tl.sections[0]?.name ?? '';

      hudNow.classList.remove('bump');
      void hudNow.offsetWidth;
      hudNow.classList.add('bump');
    }
    // diagramma dell'accordo corrente (si ricalcola anche se il pannello è stato ridisegnato)
    if (panelTab === 'shapes' && (lastDiagram?.dataset.chord !== cur?.name || !lastDiagram?.isConnected)) {
      lastDiagram?.classList.remove('active');
      lastDiagram = cur ? shapesBody.querySelector(`[data-chord="${CSS.escape(cur.name)}"]`) : null;
      lastDiagram?.classList.add('active');
    }
    if (nxt) {
      const bd = bar >= 0 && tl.bars[bar] ? (tl.bars[bar].end - tl.bars[bar].start) / tl.bpb : tl.beatDur;
      const left = Math.ceil((nxt.start - t) / bd - 0.001);
      countdown.textContent = left <= tl.bpb * 2 ? `tra ${left}` : '';
      countdown.classList.toggle('soon', left <= 1);
    } else countdown.textContent = '';

    const beatInt = Math.floor(beat);
    const dots = beatsEl.children;
    for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('on', bar >= 0 && i === beatInt);
    if (bar >= 0 && tl.bars[bar]) paintStrumSlots(tl.notes ? '' : tl.bars[bar].strum ?? tl.strum ?? '');
    const slots = strumEl.children;
    if (slots.length) {
      const pos = bar >= 0 ? Math.floor((beat / tl.bpb) * slots.length) : -1;
      for (let i = 0; i < slots.length; i++) slots[i].classList.toggle('on', i === pos);
    }
    if (settings.metronome && clock.playing && bar >= 0 && beatInt >= 0) {
      const k = `${bar}:${beatInt}`;
      if (k !== lastBeatKey) { lastBeatKey = k; click(beatInt === 0); }
    }
    // note singole della base (arpeggio o parte MIDI): suonano tutte quelle iniziate dall'ultimo frame,
    // quindi anche gli accordi della parte MIDI (più note insieme) e le note fitte
    if (prefs.backing && clock.playing && tl.notes) {
      let lo = 0; let hi = tl.notes.length - 1; let ni = -1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (tl.notes[mid].t <= t) { ni = mid; lo = mid + 1; } else hi = mid - 1; }
      if (ni !== lastNoteIdx) {
        const from = ni > lastNoteIdx && lastNoteIdx >= 0 ? lastNoteIdx + 1 : ni;
        lastNoteIdx = ni;
        for (let k = Math.max(0, from); k <= ni; k++) {
          const n = tl.notes[k];
          // dopo un salto (seek) non si recuperano le note vecchie
          if (t - n.t > 0.15) continue;
          const vol = prefs.arrangement === 'midi' ? 0.12 + 0.28 * ((n.vel ?? 90) / 127) : 0.3;
          pluck(n.string, n.fret > 0 ? n.fret + capo : 0, vol, prefs.arrangement === 'midi' ? n.dur / (clock.getRate?.() || 1) : null);
        }
      }
    } else lastNoteIdx = -1;
    // base sintetica: una pennata per ogni suddivisione del pattern (l'arpeggio suona le sue note da fretboard.onNote)
    if (prefs.backing && clock.playing && bar >= 0 && cur && !tl.notes) {
      const pat = (tl.bars[bar]?.strum || tl.strum || (tl.bpb === 3 ? 'D-DUDU' : 'D-DU-UDU')).replace(/\s+/g, '');
      const pos = Math.floor((beat / tl.bpb) * pat.length);
      const k = `${bar}:${pos}`;
      if (k !== lastStrumKey) {
        lastStrumKey = k;
        const ch = pat[pos];
        const sh = fretboard.shape(cur.name);
        if (sh && 'DUXPB'.includes(ch)) {
          // accenti: primo battito più forte, controtempi più leggeri
          const perBeat = pat.length / tl.bpb;
          const onBeat = pos % perBeat === 0;
          const accent = pos === 0 ? 1.18 : onBeat ? 1.02 : 0.85;
          strumChord(sh.frets, { kind: ch, accent });
        }
      }
    }

    paintStageLyric(t);
    paintSection(t);
    if (playlist) checkSetlistEnd(t);
    // fine del brano con l'ascolto attivo: pagella
    if (listener && clock.playing && t >= tl.end - 0.3 && !loop.on) toggleListen({ summary: true });

    const pct = `${Math.min(100, (t / dur) * 100)}%`;
    scrubHead.style.left = pct;
    scrubFill.style.width = pct;
    const text = fmt(t);
    if (text !== lastTimeText) {
      lastTimeText = text;
      tCur.textContent = text;
      tTot.textContent = fmt(dur);
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return function destroy() {
    destroyed = true;
    tpObs.disconnect();
    cancelAnimationFrame(raf);
    cancelCountIn();
    tuner?.stop();
    listener?.stop();
    ampIn?.close();
    cam?.close();
    wake.off();
    addPractice(song.id, practiceAcc);
    try { store.set(key('pos'), clock?.getTime() ?? 0); } catch { /* niente */ }
    window.removeEventListener('keydown', onKey);
    fretboard.destroy();
    clock?.destroy();
  };
}
