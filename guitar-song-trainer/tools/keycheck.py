# Controlla che gli accordi del brano siano nella tonalità del disco, ascoltando l'anteprima di 30 s di Deezer.
# Molte pagine di accordi scrivono le forme "con il capotasto al N° tasto": se il brano è stato importato senza
# capotasto, accordi, Base e allineamento automatico sono N semitoni sotto il disco.
# Per ogni rotazione r (0..11) si cerca il punto del brano in cui l'anteprima combacia meglio con gli accordi
# alzati di r semitoni; se una rotazione 1..7 vince nettamente, con --fix gli accordi vengono alzati di r e il
# capotasto messo a r (le forme mostrate restano quelle della pagina, il suono è quello del disco).
# Uso: python3 tools/keycheck.py [id ...] [--fix] [--workers 3]
import json, os, re, subprocess, sys, tempfile, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SONGS = os.path.join(ROOT, 'songs')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from streamids import pick, lrc_duration, get  # noqa: E402

NOTES = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def transpose_name(name, r):
    def one(n):
        m = re.match(r'^([A-G])([#b]?)(.*)$', n)
        if not m: return n
        pc = (NOTES[m.group(1)] + (1 if m.group(2) == '#' else -1 if m.group(2) == 'b' else 0) + r) % 12
        flat = m.group(2) == 'b' or (not m.group(2) and m.group(1) in 'F')
        names = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] if flat else ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        return names[pc] + m.group(3)
    if ':' in name:
        n, d = name.split(':', 1)
        return transpose_name(n, r) + ':' + d
    return '/'.join(one(p) for p in name.split('/'))


def transpose_bar(bar, r):
    if isinstance(bar, list): return [transpose_bar(x, r) for x in bar]
    if bar in ('%', '-', 'N.C.', ''): return bar
    return transpose_name(bar, r)


def timeline(sid):
    out = subprocess.run(['node', os.path.join(ROOT, 'tools', 'tlinfo.mjs'), sid], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def preview(song):
    dur = lrc_duration(song)
    artist = re.split(r',', song['artist'])[0]
    for q in (f'artist:"{artist}" track:"{song["title"]}"', f'{artist} {song["title"]}'):
        res = get('https://api.deezer.com/search?limit=10&q=' + urllib.parse.quote(q)).get('data') or []
        tr = pick(res, song, dur)
        if tr and tr.get('preview'): break
        tr = None
    if not tr: return None
    with urllib.request.urlopen(tr['preview'], timeout=30) as r:
        return r.read()


def analyse(sid):
    import librosa
    song = json.load(open(os.path.join(SONGS, sid + '.json')))
    audio = preview(song)
    if not audio: return {'id': sid, 'esito': 'nessuna anteprima'}
    with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as f:
        f.write(audio); path = f.name
    try:
        y, sr = librosa.load(path, sr=22050, mono=True)
    finally:
        os.unlink(path)
    hop = 0.25
    ch = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=int(sr * hop / 512) * 512)
    frames = ch.T  # (n, 12)
    level = frames.sum(1)
    frames = frames[level > np.percentile(level, 20)] if len(frames) > 20 else frames
    ft = np.arange(ch.shape[1]) * (int(sr * hop / 512) * 512) / sr
    ft = ft[level > np.percentile(level, 20)] if len(level) > 20 else ft
    tl = timeline(sid)
    ev = tl['events']
    grid = np.arange(0, tl['end'], hop)
    idx = np.searchsorted([e['s'] for e in ev], grid, side='right') - 1
    tpl = np.zeros((len(grid), 12))
    for i, k in enumerate(idx):
        if k < 0 or not ev[k]['pc']: continue
        for p in ev[k]['pc']: tpl[i, p] = 1
    fn = frames / (np.linalg.norm(frames, axis=1, keepdims=True) + 1e-9)
    span = int(ft[-1] / hop) + 1 if len(ft) else 0
    best = []
    for r in range(12):
        t = np.roll(tpl, r, axis=1)
        tn = t / (np.linalg.norm(t, axis=1, keepdims=True) + 1e-9)
        top = 0
        for o in range(0, max(1, len(grid) - span), 2):
            rows = o + np.round(ft / hop).astype(int)
            rows = rows[rows < len(grid)]
            if len(rows) < len(fn) * 0.8: continue
            s = float(np.mean(np.sum(fn[:len(rows)] * tn[rows], axis=1)))
            top = max(top, s)
        best.append(top)
    r = int(np.argmax(best))
    return {'id': sid, 'r': r, 'score': round(best[r], 3), 'score0': round(best[0], 3), 'scores': [round(x, 2) for x in best]}


def fix(sid, r):
    path = os.path.join(SONGS, sid + '.json')
    song = json.load(open(path))
    for p in (song.get('patterns') or {}).values():
        p[:] = [transpose_bar(b, r) for b in p]
    for sec in song.get('sections', []):
        if 'bars' in sec: sec['bars'] = [transpose_bar(b, r) for b in sec['bars']]
    if song.get('key'): song['key'] = transpose_name(song['key'], r)
    song['capo'] = (song.get('capo') or 0) + r
    song.pop('shapes', None)
    song['keySource'] = f'anteprima del disco: accordi +{r} (forme con capotasto al {song["capo"]}° tasto)'
    json.dump(song, open(path, 'w'), ensure_ascii=False, indent=1)


def main():
    args = sys.argv[1:]
    do_fix = '--fix' in args
    workers = int(args[args.index('--workers') + 1]) if '--workers' in args else 3
    ids = [a for i, a in enumerate(args) if not a.startswith('--') and (i == 0 or args[i - 1] != '--workers')]
    if not ids: ids = [e['id'] for e in json.load(open(os.path.join(SONGS, 'index.json')))]

    def run(i):
        try: return analyse(i)
        except Exception as ex: return {'id': i, 'esito': f'errore {type(ex).__name__}: {ex}'[:120]}
    with ThreadPoolExecutor(workers) as ex:
        for res in ex.map(run, ids):
            r = res.get('r')
            decided = r is not None and 1 <= r <= 7 and res['score'] >= 0.6 and res['score'] - res['score0'] >= 0.08
            if decided and do_fix:
                song = json.load(open(os.path.join(SONGS, res['id'] + '.json')))
                if song.get('keySource'): decided = False  # già corretto
                else: fix(res['id'], r)
            res['correggi'] = bool(decided)
            print(json.dumps(res, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
