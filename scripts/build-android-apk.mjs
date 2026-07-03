#!/usr/bin/env node
/**
 * Compila APK local con los mismos pasos que GitHub Actions (tauri-release.yml, job Android).
 * Salida: dist/local/BONA_origen_X.Y.Z_arm64.apk — mismo nombre que el release de GitHub.
 *
 * Firma: usa el mismo keystore que CI (.github/signing/android-upload.jks.b64 o secrets).
 * Así puede instalar sobre tablets que ya tienen el APK de GitHub sin publicar OTA.
 */
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gradleMarker = join(root, 'src-tauri', 'gen', 'android', 'app', 'build.gradle.kts');
const bootstrapB64 = join(root, '.github', 'signing', 'android-upload.jks.b64');
const defaultPassword = 'crozzo-pos-tablet-2026';

function run(label, cmd, args, extraEnv = {}) {
  console.log(`\n[android-build] ${label}`);
  const env = { ...process.env, ...extraEnv };
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: true, env });
  if (r.status !== 0) {
    console.error(`[android-build] Falló: ${label}`);
    process.exit(r.status || 1);
  }
}

function androidEnv() {
  const env = { ...process.env };
  if (!env.ANDROID_KEY_ALIAS) env.ANDROID_KEY_ALIAS = 'upload';
  if (!env.ANDROID_KEY_PASSWORD && existsSync(bootstrapB64)) {
    env.ANDROID_KEY_PASSWORD = defaultPassword;
  }
  if (env.ANDROID_HOME && !env.ANDROID_SDK_ROOT) {
    env.ANDROID_SDK_ROOT = env.ANDROID_HOME;
  }
  return env;
}

function ensureAndroidProject(env) {
  if (existsSync(gradleMarker)) return;
  const genDir = join(root, 'src-tauri', 'gen', 'android');
  if (existsSync(genDir)) {
    console.warn('[android-build] Proyecto Android incompleto — reinicializando…');
    try {
      rmSync(genDir, { recursive: true, force: true });
    } catch (_) {
      /* ignore */
    }
  }
  run('Inicializar Android (tauri android init)', 'npx', ['tauri', 'android', 'init', '--ci', '--skip-targets-install'], {
    ...env,
    CI: 'true',
  });
  if (!existsSync(gradleMarker)) {
    console.error('[android-build] tauri android init no generó build.gradle.kts');
    process.exit(1);
  }
}

function main() {
  const env = androidEnv();

  if (!env.ANDROID_HOME) {
    console.error('[android-build] Falta ANDROID_HOME. Instale Android Studio / SDK. Ver ANDROID-SETUP.md');
    process.exit(1);
  }

  const hasBootstrap = existsSync(bootstrapB64);
  const localKs = join(
    process.env.USERPROFILE || process.env.HOME || '',
    '.crozzo',
    'crozzo-android-upload.jks'
  );
  if (!hasBootstrap && !existsSync(localKs) && !env.ANDROID_KEY_BASE64) {
    console.error('[android-build] No hay keystore de producción.');
    console.error('  Ejecute: scripts\\herramientas\\generar-keystore-android.bat');
    console.error('  O asegure .github\\signing\\android-upload.jks.b64 en el repo.');
    process.exit(1);
  }

  if (hasBootstrap) {
    console.log('[android-build] Firma: keystore de producción (.github/signing) — mismo APK que GitHub CI.');
  } else if (existsSync(localKs)) {
    console.log('[android-build] Firma: keystore local (%USERPROFILE%\\.crozzo).');
  }

  run('Sync app → src', process.execPath, [join(root, 'scripts', 'sync-frontend-to-src.mjs')], env);
  ensureAndroidProject(env);

  run('Configurar firma Android', process.execPath, [join(root, 'scripts', 'prepare-android-keystore.mjs')], env);
  run('Parche Gradle (firma release)', process.execPath, [join(root, 'scripts', 'patch-android-signing.mjs')], env);

  run('Compilar APK aarch64', 'npx', ['tauri', 'android', 'build', '--target', 'aarch64'], {
    ...env,
    CI: 'true',
  });

  run('Copiar a dist/local', process.execPath, [join(root, 'scripts', 'compilar-apk-local.mjs')], env);

  console.log('\n[android-build] LISTO — instale en tablet desde dist\\local\\');
  console.log('[android-build] Mismo nombre que GitHub: BONA_origen_<version>_arm64.apk');
  console.log('[android-build] Si Android rechaza actualizar, suba version en tauri.conf.json o desinstale la app anterior.');
}

main();
