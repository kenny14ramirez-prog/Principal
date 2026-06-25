/**
 * Auditoría ejecutable Plan Básico · Restaurante (v2)
 * node scripts/_plan-basico-audit-exec.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const srcRoot = join(root, 'src');
const outDir = join(root, 'scripts', '_qa-out');
mkdirSync(outDir, { recursive: true });

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  const file = join(srcRoot, p.replace(/^\//, ''));
  try {
    statSync(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404);
    res.end('');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const baseUrl = `http://127.0.0.1:${server.address().port}/index.html`;

const report = {
  generatedAt: new Date().toISOString(),
  version: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version,
  profile: 'basico_restaurante',
  phases: {},
  roles: {},
  scenarios: {},
  salon: {},
  flows: {},
  security: {},
  performance: {},
  issues: [],
  metrics: {},
  executions: [],
};

function issue(sev, area, title, detail, evidence) {
  report.issues.push({ id: `PB-${String(report.issues.length + 1).padStart(3, '0')}`, severity: sev, area, title, detail, evidence });
}
function execLog(name, ok, detail) {
  report.executions.push({ name, ok, detail, at: new Date().toISOString() });
}

/** RBAC estático */
(function () {
  const policySrc = readFileSync(join(root, 'app/modules/CrozzoPermisosPolicy.js'), 'utf8');
  const sandbox = { window: {}, global: {}, console, localStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); } } };
  sandbox.global = sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(policySrc, sandbox);
  const P = sandbox.CrozzoPermisosPolicy;
  report.security.staticRbac = [
    { test: 'caja editar_orden', ok: P.ROLE_PERM_PRESETS.caja.caja.includes('editar_orden') },
    { test: 'caja facturar', ok: P.ROLE_PERM_PRESETS.caja.caja.includes('facturar') },
    { test: 'caja sin catalogo', ok: !P.ROLE_PERM_PRESETS.caja.productos.includes('catalogo') },
    { test: 'caja preset sin eliminar_item', ok: !P.ROLE_PERM_PRESETS.caja.caja.includes('eliminar_item') },
    { test: 'mesero vista_tablets', ok: P.ROLE_PERM_PRESETS.mesero.caja.includes('vista_tablets') },
    { test: 'mesero sin facturar', ok: !P.ROLE_PERM_PRESETS.mesero.caja.includes('facturar') },
  ];
  for (const t of report.security.staticRbac) {
    if (!t.ok && t.test.includes('eliminar_item')) issue('P2', 'RBAC preset', 'Preset caja incluye eliminar_item', 'CrozzoPermisosPolicy.js ROLE_PERM_PRESETS.caja');
  }
})();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const pageErrors = [];
page.on('pageerror', (e) => {
  const msg = String(e?.message || e);
  if (!/Clipboard|ResizeObserver|Script error|Failed to fetch|supabase|Tauri/i.test(msg)) pageErrors.push(msg);
});

await page.addInitScript(() => {
  localStorage.setItem('crozzo_perfil_empresa', 'basico_restaurante');
  localStorage.setItem('crozzo_active_client_id', 'default');
  localStorage.setItem(
    'crozzo_menu_profiles',
    JSON.stringify({
      v: 2,
      clients: {
        default: { id: 'default', nombre: 'QA Restaurante', perfil: 'basico_restaurante', tema: 'bona-origen', menus: null, roles: {}, rolePerms: {} },
      },
    })
  );
  localStorage.setItem(
    'pos_dian_config',
    JSON.stringify({
      seguridad: { requiereLogin: false },
      operacion: { modo: 'demo', demoSubmodo: 'pos' },
      salon: { mesaCount: 10, llevarCount: 5, mesaEtiquetaTablet: 'solo_numero', llevarEtiquetaTablet: 'solo_numero', mesaNombres: {}, llevarNombres: {} },
      productos: [
        { id: 1, nombre: 'Bandeja Paisa', precio: 28000, categoria: 'Platos', stock: 50, activo: true },
        { id: 2, nombre: 'Ajiaco', precio: 25000, categoria: 'Platos', stock: 50, activo: true },
        { id: 3, nombre: 'Cerveza', precio: 12000, categoria: 'Bebidas', stock: 100, activo: true },
        { id: 4, nombre: 'Agua', precio: 3000, categoria: 'Bebidas', stock: 200, activo: true },
        { id: 5, nombre: 'Postre', precio: 8000, categoria: 'Postres', stock: 30, activo: true },
      ],
    })
  );
  window.__CROZZO_IS_TAURI__ = true;
  window.__TAURI__ = window.__TAURI__ || { core: { invoke: () => Promise.resolve({ ok: true }) } };
  window.confirm = () => true;
});

const bootT0 = Date.now();
await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(6000);
report.performance.bootMs = Date.now() - bootT0;

const setup = await page.evaluate(async () => {
  const log = [];
  try {
    document.body.classList.add('super-admin-active');
    const lo = document.getElementById('loginOverlay');
    if (lo) lo.setAttribute('hidden', '');
    document.body.classList.remove('crozzo-login-open');
    if (typeof applyPerfil === 'function') applyPerfil('basico_restaurante', false);
    if (typeof CrozzoPermisosPolicy !== 'undefined' && CrozzoPermisosPolicy.syncClientRolePerms) {
      const raw = localStorage.getItem('crozzo_menu_profiles');
      const mp = raw ? JSON.parse(raw) : { v: 2, clients: {} };
      const c = mp.clients?.default || { id: 'default', perfil: 'basico_restaurante' };
      CrozzoPermisosPolicy.syncClientRolePerms(c);
      mp.clients = mp.clients || {};
      mp.clients.default = c;
      localStorage.setItem('crozzo_menu_profiles', JSON.stringify(mp));
    }
    if (typeof loginWithCredentials === 'function') {
      const lr = await loginWithCredentials('KENNY', '141414');
      log.push('login KENNY: ' + (lr?.ok ? 'ok' : lr?.error));
    }
    const plantillas = ['caja', 'mesero', 'cocina', 'jefe_compras', 'admin_negocio'];
    const staff = plantillas.map((pid) => {
      const tpl = window.CROZZO_STAFF_PLANTILLAS?.[pid] || {};
      const id = 'QA-' + String(tpl.rol || pid).toUpperCase().replace(/-/g, '_');
      const row = {
        id,
        nombre: 'QA ' + (tpl.label || pid),
        rol: tpl.rol || pid,
        clave: 'test1234',
        activo: true,
        permisos: tpl.permisos || {},
      };
      if (typeof crozzoSanitizeUserPermisos === 'function') row.permisos = crozzoSanitizeUserPermisos(row.permisos, row.rol);
      return row;
    });
    const uc = typeof getUsuariosConfig === 'function' ? getUsuariosConfig() : { staff: [] };
    uc.staff = (uc.staff || []).filter((s) => !String(s.id).startsWith('QA-')).concat(staff);
    if (typeof config !== 'undefined' && config.set) config.set('usuarios', uc);
    if (typeof applySalonSlotsToRuntime === 'function') applySalonSlotsToRuntime({ silent: true });
    if (typeof applyAccessControl === 'function') applyAccessControl();
    if (typeof renderMenusByRole === 'function') renderMenusByRole();
    return {
      ok: true,
      log,
      perfil: typeof crozzoGetPerfilEmpresa === 'function' ? crozzoGetPerfilEmpresa() : null,
      mesas: (window.mesasCaja || []).length,
      llevar: (window.llevarCaja || []).length,
      user: typeof getCurrentUser === 'function' ? getCurrentUser()?.id : null,
    };
  } catch (e) {
    return { ok: false, err: String(e.message), log };
  }
});
report.phases.setup = setup;
execLog('boot+setup', setup.ok, JSON.stringify(setup));

async function loginAs(staffId) {
  return page.evaluate(async (id) => {
    if (typeof loginWithCredentials !== 'function') return { ok: false, err: 'no login' };
    const r = await loginWithCredentials(id, 'test1234');
    if (typeof applyAccessControl === 'function') applyAccessControl();
    if (typeof renderMenusByRole === 'function') renderMenusByRole();
    const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    return { ok: !!r?.ok, user: u?.id, rol: u?.rol, err: r?.error };
  }, staffId);
}

/** SALON tests */
async function testSalon(mesaCount, llevarCount, label) {
  await loginAs('QA-ADMIN');
  const r = await page.evaluate(({ mesaCount, llevarCount }) => {
    saveSalonConfig({ mesaCount, llevarCount, mesaEtiquetaTablet: 'solo_numero', llevarEtiquetaTablet: 'solo_numero', mesaNombres: {}, llevarNombres: {} });
    applySalonSlotsToRuntime({ silent: true });
    const cfg = getSalonConfig();
    return {
      mesaCount: cfg.mesaCount,
      llevarCount: cfg.llevarCount,
      mesasRuntime: (window.mesasCaja || []).length,
      mesasBuilt: typeof buildSalonSlotList === 'function' ? buildSalonSlotList('mesa').length : 0,
      llevarRuntime: (window.llevarCaja || []).length,
      llevarBuilt: typeof buildSalonSlotList === 'function' ? buildSalonSlotList('llevar').length : 0,
      firstMesa: (typeof buildSalonSlotList === 'function' ? buildSalonSlotList('mesa') : [])[0]?.id,
      lastMesa: (typeof buildSalonSlotList === 'function' ? buildSalonSlotList('mesa') : []).slice(-1)[0]?.id,
      ok:
        cfg.mesaCount === mesaCount &&
        cfg.llevarCount === llevarCount &&
        (typeof buildSalonSlotList === 'function' ? buildSalonSlotList('mesa').length : 0) === mesaCount,
    };
  }, { mesaCount, llevarCount });
  report.scenarios[label] = r;
  execLog(`salon ${label}`, r.ok, `${r.mesasBuilt} mesas built, cfg ${r.mesaCount}`);
  return r;
}

report.salon.limits = await page.evaluate(() => {
  const t = (m, l) => {
    saveSalonConfig({ mesaCount: m, llevarCount: l, mesaEtiquetaTablet: 'solo_numero', llevarEtiquetaTablet: 'solo_numero', mesaNombres: {}, llevarNombres: {} });
    const c = getSalonConfig();
    return { in: { m, l }, out: { m: c.mesaCount, l: c.llevarCount } };
  };
  return { t1: t(1, 1), t99_30: t(99, 30), t100_50: t(100, 50), t0: t(0, 0), maxCombined: 99 + 30 };
});

await testSalon(3, 2, 'peno_3m_2l');
await testSalon(10, 5, 'mediano_10m_5l');
await testSalon(50, 15, 'grande_50m_15l');
await testSalon(10, 5, 'restore');
await page.evaluate(() => {
  saveSalonConfig({ mesaCount: 10, llevarCount: 5, mesaEtiquetaTablet: 'solo_numero', llevarEtiquetaTablet: 'solo_numero', mesaNombres: {}, llevarNombres: {} });
  applySalonSlotsToRuntime({ silent: true });
});

/** ACL bloqueadas — como admin negocio basico */
await loginAs('QA-ADMIN');
const acl = await page.evaluate(() => {
  const u = getCurrentUser();
  const blocked = ['venta-comercial', 'control-acceso', 'planilla-2026', 'gestion-perfiles-menus', 'super-admin-nube'];
  return blocked.map((pg) => ({
    page: pg,
    inPlan: crozzoPageInBasicoClientPlan(pg),
    canAccess: crozzoUserCanAccessOperationalPage(pg, u),
    canSee: currentUserCanSeePage(pg),
  }));
});
report.phases.blockedPages = acl;
for (const row of acl) {
  if (row.canAccess && row.page === 'control-acceso') issue('P2', 'ACL', 'Admin básico puede acceder control-acceso vía permiso marcacion', JSON.stringify(row));
  if (row.canAccess && row.page !== 'control-acceso') issue('P1', 'ACL', `Página bloqueada accesible: ${row.page}`, JSON.stringify(row));
}

/** Navegación admin */
const OP_PAGES = ['inicio-operacion', 'cajero', 'tablets', 'comandas', 'cocina', 'facturas', 'cierre-caja', 'productos', 'config-salon', 'admin', 'inventarios'];
report.phases.navigation = [];
for (const pg of OP_PAGES) {
  const errsBefore = pageErrors.length;
  const t0 = Date.now();
  await page.evaluate((p) => navigateTo(p), pg);
  await page.waitForTimeout(2200);
  const st = await page.evaluate((p) => {
    const mc = document.getElementById('mainContent');
    const txt = mc?.innerText || '';
    return { page: p, currentPage: window.currentPage, mainLen: mc?.innerHTML?.length || 0, hasError: /No se pudo cargar/i.test(txt), sample: txt.slice(0, 100).replace(/\s+/g, ' ') };
  }, pg);
  const ok = st.mainLen > 200 && !st.hasError && pageErrors.length === errsBefore;
  report.phases.navigation.push({ ...st, ms: Date.now() - t0, ok, errors: pageErrors.slice(errsBefore) });
  if (!ok) issue('P1', 'Navegación', `Pantalla ${pg} no cargó bien`, JSON.stringify(st));
}

/** Flujo POS comanda (sesión con permisos POS completos) */
await page.evaluate(async () => {
  if (typeof loginWithCredentials === 'function') await loginWithCredentials('KENNY', '141414');
  if (typeof applyAccessControl === 'function') applyAccessControl();
});
await page.evaluate(() => {
  saveSalonConfig({ mesaCount: 10, llevarCount: 5, mesaEtiquetaTablet: 'solo_numero', llevarEtiquetaTablet: 'solo_numero', mesaNombres: {}, llevarNombres: {} });
  applySalonSlotsToRuntime({ silent: true });
  if (typeof tipoServicioCaja !== 'undefined') window.tipoServicioCaja = 'mesa';
});
await page.evaluate(() => navigateTo('cajero'));
await page.waitForTimeout(2500);
report.flows.posComanda = await page.evaluate(async () => {
  const steps = [];
  try {
    if (typeof setCajaMode === 'function') setCajaMode('mesa');
    steps.push({ step: 'setCajaMode mesa', ok: window.tipoServicioCaja === 'mesa', mode: window.tipoServicioCaja });
    if (typeof selectMesa === 'function') selectMesa('M2');
    steps.push({ step: 'selectMesa M2', ok: window.mesaSeleccionada === 'M2', mesa: window.mesaSeleccionada, orderOpen: window.cajaMesaOrderOpen });
    const prods = window.products || (typeof config !== 'undefined' && config.get ? config.get('productos') : []) || [];
    const p = prods[0];
    if (p && typeof addToCart === 'function') {
      addToCart(p.id, 2);
      const cart = typeof getActiveCart === 'function' ? getActiveCart() : [];
      steps.push({ step: 'addToCart x2', ok: cart.length > 0, items: cart.length, productCount: prods.length });
    } else {
      steps.push({ step: 'addToCart', ok: false, productCount: prods.length });
    }
    const before = (window.comandas || []).length;
    if (typeof comandarDesdeCaja === 'function') comandarDesdeCaja();
    await new Promise((r) => setTimeout(r, 800));
    steps.push({ step: 'comandarDesdeCaja', ok: (window.comandas || []).length > before, comandas: (window.comandas || []).length });
    steps.push({ step: 'slotState', ...(typeof getSlotStateInfo === 'function' ? getSlotStateInfo('mesa', 'M2') : {}) });
  } catch (e) {
    steps.push({ step: 'error', ok: false, err: String(e.message) });
  }
  return steps;
});
const comandaOk = report.flows.posComanda.some((s) => s.step === 'comandarDesdeCaja' && s.ok);
execLog('flujo POS→comanda', comandaOk, JSON.stringify(report.flows.posComanda));

/** Cocina */
await loginAs('QA-COCINA');
await page.evaluate(() => navigateTo('cocina'));
await page.waitForTimeout(2000);
report.flows.cocina = await page.evaluate(() => {
  const mc = document.getElementById('mainContent');
  return { mainLen: mc?.innerHTML?.length || 0, hasListo: /LISTO/i.test(mc?.innerText || ''), comandas: (window.comandas || []).length };
});

/** Cierre */
await loginAs('QA-ADMIN');
await page.evaluate(() => navigateTo('cierre-caja'));
await page.waitForTimeout(2500);
report.flows.cierre = await page.evaluate(() => {
  const mc = document.getElementById('mainContent');
  const txt = mc?.innerText || '';
  return { mainLen: mc?.innerHTML?.length || 0, hasTurno: /turno|mañana|tarde|arqueo|cierre/i.test(txt), hasError: /No se pudo cargar/i.test(txt) };
});
if (!report.flows.cierre.hasTurno) issue('P1', 'Cierre', 'Pantalla cierre sin contenido de turno', JSON.stringify(report.flows.cierre));

/** Roles */
const ROLE_TESTS = [
  { id: 'QA-CAJA', rol: 'caja', mustNav: ['cajero'], mustNotNav: ['admin', 'cierre-caja'], perms: { facturar: true, eliminar_item: false, cierre_arqueo: false } },
  { id: 'QA-MESERO', rol: 'mesero', mustNav: ['tablets'], mustNotNav: ['cajero', 'cierre-caja', 'admin'], perms: { facturar: false, vista_tablets: true } },
  { id: 'QA-COCINA', rol: 'cocina', mustNav: ['compras-cortes', 'compras-recetario-cocina', 'comandas'], mustNotNav: ['cajero', 'cierre-caja', 'cocina'], perms: {} },
  { id: 'QA-JEFE_COMPRAS', rol: 'inventario', mustNav: ['productos'], mustNotNav: ['cajero', 'cierre-caja'], perms: {} },
  { id: 'QA-ADMIN', rol: 'admin', mustNav: ['admin', 'config-salon'], mustNotNav: [], perms: {} },
];

for (const rt of ROLE_TESTS) {
  const lr = await loginAs(rt.id);
  await page.waitForTimeout(500);
  const audit = await page.evaluate(({ mustNav, mustNotNav }) => {
    const nav = [...document.querySelectorAll('.nav-item[data-page]')]
      .filter((el) => !el.classList.contains('crozzo-nav-acl-hidden'))
      .map((el) => el.getAttribute('data-page'));
    const can = (p) => (typeof currentUserCanSeePage === 'function' ? currentUserCanSeePage(p) : false);
    return {
      nav,
      navCount: nav.length,
      canCierre: can('cierre-caja'),
      canAdmin: can('admin'),
      canCajero: can('cajero'),
      canTablets: can('tablets'),
      canCocina: can('cocina'),
      canProductos: can('productos'),
      canConfigSalon: can('config-salon'),
      perm: {
        facturar: crozzoHasCajaPermiso('facturar'),
        eliminar_item: crozzoHasCajaPermiso('eliminar_item'),
        vista_tablets: crozzoHasCajaPermiso('vista_tablets'),
        cierre_arqueo: crozzoHasCajaPermiso('cierre_arqueo'),
      },
      missingMust: mustNav.filter((p) => !can(p)),
      forbiddenVisible: mustNotNav.filter((p) => can(p)),
    };
  }, rt);
  const issues = [...audit.missingMust.map((p) => `Sin acceso: ${p}`), ...audit.forbiddenVisible.map((p) => `Acceso indebido: ${p}`)];
  if (rt.perms.facturar === false && audit.perm.facturar) issues.push('Tiene facturar');
  if (rt.perms.facturar === true && !audit.perm.facturar) issues.push('Sin facturar');
  if (rt.perms.eliminar_item === false && audit.perm.eliminar_item) issues.push('Tiene eliminar_item');
  if (rt.perms.vista_tablets === true && !audit.perm.vista_tablets) issues.push('Sin vista_tablets');
  if (rt.perms.cierre_arqueo === false && audit.perm.cierre_arqueo) issues.push('Tiene cierre_arqueo sin delegar');
  if (rt.perms.cierre_arqueo === true && !audit.perm.cierre_arqueo) issues.push('Sin cierre_arqueo');
  report.roles[rt.rol] = { login: lr, ...audit, issues, ok: issues.length === 0 && lr.ok };
  if (issues.length) issue('P1', `Rol ${rt.rol}`, issues.join('; '), JSON.stringify(audit.nav));
  execLog(`rol ${rt.rol}`, report.roles[rt.rol].ok, issues.join('; ') || 'ok');
}

/** Onboarding */
await loginAs('QA-ADMIN');
report.phases.onboarding = await page.evaluate(() => {
  if (typeof CrozzoOnboardingOperativo === 'undefined') return [];
  return (CrozzoOnboardingOperativo.STEPS || []).map((s) => ({
    id: s.id,
    page: s.page,
    optional: !!s.optional,
    inPlan: typeof crozzoPageInBasicoClientPlan === 'function' ? crozzoPageInBasicoClientPlan(s.page) : null,
    canSee: typeof currentUserCanSeePage === 'function' ? currentUserCanSeePage(s.page) : null,
  }));
});
for (const s of report.phases.onboarding) {
  if (s.page && s.inPlan === false && !s.optional) issue('P1', 'Onboarding', `Paso ${s.id} → ${s.page} fuera del plan básico`, s.id);
}

report.pageErrors = [...new Set(pageErrors)].slice(0, 15);
const navOk = report.phases.navigation.filter((n) => n.ok).length;
const navTotal = report.phases.navigation.length;
const rolesOk = Object.values(report.roles).filter((r) => r.ok).length;
const salonOk = ['peno_3m_2l', 'mediano_10m_5l', 'grande_50m_15l'].every((k) => report.scenarios[k]?.ok);
const p0 = report.issues.filter((i) => i.severity === 'P0').length;
const p1 = report.issues.filter((i) => i.severity === 'P1').length;
report.metrics = {
  navOk,
  navTotal,
  navPct: Math.round((navOk / navTotal) * 100),
  rolesOk: `${rolesOk}/${ROLE_TESTS.length}`,
  salonScenariosOk: salonOk,
  bootMs: report.performance.bootMs,
  comandaFlowOk: comandaOk,
  issuesP0: p0,
  issuesP1: p1,
  issuesTotal: report.issues.length,
  scoreOverall: Math.min(
    100,
    Math.round(
      (navOk / navTotal) * 30 +
        (rolesOk / ROLE_TESTS.length) * 25 +
        (salonOk ? 15 : 0) +
        (comandaOk ? 15 : 0) +
        (report.flows.cierre?.hasTurno ? 10 : 0) +
        Math.max(0, 5 - p0 * 3 - p1 * 0.5)
    )
  ),
};

await browser.close();
server.close();
const outPath = join(outDir, 'plan-basico-audit-exec.json');
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log('Reporte:', outPath);
console.log('Score:', report.metrics.scoreOverall, '/ 100');
console.log('Nav:', navOk + '/' + navTotal, `(${report.metrics.navPct}%)`);
console.log('Roles:', report.metrics.rolesOk);
console.log('Salon:', salonOk ? 'OK' : 'FAIL');
console.log('Comanda:', comandaOk ? 'OK' : 'FAIL');
console.log('Issues:', report.issues.length);
process.exit(p0 > 0 || navOk < navTotal * 0.8 ? 1 : 0);
