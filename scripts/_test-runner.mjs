#!/usr/bin/env node
/**
 * Runner de tests continuos — ejecuta todos los checks de conectividad
 * y reporta un resumen consolidado.
 */
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [
  'scripts/_lan-ops-sync-check.mjs',
  'scripts/_connectivity-mixed-flow-check.mjs',
  'scripts/_legendary-connectivity-check.mjs',
  'scripts/_ops-plane-presence-check.mjs',
  'scripts/_connectivity-equilibrium-check.mjs',
  'scripts/_connectivity-flow-check.mjs',
  'scripts/_connectivity-orchestrator-check.mjs',
  'scripts/_tls-pinning-check.mjs',
  'scripts/_cert-trust-check.mjs',
  'scripts/_channel-fallback-check.mjs',
  'scripts/_print-queue-check.mjs',
  'scripts/_connectivity-ux-check.mjs',
  'scripts/_cloud-discovery-check.mjs',
  'scripts/_integration-comanda-flow.mjs',
  'scripts/_integration-offline-reconnect.mjs',
  'scripts/_property-digest.mjs',
  'scripts/_property-outbox.mjs',
  'scripts/_e2e-pairing.mjs',
  'scripts/_e2e-offline.mjs',
  'scripts/_e2e-webrtc.mjs',
  'scripts/_e2e-indexeddb.mjs',
  'scripts/_e2e-multi-device.mjs',
  'scripts/_stress-1000-products.mjs',
  'scripts/_stress-20-devices.mjs',
  'scripts/_chaos-tls.mjs',
];

let failed = 0;
const results = [];
for (const c of checks) {
  const start = Date.now();
  try {
    const out = execSync(`node ${c}`, { cwd: root, stdio: 'pipe', encoding: 'utf8', timeout: 120000 });
    results.push({ check: c, ok: true, ms: Date.now() - start, tail: out.trim().split('\n').pop() });
  } catch (e) {
    failed++;
    const msg = (e.stdout || e.stderr || e.message || '').toString().trim().split('\n').pop();
    results.push({ check: c, ok: false, ms: Date.now() - start, tail: msg });
  }
}

console.log('\n=== TEST RUNNER — Resumen ===\n');
for (const r of results) {
  console.log((r.ok ? '✅' : '❌') + ' ' + r.check + ' — ' + r.tail + ' (' + r.ms + 'ms)');
}
console.log('\n' + (failed ? failed + ' FALLO(S)' : 'TODO OK') + ' (' + results.length + ' checks)\n');
process.exit(failed ? 1 : 0);
