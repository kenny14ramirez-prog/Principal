/**
 * Crozzo — OCR Facturas Proveedor (H2.F)
 * --------------------------------------------------------------------------
 * Escanea/parsea facturas de proveedor para alimentar recepción con items
 * compatibles con CrozzoCatalogoMp.applyRecepcionItems / CrozzoReservorio.registrarRecepcion
 * 
 * Reutiliza Tesseract.js (ya en vendor/bundle). Usa CrozzoOcrLearning para aprendizaje.
 * 
 * Consola: CrozzoOcrFactura
 */
(function (global) {
  'use strict';

  var TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  var tesseractPromise = null;

  function loadTesseract() {
    if (tesseractPromise) return tesseractPromise;
    if (global.Tesseract) {
      tesseractPromise = Promise.resolve(global.Tesseract);
      return tesseractPromise;
    }
    // Intentar reutilizar ensureTesseract del bundle si existe
    if (typeof global.ensureTesseract === 'function') {
      tesseractPromise = Promise.resolve(global.ensureTesseract()).then(function () {
        return global.Tesseract || global;
      });
      return tesseractPromise;
    }
    tesseractPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = TESSERACT_CDN;
      script.async = true;
      script.onload = function () {
        resolve(global.Tesseract);
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return tesseractPromise;
  }

  function normalizeText(text) {
    if (!text) return '';
    return String(text)
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  function parseNumber(str) {
    if (!str) return 0;
    var s = String(str).replace(/\s/g, '').replace(/\$/g, '');
    // Separador miles . o , 
    if (s.indexOf(',') !== -1 && s.indexOf('.') !== -1) {
      // Si tiene ambos, asumir . miles , decimales o viceversa
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        s = s.replace(/,/g, '');
      }
    } else if (s.indexOf(',') !== -1) {
      s = s.replace(',', '.');
    } else {
      s = s.replace(/\./g, '');
    }
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  function extractHeader(text) {
    var lines = normalizeText(text).split('\n');
    var header = {};
    for (var i = 0; i < Math.min(lines.length, 30); i++) {
      var l = lines[i].toLowerCase();
      // NIT
      if (!header.nit && /(nit|n\.?i\.?t\.?)/.test(l)) {
        var mN = lines[i].match(/([0-9]{6,12}(?:-[0-9])?)/);
        if (mN) header.nit = mN[1];
      }
      // Factura
      if (!header.factura && /(factura|n[°º]|no\.|numero)/.test(l)) {
        var mF = lines[i].match(/([A-Z]{1,4}-?[0-9]{4,10})/);
        if (mF) header.factura = mF[1];
      }
      // Fecha
      if (!header.fecha) {
        var mD = lines[i].match(/([0-9]{2}[\/\-\.][0-9]{2}[\/\-\.][0-9]{4})/);
        if (mD) header.fecha = mD[1];
      }
      // Total
      if (!header.total) {
        var mT = lines[i].match(/total[:\s]+\$?\s*([0-9\.,]+)/i);
        if (mT) header.total = parseNumber(mT[1]);
      }
    }
    return header;
  }

  function extractItems(text) {
    var lines = normalizeText(text).split('\n');
    var items = [];
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      // Buscar líneas con descripción + cantidad + precio
      // Patrones comunes: "PROD X 2 1500 3000" o "PROD X\t2\t$1500"
      var m = l.match(/^(.+?)\s+([0-9]+(?:\.[0-9]+)?)\s+(?:\$?\s*)?([0-9\.,]+)\s+(?:\$?\s*)?([0-9\.,]+)$/);
      if (m) {
        var desc = m[1].trim();
        var cant = parseFloat(m[2]);
        var precioUnit = parseNumber(m[3]);
        var precioTotal = parseNumber(m[4]);
        if (precioTotal === 0 && precioUnit > 0 && cant > 0) precioTotal = precioUnit * cant;
        if (cant > 0 && precioTotal > 0 && desc.length > 3) {
          items.push({
            descripcion: desc,
            cantidad: cant,
            precioUnit: precioUnit,
            precioTotal: precioTotal,
            confianza: 70,
            raw: l
          });
        }
      }
    }
    return items;
  }

  function confidenceScore(line) {
    var score = 50;
    if (line.descripcion && line.descripcion.length > 5) score += 10;
    if (line.cantidad > 0) score += 10;
    if (line.precioTotal > 0) score += 15;
    if (line.mpId) score += 15;
    return Math.min(100, score);
  }

  function findMatch(desc) {
    try {
      if (global.CrozzoCatalogoMp && typeof global.CrozzoCatalogoMp.list === 'function') {
        var list = global.CrozzoCatalogoMp.list() || [];
        var d = (desc || '').toLowerCase().trim();
        for (var i = 0; i < list.length; i++) {
          var it = list[i];
          var n = (it.nombre || '').toLowerCase();
          if (n && (n.indexOf(d) !== -1 || d.indexOf(n) !== -1)) {
            return it;
          }
        }
        // match por palabras clave
        var words = d.split(/\s+/).filter(function (w) { return w.length > 3; });
        for (var j = 0; j < list.length; j++) {
          var it2 = list[j];
          var n2 = (it2.nombre || '').toLowerCase();
          var match = 0;
          for (var k = 0; k < words.length; k++) {
            if (n2.indexOf(words[k]) !== -1) match++;
          }
          if (match >= 2) return it2;
        }
      }
    } catch (_) {}
    return null;
  }

  function mapToRecepcionItems(ocrItems) {
    var out = [];
    for (var i = 0; i < ocrItems.length; i++) {
      var l = ocrItems[i];
      var mp = l.mpId ? { mpId: l.mpId, und: l.und, nombre: l.productoNombre } : findMatch(l.descripcion);
      if (!mp || !mp.mpId) {
        l.sinMatch = true;
        l.confianza = Math.min(40, confidenceScore(l));
        continue;
      }
      var cantidad = Number(l.cantidad) || 0;
      var precioTotal = Number(l.precioTotal) || 0;
      if (cantidad <= 0 || precioTotal <= 0) continue;
      var item = {
        mpId: mp.mpId,
        precioTotal: precioTotal,
        peso: cantidad,
        und: l.und || mp.und || 'GR',
        productoNombre: l.descripcion || mp.nombre || mp.productoNombre
      };
      item._confianza = confidenceScore(Object.assign({}, l, { mpId: mp.mpId }));
      out.push(item);
    }
    return out;
  }

  function escanearFactura(imagenFile) {
    return loadTesseract().then(function (Tesseract) {
      var worker;
      if (Tesseract.createWorker) {
        return Tesseract.createWorker('spa').then(function (w) {
          worker = w;
          return worker.recognize(imagenFile).then(function (result) {
            var text = result && result.data ? result.data.text : '';
            return worker.terminate().then(function () {
              return text;
            });
          });
        });
      } else if (Tesseract.recognize) {
        return Tesseract.recognize(imagenFile, 'spa').then(function (result) {
          return result && result.data ? result.data.text : (result && result.text) || '';
        });
      }
      throw new Error('Tesseract no disponible');
    });
  }

  function parsearFactura(texto) {
    var text = normalizeText(texto);
    var header = extractHeader(text);
    var items = extractItems(text);
    items = items.map(function (it) {
      var mp = findMatch(it.descripcion);
      if (mp) {
        it.mpId = mp.mpId;
        it.und = mp.und;
        it.productoNombre = mp.nombre;
        it.confianza = confidenceScore(it);
      } else {
        it.confianza = Math.min(40, confidenceScore(it));
        it.sinMatch = true;
      }
      return it;
    });
    return {
      header: header,
      items: items,
      itemsMapeados: mapToRecepcionItems(items)
    };
  }

  function sugerirCatalogo(parseado) {
    var sugeridos = [];
    if (!parseado || !parseado.items) return sugeridos;
    for (var i = 0; i < parseado.items.length; i++) {
      var it = parseado.items[i];
      if (it.sinMatch && it.descripcion) {
        sugeridos.push({
          nombre: it.descripcion,
          und: 'GR',
          precioSugerido: it.precioUnit || (it.precioTotal / (it.cantidad || 1)),
          origen: 'ocr-factura',
          linea: it
        });
      }
    }
    return sugeridos;
  }

  global.CrozzoOcrFactura = {
    loadTesseract: loadTesseract,
    escanearFactura: escanearFactura,
    parsearFactura: parsearFactura,
    mapToRecepcionItems: mapToRecepcionItems,
    sugerirCatalogo: sugerirCatalogo,
    confidenceScore: confidenceScore,
    parseNumber: parseNumber
  };
})(typeof window !== 'undefined' ? window : globalThis);
