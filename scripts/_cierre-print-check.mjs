/**
 * Verifica impresión de cierre: formulario, último cierre e historial anterior.
 * node scripts/_cierre-print-check.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  const file = join(root, p.replace(/^\//, ''));
  try {
    statSync(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'octet-stream' });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404);
    res.end('');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const nowIso = new Date().toISOString();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

await page.addInitScript(({ today, yesterday, nowIso }) => {
  const factura = {
    uuid: 'test-cierre-' + Date.now(),
    consecutivo: 'T-001',
    fecha: nowIso,
    fechaEmision: nowIso,
    estado: 'pos',
    total: 50000,
    metodoPago: 'efectivo',
    items: [{ id: 1, nombre: 'Test', cantidad: 1, precio: 50000 }],
  };
  const cfg = {
    seguridad: { requiereLogin: false },
    operacion: { modo: 'demo' },
    facturas: [factura],
    facturasFiscal: [factura],
  };
  localStorage.setItem('pos_dian_config', JSON.stringify(cfg));
  sessionStorage.setItem('crozzo_session_user', 'KENNY');
  localStorage.setItem('crozzo_user_role', 'super_admin');
  localStorage.removeItem('crozzo_day_session_v2');
  localStorage.removeItem('crozzo_shift_turn_v1');
  localStorage.setItem(
    'crozzo_shift_turn_history_v1',
    JSON.stringify([
      {
        shiftType: 'tarde',
        shiftLabel: 'Tarde',
        businessDate: yesterday,
        shiftId: 'TRN-OLD',
        closedAt: yesterday + 'T22:00:00.000Z',
        closedBy: 'ANA',
        salesCount: 3,
        totalSales: 120000,
        cashSales: 80000,
        fondo: 50000,
        expected: 130000,
        actual: 125000,
        diff: -5000,
        gastosTurno: 0,
        byMethod: { efectivo: 80000, tarjeta: 40000, qr: 0, pse: 0, mixto: 0, otro: 0 },
        notes: 'Cierre anterior de prueba',
      },
      {
        shiftType: 'manana',
        shiftLabel: 'Mañana',
        businessDate: today,
        shiftId: 'TRN-TODAY',
        closedAt: nowIso,
        closedBy: 'KENNY',
        salesCount: 1,
        totalSales: 50000,
        cashSales: 50000,
        fondo: 100000,
        expected: 150000,
        actual: 150000,
        diff: 0,
        gastosTurno: 0,
        byMethod: { efectivo: 50000, tarjeta: 0, qr: 0, pse: 0, mixto: 0, otro: 0 },
        notes: 'Cierre de hoy',
        cuadreSheet: {
          fondo: 100000,
          efectivoDocumentos: 50000,
          datafonos: 0,
          gastos: 0,
          totalSumado: 50000,
          totalVendido: 50000,
          totalReal: 150000,
          esperadoSistema: 150000,
          descuadre: 0,
          descuadreVenta: 0,
          propinasTotal: 0,
          propinasEfectivo: 0,
          propinasDatafono: 0,
        },
      },
    ])
  );
  localStorage.setItem(
    'crozzo_day_session_v2',
    JSON.stringify({
      businessDate: today,
      openedAt: nowIso,
      closedAt: null,
      autoClosed: false,
      activeShift: 'tarde',
      shifts: {
        manana: { type: 'manana', openedAt: nowIso, closedAt: nowIso, status: 'closed' },
        tarde: { type: 'tarde', openedAt: nowIso, closedAt: null, status: 'open' },
        dia: { type: 'dia', openedAt: null, closedAt: null, status: 'pending' },
      },
    })
  );
  window.__crozzoSkipNoviceArqueoGuard = true;
  window.confirm = () => true;
}, { today, yesterday, nowIso });

await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(4000);

await page.evaluate(() => {
  if (typeof navigateTo === 'function') navigateTo('cierre-caja');
});
await page.waitForTimeout(1500);

const checks = await page.evaluate(() => {
  const errors = [];
  const hist = JSON.parse(localStorage.getItem('crozzo_shift_turn_history_v1') || '[]');
  const oldRec = hist.find((r) => r.businessDate !== new Date().toISOString().slice(0, 10));
  const todayRec = hist[0];
  if (!oldRec) errors.push('sin cierre anterior en historial');
  if (!todayRec) errors.push('sin cierre de hoy');

  const keyOld =
    typeof crozzoCierreBuildCuadreSheet === 'function' && CrozzoCierrePrint && CrozzoCierrePrint.cierreRecordKey
      ? CrozzoCierrePrint.cierreRecordKey(oldRec)
      : oldRec
        ? String(oldRec.shiftId) + '|' + String(oldRec.closedAt) + '|' + String(oldRec.businessDate)
        : '';

  const prep =
    CrozzoCierrePrint && typeof CrozzoCierrePrint.prepareRecordForPrint === 'function'
      ? CrozzoCierrePrint.prepareRecordForPrint(oldRec)
      : null;
  if (!prep || !prep.cuadreSheet) errors.push('prepareRecordForPrint falló');
  else {
    if (prep.cuadreSheet.totalReal !== oldRec.actual) errors.push('totalReal distinto al cierre anterior');
    if (prep.cuadreSheet.responsable !== oldRec.closedBy) errors.push('responsable incorrecto en reimpresión');
    if (prep.cuadreSheet.draft) errors.push('cierre anterior marcado como borrador');
  }

  const resolved =
    CrozzoCierrePrint && typeof CrozzoCierrePrint.resolveHistoryRecord === 'function'
      ? CrozzoCierrePrint.resolveHistoryRecord(keyOld)
      : null;
  if (!resolved || resolved.shiftId !== oldRec.shiftId) errors.push('resolveHistoryRecord no encuentra cierre anterior');

  if (typeof crozzoCierreBuildCuadreSheet === 'function') {
    const sheet = crozzoCierreBuildCuadreSheet(todayRec, { invoices: [], byMethod: todayRec.byMethod });
    if (sheet.totalVendido !== todayRec.totalSales) errors.push('buildCuadreSheet totalVendido');
  }

  crozzoCierreOpenCuadreStudio();
  ['crozzo-cuadre-docs', 'crozzo-cuadre-datafonos', 'crozzo-cuadre-efectivo', 'crozzo-cuadre-gastos'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === 'crozzo-cuadre-docs') el.value = '50000';
    else if (id === 'crozzo-cuadre-efectivo') el.value = '150000';
    else el.value = '0';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  if (typeof crozzoCierrePrintCuadreFromForm !== 'function') errors.push('crozzoCierrePrintCuadreFromForm ausente');
  if (typeof crozzoCierreDownloadCuadreBlank !== 'function') errors.push('crozzoCierreDownloadCuadreBlank ausente');
  const totalTxt = document.getElementById('crozzo-cuadre-total-sumado')?.textContent || '';
  if (!totalTxt.includes('200.000') && !totalTxt.includes('200000')) errors.push('total contado incorrecto: ' + totalTxt);

  const printFns = [
    'crozzoCierrePrintUltimoCuadre',
    'crozzoCierrePrintDiaReport',
    'crozzoCierrePrintVentasDia',
    'crozzoCierrePrintHistorial',
    'crozzoCierrePrintHistRow',
  ];
  printFns.forEach((fn) => {
    if (typeof globalThis[fn] !== 'function') errors.push(fn + ' no definida');
  });

  return {
    errors,
    keyOld,
    oldShift: oldRec && oldRec.shiftLabel,
    prepTotalReal: prep && prep.cuadreSheet && prep.cuadreSheet.totalReal,
    oldActual: oldRec && oldRec.actual,
  };
});

if (checks.errors.length) {
  console.error('FAIL:', checks.errors.join('; '));
  console.log(JSON.stringify(checks, null, 2));
  process.exitCode = 1;
} else {
  console.log('OK cierre print checks');
  console.log(JSON.stringify(checks, null, 2));
}

await browser.close();
server.close();
