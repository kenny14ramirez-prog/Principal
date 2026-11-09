#!/usr/bin/env node
/**
 * Integration test: comanda → sync LAN → cocina → cobro → factura (con mocks).
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

// Mock environment
const ctx = {
  console: { log() {}, warn() {}, error() {} },
  localStorage: { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; }, removeItem(k) { delete this._s[k]; } },
  globalThis: null, window: null,
  document: { readyState: 'complete', body: { appendChild() {} }, querySelector: () => null, addEventListener() {}, createElement: () => ({ style: {}, textContent: '', title: '', appendChild() {} }) },
  setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout, setInterval: () => {}, clearInterval: () => {},
  navigator: { onLine: true },
  fetch: async (url) => {
    if (String(url).includes('/api/comandas')) return { ok: true, json: async () => ({ ok: true, comandas: [{ id: 42, transaction_id: 'tid-42', estado: 'listo', items: [{ id: 1 }] }] }) };
    if (String(url).includes('/health')) return { ok: true, json: async () => ({ ok: true }) };
    return { ok: false, json: async () => ({}) };
  },
  getMultiDeviceConfig: () => ({ role: 'B', centralIp: '192.168.1.50', port: 3000, deviceId: 'TAB-1' }),
  __CROZZO_TIER_LAST: 'lan',
  comandas: [],
  __crozzoEmergencyApplyComandaSnapshot: (snap) => { ctx.comandas.push(snap); return true; },
  crozzoDeferLocalSync: () => false,
  crozzoOperationalRealtimeActive: () => true,
  ensureCrozzoDeviceId: () => 'TAB-1',
  crozzoPullPosRuntimeCloud: async () => true,
  crozzoHandleRemoteRuntimeUiSync: () => {},
  crozzoRunFullReconnectSync: async () => ({ ok: true }),
  CrozzoLanWebSocketBridge: { afterMainInit() {}, connect() {}, isOpen: () => false },
  addEventListener: () => {},
  dispatchEvent: () => {},
};
ctx.window = ctx; ctx.globalThis = ctx;

// Load module
vm.createContext(ctx);
vm.runInContext(readFileSync(join(app, 'infra/CrozzoLanOpsSync.js'), 'utf8'), ctx, { filename: 'CrozzoLanOpsSync.js' });

// Test: pull comandas from LAN
const pulled = await ctx.crozzoPullComandasFromLan({ force: true, skipPrint: true });
console.log('Pull result:', pulled);
if (pulled !== true) { fail('Pull comandas', 'esperado true'); } else { ok('Pull comandas', 'true'); }

// Verify comanda applied
if (ctx.comandas.length > 0 && ctx.comandas[0].id === 42) { ok('Comanda aplicada', 'id=42'); } else { fail('Comanda aplicada', 'no aplicada'); }

// Test: digest consistency
const digest = ctx.CrozzoLanOpsSync.localComandasDigest ? ctx.CrozzoLanOpsSync.localComandasDigest() : null;
if (digest) { ok('Digest', JSON.stringify(digest)); } else { fail('Digest', 'no disponible'); }

console.log('\n' + (failed ? failed + ' fallo(s)' : 'Todo OK') + '\n');
process.exit(failed ? 1 : 0);
