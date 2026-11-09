import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const url = 'file:///' + join(root, 'app', 'Crozzo_POS_Completo.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const consoleErrors = [];
  const consoleWarnings = [];
  const consoleLogs = [];

  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error') consoleErrors.push(text);
    else if (msg.type() === 'warning') consoleWarnings.push(text);
    else consoleLogs.push(text);
  });

  page.on('pageerror', err => {
    consoleErrors.push('PAGEERROR: ' + err.message + '\n' + err.stack);
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Check if crozzoDeviceReportShow is defined
  const hasShow = await page.evaluate(() => typeof window.crozzoDeviceReportShow);
  const hasReport = await page.evaluate(() => typeof window.CrozzoDeviceReport);
  const hasFieldDiag = await page.evaluate(() => typeof window.CrozzoFieldDiagnostic);
  const hasPerf = await page.evaluate(() => typeof window.CrozzoPerformanceMetrics);

  console.log('=== DIAGNOSTICO ===');
  console.log('crozzoDeviceReportShow:', hasShow);
  console.log('CrozzoDeviceReport:', hasReport);
  console.log('CrozzoFieldDiagnostic:', hasFieldDiag);
  console.log('CrozzoPerformanceMetrics:', hasPerf);

  console.log('\n=== ERRORES DE CONSOLA (' + consoleErrors.length + ') ===');
  consoleErrors.forEach((e, i) => console.log((i+1) + '. ' + e));

  console.log('\n=== WARNINGS (' + consoleWarnings.length + ') ===');
  consoleWarnings.slice(0, 20).forEach((w, i) => console.log((i+1) + '. ' + w));

  // Try to click the report button
  try {
    await page.evaluate(() => {
      if (typeof window.crozzoDeviceReportShow === 'function') {
        window.crozzoDeviceReportShow();
        return 'OK';
      }
      return 'NOT DEFINED';
    }).then(r => console.log('\nClick result:', r));
  } catch (e) {
    console.log('Click error:', e.message);
  }

  await page.waitForTimeout(1000);

  // Check if menu appeared
  const menuExists = await page.evaluate(() => !!document.getElementById('crozzoReportMenu'));
  const panelExists = await page.evaluate(() => !!document.getElementById('crozzoDeviceReportPanel'));
  console.log('Menu exists:', menuExists);
  console.log('Panel exists:', panelExists);

  await browser.close();
})();
