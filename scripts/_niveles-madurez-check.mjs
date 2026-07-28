#!/usr/bin/env node
/**
 * Verificación — NIVELES DE MADUREZ (H1.0c)
 * --------------------------------------------------------------------------
 * Verifica que las reglas de habilitación/bloqueo por nivel sean coherentes:
 *  - Nivel 0 NO puede facturar legal, bloquea timbrado/cufe/dian.
 *  - Nivel 1 NO puede retener ni factura con IVA (solo tiquete).
 *  - Nivel 2 habilita IVA por SKU, INC, saludables, nota crédito.
 *  - Nivel 3 habilita retenciones B2B.
 *  - Nivel 4 habilita consolidación multi-sede.
 *  - subirNivel respeta requisitos (graduación).
 *  - bajarNivel funciona con confirmación.
 *
 * Carga los módulos en contexto controlado (sin DOM) y simula.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const results = [];

function ok(name, detail) { results.push({ ok: true, name, detail }); }
function fail(name, detail) { results.push({ ok: false, name, detail }); failed++; }
function assert(cond, name, detail) { cond ? ok(name, detail) : fail(name, detail); }

function loadModule(rel, globalKey) {
  const src = readFileSync(join(root, rel), 'utf8');
  const ctx = {};
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx[globalKey];
}

console.log('🌿 Niveles de madurez — verificación H1.0c\n');

const Niveles = loadModule('app/modules/CrozzoNivelesMadurez.js', 'CrozzoNivelesMadurez');

// ── 1. Estructura de los 5 niveles ────────────────────────────────────────
assert(Niveles.NIVELES.length === 5, '5 niveles definidos');
const keys = Niveles.NIVELES.map(n => n.key);
assert(keys.join(',') === 'semilla,brote,planta,roble,cadena', 'Orden niveles: semilla→cadena');

// ── 2. Reglas de facturación legal por nivel ──────────────────────────────
assert(Niveles.getNivel(0).puedeFacturarLegal === false, 'Nivel 0: NO puede facturar legal');
for (let i = 1; i <= 4; i++) {
  assert(Niveles.getNivel(i).puedeFacturarLegal === true, `Nivel ${i}: sí puede facturar legal`);
}

// ── 3. Capabilities bloqueadas en Nivel 0 ─────────────────────────────────
const cmNivel0 = { getNivelMadurez: () => 0, getRegimenFiscal: () => 'no_responsable' };
assert(Niveles.bloqueado(cmNivel0, 'timbrado_dian') === true, 'Nivel 0: bloquea timbrado_dian');
assert(Niveles.bloqueado(cmNivel0, 'cufe') === true, 'Nivel 0: bloquea cufe');
assert(Niveles.bloqueado(cmNivel0, 'factura_electronica') === true, 'Nivel 0: bloquea factura_electronica');
assert(Niveles.puede(cmNivel0, 'sandbox_dataset') === true, 'Nivel 0: habilita sandbox_dataset');

// ── 4. Nivel 1 (Brote): tiquete sí, retenciones no ────────────────────────
const cmNivel1 = { getNivelMadurez: () => 1, getRegimenFiscal: () => 'no_responsable', config: { madurez: { requisitosCompletados: {} } } };
assert(Niveles.puede(cmNivel1, 'tiquete_electronico') === true, 'Nivel 1: habilita tiquete_electronico');
assert(Niveles.bloqueado(cmNivel1, 'retenciones') === true, 'Nivel 1: bloquea retenciones');
assert(Niveles.puede(cmNivel1, 'iva_por_sku') === false, 'Nivel 1: NO habilita iva_por_sku (requiere Planta)');

// ── 5. Nivel 2 (Planta): IVA por SKU, INC, saludables, nota crédito ───────
const cmNivel2 = { getNivelMadurez: () => 2, getRegimenFiscal: () => 'responsable_iva', config: { madurez: { requisitosCompletados: {} } } };
assert(Niveles.puede(cmNivel2, 'iva_por_sku') === true, 'Nivel 2: habilita iva_por_sku');
assert(Niveles.puede(cmNivel2, 'inc_restaurante') === true, 'Nivel 2: habilita inc_restaurante');
assert(Niveles.puede(cmNivel2, 'impuestos_saludables') === true, 'Nivel 2: habilita impuestos_saludables');
assert(Niveles.puede(cmNivel2, 'nota_credito_debito') === true, 'Nivel 2: habilita nota_credito_debito');
assert(Niveles.bloqueado(cmNivel2, 'retenciones') === true, 'Nivel 2: bloquea retenciones (aún no agente)');

// ── 6. Nivel 3 (Roble): retenciones B2B ───────────────────────────────────
const cmNivel3 = { getNivelMadurez: () => 3, getRegimenFiscal: () => 'gran_contribuyente', config: { madurez: { requisitosCompletados: {} } } };
assert(Niveles.puede(cmNivel3, 'retenciones_b2b') === true, 'Nivel 3: habilita retenciones_b2b');
assert(Niveles.puede(cmNivel3, 'reteica_municipal') === true, 'Nivel 3: habilita reteica_municipal');

// ── 7. Nivel 4 (Cadena): consolidación multi-sede ─────────────────────────
const cmNivel4 = { getNivelMadurez: () => 4, getRegimenFiscal: () => 'gran_contribuyente', config: { madurez: { requisitosCompletados: {} } } };
assert(Niveles.puede(cmNivel4, 'consolidacion_multi_sede') === true, 'Nivel 4: habilita consolidacion_multi_sede');

// ── 8. subirNivel respeta requisitos (graduación) ─────────────────────────
const cmSinReq = {
  getNivelMadurez: () => 0,
  getRegimenFiscal: () => 'no_responsable',
  config: { madurez: { requisitosCompletados: { rutCargado: false } } },
  save: () => {}
};
const r1 = Niveles.subirNivel(cmSinReq, 1);
assert(r1.ok === false, 'subirNivel a Brote sin RUT: bloqueado', r1.motivo);

const cmConRut = {
  getNivelMadurez: () => 0,
  getRegimenFiscal: () => 'no_responsable',
  config: { madurez: { requisitosCompletados: { rutCargado: true } } },
  save: () => {}
};
const r2 = Niveles.subirNivel(cmConRut, 1);
assert(r2.ok === true, 'subirNivel a Brote con RUT: permitido');
assert(cmConRut.config.madurez.nivel === 1, 'subirNivel: actualiza nivel a 1');

// Subir a Planta requiere más (resolución + certificado + habilitación)
const r3 = Niveles.subirNivel(cmConRut, 2);
assert(r3.ok === false, 'subirNivel a Planta sin requisitos completos: bloqueado', r3.motivo);

// ── 9. subirNivel no permite bajar (debe usar bajarNivel) ─────────────────
const cmNivel2b = { getNivelMadurez: () => 2, getRegimenFiscal: () => 'responsable_iva', config: { madurez: { requisitosCompletados: {} } }, save: () => {} };
const r4 = Niveles.subirNivel(cmNivel2b, 1);
assert(r4.ok === false, 'subirNivel a nivel menor: bloqueado (usar bajarNivel)');

// ── 10. bajarNivel funciona ───────────────────────────────────────────────
const r5 = Niveles.bajarNivel(cmNivel2b, 1);
assert(r5.ok === true, 'bajarNivel de Planta a Brote: permitido');

// Bajar a Semilla (0) limpia régimen
const cmNivel1b = { getNivelMadurez: () => 1, getRegimenFiscal: () => 'no_responsable', config: { madurez: { requisitosCompletados: {}, nivelSugerido: 2 } }, save: () => {} };
const r6 = Niveles.bajarNivel(cmNivel1b, 0);
assert(r6.ok === true, 'bajarNivel a Semilla: permitido');
assert(cmNivel1b.config.madurez.regimenFiscal === 'no_responsable', 'bajarNivel a Semilla: limpia régimen');
assert(cmNivel1b.config.madurez.nivelSugerido === null, 'bajarNivel a Semilla: limpia sugerencia');

// ── 11. resumen legible para UI ───────────────────────────────────────────
const resumen = Niveles.resumen(cmNivel2);
assert(resumen.nivel === 2 && resumen.key === 'planta', 'resumen: nivel correcto');
assert(resumen.icon === '🌳', 'resumen: icono presente');
assert(typeof resumen.nombre === 'string' && resumen.nombre.length > 0, 'resumen: nombre presente');
assert(resumen.puedeFacturarLegal === true, 'resumen: puedeFacturarLegal correcto');

// ── Reporte ───────────────────────────────────────────────────────────────
console.log('');
for (const r of results) {
  console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.detail ? ' — ' + r.detail : ''));
}
console.log('');
if (failed === 0) {
  console.log('✅ NIVELES DE MADUREZ: PASS — reglas de habilitación/bloqueo coherentes.');
  process.exit(0);
} else {
  console.log(`❌ NIVELES DE MADUREZ: FAIL — ${failed} verificación(es) fallaron.`);
  process.exit(1);
}
