# Pennata di ogni brano, sezione per sezione.
#   1. se Ultimate Guitar ha la pennata trascritta (tab_view.strummings) la si usa, adattata al nostro BPM
#   2. altrimenti una stima musicale da genere, tempo e metro, con strofa più leggera e ritornello più pieno
# Formato: 8 crome per battuta in 4/4 (6 in 3/4), 16 caratteri se servono le semicrome.
#   D giù · U su · X stoppata · P palm muting · B solo basso · - pausa
# Uso: python3 tools/strumpass.py [id ...] [--no-ug] [--solo-stime] [--workers 4]
import json, os, re, sys, zlib
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SONGS = os.path.join(ROOT, 'songs')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

CODE = {1: 'D', 3: 'D', 101: 'U', 103: 'U', 202: '-', 0: '-', 2: 'U', 102: 'U', 201: 'X', 4: 'X', 104: 'X'}


def ug_patterns(song):
    """{ parte: pattern } dalla pagina di accordi di Ultimate Guitar, o None."""
    try:
        import ugsource
        artist = re.split(r',| feat\.? | & ', song['artist'])[0]
        for url in ugsource.search(artist, song['title'])[:3]:
            d = ugsource._store(ugsource._get(url))
            tv = (d or {}).get('store', {}).get('page', {}).get('data', {}).get('tab_view', {})
            st = tv.get('strummings') or []
            if st: return st
    except Exception:
        return None
    return None


def convert(st, song):
    """Una voce "strummings" di UG → pattern per una nostra battuta."""
    bpb = song.get('timeSignature', [4])[0]
    ms = [CODE.get(m.get('measure'), '-') for m in st.get('measures', [])]
    if not ms or 'D' not in ms and 'U' not in ms: return None
    den = st.get('denuminator') or 8
    per_beat = den // 4 * (1.5 if st.get('is_triplet') else 1)
    slots = int(per_beat * bpb)
    ratio = (st.get('bpm') or song['bpm']) / song['bpm']
    # UG usa a volte il tempo doppio o dimezzato rispetto alla nostra griglia
    if 1.6 < ratio < 2.4: slots *= 2
    elif 0.4 < ratio < 0.625: slots //= 2
    if slots <= 0: return None
    seq = (ms * (slots // len(ms) + 1))[:slots]
    pat = ''.join(seq)
    # 16 caratteri con le semicrome tutte vuote → 8
    if len(pat) == 16 and all(c == '-' for c in pat[1::2]): pat = pat[0::2]
    if len(pat) == 12 and bpb == 4 and all(c == '-' for c in pat[1::3]): pat = pat  # terzine: si tengono
    return pat


def section_kind(name):
    n = name.lower()
    if n.startswith('rit') or 'chorus' in n: return 'chorus'
    if n.startswith('pre'): return 'pre'
    if n.startswith('intro'): return 'intro'
    if n.startswith('fin') or 'outro' in n: return 'outro'
    if n.startswith('ponte') or 'bridge' in n: return 'bridge'
    if n.startswith('strum') or 'solo' in n: return 'inst'
    return 'verse'


def part_kind(part):
    p = (part or '').lower()
    if 'chorus' in p and 'verse' not in p: return 'chorus'
    if 'verse' in p and 'chorus' not in p: return 'verse'
    if 'bridge' in p: return 'bridge'
    if 'intro' in p and 'verse' not in p: return 'intro'
    if 'outro' in p: return 'outro'
    return 'all'


# Varianti per stile: ogni brano ne prende una in modo stabile (dal titolo), così brani simili non suonano uguali.
# Ogni variante: (strofa, ritornello, intro, ponte)
STYLES = {
    '34': [('B-D-D-', 'D-DUDU', 'D-----', 'D-D-D-'), ('D--UDU', 'D-DUDU', 'D-----', 'D-DUDU'), ('B-DUDU', 'D-DUDU', 'B-----', 'D-D-D-'),
           ('D-D-DU', 'DUDUDU', 'D-----', 'D-DUDU')],
    '68': [('D-UD-U', 'D-UD-U', 'D-----', 'D--D--'), ('D--D-U', 'D-UD-U', 'D-----', 'D-UD-U'), ('B-UD-U', 'DUUDUU', 'D-----', 'D-UD-U')],
    'reggae': [('--X---X-', '--X-D-X-', '--X---X-', '--XU--XU'), ('--XU--XU', '--X-D-XU', '--X---X-', '--X---X-')],
    'rap': [('D--D--D-', 'D--D-UDU', 'D-------', 'D---D---'), ('D--D-UD-', 'D--D-UDU', 'D-------', 'D--D--D-'),
            ('B--D-UD-', 'D-DUXUDU', 'B-------', 'D--D--D-'), ('D---D-DU', 'D--D-UDU', 'D-------', 'D---D---'),
            ('P-PP-PP-', 'D--D-UDU', 'P-------', 'D--D--D-')],
    'hardrock': [('PPPPPPPP', 'DDDDDDDD', 'DDDDDDDD', 'D-D-D-DU'), ('PPPP-PPU', 'DDDDDDDU', 'D-D-D-D-', 'D-DUDUDU'),
                 ('D-PPD-PP', 'DDDDDDDD', 'D-------', 'D-D-D-DU'), ('PPPPDDDD', 'D-DUDUDU', 'DDDDDDDD', 'D-D-D-D-')],
    'rock': [('D-D-D-DU', 'D-DUDUDU', 'D---D---', 'D-DU-UDU'), ('D-DU-UDU', 'DDDDDDDU', 'D---D-DU', 'D-D-D-DU'),
             ('D--UD-DU', 'D-DUDUDU', 'D-------', 'D-DU-UDU'), ('P-P-D-DU', 'D-DUDUDU', 'D---D---', 'D-D-D-DU')],
    'poprock': [('D-DU-UDU', 'D-DUDUDU', 'D---D-DU', 'D-D-D-DU'), ('D-DUXUDU', 'DDDDDDDU', 'D-------', 'D-DU-UDU'),
                ('D--UD-DU', 'D-DUDUDU', 'D---D---', 'D-D-D-DU'), ('D-D-DUDU', 'D-DUXUDU', 'D---D-DU', 'D-DU-UDU')],
    'folk_slow': [('B-DU-UDU', 'D-DU-UDU', 'B---D---', 'D---D-DU'), ('B---D-DU', 'D-DU-UDU', 'B-------', 'D-D-D-D-'),
                  ('D---D-DU', 'D-DUDUDU', 'D-------', 'B-DU-UDU'), ('B-D-B-DU', 'D-DU-UDU', 'B---B---', 'D---D-DU')],
    'folk': [('D-DU-UDU', 'D-DUDUDU', 'D---D-DU', 'D-D-D-DU'), ('B-DU-UDU', 'D-DUDUDU', 'B---D---', 'D-DU-UDU'),
             ('D-D-DUDU', 'D-DU-UDU', 'D---D-DU', 'D-D-D-D-'), ('D--UDUDU', 'D-DUDUDU', 'D-------', 'D-DU-UDU')],
    'indie': [('D-DUXUDU', 'D-DUDUDU', 'D---D-DU', 'D-DU-UDU'), ('D-DU-UDU', 'D-DUXUDU', 'D-------', 'D-D-D-DU'),
              ('D--UXUDU', 'DDDDDDDU', 'D---D---', 'D-DU-UDU'), ('P-PU-UPU', 'D-DUDUDU', 'P-------', 'D-DU-UDU')],
    'ballad': [('D---D-DU', 'D-DU-UDU', 'D-------', 'D---D---'), ('B---D-DU', 'D-DU-UDU', 'B-------', 'D-D-D-D-'),
               ('D-------', 'D---D-DU', 'D-------', 'D---D---'), ('B-DU-UDU', 'D-DUDUDU', 'B---D---', 'D---D-DU')],
    'pop': [('D-DU-UDU', 'D-DUDUDU', 'D---D-DU', 'D-D-D-DU'), ('D-DUXUDU', 'D-DUDUDU', 'D-------', 'D-DU-UDU'),
            ('D--UD-DU', 'D-DU-UDU', 'D---D---', 'D-D-D-DU'), ('B-DUXUDU', 'D-DUDUDU', 'B---D---', 'D-DU-UDU')],
    'dance': [('D-D-D-D-', 'D-DU-UDU', 'D---D---', 'D-D-D-DU'), ('--X---X-', 'D-DUXUDU', 'D-------', 'D-D-D-D-'),
              ('D-XUD-XU', 'D-DUXUDU', 'D---D---', 'D-D-D-D-'), ('-UDU-UDU', 'D-DUDUDU', 'D-------', 'D-DU-UDU')],
}


def heuristic(song):
    """{ tipo di sezione: pattern } stimati da metro, genere e tempo, con una variante scelta dal titolo."""
    g = (song.get('genre') or '').lower()
    b = song.get('bpm') or 100
    bpb = song.get('timeSignature', [4])[0]
    if bpb == 3: style = '34'
    elif bpb == 6: style = '68'
    elif 'reggae' in g or 'ska' in g: style = 'reggae'
    elif 'rap' in g or 'hip' in g or 'trap' in g: style = 'rap'
    elif re.search(r'^(rock|metal|punk)|grunge|hard', g) and 'pop' not in g: style = 'hardrock' if b >= 115 else 'rock'
    elif 'rock' in g: style = 'poprock'
    elif re.search(r'cantautor|folk|country|acust', g): style = 'folk_slow' if b < 90 else 'folk'
    elif 'indie' in g: style = 'indie'
    elif re.search(r'dance|elettr|disco|funk|edm', g): style = 'dance'
    elif b < 80: style = 'ballad'
    else: style = 'pop'
    pool = STYLES[style]
    v, c, i, br = pool[zlib.crc32((song['artist'] + '|' + song['title']).encode()) % len(pool)]
    return {'verse': v, 'chorus': c, 'intro': i, 'outro': i, 'bridge': br}


def process(sid, use_ug=True):
    path = os.path.join(SONGS, sid + '.json')
    song = json.load(open(path))
    if song.get('strumSource') == 'utente': return sid, 'saltato (scelto a mano)'
    if 'bars' not in (song.get('sections') or [{}])[0]: return sid, 'saltato (formato a pattern)'
    pats, source = None, 'stima'
    if use_ug:
        st = ug_patterns(song)
        if st:
            conv = {}
            for x in st:
                p = convert(x, song)
                if p: conv.setdefault(part_kind(x.get('part')), p)
            if conv:
                base = conv.get('all') or conv.get('verse') or next(iter(conv.values()))
                pats = {'verse': conv.get('verse', base), 'chorus': conv.get('chorus', base), 'bridge': conv.get('bridge', base),
                        'intro': conv.get('intro', base), 'outro': conv.get('outro', base), 'pre': conv.get('verse', base), 'inst': base}
                source = 'ultimate-guitar'
    if not pats:
        h = heuristic(song)
        pats = {k: h.get(k, h['verse']) for k in ('verse', 'chorus', 'bridge', 'intro', 'outro', 'pre', 'inst')}
        pats['pre'] = h['verse']
    song['strum'] = pats['verse']
    for sec in song['sections']:
        k = section_kind(sec['name'])
        p = pats.get(k, pats['verse'])
        if p != song['strum']: sec['strum'] = p
        else: sec.pop('strum', None)
    song['strumSource'] = source
    json.dump(song, open(path, 'w'), ensure_ascii=False, indent=1)
    return sid, f"{source}: {song['strum']} / rit. {pats['chorus']}"


def main():
    args = sys.argv[1:]
    use_ug = '--no-ug' not in args
    only_est = '--solo-stime' in args
    workers = int(args[args.index('--workers') + 1]) if '--workers' in args else 4
    ids = [a for i, a in enumerate(args) if not a.startswith('--') and (i == 0 or args[i - 1] != '--workers')]
    if not ids: ids = [e['id'] for e in json.load(open(os.path.join(SONGS, 'index.json')))]
    if only_est:  # si riprova UG solo per i brani rimasti con la pennata stimata
        ids = [i for i in ids if json.load(open(os.path.join(SONGS, i + '.json'))).get('strumSource') == 'stima']
    with ThreadPoolExecutor(workers) as ex:
        res = list(ex.map(lambda i: process(i, use_ug), ids))
    from collections import Counter
    print('\n'.join(f'{a}: {b}' for a, b in res))
    print(Counter(b.split(':')[0] for _, b in res))


if __name__ == '__main__':
    main()
