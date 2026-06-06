#!/usr/bin/env node
/**
 * Publicación automática: versión + sync interfaz + manifiesto OTA
 * Uso: node scripts/publicar-actualizacion.mjs <critical|optional> "<mensaje>" [version]
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const typeArg = (process.argv[2] || '').toLowerCase();
const message = process.argv[3];
const versionArg = process.argv[4];

const type =
  typeArg === 'critical' || typeArg === 'critica' || typeArg === 'crítica' ? 'critical' : 'optional';

if (!message) {
  console.error('Uso: node scripts/publicar-actualizacion.mjs <critical|optional> "<mensaje>" [version]');
  process.exit(1);
}

function run(label, args) {
  console.log('');
  console.log('  >> ' + label);
  const r = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}

function readCurrent() {
  return spawnSync(process.execPath, [join(root, 'scripts', 'bump-tauri-version.mjs'), '--current'], {
    cwd: root,
    encoding: 'utf8',
  }).stdout.trim();
}

function readNext() {
  return spawnSync(process.execPath, [join(root, 'scripts', 'bump-tauri-version.mjs')], {
    cwd: root,
    encoding: 'utf8',
  }).stdout.trim();
}

const current = readCurrent();
let version = versionArg ? String(versionArg).replace(/^v/i, '').trim() : readNext();

if (!/^\d+\.\d+\.\d+(-[\w.-]+)?$/.test(version)) {
  console.error('[ERROR] Versión inválida:', version);
  process.exit(1);
}

console.log('');
console.log('  ================================================');
console.log('   Crozzo POS — Publicación automática');
console.log('  ================================================');
console.log('');
console.log('  Versión actual  : v' + current);
console.log('  Versión nueva   : v' + version);
console.log('  Tipo aviso      : ' + (type === 'critical' ? 'CRÍTICA' : 'OPCIONAL'));
console.log('  Mensaje         : ' + message);
console.log('');
console.log('  Pasos:');
console.log('    1. Actualizar versión en tauri.conf.json + HTML');
console.log('    2. Generar manifiesto OTA releases\\latest.json');
console.log('    3. Sincronizar interfaz app\\ → src\\ (sello de build + .exe)');
console.log('');

run('Paso 1/3 — Versión v' + version, [join(root, 'scripts', 'set-tauri-version.mjs'), version]);
run('Paso 2/3 — Manifiesto OTA (' + type + ')', [
  join(root, 'scripts', 'generate-release-json.mjs'),
  version,
  message,
  type,
]);
run('Paso 3/3 — Sync interfaz (app → src)', [join(root, 'scripts', 'sync-frontend-to-src.mjs')]);

try {
  const conf = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  const meta = readFileSync(join(root, 'app', 'Crozzo_POS_Completo.html'), 'utf8');
  const metaOk = meta.includes('crozzo-app-version" content="' + version + '"');
  const confOk = String(conf.version) === version;
  console.log('');
  console.log('  Verificación local:');
  console.log('    tauri.conf.json     : ' + (confOk ? 'OK v' + version : 'FALLO'));
  console.log('    meta HTML           : ' + (metaOk ? 'OK v' + version : 'FALLO'));
  console.log('    src/index.html      : ' + (readFileSync(join(root, 'src', 'index.html'), 'utf8').includes('crozzo-app-version" content="' + version + '"') ? 'OK' : 'FALLO'));
} catch (e) {
  console.warn('  [aviso] No se pudo verificar archivos:', e.message);
}

console.log('');
console.log('  LISTO para subir a GitHub (siguiente paso automático).');
console.log('  VERSION=' + version);
