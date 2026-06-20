/**
 * Pruebas del failover de caja con respaldo predefinido.
 * Carga el módulo IIFE en un sandbox y valida la máquina de decisión `decide`
 * (promoción/degradación con histéresis y anti split-brain), más el cableado
 * estático (script tags y candidatos de descubrimiento).
 *
 *   node scripts/_central-failover-check.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'app');

let failed = 0;
const results = [];
const ok = (name, detail) => results.push({ ok: true, name, detail });
const fail = (name, detail) => {
  results.push({ ok: false, name, detail });
  failed++;
};
const assert = (cond, name, detail) => (cond ? ok(name, detail) : fail(name, detail));

// --- Carga del módulo en sandbox ---
function loadFailover() {
  const ctx = {
    console,
    setTimeout: () => 0,
    clearTimeout: () => {},
    Date,
    localStorage: (() => {
      const m = new Map();
      return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: (k) => m.delete(k),
      };
    })(),
    CustomEvent: class {
      constructor(t, i) {
        this.type = t;
        this.detail = i && i.detail;
      }
    },
    dispatchEvent: () => true,
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(app, 'infra/CrozzoCentralFailover.js'), 'utf8'), ctx, {
    filename: 'CrozzoCentralFailover.js',
  });
  return ctx.CrozzoCentralFailover;
}

function decideTests() {
  const F = loadFailover();
  assert(F && typeof F.decide === 'function', 'API', 'CrozzoCentralFailover.decide expuesto');
  const HOLD = F.PROMOTE_HOLD_MS;
  const DEM = F.DEMOTE_HOLD_MS;

  // No-backup: nunca actúa.
  let st = { promoted: false, primaryDownSince: 0, primaryUpSince: 0 };
  let d = F.decide(st, { now: 0, isBackup: false, isDesktop: true, primaryHealthy: false, tier: 'offline' });
  assert(d.action === 'none', 'No-backup', 'un dispositivo normal nunca promueve');

  // Backup con primaria sana: no promueve.
  st = { promoted: false, primaryDownSince: 0, primaryUpSince: 0 };
  d = F.decide(st, { now: 1000, isBackup: true, isDesktop: true, primaryHealthy: true, tier: 'lan' });
  assert(d.action === 'none', 'Primaria sana', 'no promueve si la caja responde');

  // Primaria cae pero aún no persiste el hold: no promueve.
  const T0 = 1000;
  st = { promoted: false, primaryDownSince: 0, primaryUpSince: 0 };
  d = F.decide(st, { now: T0, isBackup: true, isDesktop: true, primaryHealthy: false, tier: 'mesh' });
  assert(d.action === 'none', 'Caída breve', 'no promueve dentro del hold (anti-flapping)');
  d = F.decide(st, { now: T0 + HOLD - 1, isBackup: true, isDesktop: true, primaryHealthy: false, tier: 'mesh' });
  assert(d.action === 'none', 'Hold sin cumplir', 'sigue esperando confirmación');

  // Primaria caída sostenida y sin nube: promueve.
  d = F.decide(st, { now: T0 + HOLD + 1, isBackup: true, isDesktop: true, primaryHealthy: false, tier: 'mesh' });
  assert(d.action === 'promote', 'Promoción', 'promueve tras caída sostenida sin nube');

  // Nube sana: aunque la primaria caiga, NO promueve (la nube es la verdad).
  st = { promoted: false, primaryDownSince: 0, primaryUpSince: 0 };
  F.decide(st, { now: T0, isBackup: true, isDesktop: true, primaryHealthy: false, tier: 'cloud' });
  d = F.decide(st, { now: T0 + HOLD + 5000, isBackup: true, isDesktop: true, primaryHealthy: false, tier: 'cloud' });
  assert(d.action === 'none', 'Nube sana', 'no promueve si hay nube disponible');

  // Un parpadeo (recupera) resetea el contador de caída.
  st = { promoted: false, primaryDownSince: 0, primaryUpSince: 0 };
  F.decide(st, { now: T0, isBackup: true, isDesktop: true, primaryHealthy: false, tier: 'mesh' });
  F.decide(st, { now: T0 + 5000, isBackup: true, isDesktop: true, primaryHealthy: true, tier: 'lan' });
  d = F.decide(st, { now: T0 + 6000, isBackup: true, isDesktop: true, primaryHealthy: false, tier: 'mesh' });
  assert(st.primaryDownSince === T0 + 6000, 'Reset por parpadeo', 'el hold se reinicia al recuperar');
  assert(d.action === 'none', 'Sin promoción por parpadeo', 'un parpadeo no promueve');

  // Promovido + primaria regresa estable: degrada (anti split-brain).
  st = { promoted: true, primaryDownSince: 0, primaryUpSince: 0 };
  d = F.decide(st, { now: T0, isBackup: true, isDesktop: true, primaryHealthy: true, tier: 'lan' });
  assert(d.action === 'none', 'Regreso sin confirmar', 'no degrada al instante (estabiliza)');
  d = F.decide(st, { now: T0 + DEM + 1, isBackup: true, isDesktop: true, primaryHealthy: true, tier: 'lan' });
  assert(d.action === 'demote', 'Degradación', 'cede a la primaria cuando vuelve estable');

  // Promovido y primaria sigue caída: sigue sirviendo.
  st = { promoted: true, primaryDownSince: 0, primaryUpSince: 0 };
  d = F.decide(st, { now: 999999, isBackup: true, isDesktop: true, primaryHealthy: false, tier: 'mesh' });
  assert(d.action === 'none' && d.reason === 'serving', 'Sigue sirviendo', 'mantiene el rol central mientras la primaria no vuelve');
}

function staticChecks() {
  assert(existsSync(join(app, 'infra/CrozzoCentralFailover.js')), 'Archivo', 'CrozzoCentralFailover.js existe');
  for (const html of ['app/index.html', 'app/Crozzo_POS_Completo.html']) {
    const txt = readFileSync(join(root, html), 'utf8');
    const iWifi = txt.indexOf('CrozzoWifiZoneBridge.js');
    const iFail = txt.indexOf('CrozzoCentralFailover.js');
    const iBoot = txt.indexOf('CrozzoPosBoot.js');
    assert(iFail > 0, 'Script en ' + html, 'CrozzoCentralFailover.js incluido');
    assert(iWifi > 0 && iFail > iWifi && iFail < iBoot, 'Orden de carga ' + html, 'tras WifiZoneBridge y antes de Boot');
  }
  const wifi = readFileSync(join(app, 'infra/CrozzoWifiZoneBridge.js'), 'utf8');
  assert(/add\(cur\.backupIp, 'backup'\)/.test(wifi), 'Descubrimiento', 'backupIp en gatewayCandidates');
  const ext = readFileSync(join(app, 'core/CrozzoPosExtensions.js'), 'utf8');
  assert(/CrozzoCentralFailover[\s\S]{0,80}afterMainInit\(\)/.test(ext), 'Wiring', 'afterMainInit en Extensions');
  const orch = readFileSync(join(app, 'infra/CrozzoConnectivityOrchestrator.js'), 'utf8');
  assert(/central_failover/.test(orch), 'Wiring', "runOnce('central_failover') en orquestador");
}

decideTests();
staticChecks();

const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
for (const r of results) {
  console.log((r.ok ? '\u2713' : '\u2717') + ' ' + pad(r.name, 26) + ' \u2014 ' + (r.detail || ''));
}
console.log('\n' + (failed ? failed + ' fallo(s)' : 'OK') + ' (' + results.length + ' checks)');
process.exit(failed ? 1 : 0);
