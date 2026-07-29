#!/usr/bin/env node
/**
 * Verificación — IMPUESTOS SALUDABLES Ley 2277/2022 (H1.1)
 * --------------------------------------------------------------------------
 * Verifica el motor multi-impuesto (IVA + INC + Saludables por separado):
 *  - Una gaseosa paga IVA + Saludable (no se mezclan).
 *  - Respeto del nivel de madurez (Semilla/Brote no causan; Planta+ sí).
 *  - Simple no traslada IVA pero sí causa Saludables.
 *  - Tarifas bebidas azucaradas $/L por rango de azúcar.
 *  - Ultraprocesados 20% ad valorem.
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

console.log('🥤 Impuestos Saludables Ley 2277/2022 — verificación H1.1\n');

const M = loadModule('app/modules/CrozzoMotorImpuestos.js', 'CrozzoMotorImpuestos');
assert(M && typeof M.calcularCarrito === 'function', 'Motor cargado');

function cfg(nivel, regimen, perfil) {
  return {
    getNivelMadurez: () => nivel,
    getRegimenFiscal: () => regimen,
    config: { impuestos: { perfilFiscal: perfil || 'restaurante', impuestoAlConsumo: { aplica: true, tarifa: 0.08 }, tarifasIVA: [{ rate: 0.19 }] } }
  };
}

// ── 1. Caso mixto canónico (cerveza + gaseosa + empanada) ─────────────────
const items = M.casoMixtoCanonico();
assert(items.length === 3, 'Caso canónico: 3 items');

const rPlanta = M.calcularCarrito(items, cfg(2, 'responsable_iva'));
assert(rPlanta.iva > 0, 'Planta responsable: IVA > 0', '$' + rPlanta.iva);
assert(rPlanta.inc > 0, 'Planta restaurante: INC > 0', '$' + rPlanta.inc);
assert(rPlanta.saludable > 0, 'Planta: Saludables > 0', '$' + rPlanta.saludable);
assert(rPlanta.totalImpuestos === rPlanta.iva + rPlanta.inc + rPlanta.saludable, 'Consistencia: total = suma');

// La gaseosa debe pagar IVA + Saludable (no mezclados)
const gaseosa = rPlanta.lineas[1];
assert(gaseosa.iva > 0 && gaseosa.saludable > 0, 'Gaseosa: IVA + Saludable separados (no mezclados)');
assert(gaseosa.iva + gaseosa.saludable > gaseosa.iva, 'Gaseosa: Saludable adicional al IVA');

// ── 2. Respeto del nivel de madurez ───────────────────────────────────────
const r0 = M.calcularCarrito(items, cfg(0, 'no_responsable'));
assert(r0.totalImpuestos === 0, 'Nivel 0 (Semilla): cero impuestos');

const r1 = M.calcularCarrito(items, cfg(1, 'no_responsable', 'comercio'));
assert(r1.totalImpuestos === 0, 'Nivel 1 (Brote): cero impuestos');

const r2 = M.calcularCarrito(items, cfg(2, 'responsable_iva'));
assert(r2.totalImpuestos > 0, 'Nivel 2 (Planta): impuestos aplican');

// ── 3. Simple no traslada IVA pero sí causa Saludables ────────────────────
const rSimple = M.calcularCarrito(items, cfg(2, 'simple'));
assert(rSimple.iva === 0, 'Simple: no traslada IVA', '$' + rSimple.iva);
assert(rSimple.saludable > 0, 'Simple: sí causa Saludables', '$' + rSimple.saludable);

// ── 4. Bebidas azucaradas: tarifa $/L por rango de azúcar ────────────────
const bebidaBajaAzucar = [{ nombre: 'Té bajo', precio: 3000, cantidad: 1, ivaRate: 0.19, saludableTipo: 'bebida_azucarada', saludableAzucarGr: 1, saludableVolumenMl: 500 }];
const bebidaAltaAzucar = [{ nombre: 'Cola', precio: 3500, cantidad: 1, ivaRate: 0.19, saludableTipo: 'bebida_azucarada', saludableAzucarGr: 11, saludableVolumenMl: 350 }];
const rBaja = M.calcularCarrito(bebidaBajaAzucar, cfg(2, 'responsable_iva', 'comercio'));
const rAlta = M.calcularCarrito(bebidaAltaAzucar, cfg(2, 'responsable_iva', 'comercio'));
assert(rBaja.saludable === 0, 'Bebida baja azúcar (<2g/100mL): exenta saludable');
assert(rAlta.saludable > 0, 'Bebida alta azúcar (11g/100mL): causa saludable', '$' + rAlta.saludable);

// ── 5. Ultraprocesados: 20% ad valorem ───────────────────────────────────
const ultraprocesado = [{ nombre: 'Galletas', precio: 5000, cantidad: 2, ivaRate: 0.19, saludableTipo: 'ultraprocesado' }];
const rUltra = M.calcularCarrito(ultraprocesado, cfg(2, 'responsable_iva', 'comercio'));
// 5000*2 = 10000 bruto → 20% = 2000 saludable
assert(rUltra.saludable === 2000, 'Ultraprocesado: 20% ad valorem', '$' + rUltra.saludable + ' (esperado $2000)');

// ── 6. Inferencia por categoría ───────────────────────────────────────────
const snackInferido = [{ nombre: 'Snack', precio: 4000, cantidad: 1, ivaRate: 0.19, categoria: 'snacks-empacados' }];
const rInferido = M.calcularCarrito(snackInferido, cfg(2, 'responsable_iva', 'comercio'));
assert(rInferido.saludable > 0, 'Snack por categoría inferida: causa saludable', '$' + rInferido.saludable);

// ── 7. Tarifas cargables (tabla JSON existe) ──────────────────────────────
const tarifas = M.cargarTarifas();
assert(tarifas.bebidasAzucaradas.rangos.length >= 3, 'Tabla bebidas: al menos 3 rangos');
assert(tarifas.ultraprocesados.tarifa === 0.20, 'Tabla ultraprocesados: 20%');

// ── Reporte ───────────────────────────────────────────────────────────────
console.log('');
for (const r of results) console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.detail ? ' — ' + r.detail : ''));
console.log('');
if (failed === 0) {
  console.log('✅ IMPUESTOS SALUDABLES: PASS — motor multi-impuesto respeta Ley 2277/2022 + niveles madurez.');
  process.exit(0);
} else {
  console.log(`❌ IMPUESTOS SALUDABLES: FAIL — ${failed} verificación(es) fallaron.`);
  process.exit(1);
}
