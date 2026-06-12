#!/usr/bin/env node
/**
 * Prueba total de resiliencia y escala (1–100 dispositivos) — análisis + simulación lógica.
 * node scripts/_connectivity-scale-resilience.mjs
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawnSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'app');
const outDir = join(root, 'scripts', '_qa-out');
mkdirSync(outDir, { recursive: true });

const limits = {
  comandasCloudPull: 100,
  reconnectPushComandas: 80,
  scanMaxHosts: 64,
  gossipMaxPeers: 120,
  gossipUdpQueue: 256,
  lanOkCacheMs: 28000,
  runtimeSnapshotWarnBytes: 4500000,
  tierOfflineMaxMs: 65000,
  wsClients: 'sin límite duro (Vec Rust)',
  p2pHubPerDevice: 1,
  runtimeRowsPerLocation: 1,
};

function readApp(rel) {
  return readFileSync(join(app, rel), 'utf8');
}

function hasAll(rel, needles) {
  const t = readApp(rel);
  return needles.every((n) => (typeof n === 'string' ? t.includes(n) : n.test(t)));
}

/** Simula N dispositivos con perfil y fallos; devuelve score 0–100 por escenario. */
function simulateScenario(sc) {
  const n = sc.devices;
  const internetPct = sc.internetPct ?? 1;
  const centralUp = sc.centralUp !== false;
  const lanUp = sc.lanUp !== false;
  const roles = sc.roles || { A: 1, B: n - 1 };

  let score = 100;
  const notes = [];
  const breaks = [];

  const online = Math.round(n * internetPct);
  const offline = n - online;

  // Comandas path
  if (internetPct >= 0.85 && centralUp) {
    notes.push('Comandas: cloud Realtime + fan-out unificado OK');
  } else if (internetPct >= 0.85 && !centralUp) {
    notes.push('Comandas: meseros/cocina siguen por Supabase sin caja');
    score -= 5;
  } else if (lanUp && centralUp && internetPct < 0.5) {
    notes.push('Comandas: LAN HTTP + WebSocket :3001 + relay comanda');
    score -= 8;
  } else if (!centralUp && !lanUp && offline > 0) {
    notes.push('Comandas: gossip UDP entre islas (misma subred)');
    score -= 35;
    if (offline > limits.gossipMaxPeers) {
      breaks.push('Gossip >' + limits.gossipMaxPeers + ' peers — dedup/relay degradado');
      score -= 15;
    }
  } else {
    breaks.push('Segmentos mixtos sin ruta común');
    score -= 45;
  }

  // Runtime carritos (1 fila LWW por sede)
  if (n > 15 && roles.B > 10) {
    score -= Math.min(25, Math.floor((roles.B - 10) * 1.2));
    notes.push('Runtime mesas: LWW 1 fila/sede — ediciones simultáneas pueden perderse');
    if (roles.B > 30) breaks.push('>30 tablets editando carritos = alto riesgo LWW');
  }

  // Reconnect rush
  if (internetPct < 1 && online > 20) {
    score -= Math.min(20, Math.floor((online - 20) / 4));
    notes.push('Reconnect: push cap ' + limits.reconnectPushComandas + ' comandas + pull cap ' + limits.comandasCloudPull);
    if (online > 50) breaks.push('Rush reconnect >50 disp. desalinea comandas históricas');
  }

  // P2P EmergencyMesh
  if (!centralUp && lanUp && roles.B > 2) {
    score -= 10;
    breaks.push('EmergencyMesh WebRTC: 1 enlace P2P por tablet, no fan-out masivo');
  }

  // Central LAN server capacity
  if (centralUp && roles.B > 40) {
    score -= Math.min(18, Math.floor((roles.B - 40) / 5));
    notes.push('LAN: WS broadcast + HTTP queue; sin pool de cajas');
    if (roles.B > 80) breaks.push('>80 tablets en 1 caja LAN — cuello HTTP/WS');
  }

  // mDNS discovery
  if (lanUp && roles.B > 1) {
    notes.push('Descubrimiento: mDNS → hotspot → scan ' + limits.scanMaxHosts + ' hosts');
  }

  // Candado mesa
  if (roles.B > 5) notes.push('Candado comandaSlotLocks 90s reduce duplicados misma mesa');

  score = Math.max(0, Math.min(100, score));
  const grade = score >= 85 ? 'OK' : score >= 65 ? 'WARN' : score >= 45 ? 'RISK' : 'FAIL';

  return { ...sc, online, offline, score, grade, notes, breaks };
}

const scenarios = [
  { id: 'S01', name: '1 caja + 1 mesero, todo online', devices: 2, internetPct: 1, centralUp: true, lanUp: true, roles: { A: 1, B: 1 } },
  { id: 'S02', name: '1 caja + 5 meseros + cocina, online', devices: 7, internetPct: 1, centralUp: true, lanUp: true, roles: { A: 1, B: 5, K: 1 } },
  { id: 'S03', name: '20 dispositivos, internet estable', devices: 20, internetPct: 1, centralUp: true, lanUp: true, roles: { A: 1, B: 18, K: 1 } },
  { id: 'S04', name: '50 dispositivos, internet estable', devices: 50, internetPct: 1, centralUp: true, lanUp: true, roles: { A: 1, B: 47, K: 2 } },
  { id: 'S05', name: '100 dispositivos, internet estable', devices: 100, internetPct: 1, centralUp: true, lanUp: true, roles: { A: 1, B: 95, K: 4 } },
  { id: 'S06', name: 'Caja APAGADA (luz), internet OK', devices: 15, internetPct: 1, centralUp: false, lanUp: false, roles: { A: 0, B: 13, K: 2 } },
  { id: 'S07', name: 'Apagón total sin internet, 8 tablets Wi‑Fi local', devices: 8, internetPct: 0, centralUp: false, lanUp: false, roles: { A: 0, B: 7, K: 1 } },
  { id: 'S08', name: 'Caja ON LAN, sin WAN (router sin internet)', devices: 12, internetPct: 0, centralUp: true, lanUp: true, roles: { A: 1, B: 10, K: 1 } },
  { id: 'S09', name: '50% con internet, 50% offline gossip', devices: 20, internetPct: 0.5, centralUp: true, lanUp: true, roles: { A: 1, B: 18, K: 1 } },
  { id: 'S10', name: 'Corte energía → reconexión 30 tablets', devices: 30, internetPct: 0, centralUp: true, lanUp: true, roles: { A: 1, B: 28, K: 1 }, phase: 'post_power' },
  { id: 'S11', name: '100 dispositivos, 30% sin internet intermitente', devices: 100, internetPct: 0.7, centralUp: true, lanUp: true, roles: { A: 1, B: 95, K: 4 } },
  { id: 'S12', name: 'Hotspot caja, 15 meseros, caja sin nube config', devices: 15, internetPct: 0, centralUp: true, lanUp: true, roles: { A: 1, B: 14 } },
];

const wiring = [];
function wire(name, ok, detail) {
  wiring.push({ name, ok, detail });
}

wire('Fan-out comandas unificado', hasAll('modules/CrozzoComandasCloudSync.js', ['crozzoFanoutComandasByIds', 'pushComandaLan', 'crozzoFanoutComandaEstado']), 'ComandasCloudSync');
wire('mDNS + WebSocket LAN', hasAll('infra/CrozzoMdnsBridge.js', ['pickCentralFromMdns']) && hasAll('infra/CrozzoLanWebSocketBridge.js', ['notifyComandasByIds']), 'infra bridges');
wire('Gossip offline', hasAll('infra/CrozzoOfflineGossip.js', ['publishComandaNewByIds', 'meshLinkReady']));
wire('Candado mesa runtime', hasAll('core/CrozzoPosMain.js', ['comandaSlotLocks', 'crozzoTryAcquireComandaSlotLock']));
wire('Merge carritos remoto', hasAll('core/CrozzoPosMain.js', ['crozzoMergeCartsMaps']));
wire('LAN central aplica comanda', hasAll('infra/CrozzoLanSyncBridge.js', ['tryApplyLanComanda']));
wire('Reconnect orquestado', hasAll('infra/CrozzoReconnectSync.js', ['centralAuthorityPush', 'allDevicesPull']));
wire('Tier sin falso LAN Rol A', !readApp('core/CrozzoPosMain.js').includes("return markOk('role_a')"));

const checks = [
  '_connectivity-flow-check.mjs',
  '_connectivity-mixed-flow-check.mjs',
  '_offline-gossip-check.mjs',
  '_lan-mdns-ws-check.mjs',
];
const subprocess = [];
for (const c of checks) {
  const p = join(root, 'scripts', c);
  const r = spawnSync(process.execPath, [p], { cwd: root, encoding: 'utf8' });
  subprocess.push({ script: c, ok: r.status === 0, out: (r.stdout || r.stderr || '').trim().split('\n').pop() });
}

let cargoOk = false;
try {
  execSync('cargo check -q', { cwd: join(root, 'src-tauri'), stdio: 'pipe' });
  cargoOk = true;
} catch (_) {}

const results = scenarios.map(simulateScenario);
const avgScore = Math.round(results.reduce((a, r) => a + r.score, 0) / results.length);
const report = {
  at: new Date().toISOString(),
  limits,
  wiring,
  subprocess,
  cargoOk,
  scenarios: results,
  summary: {
    avgScore,
    ok: results.filter((r) => r.grade === 'OK').length,
    warn: results.filter((r) => r.grade === 'WARN').length,
    risk: results.filter((r) => r.grade === 'FAIL' || r.grade === 'RISK').length,
  },
};

writeFileSync(join(outDir, 'connectivity-scale-resilience.json'), JSON.stringify(report, null, 2));

console.log('\n=== CROZZO PRUEBA TOTAL CONECTIVIDAD (1–100) ===\n');
console.log('Límites código:', JSON.stringify(limits, null, 2));
console.log('\n--- Cableado ---');
wiring.forEach((w) => console.log((w.ok ? '✓' : '✗') + ' ' + w.name + (w.detail ? ' — ' + w.detail : '')));
console.log('\n--- Scripts ---');
subprocess.forEach((s) => console.log((s.ok ? '✓' : '✗') + ' ' + s.script + ' — ' + s.out));
console.log((cargoOk ? '✓' : '✗') + ' cargo check');
console.log('\n--- Escenarios (score 0–100) ---');
results.forEach((r) => {
  console.log(r.id + ' [' + r.grade + ' ' + r.score + '] ' + r.name);
  if (r.breaks.length) r.breaks.forEach((b) => console.log('    ⚠ ' + b));
});
console.log('\nPromedio:', avgScore + '/100 | OK:', report.summary.ok, 'WARN:', report.summary.warn, 'RISK/FAIL:', report.summary.risk);
console.log('\nReporte:', join(outDir, 'connectivity-scale-resilience.json'));
console.log('');

const exitFail = wiring.some((w) => !w.ok) || subprocess.some((s) => !s.ok) || !cargoOk;
process.exit(exitFail ? 1 : 0);
