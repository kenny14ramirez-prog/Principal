#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src');
const mime = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon' };

const server = createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  const file = join(root, p.replace(/^\//, ''));
  try {
    statSync(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404); res.end('not found');
  }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/index.html`;
console.log(`[boot] sirviendo src/ en ${url}`);
// Esperar a que el servidor responda antes de lanzar el agente
for (let i = 0; i < 30; i++) {
  try {
    const r = await fetch(url);
    if (r.ok) break;
  } catch (_) {}
  await new Promise((r) => setTimeout(r, 1000));
}

const r = spawnSync(process.execPath, [join(root, '..', 'scripts', 'qa-agente-profundo.mjs')], {
  cwd: join(root, '..'),
  stdio: 'inherit',
  env: { ...process.env, QA_URL: url, QA_HEADLESS: 'true' },
  timeout: 300000,
});

server.close();
process.exit(r.status == null ? 1 : r.status);