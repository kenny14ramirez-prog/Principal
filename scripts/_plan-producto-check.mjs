#!/usr/bin/env node
/**
 * Verificación — planProducto H2.E (3ª dimensión ortogonal)
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

console.log('📦 planProducto (H2.E) — verificación\n');

const ctx = {
  console,
  CROZZO_PAGE_MENU_MAP: {
    'config-conexiones-sistemas': 'conexion-sistemas',
    'costos-federacion': 'sistema-costos',
    'planilla-2026': 'nomina-planilla',
    'compras-dashboard': 'centro-compras',
    auditoria: 'auditoria'
  },
  config: {
    madurez: { planProducto: 'basico' },
    getPlanProducto() {
      return this.madurez.planProducto || 'basico';
    },
    setPlanProducto(p) {
      this.madurez.planProducto = p;
      return p;
    },
    save() {}
  }
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(join(root, 'app/modules/CrozzoPlanProducto.js'), 'utf8'), ctx);

const vis = ctx.crozzoPageVisibleByPlan;
assert(typeof vis === 'function', 'Export crozzoPageVisibleByPlan');
assert(typeof ctx.crozzoGetPlanProducto === 'function', 'Export crozzoGetPlanProducto');
assert(ctx.crozzoGetPlanProducto() === 'basico', 'Default plan = basico');

// Básico: denegados
assert(vis('config-conexiones-sistemas', 'basico') === false, 'Basico: bloquea conexiones');
assert(vis('conexion-sistemas', 'basico') === false, 'Basico: bloquea menú conexion-sistemas');
assert(vis('costos-federacion', 'basico') === false, 'Basico: bloquea federación');
assert(vis('sistema-costos-fed', 'basico') === false, 'Basico: bloquea menú sistema-costos-fed');
assert(vis('planilla-2026', 'basico') === false, 'Basico: bloquea planilla');
assert(vis('nomina-planilla', 'basico') === false, 'Basico: bloquea menú nómina');
assert(vis('compras-dashboard', 'basico') === false, 'Basico: bloquea compras-dashboard');
assert(vis('auditoria', 'basico') === false, 'Basico: bloquea auditoria');

// Básico: esenciales OK (no tocar centro-compras menú genérico / caja)
assert(vis('cajero', 'basico') === true, 'Basico: cajero visible');
assert(vis('rentabilidad', 'basico') === true, 'Basico: rentabilidad visible');
assert(vis('centro-compras', 'basico') === true, 'Basico: centro-compras menú NO bloqueado (caja)');
assert(vis('facturas', 'basico') === true, 'Basico: facturas visible');

// Medio
assert(vis('config-conexiones-sistemas', 'medio') === true, 'Medio: conexiones OK');
assert(vis('planilla-2026', 'medio') === true, 'Medio: planilla OK');
assert(vis('costos-federacion', 'medio') === false, 'Medio: federación aún bloqueada');
assert(vis('auditoria', 'medio') === false, 'Medio: auditoria bloqueada');

// Grande
assert(vis('costos-federacion', 'grande') === true, 'Grande: federación OK');
assert(vis('auditoria', 'grande') === true, 'Grande: auditoria OK');
assert(vis('conexion-sistemas', 'grande') === true, 'Grande: conexiones OK');

// setPlan
ctx.crozzoSetPlanProducto('medio');
assert(ctx.crozzoGetPlanProducto() === 'medio', 'setPlanProducto medio');
assert(vis('config-conexiones-sistemas') === true, 'Tras set medio: conexiones usan getPlan');

// normalize basura → basico
assert(ctx.CrozzoPlanProducto.normalizePlan('xyz') === 'basico', 'normalizePlan inválido → basico');

// Cableado repo
const index = readFileSync(join(root, 'app/index.html'), 'utf8');
assert(index.indexOf('CrozzoPlanProducto.js') >= 0, 'index.html: script PlanProducto');

const cfg = readFileSync(join(root, 'app/core/pos/CrozzoPosConfigManager.js'), 'utf8');
assert(cfg.indexOf("planProducto: 'basico'") >= 0 || cfg.indexOf('planProducto: "basico"') >= 0, 'ConfigManager: default planProducto');
assert(cfg.indexOf('getPlanProducto') >= 0 && cfg.indexOf('setPlanProducto') >= 0, 'ConfigManager: getters/setters');

const posMain = readFileSync(join(root, 'app/core/CrozzoPosMain.js'), 'utf8');
assert(posMain.indexOf('crozzoPageVisibleByPlan') >= 0, 'PosMain: gate planProducto');
const isBasicoFn = posMain.match(
  /function crozzoIsBasicoEmpresaPerfil\([^)]*\)\s*\{[\s\S]{0,800}?\}/
);
assert(!!isBasicoFn, 'PosMain: crozzoIsBasicoEmpresaPerfil existe');
assert(
  isBasicoFn && isBasicoFn[0].indexOf('planProducto') < 0 && isBasicoFn[0].indexOf('PageVisibleByPlan') < 0,
  'PosMain: isBasico NO mutado por planProducto (ortogonal)'
);

const onb = readFileSync(join(root, 'app/modules/CrozzoOnboardingOperativo.js'), 'utf8');
assert(onb.indexOf('crozzo-mc-plan') >= 0, 'Onboarding: panel muestra plan');

console.log('');
for (const x of results) console.log((x.ok ? '  ✓ ' : '  ✗ ') + x.name + (x.detail ? ' — ' + x.detail : ''));
console.log('');
console.log(`Total: ${results.length} asserts · fallos: ${failed}`);
if (failed === 0) {
  console.log('✅ PLAN PRODUCTO: PASS');
  process.exit(0);
}
console.log('❌ PLAN PRODUCTO: FAIL');
process.exit(1);
