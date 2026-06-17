#!/usr/bin/env node
/**
 * Simulación epidémica malla Crozzo (1–100 dispositivos, roles A/B/K).
 * Modela alcance de comandas por BLE/gossip vs LAN/nube.
 * node scripts/_ble-mesh-scale-sim.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'scripts', '_qa-out');
mkdirSync(outDir, { recursive: true });

const CODE = {
  bleMaxHops: 12,
  bleMaxPeers: 100,
  blePreconnectCap: 12,
  bleWhoQueryCap: 10,
  gossipMaxHops: 5,
  gossipMaxPeers: 120,
  gossipDedup: 500,
  lanScanHosts: 64,
};

function readLimit(rel, pattern, fallback) {
  try {
    const t = readFileSync(join(root, 'app', rel), 'utf8');
    const m = t.match(pattern);
    return m ? Number(m[1]) || m[1] : fallback;
  } catch (_) {
    return fallback;
  }
}

CODE.bleMaxHops = readLimit('infra/CrozzoBleMesh.js', /MAX_HOPS = (\d+)/, 12);
CODE.bleMaxPeers = readLimit('infra/CrozzoBleMesh.js', /MAX_PEERS = (\d+)/, 100);
CODE.blePreconnectCap = 12; // slice(0, 12) en BlePeerRegistry
CODE.gossipMaxHops = readLimit('infra/CrozzoOfflineGossip.js', /MAX_HOPS = (\d+)/, 5);

/** Grafo BLE: dispositivos en salón (coords 0..1). Radio ~10 m → fracción según N. */
function buildBleGraph(n, roles) {
  const nodes = [];
  const r = Math.max(0.08, Math.min(0.22, 1.8 / Math.sqrt(n)));
  for (let i = 0; i < n; i++) {
    let role = 'B';
    if (i < roles.A) role = 'A';
    else if (i < roles.A + (roles.K || 0)) role = 'K';
    const angle = (i / n) * Math.PI * 2;
    const ring = role === 'A' ? 0.5 : 0.35 + (i % 5) * 0.04;
    nodes.push({
      id: i,
      role,
      x: 0.5 + Math.cos(angle) * ring * 0.45,
      y: 0.5 + Math.sin(angle) * ring * 0.45,
    });
  }
  const edges = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      if (Math.sqrt(dx * dx + dy * dy) <= r) edges.push([i, j]);
    }
  }
  if (n <= 3) {
    edges.length = 0;
    for (let i = 0; i < n - 1; i++) edges.push([i, i + 1]);
  }
  return { nodes, edges, radius: r, avgDegree: n <= 1 ? 0 : (2 * edges.length) / n };
}

/** Grafo LAN: caja (A) al centro; tablets en misma Wi‑Fi = estrella + algo de malla. */
function buildLanGraph(n, roles) {
  const { nodes, edges, radius, avgDegree } = buildBleGraph(n, roles);
  const lanEdges = [...edges];
  const aIdx = nodes.findIndex((x) => x.role === 'A');
  if (aIdx >= 0) {
    for (let i = 0; i < n; i++) {
      if (i !== aIdx && !lanEdges.some(([a, b]) => (a === aIdx && b === i) || (b === aIdx && i === a))) {
        lanEdges.push([aIdx, i]);
      }
    }
  }
  return { nodes, edges: lanEdges, radius, avgDegree: (2 * lanEdges.length) / n, star: true };
}

function floodReach(adj, source, maxHops) {
  const dist = new Map();
  const q = [[source, 0]];
  dist.set(source, 0);
  while (q.length) {
    const [u, d] = q.shift();
    if (d >= maxHops) continue;
    for (const v of adj.get(u) || []) {
      if (!dist.has(v) || dist.get(v) > d + 1) {
        dist.set(v, d + 1);
        q.push([v, d + 1]);
      }
    }
  }
  return dist;
}

function adjFromEdges(n, edges) {
  const adj = new Map();
  for (let i = 0; i < n; i++) adj.set(i, []);
  edges.forEach(([a, b]) => {
    adj.get(a).push(b);
    adj.get(b).push(a);
  });
  return adj;
}

function simulateTransport(opts) {
  const n = opts.devices;
  const roles = opts.roles || { A: 1, B: n - 1, K: 0 };
  const graph = opts.transport === 'lan' ? buildLanGraph(n, roles) : buildBleGraph(n, roles);
  const hops = opts.transport === 'gossip' ? CODE.gossipMaxHops : CODE.bleMaxHops;
  const adj = adjFromEdges(n, graph.edges);
  const sources = [];
  for (let i = 0; i < n; i++) if (graph.nodes[i].role === 'B') sources.push(i);
  if (!sources.length) sources.push(0);

  let totalReach = 0;
  let maxDist = 0;
  let unreachable = 0;
  sources.forEach((src) => {
    const dist = floodReach(adj, src, hops);
    const kitchen = graph.nodes.findIndex((x) => x.role === 'K');
    const targets = kitchen >= 0 ? [kitchen] : graph.nodes.filter((x) => x.role !== 'B' || x.id !== src).map((x) => x.id);
    if (!targets.length) targets.push((src + 1) % n);
    targets.forEach((t) => {
      if (dist.has(t)) {
        totalReach++;
        maxDist = Math.max(maxDist, dist.get(t));
      } else unreachable++;
    });
  });

  const reachPct = Math.round((totalReach / Math.max(1, sources.length * Math.max(1, graph.nodes.filter((x) => x.role === 'K').length || 1))) * 100);
  const isolated = graph.nodes.filter((_, i) => (adj.get(i) || []).length === 0).length;

  let score = 100;
  const issues = [];
  if (reachPct < 100) {
    score -= Math.min(50, 100 - reachPct);
    issues.push(`Alcance ${reachPct}% (no todos reciben comanda por ${opts.transport})`);
  }
  if (isolated > 0) {
    score -= Math.min(20, isolated * 3);
    issues.push(`${isolated} dispositivo(s) aislado(s) sin vecinos ${opts.transport}`);
  }
  if (maxDist > hops - 2 && n > 15) {
    score -= 8;
    issues.push(`Cadena larga (${maxDist} saltos); latencia ~${maxDist * 2}s`);
  }
  if (opts.transport === 'ble' && n > 25 && graph.avgDegree < 4) {
    score -= 15;
    issues.push('BLE: pocos vecinos por radio; >25 disp. necesitan Wi‑Fi/LAN');
  }
  if (opts.transport === 'gossip' && n > CODE.gossipMaxPeers) {
    score -= 20;
    issues.push(`Gossip >${CODE.gossipMaxPeers} peers — dedup/relay degradado`);
  }
  if (opts.transport === 'ble' && n > CODE.blePreconnectCap) {
    issues.push(`Preconnect cap ${CODE.blePreconnectCap}/${n} — descubrimiento más lento`);
    score -= Math.min(12, Math.floor((n - CODE.blePreconnectCap) / 8));
  }

  return {
    transport: opts.transport,
    devices: n,
    roles,
    avgDegree: Math.round(graph.avgDegree * 10) / 10,
    reachPct,
    maxHops: hops,
    maxDist,
    isolated,
    score: Math.max(0, Math.min(100, score)),
    issues,
  };
}

function cloudScenario(n, roles, internetPct) {
  let score = internetPct >= 0.85 ? 98 : internetPct >= 0.5 ? 82 : 55;
  const issues = [];
  if (n > 50 && internetPct < 1) {
    score -= 10;
    issues.push('Realtime Supabase: filtrado por negocio OK; polling adaptativo bajo presión');
  }
  if (n > 80) issues.push('>80 tablets: ejecutar partición mesa_runtime en Supabase');
  return { transport: 'cloud', devices: n, roles, reachPct: Math.round(internetPct * 100), score, issues, maxHops: 'n/a' };
}

const rolePresets = [
  { label: 'mini', devices: 2, roles: { A: 1, B: 1, K: 0 } },
  { label: 'pequeño', devices: 8, roles: { A: 1, B: 6, K: 1 } },
  { label: 'mediano', devices: 20, roles: { A: 1, B: 17, K: 2 } },
  { label: 'grande', devices: 50, roles: { A: 1, B: 46, K: 3 } },
  { label: 'mega', devices: 100, roles: { A: 1, B: 95, K: 4 } },
];

const matrix = [];
for (const preset of rolePresets) {
  matrix.push(cloudScenario(preset.devices, preset.roles, 1));
  matrix.push(cloudScenario(preset.devices, preset.roles, 0.7));
  matrix.push(simulateTransport({ devices: preset.devices, roles: preset.roles, transport: 'lan' }));
  matrix.push(simulateTransport({ devices: preset.devices, roles: preset.roles, transport: 'ble' }));
  matrix.push(simulateTransport({ devices: preset.devices, roles: preset.roles, transport: 'gossip' }));
}

const wiring = [
  { name: 'Orquestador 5 niveles', ok: existsSync(join(root, 'app/infra/CrozzoConnectivityOrchestrator.js')) },
  { name: 'BLE mesh epidémico', ok: existsSync(join(root, 'app/infra/CrozzoBleMesh.js')) },
  { name: 'Registro peers + identidad', ok: existsSync(join(root, 'app/infra/CrozzoBlePeerRegistry.js')) },
  { name: 'Gossip UDP Rust', ok: existsSync(join(root, 'src-tauri/src/crozzo_gossip_udp.rs')) },
  { name: 'Fan-out comandas unificado', ok: readFileSync(join(root, 'app/modules/CrozzoComandasCloudSync.js'), 'utf8').includes('crozzoFanoutComandasByIds') },
  { name: 'Candado mesa', ok: readFileSync(join(root, 'app/core/CrozzoPosMain.js'), 'utf8').includes('comandaSlotLocks') },
];

const gaps = [
  { id: 'G01', area: 'BLE puro 50+', severity: 'HIGH', gap: 'Bluetooth no escala a 50–100 en un salón; radio ~10 m, ~7 conexiones simultáneas. Necesita LAN/nube como columna vertebral.' },
  { id: 'G02', area: 'Gossip UDP', severity: 'MED', gap: `MAX_HOPS=${CODE.gossipMaxHops} y dedup ${CODE.gossipDedup}: islas >${CODE.gossipMaxPeers} peers degradan relay.` },
  { id: 'G03', area: 'BLE preconnect', severity: 'MED', gap: `Solo ${CODE.blePreconnectCap} peers precalentados; el resto entra por escaneo epidémico (más lento).` },
  { id: 'G04', area: 'Android BLE nativo', severity: 'HIGH', gap: 'APK WebView: Web Bluetooth limitado; GATT nativo Kotlin = fase 2 para mesh BLE real en Android.' },
  { id: 'G05', area: 'LAN 80+ tablets', severity: 'MED', gap: '1 caja WS sin pool de relays; con nube sana OK; sin WAN conviene 2ª caja/relay LAN.' },
  { id: 'G06', area: 'Runtime carritos 60+', severity: 'MED', gap: 'Requiere crozzo_mesa_runtime en Supabase; sin SQL = LWW en 1 fila/sede.' },
  { id: 'G07', area: 'EmergencyMesh WebRTC', severity: 'MED', gap: '1 enlace P2P por tablet iOS; no fan-out masivo — puente, no malla completa.' },
  { id: 'G08', area: 'Prueba física 100 BLE', severity: 'HIGH', gap: 'No hay lab de 100 radios BLE; simulación lógica OK, falta piloto en venue real.' },
];

const byScale = {};
rolePresets.forEach((p) => {
  const rows = matrix.filter((r) => r.devices === p.devices);
  const best = Math.max(...rows.map((r) => r.score));
  const ble = rows.find((r) => r.transport === 'ble');
  const cloud = rows.find((r) => r.transport === 'cloud' && r.reachPct === 100);
  byScale[p.label] = {
    devices: p.devices,
    bestScore: best,
    cloudScore: cloud?.score,
    bleScore: ble?.score,
    bleReach: ble?.reachPct,
    verdict:
      p.devices <= 15
        ? 'OK restaurante pequeño (cloud + BLE backup)'
        : p.devices <= 30
          ? 'OK con internet/LAN; BLE solo respaldo'
          : p.devices <= 50
            ? 'WARN: requiere nube estable + LAN'
            : 'RISK: 100 disp. = cloud obligatorio; BLE no sustituto',
  };
});

const report = {
  at: new Date().toISOString(),
  codeLimits: CODE,
  wiring,
  matrix,
  byScale,
  gaps,
  summary: {
    wiringOk: wiring.every((w) => w.ok),
    scalesTested: rolePresets.map((p) => p.devices),
    recommendedMaxBleOnly: 15,
    recommendedMaxLanFallback: 50,
    recommendedMaxCloud: 100,
  },
};

writeFileSync(join(outDir, 'ble-mesh-scale-sim.json'), JSON.stringify(report, null, 2));

console.log('\n=== SIMULACIÓN ESCALA MALLA (1–100) ===\n');
console.log('Límites código:', CODE);
wiring.forEach((w) => console.log((w.ok ? '✓' : '✗') + ' ' + w.name));
console.log('\n--- Por tamaño de restaurante ---');
Object.entries(byScale).forEach(([k, v]) => {
  console.log(
    `${k} (${v.devices} disp.): cloud ${v.cloudScore} | BLE ${v.bleScore} reach ${v.bleReach}% → ${v.verdict}`
  );
});
console.log('\n--- Matriz transporte (score / alcance) ---');
matrix.forEach((r) => {
  const extra = r.transport === 'ble' || r.transport === 'lan' || r.transport === 'gossip' ? ` reach ${r.reachPct}% deg ${r.avgDegree}` : ` wan ${r.reachPct}%`;
  console.log(`N=${String(r.devices).padStart(3)} ${r.transport.padEnd(6)} score ${r.score}${extra}`);
  r.issues.forEach((i) => console.log('    ⚠ ' + i));
});
console.log('\n--- Brechas para escala ---');
gaps.forEach((g) => console.log(`[${g.severity}] ${g.id} ${g.area}: ${g.gap}`));
console.log('\nReporte:', join(outDir, 'ble-mesh-scale-sim.json'));
console.log('');

process.exit(wiring.every((w) => w.ok) ? 0 : 1);
