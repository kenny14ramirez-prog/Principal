/**
 * Crozzo POS — Catálogo de diseños térmicos predefinidos (10 estilos).
 * Usado en modo «Listo para usar» del Centro de impresión.
 */
(function (global) {
  'use strict';

  var PRESETS = [
    {
      id: 'bona',
      label: 'BONA',
      desc: 'Piel BONA origen: oro editorial, tipografía clara y ticket de sede premium.',
      icon: '◆',
      sz: '80',
      aliasOf: 'elegante',
    },
    {
      id: 'clasico',
      label: 'Clásico',
      desc: 'Factura clásica con marcos, ornamentos ◆ y tipografía editorial.',
      icon: '📜',
      sz: '80',
    },
    {
      id: 'profesional',
      label: 'Profesional',
      desc: 'Corporativo premium: flourish, totales en marco y pie refinado.',
      icon: '💼',
      sz: '80',
    },
    {
      id: 'elegante',
      label: 'Elegante',
      desc: 'Alta gama: doble ornamento, títulos con marco y pie boutique.',
      icon: '✨',
      sz: '80',
    },
    {
      id: 'economizador',
      label: 'Economizador',
      desc: 'Papel 58 mm, solo lo esencial — ahorra rollo.',
      icon: '📏',
      sz: '58',
    },
    {
      id: 'economizador-elegante',
      label: 'Economizador elegante',
      desc: '58 mm elegante: flourish, diamantes y pie con acento dorado.',
      icon: '🎀',
      sz: '58',
    },
    {
      id: 'moderno',
      label: 'Moderno',
      desc: 'Editorial izquierda: regla tipográfica y jerarquía limpia.',
      icon: '⚡',
      sz: '80',
    },
    {
      id: 'detallado',
      label: 'Detallado',
      desc: 'Incluye pago, propina, CUFE y más líneas de detalle.',
      icon: '📋',
      sz: '80',
    },
    {
      id: 'retail',
      label: 'Retail',
      desc: 'Góndola retail: precio protagonista, marco y sello OFERTA.',
      icon: '🛒',
      sz: '80',
    },
    {
      id: 'restaurante',
      label: 'Restaurante',
      desc: 'Salón: comanda con flourish y precuenta de mesa premium.',
      icon: '🍽️',
      sz: '80',
    },
    {
      id: 'express',
      label: 'Express',
      desc: 'Mínimo absoluto: número, ítems y total en segundos.',
      icon: '🚀',
      sz: '58',
    },
  ];

  var DEFAULT_PRESET = 'bona';

  /** Resuelve alias (ej. bona → elegante) para bloques / sz. */
  function resolvePresetId(presetId) {
    var m = PRESETS.find(function (p) {
      return p.id === presetId;
    });
    if (m && m.aliasOf) return m.aliasOf;
    return presetId || DEFAULT_PRESET;
  }

  /** Política de corte por tipo de documento (una sola fuente de verdad). */
  var CUT_POLICY = {
    factura: { cutEnd: 'none', cutEndFeed: 0, blockMode: 'partial', blockFeed: 5 },
    precuenta: { cutEnd: 'none', cutEndFeed: 0, blockMode: 'partial', blockFeed: 4 },
    ticket: { cutEnd: 'none', cutEndFeed: 0, blockMode: 'partial', blockFeed: 4 },
    bodega: { cutEnd: 'none', cutEndFeed: 0, blockMode: 'partial', blockFeed: 3 },
    bodega_entrada: { cutEnd: 'none', cutEndFeed: 0, blockMode: 'partial', blockFeed: 3 },
    salon: { cutEnd: 'none', cutEndFeed: 0, blockMode: 'partial', blockFeed: 3 },
    inventario: { cutEnd: 'none', cutEndFeed: 0, blockMode: 'partial', blockFeed: 4 },
  };

  function withLogoBlocks(blocks) {
    if (!blocks || !blocks.length) return blocks;
    if (blocks.some(function (b) { return b.t === 'logo' && b.v !== false; })) return blocks;
    var shifted = blocks.map(function (b) {
      return Object.assign({}, b, { o: (typeof b.o === 'number' ? b.o : 1) + 1 });
    });
    shifted.unshift({
      t: 'logo',
      c: '',
      v: true,
      o: 1,
      a: 'center',
      fs: 'md',
      fw: true,
    });
    return shifted;
  }

  function withLabelLogoBlocks(blocks) {
    if (!blocks || !blocks.length) return blocks;
    if (blocks.some(function (b) {
      return b.t === 'logo' && b.v !== false;
    }))
      return blocks;
    var shifted = blocks.map(function (b) {
      return Object.assign({}, b, { o: (typeof b.o === 'number' ? b.o : 1) + 1 });
    });
    shifted.unshift({
      t: 'logo',
      c: '',
      v: true,
      o: 1,
      a: 'left',
      fs: 'xs',
      fw: false,
      logoLayout: 'inline',
    });
    return shifted;
  }

  /** Ornamento decorativo (◆ ═ flourish) — visible en HTML premium y ESC. */
  function orn(kind, order, extra) {
    return Object.assign({ t: 'ornament', c: kind || 'flourish', v: true, o: order, a: 'center', fs: 'xs' }, extra || {});
  }

  function cutPolicy(docType) {
    return CUT_POLICY[docType] || CUT_POLICY.factura;
  }

  /** Un solo bloque ✂ al final; sin corte duplicado al terminar. */
  function applyCutPolicy(tpl, docType) {
    if (!tpl || !Array.isArray(tpl.blocks)) return tpl;
    docType = docType || tpl.docType || 'factura';
    var pol = cutPolicy(docType);
    var blocks = tpl.blocks.filter(function (b) {
      return b && b.t !== 'cut';
    });
    var maxO = 0;
    blocks.forEach(function (b) {
      var o = typeof b.o === 'number' ? b.o : 0;
      if (o > maxO) maxO = o;
    });
    blocks.push({
      t: 'cut',
      c: pol.blockMode,
      v: true,
      o: maxO + 100,
      a: 'center',
      fs: 'xs',
      fw: false,
      sp: pol.blockFeed,
    });
    try {
      return JSON.parse(
        JSON.stringify(
          Object.assign({}, tpl, {
            docType: docType,
            cutEnd: 'none',
            cutEndFeed: 0,
            blocks: blocks,
          })
        )
      );
    } catch (_) {
      return Object.assign({}, tpl, { docType: docType, cutEnd: 'none', cutEndFeed: 0, blocks: blocks });
    }
  }

  function meta(presetId) {
    return PRESETS.find(function (p) { return p.id === presetId; }) || PRESETS[0];
  }

  function szFor(presetId, docType) {
    var resolved = resolvePresetId(presetId);
    var m = meta(presetId);
    if (resolved === 'economizador' || resolved === 'economizador-elegante' || resolved === 'express') return '58';
    if (docType === 'ticket' && (resolved === 'express' || resolved === 'economizador')) return '58';
    return (m && m.sz) || meta(resolved).sz || '80';
  }

  function blocksFactura(presetId) {
    if (presetId === 'economizador') {
      return [
        { t: 'company', c: '', v: true, o: 1, a: 'center', fs: 'xs', fw: true },
        { t: 'title', c: 'FACTURA', v: true, o: 2, a: 'center', fs: 'sm', fw: true },
        { t: 'consec', c: '', v: true, o: 3, a: 'center', fs: 'xs' },
        { t: 'items', c: '', v: true, o: 4, a: 'left', fs: 'xs' },
        { t: 'iva_disc', c: '', v: true, o: 4.5, a: 'left', fs: 'xs' },
        { t: 'total', c: 'TOTAL', v: true, o: 5, a: 'left', fs: 'md', fw: true },
        { t: 'propina_sugerida', c: '', v: true, o: 5.5, a: 'center', fs: 'xs' },
        { t: 'legal_co', c: '', v: true, o: 5.8, a: 'center', fs: 'xs' },
        { t: 'footer', c: 'Gracias', v: true, o: 6, a: 'center', fs: 'xs' },
      ];
    }
    if (presetId === 'economizador-elegante') {
      return [
        { t: 'company', c: '', v: true, o: 1, a: 'center', fs: 'sm', fw: true },
        orn('flourish', 1.5),
        { t: 'divider', c: '4', v: true, o: 2 },
        { t: 'title', c: 'FACTURA', v: true, o: 3, a: 'center', fs: 'md', fw: true },
        { t: 'consec', c: '', v: true, o: 4, a: 'center', fs: 'xs' },
        { t: 'date', c: '', v: true, o: 5, a: 'center', fs: 'xs' },
        { t: 'divider', c: '3', v: true, o: 6 },
        { t: 'items', c: '', v: true, o: 7, a: 'left', fs: 'xs' },
        { t: 'iva_disc', c: '', v: true, o: 7.5, a: 'left', fs: 'xs' },
        { t: 'total', c: 'TOTAL', v: true, o: 8, a: 'center', fs: 'md', fw: true },
        { t: 'propina_sugerida', c: '', v: true, o: 8.5, a: 'center', fs: 'xs' },
        { t: 'legal_co', c: '', v: true, o: 8.8, a: 'center', fs: 'xs' },
        { t: 'footer', c: '* Gracias por su compra *', v: true, o: 9, a: 'center', fs: 'xs' },
        orn('dots', 9.5),
      ];
    }
    if (presetId === 'express') {
      return [
        { t: 'title', c: 'TICKET', v: true, o: 1, a: 'center', fs: 'md', fw: true },
        { t: 'consec', c: '', v: true, o: 2, a: 'center', fs: 'xs' },
        { t: 'items', c: '', v: true, o: 3, a: 'left', fs: 'xs' },
        { t: 'iva_disc', c: '', v: true, o: 3.5, a: 'left', fs: 'xs' },
        { t: 'total', c: 'TOTAL', v: true, o: 4, a: 'center', fs: 'lg', fw: true },
        { t: 'propina_sugerida', c: '', v: true, o: 4.5, a: 'center', fs: 'xs' },
        { t: 'legal_co', c: '', v: true, o: 5, a: 'center', fs: 'xs' },
      ];
    }
    if (presetId === 'profesional') {
      return [
        { t: 'logo', c: '', v: true, o: 1, a: 'center', fs: 'md' },
        { t: 'company', c: '', v: true, o: 2, a: 'center', fs: 'md', fw: true },
        { t: 'nit', c: '', v: true, o: 3, a: 'center', fs: 'xs' },
        { t: 'divider', c: '5', v: true, o: 4 },
        { t: 'title', c: 'FACTURA DE VENTA', v: true, o: 5, a: 'center', fs: 'md', fw: true },
        { t: 'consec', c: '', v: true, o: 6, a: 'center', fs: 'sm' },
        { t: 'date', c: '', v: true, o: 7, a: 'center', fs: 'xs' },
        { t: 'client', c: '', v: true, o: 8, a: 'left', fs: 'sm' },
        { t: 'items', c: '', v: true, o: 9, a: 'left', fs: 'sm' },
        { t: 'iva_disc', c: '', v: true, o: 9.5, a: 'left', fs: 'xs' },
        { t: 'total', c: 'VALOR TOTAL', v: true, o: 10, a: 'right', fs: 'md', fw: true },
        { t: 'payment', c: '', v: true, o: 11, a: 'left', fs: 'sm' },
        { t: 'propina_sugerida', c: '', v: true, o: 11.5, a: 'center', fs: 'xs' },
        { t: 'legal_co', c: '', v: true, o: 11.8, a: 'center', fs: 'xs' },
        { t: 'footer', c: '- Documento Crozzo - calidad garantizada -', v: true, o: 12, a: 'center', fs: 'xs' },
        orn('dots', 12.5),
      ];
    }
    if (presetId === 'elegante') {
      return [
        { t: 'logo', c: '', v: true, o: 1, a: 'center', fs: 'md' },
        { t: 'company', c: '', v: true, o: 2, a: 'center', fs: 'sm', fw: true },
        { t: 'nit', c: '', v: true, o: 3, a: 'center', fs: 'xs' },
        orn('diamond', 3.5),
        { t: 'divider', c: '6', v: true, o: 4 },
        { t: 'title', c: 'FACTURA', v: true, o: 5, a: 'center', fs: 'xl', fw: true },
        { t: 'divider', c: '3', v: true, o: 6 },
        { t: 'consec', c: '', v: true, o: 7, a: 'center', fs: 'sm' },
        { t: 'date', c: '', v: true, o: 8, a: 'center', fs: 'xs' },
        { t: 'client', c: '', v: true, o: 9, a: 'left', fs: 'sm' },
        { t: 'divider', c: '4', v: true, o: 10 },
        { t: 'items', c: '', v: true, o: 11, a: 'left', fs: 'sm' },
        { t: 'iva_disc', c: '', v: true, o: 11.5, a: 'left', fs: 'xs' },
        { t: 'divider', c: '4', v: true, o: 12 },
        { t: 'total', c: 'TOTAL A PAGAR', v: true, o: 13, a: 'center', fs: 'lg', fw: true },
        { t: 'payment', c: '', v: true, o: 14, a: 'center', fs: 'sm' },
        { t: 'propina_sugerida', c: '', v: true, o: 14.5, a: 'center', fs: 'xs' },
        { t: 'cufe', c: '', v: true, o: 15, a: 'left', fs: 'xs' },
        { t: 'qr', c: '', v: true, o: 16, a: 'center', fs: 'sm' },
        { t: 'legal_co', c: '', v: true, o: 16.5, a: 'center', fs: 'xs' },
        orn('wave', 16.8),
        { t: 'footer', c: '- Gracias por preferirnos -', v: true, o: 17, a: 'center', fs: 'xs' },
      ];
    }
    if (presetId === 'moderno') {
      return [
        { t: 'company', c: '', v: true, o: 1, a: 'left', fs: 'md', fw: true },
        { t: 'nit', c: '', v: true, o: 2, a: 'left', fs: 'xs' },
        orn('double', 2.5, { a: 'left' }),
        { t: 'title', c: 'FACTURA', v: true, o: 3, a: 'left', fs: 'lg', fw: true },
        { t: 'consec', c: '', v: true, o: 4, a: 'left', fs: 'sm' },
        { t: 'date', c: '', v: true, o: 5, a: 'left', fs: 'xs' },
        { t: 'client', c: '', v: true, o: 6, a: 'left', fs: 'sm' },
        { t: 'items', c: '', v: true, o: 7, a: 'left', fs: 'sm' },
        { t: 'iva_disc', c: '', v: true, o: 7.5, a: 'left', fs: 'xs' },
        { t: 'total', c: 'TOTAL', v: true, o: 8, a: 'left', fs: 'md', fw: true },
        { t: 'payment', c: '', v: true, o: 9, a: 'left', fs: 'sm' },
        { t: 'propina_sugerida', c: '', v: true, o: 9.5, a: 'left', fs: 'xs' },
        { t: 'qr', c: '', v: true, o: 10, a: 'left', fs: 'sm' },
        { t: 'legal_co', c: '', v: true, o: 11, a: 'left', fs: 'xs' },
      ];
    }
    if (presetId === 'detallado') {
      return [
        { t: 'logo', c: '', v: true, o: 1, a: 'center', fs: 'md' },
        { t: 'company', c: '', v: true, o: 2, a: 'center', fs: 'sm' },
        { t: 'nit', c: '', v: true, o: 3, a: 'center', fs: 'xs' },
        { t: 'divider', c: '4', v: true, o: 4 },
        { t: 'title', c: 'FACTURA ELECTRÓNICA', v: true, o: 5, a: 'center', fs: 'lg', fw: true },
        { t: 'consec', c: '', v: true, o: 6, a: 'center', fs: 'sm' },
        { t: 'date', c: '', v: true, o: 7, a: 'center', fs: 'xs' },
        { t: 'client', c: '', v: true, o: 8, a: 'left', fs: 'sm' },
        { t: 'divider', c: '3', v: true, o: 9 },
        { t: 'items', c: '', v: true, o: 10, a: 'left', fs: 'sm' },
        { t: 'iva_disc', c: '', v: true, o: 10.5, a: 'left', fs: 'xs' },
        { t: 'divider', c: '3', v: true, o: 11 },
        { t: 'total', c: 'SUBTOTAL / IVA / TOTAL', v: true, o: 12, a: 'left', fs: 'md', fw: true },
        { t: 'payment', c: '', v: true, o: 13, a: 'left', fs: 'sm' },
        { t: 'propina_sugerida', c: '', v: true, o: 13.5, a: 'center', fs: 'xs' },
        { t: 'cufe', c: '', v: true, o: 14, a: 'left', fs: 'xs' },
        { t: 'qr', c: '', v: true, o: 15, a: 'center', fs: 'sm' },
        { t: 'legal_co', c: '', v: true, o: 15.5, a: 'center', fs: 'xs' },
        orn('diamond', 15.8),
        { t: 'footer', c: 'Propina y cambio según caja · Conserve este comprobante', v: true, o: 16, a: 'center', fs: 'xs' },
      ];
    }
    if (presetId === 'retail') {
      return [
        { t: 'company', c: '', v: true, o: 1, a: 'center', fs: 'xs' },
        orn('flourish', 1.5),
        { t: 'consec', c: '', v: true, o: 2, a: 'center', fs: 'sm' },
        { t: 'date', c: '', v: true, o: 3, a: 'center', fs: 'xs' },
        { t: 'items', c: '', v: true, o: 4, a: 'left', fs: 'sm' },
        { t: 'iva_disc', c: '', v: true, o: 4.3, a: 'left', fs: 'xs' },
        orn('diamond', 4.5),
        { t: 'divider', c: '4', v: true, o: 5 },
        { t: 'total', c: 'TOTAL', v: true, o: 6, a: 'center', fs: 'xl', fw: true },
        { t: 'payment', c: '', v: true, o: 7, a: 'center', fs: 'sm' },
        { t: 'propina_sugerida', c: '', v: true, o: 7.5, a: 'center', fs: 'xs' },
        { t: 'legal_co', c: '', v: true, o: 7.8, a: 'center', fs: 'xs' },
        { t: 'footer', c: '¡Gracias por su compra!', v: true, o: 8, a: 'center', fs: 'sm', fw: true },
        orn('dots', 8.5),
      ];
    }
    if (presetId === 'restaurante') {
      return [
        { t: 'company', c: '', v: true, o: 1, a: 'center', fs: 'md', fw: true },
        orn('flourish', 1.5),
        { t: 'title', c: 'CUENTA', v: true, o: 2, a: 'center', fs: 'lg', fw: true },
        { t: 'consec', c: '', v: true, o: 3, a: 'center', fs: 'md', fw: true },
        { t: 'date', c: '', v: true, o: 4, a: 'center', fs: 'xs' },
        { t: 'client', c: '', v: true, o: 5, a: 'center', fs: 'sm' },
        { t: 'divider', c: '4', v: true, o: 6 },
        { t: 'items', c: '', v: true, o: 7, a: 'left', fs: 'md' },
        { t: 'iva_disc', c: '', v: true, o: 7.5, a: 'left', fs: 'xs' },
        { t: 'total', c: 'TOTAL MESA', v: true, o: 8, a: 'center', fs: 'lg', fw: true },
        { t: 'propina_sugerida', c: '', v: true, o: 8.5, a: 'center', fs: 'xs' },
        { t: 'legal_co', c: '', v: true, o: 8.8, a: 'center', fs: 'xs' },
        { t: 'footer', c: 'Conserve este comprobante · Factura en caja', v: true, o: 9, a: 'center', fs: 'xs' },
      ];
    }
    if (global.CrozzoTermicaColombia && typeof global.CrozzoTermicaColombia.blocksFacturaColombiaBase === 'function') {
      var base = global.CrozzoTermicaColombia.blocksFacturaColombiaBase();
      var hasProp = base.some(function (b) {
        return b && b.t === 'propina_sugerida';
      });
      if (!hasProp) {
        base.push({ t: 'propina_sugerida', c: '', v: true, o: 17.5, a: 'center', fs: 'xs' });
      }
      return base;
    }
    return [
      { t: 'logo', c: '', v: true, o: 1, a: 'center', fs: 'md', fw: true },
      { t: 'company', c: '', v: true, o: 2, a: 'center', fs: 'sm' },
      { t: 'nit', c: '', v: true, o: 3, a: 'center', fs: 'xs' },
      orn('diamond', 3.5),
      { t: 'divider', c: '6', v: true, o: 4 },
      { t: 'title', c: 'FACTURA ELECTRÓNICA DE VENTA', v: true, o: 5, a: 'center', fs: 'lg', fw: true },
      { t: 'consec', c: '', v: true, o: 6, a: 'center', fs: 'sm' },
      { t: 'date', c: '', v: true, o: 7, a: 'center', fs: 'xs' },
      { t: 'client', c: '', v: true, o: 8, a: 'left', fs: 'sm' },
      { t: 'items', c: '', v: true, o: 9, a: 'left', fs: 'sm' },
      { t: 'iva_disc', c: '', v: true, o: 10, a: 'left', fs: 'xs' },
      { t: 'total', c: 'TOTAL', v: true, o: 11, a: 'left', fs: 'md', fw: true },
      { t: 'payment', c: '', v: true, o: 12, a: 'left', fs: 'sm' },
      { t: 'propina_sugerida', c: '', v: true, o: 12.5, a: 'center', fs: 'xs' },
      { t: 'cufe', c: '', v: true, o: 13, a: 'left', fs: 'xs' },
      { t: 'qr', c: '', v: true, o: 14, a: 'center', fs: 'sm' },
      { t: 'legal_co', c: '', v: true, o: 15, a: 'center', fs: 'xs' },
      orn('wave', 15.5),
      { t: 'footer', c: '- Gracias por su compra -', v: true, o: 16, a: 'center', fs: 'xs' },
    ];
  }

  function blocksPrecuenta(presetId) {
    if (presetId === 'restaurante' || presetId === 'clasico') {
      return withLogoBlocks([
        { t: 'company', c: '', v: true, o: 2, a: 'center', fs: 'md', fw: true },
        { t: 'title', c: 'PRECUENTA', v: true, o: 3, a: 'center', fs: 'lg', fw: true },
        { t: 'consec', c: '', v: true, o: 4, a: 'center', fs: 'md', fw: true },
        { t: 'date', c: '', v: true, o: 5, a: 'center', fs: 'xs' },
        { t: 'client', c: '', v: true, o: 6, a: 'center', fs: 'sm' },
        { t: 'divider', c: '4', v: true, o: 7 },
        { t: 'items', c: '', v: true, o: 8, a: 'left', fs: 'sm' },
        { t: 'total', c: 'TOTAL A PAGAR', v: true, o: 9, a: 'center', fs: 'lg', fw: true },
        { t: 'propina_sugerida', c: '', v: true, o: 9.5, a: 'center', fs: 'xs' },
        { t: 'legal_co', c: '', v: true, o: 9.8, a: 'center', fs: 'xs' },
        orn('wave', 10),
        { t: 'footer', c: 'No es factura - Solicite cuenta en caja', v: true, o: 10.5, a: 'center', fs: 'xs' },
      ]);
    }
    if (presetId === 'economizador' || presetId === 'express') {
      return withLogoBlocks([
        { t: 'title', c: 'PRECUENTA', v: true, o: 1, a: 'center', fs: 'sm', fw: true },
        { t: 'consec', c: '', v: true, o: 2, a: 'center', fs: 'xs' },
        { t: 'items', c: '', v: true, o: 3, a: 'left', fs: 'xs' },
        { t: 'total', c: 'TOTAL', v: true, o: 4, a: 'center', fs: 'md', fw: true },
        { t: 'propina_sugerida', c: '', v: true, o: 4.5, a: 'center', fs: 'xs' },
        { t: 'legal_co', c: '', v: true, o: 5, a: 'center', fs: 'xs' },
      ]);
    }
    if (presetId === 'economizador-elegante') {
      return withLogoBlocks([
        { t: 'company', c: '', v: true, o: 2, a: 'center', fs: 'xs', fw: true },
        { t: 'divider', c: '3', v: true, o: 3 },
        { t: 'title', c: 'PRECUENTA', v: true, o: 4, a: 'center', fs: 'md', fw: true },
        { t: 'items', c: '', v: true, o: 5, a: 'left', fs: 'xs' },
        { t: 'total', c: 'TOTAL', v: true, o: 6, a: 'center', fs: 'md', fw: true },
        { t: 'propina_sugerida', c: '', v: true, o: 6.5, a: 'center', fs: 'xs' },
        { t: 'legal_co', c: '', v: true, o: 6.8, a: 'center', fs: 'xs' },
        { t: 'footer', c: 'No es factura legal', v: true, o: 7, a: 'center', fs: 'xs' },
      ]);
    }
    return withLogoBlocks([
      { t: 'company', c: '', v: true, o: 2, a: 'center', fs: 'sm', fw: true },
      { t: 'title', c: 'PRECUENTA', v: true, o: 3, a: 'center', fs: 'lg', fw: true },
      { t: 'date', c: '', v: true, o: 4, a: 'center', fs: 'xs' },
      { t: 'client', c: '', v: true, o: 5, a: 'left', fs: 'sm' },
      { t: 'items', c: '', v: true, o: 6, a: 'left', fs: 'sm' },
      { t: 'total', c: 'TOTAL A PAGAR', v: true, o: 7, a: 'left', fs: 'md', fw: true },
      { t: 'propina_sugerida', c: '', v: true, o: 7.5, a: 'center', fs: 'xs' },
      { t: 'legal_co', c: '', v: true, o: 7.8, a: 'center', fs: 'xs' },
      { t: 'footer', c: 'No es factura - Caja', v: true, o: 8, a: 'center', fs: 'xs' },
    ]);
  }

  function blocksSalon(presetId) {
    var fsNom = presetId === 'retail' || presetId === 'elegante' ? 'xl' : presetId === 'express' || presetId === 'economizador' ? 'md' : 'lg';
    return withLabelLogoBlocks([
      { t: 'salon_etiqueta', c: '', v: true, o: 2, a: 'left', fs: fsNom, fw: true },
      orn('diamond', 2.5),
      {
        t: 'footer',
        c: presetId === 'retail' ? 'Precio por gramo referencial' : 'Consulte en caja',
        v: presetId === 'retail' || presetId === 'profesional',
        o: 3,
        a: 'center',
        fs: 'xs',
      },
    ]);
  }

  function blocksTicket(presetId) {
    if (presetId === 'restaurante' || presetId === 'profesional') {
      return [
        orn('flourish', 0.5),
        { t: 'title', c: 'COMANDA', v: true, o: 1, a: 'center', fs: 'xl', fw: true },
        { t: 'consec', c: '', v: true, o: 2, a: 'center', fs: 'lg', fw: true },
        { t: 'comanda_slot', c: '', v: true, o: 2.5, a: 'center', fs: 'xl', fw: true },
        { t: 'client', c: '', v: true, o: 3, a: 'center', fs: 'xl', fw: true },
        { t: 'date', c: '', v: true, o: 4, a: 'center', fs: 'xs' },
        { t: 'divider', c: '4', v: true, o: 5 },
        { t: 'items', c: '', v: true, o: 6, a: 'left', fs: 'lg', fw: true },
        { t: 'footer', c: 'Preparar con amor', v: true, o: 7, a: 'left', fs: 'xs' },
      ];
    }
    if (presetId === 'express' || presetId === 'economizador') {
      return [
        { t: 'title', c: 'COMANDA', v: true, o: 1, a: 'center', fs: 'md', fw: true },
        { t: 'consec', c: '', v: true, o: 2, a: 'center', fs: 'sm' },
        { t: 'comanda_slot', c: '', v: true, o: 2.5, a: 'center', fs: 'xl', fw: true },
        { t: 'items', c: '', v: true, o: 3, a: 'left', fs: 'md', fw: true },
      ];
    }
    return [
      { t: 'title', c: 'COMANDA', v: true, o: 1, a: 'center', fs: 'lg', fw: true },
      { t: 'company', c: '', v: true, o: 2, a: 'center', fs: 'xs' },
      { t: 'consec', c: '', v: true, o: 3, a: 'center', fs: 'sm', fw: true },
      { t: 'comanda_slot', c: '', v: true, o: 3.5, a: 'center', fs: 'xl', fw: true },
      { t: 'date', c: '', v: true, o: 4, a: 'center', fs: 'xs' },
      { t: 'items', c: '', v: true, o: 5, a: 'left', fs: 'md', fw: true },
      { t: 'footer', c: 'Prioridad cocina / barra', v: true, o: 6, a: 'center', fs: 'xs' },
    ];
  }

  function blocksBodega(presetId) {
    var blocks = [
      { t: 'rotulo_nombre', c: '', v: true, o: 2, a: 'center', fs: presetId === 'elegante' ? 'xl' : 'lg', fw: true },
      { t: 'fechas_blank', c: '', v: true, o: 3, a: 'left', fs: 'sm' },
      orn('diamond', 3.5),
    ];
    if (presetId === 'profesional' || presetId === 'detallado') {
      blocks.push({ t: 'company', c: '', v: true, o: 4, a: 'center', fs: 'xs' });
    }
    blocks.push({
      t: 'footer',
      c: 'Pegar en producto - llenar FE FI FV',
      v: presetId !== 'express' && presetId !== 'economizador',
      o: 5,
      a: 'center',
      fs: 'xs',
    });
    return withLabelLogoBlocks(blocks);
  }

  function blocksFor(docType, presetId) {
    if (docType === 'precuenta') return blocksPrecuenta(presetId);
    if (docType === 'ticket') return blocksTicket(presetId);
    if (docType === 'bodega_entrada') {
      return withLabelLogoBlocks([
        { t: 'rotulo_nombre', c: '', v: true, o: 2, a: 'left', fs: 'lg', fw: true },
        orn('flourish', 2.5),
        { t: 'footer', c: 'Entrada de bodega', v: true, o: 3, a: 'center', fs: 'xs' },
      ]);
    }
    if (docType === 'bodega') return blocksBodega(presetId);
    if (docType === 'salon') return blocksSalon(presetId);
    if (docType === 'inventario') {
      return [
        { t: 'company', c: '', v: true, o: 1, a: 'center', fs: 'sm', fw: true },
        { t: 'title', c: 'INVENTARIO / CONTEO', v: true, o: 2, a: 'center', fs: 'lg', fw: true },
        { t: 'date', c: '', v: true, o: 3, a: 'center', fs: 'xs' },
        { t: 'divider', c: '4', v: true, o: 4 },
        { t: 'items', c: '', v: true, o: 5, a: 'left', fs: 'sm' },
        { t: 'footer', c: 'Cantidad en la unidad indicada', v: true, o: 6, a: 'center', fs: 'xs' },
      ];
    }
    return blocksFactura(presetId);
  }

  function docLabel(docType) {
    if (docType === 'precuenta') return 'Precuenta';
    if (docType === 'inventario') return 'Inventario';
    if (docType === 'salon') return 'Salón';
    if (docType === 'ticket') return 'Ticket';
    if (docType === 'bodega_entrada') return 'Bodega entrada';
    if (docType === 'bodega') return 'Bodega rótulo';
    return 'Factura';
  }

  function getTemplate(docType, presetId) {
    presetId = presetId || DEFAULT_PRESET;
    var p = meta(presetId);
    if (!p) {
      presetId = DEFAULT_PRESET;
      p = meta(DEFAULT_PRESET);
    }
    var blockPresetId = resolvePresetId(presetId);
    var raw = applyCutPolicy(
      {
        name: p.label + ' - ' + docLabel(docType),
        sz: szFor(presetId, docType),
        studio: true,
        docType: docType,
        presetId: p.id,
        blocks: blocksFor(docType, blockPresetId),
      },
      docType
    );
    if (typeof global.crozzoTermicaNormalizePlantilla === 'function') {
      var n = global.crozzoTermicaNormalizePlantilla(raw, { skipPolish: true });
      raw = n ? applyCutPolicy(n, docType) : raw;
    }
    if (
      global.CrozzoPrintStudioHub &&
      typeof global.CrozzoPrintStudioHub.polishTplForDocType === 'function'
    ) {
      raw = global.CrozzoPrintStudioHub.polishTplForDocType(raw, docType);
    } else if (docType === 'factura' && global.CrozzoTermicaColombia) {
      if (typeof global.CrozzoTermicaColombia.ensureFacturaBlocks === 'function') {
        raw = global.CrozzoTermicaColombia.ensureFacturaBlocks(raw);
      } else if (typeof global.CrozzoTermicaColombia.dedupeFacturaBlocks === 'function') {
        raw = global.CrozzoTermicaColombia.dedupeFacturaBlocks(raw);
      }
    } else if (
      docType === 'salon' &&
      global.CrozzoPrintStudioHub &&
      typeof global.CrozzoPrintStudioHub.ensureSalonBlocks === 'function'
    ) {
      raw = global.CrozzoPrintStudioHub.ensureSalonBlocks(raw);
    }
    return raw;
  }

  global.CrozzoPrintPresets = {
    PRESETS: PRESETS,
    DEFAULT_PRESET: DEFAULT_PRESET,
    CUT_POLICY: CUT_POLICY,
    cutPolicy: cutPolicy,
    applyCutPolicy: applyCutPolicy,
    getTemplate: getTemplate,
    getPresetMeta: meta,
    resolvePresetId: resolvePresetId,
    isValidPreset: function (id) {
      return PRESETS.some(function (p) { return p.id === id; });
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
