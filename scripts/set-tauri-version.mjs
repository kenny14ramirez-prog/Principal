#!/usr/bin/env node
/**
 * Actualiza version en src-tauri/tauri.conf.json y meta crozzo-app-version en app/Crozzo_POS_Completo.html
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const verArg = process.argv[2];

if (!verArg) {
  console.error('Uso: node scripts/set-tauri-version.mjs <version>  (ej. 1.0.17)');
  process.exit(1);
}

const semver = String(verArg).replace(/^v/i, '').trim();
if (!/^\d+\.\d+\.\d+(-[\w.-]+)?$/.test(semver)) {
  console.error(`Versión inválida: ${verArg}`);
  process.exit(1);
}

const confPath = join(root, 'src-tauri', 'tauri.conf.json');
const androidConfPath = join(root, 'src-tauri', 'tauri.android.conf.json');
const htmlPath = join(root, 'app', 'Crozzo_POS_Completo.html');

function semverToVersionCode(semver) {
  const m = String(semver)
    .replace(/^v/i, '')
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return 1;
  return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
}

const conf = JSON.parse(readFileSync(confPath, 'utf8'));
const prev = conf.version;
conf.version = semver;
writeFileSync(confPath, JSON.stringify(conf, null, 2) + '\n', 'utf8');
console.log(`[version] tauri.conf.json: ${prev || '?'} -> ${semver}`);

if (existsSync(androidConfPath)) {
  const aconf = JSON.parse(readFileSync(androidConfPath, 'utf8'));
  const aprev = aconf.version;
  aconf.version = semver;
  if (!aconf.bundle) aconf.bundle = {};
  if (!aconf.bundle.android) aconf.bundle.android = {};
  aconf.bundle.android.versionCode = semverToVersionCode(semver);
  writeFileSync(androidConfPath, JSON.stringify(aconf, null, 2) + '\n', 'utf8');
  console.log(
    `[version] tauri.android.conf.json: ${aprev || '?'} -> ${semver} (versionCode ${aconf.bundle.android.versionCode})`
  );
}

if (existsSync(htmlPath)) {
  let html = readFileSync(htmlPath, 'utf8');
  const meta = `<meta name="crozzo-app-version" content="${semver}">`;
  if (/name=["']crozzo-app-version["']/i.test(html)) {
    html = html.replace(/<meta\s+name=["']crozzo-app-version["'][^>]*>/i, meta);
  } else if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>\n${meta}`);
  }
  writeFileSync(htmlPath, html, 'utf8');
  console.log(`[version] meta en app/Crozzo_POS_Completo.html -> ${semver}`);
}
