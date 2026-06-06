#!/usr/bin/env node
/**
 * Crea keystore.properties para Gradle (después de `tauri android init`).
 * 1) Secrets GitHub: ANDROID_KEY_BASE64, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
 * 2) Fallback: keystore estable en cache CI (sideload / tablets Crozzo)
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const genAndroid = join(root, 'src-tauri', 'gen', 'android');
const propsPath = join(genAndroid, 'keystore.properties');

function escPath(p) {
  return String(p).replace(/\\/g, '/');
}

function runKeytool(keystorePath, alias, password) {
  mkdirSync(dirname(keystorePath), { recursive: true });
  const dname = 'CN=Crozzo POS, OU=Mobile, O=Crozzo, L=Colombia, C=CO';
  execSync(
    [
      'keytool -genkeypair -v',
      `-keystore "${keystorePath}"`,
      `-storepass "${password}"`,
      `-keypass "${password}"`,
      `-alias "${alias}"`,
      '-keyalg RSA',
      '-keysize 2048',
      '-validity 10000',
      `-dname "${dname}"`,
    ].join(' '),
    { stdio: 'inherit', shell: true }
  );
}

function main() {
  if (!existsSync(genAndroid)) {
    console.error('[prepare-android-keystore] Falta src-tauri/gen/android — ejecute tauri android init primero.');
    process.exit(1);
  }

  const alias = (process.env.ANDROID_KEY_ALIAS || 'upload').trim();
  const password = (process.env.ANDROID_KEY_PASSWORD || '').trim();
  const b64 = (process.env.ANDROID_KEY_BASE64 || '').trim();
  let keystorePath = (process.env.ANDROID_KEYSTORE_PATH || '').trim();

  if (b64) {
    keystorePath =
      keystorePath ||
      join(process.env.RUNNER_TEMP || process.env.TEMP || '/tmp', 'crozzo-upload.jks');
    writeFileSync(keystorePath, Buffer.from(b64, 'base64'));
    if (!password) {
      console.error('[prepare-android-keystore] Falta ANDROID_KEY_PASSWORD con ANDROID_KEY_BASE64.');
      process.exit(1);
    }
    console.log('[prepare-android-keystore] Keystore de producción (secret GitHub).');
  } else {
    keystorePath =
      keystorePath ||
      join(process.env.RUNNER_TEMP || process.env.TEMP || join(root, '.crozzo-android'), 'crozzo-upload.jks');
    const devPass = password || 'crozzo-pos-tablet-2026';
    if (!existsSync(keystorePath)) {
      console.log('[prepare-android-keystore] Generando keystore Crozzo (primera vez / cache vacía)…');
      runKeytool(keystorePath, alias, devPass);
    } else {
      console.log('[prepare-android-keystore] Reutilizando keystore cacheado.');
    }
    writeFileSync(
      propsPath,
      `password=${devPass}\nkeyAlias=${alias}\nstoreFile=${escPath(keystorePath)}\n`
    );
    console.warn(
      '[prepare-android-keystore] AVISO: keystore de desarrollo/cache CI. Para firma estable en tablets configure ANDROID_KEY_BASE64 en GitHub Secrets.'
    );
    return;
  }

  writeFileSync(
    propsPath,
    `password=${password}\nkeyAlias=${alias}\nstoreFile=${escPath(keystorePath)}\n`
  );
}

main();
