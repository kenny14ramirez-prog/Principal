#!/usr/bin/env node
/**
 * Verificación merge presencia multi-dispositivo (slotSessionPresence).
 * Simula escenarios que causaban parpadeo: borrado en nube por ref vacío,
 * movimiento entre mesas sin tombstone, y usuarios distintos en paralelo.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const results = [];

function ok(name, detail) {
  results.push({ ok: true, name, detail });
}
function fail(name, detail) {
  results.push({ ok: false, name, detail });
  failed++;
}
function assert(cond, name, detail) {
  if (cond) ok(name, detail);
  else fail(name, detail);
}

const rtcSrc = readFileSync(join(root, 'app/modules/CrozzoPosRuntimeCloud.js'), 'utf8');
const fnMatch = rtcSrc.match(/function mergeSedePresence\([\s\S]*?\n  \}/);
if (!fnMatch) {
  fail('extract', 'mergeSedePresence no encontrada');
  process.exit(1);
}
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fnMatch[0] + '\nthis.mergeSedePresence = mergeSedePresence;', sandbox);
const mergeSedePresence = sandbox.mergeSedePresence;

const now = Date.now();
const peer = (id, user) => ({
  deviceId: id,
  userKey: user,
  userName: user,
  at: now,
  expiresAt: now + 180000,
});

// Caso 1: ref vacío local NO debe borrar peers en nube (bug raíz del parpadeo)
{
  const cloud = {
    mesa: {
      M1: { tabletA: peer('tabletA', 'MESERO1'), pcB: peer('pcB', 'CAJERO1') },
    },
    llevar: {},
  };
  const local = { mesa: { M1: {} }, llevar: {} };
  const out = mergeSedePresence(cloud, local);
  assert(
    out.mesa.M1 && out.mesa.M1.tabletA && out.mesa.M1.pcB,
    'ref vacío local preserva nube',
    'M1 mantiene tabletA + pcB'
  );
}

// Caso 2: push parcial in-slot solo añade/actualiza su deviceId
{
  const cloud = {
    mesa: { M1: { tabletA: peer('tabletA', 'MESERO1') } },
    llevar: {},
  };
  const local = { mesa: { M2: { pcB: peer('pcB', 'CAJERO1') } }, llevar: {} };
  const out = mergeSedePresence(cloud, local);
  assert(out.mesa.M1 && out.mesa.M1.tabletA, 'parcial preserva M1', 'tabletA intacto');
  assert(out.mesa.M2 && out.mesa.M2.pcB, 'parcial añade M2', 'pcB en M2');
}

// Caso 3: tombstone _remove quita solo un deviceId
{
  const cloud = {
    mesa: {
      M1: { tabletA: peer('tabletA', 'MESERO1'), pcB: peer('pcB', 'CAJERO1') },
    },
    llevar: {},
  };
  const local = {
    mesa: { M1: { pcB: { _remove: true, deviceId: 'pcB', at: now } } },
    llevar: {},
  };
  const out = mergeSedePresence(cloud, local);
  assert(out.mesa.M1 && out.mesa.M1.tabletA && !out.mesa.M1.pcB, 'tombstone _remove', 'solo pcB eliminado');
}

// Caso 4: tipo vacío local no toca ese tipo
{
  const cloud = { mesa: { M1: { d1: peer('d1', 'U1') } }, llevar: { L1: { d2: peer('d2', 'U2') } } };
  const local = { mesa: {}, llevar: {} };
  const out = mergeSedePresence(cloud, local);
  assert(out.mesa.M1 && out.llevar.L1, 'tipo vacío intacto', 'mesa+llevar preservados');
}

// Caso 5: dos usuarios distintos en mesas distintas — merge acumula
{
  const cloud = { mesa: { M1: { t1: peer('t1', 'ADMIN') } }, llevar: {} };
  const local = { mesa: { M2: { t2: peer('t2', 'CAJERO') } }, llevar: {} };
  const out = mergeSedePresence(cloud, local);
  assert(out.mesa.M1 && out.mesa.M2, 'multi-usuario', 'M1 admin + M2 cajero coexisten');
}

// Estático: export in-slot propaga vacated + _remove
const main = readFileSync(join(root, 'app/core/CrozzoPosMain.js'), 'utf8');
assert(/crozzoMarkPresenceVacated/.test(main), 'vacate tracking', 'crozzoMarkPresenceVacated');
assert(/crozzoPresenceRemovalPeer/.test(main), 'removal peer', '_remove en export');
assert(/CROZZO_PRESENCE_PRUNE_GRACE_MS/.test(main), 'UI grace', 'gracia TTL display');
assert(/if \(!peerKeys\.length\) return/.test(rtcSrc), 'ref vacío skip', 'no borra ref por peers vacíos');
assert(!/if \(!localPeers[\s\S]{0,80}delete mergedBag\[ref\]/.test(rtcSrc), 'sin delete ref vacío', 'mergeSedePresence corregido');
assert(/scope\.mode === 'picker'/.test(main), 'picker no republica bag', 'solo tombstones en grilla');
assert(/pruneExpiredSlotPresence/.test(rtcSrc), 'prune remoto TTL', 'meta/pull sin peers vencidos');
assert(/metaPushIdx/.test(rtcSrc), 'meta merge-on-write', 'pushMesaRows fusiona meta en nube');
assert(/if \(!\(opts && opts\.skipUiFields\)\)/.test(main), 'skipUiFields navegación', 'bloque UI remoto');
assert(/UI_LOCAL_KEYS/.test(rtcSrc), 'meta sin UI local', 'mesaSeleccionada no en fila meta nube');
assert(/mesaSeleccionada = assign\('mesaSeleccionada'/.test(main), 'mesa local assign', 'solo restauración localStorage');

console.log('\n=== slot-presence-merge-check ===\n');
results.forEach((r) => {
  console.log((r.ok ? 'OK  ' : 'FAIL') + '  ' + r.name + (r.detail ? ' — ' + r.detail : ''));
});
console.log('\n' + results.filter((r) => r.ok).length + '/' + results.length + ' checks\n');
process.exit(failed ? 1 : 0);
