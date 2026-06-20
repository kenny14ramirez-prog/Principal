/**
 * CrozzoOcrLearning — bucle de aprendizaje del OCR/extracción de facturas.
 *
 * Registra las correcciones del usuario (campo, valor propuesto por la IA/OCR,
 * valor corregido) en el almacenamiento local del POS. Estos datos alimentan a
 * futuro el perfil de entrenamiento (app/data/fe-training-profile.json) y la
 * mejora continua: reglas por proveedor, ajuste de prompts y fine-tuning.
 *
 * API global (window.CrozzoOcrLearning):
 *   record({campo, valorOriginal, valorCorregido, proveedorNit?, proveedorNombre?,
 *           facturaId?, fuente?, ocrText?})  -> registro | null (null si no hubo cambio)
 *   all()        -> Array<registro>
 *   stats()      -> { total, porCampo, porProveedor }
 *   exportJson() -> string (para alimentar el entrenamiento)
 *   clear()      -> void
 */
(function (global) {
  'use strict';

  var KEY = 'crozzo_ocr_correcciones_v1';
  var MAX = 2000;

  function load() {
    try {
      var raw = global.localStorage ? global.localStorage.getItem(KEY) : null;
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function save(arr) {
    try {
      if (global.localStorage) global.localStorage.setItem(KEY, JSON.stringify(arr.slice(-MAX)));
    } catch (e) {
      /* cuota llena / storage no disponible: el aprendizaje es best-effort */
    }
  }

  function lightHash(str) {
    var h = 5381 >>> 0;
    var s = String(str || '');
    for (var i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
    return 'h' + h.toString(16);
  }

  function str(v) {
    return v == null ? '' : String(v);
  }

  function record(entry) {
    if (!entry || !entry.campo) return null;
    var orig = str(entry.valorOriginal).trim();
    var corr = str(entry.valorCorregido).trim();
    if (orig === corr) return null; // sin cambio real → no es una corrección
    var rec = {
      id: 'corr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      campo: str(entry.campo),
      valorOriginal: orig,
      valorCorregido: corr,
      proveedorNit: str(entry.proveedorNit),
      proveedorNombre: str(entry.proveedorNombre),
      facturaId: str(entry.facturaId),
      fuente: str(entry.fuente) || 'ocr',
      ocrTextHash: entry.ocrText ? lightHash(entry.ocrText) : '',
      razonamiento: entry.razonamiento || null,
      ts: new Date().toISOString(),
    };
    var arr = load();
    arr.push(rec);
    save(arr);
    return rec;
  }

  function all() {
    return load();
  }

  function stats() {
    var arr = load();
    var porCampo = {};
    var porProveedor = {};
    arr.forEach(function (r) {
      porCampo[r.campo] = (porCampo[r.campo] || 0) + 1;
      var k = r.proveedorNit || r.proveedorNombre || '(sin proveedor)';
      porProveedor[k] = (porProveedor[k] || 0) + 1;
    });
    return { total: arr.length, porCampo: porCampo, porProveedor: porProveedor };
  }

  function exportJson() {
    return JSON.stringify(load(), null, 2);
  }

  function clear() {
    save([]);
  }

  global.CrozzoOcrLearning = {
    record: record,
    all: all,
    stats: stats,
    exportJson: exportJson,
    clear: clear,
  };
})(typeof window !== 'undefined' ? window : this);
