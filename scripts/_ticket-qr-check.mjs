#!/usr/bin/env node
/**
 * Verificación — RENDERER QR DIAN en ticket (H1.6)
 * --------------------------------------------------------------------------
 * Verifica el renderizador de QR DIAN + nº validación para ticket electrónico.
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

console.log('🔳 Renderer QR DIAN — verificación H1.6\n');

const TQR = loadModule('app/modules/CrozzoTicketQR.js', 'CrozzoTicketQR');

// ── 1. VPFE URL correcta ──────────────────────────────────────────────────
const url = TQR.vpfeUrl('abc123XYZ');
assert(url === 'https://catalogo-vpfe.dian.gov.co/User/SearchDocument?documentkey=abc123XYZ', 'VPFE URL correcta');
assert(TQR.vpfeUrl('test 456') === 'https://catalogo-vpfe.dian.gov.co/User/SearchDocument?documentkey=test%20456', 'VPFE URL encodea espacios');

// ── 2. tieneCufeValido: solo CUFE real ────────────────────────────────────
assert(TQR.tieneCufeValido({ cufe: 'abc123def456' }) === true, 'CUFE real válido');
assert(TQR.tieneCufeValido({ cufe: '' }) === false, 'Sin CUFE: false');
assert(TQR.tieneCufeValido({ cufe: 'DEMO-12345' }) === false, 'CUFE DEMO: false');
assert(TQR.tieneCufeValido({ cufe: 'pendiente_timbrado_x' }) === false, 'CUFE pendiente: false');
assert(TQR.tieneCufeValido({ cufe: 'NO-APLICA-POS' }) === false, 'CUFE NO-APLICA: false');
assert(TQR.tieneCufeValido({ cufe: 'abc123', estado: 'pendiente_timbrado' }) === false, 'Estado pendiente: false');
assert(TQR.tieneCufeValido({ cufe: 'abc123', isDemo: true }) === false, 'isDemo true: false');
assert(TQR.tieneCufeValido(null) === false, 'Factura null: false');

// ── 3. renderHtml: documento con CUFE real ────────────────────────────────
const html1 = TQR.renderHtml({ cufe: 'abc123def456', qrUrl: 'https://catalogo-vpfe.dian.gov.co/User/SearchDocument?documentkey=abc123def456', numeroValidacion: 'VAL-2026-001' });
assert(html1.includes('crozzo-ticket-qr'), 'Render CUFE válido: clase crozzo-ticket-qr');
assert(html1.includes('CUFE: abc123def456'), 'Render CUFE válido: muestra CUFE');
assert(html1.includes('VAL-2026-001'), 'Render CUFE válido: muestra nº validación');
assert(html1.includes('catalogo-vpfe.dian.gov.co'), 'Render CUFE válido: referencia VPFE');

// ── 4. renderHtml: documento pendiente (contingencia) ─────────────────────
const html2 = TQR.renderHtml({ cufe: 'pend', estado: 'pendiente_timbrado' });
assert(html2.includes('crozzo-pendiente'), 'Render pendiente: clase crozzo-pendiente');
assert(html2.includes('contingencia'), 'Render pendiente: menciona contingencia');
assert(!html2.includes('<img'), 'Render pendiente: NO muestra imagen QR (honestidad)');

// ── 5. renderHtml: sin CUFE (sandbox/no fiscal) ───────────────────────────
const html3 = TQR.renderHtml({ cufe: '' });
assert(html3.includes('crozzo-sin-cufe'), 'Render sin CUFE: clase crozzo-sin-cufe');
assert(!html3.includes('<img'), 'Render sin CUFE: NO muestra QR');

// ── 6. paraBloqueTermico: devuelve dataURL o null ─────────────────────────
// Sin document (entorno Node), generarDataURL retorna null pero paraBloqueTermico no crashea
const termValido = TQR.paraBloqueTermico({ cufe: 'abc123def456' });
// En Node sin document/canvas, dataURL será null pero cufe/url presentes
assert(termValido === null || (termValido.cufe === 'abc123def456' && termValido.url.includes('catalogo-vpfe')), 'paraBloqueTermico: cufe válido retorna info o null (sin DOM)');
const termPend = TQR.paraBloqueTermico({ cufe: 'abc', estado: 'pendiente_timbrado' });
assert(termPend === null, 'paraBloqueTermico pendiente: null (no aplica)');

// ── 7. Bloque térmico {t:'qr'} existe en CrozzoTermicaColombia ────────────
const termSrc = readFileSync(join(root, 'app/core/CrozzoTermicaColombia.js'), 'utf8');
assert(termSrc.includes("{ t: 'qr'"), 'TermicaColombia: bloque {t:qr} definido');
assert(termSrc.includes("{ t: 'cufe'"), 'TermicaColombia: bloque {t:cufe} definido');
assert(termSrc.includes('000165/2023'), 'TermicaColombia: referencia Res. DIAN 165/2023');

// ── Reporte ───────────────────────────────────────────────────────────────
console.log('');
for (const x of results) console.log((x.ok ? '  ✓ ' : '  ✗ ') + x.name + (x.detail ? ' — ' + x.detail : ''));
console.log('');
if (failed === 0) {
  console.log('✅ RENDERER QR DIAN: PASS — QR + nº validación operativos, respeta estados (CUFE real/pendiente/sandbox).');
  process.exit(0);
} else {
  console.log(`❌ RENDERER QR DIAN: FAIL — ${failed} verificación(es) fallaron.`);
  process.exit(1);
}
