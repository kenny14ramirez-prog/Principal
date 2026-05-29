#!/usr/bin/env node
/**
 * Compara versión local vs GitHub (OTA main + Release latest).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OTA_URL =
  'https://raw.githubusercontent.com/kenny14ramirez-prog/Principal/main/releases/latest.json';
const RELEASES_API =
  'https://api.github.com/repos/kenny14ramirez-prog/Principal/releases?per_page=1';

function pickWindowsUpdaterEntry(platforms) {
  if (!platforms || typeof platforms !== 'object') return null;
  var primary = platforms['windows-x86_64'];
  var nsis = platforms['windows-x86_64-nsis'];
  if (primary && primary.url) {
    return {
      key: 'windows-x86_64',
      entry: primary,
      msi: /\.msi$/i.test(primary.url),
    };
  }
  if (nsis && nsis.url) {
    return { key: 'windows-x86_64-nsis', entry: nsis, msi: false };
  }
  return null;
}

function readLocalVersion() {
  try {
    const conf = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
    return String(conf.version || '').trim();
  } catch (_) {
    return '?';
  }
}

function readLocalOta() {
  try {
    const j = JSON.parse(readFileSync(join(root, 'releases', 'latest.json'), 'utf8'));
    return String(j.semver || j.version || '').replace(/^v/i, '');
  } catch (_) {
    return '?';
  }
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

function pad(s) {
  return String(s || '').padEnd(28);
}

const localTauri = readLocalVersion();
const localOta = readLocalOta();

console.log('');
console.log('  Crozzo POS — Verificación de publicación');
console.log('  ========================================');
console.log('');
console.log('  ' + pad('Versión tauri.conf.json:') + localTauri);
console.log('  ' + pad('OTA local latest.json:') + localOta);
console.log('');

let remoteOta = '?';
try {
  const ota = await fetchJson(
    'https://api.github.com/repos/kenny14ramirez-prog/Principal/contents/releases/latest.json?ref=main'
  );
  const raw = Buffer.from(ota.content || '', 'base64').toString('utf8');
  const parsed = JSON.parse(raw);
  remoteOta = String(parsed.semver || parsed.version || '').replace(/^v/i, '');
  console.log('  ' + pad('OTA en GitHub (main):') + remoteOta);
} catch (e) {
  try {
    const ota = await fetchJson(OTA_URL + '?_=' + Date.now());
    remoteOta = String(ota.semver || ota.version || '').replace(/^v/i, '');
    console.log('  ' + pad('OTA en GitHub (main):') + remoteOta + ' (cache raw)');
  } catch (e2) {
    console.log('  ' + pad('OTA en GitHub (main):') + 'ERROR — ' + e.message);
  }
}

let releaseTag = '?';
let releaseDraft = '?';
try {
  const releases = await fetchJson(RELEASES_API);
  if (releases && releases[0]) {
    releaseTag = String(releases[0].tag_name || '').replace(/^v/i, '');
    releaseDraft = releases[0].draft ? 'BORRADOR' : 'publicado';
    console.log('  ' + pad('Release GitHub (último):') + 'v' + releaseTag + ' (' + releaseDraft + ')');
  } else {
    console.log('  ' + pad('Release GitHub (último):') + 'sin releases');
  }
} catch (e) {
  console.log('  ' + pad('Release GitHub (último):') + 'ERROR — ' + e.message);
}

console.log('');
console.log('  Diagnóstico');
console.log('  -----------');

if (localOta !== '?' && remoteOta !== '?' && localOta !== remoteOta) {
  console.log('  [!] OTA local (' + localOta + ') NO está en GitHub (' + remoteOta + ').');
  console.log('      El push falló o no se confirmó. Vuelva a publicar con opción 7 → 2.');
} else if (localOta !== '?' && remoteOta !== '?' && localOta === remoteOta) {
  console.log('  [OK] OTA local coincide con GitHub main.');
}

if (releaseTag !== '?' && localTauri !== '?' && releaseTag !== localTauri) {
  console.log('  [!] El último release en GitHub es v' + releaseTag + ' pero local es ' + localTauri + '.');
  console.log('      Falta tag v' + localTauri + ' o el workflow aún no terminó.');
}

if (releaseDraft === 'BORRADOR') {
  console.log('  [!] El release está en BORRADOR. Publíquelo en GitHub → Releases.');
}

if (
  localOta !== '?' &&
  remoteOta !== '?' &&
  localOta === remoteOta &&
  releaseTag !== '?' &&
  releaseTag === localTauri &&
  releaseDraft === 'publicado'
) {
  console.log('  [OK] Todo publicado. Los clientes deberían ver v' + localOta + '.');
  console.log('      Si no actualiza: Restablecer avisos + Comprobar ahora en la app.');
}

if (releaseTag !== '?' && releaseDraft === 'publicado') {
  try {
    const updaterJson = await fetchJson(
      'https://github.com/kenny14ramirez-prog/Principal/releases/download/v' +
        releaseTag +
        '/latest.json?_=' +
        Date.now()
    );
    const picked = pickWindowsUpdaterEntry(updaterJson.platforms);
    if (!picked) {
      console.log('  [!] latest.json del release sin plataforma Windows.');
    } else if (picked.msi || /\.msi$/i.test(picked.entry.url || '')) {
      console.log('  [!] latest.json usa ' + picked.key + ' → .msi — el updater automático FALLA.');
      console.log('      Los clientes deben usar Plan B (descargar setup.exe) hasta republicar.');
      console.log('      Solución: updaterJsonPreferNsis:true + targets nsis, luego tag vX.Y.Z nuevo.');
    } else if (!/setup\.exe$/i.test(picked.entry.url || '')) {
      console.log('  [!] URL updater inusual: ' + (picked.entry.url || '(vacía)'));
    } else {
      console.log('  [OK] Updater del release usa setup.exe (NSIS).');
    }
  } catch (e) {
    console.log('  [!] No se pudo leer latest.json del release: ' + e.message);
  }
}

console.log('');
