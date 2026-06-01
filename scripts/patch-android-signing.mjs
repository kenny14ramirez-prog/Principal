#!/usr/bin/env node
/**
 * Parchea app/build.gradle.kts generado por Tauri para firmar release APK.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gradlePath = join(root, 'src-tauri', 'gen', 'android', 'app', 'build.gradle.kts');

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

function main() {
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
