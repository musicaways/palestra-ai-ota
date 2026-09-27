// Avvia il server su una porta libera, esegue la suite e lo arresta sempre.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = await new Promise((ok, fail) => {
  const probe = createServer();
  probe.once('error', fail);
  probe.listen(0, '127.0.0.1', () => {
    const value = probe.address().port;
    probe.close(() => ok(value));
  });
});
const server = spawn(process.execPath, ['tools/serve.mjs'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
const stop = () => { if (!server.killed) server.kill(); };
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
try {
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (server.exitCode !== null) throw new Error('Il server locale si è arrestato.');
    try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) { ready = true; break; } } catch {}
    await new Promise((ok) => setTimeout(ok, 100));
  }
  if (!ready) throw new Error('Il server locale non risponde.');
  for (const suite of ['tests/e2e.mjs', 'tests/features.e2e.mjs']) {
    const test = spawn(process.execPath, [suite, `http://127.0.0.1:${port}`, ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' });
    const code = await new Promise((ok, fail) => { test.once('exit', (status) => ok(status ?? 1)); test.once('error', fail); });
    if (code !== 0) { process.exitCode = code; break; }
  }
} finally {
  stop();
}
