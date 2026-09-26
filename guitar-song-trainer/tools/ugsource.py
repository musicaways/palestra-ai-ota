# Seconda fonte di accordi: Ultimate Guitar (pagine "Chords"). Restituisce la stessa struttura di
# parse_chord_page di autosong: [('c', [accordi]) | ('l', riga normalizzata) | ('h', intestazione)].
# Il testo serve solo in memoria per l'allineamento con LRCLIB: non viene stampato né salvato.
import html, json, re, urllib.parse, urllib.request, unicodedata

UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36'}


def _get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read().decode('utf-8', 'ignore')


def _store(page):
    m = re.search(r'class="js-store" data-content="([^"]+)"', page)
    return json.loads(html.unescape(m.group(1))) if m else None


def _norm(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def search(artist, title):
    """Pagine di accordi candidate, le più votate prima."""
    q = urllib.parse.quote_plus(f'{artist} {title}')
    data = _store(_get(f'https://www.ultimate-guitar.com/search.php?search_type=title&value={q}'))
    if not data: return []
    res = data.get('store', {}).get('page', {}).get('data', {}).get('results', []) or []
    a0, t0 = _norm(artist), _norm(title)
    out = []
    for r in res:
        if r.get('type') != 'Chords' or not r.get('tab_url', '').startswith('https://tabs.'): continue
        if _norm(r.get('artist_name', '')).split(' ')[0] not in a0 and a0.split(' ')[0] not in _norm(r.get('artist_name', '')): continue
        if t0[:12] not in _norm(r.get('song_name', '')) and _norm(r.get('song_name', ''))[:12] not in t0: continue
        out.append((r.get('rating', 0) * min(r.get('votes', 0), 200), r['tab_url']))
    out.sort(reverse=True)
    return [u for _, u in out]


HEAD = re.compile(r'^\[(intro|verse|chorus|pre-chorus|prechorus|bridge|outro|solo|interlude|instrumental|hook|refrain|strofa|ritornello|ponte|coda)[^\]]*\]$', re.I)
HEAD_IT = {'verse': 'strofa', 'chorus': 'ritornello', 'refrain': 'ritornello', 'hook': 'ritornello', 'pre-chorus': 'pre-rit', 'prechorus': 'pre-rit',
           'bridge': 'ponte', 'outro': 'finale', 'instrumental': 'strumentale', 'interlude': 'interludio'}


def chord_items(url):
    data = _store(_get(url))
    if not data: return None, None
    tab = data.get('store', {}).get('page', {}).get('data', {}).get('tab_view', {}).get('wiki_tab', {})
    content = tab.get('content') or ''
    items = []
    for raw in content.replace('\r', '').split('\n'):
        ln = raw.replace('[tab]', '').replace('[/tab]', '')
        s = ln.strip()
        if not s: continue
        m = HEAD.match(s)
        if m:
            k = m.group(1).lower()
            items.append(('h', HEAD_IT.get(k, k)))
            continue
        chords = re.findall(r'\[ch\](.*?)\[/ch\]', s)
        rest = re.sub(r'\[ch\].*?\[/ch\]', '', s)
        rest = re.sub(r'[\s|/x0-9()%-]', '', rest)
        if chords and not rest:
            items.append(('c', chords))
        elif not chords:
            items.append(('l', re.sub(r'[^a-z]+', '', _norm(s))))
        else:
            # accordi dentro la riga di testo (formato raro): accordi e riga separati
            items.append(('c', chords))
            items.append(('l', re.sub(r'[^a-z]+', '', _norm(re.sub(r'\[ch\].*?\[/ch\]', '', s)))))
    capo = 0
    meta = data.get('store', {}).get('page', {}).get('data', {}).get('tab', {})
    try: capo = int(tab.get('capo') or meta.get('capo') or 0)
    except Exception: pass
    return items, capo


if __name__ == '__main__':
    import sys
    urls = search(sys.argv[1], sys.argv[2])
    print('risultati', len(urls), urls[:2])
    if urls:
        items, capo = chord_items(urls[0])
        print('righe', len(items), 'accordi', sum(1 for i in items if i[0] == 'c'), 'testo', sum(1 for i in items if i[0] == 'l'), 'capo', capo)
        print([i[1] for i in items if i[0] != 'l'][:12])
