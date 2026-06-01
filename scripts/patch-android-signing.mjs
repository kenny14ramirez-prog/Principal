#!/usr/bin/env node
/**
 * Parchea app/build.gradle.kts generado por Tauri para firmar release APK.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gradlePath = join(root, 'src-tauri', 'gen', 'android', 'app', 'build.gradle.kts');

const SIGNING_BLOCK = `
    signingConfigs {
        create("release") {
            val keystorePropertiesFile = rootProject.file("keystore.properties")
            val keystoreProperties = java.util.Properties()
            if (keystorePropertiesFile.exists()) {
                keystoreProperties.load(java.io.FileInputStream(keystorePropertiesFile))
            }
            keyAlias = keystoreProperties["keyAlias"] as String
            keyPassword = keystoreProperties["password"] as String
            storeFile = file(keystoreProperties["storeFile"] as String)
            storePassword = keystoreProperties["password"] as String
        }
    }
`;

function main() {
  let src = readFileSync(gradlePath, 'utf8');
  if (src.includes('signingConfigs') && src.includes('signingConfigs.getByName("release")')) {
    console.log('[patch-android-signing] Gradle ya parcheado.');
    return;
  }
  if (!src.includes('buildTypes {')) {
    console.error('[patch-android-signing] build.gradle.kts inesperado (sin buildTypes).');
    process.exit(1);
  }
  src = src.replace(
    /(\s+)buildTypes\s*\{/,
    `$1${SIGNING_BLOCK.trim()}\n$1buildTypes {`
  );
  src = src.replace(
    /getByName\("release"\)\s*\{/,
    `getByName("release") {\n            signingConfig = signingConfigs.getByName("release")`
  );
  writeFileSync(gradlePath, src, 'utf8');
  console.log('[patch-android-signing] OK — release APK se firmará automáticamente.');
}

main();
