/**
 * Genera docs/CROZZO-MAPA-CONEXIONES.pdf desde el HTML del mapa.
 * Requiere: npx playwright (chromium).
 */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = join(root, 'docs', 'CROZZO-MAPA-CONEXIONES.html');
const pdfPath = join(root, 'docs', 'CROZZO-MAPA-CONEXIONES.pdf');

const html = readFileSync(htmlPath, 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
await page.pdf({
  path: pdfPath,
  format: 'A2',
  landscape: true,
  printBackground: true,
  margin: { top: '6mm', right: '6mm', bottom: '6mm', left: '6mm' },
});
await browser.close();

console.log('PDF generado:', pdfPath);
