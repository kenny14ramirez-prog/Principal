/**
 * Agente QA Maestro — revisión punta a punta de la app como humano.
 * Navega todas las páginas del menú, captura errores/red/UI y sugiere mejoras.
 * Uso: node scripts/qa-agente-maestro.mjs [--headless]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const root = path.join(path.dirname(__filename), '..');
const URL = process.env.QA_URL || 'http://localhost:1420';
const HEADLESS = process.argv.includes('--headless') || process.env.QA_HEADLESS === 'true';
const RUN_ID = `maestro-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const RUN_DIR = path.join(root, 'docs', 'reports', 'agent-runs', RUN_ID);
fs.mkdirSync(RUN_DIR, { recursive: true });

const report = {
  runId: RUN_ID,
  url: URL,
  startedAt: new Date().toISOString(),
  pages: [],
  consoleErrors: [],
  networkFailures: [],
  suggestions: [],
  summary: { total: 0, ok: 0, warn: 0, fail: 0 },
};

function writeReport() {
  fs.writeFileSync(path.join(RUN_DIR, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
}

async function main() {
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') report.consoleErrors.push({ text: msg.text(), time: new Date().toISOString() });
  });
  page.on('requestfailed', req => {
    report.networkFailures.push({ url: req.url(), failure: req.failure()?.errorText, time: new Date().toISOString() });
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // Smoke login
  try {
    await page.evaluate(() => { try { sessionStorage.setItem('crozzo_session_user', 'SMOKE'); } catch (_) {} });
  } catch (_) {}

  // Obtener lista de páginas
  const pages = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.nav-item[data-page]'))
      .map(el => el.getAttribute('data-page'))
      .filter(Boolean);
  });

  // Dedup
  const uniquePages = [...new Set(pages)];

  for (const pg of uniquePages) {
    const start = Date.now();
    let status = 'ok';
    const errorsBefore = report.consoleErrors.length;
    const netBefore = report.networkFailures.length;
    try {
      await page.evaluate((p) => { if (typeof window.navigateTo === 'function') window.navigateTo(p); }, pg);
      const slow = process.env.QA_SLOW === '1' ? 3 : 1;
  await page.waitForTimeout(1200 * slow);
    } catch (e) {
      status = 'fail';
      report.consoleErrors.push({ text: `navigateTo(${pg}) threw: ${e.message}`, time: new Date().toISOString() });
    }
    const elapsed = Date.now() - start;
    const newErrors = report.consoleErrors.length - errorsBefore;
    const newNet = report.networkFailures.length - netBefore;

    // Screenshot
    const shot = path.join(RUN_DIR, `${pg}.png`);
    try { await page.screenshot({ path: shot, fullPage: false }); report.pages.push({ page: pg, status, elapsed, newErrors, newNet, screenshot: path.basename(shot) }); } catch (_) {
      report.pages.push({ page: pg, status, elapsed, newErrors, newNet });
    }

    if (newErrors > 0 || newNet > 0) status = 'warn';
    if (status === 'fail') report.summary.fail++;
    else if (status === 'warn') report.summary.warn++;
    else report.summary.ok++;
    report.summary.total++;

    // Sugerencias
    if (newErrors > 0) report.suggestions.push({ page: pg, type: 'bug', detail: `${newErrors} errores de consola al navegar` });
    if (elapsed > 4000) report.suggestions.push({ page: pg, type: 'perf', detail: `Carga lenta (${elapsed}ms)` });
    const hasEmpty = await page.evaluate(() => !!document.querySelector('.crozzo-empty-state'));
    if (hasEmpty) report.suggestions.push({ page: pg, type: 'ux', detail: 'Estado vacío detectado — verificar copy premium' });
  }

  report.finishedAt = new Date().toISOString();
  writeReport();

  // Markdown summary
  const md = `# Agente Maestro — ${RUN_ID}\n\nPáginas: ${report.summary.total} | OK: ${report.summary.ok} | Warn: ${report.summary.warn} | Fail: ${report.summary.fail}\n\n## Sugerencias\n${report.suggestions.map(s => `- [${s.type}] ${s.page}: ${s.detail}`).join('\n') || '(ninguna)'}\n\n## Errores de consola\n${report.consoleErrors.slice(0, 20).map(e => `- ${e.text}`).join('\n') || '(ninguno)'}\n`;
  fs.writeFileSync(path.join(RUN_DIR, 'report.md'), md, 'utf8');

  if (!HEADLESS) {
    await page.waitForTimeout(15000);
  }
  await browser.close();
  console.log(`Agente Maestro: ${report.summary.total} páginas, OK=${report.summary.ok}, Warn=${report.summary.warn}, Fail=${report.summary.fail}`);
  console.log(`Reporte: ${RUN_DIR}`);
}

main().catch(e => { console.error(e); process.exit(1); });