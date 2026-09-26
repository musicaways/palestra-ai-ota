# Estrae SOLO le sigle degli accordi da una pagina pubblica di accordi (accordiespartiti.it):
# le righe di testo non vengono mai stampate né salvate (compaiono come "~").
# Uso: python3 tools/chordscan.py "<artista>" "<titolo>"   oppure   python3 tools/chordscan.py <url>
import re, sys, html, unicodedata, urllib.request
def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')
def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=25) as r: return r.read().decode('utf-8', 'ignore'), r.geturl()
IT = {'DO': 'C', 'RE': 'D', 'MI': 'E', 'FA': 'F', 'SOL': 'G', 'LA': 'A', 'SI': 'B'}
CH = re.compile(r'^(?:[A-G]|DO|RE|MI|FA|SOL|LA|SI)(?:#|b)?(?:m|min|maj|dim|aug|sus|add|M|-|\+|\d|\(|\)|/|[A-G](?:#|b)?)*$')
HEAD = re.compile(r'^\s*\[?\(?\s*(intro|strofa|rit\.?|ritornello|chorus|verse|bridge|ponte|pre[- ]?rit\w*|special|solo|finale|outro|coda|strumentale|interludio)\b[^a-z]*$', re.I)
def norm(tok):
    m = re.match(r'^(DO|RE|MI|FA|SOL|LA|SI)(.*)$', tok)
    if m: tok = IT[m.group(1)] + m.group(2)
    return tok.replace('-', 'm').replace('min', 'm')
if len(sys.argv) == 2: url = sys.argv[1]
else: url = f'https://www.accordiespartiti.it/accordi/italiani/{slug(sys.argv[1])}/{slug(sys.argv[2])}/'
try:
    page, final = fetch(url)
except Exception as e:
    print('ERRORE', e); sys.exit(1)
m = re.search(r'<pre[^>]*>(.*?)</pre>', page, re.S)
if not m: print('NESSUN BLOCCO ACCORDI', final); sys.exit(1)
txt = html.unescape(re.sub(r'<[^>]+>', '', m.group(1)))
print('#', final)
out, lyr = [], 0
for ln in txt.splitlines():
    s = ln.strip()
    if not s: continue
    toks = [t for t in re.split(r'[\s|]+', s.replace('(', ' ').replace(')', ' ')) if t]
    if toks and all(CH.match(t) or t in ('x2', 'x3', 'x4', '%') for t in toks):
        if lyr: out.append('~' * min(lyr, 3)); lyr = 0
        out.append(' '.join(norm(t) for t in toks))
    elif HEAD.match(s):
        if lyr: out.append('~' * min(lyr, 3)); lyr = 0
        out.append('[' + HEAD.match(s).group(1).upper() + ']')
    else:
        lyr += 1
if lyr: out.append('~' * min(lyr, 3))
print('\n'.join(out))
