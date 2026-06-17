/**
 * Permisos Bluetooth para malla BLE en AndroidManifest generado por Tauri.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const BLE_PERMS = [
  '    <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />',
  '    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />',
  '    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" />',
  '    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />',
  '    <uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />',
  '    <uses-feature android:name="android.hardware.bluetooth_le" android:required="false" />',
];

/**
 * @param {string} manifestPath
 * @returns {boolean}
 */
export function patchAndroidBlePermissions(manifestPath) {
  if (!existsSync(manifestPath)) return false;
  let xml = readFileSync(manifestPath, 'utf8');
  if (!xml.includes('<manifest')) return false;
  let changed = false;
  for (const line of BLE_PERMS) {
    const permName = line.match(/android:name="([^"]+)"/);
    if (!permName) continue;
    if (xml.includes(permName[1])) continue;
    xml = xml.replace(/<manifest([^>]*)>/, (m) => m + '\n' + line);
    changed = true;
  }
  if (changed) writeFileSync(manifestPath, xml, 'utf8');
  return changed;
}
