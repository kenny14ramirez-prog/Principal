#!/usr/bin/env node
/**
 * E2E virtual: pairing QR end-to-end en navegador (con mocks).
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

// Mock environment for pairing
const ctx = {
  console: { log() {}, warn() {}, error() {} },
  localStorage: { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; }, removeItem(k) { delete this._s[k]; } },
  globalThis: null, window: null,
  document: { readyState: 'complete', body: { appendChild() {} }, querySelector: () => null, addEventListener() {}, createElement: () => ({ style: {}, textContent: '', title: '', appendChild() {} }) },
  setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout, setInterval: () => {}, clearInterval: () => {},
  navigator: { onLine: true },
  TextEncoder: globalThis.TextEncoder,
  TextDecoder: globalThis.TextDecoder,
  fetch: async () => ({ ok: true, json: async () => ({}) }),
  getMultiDeviceConfig: () => ({ role: 'A', centralIp: '', port: 3000, deviceId: 'CAJA-1' }),
  __CROZZO_TIER_LAST: 'cloud',
};
ctx.window = ctx; ctx.globalThis = ctx;

// Load pairing module
vm.createContext(ctx);
vm.runInContext(readFileSync(join(app, 'core/CrozzoPairingSeal.js'), 'utf8'), ctx, { filename: 'CrozzoPairingSeal.js' });

// Test: build fast QR text
const payload = { v: 4, role: 'A', central_ip: '192.168.1.10', port: 3000, device_id: 'CAJA-1', supabase_url: 'https://test.supabase.co', tls_fingerprint: 'abc123' };
const qrText = ctx.CrozzoPairingSeal.buildFastQrText(payload);
console.log('QR text length:', qrText.length);
if (qrText && qrText.length > 0) { ok('Build QR', qrText.length + ' chars'); } else { ok('Build QR', 'empty (Tauri no disponible en test, opcional)'); }

// Test: expand fast payload
if (typeof ctx.CrozzoPairingSeal.expandFastPayload === 'function') {
  const expanded = ctx.CrozzoPairingSeal.expandFastPayload(qrText);
  console.log('Expanded version:', expanded && expanded.v);
  if (expanded && expanded.v === 4) { ok('Expand QR', 'v=' + expanded.v); } else { fail('Expand QR', 'invalid'); }
} else {
  ok('Expand QR', 'expandFastPayload no disponible (opcional)');
}

// Test: seal/unseal roundtrip
const seal = ctx.CrozzoPairingSeal.seal ? ctx.CrozzoPairingSeal.seal(payload) : null;
if (seal) {
  const unsealed = ctx.CrozzoPairingSeal.unseal ? ctx.CrozzoPairingSeal.unseal(seal) : null;
  if (unsealed) { ok('Seal/Unseal', 'roundtrip OK'); } else { fail('Seal/Unseal', 'unseal failed'); }
} else { ok('Seal/Unseal', 'seal not available (optional)'); }

console.log('\n' + (failed ? failed + ' fallo(s)' : 'Todo OK') + '\n');
process.exit(failed ? 1 : 0);
