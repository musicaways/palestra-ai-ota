# Verifica che ogni brano del catalogo abbia il testo sincronizzato su LRCLIB.
# Stampa SOLO numeri (righe, durata): il testo non viene mai mostrato né salvato.
# Uso: python3 tools/checklyrics.py        (dalla cartella del progetto)
import json, os, sys, urllib.request, urllib.parse
HERE = os.path.dirname(os.path.abspath(__file__))
SONGS = os.path.join(HERE, '..', 'songs')
def get(url):
    for _ in range(3):
        try:
            with urllib.request.urlopen(url, timeout=20) as r: return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
        except Exception: pass
    return None
index = json.load(open(os.path.join(SONGS, 'index.json')))
bad = 0
for e in index:
    s = json.load(open(os.path.join(SONGS, e['file'])))
    src = s.get('lyricsSource') or {}
    d = get(f"https://lrclib.net/api/get/{src['lrclibId']}") if src.get('lrclibId') else None
    how = 'id'
    if not (d and d.get('syncedLyrics')):
        q = urllib.parse.urlencode({'artist_name': e['artist'].split(',')[0], 'track_name': e['title']})
        res = [r for r in (get('https://lrclib.net/api/search?' + q) or []) if r.get('syncedLyrics')]
        d = res[0] if res else None
        how = 'ricerca'
    if d and d.get('syncedLyrics'):
        n = sum(1 for ln in d['syncedLyrics'].splitlines() if ln.strip())
        print(f"OK   {e['id']:<48} {how:<8} righe={n:<3} durata={d.get('duration')}")
    else:
        bad += 1
        print(f"MANCA {e['id']}")
print(f"\n{len(index) - bad}/{len(index)} brani con testo sincronizzato")
sys.exit(1 if bad else 0)
