/**
 * CrozzoDocumentTemplates — Centralización de plantillas de documentos.
 *
 * Reúne en un solo punto las plantillas por tipo de documento (factura, cotización,
 * remisión, cierre, inventario, comanda, pedido interno, recetario, reporte) y
 * delega el estilo a CrozzoDocDesign (tokens + clases reutilizables).
 *
 * Los módulos solo proveen DATOS; las plantillas proveen ESTILO. Esto evita
 * duplicación de CSS y asegura branding "Bona Origen" consistente.
 *
 * Fuente canónica: app/core/CrozzoDocumentTemplates.js → sync → src/core/...
 */
(function (global) {
  'use strict';

  var D = global.CrozzoDocDesign || null;

  // Registro de plantillas por tipo de documento.
  // Cada entrada: { tipo, modo ('thermal'|'sheet'|'report'), titulo, render(data) -> html }
  var TEMPLATES = {
    comanda: { modo: 'thermal', titulo: 'Comanda' },
    factura: { modo: 'sheet', titulo: 'Comprobante de venta' },
    cotizacion: { modo: 'sheet', titulo: 'Cotización' },
    remision: { modo: 'sheet', titulo: 'Remisión' },
    cierre: { modo: 'sheet', titulo: 'Cierre de caja' },
    inventario: { modo: 'sheet', titulo: 'Inventario' },
    pedidoInterno: { modo: 'thermal', titulo: 'Pedido interno' },
    recetario: { modo: 'sheet', titulo: 'Recetario' },
    reporte: { modo: 'report', titulo: 'Reporte' },
  };

  function getTemplate(tipo) {
    return TEMPLATES[tipo] || null;
  }

  function listTypes() {
    return Object.keys(TEMPLATES);
  }

  function cssFor(tipo) {
    var t = TEMPLATES[tipo];
    if (!t || !D) return '';
    return D.css(t.modo);
  }

  function wrap(bodyHtml, tipo, title) {
    var t = TEMPLATES[tipo] || {};
    if (D && typeof D.wrapDocument === 'function') {
      return D.wrapDocument(bodyHtml, t.modo || 'sheet', title || t.titulo);
    }
    return bodyHtml;
  }

  global.CrozzoDocumentTemplates = {
    TEMPLATES: TEMPLATES,
    getTemplate: getTemplate,
    listTypes: listTypes,
    cssFor: cssFor,
    wrap: wrap,
    BRAND: D ? D.BRAND : 'Bona Origen',
  };
})(typeof window !== 'undefined' ? window : globalThis);