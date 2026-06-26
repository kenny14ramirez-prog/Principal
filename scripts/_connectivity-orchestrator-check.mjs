/**
 * Pruebas del orquestador de conectividad (cascada de 5 niveles), QR del dia y
 * arranque "todo listo". Combina checks estaticos de cableado con pruebas
 * funcionales que cargan los modulos IIFE en un sandbox con mocks.
 *
 *   node scripts/_connectivity-orchestrator-check.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'app');

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

const flush = () => new Promise((r) => setImmediate(r));

// ---------------------------------------------------------------------------
// 1) Checks estaticos de cableado
// ---------------------------------------------------------------------------
function staticChecks() {
  const files = [
    'app/infra/CrozzoConnectivityOrchestrator.js',
    'app/infra/CrozzoStartupReady.js',
    'app/modules/CrozzoInternalQrRegistry.js',
    'app/modules/CrozzoDailyPairing.js',
  ];
  for (const f of files) {
    assert(existsSync(join(root, f)), 'Archivo nuevo', f);
  }

  for (const html of ['app/index.html', 'app/Crozzo_POS_Completo.html']) {
    const txt = readFileSync(join(root, html), 'utf8');
    const iOrch = txt.indexOf('CrozzoConnectivityOrchestrator.js');
    const iStart = txt.indexOf('CrozzoStartupReady.js');
    const iDaily = txt.indexOf('CrozzoDailyPairing.js');
    const iBoot = txt.indexOf('CrozzoPosBoot.js');
    assert(iOrch > 0 && iStart > 0 && iDaily > 0, 'Scripts en ' + html, 'los 3 modulos presentes');
    assert(
      iOrch < iBoot && iStart < iBoot && iDaily < iBoot,
      'Orden de carga ' + html,
      'los 3 modulos cargan antes que CrozzoPosBoot.js'
    );
  }

  const boot = readFileSync(join(app, 'core/CrozzoPosBoot.js'), 'utf8');
  assert(/CrozzoStartupReady\s*&&[\s\S]{0,80}\.run\(\)/.test(boot), 'initPOS engancha arranque', 'CrozzoStartupReady.run()');

  const main = readFileSync(join(app, 'core/CrozzoPosMain.js'), 'utf8');
  assert(/crozzoPageCloudWatchSetPage\s*=\s*setPage/.test(readFileSync(join(app, 'infra/CrozzoPageCloudWatch.js'), 'utf8')), 'Nube', 'PageCloudWatch expone crozzoPageCloudWatchSetPage');
  assert(/crozzoPageCloudWatchSetPage\(page\)/.test(main), 'Nube', 'navigateTo engancha PageCloudWatch por pantalla');

  const ext = readFileSync(join(app, 'core/CrozzoPosExtensions.js'), 'utf8');
  assert(/global\.crozzoRunCloudIoSelfTest\s*=\s*testCloudIO/.test(ext), 'Expuesto', 'crozzoRunCloudIoSelfTest global');
  assert(/card\('cascade'/.test(ext) && /async function testCascade/.test(ext), 'Diagnostico', "tarjeta 'Estado de cascada'");
  assert(/card\('cloudio'/.test(ext) && /async function testCloudIO/.test(ext), 'Diagnostico', "tarjeta 'Envio/recepcion nube'");

  // Mejoras de escala
  const comandas = readFileSync(join(app, 'modules/CrozzoComandasCloudSync.js'), 'utf8');
  assert(/business_id=eq\./.test(comandas), 'Escala', 'Realtime comandas filtrado por business_id');
  assert(/tenantIdsReady/.test(comandas), 'Nube', 'comandas exige tenant antes de Realtime');
  assert(/deferLocalCloudSync/.test(comandas), 'Nube', 'comandas respeta fase nube sin LAN dual');
  assert(/isUnderPressure/.test(comandas), 'Escala', 'polling comandas adaptativo bajo presion');
  const rt = readFileSync(join(app, 'modules/CrozzoPosRuntimeCloud.js'), 'utf8');
  assert(/if \(__pushTimer\) return false;/.test(rt), 'Escala', 'anti-pisado de ediciones locales activas');
  assert(/deferLocalCloudSync/.test(rt), 'Nube', 'runtime respeta fase nube sin LAN dual');
  assert(/crozzoTierAllowsCloudSync/.test(rt), 'Nube', 'ensureCloudSyncActive respeta tier');
  assert(/isUnderPressure/.test(rt), 'Escala', 'polling runtime adaptativo bajo presion');
  const recon = readFileSync(join(app, 'infra/CrozzoReconnectSync.js'), 'utf8');
  assert(/reconnectStaggerMs/.test(recon), 'Escala', 'escalonado anti-estampida en reconexion');

  // Runtime particionado por mesa
  assert(existsSync(join(root, 'docs/SUPABASE-SQL-MESA-RUNTIME.sql')), 'Escala', 'SQL crozzo_mesa_runtime');
  assert(/crozzo_mesa_runtime/.test(rt) && /ensureMesaMode/.test(rt), 'Escala', 'runtime por-mesa con auto-deteccion');
  assert(/__crozzoRuntimeMesaInternals/.test(rt), 'Escala', 'internos por-mesa expuestos');
  const wifi = readFileSync(join(app, 'infra/CrozzoWifiZoneBridge.js'), 'utf8');
  assert(/WATCH_CLOUD_MS/.test(wifi), 'Escala', 'vigilancia LAN espaciada con nube sana');
  const startup = readFileSync(join(app, 'infra/CrozzoStartupReady.js'), 'utf8');
  assert(/crozzo_startup_notice_v1/.test(startup), 'UX', 'aviso de arranque maximo 1/dia (sin nag)');
  assert(/CrozzoClockSync/.test(startup), 'Humano', 'arranque inicia correccion de reloj');

  // Tolerancia a errores humanos/organicos
  assert(existsSync(join(app, 'infra/CrozzoClockSync.js')), 'Humano', 'modulo CrozzoClockSync');
  for (const html of ['app/index.html', 'app/Crozzo_POS_Completo.html']) {
    const txt = readFileSync(join(root, html), 'utf8');
    assert(txt.includes('CrozzoPosRuntimeCloud.js'), 'Nube runtime', 'CrozzoPosRuntimeCloud en ' + html);
    assert(txt.includes('CrozzoPageCloudWatch.js'), 'Nube page watch', 'CrozzoPageCloudWatch en ' + html);
    assert(txt.includes('CrozzoReconnectSync.js'), 'Nube reconnect', 'CrozzoReconnectSync en ' + html);
    assert(txt.indexOf('CrozzoClockSync.js') > 0 && txt.indexOf('CrozzoClockSync.js') < txt.indexOf('CrozzoPosBoot.js'), 'Humano', 'ClockSync cargado en ' + html);
  }
  assert(/CLOCK_SKEW_HINT_MS/.test(main) && /crozzoNow/.test(main), 'Humano', 'QR tolerante a reloj desajustado');
  const cloud = readFileSync(join(app, 'core/CrozzoPosCloud.js'), 'utf8');
  assert(/crozzoPruneExpendableStorage/.test(cloud) && /crozzoIsQuotaError/.test(cloud), 'Humano', 'auto-sanado de almacenamiento lleno');
  assert(/crozzoSubirCatalogoNube/.test(cloud), 'Nube', 'subida masiva de catalogo a la nube');
  const nube = readFileSync(join(app, 'modules/CrozzoSuperAdminNube.js'), 'utf8');
  assert(/sanBtnUploadCatalog/.test(nube), 'Nube', "boton 'Subir catalogo a la nube'");
  // Asistente SQL completo (incluye runtime sede + mesa) cargado en ambos HTML
  const extras = readFileSync(join(app, 'modules/CrozzoSupabaseSqlExtras.js'), 'utf8');
  assert(/mesa_runtime/.test(extras) && /crozzo_mesa_runtime/.test(extras), 'SQL', 'script 12 (runtime por mesa) en el asistente');
  assert(/key: 'pos_runtime'[\s\S]{0,400}required: true/.test(extras), 'SQL', 'runtime sede marcado obligatorio');
  for (const html of ['app/index.html', 'app/Crozzo_POS_Completo.html']) {
    const txt = readFileSync(join(root, html), 'utf8');
    assert(txt.includes('CrozzoSupabaseSqlExtras.js'), 'SQL', 'Extras (runtime/federacion) cargado en ' + html);
  }

  // Cambio de sede: cerebro (nube) primero, luego vaciar cuerpo
  assert(/__crozzoSuppressRuntimePush/.test(rt), 'Sede', 'supresion de escritura durante cambio de sede');
  assert(/crozzoSedeSwitchFlushToOldCloud/.test(main), 'Sede', 'respaldo a nube vieja antes de vaciar');
  assert(/removeItem\(CROZZO_POS_RUNTIME_LS\)/.test(main), 'Sede', 'vacia estado operativo de la sede vieja');
  assert(existsSync(join(root, 'docs/SUPABASE-SQL-DEVICE-QR-SLOTS.sql')), 'QR interno', 'SQL device_qr_slots');
  assert(/crozzo_device_qr_slots/.test(readFileSync(join(app, 'modules/CrozzoInternalQrRegistry.js'), 'utf8')), 'QR interno', 'modulo registry');
}

// ---------------------------------------------------------------------------
// 2) Sandbox para cargar los IIFE de navegador
// ---------------------------------------------------------------------------
function makeSandbox() {
  let fakeNow = Date.now();
  class FakeDate extends Date {
    constructor(...args) {
      if (args.length) super(...args);
      else super(fakeNow);
    }
    static now() {
      return fakeNow;
    }
  }

  const store = new Map();
  const listeners = {};
  const spies = {};
  const timers = [];
  function spy(name, impl) {
    const fn = function (...args) {
      spies[name] = (spies[name] || 0) + 1;
      spies[name + ':lastArgs'] = args;
      return impl ? impl(...args) : undefined;
    };
    return fn;
  }

  const ctx = {
    console: { log() {}, info() {}, warn() {}, error() {} },
    setTimeout: (fn, delay) => {
      timers.push({ fn, delay: Number(delay) || 0 });
      return timers.length;
    }, // no auto-ejecuta; se controla con flushTimers()
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    setImmediate,
    Date: FakeDate,
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init && init.detail;
      }
    },
    navigator: { onLine: true, userAgent: 'node-test' },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    document: {
      hidden: false,
      addEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null,
    },
    addEventListener: (type, cb) => {
      (listeners[type] = listeners[type] || []).push(cb);
    },
    dispatchEvent: function (ev) {
      (listeners[ev.type] || []).forEach((cb) => {
        try {
          cb(ev);
        } catch (_) {}
      });
      return true;
    },
    requestIdleCallback: (fn) => {
      fn();
      return 0;
    },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.self = ctx;

  vm.createContext(ctx);

  const helpers = {
    ctx,
    spies,
    spy,
    setNow: (n) => {
      fakeNow = n;
    },
    advance: (ms) => {
      fakeNow += ms;
    },
    now: () => fakeNow,
    flushTimers: (maxDelay) => {
      var lim = maxDelay == null ? Infinity : maxDelay;
      var run = [];
      var keep = [];
      timers.forEach((t) => (t.delay <= lim ? run : keep).push(t));
      timers.length = 0;
      keep.forEach((t) => timers.push(t));
      run.forEach((t) => {
        try {
          t.fn();
        } catch (_) {}
      });
    },
    load(rel) {
      const code = readFileSync(join(root, rel), 'utf8');
      vm.runInContext(code, ctx, { filename: rel });
    },
  };
  return helpers;
}

// ---------------------------------------------------------------------------
// 3) Pruebas funcionales del orquestador
// ---------------------------------------------------------------------------
async function orchestratorTests() {
  const h = makeSandbox();
  const c = h.ctx;

  // Mocks de transportes y dependencias.
  let tier = 'cloud';
  c.detectConnectivityTier = () => Promise.resolve({ tier, reason: 'mock ' + tier });
  c.getMultiDeviceConfig = () => ({ role: c.__role || 'A', locationId: 'SEDE-1', businessId: 'BIZ-1' });
  c.__role = 'A';
  c.__CROZZO_IS_TAURI__ = true; // caja Windows -> puede desplegar hotspot
  c.CrozzoDeviceForm = { isAndroidApk: () => false };
  c.crozzoStartPosRuntimeCloudSync = h.spy('startRuntime');
  c.crozzoStartComandasCloudSync = h.spy('startComandas');
  c.CrozzoWifiZoneBridge = {
    startWatch: h.spy('wifiStartWatch'),
    resolveCentral: h.spy('wifiResolve', () => Promise.resolve(null)),
  };
  c.CrozzoLanWebSocketBridge = { afterMainInit: h.spy('lanWsInit') };
  c.crozzoMaybeAutoStartHotspot = h.spy('hotspotAuto');
  c.CrozzoOfflineGossip = { afterMainInit: h.spy('gossipInit') };
  c.CrozzoEmergencyMesh = { init: h.spy('emergencyInit') };
  c.CrozzoDailyPairing = {
    surfaceLastResort: h.spy('qrSurface'),
    ensureToday: h.spy('qrEnsure'),
    ensureCurrent: h.spy('qrEnsureCurrent'),
  };
  c.crozzoOnlineConfigReady = () => false;
  c.crozzoRunFullReconnectSync = h.spy('reconnect', () => Promise.resolve());
  c.showToast = h.spy('toast');

  h.load('app/infra/CrozzoConnectivityOrchestrator.js');
  const O = c.CrozzoConnectivityOrchestrator;
  assert(O && typeof O.evaluateNow === 'function', 'Orquestador carga', 'expone API');
  assert(O.getState().level === 'unknown', 'Estado inicial', 'level=unknown');

  // Nube
  tier = 'cloud';
  await O.evaluateNow();
  await flush();
  assert(O.getState().level === 'cloud', 'Nivel nube', O.getState().level);
  assert(h.spies['startRuntime'] >= 1 && h.spies['startComandas'] >= 1, 'Nube arranca sync', 'runtime+comandas');
  assert(O.getState().transports.cloud === true, 'Transporte nube', 'cloud=true');

  // LAN (degradacion: cloud -> lan, no debe reconectar)
  const reconnectBefore = h.spies['reconnect'] || 0;
  tier = 'lan';
  await O.evaluateNow();
  await flush();
  assert(O.getState().level === 'lan', 'Nivel LAN', O.getState().level);
  assert(h.spies['wifiStartWatch'] >= 1, 'LAN vigila caja', 'startWatch');
  assert((h.spies['reconnect'] || 0) === reconnectBefore, 'Sin reconnect al degradar', 'cloud->lan no resincroniza');

  // Recuperacion: lan -> cloud debe disparar reconnect (escalonado por setTimeout)
  tier = 'cloud';
  await O.evaluateNow();
  await flush();
  h.flushTimers(5000); // ejecuta el reconnect escalonado (stagger <= ~4.4s)
  await flush();
  assert((h.spies['reconnect'] || 0) > reconnectBefore, 'Reconnect al recuperar', 'lan->cloud resincroniza (escalonado)');

  // Hotspot caja Windows -> auto hotspot
  tier = 'hotspot';
  await O.evaluateNow();
  await flush();
  assert(O.getState().level === 'hotspot', 'Nivel hotspot', O.getState().level);
  assert(h.spies['hotspotAuto'] >= 1, 'Caja despliega hotspot', 'crozzoMaybeAutoStartHotspot');

  // Offline sin nube -> malla (init una sola vez)
  tier = 'offline';
  c.detectConnectivityTier = () =>
    Promise.resolve({ tier: 'offline', reason: 'mock offline', lanReach: false, gwReach: false });
  await O.evaluateNow();
  await flush();
  await O.evaluateNow();
  await flush();
  assert(O.getState().level === 'mesh', 'Nivel malla', O.getState().level);
  assert(h.spies['gossipInit'] === 1, 'Malla init una vez', 'runOnce gossip=' + h.spies['gossipInit']);
  assert(h.spies['emergencyInit'] === 1, 'Emergency init una vez', 'runOnce emergency=' + h.spies['emergencyInit']);

  // Tras 5 min aislado sin nube -> QR
  h.advance(301000);
  await O.evaluateNow();
  await flush();
  assert(O.getState().level === 'qr', 'Nivel QR (sin nube, 5 min)', O.getState().level);
  assert(h.spies['qrSurface'] >= 1, 'QR ultimo recurso', 'surfaceLastResort');

  // Nube viva + sin LAN -> QR inmediato (operacion; no esperar 5 min)
  const hCloud = makeSandbox();
  const cCloud = hCloud.ctx;
  cCloud.detectConnectivityTier = () =>
    Promise.resolve({ tier: 'offline', reason: 'mock offline+cloud', lanReach: false, gwReach: false });
  cCloud.getMultiDeviceConfig = () => ({ role: 'A' });
  cCloud.crozzoOnlineConfigReady = () => true;
  cCloud.__SUPABASE = {};
  cCloud.crozzoCloudFirstSyncEnabled = () => false;
  cCloud.crozzoStartPosRuntimeCloudSync = hCloud.spy('startRuntimeCloud');
  cCloud.crozzoStartComandasCloudSync = hCloud.spy('startComandasCloud');
  cCloud.CrozzoWifiZoneBridge = { startWatch: hCloud.spy('w') };
  cCloud.CrozzoOfflineGossip = { afterMainInit: hCloud.spy('g') };
  cCloud.CrozzoEmergencyMesh = { init: hCloud.spy('e') };
  cCloud.CrozzoDailyPairing = { surfaceLastResort: hCloud.spy('qrSurface'), ensureCurrent: hCloud.spy('qrEnsure') };
  cCloud.showToast = hCloud.spy('toast');
  hCloud.load('app/infra/CrozzoConnectivityOrchestrator.js');
  await cCloud.CrozzoConnectivityOrchestrator.evaluateNow();
  await flush();
  assert(cCloud.CrozzoConnectivityOrchestrator.getState().level === 'qr', 'Nivel QR (nube+aislamiento)', cCloud.CrozzoConnectivityOrchestrator.getState().level);
  assert((hCloud.spies['qrSurface'] || 0) >= 1, 'QR inmediato con nube', 'surfaceLastResort');

  // Hotspot en caja Android -> aviso guiado (no auto hotspot)
  const h2 = makeSandbox();
  const c2 = h2.ctx;
  let tier2 = 'hotspot';
  c2.detectConnectivityTier = () => Promise.resolve({ tier: tier2 });
  c2.getMultiDeviceConfig = () => ({ role: 'A' });
  c2.__CROZZO_IS_TAURI__ = true;
  c2.CrozzoDeviceForm = { isAndroidApk: () => true }; // caja Android
  c2.crozzoMaybeAutoStartHotspot = h2.spy('hotspotAuto');
  c2.CrozzoWifiZoneBridge = { startWatch: h2.spy('w'), resolveCentral: () => Promise.resolve(null) };
  c2.showToast = h2.spy('toast');
  h2.load('app/infra/CrozzoConnectivityOrchestrator.js');
  await c2.CrozzoConnectivityOrchestrator.evaluateNow();
  await flush();
  assert((h2.spies['hotspotAuto'] || 0) === 0, 'Android no auto-hotspot', 'no intenta crear hotspot');
  assert((h2.spies['toast'] || 0) >= 1, 'Android guia hotspot', 'aviso al usuario');
}

// ---------------------------------------------------------------------------
// 4) Pruebas del QR del dia
// ---------------------------------------------------------------------------
async function dailyPairingTests() {
  const h = makeSandbox();
  const c = h.ctx;
  c.getMultiDeviceConfig = () => ({ role: c.__role || 'A' });
  c.__role = 'A';
  c.crozzoPairingBuildPayload = (profile) => ({
    payload: {
      type: 'CROZZO_CLOUD_PAIRING',
      version: 4,
      target_profile: profile,
      device_id: 'CAJA-1',
      device_role: 'A',
      lan: { central_ip: '192.168.1.10', port: 3000 },
      location_id: 'SEDE-1',
      cloud_sync: true,
      timestamp: h.now(),
    },
  });
  c.crozzoPairingBuildDeviceSelfPayload = c.crozzoPairingBuildPayload;
  c.CrozzoPairingSeal = { buildFastQrText: () => 'FASTQR-TOKEN' };

  h.load('app/modules/CrozzoInternalQrRegistry.js');
  h.load('app/modules/CrozzoDailyPairing.js');
  const D = c.CrozzoDailyPairing;
  assert(D && typeof D.ensureToday === 'function', 'QR diario carga', 'expone API');

  const rec = D.ensureToday();
  assert(rec && rec.scanText === 'FASTQR-TOKEN', 'Genera QR del dia', 'scanText sellado');
  assert(rec && rec.locationId === 'SEDE-1', 'QR lleva sede', rec && rec.locationId);
  assert(rec && rec.slot, 'QR usa franja 4h', rec && rec.slot);
  const got = D.getToday();
  assert(got && got.slot === rec.slot, 'QR persiste franja actual', got && got.slot);

  // Nueva franja -> regenera y conserva historial
  h.advance(4 * 60 * 60 * 1000 + 1000);
  c.CrozzoPairingSeal = { buildFastQrText: () => 'FASTQR-TOKEN-2' };
  const rec2 = D.ensureCurrent(true);
  assert(rec2 && rec2.scanText === 'FASTQR-TOKEN-2', 'Regenera cada 4 h', rec2 && rec2.scanText);
  assert(Array.isArray(rec2.history) && rec2.history.length >= 1, 'Historial QR previo', 'history.length>=' + (rec2.history && rec2.history.length));

  // Rol B no emite QR
  const h2 = makeSandbox();
  const c2 = h2.ctx;
  c2.getMultiDeviceConfig = () => ({ role: 'B' });
  c2.crozzoPairingBuildPayload = () => ({ payload: { timestamp: h2.now() } });
  c2.CrozzoPairingSeal = { buildFastQrText: () => 'X' };
  h2.load('app/modules/CrozzoDailyPairing.js');
  assert(c2.CrozzoDailyPairing.ensureToday() === null, 'Rol B no emite QR', 'solo la caja');
}

// ---------------------------------------------------------------------------
// 5) Prueba del arranque "todo listo"
// ---------------------------------------------------------------------------
async function startupTests() {
  const h = makeSandbox();
  const c = h.ctx;
  c.getMultiDeviceConfig = () => ({ role: 'A', locationId: 'SEDE-1', businessId: 'BIZ-1' });
  c.__CROZZO_IS_TAURI__ = true;
  c.CrozzoDeviceForm = { isAndroidApk: () => false };
  c.readCrozzoSupabaseJson = () => ({ syncEnabled: true, url: 'https://x.supabase.co', anonKey: 'k'.repeat(40) });
  c.crozzoSupabaseEffectiveAnonKey = (j) => j.anonKey;
  c.isValidSupabasePair = (u, k) => /supabase\.co/.test(u) && k.length >= 20;
  c.crozzoOnlineConfigReady = () => true;
  c.__SUPABASE = {};
  c.crozzoRunCloudIoSelfTest = h.spy('cloudIo', () => Promise.resolve({ level: 'ok', summary: 'OK' }));
  c.crozzoProbeLocalLanReachable = h.spy('lanProbe', () => Promise.resolve({ ok: true }));
  c.CrozzoConnectivityOrchestrator = { start: h.spy('orchStart') };
  c.CrozzoDailyPairing = { ensureToday: h.spy('qrEnsure') };
  c.CrozzoPairingQrReader = { ensureOsCameraPermission: h.spy('cam', () => Promise.resolve('granted')) };
  c.showToast = h.spy('toast');

  h.load('app/infra/CrozzoStartupReady.js');
  const S = c.CrozzoStartupReady;
  assert(S && typeof S.run === 'function', 'Arranque carga', 'expone API');

  S.run();
  await flush();
  await flush();
  await flush();

  assert(h.spies['orchStart'] >= 1, 'Arranque inicia orquestador', 'start()');
  assert(h.spies['qrEnsure'] >= 1, 'Arranque genera QR del dia', 'ensureToday()');
  assert(h.spies['cloudIo'] >= 1, 'Arranque autoprueba nube', 'crozzoRunCloudIoSelfTest');
  const snap = S.getSnapshot();
  assert(snap && snap.cloudReady === true, 'Snapshot listo', 'cloudReady=true');
  assert(snap && snap.cloudIo === 'ok', 'Snapshot envio/recepcion', 'cloudIo=' + (snap && snap.cloudIo));
  assert(snap && snap.lanOk === true, 'Snapshot LAN', 'lanOk=true');
  // Auto-hotspot por defecto en caja Windows
  assert(c.localStorage.getItem('crozzo_auto_hotspot_v1') === '1', 'Auto-hotspot por defecto', 'caja Windows');
}

// ---------------------------------------------------------------------------
// 6a) Tolerancia a reloj mal puesto (CrozzoClockSync)
// ---------------------------------------------------------------------------
async function clockSyncTests() {
  const h = makeSandbox();
  const c = h.ctx;
  c.fetch = () => Promise.reject(new Error('no net en test'));
  h.load('app/infra/CrozzoClockSync.js');
  const CS = c.CrozzoClockSync;
  assert(CS && typeof CS.now === 'function', 'Reloj carga', 'CrozzoClockSync expone API');
  assert(typeof c.crozzoNow === 'function', 'Reloj global', 'crozzoNow disponible');

  // Desfase grande (reloj 2 min adelantado del servidor): se corrige.
  const base = h.now();
  CS.noteServerMs(base + 120000);
  assert(Math.abs(CS.getOffset() - 120000) < 1500, 'Reloj corrige desfase', 'offset ~120s');
  assert(Math.abs(c.crozzoNow() - (base + 120000)) < 1500, 'crozzoNow corregido', 'hora servidor');

  // Desfase pequeno (<30s): se considera reloj OK -> offset 0.
  CS.noteServerMs(h.now() + 5000);
  assert(CS.getOffset() === 0, 'Reloj OK ignora ruido', 'offset 0 si <30s');

  // noteResponse via header Date.
  const serverDate = new c.Date(h.now() + 200000).toUTCString();
  CS.noteResponse({ headers: { get: (k) => (String(k).toLowerCase() === 'date' ? serverDate : null) } });
  assert(Math.abs(CS.getOffset() - 200000) < 2000, 'Reloj desde header Date', 'offset ~200s');
}

// ---------------------------------------------------------------------------
// 6b) Runtime particionado por mesa: round-trip de extraccion/reconstruccion
// ---------------------------------------------------------------------------
async function mesaPartitionTests() {
  const h = makeSandbox();
  const c = h.ctx;
  h.load('app/modules/CrozzoPosRuntimeCloud.js');
  const api = c.__crozzoRuntimeMesaInternals;
  assert(api && typeof api.mesaRowsFromSnap === 'function', 'Por-mesa carga', 'internos expuestos');

  const snap = {
    v: 1,
    _c: 1,
    savedAt: 1000,
    tipoServicioCaja: 'mesa',
    closedSlots: { mesa: {}, llevar: {} },
    cartsPorMesa: { 5: [[1, 2, 1500, 'Pizza']], 6: [[2, 1]] },
    cartsPorLlevar: { L1: [[3, 1]] },
    cartDirecto: [[9, 1]],
  };
  const ctxC = { locationId: 'SEDE-1', businessId: 'BIZ', deviceId: 'D1', role: 'A' };
  const rows = api.mesaRowsFromSnap(snap, ctxC);

  const kinds = rows.map((r) => r.kind + ':' + r.ref);
  assert(kinds.indexOf('mesa:5') >= 0 && kinds.indexOf('mesa:6') >= 0, 'Por-mesa: fila por mesa', 'mesa 5 y 6 separadas');
  assert(kinds.indexOf('llevar:L1') >= 0, 'Por-mesa: fila llevar', 'L1');
  assert(kinds.indexOf('directo:__directo__') >= 0, 'Por-mesa: fila directo', '__directo__');
  assert(kinds.indexOf('meta:__meta__') >= 0, 'Por-mesa: fila meta', 'estado global');
  const meta = rows.find((r) => r.kind === 'meta');
  assert(meta && !meta.payload.cartsPorMesa && meta.payload.tipoServicioCaja === 'mesa', 'Por-mesa: meta sin carritos', 'meta limpia');

  const built = api.snapFromMesaRows(rows);
  const s = built && built.snap;
  assert(
    s && JSON.stringify(s.cartsPorMesa['5']) === JSON.stringify(snap.cartsPorMesa['5']),
    'Por-mesa: round-trip mesa 5',
    'carrito intacto'
  );
  assert(s && JSON.stringify(s.cartsPorLlevar['L1']) === JSON.stringify(snap.cartsPorLlevar.L1), 'Por-mesa: round-trip llevar', 'L1 intacto');
  assert(s && JSON.stringify(s.cartDirecto) === JSON.stringify(snap.cartDirecto), 'Por-mesa: round-trip directo', 'directo intacto');
  assert(s && s.tipoServicioCaja === 'mesa', 'Por-mesa: meta restaurada', 'estado global intacto');

  // Dos meseros en mesas distintas -> filas distintas (no se pisan)
  const onlyMesa6 = rows.filter((r) => r.kind === 'meta' || (r.kind === 'mesa' && r.ref === '6'));
  const built6 = api.snapFromMesaRows(onlyMesa6);
  assert(built6 && built6.snap.cartsPorMesa['6'] && !built6.snap.cartsPorMesa['5'], 'Por-mesa: aislamiento', 'editar mesa 6 no toca mesa 5');
}

// ---------------------------------------------------------------------------
// 6c) Cambio de sede: las escrituras se suprimen para no contaminar la nube nueva
// ---------------------------------------------------------------------------
async function sedeSwitchTests() {
  const h = makeSandbox();
  const c = h.ctx;
  c.crozzoOnlineConfigReady = () => true;
  c.__SUPABASE = {};
  c.getMultiDeviceConfig = () => ({ role: 'A', locationId: 'SEDE-1', businessId: 'BIZ' });
  c.collectPosRuntimeState = () => ({ v: 1, savedAt: h.now(), cartsPorMesa: { 5: [{ id: 1, cantidad: 1, precio: 10, nombre: 'x' }] } });
  h.load('app/modules/CrozzoPosRuntimeCloud.js');
  c.__crozzoSuppressRuntimePush = true;
  const r = await c.crozzoPushPosRuntimeCloudNow();
  assert(r === false, 'Cambio de sede: push suprimido', 'no escribe en la nube nueva durante el cambio');
}

// ---------------------------------------------------------------------------
// 6) Prueba del escalonado anti-estampida
// ---------------------------------------------------------------------------
async function staggerTests() {
  const h = makeSandbox();
  const c = h.ctx;
  c.localStorage.setItem('crozzo_device_id', 'DEV-ABC-123');
  // ReconnectSync llama a varias APIs solo dentro de funciones; al cargar solo
  // ejecuta bindReconnectEvents (usa addEventListener, ya disponible).
  h.load('app/infra/CrozzoReconnectSync.js');
  const f = c.crozzoReconnectStaggerMs;
  assert(typeof f === 'function', 'Escalonado expuesto', 'crozzoReconnectStaggerMs');
  const v = f(700, 6000);
  assert(v >= 700 && v <= 700 + 6000 + 400, 'Escalonado en rango', '700..7100 -> ' + v);
  // Determinismo: misma device id -> mismo offset base (sin contar el azar de 400).
  const a = f(0, 6000);
  const b = f(0, 6000);
  assert(Math.abs(a - b) <= 400, 'Escalonado determinista por equipo', '|a-b|<=400');
}

// ---------------------------------------------------------------------------
(async function main() {
  try {
    staticChecks();
    await orchestratorTests();
    await dailyPairingTests();
    await startupTests();
    await clockSyncTests();
    await mesaPartitionTests();
    await sedeSwitchTests();
    await staggerTests();
  } catch (e) {
    fail('Excepcion', String((e && e.stack) || e));
  }

  console.log('\n=== Crozzo orquestador / cascada — pruebas ===\n');
  for (const r of results) {
    console.log((r.ok ? '\u2713' : '\u2717') + ' ' + r.name + (r.detail ? ' \u2014 ' + r.detail : ''));
  }
  console.log('\n' + (failed ? failed + ' fallo(s)' : 'Todo OK') + ' (' + results.length + ' checks)\n');
  process.exit(failed ? 1 : 0);
})();
