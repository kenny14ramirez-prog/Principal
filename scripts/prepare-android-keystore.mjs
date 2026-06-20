#!/usr/bin/env node
/**
 * Crea keystore.properties para Gradle (despu├®s de `tauri android init`).
 * 1) Secrets GitHub: ANDROID_KEY_BASE64, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
 * 2) Fallback repo: .github/signing/android-upload.jks.b64
 * 3) Fallback local: %USERPROFILE%\.crozzo\crozzo-android-upload.jks o cache CI
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const genAndroid = join(root, 'src-tauri', 'gen', 'android');
const propsPath = join(genAndroid, 'keystore.properties');
const repoBootstrapB64 = join(root, '.github', 'signing', 'android-upload.jks.b64');
const localStableKeystore = join(homedir(), '.crozzo', 'crozzo-android-upload.jks');
const defaultPassword = 'crozzo-pos-tablet-2026';

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

function readBootstrapB64() {
  if (!existsSync(repoBootstrapB64)) return '';
  return readFileSync(repoBootstrapB64, 'utf8').replace(/\s+/g, '').trim();
}

function writeProps(keystorePath, password, alias) {
  writeFileSync(
    propsPath,
    `password=${password}\nkeyAlias=${alias}\nstoreFile=${escPath(keystorePath)}\n`
  );
}

function main() {
  if (!existsSync(genAndroid)) {
    console.error('[prepare-android-keystore] Falta src-tauri/gen/android ÔÇö ejecute tauri android init primero.');
    process.exit(1);
  }

  const alias = (process.env.ANDROID_KEY_ALIAS || 'upload').trim();
  let password = (process.env.ANDROID_KEY_PASSWORD || '').trim();
  let b64 = (process.env.ANDROID_KEY_BASE64 || '').trim();
  let keystorePath = (process.env.ANDROID_KEYSTORE_PATH || '').trim();
  const inCi =
    String(process.env.GITHUB_ACTIONS || process.env.CI || '').toLowerCase() === 'true';

  let b64Source = '';
  if (b64) {
    b64Source = process.env.ANDROID_KEY_BASE64 ? 'secret' : '';
  }

  if (!b64) {
    b64 = readBootstrapB64();
    if (b64) {
      b64Source = 'bootstrap';
      if (!password) password = defaultPassword;
    }
  }

  if (b64) {
    keystorePath =
      keystorePath ||
      join(process.env.RUNNER_TEMP || process.env.TEMP || '/tmp', 'crozzo-upload.jks');
    writeFileSync(keystorePath, Buffer.from(b64, 'base64'));
    if (!password) {
      console.error('[prepare-android-keystore] Falta ANDROID_KEY_PASSWORD con ANDROID_KEY_BASE64.');
      process.exit(1);
    }
    console.log(
      b64Source === 'secret'
        ? '[prepare-android-keystore] Keystore de producci├│n (secret GitHub).'
        : '[prepare-android-keystore] Keystore estable (.github/signing/android-upload.jks.b64).'
    );
    writeProps(keystorePath, password, alias);
    return;
  }

  keystorePath =
    keystorePath ||
    join(process.env.RUNNER_TEMP || process.env.TEMP || join(root, '.crozzo-android'), 'crozzo-upload.jks');
  const devPass = password || defaultPassword;

  if (existsSync(localStableKeystore) && keystorePath !== localStableKeystore) {
    keystorePath = localStableKeystore;
    console.log('[prepare-android-keystore] Keystore local estable (%USERPROFILE%\\.crozzo).');
  } else if (!existsSync(keystorePath)) {
    if (inCi) {
      console.error(
        [
          '[prepare-android-keystore] ABORTANDO: no hay firma Android configurada.',
          'Opciones (en orden):',
          '  1) GitHub Secrets: ANDROID_KEY_BASE64, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD',
          '  2) Archivo en repo: .github/signing/android-upload.jks.b64',
          '  3) Cach├® CI en runner.temp/crozzo-upload.jks (segunda ejecuci├│n tras bootstrap)',
          'Genere el keystore: scripts/herramientas/generar-keystore-android.bat',
          'Publique secrets: node scripts/publish-android-keystore-secrets.mjs',
        ].join('\n')
      );
      process.exit(1);
    }
    console.warn(
      '[prepare-android-keystore] ATENCI├ôN (solo dev local): se crear├í un keystore NUEVO. Las tablets con APK anterior deber├ín DESINSTALAR la app antes de instalar este build (conflicto de firma).'
    );
    console.log('[prepare-android-keystore] Generando keystore Crozzo (primera vez / cache vac├¡a)ÔÇª');
    runKeytool(keystorePath, alias, devPass);
  } else {
    console.log('[prepare-android-keystore] Reutilizando keystore cacheado.');
  }

  writeProps(keystorePath, devPass, alias);
}

main();
