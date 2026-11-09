#!/usr/bin/env node
/**
 * Pruebas de flujo de actualización con comandos Tauri simulados.
 * Registra cada comando invocado y comprueba el orden real:
 *  - Windows: Plan A (plugin:updater|check) antes que Plan C (install_setup_from_url).
 *  - Android: verificar permiso de instalar, pedirlo si falta, y solo entonces instalar el APK.
 *  - Manifiesto: los parches BLE y cámara se añaden una vez (idempotentes).
 * Uso: node scripts/test-updates-flow.mjs
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { patchAndroidBlePermissions } from './lib/patch-android-ble-perms.mjs';
import { patchAndroidCameraPermissions } from './lib/patch-android-camera-perms.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TAURI_FILES = ['app/infra/CrozzoTauriUpdater.js'];

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) { console.log('  [PASS] ' + name); passed++; }
  else { console.log('  [FAIL] ' + name + (extra ? ' — ' + extra : '')); failed++; }
}

function makeEnv(ua, handler) {
  const calls = [];
  const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, addEventListener() {}, appendChild() {}, querySelector() { return null; },
    querySelectorAll() { return []; }, closest() { return null; }, focus() {}, innerHTML: '', textContent: '' });
  const store = {};
  const win = {
    document: { readyState: 'complete', documentElement: el(), body: el(), head: el(), createElement: el,
      getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
      addEventListener() {}, removeEventListener() {} },
    navigator: { userAgent: ua, platform: ua.includes('Android') ? 'Linux armv8l' : 'Win32', onLine: true },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    setTimeout: (fn) => { fn(); return 0; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    console: { log() {}, warn() {}, error() {}, info() {} },
    fetch: () => Promise.reject(new Error('sin red en prueba')),
    location: { reload() {} }, URL, AbortController, Promise,
  };
  win.window = win;
  win.__TAURI__ = {
    core: {
      invoke(cmd, args) {
        calls.push(cmd);
        return Promise.resolve().then(() => handler(cmd, args));
      },
      Channel: function () {},
    },
  };
  const ctx = vm.createContext(win);
  for (const rel of TAURI_FILES) vm.runInContext(readFileSync(join(root, rel), 'utf8'), ctx, { filename: rel });
  return { TU: win.CrozzoTauriUpdater, calls, win };
}

async function scenarioWindowsOrder() {
  console.log('\n  Windows — orden de planes');
  const { TU, calls } = makeEnv('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', (cmd) => {
    if (cmd === 'plugin:app|version') return '1.0.282';
    if (cmd === 'crozzo_http_head') return { status: 200, content_length: 30 * 1024 * 1024 };
    if (cmd === 'plugin:updater|check') return null; // A no encuentra paquete
    if (cmd === 'install_setup_from_url') return null;
    if (cmd === 'crozzo_http_get_text') throw new Error('sin red');
    return null;
  });
  try {
    await TU.installAutomatic({ targetVersion: 'v1.0.284', onProgress() {} });
  } catch (_) { /* en esta simulación el resultado final no importa; sí el orden */ }
  const iA = calls.indexOf('plugin:updater|check');
  const iC = calls.indexOf('install_setup_from_url');
  check('Windows: A (updater) se consulta', iA >= 0, calls.join(' > '));
  check('Windows: C se usa solo después de A (fallback)', iC > iA, calls.join(' > '));
  console.log('    secuencia Windows: ' + calls.join(' > '));
}

async function scenarioAndroidPermission() {
  console.log('\n  Android — permiso de instalar antes de instalar el APK');
  const { TU, calls } = makeEnv('Mozilla/5.0 (Linux; Android 14; Tablet) AppleWebKit/537.36', (cmd) => {
    if (cmd === 'plugin:app|version') return '1.0.282';
    if (cmd === 'plugin:android-package-install|checkPermissions') return { installPackages: 'denied' };
    if (cmd === 'plugin:android-package-install|requestPermissions') return { installPackages: 'granted' };
    if (cmd === 'plugin:android-package-install|install') return null;
    if (cmd === 'crozzo_android_download_apk') return { installPath: '/data/app.apk' };
    if (cmd === 'crozzo_http_head') return { status: 200, content_length: 40 * 1024 * 1024 };
    return null;
  });
  try {
    await TU.ensureAndroidRuntimePermissions();
    await TU.installApkAutomatic({ targetVersion: 'v1.0.284', forceInstall: true, onProgress() {} }).catch(() => {});
  } catch (_) {}
  const iCheck = calls.indexOf('plugin:android-package-install|checkPermissions');
  const iReq = calls.indexOf('plugin:android-package-install|requestPermissions');
  const iInst = calls.indexOf('plugin:android-package-install|install');
  check('Android: verifica permiso de instalar', iCheck >= 0, calls.join(' > '));
  check('Android: pide permiso si falta', iReq > iCheck, calls.join(' > '));
  check('Android: instala solo después del permiso', iInst > iReq, calls.join(' > '));
  check('Android: pide cámara al arrancar', calls.includes('plugin:barcode-scanner|check_permissions'), calls.join(' > '));
  console.log('    secuencia Android: ' + calls.join(' > '));
}

function scenarioManifest() {
  console.log('\n  Manifiesto Android — parches idempotentes');
  const dir = mkdtempSync(join(tmpdir(), 'manifest-'));
  const path = join(dir, 'AndroidManifest.xml');
  writeFileSync(path, '<?xml version="1.0"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n    <application/>\n</manifest>\n');
  patchAndroidBlePermissions(path);
  patchAndroidCameraPermissions(path);
  const once = readFileSync(path, 'utf8');
  check('Manifiesto: BLUETOOTH_CONNECT declarado', once.includes('android.permission.BLUETOOTH_CONNECT'));
  check('Manifiesto: CAMERA declarada', once.includes('android.permission.CAMERA'));
  patchAndroidBlePermissions(path);
  patchAndroidCameraPermissions(path);
  const twice = readFileSync(path, 'utf8');
  check('Manifiesto: segunda ejecución no duplica', once === twice);
}

console.log('\n  Crozzo POS — Pruebas de flujo de actualización');
console.log('  ===============================================');
scenarioManifest();
await scenarioWindowsOrder().catch((e) => check('Windows: sin excepción', false, e && e.message));
await scenarioAndroidPermission().catch((e) => check('Android: sin excepción', false, e && e.message));
console.log('\n  ─────────────────────────────────────────');
console.log('  ' + (passed + failed) + ' comprobaciones: ' + passed + ' PASS, ' + failed + ' FAIL');
console.log('  ─────────────────────────────────────────\n');
process.exit(failed ? 1 : 0);
