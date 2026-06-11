/**
 * Crozzo POS — Impresión de cierre (térmica 58/80 mm · carta · oficio)
 */
(function (global) {
  'use strict';

  var D = null;
  var LS_PRINT_OUT = 'crozzo_print_output_cierre';
  var LS_CUT_FEED_LINES = 'crozzo_cierre_cut_feed_lines';
  var DEFAULT_CUT_FEED_LINES = 28;
  var __histPrintCache = [];
  var __cuadreFormRec = null;
  var __cuadreCalcHooked = false;

  function boot(deps) {
    D = deps || {};
  }

  function fmt(n) {
    return D.formatMoney ? D.formatMoney(n) : '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
  }

  function esc(s) {
    return D.esc ? D.esc(s) : String(s || '');
  }

  function todayKey() {
    return D.todayKey ? D.todayKey() : new Date().toISOString().slice(0, 10);
  }

  function brandTitle() {
    try {
      if (typeof config !== 'undefined' && config.getEmpresa) {
        var e = config.getEmpresa();
        if (e && (e.nombreComercial || e.nombre)) return String(e.nombreComercial || e.nombre);
      }
    } catch (_) {}
    return 'Crozzo POS';
  }

  function getBrandPrintMeta() {
    var title = brandTitle();
    var logoSrc = '';
    try {
      if (typeof global.getCrozzoBranding === 'function') {
        var b = global.getCrozzoBranding();
        var show = b && b.show;
        var tenant = b && b.tenant;
        var plat = b && b.platform;
        if (show && show.header && show.header.tenant && tenant && tenant.dataUrl) logoSrc = String(tenant.dataUrl).trim();
        else if (show && show.dataUrl) logoSrc = String(show.dataUrl).trim();
        else if (plat && plat.dataUrl) logoSrc = String(plat.dataUrl).trim();
        if (show && show.header && show.header.tenant && tenant && tenant.label) title = String(tenant.label).trim();
        else if (show && show.title) title = String(show.title).trim();
      }
    } catch (_) {}
    try {
      if (!logoSrc && typeof config !== 'undefined' && config.getEmpresa) {
        var e = config.getEmpresa();
        if (e && e.logo) logoSrc = String(e.logo);
        if (e && (e.nombreComercial || e.nombre)) title = String(e.nombreComercial || e.nombre);
      }
    } catch (_) {}
    if (logoSrc && !/^data:|^https?:|^blob:|^file:/i.test(logoSrc)) {
      try {
        if (typeof global.crozzoResolveAssetUrl === 'function') logoSrc = global.crozzoResolveAssetUrl(logoSrc);
        else if (global.location && global.location.href) logoSrc = new URL(logoSrc, global.location.href).href;
      } catch (_) {}
    }
    return { title: title, logoSrc: logoSrc };
  }

  function getEmpresaPrintMeta() {
    try {
      if (typeof config !== 'undefined' && config.getEmpresa) {
        var e = config.getEmpresa();
        if (e) {
          return {
            nit: String(e.nit || e.documento || '').trim(),
            direccion: String(e.direccion || e.direccionComercial || '').trim(),
            telefono: String(e.telefono || e.celular || '').trim(),
          };
        }
      }
    } catch (_) {}
    return { nit: '', direccion: '', telefono: '' };
  }

  function savedCierrePrintOutput() {
    try {
      var v = localStorage.getItem(LS_PRINT_OUT);
      if (v) return normalizePrintOutput(v);
    } catch (_) {}
    try {
      if (global.CrozzoPrintStudioHub && typeof global.CrozzoPrintStudioHub.getPrintOutput === 'function') {
        return normalizePrintOutput(global.CrozzoPrintStudioHub.getPrintOutput('cierre') || global.CrozzoPrintStudioHub.getPrintOutput('estudio'));
      }
    } catch (_) {}
    return 'roll_80';
  }

  function normalizePrintOutput(id) {
    var s = String(id || '').toLowerCase();
    if (s === 'thermal' || s === 'roll' || s === 'termica' || s === 'pos') return 'roll_80';
    if (s === 'roll_50' || s === '50' || s === '50mm') return 'roll_58';
    if (s === 'normal' || s === 'html' || s === 'a4') return 'carta';
    if (s === 'roll_58' || s === 'roll_80' || s === 'carta' || s === 'oficio') return s;
    return 'roll_80';
  }

  function printOutputMeta(id) {
    id = normalizePrintOutput(id);
    if (id === 'roll_58') return { id: id, kind: 'roll', pageMm: '58mm', pageFormat: null };
    if (id === 'roll_80') return { id: id, kind: 'roll', pageMm: '80mm', pageFormat: null };
    if (id === 'oficio') return { id: id, kind: 'sheet', pageMm: null, pageFormat: 'legal' };
    return { id: 'carta', kind: 'sheet', pageMm: null, pageFormat: 'a4' };
  }

  function resolveCierrePrintLayout(opts) {
    opts = opts || {};
    if (opts.layout === 'thermal' || opts.layout === 'normal') return opts.layout;
    if (opts.printTarget === 'pos' || opts.printTarget === 'thermal') return 'thermal';
    if (opts.printTarget === 'office' || opts.printTarget === 'normal') return 'normal';
    var out = normalizePrintOutput(opts.printOutput || savedCierrePrintOutput());
    return printOutputMeta(out).kind === 'roll' ? 'thermal' : 'normal';
  }

  function resolveCierrePaperMm(layout, opts) {
    if (layout !== 'thermal') return '80mm';
    opts = opts || {};
    if (opts.paperMm) return opts.paperMm;
    var out = normalizePrintOutput(opts.printOutput || savedCierrePrintOutput());
    return printOutputMeta(out).pageMm || '80mm';
  }

  function cierreFormatLabel(layout, paperMm) {
    if (layout !== 'thermal') {
      var out = normalizePrintOutput(savedCierrePrintOutput());
      return out === 'oficio' ? 'oficio' : 'carta A4';
    }
    return 'POS ' + (paperMm === '58mm' ? '58' : '80') + ' mm';
  }

  function cierrePrintStyles(extra) {
    return (
      '@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{font-family:Segoe UI,system-ui,sans-serif;color:#111;font-size:12px;margin:0;padding:14px;line-height:1.45}' +
      'h1{font-size:17px;margin:0 0 6px}.slip{max-width:680px;margin:0 auto;border:2px solid #222;padding:16px 18px}' +
      '.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px;margin:12px 0}' +
      '.cell{padding:9px 11px;border:1px solid #ccc;border-radius:6px;background:#fafafa}' +
      '.cell label{display:block;font-size:8px;text-transform:uppercase;color:#666;margin-bottom:3px}' +
      '.cell strong{font-size:14px;display:block}.delta-ok{color:#166534}.delta-bad{color:#b91c1c}' +
      'table{width:100%;border-collapse:collapse;font-size:10px;margin-top:6px}th,td{border:1px solid #bbb;padding:5px 6px}' +
      '.signatures{display:flex;gap:20px;margin-top:26px}.sig{flex:1;border-top:1px solid #333;padding-top:6px;font-size:10px;text-align:center}' +
      (extra || '')
    );
  }

  function cierreThermalStyles() {
    return (
      '.cierre-ticket{font-family:Consolas,"Courier New",monospace;font-size:11px;line-height:1.35;color:#000;width:100%;box-sizing:border-box;padding:0;margin:0}' +
      '.ct-center{text-align:center}.ct-bold{font-weight:700}.ct-sm{font-size:10px}' +
      '.ct-hr{border:none;border-top:1px dashed #000;margin:5px 0;height:0}' +
      '.ct-row{display:flex;justify-content:space-between;gap:4px;margin:2px 0;align-items:baseline}' +
      '.ct-row>span:first-child{flex:1;min-width:0}.ct-row>span:last-child{text-align:right;font-weight:600;white-space:nowrap}' +
      '.ct-emph{font-size:12px;font-weight:700;margin-top:3px;padding-top:3px;border-top:1px solid #000}' +
      '.ct-logo{max-width:100%;max-height:48px;display:block;margin:0 auto 4px;object-fit:contain}' +
      '.ct-sig{margin-top:12px;padding-top:16px;border-top:1px solid #000;text-align:center;font-size:10px}' +
      '.ct-cut-spacer{display:block;width:100%;height:5mm;min-height:5mm;margin:0;padding:0;overflow:hidden;font-size:5mm;line-height:5mm}' +
      '.ct-cut-zone{width:100%;margin:4px 0 0;padding:0;page-break-inside:avoid}' +
      '.ct-cut-marker{border:none;border-top:2px dashed #000;height:0;margin:10px 0 6px;width:100%}' +
      '.ct-cut-marker--light{border-top-width:1px;margin:4px 0 8px}' +
      '.ct-cut-label{text-align:center;font-weight:700;font-size:11px;letter-spacing:0.04em;margin:0 0 6px;line-height:1.3}' +
      '.ct-feed-line{display:block;width:100%;margin:0;padding:0;overflow:hidden}' +
      '.ct-page-end{display:block;height:0;margin:0;padding:0;line-height:0;font-size:0;page-break-after:always;break-after:page}'
    );
  }

  function getThermalCutFeedLines() {
    var lines = DEFAULT_CUT_FEED_LINES;
    try {
      var stored = localStorage.getItem(LS_CUT_FEED_LINES);
      if (stored == null) {
        var legacyMm = Number(localStorage.getItem('crozzo_cierre_cut_feed_mm'));
        if (legacyMm > 0) lines = Math.round(legacyMm / 1.5);
      } else {
        lines = Number(stored) || DEFAULT_CUT_FEED_LINES;
      }
      lines = Math.max(18, Math.min(36, lines));
    } catch (_) {}
    return lines;
  }

  function wrapThermalInner(inner, paperMm) {
    if (typeof global.crozzoEnsureThermalCutFeed === 'function') {
      inner = global.crozzoEnsureThermalCutFeed(inner, { lines: getThermalCutFeedLines(), linePx: 16 });
    } else {
      inner = appendThermalCutFeed(inner);
    }
    if (typeof global.crozzoBuildThermalPrintDocument === 'function') {
      return global.crozzoBuildThermalPrintDocument(inner, paperMm || '80mm');
    }
    return (
      '<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page{size:' +
      (paperMm || '80mm') +
      ' auto;margin:0}html,body{margin:0;padding:0;width:' +
      (paperMm || '80mm') +
      '}@media print{.ct-cut-zone{page-break-after:always}.ct-page-end{page-break-after:always}}</style></head><body>' +
      inner +
      '</body></html>'
    );
  }

  function ensureCierreThermalDocument(html, paperMm) {
    if (!html) return html;
    if (/^<!DOCTYPE/i.test(html)) {
      if (typeof global.crozzoEnsureThermalCutFeed === 'function') {
        html = global.crozzoEnsureThermalCutFeed(html, { lines: getThermalCutFeedLines(), linePx: 16 });
      } else {
        html = appendThermalCutFeed(html);
      }
      return html;
    }
    return wrapThermalInner(html, paperMm);
  }

  function dispatchCierrePrint(htmlOrBuilder, opts) {
    opts = opts || {};
    var layout = resolveCierrePrintLayout(opts);
    var paperMm = resolveCierrePaperMm(layout, opts);
    var html = typeof htmlOrBuilder === 'function' ? htmlOrBuilder(layout, paperMm) : htmlOrBuilder;
    if (!html) return Promise.resolve(false);
    if (layout === 'thermal') {
      html = ensureCierreThermalDocument(html, paperMm);
    }
    var meta = printOutputMeta(opts.printOutput || savedCierrePrintOutput());
    var printOpts = {
      allowDialog: opts.allowDialog !== false,
      toast: opts.toast !== false,
      role: opts.role || 'caja',
      printer: opts.printer,
      silent: opts.silent,
      layout: layout,
    };
    if (layout === 'thermal') {
      printOpts.printOutput = meta.id;
    } else {
      printOpts.pageFormat = opts.pageFormat || meta.pageFormat || 'a4';
      printOpts.landscape = opts.landscape === true;
    }
    if (typeof global.crozzoPrintHtmlDocument === 'function') {
      return global.crozzoPrintHtmlDocument(html, printOpts).then(function (ok) {
        if (!ok && typeof showToast === 'function') {
          showToast('No se pudo imprimir — revise impresora en Facturas e impresión', 'warning');
        } else if (ok && typeof showToast === 'function' && opts.formatHint && opts.toast !== false) {
          showToast('Impreso · ' + cierreFormatLabel(layout, paperMm), 'success');
        }
        return ok;
      });
    }
    try {
      var w = global.open('', '_blank', layout === 'thermal' ? 'width=420,height=900' : 'width=820,height=900');
      if (!w) {
        if (typeof showToast === 'function') showToast('Permita ventanas emergentes para imprimir', 'warning');
        return Promise.resolve(false);
      }
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(function () {
        w.print();
      }, 350);
      return Promise.resolve(true);
    } catch (e) {
      console.warn('[cierre-print]', e);
      return Promise.resolve(false);
    }
  }

  function aggregatePropinasFromInvoices(invoices) {
    var total = 0;
    var efectivo = 0;
    var datafono = 0;
    (invoices || []).forEach(function (f) {
      var prop = Number((f.paymentMeta && f.paymentMeta.propina) || f.propinaVoluntaria) || 0;
      if (prop <= 0) return;
      total += prop;
      var mp = String(f.metodoPago || '').toLowerCase();
      if (mp === 'efectivo') efectivo += prop;
      else if (mp === 'tarjeta' || mp === 'datafono') datafono += prop;
      else datafono += prop;
    });
    return { total: total, efectivo: efectivo, datafono: datafono };
  }

  function buildCuadreSheet(rec, metrics) {
    metrics = metrics || rec._metrics || {};
    var invoices = D.facturasForCierreRecord ? D.facturasForCierreRecord(rec) : metrics.invoices || [];
    var byMethod = rec.byMethod || metrics.byMethod || {};
    var prop = aggregatePropinasFromInvoices(invoices);
    var hints =
      typeof global.crozzoPlanillaDayCuadreHints === 'function'
        ? global.crozzoPlanillaDayCuadreHints(rec.businessDate, rec.shiftType)
        : null;
    var gastosInput = Number(rec.gastosTurno);
    var gastos = gastosInput > 0 ? gastosInput : Number(hints && hints.gastosPlanilla) || 0;
    var fondo = Number(rec.fondo) || 0;
    var efectivoDocs = Number(rec.cashSales) || 0;
    var datafonos = Number(byMethod.tarjeta) || 0;
    var qr = Number(byMethod.qr) || 0;
    var pse = Number(byMethod.pse) || 0;
    var mixto = Number(byMethod.mixto) || 0;
    var otros = Number(byMethod.otro) || 0;
    var transferencias = qr + pse;
    var credito = Number(byMethod.credito) || 0;
    var cartera = Number(byMethod.cartera) || 0;
    var facturasCargadas = credito + cartera;
    if (!facturasCargadas && metrics.facturasCargadas) facturasCargadas = Number(metrics.facturasCargadas) || 0;
    var totalVendido = Number(rec.totalSales) || metrics.total || 0;
    var totalReal = Number(rec.actual) || 0;
    var descuadre = Number(rec.diff);
    var propPosAuto = prop.total;
    var refPos = totalVendido + propPosAuto;
    var totalSumado = totalReal + efectivoDocs + datafonos + gastos;
    if (!Number.isFinite(descuadre)) descuadre = totalSumado - refPos;
    var esperadoSistema = refPos;
    var brand = getBrandPrintMeta();
    var emp = getEmpresaPrintMeta();
    var closedLbl = '';
    try {
      closedLbl = rec.closedAt ? new Date(rec.closedAt).toLocaleString('es-CO') : new Date().toLocaleString('es-CO');
    } catch (_) {
      closedLbl = String(rec.closedAt || '');
    }
    return {
      brand: brand,
      empresa: emp,
      fecha: rec.businessDate || todayKey(),
      fechaCierre: closedLbl,
      responsable: rec.closedBy || (D.getCierreActor && D.getCierreActor().name) || '—',
      turno: rec.shiftLabel || rec.shiftType || '—',
      fondo: fondo,
      efectivoDocumentos: efectivoDocs,
      datafonos: datafonos,
      transferencias: transferencias,
      mixto: mixto,
      otros: otros,
      facturasCargadas: facturasCargadas,
      efectivoEsperado: Number(rec.cashSales) || efectivoDocs,
      gastos: gastos,
      totalSumado: totalSumado,
      totalVendido: totalVendido,
      totalReal: totalReal,
      descuadre: descuadre,
      descuadreVenta: totalSumado - refPos,
      refPos: refPos,
      propinasPosAuto: propPosAuto,
      esperadoSistema: esperadoSistema,
      propinasTotal: prop.total,
      propinasEfectivo: prop.efectivo,
      propinasDatafono: prop.datafono,
      ventasCount: rec.salesCount || metrics.count || 0,
      notas: String(rec.notes || '').trim(),
      draft: !!rec._draft,
    };
  }

  function cuadreRowHtml(label, value, opts) {
    opts = opts || {};
    var display = typeof value === 'number' ? fmt(value) : String(value || '—');
    if (opts.delta && typeof value === 'number') {
      display = (value >= 0 ? '+' : '−') + fmt(Math.abs(value));
    }
    var valCls = opts.delta ? (Number(value) >= 0 ? ' delta-ok' : ' delta-bad') : '';
    return (
      '<tr class="cuadre-row' +
      (opts.emphasis ? ' cuadre-row--emph' : '') +
      '\"><td>' +
      esc(label) +
      '</td><td class="' +
      valCls +
      '" style="text-align:right;font-weight:700">' +
      esc(display) +
      '</td></tr>'
    );
  }

  function thermalRowHtml(label, value, opts) {
    opts = opts || {};
    var display = typeof value === 'number' ? fmt(value) : String(value || '—');
    if (opts.delta && typeof value === 'number') {
      display = (value >= 0 ? '+' : '−') + fmt(Math.abs(value));
    }
    return (
      '<div class="ct-row' +
      (opts.emphasis ? ' ct-emph' : '') +
      '\"><span>' +
      esc(label) +
      '</span><span>' +
      esc(display) +
      '</span></div>'
    );
  }

  function cuadreEstadoLabel(diff) {
    var n = Number(diff) || 0;
    if (Math.abs(n) < 1) return 'CUADRA';
    return n > 0 ? 'SOBRA ' + fmt(n) : 'FALTA ' + fmt(Math.abs(n));
  }

  function buildCierreCuadreHtmlFull(rec) {
    if (!rec) return '';
    var sheet = rec.cuadreSheet || buildCuadreSheet(rec, rec._metrics);
    if (sheet.blank) return buildBlankCuadreHtml(getCuadreFormMetaFromSheet(sheet), 'normal');
    var brand = sheet.brand || getBrandPrintMeta();
    var refPos = sheet.refPos != null ? sheet.refPos : Number(sheet.totalVendido) + Number(sheet.propinasPosAuto || 0);
    var diff = sheet.descuadreVenta != null ? sheet.descuadreVenta : Number(sheet.totalSumado) - refPos;
    var logoHtml = brand.logoSrc
      ? '<img class="cuadre-logo" src="' + esc(brand.logoSrc) + '" alt="" style="width:56px;height:56px;object-fit:contain">'
      : '';
    return (
      '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Cuadre</title><style>' +
      cierrePrintStyles(
        '.cuadre-head{display:flex;gap:12px;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid #222}' +
          '.cuadre-table{width:100%;border-collapse:collapse;font-size:12px;margin:6px 0}' +
          '.cuadre-estado{margin:10px 0;padding:10px 12px;border:2px solid #222;border-radius:8px;text-align:center;font-size:15px;font-weight:800}' +
          '.cuadre-notes{margin-top:10px;padding:10px;border:1px dashed #999;font-size:11px;min-height:48px}'
      ) +
      '</style></head><body><div class="slip">' +
      '<header class="cuadre-head">' +
      logoHtml +
      '<div><h1>' +
      esc(brand.title) +
      '</h1><p class="meta">' +
      esc(sheet.fecha) +
      ' · ' +
      esc(sheet.turno) +
      ' · ' +
      esc(sheet.responsable) +
      '</p></div></header>' +
      '<table class="cuadre-table">' +
      cuadreRowHtml('Efectivo', sheet.totalReal) +
      cuadreRowHtml('Documentos', sheet.efectivoDocumentos) +
      cuadreRowHtml('Datáfonos', sheet.datafonos) +
      cuadreRowHtml('Gastos', sheet.gastos) +
      cuadreRowHtml('Total contado', sheet.totalSumado, { emphasis: true }) +
      cuadreRowHtml('Venta POS', sheet.totalVendido) +
      cuadreRowHtml('Propinas POS', sheet.propinasPosAuto != null ? sheet.propinasPosAuto : sheet.propinasTotal) +
      cuadreRowHtml('Referencia sistema', refPos, { emphasis: true }) +
      cuadreRowHtml('Descuadre', diff, { emphasis: true, delta: true }) +
      '</table>' +
      '<div class="cuadre-estado">' +
      esc(cuadreEstadoLabel(diff)) +
      '</div>' +
      '<table class="cuadre-table"><caption style="caption-side:top;text-align:left;font-weight:700;margin-bottom:4px">Propinas contadas</caption>' +
      cuadreRowHtml('Efectivo', sheet.propinasEfectivo) +
      cuadreRowHtml('Datáfonos', sheet.propinasDatafono) +
      cuadreRowHtml('Total', sheet.propinasManualTotal != null ? sheet.propinasManualTotal : sheet.propinasTotal) +
      '</table>' +
      '<div class="cuadre-notes"><strong>Anotaciones:</strong> ' +
      esc(sheet.notas || ' ') +
      '</div>' +
      '<div class="signatures"><div class="sig">Firma cajero</div><div class="sig">Firma supervisor</div></div>' +
      '</div></body></html>'
    );
  }

  function buildCierreCuadreHtmlThermal(rec) {
    if (!rec) return '';
    var sheet = rec.cuadreSheet || buildCuadreSheet(rec, rec._metrics);
    if (sheet.blank) return buildBlankCuadreHtml(getCuadreFormMetaFromSheet(sheet), 'thermal');
    var brand = sheet.brand || getBrandPrintMeta();
    var refPos = sheet.refPos != null ? sheet.refPos : Number(sheet.totalVendido) + Number(sheet.propinasPosAuto || 0);
    var diff = sheet.descuadreVenta != null ? sheet.descuadreVenta : Number(sheet.totalSumado) - refPos;
    var logoHtml = brand.logoSrc ? '<img class="ct-logo" src="' + esc(brand.logoSrc) + '" alt="">' : '';
    var propManual = sheet.propinasManualTotal != null ? sheet.propinasManualTotal : sheet.propinasTotal;
    return (
      '<div class="cierre-ticket"><style>' +
      cierreThermalStyles() +
      '</style>' +
      logoHtml +
      '<div class="ct-center ct-bold">' +
      esc(brand.title) +
      '</div>' +
      '<div class="ct-center ct-sm">' +
      (sheet.draft ? 'BORRADOR · CUADRE' : 'CUADRE DE CAJA') +
      '</div>' +
      '<hr class="ct-hr">' +
      thermalRowHtml('Día', sheet.fecha) +
      thermalRowHtml('Turno', sheet.turno) +
      thermalRowHtml('Cajero', sheet.responsable) +
      '<hr class="ct-hr">' +
      thermalRowHtml('Efectivo', sheet.totalReal) +
      thermalRowHtml('Documentos', sheet.efectivoDocumentos) +
      thermalRowHtml('Datáfonos', sheet.datafonos) +
      thermalRowHtml('Gastos', sheet.gastos) +
      thermalRowHtml('TOTAL', sheet.totalSumado, { emphasis: true }) +
      '<hr class="ct-hr">' +
      thermalRowHtml('Venta POS', sheet.totalVendido) +
      thermalRowHtml('Propinas POS', sheet.propinasPosAuto != null ? sheet.propinasPosAuto : 0) +
      thermalRowHtml('Referencia', refPos, { emphasis: true }) +
      thermalRowHtml('Descuadre', diff, { emphasis: true, delta: true }) +
      '<div class="ct-center ct-bold">' +
      esc(cuadreEstadoLabel(diff)) +
      '</div>' +
      '<hr class="ct-hr">' +
      '<div class="ct-center ct-sm">PROPINAS CONTADAS</div>' +
      thermalRowHtml('Efectivo', sheet.propinasEfectivo) +
      thermalRowHtml('Datáfonos', sheet.propinasDatafono) +
      thermalRowHtml('Total', propManual) +
      (sheet.notas ? '<hr class="ct-hr"><div class="ct-sm"><strong>Notas:</strong> ' + esc(sheet.notas) + '</div>' : '') +
      '<div class="ct-sig">Firma cajero</div>' +
      thermalCutFeedHtml() +
      '</div>'
    );
  }

  function buildCierreCuadreHtml(rec, layout) {
    return layout === 'thermal' ? buildCierreCuadreHtmlThermal(rec) : buildCierreCuadreHtmlFull(rec);
  }

  function enrichWithCuadre(rec, metrics) {
    var out = Object.assign({}, rec);
    try {
      out.cuadreSheet = buildCuadreSheet(out, metrics);
    } catch (e) {
      console.warn('[cierre-print] cuadreSheet', e);
    }
    return out;
  }

  function cierreRecordKey(rec) {
    if (!rec) return '';
    return (
      String(rec.shiftId || rec.shiftType || '') +
      '|' +
      String(rec.closedAt || '') +
      '|' +
      String(rec.businessDate || '')
    );
  }

  function metricsForHistoryRecord(rec) {
    var invoices = D.facturasForCierreRecord ? D.facturasForCierreRecord(rec) : [];
    return {
      invoices: invoices,
      byMethod: rec.byMethod || {},
      total: rec.totalSales,
      count: rec.salesCount,
      cash: rec.cashSales,
    };
  }

  /** Reconstruye cuadre desde datos guardados del cierre (reimpresión fiel). */
  function prepareRecordForPrint(rec) {
    if (!rec) return null;
    var out = Object.assign({}, rec);
    delete out._metrics;
    out._draft = false;
    var storedSheet = rec.cuadreSheet && typeof rec.cuadreSheet === 'object' ? rec.cuadreSheet : null;
    out = enrichWithCuadre(out, metricsForHistoryRecord(out));
    if (out.cuadreSheet) {
      out.cuadreSheet.draft = false;
      out.cuadreSheet.fecha = out.businessDate || out.cuadreSheet.fecha;
      out.cuadreSheet.turno = out.shiftLabel || out.shiftType || out.cuadreSheet.turno;
      out.cuadreSheet.responsable = out.closedBy || out.cuadreSheet.responsable || '—';
      out.cuadreSheet.notas = String(out.notes || out.cuadreSheet.notas || '').trim();
      if (out.closedAt) {
        try {
          out.cuadreSheet.fechaCierre = new Date(out.closedAt).toLocaleString('es-CO');
        } catch (_) {
          out.cuadreSheet.fechaCierre = String(out.closedAt);
        }
      }
      if (storedSheet) {
        ['fondo', 'efectivoDocumentos', 'datafonos', 'gastos', 'totalSumado', 'totalVendido', 'totalReal', 'esperadoSistema', 'descuadre', 'descuadreVenta', 'refPos', 'propinasPosAuto', 'propinasTotal', 'propinasEfectivo', 'propinasDatafono', 'propinasManualTotal'].forEach(function (k) {
          if (storedSheet[k] != null && Number.isFinite(Number(storedSheet[k]))) out.cuadreSheet[k] = Number(storedSheet[k]);
        });
      }
    }
    return out;
  }

  function resolveHistoryRecord(keyOrIdx) {
    if (keyOrIdx == null || keyOrIdx === '') return null;
    if (typeof keyOrIdx === 'number' && __histPrintCache[keyOrIdx]) return __histPrintCache[keyOrIdx];
    var key = String(keyOrIdx);
    if (/^\d+$/.test(key) && __histPrintCache[Number(key)]) return __histPrintCache[Number(key)];
    var all = D.getHistoryRows ? D.getHistoryRows() : [];
    for (var i = 0; i < all.length; i++) {
      if (cierreRecordKey(all[i]) === key) return all[i];
    }
    if (/^\d+$/.test(key) && all[Number(key)]) return all[Number(key)];
    return null;
  }

  function printCierreRecord(rec, opts) {
    opts = opts || {};
    if (!rec) return Promise.resolve(false);
    if (!rec._draft && opts.prepare !== false) {
      rec = prepareRecordForPrint(rec);
    } else if (!rec.cuadreSheet) {
      rec = enrichWithCuadre(rec, rec._metrics || metricsForHistoryRecord(rec));
    }
    if (typeof showToast === 'function' && !opts.silentToast) {
      showToast(rec._draft ? 'Imprimiendo borrador…' : 'Imprimiendo cuadre…', 'info');
    }
    return dispatchCierrePrint(
      function (layout) {
        return buildCierreCuadreHtml(rec, layout);
      },
      { allowDialog: opts.allowDialog !== false, toast: !opts.silentToast, formatHint: true, printOutput: savedCierrePrintOutput() }
    );
  }

  function printArqueoDraft() {
    var pending = D.getPendingArqueo ? D.getPendingArqueo() : null;
    if (!pending) {
      openCuadreFormFromArqueo();
      return Promise.resolve(false);
    }
    var notes = String(document.getElementById('crozzo-shift-notes') && document.getElementById('crozzo-shift-notes').value || '').trim();
    var gastosTurno = Number(document.getElementById('crozzo-shift-gastos') && document.getElementById('crozzo-shift-gastos').value) || Number(pending.gastosTurno) || 0;
    var draftRec = enrichWithCuadre(
      Object.assign({}, pending, { gastosTurno: gastosTurno, notes: notes, closedAt: new Date().toISOString(), _draft: true }),
      pending._metrics
    );
    return printCierreRecord(draftRec, { allowDialog: true });
  }

  function buildDiaReportHtml(layout) {
    var snap = D.buildOperationalSnapshot ? D.buildOperationalSnapshot() : null;
    if (!snap) return '';
    var day = snap.day;
    var bd = day.businessDate || todayKey();
    if (layout === 'thermal') {
      return (
        '<div class="cierre-ticket"><style>' +
        cierreThermalStyles() +
        '</style><div class="ct-center ct-bold">' +
        esc(brandTitle()) +
        '</div><div class="ct-center ct-sm">REPORTE DÍA ' +
        esc(bd) +
        '</div><hr class="ct-hr">' +
        thermalRowHtml('Ventas', snap.dia.total, { emphasis: true }) +
        thermalRowHtml('Efectivo', snap.dia.cash) +
        thermalRowHtml('Otros', snap.dia.nonCash) +
        thermalCutFeedHtml() +
        '</div>'
      );
    }
    return (
      '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
      cierrePrintStyles() +
      '</style></head><body><div class="slip"><h1>Reporte del día</h1><p class="meta">' +
      esc(brandTitle()) +
      ' · ' +
      esc(bd) +
      '</p><div class="grid"><div class="cell"><label>Ventas</label><strong>' +
      fmt(snap.dia.total) +
      '</strong></div><div class="cell"><label>Efectivo</label><strong>' +
      fmt(snap.dia.cash) +
      '</strong></div></div></div></body></html>'
    );
  }

  function buildHistorialPrintHtml(list, title, layout) {
    list = list || [];
    if (layout === 'thermal') {
      var rows = list
        .slice(0, 30)
        .map(function (r) {
          return (
            thermalRowHtml(r.businessDate + ' · ' + (r.shiftLabel || r.shiftType), r.diff, { delta: true }) +
            thermalRowHtml('Vendido / Real', fmt(r.totalSales) + ' / ' + fmt(r.actual))
          );
        })
        .join('<hr class="ct-hr">');
      return (
        '<div class="cierre-ticket"><style>' +
        cierreThermalStyles() +
        '</style><div class="ct-center ct-bold">' +
        esc(title || 'Historial') +
        '</div><hr class="ct-hr">' +
        (rows || '<div class="ct-center">Sin registros</div>') +
        thermalCutFeedHtml() +
        '</div>'
      );
    }
    var tr = list
      .map(function (r) {
        return (
          '<tr><td>' +
          esc(r.businessDate) +
          '</td><td>' +
          esc(r.shiftLabel || r.shiftType) +
          '</td><td class="num">' +
          fmt(r.totalSales) +
          '</td><td class="num">' +
          fmt(r.actual) +
          '</td><td class="num">' +
          fmt(r.diff) +
          '</td></tr>'
        );
      })
      .join('');
    return (
      '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
      cierrePrintStyles('td.num{text-align:right}') +
      '</style></head><body><div class="slip"><h1>' +
      esc(title) +
      '</h1><table><thead><tr><th>Fecha</th><th>Turno</th><th>Ventas</th><th>Real</th><th>Δ</th></tr></thead><tbody>' +
      tr +
      '</tbody></table></div></body></html>'
    );
  }

  function renderPrintFormatPickerHtml() {
    var cur = savedCierrePrintOutput();
    var opts = [
      { id: 'roll_58', label: '58 mm' },
      { id: 'roll_80', label: '80 mm' },
      { id: 'carta', label: 'Carta' },
      { id: 'oficio', label: 'Oficio' },
    ];
    var pills = opts
      .map(function (o) {
        return (
          '<button type="button" class="crozzo-print-output__btn' +
          (cur === o.id ? ' is-on' : '') +
          '" data-output="' +
          o.id +
          '" onclick="crozzoCierrePickPrintFormat(\'' +
          o.id +
          '\')">' +
          esc(o.label) +
          '</button>'
        );
      })
      .join('');
    return (
      '<div class="crozzo-cierre-print-format" data-print-output-scope="cierre">' +
      '<span class="crozzo-cierre-print-format__lbl">Formato de impresión</span>' +
      '<div class="crozzo-print-output__pills">' +
      pills +
      '</div>' +
      '<span class="form-hint" style="font-size:0.72rem;margin:0">58/80 mm → rollo POS · Carta/Oficio → impresora de oficina</span></div>'
    );
  }

  function renderExportCard(icon, title, sub, dlOnclick, prOnclick) {
    return (
      '<article class="crozzo-cierre-export-card"><div class="crozzo-cierre-export-card__head">' +
      '<span class="crozzo-cierre-export-btn__icon"><i data-lucide="' +
      icon +
      '"></i></span><div class="crozzo-cierre-export-card__txt"><strong>' +
      esc(title) +
      '</strong><span>' +
      esc(sub) +
      '</span></div></div><div class="crozzo-cierre-export-card__actions">' +
      (dlOnclick
        ? '<button type="button" class="btn btn-outline btn-sm crozzo-cierre-export-dl" onclick="' +
          dlOnclick +
          '"><i data-lucide="download"></i> Descargar</button>'
        : '') +
      '<button type="button" class="btn btn-primary btn-sm crozzo-cierre-export-pr" onclick="' +
      prOnclick +
      '"><i data-lucide="printer"></i> Imprimir</button></div></article>'
    );
  }

  function       renderExportSectionHtml() {
    return (
      '<section class="crozzo-cierre-export" aria-label="Descargar e imprimir">' +
      '<div class="crozzo-cierre-section-head"><h3>Cuadre e impresión</h3>' +
      '<p>Cuadre simple: suma automática y descuadre vs venta + propinas del POS</p></div>' +
      '<div class="crozzo-cuadre-studio-cta">' +
      '<button type="button" class="btn btn-primary" onclick="crozzoCierreOpenCuadreStudio()"><i data-lucide="calculator"></i> Abrir cuadre de caja</button></div>' +
      renderPrintFormatPickerHtml() +
      '<div class="crozzo-cierre-export-grid">' +
      renderExportCard(
        'clipboard-list',
        'Formato cuadre oficial',
        'Logo · ventas · gastos · propinas · descuadre',
        '',
        'crozzoCierrePrintUltimoCuadre()'
      ) +
      renderExportCard('file-text', 'Reporte del día', 'Resumen KPIs y turnos', '', 'crozzoCierrePrintDiaReport()') +
      renderExportCard('receipt', 'Ventas del día', 'Listado de facturas', '', 'crozzoCierrePrintVentasDia()') +
      renderExportCard('history', 'Historial cierres', 'Arqueos (filtro activo)', '', 'crozzoCierrePrintHistorial()') +
      '</div></section>'
    );
  }

  function pickPrintFormat(id) {
    id = normalizePrintOutput(id);
    try {
      localStorage.setItem(LS_PRINT_OUT, id);
    } catch (_) {}
    document.querySelectorAll('[data-print-output-scope="cierre"] .crozzo-print-output__btn').forEach(function (btn) {
      btn.classList.toggle('is-on', btn.getAttribute('data-output') === id);
    });
    if (typeof showToast === 'function') showToast('Formato cierre: ' + cierreFormatLabel(id === 'roll_58' || id === 'roll_80' ? 'thermal' : 'normal', id === 'roll_58' ? '58mm' : '80mm'), 'info');
  }

  function numInput(id) {
    var el = document.getElementById(id);
    if (!el) return 0;
    return Math.round(Number(el.value) || 0);
  }

  function inputHasValue(id) {
    var el = document.getElementById(id);
    if (!el) return false;
    return String(el.value || '').trim() !== '';
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setDescuadreStatus(diff, hasInput) {
    var valEl = document.getElementById('crozzo-cuadre-descuadre-val');
    var lblEl = document.getElementById('crozzo-cuadre-estado-lbl');
    var box = document.getElementById('crozzo-cuadre-result');
    if (!lblEl || !box) return;
    if (!hasInput) {
      if (valEl) valEl.textContent = '—';
      lblEl.textContent = 'Ingrese valores o use formato en blanco';
      box.className = 'crozzo-cuadre-result';
      return;
    }
    var n = Number(diff) || 0;
    if (valEl) valEl.textContent = (n >= 0 ? '+' : '−') + fmt(Math.abs(n));
    if (Math.abs(n) < 1) {
      lblEl.textContent = 'CUADRA';
      box.className = 'crozzo-cuadre-result crozzo-cuadre-result--ok';
    } else if (n > 0) {
      lblEl.textContent = 'SOBRA · revisar';
      box.className = 'crozzo-cuadre-result crozzo-cuadre-result--warn';
    } else {
      lblEl.textContent = 'DESCUADRADO · falta';
      box.className = 'crozzo-cuadre-result crozzo-cuadre-result--bad';
    }
  }

  function getPosPropinasAuto() {
    var metrics = getCuadreContextMetrics();
    var invoices = metrics.invoices || [];
    if ((!invoices || !invoices.length) && D.facturasForCierreRecord) {
      var pending = __cuadreFormRec || (D.getPendingArqueo ? D.getPendingArqueo() : null);
      if (pending) invoices = D.facturasForCierreRecord(pending);
    }
    return aggregatePropinasFromInvoices(invoices);
  }

  function getCuadreFormMeta() {
    return {
      fecha: document.getElementById('crozzo-cuadre-dia') ? document.getElementById('crozzo-cuadre-dia').textContent.trim() : todayKey(),
      turno: document.getElementById('crozzo-cuadre-turno') ? document.getElementById('crozzo-cuadre-turno').textContent.trim() : '—',
      responsable: document.getElementById('crozzo-cuadre-cajero') ? document.getElementById('crozzo-cuadre-cajero').textContent.trim() : '—',
      notas: document.getElementById('crozzo-cuadre-notas') ? document.getElementById('crozzo-cuadre-notas').value : '',
    };
  }

  function getCuadreFormMetaFromSheet(sheet) {
    sheet = sheet || {};
    return {
      fecha: sheet.fecha || todayKey(),
      turno: sheet.turno || '—',
      responsable: sheet.responsable || '—',
      notas: sheet.notas || '',
    };
  }

  function isCuadreFormBlank() {
    return (
      !inputHasValue('crozzo-cuadre-efectivo') &&
      !inputHasValue('crozzo-cuadre-docs') &&
      !inputHasValue('crozzo-cuadre-datafonos') &&
      !inputHasValue('crozzo-cuadre-gastos')
    );
  }

  function blankLineHtml(label, layout) {
    if (layout === 'thermal') {
      return '<div class="ct-row"><span>' + esc(label) + '</span><span>_____________</span></div>';
    }
    return '<tr><td>' + esc(label) + '</td><td style="border-bottom:1px solid #333">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td></tr>';
  }

  function buildBlankCuadreHtml(meta, layout) {
    meta = meta || getCuadreFormMeta();
    var brand = getBrandPrintMeta();
    var logoHtml = brand.logoSrc ? '<img class="ct-logo" src="' + esc(brand.logoSrc) + '" alt="">' : '';
    var lines = ['Efectivo', 'Documentos', 'Datáfonos', 'Gastos', 'Total contado', 'Venta POS', 'Propinas POS', 'Referencia', 'Descuadre'];
    if (layout === 'thermal') {
      return (
        '<div class="cierre-ticket"><style>' +
        cierreThermalStyles() +
        '</style>' +
        logoHtml +
        '<div class="ct-center ct-bold">' +
        esc(brand.title) +
        '</div>' +
        '<div class="ct-center ct-sm">CUADRE EN BLANCO</div>' +
        '<hr class="ct-hr">' +
        thermalRowHtml('Día', meta.fecha) +
        thermalRowHtml('Turno', meta.turno) +
        thermalRowHtml('Cajero', meta.responsable) +
        '<hr class="ct-hr">' +
        lines.map(function (l) {
          return blankLineHtml(l, 'thermal');
        }).join('') +
        '<hr class="ct-hr"><div class="ct-center ct-sm">PROPINAS</div>' +
        blankLineHtml('Efectivo', 'thermal') +
        blankLineHtml('Datáfonos', 'thermal') +
        blankLineHtml('Total', 'thermal') +
        '<hr class="ct-hr"><div class="ct-sm"><strong>Anotaciones:</strong><br>______________________________<br>______________________________</div>' +
        '<div class="ct-sig">Firma cajero</div>' +
        thermalCutFeedHtml() +
        '</div>'
      );
    }
    var tr = lines
      .map(function (l) {
        return blankLineHtml(l, 'normal');
      })
      .join('');
    return (
      '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Cuadre en blanco</title><style>' +
      cierrePrintStyles(
        '.cuadre-head{display:flex;gap:12px;align-items:center;margin-bottom:10px}.cuadre-table{width:100%;border-collapse:collapse;font-size:12px}' +
          '.cuadre-notes{margin-top:12px;padding:12px;border:1px dashed #999;min-height:72px}'
      ) +
      '</style></head><body><div class="slip"><header class="cuadre-head">' +
      (brand.logoSrc ? '<img src="' + esc(brand.logoSrc) + '" alt="" style="width:56px;height:56px;object-fit:contain">' : '') +
      '<div><h1>' +
      esc(brand.title) +
      '</h1><p>' +
      esc(meta.fecha) +
      ' · ' +
      esc(meta.turno) +
      ' · ' +
      esc(meta.responsable) +
      '</p><p><strong>Formato en blanco — llenar a mano</strong></p></div></header>' +
      '<table class="cuadre-table"><tbody>' +
      tr +
      '</tbody></table>' +
      '<p style="font-weight:700;margin:12px 0 4px">Propinas contadas</p><table class="cuadre-table"><tbody>' +
      blankLineHtml('Efectivo', 'normal') +
      blankLineHtml('Datáfonos', 'normal') +
      blankLineHtml('Total', 'normal') +
      '</tbody></table>' +
      '<div class="cuadre-notes"><strong>Anotaciones:</strong></div>' +
      '<div class="signatures"><div class="sig">Firma cajero</div><div class="sig">Firma supervisor</div></div></div></body></html>'
    );
  }

  function buildBlankCuadreRecord() {
    var meta = getCuadreFormMeta();
    var brand = getBrandPrintMeta();
    return {
      businessDate: meta.fecha,
      shiftLabel: meta.turno,
      closedBy: meta.responsable,
      notes: meta.notas,
      _draft: true,
      cuadreSheet: {
        blank: true,
        brand: brand,
        fecha: meta.fecha,
        turno: meta.turno,
        responsable: meta.responsable,
        notas: meta.notas,
      },
    };
  }

  function getCuadreContextMetrics() {
    var pending = __cuadreFormRec || (D.getPendingArqueo ? D.getPendingArqueo() : null);
    if (pending && pending._metrics) return pending._metrics;
    if (D.buildOperationalSnapshot) {
      var snap = D.buildOperationalSnapshot();
      var type = pending ? pending.shiftType : null;
      if (type && snap[type]) return snap[type];
      return snap.dia;
    }
    return { total: 0, count: 0, cash: 0, byMethod: {} };
  }

  function recalcCuadreForm() {
    var fondo = numInput('crozzo-cuadre-fondo');
    var efectivo = numInput('crozzo-cuadre-efectivo');
    var docs = numInput('crozzo-cuadre-docs');
    var datafonos = numInput('crozzo-cuadre-datafonos');
    var gastos = numInput('crozzo-cuadre-gastos');
    var propEf = numInput('crozzo-cuadre-prop-efectivo');
    var propDf = numInput('crozzo-cuadre-prop-datafono');
    var hasInput =
      inputHasValue('crozzo-cuadre-efectivo') ||
      inputHasValue('crozzo-cuadre-docs') ||
      inputHasValue('crozzo-cuadre-datafonos') ||
      inputHasValue('crozzo-cuadre-gastos');
    var metrics = getCuadreContextMetrics();
    var ventaPos = Number(metrics.total) || 0;
    var propPos = getPosPropinasAuto();
    var refPos = ventaPos + propPos.total;
    var totalContado = efectivo + docs + datafonos + gastos;
    var descuadre = totalContado - refPos;
    setText('crozzo-cuadre-total-sumado', hasInput ? fmt(totalContado) : '—');
    setText('crozzo-cuadre-venta-pos', fmt(ventaPos));
    setText('crozzo-cuadre-propinas-pos', fmt(propPos.total));
    setText('crozzo-cuadre-ref-pos', fmt(refPos));
    setText('crozzo-cuadre-prop-total', fmt(propEf + propDf));
    setDescuadreStatus(descuadre, hasInput);
    return {
      fondo: fondo,
      docs: docs,
      datafonos: datafonos,
      gastos: gastos,
      efectivo: efectivo,
      totalSumado: totalContado,
      totalVendido: ventaPos,
      propPosAuto: propPos.total,
      refPos: refPos,
      esperadoCaja: refPos,
      descVenta: descuadre,
      descCaja: descuadre,
      propEf: propEf,
      propDf: propDf,
      propTotal: propEf + propDf,
    };
  }

  var __cuadreModalHooked = false;

  function hookCuadreModalShell() {
    if (__cuadreModalHooked) return;
    var modal = document.getElementById('crozzo-cuadre-modal');
    if (!modal) return;
    __cuadreModalHooked = true;
    var card = modal.querySelector('.crozzo-cuadre-modal__card');
    modal.addEventListener(
      'pointerdown',
      function (e) {
        if (e.target === modal) closeCuadreForm();
      },
      true
    );
    if (card) {
      card.addEventListener('pointerdown', function (e) {
        e.stopPropagation();
      });
      card.addEventListener('click', function (e) {
        e.stopPropagation();
      });
    }
  }

  function hookCuadreFormCalc() {
    hookCuadreModalShell();
    if (__cuadreCalcHooked) return;
    __cuadreCalcHooked = true;
    document.addEventListener(
      'input',
      function (e) {
        if (!e.target || !e.target.getAttribute || e.target.getAttribute('data-cuadre-manual') !== '1') return;
        if (!document.getElementById('crozzo-cuadre-modal') || document.getElementById('crozzo-cuadre-modal').hidden) return;
        recalcCuadreForm();
      },
      true
    );
  }

  function thermalCutFeedHtml() {
    var lines = getThermalCutFeedLines();
    if (typeof global.crozzoThermalCutFeedBlock === 'function') {
      return global.crozzoThermalCutFeedBlock({ lines: lines, linePx: 16 });
    }
    var linePx = 16;
    var blank = '';
    var i;
    for (i = 0; i < lines; i++) {
      blank +=
        '<div class="ct-feed-line" style="height:' +
        linePx +
        'px;line-height:' +
        linePx +
        'px;font-size:' +
        linePx +
        'px;">&nbsp;</div>';
    }
    return (
      '<div class="ct-cut-spacer" aria-hidden="true">&nbsp;</div>' +
      '<div class="ct-cut-zone">' +
      '<div class="ct-cut-marker"></div>' +
      '<div class="ct-cut-label">— — — ✂ CORTE AQUÍ ✂ — — —</div>' +
      '<div class="ct-cut-marker ct-cut-marker--light"></div>' +
      blank +
      '</div>' +
      '<div class="ct-page-end" aria-hidden="true">&nbsp;</div>'
    );
  }

  function hasThermalCutMarkup(html) {
    return /<div[^>]*class=["'][^"']*ct-cut-zone/i.test(String(html || ''));
  }

  function appendThermalCutFeed(html) {
    if (!html || hasThermalCutMarkup(html)) return html;
    if (/<\/div>\s*$/.test(html)) {
      return html.replace(/<\/div>\s*$/, thermalCutFeedHtml() + '</div>');
    }
    return html + thermalCutFeedHtml();
  }

  function cuadreSheetFromFormCalc(calc, meta) {
    meta = meta || {};
    var brand = getBrandPrintMeta();
    return {
      brand: brand,
      empresa: getEmpresaPrintMeta(),
      fecha: meta.fecha || todayKey(),
      fechaCierre: meta.fechaCierre || new Date().toLocaleString('es-CO'),
      responsable: meta.responsable || '—',
      turno: meta.turno || '—',
      fondo: calc.fondo,
      efectivoDocumentos: calc.docs,
      datafonos: calc.datafonos,
      gastos: calc.gastos,
      totalSumado: calc.totalSumado,
      totalVendido: calc.totalVendido,
      totalReal: calc.efectivo,
      esperadoSistema: calc.esperadoCaja,
      descuadre: calc.descCaja,
      descuadreVenta: calc.descVenta,
      refPos: calc.refPos,
      propinasPosAuto: calc.propPosAuto,
      propinasManualTotal: calc.propTotal,
      propinasTotal: calc.propTotal,
      propinasEfectivo: calc.propEf,
      propinasDatafono: calc.propDf,
      ventasCount: meta.ventasCount || 0,
      notas: meta.notas || '',
      draft: !!meta.draft,
    };
  }

  function fillCuadreFormFromContext(pending) {
    hookCuadreFormCalc();
    var metrics = pending && pending._metrics ? pending._metrics : getCuadreContextMetrics();
    var actor = D.getCierreActor ? D.getCierreActor() : { name: '—' };
    var rec = pending
      ? enrichWithCuadre(Object.assign({}, pending, { closedAt: new Date().toISOString(), _draft: true }), metrics)
      : null;
    var sheet = rec ? rec.cuadreSheet : buildCuadreSheet({ businessDate: todayKey(), shiftType: 'dia', shiftLabel: 'Día' }, metrics);
    var brand = sheet.brand || getBrandPrintMeta();
    var set = function (id, v) {
      var el = document.getElementById(id);
      if (el) el.textContent = v;
    };
    set('crozzo-cuadre-dia', sheet.fecha);
    set('crozzo-cuadre-turno', sheet.turno);
    set('crozzo-cuadre-cajero', sheet.responsable || actor.name);
    var logoEl = document.getElementById('crozzo-cuadre-logo');
    if (logoEl) {
      if (brand.logoSrc) {
        logoEl.src = brand.logoSrc;
        logoEl.hidden = false;
      } else {
        logoEl.hidden = true;
        logoEl.removeAttribute('src');
      }
    }
    var setNum = function (id, v) {
      var el = document.getElementById(id);
      if (el) el.value = v != null && v !== '' ? String(Math.round(Number(v) || 0)) : '';
    };
    /* Campos manuales: los escribe el cajero. El sistema solo muestra venta/propinas POS y suma. */
    ['crozzo-cuadre-efectivo', 'crozzo-cuadre-docs', 'crozzo-cuadre-datafonos', 'crozzo-cuadre-gastos', 'crozzo-cuadre-prop-efectivo', 'crozzo-cuadre-prop-datafono'].forEach(function (id) {
      setNum(id, '');
    });
    var notes = document.getElementById('crozzo-cuadre-notas');
    if (notes) notes.value = (pending && pending.notes) || '';
    recalcCuadreForm();
  }

  function openCuadreStudio() {
    hookCuadreModalShell();
    var pending = D.getPendingArqueo ? D.getPendingArqueo() : null;
    var modal = document.getElementById('crozzo-cuadre-modal');
    if (!modal) {
      if (typeof showToast === 'function') showToast('Modal de cuadre no disponible — recargue la app', 'warning');
      return;
    }
    if (!pending && D.buildOperationalSnapshot) {
      var snap = D.buildOperationalSnapshot();
      var day = snap.day || {};
      var shift = day.activeShift || 'dia';
      var meta = D.SHIFT_META && D.SHIFT_META[shift] ? D.SHIFT_META[shift] : { label: shift };
      pending = {
        shiftType: shift,
        shiftLabel: meta.label || shift,
        businessDate: day.businessDate || todayKey(),
        fondo: 0,
        expected: 0,
        actual: 0,
        diff: 0,
        totalSales: snap[shift] ? snap[shift].total : snap.dia.total,
        cashSales: snap[shift] ? snap[shift].cash : snap.dia.cash,
        salesCount: snap[shift] ? snap[shift].count : snap.dia.count,
        byMethod: snap[shift] ? snap[shift].byMethod : snap.dia.byMethod,
        gastosTurno: 0,
        _metrics: snap[shift] || snap.dia,
        _draft: true,
      };
    }
    __cuadreFormRec = pending;
    fillCuadreFormFromContext(pending);
    modal.hidden = false;
    try {
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ nodes: [modal] });
    } catch (_) {}
  }

  function openCuadreFormFromArqueo() {
    openCuadreStudio();
  }

  function closeCuadreForm() {
    var modal = document.getElementById('crozzo-cuadre-modal');
    if (modal) modal.hidden = true;
    __cuadreFormRec = null;
  }

  function readCuadreFormValues() {
    var calc = recalcCuadreForm();
    var notes = document.getElementById('crozzo-cuadre-notas');
    return {
      fondo: calc.fondo,
      efectivoDocs: calc.docs,
      datafonos: calc.datafonos,
      gastos: calc.gastos,
      efectivo: calc.efectivo,
      totalSumado: calc.totalSumado,
      totalVendido: calc.totalVendido,
      esperadoCaja: calc.esperadoCaja,
      descuadreVenta: calc.descVenta,
      descuadreCaja: calc.descCaja,
      propinasEfectivo: calc.propEf,
      propinasDatafonos: calc.propDf,
      propinas: calc.propTotal,
      notas: notes ? notes.value : '',
    };
  }

  function buildRecFromCuadreForm() {
    var pending = __cuadreFormRec || (D.getPendingArqueo ? D.getPendingArqueo() : null);
    var metrics = getCuadreContextMetrics();
    var vals = readCuadreFormValues();
    var actor = D.getCierreActor ? D.getCierreActor() : { name: '—' };
    var base = pending
      ? Object.assign({}, pending, { closedAt: new Date().toISOString(), _draft: true })
      : {
          businessDate: todayKey(),
          shiftType: 'dia',
          shiftLabel: 'Día',
          _draft: true,
        };
    base.fondo = vals.fondo;
    base.gastosTurno = vals.gastos;
    base.actual = vals.efectivo;
    base.cashSales = vals.efectivoDocs;
    base.totalSales = vals.totalVendido;
    base.expected = vals.esperadoCaja;
    base.diff = vals.descuadreCaja;
    base.notes = String(vals.notas || '').trim();
    base.closedBy = base.closedBy || actor.name;
    var calc = recalcCuadreForm();
    var rec = enrichWithCuadre(base, metrics);
    rec.cuadreSheet = cuadreSheetFromFormCalc(calc, {
      fecha: document.getElementById('crozzo-cuadre-dia') ? document.getElementById('crozzo-cuadre-dia').textContent : base.businessDate,
      turno: document.getElementById('crozzo-cuadre-turno') ? document.getElementById('crozzo-cuadre-turno').textContent : base.shiftLabel,
      responsable: document.getElementById('crozzo-cuadre-cajero') ? document.getElementById('crozzo-cuadre-cajero').textContent : actor.name,
      ventasCount: metrics.count || 0,
      notas: base.notes,
      draft: true,
      fechaCierre: new Date().toLocaleString('es-CO'),
    });
    return rec;
  }

  function printBlankCuadreFromForm() {
    var rec = buildBlankCuadreRecord();
    if (typeof showToast === 'function') showToast('Imprimiendo formato en blanco…', 'info');
    return printCierreRecord(rec, { allowDialog: true, prepare: false });
  }

  function downloadBlankCuadreFromForm() {
    var layout = resolveCierrePrintLayout({ printOutput: savedCierrePrintOutput() });
    var html = buildBlankCuadreHtml(getCuadreFormMeta(), layout);
    if (layout === 'thermal' && !/^<!DOCTYPE/i.test(html)) html = wrapThermalInner(html, resolveCierrePaperMm('thermal', {}));
    try {
      var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'cuadre-caja-' + (getCuadreFormMeta().fecha || todayKey()) + '.html';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () {
        URL.revokeObjectURL(a.href);
      }, 4000);
      if (typeof showToast === 'function') showToast('Formato en blanco descargado', 'success');
      return true;
    } catch (e) {
      console.warn('[cierre-print] blank download', e);
      return printBlankCuadreFromForm();
    }
  }

  function printCuadreFromForm() {
    if (isCuadreFormBlank()) return printBlankCuadreFromForm();
    return printCierreRecord(buildRecFromCuadreForm(), { allowDialog: true, prepare: false });
  }

  function printHistRow(keyOrIdx) {
    var rec = resolveHistoryRecord(keyOrIdx);
    if (!rec) {
      if (typeof showToast === 'function') showToast('No se encontró ese cierre para imprimir', 'warning');
      return Promise.resolve(false);
    }
    if (typeof showToast === 'function') {
      showToast('Imprimiendo cuadre · ' + (rec.shiftLabel || rec.shiftType || 'turno') + ' ' + (rec.businessDate || ''), 'info');
    }
    return printCierreRecord(rec, { allowDialog: true, prepare: true });
  }

  function historyPrintCellHtml(rec) {
    var key = cierreRecordKey(rec);
    return (
      '<td class="crozzo-cierre-hist-print-cell"><button type="button" class="crozzo-cierre-hist-print" title="Imprimir cuadre de este cierre" onclick="crozzoCierrePrintHistRow(' +
      JSON.stringify(key) +
      ')"><i data-lucide="printer"></i></button></td>'
    );
  }

  /* Globals */
  global.CrozzoCierrePrint = {
    boot: boot,
    renderExportSectionHtml: renderExportSectionHtml,
    enrichWithCuadre: enrichWithCuadre,
    buildCuadreSheet: buildCuadreSheet,
    historyPrintCellHtml: historyPrintCellHtml,
    setHistPrintCache: function (rows) {
      __histPrintCache = rows || [];
    },
    printOnFinalize: function (rec) {
      try {
        if (rec && rec.recordKind !== 'supervision' && typeof D.pushCierreToPlanilla === 'function') {
          D.pushCierreToPlanilla(rec);
        }
      } catch (e) {
        console.warn('[cierre-print] planilla sync', e);
      }
      return printCierreRecord(rec, { allowDialog: false, silentToast: true, prepare: true });
    },
    cierreRecordKey: cierreRecordKey,
    resolveHistoryRecord: resolveHistoryRecord,
    prepareRecordForPrint: prepareRecordForPrint,
  };

  global.crozzoCierrePickPrintFormat = pickPrintFormat;
  global.crozzoCierreOpenCuadreStudio = openCuadreStudio;
  global.crozzoCierrePrintArqueoDraft = openCuadreFormFromArqueo;
  global.crozzoCierreCloseCuadreForm = closeCuadreForm;
  global.crozzoCierrePrintCuadreFromForm = printCuadreFromForm;
  global.crozzoCierreDownloadCuadreBlank = downloadBlankCuadreFromForm;
  global.crozzoCierrePrintCuadreBlank = printBlankCuadreFromForm;
  global.crozzoCierrePrintCierreRecord = printCierreRecord;
  global.crozzoCierrePrintUltimoCuadre = function () {
    var rows = D.getHistoryRows ? D.getHistoryRows() : [];
    if (!rows.length) {
      if (typeof showToast === 'function') showToast('Sin cierres para imprimir', 'warning');
      return Promise.resolve(false);
    }
    return printCierreRecord(rows[0], { allowDialog: true, prepare: true });
  };
  global.crozzoCierrePrintDiaReport = function () {
    return dispatchCierrePrint(buildDiaReportHtml, { allowDialog: true, formatHint: true, printOutput: savedCierrePrintOutput() });
  };
  global.crozzoCierrePrintVentasDia = function () {
    var list = D.crozzoRepFilterFacturasOperationalDay ? D.crozzoRepFilterFacturasOperationalDay() : [];
    if (!list.length) {
      if (typeof showToast === 'function') showToast('Sin ventas en el día', 'warning');
      return Promise.resolve(false);
    }
    return dispatchCierrePrint(
      function (layout) {
        if (layout === 'thermal') {
          var rows = list
            .slice(0, 35)
            .map(function (f, i) {
              return thermalRowHtml(i + 1 + '. ' + (f.consecutivo || ''), f.total);
            })
            .join('');
          return (
            '<div class="cierre-ticket"><style>' +
            cierreThermalStyles() +
            '</style><div class="ct-center ct-bold">VENTAS DÍA</div><hr class="ct-hr">' +
            rows +
            thermalCutFeedHtml() +
            '</div>'
          );
        }
        return buildHistorialPrintHtml(
          list.map(function (f) {
            return {
              businessDate: f.consecutivo || f.uuid,
              shiftLabel: f.metodoPago,
              totalSales: f.total,
              actual: f.total,
              diff: 0,
            };
          }),
          'Ventas del día',
          layout
        );
      },
      { allowDialog: true, formatHint: true, landscape: true, printOutput: savedCierrePrintOutput() }
    );
  };
  global.crozzoCierrePrintHistorial = function () {
    var all = D.getHistoryRows ? D.getHistoryRows() : [];
    var list = D.filterHistoryRows ? D.filterHistoryRows(all) : all;
    if (!list.length) {
      if (typeof showToast === 'function') showToast('No hay cierres para imprimir', 'warning');
      return Promise.resolve(false);
    }
    return dispatchCierrePrint(
      function (layout) {
        return buildHistorialPrintHtml(list, 'Historial de cierres', layout);
      },
      { allowDialog: true, formatHint: true, landscape: true, printOutput: savedCierrePrintOutput() }
    );
  };
  global.crozzoCierrePrintHistRow = printHistRow;
  global.crozzoCierreBuildCuadreSheet = buildCuadreSheet;

  if (global.__CROZZO_CIERRE_PRINT_DEPS__) {
    boot(global.__CROZZO_CIERRE_PRINT_DEPS__);
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', hookCuadreModalShell);
    } else {
      hookCuadreModalShell();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
