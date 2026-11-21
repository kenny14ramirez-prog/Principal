/**
 * Bona Origen — Parser de intenciones para el asistente IA (Fase 4).
 * Detecta etiquetas de acción [ACTION:id] en la respuesta del asistente
 * y, opcionalmente, intenciones por palabras clave.
 */
(function (global) {
  'use strict';

  var INTENT_META = {
    repair_connection: { label: 'Reparar conexión', keywords: ['reparar conexion', 'reparar conexión', 'reparar red', 'reconectar'] },
    test_printer: { label: 'Probar impresora', keywords: ['probar impresora', 'test impresora', 'imprimir prueba'] },
    open_printer_rescue: { label: 'Abrir asistente de impresora', keywords: ['impresora no reconocida', 'rescate impresora', 'configurar impresora'] },
    clear_error_log: { label: 'Limpiar log de errores', keywords: ['limpiar log', 'borrar errores', 'limpiar errores'] },
    open_help: { label: 'Abrir centro de ayuda', keywords: ['ayuda', 'centro de ayuda', 'manual'] },
    reindex_rag: { label: 'Reindexar documentos', keywords: ['reindexar', 'reindexar rag', 'reindexar documentos'] },
    report_failures: { label: 'Reportar fallas', keywords: ['reporte las fallas', 'reportar fallas', 'reporte de fallas', 'reporte fallas'] },
  };

  function normalize(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function parseActionTags(text) {
    var out = [];
    var re = /\[ACTION:([a-zA-Z0-9_\-]+)\]/g;
    var m;
    while ((m = re.exec(String(text || ''))) !== null) {
      if (out.indexOf(m[1]) === -1) out.push(m[1]);
    }
    return out;
  }

  function detectKeywords(text) {
    var n = normalize(text);
    var out = [];
    Object.keys(INTENT_META).forEach(function (id) {
      var meta = INTENT_META[id];
      var kws = meta.keywords || [];
      for (var i = 0; i < kws.length; i++) {
        if (n.indexOf(normalize(kws[i])) !== -1) {
          if (out.indexOf(id) === -1) out.push(id);
          break;
        }
      }
    });
    return out;
  }

  function parse(text, opts) {
    opts = opts || {};
    var tags = parseActionTags(text);
    var intents = tags.slice();
    if (opts.keywords) {
      detectKeywords(text).forEach(function (id) {
        if (intents.indexOf(id) === -1) intents.push(id);
      });
    }
    var actions = intents.map(function (id) {
      var meta = INTENT_META[id] || {};
      return { id: id, label: meta.label || id };
    });
    return { intents: intents, actions: actions, tags: tags };
  }

  global.CrozzoAiIntentParser = {
    INTENTS: INTENT_META,
    parse: parse,
    parseActionTags: parseActionTags,
    detectKeywords: detectKeywords,
  };
})(typeof window !== 'undefined' ? window : globalThis);