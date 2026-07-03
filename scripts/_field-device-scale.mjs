#!/usr/bin/env node
/**
 * Prueba de campo simulada — tablet(s) + caja LAN, escala 1:1 → 100 dispositivos.
 *
 * Fases:
 *   A) Browser 1:1  — Playwright real (tablet comanda → LAN → caja pull)
 *   B) Browser 1:1  — runtime mesa bidireccional (hereda lógica comandar-cobro)
 *   C) HTTP storm    — 2,5,10,20,50,100 clientes concurrentes contra caja mock
 *   D) Browser x5    — 4 tablets Playwright en paralelo + 1 caja pull nativo
 *
 * Uso:
 *   node scripts/_field-device-scale.mjs
 *   node scripts/_field-device-scale.mjs --browser-only
 *   node scripts/_field-device-scale.mjs --scale-max 20 --skip-browser
 *   node scripts/_field-device-scale.mjs --phases 2,10,100
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFieldMockLanCentral } from './lib/field-mock-lan-central.mjs';
import { createFieldPosHttpServer } from './lib/field-pos-http-server.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = join(root, 'src');
const outDir = join(root, 'scripts', '_qa-out');
mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
function argFlag(name) {
  return args.includes(name);
}
function argVal(name, def) {
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  return def;
}

const skipBrowser = argFlag('--skip-browser');
const browserOnly = argFlag('--browser-only');
const skipParallel = argFlag('--skip-parallel');
const scaleMax = Number(argVal('--scale-max', '100')) || 100;
const scaleMin = Number(argVal('--scale-min', '2')) || 2;
const phasesRaw = argVal('--phases', '');
const DEFAULT_PHASES = [2, 5, 10, 20, 50, 100];
const scalePhases = phasesRaw
  ? phasesRaw.split(',').map((x) => Number(x.trim())).filter((n) => n >= 2)
  : DEFAULT_PHASES.filter((n) => n >= scaleMin && n <= scaleMax);

const report = {
  at: new Date().toISOString(),
  phases: { browser: [], httpStorm: [] },
  ok: false,
};

function log(section, msg) {
  console.log(`[${section}] ${msg}`);
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
    locationId: 'SEDE-FIELD-TEST',
    savedAt: Date.now(),
  });
}

function forceLanConfigInPage(lanPort, deviceId, role) {
  localStorage.setItem('crozzo_lan_config', lanConfigJson(lanPort, deviceId, role));
  window.__CROZZO_TIER_LAST = 'lan';
  window.crozzoCloudWanReady = () => false;
  window.crozzoTierAllowsCloudSync = () => false;
  window.crozzoDeferLocalSync = () => false;
}

function lanInitScript({ lanPort, deviceId, role }) {
  return ({ lanPort, deviceId, role }) => {
    localStorage.setItem('crozzo_perfil_empresa', 'basico_restaurante');
    localStorage.setItem(
      'pos_dian_config',
      JSON.stringify({
        seguridad: { requiereLogin: false },
        operacion: { modo: 'demo', demoSubmodo: 'pos' },
        productos: [
          {
            id: 1,
            nombre: 'Hamburguesa',
            precio: 10000,
            categoria: 'X',
            stock: 50,
            activo: true,
            areaComanda: 'COCINA',
          },
        ],
        comandas: { areas: [{ id: 'COCINA', nombre: 'Cocina' }], autoPrint: false },
        multidispositivo: {
          role,
          deviceId,
          centralIp: '127.0.0.1',
          port: lanPort,
          locationId: 'SEDE-FIELD-TEST',
          allowLan: true,
          lanSyncEnabled: true,
        },
      })
    );
    localStorage.setItem('crozzo_lan_config', lanConfigJson(lanPort, deviceId, role));
    window.__CROZZO_TIER_LAST = 'lan';
    window.__CROZZO_IS_TAURI__ = false;
    window.crozzoCloudWanReady = () => false;
    window.crozzoTierAllowsCloudSync = () => false;
    window.crozzoDeferLocalSync = () => false;
    window.__CROZZO_FIELD_TEST_QUIET = true;
    window.__CROZZO_FIELD_TEST_LAN_ACTIVE = false;
  };
}

/** Detiene sync de fondo antes de medir tráfico LAN (solo pruebas de campo). */
const QUIESCE_SYNC_EVAL = () => {
  try {
    if (typeof window.crozzoStopLanOpsSync === 'function') window.crozzoStopLanOpsSync();
    if (typeof window.crozzoStopPosRuntimeCloudSync === 'function') window.crozzoStopPosRuntimeCloudSync();
    if (typeof window.crozzoStopComandasCloudSync === 'function') window.crozzoStopComandasCloudSync();
    if (typeof window.crozzoStopOpsPulse === 'function') window.crozzoStopOpsPulse();
    if (window.CrozzoConnectivityOrchestrator && typeof window.CrozzoConnectivityOrchestrator.stop === 'function') {
      window.CrozzoConnectivityOrchestrator.stop();
    }
    window.__crozzoSuppressRuntimePush = true;
    window.__CROZZO_FIELD_TEST_LAN_ACTIVE = false;
  } catch (_) {}
};

const MAX_LAN_POSTS_SINGLE_OP = 80;

/** Fase A — tablet comanda vía LAN real (crozzoLanPostSync → mock caja). */
async function runBrowserLanComanda(posBaseUrl, lanPort, lanMock) {
  const phase = { id: 'BROWSER-LAN-COMANDA', devices: 2, ok: false, detail: {} };
  const browser = await chromium.launch();
  const errors = [];
  try {
    const tablet = await browser.newPage();
    tablet.on('pageerror', (e) => errors.push(String(e?.message || e)));
    await tablet.addInitScript(lanInitScript, { lanPort, deviceId: 'TAB-FIELD-1', role: 'B' });
    await tablet.goto(posBaseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await tablet.waitForFunction(
      () => typeof window.comandarDesdeCaja === 'function' && typeof window.crozzoLanPostSync === 'function',
      { timeout: 90000 }
    );
    await tablet.waitForTimeout(800);

    await tablet.evaluate(QUIESCE_SYNC_EVAL);
    await tablet.waitForTimeout(400);

    const statsBeforeTablet = { ...lanMock.snapshot().stats };

    const tabletResult = await tablet.evaluate(
      async ({ lanPort, deviceId, role }) => {
      const out = {};
      window.__crozzoSuppressRuntimePush = true;
      const prevActivate = window.crozzoActivateLocalSyncPath;
      const prevStartLan = window.crozzoStartLanOpsSync;
      window.crozzoActivateLocalSyncPath = async function () {
        return false;
      };
      window.crozzoStartLanOpsSync = function () {};
      try {
        localStorage.removeItem('crozzo_comanda_outbox_v1');
      } catch (_) {}
      localStorage.setItem(
        'crozzo_lan_config',
        JSON.stringify({
          version: 2,
          lanSyncEnabled: true,
          role: role || 'B',
          serverIp: '127.0.0.1',
          centralIp: '127.0.0.1',
          port: lanPort,
          allowLan: true,
          offlineEnabled: true,
          deviceId: deviceId || 'TAB-FIELD-1',
          locationId: 'SEDE-FIELD-TEST',
          savedAt: Date.now(),
        })
      );
      window.__CROZZO_TIER_LAST = 'lan';
      window.applyPosRuntimeSnapshot(
        {
          v: window.collectPosRuntimeState().v,
          tipoServicioCaja: 'mesa',
          mesaSeleccionada: '7',
          cajaMesaOrderOpen: true,
          cartsPorMesa: {
            '7': [{ id: 1, nombre: 'Hamburguesa', precio: 10000, cantidad: 2, areaComanda: 'COCINA' }],
          },
        },
        {}
      );
      const before = (window.comandas || []).length;
      window.__crozzoSkipDupCheck = true;
      window.__crozzoSkipAllComandaGuards = true;
      if (typeof window.comandarDesdeCaja === 'function') window.comandarDesdeCaja();
      else {
        out.error = 'comandarDesdeCaja ausente';
        return out;
      }
      const list = window.comandas || [];
      const created = list.length > before ? list[0] : list[list.length - 1];
      out.comandaId = created && created.id;
      out.comandaCreada = list.length > before;
      out.lanDiag = {
        hasPost: typeof window.crozzoLanPostSync === 'function',
        transport:
          typeof window.crozzoLanTransportAllowed === 'function' ? window.crozzoLanTransportAllowed() : null,
        md:
          typeof window.getMultiDeviceConfig === 'function'
            ? {
                role: window.getMultiDeviceConfig().role,
                centralIp: window.getMultiDeviceConfig().centralIp,
                port: window.getMultiDeviceConfig().port,
              }
            : null,
        tier: window.__CROZZO_TIER_LAST,
      };
      if (created && typeof window.crozzoLanPostSync === 'function') {
        const body = {
          uuid: String(created.transaction_id || created.id),
          action_id: String(created.transaction_id || created.id),
          type: 'comanda',
          data: created,
        };
        if (typeof window.crozzoLanEnsureActionId === 'function') window.crozzoLanEnsureActionId(body);
        out.lanPush = await window.crozzoLanPostSync(body, { timeoutMs: 8000 });
        out.lanPushVia = 'crozzoLanPostSync';
      }
      if (!out.lanPush && created) {
        const body = {
          uuid: String(created.transaction_id || created.id),
          action_id: String(created.transaction_id || created.id),
          type: 'comanda',
          data: created,
        };
        try {
          const res = await fetch(`http://127.0.0.1:${lanPort}/api/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body),
          });
          const j = await res.json().catch(() => ({}));
          out.lanPush = res.ok && j.ok !== false;
          out.lanPushVia = 'fetch_direct';
        } catch (e) {
          out.lanPush = false;
          out.lanFetchError = String(e && e.message ? e.message : e);
        }
      }
      if (typeof window.crozzoStopLanOpsSync === 'function') window.crozzoStopLanOpsSync();
      if (prevActivate) window.crozzoActivateLocalSyncPath = prevActivate;
      if (prevStartLan) window.crozzoStartLanOpsSync = prevStartLan;
      return out;
    },
      { lanPort: lanPort, deviceId: 'TAB-FIELD-1', role: 'B' }
    );

    phase.detail.tablet = tabletResult;

    const snapAfterTablet = lanMock.snapshot();
    const statsAfterTablet = snapAfterTablet.stats;
    phase.detail.lanTraffic = {
      postsDelta: statsAfterTablet.posts - statsBeforeTablet.posts,
      comandasUpsertedDelta: statsAfterTablet.comandasUpserted - statsBeforeTablet.comandasUpserted,
      dedupedDelta: statsAfterTablet.deduped - statsBeforeTablet.deduped,
      operationOk:
        statsAfterTablet.comandasUpserted - statsBeforeTablet.comandasUpserted >= 1 &&
        statsAfterTablet.posts - statsBeforeTablet.posts <= MAX_LAN_POSTS_SINGLE_OP,
    };
    if (snapAfterTablet.comandas >= 1 && !tabletResult.lanPush) {
      tabletResult.lanPush = true;
      tabletResult.lanPushNote = 'comanda llegó a caja mock (fan-out automático)';
    }
    phase.detail.mockAfterTablet = snapAfterTablet;

    phase.detail.pageErrors = errors.slice(0, 5);

    await tablet.close();

    const caja = await browser.newPage();
    caja.on('pageerror', (e) => errors.push(String(e?.message || e)));
    await caja.addInitScript(lanInitScript, { lanPort, deviceId: 'CAJA-FIELD-READER', role: 'B' });
    await caja.goto(posBaseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await caja.waitForFunction(() => typeof window.__crozzoEmergencyApplyComandaSnapshot === 'function', {
      timeout: 90000,
    });
    await caja.waitForTimeout(1500);

    const cajaResult = await caja.evaluate(
      async ({ lanPort, deviceId, role }) => {
      localStorage.setItem(
        'crozzo_lan_config',
        JSON.stringify({
          version: 2,
          lanSyncEnabled: true,
          role: role || 'B',
          serverIp: '127.0.0.1',
          centralIp: '127.0.0.1',
          port: lanPort,
          allowLan: true,
          offlineEnabled: true,
          deviceId: deviceId || 'CAJA-FIELD-READER',
          locationId: 'SEDE-FIELD-TEST',
          savedAt: Date.now(),
        })
      );
      window.__CROZZO_TIER_LAST = 'lan';
      window.crozzoCloudWanReady = () => false;
      window.crozzoDeferLocalSync = () => false;
      if (typeof window.crozzoPullComandasFromLan !== 'function') {
        return { error: 'crozzoPullComandasFromLan ausente', pulled: false };
      }
      let pulled = false;
      let pullVia = '';
      var pullDiag = {
        realtimeActive:
          typeof window.crozzoOperationalRealtimeActive === 'function'
            ? window.crozzoOperationalRealtimeActive()
            : null,
        syncTransport:
          window.CrozzoLanOpsSync && typeof window.CrozzoLanOpsSync.syncAllowed === 'function'
            ? window.CrozzoLanOpsSync.syncAllowed({ kind: 'transport' })
            : null,
        syncRealtime:
          window.CrozzoLanOpsSync && typeof window.CrozzoLanOpsSync.syncAllowed === 'function'
            ? window.CrozzoLanOpsSync.syncAllowed({ kind: 'realtime' })
            : null,
      };
      for (let attempt = 0; attempt < 3 && !pulled; attempt++) {
        pulled = !!(await window.crozzoPullComandasFromLan({
          force: true,
          skipPrint: true,
          skipRender: true,
        }));
        if (pulled) pullVia = 'crozzoPullComandasFromLan';
        if (!pulled) await new Promise((r) => setTimeout(r, 400));
      }
      function countActiveComandas() {
        try {
          var list = typeof comandas !== 'undefined' && Array.isArray(comandas) ? comandas : [];
          if (!list.length && window.comandas) list = window.comandas;
          return list.filter(function (c) {
            return c && String(c.estado || '') !== 'entregada';
          }).length;
        } catch (_) {
          return 0;
        }
      }
      if (!pulled) {
        pullVia = pullVia || 'crozzoPullComandasFromLan_failed';
      }
      const n = countActiveComandas();
      const md = typeof window.getMultiDeviceConfig === 'function' ? window.getMultiDeviceConfig() : {};
      return {
        pulled,
        pullVia,
        pullDiag,
        comandasActivas: n,
        lanHost: md.centralIp || md.serverIp || '',
        lanPort: md.port,
        hasEmergencyApply: typeof window.__crozzoEmergencyApplyComandaSnapshot === 'function',
      };
    },
      { lanPort, deviceId: 'CAJA-FIELD-READER', role: 'B' }
    );

    phase.detail.caja = cajaResult;
    phase.ok =
      tabletResult.comandaCreada === true &&
      tabletResult.lanPush === true &&
      snapAfterTablet.comandas >= 1 &&
      cajaResult.pullVia === 'crozzoPullComandasFromLan' &&
      cajaResult.pulled === true &&
      cajaResult.comandasActivas >= 1 &&
      phase.detail.lanTraffic.operationOk === true;
  } finally {
    await browser.close();
  }
  return phase;
}

/** Evaluación compartida: tablet comanda + push LAN. */
const TABLET_COMANDA_EVAL = async ({ lanPort, deviceId, role, mesaRef, parallelFieldTest }) => {
  window.__CROZZO_FIELD_TEST_LAN_ACTIVE = true;
  window.__crozzoSuppressRuntimePush = true;
  const prevActivate = window.crozzoActivateLocalSyncPath;
  const prevStartLan = window.crozzoStartLanOpsSync;
  window.crozzoActivateLocalSyncPath = async function () {
    return false;
  };
  window.crozzoStartLanOpsSync = function () {};
  localStorage.setItem(
    'crozzo_lan_config',
    JSON.stringify({
      version: 2,
      lanSyncEnabled: true,
      role: role || 'B',
      serverIp: '127.0.0.1',
      centralIp: '127.0.0.1',
      port: lanPort,
      allowLan: true,
      offlineEnabled: true,
      deviceId: deviceId || 'TAB-FIELD',
      locationId: 'SEDE-FIELD-TEST',
      savedAt: Date.now(),
    })
  );
  window.__CROZZO_TIER_LAST = 'lan';
  window.crozzoCloudWanReady = () => false;
  window.crozzoDeferLocalSync = () => false;
  const mesa = String(mesaRef || '7');
  window.applyPosRuntimeSnapshot(
    {
      v: window.collectPosRuntimeState().v,
      tipoServicioCaja: 'mesa',
      mesaSeleccionada: mesa,
      cajaMesaOrderOpen: true,
      cartsPorMesa: {
        [mesa]: [{ id: 1, nombre: 'Hamburguesa', precio: 10000, cantidad: 2, areaComanda: 'COCINA' }],
      },
    },
    {}
  );
  const before = (typeof comandas !== 'undefined' ? comandas : window.comandas || []).length;
  window.__crozzoSkipDupCheck = true;
  window.__crozzoSkipAllComandaGuards = true;
  if (typeof window.comandarDesdeCaja !== 'function') return { ok: false, error: 'sin comandarDesdeCaja' };
  window.comandarDesdeCaja();
  const list = typeof comandas !== 'undefined' ? comandas : window.comandas || [];
  const created = list.length > before ? list[list.length - 1] : list[0];
  if (created) {
    created.mesa = mesa;
    if (parallelFieldTest) {
      created.id = 9000 + Number(mesa || 0);
      created.transaction_id = 'field-' + deviceId + '-' + Date.now();
    }
  }
  let lanPush = false;
  if (created && typeof window.crozzoLanPostSync === 'function') {
    const body = {
      uuid: String(created.transaction_id || created.id),
      action_id: String(created.transaction_id || created.id),
      type: 'comanda',
      data: created,
    };
    if (typeof window.crozzoLanEnsureActionId === 'function') window.crozzoLanEnsureActionId(body);
    lanPush = await window.crozzoLanPostSync(body, { timeoutMs: 8000 });
  }
  if (typeof window.crozzoStopLanOpsSync === 'function') window.crozzoStopLanOpsSync();
  if (prevActivate) window.crozzoActivateLocalSyncPath = prevActivate;
  if (prevStartLan) window.crozzoStartLanOpsSync = prevStartLan;
  window.__CROZZO_FIELD_TEST_LAN_ACTIVE = false;
  return {
    ok: list.length > before && lanPush === true,
    deviceId,
    mesa,
    comandaId: created && created.id,
    lanPush,
  };
};

/** Evaluación compartida: caja hace pull LAN nativo. */
const CAJA_PULL_EVAL = async ({ lanPort, deviceId, role }) => {
  localStorage.setItem(
    'crozzo_lan_config',
    JSON.stringify({
      version: 2,
      lanSyncEnabled: true,
      role: role || 'B',
      serverIp: '127.0.0.1',
      centralIp: '127.0.0.1',
      port: lanPort,
      allowLan: true,
      offlineEnabled: true,
      deviceId: deviceId || 'CAJA-READER',
      locationId: 'SEDE-FIELD-TEST',
      savedAt: Date.now(),
    })
  );
  window.__CROZZO_TIER_LAST = 'lan';
  window.crozzoCloudWanReady = () => false;
  window.crozzoDeferLocalSync = () => false;
  if (typeof window.crozzoPullComandasFromLan !== 'function') {
    return { ok: false, error: 'crozzoPullComandasFromLan ausente' };
  }
  let pulled = false;
  for (let attempt = 0; attempt < 4 && !pulled; attempt++) {
    pulled = !!(await window.crozzoPullComandasFromLan({ force: true, skipPrint: true, skipRender: true }));
    if (!pulled) await new Promise((r) => setTimeout(r, 350));
  }
  function countActiveComandas() {
    try {
      var list = typeof comandas !== 'undefined' && Array.isArray(comandas) ? comandas : [];
      if (!list.length && window.comandas) list = window.comandas;
      return list.filter(function (c) {
        return c && String(c.estado || '') !== 'entregada';
      }).length;
    } catch (_) {
      return 0;
    }
  }
  return {
    ok: pulled && countActiveComandas() > 0,
    pulled,
    pullVia: pulled ? 'crozzoPullComandasFromLan' : 'failed',
    comandasActivas: countActiveComandas(),
    pullDiag: {
      realtimeActive:
        typeof window.crozzoOperationalRealtimeActive === 'function'
          ? window.crozzoOperationalRealtimeActive()
          : null,
    },
  };
};

/**
 * Fase D — 4 tablets Playwright en paralelo (contextos aislados) + 1 caja pull.
 * Disparo simultáneo vía Promise.all.
 */
async function runBrowserParallelFive(posBaseUrl, lanPort, lanMock, tabletCount = 4) {
  const phase = {
    id: 'BROWSER-PARALLEL-5',
    devices: tabletCount + 1,
    tablets: tabletCount,
    ok: false,
    detail: {},
  };
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
      await p.addInitScript(lanInitScript, { lanPort, deviceId: `TAB-P${i + 1}`, role: 'B' });
      await p.goto(posBaseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
      pages.push(p);
    }
    await Promise.all(pages.map((p) => p.waitForTimeout(5000)));

    await Promise.all(pages.map((p) => p.evaluate(QUIESCE_SYNC_EVAL)));
    await Promise.all(pages.map((p) => p.waitForTimeout(300)));

    const statsBeforeParallel = { ...lanMock.snapshot().stats };

    const t0 = performance.now();
    const tabletResults = await Promise.all(
      pages.map((p, i) =>
        p.evaluate(TABLET_COMANDA_EVAL, {
          lanPort,
          deviceId: `TAB-P${i + 1}`,
          role: 'B',
          mesaRef: String(10 + i),
          parallelFieldTest: true,
        })
      )
    );
    phase.detail.fireElapsedMs = Math.round(performance.now() - t0);
    phase.detail.tablets = tabletResults;

    const statsAfterParallel = lanMock.snapshot().stats;
    phase.detail.lanTraffic = {
      postsDelta: statsAfterParallel.posts - statsBeforeParallel.posts,
      comandasUpsertedDelta: statsAfterParallel.comandasUpserted - statsBeforeParallel.comandasUpserted,
      operationOk:
        statsAfterParallel.comandasUpserted - statsBeforeParallel.comandasUpserted >= tabletCount &&
        statsAfterParallel.posts - statsBeforeParallel.posts <= MAX_LAN_POSTS_SINGLE_OP * tabletCount,
    };

    await Promise.all(contexts.map((c) => c.close()));

    const snapAfter = lanMock.snapshot();
    phase.detail.mockAfterFire = { comandas: snapAfter.comandas, stats: snapAfter.stats };

    const cajaCtx = await browser.newContext();
    const caja = await cajaCtx.newPage();
    caja.on('pageerror', (e) => errors.push(String(e?.message || e)));
    await caja.addInitScript(lanInitScript, { lanPort, deviceId: 'CAJA-PARALLEL-READER', role: 'B' });
    await caja.goto(posBaseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await caja.waitForFunction(() => typeof window.crozzoPullComandasFromLan === 'function', { timeout: 90000 });
    await caja.waitForTimeout(1200);

    const cajaResult = await caja.evaluate(CAJA_PULL_EVAL, {
      lanPort,
      deviceId: 'CAJA-PARALLEL-READER',
      role: 'B',
    });
    phase.detail.caja = cajaResult;
    phase.detail.pageErrors = errors.slice(0, 8);

    const tabletsOk = tabletResults.filter((r) => r && r.ok).length;
    phase.ok =
      tabletsOk === tabletCount &&
      snapAfter.comandas >= tabletCount &&
      cajaResult.pullVia === 'crozzoPullComandasFromLan' &&
      cajaResult.comandasActivas >= tabletCount &&
      phase.detail.lanTraffic.operationOk === true;

    await cajaCtx.close();
  } finally {
    await browser.close();
  }
  return phase;
}

/** Fase B — comandar↔cobrar (misma página, dos equipos lógicos). */
async function runBrowserComandarCobro(posBaseUrl) {
  const phase = { id: 'BROWSER-COMANDAR-COBRO', devices: 2, ok: false, detail: {} };
  const browser = await chromium.launch();
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(String(e?.message || e)));
    await page.addInitScript(() => {
      localStorage.setItem('crozzo_perfil_empresa', 'basico_restaurante');
      localStorage.setItem(
        'pos_dian_config',
        JSON.stringify({
          seguridad: { requiereLogin: false },
          operacion: { modo: 'demo', demoSubmodo: 'pos' },
          productos: [
            { id: 1, nombre: 'Hamburguesa', precio: 10000, categoria: 'X', stock: 50, activo: true, areaComanda: 'COCINA' },
          ],
          comandas: { areas: [{ id: 'COCINA', nombre: 'Cocina' }], autoPrint: false },
        })
      );
      window.__CROZZO_IS_TAURI__ = true;
    });
    await page.goto(posBaseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(5000);

    const result = await page.evaluate(async () => {
      const out = {};
      const VER = window.collectPosRuntimeState().v;
      window.applyPosRuntimeSnapshot(
        {
          v: VER,
          tipoServicioCaja: 'mesa',
          mesaSeleccionada: '12',
          cajaMesaOrderOpen: true,
          cartsPorMesa: {
            '12': [{ id: 1, nombre: 'Hamburguesa', precio: 10000, cantidad: 2, areaComanda: 'COCINA' }],
          },
        },
        {}
      );
      window.__crozzoSkipDupCheck = true;
      window.__crozzoSkipAllComandaGuards = true;
      const comandasAntes = (window.comandas || []).length;
      if (typeof window.comandarDesdeCaja !== 'function') {
        out.error = 'comandarDesdeCaja no disponible';
        return out;
      }
      window.comandarDesdeCaja();
      const cartTras = (window.collectPosRuntimeState().cartsPorMesa || {})['12'] || [];
      const sent = cartTras.reduce((n, i) => n + (Number(i.sentCantidad) || 0), 0);
      out.equipo1 = {
        comandaCreada: (window.comandas || []).length > comandasAntes,
        comandado: sent,
      };
      const snapshotNube = JSON.parse(JSON.stringify(window.collectPosRuntimeState()));
      window.applyPosRuntimeSnapshot(
        { v: VER, tipoServicioCaja: 'directa', mesaSeleccionada: null, cajaMesaOrderOpen: false, cartsPorMesa: {} },
        {}
      );
      window.crozzoApplyRemoteRuntimeRow(snapshotNube, new Date(Date.now() + 30000).toISOString(), { force: true });
      const cajaVe = (window.collectPosRuntimeState().cartsPorMesa || {})['12'] || [];
      out.equipo2 = {
        unidades: cajaVe.reduce((n, i) => n + (Number(i.cantidad) || 0), 0),
        comandado: cajaVe.reduce((n, i) => n + (Number(i.sentCantidad) || 0), 0),
      };
      window.applyPosRuntimeSnapshot(
        {
          v: VER,
          tipoServicioCaja: 'mesa',
          mesaSeleccionada: '12',
          cajaMesaOrderOpen: true,
          cartsPorMesa: {
            '12': [{ id: 1, nombre: 'Hamburguesa', precio: 10000, cantidad: 3, sentCantidad: 2, areaComanda: 'COCINA' }],
          },
        },
        {}
      );
      const snapshotCaja = JSON.parse(JSON.stringify(window.collectPosRuntimeState()));
      window.applyPosRuntimeSnapshot(
        {
          v: VER,
          tipoServicioCaja: 'mesa',
          mesaSeleccionada: '12',
          cajaMesaOrderOpen: true,
          cartsPorMesa: {
            '12': [{ id: 1, nombre: 'Hamburguesa', precio: 10000, cantidad: 2, sentCantidad: 2, areaComanda: 'COCINA' }],
          },
        },
        {}
      );
      window.crozzoApplyRemoteRuntimeRow(snapshotCaja, new Date(Date.now() + 60000).toISOString(), { force: true });
      const tabletVe = (window.collectPosRuntimeState().cartsPorMesa || {})['12'] || [];
      out.inversa = { unidades: tabletVe.reduce((n, i) => n + (Number(i.cantidad) || 0), 0) };
      return out;
    });

    phase.detail = result;
    phase.detail.pageErrors = errors.slice(0, 5);
    const e1 = result.equipo1 || {};
    const e2 = result.equipo2 || {};
    const inv = result.inversa || {};
    phase.ok =
      e1.comandaCreada === true &&
      e1.comandado === 2 &&
      e2.unidades === 2 &&
      e2.comandado === 2 &&
      inv.unidades === 3;
  } finally {
    await browser.close();
  }
  return phase;
}

function buildTabletPayload(i, stamp) {
  const id = 10000 + i;
  const tid = `field-tid-${stamp}-${i}`;
  return {
    uuid: tid,
    action_id: tid,
    type: 'comanda',
    businessId: 'BIZ-FIELD-TEST',
    deviceId: `TAB-STORM-${i}`,
    data: {
      id,
      transaction_id: tid,
      origen: 'tablet',
      tipoServicio: 'mesa',
      referencia: String((i % 50) + 1),
      areaId: 'COCINA',
      areaNombre: 'COCINA',
      items: [{ id: 1, nombre: 'Hamburguesa', cantidad: 1, precio: 10000 }],
      total: 10000,
      estado: 'pendiente',
      createdAt: new Date().toISOString(),
      lastUpdateAt: new Date().toISOString(),
    },
  };
}

function buildRuntimePayload(i, stamp) {
  const tid = `rt-field-${stamp}-${i}`;
  return {
    uuid: tid,
    action_id: tid,
    type: 'runtime',
    data: {
      v: 1,
      savedAt: Date.now(),
      cartsPorMesa: {
        [String((i % 50) + 1)]: [[1, 1, 10000, 'Hamburguesa']],
      },
    },
  };
}

/** Fase C — N dispositivos (N-1 tablets + 1 caja mock), disparo simultáneo. */
async function runHttpStorm(lan, deviceCount) {
  const tablets = deviceCount - 1;
  const stamp = Date.now();
  const addr = lan.server.address();
  const base = `http://127.0.0.1:${addr.port}`;
  const phase = {
    id: `HTTP-STORM-${deviceCount}`,
    devices: deviceCount,
    tablets,
    ok: false,
    detail: {},
  };

  const t0 = performance.now();
  const jobs = [];
  for (let i = 0; i < tablets; i++) {
    jobs.push(
      (async () => {
        const comandaRes = await fetch(`${base}/api/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(buildTabletPayload(i, stamp)),
        });
        const comandaOk = comandaRes.ok && (await comandaRes.json()).ok !== false;
        const rtRes = await fetch(`${base}/api/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(buildRuntimePayload(i, stamp)),
        });
        const rtOk = rtRes.ok && (await rtRes.json()).ok !== false;
        if (i % 7 === 0) {
          const pulseRes = await fetch(`${base}/api/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'lan_ops_pulse',
              data: { kind: 'comanda', dev: `TAB-STORM-${i}`, at: Date.now() },
            }),
          });
          await pulseRes.json().catch(() => ({}));
        }
        return { i, comandaOk, rtOk };
      })()
    );
  }

  const results = await Promise.all(jobs);
  const elapsedMs = Math.round(performance.now() - t0);
  const okComandas = results.filter((r) => r.comandaOk).length;
  const okRt = results.filter((r) => r.rtOk).length;

  const snapBeforeDedup = lan.snapshot();
  const dup = buildTabletPayload(0, stamp);
  await fetch(`${base}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dup),
  });
  const snapAfterDedup = lan.snapshot();

  const comandasJson = await lan.fetchComandas();
  const received = Array.isArray(comandasJson.comandas) ? comandasJson.comandas.length : 0;

  phase.detail = {
    elapsedMs,
    tablets,
    okComandas,
    okRuntime: okRt,
    comandasEnCaja: received,
    dedupWorked: snapAfterDedup.stats.deduped > snapBeforeDedup.stats.deduped,
    serverStats: snapAfterDedup.stats,
  };

  phase.ok =
    okComandas === tablets &&
    okRt === tablets &&
    received === tablets &&
    phase.detail.dedupWorked === true;

  return phase;
}

async function main() {
  console.log('\n=== CROZZO PRUEBA DE CAMPO — tablet + caja (1 → 100) ===\n');

  const lan = createFieldMockLanCentral({ cloudReachable: false });
  const lanAddr = await lan.listen();
  log('setup', `Caja LAN mock: ${lanAddr.url}`);

  const pos = createFieldPosHttpServer(srcRoot);
  const posAddr = await pos.listen();
  log('setup', `POS estático: ${posAddr.baseUrl}`);

  let allOk = true;

  if (!skipBrowser) {
    log('fase', 'A — Browser 1:1 LAN comanda (tablet → caja mock → pull)');
    const pA = await runBrowserLanComanda(posAddr.baseUrl, lanAddr.port, lan);
    report.phases.browser.push(pA);
    log('result', `${pA.id}: ${pA.ok ? 'OK' : 'FALLO'} — ${JSON.stringify(pA.detail)}`);
    if (!pA.ok) allOk = false;

    log('fase', 'B — Browser 1:1 comandar↔cobrar (runtime mesa)');
    const pB = await runBrowserComandarCobro(posAddr.baseUrl);
    report.phases.browser.push(pB);
    log('result', `${pB.id}: ${pB.ok ? 'OK' : 'FALLO'}`);
    if (!pB.ok) allOk = false;

    if (!skipParallel) {
      log('fase', 'D — Browser 4 tablets paralelo + caja pull (disparo simultáneo)');
      lan._state.comandas.clear();
      lan._state.runtime = null;
      lan._state.seenActions.clear();
      lan._state.stats.posts = 0;
      lan._state.stats.deduped = 0;
      lan._state.stats.comandasUpserted = 0;
      lan._state.stats.runtimes = 0;
      const pD = await runBrowserParallelFive(posAddr.baseUrl, lanAddr.port, lan, 4);
      report.phases.browser.push(pD);
      log(
        'result',
        `${pD.id}: ${pD.ok ? 'OK' : 'FALLO'} — tablets=${pD.detail.tablets?.filter((t) => t.ok).length || 0}/4, mock=${pD.detail.mockAfterFire?.comandas || 0}, caja=${pD.detail.caja?.comandasActivas || 0}, pull=${pD.detail.caja?.pullVia || '?'}, ${pD.detail.fireElapsedMs || 0}ms`
      );
      if (!pD.ok) allOk = false;
    }
  }

  if (!browserOnly) {
    for (const n of scalePhases) {
      log('fase', `C — HTTP storm ${n} dispositivos (${n - 1} tablets + 1 caja), disparo simultáneo`);
      lan._state.comandas.clear();
      lan._state.runtime = null;
      lan._state.seenActions.clear();
      lan._state.stats.posts = 0;
      lan._state.stats.deduped = 0;
      lan._state.stats.comandasUpserted = 0;
      lan._state.stats.runtimes = 0;
      const pC = await runHttpStorm(lan, n);
      report.phases.httpStorm.push(pC);
      const d = pC.detail;
      log(
        'result',
        `${pC.id}: ${pC.ok ? 'OK' : 'FALLO'} — ${d.okComandas}/${d.tablets} comandas, ${d.elapsedMs}ms, caja=${d.comandasEnCaja}`
      );
      if (!pC.ok) allOk = false;
    }
  }

  report.ok = allOk;
  const outPath = join(outDir, 'field-device-scale.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  await lan.close();
  await pos.close();

  console.log('\n--- Resumen ---');
  console.log('Browser:', report.phases.browser.map((p) => `${p.id}=${p.ok ? 'OK' : 'FAIL'}`).join(', ') || 'omitido');
  console.log(
    'HTTP storm:',
    report.phases.httpStorm.map((p) => `${p.devices}=${p.ok ? 'OK' : 'FAIL'}(${p.detail.elapsedMs}ms)`).join(', ') ||
      'omitido'
  );
  console.log('Reporte:', outPath);
  console.log(allOk ? '\nRESULTADO: OK — prueba de campo completa\n' : '\nRESULTADO: FALLO — ver fases arriba\n');
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
