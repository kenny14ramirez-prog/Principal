#!/usr/bin/env node
/**
 * Agente QA "semihumanoide" profundo.
 * Recorre la app como un humano, captura consola/red/UI interna y produce
 * un análisis forense por paso + reporte Markdown + trace Playwright.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const root = path.join(path.dirname(__filename), '..');
const URL = process.env.QA_URL || 'http://localhost:1420';
const HEADLESS = process.env.QA_HEADLESS === 'true';
const PRESET = process.env.QA_PRESET || 'smoke';
const AGENTS = (process.env.QA_AGENTS || 'cajero').split(',').map(s => s.trim()).filter(Boolean);
const RUN_ID = `${PRESET}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const RUN_DIR = path.join(root, 'docs', 'reports', 'agent-runs', RUN_ID);
const STEPS_FILE = path.join(RUN_DIR, 'steps.jsonl');
const FINDINGS_FILE = path.join(RUN_DIR, 'findings.json');

fs.mkdirSync(RUN_DIR, { recursive: true });

const report = {
  runId: RUN_ID,
  preset: PRESET,
  agents: AGENTS,
  url: URL,
  startedAt: new Date().toISOString(),
  steps: [],
  findings: [],
  consoleErrors: [],
  networkFailures: [],
  screenshots: [],
};

function writeStep(step) {
  report.steps.push(step);
  fs.appendFileSync(STEPS_FILE, JSON.stringify(step) + '\n', 'utf8');
}

function finding(severity, phase, issue, detail, extra = {}) {
  const f = { phase, severity, issue, detail, time: new Date().toISOString(), ...extra };
  report.findings.push(f);
  return f;
}

function safeName(s) {
  return String(s).replace(/[^a-z0-9_-]/gi, '-').slice(0, 60);
}

async function captureInternalState(page) {
  try {
    return await page.evaluate(() => {
      const globals = Object.keys(window).filter(k => /^crozzo/i.test(k)).slice(0, 40);
      const ls = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k) ls[k] = (localStorage.getItem(k) || '').slice(0, 200);
        }
      } catch (_) {}
      return {
        title: document.title,
        url: location.href,
        globals,
        localStorage: ls,
        visibleButtons: Array.from(document.querySelectorAll('button,.btn,[role="button"]'))
          .map(b => (b.textContent || '').trim()).filter(Boolean).slice(0, 40),
      };
    });
  } catch (e) {
    return { error: e.message };
  }
}

async function step(page, context, { intent, action, fn, expected, phase }) {
  const idx = report.steps.length + 1;
  const before = await captureInternalState(page);
  const consoleBefore = report.consoleErrors.length;
  const netBefore = report.networkFailures.length;
  const screenshotName = `step-${String(idx).padStart(3, '0')}-${safeName(intent)}.png`;
  const screenshotPath = path.join(RUN_DIR, screenshotName);
  let verdict = 'PASS';
  let error = null;
  let actual = '';
  try {
    const r = await fn();
    actual = r == null ? 'OK' : String(r).slice(0, 500);
  } catch (e) {
    verdict = 'FAIL';
    error = e.message;
    actual = `EXCEPTION: ${e.message}`;
    finding('P0', phase, `${intent} falló`, e.message, { step: idx });
  }
  // screenshot (best effort)
  try { await page.screenshot({ path: screenshotPath, fullPage: false }); report.screenshots.push(screenshotName); } catch (_) {}
  const after = await captureInternalState(page);
  const consoleNew = report.consoleErrors.slice(consoleBefore);
  const netNew = report.networkFailures.slice(netBefore);
  if (consoleNew.length || netNew.length) {
    if (verdict === 'PASS') verdict = 'WARN';
  }
  const rec = {
    ts: new Date().toISOString(),
    runId: RUN_ID,
    step: idx,
    phase,
    intent,
    action,
    expected: expected || '',
    actual,
    verdict,
    error,
    screenshot: screenshotName,
    consoleErrorsNew: consoleNew.map(c => c.text?.slice(0, 300)),
    networkFailuresNew: netNew.map(n => ({ url: n.url, method: n.method, failure: n.failure })),
    stateBefore: before,
    stateAfter: after,
  };
  writeStep(rec);
  console.log(`[${verdict}] step ${idx}: ${intent}${error ? ' — ' + error : ''}`);
  return rec;
}

async function main() {
  console.log(`\n🤖 AGENTE PROFUNDO — run ${RUN_ID}\nURL: ${URL}\n`);
  const browser = await chromium.launch({ headless: HEADLESS, slowMo: 0 });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const sbUrl = process.env.QA_SUPABASE_URL || '';
  const sbKey = process.env.QA_SUPABASE_KEY || '';
  await context.addInitScript(({ sbUrl, sbKey }) => {
    try {
      localStorage.setItem('pos_dian_config', JSON.stringify({ seguridad: { requiereLogin: false } }));
      sessionStorage.setItem('crozzo_session_user', 'AGENTE');
      sessionStorage.setItem('crozzo_auth_proof_v1', '1');
      localStorage.setItem('crozzo_user_role', process.env.QA_ROLE || 'super_admin');
      localStorage.setItem('crozzo_device_paired_v1', '1');
      if (sbUrl && sbKey) {
        localStorage.setItem('crozzo_supabase_config', JSON.stringify({
          version: 1, syncEnabled: true, url: sbUrl, anonKey: sbKey, deviceId: 'agent-device', deviceName: 'Agente QA', savedAt: Date.now(),
        }));
      }
    } catch (_) {}
  }, { sbUrl, sbKey });
  // await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();

  const BENIGN = /ResizeObserver|Script error|Failed to fetch|NetworkError|supabase|Tauri|__TAURI|favicon|net::ERR/i;
  page.on('console', msg => {
    if (msg.type() === 'error') {
      report.consoleErrors.push({ type: 'error', text: msg.text(), time: new Date().toISOString(), benign: BENIGN.test(msg.text()) });
    }
  });
  page.on('requestfailed', req => {
    report.networkFailures.push({ url: req.url(), method: req.method(), failure: req.failure()?.errorText, time: new Date().toISOString(), benign: BENIGN.test(req.url() + ' ' + (req.failure()?.errorText||'')) });
  });

  const runStep = (opts) => step(page, context, opts);

  try {
    // F0
    await runStep({
      phase: 'F0-PREVUELO',
      intent: 'Cargar aplicación',
      action: 'navigate',
      expected: 'App carga sin pantalla en blanco',
      fn: async () => {
        await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);
        await page.evaluate(() => {
          const lo = document.getElementById('loginOverlay');
          if (lo) lo.setAttribute('hidden', '');
          const pair = document.getElementById('crozzoPairingOverlay');
          if (pair) pair.setAttribute('hidden', '');
          document.body.classList.remove('crozzo-login-open');
          if (typeof window.hideLoginOverlay === 'function') window.hideLoginOverlay();
          if (typeof window.crozzoClosePairingModal === 'function') window.crozzoClosePairingModal();
        }).catch(()=>{});
        await page.waitForTimeout(2000);
        const title = await page.title();
        return `title="${title}"`;
      },
    });

    // F1 Login
    await runStep({
      phase: 'F1-LOGIN',
      intent: 'Detectar y usar login',
      action: 'click',
      expected: 'Entra al POS',
      fn: async () => {
        const btn = page.locator('button, .btn, [role="button"]').filter({ hasText: /Entrar|Ingresar|Login/i }).first();
        if (await btn.count() === 0) return 'sin botón login (quizá ya logueado)';
        const u = page.locator('input[type="text"], input[name*="user" i], input[placeholder*="usuario" i]').first();
        const p = page.locator('input[type="password"]').first();
        if (await u.count()) await u.fill(process.env.QA_USER || 'admin').catch(() => {});
        if (await p.count()) await p.fill(process.env.QA_PASS || 'admin').catch(() => {});
        await btn.click();
        await page.waitForTimeout(5000);
        return 'login intentado';
      },
    });

    // F2 Apertura
    await runStep({
      phase: 'F2-APERTURA',
      intent: 'Abrir caja si se requiere',
      action: 'click',
      expected: 'Caja abierta o ya abierta',
      fn: async () => {
        const btn = page.locator('button, .btn, [role="button"]').filter({ hasText: /Abrir caja|Abrir turno|Iniciar turno/i }).first();
        if (await btn.count() === 0) return 'no requiere apertura';
        const monto = page.locator('input[type="number"]').first();
        if (await monto.count()) await monto.fill('100000').catch(() => {});
        await btn.click();
        await page.waitForTimeout(3000);
        return 'apertura intentada';
      },
    });

    // F3 Navegación
    await runStep({
      phase: 'F3-NAV',
      intent: 'Navegar a POS/mesas',
      action: 'click',
      expected: 'Vista POS visible',
      fn: async () => {
        const btn = page.locator('button, .btn, [role="button"]').filter({ hasText: /Mesas|POS|Venta directa/i }).first();
        if (await btn.count()) await btn.click().catch(() => {});
        await page.waitForTimeout(3000);
        return 'navegado';
      },
    });

    // F4 Tomar orden
    await runStep({
      phase: 'F4-VENTA',
      intent: 'Tomar una mesa/producto',
      action: 'click',
      expected: 'Mesa/producto seleccionado',
      fn: async () => {
        const mesa = page.locator('.mesa, .table, [data-mesa]').first();
        if (await mesa.count()) { await mesa.click().catch(() => {}); await page.waitForTimeout(2000); return 'mesa clickeada'; }
        const prod = page.locator('.producto, .product-item, .menu-item').first();
        if (await prod.count()) { await prod.click().catch(() => {}); await page.waitForTimeout(2000); return 'producto clickeado'; }
        return 'sin mesa/producto detectado';
      },
    });

    // F5 Comandar
    await runStep({
      phase: 'F5-COMANDA',
      intent: 'Enviar/comandar',
      action: 'click',
      expected: 'Comanda enviada',
      fn: async () => {
        const btn = page.locator('button, .btn, [role="button"]').filter({ hasText: /Comandar|Enviar|Guardar/i }).first();
        if (await btn.count() === 0) return 'sin botón comandar';
        if (!(await btn.isVisible().catch(()=>false))) return 'botón comandar no visible';
        await btn.click({ timeout: 5000 }).catch(()=>{});
        await page.waitForTimeout(3000);
        return 'comandar intentado';
      },
    });

    // F6 Cobro
    await runStep({
      phase: 'F6-COBRO',
      intent: 'Cobrar venta',
      action: 'click',
      expected: 'Cobro confirmado',
      fn: async () => {
        const btn = page.locator('button, .btn, [role="button"]').filter({ hasText: /^Cobrar$/i }).first();
        if (await btn.count() === 0) return 'sin botón cobrar';
        await btn.click();
        await page.waitForTimeout(3000);
        const ef = page.locator('button, .btn, [role="button"]').filter({ hasText: /Efectivo/i }).first();
        if (await ef.count()) await ef.click().catch(() => {});
        await page.waitForTimeout(2000);
        const conf = page.locator('button, .btn, [role="button"]').filter({ hasText: /Confirmar|Cobrar y|Aceptar/i }).first();
        if (await conf.count()) await conf.click().catch(() => {});
        await page.waitForTimeout(4000);
        return 'cobro intentado';
      },
    });

    // F7 Facturación (tu idea: intentar enviar factura electrónica + análisis interno)
    await runStep({
      phase: 'F7-FACTURACION',
      intent: 'Intentar facturación (cliente + factura + UBL/CUFE)',
      action: 'click',
      expected: 'Panel cliente/factura o CUFE',
      fn: async () => {
        const cli = page.locator('button, .btn, [role="button"]').filter({ hasText: /Cliente|Factur/i }).first();
        if (await cli.count() && await cli.isVisible().catch(()=>false)) await cli.click().catch(() => {});
        await page.waitForTimeout(2000);
        const nit = page.locator('input[placeholder*="NIT" i], input[name*="nit" i], input[placeholder*="cliente" i]').first();
        if (await nit.count()) await nit.fill(process.env.QA_NIT || '900000000').catch(() => {});
        await page.waitForTimeout(1000);
        const fact = page.locator('button, .btn, [role="button"]').filter({ hasText: /Facturar|Enviar factura|Emitir/i }).first();
        if (await fact.count() && await fact.isVisible().catch(()=>false)) {
          await fact.click().catch(() => {});
          await page.waitForTimeout(5000);
        }
        // Análisis interno: intentar construir UBL/CUFE en el navegador
        const internal = await page.evaluate(async () => {
          try {
            if (typeof buildUBL21 !== 'function' || typeof calcularCUFE !== 'function') return { available: false };
            const emp = { nit: '900123456', dv: '7', razonSocial: 'Test SAS', direccion: 'Calle 1' };
            const dian = { resolucion: '18760000001', prefijo: 'SETT', fechaDesde: '2025-01-01', fechaVencimiento: '2026-12-31', tipoDocumento: '01', tipoOperacion: '01' };
            const impuestos = { tarifasIVA: [{ rate: 0.19, description: 'General', activo: true }], responsableIVA: true };
            const factura = { consecutivo: 1, fechaEmision: new Date().toISOString(), tipoDocumento: '01', tipoOperacion: '01', compradorNit: '222222222', compradorNombre: 'Consumidor Final', items: [{ descripcion: 'Producto', cantidad: 1, precio: 10000 }], totalFactura: 10000 };
            const xml = buildUBL21({ ...factura, items: factura.items }, { empresa: emp, dian, impuestos });
            const cufe = await calcularCUFE({ ...factura, numeroResolucion: dian.resolucion, vendedorNit: emp.nit, totalFactura: 10000 });
            return { available: true, xmlLen: xml.length, hasInvoice: xml.includes('<Invoice'), cufe: String(cufe).slice(0, 20) };
          } catch (e) {
            return { available: true, error: e.message };
          }
        }).catch(e => ({ error: e.message }));
        if (internal && internal.error) finding('P1', 'F7-FACTURACION', 'UBL/CUFE falló', internal.error);
        return internal && internal.available ? `UBL ${internal.xmlLen || 0} bytes, CUFE ${internal.cufe || 'n/a'}` : 'sin funciones fiscales en runtime';
      },
    });

    // F8 Impresión (detectar ausencia)
    await runStep({
      phase: 'F8-IMPRESION',
      intent: 'Intentar imprimir comanda/cuenta',
      action: 'click',
      expected: 'Impresión o mensaje de no impresora',
      fn: async () => {
        const btn = page.locator('button, .btn, [role="button"]').filter({ hasText: /Imprimir|Print/i }).first();
        if (await btn.count() === 0) return 'sin botón imprimir detectado';
        await btn.click().catch(() => {});
        await page.waitForTimeout(4000);
        return 'impresión intentada (ver consola/red para errores)';
      },
    });

    // F9 Cierre
    await runStep({
      phase: 'F9-CIERRE',
      intent: 'Buscar cierre de caja',
      action: 'click',
      expected: 'Pantalla de cierre',
      fn: async () => {
        const btn = page.locator('button, .btn, [role="button"]').filter({ hasText: /Cierre|Arqueo|Cerrar turno/i }).first();
        if (await btn.count() === 0) return 'no encontrado en navegación visible';
        await btn.click().catch(() => {});
        await page.waitForTimeout(4000);
        return 'cierre intentado';
      },
    });

  } catch (err) {
    finding('P0', 'FATAL', 'Error fatal durante agente', err.message);
    console.error('FATAL:', err.message);
  } finally {
    const tracePath = path.join(RUN_DIR, 'trace.zip');
    try { await context.tracing.stop({ path: tracePath }); } catch (_) {}
    await page.screenshot({ path: path.join(RUN_DIR, 'final.png') }).catch(() => {});
    await browser.close();
  }

  report.finishedAt = new Date().toISOString();
  // findings.json
  fs.writeFileSync(FINDINGS_FILE, JSON.stringify(report, null, 2), 'utf8');

  // Markdown report
  const mdPath = path.join(RUN_DIR, 'REPORTE.md');
  let md = `# Reporte Agente Profundo\n\n`;
  md += `**Run:** ${RUN_ID}\n**Preset:** ${PRESET}\n**URL:** ${URL}\n**Inicio:** ${report.startedAt}\n**Fin:** ${report.finishedAt}\n\n`;
  md += `## Resumen\n- Pasos: ${report.steps.length}\n- Hallazgos: ${report.findings.length}\n- Errores consola: ${report.consoleErrors.length}\n- Fallos red: ${report.networkFailures.length}\n\n`;
  md += `## Hallazgos\n`;
  if (!report.findings.length) md += `✅ Sin hallazgos.\n\n`;
  else for (const f of report.findings) md += `- [${f.severity}] ${f.phase}: ${f.issue} — ${f.detail || ''}\n`;
  md += `\n## Pasos\n`;
  for (const s of report.steps) md += `- [${s.verdict}] ${s.step}. ${s.phase}: ${s.intent} → ${s.actual}\n`;
  md += `\n## Evidencia\nScreenshots/trace en: ${RUN_DIR}\n`;
  fs.writeFileSync(mdPath, md, 'utf8');

  console.log(`\n📄 Reporte: ${mdPath}`);
  console.log(`📊 Pasos: ${report.steps.length} | Hallazgos: ${report.findings.length} | Errores consola: ${report.consoleErrors.length} | Fallos red: ${report.networkFailures.length}`);

  // Exit code non-zero if P0 findings
  if (report.findings.some(f => f.severity === 'P0')) process.exitCode = 1;
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});