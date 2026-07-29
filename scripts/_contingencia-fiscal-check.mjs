#!/usr/bin/env node
/**
 * Verificación — CONTINGENCIA FISCAL + eliminación mockStamp (H1.5)
 * --------------------------------------------------------------------------
 * Verifica:
 *  - mockStamp neutralizado: lanza error, NO genera CUFE (C4 definitivo)
 *  - Providers no implementados (siigo/facturama/default) bloquean claro
 *  - Contingencia: encola documentos con estado 'pendiente_timbrado'
 *  - SLA 48h: detecta documentos críticos/próximos a vencer
 *  - Evento significativo: se encola al entrar contingencia
 *  - Drenaje: timbra al recuperar PT y sale de contingencia
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
  const ctx = { console, setTimeout: () => {}, crypto: { randomUUID: () => 'test' } };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx[globalKey];
}

console.log('🔄 Contingencia fiscal + mockStamp — verificación H1.5\n');

// ── 1. mockStamp neutralizado (no genera CUFE) ────────────────────────────
const dianSrc = readFileSync(join(root, 'app/core/pos/CrozzoPosDianLib.js'), 'utf8');
assert(dianSrc.includes('STAMP_REQUIERE_PROVEEDOR'), 'mockStamp: lanza error STAMP_REQUIERE_PROVEEDOR');
// Aislar el cuerpo de mockStamp y verificar que NO contiene cálculo/retorno de CUFE
const mockMatch = dianSrc.match(/async function mockStamp\(xml, factura\)\s*\{([\s\S]*?)\n\}/);
const mockCuerpo = mockMatch ? mockMatch[1] : '';
assert(mockCuerpo && !mockCuerpo.includes('calcularCUFE'), 'mockStamp cuerpo: NO llama calcularCUFE (no genera CUFE falso)');
assert(mockCuerpo && !mockCuerpo.includes('isDemo: true'), 'mockStamp cuerpo: NO retorna isDemo:true (no simula)');
assert(mockCuerpo && mockCuerpo.includes('throw'), 'mockStamp cuerpo: lanza throw (bloqueo)');

// Cargar DianLib y verificar mockStamp lanza
const ctxDian = { console, setTimeout: () => {}, crypto: { randomUUID: () => 'test' }, fetch: () => Promise.reject(new Error('no fetch')) };
ctxDian.window = ctxDian; ctxDian.globalThis = ctxDian;
vm.createContext(ctxDian);
vm.runInContext(dianSrc + '\nthis.__mock = mockStamp;', ctxDian);
let mockLanza = false;
try {
  await ctxDian.__mock('<xml/>', {});
} catch (e) {
  mockLanza = /STAMP_REQUIERE_PROVEEDOR/.test(e.message);
}
assert(mockLanza, 'mockStamp ejecutado: lanza error claro (no simula CUFE)');

// ── 2. Providers no implementados bloquean ────────────────────────────────
assert(dianSrc.includes('providerNoImplementado'), 'createProvider: usa providerNoImplementado');
assert(dianSrc.includes("STAMP_PROVIDER_NO_IMPLEMENTADO"), 'providerNoImplementado: error claro');

// ── 3. ContingenciaFiscal cargado ─────────────────────────────────────────
const CF = loadModule('app/modules/CrozzoContingenciaFiscal.js', 'CrozzoContingenciaFiscal');
assert(CF && typeof CF.encolarDocumento === 'function', 'ContingenciaFiscal cargado');
assert(CF.SLA_DIAN_HORAS === 48, 'SLA DIAN: 48 horas');
assert(CF.ALERTA_DIAN_HORAS === 40, 'Alerta DIAN: 40 horas');

// ── 4. Encolar documento en contingencia ──────────────────────────────────
const ls = {};
const ctx2 = { console, localStorage: { getItem: k => ls[k] || null, setItem: (k,v) => ls[k]=v }, navigator: { onLine: false } };
ctx2.window = ctx2; ctx2.globalThis = ctx2;
vm.createContext(ctx2);
vm.runInContext(readFileSync(join(root, 'app/modules/CrozzoContingenciaFiscal.js'), 'utf8'), ctx2);
const CF2 = ctx2.CrozzoContingenciaFiscal;

const doc = CF2.encolarDocumento({ xml: '<xml/>', factura: { total: 10000 }, tipoDocumento: '01' });
assert(doc.estado === 'pendiente_timbrado', 'Documento encolado: estado pendiente_timbrado (no facturado)');
assert(doc.deadlineSLA !== undefined, 'Documento encolado: tiene deadline SLA 48h');
assert(doc.id.startsWith('cf-'), 'Documento encolado: tiene id único');
assert(doc.intentos === 0, 'Documento encolado: intentos = 0');

// ── 5. Evento significativo se registra al entrar contingencia ────────────
const ev = CF2.registrarCambioContingencia(true, {});
assert(ev.accion === 'entra_contingencia', 'Entra contingencia: acción registrada');
assert(ev.evento.codigoDIAN === '1', 'Evento significativo: código DIAN 1 (falla facturador)');
const eventosPend = CF2.eventosSignificativosPendientes();
assert(eventosPend.length >= 1, 'Evento significativo encolado para reportar a DIAN');

// ── 6. SLA 48h: detecta críticos ──────────────────────────────────────────
const hace50h = new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString();
const hace2h = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
const cola = [
  { estado: 'pendiente_timbrado', deadlineSLA: hace50h }, // crítico (vencido)
  { estado: 'pendiente_timbrado', deadlineSLA: hace2h }   // ok (le queda tiempo)
];
const sla = CF2.verificarSLA(cola);
assert(sla.criticos === 1, 'SLA: detecta 1 documento crítico (>48h)');
assert(sla.ok === false, 'SLA: cola NO ok (hay crítico)');
const slaOk = CF2.verificarSLA([{ estado: 'timbrado', deadlineSLA: hace2h }]);
assert(slaOk.ok === true, 'SLA: cola ok sin pendientes vencidos');

// ── 7. Drenaje: simula recuperación PT ────────────────────────────────────
// Mock timbrarFn que simula éxito con CUFE
const ctx3 = { console, localStorage: { getItem: () => '[]', setItem: () => {} } };
ctx3.window = ctx3; ctx3.globalThis = ctx3;
vm.createContext(ctx3);
vm.runInContext(readFileSync(join(root, 'app/modules/CrozzoContingenciaFiscal.js'), 'utf8'), ctx3);
const CF3 = ctx3.CrozzoContingenciaFiscal;
// Mock cola global
ctx3.crozzoFiscalOutboxLoad = () => [
  { estado: 'pendiente_timbrado', xml: '<xml/>', factura: { total: 5000 }, intentos: 0 },
  { estado: 'pendiente_timbrado', xml: '<xml/>', factura: { total: 8000 }, intentos: 0 }
];
ctx3.crozzoFiscalOutboxSaveAll = () => {};
const timbrarMock = async (xml, factura) => ({ cufe: 'CUFE-OK-' + Date.now(), qrUrl: 'http://qr' });
const r = await CF3.drenarCola({}, timbrarMock);
assert(r.drenados === 2, 'Drenaje: timbra 2 documentos al recuperar PT', '$' + r.drenados);
assert(r.saleContingencia === true, 'Drenaje: sale de contingencia al vaciar cola');

// ── 8. Evento significativo al salir ──────────────────────────────────────
const evSale = CF3.registrarCambioContingencia(false, {});
assert(evSale.accion === 'sale_contingencia', 'Sale contingencia: acción registrada');

// ── Reporte ───────────────────────────────────────────────────────────────
console.log('');
for (const x of results) console.log((x.ok ? '  ✓ ' : '  ✗ ') + x.name + (x.detail ? ' — ' + x.detail : ''));
console.log('');
if (failed === 0) {
  console.log('✅ CONTINGENCIA FISCAL + mockStamp: PASS — CUFE simulado eliminado, contingencia operativa.');
  process.exit(0);
} else {
  console.log(`❌ CONTINGENCIA FISCAL + mockStamp: FAIL — ${failed} verificación(es) fallaron.`);
  process.exit(1);
}
