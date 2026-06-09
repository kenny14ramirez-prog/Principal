/**
 * Crozzo POS — Centro de impresión térmica.
 * Facturas · Precuentas · Tickets · Bodega (MP + FE/FI/FV) · Salón (lista precios venta)
 */
(function (global) {
  'use strict';

  var DOC_TYPES = [
    { id: 'factura', label: 'Facturas', icon: '🧾', step: '1', desc: 'Recibo al cliente cuando ya cobró o facturó.' },
    { id: 'precuenta', label: 'Precuentas', icon: '📋', step: '2', desc: 'Cuenta de mesa antes de pagar — con logo de su marca.' },
    { id: 'ticket', label: 'Tickets', icon: '🎫', step: '3', desc: 'Comandas para cocina, barra o avisos rápidos.' },
    { id: 'bodega', label: 'Bodega', icon: '📦', step: '4', desc: 'Rótulo MP: nombre + FE/FI/FV en blanco para llenar a mano.' },
    {
      id: 'bodega_entrada',
      label: 'Bodega entrada',
      icon: '🚪',
      step: '4b',
      desc: 'Rótulo de entrada: nombre del producto, sin fechas FE/FI/FV.',
    },
    {
      id: 'salon',
      label: 'Salón',
      icon: '🛒',
      step: '5',
      desc: 'Etiqueta góndola: nombre del producto, precio de caja y $/g solo si aplica.',
    },
    { id: 'inventario', label: 'Inventario', icon: '📋', step: '6', desc: 'Hojas de conteo, stock teórico y listados MP.' },
  ];

  var LS_BODEGA_SEQ = 'crozzo_bodega_marcacion_seq';
  var __designerPushRev = 0;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function fechaPlainNow(d) {
    d = d || new Date();
    if (typeof global.crozzoEscFmtDatePlain === 'function') return global.crozzoEscFmtDatePlain(d);
    try {
      var dt = d instanceof Date ? d : new Date(d);
      if (isNaN(dt.getTime())) return '';
      var p = function (x) {
        return x < 10 ? '0' + x : String(x);
      };
      return p(dt.getDate()) + '/' + p(dt.getMonth() + 1) + '/' + dt.getFullYear() + ' ' + p(dt.getHours()) + ':' + p(dt.getMinutes());
    } catch (_) {
      return String(d);
    }
  }

  function defaultTplFactura() {
    var blocks =
      global.CrozzoTermicaColombia && typeof global.CrozzoTermicaColombia.blocksFacturaColombiaBase === 'function'
        ? global.CrozzoTermicaColombia.blocksFacturaColombiaBase()
        : [
            { t: 'logo', c: '', v: true, o: 1, a: 'center', fs: 'md', fw: true },
            { t: 'company', c: '', v: true, o: 2, a: 'center', fs: 'sm' },
            { t: 'nit', c: '', v: true, o: 3, a: 'center', fs: 'xs' },
            { t: 'ornament', c: 'diamond', v: true, o: 3.5, a: 'center', fs: 'xs' },
            { t: 'title', c: 'FACTURA ELECTRÓNICA DE VENTA', v: true, o: 4, a: 'center', fs: 'lg', fw: true },
            { t: 'items', c: '', v: true, o: 5, a: 'left', fs: 'sm' },
            { t: 'total', c: 'TOTAL', v: true, o: 6, a: 'left', fs: 'md', fw: true },
            { t: 'cufe', c: '', v: true, o: 7, a: 'left', fs: 'xs' },
            { t: 'qr', c: '', v: true, o: 8, a: 'center', fs: 'sm' },
          ];
    return {
      name: 'Factura Colombia (DIAN)',
      sz: '80',
      studio: true,
      docType: 'factura',
      blocks: blocks,
    };
  }

  function defaultTplPrecuenta() {
    var tpl = {
      name: 'Precuenta mesa',
      sz: '80',
      studio: true,
      docType: 'precuenta',
      blocks: [
        { t: 'logo', c: '', v: true, o: 1, a: 'center', fs: 'md', fw: true },
        { t: 'company', c: '', v: true, o: 2, a: 'center', fs: 'md', fw: true },
        { t: 'nit', c: '', v: true, o: 3, a: 'center', fs: 'xs' },
        { t: 'address', c: '', v: true, o: 4, a: 'center', fs: 'xs' },
        { t: 'regimen', c: '', v: true, o: 5, a: 'center', fs: 'xs' },
        { t: 'impuesto_consumo', c: '', v: true, o: 5.5, a: 'center', fs: 'xs' },
        { t: 'title', c: 'PRECUENTA', v: true, o: 6, a: 'center', fs: 'lg', fw: true },
        { t: 'servicio_ref', c: '', v: true, o: 7, a: 'center', fs: 'sm', fw: true },
        { t: 'date', c: '', v: true, o: 8, a: 'center', fs: 'xs' },
        { t: 'client', c: '', v: true, o: 9, a: 'left', fs: 'sm' },
        { t: 'divider', c: '4', v: true, o: 10 },
        { t: 'items', c: '', v: true, o: 11, a: 'left', fs: 'sm' },
        { t: 'total', c: 'TOTAL A PAGAR', v: true, o: 13, a: 'left', fs: 'md', fw: true },
        { t: 'propina_sugerida', c: '', v: true, o: 14, a: 'center', fs: 'xs' },
        { t: 'legal_co', c: '', v: true, o: 15, a: 'center', fs: 'xs' },
        { t: 'divider', c: '2', v: true, o: 16, a: 'center', fs: 'xs' },
        { t: 'footer', c: '', v: true, o: 17, a: 'center', fs: 'sm', fw: true },
      ],
    };
    if (typeof global.CrozzoTermicaColombia !== 'undefined' && global.CrozzoTermicaColombia.ensurePrecuentaBlocks) {
      tpl = global.CrozzoTermicaColombia.ensurePrecuentaBlocks(tpl);
    }
    return tpl;
  }

  function defaultTplSalon() {
    return {
      name: 'Salón · precio venta',
      sz: '80',
      studio: true,
      docType: 'salon',
      blocks: [
        { t: 'logo', c: '', v: true, o: 1, a: 'left', fs: 'xs', fw: false, logoLayout: 'inline' },
        { t: 'salon_etiqueta', c: '', v: true, o: 2, a: 'left', fs: 'lg', fw: true },
        { t: 'ornament', c: 'diamond', v: true, o: 2.5, a: 'center', fs: 'xs' },
        { t: 'cut', c: 'partial', v: true, o: 3, a: 'center', fs: 'xs', sp: 3 },
      ],
      cutEnd: 'none',
    };
  }

  /** Salón: solo precio de venta (sin FE/FI/FV de bodega). */
  function ensureInventarioTplBlocks(tpl) {
    if (!tpl || !tpl.blocks) return tpl;
    tpl.docType = 'inventario';
    tpl.blocks = tpl.blocks.map(function (b) {
      var nb = Object.assign({}, b);
      if (nb.t === 'inv_conteo') nb.t = 'items';
      return nb;
    });
    return tpl;
  }

  function ensureSalonBlocks(tpl) {
    if (!tpl || !Array.isArray(tpl.blocks)) return tpl;
    if (tpl.docType && tpl.docType !== 'salon') return tpl;
    tpl.blocks = tpl.blocks.filter(function (b) {
      if (!b) return false;
      return b.t !== 'rotulo_nombre' && b.t !== 'fechas_blank' && b.t !== 'mp_lines' && b.t !== 'marcacion';
    });
    var haveSalon = tpl.blocks.some(function (b) {
      return b && b.t === 'salon_etiqueta' && b.v !== false;
    });
    if (!haveSalon) {
      tpl.blocks.push({ t: 'salon_etiqueta', c: '', v: true, o: 2, a: 'center', fs: 'lg', fw: true });
    }
    return tpl;
  }

  /** Salón / bodega: logo pequeño a la izquierda del producto (ahorra papel). */
  function applyCompactLabelLogo(tpl) {
    if (!tpl || !Array.isArray(tpl.blocks)) return tpl;
    tpl.blocks = tpl.blocks.map(function (b) {
      if (!b || b.t !== 'logo' || b.v === false) return b;
      return Object.assign({}, b, {
        a: b.logoLayout === 'inline' || b.a === 'left' ? 'left' : 'left',
        fs: 'xs',
        fw: false,
        logoLayout: 'inline',
      });
    });
    return tpl;
  }

  /** Bodega: nombre arriba, fechas debajo (orden fijo de bloques). */
  function normalizeBodegaTplBlocks(tpl) {
    if (!tpl || !Array.isArray(tpl.blocks)) return tpl;
    var dt = tpl.docType || '';
    if (dt !== 'bodega' && dt !== 'bodega_entrada') return tpl;
    var rank = {
      logo: 10,
      company: 20,
      rotulo_nombre: 30,
      fechas_blank: 40,
      ornament: 50,
      footer: 60,
      cut: 90,
    };
    tpl.blocks.forEach(function (b, i) {
      if (!b) return;
      var r = rank[b.t];
      b.o = r != null ? r : 70 + i;
    });
    return tpl;
  }

  function defaultTplTicket() {
    return {
      name: 'Ticket comanda',
      sz: '80',
      studio: true,
      docType: 'ticket',
      blocks: [
        { t: 'ornament', c: 'flourish', v: true, o: 0.5, a: 'center', fs: 'xs' },
        { t: 'title', c: 'COMANDA', v: true, o: 1, a: 'center', fs: 'lg', fw: true },
        { t: 'company', c: '', v: true, o: 2, a: 'center', fs: 'xs' },
        { t: 'consec', c: '', v: true, o: 3, a: 'center', fs: 'sm', fw: true },
        { t: 'date', c: '', v: true, o: 4, a: 'center', fs: 'xs' },
        { t: 'divider', c: '4', v: true, o: 5 },
        { t: 'items', c: '', v: true, o: 6, a: 'left', fs: 'md', fw: true },
        { t: 'footer', c: 'Preparar con amor', v: true, o: 7, a: 'left', fs: 'xs' },
      ],
    };
  }

  function defaultTplBodega() {
    return {
      name: 'Rótulo bodega (FE · FI · FV)',
      sz: '80',
      studio: true,
      docType: 'bodega',
      blocks: [
        { t: 'logo', c: '', v: true, o: 1, a: 'left', fs: 'xs', fw: false, logoLayout: 'inline' },
        { t: 'rotulo_nombre', c: '', v: true, o: 2, a: 'left', fs: 'lg', fw: true },
        { t: 'fechas_blank', c: '', v: true, o: 3, a: 'left', fs: 'sm' },
        { t: 'ornament', c: 'diamond', v: true, o: 3.5, a: 'center', fs: 'xs' },
        { t: 'footer', c: 'Pegar en producto · llenar fechas a mano', v: true, o: 4, a: 'center', fs: 'xs' },
        { t: 'cut', c: 'partial', v: true, o: 5, a: 'center', fs: 'xs', sp: 3 },
      ],
      cutEnd: 'none',
    };
  }

  function defaultTplInventario() {
    return {
      name: 'Inventario MP · hoja listado',
      sz: '80',
      studio: true,
      docType: 'inventario',
      blocks: [
        { t: 'company', c: '', v: true, o: 1, a: 'center', fs: 'sm', fw: true },
        { t: 'title', c: 'INVENTARIO / CONTEO', v: true, o: 2, a: 'center', fs: 'lg', fw: true },
        { t: 'date', c: '', v: true, o: 3, a: 'center', fs: 'xs' },
        { t: 'divider', c: '4', v: true, o: 4 },
        { t: 'items', c: '', v: true, o: 5, a: 'left', fs: 'sm' },
        { t: 'footer', c: 'Escriba la cantidad en la unidad indicada', v: true, o: 6, a: 'center', fs: 'xs' },
      ],
      cutEnd: 'none',
    };
  }

  function defaultTplBodegaEntrada() {
    return {
      name: 'Rótulo entrada bodega',
      sz: '80',
      studio: true,
      docType: 'bodega_entrada',
      blocks: [
        { t: 'logo', c: '', v: true, o: 1, a: 'left', fs: 'xs', fw: false, logoLayout: 'inline' },
        { t: 'rotulo_nombre', c: '', v: true, o: 2, a: 'left', fs: 'lg', fw: true },
        { t: 'ornament', c: 'flourish', v: true, o: 2.5, a: 'center', fs: 'xs' },
        { t: 'footer', c: 'Entrada de bodega · control visual', v: true, o: 3, a: 'center', fs: 'xs' },
        { t: 'cut', c: 'partial', v: true, o: 4, a: 'center', fs: 'xs', sp: 3 },
      ],
      cutEnd: 'none',
    };
  }

  function finalizeTplCut(tpl, docType) {
    if (!tpl) return tpl;
    if (global.CrozzoPrintPresets && typeof global.CrozzoPrintPresets.applyCutPolicy === 'function') {
      return global.CrozzoPrintPresets.applyCutPolicy(tpl, docType);
    }
    tpl.cutEnd = 'none';
    tpl.cutEndFeed = 0;
    return tpl;
  }

  /** Normaliza bloques, printOutput y reglas por tipo (factura, salón, bodega, etc.). */
  function polishTplForDocType(tpl, docType) {
    if (!tpl) return tpl;
    docType = docType || tpl.docType || 'factura';
    tpl.docType = docType;
    if (typeof global.crozzoTermicaNormalizePlantilla === 'function') {
      var n = global.crozzoTermicaNormalizePlantilla(tpl, { skipPolish: true });
      if (n) tpl = n;
    }
    if (docType === 'factura' && global.CrozzoTermicaColombia) {
      if (typeof global.CrozzoTermicaColombia.dedupeFacturaBlocks === 'function') {
        tpl = global.CrozzoTermicaColombia.dedupeFacturaBlocks(tpl);
      }
      if (typeof global.CrozzoTermicaColombia.ensureFacturaBlocks === 'function') {
        tpl = global.CrozzoTermicaColombia.ensureFacturaBlocks(tpl);
      }
    }
    if (docType === 'salon') tpl = ensureSalonBlocks(tpl);
    if (docType === 'inventario') tpl = ensureInventarioTplBlocks(tpl);
    if (docType === 'bodega' || docType === 'bodega_entrada') tpl = normalizeBodegaTplBlocks(tpl);
    if (docType === 'salon' || docType === 'bodega' || docType === 'bodega_entrada') tpl = applyCompactLabelLogo(tpl);
    tpl = migrateLegacyBodegaSalonTpl(tpl, docType);
    tpl = ensureDocTypeHasLogo(tpl, docType);
    if (!tpl.printOutput) {
      tpl.printOutput =
        tpl.sz === 'carta' || tpl.sz === 'oficio' ? tpl.sz : tpl.sz === '58' ? 'roll_58' : 'roll_80';
    } else {
      tpl.printOutput = normalizePrintOutput(tpl.printOutput);
    }
    return finalizeTplCut(tpl, docType);
  }

  function ensureDocTypeHasLogo(tpl, docType) {
    if (!tpl || !tpl.blocks || (docType !== 'precuenta' && docType !== 'salon' && docType !== 'bodega' && docType !== 'bodega_entrada'))
      return tpl;
    var has = tpl.blocks.some(function (b) {
      return b.t === 'logo' && b.v !== false;
    });
    if (has) return tpl;
    var blocks = tpl.blocks.map(function (b) {
      return Object.assign({}, b, { o: (typeof b.o === 'number' ? b.o : 1) + 1 });
    });
    blocks.unshift({ t: 'logo', c: '', v: true, o: 1, a: 'center', fs: 'md', fw: true });
    return Object.assign({}, tpl, { blocks: blocks });
  }

  function defaultTpl(docType) {
    var base;
    if (docType === 'precuenta') base = defaultTplPrecuenta();
    else if (docType === 'ticket') base = defaultTplTicket();
    else if (docType === 'bodega') base = defaultTplBodega();
    else if (docType === 'bodega_entrada') base = defaultTplBodegaEntrada();
    else if (docType === 'salon') base = defaultTplSalon();
    else if (docType === 'inventario') base = defaultTplInventario();
    else base = defaultTplFactura();
    return finalizeTplCut(base, docType);
  }

  function normalizePlantillas(conf) {
    conf = conf || {};
    var out = conf.termicaPlantillas && typeof conf.termicaPlantillas === 'object' ? conf.termicaPlantillas : {};
    var modos = conf.termicaModos && typeof conf.termicaModos === 'object' ? conf.termicaModos : {};
    DOC_TYPES.forEach(function (d) {
      var raw = out[d.id];
      if (!raw || !raw.blocks || !raw.blocks.length) {
        out[d.id] = polishTplForDocType(defaultTpl(d.id), d.id);
      } else {
        out[d.id] = polishTplForDocType(raw, d.id);
      }
      if (!modos[d.id]) {
        modos[d.id] =
          d.id === 'factura' && conf.termicaModo === 'personalizada' ? 'personalizada' : 'predefinida';
      }
    });
    if (!modos.bodega_entrada) {
      modos.bodega_entrada = modos.bodega || 'predefinida';
    }
    if (conf.termicaPlantilla && typeof global.crozzoTermicaNormalizePlantilla === 'function') {
      var leg = global.crozzoTermicaNormalizePlantilla(conf.termicaPlantilla, { skipPolish: true });
      if (leg && (!out.factura || !out.factura.blocks || out.factura.blocks.length < 3)) {
        out.factura = polishTplForDocType(leg, 'factura');
        modos.factura = conf.termicaModo === 'personalizada' ? 'personalizada' : modos.factura;
      }
    }
    if (!out.bodega_entrada || !out.bodega_entrada.blocks || !out.bodega_entrada.blocks.length) {
      out.bodega_entrada = polishTplForDocType(defaultTplBodegaEntrada(), 'bodega_entrada');
    }
    conf.termicaPlantillas = out;
    conf.termicaModos = modos;
    if (!conf.bodegaMarcacion || typeof conf.bodegaMarcacion !== 'object') {
      conf.bodegaMarcacion = {
        prefijo: 'MK',
        ubicacion: 'Bodega principal',
        incluirTodasMp: true,
        historial: [],
      };
    }
    if (!conf.impresoraBodega) conf.impresoraBodega = '';
    if (!conf.termicaPresets || typeof conf.termicaPresets !== 'object') {
      conf.termicaPresets = {};
    }
    return conf;
  }

  function cloneTpl(tpl) {
    if (!tpl) return null;
    try {
      return JSON.parse(JSON.stringify(tpl));
    } catch (_) {
      return tpl;
    }
  }

  function loadPresetIntoEditor(docType, presetId) {
    docType = docType || studioTplKey();
    if (!global.CrozzoPrintPresets || !global.CrozzoPrintPresets.isValidPreset(presetId)) return null;
    var tpl = cloneTpl(global.CrozzoPrintPresets.getTemplate(docType, presetId));
    if (tpl) {
      tpl.presetId = presetId;
      tpl.docType = docType;
      tpl.studio = true;
    }
    var conf = getFacturacionAdminConfigSafe();
    var plantillas = Object.assign({}, conf.termicaPlantillas || {});
    var modos = Object.assign({}, conf.termicaModos || {});
    var presets = Object.assign({}, conf.termicaPresets || {});
    var prevOut =
      conf.termicaPlantillas && conf.termicaPlantillas[docType] && conf.termicaPlantillas[docType].printOutput
        ? conf.termicaPlantillas[docType].printOutput
        : null;
    tpl = polishTplForDocType(tpl, docType);
    if (prevOut) tpl.printOutput = normalizePrintOutput(prevOut);
    plantillas[docType] = tpl;
    modos[docType] = 'personalizada';
    presets[docType] = presetId;
    if (typeof global.config !== 'undefined' && global.config.set) {
      global.config.set(
        'facturacionAdmin',
        Object.assign({}, conf, {
          termicaPlantillas: plantillas,
          termicaModos: modos,
          termicaPresets: presets,
          termicaPresetId: presetId,
          termicaModo: docType === 'factura' ? 'personalizada' : conf.termicaModo,
          termicaPlantilla: docType === 'factura' ? tpl : conf.termicaPlantilla,
        })
      );
    }
    if (typeof global.schedulePosRuntimeSave === 'function') global.schedulePosRuntimeSave();
    return tpl;
  }

  function ensureEditorReady(docType) {
    docType = docType || studioTplKey();
    var conf = getFacturacionAdminConfigSafe();
    conf = normalizePlantillas(conf);
    var tpl = getPlantilla(docType, conf);
    var hasSaved = tpl && tpl.blocks && tpl.blocks.length >= 2;
    if (!hasSaved) {
      loadPresetIntoEditor(docType, getActivePresetId(docType, conf));
      return;
    }
    if (conf.termicaModos[docType] !== 'personalizada') {
      var modos = Object.assign({}, conf.termicaModos || {});
      modos[docType] = 'personalizada';
      if (typeof global.config !== 'undefined' && global.config.set) {
        global.config.set('facturacionAdmin', Object.assign({}, conf, { termicaModos: modos }));
      }
    }
  }

  function markStudioDirty(on) {
    var badge = document.getElementById('crozzoPsUnsavedBadge');
    if (badge) badge.hidden = !on;
    var studio = document.querySelector('.crozzo-print-studio');
    if (studio) studio.classList.toggle('has-unsaved', !!on);
  }

  function clearStudioDirty() {
    markStudioDirty(false);
    if (typeof global.crozzoFacturasAdminUpdateStudioStatus === 'function') {
      global.crozzoFacturasAdminUpdateStudioStatus('Guardado', true);
    }
  }

  function refreshMiniPreview(tpl) {
    var host = document.getElementById('crozzoPsMiniPreview');
    if (!host) return;
    tpl = cloneTpl(tpl);
    if (!tpl || !tpl.blocks || !tpl.blocks.length) {
      host.innerHTML = '<p class="crozzo-print-studio__preview-empty">Sin bloques</p>';
      return;
    }
    if (typeof global.crozzoTermicaRenderPlantillaHtml !== 'function') {
      host.innerHTML =
        '<p class="crozzo-print-studio__preview-empty">' +
        (tpl.blocks.length + ' bloques · ' + (tpl.sz || '80') + ' mm') +
        '</p>';
      return;
    }
    try {
      var docType = studioTplKey();
      var previewTpl = tplForPrintOutput(tpl, tpl.printOutput || savedPrintOutput('estudio'));
      var html = global.crozzoTermicaRenderPlantillaHtml(previewTpl, samplePayload(docType));
      var outId = tpl.printOutput || (tpl.sz === '58' ? 'roll_58' : 'roll_80');
      var meta = printOutputMeta(outId);
      if (meta.kind === 'sheet') {
        host.innerHTML =
          '<div class="crozzo-print-studio__preview-sheet crozzo-print-studio__preview-sheet--' +
          esc(meta.id) +
          '">' +
          '<span class="crozzo-print-studio__preview-sheet-tag">' +
          esc(printOutputLabel(meta.id)) +
          '</span>' +
          '<div class="crozzo-print-studio__preview-ticket crozzo-print-studio__preview-ticket--' +
          (tpl.sz === '80' ? '80' : '58') +
          '">' +
          html +
          '</div></div>';
      } else {
        host.innerHTML =
          '<div class="crozzo-print-studio__preview-ticket crozzo-print-studio__preview-ticket--' +
          (tpl.sz === '80' ? '80' : '58') +
          '">' +
          html +
          '</div>';
      }
    } catch (_) {
      host.innerHTML = '<p class="crozzo-print-studio__preview-empty">Vista previa no disponible</p>';
    }
  }

  function onEditorTplChanged(tpl) {
    if (!tpl) return;
    tpl = cloneTpl(tpl);
    var docType = activeDocType();
    var tplKey = studioTplKey();
    tpl = polishTplForDocType(tpl, tplKey) || tpl;
    tpl.docType = tplKey;
    tpl.studio = true;
    if (tpl.printOutput) {
      try {
        localStorage.setItem('crozzo_print_output_estudio', normalizePrintOutput(tpl.printOutput));
      } catch (_) {}
    }
    var ta = document.getElementById('adminTermicaPlantillaJson');
    if (ta) ta.value = JSON.stringify(tpl, null, 2);
    persistActiveTplFromJson(ta ? ta.value : JSON.stringify(tpl));
    var presetId = tpl.presetId || getActivePresetId(docType, getFacturacionAdminConfigSafe());
    updateTplStatusUi(tpl, presetId);
    refreshMiniPreview(tpl);
    clearStudioDirty();
    if (typeof global.crozzoFacturasAdminUpdateStudioStatus === 'function') {
      global.crozzoFacturasAdminUpdateStudioStatus(
        'Diseño guardado · ' + (DOC_TYPES.find(function (d) { return d.id === docType; }) || {}).label || docType,
        true
      );
    }
  }

  function updateTplStatusUi(tpl, presetId) {
    var status = document.getElementById('crozzoPsTplStatus');
    if (!status || !tpl) return;
    var pm = global.CrozzoPrintPresets ? global.CrozzoPrintPresets.getPresetMeta(presetId) : null;
    status.textContent =
      (tpl.name || (pm && pm.label) || 'Ticket') +
      ' · ' +
      (tpl.blocks ? tpl.blocks.length : 0) +
      ' bloques · ' +
      (tpl.sz || '80') +
      ' mm' +
      (tpl.printOutput && printOutputMeta(tpl.printOutput).kind === 'sheet' ? ' · ' + printOutputLabel(tpl.printOutput) : '');
    var szBadge = document.getElementById('crozzoPsSzBadge');
    if (szBadge) {
      szBadge.textContent = tpl.printOutput
        ? printOutputLabel(tpl.printOutput)
        : (tpl.sz || '80') + ' mm';
    }
  }

  function renderDocTypeSelect(activeKey) {
    activeKey = activeKey || studioTplKey();
    return DOC_TYPES.map(function (d) {
      return (
        '<option value="' +
        d.id +
        '"' +
        (d.id === activeKey ? ' selected' : '') +
        '>' +
        esc(d.label) +
        '</option>'
      );
    }).join('');
  }

  function pushTplToDesigner(tpl, attempt) {
    attempt = attempt || 0;
    tpl = cloneTpl(tpl);
    if (!tpl) return;
    var ifr = document.getElementById('crozzoTicketDesignerIframe');
    if (!ifr) return;
    if (ifr.getAttribute('src') === 'about:blank' && typeof global.crozzoTicketDesignerPageUrl === 'function') {
      ifr.setAttribute('src', global.crozzoTicketDesignerPageUrl());
    }
    if (!ifr.contentWindow) {
      if (attempt < 25) {
        global.setTimeout(function () {
          pushTplToDesigner(tpl, attempt + 1);
        }, 120);
      }
      return;
    }
    var docType = activeDocType();
    var tplKey = studioTplKey();
    if (!tpl.printOutput) {
      var confPo = getFacturacionAdminConfigSafe();
      var savedTpl = confPo.termicaPlantillas && confPo.termicaPlantillas[tplKey];
      if (savedTpl && savedTpl.printOutput) tpl.printOutput = normalizePrintOutput(savedTpl.printOutput);
    }
    if (!tpl.printOutput) tpl.printOutput = savedPrintOutput('estudio');
    __designerPushRev += 1;
    try {
      ifr.contentWindow.postMessage(
        {
          type: 'crozzo_ticket_init',
          tpl: tpl,
          printOutput: tpl.printOutput,
          docType: docType,
          docLabel: (DOC_TYPES.find(function (d) { return d.id === docType; }) || {}).label || docType,
          rev: __designerPushRev,
        },
        '*'
      );
      ifr.contentWindow.postMessage({ type: 'crozzo_ticket_sample', sample: samplePayload(studioTplKey()), rev: __designerPushRev }, '*');
    } catch (_) {}
    if (attempt < 2) {
      global.setTimeout(function () {
        pushTplToDesigner(tpl, attempt + 1);
      }, 280);
    }
  }

  function applyPreset(presetId) {
    if (!global.CrozzoPrintPresets) {
      if (global.showToast) global.showToast('Catálogo de modelos no cargado. Recargue la app (F5).', 'error');
      return;
    }
    if (!global.CrozzoPrintPresets.isValidPreset(presetId)) {
      if (global.showToast) global.showToast('Modelo no válido.', 'warning');
      return;
    }
    var docType = studioTplKey();
    var tpl = loadPresetIntoEditor(docType, presetId);
    if (!tpl) return;
    var ta = document.getElementById('adminTermicaPlantillaJson');
    if (ta) ta.value = JSON.stringify(tpl, null, 2);
    var presetSel = document.getElementById('crozzoPsPresetSelect');
    if (presetSel) presetSel.value = presetId;
    var hint = document.getElementById('crozzoPsPresetHint');
    if (hint) {
      var pm = global.CrozzoPrintPresets.getPresetMeta(presetId);
      if (pm) hint.textContent = pm.desc || '';
    }
    updateTplStatusUi(tpl, presetId);
    refreshMiniPreview(tpl);
    markStudioDirty(true);
    ensureDesignerIframeLoaded(function () {
      pushTplToDesigner(tpl, 0);
    });
    if (typeof global.schedulePosRuntimeSave === 'function') global.schedulePosRuntimeSave();
    if (global.showToast) {
      global.showToast(
        'Modelo «' + (global.CrozzoPrintPresets.getPresetMeta(presetId).label || presetId) + '» guardado para este documento.',
        'success'
      );
    }
  }

  function markEditorFrameReady() {
    var stage = document.getElementById('crozzoPsEditorFrame');
    if (stage) stage.classList.add('is-ready');
    if (typeof global.crozzoFacturasAdminUpdateStudioStatus === 'function') {
      global.crozzoFacturasAdminUpdateStudioStatus('Editor listo', true);
    }
  }

  function ensureDesignerIframeLoaded(cb) {
    var ifr = document.getElementById('crozzoTicketDesignerIframe');
    if (!ifr) {
      if (cb) cb();
      return;
    }
    function done() {
      markEditorFrameReady();
      if (cb) global.setTimeout(cb, 80);
    }
    if (ifr.getAttribute('src') === 'about:blank' && typeof global.crozzoTicketDesignerPageUrl === 'function') {
      ifr.setAttribute('src', global.crozzoTicketDesignerPageUrl());
      ifr.addEventListener('load', function onLd() {
        ifr.removeEventListener('load', onLd);
        done();
      });
      return;
    }
    try {
      if (ifr.contentDocument && ifr.contentDocument.readyState === 'complete') markEditorFrameReady();
    } catch (_) {}
    if (cb) cb();
  }

  function renderPresetPicker(conf, docType) {
    if (!global.CrozzoPrintPresets) {
      return '<p class="form-hint" id="crozzoPsPresetWrap">No se cargó el catálogo de diseños. Recargue (F5).</p>';
    }
    var activePreset = getActivePresetId(docType, conf);
    var activeMeta = global.CrozzoPrintPresets.getPresetMeta(activePreset);
    var opts = global.CrozzoPrintPresets.PRESETS.map(function (p) {
      return (
        '<option value="' +
        esc(p.id) +
        '"' +
        (p.id === activePreset ? ' selected' : '') +
        '>' +
        esc(p.label) +
        ' · ' +
        esc(p.sz) +
        ' mm</option>'
      );
    }).join('');
    return (
      '<div class="crozzo-print-studio__field" id="crozzoPsPresetWrap">' +
      '<label class="crozzo-print-studio__label" for="crozzoPsPresetSelect">Modelo base</label>' +
      '<select class="form-select crozzo-print-studio__select" id="crozzoPsPresetSelect" aria-describedby="crozzoPsPresetHint" onchange="CrozzoPrintStudioHub.applyPresetFromSelect()">' +
      opts +
      '</select>' +
      '<p class="crozzo-print-studio__hint" id="crozzoPsPresetHint">' +
      esc((activeMeta && activeMeta.desc) || 'Elija un diseño y ajústelo en el editor.') +
      '</p></div>'
    );
  }

  function getStudioPrinter() {
    if (typeof global.crozzoResolvePrinterForJob === 'function') {
      return global.crozzoResolvePrinterForJob('', 'caja');
    }
    var v = '';
    var studioSel = document.getElementById('crozzoPsStudioPrinter');
    if (studioSel && studioSel.value) v = String(studioSel.value).trim();
    if (!v) {
      var cajaSel = document.getElementById('adminCajaPosPrinter');
      if (cajaSel && cajaSel.value) v = String(cajaSel.value).trim();
    }
    if (!v) v = String((getFacturacionAdminConfigSafe().impresoraCajaPos || '')).trim();
    if (typeof global.crozzoMatchSystemPrinter === 'function' && v) return global.crozzoMatchSystemPrinter(v);
    return v;
  }

  function syncTplFromEditorBeforePrint() {
    var ta = document.getElementById('adminTermicaPlantillaJson');
    if (ta && ta.value.trim()) persistActiveTplFromJson(ta.value.trim());
  }

  function applyPresetFromSelect() {
    var sel = document.getElementById('crozzoPsPresetSelect');
    if (!sel || !sel.value) return;
    var hint = document.getElementById('crozzoPsPresetHint');
    if (hint && global.CrozzoPrintPresets) {
      var pm = global.CrozzoPrintPresets.getPresetMeta(sel.value);
      if (pm) hint.textContent = pm.desc || '';
    }
    applyPreset(sel.value);
  }

  function applyDesignFromEditor() {
    var ifr = document.getElementById('crozzoTicketDesignerIframe');
    if (ifr && ifr.contentWindow) {
      try {
        ifr.contentWindow.postMessage({ type: 'crozzo_ticket_request_push' }, '*');
        if (typeof global.crozzoFacturasAdminUpdateStudioStatus === 'function') {
          global.crozzoFacturasAdminUpdateStudioStatus('Sincronizando editor…', false);
        }
        return;
      } catch (_) {}
    }
    if (global.showToast) global.showToast('Espere a que cargue el editor.', 'warning');
  }

  function resolveTplForPrint() {
    var docType = activeDocType();
    var ta = document.getElementById('adminTermicaPlantillaJson');
    if (ta && ta.value.trim()) {
      try {
        var parsed = JSON.parse(ta.value.trim());
        if (typeof global.crozzoTermicaNormalizePlantilla === 'function') {
          parsed = global.crozzoTermicaNormalizePlantilla(parsed);
        }
        if (parsed && parsed.blocks && parsed.blocks.length) return parsed;
      } catch (_) {}
    }
    return cloneTpl(getPlantilla(docType, getFacturacionAdminConfigSafe()));
  }

  function requestTplFromDesignerThenPrint() {
    return new Promise(function (resolve) {
      var settled = false;
      var timeout = global.setTimeout(function () {
        if (settled) return;
        settled = true;
        resolve(resolveTplForPrint());
      }, 450);
      function onReply(e) {
        if (!e.data || e.data.type !== 'crozzo_ticket_tpl_reply' || settled) return;
        settled = true;
        global.clearTimeout(timeout);
        try {
          global.removeEventListener('message', onReply);
        } catch (_) {}
        var t = e.data.tpl;
        if (typeof global.crozzoTermicaNormalizePlantilla === 'function') {
          t = global.crozzoTermicaNormalizePlantilla(t) || t;
        }
        resolve(t && t.blocks && t.blocks.length ? t : resolveTplForPrint());
      }
      global.addEventListener('message', onReply);
      var ifr = document.getElementById('crozzoTicketDesignerIframe');
      if (ifr && ifr.contentWindow) {
        try {
          ifr.contentWindow.postMessage({ type: 'crozzo_ticket_request_tpl' }, '*');
        } catch (_) {
          settled = true;
          global.clearTimeout(timeout);
          global.removeEventListener('message', onReply);
          resolve(resolveTplForPrint());
        }
      } else {
        settled = true;
        global.clearTimeout(timeout);
        global.removeEventListener('message', onReply);
        resolve(resolveTplForPrint());
      }
    });
  }

  function testPrintWithTemplate(tpl) {
    tpl = cloneTpl(tpl);
    if (!tpl || !tpl.blocks || !tpl.blocks.length) {
      if (global.showToast) global.showToast('Sin diseño para imprimir. Elija un modelo.', 'warning');
      return Promise.resolve(false);
    }
    var docType = studioTplKey();
    if (tpl.docType) docType = tpl.docType;
    var ta = document.getElementById('adminTermicaPlantillaJson');
    if (ta) ta.value = JSON.stringify(tpl, null, 2);
    persistActiveTplFromJson(ta ? ta.value : JSON.stringify(tpl));

    if (docType === 'bodega' || docType === 'bodega_entrada') {
      var demoMp = mpLinesAll().slice(0, 2);
      return printBodegaRotulos({
        modo: docType === 'bodega_entrada' ? 'entrada' : 'rotulo',
        printOutput: getPrintOutput('estudio'),
        items: demoMp.map(function (ln) {
          return { nombre: ln.n };
        }),
      });
    }
    if (docType === 'salon') {
      return printSalonEtiquetas({ productIds: null, maxItems: 2, printOutput: getPrintOutput('estudio') });
    }
    var normalized = tpl;
    if (typeof global.crozzoTermicaNormalizePlantilla === 'function') {
      normalized = global.crozzoTermicaNormalizePlantilla(tpl) || tpl;
    }
    normalized.docType = docType;
    var payload = samplePayload(docType);

    var studioOut = getPrintOutput('estudio');
    normalized = tplForPrintOutput(normalized, studioOut);
    if (printOutputMeta(studioOut).kind === 'sheet' && typeof global.crozzoPrintTemplateHtml === 'function') {
      return global.crozzoPrintTemplateHtml(normalized, payload, buildPrintOpts({ copies: 1 }, studioOut));
    }
    if (
      typeof global.crozzoIsTauriPrint === 'function' &&
      global.crozzoIsTauriPrint() &&
      typeof global.crozzoRunThermalPrintTest === 'function'
    ) {
      return global.crozzoRunThermalPrintTest({
        tpl: normalized,
        payload: payload,
        printer: getStudioPrinter(),
        role: 'caja',
        kind: 'studio_test',
        copies: 1,
      });
    }
    if (typeof global.crozzoPrintEscPosTemplate === 'function') {
      return global.crozzoPrintEscPosTemplate(
        normalized,
        payload,
        buildPrintOpts(
          {
            printer: getStudioPrinter(),
            copies: 1,
            silent: false,
            kind: 'studio_test',
            role: 'caja',
          },
          studioOut
        )
      );
    }
    if (global.showToast) global.showToast('Servicio de impresión no disponible.', 'warning');
    return Promise.resolve(false);
  }

  function docTypeFromFactura(factura) {
    var st = String((factura && factura.estado) || '').toLowerCase();
    if (st === 'precuenta') return 'precuenta';
    return 'factura';
  }

  function getActivePresetId(docType, conf) {
    conf = normalizePlantillas(conf || getFacturacionAdminConfigSafe());
    var presets = conf.termicaPresets && typeof conf.termicaPresets === 'object' ? conf.termicaPresets : {};
    var id =
      presets[docType] ||
      (docType === 'bodega_entrada' ? presets.bodega : null) ||
      conf.termicaPresetId ||
      (global.CrozzoPrintPresets && global.CrozzoPrintPresets.DEFAULT_PRESET) ||
      'clasico';
    if (global.CrozzoPrintPresets && !global.CrozzoPrintPresets.isValidPreset(id)) {
      id = global.CrozzoPrintPresets.DEFAULT_PRESET;
    }
    return id;
  }

  var PRINT_OUTPUTS = [
    { id: 'roll_58', label: '58 mm', kind: 'roll', sz: '58' },
    { id: 'roll_80', label: '80 mm', kind: 'roll', sz: '80' },
    { id: 'carta', label: 'Carta', kind: 'sheet', page: 'a4' },
    { id: 'oficio', label: 'Oficio', kind: 'sheet', page: 'legal' },
  ];

  function normalizePrintOutput(id) {
    var s = String(id || '').toLowerCase();
    if (s === 'thermal' || s === 'roll' || s === 'termica') return 'roll_80';
    if (s === 'normal' || s === 'html') return 'carta';
    if (s === 'roll_50' || s === '50' || s === '50mm') return 'roll_58';
    var hit = PRINT_OUTPUTS.some(function (o) {
      return o.id === s;
    });
    return hit ? s : 'roll_80';
  }

  function printOutputMeta(id) {
    id = normalizePrintOutput(id);
    for (var i = 0; i < PRINT_OUTPUTS.length; i++) {
      if (PRINT_OUTPUTS[i].id === id) return PRINT_OUTPUTS[i];
    }
    return PRINT_OUTPUTS[1];
  }

  function renderPrintOutputPicker(scope, outputId, allowedIds) {
    outputId = normalizePrintOutput(outputId || savedPrintOutput(scope));
    if (allowedIds && allowedIds.length) {
      var allowed = {};
      allowedIds.forEach(function (id) {
        allowed[normalizePrintOutput(id)] = true;
      });
      if (!allowed[outputId]) outputId = normalizePrintOutput(allowedIds[0]);
    }
    var list = PRINT_OUTPUTS;
    if (allowedIds && allowedIds.length) {
      list = PRINT_OUTPUTS.filter(function (o) {
        return allowed[normalizePrintOutput(o.id)];
      });
    }
    var pills = list.map(function (o) {
      return (
        '<button type="button" class="crozzo-print-output__btn' +
        (outputId === o.id ? ' is-on' : '') +
        '" data-output="' +
        esc(o.id) +
        '" onclick="CrozzoPrintStudioHub.pickPrintOutput(\'' +
        esc(scope) +
        '\',\'' +
        esc(o.id) +
        '\')">' +
        esc(o.label) +
        '</button>'
      );
    }).join('');
    return (
      '<div class="crozzo-print-output" data-print-output-scope="' +
      esc(scope) +
      '">' +
      '<span class="crozzo-print-output__label">Ancho papel</span>' +
      '<div class="crozzo-print-output__pills">' +
      pills +
      '</div>' +
      '<span class="form-hint crozzo-print-output__hint">' +
      (allowedIds && allowedIds.indexOf('roll_80') >= 0
        ? '58/80 mm → impresora bodega (térmica) · Carta/Oficio → impresora de caja'
        : '58/80 mm → impresora térmica (bodega) · Carta/Oficio → impresora de caja (láser, ej. Epson)') +
      '</span>' +
      '</div>'
    );
  }

  function renderPrintChannelPicker(scope, channel) {
    return renderPrintOutputPicker(scope, channel);
  }

  function persistPrintOutputScope(scope, outputId) {
    outputId = normalizePrintOutput(outputId);
    try {
      localStorage.setItem('crozzo_print_output_' + scope, outputId);
      localStorage.setItem(
        'crozzo_print_channel_' + scope,
        printOutputMeta(outputId).kind === 'sheet' ? 'normal' : 'thermal'
      );
    } catch (_) {}
    if (typeof global.config !== 'undefined' && global.config.get && global.config.set) {
      var conf = getFacturacionAdminConfigSafe();
      var outputs = Object.assign(
        { estudio: 'roll_80', bodega: 'roll_80', salon: 'roll_80', inventario: 'carta' },
        conf.printOutputs || {}
      );
      outputs[scope] = outputId;
      global.config.set('facturacionAdmin', Object.assign({}, conf, { printOutputs: outputs }));
    }
    return outputId;
  }

  function collectPrintOutputsFromUi(prevOutputs) {
    var outputs = Object.assign(
      { estudio: 'roll_80', bodega: 'roll_80', salon: 'roll_80', inventario: 'carta' },
      prevOutputs || {}
    );
    ['estudio', 'bodega', 'salon', 'inventario'].forEach(function (scope) {
      var host = document.querySelector('[data-print-output-scope="' + scope + '"]');
      if (host) {
        var on = host.querySelector('.crozzo-print-output__btn.is-on');
        if (on && on.getAttribute('data-output')) {
          outputs[scope] = normalizePrintOutput(on.getAttribute('data-output'));
          return;
        }
      }
      outputs[scope] = getPrintOutput(scope);
    });
    return outputs;
  }

  function pickPrintOutput(scope, outputId) {
    outputId = persistPrintOutputScope(scope, outputId);
    if (scope === 'estudio') {
      var ifr = document.getElementById('crozzoTicketDesignerIframe');
      if (ifr && ifr.contentWindow) {
        try {
          ifr.contentWindow.postMessage({ type: 'crozzo_ticket_set_output', printOutput: outputId }, '*');
        } catch (_) {}
      }
      var szBadge = document.getElementById('crozzoPsSzBadge');
      if (szBadge) szBadge.textContent = printOutputLabel(outputId);
      var taOut = document.getElementById('adminTermicaPlantillaJson');
      if (taOut && taOut.value.trim()) {
        try {
          var tOut = JSON.parse(taOut.value.trim());
          tOut.printOutput = outputId;
          taOut.value = JSON.stringify(tOut, null, 2);
          persistActiveTplFromJson(taOut.value);
          refreshMiniPreview(tOut);
        } catch (_) {}
      }
    }
    var host = document.querySelector('[data-print-output-scope="' + scope + '"]');
    if (host) {
      host.querySelectorAll('.crozzo-print-output__btn').forEach(function (btn) {
        btn.classList.toggle('is-on', btn.getAttribute('data-output') === outputId);
      });
    }
    if (scope === 'inventario' && global.CrozzoSistemaCostos && global.CrozzoSistemaCostos.refreshInventarioPrintGuide) {
      global.CrozzoSistemaCostos.refreshInventarioPrintGuide();
    }
  }

  function touchPrintChannel(scope) {
    return getPrintOutput(scope);
  }

  function getPrintOutputFromDesigner() {
    var ifr = document.getElementById('crozzoTicketDesignerIframe');
    if (!ifr || !ifr.contentWindow) return null;
    try {
      if (typeof ifr.contentWindow.crozzoDesignerGetPrintOutput === 'function') {
        return normalizePrintOutput(ifr.contentWindow.crozzoDesignerGetPrintOutput());
      }
    } catch (_) {}
    return null;
  }

  function printOutputLabel(id) {
    var meta = printOutputMeta(id);
    return meta.label || id;
  }

  function getPrintOutput(scope) {
    if (scope === 'estudio') {
      var fromDesigner = getPrintOutputFromDesigner();
      if (fromDesigner) return fromDesigner;
      var taEst = document.getElementById('adminTermicaPlantillaJson');
      if (taEst && taEst.value.trim()) {
        try {
          var pe = JSON.parse(taEst.value.trim());
          if (pe.printOutput) return normalizePrintOutput(pe.printOutput);
          if (pe.sz === 'carta' || pe.sz === 'oficio') return pe.sz;
        } catch (_) {}
      }
    }
    var host = document.querySelector('[data-print-output-scope="' + scope + '"]');
    if (host) {
      var on = host.querySelector('.crozzo-print-output__btn.is-on');
      if (on && on.getAttribute('data-output')) {
        var id = normalizePrintOutput(on.getAttribute('data-output'));
        try {
          localStorage.setItem('crozzo_print_output_' + scope, id);
        } catch (_) {}
        return id;
      }
    }
    return savedPrintOutput(scope);
  }

  function getPrintChannel(scope) {
    var meta = printOutputMeta(getPrintOutput(scope));
    return meta.kind === 'sheet' ? 'normal' : 'thermal';
  }

  function savedPrintOutput(scope) {
    try {
      var conf = getFacturacionAdminConfigSafe();
      if (conf.printOutputs && conf.printOutputs[scope]) {
        return normalizePrintOutput(conf.printOutputs[scope]);
      }
      var out = localStorage.getItem('crozzo_print_output_' + scope);
      if (scope === 'inventario') {
        if (out) return normalizePrintOutput(out);
        return 'carta';
      }
      if (out) return normalizePrintOutput(out);
      var legacy = localStorage.getItem('crozzo_print_channel_' + scope);
      if (legacy === 'normal') return 'carta';
    } catch (_) {}
    return scope === 'inventario' ? 'carta' : 'roll_80';
  }

  function savedPrintChannel(scope) {
    return getPrintChannel(scope);
  }

  function tplForPrintOutput(tpl, outputId) {
    if (!tpl) return tpl;
    outputId = normalizePrintOutput(outputId);
    var meta = printOutputMeta(outputId);
    try {
      var out = JSON.parse(JSON.stringify(tpl));
      out.printOutput = meta.id;
      if (meta.kind === 'roll') out.sz = meta.sz;
      else if (out.sz !== '58' && out.sz !== '80') out.sz = '80';
      return out;
    } catch (_) {
      var merged = Object.assign({}, tpl, { printOutput: meta.id });
      if (meta.kind === 'roll') merged.sz = meta.sz;
      return merged;
    }
  }

  function getInventarioPrintOpts() {
    var outputId = normalizePrintOutput(getPrintOutput('inventario'));
    var meta = printOutputMeta(outputId);
    var conf = getFacturacionAdminConfigSafe();
    var isRoll = meta.kind === 'roll';
    return {
      printOutput: meta.id,
      pageFormat: isRoll ? undefined : meta.page,
      landscape: !isRoll,
      allowDialog: true,
      silent: false,
      printer: resolvePrinterForOutput(outputId, conf, isRoll ? 'bodega' : 'inventario'),
      role: isRoll ? printRoleForOutput(outputId, conf, 'bodega') : 'caja',
      channel: isRoll ? 'roll' : 'normal',
      paperSz: meta.sz,
    };
  }

  function resolvePrinterForOutput(outputId, conf, area) {
    conf = conf || getFacturacionAdminConfigSafe();
    area = area || 'bodega';
    var meta = printOutputMeta(outputId);
    if (area === 'inventario' && meta.kind === 'roll') {
      return String(conf.impresoraBodega || conf.impresoraCajaPos || '').trim();
    }
    if (meta.kind === 'sheet' || area === 'inventario') {
      return String(conf.impresoraCajaPos || conf.impresoraFacturas || '').trim();
    }
    if (area === 'salon') {
      return String(conf.impresoraSalon || conf.impresoraBodega || conf.impresoraCajaPos || '').trim();
    }
    return String(conf.impresoraBodega || conf.impresoraCajaPos || '').trim();
  }

  function printRoleForOutput(outputId, conf, area) {
    return printOutputMeta(outputId).kind === 'sheet' ? 'caja' : conf.impresoraBodega && area !== 'salon' ? 'bodega' : 'caja';
  }

  function buildPrintOpts(base, outputId) {
    base = base || {};
    var meta = printOutputMeta(outputId);
    if (meta.kind === 'sheet') {
      var testOrDialog = base.kind === 'studio_test' || base.allowDialog === true || base.silent === false;
      return Object.assign({}, base, {
        channel: 'normal',
        preferNormal: true,
        printOutput: meta.id,
        pageFormat: meta.page,
        landscape: false,
        allowDialog: testOrDialog,
        silent: testOrDialog ? false : true,
        toast: base.toast !== false,
      });
    }
    return Object.assign({}, base, {
      channel: 'roll',
      printOutput: meta.id,
      paperSz: meta.sz,
      preferEscPos: true,
      allowDialog: true,
      silent: false,
      toast: base.toast !== false,
    });
  }

  function ensureCostosBundle() {
    return new Promise(function (resolve) {
      if (global.CrozzoSistemaCostos) return resolve(global.CrozzoSistemaCostos);
      function finish() {
        resolve(global.CrozzoSistemaCostos || null);
      }
      var loadP =
        typeof global.crozzoEnsureModulesForPage === 'function'
          ? global.crozzoEnsureModulesForPage('costos-inventario')
          : new Promise(function (res) {
              if (global.CrozzoLazyModules && typeof global.CrozzoLazyModules.ensurePageModules === 'function') {
                global.CrozzoLazyModules.ensurePageModules('costos-inventario', res);
              } else {
                res();
              }
            });
      loadP.then(function () {
        if (global.CrozzoSistemaCostos) return finish();
        if (global.CrozzoManifest && typeof global.crozzoLoadModules === 'function') {
          return global.crozzoLoadModules(global.CrozzoManifest.scriptsForPage('costos-inventario')).then(finish);
        }
        finish();
      });
    });
  }

  function ensurePrintersReady() {
    if (typeof global.crozzoEnsurePrintersLoaded === 'function') {
      return global.crozzoEnsurePrintersLoaded();
    }
    return Promise.resolve();
  }

  function printFailToast(label) {
    var last = global.__CROZZO_LAST_PRINT || {};
    var hint = last.message ? String(last.message).slice(0, 100) : '';
    if (typeof global.showToast === 'function') {
      global.showToast(
        (label || 'Impresión') +
          ' no completada.' +
          (hint ? ' ' + hint : ' Revise impresora en pestaña Impresoras.'),
        'warning'
      );
    }
  }

  function bodegaTplKey(modo) {
    return modo === 'entrada' ? 'bodega_entrada' : 'bodega';
  }

  function getPlantillaBodega(modo, conf) {
    return getPlantilla(bodegaTplKey(modo), conf);
  }

  function getPlantilla(docType, conf) {
    conf = normalizePlantillas(conf || (typeof global.getFacturacionAdminConfig === 'function' ? global.getFacturacionAdminConfig() : {}));
    var modo = getModo(docType, conf);
    if (modo === 'predefinida' && global.CrozzoPrintPresets && typeof global.CrozzoPrintPresets.getTemplate === 'function') {
      return polishTplForDocType(global.CrozzoPrintPresets.getTemplate(docType, getActivePresetId(docType, conf)), docType);
    }
    var tpl = conf.termicaPlantillas[docType];
    if (tpl && tpl.blocks && tpl.blocks.length) {
      return polishTplForDocType(tpl, docType);
    }
    if (global.CrozzoPrintPresets && typeof global.CrozzoPrintPresets.getTemplate === 'function') {
      return polishTplForDocType(global.CrozzoPrintPresets.getTemplate(docType, getActivePresetId(docType, conf)), docType);
    }
    return polishTplForDocType(defaultTpl(docType), docType);
  }

  function getModo(docType, conf) {
    conf = normalizePlantillas(conf || (typeof global.getFacturacionAdminConfig === 'function' ? global.getFacturacionAdminConfig() : {}));
    if (conf.termicaModos[docType] === 'personalizada') return 'personalizada';
    if (conf.termicaPlantillas[docType] && conf.termicaPlantillas[docType].blocks) return 'personalizada';
    return 'predefinida';
  }

  function activeDocType() {
    return global.__crozzoPrintStudioDocType || 'factura';
  }

  function studioTplKey() {
    if (activeDocType() === 'bodega' && global.__crozzoPrintStudioBodegaTplKey === 'bodega_entrada') {
      return 'bodega_entrada';
    }
    return activeDocType();
  }

  function setActiveDocType(docType) {
    global.__crozzoPrintStudioDocType = docType;
  }

  function samplePayloadWithLogo(payload) {
    if (payload && typeof global.crozzoResolveTicketLogoUrl === 'function') {
      payload.logoUrl = global.crozzoResolveTicketLogoUrl();
    }
    return payload;
  }

  function samplePayload(docType) {
    if (typeof global.crozzoTicketDesignerSamplePayload === 'function' && docType === 'factura') {
      var s = global.crozzoTicketDesignerSamplePayload();
      s.head = 'FACTURA ELECTRONICA';
      return samplePayloadWithLogo(s);
    }
    if (docType === 'precuenta') {
      return samplePayloadWithLogo({
        head: 'PRECUENTA',
        nameE: 'Mi negocio',
        nitE: '900.000.000-0',
        consecutivo: 'MESA-12',
        fecha: fechaPlainNow(),
        cliNom: 'Cliente mesa',
        cliNit: '—',
        lines: [
          { n: 'Café americano', q: 2, p: 4500 },
          { n: 'Sandwich', q: 1, p: 12000 },
        ],
        sub: 21000,
        iva: 0,
        tot: 21000,
        pago: '',
        cufe: '',
        qrUrl: '',
      });
    }
    if (docType === 'ticket') {
      return samplePayloadWithLogo({
        head: 'COMANDA COCINA',
        nameE: 'Barra / Cocina',
        consecutivo: 'CMD-1042',
        fecha: fechaPlainNow(),
        cliNom: 'Mesa 5',
        lines: [
          { n: 'Hamburguesa especial', q: 2, p: 0 },
          { n: 'Papas', q: 1, p: 0 },
        ],
        sub: 0,
        iva: 0,
        tot: 0,
      });
    }
    if (docType === 'salon') {
      return sampleSalonPayload();
    }
    if (docType === 'inventario') {
      return sampleInventarioPayload();
    }
    if (docType === 'bodega') {
      return samplePayloadWithLogo({
        rotuloNombre: 'Harina de trigo (demo)',
        nameE: (typeof global.config !== 'undefined' && global.config.getEmpresa ? global.config.getEmpresa() : {}).nombreComercial || 'Bodega',
      });
    }
    if (docType === 'bodega_entrada') {
      return samplePayloadWithLogo({
        rotuloNombre: 'Mantequilla sin sal (demo)',
        nameE: (typeof global.config !== 'undefined' && global.config.getEmpresa ? global.config.getEmpresa() : {}).nombreComercial || 'Bodega',
      });
    }
    return samplePayloadWithLogo(sampleBodegaPayload());
  }

  function sampleInventarioPayload() {
    var emp = typeof global.config !== 'undefined' && global.config.getEmpresa ? global.config.getEmpresa() : {};
    var lines = [];
    if (typeof global.CrozzoSistemaCostos !== 'undefined' && global.CrozzoSistemaCostos.buildInventarioSnapshot) {
      try {
        var snap = global.CrozzoSistemaCostos.buildInventarioSnapshot();
        var printItems =
          typeof global.CrozzoSistemaCostos.inventarioItemsForPrint === 'function'
            ? global.CrozzoSistemaCostos.inventarioItemsForPrint(snap)
            : snap.items;
        (printItems || []).slice(0, 24).forEach(function (it) {
          var und = String(it.undLabel || it.und || 'und').trim().toLowerCase();
          if (und === 'gr') und = 'g';
          lines.push({
            n: it.nombre || it.n || 'Ítem',
            und: und || 'und',
            q: 0,
            p: 0,
          });
        });
      } catch (_) {}
    }
    if (!lines.length) {
      lines = [
        { n: 'Harina de trigo', und: 'g', q: 0, p: 0 },
        { n: 'Mantequilla', und: 'g', q: 0, p: 0 },
        { n: 'Aceite vegetal', und: 'ml', q: 0, p: 0 },
      ];
    }
    return samplePayloadWithLogo({
      docType: 'inventario',
      head: 'INVENTARIO / CONTEO',
      nameE: emp.nombreComercial || emp.razonSocial || 'Inventario',
      fecha: fechaPlainNow(),
      lines: lines,
      sub: 0,
      iva: 0,
      tot: 0,
    });
  }

  function sampleSalonPayload(productIds) {
    var lines = listProductosVenta();
    if (productIds && productIds.length) {
      var set = {};
      productIds.forEach(function (id) {
        set[String(id)] = true;
      });
      lines = lines.filter(function (p) {
        return set[String(p.id)];
      });
    }
    var emp = typeof global.config !== 'undefined' && global.config.getEmpresa ? global.config.getEmpresa() : {};
    var first =
      lines[0] ? productoSalonInfo(lines[0]) : productoSalonInfo({ id: 0, nombre: 'Jugo Natural', precio: 8000 });
    return samplePayloadWithLogo({
      head: 'SALON',
      nameE: emp.nombreComercial || emp.razonSocial || 'Tienda',
      nitE: emp.nit || '',
      consecutivo: 'ETQ-' + new Date().toISOString().slice(0, 10),
      fecha: fechaPlainNow(),
      rotuloNombre: first.nombre,
      cliNom: '',
      cliNit: '',
      salonItem: first,
      lines: lines.map(function (p) {
        var info = productoSalonInfo(p);
        return {
          n: info.nombre,
          q: 1,
          p: info.precio,
          pGramo: info.precioGramo,
          gramaje: info.gramaje,
          enDescuento: info.enDescuento,
          precioAnt: info.precioAnterior,
        };
      }),
      sub: 0,
      iva: 0,
      tot: 0,
      pago: '',
      cufe: '',
      qrUrl: '',
    });
  }

  function menuPlatoForPosId(posId) {
    try {
      var rv = global.CrozzoReservorio && global.CrozzoReservorio.migrateLegacy ? global.CrozzoReservorio.migrateLegacy() : null;
      if (!rv || !Array.isArray(rv.menuCostos)) return null;
      var row = rv.menuCostos.find(function (m) {
        return m && m.posProductId != null && m.posProductId === posId;
      });
      if (!row || !global.CrozzoCatalogoMp || typeof global.CrozzoCatalogoMp.normalizeMenuPlato !== 'function') return null;
      return global.CrozzoCatalogoMp.normalizeMenuPlato(row);
    } catch (_) {
      return null;
    }
  }

  function menuVigenteForPosId(posId) {
    try {
      var norm = menuPlatoForPosId(posId);
      if (!norm) return null;
      var hist = norm.historialCosteo || [];
      var vig =
        hist.find(function (h) {
          return h && h.periodo === (global.CrozzoCatalogoMp.PERIODO_COSTEO_VIGENTE || 'vigente');
        }) || hist[0];
      return vig || null;
    } catch (_) {
      return null;
    }
  }

  /** Gramos de venta al cliente (campo «Gramos porción venta»). Sin peso → no $/g en etiqueta. */
  function resolveGramajeVentaSalon(p) {
    if (!p) return 0;
    var g = 0;
    if (p.gramajeVenta != null && Number(p.gramajeVenta) > 0) g = Math.round(Number(p.gramajeVenta));
    else if (p.gramajeVentaGramos != null && Number(p.gramajeVentaGramos) > 0) {
      g = Math.round(Number(p.gramajeVentaGramos));
    } else if (p.pesoPorcionVenta != null && Number(p.pesoPorcionVenta) > 0) {
      g = Math.round(Number(p.pesoPorcionVenta));
    }
    if (g > 0) return g;
    var menu = menuPlatoForPosId(p.id);
    if (menu && menu.gramajeVenta > 0) return Math.round(Number(menu.gramajeVenta));
    return 0;
  }

  /** Precio de venta en caja (catálogo POS), no costo MP ni precio por kg de compras. */
  function resolvePrecioVentaSalon(p) {
    if (!p) return 0;
    var precio = Math.round(Number(p.precio) || 0);
    if (precio <= 0 && p.precioVenta != null) precio = Math.round(Number(p.precioVenta) || 0);
    if (precio <= 0) {
      var menu = menuPlatoForPosId(p.id);
      if (menu && menu.precioVenta > 0) precio = Math.round(Number(menu.precioVenta));
    }
    return precio;
  }

  function salonMuestraPrecioGramo(info) {
    return !!(info && info.gramaje > 0 && info.precioGramo != null && info.precioGramo > 0);
  }

  function productoSalonInfo(p) {
    var precio = resolvePrecioVentaSalon(p);
    var gramaje = resolveGramajeVentaSalon(p);
    var precioAnterior =
      p.precioAnterior != null ? Math.round(Number(p.precioAnterior)) : p.precioAnt != null ? Math.round(Number(p.precioAnt)) : null;
    var vig = menuVigenteForPosId(p.id);
    if (vig && vig.precioVentaAnterior != null && vig.precioVentaAnterior > precio) {
      precioAnterior = Math.round(Number(vig.precioVentaAnterior));
    }
    var precioGramo = gramaje > 0 && precio > 0 ? Math.round(precio / gramaje) : null;
    var enDescuento = !!(precioAnterior && precioAnterior > precio + 0.5) || !!p.enDescuento || !!p.descuento || !!p.enPromo;
    return {
      id: p.id,
      nombre: p.nombreVenta || p.nombre || 'Producto',
      precio: precio,
      gramaje: gramaje,
      precioGramo: precioGramo,
      precioAnterior: precioAnterior,
      enDescuento: enDescuento,
      esProductoVenta: true,
    };
  }

  function sampleBodegaPayload(productoNombre, mpLines, seq) {
    var emp = typeof global.config !== 'undefined' && global.config.getEmpresa ? global.config.getEmpresa() : {};
    return {
      head: 'CONTROL BODEGA',
      nameE: emp.nombreComercial || emp.razonSocial || 'Bodega',
      nitE: emp.nit || '',
      consecutivo: seq || 'MK-DEMO-0001',
      fecha: fechaPlainNow(),
      cliNom: productoNombre || 'Producto terminado',
      cliNit: '',
      marcacionId: seq || 'MK-DEMO-0001',
      bodegaRef: (getFacturacionAdminConfigSafe().bodegaMarcacion || {}).ubicacion || 'Bodega',
      obs: productoNombre || 'Lote de producción',
      mpLines:
        mpLines ||
        [
          { n: 'Harina de trigo', q: 'kg', fe: '30/05/2026', fi: '28/05/2026', fv: '30/06/2026' },
          { n: 'Mantequilla', q: 'g', fe: '29/05/2026', fi: '27/05/2026', fv: '15/07/2026' },
          { n: 'Huevo', q: 'und', fe: '31/05/2026', fi: '30/05/2026', fv: '10/06/2026' },
        ],
      lines: [],
      sub: 0,
      iva: 0,
      tot: 0,
      qrUrl: 'crozzo-bodega:' + encodeURIComponent(seq || 'demo'),
    };
  }

  function getFacturacionAdminConfigSafe() {
    return typeof global.getFacturacionAdminConfig === 'function' ? global.getFacturacionAdminConfig() : {};
  }

  function nextMarcacionId() {
    var conf = getFacturacionAdminConfigSafe();
    var bm = conf.bodegaMarcacion || {};
    var pref = String(bm.prefijo || 'MK').trim() || 'MK';
    var day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    var key = LS_BODEGA_SEQ + '_' + day;
    var n = 1;
    try {
      n = parseInt(localStorage.getItem(key) || '0', 10) + 1;
      localStorage.setItem(key, String(n));
    } catch (_) {
      n = Math.floor(Math.random() * 9999);
    }
    return pref + '-' + day + '-' + String(n).padStart(4, '0');
  }

  function fmtMpDate(v) {
    var s = String(v || '').trim();
    if (!s) return '—';
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      var p = s.slice(0, 10).split('-');
      return p[2] + '/' + p[1] + '/' + p[0];
    }
    return s;
  }

  function mpLineFromRow(mp, overrides) {
    overrides = overrides || {};
    return {
      id: mp.id,
      n: mp.nombre || 'MP',
      q: mp.unidad || mp.und || '',
      fe: fmtMpDate(overrides.fechaElaboracion != null ? overrides.fechaElaboracion : mp.fechaElaboracion),
      fi: fmtMpDate(overrides.fechaIngreso != null ? overrides.fechaIngreso : mp.fechaIngreso),
      fv: fmtMpDate(overrides.fechaVencimiento != null ? overrides.fechaVencimiento : mp.fechaVencimiento),
    };
  }

  function listMateriasPrimas() {
    var out = [];
    try {
      if (global.CrozzoCatalogoMp && typeof global.CrozzoCatalogoMp.list === 'function') {
        global.CrozzoCatalogoMp.list().forEach(function (r) {
          out.push({
            id: r.id,
            nombre: r.nombre || r.nombreMp || 'MP',
            unidad: r.unidad || r.unidadMedida || r.und || '',
            fechaElaboracion: r.fechaElaboracion || '',
            fechaIngreso: r.fechaIngreso || '',
            fechaVencimiento: r.fechaVencimiento || '',
          });
        });
      }
    } catch (_) {}
    if (!out.length && typeof global.config !== 'undefined' && global.config.get) {
      var cat = global.config.get('catalogoProductos') || [];
      cat.forEach(function (p) {
        if (p && p.tipo === 'materia_prima') {
          out.push({
            id: p.id,
            nombre: p.nombre || p.nombreVenta,
            unidad: p.unidad || '',
            fechaElaboracion: p.fechaElaboracion || '',
            fechaIngreso: p.fechaIngreso || '',
            fechaVencimiento: p.fechaVencimiento || p.fechaCaducidad || '',
          });
        }
      });
    }
    return out;
  }

  function mpLinesAll(overridesById) {
    overridesById = overridesById || {};
    return listMateriasPrimas().map(function (mp) {
      return mpLineFromRow(mp, overridesById[mp.id] || {});
    });
  }

  function mpLinesForProduct(productId, productName, opts) {
    opts = opts || {};
    var conf = getFacturacionAdminConfigSafe();
    var bm = conf.bodegaMarcacion || {};
    if (opts.mpLines && opts.mpLines.length) return opts.mpLines;
    if (bm.incluirTodasMp !== false || opts.todasMp) {
      return mpLinesAll(opts.overridesById);
    }
    var lines = [];
    try {
      if (global.CrozzoCatalogoMp && typeof global.CrozzoCatalogoMp.getRecetaForProduct === 'function') {
        var rec = global.CrozzoCatalogoMp.getRecetaForProduct(productId);
        if (rec && rec.lineas) {
          var byId = {};
          listMateriasPrimas().forEach(function (m) {
            byId[m.id] = m;
          });
          rec.lineas.forEach(function (ln) {
            var mp = byId[ln.mpId] || { nombre: ln.nombre || ln.mpNombre || 'MP', unidad: ln.unidad || '' };
            lines.push(mpLineFromRow(mp, opts.overridesById && opts.overridesById[ln.mpId]));
          });
        }
      }
    } catch (_) {}
    if (!lines.length) return mpLinesAll(opts.overridesById);
    if (!lines.length && productName) {
      lines.push({ n: 'Materia prima asociada', q: 'Revisar catálogo MP', fe: '—', fi: '—', fv: '—' });
    }
    return lines;
  }

  function listProductosVenta() {
    var out = [];
    try {
      var prods =
        typeof global.products !== 'undefined'
          ? global.products
          : typeof products !== 'undefined'
            ? products
            : null;
      if (Array.isArray(prods)) {
        prods.forEach(function (p) {
          if (!p || p.activo === false || p.tipo === 'materia_prima') return;
          out.push({
            id: p.id,
            nombre: p.nombre,
            nombreVenta: p.nombreVenta,
            precio: Number(p.precio) || 0,
            gramajeVenta: p.gramajeVenta,
            porcionGramos: p.porcionGramos,
            precioAnterior: p.precioAnterior != null ? Number(p.precioAnterior) : null,
            enDescuento: !!p.enDescuento || !!p.descuento,
          });
        });
      }
    } catch (_) {}
    if (!out.length) {
      try {
        var cat = typeof global.config !== 'undefined' && global.config.get ? global.config.get('catalogoProductos') || [] : [];
        cat.forEach(function (p) {
          if (!p || p.activo === false || p.tipo === 'materia_prima') return;
          out.push({
            id: p.id,
            nombre: p.nombre,
            nombreVenta: p.nombreVenta,
            precio: Number(p.precio) || 0,
            gramajeVenta: p.gramajeVenta,
            porcionGramos: p.porcionGramos,
            precioAnterior: p.precioAnterior != null ? Number(p.precioAnterior) : null,
            enDescuento: !!p.enDescuento || !!p.descuento,
          });
        });
      } catch (_) {}
    }
    return out.sort(function (a, b) {
      return String(a.nombre).localeCompare(String(b.nombre), 'es');
    });
  }

  function collectMpMarcacionFromUi() {
    var lines = [];
    var overridesById = {};
    document.querySelectorAll('[data-bodega-mp-row]').forEach(function (row) {
      var id = row.getAttribute('data-bodega-mp-id');
      if (!id) return;
      var fe = row.querySelector('[data-bodega-fe]');
      var fi = row.querySelector('[data-bodega-fi]');
      var fv = row.querySelector('[data-bodega-fv]');
      var nom = row.querySelector('[data-bodega-mp-nom]');
      var und = row.getAttribute('data-bodega-mp-und') || '';
      overridesById[id] = {
        fechaElaboracion: fe ? fe.value : '',
        fechaIngreso: fi ? fi.value : '',
        fechaVencimiento: fv ? fv.value : '',
      };
      lines.push({
        id: id,
        n: nom ? nom.textContent : 'MP',
        q: und,
        fe: fmtMpDate(overridesById[id].fechaElaboracion),
        fi: fmtMpDate(overridesById[id].fechaIngreso),
        fv: fmtMpDate(overridesById[id].fechaVencimiento),
      });
    });
    return { lines: lines, overridesById: overridesById };
  }

  function persistMpTrazabilidadFromUi() {
    var collected = collectMpMarcacionFromUi();
    if (!global.CrozzoCatalogoMp || typeof global.CrozzoCatalogoMp.patchTrazabilidad !== 'function') return 0;
    var n = 0;
    Object.keys(collected.overridesById).forEach(function (id) {
      var o = collected.overridesById[id];
      if (!o.fechaElaboracion && !o.fechaIngreso && !o.fechaVencimiento) return;
      global.CrozzoCatalogoMp.patchTrazabilidad(id, o);
      n++;
    });
    return n;
  }

  function pushMarcacionHistorial(entry) {
    var conf = getFacturacionAdminConfigSafe();
    var bm = Object.assign({}, conf.bodegaMarcacion || {});
    var hist = Array.isArray(bm.historial) ? bm.historial.slice() : [];
    hist.unshift(entry);
    if (hist.length > 50) hist = hist.slice(0, 50);
    bm.historial = hist;
    if (typeof global.config !== 'undefined' && global.config.set) {
      global.config.set('facturacionAdmin', Object.assign({}, conf, { bodegaMarcacion: bm }));
    }
  }

  function printThermalJob(tpl, payload, opts) {
    opts = opts || {};
    var outId = normalizePrintOutput(
      opts.printOutput || (tpl && tpl.printOutput) || (opts.paperSz === '58' ? 'roll_58' : 'roll_80')
    );
    tpl = tplForPrintOutput(tpl, outId);
    opts = buildPrintOpts(opts, outId);
    var meta = printOutputMeta(outId);
    if (meta.kind === 'sheet' && typeof global.crozzoPrintTemplateHtml === 'function') {
      return global.crozzoPrintTemplateHtml(tpl, payload, opts);
    }
    if (typeof global.crozzoPrintEscPosTemplate === 'function') {
      return global.crozzoPrintEscPosTemplate(tpl, payload, opts);
    }
    if (meta.kind === 'roll' && typeof global.crozzoPrintRollLabelsHtml === 'function') {
      return global.crozzoPrintRollLabelsHtml([{ tpl: tpl, payload: payload, opts: opts }], opts);
    }
    if (typeof global.crozzoTermicaRenderPlantillaHtml === 'function' && typeof global.crozzoPrintThermalContent === 'function') {
      var html = global.crozzoTermicaRenderPlantillaHtml(tpl, payload);
      return global.crozzoPrintThermalContent(html, tpl.sz === '58' ? '58mm' : '80mm', {
        printer: opts.printer,
        copies: opts.copies || 1,
        allowDialog: opts.allowDialog !== false,
        silent: opts.silent === true,
      });
    }
    return Promise.resolve(false);
  }

  function printSequentialJobs(jobs) {
    jobs = jobs || [];
    if (!jobs.length) return Promise.resolve({ ok: false, count: 0 });
    var jobOut = 'roll_80';
    if (jobs[0]) {
      jobOut = normalizePrintOutput(
        (jobs[0].opts && jobs[0].opts.printOutput) ||
          (jobs[0].tpl && jobs[0].tpl.printOutput) ||
          'roll_80'
      );
    }
    if (printOutputMeta(jobOut).kind === 'sheet' && typeof global.crozzoPrintBatchLabelsHtml === 'function') {
      var batchOpts = jobs[0].opts || {};
      batchOpts = Object.assign({}, batchOpts, {
        pageFormat: printOutputMeta(jobOut).page,
        landscape: false,
        printOutput: jobOut,
      });
      return global.crozzoPrintBatchLabelsHtml(jobs, batchOpts).then(function (ok) {
        return { ok: !!ok, count: ok ? jobs.length : 0 };
      });
    }
    var chain = Promise.resolve(true);
    var nOk = 0;
    jobs.forEach(function (job) {
      chain = chain.then(function (prevOk) {
        if (!prevOk) return false;
        return printThermalJob(job.tpl, job.payload, job.opts).then(function (ok) {
          if (ok) nOk++;
          return ok;
        });
      });
    });
    return chain.then(function (lastOk) {
      return { ok: !!lastOk && nOk > 0, count: nOk };
    });
  }

  function bodegaRotuloPayload(nombre, emp) {
    var payload = {
      rotuloNombre: nombre || 'Producto',
      nameE: emp.nombreComercial || emp.razonSocial || 'Bodega',
      nitE: emp.nit || '',
      head: 'ROTULO BODEGA',
      lines: [],
      sub: 0,
      iva: 0,
      tot: 0,
    };
    if (typeof global.crozzoResolveTicketLogoUrl === 'function') {
      payload.logoUrl = global.crozzoResolveTicketLogoUrl();
    }
    return payload;
  }

  function collectMpRotuloSelectionFromUi() {
    var items = [];
    var rows = document.querySelectorAll('[data-bodega-mp-row]');
    if (!rows.length) return items;
    var anyChecked = false;
    rows.forEach(function (row) {
      var cb = row.querySelector('[data-bodega-mp-sel], .bodega-mp-sel, input[type="checkbox"]');
      if (cb && cb.checked) anyChecked = true;
    });
    rows.forEach(function (row) {
      var cb = row.querySelector('[data-bodega-mp-sel], .bodega-mp-sel, input[type="checkbox"]');
      if (anyChecked && cb && !cb.checked) return;
      var nom = row.querySelector('[data-bodega-mp-nom]');
      items.push({ nombre: nom ? nom.textContent.trim() : 'MP', id: row.getAttribute('data-bodega-mp-id') || '' });
    });
    return items;
  }

  function resolveMpItemsForBodegaPrint(opts) {
    opts = opts || {};
    if (opts.items && opts.items.length) return Promise.resolve(opts.items);
    var fromUi = collectMpRotuloSelectionFromUi();
    if (fromUi.length) return Promise.resolve(fromUi);
    return ensureCostosBundle().then(function () {
      fromUi = collectMpRotuloSelectionFromUi();
      if (fromUi.length) return fromUi;
      var mps = listMateriasPrimas();
      if (!mps.length) return [];
      if (global.showToast) {
        global.showToast('Imprimiendo ' + mps.length + ' materia(s) prima del catálogo.', 'info');
      }
      return mps.map(function (m) {
        return { nombre: m.nombre, id: m.id };
      });
    });
  }

  function printBodegaRotulos(opts) {
    opts = opts || {};
    var modo = opts.modo === 'entrada' ? 'entrada' : 'rotulo';
    return ensurePrintersReady().then(function () {
      return resolveMpItemsForBodegaPrint(opts);
    }).then(function (items) {
      if (!items.length) {
        if (global.showToast) {
          global.showToast(
            'No hay MP para rotular. Marque insumos en la tabla, cargue Catálogo MP o use «Marcar todos».',
            'warning'
          );
        }
        return { ok: false, count: 0 };
      }
      var conf = getFacturacionAdminConfigSafe();
      var emp = typeof global.config !== 'undefined' && global.config.getEmpresa ? global.config.getEmpresa() : {};
      var outputId = normalizePrintOutput(opts.printOutput || getPrintOutput('bodega'));
      var tpl = tplForPrintOutput(getPlantillaBodega(modo, conf), outputId);
      tpl.docType = modo === 'entrada' ? 'bodega_entrada' : 'bodega';
      var printer = resolvePrinterForOutput(outputId, conf, 'bodega');
      var printRole = printRoleForOutput(outputId, conf, 'bodega');
      var seq = opts.secuencia || nextMarcacionId();
      var jobs = items.map(function (it) {
        return {
          tpl: tpl,
          payload: bodegaRotuloPayload(it.nombre, emp),
          opts: buildPrintOpts(
            {
              printer: printer,
              copies: 1,
              role: printRole,
              kind: modo === 'entrada' ? 'bodega_entrada' : 'bodega_rotulo',
              toast: true,
            },
            outputId
          ),
        };
      });
      pushMarcacionHistorial({
        id: seq,
        at: new Date().toISOString(),
        producto: modo === 'entrada' ? 'Entrada bodega' : 'Rótulos FE/FI/FV',
        mpCount: items.length,
        modo: modo,
      });
      return printSequentialJobs(jobs).then(function (r) {
        if (r.ok && global.showToast) {
          global.showToast(
            (modo === 'entrada' ? 'Rótulos entrada' : 'Rótulos bodega') + ': ' + r.count + ' etiqueta(s) impresa(s).',
            'success'
          );
        } else if (!r.ok) {
          printFailToast(modo === 'entrada' ? 'Entrada bodega' : 'Rótulos bodega');
        }
        return Object.assign({ seq: seq }, r);
      });
    });
  }

  function printBodegaMarcacion(opts) {
    return printBodegaRotulos(Object.assign({ modo: 'rotulo' }, opts || {}));
  }

  function printSalonEtiquetas(opts) {
    opts = opts || {};
    var conf = getFacturacionAdminConfigSafe();
    var productos = listProductosVenta();
    if (opts.productIds && opts.productIds.length) {
      var set = {};
      opts.productIds.forEach(function (id) {
        set[String(id)] = true;
      });
      productos = productos.filter(function (p) {
        return set[String(p.id)];
      });
    }
    if (opts.maxItems && productos.length > opts.maxItems) {
      productos = productos.slice(0, opts.maxItems);
    }
    if (!productos.length) {
      if (global.showToast) global.showToast('No hay productos para etiquetar.', 'warning');
      return Promise.resolve({ ok: false, count: 0 });
    }
    var outputId = normalizePrintOutput(opts.printOutput || getPrintOutput('salon'));
    var tpl = tplForPrintOutput(getPlantilla('salon', conf), outputId);
    var printer = resolvePrinterForOutput(outputId, conf, 'salon');
    var printRole = printRoleForOutput(outputId, conf, 'salon');
    var emp = typeof global.config !== 'undefined' && global.config.getEmpresa ? global.config.getEmpresa() : {};
    var jobs = productos.map(function (p) {
      var info = productoSalonInfo(p);
      var payload = samplePayloadWithLogo({
        head: opts.titulo || 'SALON',
        nameE: emp.nombreComercial || emp.razonSocial || 'Tienda',
        fecha: fechaPlainNow(),
        rotuloNombre: info.nombre,
        salonItem: info,
        lines: [],
        sub: 0,
        iva: 0,
        tot: 0,
      });
      return {
        tpl: tpl,
        payload: payload,
        opts: buildPrintOpts({ printer: printer, copies: 1, role: printRole, kind: 'salon_etiqueta' }, outputId),
      };
    });
    return printSequentialJobs(jobs).then(function (r) {
      if (r.ok && global.showToast) global.showToast('Etiquetas salón: ' + r.count + ' impresa(s).', 'success');
      return r;
    });
  }

  function printSalonLista(opts) {
    return printSalonEtiquetas(opts);
  }

  function refreshDocTypeUi() {
    var docType = activeDocType();
    var tplKey = studioTplKey();
    ensureEditorReady(docType);
    var conf = getFacturacionAdminConfigSafe();

    var docSel = document.getElementById('crozzoPsDocSelect');
    if (docSel) docSel.value = tplKey;

    var tpl = getPlantilla(tplKey, conf);
    var presetId = getActivePresetId(tplKey, conf);
    var presetMeta = global.CrozzoPrintPresets ? global.CrozzoPrintPresets.getPresetMeta(presetId) : null;
    var status = document.getElementById('crozzoPsTplStatus');
    if (status) {
      status.textContent =
        (tpl.name || (presetMeta && presetMeta.label) || 'Ticket') +
        ' · ' +
        (tpl.blocks ? tpl.blocks.length : 0) +
        ' bloques · ' +
        (tpl.sz || '80') +
        ' mm';
    }

    var presetSel = document.getElementById('crozzoPsPresetSelect');
    if (presetSel) {
      presetSel.value = getActivePresetId(tplKey, conf);
      var hint = document.getElementById('crozzoPsPresetHint');
      if (hint && global.CrozzoPrintPresets) {
        var pm = global.CrozzoPrintPresets.getPresetMeta(presetSel.value);
        if (pm) hint.textContent = pm.desc || '';
      }
    }

    var ta = document.getElementById('adminTermicaPlantillaJson');
    if (ta) ta.value = JSON.stringify(tpl, null, 2);
    updateTplStatusUi(tpl, presetId);
    refreshMiniPreview(tpl);

    ensureDesignerIframeLoaded(function () {
      pushTplToDesigner(tpl, 0);
    });
  }

  function syncDesignerIframe() {
    var conf = getFacturacionAdminConfigSafe();
    pushTplToDesigner(getPlantilla(studioTplKey(), conf), 0);
  }

  function persistActiveTplFromJson(raw) {
    var docType = activeDocType();
    var tplKey = studioTplKey();
    try {
      var parsed = JSON.parse(raw);
      var savedPo = parsed && parsed.printOutput ? normalizePrintOutput(parsed.printOutput) : null;
      var tpl = polishTplForDocType(parsed, tplKey);
      if (!tpl) return false;
      if (savedPo) tpl.printOutput = savedPo;
      tpl.docType = tplKey;
      var conf = getFacturacionAdminConfigSafe();
      var plantillas = Object.assign({}, conf.termicaPlantillas || {});
      var modos = Object.assign({}, conf.termicaModos || {});
      plantillas[tplKey] = tpl;
      modos[tplKey] = 'personalizada';
      var presets = Object.assign({}, conf.termicaPresets || {});
      if (tpl.presetId) presets[docType] = tpl.presetId;
      if (typeof global.config !== 'undefined' && global.config.set) {
        global.config.set(
          'facturacionAdmin',
          Object.assign({}, conf, {
            termicaPlantillas: plantillas,
            termicaModos: modos,
            termicaPresets: presets,
            termicaModo: docType === 'factura' ? 'personalizada' : conf.termicaModo,
            termicaPlantilla: docType === 'factura' ? tpl : conf.termicaPlantilla,
          })
        );
      }
      if (typeof global.schedulePosRuntimeSave === 'function') global.schedulePosRuntimeSave();
      return true;
    } catch (_) {
      return false;
    }
  }

  function migrateLegacyBodegaSalonTpl(tpl, docType) {
    if (!tpl || !tpl.blocks || !tpl.blocks.length) return tpl;
    var has = function (t) {
      return tpl.blocks.some(function (b) {
        return b && b.t === t && b.v !== false;
      });
    };
    if ((docType === 'bodega' || docType === 'bodega_entrada') && !has('rotulo_nombre') && (has('mp_lines') || has('marcacion'))) {
      return docType === 'bodega_entrada' ? defaultTplBodegaEntrada() : defaultTplBodega();
    }
    if (docType === 'salon' && !has('salon_etiqueta') && has('items')) {
      return defaultTplSalon();
    }
    return tpl;
  }

  function renderStudioHubPanel(conf) {
    conf = normalizePlantillas(conf);
    var active = activeDocType();
    var tplKey = active === 'bodega' && global.__crozzoPrintStudioBodegaTplKey === 'bodega_entrada' ? 'bodega_entrada' : active;

    var tpl = getPlantilla(tplKey, conf);
    var blocks = tpl && tpl.blocks ? tpl.blocks.length : 0;
    var presetMeta = global.CrozzoPrintPresets
      ? global.CrozzoPrintPresets.getPresetMeta(getActivePresetId(active, conf))
      : null;
    var statusLabel =
      (tpl.name || (presetMeta && presetMeta.label) || 'Ticket') + ' · ' + blocks + ' bloques · ' + (tpl.sz || '80') + ' mm';

    var printerList =
      typeof global.getAvailablePrintersList === 'function' ? global.getAvailablePrintersList() : [];
    var cajaPrn = conf.impresoraCajaPos || '';
    var prOpts = printerList
      .map(function (p) {
        return '<option value="' + esc(p) + '"' + (cajaPrn === p ? ' selected' : '') + '>' + esc(p) + '</option>';
      })
      .join('');

    return (
      '<div class="crozzo-print-studio">' +
      '<div class="crozzo-print-studio__head">' +
      '<div class="crozzo-print-studio__head-text">' +
      '<h3>Personalización de tickets</h3>' +
      '<p>Modelo base y edición visual. En el editor use la plantilla <strong>🇨🇴 Factura DIAN completa</strong>: los bloques con ↻ se llenan solos (Empresa + DIAN). Bloque <strong>✂ Corte aquí</strong> al final.</p>' +
      '</div>' +
      '<span class="crozzo-print-studio__sz-badge" id="crozzoPsSzBadge" title="Ancho papel (editor)">' +
      esc(tpl.printOutput ? printOutputLabel(tpl.printOutput) : (tpl.sz || '80') + ' mm') +
      '</span>' +
      '</div>' +
      '<div class="crozzo-print-studio__toolbar">' +
      '<div class="crozzo-print-studio__field">' +
      '<label class="crozzo-print-studio__label" for="crozzoPsDocSelect">Documento</label>' +
      '<select class="form-select crozzo-print-studio__select" id="crozzoPsDocSelect" onchange="CrozzoPrintStudioHub.selectDocType(this.value)">' +
      renderDocTypeSelect(tplKey) +
      '</select></div>' +
      renderPresetPicker(conf, tplKey) +
      '<div class="crozzo-print-studio__field">' +
      '<label class="crozzo-print-studio__label" for="crozzoPsStudioPrinter">Impresora</label>' +
      '<select class="form-select crozzo-print-studio__select" id="crozzoPsStudioPrinter">' +
      '<option value="">— Elija impresora —</option>' +
      prOpts +
      '</select></div>' +
      '<div class="crozzo-print-studio__actions">' +
      '<button type="button" class="btn btn-primary" id="crozzoPsBtnTestPrint">Probar impresión</button>' +
      '<button type="button" class="btn btn-outline" id="crozzoPsBtnApplyDesign">Aplicar diseño</button>' +
      '<button type="button" class="btn btn-link" onclick="crozzoOpenTicketDesignerTab()">Editor ampliado</button>' +
      '</div></div>' +
      '<div class="crozzo-print-studio__statusbar">' +
      '<span class="crozzo-print-studio__meta" id="crozzoPsTplStatus">' +
      esc(statusLabel) +
      '</span>' +
      '<span class="crozzo-print-studio__unsaved" id="crozzoPsUnsavedBadge" hidden>Cambios sin guardar</span>' +
      '<span class="crozzo-print-studio__sync" id="adminTermicaStudioStatus">Cargando editor…</span>' +
      '</div>' +
      '<div class="crozzo-print-studio__workspace crozzo-print-studio__workspace--solo-editor">' +
      '<div class="crozzo-print-studio__editor-pane">' +
      '<div class="crozzo-print-studio__editor-label">Editor · clic en el ticket para editar cada bloque</div>' +
      '<textarea id="adminTermicaPlantillaJson" class="form-input" style="display:none;" aria-hidden="true"></textarea>' +
      '<div class="crozzo-print-studio__editor" id="crozzoPsEditorFrame">' +
      '<div class="crozzo-print-studio__loader" id="crozzoPsEditorLoading" aria-live="polite">Preparando editor…</div>' +
      '<iframe id="crozzoTicketDesignerIframe" title="Editor de tickets" src="about:blank" data-crozzo-designer="1"></iframe>' +
      '</div></div></div></div>'
    );
  }

  function renderBodegaPanel(conf) {
    conf = normalizePlantillas(conf);
    var bm = conf.bodegaMarcacion || {};
    var hist = Array.isArray(bm.historial) ? bm.historial : [];
    var productos = listProductosVenta();
    var mps = listMateriasPrimas();
    var prodOpts = productos
      .map(function (p) {
        return '<option value="' + esc(p.id) + '">' + esc(p.nombre) + '</option>';
      })
      .join('');
    var mpRows = mps.length
      ? mps
          .map(function (m) {
            return (
              '<tr data-bodega-mp-row data-bodega-mp-id="' +
              esc(m.id) +
              '" data-bodega-mp-und="' +
              esc(m.unidad) +
              '"><td><label class="crozzo-salon-check"><input type="checkbox" class="bodega-mp-sel" data-bodega-mp-sel checked> ' +
              '<span data-bodega-mp-nom>' +
              esc(m.nombre) +
              '</span></label></td><td><input type="date" class="form-input crozzo-bodega-date" data-bodega-fe value="' +
              esc(m.fechaElaboracion || '') +
              '" title="F.E elaboración (opcional, catálogo)"></td><td><input type="date" class="form-input crozzo-bodega-date" data-bodega-fi value="' +
              esc(m.fechaIngreso || '') +
              '" title="F.I ingreso"></td><td><input type="date" class="form-input crozzo-bodega-date" data-bodega-fv value="' +
              esc(m.fechaVencimiento || '') +
              '" title="F.V vencimiento"></td></tr>'
            );
          })
          .join('')
      : '<tr><td colspan="4" class="form-hint">Sin materia prima en catálogo MP. Cargue insumos en Costos → Catálogo MP.</td></tr>';
    var histRows = hist.length
      ? hist
          .slice(0, 12)
          .map(function (h) {
            return (
              '<tr><td><code>' +
              esc(h.id) +
              '</code></td><td>' +
              esc(h.producto) +
              '</td><td>' +
              (h.mpCount || 0) +
              ' MP</td><td style="font-size:0.75rem;">' +
              esc((h.at || '').slice(0, 16).replace('T', ' ')) +
              '</td></tr>'
            );
          })
          .join('')
      : '<tr><td colspan="4" class="form-hint">Sin marcaciones aún — genere la primera secuencia.</td></tr>';

    var printerList =
      typeof global.getAvailablePrintersList === 'function' ? global.getAvailablePrintersList() : [];
    var prOpts = printerList
      .map(function (p) {
        return '<option value="' + esc(p) + '" ' + (conf.impresoraBodega === p ? 'selected' : '') + '>' + esc(p) + '</option>';
      })
      .join('');

    return (
      '<div class="crozzo-print-panel crozzo-bodega-panel">' +
      '<h3 class="crozzo-print-panel__title">Bodega · rótulos y control</h3>' +
      '<p class="crozzo-print-card__lead"><strong>Rótulo producto:</strong> logo + nombre + líneas en blanco <strong>FE / FI / FV</strong> para llenar a mano y pegar (corte entre cada insumo). <strong>Entrada bodega:</strong> solo nombre, sin fechas, para la puerta. Diseño: <button type="button" class="btn btn-link" onclick="crozzoFacturasAdminSetTab(\'estudio\');CrozzoPrintStudioHub.selectDocType(\'bodega\')">Rótulo</button> · <button type="button" class="btn btn-link" onclick="crozzoFacturasAdminSetTab(\'estudio\');CrozzoPrintStudioHub.selectDocType(\'bodega_entrada\')">Entrada</button>.</p>' +
      '<div class="crozzo-bodega-flow">' +
      '<section class="crozzo-bodega-block">' +
      '<div class="crozzo-bodega-block__body">' +
      '<h4 class="crozzo-bodega-block__title">Referencia (opcional)</h4>' +
      '<label class="form-label">Producto terminado / lote</label>' +
      '<select class="form-select" id="bodegaProductoSelect"><option value="">— Solo MP de bodega —</option>' +
      prodOpts +
      '</select>' +
      '<label class="crozzo-print-check" style="margin-top:10px;display:flex;align-items:center;gap:8px;">' +
      '<input type="checkbox" id="bodegaIncluirTodasMp" ' +
      (bm.incluirTodasMp !== false ? 'checked' : '') +
      '><span>Incluir <strong>todas</strong> las materias primas del catálogo</span></label>' +
      '</div></section>' +
      '<section class="crozzo-bodega-block">' +
      '<div class="crozzo-bodega-block__body">' +
      '<h4 class="crozzo-bodega-block__title">Datos de etiqueta</h4>' +
      '<div class="form-grid">' +
      '<div class="form-group"><label class="form-label">Código (prefijo)</label>' +
      '<input class="form-input" id="bodegaPrefijo" value="' +
      esc(bm.prefijo || 'MK') +
      '"></div>' +
      '<div class="form-group"><label class="form-label">Ubicación</label>' +
      '<input class="form-input" id="bodegaUbicacion" value="' +
      esc(bm.ubicacion || 'Bodega principal') +
      '"></div>' +
      '<div class="form-group"><label class="form-label">Impresora</label>' +
      '<select class="form-select" id="bodegaPrinterSelect"><option value="">Igual que caja</option>' +
      prOpts +
      '</select></div>' +
      '</div></div></section>' +
      '<section class="crozzo-bodega-block">' +
      '<div class="crozzo-bodega-block__body">' +
      '<h4 class="crozzo-bodega-block__title">Materia prima · fechas</h4>' +
      '<div class="crozzo-table-wrap crozzo-bodega-mp-table-wrap">' +
      '<div class="crozzo-salon-toolbar" style="margin-bottom:8px;">' +
      '<button type="button" class="btn btn-link" onclick="CrozzoPrintStudioHub.bodegaToggleAll(true)">Marcar todos</button>' +
      '<button type="button" class="btn btn-link" onclick="CrozzoPrintStudioHub.bodegaToggleAll(false)">Ninguno</button>' +
      '</div>' +
      '<table class="data-table crozzo-bodega-mp-table">' +
      '<thead><tr><th>Imprimir</th><th>FE cat.</th><th>FI cat.</th><th>FV cat.</th></tr></thead><tbody id="bodegaMpTbody">' +
      mpRows +
      '</tbody></table></div>' +
      '<p class="form-hint">Las fechas del catálogo son opcionales; en el rótulo para pegar van <strong>en blanco</strong> para escribir a mano.</p>' +
      '</div></section>' +
      '<section class="crozzo-bodega-block crozzo-bodega-block--action">' +
      '<div class="crozzo-bodega-block__body">' +
      renderPrintOutputPicker('bodega', savedPrintOutput('bodega')) +
      '<p class="form-hint">El mismo formato aplica a <strong>rótulos</strong> y <strong>entrada bodega</strong>. Elija 80 mm para térmica; Carta u Oficio para impresora normal.</p>' +
      '<div class="crozzo-bodega-actions">' +
      '<button type="button" class="btn btn-primary" onclick="CrozzoPrintStudioHub.runBodegaRotulos()">Imprimir rótulos (FE·FI·FV en blanco)</button>' +
      '<button type="button" class="btn btn-outline" onclick="CrozzoPrintStudioHub.runBodegaEntrada()">Imprimir entrada bodega (sin fechas)</button>' +
      '<button type="button" class="btn btn-outline" onclick="CrozzoPrintStudioHub.saveMpFechas()">Guardar fechas en catálogo</button>' +
      '<button type="button" class="btn btn-link" onclick="CrozzoPrintStudioHub.previewMarcacion()">Ver siguiente código</button>' +
      '</div>' +
      '<p class="crozzo-bodega-preview" id="bodegaMarcacionPreview"></p>' +
      '</div></section></div>' +
      '<div class="crozzo-bodega-history card">' +
      '<div class="card-header"><span class="card-title">Últimas marcaciones</span></div>' +
      '<div class="crozzo-table-wrap"><table class="data-table crozzo-bodega-table">' +
      '<thead><tr><th>Código</th><th>Referencia</th><th>MP</th><th>Fecha</th></tr></thead><tbody id="bodegaHistorialBody">' +
      histRows +
      '</tbody></table></div></div></div>'
    );
  }

  function previewInventarioConteo() {
    return ensureCostosBundle().then(function (C) {
      if (C && typeof C.previewInventarioConteo === 'function') {
        return C.previewInventarioConteo();
      }
      if (global.showToast) {
        global.showToast('Abra Costos → Inventario continuo o espere a que cargue el módulo.', 'warning');
      }
      return false;
    });
  }

  function runInventarioPrint(kind) {
    if (kind === 'catalogo' && typeof global.crozzoRepPrintInventarioCatalogo === 'function') {
      global.crozzoRepPrintInventarioCatalogo();
      return Promise.resolve(true);
    }
    return ensureCostosBundle().then(function (C) {
      if (!C) {
        if (global.showToast) {
          global.showToast(
            'No se cargó el módulo de inventario. Vaya a Costos → Inventario o espere unos segundos e intente de nuevo.',
            'warning'
          );
        }
        return false;
      }
      var snap = typeof C.buildInventarioSnapshot === 'function' ? C.buildInventarioSnapshot() : null;
      if (!snap || !snap.items || !snap.items.length) {
        var hubMps = listMateriasPrimas();
        if (hubMps.length) {
          snap = {
            items: hubMps.map(function (m) {
              return {
                mpId: m.id,
                nombre: m.nombre,
                categoria: 'OTRO',
                und: m.unidad || 'GR',
                undLabel: m.unidad || 'und',
                precioUnit: 0,
                inicial: 0,
                entradas: 0,
                salidas: 0,
                teorico: 0,
                valor: 0,
                movCount: 0,
              };
            }),
            stats: { totalMp: hubMps.length, conMov: 0, movCount: 0, valorTotal: 0 },
            movs: [],
          };
        }
      }
      if (!snap || !snap.items || !snap.items.length) {
        if (global.showToast) {
          global.showToast('No hay materias primas en el catálogo. Cargue MP en Costos o Catálogo MP.', 'warning');
        }
        return false;
      }
      var items =
        typeof C.inventarioItemsForPrint === 'function' ? C.inventarioItemsForPrint(snap) : snap.items;
      var printOpts = getInventarioPrintOpts();
      if (kind === 'conteo' && typeof C.printInventarioConteo === 'function') {
        return C.printInventarioConteo(items, { printOpts: printOpts });
      }
      if (kind === 'stock' && typeof C.printInventarioStock === 'function') {
        return C.printInventarioStock(items, snap, { printOpts: printOpts });
      }
      if (kind === 'completo' && typeof C.printInventarioCompleto === 'function') {
        return C.printInventarioCompleto(items, snap, { printOpts: printOpts });
      }
      if (kind === 'movs' && typeof C.printInventarioMovs === 'function') {
        return C.printInventarioMovs(snap, { printOpts: printOpts });
      }
      if (global.showToast) global.showToast('Función de impresión no disponible.', 'warning');
      return false;
    });
  }

  function renderInventarioPanel(conf) {
    conf = normalizePlantillas(conf);
    return (
      '<div class="crozzo-print-panel crozzo-inventario-panel">' +
      '<h3 class="crozzo-print-panel__title">Inventario · hojas y conteo</h3>' +
      '<p class="crozzo-print-card__lead">Formatos: <strong>58/80 mm</strong> térmica bodega · <strong>Carta/Oficio</strong> láser caja. Conteo en blanco, stock, movimientos y CSV/HTML de prueba en Costos → Inventario.</p>' +
      renderPrintOutputPicker('inventario', savedPrintOutput('inventario'), ['roll_58', 'roll_80', 'carta', 'oficio']) +
      '<div class="crozzo-inventario-actions" style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0;">' +
      '<button type="button" class="btn btn-outline" onclick="CrozzoPrintStudioHub.previewInventarioConteo()">👁 Ver hoja en pantalla</button>' +
      '<button type="button" class="btn btn-primary" onclick="CrozzoPrintStudioHub.runInventarioPrint(\'conteo\')">🖨 Imprimir conteo</button>' +
      '<button type="button" class="btn btn-outline" onclick="CrozzoPrintStudioHub.runInventarioPrint(\'stock\')">Stock teórico</button>' +
      '<button type="button" class="btn btn-outline" onclick="CrozzoPrintStudioHub.runInventarioPrint(\'completo\')">Listado completo</button>' +
      '<button type="button" class="btn btn-outline" onclick="CrozzoPrintStudioHub.runInventarioPrint(\'movs\')">Movimientos</button>' +
      '<button type="button" class="btn btn-outline" onclick="CrozzoPrintStudioHub.runInventarioPrint(\'catalogo\')">Catálogo POS (productos)</button>' +
      '</div>' +
      '<p class="form-hint">Hoja <strong>horizontal</strong>. El formato elegido arriba aplica también en Costos → Inventario continuo.</p>' +
      '<button type="button" class="btn btn-link" onclick="renderPage(\'costos-inventario\')">Ir a Costos → Inventario continuo</button>' +
      '</div>'
    );
  }

  function renderSalonPanel(conf) {
    conf = normalizePlantillas(conf);
    var productos = listProductosVenta();
    var rows = productos.length
      ? productos
          .map(function (p) {
            var info = productoSalonInfo(p);
            var precio =
              typeof global.crozzoTermicaFmtCOP === 'function'
                ? global.crozzoTermicaFmtCOP(info.precio)
                : '$' + Math.round(info.precio);
            var pGramo = salonMuestraPrecioGramo(info)
              ? typeof global.crozzoTermicaFmtCOP === 'function'
                ? global.crozzoTermicaFmtCOP(info.precioGramo) + '/g'
                : '$' + info.precioGramo + '/g'
              : '—';
            var desc = info.enDescuento
              ? '<span class="crozzo-salon-desc">OFERTA</span>'
              : '<span class="form-hint">Precio normal</span>';
            return (
              '<tr><td><label class="crozzo-salon-check"><input type="checkbox" class="salon-prod-cb" value="' +
              esc(p.id) +
              '" checked> ' +
              esc(info.nombre) +
              '</label></td><td style="text-align:right;font-weight:700;">' +
              esc(precio) +
              '</td><td style="text-align:right;font-size:0.85rem;">' +
              esc(pGramo) +
              (info.gramaje ? ' <span class="form-hint">(' + info.gramaje + ' g)</span>' : '') +
              '</td><td>' +
              desc +
              '</td></tr>'
            );
          })
          .join('')
      : '<tr><td colspan="4" class="form-hint">No hay productos de venta en el catálogo POS.</td></tr>';
    var printerList =
      typeof global.getAvailablePrintersList === 'function' ? global.getAvailablePrintersList() : [];
    var prOpts = printerList
      .map(function (p) {
        return '<option value="' + esc(p) + '" ' + (conf.impresoraSalon === p || conf.impresoraCajaPos === p ? 'selected' : '') + '>' + esc(p) + '</option>';
      })
      .join('');
    return (
      '<div class="crozzo-print-panel crozzo-salon-panel">' +
      '<h3 class="crozzo-print-panel__title">Salón · etiquetas góndola</h3>' +
      '<p class="crozzo-print-card__lead">Etiqueta de <strong>precio de venta</strong> (nombre del producto, precio de caja y <strong>$/g</strong> solo con «Gramos porción venta»). Sin FE/FI/FV de bodega. Diseño en <button type="button" class="btn btn-link" onclick="crozzoFacturasAdminSetTab(\'estudio\');CrozzoPrintStudioHub.selectDocType(\'salon\')">Diseño → Salón</button>.</p>' +
      '<div class="form-grid" style="margin-bottom:12px;">' +
      '<div class="form-group"><label class="form-label">Título en ticket</label>' +
      '<input class="form-input" id="salonTitulo" value="SALON · VENTA" placeholder="Ej: Mostrador salón"></div>' +
      '<div class="form-group"><label class="form-label">Impresora</label>' +
      '<select class="form-select" id="salonPrinterSelect"><option value="">Igual que caja</option>' +
      prOpts +
      '</select></div></div>' +
      '<div class="crozzo-salon-toolbar">' +
      '<input type="search" class="form-input" id="salonBuscar" placeholder="Buscar producto…" oninput="CrozzoPrintStudioHub.filterSalonTable()">' +
      '<button type="button" class="btn btn-link" onclick="CrozzoPrintStudioHub.salonToggleAll(true)">Marcar todos</button>' +
      '<button type="button" class="btn btn-link" onclick="CrozzoPrintStudioHub.salonToggleAll(false)">Ninguno</button>' +
      '</div>' +
      '<div class="crozzo-table-wrap crozzo-salon-table-wrap">' +
      '<table class="data-table" id="salonProductosTable"><thead><tr><th>Producto</th><th>Precio</th><th>Por gramo</th><th>Descuento</th></tr></thead><tbody>' +
      rows +
      '</tbody></table></div>' +
      renderPrintOutputPicker('salon', savedPrintOutput('salon')) +
      '<div class="crozzo-bodega-actions" style="margin-top:14px;">' +
      '<button type="button" class="btn btn-primary" onclick="CrozzoPrintStudioHub.runSalonPrint(false)">Imprimir etiquetas seleccionadas</button>' +
      '<button type="button" class="btn btn-outline" onclick="CrozzoPrintStudioHub.runSalonPrint(true)">Imprimir todo el catálogo</button>' +
      '</div></div>'
    );
  }

  function selectDocType(docType) {
    var prevKey = studioTplKey();
    if (docType === 'bodega_entrada') {
      setActiveDocType('bodega');
      global.__crozzoPrintStudioBodegaTplKey = 'bodega_entrada';
    } else if (docType === 'bodega') {
      setActiveDocType('bodega');
      global.__crozzoPrintStudioBodegaTplKey = 'bodega';
    } else {
      global.__crozzoPrintStudioBodegaTplKey = '';
      setActiveDocType(docType);
    }
    if (prevKey !== studioTplKey()) {
      var ta = document.getElementById('adminTermicaPlantillaJson');
      if (ta && ta.value.trim() && getModo(prevKey, getFacturacionAdminConfigSafe()) === 'personalizada') {
        persistActiveTplFromJson(ta.value.trim());
      }
    }
    global.__crozzoFacturasAdminTab = 'estudio';
    if (typeof global.crozzoFacturasAdminSetTab === 'function') {
      document.querySelectorAll('.crozzo-print-hub__tab, .crozzo-fa-tab').forEach(function (btn) {
        btn.classList.toggle('is-active', btn.getAttribute('data-fa-tab') === 'estudio');
      });
      document.querySelectorAll('.crozzo-fa-panel').forEach(function (panel) {
        panel.classList.toggle('is-active', panel.getAttribute('data-fa-panel') === 'estudio');
      });
    }
    refreshDocTypeUi();
  }

  function setModoForActive(modo) {
    var docType = activeDocType();
    var conf = getFacturacionAdminConfigSafe();
    var modos = Object.assign({}, conf.termicaModos || {});
    modos[docType] = modo;
    if (typeof global.config !== 'undefined' && global.config.set) {
      global.config.set('facturacionAdmin', Object.assign({}, conf, { termicaModos: modos, termicaModo: docType === 'factura' ? modo : conf.termicaModo }));
    }
  }

  function rerenderStudioSection() {
    var panel = document.querySelector('.crozzo-fa-panel[data-fa-panel="estudio"]');
    if (!panel) return;
    var old = panel.querySelector('.crozzo-print-studio');
    if (old) old.remove();
    var conf = getFacturacionAdminConfigSafe();
    panel.insertAdjacentHTML('beforeend', renderStudioHubPanel(conf));
    initStudioHub();
  }

  function initStudioHub() {
    void ensureCostosBundle();
    setActiveDocType(global.__crozzoPrintStudioDocType || 'factura');
    var docType = activeDocType();
    ensureEditorReady(docType);
    var tpl = getPlantilla(studioTplKey(), getFacturacionAdminConfigSafe());
    var ta = document.getElementById('adminTermicaPlantillaJson');
    if (ta) ta.value = JSON.stringify(tpl, null, 2);
    refreshMiniPreview(tpl);
    markStudioDirty(false);
    wireStudioUi();
    if (typeof global.crozzoRefreshPrinterSelectOptions === 'function') {
      global.crozzoRefreshPrinterSelectOptions();
    } else if (typeof window !== 'undefined' && typeof window.crozzoRefreshPrinterSelectOptions === 'function') {
      window.crozzoRefreshPrinterSelectOptions();
    }
    if (typeof global.crozzoFacturasAdminWirePrinterSelects === 'function') {
      global.crozzoFacturasAdminWirePrinterSelects();
    }
    if (typeof global.crozzoLoadSystemPrintersAsync === 'function') {
      void global.crozzoLoadSystemPrintersAsync({ force: false }).then(function () {
        var refresh = global.crozzoRefreshPrinterSelectOptions || (typeof window !== 'undefined' && window.crozzoRefreshPrinterSelectOptions);
        if (typeof refresh === 'function') refresh();
      });
    }
    ensureDesignerIframeLoaded(function () {
      syncDesignerIframe();
    });
  }

  function collectBodegaFields(conf) {
    conf = conf || getFacturacionAdminConfigSafe();
    var bm = Object.assign({}, conf.bodegaMarcacion || {});
    bm.prefijo = (document.getElementById('bodegaPrefijo') && document.getElementById('bodegaPrefijo').value.trim()) || bm.prefijo || 'MK';
    bm.ubicacion = (document.getElementById('bodegaUbicacion') && document.getElementById('bodegaUbicacion').value.trim()) || bm.ubicacion || '';
    var chk = document.getElementById('bodegaIncluirTodasMp');
    bm.incluirTodasMp = chk ? chk.checked : bm.incluirTodasMp !== false;
    return {
      impresoraBodega: (document.getElementById('bodegaPrinterSelect') && document.getElementById('bodegaPrinterSelect').value.trim()) || '',
      bodegaMarcacion: bm,
    };
  }

  function saveMpFechas() {
    var n = persistMpTrazabilidadFromUi();
    if (global.showToast) {
      global.showToast(n ? 'Fechas guardadas en ' + n + ' insumo(s) MP.' : 'Indique al menos una fecha FE, FI o FV.', n ? 'success' : 'warning');
    }
  }

  function runBodegaRotulos(opts) {
    opts = opts || {};
    var patch = collectBodegaFields();
    if (typeof global.config !== 'undefined' && global.config.set) {
      var c = getFacturacionAdminConfigSafe();
      global.config.set('facturacionAdmin', Object.assign({}, c, patch));
    }
    persistMpTrazabilidadFromUi();
    void printBodegaRotulos({ modo: 'rotulo', printOutput: opts.printOutput || getPrintOutput('bodega') }).then(function (r) {
      var prev = document.getElementById('bodegaMarcacionPreview');
      if (prev && r) prev.textContent = 'Rótulos: ' + (r.count || 0) + ' · sec. ' + (r.seq || '');
      if (typeof global.renderPage === 'function') global.renderPage('config-facturas-admin');
    });
  }

  function runBodegaEntrada(opts) {
    opts = opts || {};
    var patch = collectBodegaFields();
    if (typeof global.config !== 'undefined' && global.config.set) {
      var c = getFacturacionAdminConfigSafe();
      global.config.set('facturacionAdmin', Object.assign({}, c, patch));
    }
    void printBodegaRotulos({ modo: 'entrada', printOutput: opts.printOutput || getPrintOutput('bodega') }).then(function (r) {
      var prev = document.getElementById('bodegaMarcacionPreview');
      if (prev && r) prev.textContent = 'Entrada: ' + (r.count || 0) + ' rótulo(s)';
      if (typeof global.renderPage === 'function') global.renderPage('config-facturas-admin');
    });
  }

  function runMarcacion() {
    runBodegaRotulos();
  }

  function runBodegaRotulosNormal() {
    runBodegaRotulos({ printOutput: 'carta' });
  }

  function runBodegaEntradaNormal() {
    runBodegaEntrada({ printOutput: 'carta' });
  }

  function runSalonPrintNormal(all) {
    runSalonPrint(all, 'carta');
  }

  function bodegaToggleAll(on) {
    document.querySelectorAll('[data-bodega-mp-sel]').forEach(function (cb) {
      cb.checked = !!on;
    });
  }

  function salonSelectedIds() {
    var ids = [];
    document.querySelectorAll('.salon-prod-cb:checked').forEach(function (cb) {
      if (cb.value) ids.push(cb.value);
    });
    return ids;
  }

  function runSalonPrint(all, printOutput) {
    var ids = all ? null : salonSelectedIds();
    if (!all && (!ids || !ids.length)) {
      if (global.showToast) global.showToast('Marque al menos un producto.', 'warning');
      return;
    }
    var titulo = (document.getElementById('salonTitulo') && document.getElementById('salonTitulo').value.trim()) || 'SALON · VENTA';
    var prn = document.getElementById('salonPrinterSelect') ? document.getElementById('salonPrinterSelect').value.trim() : '';
    var c = getFacturacionAdminConfigSafe();
    if (typeof global.config !== 'undefined' && global.config.set) {
      global.config.set('facturacionAdmin', Object.assign({}, c, { impresoraSalon: prn }));
    }
    void printSalonLista({
      productIds: ids,
      titulo: titulo,
      printOutput: printOutput || getPrintOutput('salon'),
    });
  }

  function filterSalonTable() {
    var q = String((document.getElementById('salonBuscar') && document.getElementById('salonBuscar').value) || '')
      .trim()
      .toLowerCase();
    document.querySelectorAll('#salonProductosTable tbody tr').forEach(function (tr) {
      var t = (tr.textContent || '').toLowerCase();
      tr.style.display = !q || t.indexOf(q) >= 0 ? '' : 'none';
    });
  }

  function salonToggleAll(on) {
    document.querySelectorAll('.salon-prod-cb').forEach(function (cb) {
      cb.checked = !!on;
    });
  }

  function previewMarcacion() {
    var seq = nextMarcacionId();
    var el = document.getElementById('bodegaMarcacionPreview');
    if (el) el.innerHTML = 'Próxima secuencia: <code>' + esc(seq) + '</code> (aún no impresa)';
  }

  function testPrintActive() {
    var btn = document.getElementById('crozzoPsBtnTestPrint');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Imprimiendo…';
    }
    if (typeof global.crozzoFacturasAdminUpdateStudioStatus === 'function') {
      global.crozzoFacturasAdminUpdateStudioStatus('Enviando a impresora…', false);
    }
    void requestTplFromDesignerThenPrint()
      .then(function (tpl) {
        return testPrintWithTemplate(tpl);
      })
      .then(function (ok) {
        if (typeof global.crozzoFacturasAdminUpdateStudioStatus === 'function') {
          if (ok) {
            global.crozzoFacturasAdminUpdateStudioStatus('✓ Ticket enviado a la impresora', true);
          } else {
            var last = global.__CROZZO_LAST_PRINT || {};
            var hint = last.message ? String(last.message).slice(0, 120) : '';
            global.crozzoFacturasAdminUpdateStudioStatus(
              hint
                ? 'Falló: ' + hint
                : 'No imprimió — Actualizar lista, elegir POS-80 y reiniciar la app',
              false
            );
          }
        }
        return ok;
      })
      .catch(function (err) {
        if (typeof global.crozzoFacturasAdminUpdateStudioStatus === 'function') {
          global.crozzoFacturasAdminUpdateStudioStatus(
            'Error: ' + (err && err.message ? err.message : String(err || 'impresión')),
            false
          );
        }
        if (global.showToast) global.showToast('Prueba de impresión falló.', 'error');
      })
      .finally(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Probar impresión';
        }
      });
  }

  function wireStudioUi() {
    var docSel = document.getElementById('crozzoPsDocSelect');
    if (docSel && !docSel._crozzoWired) {
      docSel._crozzoWired = true;
      docSel.addEventListener('change', function () {
        selectDocType(docSel.value);
      });
    }
    var presetSel = document.getElementById('crozzoPsPresetSelect');
    if (presetSel && !presetSel._crozzoWired) {
      presetSel._crozzoWired = true;
      presetSel.addEventListener('change', function () {
        applyPresetFromSelect();
      });
    }
    var applyBtn = document.getElementById('crozzoPsBtnApplyDesign');
    if (applyBtn && !applyBtn._crozzoWired) {
      applyBtn._crozzoWired = true;
      applyBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        applyDesignFromEditor();
      });
    }
    var prnSel = document.getElementById('crozzoPsStudioPrinter');
    if (prnSel && !prnSel._crozzoWired) {
      prnSel._crozzoWired = true;
      prnSel.addEventListener('change', function () {
        var caja = document.getElementById('adminCajaPosPrinter');
        if (caja) caja.value = prnSel.value;
        if (typeof global.crozzoFacturasAdminPersistPrinters === 'function') {
          global.crozzoFacturasAdminPersistPrinters({ silent: true });
        }
      });
    }
    var testBtn = document.getElementById('crozzoPsBtnTestPrint');
    if (testBtn && !testBtn._crozzoWired) {
      testBtn._crozzoWired = true;
      testBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        testPrintActive();
      });
    }
  }

  function syncEditorTplBeforeSave(cb) {
    var ifr = document.getElementById('crozzoTicketDesignerIframe');
    if (!ifr || !ifr.contentWindow) {
      if (cb) cb();
      return;
    }
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      try {
        global.removeEventListener('message', onTpl);
      } catch (_) {}
      if (cb) cb();
    }
    function onTpl(e) {
      if (!e.data || e.data.type !== 'crozzo_ticket_tpl') return;
      if (e.data.tpl && typeof onEditorTplChanged === 'function') onEditorTplChanged(e.data.tpl);
      finish();
    }
    global.addEventListener('message', onTpl);
    global.setTimeout(finish, 600);
    try {
      ifr.contentWindow.postMessage({ type: 'crozzo_ticket_request_push' }, '*');
    } catch (_) {
      finish();
    }
  }

  function collectSavePayload(prev) {
    prev = prev || getFacturacionAdminConfigSafe();
    prev = normalizePlantillas(prev);
    var ta = document.getElementById('adminTermicaPlantillaJson');
    if (ta && ta.value.trim()) {
      persistActiveTplFromJson(ta.value.trim());
      prev = getFacturacionAdminConfigSafe();
    }
    var modos = Object.assign({}, prev.termicaModos || {});
    var active = activeDocType();
    modos[active] = 'personalizada';
    DOC_TYPES.forEach(function (d) {
      if (!modos[d.id]) modos[d.id] = 'personalizada';
    });
    var bodega = collectBodegaFields(prev);
    var presets = Object.assign({}, prev.termicaPresets || {});
    presets[active] = getActivePresetId(active, prev);
    return Object.assign({}, prev, {
      termicaModos: modos,
      termicaModo: modos.factura || prev.termicaModo,
      termicaPresets: presets,
      termicaPresetId: presets[active] || prev.termicaPresetId,
      termicaPlantilla: (prev.termicaPlantillas && prev.termicaPlantillas.factura) || prev.termicaPlantilla,
      impresoraBodega: bodega.impresoraBodega,
      bodegaMarcacion: bodega.bodegaMarcacion,
    });
  }

  global.CrozzoPrintStudioHub = {
    DOC_TYPES: DOC_TYPES,
    normalizePlantillas: normalizePlantillas,
    getPlantilla: getPlantilla,
    getModo: getModo,
    docTypeFromFactura: docTypeFromFactura,
    defaultTpl: defaultTpl,
    renderStudioHubPanel: renderStudioHubPanel,
    renderBodegaPanel: renderBodegaPanel,
    renderSalonPanel: renderSalonPanel,
    printSalonLista: printSalonLista,
    printBodegaMarcacion: printBodegaMarcacion,
    printBodegaRotulos: printBodegaRotulos,
    printSalonEtiquetas: printSalonEtiquetas,
    runMarcacion: runMarcacion,
    runBodegaRotulos: runBodegaRotulos,
    runBodegaEntrada: runBodegaEntrada,
    runBodegaRotulosNormal: runBodegaRotulosNormal,
    runBodegaEntradaNormal: runBodegaEntradaNormal,
    runSalonPrintNormal: runSalonPrintNormal,
    bodegaToggleAll: bodegaToggleAll,
    PRINT_OUTPUTS: PRINT_OUTPUTS,
    pickPrintOutput: pickPrintOutput,
    getPrintOutput: getPrintOutput,
    getInventarioPrintOpts: getInventarioPrintOpts,
    getRemisionPrintOpts: function () {
      var outputId = normalizePrintOutput(getPrintOutput('remision'));
      var meta = printOutputMeta(outputId);
      var conf = getFacturacionAdminConfigSafe();
      var isRoll = meta.kind === 'roll';
      return {
        printOutput: meta.id,
        pageFormat: isRoll ? undefined : meta.page,
        landscape: !isRoll && outputId !== 'carta',
        allowDialog: true,
        silent: false,
        printer: resolvePrinterForOutput(outputId, conf, 'bodega'),
        role: 'bodega',
        channel: isRoll ? 'roll' : 'normal',
        paperSz: meta.sz,
        preferEscPos: isRoll,
      };
    },
    resolvePrinterForOutput: resolvePrinterForOutput,
    savedPrintOutput: savedPrintOutput,
    persistPrintOutputScope: persistPrintOutputScope,
    collectPrintOutputsFromUi: collectPrintOutputsFromUi,
    renderPrintOutputPicker: renderPrintOutputPicker,
    getPrintChannel: getPrintChannel,
    touchPrintChannel: touchPrintChannel,
    selectDocType: selectDocType,
    saveMpFechas: saveMpFechas,
    runSalonPrint: runSalonPrint,
    runInventarioPrint: runInventarioPrint,
    previewInventarioConteo: previewInventarioConteo,
    renderInventarioPanel: renderInventarioPanel,
    ensureSalonBlocks: ensureSalonBlocks,
    normalizeBodegaTplBlocks: normalizeBodegaTplBlocks,
    polishTplForDocType: polishTplForDocType,
    tplForPrintOutput: tplForPrintOutput,
    filterSalonTable: filterSalonTable,
    salonToggleAll: salonToggleAll,
    initStudioHub: initStudioHub,
    getActivePresetId: getActivePresetId,
    applyPreset: applyPreset,
    applyPresetFromSelect: applyPresetFromSelect,
    applyDesignFromEditor: applyDesignFromEditor,
    testPrintWithTemplate: testPrintWithTemplate,
    getStudioPrinter: getStudioPrinter,
    rerenderStudioSection: rerenderStudioSection,
    refreshDocTypeUi: refreshDocTypeUi,
    setModoPredefinida: function () {
      refreshDocTypeUi();
    },
    setModoPersonalizada: function () {
      refreshDocTypeUi();
    },
    syncDesignerIframe: syncDesignerIframe,
    testPrintActive: testPrintActive,
    previewMarcacion: previewMarcacion,
    nextMarcacionId: nextMarcacionId,
    mpLinesForProduct: mpLinesForProduct,
    collectSavePayload: collectSavePayload,
    syncEditorTplBeforeSave: syncEditorTplBeforeSave,
    samplePayload: samplePayload,
    persistActiveTplFromJson: persistActiveTplFromJson,
    onEditorTplChanged: onEditorTplChanged,
    refreshMiniPreview: refreshMiniPreview,
    clearStudioDirty: clearStudioDirty,
    markStudioDirty: markStudioDirty,
    productoSalonInfo: productoSalonInfo,
    resolveGramajeVentaSalon: resolveGramajeVentaSalon,
    resolvePrecioVentaSalon: resolvePrecioVentaSalon,
    salonMuestraPrecioGramo: salonMuestraPrecioGramo,
  };
  global.crozzoSalonProductoInfo = productoSalonInfo;
  global.crozzoSalonMuestraPrecioGramo = salonMuestraPrecioGramo;
})(typeof window !== 'undefined' ? window : globalThis);
