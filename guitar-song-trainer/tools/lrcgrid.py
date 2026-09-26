# Griglia e blocchi di un brano a partire SOLO dai tempi delle righe LRCLIB (il testo non viene
# né stampato né salvato: si usano solo i timestamp e la lunghezza delle righe per confrontarle).
#
# Uso:  python3 tools/lrcgrid.py <id_lrclib> <bpm_indicativo> <battiti_per_battuta>
# Esempio: python3 tools/lrcgrid.py 37251780 146 4
#
# Stampa: BPM che meglio allinea gli inizi delle righe (entro ±3% di quello indicato), durata della
# battuta, "offset" (secondo in cui cade una battuta: va nel campo offset del brano), i blocchi cantati
# con le battute di inizio/fine e i blocchi che si ripetono (probabili ritornelli, stesso "gruppo").
# Cerca l'id con: https://lrclib.net/api/search?artist_name=…&track_name=…
import json, re, sys, math, urllib.request
def get(url):
    for _ in range(3):
        try:
            with urllib.request.urlopen(url, timeout=20) as r: return json.load(r)
        except Exception as e: err=e
    raise err
def lines(lrc):
    out=[]
    for ln in lrc.splitlines():
        m=re.match(r'\[(\d+):(\d+(?:\.\d+)?)\](.*)',ln)
        if m: out.append((int(m.group(1))*60+float(m.group(2)), len(m.group(3).strip())))
    return out
def R(ts,p):
    c=sum(math.cos(2*math.pi*t/p) for t in ts); s=sum(math.sin(2*math.pi*t/p) for t in ts)
    return math.hypot(c,s)/len(ts), (math.atan2(s,c)/(2*math.pi)*p)%p
lid, bpm0, beats = int(sys.argv[1]), float(sys.argv[2]), int(sys.argv[3])
d=get(f'https://lrclib.net/api/get/{lid}')
L=lines(d['syncedLyrics']); ts=[t for t,n in L if n>0]
best=None
b=bpm0*0.97
while b<=bpm0*1.03:
    bar=60/b*beats
    for mult in (1,2):
        r,ph=R(ts,bar*mult)
        sc=r*(1.0 if mult==1 else 0.97)
        if not best or sc>best[0]: best=(sc,b,mult,ph,r)
    b+=0.05
sc,bpm,mult,ph,r=best
bar=60/bpm*beats
off=ph%bar
# anticipo tipico del cantato: le righe partono poco prima del battere -> sposta al battere più vicino
print(f"id={lid} dur={d['duration']} bpm_ottimo={bpm:.2f} (fonte {bpm0}) periodo={mult} battute R={r:.2f} battuta={bar:.3f}s offset={off:.2f}s")
# blocchi: interrompi dove la pausa supera 1.7x la mediana degli intervalli
gaps=sorted(ts[i+1]-ts[i] for i in range(len(ts)-1)); med=gaps[len(gaps)//2]
blocks=[[ts[0]]]; sig=[[L[[t for t,_ in L].index(ts[0])][1]]]
for i in range(1,len(ts)):
    if ts[i]-ts[i-1]>max(1.7*med, 2*bar): blocks.append([]); sig.append([])
    blocks[-1].append(ts[i]); sig[-1].append(dict(L)[ts[i]])
def barof(t): return (t-off)/bar
sigs=[tuple(round(x/4) for x in s) for s in sig]
groups={}
for i,s in enumerate(sigs):
    for j in range(i):
        a,b_=sigs[j],s
        n=min(len(a),len(b_)); same=sum(1 for k in range(n) if abs(a[k]-b_[k])<=1)
        if n>=3 and same/max(len(a),len(b_))>=0.7: groups[i]=groups.get(j,j); break
for i,bl in enumerate(blocks):
    g=groups.get(i,i)
    print(f"  blocco {i:2d}: {bl[0]:6.1f}-{bl[-1]:6.1f}s  battute {barof(bl[0]):5.1f}-{barof(bl[-1]):5.1f}  righe={len(bl):2d}  gruppo={g}")
print(f"  fine brano ~ battuta {barof(d['duration']):.1f}")
