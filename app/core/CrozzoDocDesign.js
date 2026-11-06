/**
 * CrozzoDocDesign — Sistema de diseño compartido para documentos (facturas, cotizaciones,
 * remisiones, cierre, inventario, comandas, reportes).
 *
 * Provee tokens CSS (variables) + clases reutilizables + helpers JS para generar HTML
 * de documentos con identidad Bona Origen, tipografía moderna y branding consistente.
 *
 * Uso:
 *   const css = CrozzoDocDesign.css('thermal' | 'sheet' | 'report');
 *   const html = CrozzoDocDesign.docHeader({ title, subtitle }) + ... + CrozzoDocDesign.docFooter({ generatedAt });
 *
 * Fuente canónica: app/core/CrozzoDocDesign.js → sync → src/core/CrozzoDocDesign.js
 */
(function (global) {
  'use strict';

  const BRAND = 'Bona Origen';
  const BRAND_FULL = 'Bona Origen · POS';
  const BRAND_COLOR = '#0f766e';        // teal
  const BRAND_COLOR_LIGHT = '#ccfbf1';
  const BRAND_GOLD = '#c9a962';
  const INK = '#0f172a';
  const MUTED = '#64748b';
  const BORDER = '#e2e8f0';
  const BG = '#f8fafc';
  const PAPER = '#ffffff';

  const TOKENS_CSS = `
:root {
  --doc-font: "Plus Jakarta Sans", "Inter", system-ui, -apple-system, sans-serif;
  --doc-font-mono: "JetBrains Mono", "Consolas", "Courier New", monospace;
  --doc-ink: ${INK};
  --doc-muted: ${MUTED};
  --doc-accent: ${BRAND_COLOR};
  --doc-accent-light: ${BRAND_COLOR_LIGHT};
  --doc-gold: ${BRAND_GOLD};
  --doc-border: ${BORDER};
  --doc-bg: ${BG};
  --doc-paper: ${PAPER};
  --doc-radius: 8px;
  --doc-shadow: 0 1px 3px rgba(0,0,0,.08);
  --doc-shadow-md: 0 4px 12px rgba(0,0,0,.10);
}
* { box-sizing: border-box; }
body { margin: 0; font-family: var(--doc-font); color: var(--doc-ink); -webkit-font-smoothing: antialiased; }
.tabular { font-variant-numeric: tabular-nums; }
`;

  const THERMAL_CSS = TOKENS_CSS + `
@page { size: 80mm auto; margin: 0; }
body { width: 72mm; margin: 0 auto; font-family: var(--doc-font-mono); font-size: 11px; line-height: 1.35; color: var(--doc-ink); }
.doc-thermal { padding: 4mm 2mm; }
.doc-thermal .header { text-align: center; padding-bottom: 4mm; border-bottom: 1px dashed var(--doc-border); margin-bottom: 3mm; }
.doc-thermal .header .brand { font-family: var(--doc-font); font-size: 15px; font-weight: 800; color: var(--doc-accent); letter-spacing: -0.3px; }
.doc-thermal .header .sub { font-size: 9px; color: var(--doc-muted); margin-top: 1mm; }
.doc-thermal .header .meta { font-size: 9px; color: var(--doc-muted); margin-top: 2mm; }
.doc-thermal .section { margin: 3mm 0; }
.doc-thermal .section-title { font-family: var(--doc-font); font-size: 10px; font-weight: 700; color: var(--doc-accent); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2mm; }
.doc-thermal .row { display: flex; justify-content: space-between; gap: 2mm; padding: 0.5mm 0; }
.doc-thermal .row .label { color: var(--doc-muted); }
.doc-thermal .row .value { font-weight: 600; text-align: right; }
.doc-thermal .table { width: 100%; border-collapse: collapse; margin: 2mm 0; }
.doc-thermal .table th { text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; color: var(--doc-muted); border-bottom: 1px solid var(--doc-border); padding: 1mm 0; }
.doc-thermal .table td { padding: 1mm 0; border-bottom: 1px dotted var(--doc-border); vertical-align: top; }
.doc-thermal .table .num { text-align: right; font-variant-numeric: tabular-nums; }
.doc-thermal .table .total-row td { font-weight: 700; border-top: 1px solid var(--doc-ink); border-bottom: none; padding-top: 2mm; }
.doc-thermal .totals { margin-top: 3mm; padding-top: 2mm; border-top: 1px dashed var(--doc-border); }
.doc-thermal .totals .row.grand .value { font-size: 14px; color: var(--doc-accent); }
.doc-thermal .footer { margin-top: 4mm; padding-top: 3mm; border-top: 1px dashed var(--doc-border); text-align: center; font-size: 8px; color: var(--doc-muted); }
.doc-thermal .footer .qr { margin: 2mm auto; }
.doc-thermal .badge { display: inline-block; padding: 0.5mm 2mm; border-radius: 2mm; font-size: 8px; font-weight: 700; background: var(--doc-accent-light); color: var(--doc-accent); }
.doc-thermal .divider { border: none; border-top: 1px dashed var(--doc-border); margin: 3mm 0; }
.doc-thermal .ornament { text-align: center; color: var(--doc-gold); font-size: 10px; letter-spacing: 2px; margin: 2mm 0; }
`;

  const SHEET_CSS = TOKENS_CSS + `
@page { size: A4; margin: 12mm; }
body { font-family: var(--doc-font); font-size: 11px; line-height: 1.45; color: var(--doc-ink); background: var(--doc-paper); }
.doc-sheet { max-width: 720px; margin: 0 auto; padding: 0; }
.doc-sheet .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding-bottom: 12px; border-bottom: 2px solid var(--doc-ink); margin-bottom: 14px; }
.doc-sheet .header .brand-block { display: flex; align-items: center; gap: 10px; }
.doc-sheet .header .logo { width: 48px; height: 48px; border-radius: 8px; background: var(--doc-accent); color: #fff; display: flex; align-items: center; justify-content: center; font-family: var(--doc-font); font-weight: 800; font-size: 18px; }
.doc-sheet .header .brand-name { font-size: 18px; font-weight: 800; color: var(--doc-accent); letter-spacing: -0.3px; }
.doc-sheet .header .brand-sub { font-size: 10px; color: var(--doc-muted); }
.doc-sheet .header .doc-meta { text-align: right; font-size: 10px; color: var(--doc-muted); }
.doc-sheet .header .doc-meta .doc-title { font-size: 16px; font-weight: 800; color: var(--doc-ink); margin-bottom: 2px; }
.doc-sheet .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin: 12px 0; padding: 10px; background: var(--doc-bg); border-radius: var(--doc-radius); }
.doc-sheet .info-grid .label { font-size: 9px; font-weight: 700; text-transform: uppercase; color: var(--doc-muted); letter-spacing: 0.4px; }
.doc-sheet .info-grid .value { font-size: 11px; font-weight: 600; color: var(--doc-ink); }
.doc-sheet .table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 10px; }
.doc-sheet .table th { text-align: left; padding: 8px 6px; background: var(--doc-ink); color: #fff; font-weight: 700; font-size: 9px; text-transform: uppercase; letter-spacing: 0.4px; }
.doc-sheet .table td { padding: 6px; border-bottom: 1px solid var(--doc-border); vertical-align: top; }
.doc-sheet .table tbody tr:nth-child(even) td { background: var(--doc-bg); }
.doc-sheet .table .num { text-align: right; font-variant-numeric: tabular-nums; }
.doc-sheet .table .total-row td { font-weight: 700; background: var(--doc-accent-light); color: var(--doc-accent); border-top: 2px solid var(--doc-accent); }
.doc-sheet .totals { margin: 12px 0; padding: 10px 12px; background: var(--doc-bg); border-radius: var(--doc-radius); }
.doc-sheet .totals .row { display: flex; justify-content: space-between; padding: 3px 0; }
.doc-sheet .totals .row .label { color: var(--doc-muted); }
.doc-sheet .totals .row .value { font-weight: 600; font-variant-numeric: tabular-nums; }
.doc-sheet .totals .row.grand { border-top: 2px solid var(--doc-ink); margin-top: 4px; padding-top: 6px; }
.doc-sheet .totals .row.grand .label { font-weight: 700; color: var(--doc-ink); }
.doc-sheet .totals .row.grand .value { font-size: 15px; font-weight: 800; color: var(--doc-accent); }
.doc-sheet .legal { margin-top: 14px; padding: 10px; background: var(--doc-bg); border-radius: var(--doc-radius); font-size: 9px; color: var(--doc-muted); line-height: 1.5; }
.doc-sheet .legal strong { color: var(--doc-ink); }
.doc-sheet .footer { margin-top: 16px; padding-top: 10px; border-top: 1px solid var(--doc-border); display: flex; justify-content: space-between; font-size: 8px; color: var(--doc-muted); }
.doc-sheet .sign-row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px; }
.doc-sheet .sign { border-top: 1px solid var(--doc-ink); padding-top: 6px; text-align: center; font-size: 9px; color: var(--doc-muted); }
.doc-sheet .qr-block { display: flex; align-items: center; gap: 12px; margin: 12px 0; padding: 10px; background: var(--doc-bg); border-radius: var(--doc-radius); }
.doc-sheet .qr-block img { width: 80px; height: 80px; }
.doc-sheet .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 9px; font-weight: 700; background: var(--doc-accent-light); color: var(--doc-accent); }
.doc-sheet .banner-demo { background: linear-gradient(135deg, var(--doc-accent-light), #fff); border: 1px solid var(--doc-accent); border-radius: var(--doc-radius); padding: 8px 12px; margin: 8px 0; font-size: 9px; color: var(--doc-accent); font-weight: 600; }
@media print {
  body { background: #fff; }
  .doc-sheet { max-width: 100%; }
  .doc-sheet .table, .doc-sheet .table th, .doc-sheet .table td { page-break-inside: avoid; }
  .doc-sheet .sign-row, .doc-sheet .footer { page-break-inside: avoid; }
  .doc-sheet .totals { page-break-inside: avoid; }
  .doc-sheet h1, .doc-sheet h2, .doc-sheet h3 { page-break-after: avoid; }
}
`;

  const REPORT_CSS = TOKENS_CSS + `
@page { size: A4 landscape; margin: 10mm; }
body { font-family: var(--doc-font); font-size: 10px; line-height: 1.4; color: var(--doc-ink); }
.doc-report { max-width: 100%; }
.doc-report .header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 10px; border-bottom: 2px solid var(--doc-accent); margin-bottom: 12px; }
.doc-report .header .brand { font-size: 20px; font-weight: 800; color: var(--doc-accent); }
.doc-report .header .title { font-size: 14px; font-weight: 700; color: var(--doc-ink); }
.doc-report .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0; }
.doc-report .kpi { background: var(--doc-bg); border-radius: var(--doc-radius); padding: 8px 10px; }
.doc-report .kpi .label { font-size: 8px; font-weight: 700; text-transform: uppercase; color: var(--doc-muted); }
.doc-report .kpi .value { font-size: 16px; font-weight: 800; color: var(--doc-accent); font-variant-numeric: tabular-nums; }
.doc-report .table { width: 100%; border-collapse: collapse; font-size: 9px; margin: 8px 0; }
.doc-report .table th { text-align: left; padding: 6px 4px; background: var(--doc-ink); color: #fff; font-weight: 700; font-size: 8px; text-transform: uppercase; }
.doc-report .table td { padding: 5px 4px; border-bottom: 1px solid var(--doc-border); }
.doc-report .table tbody tr:nth-child(even) td { background: var(--doc-bg); }
.doc-report .table .num { text-align: right; font-variant-numeric: tabular-nums; }
.doc-report .footer { margin-top: 10px; padding-top: 6px; border-top: 1px solid var(--doc-border); font-size: 8px; color: var(--doc-muted); display: flex; justify-content: space-between; }
`;

  // --- Helpers JS ---
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function docHeader(opts) {
    opts = opts || {};
    const title = esc(opts.title || '');
    const subtitle = esc(opts.subtitle || '');
    const meta = esc(opts.meta || '');
    const logo = opts.logo || BRAND.charAt(0);
    return `
      <div class="header">
        <div class="brand-block">
          <div class="logo">${esc(logo)}</div>
          <div>
            <div class="brand-name">${BRAND}</div>
            <div class="brand-sub">${esc(opts.brandSub || 'Sistema de gestión')}</div>
          </div>
        </div>
        <div class="doc-meta">
          <div class="doc-title">${title}</div>
          ${subtitle ? `<div>${subtitle}</div>` : ''}
          ${meta ? `<div>${meta}</div>` : ''}
        </div>
      </div>`;
  }

  function docFooter(opts) {
    opts = opts || {};
    const left = esc(opts.left || `Generado el ${new Date().toLocaleString('es-CO')} · ${BRAND}`);
    const right = esc(opts.right || '');
    return `<div class="footer"><span>${left}</span><span>${right}</span></div>`;
  }

  function docTable(headers, rows, opts) {
    opts = opts || {};
    const ths = (headers || []).map(function (h) { return `<th>${esc(h)}</th>`; }).join('');
    const trs = (rows || []).map(function (r) {
      const cells = (Array.isArray(r) ? r : []).map(function (c, i) {
        const cls = (opts.numCols || []).indexOf(i) >= 0 ? ' class="num"' : '';
        return `<td${cls}>${esc(c)}</td>`;
      }).join('');
      const rowClass = opts.rowClass ? ' ' + opts.rowClass : '';
      return `<tr class="${rowClass.trim()}">${cells}</tr>`;
    }).join('');
    const totalRow = opts.totalRow
      ? `<tr class="total-row">${(Array.isArray(opts.totalRow) ? opts.totalRow : []).map(function (c, i) {
          const cls = (opts.numCols || []).indexOf(i) >= 0 ? ' class="num"' : '';
          return `<td${cls}>${esc(c)}</td>`;
        }).join('')}</tr>`
      : '';
    return `<table class="table"><thead><tr>${ths}</tr></thead><tbody>${trs}${totalRow}</tbody></table>`;
  }

  function docTotals(rows, opts) {
    opts = opts || {};
    const r = (rows || []).map(function (row) {
      const isGrand = row && row.grand;
      return `<div class="row${isGrand ? ' grand' : ''}"><span class="label">${esc(row.label || '')}</span><span class="value">${esc(row.value || '')}</span></div>`;
    }).join('');
    return `<div class="totals">${r}</div>`;
  }

  function docSign(labels) {
    labels = labels || ['Firma', 'Firma'];
    return `<div class="sign-row">${labels.map(function (l) { return `<div class="sign">${esc(l)}</div>`; }).join('')}</div>`;
  }

  function docQr(src, caption) {
    return `<div class="qr-block"><img src="${esc(src)}" alt="QR"><div><div style="font-weight:700;font-size:10px;">${esc(caption || 'QR de verificación')}</div><div style="font-size:9px;color:var(--doc-muted);">Escanee para verificar</div></div></div>`;
  }

  function docBadge(text) {
    return `<span class="badge">${esc(text)}</span>`;
  }

  function docBanner(text) {
    return `<div class="banner-demo">${esc(text)}</div>`;
  }

  function css(mode) {
    if (mode === 'thermal') return THERMAL_CSS;
    if (mode === 'report') return REPORT_CSS;
    return SHEET_CSS;
  }

  function wrapDocument(bodyHtml, mode, title) {
    mode = mode || 'sheet';
    title = title || BRAND_FULL;
    return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${css(mode)}</style></head><body>${bodyHtml}</body></html>`;
  }

  global.CrozzoDocDesign = {
    BRAND: BRAND,
    BRAND_FULL: BRAND_FULL,
    BRAND_COLOR: BRAND_COLOR,
    TOKENS_CSS: TOKENS_CSS,
    THERMAL_CSS: THERMAL_CSS,
    SHEET_CSS: SHEET_CSS,
    REPORT_CSS: REPORT_CSS,
    css: css,
    wrapDocument: wrapDocument,
    esc: esc,
    docHeader: docHeader,
    docFooter: docFooter,
    docTable: docTable,
    docTotals: docTotals,
    docSign: docSign,
    docQr: docQr,
    docBadge: docBadge,
    docBanner: docBanner,
  };
})(typeof window !== 'undefined' ? window : globalThis);