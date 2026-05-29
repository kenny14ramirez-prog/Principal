#!/usr/bin/env node
/**
 * Verifica que la cadena de actualizaciones esté bien configurada (local).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];
const ok = [];

const FRONTEND_DIRS = ['css', 'core', 'vendor', 'ui', 'infra', 'modules', 'bundles'];

function readJson(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    errors.push(`${rel}: JSON inválido (${e.message})`);
    return null;
  }
}

function fileHash(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) return null;
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

function reqSyncedPair(appRel, srcRel) {
  if (!reqFile(appRel) || !reqFile(srcRel)) return;
  const ha = fileHash(appRel);
  const hs = fileHash(srcRel);
  if (ha && hs && ha !== hs) {
    errors.push(`${appRel} y ${srcRel} difieren — ejecute: npm run sync`);
  } else if (ha && hs) {
    ok.push(`Sync OK: ${appRel} ↔ ${srcRel}`);
  }
}

function reqFile(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) {
    errors.push(`Falta archivo: ${rel}`);
    return false;
  }
  ok.push(`Archivo: ${rel}`);
  return true;
}

function reqDir(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) {
    errors.push(`Falta carpeta: ${rel}`);
    return false;
  }
  ok.push(`Carpeta: ${rel}/`);
  return true;
}

reqFile('scripts/sync-frontend-to-src.mjs');
reqFile('scripts/generate-release-json.mjs');
reqFile('scripts/publicar-actualizacion.mjs');
reqFile('scripts/sync-version-from-tag.mjs');
reqFile('scripts/verify-release-updater-json.mjs');
reqFile('.github/workflows/tauri-release.yml');
const releaseYml = join(root, '.github/workflows/release.yml');
if (existsSync(releaseYml)) {
  errors.push(
    'Existe .github/workflows/release.yml (duplicado). Elimínelo; use solo tauri-release.yml'
  );
} else {
  ok.push('Sin workflow duplicado release.yml');
}
reqFile('scripts/_git-push-latest.bat');
reqFile('app/Crozzo_POS_Completo.html');

if (!existsSync(join(root, 'node_modules'))) {
  errors.push('Falta node_modules — ejecute: npm install');
} else {
  ok.push('node_modules presente');
  if (!existsSync(join(root, 'node_modules', '@tauri-apps', 'cli'))) {
    errors.push('Falta @tauri-apps/cli — ejecute: npm install');
  }
}

for (const dir of FRONTEND_DIRS) {
  reqDir(`app/${dir}`);
  reqDir(`src/${dir}`);
}

reqSyncedPair('app/infra/CrozzoSystemUpdates.js', 'src/infra/CrozzoSystemUpdates.js');
reqSyncedPair('app/infra/CrozzoTauriUpdater.js', 'src/infra/CrozzoTauriUpdater.js');
reqSyncedPair('app/core/CrozzoManifest.js', 'src/core/CrozzoManifest.js');

const tauri = readJson('src-tauri/tauri.conf.json');
if (tauri) {
  if (!tauri.version) errors.push('tauri.conf.json sin version');
  else ok.push(`Versión tauri: ${tauri.version}`);
  const ep = tauri.plugins?.updater?.endpoints?.[0];
  if (!ep) errors.push('Sin endpoint updater en tauri.conf.json');
  else if (!/github\.com.*releases.*latest\.json/i.test(ep)) {
    warnings.push(`Endpoint updater inusual: ${ep}`);
  } else ok.push('Endpoint updater GitHub Releases OK');
  if (!tauri.plugins?.updater?.pubkey) errors.push('Sin pubkey updater');
  else ok.push('Pubkey updater presente');
  if (!tauri.bundle?.createUpdaterArtifacts) {
    warnings.push('createUpdaterArtifacts debería ser true');
  }
}

for (const cap of ['src-tauri/capabilities/default.json', 'src-tauri/capabilities/desktop.json']) {
  const c = readJson(cap);
  if (!c) continue;
  const perms = c.permissions || [];
  if (!perms.some((p) => String(p).includes('updater'))) {
    errors.push(`${cap}: falta permiso updater`);
  }
  if (!perms.some((p) => String(p).includes('process'))) {
    errors.push(`${cap}: falta permiso process (reinicio tras instalar)`);
  }
}

function htmlHasUpdaterScripts(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) return false;
  const html = readFileSync(p, 'utf8');
  return (
    html.includes('infra/CrozzoSystemUpdates.js') || html.includes('CrozzoSystemUpdates.js')
  );
}

if (htmlHasUpdaterScripts('app/Crozzo_POS_Completo.html')) {
  ok.push('HTML carga CrozzoSystemUpdates.js');
} else {
  errors.push('app/Crozzo_POS_Completo.html sin CrozzoSystemUpdates.js');
}
if (htmlHasUpdaterScripts('src/index.html')) {
  ok.push('src/index.html carga actualizaciones');
} else if (existsSync(join(root, 'src/index.html'))) {
  warnings.push('src/index.html sin scripts de actualización — ejecute: npm run sync');
}

const latest = readJson('releases/latest.json');
if (latest) {
  const ver = latest.semver || String(latest.version || '').replace(/^v/i, '');
  if (tauri && ver && ver !== tauri.version) {
    warnings.push(`releases/latest.json (${ver}) ≠ tauri.conf.json (${tauri.version})`);
  }
} else {
  warnings.push('releases/latest.json ausente (normal antes de la primera publicación)');
}

console.log('');
console.log('  Crozzo POS — Health check actualizaciones');
console.log('  =========================================');
console.log('');
if (ok.length) {
  console.log('  OK');
  ok.forEach((m) => console.log('    • ' + m));
}
if (warnings.length) {
  console.log('');
  console.log('  Avisos');
  warnings.forEach((m) => console.log('    • ' + m));
}
if (errors.length) {
  console.log('');
  console.log('  ERRORES');
  errors.forEach((m) => console.log('    • ' + m));
}
console.log('');
if (errors.length) {
  console.log('  Resultado: FALLO (' + errors.length + ' error(es))');
  process.exit(1);
}
console.log('  Resultado: OK — cadena local de actualizaciones configurada.');
console.log('');
