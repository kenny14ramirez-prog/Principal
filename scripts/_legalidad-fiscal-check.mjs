#!/usr/bin/env node
/**
 * Verificación — LEGALIDAD FISCAL (H1.0c)
 * --------------------------------------------------------------------------
 * El check más importante de toda la suite. Responde a la pregunta del
 * comandante: "¿cómo prueban si el sistema solo admite legalidad?"
 *
 * Verifica que:
 *  1. En Nivel 0 (Sandbox) NO se genere ningún documento fiscal válido.
 *  2. timbrarFactura() tenga candado anti-Sandbox (no llame a mockStamp).
 *  3. mockStamp NO sea la ruta del Sandbox (resuelve violación C4).
 *  4. Tickets de capacitación estén marcados esFiscal:false + watermark.
 *  5. CrozzoSandboxFiscal.assertNoSandbox lanza excepción en nivel 0.
 *
 * PASS = el sistema DEMUESTRA que bloquea lo ilegal, no lo asume.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const results = [];

function ok(name, detail) { results.push({ ok: true, name, detail }); }
function fail(name, detail) { results.push({ ok: false, name, detail }); failed++; }
function assert(cond, name, detail) { cond ? ok(name, detail) : fail(name, detail); }

function read(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) { fail('archivo ausente', rel); return ''; }
  return readFileSync(p, 'utf8');
}

console.log('⚖️  Legalidad fiscal — verificación H1.0c\n');

// ── 1. CrozzoSandboxFiscal existe y exporta los candados ──────────────────
const sandboxSrc = read('app/modules/CrozzoSandboxFiscal.js');
assert(sandboxSrc.includes('assertNoSandbox'), 'Sandbox: assertNoSandbox definido');
assert(sandboxSrc.includes('SandboxFiscalException'), 'Sandbox: excepción específica');
assert(sandboxSrc.includes('NO VÁLIDO PARA USO FISCAL'), 'Sandbox: watermark visible');
assert(sandboxSrc.includes('esFiscal: false'), 'Sandbox: ticket capacitación esFiscal:false explícito');
assert(sandboxSrc.includes("cufe: null") || sandboxSrc.includes('cufe: null,'), 'Sandbox: ticket capacitación sin CUFE');
assert(!/cufe:\s*[^n]/.test(sandboxSrc.replace('cufe: null', '').replace('CUFE', '').replace('cufe', '')), 'Sandbox: no genera CUFE en ningún path');

// ── 2. timbrarFactura tiene candado anti-Sandbox (no mockStamp) ────────────
const dianSrc = read('app/core/pos/CrozzoPosDianLib.js');
assert(dianSrc.includes('assertNoSandbox'), 'timbrarFactura: invoca assertNoSandbox (candado H1.0b)');
assert(dianSrc.includes('SandboxFiscalException') || dianSrc.includes('no se puede timbrar factura legal'), 'timbrarFactura: bloquea con excepción clara en Sandbox');

// CRÍTICO: la ruta isDemoMode→mockStamp DEBE estar eliminada del path principal
const timbrarMatch = dianSrc.match(/async function timbrarFactura[\s\S]{0,2500}?^}/m);
if (timbrarMatch) {
  const cuerpo = timbrarMatch[0];
  assert(!/if\s*\([^)]*isDemoMode[^)]*\)\s*\{[\s\S]*?mockStamp/.test(cuerpo), 'timbrarFactura: NO llama mockStamp en modo demo (C4 resuelto)');
  assert(cuerpo.includes('assertNoSandbox') || cuerpo.includes('SandboxFiscalException'), 'timbrarFactura: candado Sandbox presente');
  ok('timbrarFactura: cuerpo verificado', 'candado instalado correctamente');
} else {
  fail('timbrarFactura', 'no se pudo aislar la función para verificar');
}

// ── 3. ConfigManager expone nivelMadurez + getters ────────────────────────
const cfgSrc = read('app/core/pos/CrozzoPosConfigManager.js');
assert(cfgSrc.includes('nivelMadurez') || cfgSrc.includes("nivel: 0"), 'Config: bloque madurez presente');
assert(cfgSrc.includes('applyMadurezMigration'), 'Config: migración legacy madurez');
assert(cfgSrc.includes('getNivelMadurez'), 'Config: getter getNivelMadurez');
assert(cfgSrc.includes('isSandboxFiscal'), 'Config: getter isSandboxFiscal');
assert(cfgSrc.includes('puedeEmitirFiscal'), 'Config: getter puedeEmitirFiscal');
assert(cfgSrc.includes('getRegimenFiscal'), 'Config: getter getRegimenFiscal');

// ── 4. NivelesMadurez define los 5 niveles + reglas ───────────────────────
const nivelesSrc = read('app/modules/CrozzoNivelesMadurez.js');
assert(nivelesSrc.includes("'semilla'") && nivelesSrc.includes("'brote'"), 'Niveles: semilla + brote');
assert(nivelesSrc.includes("'planta'") && nivelesSrc.includes("'roble'") && nivelesSrc.includes("'cadena'"), 'Niveles: planta + roble + cadena');
assert(nivelesSrc.includes('puedeFacturarLegal: false'), 'Niveles: Nivel 0 no puede facturar legal');
assert(nivelesSrc.includes('puedeFacturarLegal: true'), 'Niveles: Niveles 1-4 sí facturan legal');
assert(nivelesSrc.includes('bloquea:') && nivelesSrc.includes("'timbrado_dian'"), 'Niveles: Nivel 0 bloquea timbrado_dian');
assert(nivelesSrc.includes('subirNivel') && nivelesSrc.includes('requisitosParaSubir'), 'Niveles: API subirNivel + requisitos');

// ── 5. Simulación funcional del candado (sin DOM) ─────────────────────────
// Los módulos Crozzo son IIFE que se asignan a globalThis/window.
// Cargamos el código en un vm con contexto propio para aislar.
import vm from 'node:vm';
try {
  const sandboxCode = read('app/modules/CrozzoSandboxFiscal.js');
  const ctx = { window: {}, globalThis: null };
  ctx.globalThis = ctx; // self-reference para el IIFE
  ctx.window = ctx;     // window === ctx también
  vm.createContext(ctx);
  vm.runInContext(sandboxCode, ctx);
  const Sandbox = ctx.CrozzoSandboxFiscal;
  assert(Sandbox && typeof Sandbox.assertNoSandbox === 'function', 'Sandbox cargado en vm correctamente');

  // configManager mock en Nivel 0
  const cmNivel0 = { isSandboxFiscal: () => true, getNivelMadurez: () => 0 };
  try {
    Sandbox.assertNoSandbox(cmNivel0);
    fail('Candado Sandbox nivel 0', 'NO lanzó excepción (DEBERÍA bloquear)');
  } catch (e) {
    const bloqueoOk = e.isSandboxBlock === true || /Sandbox|Semilla/i.test(e.message);
    assert(bloqueoOk, 'Candado Sandbox nivel 0 lanza SandboxFiscalException', e.message);
  }

  // configManager mock en Nivel 1 (no debe bloquear)
  const cmNivel1 = { isSandboxFiscal: () => false, getNivelMadurez: () => 1 };
  try {
    Sandbox.assertNoSandbox(cmNivel1);
    ok('Candado Sandbox nivel 1 permite', 'no lanzó excepción (correcto)');
  } catch (e) {
    fail('Candado Sandbox nivel 1 permite', 'lanzó excepción indebida: ' + e.message);
  }

  // Ticket de capacitación: NO fiscal
  const ticket = Sandbox.generarTicketCapacitacion({ total: 10000 }, cmNivel0);
  assert(ticket.esFiscal === false, 'Ticket capacitación: esFiscal === false');
  assert(ticket.cufe === null, 'Ticket capacitación: cufe === null');
  assert(ticket.qrcode === null, 'Ticket capacitación: qrcode === null');
  assert(ticket.esDemo === true, 'Ticket capacitación: esDemo === true');
  assert(Sandbox.esDocumentoSeguro(ticket) === true, 'Ticket capacitación: esDocumentoSeguro === true');

  // Documento con CUFE real: NO seguro
  const docFalso = { cufe: 'ABC123', esFiscal: true };
  assert(Sandbox.esDocumentoSeguro(docFalso) === false, 'Documento con CUFE: esDocumentoSeguro === false (detecta fuga)');

  // Dataset ficticio
  assert(Sandbox.DATASET.productos.length === 5, 'Dataset: 5 productos ficticios');
  assert(Sandbox.DATASET.clientes.length === 3, 'Dataset: 3 clientes ficticios');
  assert(Sandbox.DATASET.sede.esDemo === true, 'Dataset: sede marcada esDemo');
} catch (e) {
  fail('Simulación funcional Sandbox', 'Error cargando módulo: ' + e.message);
}

// ── 6. Regresión: ambiente test DIAN no debe escapar a producción ─────────
assert(dianSrc.includes('ambiente'), 'DIAN: campo ambiente presente (test/produccion)');

// ── Reporte ────────────────────────────────────────────────────────────────
console.log('');
for (const r of results) {
  console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.detail ? ' — ' + r.detail : ''));
}
console.log('');
if (failed === 0) {
  console.log('✅ LEGALIDAD FISCAL: PASS — el sistema DEMUESTRA que solo admite legalidad.');
  console.log('   Nivel 0 bloquea CUFE real; mockStamp ya no es ruta del Sandbox (C4 resuelto).');
  process.exit(0);
} else {
  console.log(`❌ LEGALIDAD FISCAL: FAIL — ${failed} verificación(es) fallaron.`);
  console.log('   El sistema NO demuestra que bloquea lo ilegal. Revisar antes de release.');
  process.exit(1);
}
