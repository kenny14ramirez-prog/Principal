/**
 * Añade permisos de cámara / galería al AndroidManifest generado por Tauri.
 * Sin CAMERA, getUserMedia y <input capture> fallan en la APK.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const CAMERA_PERMS = [
  '    <uses-permission android:name="android.permission.CAMERA" />',
  '    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />',
  '    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
  '    <uses-feature android:name="android.hardware.camera" android:required="false" />',
  '    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />',
];

/**
 * @param {string} manifestPath
 * @returns {boolean} true si se modificó el archivo
 */
export function patchAndroidCameraPermissions(manifestPath) {
  if (!existsSync(manifestPath)) return false;
  let xml = readFileSync(manifestPath, 'utf8');
  if (!xml.includes('<manifest')) return false;

  let changed = false;
  for (const line of CAMERA_PERMS) {
    const permName = line.match(/android:name="([^"]+)"/);
    if (!permName) continue;
    if (xml.includes(permName[1])) continue;
    xml = xml.replace(/<manifest([^>]*)>/, (m) => m + '\n' + line);
    changed = true;
  }

  if (changed) {
    writeFileSync(manifestPath, xml, 'utf8');
  }
  return changed;
}
