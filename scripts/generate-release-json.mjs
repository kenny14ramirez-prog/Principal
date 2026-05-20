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
const notes = process.argv[3] || '';
let updateType = (process.argv[4] || 'optional').toLowerCase();

if (!version) {
  console.error('Uso: node scripts/generate-release-json.mjs <version> "<notes>" <critical|optional>');
  process.exit(1);
}

if (!['critical', 'optional'].includes(updateType)) {
  const lower = `${notes} ${updateType}`.toLowerCase();
  if (/🔥|critico|crítico|critical|urgente|seguridad/.test(lower)) updateType = 'critical';
  else updateType = 'optional';
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

const searchRoots = [
  path.join(root, 'src-tauri', 'target'),
  path.join(root, 'target'),
  root,
];

let sigPath = process.env.CROZZO_SIG_PATH;
let exePath = process.env.CROZZO_EXE_PATH;

if (!sigPath) {
  const sigs = searchRoots.flatMap((r) => findFiles(r, '.sig'));
  sigs.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  sigPath = sigs.find((p) => /setup|nsis|msi/i.test(p)) || sigs[0];
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
const exeName = exePath ? path.basename(exePath) : `Crozzo.POS_${version}_x64-setup.exe`;
const size = exePath && fs.existsSync(exePath) ? fs.statSync(exePath).size : 0;

const url =
  process.env.CROZZO_INSTALLER_URL ||
  `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(exeName).replace(/%20/g, '%20')}`;

const manifest = {
  version,
  pub_date: new Date().toISOString(),
  notes,
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
