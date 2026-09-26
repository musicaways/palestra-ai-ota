# Genera un brano completo e sincronizzato a partire da:
#   - una pagina pubblica di accordi (accordiespartiti.it): accordi riga per riga
#   - LRCLIB: l'istante in cui inizia ogni riga cantata
#   - songbpm.com: BPM, tonalità, durata
#   - YouTube: l'id del video (primo risultato con durata compatibile)
# Le righe di testo servono SOLO in memoria per allineare la pagina degli accordi con LRCLIB:
# non vengono mai stampate né salvate. Nel file del brano finiscono solo accordi, tempi e metadati.
#
# Uso:
#   python3 tools/autosong.py --artist "Vasco Rossi" --title "Albachiara" [--chords-artist "rossi vasco"]
#          [--genre "Rock"] [--beats 4] [--bpm 145] [--yt ID] [--year 1979] [--write]
# Senza --write stampa solo il riepilogo (numeri, nessun testo).
import argparse, difflib, html, json, math, os, re, sys, unicodedata, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8'}

def fetch(url, tries=3):
    err = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=25) as r:
                return r.read().decode('utf-8', 'ignore'), r.geturl()
        except Exception as e:
            err = e
            import time; time.sleep(2 + 3 * i)
    raise err

def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')

def normtext(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z]+', '', s)

# ---------------- accordi ----------------
IT = {'DO': 'C', 'RE': 'D', 'MI': 'E', 'FA': 'F', 'SOL': 'G', 'LA': 'A', 'SI': 'B'}
CHORD = re.compile(r'^(?:[A-G]|DO|RE|MI|FA|SOL|LA|SI)(?:#|b)?(?:m|min|maj|dim|aug|sus|add|M|-|\+|\d|/|[A-G](?:#|b)?|°|ø)*$')
HEAD = re.compile(r'^\s*[\[\(]?\s*(intro|strofa|rit\.?|ritornello|chorus|verse|bridge|ponte|pre[- ]?rit\w*|special|solo|finale|outro|coda|strumentale|interludio)\b[^a-z]*$', re.I)
REP = re.compile(r'^[x×]\s*\d$|^\d\s*[x×]$', re.I)

def clean_chord(tok):
    m = re.match(r'^(DO|RE|MI|FA|SOL|LA|SI)(.*)$', tok)
    if m: tok = IT[m.group(1)] + m.group(2)
    tok = tok.replace('min', 'm').replace('°', 'dim').replace('ø', 'm7b5')
    tok = re.sub(r'^([A-G][#b]?)-', r'\1m', tok)
    tok = tok.replace('7+', 'maj7').replace('M7', 'maj7')
    tok = re.sub(r'^([A-G][#b]?)\+$', r'\1aug', tok)
    return tok

def parse_chord_page(page):
    m = re.search(r'<pre[^>]*>(.*?)</pre>', page, re.S)
    if not m: return None
    txt = html.unescape(re.sub(r'<[^>]+>', '', m.group(1)))
    items = []
    for ln in txt.splitlines():
        s = ln.strip()
        if not s: continue
        toks = [t for t in re.split(r'[\s|]+', s.replace('(', ' ').replace(')', ' ')) if t]
        if toks and all(CHORD.match(t) or REP.match(t) or t == '%' for t in toks):
            chords = []
            for t in toks:
                if REP.match(t):
                    n = int(re.sub(r'\D', '', t)); chords = chords * n
                elif t != '%': chords.append(clean_chord(t))
            if chords: items.append(('c', chords))
        elif HEAD.match(s):
            items.append(('h', HEAD.match(s).group(1).lower()))
        else:
            items.append(('l', normtext(s)))
    return items

def capo_from_page(page):
    m = re.search(r'capo(?:tasto)?[^0-9<]{0,20}(\d)', page, re.I)
    return int(m.group(1)) if m and 0 < int(m.group(1)) < 8 else 0

# ---------------- LRCLIB ----------------
def lrc_lines(lrc):
    out = []
    for ln in lrc.splitlines():
        m = re.match(r'\[(\d+):(\d+(?:\.\d+)?)\](.*)', ln)
        if m: out.append((int(m.group(1)) * 60 + float(m.group(2)), m.group(3).strip()))
    return out

def lrclib_pick(artist, title, target=None):
    q = urllib.parse.urlencode({'artist_name': artist, 'track_name': title})
    res = json.loads(fetch('https://lrclib.net/api/search?' + q)[0])
    res = [r for r in res if r.get('syncedLyrics') and normtext(title)[:10] in normtext(r['trackName'])]
    if not res:
        res = json.loads(fetch('https://lrclib.net/api/search?' + urllib.parse.urlencode({'q': f'{artist} {title}'}))[0])
        res = [r for r in res if r.get('syncedLyrics')]
    if not res: return None
    if target: res.sort(key=lambda r: abs(r['duration'] - target))
    else:
        # la durata più comune (versione album), non live o remix
        from collections import Counter
        c = Counter(round(r['duration'] / 4) for r in res)
        common = c.most_common(1)[0][0]
        res.sort(key=lambda r: (abs(round(r['duration'] / 4) - common), 'live' in (r.get('albumName') or '').lower()))
    return res[0]

# ---------------- songbpm ----------------
def songbpm(artist, title):
    for url in (f'https://songbpm.com/@{slug(artist)}/{slug(title)}',):
        try:
            page, _ = fetch(url, tries=2)
        except Exception:
            continue
        m = re.search(r'tempo of <span[^>]*>(\d+) BPM', page)
        if not m: continue
        out = {'bpm': float(m.group(1))}
        k = re.search(r'with a <span[^>]*>([A-G][#♯b♭]?)</span> key and a <span[^>]*>(major|minor)', page)
        if k: out['key'] = k.group(1).replace('♯', '#').replace('♭', 'b') + ('m' if k.group(2) == 'minor' else '')
        d = re.search(r'runs <span[^>]*>(\d+) minutes? and (\d+) seconds?', page)
        if d: out['duration'] = int(d.group(1)) * 60 + int(d.group(2))
        return out
    return None

# ---------------- YouTube ----------------
def youtube(artist, title, dur):
    q = urllib.parse.quote_plus(f'{artist} {title} official')
    page, _ = fetch(f'https://www.youtube.com/results?search_query={q}&hl=it')
    cands = []
    for chunk in page.split('"videoRenderer":{"videoId":"')[1:]:
        vid = chunk[:11]
        chunk = chunk[:20000]
        L = re.search(r'"lengthText":\{.*?"simpleText":"(?:(\d+):)?(\d+):(\d+)"', chunk, re.S)
        t = re.search(r'"title":\{"runs":\[\{"text":"([^"]*)"', chunk)
        if not L: continue
        h, mm, ss = L.groups()
        cands.append((vid, int(h or 0) * 3600 + int(mm) * 60 + int(ss), t.group(1) if t else ''))
    def embeddable(vid):
        try:
            fetch(f'https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v={vid}', tries=1)
            return True
        except Exception:
            return False
    cands = [c for c in cands[:10]]
    ok = [c for c in cands if dur is None or abs(c[1] - dur) <= 20]
    # la durata più vicina alla versione del testo sincronizzato: così audio e righe combaciano
    ok.sort(key=lambda c: (bool(re.search(r'live|cover|karaoke|reaction|piano|remix|sped|slowed|8d', c[2], re.I)), abs(c[1] - dur) > 4 if dur else 0, abs(c[1] - dur) if dur else 0))
    for vid, d, t in ok:
        if embeddable(vid): return vid, d
    for vid, d, t in cands[:8]:
        bad = re.search(r'live|cover|karaoke|lyric|testo|reaction|piano|remix|sped|slowed', t, re.I)
        if not bad and (dur is None or abs(d - dur) <= 20): return vid, d
    for vid, d, t in cands[:8]:
        if dur is None or abs(d - dur) <= 20: return vid, d
    return (cands[0][0], cands[0][1]) if cands else (None, None)

# ---------------- griglia ----------------
def phase_fit(ts, bar):
    c = sum(math.cos(2 * math.pi * t / bar) for t in ts); s = sum(math.sin(2 * math.pi * t / bar) for t in ts)
    return math.hypot(c, s) / len(ts), (math.atan2(s, c) / (2 * math.pi) * bar) % bar

def best_grid(ts, bpm0, beats):
    best = None
    b = bpm0 * 0.97
    while b <= bpm0 * 1.03:
        bar = 60 / b * beats
        r, ph = phase_fit(ts, bar)
        if not best or r > best[0]: best = (r, b, ph)
        b += 0.02
    return best

# ---------------- allineamento pagina ↔ LRCLIB ----------------
def align(page_lines, lrc_texts):
    n, m = len(page_lines), len(lrc_texts)
    sim = lambda a, b: difflib.SequenceMatcher(None, a, b).ratio() if a and b else 0
    INF = -1e9
    S = [[0.0] * (m + 1) for _ in range(n + 1)]
    B = [[None] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1): S[i][0] = S[i - 1][0] - 0.3; B[i][0] = 'u'
    for j in range(1, m + 1): S[0][j] = S[0][j - 1] - 0.1; B[0][j] = 'l'
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            s = sim(page_lines[i - 1], lrc_texts[j - 1])
            opts = [(S[i - 1][j - 1] + (s - 0.55) * 2 if s > 0.55 else INF, 'd'), (S[i - 1][j] - 0.3, 'u'), (S[i][j - 1] - 0.1, 'l')]
            S[i][j], B[i][j] = max(opts)
    pairs = {}
    i, j = n, m
    while i > 0 or j > 0:
        mv = B[i][j]
        if mv == 'd': pairs[i - 1] = j - 1; i -= 1; j -= 1
        elif mv == 'u': i -= 1
        else: j -= 1
    return pairs

def spread(chords, nbars, beats):
    """chords su nbars battute → lista di battute (stringa, lista "C:2" o '%')."""
    if not chords: return ['%'] * nbars
    nbars = max(1, nbars)
    total = nbars * beats
    k = len(chords)
    if k > total: chords = chords[:total]; k = total
    step = 2 if beats == 4 and k <= nbars * 2 else 1
    starts = []
    for j in range(k):
        st = round(j * total / k / step) * step
        if starts and st <= starts[-1]: st = starts[-1] + 1
        starts.append(min(st, total - (k - j)))
    bars = []
    for b in range(nbars):
        lo, hi = b * beats, (b + 1) * beats
        inside = [(starts[j], chords[j]) for j in range(k) if lo <= starts[j] < hi]
        if not inside: bars.append('%'); continue
        # accordo che suona all'inizio della battuta (se il cambio non cade sul battere)
        seg = []
        if inside[0][0] > lo:
            prev = [chords[j] for j in range(k) if starts[j] < lo]
            if prev: seg.append((lo, prev[-1]))
        seg += inside
        if len(seg) == 1: bars.append(seg[0][1]); continue
        parts = []
        for q, (st, c) in enumerate(seg):
            en = seg[q + 1][0] if q + 1 < len(seg) else hi
            parts.append(f'{c}:{en - st}')
        bars.append(parts)
    return bars

def build(items, lrc, bar, offset, beats, duration):
    lrc = [(t, x) for t, x in lrc]
    texts = [normtext(x) for t, x in lrc]
    page_lyric_idx = [k for k, it in enumerate(items) if it[0] == 'l']
    pairs = align([items[k][1] for k in page_lyric_idx], texts)
    # accordi di ogni riga della pagina: la riga di accordi subito sopra
    line_chords = {}
    for p, k in enumerate(page_lyric_idx):
        if k > 0 and items[k - 1][0] == 'c': line_chords[p] = items[k - 1][1]
    # accordi di ogni riga LRC
    lrc_ch = [None] * len(lrc)
    lrc_head = [None] * len(lrc)
    lrc_after = [[] for _ in lrc]  # accordi strumentali dopo la riga
    lead = []  # accordi prima della prima riga (intro)
    matched = 0
    lastj = -1
    for p, k in enumerate(page_lyric_idx):
        j = pairs.get(p)
        if j is None: continue
        matched += 1
        lrc_ch[j] = line_chords.get(p, [])
        # intestazione di sezione più vicina sopra la riga
        q = k - 1
        while q >= 0 and items[q][0] != 'l':
            if items[q][0] == 'h': lrc_head[j] = items[q][1]; break
            q -= 1
    # accordi strumentali: righe di accordi non seguite da testo
    cur = None  # indice LRC dell'ultima riga agganciata
    pos = {k: pairs.get(p) for p, k in enumerate(page_lyric_idx)}
    for k, it in enumerate(items):
        if it[0] == 'l':
            if pos.get(k) is not None: cur = pos[k]
        elif it[0] == 'c':
            nxt = items[k + 1][0] if k + 1 < len(items) else None
            if nxt == 'l': continue
            if cur is None: lead += it[1]
            else: lrc_after[cur] += it[1]
    # righe ripetute non presenti nella pagina (ritornelli abbreviati): copia dalla stessa riga già vista
    seen = {}
    for j, tx in enumerate(texts):
        if lrc_ch[j] is not None and tx: seen.setdefault(tx, lrc_ch[j])
    for j, tx in enumerate(texts):
        if lrc_ch[j] is None and tx in seen: lrc_ch[j] = seen[tx]
    nbars = int(math.ceil((duration - offset) / bar))
    bars = [None] * nbars
    heads = {}
    sung = [j for j in range(len(lrc)) if texts[j]]
    bidx = lambda t: max(0, min(nbars - 1, round((t - offset) / bar)))
    # intro
    first = bidx(lrc[sung[0]][0]) if sung else nbars
    if first > 0:
        intro = lead or next((c for c in lrc_ch if c), ['C'])
        per = max(1, round(first / max(1, len(intro)))) if len(intro) <= first else 1
        seq = []
        while len(seq) < first:
            for c in intro:
                seq += [c] + ['%'] * (per - 1)
        for b in range(first): bars[b] = seq[b]
    for n, j in enumerate(sung):
        b0 = bidx(lrc[j][0])
        b1 = bidx(lrc[sung[n + 1]][0]) if n + 1 < len(sung) else nbars
        if b1 <= b0: b1 = b0 + 1
        ch = lrc_ch[j] if lrc_ch[j] is not None else []
        after = lrc_after[j]
        if n + 1 == len(sung) and not after:
            after = []
        span = b1 - b0
        if after and span > 1:
            # la riga cantata occupa il tempo del canto (circa), il resto va agli accordi strumentali
            gap_t = lrc[sung[n + 1]][0] - lrc[j][0] if n + 1 < len(sung) else duration - lrc[j][0]
            sing = min(gap_t, 0.8 + len(lrc[j][1]) / 11)
            nb = max(1, min(span - 1, round(sing / bar) if ch else 0) or (1 if ch else 0))
            if not ch: nb = 0
            seg = spread(ch, nb, beats) if nb else []
            rest = span - nb
            # accordi strumentali ripetuti per riempire la pausa
            inst = []
            per = 2 if bar < 2.2 else 1
            while len(inst) < rest:
                for c in after: inst += [c] + ['%'] * (per - 1)
            seg += inst[:rest]
        else:
            seg = spread(ch, span, beats)
        for q, v in enumerate(seg):
            if b0 + q < nbars: bars[b0 + q] = v
        if lrc_head[j]: heads[b0] = lrc_head[j]
    # sezioni: separate dalle pause del canto (≥ 1,6 battute) e dalle intestazioni della pagina
    cuts = {0}
    for n in range(1, len(sung)):
        t0, t1 = lrc[sung[n - 1]][0], lrc[sung[n]][0]
        if t1 - t0 >= max(6.0, bar * 2.6): cuts.add(bidx(t1))
    for b in heads: cuts.add(b)
    if first > 0: cuts.add(first)
    cuts = sorted(c for c in cuts if c < nbars)
    for i, v in enumerate(bars):
        if v is None: bars[i] = '%'
    if bars[0] == '%':
        bars[0] = next((b if isinstance(b, str) else b[0].split(':')[0] for b in bars if b != '%'), 'C')
    secs = []
    for i, c in enumerate(cuts):
        e = cuts[i + 1] if i + 1 < len(cuts) else nbars
        h = heads.get(c)
        if secs and (e - c < 6 or (len(secs[-1]['bars']) < 6 and secs[-1]['start'] > 0)) and not (h and h.startswith('rit')):
            secs[-1]['bars'] += bars[c:e]; continue  # sezioni troppo corte: unite alla precedente
        secs.append({'start': c, 'bars': bars[c:e], 'head': heads.get(c)})
    return secs, matched, len(page_lyric_idx), len([j for j in sung if lrc_ch[j] is not None]), len(sung)

def name_sections(secs, first_is_intro):
    def sig(s):
        out = []
        for x in s['bars']:
            c = x if isinstance(x, str) else x[0].split(':')[0]
            if c != '%' and (not out or out[-1] != c): out.append(c)
        return out
    sigs = [sig(s) for s in secs]
    simm = lambda a, b: difflib.SequenceMatcher(None, a[:12], b[:12]).ratio()
    # gruppi di sezioni simili; il gruppo più ripetuto (con almeno 2 elementi) è il ritornello
    group = list(range(len(secs)))
    for i in range(len(secs)):
        for j in range(i):
            if group[j] == j and simm(sigs[i], sigs[j]) >= 0.75 and len(secs[i]['bars']) >= 4:
                group[i] = j; break
    from collections import Counter
    cnt = Counter(group)
    heads = [s['head'] or '' for s in secs]
    chorus_g = None
    for i, h in enumerate(heads):
        if h.startswith('rit') or h == 'chorus': chorus_g = group[i]; break
    if chorus_g is None:
        first_sung = 1 if first_is_intro and len(secs) > 1 else 0
        reps = [g for g in cnt if cnt[g] > 1 and g != group[first_sung] and not (g == 0 and first_is_intro)]
        # fra i gruppi ripetuti, il ritornello di solito non è il primo blocco cantato
        if reps: chorus_g = max(reps, key=lambda g: (cnt[g], g > 1, -g))
    names, n_str = [], 0
    for i, s in enumerate(secs):
        h = heads[i]
        if i == 0 and first_is_intro: nm = 'Intro'
        elif group[i] == chorus_g: nm = 'Ritornello'
        elif h.startswith('pre'): nm = 'Pre-ritornello'
        elif h in ('bridge', 'ponte', 'special'): nm = 'Ponte'
        elif h in ('solo', 'strumentale', 'interludio') and len(s['bars']) <= 12: nm = 'Strumentale'
        else:
            n_str += 1; nm = f'Strofa {n_str}'
        names.append(nm)
    if len(secs) > 2 and names[-1].startswith('Strofa') and len(secs[-1]['bars']) <= 10: names[-1] = 'Finale'
    if n_str == 1: names = ['Strofa' if x == 'Strofa 1' else x for x in names]
    return names

# Qualità che l'app sa diteggiare (vedi QUALITY_ALIASES in js/music.js); le altre si semplificano.
KNOWN_Q = {'', 'M', 'maj', 'm', 'min', '-', '7', 'm7', 'min7', '-7', 'maj7', 'M7', '7+', 'sus4', '4', 'sus', 'sus2', '2',
           '7sus4', '7/4', '74', '5', 'dim', 'aug', '+', '6', 'add9', 'add2'}
SIMPLIFY = {'9': '7', 'm9': 'm7', 'maj9': 'maj7', '7b9': '7', '7#9': '7', '11': '7sus4', '13': '7', 'm11': 'm7', 'm13': 'm7',
            'm6': 'm', '6/9': '6', '69': '6', 'm7b5': 'dim', 'dim7': 'dim', '°7': 'dim', 'mmaj7': 'm', 'm(maj7)': 'm', 'madd9': 'm',
            'add11': '', 'add4': '', '7sus2': 'sus2', 'sus9': 'sus2', 'maj7sus2': 'sus2', '5+': 'aug', '7+5': 'aug', 'aug7': '7',
            'mmaj9': 'm', 'm7b9': 'm7', '6sus4': 'sus4', 'm7sus4': '7sus4', '4/7': '7sus4', 'sus4/7': '7sus4', '9sus4': '7sus4'}
def fix_chord(c):
    m = re.match(r'^([A-G][#b]?)([^/]*)(?:/([A-G][#b]?))?$', c)
    if not m: return None
    root, q, bass = m.groups()
    if q not in KNOWN_Q:
        q = SIMPLIFY.get(q, 'm' if q.startswith('m') and not q.startswith('maj') else ('7' if '7' in q else ''))
    return root + q + ('/' + bass if bass else '')

def fix_bars(secs):
    for s in secs:
        out = []
        for b in s['bars']:
            if isinstance(b, str):
                out.append(b if b == '%' else (fix_chord(b) or '%'))
            else:
                parts = []
                for x in b:
                    c, n = x.split(':')
                    f = fix_chord(c)
                    if f: parts.append(f'{f}:{n}')
                out.append(parts if len(parts) > 1 else (parts[0].split(':')[0] if parts else '%'))
        s['bars'] = out

def chord_names(secs):
    out = []
    for s in secs:
        for b in s['bars']:
            for x in ([b] if isinstance(b, str) else b):
                c = x.split(':')[0]
                if c != '%': out.append(c)
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--artist', required=True); ap.add_argument('--title', required=True)
    ap.add_argument('--chords-artist'); ap.add_argument('--chords-title'); ap.add_argument('--chords-url')
    ap.add_argument('--genre', default='Pop'); ap.add_argument('--beats', type=int, default=4)
    ap.add_argument('--bpm', type=float); ap.add_argument('--yt'); ap.add_argument('--year', type=int)
    ap.add_argument('--album'); ap.add_argument('--lrclib', type=int); ap.add_argument('--id')
    ap.add_argument('--difficulty', type=int); ap.add_argument('--notes', default='')
    ap.add_argument('--write', action='store_true')
    a = ap.parse_args()
    if a.chords_url: urls = [a.chords_url]
    else:
        art = a.chords_artist or re.split(r',| feat\.? | & | e ', a.artist)[0]
        w = slug(art).split('-')
        arts = [slug(art)] + (['-'.join(w[1:] + w[:1])] if len(w) == 2 else []) + (['-'.join(w[-1:] + w[:-1])] if len(w) == 3 else [])
        tit = slug(a.chords_title or a.title)
        w0 = slug(art)
        if w0.startswith('the-'): arts += [w0[4:], w0[4:] + '-the']
        urls = [f'https://www.accordiespartiti.it/accordi/{zone}/{ar}/{tit}/' for zone in ('italiani', 'internazionali') for ar in arts]
        # ricerca nel sito: primo risultato che contiene titolo e (una parte del) nome dell'artista
        try:
            sp, _ = fetch('https://www.accordiespartiti.it/?s=' + urllib.parse.quote_plus(f'{art} {a.chords_title or a.title}'), tries=1)
            keys = [k for k in slug(art).split('-') if len(k) > 2 and k != 'the'] or [slug(art)]
            for u in dict.fromkeys(re.findall(r'href="(https://www\.accordiespartiti\.it/accordi/[^"]+/)"', sp)):
                tail = u.rstrip('/').split('/')
                if tit in tail[-1] and any(k in tail[-2] for k in keys) and u not in urls: urls.append(u)
        except Exception:
            pass
    page = final = items = None
    for url in urls:
        try:
            page, final = fetch(url, tries=1)
        except Exception:
            continue
        items = parse_chord_page(page)
        if items and any(i[0] == 'c' for i in items): break
        items = None
    if not items: print(json.dumps({'id': a.id or f'{slug(a.artist)}-{slug(a.title)}', 'errore': 'pagina accordi non trovata'})); sys.exit(2)
    sb = songbpm(a.artist, a.title) or {}
    if a.lrclib:
        rec = json.loads(fetch(f'https://lrclib.net/api/get/{a.lrclib}')[0])
    else:
        rec = lrclib_pick(a.artist, a.title, sb.get('duration'))
    if not rec: print(json.dumps({'id': a.id or f'{slug(a.artist)}-{slug(a.title)}', 'errore': 'niente testo sincronizzato'})); sys.exit(3)
    lrc = lrc_lines(rec['syncedLyrics'])
    duration = float(rec['duration'])
    yt, ytd = (a.yt, None) if a.yt else youtube(a.artist, a.title, duration)
    bpm0 = a.bpm or sb.get('bpm')
    if not bpm0:
        # senza fonte: il periodo che allinea meglio le righe (battute fra 1,8 e 3,4 s)
        best = max((phase_fit(ts, 60 / b * a.beats)[0], b) for b in [x / 2 for x in range(140, 360)] if 1.8 <= 60 / b * a.beats <= 3.4)
        bpm0 = best[1]
    ts = [t for t, x in lrc if x]
    # BPM della fonte, oppure metà/doppio: si sceglie la battuta fra 1,6 e 4,2 s che allinea meglio le righe
    cands = []
    for mul in (0.5, 1, 2):
        b = bpm0 * mul
        bar = 60 / b * a.beats
        if 1.5 <= bar <= 4.4:
            r, bb, ph = best_grid(ts, b, a.beats)
            cands.append((r * (1.0 if mul == 1 else 0.9), bb, ph))
    if not cands:
        r, bb, ph = best_grid(ts, bpm0, a.beats); cands = [(r, bb, ph)]
    R, bpm, ph = max(cands)
    bar = 60 / bpm * a.beats
    offset = ph
    while offset > (ts[0] if ts else 0): offset -= bar
    while offset < 0: offset += bar
    secs, matched, plines, withch, nsung = build(items, lrc, bar, offset, a.beats, duration)
    names = name_sections(secs, secs and secs[0]['start'] == 0 and (ts and (ts[0] - offset) / bar >= 1.5))
    names_used = {}
    for s, nm in zip(secs, names):
        s['name'] = nm
    fix_bars(secs)
    chords = chord_names(secs)
    from collections import Counter
    cc = Counter(chords)
    key = sb.get('key') or cc.most_common(1)[0][0]
    sid = a.id or f'{slug(a.artist)}-{slug(a.title)}'
    capo = capo_from_page(page)
    distinct = sorted(set(chords), key=lambda c: -cc[c])
    diff = a.difficulty or min(5, max(1, 1 + (len(distinct) > 4) + (len(distinct) > 7) + sum(1 for c in distinct if re.search(r'^(F|Bb|B|C#|D#|G#|F#|Eb|Ab|Db|Gb)(?!5)|m7b5|dim|aug', c)) // 2))
    report = dict(id=sid, bpm=round(bpm, 2), bar=round(bar, 2), R=round(R, 2), offset=round(offset, 2), lrclib=rec['id'],
                  dur=duration, yt=yt, ytdur=ytd, righe_pagina=plines, agganciate=matched, righe_con_accordi=f'{withch}/{nsung}',
                  sezioni=[f"{s['name']}:{len(s['bars'])}" for s in secs], accordi=distinct[:14], key=key, capo=capo, diff=diff)
    print(json.dumps(report, ensure_ascii=False))
    if not a.write: return
    if withch < nsung * 0.6:
        print('SCARTATO: troppe righe senza accordi'); sys.exit(5)
    notes = a.notes or f"Accordi principali: {' – '.join(distinct[:6])}." + (f" La fonte suggerisce il capotasto al {capo}° tasto." if capo else '')
    data = {
        'title': a.title, 'artist': a.artist, 'album': a.album or rec.get('albumName') or a.title, 'year': a.year,
        'genre': a.genre, 'difficulty': diff, 'youtubeId': yt, 'key': key, 'bpm': round(bpm, 2),
        'timeSignature': [a.beats, 4], 'capo': 0, 'tuning': 'Standard (E A D G B E)', 'offset': round(offset, 2),
        'strum': 'D-DU-UDU' if a.beats == 4 else 'D-DUDU',
        'lyricsSource': {'lrclibId': rec['id'], 'duration': duration, 'offset': 0},
        'notes': notes,
        'syncNote': "Accordi agganciati riga per riga ai tempi del canto (LRCLIB) e griglia ritmica ricavata dagli stessi tempi; "
                    "accordi da fonti pubbliche. Per allinearli al video usa Sincronia → Tocca quando inizia a cantare.",
        'sections': [{'name': s['name'], 'bars': s['bars'], **({'barsPerRow': 4} if len(s['bars']) > 4 else {})} for s in secs],
    }
    if data['year'] is None: del data['year']
    path = os.path.join(ROOT, 'songs', sid + '.json')
    json.dump(data, open(path, 'w'), ensure_ascii=False, indent=1)
    idx_path = os.path.join(ROOT, 'songs', 'index.json')
    index = json.load(open(idx_path))
    entry = {'id': sid, 'file': sid + '.json', 'title': a.title, 'artist': a.artist, 'album': data['album'], 'genre': a.genre,
             'year': a.year, 'difficulty': diff, 'key': key, 'youtubeId': yt}
    if entry['year'] is None: del entry['year']
    index = [e for e in index if e['id'] != sid] + [entry]
    json.dump(index, open(idx_path, 'w'), ensure_ascii=False, indent=2); open(idx_path, 'a').write('\n')
    print('SCRITTO', path)

main()
