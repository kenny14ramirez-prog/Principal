#!/usr/bin/env node
/**
 * Copia el APK firmado más reciente a dist/local/ con nombre legible.
 */
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'dist', 'local');

function readVersion() {
  try {
    const conf = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
    return String(conf.version || '0.0.0');
  } catch (_) {
    return '0.0.0';
  }
}

const pick = spawnSync(process.execPath, [join(root, 'scripts', 'pick-android-apk.mjs')], {
  cwd: root,
  encoding: 'utf8',
});
if (pick.status !== 0) {
  console.error('[apk-local] No se encontró APK. Ejecute tauri android build primero.');
  process.exit(1);
}

const apkPath = String(pick.stdout || '').trim();
const ver = readVersion();
const outName = `BONA_origen_${ver}_arm64.apk`;
mkdirSync(outDir, { recursive: true });
const dest = join(outDir, outName);
copyFileSync(apkPath, dest);
console.log('[apk-local] Copiado a:', dest);
console.log('[apk-local] Origen:', apkPath);
