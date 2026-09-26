# Sincronizzazione misurata sull'audio vero (anche per i brani rap arrangiati).
#
# 1. scarica l'anteprima di 30 s del brano da Deezer (stesso master della versione del testo: durata ±4 s)
# 2. riconosce le parole cantate (faster-whisper) e le confronta, SOLO IN MEMORIA, con le righe LRCLIB:
#    così sa in che punto del brano cade l'anteprima
# 3. trova i battiti reali (librosa): BPM preciso e fase della battuta nel tempo del brano
# 4. sceglie il battere confrontando il cromagramma dell'audio con gli accordi del brano
# Stampa solo numeri (niente testo, niente audio salvato nel repository).
#
# Uso: python3 tools/audiosync.py <id> [--apply]     (serve: pip install librosa faster-whisper)
#   --apply  aggiorna bpm e offset del brano (brani fatti a mano) o lo rigenera con autosong (brani generati)
import json, math, os, re, subprocess, sys, tempfile, unicodedata, urllib.parse, urllib.request
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {'User-Agent': 'Mozilla/5.0'}
_model = None
LANG = {}  # lingua per brano (it/en), impostata dal chiamante; None = riconoscimento automatico


def get(url, binary=False):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
    return data if binary else json.loads(data)


def norm(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z ]+', ' ', s)


def words(s):
    return [w for w in norm(s).split() if len(w) >= 3]


def load_song(sid):
    index = json.load(open(os.path.join(ROOT, 'songs', 'index.json')))
    e = next(x for x in index if x['id'] == sid)
    return json.load(open(os.path.join(ROOT, 'songs', e['file']))), e


def lrc_lines(song):
    lid = song.get('lyricsSource', {}).get('lrclibId')
    d = get(f'https://lrclib.net/api/get/{lid}')
    out = []
    for ln in (d.get('syncedLyrics') or '').splitlines():
        m = re.match(r'\[(\d+):(\d+(?:\.\d+)?)\](.*)', ln)
        if m: out.append((int(m.group(1)) * 60 + float(m.group(2)), m.group(3).strip()))
    return out, float(d.get('duration') or 0)


def deezer_preview(artist, title, dur):
    a = re.split(r',| feat\.? | & ', artist)[0]
    res = get('https://api.deezer.com/search?' + urllib.parse.urlencode({'q': f'{a} {title}'})).get('data', [])
    t0 = norm(title).split()
    cands = [r for r in res if r.get('preview') and set(t0[:2]) <= set(norm(r['title']).split())]
    cands.sort(key=lambda r: abs(r['duration'] - dur))
    if not cands or abs(cands[0]['duration'] - dur) > 4: return None, None
    return get(cands[0]['preview'], binary=True), cands[0]['duration']


def timeline(sid):
    out = subprocess.run(['node', os.path.join(ROOT, 'tools', 'tlinfo.mjs'), sid], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def locate(rec_words, lines, span):
    """Posizione dell'anteprima nel brano: dove le parole riconosciute stanno nelle righe LRC attive."""
    if not rec_words: return None, 0, 0
    times = [t for t, _ in lines]
    lw = [set(words(x)) for _, x in lines]
    def line_at(t):
        lo, hi, a = 0, len(times) - 1, -1
        while lo <= hi:
            mid = (lo + hi) // 2
            if times[mid] <= t: a = mid; lo = mid + 1
            else: hi = mid - 1
        return a
    best, scores = None, []
    end = max(times[-1] if times else 0, span)
    for P in np.arange(0, max(1, end - 20), 0.1):
        sc = 0
        for w, tau in rec_words:
            i = line_at(P + tau)
            if i < 0: continue
            if w in lw[i] or (i > 0 and w in lw[i - 1]) or (i + 1 < len(lw) and w in lw[i + 1] and times[i + 1] - (P + tau) < 0.6): sc += 1
        scores.append((sc / len(rec_words), float(P)))
    scores.sort(reverse=True)
    best = scores[0]
    return best[1], best[0], len(rec_words)


def chord_score(ev, chroma_beats, beat_song_times, shift):
    """Somiglianza media fra il cromagramma ai battiti e gli accordi della timeline spostata di shift."""
    tot, n = 0.0, 0
    evs = ev['events']
    starts = [x['s'] for x in evs]
    import bisect
    for c, t in zip(chroma_beats.T, beat_song_times):
        k = bisect.bisect_right(starts, t - shift) - 1
        if k < 0 or not evs[k]['pc']: continue
        tpl = np.zeros(12); tpl[evs[k]['pc']] = 1
        cn = c / (np.linalg.norm(c) + 1e-9)
        tot += float(cn @ (tpl / np.linalg.norm(tpl))); n += 1
    return tot / max(1, n)


def analyse(sid):
    import librosa
    global _model
    song, entry = load_song(sid)
    lines, ldur = lrc_lines(song)
    audio, ddur = deezer_preview(song['artist'], song['title'], ldur or song.get('lyricsSource', {}).get('duration', 0))
    if audio is None: return {'id': sid, 'esito': 'nessuna anteprima con la stessa durata'}
    with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as f:
        f.write(audio); path = f.name
    try:
        y, sr = librosa.load(path, sr=22050, mono=True)
        span = len(y) / sr
        # parole cantate (solo in memoria)
        if _model is None:
            from faster_whisper import WhisperModel
            _model = WhisperModel('base', device='cpu', compute_type='int8')
        rec = []
        for vad in (False, True):
            segs, _info = _model.transcribe(path, word_timestamps=True, vad_filter=vad, condition_on_previous_text=False,
                                            language=LANG.get(sid))
            rec = [(w, word.start) for s in segs for word in (s.words or []) for w in words(word.word)]
            if len(rec) >= 6: break
    finally:
        os.unlink(path)
    P, pscore, nwords = locate(rec, lines, span)
    if P is None or pscore < 0.3:
        return {'id': sid, 'esito': 'posizione dell\'anteprima incerta', 'parole': nwords, 'aggancio': round(pscore, 2)}
    # battiti reali
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units='frames', tightness=120)
    bt = librosa.frames_to_time(beats, sr=sr)
    if len(bt) < 16: return {'id': sid, 'esito': 'pochi battiti'}
    k = np.arange(len(bt))
    T, b0 = np.polyfit(k, bt, 1)
    resid = float(np.std(bt - (b0 + T * k)))
    ev = timeline(sid)
    song_beat = 60 / ev['bpm']
    # periodo del battito musicale compatibile con quello del brano (metà, doppio, terzine)
    best = min(((abs(T * m - song_beat) / song_beat, m) for m in (0.5, 2 / 3, 0.75, 1, 4 / 3, 1.5, 2)), key=lambda x: x[0])
    if best[0] > 0.06: return {'id': sid, 'esito': 'BPM audio incompatibile', 'bpm_audio': round(60 / T, 1), 'bpm': ev['bpm']}
    Tm = T * best[1]
    bpb = ev['bpb']
    bar = Tm * bpb
    # battiti nel tempo del brano (su griglia regolare Tm) e cromagramma sincronizzato ai battiti
    grid = np.arange(bt[0], span, Tm)
    frames = librosa.time_to_frames(grid, sr=sr)
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    cb = librosa.util.sync(chroma, frames, aggregate=np.median)[:, :len(grid)]
    song_times = P + grid
    # fase: la griglia vecchia spostata di Δ entro ± mezza battuta, a passi di un battito (e fine ±0,1 s)
    phase = (song_times[0] - ev['offset']) % Tm  # sfasamento fra battiti audio e griglia vecchia
    base = phase if phase < Tm / 2 else phase - Tm
    cands = []
    for kb in range(-(bpb // 2) - 1, bpb // 2 + 2):
        for fine in (-0.06, -0.03, 0, 0.03, 0.06):
            d = base + kb * Tm + fine
            if abs(d) > bar * 0.75: continue
            cands.append((chord_score(ev, cb, song_times, d), d))
    cands.sort(reverse=True)
    s_zero = chord_score(ev, cb, song_times, 0.0)
    s_base = chord_score(ev, cb, song_times, base)
    # di base ci si allinea al battito reale più vicino; si cambia battere solo se gli accordi lo dicono chiaramente
    s_best, delta = cands[0]
    if not (s_best >= 0.55 and s_best - s_base >= 0.04 and abs(delta - base) > Tm / 2):
        s_best, delta = s_base, base
    out = {'id': sid, 'esito': 'ok', 'P': round(P, 2), 'aggancio': round(pscore, 2), 'parole': nwords,
           'bpm_audio': round(float(60 / Tm), 2), 'bpm': ev['bpm'], 'regolarita': round(resid, 3),
           'delta': round(float(delta), 3), 'fase': round(float(base), 3), 'accordi_prima': round(s_zero, 3), 'accordi_dopo': round(s_best, 3),
           'anchor': round(float(song_times[0]), 3), 'Tm': round(float(Tm), 5)}
    return out


def line_phase(song, lines, bar):
    """Fase (secondi, modulo la battuta) che meglio allinea gli inizi delle righe cantate."""
    ts = [t for t, x in lines if x.strip()]
    c = sum(math.cos(2 * math.pi * t / bar) for t in ts); s_ = sum(math.sin(2 * math.pi * t / bar) for t in ts)
    return (math.atan2(s_, c) / (2 * math.pi) * bar) % bar, math.hypot(c, s_) / max(1, len(ts))


def apply(sid, r):
    """Il BPM misurato sull'audio sostituisce la stima; il battere si riaggancia alle righe del testo."""
    song, entry = load_song(sid)
    p = os.path.join(ROOT, 'songs', entry['file'])
    bpm_new = r['bpm_audio']
    generated = 'agganciati riga per riga' in (song.get('syncNote') or '')
    if generated:
        cmd = ['python3', os.path.join(ROOT, 'tools', 'autosong.py'), '--artist', song['artist'], '--title', song['title'],
               '--genre', song['genre'], '--bpm', str(bpm_new), '--exact-bpm', '--yt', song['youtubeId'],
               '--lrclib', str(song['lyricsSource']['lrclibId']), '--beats', str(song['timeSignature'][0]), '--write', '--id', sid]
        if song.get('year'): cmd += ['--year', str(song['year'])]
        if song.get('album'): cmd += ['--album', song['album']]
        env = dict(os.environ, AUTOSONG_NOINDEX='1')
        res = subprocess.run(cmd, capture_output=True, text=True, env=env)
        if 'SCRITTO' not in res.stdout: return 'rigenerazione non riuscita'
        new = json.load(open(p))
        # le parti divise a mano e le note restano quelle di prima se la struttura non cambia
        song = new
    else:
        lines, _ = lrc_lines(song)
        bar_new = 60 / bpm_new * song['timeSignature'][0]
        ph, _R = line_phase(song, lines, bar_new)
        o_old = song.get('offset', 0)
        # il valore ≡ ph (mod battuta) più vicino al vecchio offset
        o_new = ph + round((o_old - ph) / bar_new) * bar_new
        song['bpm'] = bpm_new
        song['offset'] = round(o_new, 3)
    song['tempoSource'] = 'audio'
    song['syncNote'] = ("BPM misurato sull'audio del brano (niente deriva fra inizio e fine) e battere agganciato ai tempi del "
                        "canto. Se il video ha un'introduzione diversa usa Sincronia → Tocca quando inizia a cantare.")
    json.dump(song, open(p, 'w'), ensure_ascii=False, indent=1)
    return 'applicato'


if __name__ == '__main__':
    sid = sys.argv[1]
    r = analyse(sid)
    ok = r.get('esito') == 'ok' and r['regolarita'] < 0.06 and r['aggancio'] >= 0.3
    r['accettato'] = ok
    if ok and '--apply' in sys.argv: r['modifica'] = apply(sid, r)
    print(json.dumps(r, ensure_ascii=False))
