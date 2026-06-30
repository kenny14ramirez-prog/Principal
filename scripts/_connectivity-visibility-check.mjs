#!/usr/bin/env node
/**
 * Verifica sonda de visibilidad entre equipos (nube, LAN, hotspot, gossip, BLE, QR).
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const failures = [];

function mustExist(rel) {
  if (!fs.existsSync(path.join(root, rel))) failures.push('Falta: ' + rel);
}

function mustContain(rel, needle, label) {
  const txt = fs.readFileSync(path.join(root, rel), 'utf8');
  if (!txt.includes(needle)) failures.push(label || rel + ' sin ' + needle);
}

mustExist('app/infra/CrozzoConnectivityVisibilityProbe.js');
mustContain('app/index.html', 'CrozzoConnectivityVisibilityProbe.js', 'index sin VisibilityProbe');
mustContain('app/modules/CrozzoComunicacionDiag.js', 'CrozzoConnectivityVisibilityProbe', 'diag sin probe');
mustContain('app/core/CrozzoPosExtensions.js', 'visibility', 'Pruebas sistema sin tarjeta visibility');
mustContain('app/infra/CrozzoConnectivityVisibilityProbe.js', 'probeAll', 'API probeAll');
mustContain('app/infra/CrozzoConnectivityVisibilityProbe.js', 'buildDeviceMatrix', 'API buildDeviceMatrix');
mustContain('app/modules/CrozzoComunicacionDiag.js', 'devicesTableHtml', 'diag sin tabla equipos');

function makeSandbox() {
  const store = new Map();
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (fn) => {
      fn();
      return 1;
    },
    clearTimeout: () => {},
    Date,
    navigator: { onLine: true },
    localStorage: {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    fetch: async () => ({ ok: true }),
    __CROZZO_TIER_LAST: 'lan',
    __SUPABASE: {},
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.getMultiDeviceConfig = () => ({
    role: 'B',
    businessId: 'BIZ-1',
    locationId: 'SEDE-1',
    centralIp: '192.168.1.10',
    port: 3000,
  });
  ctx.ensureCrozzoDeviceId = () => 'tablet-test-1';
  ctx.crozzoOnlineConfigReady = () => true;
  ctx.crozzoIsLocalLanSegmentUp = () => true;
  ctx.CrozzoPeerDirectory = {
    listPeers: () => [
      {
        deviceId: 'caja-1',
        role: 'A',
        name: 'Caja',
        lanIp: '192.168.1.10',
        cloudOk: true,
        lastSeenAt: Date.now() - 5000,
      },
      {
        deviceId: 'stale-tablet-uuid',
        role: 'B',
        name: 'Tablet 2026-06-15',
        cloudOk: true,
        lastSeenAt: Date.now() - 86400000 * 10,
        lastCloudOkAt: Date.now() - 86400000 * 10,
      },
    ],
    getCentralCandidates: () => [{ ip: '192.168.1.10', via: 'config', score: 1000 }],
    pullPresenceFromCloud: async () => ({ ok: true, merged: 1 }),
    noteLanReachable: () => {},
  };
  ctx.CrozzoConnectivityDirector = {
    getState: () => ({ mode: 'lan_client', anchorIp: '192.168.1.10', selfLan: true }),
    evaluate: async () => ({}),
  };
  ctx.CrozzoConnectivityOrchestrator = {
    getState: () => ({ transports: { hotspot: true, lan: true, mesh: false, cloud: true, qr: false } }),
  };
  ctx.CrozzoOfflineGossip = {
    getStatus: () => ({ active: true, peerCount: 2, transport: 'broadcast' }),
    reconcileTier: () => {},
    bootstrapCluster: () => true,
    listRecentPeers: () => [{ deviceId: 'caja-1', lastSeenAt: Date.now() - 2000 }],
  };
  ctx.CrozzoBleMesh = {
    getStatus: () => ({ active: false, peerCount: 0, transport: 'none' }),
    webBtCapable: () => false,
  };
  ctx.CrozzoInternalQrRegistry = { getPeerCount: () => 1, isEmergencyActive: () => false };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'app/infra/CrozzoConnectivityVisibilityProbe.js'), 'utf8'), ctx);
  return ctx;
}

async function sandboxProbe() {
  const c = makeSandbox();
  const vis = await c.CrozzoConnectivityVisibilityProbe.probeAll({ force: true });
  if (!vis || !vis.channels) failures.push('probeAll sin channels');
  if (!vis.channels.lan || vis.channels.lan.status === 'fail') failures.push('LAN probe debería ver caja en sandbox');
  if (!vis.channels.gossip || vis.channels.gossip.peerCount < 1) failures.push('Gossip probe sin peers en sandbox');
  if (!vis.summary || vis.summary.channelsOk < 2) failures.push('Resumen visibilidad insuficiente en sandbox');
  if (!Array.isArray(vis.devices) || !vis.devices.length) failures.push('probeAll sin devices[]');
  if (!vis.devices.some((d) => d.deviceId === 'tablet-test-1' || d.deviceId === 'caja-1')) {
    failures.push('device matrix sin equipos esperados');
  }
  if (vis.devices.some((d) => d.deviceId === 'stale-tablet-uuid')) {
    failures.push('device matrix no debe incluir peers stale');
  }
  if (!vis.deviceMatrix || vis.deviceMatrix.hiddenStaleCount < 1) {
    failures.push('device matrix debe reportar hiddenStaleCount');
  }
}

await sandboxProbe();

if (failures.length) {
  console.error('VISIBILITY CHECK: FAIL');
  failures.forEach((f) => console.error(' -', f));
  process.exit(1);
}
console.log('VISIBILITY CHECK: OK');
