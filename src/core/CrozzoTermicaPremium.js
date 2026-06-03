/**
 * Crozzo POS — Render térmico premium (tipografía, ornamentos, jerarquía visual).
 * Usado por crozzoTermicaRenderPlantillaHtml y vista previa del diseñador.
 */
(function (global) {
  'use strict';

  var GOLD = '#8b7355';
  var GOLD_LIGHT = '#c9a962';
  var INK = '#141414';
  var MUTED = '#5c5348';
  var PAPER = '#fffef9';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function fmtCOP(n) {
    if (typeof global.crozzoTermicaFmtCOP === 'function') {
      return global.crozzoTermicaFmtCOP(n);
    }
    return '$' + String(Math.round(Number(n) || 0));
  }

  function esPrecuentaTicket(data, tpl) {
    var co = global.CrozzoTermicaColombia;
    if (co && co.isCuentaPrecuentaTicket) return co.isCuentaPrecuentaTicket(data, tpl);
    return data.docKind === 'precuenta_cuenta' || data.docKind === 'precuenta_fe' || (tpl && tpl.docType === 'precuenta');
  }

  function usaTotalesCuenta(data, tpl) {
    var co = global.CrozzoTermicaColombia;
    if (co && co.isCuentaTotalesTicket) return co.isCuentaTotalesTicket(data, tpl);
    return data.docKind === 'precuenta_cuenta' || data.docKind === 'precuenta_fe' || data.docKind === 'pos_cerrado' || data.docKind === 'fe_cerrada' || (tpl && tpl.docType === 'precuenta');
  }

  function muestraLeyendaPropina(data, tpl) {
    var co = global.CrozzoTermicaColombia;
    if (co && co.muestraLeyendaPropinaTicket) return co.muestraLeyendaPropinaTicket(data, tpl);
    return esPrecuentaTicket(data, tpl);
  }

  function muestraMontosPropina(data) {
    var co = global.CrozzoTermicaColombia;
    if (co && co.muestraMontosPropinaBloque) return co.muestraMontosPropinaBloque(data);
    return !data.propinaEnTotales && (Number(data.propinaSugerida || 0) > 0 || Number(data.propina || 0) > 0);
  }

  function legalLineas(data, tpl) {
    var co = global.CrozzoTermicaColombia;
    if (co && co.legalTicketLineasForData) return co.legalTicketLineasForData(data, tpl);
    return data.legalTicketLineas || [];
  }

  function blockStyle(b, extra) {
    if (typeof global.crozzoTermicaBlockStyleAttr === 'function') {
      return global.crozzoTermicaBlockStyleAttr(b, extra || {});
    }
    extra = extra || {};
    return (
      'text-align:' +
      (b.a || extra.align || 'center') +
      ';font-size:' +
      (extra.fontSize || '9px') +
      ';font-weight:' +
      (b.fw || extra.bold ? '700' : '400') +
      ';margin-top:' +
      ((Number(b.sp) || 0) * 4 + (extra.marginTop || 0)) + 'px;'
    );
  }

  function qrImg(url, sz) {
    if (typeof global.crozzoTermicaQrImgHtml === 'function') {
      return global.crozzoTermicaQrImgHtml(url, sz);
    }
    return '';
  }

  function wChars(tpl) {
    return tpl && tpl.sz === '58' ? 22 : 32;
  }

  /** Solo ASCII: impresoras térmicas (CP850) muestran "?" con ◆ ═ — · */
  function ornamentText(kind, tpl) {
    var w = wChars(tpl);
    var k = String(kind || 'rule').toLowerCase();
    if (k === 'diamond' || k === 'divider') {
      var side = Math.max(4, Math.floor((w - 3) / 2));
      return '-'.repeat(side) + ' * ' + '-'.repeat(side);
    }
    if (k === 'double') return '='.repeat(w);
    if (k === 'flourish') return '* --- * --- *';
    if (k === 'dots') return '. '.repeat(Math.min(w, 16)).trim();
    if (k === 'wave') return '~'.repeat(Math.min(w, 14));
    return '-'.repeat(w);
  }

  var PRESET_ACCENT = {
    elegante: '#6b5344',
    profesional: '#2c3e50',
    retail: '#8b2942',
    restaurante: '#5c4a1a',
    moderno: '#1a1a1a',
    detallado: '#4a5568',
  };

  function shellOpen(tpl) {
    var fz = tpl && tpl.sz === '58' ? '9px' : '10px';
    var w = tpl && tpl.sz === '58' ? '54mm' : '72mm';
    var pid = (tpl && tpl.presetId) || '';
    var accent = PRESET_ACCENT[pid] || GOLD;
    var dt = resolveTplDocType(tpl);
    var compact = dt === 'salon' || dt === 'bodega' || dt === 'bodega_entrada';
    return (
      '<div class="crozzo-ticket crozzo-ticket--' +
      esc(pid) +
      (compact ? ' crozzo-ticket--label' : '') +
      '" style="white-space:normal;font-family:Georgia,\'Times New Roman\',serif;font-size:' +
      fz +
      ';line-height:1.35;margin:0;padding:' +
      (compact ? '2mm 3mm 2.5mm' : '2mm 4mm 3.5mm') +
      ';width:' +
      w +
      ';max-width:100%;box-sizing:border-box;color:' +
      INK +
      ';background:' +
      PAPER +
      ';letter-spacing:0.01em;box-shadow:inset 0 0 0 1px ' +
      GOLD_LIGHT +
      ',inset 0 2px 0 ' +
      accent +
      ';">'
    );
  }

  function shellClose() {
    return '</div>';
  }

  function renderOrnament(b, tpl) {
    var line = ornamentText(b.c || 'diamond', tpl);
    return (
      '<div style="' +
      blockStyle(b, { align: 'center', fontSize: '8px', marginTop: 2 }) +
      'color:' +
      GOLD +
      ';letter-spacing:0.12em;font-family:ui-monospace,Consolas,monospace;">' +
      esc(line) +
      '</div>'
    );
  }

  function renderDivider(b, tpl) {
    var h = Math.max(4, Number(b.c) || 6);
    return (
      '<div style="margin:' +
      h +
      'px 0;text-align:center;">' +
      '<div style="font-size:7px;color:' +
      GOLD +
      ';letter-spacing:0.15em;font-family:ui-monospace,Consolas,monospace;">' +
      esc(ornamentText('diamond', tpl)) +
      '</div></div>'
    );
  }

  function renderLine(b) {
    var h = Math.max(4, Number(b.c) || 4);
    return '<div style="margin:' + h + 'px 0;border-top:1px solid ' + INK + ';opacity:0.85;"></div>';
  }

  function resolveTplDocType(tpl) {
    if (tpl && tpl.docType) return String(tpl.docType);
    try {
      if (typeof global.__crozzoPrintStudioDocType === 'string' && global.__crozzoPrintStudioDocType) {
        return global.__crozzoPrintStudioDocType;
      }
      if (typeof window !== 'undefined' && window.__crozzoPrintStudioDocType) {
        return String(window.__crozzoPrintStudioDocType);
      }
    } catch (_) {}
    return '';
  }

  function usesInlineLogoLayout(tpl) {
    var dt = resolveTplDocType(tpl);
    return dt === 'salon' || dt === 'bodega' || dt === 'bodega_entrada';
  }

  function inlineLogoPartnerType(t) {
    return t === 'salon_etiqueta' || t === 'rotulo_nombre';
  }

  function renderLogoThumb(b, data, tpl) {
    var thumbW = tpl && tpl.sz === '58' ? '46px' : '54px';
    var thumbH = tpl && tpl.sz === '58' ? '40px' : '48px';
    if (data.logoUrl) {
      return (
        '<img src="' +
        esc(data.logoUrl) +
        '" alt="" style="width:' +
        thumbW +
        ';max-width:' +
        thumbW +
        ';height:' +
        thumbH +
        ';max-height:' +
        thumbH +
        ';object-fit:contain;display:block;"/>'
      );
    }
    return (
      '<div style="font-weight:700;font-size:7px;line-height:1.15;letter-spacing:0.04em;text-transform:uppercase;max-width:' +
      thumbW +
      ';">' +
      esc(data.nameE || b.c || '') +
      '</div>'
    );
  }

  function renderLogo(b, data) {
    if (data.logoUrl) {
      var mt = Math.max(0, (Number(b.sp) || 0) * 4);
      return (
        '<div style="' +
        blockStyle(b, { align: 'center', marginTop: mt }) +
        'padding:0;line-height:0;">' +
        '<img src="' +
        esc(data.logoUrl) +
        '" alt="" style="max-width:92%;max-height:140px;object-fit:contain;display:block;margin:0 auto;"/></div>'
      );
    }
    return (
      '<div style="' +
      blockStyle(b, { align: 'center', bold: true, fontSize: '13px' }) +
      'letter-spacing:0.06em;text-transform:uppercase;">' +
      esc(data.nameE || b.c || '') +
      '</div>'
    );
  }

  function renderTitle(b, data) {
    return (
      '<div style="' +
      blockStyle(b, { align: b.a || 'center', bold: true }) +
      'letter-spacing:0.14em;text-transform:uppercase;font-size:' +
      (b.fs === 'xl' ? '15px' : b.fs === 'lg' ? '13px' : '11px') +
      ';padding:6px 0 4px;border-top:1px solid ' +
      INK +
      ';border-bottom:1px solid ' +
      INK +
      ';">' +
      esc(b.c || data.head || '') +
      '</div>'
    );
  }

  function renderCompany(b, data, opts) {
    opts = opts || {};
    return (
      '<div style="' +
      blockStyle(b, { align: b.a || 'center', marginTop: opts.tightAfterLogo ? 0 : undefined }) +
      'letter-spacing:0.04em;font-weight:600;line-height:1.2;">' +
      esc(data.nameE) +
      '</div>'
    );
  }

  function inventarioLineUnd(it) {
    var und = String(it.und || '').trim().toLowerCase();
    if (und) return und;
    var n = String(it.n || '');
    var m = n.match(/\((g|ml|und|kg)\)\s*$/i);
    if (m) return m[1].toLowerCase();
    return 'und';
  }

  function inventarioLineNombre(it) {
    var n = String(it.n || 'Ítem').trim();
    return n.replace(/\s*\((g|ml|und|kg)\)\s*$/i, '').trim() || 'Ítem';
  }

  function renderInventarioConteoItems(b, data, tpl) {
    var rows = (data.lines || [])
      .map(function (it) {
        var und = inventarioLineUnd(it);
        return (
          '<div style="margin:8px 0;padding:6px 0;border-bottom:1px dashed #444;">' +
          '<div style="font-weight:800;font-size:11px;line-height:1.25;margin:0 0 4px;word-wrap:break-word;">' +
          esc(inventarioLineNombre(it)) +
          '</div>' +
          '<div style="font-size:9px;margin:0 0 6px;">Unidad: <strong style="font-size:11px;">' +
          esc(und) +
          '</strong></div>' +
          '<div style="font-size:9px;">Cantidad:<span style="display:block;margin-top:4px;border-bottom:2px dashed #000;min-height:20px;"></span></div>' +
          '</div>'
        );
      })
      .join('');
    return (
      '<div style="' + blockStyle(b, { align: 'left' }) + '">' + renderDivider({ c: '3', v: true }, tpl) + rows + renderDivider({ c: '3', v: true }, tpl) + '</div>'
    );
  }

  function renderItems(b, data, tpl) {
    tpl = tpl || {};
    if (tpl.docType === 'inventario') {
      return renderInventarioConteoItems(b, data, tpl);
    }
    var rows = (data.lines || [])
      .map(function (it) {
        var qty = Number(it.q) || 0;
        var pu = Number(it.p) || 0;
        return (
          '<div style="margin:5px 0;padding:3px 0;border-bottom:1px dotted #ccc;">' +
          '<div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;">' +
          '<span style="font-weight:600;">' +
          esc(it.n) +
          (qty > 1 ? ' <span style="font-weight:400;color:' + MUTED + ';">×' + qty + '</span>' : '') +
          '</span>' +
          '<span style="font-weight:700;white-space:nowrap;">' +
          fmtCOP(pu * qty) +
          '</span></div>' +
          (pu > 0
            ? '<div style="font-size:7px;color:' + MUTED + ';margin-top:2px;">unit. ' + fmtCOP(pu) + '</div>'
            : '') +
          '</div>'
        );
      })
      .join('');
    var pieCuenta = tpl && tpl.docType === 'precuenta';
    var wrap = pieCuenta ? rows : renderDivider({ c: '3', v: true }, tpl) + rows + renderDivider({ c: '3', v: true }, tpl);
    return '<div style="' + blockStyle(b, { align: 'left' }) + '">' + wrap + '</div>';
  }

  function renderTotalRow(label, amount, opts) {
    opts = opts || {};
    return (
      '<div style="display:flex;justify-content:space-between;margin:2px 0;font-size:' +
      (opts.small ? '7px' : '8px') +
      ';color:' +
      (opts.muted ? MUTED : INK) +
      ';"><span>' +
      esc(label) +
      '</span><span>' +
      fmtCOP(amount) +
      '</span></div>'
    );
  }

  function renderTotalCuentaPrecuenta(b, data) {
    var pack =
      typeof global.CrozzoTermicaColombia !== 'undefined' &&
      global.CrozzoTermicaColombia.cuentaPrecuentaFilasTotales
        ? global.CrozzoTermicaColombia.cuentaPrecuentaFilasTotales(data)
        : null;
    var rows = '';
    var totLabel = esc(b.c || 'TOTAL A PAGAR');
    var totAmt = Number(data.totalConPropina) || Number(data.tot) || 0;
    if (pack && pack.rows) {
      pack.rows.forEach(function (row) {
        if (row.hint) {
          rows +=
            '<div style="font-size:7px;color:' +
            MUTED +
            ';margin:2px 0;">' +
            esc(row.hint) +
            '</div>';
          return;
        }
        rows += renderTotalRow(row.label, row.amount, { muted: !!row.muted });
      });
      totLabel = esc(b.c || pack.totalLabel || 'TOTAL A PAGAR');
      totAmt = pack.totalAmount;
    }
    return (
      '<div style="' +
      blockStyle(b, { align: 'stretch', marginTop: 6 }) +
      'padding:8px 6px;border:2px solid ' +
      INK +
      ';background:#faf8f5;">' +
      rows +
      '<div style="display:flex;justify-content:space-between;margin-top:8px;padding-top:6px;border-top:1px solid ' +
      INK +
      ';font-weight:800;font-size:' +
      (b.fs === 'xl' ? '14px' : '12px') +
      ';letter-spacing:0.06em;"><span>' +
      totLabel +
      '</span><span>' +
      fmtCOP(totAmt) +
      '</span></div></div>'
    );
  }

  function renderTotal(b, data, tpl) {
    if (usaTotalesCuenta(data, tpl)) {
      return renderTotalCuentaPrecuenta(b, data);
    }
    var impLbl =
      typeof global.CrozzoTermicaColombia !== 'undefined' &&
      global.CrozzoTermicaColombia.impuestoLineaLabel
        ? global.CrozzoTermicaColombia.impuestoLineaLabel(data)
        : data.etiquetaImpuesto || 'IVA / impuesto';
    var subLbl = data.etiquetaSubtotal || 'Subtotal';
    return (
      '<div style="' +
      blockStyle(b, { align: 'stretch', marginTop: 6 }) +
      'padding:8px 6px;border:2px solid ' +
      INK +
      ';background:#faf8f5;">' +
      '<div style="display:flex;justify-content:space-between;margin:2px 0;font-size:8px;color:' +
      MUTED +
      ';"><span>' +
      esc(subLbl) +
      '</span><span>' +
      fmtCOP(data.sub) +
      '</span></div>' +
      (data.ivaDisc ? '<div style="font-size:7px;color:' + MUTED + ';margin:2px 0;">' + esc(data.ivaDisc) + '</div>' : '') +
      (Number(data.iva) > 0 || data.consumoAplica || data.impuestoTipo === 'consumo'
        ? '<div style="display:flex;justify-content:space-between;margin:2px 0;font-size:8px;color:' +
          MUTED +
          ';"><span>' +
          esc(impLbl) +
          '</span><span>' +
          fmtCOP(data.iva) +
          '</span></div>'
        : '') +
      '<div style="display:flex;justify-content:space-between;margin-top:8px;padding-top:6px;border-top:1px solid ' +
      INK +
      ';font-weight:800;font-size:' +
      (b.fs === 'xl' ? '14px' : '12px') +
      ';letter-spacing:0.06em;"><span>' +
      esc(b.c || 'TOTAL') +
      '</span><span>' +
      fmtCOP(data.tot) +
      '</span></div></div>'
    );
  }

  function renderFooterPrecuenta(b, data) {
    var co = typeof global.CrozzoTermicaColombia !== 'undefined' ? global.CrozzoTermicaColombia : null;
    var av = data.avisoCajaPrecuenta || null;
    if (!av) return '';
    return (
      '<div style="' +
      blockStyle(b, { align: 'center', marginTop: 4 }) +
      'padding:10px 6px 4px;border-top:2px solid ' +
      INK +
      ';text-align:center;">' +
      '<div style="font-weight:800;font-size:12px;letter-spacing:0.14em;line-height:1.2;">' +
      esc(av.titulo) +
      '</div>' +
      '<div style="font-size:9px;font-weight:600;margin-top:4px;color:' +
      INK +
      ';">' +
      esc(av.linea) +
      '</div></div>'
    );
  }

  function renderLegalPrecuenta(b, data, tpl) {
    var lineas = legalLineas(data, tpl);
    if (!lineas.length && data.legalCo) {
      return '<div style="' + blockStyle(b, { fontSize: '7px', align: 'center' }) + '">' + esc(data.legalCo) + '</div>';
    }
    var html =
      '<div style="' +
      blockStyle(b, { align: 'center', fontSize: '7px', marginTop: 4 }) +
      'padding:4px 2px 2px;">';
    lineas.forEach(function (ln) {
      if (!ln || !ln.t) return;
      if (ln.k === 'head') {
        html +=
          '<div style="font-weight:700;font-size:6px;letter-spacing:0.12em;color:' +
          MUTED +
          ';margin:0 0 5px;text-transform:uppercase;">' +
          esc(ln.t) +
          '</div>';
      } else {
        html += '<div style="margin:2px 0;line-height:1.4;color:' + MUTED + ';">' + esc(ln.t) + '</div>';
      }
    });
    html += '</div>';
    return html;
  }

  function renderFooter(b, tpl, data) {
    data = data || {};
    if (esPrecuentaTicket(data, tpl)) {
      var prec = renderFooterPrecuenta(b, data);
      if (prec) return prec;
    }
    if (!b.c) return '';
    var compact = usesInlineLogoLayout(tpl);
    return (
      '<div style="' +
      blockStyle(b, {
        align: b.a || 'center',
        fontSize: '7px',
        marginTop: compact ? 4 : 8,
      }) +
      'color:' +
      MUTED +
      ';letter-spacing:0.06em;padding-top:' +
      (compact ? '3px' : '6px') +
      ';border-top:1px dotted ' +
      GOLD_LIGHT +
      ';">' +
      esc(b.c) +
      '</div>'
    );
  }

  function renderRotuloNombre(b, data, opts) {
    opts = opts || {};
    if (opts.inline) {
      return (
        '<div style="font-weight:800;font-size:' +
        (b.fs === 'xl' ? '13px' : '12px') +
        ';line-height:1.2;word-wrap:break-word;overflow-wrap:break-word;text-align:left;">' +
        esc(data.rotuloNombre || b.c || '') +
        '</div>'
      );
    }
    return (
      '<div style="' +
      blockStyle(b, { align: 'center', marginTop: opts.tightAfterLogo ? 0 : 4 }) +
      '">' +
      '<div style="padding:10px 8px;border:2px solid ' +
      INK +
      ';text-align:center;background:#faf8f5;">' +
      '<div style="font-size:7px;letter-spacing:0.2em;color:' +
      MUTED +
      ';margin-bottom:6px;">PRODUCTO</div>' +
      '<div style="font-weight:800;font-size:' +
      (b.fs === 'xl' ? '16px' : '14px') +
      ';line-height:1.25;letter-spacing:0.02em;direction:ltr;unicode-bidi:normal;word-wrap:break-word;overflow-wrap:break-word;">' +
      esc(data.rotuloNombre || b.c || '') +
      '</div></div></div>'
    );
  }

  function renderFechasBlank(b, tpl, opts) {
    opts = opts || {};
    var wF = tpl && tpl.sz === '58' ? (opts.inline ? 10 : 16) : opts.inline ? 14 : 24;
    function row(label) {
      return (
        '<div style="margin-top:' +
        (opts.inline ? '4px' : '8px') +
        ';display:flex;align-items:baseline;gap:4px;">' +
        '<span style="font-weight:700;width:18px;font-size:8px;letter-spacing:0.06em;">' +
        label +
        '</span>' +
        '<span style="flex:1;border-bottom:1.5px solid ' +
        INK +
        ';min-height:12px;font-family:ui-monospace,Consolas,monospace;font-size:7px;color:#bbb;">' +
        '·'.repeat(wF) +
        '</span></div>'
      );
    }
    return (
      '<div style="' +
      blockStyle(b, { align: 'left', marginTop: opts.inline ? 2 : 6 }) +
      'padding:' +
      (opts.inline ? '2px 0' : '4px 2px') +
      ';">' +
      row('FE') +
      row('FI') +
      row('FV') +
      '</div>'
    );
  }

  function renderMpLines(b, data, tpl) {
    var lines = data.mpLines || [];
    if (!lines.length && !b.c) return '';
    var html =
      '<div style="' +
      blockStyle(b, { align: 'left', marginTop: 4 }) +
      '">' +
      renderOrnament({ c: 'diamond', v: true }, tpl) +
      '<div style="font-size:7px;letter-spacing:0.14em;color:' +
      MUTED +
      ';margin:6px 0 4px;text-transform:uppercase;">' +
      esc(b.c || 'Materia prima') +
      '</div>';
    lines.forEach(function (ln) {
      html +=
        '<div style="margin:8px 0;padding:6px 4px;border-left:2px solid ' +
        GOLD +
        ';">' +
        '<div style="font-weight:700;font-size:10px;">' +
        esc(ln.n || 'MP') +
        (ln.q ? ' <span style="font-weight:400;color:' + MUTED + ';">- ' + esc(ln.q) + '</span>' : '') +
        '</div>';
      if (ln.blank) {
        html += renderFechasBlank({ v: true }, tpl);
      } else if (ln.fe || ln.fi || ln.fv) {
        html +=
          '<div style="font-size:8px;margin-top:4px;color:' +
          MUTED +
          ';">FE ' +
          esc(ln.fe || '-') +
          ' / FI ' +
          esc(ln.fi || '-') +
          ' / FV ' +
          esc(ln.fv || '-') +
          '</div>';
      }
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  function renderObs(b, data) {
    var txt = data.obs || b.c || '';
    if (!txt) return '';
    return (
      '<div style="' +
      blockStyle(b, { align: b.a || 'left', marginTop: 4 }) +
      'padding:6px 8px;border:1px dashed ' +
      GOLD_LIGHT +
      ';background:#faf8f5;font-style:italic;">' +
      esc(txt) +
      '</div>'
    );
  }

  function renderInlineLogoProductRow(logoB, mainB, extraBlocks, tpl, data) {
    extraBlocks = extraBlocks || [];
    var mainHtml = '';
    if (mainB.t === 'rotulo_nombre') {
      mainHtml = renderRotuloNombre(mainB, data, { inline: true });
    } else if (mainB.t === 'salon_etiqueta') {
      mainHtml = renderSalonEtiqueta(mainB, data, { inline: true });
    } else {
      mainHtml = renderBlock(mainB, tpl, data, logoB);
    }
    var extraHtml = extraBlocks
      .map(function (xb) {
        if (xb.t === 'fechas_blank') return renderFechasBlank(xb, tpl, { inline: true });
        return renderBlock(xb, tpl, data, mainB);
      })
      .join('');
    return (
      '<div class="crozzo-label-inline" style="display:flex;flex-direction:row;align-items:flex-start;gap:5px;margin:0 0 3px;page-break-inside:avoid;max-width:100%;box-sizing:border-box;">' +
      '<div style="flex:0 0 auto;min-width:0;max-width:28%;">' +
      renderLogoThumb(logoB, data, tpl) +
      '</div>' +
      '<div style="flex:1;min-width:0;overflow:hidden;word-wrap:break-word;overflow-wrap:break-word;">' +
      mainHtml +
      extraHtml +
      '</div></div>'
    );
  }

  function renderSalonEtiqueta(b, data, opts) {
    opts = opts || {};
    var sit =
      data.salonItem ||
      (data.lines && data.lines[0]
        ? {
            nombre: data.lines[0].n,
            precio: data.lines[0].p,
            precioGramo: data.lines[0].pGramo,
            gramaje: data.lines[0].gramaje,
            enDescuento: data.lines[0].enDescuento,
            precioAnterior: data.lines[0].precioAnt,
          }
        : { nombre: 'Producto', precio: 0 });
    var precio = sit.precio != null ? sit.precio : sit.p;
    if (opts.inline) {
      var htmlInline =
        '<div style="text-align:left;line-height:1.25;">' +
        '<div style="font-weight:800;font-size:11px;line-height:1.2;margin-bottom:4px;">' +
        esc(sit.nombre || sit.n || 'Producto') +
        '</div>' +
        '<div style="font-weight:800;font-size:' +
        (b.fs === 'xl' ? '15px' : '13px') +
        ';letter-spacing:0.02em;">' +
        fmtCOP(precio) +
        '</div>';
      var muestraGramoIn =
        typeof global.crozzoSalonMuestraPrecioGramo === 'function'
          ? global.crozzoSalonMuestraPrecioGramo(sit)
          : sit.gramaje > 0 && sit.precioGramo != null && sit.precioGramo > 0;
      if (muestraGramoIn) {
        htmlInline +=
          '<div style="font-size:8px;color:' + MUTED + ';margin-top:3px;">' + fmtCOP(sit.precioGramo) + ' / g</div>';
      }
      if (sit.enDescuento) {
        htmlInline += '<div style="font-size:8px;font-weight:700;margin-top:3px;">OFERTA</div>';
      }
      htmlInline += '</div>';
      return htmlInline;
    }
    var html =
      '<div style="padding:12px 10px;border:2px solid ' +
      INK +
      ';background:linear-gradient(180deg,#fffef9 0%,#f5f0e8 100%);text-align:center;">' +
      '<div style="font-size:7px;letter-spacing:0.22em;color:' +
      MUTED +
      ';margin-bottom:6px;">PRECIO VENTA CAJA</div>' +
      '<div style="font-weight:800;font-size:13px;line-height:1.2;margin-bottom:10px;letter-spacing:0.02em;">' +
      esc(sit.nombre || sit.n || 'Producto') +
      '</div>' +
      '<div style="font-weight:800;font-size:' +
      (b.fs === 'xl' ? '22px' : '18px') +
      ';letter-spacing:0.04em;line-height:1;">' +
      fmtCOP(precio) +
      '</div>';
    var muestraGramo =
      typeof global.crozzoSalonMuestraPrecioGramo === 'function'
        ? global.crozzoSalonMuestraPrecioGramo(sit)
        : sit.gramaje > 0 && sit.precioGramo != null && sit.precioGramo > 0;
    if (muestraGramo) {
      html +=
        '<div style="font-size:9px;color:' +
        MUTED +
        ';margin-top:8px;letter-spacing:0.06em;">' +
        fmtCOP(sit.precioGramo) +
        ' / g</div>';
    }
    if (sit.enDescuento) {
      html +=
        '<div style="margin-top:10px;display:inline-block;padding:5px 14px;border:2px solid ' +
        INK +
        ';font-weight:800;font-size:10px;letter-spacing:0.18em;">OFERTA</div>';
      if (sit.precioAnterior != null && sit.precioAnterior > precio) {
        html +=
          '<div style="font-size:8px;margin-top:6px;text-decoration:line-through;color:' +
          MUTED +
          ';">Antes ' +
          fmtCOP(sit.precioAnterior) +
          '</div>';
      }
    }
    html += '</div>';
    return (
      '<div style="' + blockStyle(b, { align: 'center', marginTop: opts.tightAfterLogo ? 0 : undefined }) + '">' + html + '</div>'
    );
  }

  function renderBlock(b, tpl, data, prev) {
    if (b.v === false) return '';
    switch (b.t) {
      case 'ornament':
        if (usesInlineLogoLayout(tpl) && (b.c === 'diamond' || !b.c)) return '';
        return renderOrnament(b, tpl);
      case 'logo':
        return renderLogo(b, data);
      case 'company':
        return renderCompany(b, data, { tightAfterLogo: !!(prev && prev.t === 'logo') });
      case 'razon': {
        var col = global.CrozzoTermicaColombia;
        if (col && col.namesEqual && col.namesEqual(data.nameE, data.razonE)) return '';
        return data.razonE
          ? '<div style="' + blockStyle(b, { fontSize: '8px' }) + '">' + esc(data.razonE) + '</div>'
          : '';
      }
      case 'nit':
        return '<div style="' + blockStyle(b, { fontSize: '8px' }) + '">NIT ' + esc(data.nitE) + '</div>';
      case 'tel':
        return data.telE ? '<div style="' + blockStyle(b, { fontSize: '8px' }) + '">Tel. ' + esc(data.telE) + '</div>' : '';
      case 'ciudad':
        return data.ciudadE ? '<div style="' + blockStyle(b, { fontSize: '8px' }) + '">' + esc(data.ciudadE) + '</div>' : '';
      case 'regimen':
        return data.regimenE ? '<div style="' + blockStyle(b, { fontSize: '8px' }) + '">' + esc(data.regimenE) + '</div>' : '';
      case 'impuesto_consumo': {
        if (usaTotalesCuenta(data, tpl)) return '';
        var encImp =
          (typeof global.CrozzoTermicaColombia !== 'undefined' &&
            global.CrozzoTermicaColombia.impuestoEncabezadoEmpresa &&
            global.config &&
            global.config.getImpuestos &&
            global.CrozzoTermicaColombia.impuestoEncabezadoEmpresa(global.config.getImpuestos())) ||
          data.impuestoConsumoE ||
          '';
        return encImp
          ? '<div style="' + blockStyle(b, { fontSize: '8px', align: 'center' }) + '">' + esc(encImp) + '</div>'
          : '';
      }
      case 'address':
        return data.dirE
          ? '<div style="' + blockStyle(b, { fontSize: '8px' }) + '">' + esc(data.dirE) + '</div>'
          : '';
      case 'num_fe':
        return '<div style="' + blockStyle(b, { bold: true }) + '">No. ' + esc(data.numFe || data.consecutivo) + '</div>';
      case 'resol_full':
        return data.resolFull ? '<div style="' + blockStyle(b, { fontSize: '7px' }) + '">' + esc(data.resolFull) + '</div>' : '';
      case 'iva_disc':
        if (usaTotalesCuenta(data, tpl)) {
          return '';
        }
        return data.ivaDisc ? '<div style="' + blockStyle(b, { align: 'left', fontSize: '8px' }) + '">' + esc(data.ivaDisc) + '</div>' : '';
      case 'legal_co': {
        var lnLeg = legalLineas(data, tpl);
        if (lnLeg.length) return renderLegalPrecuenta(b, data, tpl);
        return data.legalCo ? '<div style="' + blockStyle(b, { fontSize: '7px' }) + '">' + esc(data.legalCo) + '</div>' : '';
      }
      case 'divider':
        return renderDivider(b, tpl);
      case 'line':
        return renderLine(b);
      case 'title':
        return renderTitle(b, data);
      case 'consec':
        return (
          '<div style="' +
          blockStyle(b) +
          '"><span style="font-size:7px;color:' +
          MUTED +
          ';letter-spacing:0.12em;">No. </span><span style="font-weight:700;">' +
          esc(data.consecutivo) +
          '</span></div>'
        );
      case 'date':
        return '<div style="' + blockStyle(b, { fontSize: '8px' }) + '">' + esc(data.fecha) + '</div>';
      case 'client': {
        var cliHdr = data.cliTipo === 'NIT' ? 'Cliente' : data.cliTipo || 'Adquirente';
        var docLine =
          data.cliNit && String(data.cliNit).trim()
            ? '<div style="font-size:8px;color:' +
              MUTED +
              ';">' +
              (data.cliTipo === 'NIT' ? 'NIT ' : 'Doc. ') +
              esc(data.cliNit) +
              '</div>'
            : '';
        return (
          '<div style="' + blockStyle(b, { align: 'left' }) + '">' +
          '<div style="font-size:7px;color:' +
          MUTED +
          ';letter-spacing:0.1em;text-transform:uppercase;">' +
          esc(cliHdr) +
          '</div><div style="font-weight:600;margin-top:2px;">' +
          esc(data.cliNom) +
          '</div>' +
          docLine +
          '</div>'
        );
      }
      case 'servicio_ref':
        return data.servicioRef
          ? '<div style="' + blockStyle(b, { align: 'center', bold: true, fontSize: '11px' }) + '">' + esc(data.servicioRef) + '</div>'
          : '';
      case 'propina_sugerida': {
        var leyTip =
          data.propinaLeyendaTicket ||
          data.propinaLeyenda ||
          (typeof global.CrozzoTermicaColombia !== 'undefined' && global.CrozzoTermicaColombia.propinaLeyendaTicketCorta
            ? global.CrozzoTermicaColombia.propinaLeyendaTicketCorta()
            : '');
        var htmlProp = '';
        if (muestraLeyendaPropina(data, tpl) && leyTip) {
          htmlProp =
            '<div style="' +
            blockStyle(b, { align: 'center', marginTop: 2 }) +
            'padding:4px 6px 2px;"><div style="font-size:7px;line-height:1.4;color:' +
            MUTED +
            ';font-style:italic;text-align:center;">' +
            esc(leyTip) +
            '</div></div>';
        }
        if (!muestraMontosPropina(data)) return htmlProp;
        return (
          htmlProp +
          '<div style="' +
          blockStyle(b, { align: 'left', fontSize: '8px' }) +
          '">' +
          (data.propinaSugerida > 0
            ? '<div>Propina sugerida (' + (data.propinaPctSugerido || 0) + '%): ' + fmtCOP(data.propinaSugerida) + '</div>'
            : '') +
          (data.propina > 0 ? '<div>Propina voluntaria: ' + fmtCOP(data.propina) + '</div>' : '') +
          (!data.propinaEnTotales && data.totalConPropina > data.tot
            ? '<div style="font-weight:700;margin-top:4px;">Total ref.: ' + fmtCOP(data.totalConPropina) + '</div>'
            : '') +
          '</div>'
        );
      }
      case 'items':
      case 'inv_conteo':
        return renderItems(b, data, tpl);
      case 'total':
        return renderTotal(b, data, tpl);
      case 'payment':
        if (esPrecuentaTicket(data, tpl)) {
          return '';
        }
        if (!data.pago && !data.recibido && !data.cambio && !(data.propinaSugerida > 0) && !(data.propina > 0)) return '';
        return (
          '<div style="' + blockStyle(b, { align: 'left', fontSize: '8px' }) + '">' +
          (data.pago ? '<div>Pago: ' + esc(data.pago) + '</div>' : '') +
          (!data.propinaEnTotales && data.propina > 0 ? '<div>Propina voluntaria: ' + fmtCOP(data.propina) + '</div>' : '') +
          (!data.propinaEnTotales && data.propinaSugerida > 0 && !data.propina
            ? '<div>Propina sugerida: ' + fmtCOP(data.propinaSugerida) + '</div>'
            : '') +
          (data.recibido > 0 ? '<div>Recibido: ' + fmtCOP(data.recibido) + '</div>' : '') +
          (data.cambio > 0 ? '<div>Devueltas: ' + fmtCOP(data.cambio) + '</div>' : '') +
          '</div>'
        );
      case 'resol':
        return '<div style="' + blockStyle(b, { fontSize: '8px' }) + '">Resol. ' + esc(data.resol) + '</div>';
      case 'cufe':
        return data.cufe
          ? '<div style="' + blockStyle(b, { align: 'left', fontSize: '7px' }) + '">CUFE<br>' + esc(data.cufe) + '</div>'
          : '';
      case 'qr':
        return data.qrUrl
          ? '<div style="' + blockStyle(b, { align: 'center' }) + '">' + qrImg(data.qrUrl, tpl.sz === '80' ? 110 : 96) + '</div>'
          : b.c
            ? '<div style="' + blockStyle(b, { fontSize: '7px' }) + '">' + esc(b.c) + '</div>'
            : '';
      case 'space':
        return '<div style="height:' + Math.max(2, Number(b.c) || 1) * 5 + 'px;"></div>';
      case 'cut': {
        var cLbl = String(b.c || 'partial').toLowerCase() === 'full' ? 'Corte total' : 'Corte parcial';
        return (
          '<div style="margin:' +
          (Math.max(0, Number(b.sp) || 0) * 2 + 6) +
          'px 0;padding:8px 0;text-align:center;font-size:7px;font-weight:600;letter-spacing:0.12em;color:' +
          GOLD +
          ';border-top:1px dashed ' +
          GOLD_LIGHT +
          ';">✂ ' +
          esc(cLbl) +
          '</div>'
        );
      }
      case 'footer':
        return renderFooter(b, tpl, data);
      case 'rotulo_nombre':
        return renderRotuloNombre(b, data, { tightAfterLogo: !!(prev && prev.t === 'logo') });
      case 'fechas_blank':
        return renderFechasBlank(b, tpl);
      case 'salon_etiqueta':
        return renderSalonEtiqueta(b, data, { tightAfterLogo: !!(prev && prev.t === 'logo') });
      case 'mp_lines':
        return renderMpLines(b, data, tpl);
      case 'obs':
        return renderObs(b, data);
      case 'marcacion':
        return data.marcacion
          ? '<div style="' + blockStyle(b, { fontSize: '8px' }) + '">' + esc(data.marcacion) + '</div>'
          : '';
      case 'bodega_ref':
        return data.bodegaRef
          ? '<div style="' + blockStyle(b, { fontSize: '8px', align: 'left' }) + '">Ref. ' + esc(data.bodegaRef) + '</div>'
          : '';
      default:
        return b.c ? '<div style="' + blockStyle(b) + '">' + esc(b.c) + '</div>' : '';
    }
  }

  function render(tpl, data) {
    if (!tpl || !tpl.blocks) return '';
    data = data || {};
    var sorted = tpl.blocks.slice().sort(function (a, b) {
      return (a.o || 0) - (b.o || 0);
    });
    var visible = sorted.filter(function (bx) {
      return bx && bx.v !== false;
    });
    var parts = [shellOpen(tpl)];
    var inlineLogo = usesInlineLogoLayout(tpl);
    var i = 0;
    while (i < visible.length) {
      var b = visible[i];
      var prev = i > 0 ? visible[i - 1] : null;
      var next = i < visible.length - 1 ? visible[i + 1] : null;
      if (b.t === 'logo' && inlineLogo && !data.logoUrl) {
        i++;
        continue;
      }
      if (inlineLogo && b.t === 'logo' && data.logoUrl && next && inlineLogoPartnerType(next.t)) {
        var extra = [];
        var skip = 1;
        if (next.t === 'rotulo_nombre' && visible[i + 2] && visible[i + 2].t === 'fechas_blank') {
          extra.push(visible[i + 2]);
          skip = 2;
        }
        parts.push(renderInlineLogoProductRow(b, next, extra, tpl, data));
        i += 1 + skip;
        continue;
      }
      if (
        b.t === 'ornament' &&
        prev &&
        prev.t === 'logo' &&
        next &&
        (next.t === 'company' ||
          next.t === 'razon' ||
          next.t === 'rotulo_nombre' ||
          next.t === 'salon_etiqueta')
      ) {
        i++;
        continue;
      }
      var html = renderBlock(b, tpl, data, prev);
      if (html) parts.push(html);
      i++;
    }
    parts.push(shellClose());
    return parts.join('');
  }

  global.CrozzoTermicaPremium = {
    render: render,
    ornamentText: ornamentText,
    renderOrnament: renderOrnament,
    renderSalonEtiqueta: renderSalonEtiqueta,
    renderRotuloNombre: renderRotuloNombre,
    renderFechasBlank: renderFechasBlank,
  };
})(typeof window !== 'undefined' ? window : globalThis);
