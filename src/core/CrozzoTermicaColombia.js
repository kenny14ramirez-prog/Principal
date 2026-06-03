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

  /** Config de impuestos normalizada (perfil restaurante / comercio / mixto). */
  function getImpuestosCfg() {
    var raw = typeof global.config !== 'undefined' && global.config.getImpuestos ? global.config.getImpuestos() : {};
    if (typeof global.crozzoImpuestosNormalize === 'function') return global.crozzoImpuestosNormalize(raw);
    return raw || {};
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

  function cliTipoDoc(nit, opts) {
    opts = opts || {};
    var feCtx = !!opts.feContext;
    var s = String(nit || '').trim();
    if (!s || s === '222222222-2' || s === '222222222222') {
      return feCtx ? 'Consumidor final' : 'Cliente';
    }
    if (/^\d{9,12}-?\d?$/i.test(s.replace(/\./g, ''))) return 'NIT';
    return 'Documento';
  }

  function cliNombreMostrar(factura, esFe) {
    var n = String((factura && (factura.compradorNombre || factura.cliNom)) || '').trim();
    if (!n) return esFe ? 'Consumidor final' : 'Cliente';
    if (!esFe && (n === 'Consumidor Final' || n === 'Consumidor final')) return 'Cliente';
    return n;
  }

  function docKindFromFactura(factura) {
    var st = String((factura && factura.estado) || '').toLowerCase();
    if (st === 'precuenta') return perfilEmisionActivo(factura) === 'fe' ? 'precuenta_fe' : 'precuenta_cuenta';
    if (st === 'pos' || (factura && factura.tipoComprobante === 'pos')) return 'pos_cerrado';
    if (
      st === 'borrador_fe' ||
      st === 'timbrada' ||
      st === 'demo' ||
      (factura && factura.tipoComprobante === 'electronica')
    ) {
      return 'fe_cerrada';
    }
    return '';
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

  function negocioFeHabilitada() {
    return (
      typeof global.config !== 'undefined' &&
      typeof global.config.isElectronicMode === 'function' &&
      global.config.isElectronicMode()
    );
  }

  /** Perfil de comprobante según modo operación: POS (simple/demo pos) vs FE (electrónica/demo fe). */
  function perfilEmisionActivo(factura) {
    factura = factura || {};
    if (factura.perfilEmision === 'fe' || factura.perfilEmision === 'pos') return factura.perfilEmision;
    var cfg = typeof global.config !== 'undefined' ? global.config : null;
    if (!cfg) return 'pos';
    if (typeof cfg.isElectronicMode === 'function' && cfg.isElectronicMode()) return 'fe';
    if (typeof cfg.isDemoFePrueba === 'function' && cfg.isDemoFePrueba()) return 'fe';
    return 'pos';
  }

  function esPrecuentaPerfilFe(factura) {
    factura = factura || {};
    var st = String(factura.estado || '').toLowerCase();
    return st === 'precuenta' && perfilEmisionActivo(factura) === 'fe';
  }

  function cufeValidoParaFe(cufe) {
    var c = String(cufe || '').trim();
    if (!c || c === 'NO-APLICA-POS' || /^pendiente/i.test(c)) return false;
    return true;
  }

  /** Solo comprobantes FE reales con modo electrónico activo en el negocio. */
  function esDocumentoFe(factura) {
    factura = factura || {};
    if (!negocioFeHabilitada()) return false;
    var st = String(factura.estado || '').toLowerCase();
    if (st === 'timbrada') return cufeValidoParaFe(factura.cufe) || !!factura.qrUrl;
    if (st === 'demo' && typeof global.config.isDemoMode === 'function' && global.config.isDemoMode()) {
      return cufeValidoParaFe(factura.cufe) || !!factura.qrUrl;
    }
    return false;
  }

  function tituloLegal(estado, tipoComprobante, factura) {
    factura = factura || {};
    var st = String(estado || '').toLowerCase();
    if (st === 'precuenta') {
      return esPrecuentaPerfilFe(factura)
        ? 'PRECUENTA — FE AL COBRAR'
        : 'PRECUENTA — DOCUMENTO POS';
    }
    if (st === 'demo') return 'FACTURA DEMO (NO VÁLIDA)';
    if ((st === 'pos' || tipoComprobante === 'pos') && typeof global.config !== 'undefined' && global.config.isDemoMode && global.config.isDemoMode()) {
      return 'COMPROBANTE DEMO POS';
    }
    if (st === 'pos' || tipoComprobante === 'pos') return 'DOCUMENTO SOPORTE POS';
    if (
      st === 'borrador_fe' ||
      tipoComprobante === 'electronica' ||
      (st === 'timbrada' && negocioFeHabilitada())
    ) {
      return 'FACTURA ELECTRÓNICA DE VENTA';
    }
    if (st === 'timbrada') return 'COMPROBANTE DE VENTA';
    return 'COMPROBANTE DE VENTA';
  }

  function pieLegalPrecuentaPosLineas() {
    return [
      { k: 'head', t: 'INFORMACIÓN LEGAL — DOCUMENTO POS' },
      { k: 'p', t: 'Precuenta informativa de caja. Sin validez fiscal ante la DIAN.' },
      { k: 'p', t: 'No es factura electrónica ni documento equivalente (art. 617 E.T.).' },
      { k: 'p', t: 'No genera derecho a deducción ni a IVA descontable.' },
      { k: 'p', t: 'Revise consumos y totales antes de pagar.' },
    ];
  }

  /** Pie precuenta FE: adquirente y resolución van en bloques client/resol_full, no aquí. */
  function pieLegalPrecuentaFeLineas() {
    return [
      { k: 'head', t: 'INFORMACIÓN LEGAL — FACTURA ELECTRÓNICA' },
      {
        k: 'p',
        t: 'Al pagar se emitirá Factura Electrónica de Venta ante la DIAN (Res. 000165/2023).',
      },
      { k: 'p', t: 'Verifique CUFE y código QR en la factura electrónica al cerrar la venta.' },
      { k: 'p', t: 'Revise consumos y totales antes de pagar.' },
    ];
  }

  /** @deprecated alias — precuenta POS */
  function pieLegalPrecuentaLineas() {
    return pieLegalPrecuentaPosLineas();
  }

  function propinaLeyendaTicketCorta() {
    return 'Propina voluntaria (Ley 789/2002): sugerida, no obligatoria. No integra la base gravable.';
  }

  function leyendaPropinaResuelta(factura) {
    factura = factura || {};
    var custom = String(factura.propinaLeyenda || '').trim();
    if (custom) return custom;
    try {
      var fa =
        typeof global.getFacturacionAdminConfig === 'function' ? global.getFacturacionAdminConfig() : {};
      var pr = fa && fa.propinaRestaurante ? fa.propinaRestaurante : {};
      var cfg = String((pr && pr.leyendaVoluntaria) || '').trim();
      if (cfg) return cfg;
    } catch (_) {}
    return propinaLeyendaTicketCorta();
  }

  function propinaRestauranteActiva() {
    try {
      var fa =
        typeof global.getFacturacionAdminConfig === 'function' ? global.getFacturacionAdminConfig() : {};
      var pr = fa && fa.propinaRestaurante ? fa.propinaRestaurante : {};
      return pr.mostrarEnPrecuenta !== false;
    } catch (_) {
      return true;
    }
  }

  /** Contexto operación: demo / simple / electronic y subtipo demo pos|fe. */
  function operacionContexto(factura) {
    factura = factura || {};
    var cfg = typeof global.config !== 'undefined' ? global.config : {};
    var isDemo = typeof cfg.isDemoMode === 'function' ? cfg.isDemoMode() : false;
    var modo = typeof cfg.getOperacionModo === 'function' ? cfg.getOperacionModo() : 'simple';
    var demoSub = 'pos';
    try {
      if (typeof cfg.getDemoSubmodo === 'function') demoSub = cfg.getDemoSubmodo();
      else demoSub = String((cfg.config && cfg.config.demoSubmodo) || 'pos').toLowerCase();
    } catch (_) {}
    if (demoSub !== 'fe') demoSub = 'pos';
    var st = String(factura.estado || '').toLowerCase();
    var tipo = String(factura.tipoComprobante || '').toLowerCase();
    var esPrecuenta = st === 'precuenta';
    var esPos = st === 'pos' || tipo === 'pos';
    var esFeDoc = esDocumentoFe(factura);
    var esDemoFe =
      isDemo &&
      (st === 'demo' || !!factura.is_demo || (demoSub === 'fe' && (tipo === 'electronica' || st === 'timbrada')));
    return {
      isDemo: isDemo,
      modo: modo,
      demoSubmodo: demoSub,
      esPrecuenta: esPrecuenta,
      esPos: esPos,
      esPosCerrado: esPos && !esPrecuenta,
      esDemoPos: isDemo && esPos && !esDemoFe,
      esDemoFe: esDemoFe,
      esRealPos: !isDemo && modo === 'simple' && esPos,
      esRealFe: !isDemo && modo === 'electronic' && esFeDoc,
      esFe: esFeDoc,
    };
  }

  function lineaDemoSi(ctx) {
    if (!ctx || !ctx.isDemo) return null;
    if (ctx.esDemoFe) {
      return 'DOCUMENTO DEMO — Simulación de factura electrónica. Sin validez ante la DIAN.';
    }
    return 'DOCUMENTO DEMO — Simulación de venta POS. Sin validez fiscal.';
  }

  function avisoPrecuentaCaja(factura) {
    if (esPrecuentaPerfilFe(factura)) {
      return {
        titulo: 'NO ES FACTURA ELECTRÓNICA',
        linea: 'Al pagar solicite la factura electrónica validada en caja',
      };
    }
    return {
      titulo: 'NO ES FACTURA',
      linea: 'Solicite cuenta o comprobante POS en caja',
    };
  }

  function pieLegalPrecuenta() {
    return pieLegalPrecuentaLineas()
      .filter(function (ln) {
        return ln.k === 'p';
      })
      .map(function (ln) {
        return ln.t;
      })
      .join(' ');
  }

  function pieLegal(estado, tipoComprobante) {
    var st = String(estado || '').toLowerCase();
    if (st === 'precuenta') return pieLegalPrecuenta();
    if (st === 'demo') return 'Documento de prueba. Sin validez ante la DIAN.';
    if (st === 'pos' || tipoComprobante === 'pos') {
      return pieLegalVentaPosLineas({}, operacionContexto({ estado: 'pos', tipoComprobante: 'pos' }), {})
        .filter(function (ln) {
          return ln.k === 'p';
        })
        .map(function (ln) {
          return ln.t;
        })
        .join(' ');
    }
    return 'Representación impresa de Factura Electrónica de Venta (Res. DIAN 000165/2023). Verifique CUFE y QR en el portal DIAN.';
  }

  /** Pie legal estructurado para comprobante de venta / ticket POS (no precuenta). */
  function pieLegalVentaPosLineas(imp, ctx, factura) {
    imp = imp || {};
    ctx = ctx || {};
    factura = factura || {};
    var lineas = [{ k: 'head', t: 'INFORMACIÓN LEGAL' }];
    var demo = lineaDemoSi(ctx);
    if (demo) lineas.push({ k: 'p', t: demo });
    if (ctx.esRealPos || ctx.esDemoPos || (!ctx.esFe && !negocioFeHabilitada())) {
      lineas.push({
        k: 'p',
        t: 'No es factura electrónica de venta ante la DIAN (art. 617 E.T.).',
      });
    } else if (negocioFeHabilitada()) {
      lineas.push({
        k: 'p',
        t: 'Si el vendedor está obligado a FE, debe entregar factura electrónica validada por la DIAN.',
      });
    }
    if (impuestoCuentaMeta(imp).consumoAplica) {
      lineas.push({
        k: 'p',
        t: 'Impuesto al consumo discriminado según tarifa del establecimiento.',
      });
    } else if (imp.responsableIVA !== false) {
      lineas.push({ k: 'p', t: 'IVA discriminado según tarifa aplicable.' });
    }
    if (propinaRestauranteActiva() && !ctx.esPrecuenta) {
      lineas.push({ k: 'p', t: leyendaPropinaResuelta(factura) });
    }
    return lineas;
  }

  /** Pie FE timbrada: resolución, CUFE y QR van en bloques dedicados. */
  function pieLegalFeLineas(factura, ctx, imp) {
    factura = factura || {};
    ctx = ctx || {};
    imp =
      imp ||
      getImpuestosCfg();
    var lineas = [{ k: 'head', t: 'INFORMACIÓN LEGAL — FACTURA ELECTRÓNICA' }];
    var demo = lineaDemoSi(ctx);
    if (demo) lineas.push({ k: 'p', t: demo });
    lineas.push({
      k: 'p',
      t: 'Representación impresa de Factura Electrónica de Venta (Res. DIAN 000165/2023).',
    });
    lineas.push({
      k: 'p',
      t: 'Verifique CUFE y código QR en el portal DIAN o en la app Mi Factura.',
    });
    if (impuestoCuentaMeta(imp).consumoAplica) {
      lineas.push({
        k: 'p',
        t: 'Impuesto al consumo discriminado según tarifa del establecimiento.',
      });
    } else if (imp.responsableIVA !== false) {
      lineas.push({ k: 'p', t: 'IVA discriminado según tarifa aplicable.' });
    }
    if (propinaRestauranteActiva()) {
      lineas.push({ k: 'p', t: leyendaPropinaResuelta(factura) });
    }
    return lineas;
  }

  function compactLegalTicketLineas(lineas) {
    lineas = lineas || [];
    var seen = {};
    var out = [];
    lineas.forEach(function (ln) {
      if (!ln || !ln.t) return;
      if (ln.k === 'head') {
        out.push(ln);
        return;
      }
      var key = String(ln.t).trim().toLowerCase();
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(ln);
    });
    return out;
  }

  function resolveLegalTicketLineas(factura, imp, ctx, dian, esFe) {
    factura = factura || {};
    ctx = ctx || operacionContexto(factura);
    var st = String(factura.estado || '').toLowerCase();
    var tipo = factura.tipoComprobante || '';
    if (ctx.esPrecuenta || st === 'precuenta') {
      return esPrecuentaPerfilFe(factura) ? pieLegalPrecuentaFeLineas() : pieLegalPrecuentaPosLineas();
    }
    if (ctx.esFe || st === 'demo' || st === 'timbrada' || st === 'borrador_fe') {
      return pieLegalFeLineas(factura, ctx, imp);
    }
    if (ctx.esPos || st === 'pos' || tipo === 'pos') return pieLegalVentaPosLineas(imp, ctx, factura);
    return [];
  }

  /** Líneas legales para ticket (precuenta, POS cerrado o payload ya armado). */
  function legalTicketLineasForData(data, tpl) {
    data = data || {};
    if (data.legalTicketLineas && data.legalTicketLineas.length) return data.legalTicketLineas;
    if (data.legalPrecuentaLineas && data.legalPrecuentaLineas.length) return data.legalPrecuentaLineas;
    if (data.legalVentaLineas && data.legalVentaLineas.length) return data.legalVentaLineas;
    if (isCuentaPrecuentaTicket(data, tpl)) return pieLegalPrecuentaLineas();
    if (data.docKind === 'pos_cerrado') {
      var impPos =
        getImpuestosCfg();
      return pieLegalVentaPosLineas(impPos, operacionContexto({ estado: 'pos', tipoComprobante: 'pos' }), {});
    }
    if (data.docKind === 'fe_cerrada') {
      var impFe =
        getImpuestosCfg();
      return pieLegalFeLineas({}, operacionContexto({ estado: 'timbrada', tipoComprobante: 'electronica' }), impFe);
    }
    return [];
  }

  /** Leyenda propina en bloque propina_sugerida: precuenta y venta FE/POS cerrada. */
  function muestraLeyendaPropinaTicket(data, tpl) {
    if (isCuentaPrecuentaTicket(data, tpl)) return propinaRestauranteActiva();
    if (data && (data.docKind === 'fe_cerrada' || data.docKind === 'pos_cerrado') && propinaRestauranteActiva()) {
      return true;
    }
    if (data && data.propinaLeyendaEnBloquePropina) return true;
    return false;
  }

  /** Montos de propina fuera del total: precuenta (en total) o POS sin fila en total. */
  function muestraMontosPropinaBloque(data) {
    data = data || {};
    if (data.docKind === 'precuenta_cuenta' || data.docKind === 'precuenta_fe') return false;
    if (data.propinaEnTotales) return false;
    return Number(data.propinaSugerida || 0) > 0 || Number(data.propina || data.propinaVoluntaria || 0) > 0;
  }

  function ivaPctLabel(imp) {
    imp = imp || {};
    var pct = 19;
    var tarifas = imp.tarifasIVA;
    if (Array.isArray(tarifas)) {
      var act = tarifas.find(function (t) {
        return t && t.activo !== false && Number(t.rate) > 0;
      });
      if (act) pct = Math.round(Number(act.rate) * 1000) / 10;
    }
    return pct;
  }

  /** Misma normalización que caja (CrozzoPosMain.crozzoImpuestosNormalize). */
  function normalizeImpCfg(imp) {
    if (typeof global.crozzoImpuestosNormalize === 'function') {
      return global.crozzoImpuestosNormalize(imp);
    }
    return imp || {};
  }

  function consumoPctLabel(imp) {
    imp = normalizeImpCfg(imp);
    var ic = imp.impuestoAlConsumo || {};
    var perfil = String(imp.perfilFiscal || 'comercio').toLowerCase();
    var tarifa = Number(ic.tarifa) || 0;
    var activo =
      !!ic.aplica ||
      perfil === 'restaurante' ||
      (perfil === 'mixto' && ic.aplica !== false && tarifa > 0);
    if (!activo) return 0;
    return Math.round((tarifa > 0 ? tarifa : 0.08) * 1000) / 10;
  }

  /** Restaurante (INC) vs comercio (IVA) — misma lógica que crozzoImpuestosCajaOpciones. */
  function impuestoCuentaMeta(imp) {
    imp = normalizeImpCfg(imp);
    var perfil = String(imp.perfilFiscal || 'comercio').toLowerCase();
    var ic = imp.impuestoAlConsumo || {};
    var tarifaRaw = Number(ic.tarifa) || 0;
    var consumoTarifa =
      ic.aplica || (perfil === 'restaurante' && tarifaRaw > 0) || (perfil === 'mixto' && ic.aplica !== false && tarifaRaw > 0)
        ? tarifaRaw || 0.08
        : 0;
    if (perfil === 'restaurante' && consumoTarifa <= 0) consumoTarifa = 0.08;
    var consumoAplica =
      !!ic.aplica ||
      (perfil === 'restaurante' && consumoTarifa > 0) ||
      (perfil === 'mixto' && ic.aplica !== false && consumoTarifa > 0);
    if (consumoAplica) {
      var cp = consumoPctLabel(imp);
      return { tipo: 'consumo', pct: cp, consumoAplica: true, impuestoPct: cp };
    }
    var ip = ivaPctLabel(imp);
    return { tipo: 'iva', pct: ip, consumoAplica: false, impuestoPct: ip };
  }

  /** Etiquetas de cuenta/precuenta según perfil fiscal (Colombia). */
  function cuentaEtiquetasFiscales(imp, incl) {
    imp = normalizeImpCfg(imp);
    var meta = impuestoCuentaMeta(imp);
    var inc = !!incl;
    return {
      gravado: 'Base gravable',
      impuesto:
        meta.tipo === 'consumo' ? 'Impuesto al consumo ' + meta.pct + '%' : 'IVA ' + meta.pct + '%',
      subtotal: inc ? 'Total' : 'Subtotal',
    };
  }

  function impuestoLineaLabel(data) {
    data = data || {};
    var incl =
      typeof data.ivaIncluidoEnPrecios === 'boolean'
        ? data.ivaIncluidoEnPrecios
        : !!getImpuestosCfg().ivaIncluidoEnPrecios;
    return cuentaEtiquetasFiscales(getImpuestosCfg(), incl).impuesto;
  }

  /** Reaplica etiquetas INC/IVA desde config actual (impresión precuenta/POS/FE). */
  function refreshFiscalLabelsOnPayload(data) {
    data = data || {};
    var imp = getImpuestosCfg();
    var incl =
      typeof data.ivaIncluidoEnPrecios === 'boolean' ? data.ivaIncluidoEnPrecios : !!imp.ivaIncluidoEnPrecios;
    var meta = impuestoCuentaMeta(imp);
    var lab = cuentaEtiquetasFiscales(imp, incl);
    var sub = Number(data.sub != null ? data.sub : data.subtotal) || 0;
    var tax = Number(data.iva) || 0;
    data.consumoAplica = meta.consumoAplica;
    data.consumoPct = meta.consumoAplica ? meta.pct : 0;
    data.impuestoTipo = meta.tipo;
    data.impuestoPct = meta.impuestoPct;
    data.etiquetaGravado = lab.gravado;
    data.etiquetaImpuesto = lab.impuesto;
    data.etiquetaSubtotal = lab.subtotal;
    data.impuestoConsumoE = impuestoConsumoLabel(imp);
    data.perfilFiscal = imp.perfilFiscal || '';
    data.ivaDisc = ivaDiscriminacion(sub, tax, imp);
    return data;
  }

  function ivaDiscriminacion(sub, iva, imp) {
    imp = imp || {};
    var base = Number(sub) || 0;
    var tax = Number(iva) || 0;
    var meta = impuestoCuentaMeta(imp);
    var lab = cuentaEtiquetasFiscales(imp, imp.ivaIncluidoEnPrecios);
    return lab.gravado + ' ' + fmtCop(base) + ' · ' + lab.impuesto + ' ' + fmtCop(tax);
  }

  function impuestoConsumoLabel(imp) {
    imp = imp || {};
    var meta = impuestoCuentaMeta(imp);
    if (!meta.consumoAplica) return '';
    return 'Impuesto al consumo ' + meta.pct + '% (restaurantes y bares)';
  }

  function impuestoEncabezadoEmpresa(imp) {
    imp = imp || {};
    if (impuestoCuentaMeta(imp).consumoAplica) {
      return impuestoConsumoLabel(imp);
    }
    if (imp.responsableIVA !== false) {
      return 'IVA · tarifas según producto o general ' + ivaPctLabel(imp) + '%';
    }
    return '';
  }

  function isCuentaClienteDoc(factura, tpl) {
    if (tpl && tpl.docType === 'precuenta') return true;
    var e = String((factura && factura.estado) || '').toLowerCase();
    if (e === 'precuenta' || e === 'pos' || e === 'borrador_fe' || e === 'timbrada' || e === 'demo') return true;
    if (factura && (factura.tipoComprobante === 'pos' || factura.tipoComprobante === 'electronica')) return true;
    return false;
  }

  /**
   * Base para calcular propina: siempre el gravado (neto sin impuesto).
   * - Impuesto aparte: gravado = sub, propina sobre sub (ej. 100 + IVA → 10% de 100).
   * - Impuesto en precio (informativo): gravado = sub (= total − impuesto), no sobre el bruto.
   */
  function impuestoIncluidoEnPreciosFlag(tx) {
    tx = tx || {};
    if (typeof tx.ivaIncluidoEnPrecios === 'boolean') return tx.ivaIncluidoEnPrecios;
    try {
      var imp =
        getImpuestosCfg();
      return !!imp.ivaIncluidoEnPrecios;
    } catch (_) {
      return false;
    }
  }

  /**
   * Base gravable para propina.
   * - Impuesto INCLUIDO en precio de carta: base = total de cuenta − impuestos (ej. 53.000 − 3.926 = 49.074).
   * - Impuesto APARTE (se suma al subtotal): base = subtotal gravable antes del impuesto.
   */
  function propinaBaseGravada(tx) {
    tx = tx || {};
    var incl = impuestoIncluidoEnPreciosFlag(tx);
    var sub = Math.round(Number(tx.subtotal != null ? tx.subtotal : tx.sub) || 0);
    var impuesto = Math.round(Number(tx.iva != null ? tx.iva : tx.impuesto) || 0);
    var tot = Math.round(Number(tx.total) || 0);
    if (incl) {
      if (tot > 0 && impuesto > 0) return Math.max(0, tot - impuesto);
      return Math.max(0, sub);
    }
    return Math.max(0, sub);
  }

  function calcularPropinaSugeridaMonto(baseGravada, pct) {
    var base = Math.max(0, Number(baseGravada) || 0);
    var p = Math.max(0, Math.min(30, Number(pct) || 0));
    return Math.round(base * (p / 100));
  }

  /** Precuenta abierta: aviso caja, pie legal precuenta, plantilla precuenta. */
  function isCuentaPrecuentaTicket(data, tpl) {
    if (tpl && tpl.docType === 'precuenta') return true;
    if (data && (data.docKind === 'precuenta_cuenta' || data.docKind === 'precuenta_fe')) return true;
    return false;
  }

  /** Desglose gravado/impuesto/propina: precuenta y venta POS cerrada. */
  function isCuentaTotalesTicket(data, tpl) {
    if (isCuentaPrecuentaTicket(data, tpl)) return true;
    if (data && (data.docKind === 'pos_cerrado' || data.docKind === 'fe_cerrada')) return true;
    return false;
  }

  /**
   * Filas de totales: Gravado → Impuesto → Subtotal → Propina → Total a pagar.
   * @returns {{ rows: Array<{label:string,amount:number,muted?:boolean}>, totalLabel: string, totalAmount: number }}
   */
  function cuentaPrecuentaFilasTotales(data) {
    data = data || {};
    var incl = !!data.ivaIncluidoEnPrecios;
    var sub = Number(data.sub) || 0;
    var iva = Number(data.iva) || 0;
    var tot = Number(data.tot) || 0;
    var gravado =
      Number(data.propinaBaseGravada) > 0
        ? Number(data.propinaBaseGravada)
        : propinaBaseGravada({
            subtotal: sub,
            sub: sub,
            iva: iva,
            total: tot,
            ivaIncluidoEnPrecios: !!data.ivaIncluidoEnPrecios,
          });
    var propVol = Number(data.propinaVoluntaria || data.propina || 0);
    var propSug = Number(data.propinaSugerida || 0);
    var propina = propVol > 0 ? propVol : propSug;
    var totPagar = Number(data.totalConPropina) || tot + (propina > 0 ? propina : 0);
    var lab = cuentaEtiquetasFiscales(getImpuestosCfg(), incl);
    var muestraImpuesto =
      iva > 0 || !!data.consumoAplica || data.impuestoTipo === 'consumo' || data.impuestoTipo === 'iva';
    var rows = [];
    rows.push({ label: lab.gravado, amount: gravado, muted: false });
    if (muestraImpuesto) {
      rows.push({
        label: lab.impuesto || impuestoLineaLabel(data),
        amount: iva,
        muted: false,
      });
    }
    rows.push({ label: lab.subtotal, amount: tot, muted: false });
    if (propina > 0) {
      var pctP = data.propinaPctSugerido || 0;
      var lblProp = propVol > 0 ? 'Propina voluntaria' : 'Propina sugerida (' + pctP + '%)';
      rows.push({
        label: lblProp,
        amount: propina,
        muted: false,
      });
    }
    var esPosCerrado = data.docKind === 'pos_cerrado';
    var esFeCerrada = data.docKind === 'fe_cerrada';
    return {
      rows: rows,
      totalLabel: esPosCerrado || esFeCerrada ? 'TOTAL' : 'TOTAL A PAGAR',
      totalAmount: totPagar,
    };
  }

  /** Totales unificados para precuenta / cuenta POS (propina sumada al total a pagar). */
  function cuentaTicketTotals(factura) {
    factura = factura || {};
    var imp = getImpuestosCfg();
    var incl = !!imp.ivaIncluidoEnPrecios;
    var sub = Number(factura.subtotal || 0);
    var iva = Number(factura.iva || 0);
    var tot = Number(factura.total || 0);
    if (factura.items && typeof global.computeTotals === 'function') {
      try {
        var tx = global.computeTotals(factura.items);
        sub = tx.subtotal;
        iva = tx.iva;
        tot = tx.total;
        incl = !!tx.ivaIncluidoEnPrecios;
      } catch (_) {}
    }
    var propinaVol = Number(
      (factura.paymentMeta && factura.paymentMeta.propina) || factura.propinaVoluntaria || 0
    );
    var propinaPct = Number(factura.propinaPctSugerido || 0);
    var baseProp = propinaBaseGravada({ subtotal: sub, sub: sub, iva: iva, total: tot, ivaIncluidoEnPrecios: incl });
    var propinaSug = propinaVol > 0 ? 0 : calcularPropinaSugeridaMonto(baseProp, propinaPct);
    if (!propinaVol && !propinaPct && Number(factura.propinaSugerida || 0) > 0) {
      propinaSug = Number(factura.propinaSugerida);
    }
    var propina = propinaVol > 0 ? propinaVol : propinaSug;
    var esPosCerrado =
      String(factura.estado || '').toLowerCase() === 'pos' || factura.tipoComprobante === 'pos';
    var esFeCerrada =
      String(factura.estado || '').toLowerCase() === 'timbrada' ||
      String(factura.estado || '').toLowerCase() === 'demo' ||
      String(factura.estado || '').toLowerCase() === 'borrador_fe' ||
      factura.tipoComprobante === 'electronica';
    if (esPosCerrado || esFeCerrada) {
      propinaSug = 0;
      propina = propinaVol > 0 ? propinaVol : 0;
    }
    var totalPagar = tot + (propina > 0 ? propina : 0);
    var impMeta = impuestoCuentaMeta(imp);
    var labT = cuentaEtiquetasFiscales(imp, incl);
    return {
      ivaIncluidoEnPrecios: incl,
      ivaPct: ivaPctLabel(imp),
      consumoAplica: impMeta.consumoAplica,
      consumoPct: impMeta.consumoAplica ? impMeta.pct : 0,
      impuestoTipo: impMeta.tipo,
      impuestoPct: impMeta.impuestoPct,
      etiquetaGravado: labT.gravado,
      etiquetaImpuesto: labT.impuesto,
      etiquetaSubtotal: labT.subtotal,
      perfilFiscal: imp.perfilFiscal || '',
      sub: sub,
      iva: iva,
      tot: tot,
      propinaVoluntaria: propinaVol,
      propinaSugerida: propinaSug,
      propinaPctSugerido: propinaPct,
      propinaMonto: propina,
      propinaBaseGravada: baseProp,
      totalConPropina: totalPagar,
      impuestoConsumoE: impuestoConsumoLabel(imp),
      docKind: docKindFromFactura(factura),
    };
  }

  function legalPayload(factura) {
    factura = factura || {};
    var emp =
      typeof global.config !== 'undefined' && global.config.getEmpresa ? global.config.getEmpresa() : {};
    var dian = typeof global.config !== 'undefined' && global.config.getDian ? global.config.getDian() : {};
    var imp = getImpuestosCfg();
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
    var propinaVol = Number((factura.paymentMeta && factura.paymentMeta.propina) || factura.propinaVoluntaria || 0);
    var propinaSug = Number(factura.propinaSugerida || 0);
    var propinaPct = Number(factura.propinaPctSugerido || 0);
    var tot = Number(factura.total || 0) || sub + iva;
    var totConPropina = tot + (propinaVol > 0 ? propinaVol : propinaSug > 0 ? propinaSug : 0);
    var cuentaTx =
      isCuentaClienteDoc(factura, null) && typeof cuentaTicketTotals === 'function'
        ? cuentaTicketTotals(factura)
        : null;
    if (cuentaTx) {
      sub = cuentaTx.sub;
      iva = cuentaTx.iva;
      tot = cuentaTx.tot;
      totConPropina = cuentaTx.totalConPropina;
      propinaVol = cuentaTx.propinaVoluntaria;
      propinaSug = cuentaTx.propinaSugerida;
    }
    var esFe = esDocumentoFe(factura);
    var ctx = operacionContexto(factura);
    var perfilEm = perfilEmisionActivo(factura);
    var precuentaFe = ctx.esPrecuenta && perfilEm === 'fe';
    var feCtxCli = esFe || precuentaFe;
    var ticketLineas = compactLegalTicketLineas(resolveLegalTicketLineas(factura, imp, ctx, dian, esFe));
    var propinaEnTot =
      !!(cuentaTx && Number(cuentaTx.propinaMonto || 0) > 0) ||
      propinaVol > 0 ||
      (String(estado || '').toLowerCase() === 'precuenta' && propinaSug > 0);
    var docKindOut = cuentaTx ? cuentaTx.docKind : docKindFromFactura(factura);
    var impAct = getImpuestosCfg();
    var inclAct = cuentaTx ? cuentaTx.ivaIncluidoEnPrecios : !!impAct.ivaIncluidoEnPrecios;
    var metaAct = impuestoCuentaMeta(impAct);
    var labAct = cuentaEtiquetasFiscales(impAct, inclAct);
    var out = {
      head: tituloLegal(estado, tipo, factura),
      esDocumentoFe: esFe,
      perfilEmision: perfilEm,
      operacionCtx: ctx,
      razonE: emp.razonSocial || emp.nombreComercial || '',
      nitE: fmtNit(emp.nit, emp.dv),
      dirE: String(emp.direccion || '').trim(),
      regimenE: REGIMEN_LABELS[emp.regimenFiscal] || REGIMEN_LABELS.responsable_iva,
      impuestoConsumoE: impuestoConsumoLabel(impAct),
      ciudadE: ciudad,
      emailE: emp.email || '',
      ivaIncluidoEnPrecios: inclAct,
      ivaPct: cuentaTx ? cuentaTx.ivaPct : ivaPctLabel(impAct),
      consumoAplica: metaAct.consumoAplica,
      consumoPct: metaAct.consumoAplica ? metaAct.pct : 0,
      impuestoTipo: metaAct.tipo,
      impuestoPct: metaAct.impuestoPct,
      etiquetaGravado: labAct.gravado,
      etiquetaImpuesto: labAct.impuesto,
      etiquetaSubtotal: labAct.subtotal,
      perfilFiscal: impAct.perfilFiscal || '',
      docKind: docKindOut,
      propinaMonto: cuentaTx ? cuentaTx.propinaMonto : propinaVol > 0 ? propinaVol : propinaSug,
      numFe: esFe
        ? numFactura(dian, factura.consecutivo)
        : precuentaFe
          ? 'PENDIENTE AL COBRAR'
          : String(factura.consecutivo || '—'),
      resolFull: esFe || precuentaFe ? resolTexto(dian) : '',
      resol: esFe || precuentaFe ? dian.resolucion || '—' : '',
      fechaHora: fmtFechaHora(factura),
      cliTipo: cliTipoDoc(factura.compradorNit || factura.cliNit, { feContext: feCtxCli }),
      cliNom: cliNombreMostrar(factura, feCtxCli),
      cliNit: factura.compradorNit || factura.cliNit || '',
      ivaDisc: ivaDiscriminacion(sub, iva, impAct),
      legalCo: ticketLineas.length ? '' : pieLegal(estado, tipo),
      sub: sub,
      iva: iva,
      tot: tot,
      servicioRef: String(factura.contextoServicio || factura.servicioRef || '').trim(),
      propinaVoluntaria: propinaVol,
      propinaSugerida: propinaSug,
      propinaPctSugerido: propinaPct,
      propinaBaseGravada: cuentaTx
        ? cuentaTx.propinaBaseGravada
        : propinaBaseGravada({
            subtotal: sub,
            sub: sub,
            iva: iva,
            total: tot,
            ivaIncluidoEnPrecios: cuentaTx ? cuentaTx.ivaIncluidoEnPrecios : !!imp.ivaIncluidoEnPrecios,
          }),
      totalConPropina: totConPropina,
      propinaLeyenda: leyendaPropinaResuelta(factura),
      propinaLeyendaTicket:
        ctx.esPrecuenta || docKindOut === 'fe_cerrada' || docKindOut === 'pos_cerrado'
          ? leyendaPropinaResuelta(factura)
          : '',
      propinaLeyendaEnBloquePropina:
        (ctx.esPrecuenta || docKindOut === 'fe_cerrada' || docKindOut === 'pos_cerrado') &&
        propinaRestauranteActiva(),
      propinaEnTotales: propinaEnTot,
      legalTicketLineas: ticketLineas,
      legalPrecuentaLineas: null,
      legalVentaLineas: null,
      legalFeLineas: null,
      avisoCajaPrecuenta: ctx.esPrecuenta ? avisoPrecuentaCaja(factura) : null,
    };
    return refreshFiscalLabelsOnPayload(out);
  }

  function dedupePrecuentaResolBlocks(tpl) {
    if (!tpl || !Array.isArray(tpl.blocks)) return tpl;
    var haveResolFull = false;
    var haveNumFe = false;
    tpl.blocks.forEach(function (b) {
      if (b && b.v !== false && b.t === 'resol_full') haveResolFull = true;
      if (b && b.v !== false && b.t === 'num_fe') haveNumFe = true;
    });
    tpl.blocks.forEach(function (b) {
      if (!b) return;
      if (haveResolFull && b.t === 'resol') b.v = false;
      if (haveNumFe && b.t === 'consec') b.v = false;
    });
    return tpl;
  }

  function normalizePrecuentaTplBlocks(tpl) {
    if (!tpl || !Array.isArray(tpl.blocks)) return tpl;
    if (tpl.docType && tpl.docType !== 'precuenta') return tpl;
    tpl = dedupePrecuentaResolBlocks(tpl);
    var haveSepPie = false;
    tpl.blocks.forEach(function (b, i) {
      if (!b) return;
      if (b.t === 'iva_disc' || b.t === 'payment') b.v = false;
      if (b.t === 'propina_sugerida') {
        b.o = 14.5;
        b.a = 'center';
        b.fs = 'xs';
      }
      if (b.t === 'legal_co') {
        b.o = 15;
        b.a = 'center';
        b.fs = 'xs';
      }
      if (b.t === 'footer') {
        b.o = 17;
        b.a = 'center';
        b.fs = 'sm';
        b.fw = true;
        b.c = '';
      }
      if (b.t !== 'divider') return;
      var next = tpl.blocks[i + 1];
      if (b.id === 'div_propina_top' || b.id === 'div_propina_bot') {
        b.v = false;
        return;
      }
      if (next && next.t === 'footer') {
        b.v = false;
        return;
      }
      if (b.o < 13) return;
      if (haveSepPie) {
        b.v = false;
        return;
      }
      b.v = true;
      b.id = 'sep_pie';
      b.o = 14;
      b.c = '2';
      haveSepPie = true;
    });
    if (!haveSepPie) {
      tpl.blocks.push({ t: 'divider', c: '2', v: true, o: 14, a: 'center', fs: 'xs', id: 'sep_pie' });
    }
    return tpl;
  }

  function ensurePrecuentaBlocks(tpl, data) {
    if (!tpl || !Array.isArray(tpl.blocks)) return tpl;
    if (tpl.docType && tpl.docType !== 'precuenta') return tpl;
    data = data || {};
    var fePrec = data.docKind === 'precuenta_fe' || data.perfilEmision === 'fe';
    var have = {};
    tpl.blocks.forEach(function (b) {
      if (!b) return;
      if (b.t === 'iva_disc' || b.t === 'payment') b.v = false;
      if (fePrec && b.t === 'title') b.c = '';
      if (!fePrec && (b.t === 'client' || b.t === 'resol_full' || b.t === 'resol' || b.t === 'cufe' || b.t === 'qr' || b.t === 'num_fe')) {
        b.v = false;
      }
      if (b.v !== false) have[b.t] = true;
    });
    var inserts = [];
    if (!have.nit) inserts.push({ t: 'nit', c: '', v: true, o: 2.5, a: 'center', fs: 'xs' });
    if (!have.address) inserts.push({ t: 'address', c: '', v: true, o: 2.6, a: 'center', fs: 'xs' });
    if (!have.regimen) inserts.push({ t: 'regimen', c: '', v: true, o: 2.7, a: 'center', fs: 'xs' });
    if (!have.impuesto_consumo) inserts.push({ t: 'impuesto_consumo', c: '', v: true, o: 2.75, a: 'center', fs: 'xs' });
    if (fePrec) {
      if (!have.resol_full) inserts.push({ t: 'resol_full', c: '', v: true, o: 3.2, a: 'center', fs: 'xs' });
      if (!have.client) inserts.push({ t: 'client', c: '', v: true, o: 6.2, a: 'left', fs: 'sm' });
      if (!have.num_fe) inserts.push({ t: 'num_fe', c: '', v: true, o: 4.5, a: 'center', fs: 'sm', fw: true });
    }
    if (!have.servicio_ref) inserts.push({ t: 'servicio_ref', c: '', v: true, o: 7, a: 'center', fs: 'sm', fw: true });
    if (!have.propina_sugerida) inserts.push({ t: 'propina_sugerida', c: '', v: true, o: 14, a: 'center', fs: 'xs' });
    if (!have.legal_co) inserts.push({ t: 'legal_co', c: '', v: true, o: 15.5, a: 'center', fs: 'xs' });
    inserts.forEach(function (blk) {
      tpl.blocks.push(blk);
    });
    tpl.blocks.forEach(function (b) {
      if (b && b.t === 'total' && (!b.c || b.c === 'TOTAL CONSUMO')) b.c = 'TOTAL A PAGAR';
      if (fePrec && b && b.t === 'title') b.c = '';
    });
    return normalizePrecuentaTplBlocks(tpl);
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

  function normalizeFacturaTplBlocks(tpl, data) {
    if (!tpl || !Array.isArray(tpl.blocks)) return tpl;
    if (tpl.docType && tpl.docType !== 'factura') return tpl;
    data = data || {};
    var usaTot =
      typeof isCuentaTotalesTicket === 'function'
        ? isCuentaTotalesTicket(data, tpl)
        : data.docKind === 'fe_cerrada' || data.docKind === 'pos_cerrado';
    tpl.blocks.forEach(function (b) {
      if (!b) return;
      if (usaTot && (b.t === 'iva_disc' || b.t === 'impuesto_consumo')) b.v = false;
      if (b.t === 'title') b.c = '';
    });
    return dedupeFacturaBlocks(tpl);
  }

  function ensureFacturaBlocks(tpl, data) {
    if (!tpl || !Array.isArray(tpl.blocks)) return tpl;
    if (tpl.docType && tpl.docType !== 'factura') return tpl;
    data = data || {};
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
    if (!have.impuesto_consumo) inserts.push({ t: 'impuesto_consumo', c: '', v: true, o: 0, a: 'center', fs: 'xs' });
    if (!have.servicio_ref) inserts.push({ t: 'servicio_ref', c: '', v: true, o: 0, a: 'center', fs: 'sm', fw: true });
    if (!have.propina_sugerida) inserts.push({ t: 'propina_sugerida', c: '', v: true, o: 0, a: 'center', fs: 'xs' });
    if (!have.num_fe && !have.consec) inserts.push({ t: 'num_fe', c: '', v: true, o: 0, a: 'center', fs: 'sm', fw: true });
    if (!have.resol_full && !have.resol) inserts.push({ t: 'resol_full', c: '', v: true, o: 0, a: 'center', fs: 'xs' });
    if (!have.legal_co) inserts.push({ t: 'legal_co', c: '', v: true, o: 0, a: 'center', fs: 'xs' });
    if (!have.payment) inserts.push({ t: 'payment', c: '', v: true, o: 0, a: 'left', fs: 'sm' });
    if (!inserts.length) return normalizeFacturaTplBlocks(tpl, data);
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
    return normalizeFacturaTplBlocks(tpl, data);
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
    normalizeFacturaTplBlocks: normalizeFacturaTplBlocks,
    ensurePrecuentaBlocks: ensurePrecuentaBlocks,
    pieLegalPrecuenta: pieLegalPrecuenta,
    pieLegalPrecuentaLineas: pieLegalPrecuentaLineas,
    pieLegalPrecuentaPosLineas: pieLegalPrecuentaPosLineas,
    pieLegalPrecuentaFeLineas: pieLegalPrecuentaFeLineas,
    perfilEmisionActivo: perfilEmisionActivo,
    esPrecuentaPerfilFe: esPrecuentaPerfilFe,
    pieLegalVentaPosLineas: pieLegalVentaPosLineas,
    pieLegalFeLineas: pieLegalFeLineas,
    resolveLegalTicketLineas: resolveLegalTicketLineas,
    operacionContexto: operacionContexto,
    leyendaPropinaResuelta: leyendaPropinaResuelta,
    propinaRestauranteActiva: propinaRestauranteActiva,
    muestraMontosPropinaBloque: muestraMontosPropinaBloque,
    legalTicketLineasForData: legalTicketLineasForData,
    muestraLeyendaPropinaTicket: muestraLeyendaPropinaTicket,
    propinaLeyendaTicketCorta: propinaLeyendaTicketCorta,
    propinaBaseGravada: propinaBaseGravada,
    calcularPropinaSugeridaMonto: calcularPropinaSugeridaMonto,
    avisoPrecuentaCaja: avisoPrecuentaCaja,
    normalizePrecuentaTplBlocks: normalizePrecuentaTplBlocks,
    dedupeFacturaBlocks: dedupeFacturaBlocks,
    namesEqual: namesEqual,
    blocksFacturaColombiaBase: blocksFacturaColombiaBase,
    fmtNit: fmtNit,
    resolTexto: resolTexto,
    numFactura: numFactura,
    cuentaTicketTotals: cuentaTicketTotals,
    cuentaPrecuentaFilasTotales: cuentaPrecuentaFilasTotales,
    impuestoCuentaMeta: impuestoCuentaMeta,
    cuentaEtiquetasFiscales: cuentaEtiquetasFiscales,
    impuestoEncabezadoEmpresa: impuestoEncabezadoEmpresa,
    impuestoLineaLabel: impuestoLineaLabel,
    refreshFiscalLabelsOnPayload: refreshFiscalLabelsOnPayload,
    isCuentaClienteDoc: isCuentaClienteDoc,
    isCuentaPrecuentaTicket: isCuentaPrecuentaTicket,
    isCuentaTotalesTicket: isCuentaTotalesTicket,
    cliNombreMostrar: cliNombreMostrar,
    impuestoConsumoLabel: impuestoConsumoLabel,
    consumoPctLabel: consumoPctLabel,
    negocioFeHabilitada: negocioFeHabilitada,
    esDocumentoFe: esDocumentoFe,
    cufeValidoParaFe: cufeValidoParaFe,
  };
  global.crozzoTermicaLegalPayloadColombia = legalPayload;
})(typeof window !== 'undefined' ? window : global);
