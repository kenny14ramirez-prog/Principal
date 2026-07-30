#!/usr/bin/env node
/**
 * Verificación — Página Rentabilidad UI (H2.C pantalla)
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const results = [];
function ok(n, d) { results.push({ ok: true, name: n, detail: d }); }
function fail(n, d) { results.push({ ok: false, name: n, detail: d }); failed++; }
function assert(c, n, d) { c ? ok(n, d) : fail(n, d); }

console.log('📊 Página Rentabilidad — verificación UI\n');

const productos = [
  { id: 1, nombre: 'Bandeja', precio: 28000, costoUnitario: 9500 },
  { id: 2, nombre: 'Gaseosa', precio: 4500, costoUnitario: 1800 },
  { id: 3, nombre: 'Plato flojo', precio: 10000, costoUnitario: 6000 }
];
const facturas = [
  {
    uuid: 'f1',
    fechaEmision: new Date().toISOString(),
    total: 32500,
    items: [
      { id: 1, nombre: 'Bandeja', cantidad: 1, precio: 28000 },
      { id: 2, nombre: 'Gaseosa', cantidad: 1, precio: 4500 }
    ]
  },
  {
    uuid: 'f2',
    fechaEmision: new Date().toISOString(),
    total: 10000,
    items: [{ id: 3, nombre: 'Plato flojo', cantidad: 1, precio: 10000 }]
  }
];

const ctx = {
  console,
  crozzoGetProductos: () => productos,
  getCurrentUser: () => ({ rol: 'admin' }),
  isSuperAdminUser: () => false,
  config: { getFacturas: () => facturas },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  document: {
    body: { classList: { add() {} } },
    getElementById: () => null,
    querySelectorAll: () => []
  }
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(join(root, 'app/modules/CrozzoRentabilidad.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/modules/CrozzoSemaforoMargen.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/modules/CrozzoRentabilidadPage.js'), 'utf8'), ctx);
const P = ctx.CrozzoRentabilidadPage;

assert(!!P && typeof P.renderPage === 'function', 'Módulo CrozzoRentabilidadPage cargado');
assert(P.puedeVer() === true, 'Admin: puedeVer true');

const ctxCaja = {
  console,
  getCurrentUser: () => ({ rol: 'caja' }),
  isSuperAdminUser: () => false,
  config: { getFacturas: () => [] },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  document: { body: { classList: { add() {} } }, getElementById: () => null, querySelectorAll: () => [] }
};
ctxCaja.window = ctxCaja;
ctxCaja.globalThis = ctxCaja;
vm.createContext(ctxCaja);
vm.runInContext(readFileSync(join(root, 'app/modules/CrozzoRentabilidad.js'), 'utf8'), ctxCaja);
vm.runInContext(readFileSync(join(root, 'app/modules/CrozzoSemaforoMargen.js'), 'utf8'), ctxCaja);
vm.runInContext(readFileSync(join(root, 'app/modules/CrozzoRentabilidadPage.js'), 'utf8'), ctxCaja);
assert(ctxCaja.CrozzoRentabilidadPage.puedeVer() === false, 'Caja: puedeVer false');

const html = P.renderPage();
assert(html.indexOf('crozzo-rent-page') >= 0, 'HTML: root crozzo-rent-page');
assert(html.indexOf('Rentabilidad') >= 0, 'HTML: título');
assert(html.indexOf('data-rent-rango') >= 0, 'HTML: toggle Hoy/7d');
assert(html.indexOf('Ingresos') >= 0, 'HTML: KPI Ingresos');
assert(html.indexOf('Mejores platos') >= 0, 'HTML: top platos');

const model = P._buildModel();
assert(model.agg.numFacturas === 2, 'Modelo: 2 facturas hoy', String(model.agg.numFacturas));
assert(model.sem && model.sem.emoji, 'Modelo: semáforo presente', model.sem.emoji);
assert(Array.isArray(model.top) && model.top.length > 0, 'Modelo: top platos');

P.setRango('7d');
const m7 = P._buildModel();
assert(m7.agg.numFacturas === 2, 'Modelo 7d: mismas ventas recientes');

// Cableado index
const index = readFileSync(join(root, 'app/index.html'), 'utf8');
assert(index.indexOf('CrozzoRentabilidadPage.js') >= 0, 'index.html: script página');
assert(index.indexOf('data-page="rentabilidad"') >= 0, 'index.html: nav item');

const posMain = readFileSync(join(root, 'app/core/CrozzoPosMain.js'), 'utf8');
assert(posMain.indexOf("case 'rentabilidad'") >= 0, 'PosMain: case rentabilidad');
assert(posMain.indexOf("'rentabilidad': 'rentabilidad'") >= 0 || posMain.indexOf('rentabilidad: \'rentabilidad\'') >= 0 || /['"]rentabilidad['"]\s*:\s*['"]rentabilidad['"]/.test(posMain), 'PosMain: PAGE_MENU_MAP');

console.log('');
for (const x of results) console.log((x.ok ? '  ✓ ' : '  ✗ ') + x.name + (x.detail ? ' — ' + x.detail : ''));
console.log('');
if (failed === 0) {
  console.log('✅ PÁGINA RENTABILIDAD: PASS');
  process.exit(0);
}
console.log(`❌ PÁGINA RENTABILIDAD: FAIL — ${failed}`);
process.exit(1);
