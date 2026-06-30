#!/usr/bin/env node
/**
 * Runner unificado de la bateria de chequeos Node-puros (sin navegador ni red).
 * Ejecuta cada chequeo en su propio proceso, con timeout, y reporta un resumen.
 * Sale con codigo != 0 si alguno falla, para usarse en CI (`npm test`).
 *
 * Los chequeos que requieren Playwright/navegador NO se incluyen aqui (se corren
 * aparte con `npm run qa:regresion`).
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TIMEOUT_MS = 120000;

// Chequeos Node-puros, deterministas, rapidos y sin dependencias de red.
// Nota: `_connectivity-flow-check.mjs` (corre `cargo check`) y los chequeos con
// Playwright se ejecutan aparte. `_connectivity-orchestrator-check.mjs` queda
// fuera por una regresion pre-existente (round-trip por-mesa); correrlo con
// `npm run test:cascade`.
const CHECKS = [
  '_connectivity-mixed-flow-check.mjs',
  '_connectivity-scale-resilience.mjs',
  '_offline-gossip-check.mjs',
  '_connectivity-visibility-check.mjs',
  '_lan-mdns-ws-check.mjs',
  '_ble-mesh-check.mjs',
  '_ble-mesh-scale-sim.mjs',
  '_federacion-flow-check.mjs',
  '_rbac-security-check.mjs',
  '_pairing-qr-audit.mjs',
  '_pairing-decode-roundtrip.mjs',
];

const only = process.argv.slice(2);
const list = only.length ? CHECKS.filter((c) => only.some((o) => c.includes(o))) : CHECKS;

const results = [];
for (const name of list) {
  const script = join(root, 'scripts', name);
  process.stdout.write(`\n▶ ${name}\n`);
  const started = Date.now();
  const run = spawnSync(process.execPath, [script], {
    cwd: root,
    stdio: 'inherit',
    timeout: TIMEOUT_MS,
  });
  const ms = Date.now() - started;
  const ok = run.status === 0 && !run.error;
  results.push({ name, ok, code: run.status, ms, error: run.error ? run.error.message : '' });
}

console.log('\n──────────── RESUMEN DE TESTS ────────────');
let failed = 0;
for (const r of results) {
  const mark = r.ok ? 'PASS' : 'FAIL';
  if (!r.ok) failed++;
  const extra = r.ok ? '' : `  (code=${r.code}${r.error ? ', ' + r.error : ''})`;
  console.log(`  [${mark}] ${r.name}  ${Math.round(r.ms)}ms${extra}`);
}
console.log('──────────────────────────────────────────');
console.log(`  ${results.length - failed}/${results.length} OK`);

process.exit(failed ? 1 : 0);
