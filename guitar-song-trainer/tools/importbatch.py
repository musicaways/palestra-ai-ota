# Importa brani in serie, dall'inizio alla fine:
#   1. genera ogni brano con autosong.py (in parallelo)
#   2. applica i criteri di qualità (righe con accordi, aggancio, durata del video, video non già usato)
#   3. aggiunge i brani accettati a songs/index.json, cancella gli scartati
#   4. sincronizza: ancore sul canto (lrcwarp) e, per i brani ancora incoerenti, aggancio stretto riga per riga
# Il testo delle canzoni non viene mai stampato né salvato.
#
# Uso:  python3 tools/importbatch.py lista.txt [--workers 4]
#   lista.txt: una riga per brano  "Artista|Titolo|Genere|Anno"   (anno facoltativo)
import argparse, json, os, re, subprocess, sys, unicodedata
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SONGS = os.path.join(ROOT, 'songs')


def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def generate(line):
    parts = [p.strip() for p in line.split('|')]
    artist, title = parts[0], parts[1]
    genre = parts[2] if len(parts) > 2 and parts[2] else 'Pop'
    cmd = ['python3', os.path.join(ROOT, 'tools', 'autosong.py'), '--artist', artist, '--title', title, '--genre', genre, '--write']
    if len(parts) > 3 and parts[3]: cmd += ['--year', parts[3]]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=180, env=dict(os.environ, AUTOSONG_NOINDEX='1'))
        first = (out.stdout.strip().splitlines() or ['{}'])[0]
        return json.loads(first) if first.startswith('{') else {'id': f'{slug(artist)}-{slug(title)}', 'errore': 'eccezione'}
    except Exception as e:
        return {'id': f'{slug(artist)}-{slug(title)}', 'errore': str(e)[:60]}


def verdict(r, used_videos):
    if 'errore' in r: return r['errore']
    w, n = map(int, r['righe_con_accordi'].split('/'))
    why = []
    if w / max(1, n) < 0.7: why.append('poche righe con accordi')
    if r['agganciate'] / max(1, r['righe_pagina']) < 0.45: why.append('pagina accordi diversa dalla versione del testo')
    if not r.get('yt'): why.append('niente video')
    elif r.get('ytdur') is not None and abs(r['ytdur'] - r['dur']) > 10: why.append('video di durata diversa')
    elif r['yt'] in used_videos: why.append('video già usato da un altro brano')
    if len(r.get('accordi', [])) < 2: why.append('meno di 2 accordi')
    return ', '.join(why)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('lista')
    ap.add_argument('--workers', type=int, default=4)
    a = ap.parse_args()
    index = json.load(open(os.path.join(SONGS, 'index.json')))
    have = {e['id'] for e in index}
    lines = [l.strip() for l in open(a.lista) if l.strip() and not l.startswith('#')]
    todo = [l for l in lines if f"{slug(l.split('|')[0])}-{slug(l.split('|')[1])}" not in have]
    print(f'{len(todo)} brani da importare ({len(lines) - len(todo)} già in libreria)')
    with ThreadPoolExecutor(a.workers) as ex:
        results = list(ex.map(generate, todo))
    used = {e.get('youtubeId') for e in index}
    ok = []
    for r in results:
        why = verdict(r, used)
        path = os.path.join(SONGS, r['id'] + '.json')
        if why:
            print(f"  ✗ {r['id']}: {why}")
            if r['id'] not in have and os.path.exists(path): os.remove(path)
            continue
        s = json.load(open(path))
        used.add(s['youtubeId'])
        e = {'id': r['id'], 'file': r['id'] + '.json', 'title': s['title'], 'artist': s['artist'], 'album': s['album'],
             'genre': s['genre'], 'year': s.get('year'), 'difficulty': s['difficulty'], 'key': s['key'], 'youtubeId': s['youtubeId']}
        if e['year'] is None: del e['year']
        index.append(e)
        ok.append(r['id'])
    json.dump(index, open(os.path.join(SONGS, 'index.json'), 'w'), ensure_ascii=False, indent=2)
    open(os.path.join(SONGS, 'index.json'), 'a').write('\n')
    print(f'accettati {len(ok)}, scartati {len(results) - len(ok)}, libreria {len(index)}')
    if not ok: return
    # sincronia di default
    node = lambda *args: subprocess.run(['node', os.path.join(ROOT, 'tools', args[0]), *args[1:]], capture_output=True, text=True).stdout
    node('lrcwarp.mjs', *ok, '--write')
    chk = node('checksync.mjs', *ok)
    low = [l.split()[1] for l in chk.splitlines() if l.startswith('CHK')]
    if low:
        node('lrcwarp.mjs', *low, '--lock', '--write')
        chk = node('checksync.mjs', *ok)
    good = sum(1 for l in chk.splitlines() if l.startswith('OK'))
    print(f'sincronia: {good}/{len(ok)} coerenti (aggancio stretto per {len(low)})')


if __name__ == '__main__':
    main()
