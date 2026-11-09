#!/usr/bin/env node
/**
 * Prueba de carga real de los módulos de actualización en un entorno simulado.
 * Ejecuta el código de app/infra y app/core tal como lo ejecutaría el navegador
 * y falla si algún módulo lanza error al cargar o si falta una API pública.
 * Uso: node scripts/test-updates-load.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'app/core/CrozzoTechConsole.js',
  'app/infra/CrozzoChannelFallback.js',
  'app/infra/CrozzoTauriUpdater.js',
  'app/infra/CrozzoSystemUpdates.js',
  'app/infra/CrozzoDeviceReport.js',
];

function makeEl() {
  return {
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {},
    getAttribute() { return null; },
    removeAttribute() {},
    addEventListener() {},
    appendChild() {},
    insertBefore() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    focus() {},
    parentNode: null,
    nextSibling: null,
    innerHTML: '',
    textContent: '',
  };
}

const listeners = {};
const doc = {
  readyState: 'complete',
  documentElement: makeEl(),
  body: makeEl(),
  head: makeEl(),
  createElement() { return makeEl(); },
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
  removeEventListener() {},
};
const store = {};
const win = {
  document: doc,
  navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32', onLine: true },
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
  removeEventListener() {},
  dispatchEvent() {},
  setTimeout: () => 0,
  clearTimeout() {},
  setInterval: () => 0,
  clearInterval() {},
  console,
  fetch: () => Promise.reject(new Error('sin red en prueba')),
  location: { reload() {} },
  CustomEvent: function () {},
  URL,
  AbortController,
  Promise,
};
win.window = win;
win.__TAURI__ = undefined;

const ctx = vm.createContext(win);
let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) { console.log('  [PASS] ' + name); passed++; }
  else { console.log('  [FAIL] ' + name + (extra ? ' — ' + extra : '')); failed++; }
}

console.log('\n  Crozzo POS — Prueba de carga de actualizaciones');
console.log('  ===============================================\n');

for (const rel of files) {
  const code = readFileSync(join(root, rel), 'utf8');
  try {
    vm.runInContext(code, ctx, { filename: rel });
    check('carga sin errores: ' + rel, true);
  } catch (e) {
    check('carga sin errores: ' + rel, false, e && e.message);
  }
}

check('API CrozzoTauriUpdater expuesta', !!(win.CrozzoTauriUpdater));
const TU = win.CrozzoTauriUpdater || {};
for (const fn of ['installAutomatic', 'installLatest', 'selectPlan', 'executePlanChain', 'probePlanCapabilities',
  'prewarmPlanB', 'ensureAndroidRuntimePermissions', 'resolveReleaseInstallTarget', 'compareSemver']) {
  check('TU.' + fn + ' es función', typeof TU[fn] === 'function');
}
check('API CrozzoSystemUpdates expuesta', !!(win.CrozzoSystemUpdates));
check('crozzoUpdateDiagnosticReport disponible', typeof win.crozzoUpdateDiagnosticReport === 'function');
check('crozzoUpdateDumpState disponible', typeof win.crozzoUpdateDumpState === 'function');
check('consola técnica captura desde la carga', typeof win.crozzoGetTechConsoleLines === 'function');

async function runChannelChecks() {
  const events = [];
  win.dispatchEvent = (e) => { events.push(e); };
  win.CustomEvent = class { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } };
  win.fetch = () => Promise.reject(new Error('LAN caída'));
  win.navigator.onLine = true;
  delete win.crozzoOnlineConfigReady;
  await win.crozzoChannelFallbackTry();
  check('Sin nube configurada: el canal no pasa a cloud', win.__CROZZO_ACTIVE_CHANNEL !== 'cloud', String(win.__CROZZO_ACTIVE_CHANNEL));
  await win.crozzoChannelFallbackTry();
  await win.crozzoChannelFallbackTry();
  check('Sin cambios de canal: no se emiten eventos repetidos', events.length <= 1, 'eventos=' + events.length);
  win.crozzoOnlineConfigReady = () => true;
  await win.crozzoChannelFallbackTry();
  check('Nube configurada y LAN caída: el canal pasa a cloud', win.__CROZZO_ACTIVE_CHANNEL === 'cloud', String(win.__CROZZO_ACTIVE_CHANNEL));
}

function runReportChecks() {
  const report = typeof win.crozzoDeviceReport === 'function' ? win.crozzoDeviceReport() : '';
  check('Reporte de conexión: función disponible', typeof win.crozzoDeviceReport === 'function');
  check('Reporte: incluye sección de actualizaciones', report.includes('=== ACTUALIZACIONES ==='));
  check('Reporte: incluye canal y conexión', report.includes('=== CONEXIÓN Y CANAL ==='));
  check('Reporte: incluye plataforma y estado local', report.includes('=== ESTADO LOCAL'));
  check('Botón de menú: función de apertura disponible', typeof win.crozzoDeviceReportOpenFromMenu === 'function');
  const htmlFiles = ['app/index.html', 'app/Crozzo_POS_Completo.html'];
  for (const rel of htmlFiles) {
    const html = readFileSync(join(root, rel), 'utf8');
    check(rel + ': botón de reporte usa data-crozzo-act', html.includes('data-crozzo-act="crozzoDeviceReportOpenFromMenu"'));
    check(rel + ': sin onclick try{} que el módulo CSP no puede ejecutar', !html.includes("onclick=\"try{if(typeof crozzoDeviceReportShow"));
  }
}

async function runPlanChecks() {
  await runChannelChecks().catch((e) => check('canal de conexión sin excepción', false, e && e.message));
  try { runReportChecks(); } catch (e) { check('reporte sin excepción', false, e && e.message); }
  win.__TAURI__ = { core: { invoke: () => Promise.resolve({}) } };
  await TU.probePlanCapabilities();
  const sel = TU.selectPlan({ platform: 'windows', targetVersion: 'v1.0.283' });
  check('Windows: cadena A → C → B', sel.chain.join('>') === 'A>C>B', sel.chain.join(' → '));
  const selMac = TU.selectPlan({ platform: 'mac', targetVersion: 'v1.0.283' });
  check('Mac: cadena A → D → B', selMac.chain.join('>') === 'A>D>B', selMac.chain.join(' → '));
}

runPlanChecks()
  .catch((e) => check('chequeo de planes sin excepción', false, e && e.message))
  .then(() => {
    console.log('\n  ─────────────────────────────────────────');
    console.log('  ' + (passed + failed) + ' comprobaciones: ' + passed + ' PASS, ' + failed + ' FAIL');
    console.log('  ─────────────────────────────────────────\n');
    process.exit(failed ? 1 : 0);
  });
