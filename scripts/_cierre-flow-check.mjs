/**
 * Smoke test — flujo cierre de caja (arqueo mañana).
 * node scripts/_cierre-flow-check.mjs
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

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

await page.addInitScript(() => {
  localStorage.setItem(
    'pos_dian_config',
    JSON.stringify({
      seguridad: { requiereLogin: false },
      operacion: { modo: 'demo' },
    })
  );
  sessionStorage.setItem('crozzo_session_user', 'KENNY');
  sessionStorage.setItem('crozzo_auth_proof_v1', '1');
  localStorage.setItem('crozzo_user_role', 'super_admin');
  localStorage.removeItem('crozzo_day_session_v2');
  localStorage.removeItem('crozzo_shift_turn_v1');
  localStorage.removeItem('crozzo_shift_turn_history_v1');
  window.__CROZZO_IS_TAURI__ = true;
  window.__TAURI__ = window.__TAURI__ || { core: { invoke: () => Promise.resolve({ ok: true, saved_path: '/mock/cierre.pdf' }) } };
  window.__crozzoSkipNoviceArqueoGuard = true;
  window.confirm = () => true;
});

await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(5000);

if (await page.locator('#loginOverlay:not([hidden])').count()) {
  await page.evaluate(async () => {
    if (typeof loginWithCredentials === 'function') await loginWithCredentials('KENNY', '141414');
  });
  await page.waitForTimeout(2000);
}

const seed = await page.evaluate(() => {
  function localTodayKey() {
    var x = new Date();
    return (
      x.getFullYear() +
      '-' +
      String(x.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(x.getDate()).padStart(2, '0')
    );
  }
  var today = localTodayKey();
  var nowIso = new Date().toISOString();
  var factura = {
    uuid: 'test-cierre-' + Date.now(),
    consecutivo: 'T-001',
    fecha: nowIso,
    fechaEmision: nowIso,
    estado: 'pos',
    total: 50000,
    metodoPago: 'efectivo',
    items: [{ id: 1, nombre: 'Test', cantidad: 1, precio: 50000 }],
  };
  try {
    localStorage.removeItem('crozzo_shift_turn_history_v1');
    localStorage.setItem(
      'crozzo_day_session_v2',
      JSON.stringify({
        businessDate: today,
        openedAt: nowIso,
        closedAt: null,
        autoClosed: false,
        activeShift: 'manana',
        shifts: {
          manana: { type: 'manana', openedAt: nowIso, closedAt: null, status: 'open' },
          tarde: { type: 'tarde', openedAt: null, closedAt: null, status: 'pending' },
          dia: { type: 'dia', openedAt: null, closedAt: null, status: 'pending' },
        },
      })
    );
    localStorage.setItem(
      'crozzo_shift_turn_v1',
      JSON.stringify({
        id: 'TRN-TEST01',
        openedAt: nowIso,
        cashOpen: 100000,
        closed: false,
        businessDate: today,
        shiftType: 'manana',
      })
    );
    if (typeof config !== 'undefined' && config.set) {
      config.set('facturas', [factura]);
      config.set('facturasFiscal', [factura]);
    }
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
  return { ok: true, today, histBefore: JSON.parse(localStorage.getItem('crozzo_shift_turn_history_v1') || '[]').length };
});

if (!seed.ok) throw new Error('Seed falló: ' + (seed.error || 'unknown'));

await page.evaluate(() => {
  if (typeof navigateTo === 'function') navigateTo('cierre-caja');
});
await page.waitForTimeout(2000);

const kpiBefore = await page.textContent('#crozzo-cierre-kpi-day-total');
if (!kpiBefore || kpiBefore.includes('$0')) {
  console.warn('WARN: ventas del día en $0 — factura de prueba puede no haber cargado');
}

await page.evaluate(() => {
  if (typeof crozzoShiftOpenArqueoType === 'function') crozzoShiftOpenArqueoType('manana');
});
await page.waitForTimeout(400);

const modalOpen = await page.evaluate(() => {
  const ov = document.getElementById('crozzo-shift-arqueo');
  return ov && !ov.hidden;
});
if (!modalOpen) throw new Error('Modal de arqueo no abrió');

await page.fill('#crozzo-shift-fondo', '100000');
await page.fill('#crozzo-shift-count', '150000');
const flow = await page.evaluate(() => {
  if (typeof crozzoShiftCalcArqueo === 'function') crozzoShiftCalcArqueo();
  const step2 = document.getElementById('crozzo-shift-step2')?.classList.contains('is-active');
  const pending = !!window.__arqueoPending;
  const before = JSON.parse(localStorage.getItem('crozzo_shift_turn_history_v1') || '[]').length;
  var notes = document.getElementById('crozzo-shift-notes');
  if (notes) notes.value = 'QA smoke test cierre';
  if (typeof crozzoShiftFinalize === 'function') crozzoShiftFinalize();
  const after = JSON.parse(localStorage.getItem('crozzo_shift_turn_history_v1') || '[]').length;
  return { step2, pending, before, after };
});
if (!flow.step2) throw new Error('Paso 2 del arqueo no activó');
if (flow.after <= flow.before) {
  throw new Error(
    'Finalize no guardó historial (before=' + flow.before + ' after=' + flow.after + ' pending=' + flow.pending + ')'
  );
}
await page.waitForTimeout(800);

const result = await page.evaluate(() => {
  const hist = JSON.parse(localStorage.getItem('crozzo_shift_turn_history_v1') || '[]');
  const day = JSON.parse(localStorage.getItem('crozzo_day_session_v2') || '{}');
  const rec = hist[0];
  return {
    histLen: hist.length,
    shiftType: rec?.shiftType,
    diff: rec?.diff,
    expected: rec?.expected,
    actual: rec?.actual,
    mananaClosed: day?.shifts?.manana?.status,
    tardeOpen: day?.shifts?.tarde?.status,
    modalHidden: document.getElementById('crozzo-shift-arqueo')?.hidden,
    pillManana: document.getElementById('crozzo-cierre-pill-manana')?.textContent?.trim(),
  };
});

const errors = [];
if (result.histLen < 1) errors.push('historial vacío tras cierre');
if (result.shiftType !== 'manana') errors.push('shiftType esperado manana, got ' + result.shiftType);
if (result.actual !== 150000) errors.push('actual=' + result.actual);
if (result.mananaClosed !== 'closed') errors.push('mañana status=' + result.mananaClosed);
if (result.tardeOpen !== 'open') errors.push('tarde no abrió automáticamente: ' + result.tardeOpen);
if (!result.modalHidden) errors.push('modal sigue visible');

await page.evaluate(() => {
  if (typeof crozzoShiftOpenArqueoType === 'function') crozzoShiftOpenArqueoType('manana');
});
await page.waitForTimeout(200);
const dupBlocked = await page.evaluate(() => {
  const ov = document.getElementById('crozzo-shift-arqueo');
  return ov?.hidden !== false;
});
if (!dupBlocked) errors.push('permitió abrir arqueo de turno ya cerrado');

if (errors.length) {
  console.error('FAIL:', errors.join('; '));
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = 1;
} else {
  console.log('OK cierre de caja');
  console.log(JSON.stringify(result, null, 2));
}

await browser.close();
server.close();
