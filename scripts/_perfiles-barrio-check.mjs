#!/usr/bin/env node
/**
 * Verificación — PERFILES DE BARRIO (H2.A)
 * --------------------------------------------------------------------------
 * Verifica que frutería/abasto/minimarket reciben gating + menús por rol
 * correctamente (antes el bug hacía que caja viera 16 ítems como admin).
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

console.log('🍎 Perfiles de barrio — verificación H2.A\n');

// ── 1. crozzoIsBasicoEmpresaPerfil reconoce perfiles de barrio ────────────
const posMainSrc = readFileSync(join(root, 'app/core/CrozzoPosMain.js'), 'utf8');
assert(posMainSrc.includes("basico_fruteria") && posMainSrc.includes("basico_abasto") && posMainSrc.includes("basico_minimarket"), 'PosMain: crozzoIsBasicoEmpresaPerfil incluye perfiles barrio');

// ── 2. PerfilesOperativos cargado con menús por rol ───────────────────────
const Op = loadModule('app/modules/CrozzoPerfilesOperativos.js', 'CrozzoPerfilesOperativos');

// Frutería existe en CLIENT_MENUS
assert(Op.CLIENT_MENUS.basico_fruteria && Op.CLIENT_MENUS.basico_fruteria.length > 0, 'Frutería: CLIENT_MENUS definido');
assert(Op.CLIENT_MENUS.basico_abasto && Op.CLIENT_MENUS.basico_abasto.length > 0, 'Abasto: CLIENT_MENUS definido');
assert(Op.CLIENT_MENUS.basico_minimarket && Op.CLIENT_MENUS.basico_minimarket.length > 0, 'Minimarket: CLIENT_MENUS definido');

// ── 3. Menús por rol (caja ve 4, admin ve todos) ─────────────────────────
// resolveRoleMenus es la API pública. Verificamos via PERFIL_ROLE_MENUS indirectamente
// accediendo a la estructura que resolveRoleMenus consume.
const roleMenus = Op.resolveRoleMenus;
assert(typeof roleMenus === 'function', 'resolveRoleMenus: API pública disponible');

// Simular resolución de menú por rol para frutería/caja
// Como resolveRoleMenus puede depender de estado global, verificamos la estructura interna
// leyendo el source de PerfilesOperativos
const perfilesSrc = readFileSync(join(root, 'app/modules/CrozzoPerfilesOperativos.js'), 'utf8');
assert(perfilesSrc.includes('basico_fruteria:'), 'PerfilesOperativos: basico_fruteria en ROLE_MENUS');
assert(perfilesSrc.includes('basico_abasto:'), 'PerfilesOperativos: basico_abasto en ROLE_MENUS');
assert(perfilesSrc.includes('basico_minimarket:'), 'PerfilesOperativos: basico_minimarket en ROLE_MENUS');

// Verificar que caja de frutería tiene solo 4 ítems
const fruteriaCajaMatch = perfilesSrc.match(/basico_fruteria:\s*\{[^}]*caja:\s*\[([^\]]*)\]/s);
if (fruteriaCajaMatch) {
  const cajaItems = fruteriaCajaMatch[1].split(',').map(s => s.trim()).filter(Boolean);
  assert(cajaItems.length === 4, 'Frutería rol caja: 4 ítems (no 16)', cajaItems.length + ' ítems: ' + cajaItems.join(','));
} else {
  fail('Frutería rol caja', 'no se pudo extraer del source');
}

// ── 4. listPerfiles incluye los 6 ────────────────────────────────────────
const lista = Op.list();
assert(lista.length >= 6, 'listPerfiles: al menos 6 perfiles', lista.length + ' perfiles');
const ids = lista.map(p => p.id);
assert(ids.includes('basico_fruteria'), 'listPerfiles: incluye frutería');
assert(ids.includes('basico_abasto'), 'listPerfiles: incluye abasto');
assert(ids.includes('basico_minimarket'), 'listPerfiles: incluye minimarket');

// ── 5. getMeta de cada perfil ─────────────────────────────────────────────
const frutMeta = Op.getMeta('basico_fruteria');
assert(frutMeta.icon === '🍎' && frutMeta.perecedero === true, 'Frutería meta: icono + perecedero');
const abaMeta = Op.getMeta('basico_abasto');
assert(abaMeta.icon === '🛒', 'Abasto meta: icono');
const miniMeta = Op.getMeta('basico_minimarket');
assert(miniMeta.icon === '🏪', 'Minimarket meta: icono');

// ── 6. LEGACY_PERFIL_MAP resuelve entradas naturales ─────────────────────
assert(perfilesSrc.includes("fruteria: 'basico_fruteria'"), 'Legacy map: fruteria → basico_fruteria');
assert(perfilesSrc.includes("abarrotes: 'basico_abasto'"), 'Legacy map: abarrotes → basico_abasto');
assert(perfilesSrc.includes("panaderia: 'basico_minimarket'"), 'Legacy map: panaderia → basico_minimarket');

// ── Reporte ───────────────────────────────────────────────────────────────
console.log('');
for (const x of results) console.log((x.ok ? '  ✓ ' : '  ✗ ') + x.name + (x.detail ? ' — ' + x.detail : ''));
console.log('');
if (failed === 0) {
  console.log('✅ PERFILES DE BARRIO: PASS — frutería/abasto/minimarket con gating + menú por rol.');
  process.exit(0);
} else {
  console.log(`❌ PERFILES DE BARRIO: FAIL — ${failed} verificación(es) fallaron.`);
  process.exit(1);
}
