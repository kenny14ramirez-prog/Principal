#!/usr/bin/env node
/**
 * Build Tauri local:
 * - Con clave en %USERPROFILE%\.tauri\crozzo-pos.key → firma updater (OTA).
 * - Sin clave → genera .exe igual, sin artefactos updater firmados.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const keyPath =
  (process.env.TAURI_SIGNING_PRIVATE_KEY_PATH || '').trim() ||
  join(process.env.USERPROFILE || process.env.HOME || '', '.tauri', 'crozzo-pos.key');
const localConf = join(root, 'src-tauri', 'tauri.local.conf.json');

const env = { ...process.env };
const extraArgs = [];

if (existsSync(keyPath)) {
  env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(keyPath, 'utf8').trim();
  if (!env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD) env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = '';
  console.log('[build-local] Clave de firma cargada:', keyPath);
} else {
  if (!existsSync(localConf)) {
    writeFileSync(
      localConf,
      JSON.stringify({ bundle: { createUpdaterArtifacts: false } }, null, 2) + '\n',
      'utf8'
    );
  }
  extraArgs.push('-c', localConf);
  console.warn('[build-local] Sin clave privada — se omite firma updater (el .exe se genera igual).');
  console.warn('[build-local] Para OTA firmado: scripts\\herramientas\\generar-claves-tauri.bat');
}

const run = spawnSync('npm', ['run', 'tauri', 'build', '--', ...extraArgs], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: true,
});

process.exit(run.status === null ? 1 : run.status);
