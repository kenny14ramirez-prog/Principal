#!/usr/bin/env node
/**
 * Permisos / FileProvider para instalación in-app de APK (actualizaciones Android).
 * En tags v1.0.76+ el workflow lo invoca después de patch-android-signing.mjs.
 * En main reciente patch-android-signing.mjs ya incluye esta lógica; este script sigue siendo idempotente.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const genAndroid = join(root, 'src-tauri', 'gen', 'android');
const overlayFilePaths = join(root, 'src-tauri', 'android-overlays', 'res', 'xml', 'file_paths.xml');
const overlayNetworkSec = join(root, 'src-tauri', 'android-overlays', 'res', 'xml', 'network_security_config.xml');
const filePaths = join(genAndroid, 'app', 'src', 'main', 'res', 'xml', 'file_paths.xml');
const networkSec = join(genAndroid, 'app', 'src', 'main', 'res', 'xml', 'network_security_config.xml');
const manifest = join(genAndroid, 'app', 'src', 'main', 'AndroidManifest.xml');

const FILE_PATHS_SNIPPET =
  '  <files-path name="apk_files" path="." />\n' +
  '  <files-path name="crozzo_apk_files" path="." />\n' +
  '  <cache-path name="my_cache_images" path="." />\n' +
  '  <cache-path name="crozzo_apk_cache" path="." />\n' +
  '  <external-cache-path name="crozzo_apk_external_cache" path="." />\n';

function patchApkInstallResources() {
  if (existsSync(overlayFilePaths)) {
    mkdirSync(dirname(filePaths), { recursive: true });
    copyFileSync(overlayFilePaths, filePaths);
    console.log('[patch-android-apk-install] OK overlay file_paths.xml');
  } else if (existsSync(filePaths)) {
    let xml = readFileSync(filePaths, 'utf8');
    if (
      !xml.includes('apk_files') ||
      !xml.includes('crozzo_apk_cache') ||
      !xml.includes('crozzo_apk_files') ||
      !xml.includes('my_cache_images')
    ) {
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
      console.log('[patch-android-apk-install] OK file_paths.xml');
    } else {
      console.log('[patch-android-apk-install] file_paths.xml ya parcheado.');
    }
  } else {
    console.warn('[patch-android-apk-install] file_paths.xml no encontrado (¿tauri android init?).');
  }

  if (existsSync(overlayNetworkSec)) {
    mkdirSync(dirname(networkSec), { recursive: true });
    copyFileSync(overlayNetworkSec, networkSec);
    console.log('[patch-android-apk-install] OK overlay network_security_config.xml');
  }

  if (existsSync(manifest)) {
    let xml = readFileSync(manifest, 'utf8');
    const nscRef = 'android:networkSecurityConfig="@xml/network_security_config"';
    if (!xml.includes('networkSecurityConfig') && xml.includes('<application')) {
      xml = xml.replace(/<application([^>]*)>/, (m, attrs) => {
        if (attrs.includes('networkSecurityConfig')) return m;
        return `<application${attrs} ${nscRef}>`;
      });
      writeFileSync(manifest, xml, 'utf8');
      console.log('[patch-android-apk-install] OK AndroidManifest networkSecurityConfig');
    }
    const perm = 'android.permission.REQUEST_INSTALL_PACKAGES';
    if (!xml.includes(perm) && xml.includes('<manifest')) {
      const insert =
        '    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n';
      xml = xml.replace(/<manifest([^>]*)>/, (m) => m + '\n' + insert);
      writeFileSync(manifest, xml, 'utf8');
      console.log('[patch-android-apk-install] OK AndroidManifest REQUEST_INSTALL_PACKAGES');
    } else {
      console.log('[patch-android-apk-install] AndroidManifest ya incluye REQUEST_INSTALL_PACKAGES.');
    }
  } else {
    console.warn('[patch-android-apk-install] AndroidManifest.xml no encontrado.');
  }
}

patchApkInstallResources();
