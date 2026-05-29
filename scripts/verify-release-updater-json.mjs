#!/usr/bin/env node
/**
 * CI: valida que latest.json del release apunte a setup.exe (NSIS), no MSI.
 */
const tag = String(process.argv[2] || '').trim();
if (!tag) {
  console.error('Uso: node scripts/verify-release-updater-json.mjs v1.0.28');
  process.exit(1);
}

const ver = tag.replace(/^v/i, '');
const url =
  'https://github.com/kenny14ramirez-prog/Principal/releases/download/' +
  encodeURIComponent('v' + ver) +
  '/latest.json?_=' +
  Date.now();

const res = await fetch(url, { cache: 'no-store' });
if (!res.ok) {
  console.error('[verify] No se pudo leer latest.json del release:', res.status, url);
  process.exit(1);
}

const data = await res.json();
const platforms = data.platforms || {};
const primary = platforms['windows-x86_64'];
const nsis = platforms['windows-x86_64-nsis'];
const entry = primary && primary.url ? primary : nsis;

if (!entry || !entry.url) {
  console.error('[verify] latest.json sin plataforma Windows');
  process.exit(1);
}

if (/\.msi$/i.test(entry.url)) {
  console.error('[verify] FALLO: latest.json apunta a MSI:', entry.url);
  console.error('         Use updaterJsonPreferNsis: true y bundle.targets: ["nsis"]');
  process.exit(1);
}

if (!/setup\.exe$/i.test(entry.url)) {
  console.warn('[verify] URL inusual (no termina en setup.exe):', entry.url);
}

console.log('[verify] OK — updater usa', entry.url);
process.exit(0);
