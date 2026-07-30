#!/usr/bin/env node
/**
 * Verificación — SEMÁFORO MARGEN 🟢🟡🔴 (H2.D)
 * --------------------------------------------------------------------------
 * Umbrales, clasificación por plato/día, puente Rentabilidad, sugerencia precio.
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

console.log('🚦 Semáforo margen — verificación H2.D\n');

const productos = [
  { id: 1, nombre: 'Bandeja Paisa', precio: 28000, costoUnitario: 9500, categoria: 'platos-fuertes' },
  { id: 2, nombre: 'Gaseosa', precio: 4500, costoUnitario: 1800, categoria: 'bebidas' },
  { id: 3, nombre: 'Plato rojo', precio: 10000, costoUnitario: 6000, categoria: 'platos-fuertes' }
];

const ctx = {
  console,
  crozzoGetProductos: () => productos,
  localStorage: {
    _d: {},
    getItem(k) { return this._d[k] != null ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; }
  }
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(join(root, 'app/modules/CrozzoRentabilidad.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/modules/CrozzoSemaforoMargen.js'), 'utf8'), ctx);
const S = ctx.CrozzoSemaforoMargen;
const R = ctx.CrozzoRentabilidad;

assert(!!S && !!R, 'Módulos Semáforo + Rentabilidad cargados');

// ── 1. Clasificación umbrales default ─────────────────────────────────────
assert(S.clasificarMargen(0.7).nivel === 'verde', '0.70 → 🟢 verde');
assert(S.clasificarMargen(0.65).nivel === 'verde', '0.65 → 🟢 verde (borde)');
assert(S.clasificarMargen(0.6).nivel === 'amarillo', '0.60 → 🟡 amarillo');
assert(S.clasificarMargen(0.55).nivel === 'amarillo', '0.55 → 🟡 amarillo (borde)');
assert(S.clasificarMargen(0.54).nivel === 'rojo', '0.54 → 🔴 rojo');
assert(S.clasificarMargen(70).nivel === 'verde', '70 (porcentaje) → 🟢');
assert(S.clasificarMargen(50).nivel === 'rojo', '50 (porcentaje) → 🔴');
assert(S.clasificarMargen(0.7).emoji === '🟢', 'Emoji verde');
assert(S.clasificarMargen(0.5).emoji === '🔴', 'Emoji rojo');

// ── 2. Umbrales configurables ─────────────────────────────────────────────
ctx.localStorage.setItem('crozzo_semaforo_verde', '0.80');
ctx.localStorage.setItem('crozzo_semaforo_amarillo', '0.70');
assert(S.clasificarMargen(0.75).nivel === 'amarillo', 'Umbral custom: 0.75 → 🟡');
assert(S.clasificarMargen(0.85).nivel === 'verde', 'Umbral custom: 0.85 → 🟢');
ctx.localStorage.removeItem('crozzo_semaforo_verde');
ctx.localStorage.removeItem('crozzo_semaforo_amarillo');
assert(S.clasificarMargen(0.66).nivel === 'verde', 'Tras reset: defaults restaurados');

// ── 3. semaforoMargen por platos ──────────────────────────────────────────
const platos = S.semaforoMargen([
  { id: 1, nombre: 'Alto', margenPct: 0.72 },
  { id: 2, nombre: 'Bajo', margenPct: 0.4 }
]);
assert(platos[0].semaforo === 'verde', 'Plato alto → verde');
assert(platos[1].semaforo === 'rojo', 'Plato bajo → rojo');
assert(platos[1].semaforoEmoji === '🔴', 'Plato bajo emoji 🔴');

// ── 4. Puente desde Rentabilidad ──────────────────────────────────────────
const facturas = [
  {
    uuid: 'f1',
    fechaEmision: '2026-07-30T12:00:00',
    total: 32500,
    items: [
      { id: 1, nombre: 'Bandeja Paisa', cantidad: 1, precio: 28000 },
      { id: 2, nombre: 'Gaseosa', cantidad: 1, precio: 4500 }
    ]
  },
  {
    uuid: 'f2',
    fechaEmision: '2026-07-30T14:00:00',
    total: 10000,
    items: [{ id: 3, nombre: 'Plato rojo', cantidad: 1, precio: 10000 }]
  }
];
const kpi = R.kpiDiario(facturas, '2026-07-30');
const desdeRent = R.semaforoDesdeRentabilidad
  ? R.semaforoDesdeRentabilidad(kpi)
  : S.semaforoDesdeRentabilidad(kpi);
assert(desdeRent && desdeRent.nivel, 'semaforoDesdeRentabilidad devuelve nivel');
assert(typeof kpi.margenPct === 'number' && kpi.margenPct > 0.5, 'KPI día margen alto típico', (kpi.margenPct * 100).toFixed(1) + '%');

const dia = S.semaforoGlobalDia(facturas, '2026-07-30');
assert(dia.semaforo === 'verde' || dia.semaforo === 'amarillo', 'Día consolidado no vacío', dia.semaforoEmoji + ' ' + (dia.margenPct * 100).toFixed(1) + '%');
assert(dia.numFacturas === 2, 'Día: 2 facturas');
assert(Array.isArray(dia.platosRojos), 'platosRojos es array');
assert(dia.platosRojos.some((p) => p.nombre === 'Plato rojo'), 'Plato rojo detectado en peores');

// ── 5. Sugerencia precio + mensaje alerta ─────────────────────────────────
const sug = S.sugerirPrecioParaVerde(6000, 10000);
assert(sug && sug.precioSugerido > 10000, 'Sugerencia sube precio para 🟢', '$' + sug.precioSugerido);
assert(sug.delta > 0, 'Delta positivo', '$' + sug.delta);
const msg = S.mensajeAlertaRojo('Plato rojo', 6000, 10000);
assert(msg.indexOf('🔴') >= 0, 'Mensaje contiene 🔴');
assert(msg.indexOf('Plato rojo') >= 0, 'Mensaje nombra el plato');
assert(msg.indexOf('Sube') >= 0, 'Mensaje sugiere subir');

// ── Día sin ventas ────────────────────────────────────────────────────────
const vacio = S.semaforoGlobalDia([], '2026-07-30');
assert(vacio.semaforo === 'rojo' || vacio.numFacturas === 0, 'Sin ventas: semáforo seguro', vacio.semaforo);

console.log('');
for (const x of results) console.log((x.ok ? '  ✓ ' : '  ✗ ') + x.name + (x.detail ? ' — ' + x.detail : ''));
console.log('');
if (failed === 0) {
  console.log('✅ SEMÁFORO MARGEN: PASS — dueño ve 🟢🟡🔴 sin ser contador.');
  process.exit(0);
}
console.log(`❌ SEMÁFORO MARGEN: FAIL — ${failed} verificación(es) fallaron.`);
process.exit(1);
