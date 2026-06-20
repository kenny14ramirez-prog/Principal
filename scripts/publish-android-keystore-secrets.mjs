#!/usr/bin/env node
/**
 * Publica ANDROID_KEY_* en GitHub Secrets (repo remoto origin).
 * Requiere: gh auth login (repo + admin:repo_hook o secrets scope).
 *
 * Uso:
 *   node scripts/publish-android-keystore-secrets.mjs
 *   node scripts/publish-android-keystore-secrets.mjs --keystore "C:\path\crozzo-android-upload.jks"
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const defaultKs = join(homedir(), '.crozzo', 'crozzo-android-upload.jks');
const alias = (process.env.ANDROID_KEY_ALIAS || 'upload').trim();
const password = (process.env.ANDROID_KEY_PASSWORD || 'crozzo-pos-tablet-2026').trim();

function parseArg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : '';
}

function gh(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8', shell: true });
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || 'gh falló').trim());
  }
  return (r.stdout || '').trim();
}

function main() {
  const keystorePath = parseArg('--keystore') || defaultKs;
  if (!existsSync(keystorePath)) {
    console.error(`[publish-android-secrets] No existe keystore: ${keystorePath}`);
    console.error('Ejecute primero: scripts\\herramientas\\generar-keystore-android.bat');
    process.exit(1);
  }

  try {
    gh(['auth', 'status']);
  } catch {
    console.error('[publish-android-secrets] gh no autenticado. Ejecute: gh auth login');
    process.exit(1);
  }

  const b64 = readFileSync(keystorePath).toString('base64');
  const repo = gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']);

  console.log(`[publish-android-secrets] Repo: ${repo}`);
  console.log(`[publish-android-secrets] Keystore: ${keystorePath}`);
  console.log(`[publish-android-secrets] Alias: ${alias}`);

  execSync(`gh secret set ANDROID_KEY_BASE64 --repo "${repo}"`, {
    input: b64,
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: true,
  });
  execSync(`gh secret set ANDROID_KEY_ALIAS --repo "${repo}" --body "${alias}"`, {
    stdio: 'inherit',
    shell: true,
  });
  execSync(`gh secret set ANDROID_KEY_PASSWORD --repo "${repo}" --body "${password}"`, {
    stdio: 'inherit',
    shell: true,
  });

  console.log('[publish-android-secrets] Secrets publicados. Re-ejecute el workflow de release Android.');
}

main();
