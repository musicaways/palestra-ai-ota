# Test dei criteri di importazione (python3 tests/importbatch_test.py)
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'tools'))
from importbatch import verdict, slug
ok = {'id': 'a', 'righe_con_accordi': '30/32', 'agganciate': 30, 'righe_pagina': 40, 'yt': 'x', 'ytdur': 200, 'dur': 203, 'accordi': ['C', 'G']}
assert verdict(ok, set()) == ''
assert 'durata' in verdict({**ok, 'ytdur': 230}, set())
assert 'già usato' in verdict(ok, {'x'})
assert 'poche righe' in verdict({**ok, 'righe_con_accordi': '10/32'}, set())
assert verdict({'id': 'a'}, set()) == 'nessun risultato'
assert verdict({'id': 'a', 'errore': 'pagina accordi non trovata'}, set()) == 'pagina accordi non trovata'
assert slug("L'isola che non c'è") == 'l-isola-che-non-c-e'
print('importbatch: ok')
