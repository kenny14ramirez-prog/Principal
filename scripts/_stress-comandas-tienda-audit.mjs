/**
 * Stress comandas (100) + auditoría plan básico tienda
 * node scripts/_stress-comandas-tienda-audit.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const srcRoot = join(root, 'src');
const outDir = join(root, 'scripts', '_qa-out');
mkdirSync(outDir, { recursive: true });

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
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

const report = { generatedAt: new Date().toISOString(), stress: {}, tienda: {}, issues: [] };
function issue(sev, area, title, detail) {
  report.issues.push({ severity: sev, area, title, detail });
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e?.message || e)));

await page.addInitScript(() => {
  localStorage.setItem('crozzo_perfil_empresa', 'basico_restaurante');
  localStorage.setItem(
    'pos_dian_config',
    JSON.stringify({
      seguridad: { requiereLogin: false },
      operacion: { modo: 'demo', demoSubmodo: 'pos' },
      productos: [{ id: 1, nombre: 'Test', precio: 10000, categoria: 'X', stock: 50, activo: true }],
    })
  );
  window.__CROZZO_IS_TAURI__ = true;
  window.confirm = () => true;
});

await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(5000);

/** Stress 100 comandas */
const stress = await page.evaluate(async () => {
  const t0 = performance.now();
  const areas = typeof getComandasConfig === 'function' ? getComandasConfig().areas : [{ id: 'cocina', nombre: 'Cocina' }];
  const areaId = areas[0]?.id || 'cocina';
  const base = Date.now();
  const batch = [];
  for (let i = 0; i < 100; i++) {
    batch.push({
      id: 90000 + i,
      areaId,
      tipoServicio: i % 3 === 0 ? 'llevar' : 'mesa',
      referencia: i % 3 === 0 ? 'L' + ((i % 10) + 1) : 'M' + ((i % 20) + 1),
      estado: 'pendiente',
      createdAt: new Date(base - i * 60000).toISOString(),
      items: [{ id: 1, nombre: 'Plato ' + i, cantidad: 1 + (i % 3), precio: 15000 }],
      envioNum: 1,
    });
  }
  window.comandas = batch;
  const tGen = performance.now();
  let htmlLen = 0;
  let renderMs = 0;
  if (typeof crozzoRenderComandasMasonryHtml === 'function') {
    const tR = performance.now();
    const html = crozzoRenderComandasMasonryHtml([areaId]);
    renderMs = performance.now() - tR;
    htmlLen = html?.length || 0;
  } else if (typeof renderComandasPage === 'function') {
    const tR = performance.now();
    renderComandasPage();
    renderMs = performance.now() - tR;
    htmlLen = document.getElementById('comandaCards')?.innerHTML?.length || document.getElementById('mainContent')?.innerHTML?.length || 0;
  }
  const tNav = performance.now();
  if (typeof navigateTo === 'function') navigateTo('comandas');
  await new Promise((r) => setTimeout(r, 300));
  const afterNavLen = document.getElementById('comandaCards')?.innerHTML?.length || document.getElementById('mainContent')?.innerHTML?.length || 0;
  const navMs = performance.now() - tNav;
  const heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) : null;
  const stickyCount = document.querySelectorAll('.crozzo-sticky-note, .comanda-card, [data-comanda-id]').length;
  return {
    count: batch.length,
    genMs: Math.round(tGen - t0),
    renderMs: Math.round(renderMs),
    navMs: Math.round(navMs),
    htmlLen,
    afterNavLen,
    stickyCount,
    heapMb: heap,
    totalMs: Math.round(performance.now() - t0),
    domNodes: document.querySelectorAll('*').length,
  };
});
report.stress = stress;
if (stress.renderMs > 3000 || stress.navMs > 5000) issue('P1', 'Stress', 'Render 100 comandas lento', JSON.stringify(stress));
if (stress.stickyCount < 50 && stress.count === 100) issue('P2', 'Stress', 'Pocas notas visibles con 100 comandas', `sticky=${stress.stickyCount}`);
if (stress.heapMb > 200) issue('P2', 'Stress', 'Heap alto tras 100 comandas', `${stress.heapMb} MB`);

/** Tienda audit */
await page.evaluate(() => {
  if (typeof applyPerfil === 'function') applyPerfil('basico_tienda', false);
});
await page.waitForTimeout(800);

const tienda = await page.evaluate(async () => {
  const plantillas = ['caja', 'admin_negocio'];
  const staff = plantillas.map((pid) => {
    const tpl = window.CROZZO_STAFF_PLANTILLAS?.[pid] || {};
    const id = 'QA-TIENDA-' + String(tpl.rol || pid).toUpperCase();
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
  uc.staff = (uc.staff || []).filter((s) => !String(s.id).startsWith('QA-TIENDA-')).concat(staff);
  if (typeof config !== 'undefined' && config.set) config.set('usuarios', uc);
  if (typeof applyAccessControl === 'function') applyAccessControl();
  if (typeof renderMenusByRole === 'function') renderMenusByRole();

  async function loginAs(staffId) {
    if (typeof loginWithCredentials !== 'function') return { ok: false };
    return loginWithCredentials(staffId, 'test1234');
  }

  const perfil = typeof crozzoGetPerfilEmpresa === 'function' ? crozzoGetPerfilEmpresa() : null;
  const blockedRestaurant = ['comandas', 'tablets', 'cocina', 'compras-cortes'].map((p) => ({
    page: p,
    blocked: typeof crozzoPageBlockedByBasicoPerfilTipo === 'function' ? crozzoPageBlockedByBasicoPerfilTipo(p) : null,
    inPlan: typeof crozzoPageInBasicoClientPlan === 'function' ? crozzoPageInBasicoClientPlan(p) : null,
  }));

  const roles = {};
  for (const rt of [
    { id: 'QA-TIENDA-CAJA', rol: 'caja', must: ['venta-comercial'], mustNot: ['cajero', 'comandas', 'tablets'] },
    { id: 'QA-TIENDA-ADMIN', rol: 'admin', must: ['venta-comercial', 'admin'], mustNot: ['comandas'] },
  ]) {
    const lr = await loginAs(rt.id);
    if (typeof applyAccessControl === 'function') applyAccessControl();
    const can = (p) => (typeof currentUserCanSeePage === 'function' ? currentUserCanSeePage(p) : false);
    const nav = [...document.querySelectorAll('.nav-item[data-page]')]
      .filter((el) => !el.classList.contains('crozzo-nav-acl-hidden'))
      .map((el) => el.getAttribute('data-page'));
    roles[rt.rol] = {
      login: lr,
      nav,
      missing: rt.must.filter((p) => !can(p)),
      forbidden: rt.mustNot.filter((p) => can(p)),
    };
  }
  return { perfil, blockedRestaurant, roles };
});
report.tienda = tienda;
for (const [rol, data] of Object.entries(tienda.roles || {})) {
  if (data.missing?.length) issue('P1', 'Tienda', `Rol ${rol} sin acceso`, data.missing.join(', '));
  if (data.forbidden?.length) issue('P1', 'Tienda', `Rol ${rol} acceso indebido`, data.forbidden.join(', '));
}
for (const b of tienda.blockedRestaurant || []) {
  if (b.inPlan && !b.blocked) issue('P2', 'Tienda', `Página restaurante visible en plan tienda: ${b.page}`, JSON.stringify(b));
}

report.pageErrors = [...new Set(pageErrors)].slice(0, 10);
await browser.close();
server.close();

const outPath = join(outDir, 'stress-comandas-tienda-audit.json');
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log('Reporte:', outPath);
console.log('Stress 100 comandas:', JSON.stringify(report.stress));
console.log('Tienda roles:', JSON.stringify(report.tienda.roles));
console.log('Issues:', report.issues.length);
for (const i of report.issues) console.log(`  [${i.severity}] ${i.area}: ${i.title} — ${i.detail}`);
