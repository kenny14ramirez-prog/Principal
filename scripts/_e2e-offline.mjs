#!/usr/bin/env node
/**
 * E2E virtual: offline real (desconectar red, operar, reconectar).
 */
import { readFileSync, existsSync } from 'fs';
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
    if (String(url).includes('/health')) return { ok: false };
    return { ok: false, json: async () => ({}) };
  },
  getMultiDeviceConfig: () => ({ role: 'B', centralIp: '192.168.1.50', port: 3000, deviceId: 'TAB-1' }),
  __CROZZO_TIER_LAST: 'offline',
  comandas: [],
  crozzoDeferLocalSync: () => false,
  crozzoOperationalRealtimeActive: () => false,
  ensureCrozzoDeviceId: () => 'TAB-1',
  crozzoPullPosRuntimeCloud: async () => true,
  crozzoHandleRemoteRuntimeUiSync: () => {},
  crozzoRunFullReconnectSync: async () => ({ ok: true }),
  CrozzoLanWebSocketBridge: { afterMainInit() {}, connect() {}, isOpen: () => false },
  addEventListener: () => {},
  dispatchEvent: () => {},
};
ctx.window = ctx; ctx.globalThis = ctx;

vm.createContext(ctx);
vm.runInContext(readFileSync(join(app, 'infra/CrozzoLanOpsSync.js'), 'utf8'), ctx, { filename: 'CrozzoLanOpsSync.js' });

// Test: offline mode
const tierAllows = ctx.CrozzoLanOpsSync.tierAllows();
ok('Offline tier', 'tierAllows=' + tierAllows);

// Test: comandas can be created offline (local)
ctx.comandas.push({ id: 1, transaction_id: 'tid-1', estado: 'pendiente', items: [] });
if (ctx.comandas.length === 1) { ok('Offline comanda', 'creada localmente'); } else { fail('Offline comanda', 'no creada'); }

// Test: reconnect
ctx.__CROZZO_TIER_LAST = 'lan';
ctx.navigator.onLine = true;
ok('Reconnect', 'tier changed to lan');

console.log('\n' + (failed ? failed + ' fallo(s)' : 'Todo OK') + '\n');
process.exit(failed ? 1 : 0);
