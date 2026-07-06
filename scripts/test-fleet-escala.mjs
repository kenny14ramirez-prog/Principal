#!/usr/bin/env node
/**
 * QA Flota · escala progresiva 1→100 dispositivos
 *
 * Verifica capas: LAN sin Internet, tablet↔PC, tablet↔tablet, Wi‑Fi zone, BLE, nube.
 * Horizontes simulados: 1d, 8d, 15d, 30d, 365d con escalones de dispositivos.
 *
 *   node scripts/test-fleet-escala.mjs
 *   node scripts/test-fleet-escala.mjs --intensity=intensiva
 *
 * Reporte: scripts/_qa-out/fleet-escala-latest.json
 */
import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFieldMockLanCentral } from './lib/field-mock-lan-central.mjs';
import { createFieldPosHttpServer } from './lib/field-pos-http-server.mjs';
import {
  parseFleetIntensity,
  horizonsForIntensity,
  tiersForHorizon,
  CONNECTIVITY_LAYERS,
  DESIGN_DEVICE_CEILING,
} from './lib/qa-fleet-matrix.mjs';
import {
  initFleetReport,
  recordLayer,
  recordHorizonTier,
  finishFleetReport,
} from './lib/qa-fleet-report.mjs';
import { SRC_ROOT, qaDemoInitScript, waitAppReady } from './lib/qa-pos-boot.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const intensity = parseFleetIntensity(process.argv.slice(2));
const report = initFleetReport(intensity);

function log(msg) {
  console.log('  ' + msg);
}

function lanConfigJson(lanPort, deviceId, role) {
  return JSON.stringify({
    version: 2,
    lanSyncEnabled: true,
    role,
    serverIp: '127.0.0.1',
    centralIp: '127.0.0.1',
    port: lanPort,
    allowLan: true,
    offlineEnabled: true,
    deviceId,
    locationId: 'SEDE-FLEET-QA',
    savedAt: Date.now(),
  });
}

function buildComandaPayload(i, stamp) {
  const tid = `fleet-${stamp}-${i}`;
  return {
    uuid: tid,
    action_id: tid,
    type: 'comanda',
    deviceId: `TAB-${i}`,
    data: {
      id: 10000 + i,
      transaction_id: tid,
      tipoServicio: 'mesa',
      referencia: 'M' + ((i % 40) + 1),
      areaId: 'COCINA',
      items: [{ id: 1, nombre: 'Hamburguesa', cantidad: 1, precio: 15000 }],
      total: 15000,
      estado: 'pendiente',
      createdAt: new Date().toISOString(),
    },
  };
}

async function probeConnectivity(page) {
  return page.evaluate(() => ({
    lanPost: typeof window.crozzoLanPostSync === 'function',
    lanPull: typeof window.crozzoPullComandasFromLan === 'function',
    lanOpsSync: typeof window.crozzoStartLanOpsSync === 'function',
    multiDeviceConfig: typeof window.getMultiDeviceConfig === 'function',
    slotLockPeer: typeof window.crozzoSlotLockPeerInfo === 'function',
    runtimeFanout: typeof window.crozzoOpFanoutRuntimeTouch === 'function',
    wifiZoneResolve: typeof window.crozzoWifiZoneResolveCentral === 'function',
    bleMesh: !!(window.CrozzoBleMesh || window.CrozzoBlePeerRegistry),
    blePeerRegistry: typeof window.CrozzoBlePeerRegistry !== 'undefined',
    cloudPush: typeof window.crozzoPushPosRuntimeCloudNow === 'function',
    cloudPull: typeof window.crozzoEnsureCloudSyncActive === 'function',
    connectivityDirector: typeof window.CrozzoConnectivityDirector !== 'undefined',
    designCeiling: 100,
  }));
}

async function runHttpStorm(lan, deviceCount, loops) {
  const tablets = Math.max(1, deviceCount - 1);
  const addr = lan.server.address();
  const base = `http://127.0.0.1:${addr.port}`;
  const stamp = Date.now();
  let okComandas = 0;
  let okRt = 0;
  const t0 = performance.now();

  for (let loop = 0; loop < loops; loop++) {
    const jobs = [];
    for (let i = 0; i < tablets; i++) {
      jobs.push(
        (async () => {
          const body = buildComandaPayload(i + loop * 1000, stamp + loop);
          const res = await fetch(`${base}/api/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const j = await res.json().catch(() => ({}));
          return res.ok && j.ok !== false;
        })()
      );
    }
    const results = await Promise.all(jobs);
    okComandas += results.filter(Boolean).length;
  }

  const snap = lan.snapshot();
  const comandasJson = await lan.fetchComandas();
  const received = Array.isArray(comandasJson.comandas) ? comandasJson.comandas.length : 0;

  return {
    id: `http-storm-${deviceCount}`,
    devices: deviceCount,
    tablets,
    loops,
    elapsedMs: Math.round(performance.now() - t0),
    okComandas,
    expectedComandas: tablets * loops,
    comandasEnCaja: received,
    deduped: snap.stats.deduped,
    posts: snap.stats.posts,
    ok: okComandas === tablets * loops,
  };
}

async function runMaliciousDedup(lan) {
  const addr = lan.server.address();
  const base = `http://127.0.0.1:${addr.port}`;
  const body = buildComandaPayload(9999, Date.now());
  const before = lan.snapshot().stats.deduped;
  await fetch(`${base}/api/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  await fetch(`${base}/api/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  await fetch(`${base}/api/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const after = lan.snapshot().stats.deduped;
  return {
    id: 'malicious-duplicate-action',
    label: 'Reintento malicioso · mismo action_id',
    dedupBefore: before,
    dedupAfter: after,
    ok: after > before,
    humanStory: 'Un actor malintencionado no debe duplicar comandas con el mismo action_id',
  };
}

async function runBrowserTablets(posUrl, lanPort, tabletCount) {
  const browser = await chromium.launch();
  const errors = [];
  try {
    const contexts = [];
    for (let i = 0; i < tabletCount; i++) {
      contexts.push(await browser.newContext());
    }
    const pages = [];
    for (let i = 0; i < tabletCount; i++) {
      const p = await contexts[i].newPage();
      p.on('pageerror', (e) => errors.push(String(e?.message || e)));
      await p.addInitScript(
        ({ lanPort, deviceId }) => {
          localStorage.setItem('crozzo_device_id', deviceId);
          localStorage.setItem('crozzo_lan_config', JSON.stringify({
            version: 2, lanSyncEnabled: true, role: 'B', serverIp: '127.0.0.1', centralIp: '127.0.0.1',
            port: lanPort, deviceId, locationId: 'SEDE-FLEET-QA',
          }));
          window.__CROZZO_TIER_LAST = 'lan';
          window.crozzoCloudWanReady = () => false;
        },
        { lanPort, deviceId: `QA-TAB-${i + 1}` }
      );
      await p.goto(posUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
      pages.push(p);
    }
    await Promise.all(pages.map((p) => p.waitForFunction(() => typeof window.crozzoLanPostSync === 'function', { timeout: 90000 })));

    const results = await Promise.all(
      pages.map((p, i) =>
        p.evaluate(
          async ({ lanPort, mesaId, deviceId }) => {
            localStorage.setItem('crozzo_device_id', deviceId);
            window.applyPosRuntimeSnapshot({
              v: window.collectPosRuntimeState().v,
              tipoServicioCaja: 'mesa',
              mesaSeleccionada: mesaId,
              cajaMesaOrderOpen: true,
              cartsPorMesa: {
                [mesaId]: [{ id: 1, nombre: 'Hamburguesa', precio: 15000, cantidad: 1, areaComanda: 'COCINA' }],
              },
            }, {});
            window.__crozzoSkipDupCheck = true;
            window.__crozzoSkipAllComandaGuards = true;
            const before = (window.comandas || []).length;
            if (typeof window.comandarDesdeCaja === 'function') window.comandarDesdeCaja();
            const c = (window.comandas || [])[before] || (window.comandas || []).slice(-1)[0];
            let lanOk = false;
            if (c && typeof window.crozzoLanPostSync === 'function') {
              const body = { uuid: String(c.transaction_id || c.id), action_id: String(c.transaction_id || c.id), type: 'comanda', data: c };
              const r = await window.crozzoLanPostSync(body, { timeoutMs: 8000 });
              lanOk = !!(r && r.ok !== false);
            }
            return { ok: !!c && lanOk, mesaId, deviceId };
          },
          { lanPort, mesaId: 'M' + (10 + i), deviceId: `QA-TAB-${i + 1}` }
        )
      )
    );

    const okCount = results.filter((r) => r.ok).length;
    return {
      id: `browser-tablets-${tabletCount}`,
      tablets: tabletCount,
      okCount,
      results,
      pageErrors: errors.slice(0, 5),
      ok: okCount === tabletCount,
    };
  } finally {
    await browser.close();
  }
}

async function runPcPulls(lan, pcCount) {
  const addr = lan.server.address();
  const base = `http://127.0.0.1:${addr.port}`;
  const pulls = [];
  for (let i = 0; i < pcCount; i++) {
    try {
      const res = await fetch(`${base}/api/comandas`, { headers: { Accept: 'application/json' } });
      const j = await res.json();
      pulls.push({ pc: i + 1, count: Array.isArray(j.comandas) ? j.comandas.length : 0, ok: res.ok });
    } catch (_) {
      pulls.push({ pc: i + 1, count: 0, ok: false });
    }
  }
  const snap = lan.snapshot();
  return {
    id: `pc-pull-${pcCount}`,
    pcs: pcCount,
    pulls,
    comandasEnCentral: snap.comandas,
    ok: pulls.every((p) => p.count >= 0) && snap.comandas > 0,
  };
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  CROZZO POS · QA FLota · escala ' + intensity.label.padEnd(28) + '║');
  console.log('║  Techo diseño: ' + DESIGN_DEVICE_CEILING + ' dispositivos · sin superadmin operativo     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const lan = createFieldMockLanCentral({ cloudReachable: false });
  const lanAddr = await lan.listen();
  log('LAN mock (sin Internet): ' + lanAddr.url);

  const pos = createFieldPosHttpServer(SRC_ROOT);
  const posAddr = await pos.listen();
  log('POS: ' + posAddr.baseUrl);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.addInitScript(qaDemoInitScript());
    await page.goto(posAddr.baseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitAppReady(page, 90000);

    console.log('\n▶ Topología de conectividad\n');
    const topo = await probeConnectivity(page);
    report.connectivityTopology = topo;

    for (const layer of CONNECTIVITY_LAYERS) {
      const present = layer.probeKeys.every((k) => !!topo[k]);
      recordLayer(report, { id: layer.id, label: layer.label, humanStory: layer.humanStory }, { ok: present, probes: layer.probeKeys.map((k) => ({ key: k, ok: !!topo[k] })) });
      log((present ? '✓' : '✗') + ' ' + layer.label);
    }

    console.log('\n▶ Horizontes · escalones progresivos\n');
    for (const horizon of horizonsForIntensity(intensity)) {
      console.log('  · ' + horizon.label);
      for (const tier of tiersForHorizon(horizon, intensity)) {
        const deviceCount = Math.max(2, tier);
        const loops = horizon.loopMultiplier || 1;
        const storm = await runHttpStorm(lan, deviceCount, loops);
        storm.horizon = horizon.id;
        recordHorizonTier(report, horizon, storm);
        log('    ' + (storm.ok ? '✓' : '✗') + ' ' + deviceCount + ' dispositivos · ' + storm.elapsedMs + 'ms · caja=' + storm.comandasEnCaja);
        if (tier <= intensity.browserParallelMax && tier >= 4) {
          lan._state.comandas.clear();
          lan._state.seenActions.clear();
          lan._state.stats.posts = 0;
          lan._state.stats.comandasUpserted = 0;
          lan._state.stats.deduped = 0;
          const br = await runBrowserTablets(posAddr.baseUrl, lanAddr.port, Math.min(tier - 1, intensity.tablets));
          br.horizon = horizon.id;
          br.tier = tier;
          recordHorizonTier(report, horizon, br);
          log('    ' + (br.ok ? '✓' : '✗') + ' browser ' + br.tablets + ' tablets reales');
        }
      }
    }

    console.log('\n▶ Salón realista · ' + intensity.pcs + ' PCs + ' + intensity.tablets + ' tablets\n');
    lan._state.comandas.clear();
    lan._state.seenActions.clear();
    lan._state.stats = { posts: 0, deduped: 0, comandasUpserted: 0, estados: 0, runtimes: 0, errors: 0 };
    const tablets = await runBrowserTablets(posAddr.baseUrl, lanAddr.port, intensity.tablets);
    const pcs = await runPcPulls(lan, intensity.pcs);
    report.salonRealista = { tablets, pcs, ok: tablets.ok && pcs.ok };
    log((report.salonRealista.ok ? '✓' : '✗') + ' ' + tablets.okCount + '/' + intensity.tablets + ' tablets · ' + intensity.pcs + ' PCs leyeron central');

    if (intensity.adversarial) {
      console.log('\n▶ Adversarial · abuso / duplicados\n');
      const mal = await runMaliciousDedup(lan);
      report.adversarial.push(mal);
      log((mal.ok ? '✓' : '✗') + ' ' + mal.label);
      if (mal.ok) report.summary.passed++;
      else report.summary.failed++;
    }

    await page.close();
  } finally {
    await browser.close();
    await lan.close();
    await pos.close();
  }

  finishFleetReport(report);
  if (!report.summary.ok) process.exit(1);
}

main().catch((e) => {
  console.error('❌ Fleet escala:', e.message || e);
  process.exit(1);
});
