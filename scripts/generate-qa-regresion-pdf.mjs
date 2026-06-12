/**
 * Genera docs/CROZZO-QA-REGRESION.pdf desde qa-regresion-report.json
 * node scripts/generate-qa-regresion-pdf.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { QA_PLATFORMS } from './lib/qa-platforms.mjs';
import {
  scoreGaugeSvg,
  horizontalBarChartSvg,
  donutChartSvg,
  radarChartSvg,
  projectionLadderSvg,
  scriptTimingSvg,
  syncHeatmapSvg,
} from './lib/qa-charts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'scripts', '_qa-out');
const docsDir = join(root, 'docs');
mkdirSync(outDir, { recursive: true });
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

function scoreBarClass(n) {
  if (n >= 80) return 'bar-high';
  if (n >= 65) return 'bar-mid';
  return 'bar-low';
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
const platforms = report.platforms || QA_PLATFORMS;
const summary = report.summary || {};

const p0 = (report.autoIssues || []).filter((i) => i.severity === 'P0').length;
const p1 = (report.autoIssues || []).filter((i) => i.severity === 'P1').length;
const p2 = (report.autoIssues || []).filter((i) => i.severity === 'P2').length;
const scriptsOk = summary.scriptsOk ?? (report.scriptRuns || []).filter((r) => r.ok).length;
const scriptsFail = summary.scriptsFail ?? (report.scriptRuns || []).filter((r) => !r.ok).length;

const AREA_SHORT = {
  'Navegación y cobertura funcional': 'Navegación',
  'Estabilidad en flujos críticos': 'Estabilidad',
  'Compras / proveedores / recepción': 'Compras / recepción',
  'Planillas ↔ cierre / backoffice': 'Planillas / cierre',
  'Rendimiento y arranque': 'Rendimiento',
  'Impresión / Tauri / móvil': 'Impresión / móvil',
  'Mantenibilidad / QA': 'Mantenibilidad / QA',
};

const charts = {
  gauge: scoreGaugeSvg(score.overall, { size: 150, label: 'Global' }),
  areasBar: horizontalBarChartSvg(
    (score.breakdown || []).map((b) => ({
      label: AREA_SHORT[b.area] || b.area,
      value: b.score,
    })),
    { title: 'Puntaje por área funcional', width: 540, padLeft: 148 }
  ),
  areasRadar: radarChartSvg(
    (score.breakdown || []).map((b) => ({
      label: (AREA_SHORT[b.area] || b.area).slice(0, 14),
      value: b.score,
    }))
  ),
  platformsBar: horizontalBarChartSvg(
    (platforms.platforms || []).map((p) => ({
      label: p.name.replace('Tauri ', '').replace(' (Chrome/Edge)', ''),
      value: p.score,
    })),
    { title: 'Puntaje por plataforma', width: 540, padLeft: 130 }
  ),
  severityDonut: donutChartSvg(
    [
      { label: 'P0 Bloqueante', value: summary.autoIssuesP0 ?? p0, color: '#e74c3c' },
      { label: 'P1 Auto', value: (report.autoIssues || []).filter((i) => i.severity === 'P1').length, color: '#f39c12' },
      { label: 'Checks manuales', value: summary.manualChecks ?? 0, color: '#3498db' },
    ].filter((s) => s.value > 0),
    { centerLabel: String(summary.autoIssuesP0 ?? p0), centerSub: 'P0 críticos' }
  ),
  scriptsDonut: donutChartSvg(
    [
      { label: 'Scripts OK', value: scriptsOk, color: '#27ae60' },
      { label: 'Scripts FAIL', value: scriptsFail, color: '#e74c3c' },
    ].filter((s) => s.value > 0),
    { centerLabel: `${scriptsOk}/${scriptsOk + scriptsFail}`, centerSub: 'scripts' }
  ),
  projection: projectionLadderSvg([
    { label: 'Hoy', score: String(score.overall), value: score.overall },
    { label: 'Tras P0', score: '82–85', value: 84 },
    { label: 'Hardening', score: '88+', value: 89 },
  ]),
  scriptTiming: scriptTimingSvg(report.scriptRuns || []),
  syncHeatmap: syncHeatmapSvg(platforms.syncMatrix || []),
};

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

const platformScoreRows = (platforms.platforms || [])
  .map(
    (p) => `<tr>
      <td><strong>${esc(p.name)}</strong><br><span class="muted">${esc(p.role)}</span></td>
      <td class="score-num">${p.score}</td>
      <td><div class="score-bar-wrap"><div class="score-bar ${scoreBarClass(p.score)}" style="width:${p.score}%"></div></div></td>
      <td class="muted"><code>${esc(p.detect)}</code></td>
    </tr>`
  )
  .join('');

const platformDetailBlocks = (platforms.platforms || [])
  .map(
    (p) => `<div class="card plat-card">
      <h3>${esc(p.name)} — <span class="score-inline">${p.score}/100</span></h3>
      <p class="muted">${esc(p.role)} · <code>${esc(p.detect)}</code></p>
      <p><strong>Fuerte:</strong> ${esc((p.strong || []).join(' · '))}</p>
      <p><strong>Débil:</strong> ${esc((p.weak || []).join(' · '))}</p>
      <table class="chk-table">
        <thead><tr><th>Checklist</th><th>✓</th></tr></thead>
        <tbody>${(p.checklist || [])
          .map((c) => `<tr><td>${esc(c)}</td><td class="chk">☐</td></tr>`)
          .join('')}</tbody>
      </table>
    </div>`
  )
  .join('');

const viewportRows = (platforms.viewports || [])
  .map(
    (v) => `<tr><td><code>${esc(v.id)}</code></td><td>${esc(v.label)}</td><td>${esc(v.size)}</td><td><code>${esc(v.class)}</code></td><td class="chk">☐</td></tr>`
  )
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

const dateStr = esc(report.generatedAt?.slice(0, 10) || '—');

const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>Crozzo POS — QA Regresión</title>
<style>
  @page { margin: 10mm; size: A4; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; font-size: 10pt; color: #1a1a2e; line-height: 1.45; margin: 0; padding: 0; background: #fff; }
  .cover { background: linear-gradient(135deg, #0f3460 0%, #16213e 55%, #1a1a2e 100%); color: #fff; padding: 28px 24px 24px; margin: 0 0 20px; page-break-after: avoid; }
  .cover h1 { font-size: 22pt; margin: 0 0 6px; color: #fff; letter-spacing: -0.02em; }
  .cover .sub { font-size: 10pt; opacity: 0.88; margin: 0; }
  .cover-meta { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 16px; font-size: 9pt; opacity: 0.92; }
  .cover-meta span { background: rgba(255,255,255,0.12); padding: 4px 10px; border-radius: 20px; }
  .body-pad { padding: 0 20px 20px; }
  h2 { font-size: 13pt; margin: 20px 0 8px; color: #16213e; border-bottom: 2px solid #e94560; padding-bottom: 4px; page-break-after: avoid; }
  h3 { font-size: 11pt; margin: 12px 0 6px; color: #0f3460; page-break-after: avoid; }
  .meta { color: #555; font-size: 9pt; margin-bottom: 12px; }
  .kpis { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 16px; }
  .kpi { border: 1px solid #dde3ed; border-radius: 10px; padding: 8px 12px; min-width: 100px; background: #f8fafc; flex: 1; }
  .kpi .lbl { font-size: 7pt; text-transform: uppercase; color: #64748b; letter-spacing: 0.04em; }
  .kpi .val { font-size: 15pt; font-weight: 700; color: #0f3460; }
  .kpi.p0 .val { color: #c0392b; }
  .kpi.ok .val { color: #27ae60; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; font-size: 9pt; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #0f3460; color: #fff; font-weight: 600; }
  tr:nth-child(even) td { background: #f8fafc; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 8pt; font-weight: 700; }
  .sev-p0 { background: #fdecea; color: #c0392b; }
  .sev-p1 { background: #fef9e7; color: #d68910; }
  .sev-p2 { background: #eaf2f8; color: #2471a3; }
  .badge.ok { background: #d5f5e3; color: #1e8449; }
  .badge.fail { background: #fadbd8; color: #922b21; }
  .muted { color: #64748b; font-size: 8.5pt; }
  .chk { text-align: center; font-size: 14pt; width: 36px; }
  .card { border: 1px solid #dde3ed; border-radius: 8px; padding: 10px 12px; margin: 8px 0; page-break-inside: avoid; background: #fff; }
  code { font-size: 8pt; background: #f1f5f9; padding: 1px 4px; border-radius: 3px; }
  .legend { font-size: 9pt; margin: 8px 0 12px; }
  .page-break { page-break-before: always; }
  ul { margin: 4px 0; padding-left: 18px; }
  .footer { margin-top: 20px; font-size: 8pt; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  .score-hero { display: flex; gap: 16px; align-items: stretch; margin: 0 0 16px; page-break-inside: avoid; }
  .score-main-wrap { flex: 0 0 auto; display: flex; align-items: center; justify-content: center; background: #f8fafc; border: 1px solid #dde3ed; border-radius: 12px; padding: 8px; }
  .score-desc { flex: 1; border: 1px solid #dde3ed; border-radius: 12px; padding: 12px 14px; background: #fff; }
  .score-desc p { margin: 0 0 6px; }
  .score-num { font-weight: 700; text-align: center; width: 36px; }
  .score-bar-wrap { background: #e2e8f0; border-radius: 4px; height: 8px; min-width: 80px; }
  .score-bar { height: 8px; border-radius: 4px; }
  .bar-high { background: #27ae60; }
  .bar-mid { background: #f39c12; }
  .bar-low { background: #e74c3c; }
  .score-inline { color: #0f3460; font-size: 11pt; }
  .plat-card h3 { margin-top: 0; }
  .chk-table { margin: 8px 0 0; font-size: 8.5pt; }
  .chk-table th { background: #334155; }
  .policy { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 10px 12px; margin: 10px 0; font-size: 9pt; }
  .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 12px 0 16px; page-break-inside: avoid; }
  .charts-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin: 12px 0; }
  .chart-box { border: 1px solid #dde3ed; border-radius: 10px; padding: 10px; background: #fafbfc; page-break-inside: avoid; overflow: hidden; }
  .chart-box.full { grid-column: 1 / -1; }
  .chart-box h4 { margin: 0 0 8px; font-size: 9pt; color: #0f3460; text-transform: uppercase; letter-spacing: 0.03em; }
  .chart-svg { display: block; max-width: 100%; height: auto; }
  .chart-center { display: flex; justify-content: center; align-items: center; }
  @media print {
    .cover { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .chart-box, .kpi, th, .score-bar, .badge { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="cover">
    <h1>Crozzo POS — Informe QA Regresión</h1>
    <p class="sub">Auditoría multi-plataforma · Gráficas y checklist operativo</p>
    <div class="cover-meta">
      <span>📅 ${dateStr}</span>
      <span>📦 v${esc(report.version)}</span>
      <span>🎯 Puntaje ${score.overall}/100</span>
      <span>🖥 ${summary.navOk ?? '—'}/${summary.navTotal ?? '—'} pantallas</span>
    </div>
  </div>

  <div class="body-pad">
    <div class="kpis">
      <div class="kpi p0"><div class="lbl">P0 auto</div><div class="val">${summary.autoIssuesP0 ?? p0}</div></div>
      <div class="kpi"><div class="lbl">Scripts OK</div><div class="val">${scriptsOk}/${scriptsOk + scriptsFail}</div></div>
      <div class="kpi ok"><div class="lbl">Nav OK</div><div class="val">${summary.navOk ?? '—'}/${summary.navTotal ?? '—'}</div></div>
      <div class="kpi"><div class="lbl">Boot ms</div><div class="val">${summary.bootLoadMs ?? '—'}</div></div>
      <div class="kpi"><div class="lbl">JS KB</div><div class="val">${summary.totalBootKb ? Math.round(summary.totalBootKb) : '—'}</div></div>
      <div class="kpi"><div class="lbl">Checks manual</div><div class="val">${summary.manualChecks ?? 0}</div></div>
    </div>

    <div class="legend">
      <strong>Leyenda:</strong>
      <span class="badge sev-p0">P0</span> Bloqueante &nbsp;
      <span class="badge sev-p1">P1</span> Importante &nbsp;
      <span class="badge sev-p2">P2</span> Menor
      &nbsp;·&nbsp; Marque ☐ al verificar
    </div>

    <h2>0. Dashboard — puntuación y gráficas</h2>
    <div class="score-hero">
      <div class="score-main-wrap">${charts.gauge}</div>
      <div class="score-desc">
        <p><strong>${esc(score.label)}</strong></p>
        <p>${esc(score.summary)}</p>
        <p class="muted">Escala: confianza operativa en producción (no volumen de código).</p>
      </div>
    </div>

    <div class="charts-grid">
      <div class="chart-box full">${charts.areasBar}</div>
      <div class="chart-box chart-center">${charts.areasRadar}</div>
      <div class="chart-box chart-center">${charts.severityDonut}</div>
      <div class="chart-box full">${charts.platformsBar}</div>
      <div class="chart-box chart-center">${charts.scriptsDonut}</div>
      <div class="chart-box full">
        <h4>Proyección de mejora</h4>
        ${charts.projection}
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

    <h2>1. Scripts automatizados</h2>
    <div class="chart-box full" style="margin-bottom:12px">${charts.scriptTiming}</div>
    <table>
      <thead><tr><th>Script</th><th>Estado</th><th>Tiempo</th><th>Nota</th></tr></thead>
      <tbody>${scriptRows || '<tr><td colspan="4">Sin datos</td></tr>'}</tbody>
    </table>

    <h2>2. Hallazgos automáticos</h2>
    <table>
      <thead><tr><th>Sev</th><th>ID</th><th>Área</th><th>Descripción</th><th>✓</th></tr></thead>
      <tbody>${autoRows || '<tr><td colspan="5">Sin hallazgos</td></tr>'}</tbody>
    </table>

    ${clickDetail ? `<h2>3. Errores JS por clic</h2>${clickDetail}` : ''}

    <div class="page-break"></div>
    <h2>4. Checklist manual</h2>
    <p class="muted">Web · Tauri Windows · APK Android · iOS web (limitado)</p>
    <table>
      <thead><tr><th>Sev</th><th>ID</th><th>Módulo</th><th>Prueba</th><th>Esperado</th><th>✓</th></tr></thead>
      <tbody>${manualRows}</tbody>
    </table>

    <h2>5. Matriz entorno</h2>
    <div class="chart-box full">${charts.syncHeatmap}</div>

    <div class="page-break"></div>
    <h2>6. Revisión por plataforma</h2>
    <div class="policy"><strong>Política:</strong> ${esc(platforms.policy)}</div>
    <p class="muted">Gráfica comparativa de plataformas en sección 0 (Dashboard).</p>

    <h3>6.1 Resumen plataformas</h3>
    <table>
      <thead><tr><th>Plataforma</th><th>Nota</th><th></th><th>Detección</th></tr></thead>
      <tbody>${platformScoreRows}</tbody>
    </table>

    <h3>6.2 Viewports QA</h3>
    <table>
      <thead><tr><th>ID</th><th>Perfil</th><th>Tamaño</th><th>Clase CSS</th><th>✓</th></tr></thead>
      <tbody>${viewportRows}</tbody>
    </table>

    <h3>6.3 Checklists por plataforma</h3>
    ${platformDetailBlocks}

    <h2>7. Plantilla registro bug</h2>
    <div class="card">
      <p><strong>ID:</strong> QA-___ &nbsp; <strong>Fecha:</strong> ___ &nbsp; <strong>Tester:</strong> ___</p>
      <p><strong>Plataforma:</strong> Web / Tauri / APK / iOS &nbsp; <strong>Módulo:</strong> ___</p>
      <p><strong>Pasos:</strong> 1) … 2) … 3) …</p>
      <p><strong>Esperado:</strong> … &nbsp; <strong>Actual:</strong> …</p>
      <p><strong>Severidad:</strong> P0 / P1 / P2 &nbsp; <strong>Reproducible:</strong> Siempre / A veces / No</p>
    </div>

    <div class="footer">
      Crozzo POS QA · ${dateStr} · scripts/run-qa-regresion.mjs + generate-qa-regresion-pdf.mjs
    </div>
  </div>
</body>
</html>`;

const htmlPath = join(docsDir, 'CROZZO-QA-REGRESION.html');
const pdfPath = join(docsDir, 'CROZZO-QA-REGRESION.pdf');
const previewPath = join(outDir, 'qa-regresion-preview.png');
writeFileSync(htmlPath, html, 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

await page.screenshot({ path: previewPath, fullPage: false });
await page.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  margin: { top: '8mm', right: '8mm', bottom: '10mm', left: '8mm' },
  displayHeaderFooter: true,
  headerTemplate: '<div style="font-size:7px;width:100%;text-align:center;color:#94a3b8;padding-top:2mm">Crozzo POS — QA Regresión</div>',
  footerTemplate: '<div style="font-size:7px;width:100%;text-align:center;color:#94a3b8;padding-bottom:2mm">Pág. <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
});
await browser.close();

const pdfStat = statSync(pdfPath);
const htmlStat = statSync(htmlPath);
const checks = [];
if (pdfStat.size < 50000) checks.push('PDF muy pequeño — posible error');
if (htmlStat.size < 10000) checks.push('HTML muy pequeño');
if (!html.includes('chart-svg')) checks.push('Faltan gráficas SVG');
if (!html.includes('scoreGaugeSvg') && !html.includes('class="chart-svg gauge"')) checks.push('Falta gauge');
const sectionCount = (html.match(/<h2/g) || []).length;
if (sectionCount < 7) checks.push(`Solo ${sectionCount} secciones h2`);

console.log('HTML:', htmlPath, `(${(htmlStat.size / 1024).toFixed(1)} KB)`);
console.log('PDF:', pdfPath, `(${(pdfStat.size / 1024).toFixed(1)} KB, ${Math.ceil(pdfStat.size / 50000)}+ págs est.)`);
console.log('Preview:', previewPath);
console.log('Secciones:', sectionCount, '| Gráficas SVG:', (html.match(/class="chart-svg/g) || []).length);
if (checks.length) {
  console.warn('Advertencias:', checks.join('; '));
  process.exitCode = 1;
} else {
  console.log('Verificación: OK');
}
