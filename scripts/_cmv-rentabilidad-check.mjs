#!/usr/bin/env node
/**
 * Verificación — CMV + RENTABILIDAD (H2.C)
 * --------------------------------------------------------------------------
 * Verifica que el círculo del costeo se cierra: cada factura calcula CMV,
 * y los reportes de rentabilidad funcionan por período/categoría/plato.
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
function loadModule(rel, globalKey) {
  const src = readFileSync(join(root, rel), 'utf8');
  const ctx = { console };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx[globalKey];
}

console.log('💰 CMV + Rentabilidad — verificación H2.C\n');

const productos = [
  { id: 1, nombre: 'Bandeja Paisa', precio: 28000, costoUnitario: 9500, categoria: 'platos-fuertes' },
  { id: 2, nombre: 'Gaseosa', precio: 4500, costoUnitario: 1800, categoria: 'bebidas' },
  { id: 3, nombre: 'Empanada', precio: 2000, costoUnitario: 800, categoria: 'entradas' }
];

const ctx = { console, crozzoGetProductos: () => productos };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(join(root, 'app/modules/CrozzoRentabilidad.js'), 'utf8'), ctx);
const R = ctx.CrozzoRentabilidad;

// ── 1. CMV por factura ────────────────────────────────────────────────────
const factura = {
  uuid: 'f1',
  fechaEmision: '2026-07-29T12:00:00',
  total: 28000 + 4500,  // 32500 (1 bandeja + 1 gaseosa)
  items: [
    { id: 1, nombre: 'Bandeja Paisa', cantidad: 1, precio: 28000 },
    { id: 2, nombre: 'Gaseosa', cantidad: 1, precio: 4500 }
  ]
};

const cmv = R.calcularCmvFactura(factura);
// CMV = 9500 (bandeja) + 1800 (gaseosa) = 11300
assert(cmv.cmv === 11300, 'CMV factura: 9500 + 1800 = 11300', '$' + cmv.cmv);
assert(cmv.utilidadBruta === 32500 - 11300, 'Utilidad bruta: 32500 - 11300 = 21200', '$' + cmv.utilidadBruta);
assert(cmv.lineas.length === 2, 'CMV: 2 líneas con costo');
assert(cmv.lineas[0].costoUnitario === 9500, 'Línea bandeja: costo 9500');
assert(cmv.lineas[1].costoUnitario === 1800, 'Línea gaseosa: costo 1800');

// Margen %
const margenEsperado = 21200 / 32500;
assert(Math.abs(cmv.margenPct - margenEsperado) < 0.001, 'Margen %: ' + (margenEsperado * 100).toFixed(1) + '%', (cmv.margenPct * 100).toFixed(1) + '%');

// ── 2. enriquecerFacturaConCmv (muta la factura) ──────────────────────────
R.enriquecerFacturaConCmv(factura);
assert(factura.costoMercanciaVendida === 11300, 'Factura enriquecida: costoMercanciaVendida');
assert(factura.utilidadBruta === 21200, 'Factura enriquecida: utilidadBruta');
assert(typeof factura.margenPct === 'number', 'Factura enriquecida: margenPct');

// ── 3. Rentabilidad por rango (varias facturas) ───────────────────────────
const facturas = [
  factura,
  {
    uuid: 'f2', fechaEmision: '2026-07-29T14:00:00', total: 18000,
    items: [{ id: 1, nombre: 'Bandeja', cantidad: 1, precio: 28000 }],  // descuento aplicado
    costoMercanciaVendida: 9500, utilidadBruta: 8500
  },
  {
    uuid: 'f3', fechaEmision: '2026-07-29T16:00:00', total: 6000,
    items: [{ id: 3, nombre: 'Empanada', cantidad: 3, precio: 2000 }],
    estado: 'anulada'  // anulada no cuenta
  }
];

const rent = R.rentabilidadPor(facturas, '2026-07-29T00:00:00', '2026-07-29T23:59:59');
assert(rent.numFacturas === 2, 'Rentabilidad rango: 2 facturas activas (no anulada)', '$' + rent.numFacturas);
assert(rent.numFacturasAnuladas === 1, 'Rentabilidad rango: 1 anulada excluida');
assert(rent.ingresos === 32500 + 18000, 'Ingresos: 32500 + 18000 = 50500', '$' + rent.ingresos);
assert(rent.cmv === 11300 + 9500, 'CMV: 11300 + 9500 = 20800', '$' + rent.cmv);
assert(rent.utilidad === 21200 + 8500, 'Utilidad: 21200 + 8500 = 29700', '$' + rent.utilidad);

// ── 4. Rentabilidad por categoría ─────────────────────────────────────────
const porCat = R.rentabilidadPorCategoria(facturas, '2026-07-29T00:00:00', '2026-07-29T23:59:59');
assert(porCat.length >= 2, 'Por categoría: al menos 2 categorías');
const bebidas = porCat.find(c => c.categoria === 'bebidas');
assert(bebidas && bebidas.ingresos === 4500, 'Categoría bebidas: ingresos 4500');
const platos = porCat.find(c => c.categoria === 'platos-fuertes');
assert(platos && platos.count === 2, 'Categoría platos-fuertes: 2 unidades vendidas');

// ── 5. Rentabilidad por plato (top/bottom) ────────────────────────────────
const porPlato = R.rentabilidadPorPlato(facturas, '2026-07-29T00:00:00', '2026-07-29T23:59:59', 3, 3);
assert(porPlato.top.length > 0, 'Top platos: al menos 1');
assert(porPlato.bottom.length > 0, 'Bottom platos: al menos 1');
// Bandeja debe estar en top (mayor utilidad)
const bandejaTop = porPlato.top.find(p => p.nombre === 'Bandeja Paisa' || p.nombre === 'Bandeja');
assert(bandejaTop !== undefined, 'Top: Bandeja entre los mejores');

// ── 6. KPI diario ─────────────────────────────────────────────────────────
const kpi = R.kpiDiario(facturas, '2026-07-29');
assert(kpi.fecha === '2026-07-29', 'KPI diario: fecha correcta');
assert(kpi.numFacturas === 2, 'KPI diario: 2 facturas');
assert(kpi.mejorPlato !== null, 'KPI diario: mejor plato identificado');

// ── Reporte ───────────────────────────────────────────────────────────────
console.log('');
for (const x of results) console.log((x.ok ? '  ✓ ' : '  ✗ ') + x.name + (x.detail ? ' — ' + x.detail : ''));
console.log('');
if (failed === 0) {
  console.log('✅ CMV + RENTABILIDAD: PASS — círculo del costeo cerrado. El dueño ve cuánto ganó.');
  process.exit(0);
} else {
  console.log(`❌ CMV + RENTABILIDAD: FAIL — ${failed} verificación(es) fallaron.`);
  process.exit(1);
}
