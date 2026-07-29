/**
 * Crozzo — Renderer QR DIAN para ticket (H1.6)
 * --------------------------------------------------------------------------
 * Genera la imagen QR del VPFE DIAN (catalogo-vpfe.dian.gov.co) y la inyecta
 * en el ticket electrónico. Resuelve el requisito #3 de representación gráfica:
 * el ticket debe tener QR escaneable que abra la validación DIAN.
 *
 * Usa CrozzoQRCode (vendor qrcode.js) que dibuja en un <canvas>/<img>.
 * Genera también el nº de validación DIAN junto al QR.
 *
 * Doctrina: el QR SOLO se renderiza si hay CUFE real (timbrado por PT).
 * Documentos en contingencia (pendiente_timbrado) o Sandbox (Nivel 0)
 * NO muestran QR DIAN — muestran watermark claro de su estado.
 *
 * URL VPFE: https://catalogo-vpfe.dian.gov.co/User/SearchDocument?documentkey=CUFE
 * Doc: docs/maps/FISCAL-CO-BLOQUEANTES.md (requisito #3)
 */
(function (global) {
  'use strict';

  var VPFE_QR_BASE = 'https://catalogo-vpfe.dian.gov.co/User/SearchDocument';

  function vpfeUrl(cufe) {
    return VPFE_QR_BASE + '?documentkey=' + encodeURIComponent(String(cufe || ''));
  }

  /**
   * ¿La factura tiene CUFE real válido para renderizar QR?
   * Excluye: documentos pendientes (contingencia), CUFE demo, sandbox.
   */
  function tieneCufeValido(factura) {
    if (!factura) return false;
    var c = String(factura.cufe || '').trim();
    if (!c) return false;
    if (/^(pendiente|DEMO|NO-APLICA)/i.test(c)) return false;
    if (factura.estado === 'pendiente_timbrado') return false;
    if (factura.isDemo === true) return false;
    return true;
  }

  /**
   * Genera el QR como dataURL (base64 PNG) usando CrozzoQRCode.
   * @param {string} cufe
   * @param {number} size píxeles (default 120)
   * @returns {string|null} dataURL o null si no se pudo generar
   */
  function generarDataURL(cufe, size) {
    try {
      var QRCodeLib = global.QRCode;
      if (!QRCodeLib) return null;
      var s = Math.max(60, Math.min(300, Number(size) || 120));
      // Crear canvas off-screen
      var doc = global.document;
      if (!doc) return null;
      var canvas = doc.createElement('canvas');
      canvas.width = s; canvas.height = s;
      var qr = QRCodeLib.create(cufe, { width: s, height: s });
      // qrcode.js create() devuelve módulos; dibujar manualmente
      if (qr && qr.modules) {
        var ctx = canvas.getContext('2d');
        var modules = qr.modules;
        var len = modules.length;
        var cell = s / len;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, s, s);
        ctx.fillStyle = '#000000';
        for (var r = 0; r < len; r++) {
          for (var c = 0; c < len; c++) {
            if (modules[r][c]) {
              ctx.fillRect(c * cell, r * cell, cell, cell);
            }
          }
        }
        return canvas.toDataURL('image/png');
      }
      // Fallback: API tipo new QRCode(canvas, opts) si create no existe
      new QRCodeLib(canvas, { text: cufe, width: s, height: s });
      return canvas.toDataURL('image/png');
    } catch (e) {
      return null;
    }
  }

  /**
   * Genera el bloque HTML del QR + nº validación DIAN para el ticket.
   * @param {object} factura { cufe, qrUrl, numeroValidacion, estado }
   * @param {object} opts { size }
   * @returns {string} HTML listo para insertar en ticket
   */
  function renderHtml(factura, opts) {
    if (!tieneCufeValido(factura)) {
      // Documento sin CUFE real: estado honesto
      if (factura && factura.estado === 'pendiente_timbrado') {
        return '<div class="crozzo-ticket-qr crozzo-pendiente" style="text-align:center;font-size:10px;padding:4px 0;">' +
          '⏳ Pendiente de timbrado DIAN (contingencia). ' +
          'Se transmitirá al recuperar conexión (máx 48h).</div>';
      }
      return '<div class="crozzo-ticket-qr crozzo-sin-cufe" style="text-align:center;font-size:10px;color:#999;padding:4px 0;">' +
        'Sin QR DIAN (documento no fiscal).</div>';
    }

    var cufe = String(factura.cufe).trim();
    var url = factura.qrUrl || vpfeUrl(cufe);
    var size = (opts && opts.size) || 120;
    var dataURL = generarDataURL(url, size);

    var html = '<div class="crozzo-ticket-qr" style="text-align:center;padding:6px 0;">';
    if (dataURL) {
      html += '<img src="' + dataURL + '" width="' + size + '" height="' + size + '" alt="QR DIAN" style="image-rendering:pixelated;"/>';
    } else {
      // Fallback: enlace de texto si no se puede generar imagen
      html += '<div style="font-size:9px;border:1px solid #000;padding:4px;margin:0 auto;display:inline-block;">QR: ' + url.substring(0, 40) + '...</div>';
    }
    // Nº de validación DIAN (si viene del timbrado)
    if (factura.numeroValidacion) {
      html += '<div style="font-size:9px;margin-top:2px;">Nº validación DIAN: ' + factura.numeroValidacion + '</div>';
    }
    // CUFE (siempre visible, truncado)
    html += '<div style="font-size:7px;margin-top:2px;word-break:break-all;max-width:280px;margin-left:auto;margin-right:auto;">CUFE: ' + cufe + '</div>';
    html += '<div style="font-size:8px;margin-top:2px;color:#666;">Escanee para verificar en catalogo-vpfe.dian.gov.co</div>';
    html += '</div>';
    return html;
  }

  /**
   * Rellena el bloque {t:'qr'} del ticket térmico con la imagen generada.
   * Hook para el orquestador de impresión térmica.
   * @returns {object|null} { dataURL, cufe, url } o null si no aplica
   */
  function paraBloqueTermico(factura, opts) {
    if (!tieneCufeValido(factura)) return null;
    var cufe = String(factura.cufe).trim();
    var url = factura.qrUrl || vpfeUrl(cufe);
    var dataURL = generarDataURL(url, (opts && opts.size) || 120);
    return { dataURL: dataURL, cufe: cufe, url: url, numeroValidacion: factura.numeroValidacion || null };
  }

  global.CrozzoTicketQR = {
    VPFE_QR_BASE: VPFE_QR_BASE,
    vpfeUrl: vpfeUrl,
    tieneCufeValido: tieneCufeValido,
    generarDataURL: generarDataURL,
    renderHtml: renderHtml,
    paraBloqueTermico: paraBloqueTermico
  };
})(typeof window !== 'undefined' ? window : globalThis);
