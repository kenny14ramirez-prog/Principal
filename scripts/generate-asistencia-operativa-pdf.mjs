/**
 * Genera docs/CROZZO-AUDITORIA-ASISTENCIA-OPERATIVA.pdf
 * node scripts/generate-asistencia-operativa-pdf.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, statSync, readFileSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = join(root, 'docs');
mkdirSync(docsDir, { recursive: true });

const htmlPath = join(docsDir, 'CROZZO-AUDITORIA-ASISTENCIA-OPERATIVA.html');
const pdfPath = join(docsDir, 'CROZZO-AUDITORIA-ASISTENCIA-OPERATIVA.pdf');

let version = '1.0.175';
try {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  version = pkg.version || version;
} catch (_) {}

if (!statSync(htmlPath, { throwIfNoEntry: false })) {
  console.error('Falta HTML:', htmlPath);
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle' });
await page.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  margin: { top: '10mm', bottom: '12mm', left: '10mm', right: '10mm' },
  displayHeaderFooter: true,
  headerTemplate:
    '<div style="font-size:7px;width:100%;text-align:center;color:#94a3b8;padding-top:2mm">Crozzo POS v' +
    version +
    ' — Auditoría asistencia operativa</div>',
  footerTemplate:
    '<div style="font-size:7px;width:100%;text-align:center;color:#94a3b8;padding-bottom:2mm">Pág. <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
});
await browser.close();

const pdfStat = statSync(pdfPath);
const htmlStat = statSync(htmlPath);
console.log('HTML:', htmlPath, `(${(htmlStat.size / 1024).toFixed(1)} KB)`);
console.log('PDF:', pdfPath, `(${(pdfStat.size / 1024).toFixed(1)} KB)`);
if (pdfStat.size < 15000) {
  console.warn('Advertencia: PDF muy pequeño');
  process.exitCode = 1;
} else {
  console.log('OK — PDF generado');
}
