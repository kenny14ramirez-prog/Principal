#!/usr/bin/env node
/** Alinea tauri.conf.json + HTML con el tag de release (v1.0.28 → 1.0.28). */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tag = process.argv[2] || '';
const semver = String(tag).replace(/^v/i, '').trim();

if (!semver) {
  console.error('Uso: node scripts/sync-version-from-tag.mjs v1.0.28');
  process.exit(1);
}

const r = spawnSync(process.execPath, [join(root, 'scripts', 'set-tauri-version.mjs'), semver], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(r.status || 0);
