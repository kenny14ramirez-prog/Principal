#!/usr/bin/env node
/**
 * Verificación — RAMPA DE MADUREZ (H1.0c)
 * --------------------------------------------------------------------------
 * Simula el ciclo de vida completo de un comerciante que crece de Semilla (0)
 * a Cadena (4), verificando que la rampa funcione end-to-end:
 *
 *   Puesto empanadas (0) → saca RUT → Brote (1) → crece + DIAN → Planta (2)
 *   → declarado gran contribuyente → Roble (3) → abre 2da sede → Cadena (4)
 *
 * Valida: requisitos de graduación, coherencia régimen, no-skip-de-nivel,
 * registro de requisitos completados, mark/marcarRequisito.
 */
import { readFileSync } from 'node:fs';
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

console.log('🚀 Rampa de madurez 0→4 — verificación H1.0c\n');

const Niveles = loadModule('app/modules/CrozzoNivelesMadurez.js', 'CrozzoNivelesMadurez');

// Simulador de comerciante
function nuevoComerciante() {
  return {
    getNivelMadurez() { return this.config.madurez.nivel; },
    getRegimenFiscal() { return this.config.madurez.regimenFiscal; },
    save() { this._saved = true; },
    config: {
      madurez: {
        nivel: 0,
        regimenFiscal: 'no_responsable',
        nivelSugerido: null,
        requisitosCompletados: {
          rutCargado: false,
          resolucionDian: false,
          certificadoCargado: false,
          habilitacionDian: false
        }
      }
    }
  };
}

// ── FASE 1: Puesto de empanadas en Semilla (Nivel 0) ──────────────────────
let cm = nuevoComerciante();
assert(Niveles.getNivelActivo(cm).id === 0, 'Fase 1: comerciante arranca en Semilla (0)');
assert(Niveles.getNivelActivo(cm).puedeFacturarLegal === false, 'Fase 1: no puede facturar legal (sandbox)');

// Intenta saltar a Planta sin requisitos → bloqueado
const skip = Niveles.subirNivel(cm, 2);
assert(skip.ok === false, 'Fase 1: no puede saltar a Planta sin requisitos', skip.motivo);

// ── FASE 2: Saca RUT → sube a Brote (Nivel 1) ─────────────────────────────
Niveles.marcarRequisito(cm, 'rutCargado', true);
assert(cm.config.madurez.requisitosCompletados.rutCargado === true, 'Fase 2: RUT marcado completado');

const r1 = Niveles.subirNivel(cm, 1);
assert(r1.ok === true, 'Fase 2: sube a Brote con RUT');
assert(cm.config.madurez.nivel === 1, 'Fase 2: nivel actualizado a 1');
assert(cm.config.madurez.fechaCambioNivel !== null, 'Fase 2: fecha de cambio registrada');

// En Brote puede emitir tiquete, no retenciones
assert(Niveles.puede(cm, 'tiquete_electronico') === true, 'Fase 2: Brote habilita tiquete electrónico');
assert(Niveles.bloqueado(cm, 'retenciones') === true, 'Fase 2: Brote bloquea retenciones');

// ── FASE 3: Crece, habilita DIAN → sube a Planta (Nivel 2) ────────────────
Niveles.marcarRequisito(cm, 'resolucionDian', true);
Niveles.marcarRequisito(cm, 'certificadoCargado', true);
Niveles.marcarRequisito(cm, 'habilitacionDian', true);

const requisitosPlanta = Niveles.requisitosParaSubir(cm, 2);
assert(requisitosPlanta.ok === true, 'Fase 3: requisitos Planta completos');

// Antes de subir, ajustar régimen a responsable_iva (Planta lo exige)
cm.config.madurez.regimenFiscal = 'responsable_iva';
const r2 = Niveles.subirNivel(cm, 2);
assert(r2.ok === true, 'Fase 3: sube a Planta');
assert(cm.config.madurez.nivel === 2, 'Fase 3: nivel actualizado a 2');

// Planta habilita IVA por SKU + INC + saludables
assert(Niveles.puede(cm, 'iva_por_sku') === true, 'Fase 3: Planta habilita iva_por_sku');
assert(Niveles.puede(cm, 'inc_restaurante') === true, 'Fase 3: Planta habilita inc_restaurante');
assert(Niveles.puede(cm, 'impuestos_saludables') === true, 'Fase 3: Planta habilita impuestos_saludables');
assert(Niveles.puede(cm, 'nota_credito_debito') === true, 'Fase 3: Planta habilita nota_credito_debito');

// ── FASE 4: Declarado gran contribuyente → sube a Roble (Nivel 3) ─────────
cm.config.madurez.regimenFiscal = 'gran_contribuyente';
const r3 = Niveles.subirNivel(cm, 3);
assert(r3.ok === true, 'Fase 4: sube a Roble');
assert(cm.config.madurez.nivel === 3, 'Fase 4: nivel actualizado a 3');

// Roble habilita retenciones B2B
assert(Niveles.puede(cm, 'retenciones_b2b') === true, 'Fase 4: Roble habilita retenciones_b2b');
assert(Niveles.puede(cm, 'retefuente') === true, 'Fase 4: Roble habilita retefuente');
assert(Niveles.puede(cm, 'reteica_municipal') === true, 'Fase 4: Roble habilita reteica_municipal');

// ── FASE 5: Abre 2da sede → sube a Cadena (Nivel 4) ───────────────────────
const r4 = Niveles.subirNivel(cm, 4);
assert(r4.ok === true, 'Fase 5: sube a Cadena');
assert(cm.config.madurez.nivel === 4, 'Fase 5: nivel actualizado a 4');
assert(Niveles.puede(cm, 'consolidacion_multi_sede') === true, 'Fase 5: Cadena habilita consolidación multi-sede');

// ── FASE 6: No puede subir más (máximo) ───────────────────────────────────
const r5 = Niveles.subirNivel(cm, 5);
assert(r5.ok === false, 'Fase 6: no existe nivel 5 (máximo es Cadena)');

// ── FASE 7: Regresión — cierre de sede, baja a Roble ──────────────────────
const r6 = Niveles.bajarNivel(cm, 3);
assert(r6.ok === true, 'Fase 7: baja a Roble por cierre sede');
assert(cm.config.madurez.nivel === 3, 'Fase 7: nivel bajado a 3');

// ── FASE 8: Baja a Semilla (cierra negocio, vuelve a capacitación) ────────
const r7 = Niveles.bajarNivel(cm, 0);
assert(r7.ok === true, 'Fase 8: baja a Semilla (reinicia)');
assert(cm.config.madurez.regimenFiscal === 'no_responsable', 'Fase 8: Semilla limpia régimen');

// ── Reporte ───────────────────────────────────────────────────────────────
console.log('');
for (const r of results) {
  console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.detail ? ' — ' + r.detail : ''));
}
console.log('');
if (failed === 0) {
  console.log('✅ RAMPA DE MADUREZ: PASS — ciclo 0→4→0 funciona end-to-end.');
  console.log('   El comerciante puede crecer de puesto de empanadas a cadena multi-sede.');
  process.exit(0);
} else {
  console.log(`❌ RAMPA DE MADUREZ: FAIL — ${failed} verificación(es) fallaron.`);
  process.exit(1);
}
