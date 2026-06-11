/**
 * Genera docs/CROZZO-QA-REGRESION.pdf desde qa-regresion-report.json
 * node scripts/generate-qa-regresion-pdf.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'scripts', '_qa-out');
const docsDir = join(root, 'docs');
mkdirSync(docsDir, { recursive: true });

const reportPath = join(outDir, 'qa-regresion-report.json');
if (!existsSync(reportPath)) {
  console.error('Falta reporte. Ejecute: node scripts/run-qa-regresion.mjs');
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sevClass(sev) {
  if (sev === 'P0') return 'sev-p0';
  if (sev === 'P1') return 'sev-p1';
  return 'sev-p2';
}

function statusBadge(ok) {
  return ok ? '<span class="badge ok">OK</span>' : '<span class="badge fail">FAIL</span>';
}

const DEFAULT_SCORE = {
  overall: 72,
  label: 'Confianza para producción hoy',
  summary:
    'Muy buen producto en construcción; no nota de confianza total para hora pico hasta corregir P0.',
  breakdown: [
    { area: 'Navegación y cobertura funcional', score: 88, note: '46/46 pantallas cargan; sistema muy completo' },
    { area: 'Estabilidad en flujos críticos', score: 55, note: 'Cierre de caja roto; config crashea al guardar' },
    { area: 'Compras / proveedores / recepción', score: 70, note: 'Avance sólido; OCR offline y flujos recientes por validar' },
    { area: 'Planillas ↔ cierre / backoffice', score: 75, note: 'Lógica avanzada; falta probar en campo' },
    { area: 'Rendimiento y arranque', score: 78, note: '~3.8 s boot; ~4.8 MB JS — OK en PC, justo en tablet' },
    { area: 'Impresión / Tauri / móvil', score: 74, note: 'Impresión cierre OK en test; tablet/menú con dudas' },
    { area: 'Mantenibilidad / QA', score: 80, note: 'Scripts de auditoría, PDF regresión, arquitectura modular' },
  ],
  projections: [
    { condition: 'Corregir P0 (cierre + auditoría + control acceso)', score: '82–85' },
    { condition: '+ hardening offline, tablet y rush de caja', score: '88+' },
  ],
};

const score = report.score || DEFAULT_SCORE;

function scoreBarClass(n) {
  if (n >= 80) return 'bar-high';
  if (n >= 65) return 'bar-mid';
  return 'bar-low';
}

const scoreBreakdownRows = (score.breakdown || [])
  .map(
    (b) => `<tr>
      <td>${esc(b.area)}</td>
      <td class="score-num">${b.score}</td>
      <td><div class="score-bar-wrap"><div class="score-bar ${scoreBarClass(b.score)}" style="width:${b.score}%"></div></div></td>
      <td class="muted">${esc(b.note)}</td>
    </tr>`
  )
  .join('');

const projectionRows = (score.projections || [])
  .map((p) => `<tr><td>${esc(p.condition)}</td><td><strong>${esc(p.score)}</strong></td></tr>`)
  .join('');

const autoRows = (report.autoIssues || [])
  .map(
    (i) => `<tr>
      <td><span class="badge ${sevClass(i.severity)}">${esc(i.severity)}</span></td>
      <td><code>${esc(i.id || '—')}</code></td>
      <td>${esc(i.area)}</td>
      <td><strong>${esc(i.title)}</strong><br><span class="muted">${esc(i.detail)}</span></td>
      <td class="chk">☐</td>
    </tr>`
  )
  .join('');

const manualRows = (report.manualMatrix || [])
  .map(
    (m) => `<tr>
      <td><span class="badge ${sevClass(m.sev)}">${esc(m.sev)}</span></td>
      <td><code>${esc(m.id)}</code></td>
      <td>${esc(m.mod)}</td>
      <td>${esc(m.prueba)}</td>
      <td>${esc(m.esperado)}</td>
      <td class="chk">☐</td>
    </tr>`
  )
  .join('');

const scriptRows = (report.scriptRuns || [])
  .map(
    (s) => `<tr>
      <td>${esc(s.id)}</td>
      <td>${statusBadge(s.ok)}</td>
      <td>${s.ms} ms</td>
      <td class="muted">${esc(s.tail?.slice(0, 120) || '')}</td>
    </tr>`
  )
  .join('');

const clickDetail = (report.raw?.buttons?.clickIssues || [])
  .map(
    (pg) => `<div class="card">
      <h3>Pantalla: ${esc(pg.page)}</h3>
      <ul>${(pg.jsErrors || [])
        .map((e) => `<li><strong>${esc(e.label?.slice(0, 60))}</strong> — ${esc((e.errors || []).join('; '))}<br><code>${esc(e.onclick)}</code></li>`)
        .join('')}</ul>
    </div>`
  )
  .join('');

const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>Crozzo POS — QA Regresión</title>
<style>
  @page { margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; font-size: 10pt; color: #1a1a2e; line-height: 1.45; margin: 0; padding: 16px 20px; }
  h1 { font-size: 20pt; margin: 0 0 4px; color: #0f3460; }
  h2 { font-size: 13pt; margin: 22px 0 8px; color: #16213e; border-bottom: 2px solid #e94560; padding-bottom: 4px; page-break-after: avoid; }
  h3 { font-size: 11pt; margin: 12px 0 6px; }
  .meta { color: #555; font-size: 9pt; margin-bottom: 16px; }
  .kpis { display: flex; flex-wrap: wrap; gap: 10px; margin: 12px 0 20px; }
  .kpi { border: 1px solid #ddd; border-radius: 8px; padding: 10px 14px; min-width: 120px; background: #f8f9fc; }
  .kpi .lbl { font-size: 8pt; text-transform: uppercase; color: #666; }
  .kpi .val { font-size: 16pt; font-weight: 700; }
  .kpi.p0 .val { color: #c0392b; }
  .kpi.ok .val { color: #27ae60; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 9pt; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #0f3460; color: #fff; font-weight: 600; }
  tr:nth-child(even) td { background: #f9fafb; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 8pt; font-weight: 700; }
  .sev-p0 { background: #fdecea; color: #c0392b; }
  .sev-p1 { background: #fef9e7; color: #d68910; }
  .sev-p2 { background: #eaf2f8; color: #2471a3; }
  .badge.ok { background: #d5f5e3; color: #1e8449; }
  .badge.fail { background: #fadbd8; color: #922b21; }
  .muted { color: #666; font-size: 8.5pt; }
  .chk { text-align: center; font-size: 14pt; width: 36px; }
  .card { border: 1px solid #ddd; border-radius: 6px; padding: 10px; margin: 8px 0; page-break-inside: avoid; }
  code { font-size: 8pt; background: #f0f0f0; padding: 1px 4px; border-radius: 3px; }
  .legend { font-size: 9pt; margin: 8px 0; }
  .page-break { page-break-before: always; }
  ul { margin: 4px 0; padding-left: 18px; }
  .footer { margin-top: 24px; font-size: 8pt; color: #888; border-top: 1px solid #ddd; padding-top: 8px; }
  .score-hero { display: flex; gap: 20px; align-items: stretch; margin: 16px 0 20px; page-break-inside: avoid; }
  .score-main { flex: 0 0 140px; border: 2px solid #0f3460; border-radius: 12px; padding: 16px; text-align: center; background: linear-gradient(160deg, #f8f9fc 0%, #eef2ff 100%); }
  .score-main .big { font-size: 42pt; font-weight: 800; color: #0f3460; line-height: 1; }
  .score-main .of { font-size: 14pt; color: #666; }
  .score-main .lbl { font-size: 8pt; text-transform: uppercase; color: #555; margin-top: 8px; }
  .score-desc { flex: 1; border: 1px solid #ddd; border-radius: 12px; padding: 14px 16px; background: #fff; }
  .score-desc p { margin: 0 0 8px; }
  .score-num { font-weight: 700; text-align: center; width: 36px; }
  .score-bar-wrap { background: #eee; border-radius: 4px; height: 8px; min-width: 80px; }
  .score-bar { height: 8px; border-radius: 4px; }
  .bar-high { background: #27ae60; }
  .bar-mid { background: #f39c12; }
  .bar-low { background: #e74c3c; }
</style>
</head>
<body>
  <h1>Crozzo POS — Informe QA Regresión</h1>
  <div class="meta">
    Generado: ${esc(report.generatedAt)} · Versión pkg: ${esc(report.version)}<br>
    Uso: marque ☐ al verificar/corregir cada ítem. Priorice P0 → P1 → P2.
  </div>

  <div class="kpis">
    <div class="kpi p0"><div class="lbl">Issues P0 auto</div><div class="val">${report.summary?.autoIssuesP0 ?? 0}</div></div>
    <div class="kpi"><div class="lbl">Scripts OK</div><div class="val">${report.summary?.scriptsOk ?? 0}/${report.summary?.scriptsRun ?? 0}</div></div>
    <div class="kpi ok"><div class="lbl">Nav pantallas</div><div class="val">${report.summary?.navOk ?? '—'}/${report.summary?.navTotal ?? '—'}</div></div>
    <div class="kpi"><div class="lbl">Boot (ms)</div><div class="val">${report.summary?.bootLoadMs ?? '—'}</div></div>
    <div class="kpi"><div class="lbl">JS total (KB)</div><div class="val">${report.summary?.totalBootKb ? Math.round(report.summary.totalBootKb) : '—'}</div></div>
    <div class="kpi"><div class="lbl">Checks manuales</div><div class="val">${report.summary?.manualChecks ?? 0}</div></div>
  </div>

  <div class="legend">
    <strong>Leyenda:</strong>
    <span class="badge sev-p0">P0</span> Bloqueante &nbsp;
    <span class="badge sev-p1">P1</span> Importante &nbsp;
    <span class="badge sev-p2">P2</span> Menor / UX
  </div>

  <h2>0. Puntuación global del sistema</h2>
  <div class="score-hero">
    <div class="score-main">
      <div class="big">${score.overall}</div>
      <div class="of">/ 100</div>
      <div class="lbl">${esc(score.label)}</div>
    </div>
    <div class="score-desc">
      <p><strong>Resumen:</strong> ${esc(score.summary)}</p>
      <p class="muted">Escala: confianza operativa en producción hoy (no cantidad de código). Basado en auditoría QA del ${esc(report.generatedAt?.slice(0, 10) || '—')}.</p>
    </div>
  </div>
  <table>
    <thead><tr><th>Área</th><th>Nota</th><th></th><th>Comentario</th></tr></thead>
    <tbody>${scoreBreakdownRows}</tbody>
  </table>
  <table>
    <thead><tr><th>Si se corrige…</th><th>Puntaje proyectado</th></tr></thead>
    <tbody>${projectionRows}</tbody>
  </table>

  <h2>1. Resultado scripts automatizados</h2>
  <table>
    <thead><tr><th>Script</th><th>Estado</th><th>Tiempo</th><th>Nota</th></tr></thead>
    <tbody>${scriptRows}</tbody>
  </table>

  <h2>2. Hallazgos automáticos (corregir primero)</h2>
  <table>
    <thead><tr><th>Sev</th><th>ID</th><th>Área</th><th>Descripción</th><th>✓</th></tr></thead>
    <tbody>${autoRows || '<tr><td colspan="5">Sin hallazgos</td></tr>'}</tbody>
  </table>

  ${clickDetail ? `<h2>3. Detalle errores JS por clic</h2>${clickDetail}` : ''}

  <div class="page-break"></div>
  <h2>4. Checklist manual — pruebas humanas</h2>
  <p class="muted">Ejecutar en Web, Tauri Windows y APK Android cuando aplique.</p>
  <table>
    <thead><tr><th>Sev</th><th>ID</th><th>Módulo</th><th>Prueba</th><th>Esperado</th><th>✓</th></tr></thead>
    <tbody>${manualRows}</tbody>
  </table>

  <h2>5. Matriz entorno</h2>
  <table>
    <thead><tr><th>Caso</th><th>Web</th><th>Tauri</th><th>APK</th></tr></thead>
    <tbody>
      <tr><td>Lazy modules / pantalla blanca</td><td>☐</td><td>☐</td><td>☐</td></tr>
      <tr><td>OCR proveedores (con red)</td><td>☐</td><td>☐</td><td>☐</td></tr>
      <tr><td>OCR offline</td><td>☐</td><td>☐</td><td>☐</td></tr>
      <tr><td>Impresión cierre térmico</td><td>☐</td><td>☐</td><td>☐</td></tr>
      <tr><td>Recepción FE lote PDF</td><td>☐</td><td>☐</td><td>☐</td></tr>
      <tr><td>Planilla + cierre offline</td><td>☐</td><td>☐</td><td>☐</td></tr>
    </tbody>
  </table>

  <h2>6. Plantilla registro bug</h2>
  <div class="card">
    <p><strong>ID:</strong> QA-___ &nbsp; <strong>Fecha:</strong> ___ &nbsp; <strong>Tester:</strong> ___</p>
    <p><strong>Entorno:</strong> Web / Tauri / APK &nbsp; <strong>Módulo:</strong> ___</p>
    <p><strong>Pasos:</strong> 1) … 2) … 3) …</p>
    <p><strong>Esperado:</strong> … &nbsp; <strong>Actual:</strong> …</p>
    <p><strong>Severidad:</strong> P0 / P1 / P2 &nbsp; <strong>Reproducible:</strong> Siempre / A veces / No</p>
  </div>

  <div class="footer">
    Crozzo POS QA · Generado por scripts/run-qa-regresion.mjs + generate-qa-regresion-pdf.mjs
  </div>
</body>
</html>`;

const htmlPath = join(docsDir, 'CROZZO-QA-REGRESION.html');
const pdfPath = join(docsDir, 'CROZZO-QA-REGRESION.pdf');
writeFileSync(htmlPath, html, 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
await page.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
});
await browser.close();

console.log('HTML:', htmlPath);
console.log('PDF:', pdfPath);
