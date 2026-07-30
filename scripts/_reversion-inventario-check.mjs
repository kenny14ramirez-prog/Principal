#!/usr/bin/env node
/**
 * Verificación — REVERSIÓN DE INVENTARIO AL ANULAR (H2.B)
 * --------------------------------------------------------------------------
 * Verifica que anular una factura restaura el stock descontado + deja auditoría.
 * Cierra el agujero fiscal/contable donde el stock quedaba descontado para siempre.
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

console.log('↩️  Reversión inventario — verificación H2.B\n');

const R = loadModule('app/modules/CrozzoReversionInventario.js', 'CrozzoReversionInventario');

// ── 1. Candado de permisos ────────────────────────────────────────────────
// Simular admin
const ctx1 = { console, getCurrentUser: () => ({ rol: 'admin' }), isSuperAdminUser: () => false };
ctx1.window = ctx1; ctx1.globalThis = ctx1;
vm.createContext(ctx1);
vm.runInContext(readFileSync(join(root, 'app/modules/CrozzoReversionInventario.js'), 'utf8'), ctx1);
assert(ctx1.CrozzoReversionInventario.puedeAnular() === true, 'Admin: puede anular');

// Simular cajero (NO puede)
const ctx2 = { console, getCurrentUser: () => ({ rol: 'caja' }), isSuperAdminUser: () => false };
ctx2.window = ctx2; ctx2.globalThis = ctx2;
vm.createContext(ctx2);
vm.runInContext(readFileSync(join(root, 'app/modules/CrozzoReversionInventario.js'), 'utf8'), ctx2);
assert(ctx2.CrozzoReversionInventario.puedeAnular() === false, 'Cajero: NO puede anular (candado)');

// Super admin siempre puede
const ctx3 = { console, getCurrentUser: () => ({ rol: 'mesero' }), isSuperAdminUser: () => true };
ctx3.window = ctx3; ctx3.globalThis = ctx3;
vm.createContext(ctx3);
vm.runInContext(readFileSync(join(root, 'app/modules/CrozzoReversionInventario.js'), 'utf8'), ctx3);
assert(ctx3.CrozzoReversionInventario.puedeAnular() === true, 'Super admin: puede anular');

// ── 2. Reversión de venta retail (catálogo POS) ───────────────────────────
const productos = [
  { id: 1, nombre: 'Gaseosa', stock: 8 },   // quedaban 8 tras venta de 2
  { id: 2, nombre: 'Empanada', stock: 18 }  // quedaban 18 tras venta de 2
];
const persistCalls = [];
const ctx4 = {
  console,
  getCurrentUser: () => ({ rol: 'admin' }),
  isSuperAdminUser: () => false,
  crozzoGetProductos: () => productos,
  persistCatalogProductosLocal: () => { persistCalls.push('local'); },
  persistCatalogProductos: (id) => { persistCalls.push('pid:' + id); },
  crozzoGetCurrentUserLabel: () => 'Admin Demo'
};
ctx4.window = ctx4; ctx4.globalThis = ctx4;
vm.createContext(ctx4);
vm.runInContext(readFileSync(join(root, 'app/modules/CrozzoReversionInventario.js'), 'utf8'), ctx4);
const Rev = ctx4.CrozzoReversionInventario;

const factura = {
  uuid: 'fact-001',
  estado: 'activa',
  items: [
    { id: 1, nombre: 'Gaseosa', cantidad: 2 },
    { id: 2, nombre: 'Empanada', cantidad: 2 }
  ],
  inventarioMeta: {
    version: 1,
    aplicado: true,
    saleUuid: 'fact-001',
    lineas: [
      { id: 1, nombre: 'Gaseosa', cantidad: 2, resultado: 'ok' },
      { id: 2, nombre: 'Empanada', cantidad: 2, resultado: 'ok' }
    ]
  }
};

const r = Rev.revertirVenta(factura, { motivo: 'error de cobro', por: 'Admin Demo' });
assert(r.ok === true, 'Reversión: ok', r.detalle);
assert(r.revertidas === 2, 'Reversión: 2 líneas revertidas', '$' + r.revertidas);
assert(productos[0].stock === 10, 'Stock Gaseosa restaurado: 8 + 2 = 10', '$' + productos[0].stock);
assert(productos[1].stock === 20, 'Stock Empanada restaurado: 18 + 2 = 20', '$' + productos[1].stock);
assert(persistCalls.length > 0, 'Reversión: persistió catálogo');
assert(r.movimientos.length === 2, 'Reversión: 2 movimientos de auditoría');
assert(r.movimientos[0].tipo === 'entrada_devolucion', 'Movimiento tipo: entrada_devolucion');

// ── 3. Factura marcada como anulada ───────────────────────────────────────
assert(factura.estado === 'anulada', 'Factura: estado anulada');
assert(factura.anulada === true, 'Factura: flag anulada true');
assert(factura.anuladaAt !== undefined, 'Factura: timestamp anuladaAt');
assert(factura.anuladaPor === 'Admin Demo', 'Factura: anuladaPor registrado');
assert(factura.inventarioRevertido === true, 'Factura: inventarioRevertido flag');

// ── 4. Idempotencia (no revertir dos veces) ───────────────────────────────
const r2 = Rev.revertirVenta(factura, { motivo: 'segundo intento' });
assert(r2.ok === true && r2.detalle.includes('ya anulada'), 'Idempotencia: no revierte dos veces');

// ── 5. Sin inventario aplicado (restaurante sin receta) ───────────────────
const facturaSinInv = { uuid: 'f2', estado: 'activa', items: [], inventarioMeta: { aplicado: false } };
const r3 = Rev.revertirVenta(facturaSinInv, {});
assert(r3.ok === true && r3.detalle.includes('Sin inventario'), 'Sin inventario aplicado: ok sin revertir');
assert(facturaSinInv.estado === 'anulada' && facturaSinInv.anulada === true, 'Sin inventario: factura igual queda anulada');
assert(facturaSinInv.inventarioRevertido === false, 'Sin inventario: inventarioRevertido false');

// ── 6. Movimientos tienen trazabilidad completa ───────────────────────────
const mov = r.movimientos[0];
assert(mov.productId === 1 && mov.cantidad === 2, 'Movimiento: productId + cantidad');
assert(mov.facturaId === 'fact-001', 'Movimiento: facturaId');
assert(mov.motivo === 'error de cobro', 'Movimiento: motivo registrado');
assert(mov.timestamp && mov.por, 'Movimiento: timestamp + por (auditoría)');
assert(mov.stockAntes === 8 && mov.stockDespues === 10, 'Movimiento: stock antes/después (trazabilidad)');

// ── 7. anularFactura vía window.config (lookup + save) ─────────────────────
let saved = false;
const facturaCfg = {
  uuid: 'f-cfg-1',
  estado: 'pos',
  items: [{ id: 9, nombre: 'Agua', cantidad: 1 }],
  inventarioMeta: {
    aplicado: true,
    lineas: [{ id: 9, nombre: 'Agua', cantidad: 1, resultado: 'ok' }]
  }
};
const productosCfg = [{ id: 9, nombre: 'Agua', stock: 3 }];
const ctxCfg = {
  console,
  getCurrentUser: () => ({ rol: 'encargado' }),
  isSuperAdminUser: () => false,
  crozzoGetCurrentUserLabel: () => 'Encargado',
  crozzoGetProductos: () => productosCfg,
  persistCatalogProductosLocal: () => {},
  config: {
    getFacturas: () => [facturaCfg],
    save: () => { saved = true; }
  }
};
ctxCfg.window = ctxCfg;
ctxCfg.globalThis = ctxCfg;
vm.createContext(ctxCfg);
vm.runInContext(readFileSync(join(root, 'app/modules/CrozzoReversionInventario.js'), 'utf8'), ctxCfg);
const rCfg = ctxCfg.CrozzoReversionInventario.anularFactura('f-cfg-1', { motivo: 'duplicado', por: 'Encargado' });
assert(rCfg.ok === true, 'anularFactura(config): ok');
assert(facturaCfg.estado === 'anulada', 'anularFactura(config): estado anulada');
assert(productosCfg[0].stock === 4, 'anularFactura(config): stock +1');
assert(saved === true, 'anularFactura(config): llama config.save');

// ── Reporte ───────────────────────────────────────────────────────────────
console.log('');
for (const x of results) console.log((x.ok ? '  ✓ ' : '  ✗ ') + x.name + (x.detail ? ' — ' + x.detail : ''));
console.log('');
if (failed === 0) {
  console.log('✅ REVERSIÓN INVENTARIO: PASS — anular restaura stock + deja auditoría.');
  process.exit(0);
} else {
  console.log(`❌ REVERSIÓN INVENTARIO: FAIL — ${failed} verificación(es) fallaron.`);
  process.exit(1);
}
