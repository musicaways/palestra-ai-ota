# Intro strumentali riempite con un solo accordo per molte battute (la pagina non riportava gli accordi dell'intro
# e il generatore stirava il primo accordo): si usa il giro della prima parte cantata, ripetuto e allineato in modo
# che finisca proprio dove comincia il canto (di solito l'intro suona il giro della strofa).
# Uso: python3 tools/introfix.py [id ...] [--fix] [--min 8]
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SONGS = os.path.join(ROOT, 'songs')


def key(b): return ','.join(b) if isinstance(b, list) else b


def cycle_of(bars):
    """Il giro della parte: le prime 4 o 8 battute (quelle che si ripetono), senza "%" iniziali."""
    for p in (4, 8, 2):
        if len(bars) >= 2 * p and [key(b) for b in bars[:p]] == [key(b) for b in bars[p:2 * p]]: return bars[:p]
    return bars[:8] if len(bars) >= 8 else bars[:4]


def process(sid, do_fix, min_run):
    path = os.path.join(SONGS, sid + '.json')
    song = json.load(open(path))
    secs = song.get('sections') or []
    if len(secs) < 2 or 'bars' not in secs[0] or 'bars' not in secs[1] or song.get('introSource'): return None
    intro = secs[0]['bars']
    flat = [key(b) for b in intro]
    if len(intro) < min_run or any(x not in (flat[0], '%') for x in flat): return None
    cyc = cycle_of(secs[1]['bars'])
    if len({key(b) for b in cyc if b != '%'}) < 2: return None
    if cyc[0] == '%': cyc = [next((b for b in secs[1]['bars'] if b != '%'), flat[0])] + cyc[1:]
    n = len(intro)
    new = [cyc[(i - n) % len(cyc)] for i in range(n)]
    # la prima battuta non può essere "%": accordo che prosegue da prima del brano
    if new[0] == '%':
        k = (0 - n) % len(cyc)
        while cyc[k] == '%': k = (k - 1) % len(cyc)
        new[0] = cyc[k]
    if do_fix:
        secs[0]['bars'] = new
        song['introSource'] = 'stima: giro della prima parte cantata (la fonte non riportava gli accordi dell\'intro)'
        json.dump(song, open(path, 'w'), ensure_ascii=False, indent=1)
    return f'{sid}: {len(intro)} battute di {flat[0]} → giro di {len(cyc)} battute'


def main():
    args = sys.argv[1:]
    do_fix = '--fix' in args
    min_run = int(args[args.index('--min') + 1]) if '--min' in args else 8
    ids = [a for i, a in enumerate(args) if not a.startswith('--') and (i == 0 or args[i - 1] != '--min')]
    if not ids: ids = [e['id'] for e in json.load(open(os.path.join(SONGS, 'index.json')))]
    n = 0
    for i in ids:
        r = process(i, do_fix, min_run)
        if r: n += 1; print(r)
    print(f'{n} intro {"corrette" if do_fix else "da correggere"}')


if __name__ == '__main__':
    main()
