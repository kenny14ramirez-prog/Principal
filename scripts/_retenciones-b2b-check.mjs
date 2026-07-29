#!/usr/bin/env node
/**
 * Verificación — RETENCIONES B2B (H1.4)
 * --------------------------------------------------------------------------
 * Verifica motor de retenciones (ReteFuente/IVA/ICA) para B2B a agente retenedor.
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

console.log('🏛️ Retenciones B2B — verificación H1.4\n');

const R = loadModule('app/modules/CrozzoRetenciones.js', 'CrozzoRetenciones');

// ── 1. Solo Roble+ o gran contribuyente aplica retención ──────────────────
const cmBrote = { getNivelMadurez: () => 1, getRegimenFiscal: () => 'no_responsable' };
const cmPlanta = { getNivelMadurez: () => 2, getRegimenFiscal: () => 'responsable_iva' };
const cmRoble = { getNivelMadurez: () => 3, getRegimenFiscal: () => 'gran_contribuyente' };

assert(R.aplicaRetencion(cmBrote, { responsableIVA: true }) === false, 'Brote: NO aplica retención');
assert(R.aplicaRetencion(cmPlanta, { responsableIVA: true }) === false, 'Planta responsable: NO aplica (no agente)');
assert(R.aplicaRetencion(cmRoble, { responsableIVA: true }) === true, 'Roble gran contribuyente: SÍ aplica');
// Adquirente no responsable de IVA → no hay IVA que retener
assert(R.aplicaRetencion(cmRoble, { responsableIVA: false }) === false, 'Roble con adquirente no responsable: NO aplica');

// ── 2. Tarifas por concepto ───────────────────────────────────────────────
assert(R.tarifaReteFuente('servicios').tarifa === 0.04, 'ReteFuente servicios: 4%');
assert(R.tarifaReteFuente('honorarios').tarifa === 0.10, 'ReteFuente honorarios: 10%');
assert(R.tarifaReteFuente('compras').tarifa === 0.025, 'ReteFuente compras: 2.5%');
assert(R.tarifaReteFuente('desconocido').tarifa === 0.025, 'ReteFuente default: 2.5%');

// ── 3. ReteICA por municipio DANE ─────────────────────────────────────────
assert(R.tarifaReteICA('11001') === 0.00984, 'ReteICA Bogotá (11001): 9.84x1000');
assert(R.tarifaReteICA('05001') === 0.00800, 'ReteICA Medellín (05001): 8x1000');
assert(R.tarifaReteICA('99999') === 0.00600, 'ReteICA municipio desconocido: default conservador');

// ── 4. Cálculo completo B2B ───────────────────────────────────────────────
// Operación: $1.000.000 base + $190.000 IVA (19%) a gran contribuyente en Bogotá
const r = R.calcular(
  { baseGravable: 1000000, ivaCausado: 190000, concepto: 'compras', codigoDaneMunicipio: '11001' },
  cmRoble,
  { responsableIVA: true }
);
assert(r.aplica === true, 'B2B Roble: aplica retención');
assert(r.retefuente === 25000, 'ReteFuente 2.5% s/1M = $25000', '$' + r.retefuente);
assert(r.reteiva === 28500, 'ReteIVA 15% s/190000 = $28500', '$' + r.reteiva);
assert(r.reteica === 9840, 'ReteICA 9.84x1000 s/1M = $9840', '$' + r.reteica);
assert(r.totalRetenido === r.retefuente + r.reteiva + r.reteica, 'Total retenido = suma');

// ── 5. No aplica en niveles bajos ─────────────────────────────────────────
const rBrote = R.calcular({ baseGravable: 1000000, ivaCausado: 190000 }, cmBrote, {});
assert(rBrote.aplica === false && rBrote.totalRetenido === 0, 'Brote: 0 retención');

// ── 6. WithholdingTaxTotal en UBL ─────────────────────────────────────────
const dianSrc = readFileSync(join(root, 'app/core/pos/CrozzoPosDianLib.js'), 'utf8');
assert(dianSrc.includes('WithholdingTaxTotal'), 'buildUBL21: incluye WithholdingTaxTotal');
assert(dianSrc.includes('ReteFuente'), 'buildUBL21: TaxScheme ReteFuente');
assert(dianSrc.includes('ReteIVA'), 'buildUBL21: TaxScheme ReteIVA');
assert(dianSrc.includes('ReteICA'), 'buildUBL21: TaxScheme ReteICA');

// ── Reporte ───────────────────────────────────────────────────────────────
console.log('');
for (const x of results) console.log((x.ok ? '  ✓ ' : '  ✗ ') + x.name + (x.detail ? ' — ' + x.detail : ''));
console.log('');
if (failed === 0) {
  console.log('✅ RETENCIONES B2B: PASS — Roble+ retiene correctamente por municipio DANE.');
  process.exit(0);
} else {
  console.log(`❌ RETENCIONES B2B: FAIL — ${failed} verificación(es) fallaron.`);
  process.exit(1);
}
