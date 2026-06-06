/**
 * Crozzo POS — Campos legales factura Colombia (Res. DIAN 000165/2023, art. 617 ET).
 * Representación impresa / térmica de factura electrónica de venta.
 */
(function (global) {
  'use strict';

  var REGIMEN_LABELS = {
    responsable_iva: 'Responsable de IVA',
    no_responsable: 'No responsable de IVA',
    simple: 'Régimen Simple',
    especial: 'Régimen especial',
  };

  function fmtCop(n) {
    if (typeof global.crozzoTermicaFmtCOP === 'function') return global.crozzoTermicaFmtCOP(n);
    try {
      return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(
        Number(n) || 0
      );
    } catch (_) {
      return '$' + String(Math.round(Number(n) || 0));
    }
  }

  function fmtNit(nit, dv) {
    var n = String(nit || '').trim();
    if (!n) return '';
    if (n.indexOf('-') >= 0) return n;
    var d = dv != null && String(dv).trim() !== '' ? String(dv).trim() : '';
    return d ? n + '-' + d : n;
  }

  function fmtFechaHora(factura) {
    var raw = (factura && (factura.fechaEmision || factura.fecha)) || '';
    if (!raw) return new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
    try {
      var d = new Date(raw);
      if (!isNaN(d.getTime())) {
        return d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
      }
    } catch (_) {}
    return String(raw);
  }

  function cliTipoDoc(nit) {
    var s = String(nit || '').trim();
    if (!s || s === '222222222-2' || s === '222222222222') return 'Consumidor final';
    if (/^\d{9,12}-?\d?$/i.test(s.replace(/\./g, ''))) return 'NIT';
    return 'Documento';
  }

  function resolTexto(dian) {
    dian = dian || {};
    var p = [];
    if (dian.resolucion) p.push('Autorización ' + dian.resolucion);
    if (dian.prefijo) p.push('Prefijo ' + dian.prefijo);
    if (dian.rangoDesde != null && dian.rangoHasta != null && dian.rangoHasta) {
      p.push('Numeración ' + dian.rangoDesde + ' al ' + dian.rangoHasta);
    }
    if (dian.fechaDesde && dian.fechaVencimiento) {
      p.push('Vigencia ' + dian.fechaDesde + ' a ' + dian.fechaVencimiento);
    }
    return p.join(' · ') || '—';
  }

  function numFactura(dian, consecutivo) {
    var pref = String((dian && dian.prefijo) || '').trim();
    var num = String(consecutivo || '').trim();
    if (!num) return '—';
    if (pref && num.indexOf(pref) !== 0) return pref + num;
    return num;
  }

  function tituloLegal(estado, tipoComprobante) {
    var st = String(estado || '').toLowerCase();
    if (st === 'precuenta') return 'PRECUENTA';
    if (st === 'demo') return 'FACTURA DEMO (NO VÁLIDA)';
    if (st === 'pos' || tipoComprobante === 'pos') return 'DOCUMENTO SOPORTE POS';
    if (st === 'timbrada') return 'FACTURA ELECTRÓNICA DE VENTA';
    return 'FACTURA ELECTRÓNICA DE VENTA';
  }

  function pieLegal(estado, tipoComprobante) {
    var st = String(estado || '').toLowerCase();
    if (st === 'precuenta') return 'No es factura · No constituye documento equivalente.';
    if (st === 'demo') return 'Documento de prueba. Sin validez ante la DIAN.';
    if (st === 'pos' || tipoComprobante === 'pos') {
      return 'Documento soporte de venta en POS. Si está obligado a FE, debe emitir factura electrónica validada.';
    }
    return 'Representación impresa de Factura Electrónica de Venta (Res. DIAN 000165/2023). Verifique CUFE y QR en el portal DIAN.';
  }

  function ivaDiscriminacion(sub, iva, imp) {
    imp = imp || {};
    var pct = 19;
    var tarifas = imp.tarifasIVA;
    if (Array.isArray(tarifas)) {
      var act = tarifas.find(function (t) {
        return t && t.activo !== false && Number(t.rate) > 0;
      });
      if (act) pct = Math.round(Number(act.rate) * 1000) / 10;
    }
    var base = Number(sub) || 0;
    var tax = Number(iva) || 0;
    if (imp.ivaIncluidoEnPrecios && base > 0 && tax > 0) {
      base = Math.max(0, base);
    }
    return 'Base gravada ' + fmtCop(base) + ' · IVA ' + pct + '% ' + fmtCop(tax);
  }

  function legalPayload(factura) {
    factura = factura || {};
    var emp =
      typeof global.config !== 'undefined' && global.config.getEmpresa ? global.config.getEmpresa() : {};
    var dian = typeof global.config !== 'undefined' && global.config.getDian ? global.config.getDian() : {};
    var imp = typeof global.config !== 'undefined' && global.config.getImpuestos ? global.config.getImpuestos() : {};
    var estado = String(factura.estado || '');
    var tipo = factura.tipoComprobante || '';
    var sub = Number(factura.subtotal || 0);
    var iva = Number(factura.iva || 0);
    if (!sub && !iva && factura.items && typeof global.computeTotals === 'function') {
      try {
        var tx = global.computeTotals(factura.items);
        sub = tx.subtotal;
        iva = tx.iva;
      } catch (_) {}
    }
    var ciudad = [emp.ciudad, emp.departamento].filter(Boolean).join(', ');
    return {
      head: tituloLegal(estado, tipo),
      razonE: emp.razonSocial || emp.nombreComercial || '',
      nitE: fmtNit(emp.nit, emp.dv),
      regimenE: REGIMEN_LABELS[emp.regimenFiscal] || REGIMEN_LABELS.responsable_iva,
      ciudadE: ciudad,
      emailE: emp.email || '',
      numFe: numFactura(dian, factura.consecutivo),
      resolFull: resolTexto(dian),
      resol: dian.resolucion || '—',
      fechaHora: fmtFechaHora(factura),
      cliTipo: cliTipoDoc(factura.compradorNit || factura.cliNit),
      cliNom: factura.compradorNombre || factura.cliNom || 'Cliente',
      cliNit: factura.compradorNit || factura.cliNit || '',
      ivaDisc: ivaDiscriminacion(sub, iva, imp),
      legalCo: pieLegal(estado, tipo),
      sub: sub,
      iva: iva,
      tot: Number(factura.total || 0) || sub + iva,
    };
  }

  function normNameKey(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .replace(/[.\s]+/g, '');
  }

  function namesEqual(a, b) {
    var x = normNameKey(a);
    var y = normNameKey(b);
    return !!(x && y && x === y);
  }

  /** Quita bloques duplicados (NIT, número FE, resolución, pies, etc.) en plantillas de factura. */
  function dedupeFacturaBlocks(tpl) {
    if (!tpl || !Array.isArray(tpl.blocks)) return tpl;
    if (tpl.docType && tpl.docType !== 'factura') return tpl;

    var singleton = {
      logo: true,
      company: true,
      razon: true,
      nit: true,
      address: true,
      tel: true,
      ciudad: true,
      regimen: true,
      num_fe: true,
      consec: true,
      resol: true,
      resol_full: true,
      date: true,
      title: true,
      cufe: true,
      qr: true,
      legal_co: true,
      iva_disc: true,
      total: true,
      items: true,
      client: true,
      payment: true,
    };

    var seen = {};
    var haveVisible = {};
    tpl.blocks.forEach(function (b) {
      if (b && b.v !== false && b.t) haveVisible[b.t] = true;
    });

    if (haveVisible.num_fe && haveVisible.consec) {
      tpl.blocks.forEach(function (b) {
        if (b && b.t === 'consec') b.v = false;
      });
      haveVisible.consec = false;
    } else if (haveVisible.consec && !haveVisible.num_fe) {
      tpl.blocks.forEach(function (b) {
        if (b && b.t === 'consec' && b.v !== false) b.t = 'num_fe';
      });
      haveVisible.num_fe = true;
      haveVisible.consec = false;
    }

    if (haveVisible.resol_full && haveVisible.resol) {
      tpl.blocks.forEach(function (b) {
        if (b && b.t === 'resol') b.v = false;
      });
    }

    if (haveVisible.company && haveVisible.razon) {
      tpl.blocks.forEach(function (b) {
        if (b && b.t === 'razon') b.v = false;
      });
    }

    var footerSeen = 0;
    tpl.blocks = tpl.blocks.filter(function (b) {
      if (!b || !b.t) return false;
      if (b.t === 'footer' && b.v !== false) {
        footerSeen += 1;
        if (footerSeen > 1) return false;
      }
      if (singleton[b.t] && b.v !== false) {
        if (seen[b.t]) return false;
        seen[b.t] = true;
      }
      return true;
    });

    try {
      return JSON.parse(JSON.stringify(tpl));
    } catch (_) {
      return tpl;
    }
  }

  function ensureFacturaBlocks(tpl) {
    if (!tpl || !Array.isArray(tpl.blocks)) return tpl;
    if (tpl.docType && tpl.docType !== 'factura') return tpl;
    tpl = dedupeFacturaBlocks(tpl);
    var have = {};
    tpl.blocks.forEach(function (b) {
      if (b && b.v !== false) have[b.t] = true;
    });
    var inserts = [];
    if (!have.company && !have.razon) inserts.push({ t: 'razon', c: '', v: true, o: 0, a: 'center', fs: 'xs' });
    if (!have.tel) inserts.push({ t: 'tel', c: '', v: true, o: 0, a: 'center', fs: 'xs' });
    if (!have.ciudad) inserts.push({ t: 'ciudad', c: '', v: true, o: 0, a: 'center', fs: 'xs' });
    if (!have.regimen) inserts.push({ t: 'regimen', c: '', v: true, o: 0, a: 'center', fs: 'xs' });
    if (!have.num_fe && !have.consec) inserts.push({ t: 'num_fe', c: '', v: true, o: 0, a: 'center', fs: 'sm', fw: true });
    if (!have.resol_full && !have.resol) inserts.push({ t: 'resol_full', c: '', v: true, o: 0, a: 'center', fs: 'xs' });
    if (!have.iva_disc) inserts.push({ t: 'iva_disc', c: '', v: true, o: 0, a: 'left', fs: 'xs' });
    if (!have.legal_co) inserts.push({ t: 'legal_co', c: '', v: true, o: 0, a: 'center', fs: 'xs' });
    if (!inserts.length) return dedupeFacturaBlocks(tpl);
    var cutO = 9999;
    var anchor = 14;
    tpl.blocks.forEach(function (b) {
      if (b.t === 'cut' && typeof b.o === 'number') cutO = Math.min(cutO, b.o);
      if (b.t === 'cufe' || b.t === 'qr') anchor = Math.max(anchor, b.o || 0);
    });
    var start = cutO < 9999 ? cutO - inserts.length - 1 : anchor + 1;
    if (start < 1) start = 14;
    inserts.forEach(function (blk, i) {
      blk.o = start + i;
      tpl.blocks.push(blk);
    });
    return dedupeFacturaBlocks(tpl);
  }

  function blocksFacturaColombiaBase() {
    return [
      { t: 'logo', c: '', v: true, o: 1, a: 'center', fs: 'md', fw: true },
      { t: 'company', c: '', v: true, o: 2, a: 'center', fs: 'sm', fw: true },
      { t: 'nit', c: '', v: true, o: 3, a: 'center', fs: 'xs' },
      { t: 'address', c: '', v: true, o: 4, a: 'center', fs: 'xs' },
      { t: 'tel', c: '', v: true, o: 5, a: 'center', fs: 'xs' },
      { t: 'ciudad', c: '', v: true, o: 6, a: 'center', fs: 'xs' },
      { t: 'regimen', c: '', v: true, o: 7, a: 'center', fs: 'xs' },
      { t: 'divider', c: '4', v: true, o: 8 },
      { t: 'title', c: 'FACTURA ELECTRÓNICA DE VENTA', v: true, o: 9, a: 'center', fs: 'lg', fw: true },
      { t: 'num_fe', c: '', v: true, o: 10, a: 'center', fs: 'sm', fw: true },
      { t: 'date', c: '', v: true, o: 11, a: 'center', fs: 'xs' },
      { t: 'resol_full', c: '', v: true, o: 12, a: 'center', fs: 'xs' },
      { t: 'divider', c: '3', v: true, o: 13 },
      { t: 'client', c: '', v: true, o: 14, a: 'left', fs: 'sm' },
      { t: 'items', c: '', v: true, o: 15, a: 'left', fs: 'sm' },
      { t: 'iva_disc', c: '', v: true, o: 16, a: 'left', fs: 'xs' },
      { t: 'total', c: 'TOTAL A PAGAR', v: true, o: 17, a: 'left', fs: 'md', fw: true },
      { t: 'payment', c: '', v: true, o: 18, a: 'left', fs: 'sm' },
      { t: 'cufe', c: '', v: true, o: 19, a: 'left', fs: 'xs' },
      { t: 'qr', c: '', v: true, o: 20, a: 'center', fs: 'sm' },
      { t: 'legal_co', c: '', v: true, o: 21, a: 'center', fs: 'xs' },
      { t: 'footer', c: 'Gracias por su compra', v: true, o: 22, a: 'center', fs: 'xs' },
    ];
  }

  global.CrozzoTermicaColombia = {
    legalPayload: legalPayload,
    ensureFacturaBlocks: ensureFacturaBlocks,
    dedupeFacturaBlocks: dedupeFacturaBlocks,
    namesEqual: namesEqual,
    blocksFacturaColombiaBase: blocksFacturaColombiaBase,
    fmtNit: fmtNit,
    resolTexto: resolTexto,
    numFactura: numFactura,
  };
  global.crozzoTermicaLegalPayloadColombia = legalPayload;
})(typeof window !== 'undefined' ? window : global);
