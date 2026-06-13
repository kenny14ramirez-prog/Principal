#!/usr/bin/env node
/**
 * Copia el instalador NSIS más reciente a dist/local/.
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundleDir = join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
const outDir = join(root, 'dist', 'local');

function readVersion() {
  try {
    const conf = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
    return String(conf.version || '0.0.0');
  } catch (_) {
    return '0.0.0';
  }
}

let files = [];
try {
  files = readdirSync(bundleDir)
    .filter((n) => /-setup\.exe$/i.test(n))
    .map((n) => {
      const p = join(bundleDir, n);
      return { path: p, name: n, mtime: statSync(p).mtimeMs };
    });
} catch (_) {
  console.error('[instalador-local] No existe', bundleDir);
  console.error('[instalador-local] Ejecute primero: npm run tauri build');
  process.exit(1);
}

if (!files.length) {
  console.error('[instalador-local] No hay *-setup.exe en', bundleDir);
  process.exit(1);
}

files.sort((a, b) => b.mtime - a.mtime);
const pick = files[0];
const ver = readVersion();
const outName = `BONA_origen_${ver}_x64-setup.exe`;
mkdirSync(outDir, { recursive: true });
const dest = join(outDir, outName);
copyFileSync(pick.path, dest);
console.log('[instalador-local] Copiado a:', dest);
console.log('[instalador-local] Origen:', pick.path);
