#!/usr/bin/env node
/**
 * H3a — Demo combate OFFLINE REAL (G1)
 * --------------------------------------------------------------------------
 * Empaqueta la narrativa: "Crozzo sobrevive al corte de internet".
 * No simula red en runtime: verifica el cableado que hace posible WAN-off
 * (LAN Bridge + cola fiscal honesta + scorecard Offline real).
 *
 * Uso: npm run test:offline-combat
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const results = [];

function ok(n, d) {
  results.push({ ok: true, name: n, detail: d });
}
function fail(n, d) {
  results.push({ ok: false, name: n, detail: d });
  failed++;
}
function assert(c, n, d) {
  c ? ok(n, d) : fail(n, d);
}
function read(rel) {
  const p = join(root, rel);
  assert(existsSync(p), 'Existe ' + rel, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}
function mustHave(txt, needle, name) {
  assert(txt.includes(needle), name, needle);
}

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('  CROZZO — DEMO COMBATE OFFLINE REAL (G1)');
console.log('  «Cuando cae internet, la flota sigue.');
console.log('   Cuando vuelve, fiscal y pagos drenan.»');
console.log('═══════════════════════════════════════════════════════════');
console.log('');

// ── 1. Narrativa documentada ─────────────────────────────────────────────
const doctrine = read('docs/maps/MILITARY-COMMAND-DOCTRINE.md');
mustHave(doctrine, 'Operación offline REAL', 'Doctrina: grieta G1 offline REAL');
mustHave(doctrine, 'H3a', 'Doctrina: apunta a H3a');
mustHave(doctrine, 'Cuando cae internet, la flota sigue', 'Doctrina §6: narrativa demo');

const narrative = read('docs/maps/OFFLINE-COMBAT-NARRATIVE.md');
mustHave(narrative, 'sobrevive al corte de internet', 'Narrativa H3a: sobrevive corte');
mustHave(narrative, 'pendiente_timbrado', 'Narrativa: FE pendiente honesta');
mustHave(narrative, 'Offline real', 'Narrativa: dimensión Offline real');

// ── 2. LAN Bridge — path local sin WAN ────────────────────────────────────
const lan = read('app/infra/CrozzoLanSyncBridge.js');
mustHave(lan, 'crozzoActivateLocalSyncPath', 'LAN: activateLocalSyncPath');
mustHave(lan, 'browser_offline', 'LAN: browser_offline → path local');

// ── 3. Cola fiscal honesta (sin CUFE falso) ───────────────────────────────
const drain = read('app/infra/CrozzoFiscalOutboxDrain.js');
mustHave(drain, 'no_wan', 'Outbox: no drena sin WAN (salvo force)');
mustHave(drain, 'CrozzoFiscalOutboxDrain', 'Outbox: API drain');

const contig = read('app/modules/CrozzoContingenciaFiscal.js');
mustHave(contig, 'pendiente_timbrado', 'Contingencia: estado pendiente_timbrado');

const dian = read('app/core/pos/CrozzoPosDianLib.js');
assert(!/Simulación de llamada a Dataico/.test(dian), 'DIAN: sin stub silencioso Dataico');
mustHave(dian, 'STAMP_REQUIERE_PROVEEDOR', 'DIAN: mockStamp bloqueado (C4)');

// ── 4. Scorecard — dimensión Offline real (= offline_fleet) ──────────────
const scoreSrc = read('app/infra/CrozzoCommandScorecard.js');
mustHave(scoreSrc, 'offline_fleet', 'Scorecard: peso offline_fleet');
mustHave(scoreSrc, 'Offline real', 'Scorecard: label Offline real (H3a)');

const sandbox = {
  console,
  CrozzoOpFanout: {},
  CrozzoOfflineGossip: {},
  CrozzoTransportPathHealth: { getHealth: () => ({ label: 'lan' }) },
  CrozzoFiscalOutboxDrain: {},
  CrozzoDigitalPayConduit: {},
  CrozzoSedeReadiness: {
    evaluate: () => ({ seal: 'COMBAT_READY', defcon: 3, dian: { ok: true, mode: 'electronic' }, pay: { ok: true }, operableZ0: true })
  },
  crozzoDataicoStamp: function () {}
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(scoreSrc, sandbox);
const sc = sandbox.CrozzoCommandScorecard.evaluate();
assert(sc && sc.crozzo && sc.crozzo.offline_fleet >= 4, 'Scorecard runtime: offline_fleet ≥ 4 con flota+mesh', String(sc.crozzo && sc.crozzo.offline_fleet));
assert(
  sandbox.CrozzoCommandScorecard.DIMENSION_LABELS &&
    sandbox.CrozzoCommandScorecard.DIMENSION_LABELS.offline_fleet === 'Offline real',
  'Scorecard: DIMENSION_LABELS.offline_fleet === Offline real'
);
const diag = sandbox.CrozzoCommandScorecard.diagRows();
assert(
  Array.isArray(diag) && diag.some((r) => String(r.detail || r.hint || r.label || '').includes('Offline real')),
  'Scorecard diag: menciona Offline real'
);

// ── 5. Reconnect drena al volver WAN ─────────────────────────────────────
const recon = read('app/infra/CrozzoReconnectSync.js');
mustHave(recon, 'fiscalDrain', 'Reconnect: engancha drain fiscal');

// ── 6. Gate sede-combat sigue vivo ───────────────────────────────────────
assert(existsSync(join(root, 'scripts/_sede-combat-check.mjs')), 'Gate test:sede-combat existe');

console.log('');
console.log('── Checklist demo (para el encargado) ──');
console.log('  1. Cortar Wi‑Fi WAN (dejar LAN sede).');
console.log('  2. Cobrar / comandar: la flota sigue por Bridge LAN.');
console.log('  3. FE: estado pendiente_timbrado (sin CUFE inventado).');
console.log('  4. Volver WAN: outbox drena; scorecard Offline real intacto.');
console.log('');

for (const r of results) {
  console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.detail ? ' — ' + r.detail : ''));
}
console.log('');
if (failed === 0) {
  console.log('✅ H3a OFFLINE COMBAT DEMO: PASS — Crozzo sobrevive al corte de internet (cableado verificado).');
  process.exit(0);
}
console.log('❌ H3a OFFLINE COMBAT DEMO: FAIL — ' + failed + ' check(s).');
process.exit(1);
