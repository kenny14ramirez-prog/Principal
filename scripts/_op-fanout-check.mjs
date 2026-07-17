#!/usr/bin/env node
/** Verificación — bus operaciones ACK multi-canal (comandas). */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

function mustInclude(file, patterns, label) {
  const p = join(root, file);
  if (!existsSync(p)) {
    fail(label, 'ausente: ' + file);
    return '';
  }
  const txt = readFileSync(p, 'utf8');
  for (const pat of patterns) {
    const hit = typeof pat === 'string' ? txt.includes(pat) : pat.test(txt);
    if (!hit) {
      fail(label, 'falta: ' + String(pat));
      return txt;
    }
  }
  ok(label, file);
  return txt;
}

mustInclude('app/infra/CrozzoOpAckRegistry.js', [
  'CrozzoOpAckRegistry',
  'crozzoOpEmitAck',
  'crozzoOpHandleAck',
  'registerPending',
  'markOpAcked',
], 'Registry ACK global');

mustInclude('app/infra/CrozzoOpFanout.js', [
  'CrozzoOpFanout',
  'comandaEstado',
  'comandaNewByIds',
  'watchPending',
  'ACK_WAIT_MS',
  'meshEmitAllowed',
  'sendNewMesh',
  'CrozzoWifiDirectBridge',
  'CrozzoBleMesh',
], 'Fanout multi-canal');

mustInclude('app/infra/CrozzoTransportPathHealth.js', [
  'CrozzoTransportPathHealth',
  'shouldEmitMesh',
  'ws_primary',
  'mesh_survival',
], 'Transport path health');

mustInclude('app/infra/CrozzoWifiDirectBridge.js', [
  'CrozzoWifiDirectBridge',
  'http_peer_relay',
  'publishOp',
  'crozzo-lan-anchor-silence',
], 'Wi‑Fi Direct / P2P bridge');

mustInclude('app/infra/CrozzoLanActionDedup.js', [
  'CrozzoOpAckRegistry',
  'shouldApply',
], 'LanActionDedup delega OpAck');

const comCloud = mustInclude('app/modules/CrozzoComandasCloudSync.js', [
  'CrozzoOpFanout.comandaEstado',
  'CrozzoOpFanout.comandaNewByIds',
  'crozzoOpEmitAck',
  'crozzoComandaOutboxEnqueue',
  'crozzoPushComandaEstadoLan',
  'outboxFindInHistory',
  'localHistoryAlreadyEntregada',
  'skipCartReconcile: true',
], 'Comandas fanout + outbox entregada + anti-resurrect');
assert(
  comCloud.includes('comandaHistory') && comCloud.includes('payload: snap'),
  'Outbox snapshot entregada',
  'enqueue guarda payload; find mira history'
);

mustInclude('app/core/CrozzoPosMain.js', [
  'Anti-resurrección: tid ya entregada',
  'skipCartReconcile: true',
  'Comandas de cocina archivadas',
  "renderPage('mesas')",
  "String(estado || '') === 'entregada'",
  'despacharComanda(id, opts)',
  "!== 'entregada'",
], 'LISTO/limpiar/KDS Entreg → despachar + mesas');

mustInclude('app/modules/CrozzoOperativeSyncGate.js', [
  'skipCartReconcile: true',
], 'SyncGate no rehidrata carrito post-pull');

mustInclude('app/core/CrozzoPosMain.js', [
  'skipRender: true',
  'Archivar ANTES de animar',
  "=== 'entregada') return false",
  'entregada_active_cleanup',
], 'LISTO archive-first + sin fantasma entregada');

mustInclude('app/infra/CrozzoLanSyncBridge.js', ['skipFanout: true'], 'LAN HTTP despacho sin re-fanout');
mustInclude('app/infra/CrozzoLanWebSocketBridge.js', ['skipFanout: true'], 'LAN WS despacho sin re-fanout');
mustInclude('app/infra/CrozzoOperationalIngest.js', ['skipFanout: true'], 'Ingest despacho sin re-fanout');

mustInclude('app/core/CrozzoPosMain.js', [
  'purgeLocalOnly',
  'KI-026',
  'cmdOk === false',
  'Mantener panel abierto',
  "tab_precuenta",
], 'Caja Directa/cobro/precuenta (KI-026)');

mustInclude('app/infra/CrozzoLanWebSocketBridge.js', [
  'emitOpAckFromRaw',
  'op_ack',
  'crozzoOpHandleAck',
], 'LAN WS emite ACK');

mustInclude('app/infra/CrozzoOfflineGossip.js', [
  'OP_ACK',
  'publishOpAck',
  'opts.force',
  'crozzoOpEmitAck',
], 'Gossip ACK + force fanout');

const idx = readFileSync(join(root, 'app/index.html'), 'utf8');
const ackPos = idx.indexOf('CrozzoOpAckRegistry.js');
const dedupPos = idx.indexOf('CrozzoLanActionDedup.js');
const pathPos = idx.indexOf('CrozzoTransportPathHealth.js');
const fanoutPos = idx.indexOf('CrozzoOpFanout.js');
const wifiPos = idx.indexOf('CrozzoWifiDirectBridge.js');
assert(ackPos > 0 && dedupPos > ackPos, 'Orden OpAck antes LanActionDedup', 'index.html');
assert(pathPos > dedupPos && fanoutPos > pathPos, 'Orden PathHealth antes OpFanout', 'index.html');
assert(wifiPos > 0, 'Script WifiDirect en index', 'index.html');

const pkg = readFileSync(join(root, 'package.json'), 'utf8');
assert(pkg.includes('_op-fanout-check.mjs'), 'test op-fanout en sync-clinical', 'package.json');

console.log('\n=== Crozzo op-fanout ACK — verificación ===\n');
for (const r of results) {
  console.log((r.ok ? '✓' : '✗') + ' ' + r.name + (r.detail ? ' — ' + r.detail : ''));
}
console.log('\n' + (failed ? failed + ' fallo(s)' : 'Todo OK') + ' (' + results.length + ' checks)\n');
process.exit(failed ? 1 : 0);
