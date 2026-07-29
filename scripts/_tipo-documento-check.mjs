#!/usr/bin/env node
/**
 * Verificación — TIPO DE DOCUMENTO + NOTAS (H1.2)
 * --------------------------------------------------------------------------
 * Verifica:
 *  - Decisión automática FEV vs Tiquete según adquirente (Res. 165/2023)
 *  - Consumidor final anónimo → tiquete (doc equivalente), no FEV
 *  - Adquirente con NIT/solicita factura → FEV
 *  - Builders UBL CreditNote/DebitNote generan XML válido
 *  - Nivel 0 (Semilla) → no emite documento fiscal
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

console.log('📄 Tipo documento + notas — verificación H1.2\n');

const TD = loadModule('app/modules/CrozzoTipoDocumento.js', 'CrozzoTipoDocumento');

// ── 1. Consumidor final anónimo → tiquete ─────────────────────────────────
const cm1 = { getNivelMadurez: () => 1 };
const anon = TD.decidir({ doc: '', nombre: 'Consumidor final' }, cm1);
assert(anon.tipo === 'tiquete', 'Anónimo → tiquete (no FEV)', anon.codigo);
assert(anon.codigo === '04', 'Tiquete código DIAN 04');
assert(anon.requiereAdquirente === false, 'Tiquete no exige adquirente');

// ── 2. Adquirente con NIT → FEV ───────────────────────────────────────────
const conNit = TD.decidir({ doc: '900123456', nombre: 'Empresa SAS' }, cm1);
assert(conNit.tipo === 'fev', 'NIT → FEV', conNit.codigo);
assert(conNit.codigo === '01', 'FEV código DIAN 01');
assert(conNit.requiereAdquirente === true, 'FEV exige adquirente');

// ── 3. Solicita factura explícitamente → FEV (es su derecho) ──────────────
const solicita = TD.decidir({ doc: '', nombre: 'Juan', solicitaFactura: true }, cm1);
assert(solicita.tipo === 'fev', 'Solicita factura → FEV (derecho del consumidor)');

// ── 4. Nivel 0 (Semilla) → no emite documento ─────────────────────────────
const cm0 = { getNivelMadurez: () => 0 };
const sandbox = TD.decidir({ doc: '900123456' }, cm0);
assert(sandbox.tipo === 'sandbox', 'Semilla (Nivel 0) → no documento fiscal');
assert(sandbox.codigo === null, 'Semilla → código null');

// ── 5. tipoOperacion contingencia ─────────────────────────────────────────
assert(TD.tipoOperacion({}, cm1, false) === '01', 'Operación estándar: 01');
assert(TD.tipoOperacion({}, cm1, true) === '09', 'Contingencia: 09');

// ── 6. prepararDocumento integra decisión + operación ─────────────────────
const doc = TD.prepararDocumento({}, { doc: '900123456', nombre: 'X' }, cm1);
assert(doc.tipoDocumento === '01' && doc.tipoOperacion === '01', 'prepararDocumento FEV estándar');
const tq = TD.prepararDocumento({}, { doc: '' }, cm1);
assert(tq.tipoDocumento === '04' && tq.esTiquete === true, 'prepararDocumento tiquete');

// ── 7. Builders UBL CreditNote/DebitNote ──────────────────────────────────
// Cargar DianLib (buildNotaCreditoUBL21, buildNotaDebitoUBL21 son internas,
// las exponemos via eval controlado)
const dianSrc = readFileSync(join(root, 'app/core/pos/CrozzoPosDianLib.js'), 'utf8');
const ctxDian = { console };
ctxDian.window = ctxDian; ctxDian.globalThis = ctxDian;
vm.createContext(ctxDian);
vm.runInContext(dianSrc + '\nthis.__nc = buildNotaCreditoUBL21; this.__nd = buildNotaDebitoUBL21;', ctxDian);

const config = { empresa: { nit: '900123456', razonSocial: 'Test SAS' }, dian: { prefijoNotaCredito: 'NC', prefijoNotaDebito: 'ND' } };
const notaCredito = ctxDian.__nc({
  consecutivo: 1, subtotal: 10000, taxTotal: 1900,
  facturaReferencia: { prefijo: 'SE', consecutivo: 5, cufe: 'CUFE123', fechaEmision: '2026-07-28T10:00:00' },
  motivoDescripcion: 'Devolución parcial'
}, config);
assert(notaCredito.includes('<CreditNote'), 'Nota crédito UBL: raíz CreditNote');
assert(notaCredito.includes('CUFE123'), 'Nota crédito UBL: referencia CUFE factura original');
assert(notaCredito.includes('NC00000001'), 'Nota crédito UBL: consecutivo NC');
assert(notaCredito.includes('BillingReference'), 'Nota crédito UBL: BillingReference presente');

const notaDebito = ctxDian.__nd({
  consecutivo: 1, subtotal: 5000, taxTotal: 950,
  facturaReferencia: { prefijo: 'SE', consecutivo: 5, cufe: 'CUFE123', fechaEmision: '2026-07-28T10:00:00' },
  motivoDescripcion: 'Recargo'
}, config);
assert(notaDebito.includes('<DebitNote'), 'Nota débito UBL: raíz DebitNote');
assert(notaDebito.includes('ND00000001'), 'Nota débito UBL: consecutivo ND');

// ── Reporte ───────────────────────────────────────────────────────────────
console.log('');
for (const r of results) console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.detail ? ' — ' + r.detail : ''));
console.log('');
if (failed === 0) {
  console.log('✅ TIPO DOCUMENTO + NOTAS: PASS — FEV/tiquete automático + notas UBL operativas.');
  process.exit(0);
} else {
  console.log(`❌ TIPO DOCUMENTO + NOTAS: FAIL — ${failed} verificación(es) fallaron.`);
  process.exit(1);
}
