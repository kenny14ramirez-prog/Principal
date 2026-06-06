#!/usr/bin/env node
/**
 * Parchea proyecto Android generado por Tauri:
 * - Firma release APK (Gradle)
 * - Permisos / FileProvider para instalación in-app de actualizaciones
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gradlePath = join(root, 'src-tauri', 'gen', 'android', 'app', 'build.gradle.kts');
const genAndroid = join(root, 'src-tauri', 'gen', 'android');
const filePaths = join(genAndroid, 'app', 'src', 'main', 'res', 'xml', 'file_paths.xml');
const manifest = join(genAndroid, 'app', 'src', 'main', 'AndroidManifest.xml');

const FILE_PATHS_SNIPPET =
  '  <cache-path name="crozzo_apk_cache" path="." />\n  <files-path name="crozzo_apk_files" path="." />\n';

const PROPERTIES_IMPORT = 'import java.util.Properties';

const SIGNING_BLOCK = `signingConfigs {
        create("release") {
            val keystorePropertiesFile = rootProject.file("keystore.properties")
            val keystoreProperties = Properties()
            if (keystorePropertiesFile.exists()) {
                keystoreProperties.load(keystorePropertiesFile.inputStream())
            }
            keyAlias = keystoreProperties.getProperty("keyAlias")
            keyPassword = keystoreProperties.getProperty("password")
            storeFile = file(keystoreProperties.getProperty("storeFile") ?: "")
            storePassword = keystoreProperties.getProperty("password")
        }
    }`;

function ensurePropertiesImport(src) {
  if (src.includes(PROPERTIES_IMPORT)) return src;
  const importBlock = src.match(/^(?:import .+\n)+/);
  if (importBlock) {
    return src.replace(importBlock[0], importBlock[0] + PROPERTIES_IMPORT + '\n');
  }
  return PROPERTIES_IMPORT + '\n\n' + src;
}

function fixLegacyJavaUtilSyntax(src) {
  return src
    .replace(/java\.util\.Properties\(\)/g, 'Properties()')
    .replace(
      /keystoreProperties\.load\(java\.io\.FileInputStream\(keystorePropertiesFile\)\)/g,
      'keystoreProperties.load(keystorePropertiesFile.inputStream())'
    )
    .replace(/keystoreProperties\["keyAlias"\] as String/g, 'keystoreProperties.getProperty("keyAlias")')
    .replace(/keystoreProperties\["password"\] as String/g, 'keystoreProperties.getProperty("password")')
    .replace(
      /file\(keystoreProperties\["storeFile"\] as String\)/g,
      'file(keystoreProperties.getProperty("storeFile") ?: "")'
    );
}

function alreadyPatched(src) {
  return (
    src.includes('signingConfigs') &&
    src.includes('signingConfigs.getByName("release")') &&
    src.includes('Properties()') &&
    !src.includes('java.util.Properties')
  );
}

function patchApkInstallResources() {
  if (existsSync(filePaths)) {
    let xml = readFileSync(filePaths, 'utf8');
    if (!xml.includes('crozzo_apk_cache') || !xml.includes('crozzo_apk_files')) {
      if (xml.includes('</paths>')) {
        xml = xml.replace('</paths>', FILE_PATHS_SNIPPET + '</paths>');
      } else {
        xml =
          '<?xml version="1.0" encoding="utf-8"?>\n<paths xmlns:android="http://schemas.android.com/apk/res/android">\n' +
          FILE_PATHS_SNIPPET +
          '</paths>\n';
        mkdirSync(dirname(filePaths), { recursive: true });
      }
      writeFileSync(filePaths, xml, 'utf8');
      console.log('[patch-android-signing] OK file_paths.xml (APK in-app)');
    }
  } else {
    console.warn('[patch-android-signing] file_paths.xml no encontrado (¿tauri android init?).');
  }

  if (existsSync(manifest)) {
    let xml = readFileSync(manifest, 'utf8');
    const perm = 'android.permission.REQUEST_INSTALL_PACKAGES';
    if (!xml.includes(perm) && xml.includes('<manifest')) {
      const insert =
        '    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n';
      xml = xml.replace(/<manifest([^>]*)>/, (m) => m + '\n' + insert);
      writeFileSync(manifest, xml, 'utf8');
      console.log('[patch-android-signing] OK AndroidManifest REQUEST_INSTALL_PACKAGES');
    }
  } else {
    console.warn('[patch-android-signing] AndroidManifest.xml no encontrado.');
  }
}

function main() {
  patchApkInstallResources();

  if (!existsSync(gradlePath)) {
    console.error('[patch-android-signing] build.gradle.kts no encontrado (¿tauri android init?).');
    process.exit(1);
  }

  let src = readFileSync(gradlePath, 'utf8');
  src = fixLegacyJavaUtilSyntax(src);

  if (alreadyPatched(src)) {
    src = ensurePropertiesImport(src);
    writeFileSync(gradlePath, src, 'utf8');
    console.log('[patch-android-signing] Gradle ya parcheado.');
    return;
  }

  if (!src.includes('buildTypes {')) {
    console.error('[patch-android-signing] build.gradle.kts inesperado (sin buildTypes).');
    process.exit(1);
  }

  src = ensurePropertiesImport(src);
  src = src.replace(
    /(\s+)buildTypes\s*\{/,
    `$1${SIGNING_BLOCK}\n$1buildTypes {`
  );
  src = src.replace(
    /getByName\("release"\)\s*\{/,
    `getByName("release") {\n            signingConfig = signingConfigs.getByName("release")`
  );
  writeFileSync(gradlePath, src, 'utf8');
  console.log('[patch-android-signing] OK — release APK se firmará automáticamente.');
}

main();
