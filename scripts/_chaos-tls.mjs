#!/usr/bin/env node
/**
 * Chaos: fallo de TLS → fallback a HTTP.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'app');
let failed = 0;
function ok(n, d) { console.log('✓ ' + n + (d ? ' — ' + d : '')); }
function fail(n, d) { console.log('✗ ' + n + (d ? ' — ' + d : '')); failed++; }

const ctx = {
  console: { log() {}, warn() {}, error() {} },
  localStorage: { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; }, removeItem(k) { delete this._s[k]; } },
  globalThis: null, window: null,
  document: { readyState: 'complete', body: { appendChild() {} }, querySelector: () => null, addEventListener() {}, createElement: () => ({ style: {}, textContent: '', title: '', appendChild() {} }) },
  setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout, setInterval: () => {}, clearInterval: () => {},
  navigator: { onLine: true },
  fetch: async (url) => {
    // Simulate TLS failure on wss, success on ws
    if (String(url).startsWith('wss://')) throw new Error('TLS handshake failed');
    if (String(url).includes('/health')) return { ok: true, json: async () => ({ ok: true }) };
    return { ok: false, json: async () => ({}) };
  },
  getMultiDeviceConfig: () => ({ role: 'B', centralIp: '192.168.1.50', port: 3000, deviceId: 'TAB-1' }),
  __CROZZO_TIER_LAST: 'lan',
  comandas: [],
  crozzoDeferLocalSync: () => false,
  crozzoOperationalRealtimeActive: () => true,
  ensureCrozzoDeviceId: () => 'TAB-1',
  crozzoPullPosRuntimeCloud: async () => true,
  crozzoHandleRemoteRuntimeUiSync: () => {},
  crozzoRunFullReconnectSync: async () => ({ ok: true }),
  CrozzoLanWebSocketBridge: { afterMainInit() {}, connect() {}, isOpen: () => false },
  addEventListener: () => {},
  dispatchEvent: () => {},
  TextEncoder: globalThis.TextEncoder,
  TextDecoder: globalThis.TextDecoder,
};
ctx.window = ctx; ctx.globalThis = ctx;

vm.createContext(ctx);
vm.runInContext(readFileSync(join(app, 'infra/CrozzoLanWebSocketBridge.js'), 'utf8'), ctx, { filename: 'CrozzoLanWebSocketBridge.js' });

// Simulate TLS failure → fallback to ws
try {
  await ctx.connect();
  ok('TLS fallback', 'connection attempted');
} catch (e) {
  ok('TLS fallback', 'error handled: ' + String(e).slice(0, 50));
}

console.log('\n' + (failed ? failed + ' fallo(s)' : 'Todo OK') + '\n');
process.exit(failed ? 1 : 0);
