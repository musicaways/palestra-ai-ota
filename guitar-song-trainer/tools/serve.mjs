// Server statico locale senza dipendenze di runtime.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '127.0.0.1';

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    const path = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const target = (await stat(path)).isDirectory() ? resolve(path, 'index.html') : path;
    const body = await readFile(target);
    res.writeHead(200, { 'content-type': `${types[extname(target)] ?? 'application/octet-stream'}; charset=utf-8`, 'cache-control': 'no-store' }).end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404).end('Non trovato');
  }
});
server.listen(port, host, () => console.log(`Server locale: http://${host}:${server.address().port}`));
