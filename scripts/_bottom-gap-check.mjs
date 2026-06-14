/**
 * Diagnóstico: franja inferior en layout Tauri/touch.
 * Simula shell móvil y mide hueco bajo .app-container.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = join(root, 'src', 'index.html');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 820 } });

await page.goto('file:///' + html.replace(/\\/g, '/'));
await page.evaluate(() => {
  localStorage.setItem('crozzo_dev_mobile', '1');
  document.documentElement.classList.add(
    'tauri-shell',
    'crozzo-touch-shell',
    'crozzo-compact-chrome',
    'crozzo-vp-ready',
    'crozzo-vp-tauri-fill',
    'crozzo-form-mobile'
  );
  document.documentElement.setAttribute('data-crozzo-touch-tier', 'phone');
  document.body.classList.add('mobile', 'tauri-shell', 'crozzo-touch-shell', 'crozzo-app-ready');
  if (window.CrozzoViewportFit && typeof window.CrozzoViewportFit.apply === 'function') {
    window.CrozzoViewportFit.apply();
  }
  if (typeof window.crozzoApplyFormFactorClasses === 'function') {
    window.crozzoApplyFormFactorClasses();
  }
});

await page.waitForTimeout(800);

const metrics = await page.evaluate(() => {
  const vh = window.innerHeight;
  const html = document.documentElement;
  const body = document.body;
  const app = document.querySelector('.app-container');
  const main = document.querySelector('.main-content');
  const rHtml = html.getBoundingClientRect();
  const rBody = body.getBoundingClientRect();
  const rApp = app ? app.getBoundingClientRect() : null;
  const rMain = main ? main.getBoundingClientRect() : null;
  const cs = (el) => (el ? getComputedStyle(el) : null);
  return {
    innerHeight: vh,
    htmlBottom: rHtml.bottom,
    bodyBottom: rBody.bottom,
    appBottom: rApp ? rApp.bottom : null,
    mainBottom: rMain ? rMain.bottom : null,
    gapBelowApp: rApp ? vh - rApp.bottom : null,
    gapBelowBody: vh - rBody.bottom,
    classes: html.className,
    contentH: cs(html).getPropertyValue('--crozzo-content-h'),
    touchNavH: cs(html).getPropertyValue('--crozzo-touch-nav-h'),
    mainPadBottom: main ? cs(main).paddingBottom : null,
  };
});

console.log(JSON.stringify(metrics, null, 2));
const ok = metrics.gapBelowApp != null && Math.abs(metrics.gapBelowApp) < 4;
console.log(ok ? 'OK: sin franja inferior' : 'FALLO: franja inferior ~' + Math.round(metrics.gapBelowApp) + 'px');
await browser.close();
process.exit(ok ? 0 : 1);
