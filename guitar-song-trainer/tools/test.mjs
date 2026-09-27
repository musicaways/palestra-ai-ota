// Esegue tutti i test Node e Python sui sistemi supportati.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = readdirSync(resolve(root, 'tests')).filter((name) => name.endsWith('.test.mjs')).sort();
const node = spawnSync(process.execPath, ['--test', ...files.map((name) => resolve(root, 'tests', name))], { cwd: root, stdio: 'inherit' });
if (node.error) throw node.error;
if (node.status !== 0) process.exit(node.status ?? 1);

// Il launcher Python su Windows è `py` o `python`; su Unix normalmente `python3`.
const candidates = process.platform === 'win32'
  ? [['py', ['-3']], ['python', []]]
  : [['python3', []], ['python', []]];
let found = false;
for (const [exe, prefix] of candidates) {
  const probe = spawnSync(exe, [...prefix, '--version'], { cwd: root, encoding: 'utf8' });
  if (probe.error?.code === 'ENOENT' || probe.status !== 0 || !/^Python 3\./.test((probe.stdout || probe.stderr || '').trim())) continue;
  found = true;
  const result = spawnSync(exe, [...prefix, 'tests/importbatch_test.py'], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
if (!found) {
  console.error('Python 3 non trovato (provati: ' + candidates.map(([exe]) => exe).join(', ') + ').');
  process.exit(1);
}
