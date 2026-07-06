#!/usr/bin/env node
/**
 * Instala dependencias QA (Playwright) si faltan, sincroniza app→src y ejecuta escenario oro.
 *
 *   npm run test:operativo-oro
 *   npm run test:operativo-oro:install   # solo instala Playwright + Chromium
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const installOnly = args.includes('--install-only');
const skipSync = args.includes('--skip-sync');

function run(cmd, cmdArgs, opts) {
  opts = opts || {};
  const r = spawnSync(cmd, cmdArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    ...opts,
  });
  return r.status === 0;
}

function npmRun(script) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return run(npm, ['run', script], { shell: process.platform === 'win32' });
}

function hasPlaywright() {
  try {
    const pkg = join(root, 'node_modules', 'playwright', 'package.json');
    return existsSync(pkg);
  } catch (_) {
    return false;
  }
}

function hasChromium() {
  const candidates = [
    join(root, 'node_modules', 'playwright-core', '.local-browsers'),
    join(process.env.USERPROFILE || process.env.HOME || '', 'AppData', 'Local', 'ms-playwright'),
  ];
  return candidates.some((p) => existsSync(p));
}

console.log('\n┌─────────────────────────────────────────────────────────────┐');
console.log('│  Crozzo POS · HORA MAESTRA · Escenario Oro + Matriz Humana  │');
console.log('└─────────────────────────────────────────────────────────────┘\n');

if (!skipSync) {
  console.log('▶ Sincronizando app/ → src/ …');
  if (!npmRun('sync')) {
    console.error('Sync falló — corrija antes de probar.');
    process.exit(1);
  }
}

if (!hasPlaywright()) {
  console.log('▶ Instalando Playwright (devDependency) …');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
if (!run(npm, ['install', 'playwright@^1.49.0', '--save-dev'], { shell: process.platform === 'win32' })) {
    console.error('No se pudo instalar playwright.');
    process.exit(1);
  }
}

console.log('▶ Instalando navegador Chromium para Playwright …');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
if (!run(npx, ['playwright', 'install', 'chromium'], { shell: process.platform === 'win32' })) {
  console.warn('Advertencia: playwright install chromium reportó error (puede existir caché).');
}

if (installOnly) {
  console.log('\n✓ Paquete QA listo. Ejecute: npm run test:operativo-oro:raw\n');
  process.exit(0);
}

console.log('\n▶ Ejecutando Hora Maestra …\n');
const node = process.execPath;
const testScript = join(root, 'scripts', 'test-operativo-oro.mjs');
const forwardArgs = args.filter((a) => a !== '--install-only' && a !== '--skip-sync');
const ok = run(node, [testScript, ...forwardArgs]);
process.exit(ok ? 0 : 1);
