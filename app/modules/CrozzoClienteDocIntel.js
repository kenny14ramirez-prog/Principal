/**
 * Crozzo POS — Lectura de documentos colombianos (cédula PDF417, NIT, escaneo).
 */
(function (global) {
  'use strict';

  function cleanPart(p) {
    return String(p || '')
      .trim()
      .replace(/^CC/i, '')
      .replace(/\s+/g, ' ');
  }

  function isNameToken(p) {
    if (!p || p.length < 2 || p.length > 40) return false;
    if (/[0-9@]/.test(p)) return false;
    return /^[A-Za-zÁÉÍÓÚáéíóúÑñ][A-Za-zÁÉÍÓÚáéíóúÑñ\s.-]+$/.test(p);
  }

  function buildNombreCompleto(names) {
    if (!names || !names.length) return '';
    if (names.length >= 4) {
      return names[2] + ' ' + names[3] + ' ' + names[0] + ' ' + names[1];
    }
    if (names.length === 3) return names[2] + ' ' + names[0] + ' ' + names[1];
    if (names.length === 2) return names[1] + ' ' + names[0];
    return names[0];
  }

  /**
   * Payload típico cédula CO (PDF417 / lector USB): líneas o $ con número + apellidos + nombres.
   */
  function parseColombianIdPayload(raw) {
    var s = String(raw || '').trim();
    if (!s || s.length < 10) return null;
    s = s.replace(/\r/g, '\n');
    var parts = s
      .split(/[\n\x1d\x1e\x1f\$]+/)
      .map(cleanPart)
      .filter(Boolean);
    if (parts.length < 2 && s.indexOf('$') < 0 && s.indexOf('\n') < 0) return null;

    var doc = '';
    var names = [];
    var extras = [];
    var i;
    for (i = 0; i < parts.length; i++) {
      var p = parts[i];
      var digits = p.replace(/\D/g, '');
      if (!doc && digits.length >= 6 && digits.length <= 11 && /^[0-9.\-\s]+$/.test(p)) {
        doc = digits.length > 10 ? digits.slice(0, 10) : digits;
        if (typeof global.validarNIT === 'function') {
          try {
            var vr = global.validarNIT(doc, { relajado: true });
            if (vr.valido && vr.modo === 'nit_dian' && vr.base) {
              doc = vr.base + '-' + vr.dv;
            } else if (vr.valido && vr.modo === 'cedula_o_documento' && vr.base) {
              doc = vr.base;
            }
          } catch (_) {}
        }
        continue;
      }
      if (isNameToken(p)) names.push(p.toUpperCase());
      else if (p.length >= 4) extras.push(p);
    }

    if (!doc) {
      var m = s.match(/(?:CC)?([0-9]{6,11})/i);
      if (m) doc = m[1];
    }
    if (!doc) return null;

    var tipoKey = 'cc';
    var tipoLabel = 'Cédula';
    if (String(doc).indexOf('-') >= 0 || String(doc).replace(/\D/g, '').length >= 9) {
      var nd = String(doc).replace(/\D/g, '');
      if (nd.length >= 9 && typeof global.intentarSepararNitDv === 'function') {
        var sp = global.intentarSepararNitDv(nd);
        if (sp) {
          tipoKey = 'nit';
          tipoLabel = 'NIT';
          doc = sp.display;
        }
      }
    }

    var nombreCompleto = buildNombreCompleto(names);
    var birth = '';
    var sex = '';
    for (i = 0; i < extras.length; i++) {
      if (/^[MF]$/i.test(extras[i])) sex = extras[i].toUpperCase();
      if (/^[0-9]{8}$/.test(extras[i].replace(/\D/g, '')) && extras[i].replace(/\D/g, '').length === 8) {
        birth = extras[i].replace(/\D/g, '');
      }
    }

    return {
      documento: doc,
      tipoKey: tipoKey,
      tipoLabel: tipoLabel,
      nombres: names.slice(2).join(' '),
      apellidos: names.slice(0, 2).join(' '),
      nombreCompleto: nombreCompleto,
      sexo: sex,
      fechaNacimiento: birth,
      raw: s.slice(0, 500),
    };
  }

  function looksLikeIdScan(raw) {
    var s = String(raw || '');
    if (!s || s.length < 12) return false;
    if (s.indexOf('\n') >= 0 || s.indexOf('$') >= 0 || s.indexOf('\x1d') >= 0) return true;
    if (s.length >= 28 && /[0-9]{6,}/.test(s) && /[A-Za-zÁÉÍÓÚ]{3,}/.test(s)) return true;
    return /^CC[0-9]{6,}/i.test(s.trim());
  }

  function tryParseFromScan(raw) {
    if (!looksLikeIdScan(raw)) return null;
    return parseColombianIdPayload(raw);
  }

  function formatHintLine(info) {
    if (!info) return '';
    var bits = [info.tipoLabel + ' ' + info.documento];
    if (info.nombreCompleto) bits.push(info.nombreCompleto);
    if (info.sexo) bits.push(info.sexo);
    return bits.join(' · ');
  }

  global.CrozzoClienteDocIntel = {
    parseColombianIdPayload: parseColombianIdPayload,
    tryParseFromScan: tryParseFromScan,
    looksLikeIdScan: looksLikeIdScan,
    formatHintLine: formatHintLine,
  };
})(typeof window !== 'undefined' ? window : globalThis);
