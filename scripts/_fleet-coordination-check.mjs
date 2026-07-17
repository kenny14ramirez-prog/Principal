#!/usr/bin/env node
/** Verificación — señales WAN, reconciliación flota, circuit breaker QR. */
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

mustInclude('app/infra/CrozzoPeerDirectory.js', [
  'buildIdentityCard',
  'announceIdentity',
  'ingestIdentityCard',
  'peersForQrHint',
  'getFleetSnapshot',
  'identity_card',
  'maybeEchoFleetRoster',
  'ingestFleetRoster',
  'fleet_roster',
  'softHealSoloFleet',
  'getSedeMismatchCount',
  'invalidateOwnLanIpCache',
], 'Fleet identity card + roster echo');

mustInclude('app/infra/CrozzoLanWebSocketBridge.js', [
  'maybeEchoFleetRoster',
  'fleet_roster',
  'ingestFleetRoster',
], 'WS fleet_roster eco');

mustInclude('app/infra/CrozzoLanSyncBridge.js', [
  'tryApplyFleetRoster',
  'maybeEchoFleetRoster',
], 'HTTP fleet_roster eco');

mustInclude('app/modules/CrozzoComunicacionDiag.js', [
  'crozzoAnnounceFleetIdentity',
  'Flota: anuncio forzado',
  'rediscoverCentral',
  'fleet-sede-mismatch',
], 'Diag Reparar anuncia flota');

const fleetCommTxt = mustInclude('app/infra/CrozzoFleetCommState.js', [
  'crozzo_own_lan_ip_v1',
  'nunca centralIp',
], 'FleetCommState lanIp propia (D-011)');
assert(
  !fleetCommTxt.includes('lanIp = String(cfg.centralIp') &&
    !fleetCommTxt.includes("lanIp = cfg.centralIp") &&
    !fleetCommTxt.includes("lanIp: cfg.centralIp"),
  'Rol B no asigna centralIp a lanIp',
  'sin lanIp=centralIp'
);

mustInclude('app/infra/CrozzoPostPairConnect.js', [
  'announceFleetIfSolo',
  'crozzoAnnounceFleetIdentity',
], 'PostPair safety announce');

mustInclude('app/infra/CrozzoPairingAutoConnect.js', [
  'crozzoAnnounceFleetIdentity',
  'peerCount',
], 'AutoConnect safety announce');

mustInclude('src-tauri/src/crozzo_lan_sync_server.rs', [
  'fleet_roster',
  'identity_roster',
], 'Rust no upserta fleet_roster como comanda');

mustInclude('app/core/CrozzoPairingSeal.js', ['fleet_peers', 'compact.fp', 'peersForQrHint'], 'QR fleet hint');

mustInclude('app/core/CrozzoPosMain.js', [
  'announceIdentity',
  'ingestFleetPeersHint',
  'qr_issuer',
], 'Post-QR announce identity');

mustInclude('app/infra/CrozzoOfflineGossip.js', ['IDENTITY', 'publishIdentityCard'], 'Gossip identity');

mustInclude('app/infra/CrozzoCloudThrottle.js', [
  'crozzoNoteWanUnreachable',
  'crozzoCloudWanReady',
  'crozzoWanOnline',
], 'Señales WAN en throttle');

mustInclude('app/infra/CrozzoFleetOperationalReconcile.js', [
  'CrozzoFleetOperationalReconcile',
  'crozzoActivateLocalSyncPath',
  'pullLocalRuntimeOnce',
  'crozzoPullPosRuntimeCloud',
  'crozzoGetActivePageId',
  'crozzoMarkOperativeSyncReady',
], 'Reconciliación flota');

const fleetTxt = readFileSync(join(root, 'app/infra/CrozzoFleetOperationalReconcile.js'), 'utf8');
assert(!fleetTxt.includes("crozzoZ0ScheduleUiRefresh('fleet_reconcile')"), 'Fleet UI refresh', 'no usa fleet_reconcile como página');

mustInclude('app/modules/CrozzoInternalQrRegistry.js', [
  'cloudPublishAllowed',
  'openCloudCircuit',
  'PUBLISH_MIN_GAP_MS',
], 'Circuit breaker QR interno');

mustInclude('app/infra/CrozzoLanSyncBridge.js', ['underPressure'], 'LAN pull bajo presión nube');

mustInclude('app/core/CrozzoConnectionManager.js', ['CrozzoConnectionManager'], 'ConnectionManager global');

const startupTxt = mustInclude('app/infra/CrozzoStartupReady.js', ['CrozzoFleetOperationalReconcile', 'crozzoPairingAutoConnect'], 'Startup flota');
assert(
  startupTxt.includes("crozzoPairingAutoConnect('startup', { force: false, skipInvalidate: true })"),
  'Startup sin invalidar gate',
  'startup usa skipInvalidate'
);

const pairingTxt = mustInclude('app/infra/CrozzoPairingAutoConnect.js', [
  'CrozzoPairingAutoConnect',
  'crozzoActivateLocalSyncPath',
  'crozzoFleetOperationalReconcile',
], 'Auto-conexión post-QR');
assert(
  pairingTxt.includes("run('qr_exchange', { force: false, skipInvalidate: true })"),
  'QR exchange sin invalidar gate',
  'qr_exchange usa skipInvalidate'
);

mustInclude('app/modules/CrozzoOperativeSyncGate.js', [
  'pullLocalRuntimeOnce',
  'crozzoMarkOperativeSyncReady',
  'markOperativeReady',
], 'Sync gate pull runtime LAN');

mustInclude('app/core/CrozzoPosMain.js', [
  'crozzoMeseroOperativeTabletPerm',
  'renderPage background omitido',
  'crozzoSlotCartDetachBlocksRemoteCart',
  'crozzoReconcileAllSlotCartsFromComandas',
  'crozzoRuntimeSyncHybrid',
  'crozzoHybridWanEvidence',
  'hybrid_lan_parallel',
  'crozzoForceSedeCanonical',
  'crozzoCloudOperationalRealtimeHealthy(14000)',
], 'Mesero Z0 + sync híbrido + sede canónica');

mustInclude('app/infra/CrozzoPageCloudWatch.js', [
  'refreshOpsTransports',
  'forceHybrid',
  'crozzoRuntimeSyncHybrid',
], 'PageCloudWatch híbrido paralelo');

mustInclude('app/infra/CrozzoCloudSyncPriorities.js', [
  'crozzoZ0HybridParallelLan',
  'SUBSCRIBED sin eventos',
], 'Z0 híbrido LAN paralelo');

mustInclude('app/modules/CrozzoOperativeReservorio.js', [
  'CrozzoOperativeReservorio',
  'allowAutoDiscard',
  'allowCloudAuthoritativeEmpty',
  'loadRaw',
  'rotateBackup',
], 'Reservorio operativo mesas/caja');

mustInclude('app/modules/CrozzoPosRuntimeCloud.js', [
  'notifyRuntimeUiIfApplied(true)',
  'MESA_PULL_COALESCE_MS = 420',
  'crozzoZ0HybridParallelLan',
], 'Runtime realtime → UI + LAN paralelo');
const idx = readFileSync(join(root, 'app/index.html'), 'utf8');
assert(idx.includes('CrozzoFleetOperationalReconcile.js'), 'Fleet script index', 'index.html');
assert(idx.includes('CrozzoPairingAutoConnect.js'), 'AutoConnect script index', 'index.html');

console.log('\n=== Crozzo coordinación flota — verificación ===\n');
for (const r of results) {
  console.log((r.ok ? '✓' : '✗') + ' ' + r.name + (r.detail ? ' — ' + r.detail : ''));
}
console.log('\n' + (failed ? failed + ' fallo(s)' : 'Todo OK') + ' (' + results.length + ' checks)\n');
process.exit(failed ? 1 : 0);
