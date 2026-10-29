#!/usr/bin/env node
/**
 * QA Autónomo Cajero-Humano
 * Actúa como cajero real recorriendo UI paso a paso
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

const URL = process.env.QA_URL || 'http://localhost:1420';
const HEADLESS = process.env.QA_HEADLESS === 'true';
const REPORT_DIR = path.join(root, 'docs', 'reports');

fs.mkdirSync(REPORT_DIR, { recursive: true });

const report = {
  timestamp: new Date().toISOString(),
  url: URL,
  phases: [],
  findings: [],
  consoleErrors: [],
  networkFailures: []
};

function log(phase, msg, status='INFO') {
  console.log(`[${status}] [${phase}] ${msg}`);
  report.phases.push({ phase, msg, status, time: new Date().toISOString() });
}

function findButton(page, texts) {
  return page.locator('button, .btn, [role="button"]').filter({ hasText: new RegExp(texts.join('|'), 'i') }).first();
}

async function main() {
  console.log('🧑‍💼 QA CAJERO-HUMANO - INICIANDO REVISIÓN AUTÓNOMA\n');
  
  const browser = await chromium.launch({ headless: HEADLESS, slowMo: 300 });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  
  // Capturar consola
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      report.consoleErrors.push({ type: 'error', text, time: new Date().toISOString() });
      console.log('   [CONSOLE ERR]', text.substring(0, 100));
    }
  });
  
  // Capturar network failures
  page.on('requestfailed', req => {
    report.networkFailures.push({ url: req.url(), method: req.method(), failure: req.failure()?.errorText, time: new Date().toISOString() });
  });
  
  try {
    // F0
    log('F0-PREVUELO', 'Cargando aplicación...');
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);
    
    const title = await page.title();
    log('F0-PREVUELO', `Título: ${title}`, 'OK');
    
    // Screenshot
    await page.screenshot({ path: path.join(REPORT_DIR, `qa-f0-${Date.now()}.png`) });
    
    // F1 - Login
    log('F1-LOGIN', 'Buscando pantalla de login...');
    const entrarBtn = await findButton(page, ['Entrar', 'Ingresar', 'Login']);
    const entrarCount = await entrarBtn.count();
    
    if (entrarCount > 0) {
      log('F1-LOGIN', 'Pantalla login detectada', 'OK');
      // Intentar login con credenciales por defecto si existen inputs
      const userInput = page.locator('input[type="text"], input[name*="user"], input[placeholder*="usuario" i]').first();
      const passInput = page.locator('input[type="password"]').first();
      
      if (await userInput.count() > 0) {
        await userInput.fill(process.env.QA_USER || 'admin').catch(()=>{});
      }
      if (await passInput.count() > 0) {
        await passInput.fill(process.env.QA_PASS || 'admin').catch(()=>{});
      }
      
      await entrarBtn.click().catch(e => {
        report.findings.push({ phase: 'F1', severity: 'P0', issue: 'Botón Entrar no clickeable', detail: e.message });
      });
      await page.waitForTimeout(5000);
      log('F1-LOGIN', 'Login intentado', 'OK');
    } else {
      report.findings.push({ phase: 'F1', severity: 'P1', issue: 'No se detectó botón Entrar', detail: 'Puede ya estar logueado o UI diferente' });
    }
    
    await page.screenshot({ path: path.join(REPORT_DIR, `qa-f1-${Date.now()}.png`) });
    
    // F2 - Apertura
    log('F2-APERTURA', 'Verificando apertura de caja...');
    await page.waitForTimeout(3000);
    const abrirBtn = await findButton(page, ['Abrir caja', 'Abrir turno', 'Iniciar turno']);
    if (await abrirBtn.count() > 0) {
      log('F2-APERTURA', 'Modal apertura detectado', 'OK');
      // Rellenar monto si existe
      const montoInput = page.locator('input[type="number"]').first();
      if (await montoInput.count() > 0) {
        await montoInput.fill('100000').catch(()=>{});
      }
      await abrirBtn.click().catch(()=>{});
      await page.waitForTimeout(3000);
    } else {
      log('F2-APERTURA', 'No requiere apertura o ya abierta', 'OK');
    }
    
    // F3 - Mesas/Directa
    log('F3-NAVEGACION', 'Navegando a POS...');
    const mesasBtn = await findButton(page, ['Mesas', 'POS', 'Venta directa']);
    if (await mesasBtn.count() > 0) {
      await mesasBtn.first().click().catch(()=>{});
      await page.waitForTimeout(3000);
    }
    await page.screenshot({ path: path.join(REPORT_DIR, `qa-f3-${Date.now()}.png`) });
    
    // F4-F7 - Flujo venta básico
    log('F4-VENTA', 'Intentando tomar orden...');
    // Buscar primera mesa o producto
    const mesa = page.locator('.mesa, .table, [data-mesa]').first();
    if (await mesa.count() > 0) {
      await mesa.click().catch(()=>{});
      await page.waitForTimeout(2000);
    } else {
      const prod = page.locator('.producto, .product-item, .menu-item').first();
      if (await prod.count() > 0) {
        await prod.click().catch(()=>{});
        await page.waitForTimeout(2000);
      }
    }
    
    await page.screenshot({ path: path.join(REPORT_DIR, `qa-f4-${Date.now()}.png`) });
    
    // Comandar
    const comandarBtn = await findButton(page, ['Comandar', 'Enviar', 'Guardar']);
    if (await comandarBtn.count() > 0) {
      await comandarBtn.first().click().catch(e => {
        report.findings.push({ phase: 'F5', severity: 'P0', issue: 'Botón Comandar falló', detail: e.message });
      });
      await page.waitForTimeout(3000);
    }
    
    // Cobrar
    log('F6-COBRO', 'Intentando cobrar...');
    const cobrarBtn = await findButton(page, ['Cobrar']);
    if (await cobrarBtn.count() > 0) {
      await cobrarBtn.first().click().catch(()=>{});
      await page.waitForTimeout(3000);
      // Seleccionar efectivo
      const efectivoBtn = await findButton(page, ['Efectivo']);
      if (await efectivoBtn.count() > 0) {
        await efectivoBtn.first().click().catch(()=>{});
        await page.waitForTimeout(2000);
      }
      const confirmarCobro = await findButton(page, ['Confirmar', 'Cobrar y', 'Aceptar']);
      if (await confirmarCobro.count() > 0) {
        await confirmarCobro.first().click().catch(e => {
          report.findings.push({ phase: 'F6', severity: 'P0', issue: 'Confirmar cobro falló', detail: e.message });
        });
        await page.waitForTimeout(4000);
      }
    }
    
    await page.screenshot({ path: path.join(REPORT_DIR, `qa-f6-${Date.now()}.png`) });
    
    // F8 - Cierre
    log('F8-CIERRE', 'Buscando cierre de caja...');
    await page.waitForTimeout(2000);
    const cierreBtn = await findButton(page, ['Cierre', 'Arqueo', 'Cerrar turno']);
    if (await cierreBtn.count() > 0) {
      await cierreBtn.first().click().catch(()=>{});
      await page.waitForTimeout(4000);
      await page.screenshot({ path: path.join(REPORT_DIR, `qa-f8-${Date.now()}.png`) });
      log('F8-CIERRE', 'Pantalla cierre detectada', 'OK');
    } else {
      log('F8-CIERRE', 'No encontrado en navegación visible', 'WARN');
      report.findings.push({ phase: 'F8', severity: 'P1', issue: 'No se encontró opción Cierre de caja' });
    }
    
  } catch (err) {
    report.findings.push({ phase: 'ERROR', severity: 'P0', issue: 'Error fatal durante revisión', detail: err.message });
    log('ERROR', err.message, 'FAIL');
  }
  
  await page.screenshot({ path: path.join(REPORT_DIR, `qa-final-${Date.now()}.png`) });
  await browser.close();
  
  // Generar reporte
  const reportPath = path.join(REPORT_DIR, `QA-CAJERO-HUMANO-${new Date().toISOString().replace(/[:.]/g,'-')}.md`);
  let md = `# REPORTE QA AUTÓNOMO - CAJERO HUMANO\n\n`;
  md += `**Fecha:** ${report.timestamp}\n`;
  md += `**URL:** ${report.url}\n`;
  md += `**Modo:** ${HEADLESS ? 'Headless' : 'Visible'}\n\n`;
  md += `## Resumen\n\n`;
  md += `- Fases ejecutadas: ${report.phases.length}\n`;
  md += `- Hallazgos: ${report.findings.length}\n`;
  md += `- Errores consola: ${report.consoleErrors.length}\n`;
  md += `- Fallos red: ${report.networkFailures.length}\n\n`;
  
  md += `## Hallazgos\n\n`;
  if (report.findings.length === 0) {
    md += `✅ Sin hallazgos críticos detectados en recorrido básico\n\n`;
  } else {
    for (const f of report.findings) {
      md += `### [${f.severity}] ${f.phase} - ${f.issue}\n`;
      md += `**Detalle:** ${f.detail || 'N/A'}\n\n`;
    }
  }
  
  md += `## Errores Consola\n\n`;
  if (report.consoleErrors.length === 0) {
    md += `✅ Sin errores de consola\n\n`;
  } else {
    for (const e of report.consoleErrors.slice(0, 20)) {
      md += `- ${e.text.substring(0, 150)}\n`;
    }
    md += `\n`;
  }
  
  md += `## Fases ejecutadas\n\n`;
  for (const p of report.phases) {
    md += `- [${p.status}] **${p.phase}:** ${p.msg}\n`;
  }
  
  md += `\n## Evidencia\n\n`;
  md += `Screenshots en: \`docs/reports/\`\n\n`;
  md += `## Plan de acción\n\n`;
  md += `1. Revisar hallazgos P0 primero\n`;
  md += `2. Corregir botones rotos / modales atascados\n`;
  md += `3. Validar flujo completo en modo visible\n`;
  md += `4. Re-ejecutar QA tras correcciones\n`;
  
  fs.writeFileSync(reportPath, md);
  console.log(`\n📄 Reporte generado: ${reportPath}`);
  console.log(`📊 Hallazgos: ${report.findings.length} | Errores consola: ${report.consoleErrors.length}`);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
