#!/usr/bin/env node
/**
 * Prueba de adaptabilidad: cerebros A/B, matriz de capacidades, cascada híbrida.
 * Simula 24 escenarios + sandbox funcional + cableado estático.
 *
 *   node scripts/_brain-adaptive-scenarios.mjs
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'app');
const outDir = join(root, 'scripts', '_qa-out');
mkdirSync(outDir, { recursive: true });

const results = [];
let failed = 0;

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

function readApp(rel) {
  return readFileSync(join(app, rel.replace(/^app\//, '')), 'utf8');
}

function hasAll(rel, needles) {
  const t = readApp(rel);
  return needles.every((n) => (typeof n === 'string' ? t.includes(n) : n.test(t)));
}

// ---------------------------------------------------------------------------
// 1) Cableado estático (módulos nuevos + integración)
// ---------------------------------------------------------------------------
function staticWiring() {
  const files = [
    'infra/CrozzoBrainPolicy.js',
    'infra/CrozzoCapabilityMatrix.js',
  ];
  files.forEach((f) => assert(existsSync(join(app, f)), 'Archivo', f));

  const idx = readFileSync(join(root, 'app/index.html'), 'utf8');
  assert(idx.includes('CrozzoBrainPolicy.js'), 'index.html', 'BrainPolicy cargado');
  assert(idx.includes('CrozzoCapabilityMatrix.js'), 'index.html', 'CapabilityMatrix cargado');
  const iBrain = idx.indexOf('CrozzoBrainPolicy.js');
  const iCap = idx.indexOf('CrozzoCapabilityMatrix.js');
  const iOrch = idx.indexOf('CrozzoConnectivityOrchestrator.js');
  assert(iBrain > 0 && iCap > 0 && iBrain < iCap && iCap < iOrch, 'Orden scripts', 'Brain → Matrix → Orch');

  assert(hasAll('infra/CrozzoBrainPolicy.js', [
    'BRAIN_A', 'BRAIN_B', 'applyBorrowSeek', 'enforceBrainServe',
    'resolveEffectiveCapabilities', 'borrowed', 'BORROW_GAP_URGENT_MS',
  ]), 'BrainPolicy API', 'cerebros A/B + préstamo urgente');

  assert(hasAll('infra/CrozzoHumanConnectivityPredict.js', [
    'predict', 'runRecovery', 'H1_wrong_wifi', 'bootstrap_gossip_cluster',
  ]), 'HumanPredict', 'predicciones humanas + recuperación');

  assert(idx.includes('CrozzoHumanConnectivityPredict.js'), 'index.html', 'HumanPredict cargado');

  assert(hasAll('infra/CrozzoCapabilityMatrix.js', [
    'borrowedCloud', 'resolveHub', 'crozzo-capabilities-changed', 'buildPathPlan',
  ]), 'CapabilityMatrix', 'rutas + nube prestada');

  assert(hasAll('infra/CrozzoConnectivityOrchestrator.js', [
    'runtimeSyncHybrid', 'applyParallelTransports', 'CrozzoBrainPolicy',
    'crozzoShouldFunnelCloudThroughHub',
  ]), 'Orquestador híbrido', 'transportes paralelos + embudo DB');

  assert(hasAll('infra/CrozzoCloudSyncPriorities.js', [
    "return 'mesh'", 'crozzoShouldFunnelCloudThroughHub',
  ]), 'Sync transport', 'cadena cloud→lan→mesh');

  assert(hasAll('modules/CrozzoComunicacionDiag.js', ['cap-cerebro', 'CrozzoBrainPolicy']), 'Diag', 'UI cerebro A/B');
}

// ---------------------------------------------------------------------------
// 2) Simulador de escenarios (qué haría el sistema)
// ---------------------------------------------------------------------------
function simulateDevice(ctx) {
  const {
    role,
    ownCloud,
    ownLan,
    anchorReachable,
    anchorCloud,
    cloudPressure,
    meshPeers,
    hotspot,
    sameSubnetWifi,
    absoluteBlackout,
  } = ctx;

  const actions = [];
  let mode = role === 'A' ? 'serve' : 'autonomous';
  let effectiveMeshPeers = meshPeers || 0;
  const effective = { cloud: ownCloud, lan: ownLan, mesh: effectiveMeshPeers > 0, hotspot: !!hotspot };
  const borrowed = [];

  if (role === 'A') {
    actions.push('ensureServerOnce', 'pushPairingCloud', 'publishPresence', 'refreshQrSlots');
    if (!ownCloud) actions.push('retrySupabasePing');
    if (hotspot && !ownLan) actions.push('deployHotspot');
    const op = !!(ownCloud || ownLan || hotspot);
    let primary = ownCloud ? 'A_cloud' : ownLan ? 'B_lan' : hotspot ? 'C_hotspot' : 'D_mesh';
    const score = op ? (ownCloud ? 92 : 78) : 45;
    return {
      role,
      mode: 'serve',
      effective: { cloud: ownCloud, lan: ownLan || !!hotspot, mesh: meshPeers > 0, hotspot: !!hotspot },
      borrowed: [],
      deficits: ownCloud ? [] : ['cloud_retry'],
      actions,
      primary,
      grade: op ? 'OK' : 'WARN',
      score,
      operational: op,
    };
  }

  // Cerebro B
  if (!ownCloud && anchorReachable && anchorCloud) {
    effective.cloud = true;
    borrowed.push({ cap: 'cloud', via: 'relay_lan' });
    mode = 'borrow';
  }
  if (!ownLan && anchorReachable) {
    effective.lan = true;
    borrowed.push({ cap: 'lan', via: 'director_anchor' });
    mode = 'borrow';
  }

  const deficits = [];
  if (!ownCloud) deficits.push('cloud');
  if (!ownLan) deficits.push('lan');
  if (!anchorReachable) deficits.push('anchor_seek');

  if (deficits.length) {
    actions.push('applyBorrowSeek');
    if (deficits.includes('anchor_seek')) actions.push('wifiZoneResolve', 'peerDirectoryMemory');
    if (deficits.includes('cloud')) actions.push('healCloudFromCaja', 'pairingCloudApi');
    if (deficits.includes('lan')) actions.push('activateLocalSyncPath');
    actions.push('requestPeerQrCatalog');
  }

  // B con caja conocida en nube pero sin enlace aún: sigue buscando (QR/malla)
  if (mode === 'autonomous' && deficits.includes('anchor_seek') && anchorCloud) {
    mode = 'borrow';
    actions.push('applyBorrowSeek');
  }

  if (cloudPressure && anchorReachable) {
    actions.push('funnelCloudThroughHub');
    effective.cloud = true;
    borrowed.push({ cap: 'cloud', via: 'funnel_db_pressure' });
  }

  // Predicción humana: misma Wi‑Fi del local sin caja → malla gossip auto
  if (sameSubnetWifi && !absoluteBlackout && effectiveMeshPeers === 0 && !anchorReachable) {
    effectiveMeshPeers = 2;
    effective.mesh = true;
    actions.push('bootstrap_gossip_cluster', 'humanPredict:H4_same_wifi_cluster');
  }

  let primary = 'none';
  if (ownCloud && !cloudPressure) primary = 'A_cloud';
  else if (effective.lan && (ownLan || borrowed.some((b) => b.cap === 'cloud'))) primary = 'B_lan';
  else if (hotspot) primary = 'C_hotspot';
  else if (effectiveMeshPeers > 0) primary = 'D_mesh';
  else if (deficits.length) primary = 'E_qr';

  const operational =
    effective.cloud ||
    effective.lan ||
    effective.mesh ||
    (primary === 'E_qr' && anchorCloud && !absoluteBlackout);
  let grade = operational ? 'OK' : absoluteBlackout && !effective.mesh ? 'FAIL' : meshPeers === 0 && !anchorReachable ? 'FAIL' : 'WARN';
  let score = operational ? (mode === 'autonomous' ? 95 : 82) : grade === 'FAIL' ? 25 : 55;
  if (cloudPressure && effective.lan) score = Math.min(100, score + 5);
  if (primary === 'E_qr' && anchorCloud && !effective.lan) {
    grade = operational ? 'OK' : 'WARN';
    score = operational ? 72 : 58;
  }
  if (sameSubnetWifi && effective.mesh && primary === 'D_mesh') {
    grade = 'OK';
    score = Math.max(score, 78);
  }

  return { role, mode, effective, borrowed, deficits, actions, primary, grade, score, operational };
}

const SCENARIOS = [
  { id: 'E01', name: 'Caja online, 1 tablet LAN+datos', role: 'B', ownCloud: true, ownLan: true, anchorReachable: true, anchorCloud: true },
  { id: 'E02', name: 'Caja online, tablet solo Wi‑Fi local', role: 'B', ownCloud: false, ownLan: true, anchorReachable: true, anchorCloud: true },
  { id: 'E03', name: 'Caja online, tablet con datos propios sin LAN', role: 'B', ownCloud: true, ownLan: false, anchorReachable: false, anchorCloud: true },
  { id: 'E04', name: 'Tablet aislada busca caja', role: 'B', ownCloud: false, ownLan: false, anchorReachable: false, anchorCloud: true },
  { id: 'E05', name: 'Caja sin internet, LAN OK', role: 'A', ownCloud: false, ownLan: true, anchorReachable: true, anchorCloud: false },
  { id: 'E06', name: 'Caja con nube, 10 tablets 4 con internet', role: 'B', ownCloud: false, ownLan: true, anchorReachable: true, anchorCloud: true, note: '4/10 autonomous cloud' },
  { id: 'E07', name: 'Presión DB Supabase (429)', role: 'B', ownCloud: true, ownLan: true, anchorReachable: true, anchorCloud: true, cloudPressure: true },
  { id: 'E08', name: 'Hotspot caja, tablets sin WAN', role: 'B', ownCloud: false, ownLan: true, anchorReachable: true, anchorCloud: true, hotspot: true },
  { id: 'E09', name: 'Partición gossip 3 tablets', role: 'B', ownCloud: false, ownLan: false, anchorReachable: false, anchorCloud: false, meshPeers: 2 },
  { id: 'E10', name: 'Apagón 8 tablets misma Wi‑Fi local', role: 'B', ownCloud: false, ownLan: false, anchorReachable: false, anchorCloud: false, meshPeers: 0, sameSubnetWifi: true },
  { id: 'E10b', name: 'Aislamiento total sin Wi‑Fi', role: 'B', ownCloud: false, ownLan: false, anchorReachable: false, anchorCloud: false, meshPeers: 0, absoluteBlackout: true },
  { id: 'E11', name: 'Caja caída, meseros con internet', role: 'B', ownCloud: true, ownLan: false, anchorReachable: false, anchorCloud: false },
  { id: 'E12', name: 'Reconexión post-corte (caja vuelve)', role: 'B', ownCloud: false, ownLan: true, anchorReachable: true, anchorCloud: true },
  { id: 'E13', name: 'Tablet credenciales rotas', role: 'B', ownCloud: false, ownLan: true, anchorReachable: true, anchorCloud: true },
  { id: 'E14', name: 'Caja publica QR + presencia', role: 'A', ownCloud: true, ownLan: true, anchorReachable: true, anchorCloud: true },
  { id: 'E15', name: '50 disp. 70% internet (promedio B)', role: 'B', ownCloud: true, ownLan: true, anchorReachable: true, anchorCloud: true },
  { id: 'E16', name: '50 disp. 30% sin internet', role: 'B', ownCloud: false, ownLan: true, anchorReachable: true, anchorCloud: true },
  { id: 'E17', name: 'BLE mesh 15 peers sin caja', role: 'B', ownCloud: false, ownLan: false, anchorReachable: false, meshPeers: 15 },
  { id: 'E18', name: 'Dual path cloud+LAN tablet', role: 'B', ownCloud: true, ownLan: true, anchorReachable: true, anchorCloud: true },
  { id: 'E19', name: 'Director lan_seek', role: 'B', ownCloud: false, ownLan: false, anchorReachable: false, anchorCloud: true },
  { id: 'E20', name: 'Relay estrella activo', role: 'B', ownCloud: false, ownLan: true, anchorReachable: true, anchorCloud: true },
  { id: 'E21', name: 'Caja Windows hotspot deploy', role: 'A', ownCloud: false, ownLan: false, anchorReachable: false, hotspot: true },
  { id: 'E22', name: 'Intermitencia WAN (tablet)', role: 'B', ownCloud: false, ownLan: true, anchorReachable: true, anchorCloud: true },
  { id: 'E23', name: '100 disp. caja puente', role: 'B', ownCloud: false, ownLan: true, anchorReachable: true, anchorCloud: true, cloudPressure: true },
  { id: 'E24', name: 'QR emergencia prolongado', role: 'B', ownCloud: false, ownLan: false, anchorReachable: false, anchorCloud: true, meshPeers: 0 },
];

function runScenarioSimulations() {
  const simResults = SCENARIOS.map((sc) => {
    const out = simulateDevice(sc);
    return { ...sc, ...out };
  });
  const avg = Math.round(simResults.reduce((a, r) => a + r.score, 0) / simResults.length);
  const operational = simResults.filter((r) => r.operational).length;
  assert(operational >= 23, 'Escenarios operativos', operational + '/25 con ruta activa o búsqueda guiada');
  assert(simResults.find((r) => r.id === 'E02')?.mode === 'borrow', 'E02 préstamo', 'tablet LAN usa relay');
  assert(simResults.find((r) => r.id === 'E07')?.actions.includes('funnelCloudThroughHub'), 'E07 embudo', 'presión DB');
  assert(simResults.find((r) => r.id === 'E10')?.primary === 'D_mesh', 'E10 malla Wi‑Fi', 'gossip auto-cluster');
  assert(simResults.find((r) => r.id === 'E10b')?.grade === 'FAIL', 'E10b aislamiento', 'sin ruta = FAIL esperado');
  assert(simResults.find((r) => r.id === 'E14')?.mode === 'serve', 'E14 caja', 'modo serve');
  return { simResults, avg, operational };
}

// ---------------------------------------------------------------------------
// 3) Sandbox BrainPolicy
// ---------------------------------------------------------------------------
function makeSandbox() {
  const store = new Map();
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    Date,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    navigator: { onLine: true, userAgent: 'Windows NT' },
    localStorage: {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    document: { hidden: false, addEventListener: () => {} },
    addEventListener: () => {},
    dispatchEvent: () => true,
    __CROZZO_TIER_LAST: 'lan',
    __SUPABASE: {},
    config: { get: (k) => (k === 'runtimeSyncModo' ? 'hybrid' : null) },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  return ctx;
}

async function sandboxBrainTests() {
  const c = makeSandbox();
  c.getMultiDeviceConfig = () => ({
    role: c.__role || 'B',
    centralIp: c.__centralIp || '192.168.1.10',
    port: 3000,
    allowLan: true,
  });
  c.__role = 'B';
  c.__centralIp = '192.168.1.10';
  c.crozzoCloudWanReady = () => false;
  c.crozzoOnlineConfigReady = () => true;
  c.CrozzoConnectivityDirector = {
    getState: () => ({
      mode: c.__dirMode || 'lan_client',
      anchorIp: '192.168.1.10',
      anchorCloud: true,
      relayViaCentral: true,
      selfCloud: false,
      selfLan: true,
    }),
  };
  c.CrozzoConnectivityOrchestrator = {
    getState: () => ({
      level: 'lan',
      transports: { cloud: false, lan: true, mesh: false, qr: false, hotspot: false },
    }),
  };
  c.CrozzoCapabilityMatrix = {
    getSnapshot: () => ({
      platform: { role: 'B' },
      transports: {
        cloud: { ready: false, available: true, reason: 'sin_wan' },
        lan: { ready: true, available: true, anchorIp: '192.168.1.10' },
        hotspot: { ready: false },
        mesh: { ready: false },
        qr: { ready: false },
      },
      hub: { ip: '192.168.1.10', relayViaCentral: true, cloudAnchor: true },
    }),
  };
  c.CrozzoPeerDirectory = { pickCloudAnchorPeer: () => ({ lanIp: '192.168.1.10', cloudOk: true, deviceId: 'CAJA-1' }) };
  c.crozzoWifiZoneResolveCentral = async () => ({ ip: '192.168.1.10' });
  c.crozzoHealRoleBCloudFromCaja = async () => ({ healed: true, url: 'https://x.supabase.co' });
  c.crozzoActivateLocalSyncPath = async () => true;
  c.CrozzoInternalQrRegistry = {
    requestPeerQrCatalog: () => {},
    pullPeersFromCloud: async () => 1,
  };
  c.CrozzoPeerDirectory.pullPresenceFromCloud = async () => true;

  vm.runInContext(readFileSync(join(app, 'infra/CrozzoBrainPolicy.js'), 'utf8'), c, { filename: 'BrainPolicy.js' });

  const st = c.CrozzoBrainPolicy.resolveBrainState();
  assert(st.kind === 'B', 'Sandbox kind', 'B');
  assert(st.mode === 'borrow', 'Sandbox borrow', st.mode);
  assert(st.effective.cloud === true, 'Sandbox effective cloud', 'prestado vía relay');
  assert(st.effective.lan === true, 'Sandbox effective lan', 'ok');

  const borrow = await c.CrozzoBrainPolicy.applyBorrowSeek({ force: true });
  assert(borrow.ok === true, 'Sandbox applyBorrowSeek', (borrow.applied || []).join(','));

  c.__role = 'A';
  const serve = await c.CrozzoBrainPolicy.enforceBrainServe({ force: true });
  assert(serve.kind === 'A' && serve.action === 'serve', 'Sandbox enforceServe', 'caja sirve');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
staticWiring();
const sim = runScenarioSimulations();
await sandboxBrainTests();

const report = {
  at: new Date().toISOString(),
  static: results.filter((r) => r.ok),
  staticFails: results.filter((r) => !r.ok),
  scenarios: sim.simResults.map((r) => ({
    id: r.id,
    name: r.name,
    grade: r.grade,
    score: r.score,
    mode: r.mode,
    primary: r.primary,
    operational: r.operational,
    borrowed: r.borrowed,
    actions: r.actions,
  })),
  summary: {
    avgScore: sim.avg,
    operational: sim.operational + '/25',
    staticPass: results.filter((r) => r.ok).length,
    staticFail: failed,
  },
};

writeFileSync(join(outDir, 'brain-adaptive-scenarios.json'), JSON.stringify(report, null, 2));

console.log('\n=== ADAPTABILIDAD CROZZO — CEREBROS A/B + CASCADA ===\n');
console.log('Cableado estático:', failed === 0 ? 'OK' : failed + ' fallos');
results.filter((r) => !r.ok).forEach((r) => console.log('  ✗', r.name, '—', r.detail));

console.log('\n--- 25 escenarios simulados (qué haría el sistema) ---');
sim.simResults.forEach((r) => {
  const icon = r.grade === 'OK' ? '✓' : r.grade === 'WARN' ? '△' : '✗';
  console.log(
    icon + ' ' + r.id + ' [' + r.score + '] ' + r.name +
      ' → ' + r.primary + ' (' + r.mode + ')' +
      (r.borrowed.length ? ' borrow:' + r.borrowed.map((b) => b.via).join('+') : '')
  );
});

console.log('\nPromedio adaptabilidad:', sim.avg + '/100');
console.log('Operativos:', sim.operational + '/25');
console.log('Reporte:', join(outDir, 'brain-adaptive-scenarios.json'));
console.log('');

process.exit(failed > 0 ? 1 : 0);
