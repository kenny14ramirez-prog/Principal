// Pagina de Facturas (extraida de CrozzoPosMain.js, cirugia de modularizacion).
// Estado de filtros + render/acciones del historial de comprobantes. Funciones
// globales invocadas por el router en runtime; cargar antes de CrozzoPosMain.
// ==========================================
// FACTURAS PAGE
// ==========================================
var facturasFilterEstado = 'todos';
var facturasFilterQ = '';
var facturasFilterPeriodDays = 1;
var __facturasArchiveRows = [];
var facturaPreviewIdx = null;
var facturaPreviewRowKey = null;
function crozzoFacturaEstadoBadgeHtml(f) {
  if (!f) return '';
  var e = f.estado || '';
  var doc = '';
  if (e === 'anulada' || f.anulada === true) doc = '<span class="badge badge-danger">⛔ Anulada</span>';
  else if (e === 'demo') doc = '<span class="badge badge-warning">🧪 Demo</span>';
  else if (e === 'pos') doc = '<span class="badge badge-info">🧾 POS</span>';
  else if (e === 'precuenta') doc = '<span class="badge badge-info">📋 Precuenta</span>';
  else if (e === 'timbrada') doc = '<span class="badge badge-success">✅ Timbrada</span>';
  else doc = '<span class="badge badge-info">' + escUserAttr(e || '—') + '</span>';
  if (e === 'anulada' || f.anulada === true) return doc;
  var cob =
    typeof CrozzoCarteraComercial !== 'undefined' && CrozzoCarteraComercial.cobroBadgeHtml
      ? CrozzoCarteraComercial.cobroBadgeHtml(f)
      : '';
  return cob ? doc + ' ' + cob : doc;
}
function crozzoFacturaMatchesListFilter(f) {
  if (facturasFilterEstado === 'cobro_pendiente') {
    return (
      typeof CrozzoCarteraComercial !== 'undefined' &&
      CrozzoCarteraComercial.matchesFacturaCobroFilter &&
      CrozzoCarteraComercial.matchesFacturaCobroFilter(f, 'cobro_pendiente')
    );
  }
  if (facturasFilterEstado === 'anulada') return f.estado === 'anulada' || f.anulada === true;
  if (facturasFilterEstado !== 'todos') {
    if (f.estado === 'anulada' || f.anulada === true) return false;
    return f.estado === facturasFilterEstado;
  }
  return true;
}
function crozzoFacturaServicioLabel(f) {
  if (!f) return '—';
  if (f.mesa) return 'Mesa ' + String(f.mesa);
  if (f.tipoServicio === 'llevar') return 'Para llevar';
  if (f.contextoServicio) return String(f.contextoServicio);
  if (f.tipoServicio) return String(f.tipoServicio);
  return '—';
}
function crozzoFacturaPagoCorto(f) {
  if (!f) return '—';
  var raw =
    typeof crozzoMetodoPagoDescripcion === 'function'
      ? crozzoMetodoPagoDescripcion(f.metodoPago, f.paymentMeta, { htmlSafe: false })
      : String(f.metodoPago || '—');
  if (raw.length > 28) return raw.slice(0, 26) + '…';
  return raw;
}
function crozzoFacturasResumenFiltrado(rows) {
  rows = rows || [];
  var total = 0;
  var items = 0;
  var pendientes = 0;
  rows.forEach(function (row) {
    var f = row.f;
    total += Number(f.total || f.totalFactura || 0);
    items += Array.isArray(f.items) ? f.items.length : 0;
    if (
      typeof CrozzoCarteraComercial !== 'undefined' &&
      CrozzoCarteraComercial.matchesFacturaCobroFilter &&
      CrozzoCarteraComercial.matchesFacturaCobroFilter(f, 'cobro_pendiente')
    ) {
      pendientes += 1;
    }
  });
  return { count: rows.length, total: total, items: items, pendientes: pendientes };
}
function crozzoFacturaPeriodBounds() {
  if (typeof CrozzoFacturasArchivo !== 'undefined' && CrozzoFacturasArchivo.periodBounds) {
    return CrozzoFacturasArchivo.periodBounds(facturasFilterPeriodDays);
  }
  var days = Math.max(1, Number(facturasFilterPeriodDays) || 1);
  var end = new Date();
  var start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  var pad = function (n) {
    return String(n).padStart(2, '0');
  };
  return {
    from:
      start.getFullYear() + '-' + pad(start.getMonth() + 1) + '-' + pad(start.getDate()),
    to: end.getFullYear() + '-' + pad(end.getMonth() + 1) + '-' + pad(end.getDate()),
  };
}
function crozzoFacturaInViewPeriod(f) {
  if (!f) return false;
  var b = crozzoFacturaPeriodBounds();
  var dk = String(f.fecha || f.fechaEmision || '').slice(0, 10);
  if (!dk) return facturasFilterPeriodDays <= 1;
  return dk >= b.from && dk <= b.to;
}
function crozzoCollectFacturaViewRows() {
  var bounds = crozzoFacturaPeriodBounds();
  var rows = [];
  var all = config.getFacturas();
  all.forEach(function (f, i) {
    if (
      typeof CrozzoFacturasArchivo !== 'undefined' &&
      CrozzoFacturasArchivo.facturaInBounds &&
      CrozzoFacturasArchivo.facturaInBounds(f, bounds.from, bounds.to)
    ) {
      rows.push({ f: f, idx: i, archived: false });
    } else if (crozzoFacturaInViewPeriod(f)) {
      rows.push({ f: f, idx: i, archived: false });
    }
  });
  (__facturasArchiveRows || []).forEach(function (row) {
    rows.push(row);
  });
  rows.sort(function (a, b) {
    var da = String((a.f && (a.f.fecha || a.f.fechaEmision)) || '');
    var db = String((b.f && (b.f.fecha || b.f.fechaEmision)) || '');
    return db.localeCompare(da);
  });
  return rows;
}
function crozzoGetFacturasFiltradas() {
  var q = String(facturasFilterQ || '').trim().toLowerCase();
  return crozzoCollectFacturaViewRows().filter(function (row) {
    var f = row.f;
    if (!crozzoFacturaMatchesListFilter(f)) return false;
    if (!q) return true;
    var blob = [
      f.consecutivo,
      f.compradorNombre,
      f.compradorNit,
      f.uuid,
      f.cufe,
      f.fecha,
      f.metodoPago,
      f.mesa,
      f.tipoServicio,
      f.contextoServicio
    ]
      .join(' ')
      .toLowerCase();
    return blob.indexOf(q) >= 0;
  });
}
function setFacturasPeriod(days) {
  days = Math.max(1, Number(days) || 1);
  facturasFilterPeriodDays = days;
  facturaPreviewIdx = null;
  facturaPreviewRowKey = null;
  if (typeof CrozzoFacturasArchivo !== 'undefined' && CrozzoFacturasArchivo.loadForPeriod) {
    CrozzoFacturasArchivo.loadForPeriod(days).then(function (archRows) {
      __facturasArchiveRows = archRows || [];
      refreshFacturasFilteredView();
    });
    return;
  }
  __facturasArchiveRows = [];
  refreshFacturasFilteredView();
}
function crozzoFacturaRowKey(row) {
  if (!row) return '';
  if (row.archived && row.archId) return 'arch:' + row.archId;
  return String(row.idx);
}
function crozzoResolveFacturaRow(key) {
  if (String(key || '').indexOf('arch:') === 0) {
    var id = String(key).slice(5);
    return (__facturasArchiveRows || []).find(function (r) {
      return r.archId === id;
    });
  }
  var idx = Number(key);
  var f = config.getFacturas()[idx];
  if (!f) return null;
  return { f: f, idx: idx, archived: false };
}
function setFacturasFilter(estado) {
  facturasFilterEstado = estado || 'todos';
  refreshFacturasFilteredView();
}
function crozzoNegocioFeHabilitada() {
  if (typeof global.CrozzoTermicaColombia !== 'undefined' && global.CrozzoTermicaColombia.negocioFeHabilitada) {
    return global.CrozzoTermicaColombia.negocioFeHabilitada();
  }
  return typeof config !== 'undefined' && typeof config.isElectronicMode === 'function' && config.isElectronicMode();
}
function crozzoFacturaEsDocumentoFe(f) {
  if (typeof global.CrozzoTermicaColombia !== 'undefined' && global.CrozzoTermicaColombia.esDocumentoFe) {
    return global.CrozzoTermicaColombia.esDocumentoFe(f);
  }
  return false;
}
function crozzoFacturaQrMostrable(f) {
  return crozzoFacturaEsDocumentoFe(f) && !!crozzoFacturaQrUrlResolve(f);
}
function crozzoFacturaCufeMostrable(f) {
  if (!crozzoFacturaEsDocumentoFe(f) || !f) return false;
  var c = String(f.cufe || '').trim();
  return !!(c && c !== 'NO-APLICA-POS' && !/^pendiente/i.test(c));
}
function crozzoFacturaImpuestoEtiqueta() {
  if (typeof crozzoFiscalEtiquetas === 'function') {
    return crozzoFiscalEtiquetas().impuesto;
  }
  var imp = typeof crozzoGetImpuestosEfectivos === 'function' ? crozzoGetImpuestosEfectivos() : (typeof config !== 'undefined' && config.getImpuestos ? config.getImpuestos() : {});
  if (typeof global.CrozzoTermicaColombia !== 'undefined' && global.CrozzoTermicaColombia.cuentaEtiquetasFiscales) {
    var lab = global.CrozzoTermicaColombia.cuentaEtiquetasFiscales(imp, !!imp.ivaIncluidoEnPrecios);
    return lab.impuesto || 'Impuesto';
  }
  return 'Impuesto';
}
function crozzoBuildFacturaSheetDocumentHtml(factura, opts) {
  opts = opts || {};
  var pageFormat = String(opts.pageFormat || 'carta').toLowerCase();
  var pageSize = pageFormat === 'oficio' || pageFormat === 'legal' ? 'legal' : 'A4';
  var f = Object.assign({}, factura || {});
  if (typeof crozzoEnrichCuentaFacturaColombia === 'function') {
    f = crozzoEnrichCuentaFacturaColombia(f, { incluirPropinaSugerida: false });
  }
  var emp = typeof config !== 'undefined' && config.getEmpresa ? config.getEmpresa() : {};
  var esc =
    typeof escHtml === 'function'
      ? escHtml
      : function (s) {
          return String(s ?? '');
        };
  var legal =
    typeof global.crozzoTermicaLegalPayloadColombia === 'function'
      ? global.crozzoTermicaLegalPayloadColombia(f)
      : {};
  var esFe = typeof crozzoFacturaEsDocumentoFe === 'function' ? crozzoFacturaEsDocumentoFe(f) : false;
  var docTitle = legal.head || (esFe ? 'FACTURA ELECTRÓNICA DE VENTA' : 'COMPROBANTE DE VENTA');
  var docSub = esFe ? 'Representación impresa · verifique CUFE y QR' : 'Documento soporte POS · no es FE DIAN';
  var logoUrl =
    typeof crozzoResolveTicketLogoUrl === 'function'
      ? crozzoResolveTicketLogoUrl()
      : String(emp.logoUrl || emp.logo || '').trim();
  if (logoUrl && typeof crozzoResolveAssetUrl === 'function') logoUrl = crozzoResolveAssetUrl(logoUrl);
  var logoBlock = logoUrl
    ? '<div class="fact-logo"><img src="' + esc(logoUrl) + '" alt="Logo empresa" /></div>'
    : '';
  var soloConsumo = typeof crozzoFacturaSoloProductosConsumo === 'function' ? crozzoFacturaSoloProductosConsumo(f) : false;
  var itemsHtml = (f.items || [])
    .map(function (item, idx) {
      var ref = String(item.sku || item.codigo || item.id || '—');
      var nom =
        typeof crozzoCuentaItemNombreConsumo === 'function'
          ? crozzoCuentaItemNombreConsumo(item)
          : item.nombreVenta || item.nombre || '';
      var qty = Number(item.cantidad) || 0;
      var precio = Number(item.precio) || 0;
      return (
        '<tr><td class="num">' +
        (idx + 1) +
        '</td><td class="ref">' +
        esc(ref) +
        '</td><td>' +
        esc(String(item.icon ? item.icon + ' ' : '') + nom) +
        (item.detalleConfig && !soloConsumo
          ? '<br><small style="color:#64748b;">' + esc(String(item.detalleConfig)) + '</small>'
          : '') +
        '</td><td class="num">' +
        qty +
        '</td><td class="num">$' +
        precio.toLocaleString('es-CO') +
        '</td><td class="num">$' +
        (precio * qty).toLocaleString('es-CO') +
        '</td></tr>'
      );
    })
    .join('');
  var impLbl =
    typeof crozzoFacturaImpuestoEtiqueta === 'function' ? crozzoFacturaImpuestoEtiqueta() : legal.etiquetaImpuesto || 'Impuesto';
  var subLbl = legal.etiquetaSubtotal || 'Subtotal';
  var propinaHist = Number((f.paymentMeta && f.paymentMeta.propina) || 0);
  var totRows =
    '<tr><td class="lbl">' +
    esc(subLbl) +
    '</td><td class="num">$' +
    Number(f.subtotal || 0).toLocaleString('es-CO') +
    '</td></tr>' +
    '<tr><td class="lbl">' +
    esc(impLbl) +
    '</td><td class="num">$' +
    Number(f.iva || 0).toLocaleString('es-CO') +
    '</td></tr>' +
    (propinaHist > 0
      ? '<tr><td class="lbl">Propina</td><td class="num">$' + propinaHist.toLocaleString('es-CO') + '</td></tr>'
      : '') +
    '<tr class="total"><td class="lbl">TOTAL</td><td class="num">$' +
    Number(f.total || 0).toLocaleString('es-CO') +
    '</td></tr>';
  var pagoTxt =
    typeof crozzoMetodoPagoDescripcion === 'function'
      ? crozzoMetodoPagoDescripcion(f.metodoPago, f.paymentMeta, { htmlSafe: false })
      : f.metodoPago || '—';
  var legalBlock = '';
  (legal.legalTicketLineas || []).forEach(function (ln) {
    if (!ln || !ln.t) return;
    if (ln.k === 'head') {
      legalBlock += '<h4>' + esc(ln.t) + '</h4>';
      return;
    }
    legalBlock += '<p>' + esc(ln.t) + '</p>';
  });
  var cufeBlock =
    typeof crozzoFacturaCufeMostrable === 'function' && crozzoFacturaCufeMostrable(f)
      ? '<div class="fact-cufe"><strong>CUFE</strong><p>' + esc(String(f.cufe)) + '</p></div>'
      : '';
  var qrBlock = '';
  if (typeof crozzoFacturaQrMostrable === 'function' && crozzoFacturaQrMostrable(f)) {
    var qrUrlResolved = typeof crozzoFacturaQrUrlResolve === 'function' ? crozzoFacturaQrUrlResolve(f) : String(f.qrUrl || '');
    if (qrUrlResolved) {
      var qrSrc =
        'https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=' + encodeURIComponent(qrUrlResolved);
      qrBlock =
        '<div class="fact-qr"><img src="' + esc(qrSrc) + '" alt="QR verificación DIAN" /><p>Verificación DIAN</p></div>';
    }
  }
  var demoBanner =
    String(f.estado || '') === 'demo' || f.is_demo
      ? '<div class="fact-demo">DOCUMENTO DEMO — SIN VALIDEZ FISCAL</div>'
      : '';
  var nombreEmp = emp.nombreComercial || emp.razonSocial || 'Empresa';
  var razonSec =
    emp.razonSocial && emp.nombreComercial && emp.razonSocial !== emp.nombreComercial
      ? '<div class="fact-emp__razon">' + esc(emp.razonSocial) + '</div>'
      : '';
  var ciudad = [emp.ciudad, emp.departamento].filter(Boolean).join(', ');
  var cliNom = esc(legal.cliNom || f.compradorNombre || '—');
  var cliNit = esc(
    !esFe && (!f.compradorNit || f.compradorNit === '222222222-2' || f.compradorNit === '222222222222')
      ? '—'
      : f.compradorNit || '—'
  );
  var fechaTxt = esc(legal.fechaHora || f.fecha || '');
  var resolLine = esFe && legal.resolFull ? '<p class="fact-resol">' + esc(legal.resolFull) + '</p>' : '';
  return (
    '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Comprobante ' +
    esc(f.consecutivo || '') +
    '</title><style>' +
    '@page{size:' +
    pageSize +
    ';margin:14mm}' +
    'body{margin:0;font-family:Segoe UI,system-ui,sans-serif;color:#111;font-size:11px;line-height:1.45}' +
    '.fact-sheet{border:2px solid #1e293b;border-radius:4px;padding:18px 20px 16px;box-sizing:border-box}' +
    '.fact-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:14px;padding-bottom:12px;border-bottom:2px solid #cbd5e1}' +
    '.fact-head__brand{display:flex;gap:14px;align-items:flex-start;flex:1;min-width:0}' +
    '.fact-logo img{max-height:72px;max-width:140px;object-fit:contain;display:block}' +
    '.fact-emp__name{font-size:18px;font-weight:800;color:#0f172a;margin:0 0 4px}' +
    '.fact-emp__meta,.fact-emp__razon{font-size:10px;color:#475569;margin:2px 0}' +
    '.fact-badge{border:2px solid #1d4ed8;background:#eff6ff;color:#1d4ed8;text-align:center;padding:10px 14px;border-radius:4px;min-width:150px}' +
    '.fact-badge--fe{border-color:#0f766e;background:#ecfdf5;color:#0f766e}' +
    '.fact-badge__title{font-size:13px;font-weight:800;letter-spacing:0.06em}' +
    '.fact-badge__sub{font-size:9px;margin-top:4px;opacity:0.9}' +
    '.fact-demo{background:#fff7ed;border:1px solid #fdba74;color:#c2410c;text-align:center;padding:8px;font-weight:800;font-size:10px;margin-bottom:12px;border-radius:4px}' +
    '.fact-box{border:1px solid #94a3b8;border-radius:4px;padding:10px 12px;margin:0 0 14px;background:#f8fafc}' +
    '.fact-box__title{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;margin:0 0 8px}' +
    '.fact-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;font-size:10px}' +
    '.fact-grid span{color:#64748b;display:block;font-size:8px;text-transform:uppercase;font-weight:700;letter-spacing:0.04em}' +
    '.fact-grid strong{color:#0f172a;font-size:11px}' +
    'table.fact-lines{width:100%;border-collapse:collapse;margin:0 0 14px;font-size:10px}' +
    'table.fact-lines th,table.fact-lines td{border:1px solid #cbd5e1;padding:7px 6px;vertical-align:top}' +
    'table.fact-lines th{background:#e2e8f0;font-size:8px;text-transform:uppercase}' +
    'table.fact-lines td.num,table.fact-lines th.num{text-align:right;white-space:nowrap}' +
    'table.fact-lines td.ref{font-family:ui-monospace,monospace;font-size:9px;color:#475569}' +
    '.fact-foot{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}' +
    'table.fact-totals{margin-left:auto;min-width:260px;border-collapse:collapse;font-size:11px}' +
    'table.fact-totals td{border:1px solid #cbd5e1;padding:7px 10px}' +
    'table.fact-totals td.lbl{text-align:right;color:#475569;font-weight:600;background:#f8fafc}' +
    'table.fact-totals td.num{text-align:right;font-weight:700;min-width:110px}' +
    'table.fact-totals tr.total td{background:#eff6ff;font-size:13px;font-weight:800;color:#1d4ed8}' +
    '.fact-legal{flex:1;font-size:9px;color:#475569;border:1px dashed #94a3b8;border-radius:4px;padding:10px 12px}' +
    '.fact-legal h4{margin:0 0 6px;font-size:9px;text-transform:uppercase;color:#334155}' +
    '.fact-legal p{margin:0 0 5px}' +
    '.fact-cufe{margin-top:10px;font-size:9px;word-break:break-all}' +
    '.fact-cufe strong{display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em}' +
    '.fact-qr{text-align:center;margin-top:10px}' +
    '.fact-qr img{width:120px;height:120px}' +
    '.fact-qr p{font-size:8px;color:#64748b;margin:4px 0 0}' +
    '.fact-resol{font-size:9px;color:#64748b;margin-top:6px}' +
    '.fact-consec{font-size:14px;font-weight:800;font-family:ui-monospace,monospace;margin-top:8px;color:#334155}' +
    '</style></head><body><div class="fact-sheet">' +
    demoBanner +
    '<div class="fact-head"><div class="fact-head__brand">' +
    logoBlock +
    '<div class="fact-emp"><div class="fact-emp__name">' +
    esc(nombreEmp) +
    '</div>' +
    razonSec +
    '<div class="fact-emp__meta">NIT ' +
    esc(legal.nitE || emp.nit || '—') +
    '</div>' +
    (emp.direccion ? '<div class="fact-emp__meta">' + esc(emp.direccion) + '</div>' : '') +
    (ciudad ? '<div class="fact-emp__meta">' + esc(ciudad) + '</div>' : '') +
    (emp.telefono ? '<div class="fact-emp__meta">Tel. ' + esc(emp.telefono) + '</div>' : '') +
    '<div class="fact-consec">No. ' +
    esc(f.consecutivo || '—') +
    '</div>' +
    resolLine +
    '</div></div><div class="fact-badge' +
    (esFe ? ' fact-badge--fe' : '') +
    '"><div class="fact-badge__title">' +
    esc(docTitle) +
    '</div><div class="fact-badge__sub">' +
    esc(docSub) +
    '</div></div></div>' +
    '<div class="fact-box"><div class="fact-box__title">Cliente y pago</div><div class="fact-grid">' +
    '<div><span>Cliente</span><strong>' +
    cliNom +
    '</strong></div>' +
    '<div><span>Documento</span><strong>' +
    cliNit +
    '</strong></div>' +
    '<div><span>Fecha</span><strong>' +
    fechaTxt +
    '</strong></div>' +
    '<div><span>Forma de pago</span><strong>' +
    esc(pagoTxt) +
    '</strong></div>' +
    (esFe && f.uuid
      ? '<div style="grid-column:1/-1;"><span>UUID</span><strong style="font-family:monospace;font-size:9px;word-break:break-all;">' +
        esc(f.uuid) +
        '</strong></div>'
      : '') +
    '</div></div>' +
    '<table class="fact-lines"><thead><tr><th class="num">#</th><th>Ref.</th><th>Descripción</th><th class="num">Cant.</th><th class="num">V. unit.</th><th class="num">Subtotal</th></tr></thead><tbody>' +
    itemsHtml +
    '</tbody></table>' +
    '<div class="fact-foot"><div class="fact-legal">' +
    legalBlock +
    cufeBlock +
    qrBlock +
    '</div><table class="fact-totals"><tbody>' +
    totRows +
    '</tbody></table></div></div></body></html>'
  );
}
window.crozzoBuildFacturaSheetDocumentHtml = crozzoBuildFacturaSheetDocumentHtml;
function crozzoBuildInvoiceDocumentHtml(f, opts) {
  opts = opts || {};
  var emp = config.getEmpresa();
  var esc = typeof escUserAttr === 'function' ? escUserAttr : function (s) { return String(s ?? ''); };
  var legal =
    typeof global.crozzoTermicaLegalPayloadColombia === 'function'
      ? global.crozzoTermicaLegalPayloadColombia(f)
      : {};
  var esFe = crozzoFacturaEsDocumentoFe(f);
  var soloConsumo = crozzoFacturaSoloProductosConsumo(f);
  var items = (f.items || []).map(function (item) {
    var nom = esc(String(soloConsumo ? crozzoCuentaItemNombreConsumo(item) : item.nombreVenta || item.nombre || ''));
    var det =
      soloConsumo || !item.detalleConfig
        ? ''
        : '<br><small style="color:#94a3b8;">' + esc(String(item.detalleConfig)) + '</small>';
    return (
      '<tr><td>' + nom + det + '</td><td class="num">' + item.cantidad + '</td>' +
      '<td class="num">$' + Number(item.precio).toLocaleString('es-CO') + '</td>' +
      '<td class="num">$' + (item.precio * item.cantidad).toLocaleString('es-CO') + '</td></tr>'
    );
  }).join('');
  var ribbon = opts.inModal ? '' : '<div class="crozzo-invoice-doc__ribbon">' + crozzoFacturaEstadoBadgeHtml(f) + '</div>';
  var cufeBlock = crozzoFacturaCufeMostrable(f)
    ? '<div class="crozzo-invoice-doc__cufe"><strong>CUFE</strong><br>' + esc(String(f.cufe)) + '</div>'
    : '';
  var qrBlock =
    opts.qrId && crozzoFacturaQrMostrable(f)
      ? '<div class="crozzo-invoice-doc__qr"><div id="' + opts.qrId + '"></div><p class="form-hint" style="text-align:center;margin-top:6px;font-size:0.72rem;">Verificación DIAN</p></div>'
      : '';
  var resolLine =
    esFe && legal.resolFull
      ? '<div class="crozzo-invoice-doc__resol" style="font-size:0.68rem;color:#64748b;margin-top:6px;text-align:center;">' +
        esc(legal.resolFull) +
        '</div>'
      : '';
  var legalLineasModal = legal.legalTicketLineas || [];
  var legalPie = '';
  if (legalLineasModal.length) {
    legalPie =
      '<div class="crozzo-invoice-doc__legal" style="font-size:0.72rem;color:#64748b;margin-top:12px;line-height:1.45;border-top:1px dashed var(--border);padding-top:10px;">';
    legalLineasModal.forEach(function (ln) {
      if (!ln || !ln.t) return;
      if (ln.k === 'head') {
        legalPie +=
          '<p style="margin:0 0 8px;font-weight:700;font-size:0.68rem;letter-spacing:0.06em;text-transform:uppercase;color:#475569;">' +
          esc(ln.t) +
          '</p>';
        return;
      }
      legalPie += '<p style="margin:0 0 6px;">' + esc(ln.t) + '</p>';
    });
    legalPie += '</div>';
  } else if (legal.legalCo) {
    legalPie =
      '<p class="crozzo-invoice-doc__legal" style="font-size:0.72rem;color:#64748b;margin-top:12px;line-height:1.45;border-top:1px dashed var(--border);padding-top:10px;">' +
      esc(legal.legalCo) +
      '</p>';
  }
  var nombreMostrar = emp.nombreComercial || emp.razonSocial || 'Empresa';
  var razonSec =
    emp.razonSocial && emp.nombreComercial && emp.razonSocial !== emp.nombreComercial
      ? '<div style="font-size:0.78rem;color:#64748b;">' + esc(emp.razonSocial) + '</div>'
      : '';
  return (
    '<div class="crozzo-invoice-doc">' + ribbon +
    '<div class="crozzo-invoice-doc__paper">' +
    '<header class="crozzo-invoice-doc__head">' +
    '<div class="crozzo-invoice-doc__tipo" style="font-size:0.7rem;font-weight:800;letter-spacing:0.06em;color:var(--accent);margin-bottom:6px;">' +
    esc(legal.head || 'COMPROBANTE') +
    '</div>' +
    '<div class="crozzo-invoice-doc__company">' + esc(nombreMostrar) + '</div>' +
    razonSec +
    '<div class="crozzo-invoice-doc__nit">NIT ' + esc(legal.nitE || emp.nit || '—') + '</div>' +
    '<div class="crozzo-invoice-doc__consec">' + esc(f.consecutivo || '—') + '</div>' +
    '<div style="font-size:0.72rem;color:#64748b;margin-top:6px;">' + esc(legal.fechaHora || f.fecha || '') + '</div>' +
    resolLine +
    '</header>' +
    '<dl class="crozzo-invoice-doc__meta">' +
    '<div><dt>Cliente</dt><dd>' + esc(legal.cliNom || f.compradorNombre || '—') + '</dd></div>' +
    '<div><dt>Documento</dt><dd>' +
    esc(
      !esFe && (!f.compradorNit || f.compradorNit === '222222222-2' || f.compradorNit === '222222222222')
        ? '—'
        : f.compradorNit || '—'
    ) +
    '</dd></div>' +
    (esFe && f.uuid
      ? '<div style="grid-column:1/-1;"><dt>UUID</dt><dd style="font-family:monospace;font-size:0.68rem;word-break:break-all;">' + esc(f.uuid) + '</dd></div>'
      : '') +
    '</dl>' +
    '<table class="crozzo-invoice-doc__lines"><thead><tr><th>Descripción</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Total</th></tr></thead><tbody>' +
    items + '</tbody></table>' +
    '<div class="crozzo-invoice-doc__totals">' +
    (typeof crozzoCuentaTotalesTicketHtml === 'function'
      ? crozzoCuentaTotalesTicketHtml(f)
      : '<div class="row"><span>' +
        esc(legal.etiquetaSubtotal || 'Subtotal') +
        '</span><span>$' +
        Number(f.subtotal || 0).toLocaleString('es-CO') +
        '</span></div>' +
        '<div class="row"><span>' +
        esc(crozzoFacturaImpuestoEtiqueta()) +
        '</span><span>$' +
        Number(f.iva || 0).toLocaleString('es-CO') +
        '</span></div>' +
        '<div class="row row--total"><span>Total</span><span>$' +
        Number(f.total || 0).toLocaleString('es-CO') +
        '</span></div>') +
    '</div>' +
    cufeBlock + qrBlock + legalPie + '</div></div>'
  );
}
function crozzoBuildInvoiceModalActionsHtml(f, idx, extra) {
  extra = extra || {};
  var pagoLabel = crozzoMetodoPagoDescripcion(f.metodoPago, f.paymentMeta, { htmlSafe: true });
  var propinaHist = Number(f.paymentMeta && f.paymentMeta.propina ? f.paymentMeta.propina : 0);
  var shareIdx = typeof idx === 'number' ? idx : 'null';
  var histBtns = typeof idx === 'number'
    ? '<button type="button" class="btn btn-outline" style="border-color:#25D366;color:#0d6e4a;" onclick="crozzoFacturaShareFromHistory(' + idx + ',\'wa\')">📱 WhatsApp + PDF Oficio</button>' +
      '<button type="button" class="btn btn-outline" style="border-color:var(--accent);" onclick="crozzoFacturaShareFromHistory(' + idx + ',\'em\')">✉️ Email</button>'
    : '<button type="button" class="btn btn-outline" style="border-color:#25D366;color:#0d6e4a;" onclick="crozzoFacturaShareWhatsAppModal()">📱 WhatsApp + PDF Oficio</button>' +
      '<button type="button" class="btn btn-outline" style="border-color:var(--accent);" onclick="crozzoFacturaShareEmailModal()">✉️ Email</button>';
  var printBtns =
    typeof crozzoFacturaImpresionBtnsHtml === 'function'
      ? crozzoFacturaImpresionBtnsHtml(typeof idx === 'number' ? idx : null)
      : '';
  var verifCard = crozzoFacturaQrMostrable(f)
    ? '<div class="crozzo-invoice-action-card"><h4>Verificación DIAN</h4>' +
      '<button type="button" class="btn btn-primary" style="width:100%;" onclick="crozzoOpenExternal(' +
      JSON.stringify(typeof crozzoFacturaQrUrlResolve === 'function' ? crozzoFacturaQrUrlResolve(f) : f.qrUrl) +
      ')">🔍 Consultar en portal DIAN</button></div>'
    : '';
  var demoStrip = extra.demoStrip || '';
  var postCobro =
    typeof currentPage !== 'undefined' &&
    currentPage === 'cajero' &&
    typeof crozzoCajeroPostCobroActionsHtml === 'function'
      ? '<div class="crozzo-invoice-action-card crozzo-invoice-action-card--flow"><h4>Continuar venta</h4>' +
        crozzoCajeroPostCobroActionsHtml() +
        '</div>'
      : '';
  var cerrarBtn = postCobro
    ? ''
    : '<button type="button" class="btn btn-outline" style="width:100%;margin-top:8px;" onclick="closeModal()">Cerrar</button>';
  return (
    '<div class="crozzo-invoice-modal__actions">' + demoStrip +
    '<div class="crozzo-invoice-action-card"><h4>Pago</h4>' +
    crozzoFacturaEstadoBadgeHtml(f) +
    '<p style="margin:10px 0 0;font-size:0.82rem;color:var(--text-secondary);">' + pagoLabel + '</p>' +
    (propinaHist > 0 ? '<p style="margin:6px 0 0;font-size:0.78rem;">Propina: $' + propinaHist.toLocaleString('es-CO') + '</p>' : '') +
    (f.metodoPago === 'efectivo' ? '<p style="margin:6px 0 0;font-size:0.78rem;">Recibido: $' + Number(f.paymentMeta && f.paymentMeta.valorRecibido || 0).toLocaleString('es-CO') + ' · Cambio: $' + Number(f.paymentMeta && f.paymentMeta.devueltas || 0).toLocaleString('es-CO') + '</p>' : '') +
    '</div>' +
    '<div class="crozzo-invoice-action-card"><h4>Enviar e imprimir</h4>' +
    '<div class="btn-group" style="flex-direction:column;gap:8px;">' +
    (postCobro && typeof crozzoCajeroPostCobroWhatsAppNextBtnHtml === 'function'
      ? crozzoCajeroPostCobroWhatsAppNextBtnHtml({ fullWidth: true })
      : '') +
    histBtns +
    '</div>' +
    '<p class="form-hint" style="margin:8px 0 0;font-size:0.72rem;">' +
    (postCobro ? 'Verde: enlace WhatsApp y siguiente pedido. ' : '') +
    'WhatsApp: teléfono → enlace (~7 días) o adjuntar PDF.</p>' +
    (printBtns
      ? '<p class="form-hint" style="margin:10px 0 6px;">Reimprimir otro formato</p>' + printBtns
      : '') +
    '</div>' +
    postCobro +
    verifCard +
    (cerrarBtn ? '<div class="crozzo-invoice-action-card">' + cerrarBtn + '</div>' : '') +
    '</div>'
  );
}
function crozzoInitInvoiceModalQr(f, qrId) {
  if (!qrId || !f || !crozzoFacturaQrMostrable(f)) return;
  var qrUrl = typeof crozzoFacturaQrUrlResolve === 'function' ? crozzoFacturaQrUrlResolve(f) : String(f.qrUrl || '');
  if (!qrUrl) return;
  setTimeout(function () {
    var qrEl = document.getElementById(qrId);
    if (!qrEl) return;
    if (typeof QRCode !== 'undefined') {
      qrEl.innerHTML = '';
      new QRCode(qrEl, { text: qrUrl, width: 140, height: 140, colorDark: '#0f172a', colorLight: '#ffffff' });
    } else if (typeof crozzoTermicaQrImgHtml === 'function') {
      qrEl.innerHTML = crozzoTermicaQrImgHtml(qrUrl, 140);
    }
  }, 120);
}
function crozzoFacturaInlinePreviewHtml(f, idx, archived) {
  if (!f) return '';
  window.__crozzoLastFacturaForShare = f;
  var qrId = crozzoFacturaQrMostrable(f) ? 'qr_preview_' + String(idx) + '_' + Date.now() : null;
  var expandBtn =
    archived || idx < 0
      ? '<span class="form-hint" style="font-size:0.75rem;">Archivo · solo lectura</span>'
      : '<button type="button" class="btn btn-outline btn-xs" onclick="event.stopPropagation();openFacturaFullscreen(' +
        idx +
        ')">Expandir</button>';
  var toolbar =
    archived || idx < 0
      ? '<div class="crozzo-invoice-preview-pane__toolbar"><span class="form-hint">Comprobante archivado — exporte el mes desde Archivo mensual si necesita JSON.</span></div>'
      : '<div class="crozzo-invoice-preview-pane__toolbar">' + crozzoBuildInvoicePreviewToolbarHtml(f, idx, true) + '</div>';
  return (
    '<div class="crozzo-invoice-row-detail__inner crozzo-invoice-row-detail__inner--compact">' +
    '<div class="crozzo-invoice-preview-pane__head">' +
    '<h3>' +
    escUserAttr(f.consecutivo || '—') +
    '</h3>' +
    expandBtn +
    '</div>' +
    '<div class="crozzo-invoice-preview-pane__body">' +
    crozzoBuildInvoiceDocumentHtml(f, { qrId: qrId, inModal: true }) +
    '</div>' +
    toolbar +
    '</div>'
  );
}
function crozzoCloseFacturaDetailSlot() {
  var slot = document.getElementById('crozzoFacturaDetailSlot');
  if (slot) {
    slot.classList.remove('is-open');
    slot.style.display = 'none';
    slot.removeAttribute('data-factura-detail-for');
  }
  var host = document.getElementById('facturaPreviewHost');
  if (host) host.innerHTML = '';
  document.querySelectorAll('.crozzo-invoice-table tbody tr.crozzo-invoice-row.is-selected').forEach(function (tr) {
    tr.classList.remove('is-selected');
  });
}
function crozzoEnsureFacturaDetailSlot() {
  var slot = document.getElementById('crozzoFacturaDetailSlot');
  if (slot) return slot;
  var tbody = document.querySelector('.crozzo-facturas-page .crozzo-invoice-table tbody');
  if (!tbody) return null;
  slot = document.createElement('tr');
  slot.id = 'crozzoFacturaDetailSlot';
  slot.className = 'crozzo-invoice-detail-row';
  slot.style.display = 'none';
  slot.innerHTML =
    '<td colspan="11"><div id="facturaPreviewHost" class="crozzo-invoice-row-detail"></div></td>';
  return slot;
}
function crozzoMountFacturaDetailBelowRow(rowKey) {
  rowKey = String(rowKey == null ? '' : rowKey);
  var dataRow = document.querySelector(
    '.crozzo-facturas-page tr.crozzo-invoice-row[data-factura-key="' + rowKey + '"]'
  );
  if (!dataRow) return false;
  var slot = crozzoEnsureFacturaDetailSlot();
  if (!slot) return false;
  if (dataRow.nextElementSibling !== slot) {
    dataRow.insertAdjacentElement('afterend', slot);
  }
  slot.classList.add('is-open');
  slot.style.display = 'table-row';
  slot.setAttribute('data-factura-detail-for', rowKey);
  document.querySelectorAll('.crozzo-facturas-page tr.crozzo-invoice-row[data-factura-key]').forEach(function (tr) {
    tr.classList.toggle('is-selected', tr.getAttribute('data-factura-key') === rowKey);
  });
  return true;
}
function crozzoScrollFacturaDetailIntoView(rowKey) {
  rowKey = String(rowKey == null ? '' : rowKey);
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      var dataRow = document.querySelector(
        '.crozzo-facturas-page tr.crozzo-invoice-row[data-factura-key="' + rowKey + '"]'
      );
      var slot = document.getElementById('crozzoFacturaDetailSlot');
      if (!dataRow || !slot || slot.style.display === 'none') return;
      var wrap = dataRow.closest('.crozzo-invoice-table-wrap');
      if (!wrap || typeof wrap.scrollTo !== 'function') return;
      var wrapRect = wrap.getBoundingClientRect();
      var dataRect = dataRow.getBoundingClientRect();
      var target = wrap.scrollTop + (dataRect.top - wrapRect.top) - 6;
      wrap.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    });
  });
}
function openFacturaRow(rowKey) {
  rowKey = String(rowKey == null ? '' : rowKey);
  var row = crozzoResolveFacturaRow(rowKey);
  if (!row || !row.f) return;
  facturaPreviewRowKey = rowKey;
  facturaPreviewIdx = row.archived ? null : row.idx;
  if (!crozzoMountFacturaDetailBelowRow(rowKey)) {
    if (typeof renderPage === 'function' && typeof currentPage !== 'undefined' && currentPage === 'facturas') {
      renderPage('facturas');
      setTimeout(function () {
        openFacturaRow(rowKey);
      }, 0);
    }
    return;
  }
  crozzoRenderFacturaPreviewPane();
}
function openFacturaBelow(idx) {
  openFacturaRow(String(Number(idx)));
}
function selectFacturaForPreviewKey(rowKey) {
  rowKey = String(rowKey == null ? '' : rowKey);
  if (facturaPreviewRowKey === rowKey) {
    facturaPreviewRowKey = null;
    facturaPreviewIdx = null;
    crozzoCloseFacturaDetailSlot();
    return;
  }
  openFacturaRow(rowKey);
}
function selectFacturaForPreview(idx) {
  selectFacturaForPreviewKey(String(Number(idx)));
}
function crozzoRenderFacturaPreviewPane() {
  var rowKey = facturaPreviewRowKey;
  if (!rowKey) {
    crozzoCloseFacturaDetailSlot();
    return;
  }
  var row = crozzoResolveFacturaRow(rowKey);
  if (!row || !row.f) {
    crozzoCloseFacturaDetailSlot();
    return;
  }
  if (!crozzoMountFacturaDetailBelowRow(rowKey)) return;
  var host = document.getElementById('facturaPreviewHost');
  var f = row.f;
  if (!host || !f) return;
  var idx = row.archived ? -1 : row.idx;
  host.innerHTML = crozzoFacturaInlinePreviewHtml(f, idx, row.archived);
  crozzoInitInvoiceModalQr(f, crozzoFacturaQrMostrable(f) ? 'qr_preview_' + idx : null);
  crozzoScrollFacturaDetailIntoView(idx);
}
window.openFacturaBelow = openFacturaBelow;
window.selectFacturaForPreview = selectFacturaForPreview;
function crozzoFacturaPuedeAnularUi(f) {
  if (!f || f.estado === 'anulada' || f.anulada === true) return false;
  try {
    var R = typeof CrozzoReversionInventario !== 'undefined' ? CrozzoReversionInventario : null;
    return !!(R && typeof R.puedeAnular === 'function' && R.puedeAnular());
  } catch (_) {
    return false;
  }
}
function crozzoFacturaAnularBtnHtml(idx, compact) {
  if (idx == null || idx < 0) return '';
  var facturas = typeof config !== 'undefined' && config.getFacturas ? config.getFacturas() : [];
  var f = facturas[idx];
  if (!crozzoFacturaPuedeAnularUi(f)) return '';
  var cls = compact ? 'btn btn-danger btn-xs' : 'btn btn-danger';
  return (
    '<button type="button" class="' +
    cls +
    '" onclick="event.stopPropagation();crozzoFacturaAnularPrompt(' +
    idx +
    ')" title="Anular venta y devolver stock (local; no es nota crédito DIAN)">Anular</button>'
  );
}
function crozzoFacturaAnularPrompt(idx) {
  var facturas = typeof config !== 'undefined' && config.getFacturas ? config.getFacturas() : [];
  var f = facturas[idx];
  if (!f) {
    if (typeof showToast === 'function') showToast('Factura no encontrada', 'error');
    return;
  }
  if (!crozzoFacturaPuedeAnularUi(f)) {
    if (typeof showToast === 'function') showToast('Solo admin/encargado puede anular ventas', 'warning');
    return;
  }
  var cons = escUserAttr(f.consecutivo || f.uuid || String(idx));
  showModal(
    'Anular venta',
    '<div class="fade-in">' +
      '<p>¿Anular el comprobante <strong>' +
      cons +
      '</strong>?</p>' +
      '<p style="font-size:0.85rem;color:var(--text-secondary);margin-top:8px;">Se restaurará el stock si la venta descontó inventario. Esto es anulación <strong>local</strong> — no emite nota crédito DIAN.</p>' +
      '<label class="form-label" for="crozzoAnularMotivo" style="margin-top:12px;display:block;">Motivo (opcional)</label>' +
      '<input type="text" id="crozzoAnularMotivo" class="form-input" placeholder="Error de cobro, duplicado…" maxlength="120">' +
      '<div class="btn-group" style="justify-content:flex-end;margin-top:14px;">' +
      '<button type="button" class="btn btn-outline" onclick="closeModal()">Cancelar</button>' +
      '<button type="button" class="btn btn-danger" onclick="crozzoFacturaConfirmAnular(' +
      idx +
      ')">Confirmar anulación</button>' +
      '</div></div>'
  );
}
function crozzoFacturaConfirmAnular(idx) {
  var facturas = typeof config !== 'undefined' && config.getFacturas ? config.getFacturas() : [];
  var f = facturas[idx];
  if (!f) {
    if (typeof showToast === 'function') showToast('Factura no encontrada', 'error');
    return;
  }
  if (!crozzoFacturaPuedeAnularUi(f)) {
    if (typeof showToast === 'function') showToast('Acción no autorizada', 'warning');
    return;
  }
  var R = typeof CrozzoReversionInventario !== 'undefined' ? CrozzoReversionInventario : null;
  if (!R || typeof R.anularFactura !== 'function') {
    if (typeof showToast === 'function') showToast('Motor de anulación no disponible', 'error');
    return;
  }
  var motivoEl = document.getElementById('crozzoAnularMotivo');
  var motivo = motivoEl && motivoEl.value ? String(motivoEl.value).trim() : '';
  var por =
    typeof crozzoGetCurrentUserLabel === 'function' ? crozzoGetCurrentUserLabel() : 'admin';
  var fid = f.uuid || f.id;
  var r;
  try {
    r = R.anularFactura(fid, { motivo: motivo || 'anulacion_venta', por: por });
  } catch (e) {
    if (typeof showToast === 'function') showToast('Error al anular: ' + (e && e.message ? e.message : e), 'error');
    return;
  }
  if (typeof config !== 'undefined' && config.save) {
    try {
      config.save();
    } catch (_) {}
  }
  if (typeof config !== 'undefined' && config.addAudit) {
    try {
      config.addAudit(
        'factura_anulada',
        'Anuló ' +
          (f.consecutivo || fid) +
          (motivo ? ' · ' + motivo : '') +
          (r && r.detalle ? ' · ' + r.detalle : '')
      );
    } catch (_) {}
  }
  if (typeof closeModal === 'function') closeModal();
  if (r && r.ok) {
    if (typeof showToast === 'function') showToast('Venta anulada. ' + (r.detalle || ''), 'success');
  } else {
    if (typeof showToast === 'function')
      showToast((r && r.detalle) || 'No se pudo anular', 'error');
  }
  if (typeof refreshFacturasFilteredView === 'function') refreshFacturasFilteredView();
}
function crozzoBuildInvoicePreviewToolbarHtml(f, idx, compact) {
  var pagoLabel = crozzoMetodoPagoDescripcion(f.metodoPago, f.paymentMeta, { htmlSafe: true });
  var dian = crozzoFacturaQrMostrable(f)
    ? '<button type="button" class="btn btn-primary btn-xs" onclick="crozzoOpenExternal(' +
      JSON.stringify(typeof crozzoFacturaQrUrlResolve === 'function' ? crozzoFacturaQrUrlResolve(f) : f.qrUrl) +
      ')">DIAN</button>'
    : '';
  var printBtns = typeof crozzoFacturaImpresionBtnsHtml === 'function' ? crozzoFacturaImpresionBtnsHtml(idx) : '';
  var anularBtn = crozzoFacturaAnularBtnHtml(idx, !!compact);
  if (compact) {
    return (
      '<div class="crozzo-invoice-inline-toolbar">' +
      '<span class="crozzo-invoice-toolbar-pay">' + pagoLabel + '</span>' +
      '<div class="crozzo-invoice-inline-toolbar__acts">' +
      printBtns +
      '<button type="button" class="btn btn-outline btn-xs" onclick="crozzoFacturaShareFromHistory(' + idx + ',\'wa\')">WhatsApp</button>' +
      '<button type="button" class="btn btn-outline btn-xs" onclick="crozzoFacturaShareFromHistory(' + idx + ',\'em\')">Email</button>' +
      dian +
      anularBtn +
      '</div></div>'
    );
  }
  return (
    '<span style="font-size:0.75rem;color:var(--text-muted);flex:1;min-width:120px;">' + pagoLabel + '</span>' +
    printBtns +
    '<button type="button" class="btn btn-outline" onclick="crozzoFacturaShareFromHistory(' + idx + ',\'wa\')">WhatsApp + PDF Oficio</button>' +
    '<button type="button" class="btn btn-outline" onclick="crozzoFacturaShareFromHistory(' + idx + ',\'em\')">Email</button>' +
    dian +
    anularBtn
  );
}
function openFacturaFullscreen(idx) {
  var facturas = config.getFacturas();
  var f = facturas[idx];
  if (!f) return;
  window.__crozzoLastFacturaForShare = f;
  var qrId = crozzoFacturaQrMostrable(f) ? 'qr_factura_' + Date.now() : null;
  var body =
    '<div class="crozzo-invoice-editor-toolbar">' +
    crozzoBuildInvoicePreviewToolbarHtml(f, idx) +
    '</div>' +
    '<div class="crozzo-invoice-modal fade-in" style="grid-template-columns:1fr;">' +
    crozzoBuildInvoiceDocumentHtml(f, { qrId: qrId, inModal: true }) +
    '</div>';
  showModal('', body, {
    modalClass: 'modal--invoice modal--invoice-full',
    wide: true,
    titleHtml: '<h3 class="modal-title">Editor de comprobante · ' + escUserAttr(f.consecutivo || '') + '</h3>'
  });
  crozzoInitInvoiceModalQr(f, qrId);
}
function buildFacturasTableRowsHtml(filtered) {
  return filtered
    .map(function (row) {
      var f = row.f;
      var rowKey = crozzoFacturaRowKey(row);
      var sel = facturaPreviewRowKey === rowKey ? ' is-selected' : '';
      var archivedTag = row.archived ? ' <span class="badge badge-outline" title="Archivo mensual">📦</span>' : '';
      var fecha = f.fecha
        ? (function () {
            try {
              return new Date(f.fecha).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
            } catch (_) {
              return f.fecha;
            }
          })()
        : '—';
      var tipoDoc =
        f.tipoComprobante === 'electronica' || f.estado === 'timbrada'
          ? '<span class="crozzo-invoice-tipo crozzo-invoice-tipo--fe">FE</span>'
          : '<span class="crozzo-invoice-tipo crozzo-invoice-tipo--pos">POS</span>';
      var nItems = Array.isArray(f.items) ? f.items.length : 0;
      return (
        '<tr data-factura-key="' +
        escUserAttr(rowKey) +
        '" class="crozzo-invoice-row' +
        sel +
        '" onclick="selectFacturaForPreviewKey(\'' +
        escUserAttr(rowKey) +
        '\')" title="Abrir comprobante debajo de esta fila">' +
        '<td class="col-date">' +
        fecha +
        '</td>' +
        '<td class="col-cons">' +
        escUserAttr(f.consecutivo || '—') +
        archivedTag +
        '</td>' +
        '<td class="col-tipo">' +
        tipoDoc +
        '</td>' +
        '<td class="col-client"><strong>' +
        escUserAttr(f.compradorNombre || '—') +
        '</strong><span class="crozzo-invoice-sub">' +
        escUserAttr(f.compradorNit || '—') +
        '</span></td>' +
        '<td class="col-serv">' +
        escUserAttr(crozzoFacturaServicioLabel(f)) +
        '</td>' +
        '<td class="col-pago" title="' +
        escUserAttr(crozzoFacturaPagoCorto(f)) +
        '">' +
        escUserAttr(crozzoFacturaPagoCorto(f)) +
        '</td>' +
        '<td class="col-items">' +
        nItems +
        '</td>' +
        '<td class="col-total">$' +
        Number(f.total || f.totalFactura || 0).toLocaleString('es-CO') +
        '</td>' +
        '<td class="col-estado">' +
        crozzoFacturaEstadoBadgeHtml(f) +
        '</td>' +
        '<td class="col-ref" title="' +
        escUserAttr(f.uuid || f.cufe || '') +
        '">' +
        escUserAttr((f.uuid || f.cufe || '').slice(0, 14)) +
        '</td>' +
        '<td class="col-act"><button type="button" class="btn btn-outline btn-xs" onclick="event.stopPropagation();openFacturaRow(\'' +
        escUserAttr(rowKey) +
        '\')">Abrir</button></td></tr>'
      );
    })
    .join('');
}
function buildFacturasListBlockHtml(facturas, filtered) {
  if (filtered.length === 0) {
    if (!facturas || !facturas.length) {
      return (
        '<div class="crozzo-invoice-table-wrap"><div class="crozzo-invoice-empty"><div class="crozzo-invoice-empty__illus">📄</div><p><strong>Sin comprobantes aún</strong></p><p style="font-size:0.88rem;margin-top:8px;">Las ventas cobradas aparecerán aquí.</p></div></div>'
      );
    }
    return (
      '<div class="crozzo-invoice-table-wrap"><div class="crozzo-invoice-empty"><p>Sin comprobantes en este periodo.</p><p style="font-size:0.88rem;margin-top:8px;">Pruebe ampliar a 7 / 30 días o revisar archivo mensual.</p></div></div>'
    );
  }
  return (
    '<div class="crozzo-invoice-table-wrap crozzo-invoice-table-wrap--facturas"><table class="crozzo-invoice-table crozzo-invoice-table--wide"><thead><tr>' +
    '<th>Fecha</th><th>Nº</th><th>Tipo</th><th>Cliente</th><th>Servicio</th><th>Pago</th><th>Ítems</th><th>Total</th><th>Estado</th><th>Ref.</th><th></th></tr></thead><tbody>' +
    buildFacturasTableRowsHtml(filtered) +
    '</tbody></table></div>'
  );
}
function buildFacturasKpisHtml(facturas, resumen, remaining) {
  return (
    '<div class="crozzo-invoice-kpi"><div class="crozzo-invoice-kpi__label">Registros</div><div class="crozzo-invoice-kpi__value">' +
    facturas.length +
    '</div></div>' +
    '<div class="crozzo-invoice-kpi crozzo-invoice-kpi--success"><div class="crozzo-invoice-kpi__label">Timbradas</div><div class="crozzo-invoice-kpi__value">' +
    facturas.filter(function (x) {
      return x.estado === 'timbrada';
    }).length +
    '</div></div>' +
    '<div class="crozzo-invoice-kpi crozzo-invoice-kpi--info"><div class="crozzo-invoice-kpi__label">POS</div><div class="crozzo-invoice-kpi__value">' +
    facturas.filter(function (x) {
      return x.estado === 'pos';
    }).length +
    '</div></div>' +
    '<div class="crozzo-invoice-kpi crozzo-invoice-kpi--warn"><div class="crozzo-invoice-kpi__label">Por cobrar</div><div class="crozzo-invoice-kpi__value">' +
    resumen.pendientes +
    '</div></div>' +
    '<div class="crozzo-invoice-kpi"><div class="crozzo-invoice-kpi__label">Total filtro</div><div class="crozzo-invoice-kpi__value">$' +
    resumen.total.toLocaleString('es-CO') +
    '</div></div>' +
    '<div class="crozzo-invoice-kpi"><div class="crozzo-invoice-kpi__label">FE restantes</div><div class="crozzo-invoice-kpi__value">' +
    (remaining === Infinity ? '∞' : remaining) +
    '</div></div>'
  );
}
function buildFacturasResultBarHtml(resumen, inPeriod, totalActive) {
  var periodLbl =
    facturasFilterPeriodDays === 1
      ? 'hoy'
      : facturasFilterPeriodDays + ' día(s)';
  return (
    'Periodo: <strong>' +
    periodLbl +
    '</strong> · Mostrando <strong>' +
    resumen.count +
    '</strong> de <strong>' +
    inPeriod +
    '</strong> en rango · ' +
    resumen.items +
    ' líneas · <strong>$' +
    resumen.total.toLocaleString('es-CO') +
    '</strong>' +
    (totalActive > inPeriod
      ? ' · <span class="form-hint" style="display:inline;">' + totalActive + ' activos en equipo</span>'
      : '')
  );
}
function buildFacturasPeriodChipHtml(days, label) {
  var active = Number(facturasFilterPeriodDays) === Number(days) ? ' is-active' : '';
  return (
    '<button type="button" class="crozzo-invoice-filter-chip crozzo-invoice-period-chip' +
    active +
    '" data-facturas-period="' +
    days +
    '" onclick="setFacturasPeriod(' +
    days +
    ')">' +
    label +
    '</button>'
  );
}
function crozzoSyncFacturasPeriodChips() {
  document.querySelectorAll('.crozzo-invoice-period-chip[data-facturas-period]').forEach(function (btn) {
    btn.classList.toggle('is-active', Number(btn.getAttribute('data-facturas-period')) === Number(facturasFilterPeriodDays));
  });
}
function buildFacturasFilterChipHtml(id, label) {
  var active = facturasFilterEstado === id ? ' is-active' : '';
  return (
    '<button type="button" class="crozzo-invoice-filter-chip' +
    active +
    '" data-facturas-filter="' +
    id +
    '" onclick="setFacturasFilter(\'' +
    id +
    '\')">' +
    label +
    '</button>'
  );
}
function crozzoSyncFacturasFilterChips() {
  document.querySelectorAll('.crozzo-invoice-filter-chip[data-facturas-filter]').forEach(function (btn) {
    btn.classList.toggle('is-active', btn.getAttribute('data-facturas-filter') === facturasFilterEstado);
  });
}
function refreshFacturasFilteredView() {
  if (typeof currentPage !== 'undefined' && currentPage !== 'facturas') return;
  var page = document.querySelector('.crozzo-facturas-page');
  if (!page) return;
  var facturas = config.getFacturas();
  var viewRows = crozzoCollectFacturaViewRows();
  var viewFacturas = viewRows.map(function (r) {
    return r.f;
  });
  var filtered = crozzoGetFacturasFiltradas();
  var resumen = crozzoFacturasResumenFiltrado(filtered);
  var remaining = config.getFacturasRestantes();
  var previewKey = facturaPreviewRowKey;
  var kpis = document.getElementById('facturasKpis');
  if (kpis) kpis.innerHTML = buildFacturasKpisHtml(viewFacturas, resumen, remaining);
  var bar = document.getElementById('facturasResultBar');
  if (bar) bar.innerHTML = buildFacturasResultBarHtml(resumen, viewRows.length, facturas.length);
  var host = document.getElementById('facturasListHost');
  if (host) host.innerHTML = buildFacturasListBlockHtml(viewFacturas, filtered);
  crozzoSyncFacturasFilterChips();
  crozzoSyncFacturasPeriodChips();
  if (previewKey) {
    var stillVisible = filtered.some(function (row) {
      return crozzoFacturaRowKey(row) === previewKey;
    });
    if (stillVisible) {
      crozzoMountFacturaDetailBelowRow(previewKey);
      crozzoRenderFacturaPreviewPane();
    } else {
      facturaPreviewRowKey = null;
      facturaPreviewIdx = null;
      crozzoCloseFacturaDetailSlot();
    }
  }
}
function renderFacturas() {
  var facturas = config.getFacturas();
  var remaining = config.getFacturasRestantes();
  var viewRows = crozzoCollectFacturaViewRows();
  var viewFacturas = viewRows.map(function (r) {
    return r.f;
  });
  var filtered = crozzoGetFacturasFiltradas();
  var resumen = crozzoFacturasResumenFiltrado(filtered);
  return (
    '<div class="crozzo-mod-page crozzo-facturas-page">' +
    '<div class="card crozzo-facturas-card">' +
    '<div class="card-header crozzo-facturas-card__head">' +
    '<div><h2 class="card-title">Comprobantes y facturas</h2>' +
    '<p class="page-subtitle" style="margin-top:4px;">Historial de ventas — por defecto solo <strong>hoy</strong>. Amplíe el periodo si necesita días anteriores (incluye archivo mensual).</p></div>' +
    (typeof crozzoCanClearFacturasHistorial === 'function' && crozzoCanClearFacturasHistorial()
      ? '<button type="button" class="btn btn-outline" onclick="clearFacturas()">Limpiar historial</button>'
      : '') +
    '</div>' +
    (typeof CrozzoFacturasArchivo !== 'undefined' && CrozzoFacturasArchivo.renderBannerHtml
      ? CrozzoFacturasArchivo.renderBannerHtml()
      : '') +
    '<div class="crozzo-invoice-kpis" id="facturasKpis">' +
    buildFacturasKpisHtml(viewFacturas, resumen, remaining) +
    '</div>' +
    '<div class="crozzo-invoice-toolbar">' +
    '<div class="crozzo-invoice-filters crozzo-invoice-filters--period">' +
    buildFacturasPeriodChipHtml(1, 'Hoy') +
    buildFacturasPeriodChipHtml(7, '7 días') +
    buildFacturasPeriodChipHtml(30, '30 días') +
    buildFacturasPeriodChipHtml(90, '90 días') +
    '</div></div>' +
    '<div class="crozzo-invoice-toolbar">' +
    '<div class="crozzo-invoice-toolbar__search"><input type="search" id="facturasSearchInput" value="' +
    escUserAttr(facturasFilterQ) +
    '" placeholder="Buscar consecutivo, cliente, NIT, mesa, pago…" autocomplete="off"></div>' +
    '<div class="crozzo-invoice-filters">' +
    buildFacturasFilterChipHtml('todos', 'Todos') +
    buildFacturasFilterChipHtml('cobro_pendiente', 'Por cobrar') +
    buildFacturasFilterChipHtml('timbrada', 'Timbradas') +
    buildFacturasFilterChipHtml('pos', 'POS') +
    buildFacturasFilterChipHtml('demo', 'Demo') +
    buildFacturasFilterChipHtml('precuenta', 'Precuenta') +
    buildFacturasFilterChipHtml('anulada', 'Anuladas') +
    '</div></div>' +
    '<div class="crozzo-invoice-result-bar" id="facturasResultBar">' +
    buildFacturasResultBarHtml(resumen, viewRows.length, facturas.length) +
    '</div>' +
    '<div id="facturasListHost">' +
    buildFacturasListBlockHtml(viewFacturas, filtered) +
    '</div>' +
    '</div></div>'
  );
}
function initFacturas() {
  if (document.body) document.body.classList.add('crozzo-page-facturas');
  var inp = document.getElementById('facturasSearchInput');
  if (inp && !inp._crozzoBound) {
    inp._crozzoBound = true;
    var t = null;
    inp.addEventListener('input', function () {
      facturasFilterQ = inp.value;
      if (t) clearTimeout(t);
      t = setTimeout(refreshFacturasFilteredView, 120);
    });
  }
  if (!window.__crozzoFacturasPeriodInit) {
    window.__crozzoFacturasPeriodInit = true;
    if (
      typeof CrozzoFacturasArchivo !== 'undefined' &&
      CrozzoFacturasArchivo.settings &&
      CrozzoFacturasArchivo.settings().defaultViewDays
    ) {
      facturasFilterPeriodDays = CrozzoFacturasArchivo.settings().defaultViewDays;
    }
    setFacturasPeriod(facturasFilterPeriodDays);
    return;
  }
  if (typeof CrozzoFacturasArchivo !== 'undefined' && CrozzoFacturasArchivo.loadForPeriod) {
    CrozzoFacturasArchivo.loadForPeriod(facturasFilterPeriodDays).then(function (archRows) {
      __facturasArchiveRows = archRows || [];
      refreshFacturasFilteredView();
      if (facturaPreviewRowKey) openFacturaRow(facturaPreviewRowKey);
    });
    return;
  }
  refreshFacturasFilteredView();
}
function viewFactura(idx) {
  openFacturaBelow(idx);
}
function clearFacturas() {
  if (typeof crozzoCanClearFacturasHistorial === 'function' && !crozzoCanClearFacturasHistorial()) {
    if (typeof showToast === 'function') {
      showToast('Solo Super Admin puede limpiar el historial de comprobantes.', 'warning');
    }
    if (typeof config !== 'undefined' && config.addAudit) {
      config.addAudit('facturas_limpiar_denegado', 'Intento no autorizado de limpiar historial de comprobantes');
    }
    return;
  }
  showModal('Limpiar historial', `
    <div class="fade-in">
      <p>¿Estás seguro de que deseas eliminar todas las facturas del historial?</p>
      <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 8px;">Quedará registrado en auditoría. Esta acción no se puede deshacer en este equipo.</p>
      <div class="btn-group" style="justify-content: flex-end;">
        <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-danger" onclick="confirmClearFacturasHistorial()">Eliminar todo</button>
      </div>
    </div>
  `);
}
function confirmClearFacturasHistorial() {
  if (typeof crozzoCanClearFacturasHistorial === 'function' && !crozzoCanClearFacturasHistorial()) {
    if (typeof showToast === 'function') showToast('Acción no autorizada.', 'warning');
    return;
  }
  const n = config.getFacturas().length;
  const total = config.getFacturas().reduce(function (acc, f) {
    return acc + Number(f.total || f.totalFactura || 0);
  }, 0);
  if (config.addAudit) {
    config.addAudit(
      'facturas_limpiadas',
      'Super Admin vació historial local: ' + n + ' comprobante(s) · $' + Math.round(total).toLocaleString('es-CO')
    );
  }
  crozzoConfigSetSecure('facturas', []);
  closeModal();
  navigateTo('facturas');
  if (typeof showToast === 'function') showToast('Historial limpiado (registrado en auditoría)', 'success');
}
window.confirmClearFacturasHistorial = confirmClearFacturasHistorial;
window.setFacturasPeriod = setFacturasPeriod;
window.selectFacturaForPreviewKey = selectFacturaForPreviewKey;
window.openFacturaRow = openFacturaRow;
window.crozzoFacturaAnularPrompt = crozzoFacturaAnularPrompt;
window.crozzoFacturaConfirmAnular = crozzoFacturaConfirmAnular;
