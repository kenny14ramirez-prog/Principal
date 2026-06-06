#!/usr/bin/env node
/**
 * Alinea tauri.conf + HTML con el último release publicado en GitHub (tag vX.Y.Z).
 * Uso: node scripts/sync-version-from-github.mjs
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchGitHubReleaseVersion, readTauriVersion } from './resolve-crozzo-version.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const remote = await fetchGitHubReleaseVersion();
if (!remote) {
  console.error('[sync-version] No se pudo leer el release latest en GitHub.');
  process.exit(1);
}

const local = readTauriVersion(root);
console.log('[sync-version] GitHub release : v' + remote);
console.log('[sync-version] Proyecto local : v' + (local || '?'));

if (local === remote) {
  console.log('[sync-version] Ya alineado.');
  process.exit(0);
}

const r = spawnSync(process.execPath, [join(root, 'scripts', 'set-tauri-version.mjs'), remote], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(r.status || 0);
