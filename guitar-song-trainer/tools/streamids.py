# ID del brano su Spotify per ogni canzone del catalogo (sorgente audio alternativa a YouTube, la versione del disco).
# Deezer (ricerca gratuita) → codice ISRC → MusicBrainz (collegamento "free streaming" verso Spotify).
# Scrive solo spotifyId (e deezerId) nel JSON del brano. Uso: python3 tools/streamids.py [id ...] [--tutti]
import json, os, re, sys, time, unicodedata, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SONGS = os.path.join(ROOT, 'songs')
UA = {'User-Agent': 'GuitarSongTrainer/2.0 (https://github.com/musicaways/guitar-song-trainer)'}


def get(url, tries=4):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r:
                return json.load(r)
        except Exception:
            if k == tries - 1: raise
            time.sleep(2 * (k + 1))


def norm(s):
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'\(.*?\)|\[.*?\]', ' ', s)
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def pick(results, song, duration):
    t = norm(song['title'])
    a = norm(re.split(r',| feat\.? | & ', song['artist'])[0])
    ok = [x for x in results if (norm(x.get('title')).startswith(t) or norm(x.get('title_short')) == t)
          and (not a or a in norm(x.get('artist', {}).get('name')) or norm(x.get('artist', {}).get('name')) in a)
          and (not duration or abs(x.get('duration', 0) - duration) <= 10)]
    ok.sort(key=lambda x: abs(x.get('duration', 0) - duration))
    return ok[0] if ok else None


def lrc_duration(song):
    d = (song.get('lyricsSource') or {}).get('duration')
    if d: return d
    lid = (song.get('lyricsSource') or {}).get('lrclibId')
    if not lid: return 0
    try: return get(f'https://lrclib.net/api/get/{lid}').get('duration') or 0
    except Exception: return 0


def process(sid, force=False):
    path = os.path.join(SONGS, sid + '.json')
    song = json.load(open(path))
    if song.get('spotifyId') and not force: return 'già presente'
    dur = lrc_duration(song)
    artist = re.split(r',', song['artist'])[0]
    tr = None
    for q in (f'artist:"{artist}" track:"{song["title"]}"', f'{artist} {song["title"]}'):
        res = get('https://api.deezer.com/search?limit=10&q=' + urllib.parse.quote(q)).get('data') or []
        tr = pick(res, song, dur)
        if tr: break
        time.sleep(0.2)
    if not tr: return 'non su Deezer'
    isrc = get(f'https://api.deezer.com/track/{tr["id"]}').get('isrc')
    song['deezerId'] = tr['id']
    sp = None
    if isrc:
        time.sleep(1.05)  # MusicBrainz: una richiesta al secondo
        mb = get(f'https://musicbrainz.org/ws/2/isrc/{isrc}?inc=url-rels&fmt=json')
        for rec in mb.get('recordings', []):
            for rel in rec.get('relations', []):
                m = re.search(r'open\.spotify\.com/track/([A-Za-z0-9]{22})', rel.get('url', {}).get('resource', ''))
                if m and not sp: sp = m.group(1)
    if sp: song['spotifyId'] = sp
    json.dump(song, open(path, 'w'), ensure_ascii=False, indent=1)
    return f'spotify {sp}' if sp else 'solo Deezer'


def main():
    args = sys.argv[1:]
    force = '--tutti' in args
    ids = [a for a in args if not a.startswith('--')] or [e['id'] for e in json.load(open(os.path.join(SONGS, 'index.json')))]
    from collections import Counter
    c = Counter()
    for i in ids:
        try: r = process(i, force)
        except Exception as ex: r = f'errore {type(ex).__name__}'
        c[r.split(' ')[0]] += 1
        print(f'{i}: {r}', flush=True)
    print(c)


if __name__ == '__main__':
    main()
