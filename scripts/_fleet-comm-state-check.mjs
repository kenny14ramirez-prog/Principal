#!/usr/bin/env node
/**
 * Verifica intercambio de estados de comunicación entre equipos (flota).
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const failures = [];

function mustContain(rel, needle, label) {
  const txt = fs.readFileSync(path.join(root, rel), 'utf8');
  if (!txt.includes(needle)) failures.push(label || rel + ' sin ' + needle);
}

mustContain('app/infra/CrozzoFleetCommState.js', 'crozzoPublishFleetCommState', 'FleetCommState export');
mustContain('app/infra/CrozzoPeerDirectory.js', 'commState', 'PeerDirectory commState');
mustContain('app/infra/CrozzoOfflineGossip.js', 'PEER_COMM', 'gossip PEER_COMM');
mustContain('app/index.html', 'CrozzoFleetCommState.js', 'index sin FleetCommState');
mustContain('app/modules/CrozzoComunicacionDiag.js', 'fleet-share', 'diag sin fila fleet');

function makeSandbox() {
  const store = new Map();
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (fn, ms) => {
      if (typeof fn === 'function') fn();
      return 1;
    },
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    Date,
    navigator: { onLine: true },
    localStorage: {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    __CROZZO_TIER_LAST: 'cloud',
    __SUPABASE: {},
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.getMultiDeviceConfig = () => ({
    role: 'A',
    businessId: 'BIZ-1',
    locationId: 'SEDE-1',
    deviceId: 'DEV-PC-1',
  });
  ctx.ensureCrozzoDeviceId = () => 'DEV-PC-1';
  ctx.crozzoOnlineConfigReady = () => true;
  ctx.crozzoIsLocalLanSegmentUp = () => true;
  ctx.crozzoRuntimeRealtimeStatus = () => ({ live: true });
  ctx.crozzoComandaRealtimeStatus = () => ({ live: true });
  ctx.CrozzoPageCloudWatch = { getActivePage: () => 'cajero' };
  ctx.getCurrentUser = () => ({ nombre: 'Admin' });
  ctx.CrozzoPeerDirectory = {
    noteSelf: () => {},
    notePeer: (p) => {
      ctx.__lastPeer = p;
    },
    listPeers: () => (ctx.__lastPeer ? [{ ...ctx.__lastPeer, commStateAt: pAt(ctx.__lastPeer) }] : []),
    publishPresenceToCloud: async () => true,
  };
  ctx.CrozzoOfflineGossip = {
    publishPeerCommState: () => true,
    getStatus: () => ({ active: false, peerCount: 0 }),
  };
  function pAt(p) {
    return p.commState ? Number(p.commState.at) : Date.now();
  }
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'app/infra/CrozzoFleetCommState.js'), 'utf8'), ctx);
  return ctx;
}

async function sandboxFleet() {
  const c = makeSandbox();
  const state = c.crozzoCaptureLocalCommState();
  if (!state || state.overall !== 'ok') failures.push('captureLocalCommState inválido');
  if (!state.channels || !state.channels.cloud) failures.push('capture sin canal cloud');
  const pub = await c.crozzoPublishFleetCommState({ force: true });
  if (!pub || !pub.ok) failures.push('publishFleetCommState falló');
  c.crozzoIngestRemoteCommState(
    {
      deviceId: 'DEV-TAB-2',
      role: 'B',
      name: 'Tablet',
      commState: {
        at: Date.now(),
        deviceId: 'DEV-TAB-2',
        role: 'B',
        tier: 'cloud',
        userName: 'Mesero',
        channels: { cloud: true, lan: true, realtime: false },
        overall: 'ok',
      },
    },
    'test'
  );
  const list = c.crozzoListFleetCommStates();
  if (!list.length) failures.push('listFleetCommStates vacío tras ingest');
}

await sandboxFleet();

if (failures.length) {
  console.error('FLEET COMM CHECK: FAIL');
  failures.forEach((f) => console.error(' -', f));
  process.exit(1);
}
console.log('FLEET COMM CHECK: OK');
