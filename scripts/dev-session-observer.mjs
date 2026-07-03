#!/usr/bin/env node
/**
 * Observador de sesión dev — recibe eventos de CrozzoDevTap y escribe JSONL.
 *
 * Uso:
 *   npm run dev:observe              # solo servidor (ejecute tauri dev aparte)
 *   npm run dev:observe:tauri      # servidor + npm run tauri:dev
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'scripts', '_qa-out');
mkdirSync(outDir, { recursive: true });

const PORT = Number(process.env.CROZZO_DEV_OBSERVER_PORT || 9876);
const args = process.argv.slice(2);
const withTauri = args.includes('--with-tauri');

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outFile = join(outDir, `live-${stamp}.jsonl`);

let events = 0;

function writeLine(line) {
  appendFileSync(outFile, line + '\n', 'utf8');
  events++;
  if (events <= 5 || events % 25 === 0) {
    console.log(`[dev-observe] ${events} eventos → ${outFile}`);
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/event') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 65536) req.destroy();
    });
    req.on('end', () => {
      try {
        JSON.parse(body);
        writeLine(body.trim());
        res.writeHead(204);
        res.end();
      } catch (_) {
        res.writeHead(400);
        res.end('invalid json');
      }
    });
    return;
  }
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, events, file: outFile }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[dev-observe] escuchando http://127.0.0.1:${PORT}/event`);
  console.log(`[dev-observe] log: ${outFile}`);
});

let tauriChild = null;
if (withTauri) {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  tauriChild = spawn(npmCmd, ['run', 'tauri:dev'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  tauriChild.on('exit', (code) => {
    console.log(`[dev-observe] tauri dev terminó (${code})`);
    server.close();
    process.exit(code || 0);
  });
}

process.on('SIGINT', () => {
  console.log('\n[dev-observe] cierre — ' + events + ' eventos en ' + outFile);
  if (tauriChild) tauriChild.kill('SIGTERM');
  server.close(() => process.exit(0));
});
