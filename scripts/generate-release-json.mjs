#!/usr/bin/env node
/**
 * Genera latest.json para Tauri updater (Crozzo POS).
 * Uso: node scripts/generate-release-json.mjs <version> "<notes>" <critical|optional>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const version = (process.argv[2] || '').replace(/^v/i, '');
let notes = process.argv[3] || process.env.RELEASE_NOTES || '';
let updateType = (process.argv[4] || process.env.UPDATE_TYPE || 'optional').toLowerCase();

const commitMsg = process.env.GITHUB_COMMIT_MESSAGE || process.env.COMMIT_MESSAGE || '';

if (!version) {
  console.error('Uso: node scripts/generate-release-json.mjs <version> "<notes>" <critical|optional>');
  process.exit(1);
}

function detectCritical(text) {
  return /🔥|critico|crítico|critical|urgente|seguridad|\[CRITICAL\]/i.test(text);
}

if (!['critical', 'optional'].includes(updateType)) {
  const blob = `${notes} ${updateType} ${commitMsg}`;
  updateType = detectCritical(blob) ? 'critical' : 'optional';
} else if (updateType === 'optional' && detectCritical(`${notes} ${commitMsg}`)) {
  updateType = 'critical';
}

const repo = process.env.GITHUB_REPOSITORY || 'kenny14ramirez-prog/Principal';
const tag = `v${version}`;

function findFiles(dir, ext, found = []) {
  if (!fs.existsSync(dir)) return found;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) findFiles(full, ext, found);
    else if (name.endsWith(ext)) found.push(full);
  }
  return found;
}

function scoreSig(filePath) {
  const n = filePath.toLowerCase();
  if (/nsis/.test(n) && /setup\.exe\.sig$/.test(n)) return 100;
  if (/setup\.exe\.sig$/.test(n)) return 90;
  if (/\.exe\.sig$/.test(n) && !/msi/.test(n)) return 80;
  if (/nsis/.test(n)) return 70;
  if (/\.msi\.sig$/.test(n)) return 30;
  return 10;
}

const searchRoots = [path.join(root, 'src-tauri', 'target'), path.join(root, 'target'), root];

let sigPath = process.env.CROZZO_SIG_PATH;
let exePath = process.env.CROZZO_EXE_PATH;

if (!sigPath) {
  const sigs = searchRoots.flatMap((r) => findFiles(r, '.sig'));
  sigs.sort((a, b) => scoreSig(b) - scoreSig(a) || fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  sigPath = sigs[0];
}

if (sigPath && !exePath) {
  const candidate = sigPath.replace(/\.sig$/i, '');
  if (fs.existsSync(candidate)) exePath = candidate;
}

if (!sigPath || !fs.existsSync(sigPath)) {
  console.error('No se encontró archivo .sig. Ejecute npm run tauri build o defina CROZZO_SIG_PATH.');
  process.exit(1);
}

const signature = fs.readFileSync(sigPath, 'utf8').trim();
const exeName = exePath ? path.basename(exePath) : `Crozzo POS_${version}_x64-setup.exe`;
const size = exePath && fs.existsSync(exePath) ? fs.statSync(exePath).size : 0;

const url =
  process.env.CROZZO_INSTALLER_URL ||
  `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(exeName)}`;

const manifest = {
  version,
  pub_date: new Date().toISOString(),
  notes: notes || commitMsg || `Actualización Crozzo POS v${version}`,
  update_type: updateType,
  platforms: {
    'windows-x86_64': {
      url,
      signature,
      size,
    },
  },
};

const outPath = path.join(root, 'latest.json');
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log('latest.json generado:', outPath);
console.log('  version:', version);
console.log('  update_type:', updateType);
console.log('  url:', url);
console.log('  signature:', sigPath);
if (size) console.log('  size:', size, 'bytes');
