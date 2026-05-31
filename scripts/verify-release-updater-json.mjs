#!/usr/bin/env node
/**
 * CI: valida latest.json (Windows + macOS) y presencia de APK Android en el release.
 */
const tag = String(process.argv[2] || '').trim();
if (!tag) {
  console.error('Uso: node scripts/verify-release-updater-json.mjs v1.0.28');
  process.exit(1);
}

const owner = 'kenny14ramirez-prog';
const repo = 'Principal';
const ver = tag.replace(/^v/i, '');
const tagName = tag.startsWith('v') ? tag : 'v' + ver;

let ok = true;

const latestUrl =
  'https://github.com/' +
  owner +
  '/' +
  repo +
  '/releases/download/' +
  encodeURIComponent(tagName) +
  '/latest.json?_=' +
  Date.now();

try {
  const res = await fetch(latestUrl, { cache: 'no-store' });
  if (!res.ok) {
    console.error('[verify] No se pudo leer latest.json:', res.status, latestUrl);
    ok = false;
  } else {
    const data = await res.json();
    const platforms = data.platforms || {};

    const win =
      platforms['windows-x86_64-nsis'] ||
      platforms['windows-x86_64'] ||
      platforms['windows-x86_64-msi'];

    if (!win || !win.url) {
      console.error('[verify] FALLO: sin plataforma Windows en latest.json');
      ok = false;
    } else if (/\.msi$/i.test(win.url)) {
      console.error('[verify] FALLO: Windows apunta a MSI:', win.url);
      ok = false;
    } else if (!/setup\.exe$/i.test(win.url)) {
      console.warn('[verify] Windows URL inusual:', win.url);
    } else {
      console.log('[verify] OK Windows —', win.url);
    }

    const macArm = platforms['darwin-aarch64'];
    const macX64 = platforms['darwin-x86_64'];
    if (macArm?.url || macX64?.url) {
      if (macArm?.url) console.log('[verify] OK macOS aarch64 —', macArm.url);
      if (macX64?.url) console.log('[verify] OK macOS x86_64 —', macX64.url);
    } else {
      console.warn('[verify] AVISO: sin entradas macOS en latest.json (¿jobs Mac en curso?)');
    }
  }
} catch (e) {
  console.error('[verify] Error leyendo latest.json:', e.message || e);
  ok = false;
}

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
const apiUrl = 'https://api.github.com/repos/' + owner + '/' + repo + '/releases/tags/' + encodeURIComponent(tagName);

try {
  const headers = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const apiRes = await fetch(apiUrl + '?_=' + Date.now(), { cache: 'no-store', headers });
  if (!apiRes.ok) {
    console.warn('[verify] AVISO: no se pudo listar assets del release:', apiRes.status);
  } else {
    const release = await apiRes.json();
    const assets = release.assets || [];
    const apks = assets.filter((a) => /\.apk$/i.test(a.name || ''));
    const dmgs = assets.filter((a) => /\.dmg$/i.test(a.name || ''));
    const setups = assets.filter((a) => /setup\.exe$/i.test(a.name || ''));

    if (setups.length) console.log('[verify] OK assets .exe —', setups.map((a) => a.name).join(', '));
    else {
      console.warn('[verify] AVISO: sin setup.exe en assets del release');
    }

    if (dmgs.length) console.log('[verify] OK assets .dmg —', dmgs.map((a) => a.name).join(', '));
    else console.warn('[verify] AVISO: sin .dmg en assets (¿jobs Mac en curso?)');

    if (apks.length) console.log('[verify] OK assets .apk —', apks.map((a) => a.name).join(', '));
    else {
      console.warn('[verify] AVISO: sin .apk Android en assets (¿job Android en curso o falló?)');
    }
  }
} catch (e) {
  console.warn('[verify] No se verificaron assets APK:', e.message || e);
}

if (!ok) process.exit(1);
console.log('[verify] Release multiplataforma revisado.');
process.exit(0);
