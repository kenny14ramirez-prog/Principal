/**
 * Crozzo POS — impresión térmica unificada.
 * Tauri (Windows): ESC/POS directo vía WinAPI sin diálogo.
 * Navegador: fallback iframe + window.print().
 */
(function (global) {
  'use strict';

  var DEFAULT_PRINTERS = ['Generic 58mm', 'Generic 80mm'];
  var PHANTOM_PRINTER_RE = /^generic\s*(58|80)\s*mm$/i;
  global.__CROZZO_SYSTEM_PRINTERS = global.__CROZZO_SYSTEM_PRINTERS || [];

  function crozzoIsPhantomPrinter(name) {
    return PHANTOM_PRINTER_RE.test(String(name || '').trim());
  }

  function crozzoPrinterInSystemList(name) {
    var n = String(name || '').trim().toLowerCase();
    if (!n) return false;
    var list = global.__CROZZO_SYSTEM_PRINTERS || [];
    for (var i = 0; i < list.length; i++) {
      if (String(list[i]).toLowerCase() === n) return true;
    }
    return false;
  }

  function crozzoPickThermalPrinterFromSystem() {
    var list = global.__CROZZO_SYSTEM_PRINTERS || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (/pos|80|term|thermal|ticket|epson|star|bixolon/i.test(String(list[i]))) return list[i];
    }
    return list.length ? list[0] : '';
  }

  /** Nombre real en Windows: DOM → config → predeterminada → térmica detectada. */
  function crozzoResolvePrinterForJob(requested, role) {
    role = role || 'caja';
    var name = String(requested || '').trim();
    if (!name && typeof document !== 'undefined') {
      if (role === 'comanda') {
        var comEl = document.getElementById('adminComandaPrinter');
        if (comEl && comEl.value) name = String(comEl.value).trim();
      } else if (role === 'bodega') {
        var bodEl = document.getElementById('bodegaPrinterSelect');
        if (bodEl && bodEl.value) name = String(bodEl.value).trim();
      } else {
        var studioEl = document.getElementById('crozzoPsStudioPrinter');
        if (studioEl && studioEl.value) name = String(studioEl.value).trim();
        if (!name) {
          var cajaEl = document.getElementById('adminCajaPosPrinter');
          if (cajaEl && cajaEl.value) name = String(cajaEl.value).trim();
        }
      }
    }
    if (!name) {
      var conf = getAdminConfig();
      if (role === 'comanda') name = String(conf.impresoraComandas || '').trim();
      else if (role === 'bodega') {
        name = String(conf.impresoraBodega || conf.impresoraCajaPos || '').trim();
      } else {
        name = String(conf.impresoraCajaPos || '').trim();
      }
    }

    if (crozzoIsPhantomPrinter(name)) name = '';

    var system = global.__CROZZO_SYSTEM_PRINTERS || [];
    if (crozzoIsTauri() && system.length) {
      if (name) name = crozzoMatchSystemPrinter(name);
      if (!name || !crozzoPrinterInSystemList(name)) {
        var def = global.__CROZZO_DEFAULT_PRINTER || '';
        if (def) name = crozzoMatchSystemPrinter(def) || def;
      }
      if (!name || !crozzoPrinterInSystemList(name)) {
        name = crozzoPickThermalPrinterFromSystem();
      }
    } else if (name) {
      name = crozzoMatchSystemPrinter(name);
    }
    return String(name || '').trim();
  }

  function crozzoSanitizeSavedPrinterConfig() {
    if (!crozzoIsTauri()) return false;
    var system = global.__CROZZO_SYSTEM_PRINTERS || [];
    if (!system.length) return false;
    var conf = getAdminConfig();
    var fallback = crozzoResolvePrinterForJob(global.__CROZZO_DEFAULT_PRINTER || '', 'caja');
    if (!fallback) return false;
    var patch = {};
    function printerInAvailableList(name) {
      var n = String(name || '').trim().toLowerCase();
      if (!n) return false;
      var avail = crozzoGetAvailablePrinters();
      for (var i = 0; i < avail.length; i++) {
        if (String(avail[i]).toLowerCase() === n) return true;
      }
      return crozzoPrinterInSystemList(name);
    }
    function fixKey(key, allowEmpty) {
      var v = String(conf[key] || '').trim();
      if (allowEmpty && !v) return;
      if (!v || crozzoIsPhantomPrinter(v)) {
        if (!allowEmpty) patch[key] = fallback;
        return;
      }
      var matched = crozzoMatchSystemPrinter(v) || v;
      if (crozzoIsPhantomPrinter(matched)) {
        if (!allowEmpty) patch[key] = fallback;
        return;
      }
      if (!printerInAvailableList(matched)) {
        if (!allowEmpty) patch[key] = fallback;
      } else if (matched !== v) {
        patch[key] = matched;
      }
    }
    fixKey('impresoraCajaPos', false);
    fixKey('impresoraBodega', true);
    fixKey('impresoraComandas', true);
    fixKey('impresoraSalon', true);
    if (!Object.keys(patch).length) return false;
    if (global.config && global.config.set) {
      global.config.set('facturacionAdmin', Object.assign({}, conf, patch));
    }
    crozzoRefreshPrinterList();
    return true;
  }

  function crozzoIsTauri() {
    return !!(global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function');
  }

  function crozzoGetPrintBackend() {
    if (!crozzoIsTauri()) return 'html';
    var ua = String((global.navigator && global.navigator.userAgent) || '');
    if (/Windows/i.test(ua)) return 'winapi';
    if (/Mac OS X|Macintosh/i.test(ua)) return 'cups';
    if (/Linux/i.test(ua)) return 'cups';
    return 'html';
  }

  function crozzoTauriInvoke(cmd, args) {
    return global.__TAURI__.core.invoke(cmd, args || {});
  }

  function crozzoUtf8ToBase64(str) {
    if (!str) return '';
    try {
      if (typeof TextEncoder !== 'undefined') {
        return crozzoBytesToBase64(new TextEncoder().encode(String(str)));
      }
    } catch (_) {}
    return btoa(unescape(encodeURIComponent(String(str))));
  }

  function crozzoBytesToBase64(bytes) {
    var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    if (!u8.length) return '';
    var CHUNK = 0x8000;
    var bin = '';
    for (var i = 0; i < u8.length; i += CHUNK) {
      var slice = u8.subarray(i, Math.min(i + CHUNK, u8.length));
      bin += String.fromCharCode.apply(null, slice);
    }
    return btoa(bin);
  }

  function crozzoBuildPingEscPos() {
    var chunks = [];
    escInit(chunks);
    escAlign(chunks, 'center');
    escBold(chunks, true);
    escPushText(chunks, 'CROZZO - PRUEBA');
    escBold(chunks, false);
    escPushText(chunks, escFmtDatePlain(new Date()));
    escPushText(chunks, 'Prueba n - termica OK');
    escApplyCut(chunks, 'partial', 4);
    return escChunksToUint8(chunks);
  }

  function crozzoEnsurePrintersLoaded() {
    if (!crozzoIsTauri()) return Promise.resolve([]);
    return crozzoLoadSystemPrintersAsync({ force: true }).then(function (list) {
      if (typeof global.crozzoRefreshPrinterSelectOptions === 'function') {
        global.crozzoRefreshPrinterSelectOptions();
      } else if (typeof window !== 'undefined' && window.crozzoRefreshPrinterSelectOptions) {
        window.crozzoRefreshPrinterSelectOptions();
      }
      return list || global.__CROZZO_SYSTEM_PRINTERS || [];
    });
  }

  function getAdminConfig() {
    return typeof global.getFacturacionAdminConfig === 'function' ? global.getFacturacionAdminConfig() : {};
  }

  function getCopies() {
    return Math.max(1, Math.min(5, Number(getAdminConfig().copiasFactura) || 1));
  }

  function getCajaPrinter() {
    return crozzoResolvePrinterForJob('', 'caja');
  }

  function crozzoPreferSilentPrint(options) {
    options = options || {};
    if (options.allowDialog === true || options.silent === false) return false;
    if (options.silent === true) return true;
    return crozzoIsTauri();
  }

  function getComandaPrinter() {
    return crozzoResolvePrinterForJob('', 'comanda');
  }

  function crozzoGetAvailablePrinters() {
    var conf = getAdminConfig();
    var custom = Array.isArray(conf.impresorasCustom) ? conf.impresorasCustom : [];
    var system = global.__CROZZO_SYSTEM_PRINTERS || [];
    var caja = String(getAdminConfig().impresoraCajaPos || '').trim();
    var com = String(getAdminConfig().impresoraComandas || '').trim();
    var bod = String(getAdminConfig().impresoraBodega || '').trim();
    var sal = String(getAdminConfig().impresoraSalon || '').trim();
    var extras = [];
    if (!crozzoIsTauri() || !system.length) extras = DEFAULT_PRINTERS.slice();
    var seen = {};
    var out = [];
    [caja, com, bod, sal].concat(system, custom, extras).forEach(function (p) {
      p = String(p || '').trim();
      if (!p || crozzoIsPhantomPrinter(p)) return;
      if (seen[p.toLowerCase()]) return;
      seen[p.toLowerCase()] = true;
      out.push(p);
    });
    return out;
  }

  function crozzoRefreshPrinterList() {
    if (global.__crozzoRefreshingPrinterList) {
      return global.AVAILABLE_PRINTERS || crozzoGetAvailablePrinters();
    }
    global.__crozzoRefreshingPrinterList = true;
    try {
      global.AVAILABLE_PRINTERS = crozzoGetAvailablePrinters();
      return global.AVAILABLE_PRINTERS;
    } finally {
      global.__crozzoRefreshingPrinterList = false;
    }
  }

  function crozzoDispatchPrintersUpdated(detail) {
    try {
      global.dispatchEvent(
        new CustomEvent('crozzo:printers-updated', {
          detail: detail || {},
        })
      );
    } catch (_) {}
  }

  function crozzoPrinterListsEqual(a, b) {
    var x = a || [];
    var y = b || [];
    if (x.length !== y.length) return false;
    for (var i = 0; i < x.length; i++) {
      if (String(x[i]).toLowerCase() !== String(y[i]).toLowerCase()) return false;
    }
    return true;
  }

  function crozzoFinishPrinterLoad(list, def, source) {
    var prev = global.__CROZZO_SYSTEM_PRINTERS || [];
    var next = Array.isArray(list) ? list.filter(Boolean) : [];
    var defStr = def ? String(def) : '';
    var changed =
      !crozzoPrinterListsEqual(prev, next) ||
      String(global.__CROZZO_DEFAULT_PRINTER || '') !== defStr;
    global.__CROZZO_SYSTEM_PRINTERS = next;
    global.__CROZZO_DEFAULT_PRINTER = defStr;
    global.__CROZZO_PRINTERS_LOADED_AT = Date.now();
    crozzoRefreshPrinterList();
    var sanitized = crozzoSanitizeSavedPrinterConfig();
    if (changed || sanitized) {
      crozzoDispatchPrintersUpdated({
        list: next.slice(),
        defaultPrinter: defStr,
        backend: crozzoGetPrintBackend(),
        source: source || 'system',
        sanitized: sanitized,
      });
    }
    return next;
  }

  function crozzoLoadSystemPrintersAsync(opts) {
    opts = opts || {};
    var force = !!opts.force;
    var now = Date.now();
    if (!force && global.__crozzoPrinterLoadPromise && now - (global.__CROZZO_PRINTERS_LOAD_STARTED || 0) < 4000) {
      return global.__crozzoPrinterLoadPromise;
    }
    if (!force && global.__CROZZO_PRINTERS_LOADED_AT && now - global.__CROZZO_PRINTERS_LOADED_AT < 15000) {
      return Promise.resolve(global.__CROZZO_SYSTEM_PRINTERS || []);
    }
    global.__CROZZO_PRINTERS_LOAD_STARTED = now;

    if (!crozzoIsTauri()) {
      crozzoRefreshPrinterList();
      if (force || !(global.__CROZZO_PRINTERS_LOADED_AT > 0)) {
        crozzoFinishPrinterLoad([], '', 'browser');
      }
      global.__crozzoPrinterLoadPromise = Promise.resolve(global.__CROZZO_SYSTEM_PRINTERS || []);
      return global.__crozzoPrinterLoadPromise;
    }

    global.__crozzoPrinterLoadPromise = crozzoTauriInvoke('crozzo_list_printers', {})
      .then(function (list) {
        return crozzoTauriInvoke('crozzo_get_default_printer', {})
          .then(function (def) {
            return crozzoFinishPrinterLoad(list, def, 'system');
          })
          .catch(function () {
            return crozzoFinishPrinterLoad(list, '', 'system');
          });
      })
      .catch(function (err) {
        console.warn('[crozzo-print] list_printers', err);
        if (force) {
          crozzoFinishPrinterLoad([], '', 'error');
        }
        return [];
      });
    return global.__crozzoPrinterLoadPromise;
  }

  function crozzoNormalizePrinterKey(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  function crozzoMatchSystemPrinter(requested) {
    var req = String(requested || '').trim();
    if (!req) return '';
    var list = global.__CROZZO_SYSTEM_PRINTERS || [];
    var i;
    var reqKey = crozzoNormalizePrinterKey(req);
    for (i = 0; i < list.length; i++) {
      if (String(list[i]).toLowerCase() === req.toLowerCase()) return list[i];
    }
    for (i = 0; i < list.length; i++) {
      if (crozzoNormalizePrinterKey(list[i]) === reqKey) return list[i];
    }
    for (i = 0; i < list.length; i++) {
      var pk = crozzoNormalizePrinterKey(list[i]);
      if (pk.indexOf(reqKey) >= 0 || reqKey.indexOf(pk) >= 0) return list[i];
    }
    return req;
  }

  function crozzoResolvePrinterName(requested, role) {
    var pre = crozzoResolvePrinterForJob(requested, role || 'caja');
    if (pre) return Promise.resolve(pre);
    if (!crozzoIsTauri()) return Promise.resolve('');
    return crozzoTauriInvoke('crozzo_get_default_printer', {})
      .then(function (def) {
        return crozzoResolvePrinterForJob(def ? String(def) : '', role || 'caja');
      })
      .catch(function () {
        return '';
      });
  }

  /* ---------- ESC/POS (CP850 — evita UTF-8 que corrompe ñ y dispara cortes) ---------- */
  var ESC_CP850 = {
    '\u00C1': 0xb5,
    '\u00C0': 0xb7,
    '\u00C2': 0xb6,
    '\u00C3': 0xc7,
    '\u00C4': 0x8e,
    '\u00C5': 0x8f,
    '\u00C7': 0x80,
    '\u00C9': 0x90,
    '\u00C8': 0xd4,
    '\u00CA': 0xd2,
    '\u00CB': 0xd3,
    '\u00CD': 0xd6,
    '\u00CE': 0xd7,
    '\u00CF': 0xd8,
    '\u00D1': 0xa5,
    '\u00D3': 0xe0,
    '\u00D2': 0x95,
    '\u00D4': 0x93,
    '\u00D6': 0x94,
    '\u00DA': 0xe9,
    '\u00DB': 0xea,
    '\u00DC': 0x9a,
    '\u00DD': 0xed,
    '\u00DF': 0xe1,
    '\u00E0': 0x85,
    '\u00E1': 0xa0,
    '\u00E2': 0x83,
    '\u00E3': 0x87,
    '\u00E4': 0x84,
    '\u00E5': 0x86,
    '\u00E7': 0x87,
    '\u00E8': 0x8a,
    '\u00E9': 0x82,
    '\u00EA': 0x88,
    '\u00EB': 0x89,
    '\u00ED': 0xa1,
    '\u00EE': 0x8b,
    '\u00EF': 0x8c,
    '\u00F1': 0xa4,
    '\u00F2': 0x95,
    '\u00F3': 0xa2,
    '\u00F4': 0x93,
    '\u00F6': 0x94,
    '\u00F9': 0x97,
    '\u00FA': 0xa3,
    '\u00FB': 0x96,
    '\u00FC': 0x81,
    '\u00FD': 0x98,
    '\u00FF': 0x98,
    '\u00BF': 0xa8,
    '\u00A1': 0xad,
    '\u00B0': 0xf8,
    '\u00AA': 0xa6,
    '\u00BA': 0xa7,
    '\u20AC': 0xee,
  };

  function escCharToCp850(ch) {
    if (ESC_CP850[ch] != null) return ESC_CP850[ch];
    var code = ch.charCodeAt(0);
    if (code < 0x80) return code;
    if (typeof ch.normalize === 'function') {
      var plain = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (plain.length >= 1) {
        var c0 = plain.charCodeAt(0);
        if (c0 < 0x80) return c0;
      }
    }
    return 0x3f;
  }

  function escLatinToCp850(text) {
    var s = escSanitizeForThermal(text);
    var out = [];
    for (var i = 0; i < s.length; i++) out.push(escCharToCp850(s.charAt(i)));
    return out;
  }

  /** Texto seguro CP850: espacios ASCII, sin símbolos Unicode que salen como "?". */
  function escSanitizeForThermal(text) {
    var s = String(text == null ? '' : text);
    s = s.replace(/[\u00A0\u1680\u180E\u2000-\u200D\u2028\u2029\u202F\u205F\u3000\uFEFF]/g, ' ');
    s = s
      .replace(/\u2014|\u2013/g, '-')
      .replace(/[\u2018\u2019\u2032]/g, "'")
      .replace(/[\u201C\u201D\u2033]/g, '"')
      .replace(/\u2026/g, '...')
      .replace(/\u00b7|\u2022|\u2219|\u25CF|\u25AA/g, '.')
      .replace(/[\u2500-\u257f\u2580-\u259f]/g, '-')
      .replace(/[\u2600-\u27bf]/g, '*')
      .replace(/◆/g, '*')
      .replace(/═/g, '=')
      .replace(/─/g, '-')
      .replace(/～/g, '~')
      .replace(/·/g, '.')
      .replace(/×/g, 'x')
      .replace(/✂/g, '[CORTE]')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    return s;
  }

  function escPushText(chunks, text) {
    var bytes = escLatinToCp850(text);
    for (var i = 0; i < bytes.length; i++) chunks.push(bytes[i]);
    chunks.push(0x0a);
  }

  function escInit(chunks) {
    chunks.push(0x1b, 0x40);
    chunks.push(0x1b, 0x74, 2);
  }

  function escAlign(chunks, align) {
    var m = align === 'left' ? 0 : align === 'right' ? 2 : 1;
    chunks.push(0x1b, 0x61, m);
  }

  function escBold(chunks, on) {
    chunks.push(0x1b, 0x45, on ? 1 : 0);
  }

  function escFont(chunks, fsKey) {
    var map = { xs: 0, sm: 0, md: 1, lg: 17, xl: 34 };
    var n = map[fsKey] != null ? map[fsKey] : 0;
    chunks.push(0x1d, 0x21, n);
  }

  function escDivider(chunks, tpl) {
    var line = '--------------------------------';
    if (global.CrozzoTermicaPremium && typeof global.CrozzoTermicaPremium.ornamentText === 'function') {
      line = global.CrozzoTermicaPremium.ornamentText('diamond', tpl || { sz: '80' });
    }
    escAlign(chunks, 'center');
    escPushText(chunks, line);
  }

  function escFeed(chunks, lines) {
    var n = Math.max(0, Math.min(8, Number(lines) || 0));
    if (n < 1) return;
    chunks.push(0x1b, 0x64, n);
  }

  /** Avanza n líneas y corta (Epson GS V 65/66 — evita cortar la última línea impresa). */
  function escCutFeedThen(chunks, feedLines, fullCut) {
    var n = Math.max(1, Math.min(8, Number(feedLines) || 4));
    chunks.push(0x1d, 0x56, fullCut ? 0x41 : 0x42, n);
  }

  /** Montos solo ASCII (Intl usa espacios raros que la térmica muestra como "?"). */
  function escFmtMoneyPlain(n) {
    var v = Math.round(Number(n) || 0);
    var neg = v < 0;
    v = Math.abs(v);
    var digits = String(v);
    var grouped = '';
    for (var i = digits.length - 1, g = 0; i >= 0; i--, g++) {
      if (g > 0 && g % 3 === 0) grouped = '.' + grouped;
      grouped = digits.charAt(i) + grouped;
    }
    return (neg ? '-' : '') + '$' + grouped;
  }

  function escFmtDatePlain(d) {
    try {
      var dt = d instanceof Date ? d : new Date(d);
      if (isNaN(dt.getTime())) return String(d == null ? '' : d);
      var p = function (x) {
        return x < 10 ? '0' + x : String(x);
      };
      return p(dt.getDate()) + '/' + p(dt.getMonth() + 1) + '/' + dt.getFullYear() + ' ' + p(dt.getHours()) + ':' + p(dt.getMinutes());
    } catch (_) {
      return String(d == null ? '' : d);
    }
  }

  function escApplyCut(chunks, mode, feedLines) {
    var m = String(mode || 'partial').toLowerCase();
    var feed = Math.max(1, Math.min(8, Number(feedLines) || 4));
    if (m === 'none' || m === 'off' || m === 'sin') {
      escFeed(chunks, feed);
      return;
    }
    if (m === 'full' || m === 'total') escCutFeedThen(chunks, feed, true);
    else escCutFeedThen(chunks, feed, false);
  }

  function escFinishTicket(chunks, opts) {
    if (!opts) return;
    escApplyCut(chunks, opts.cutMode || opts.cut || 'partial', opts.feedBeforeCut != null ? opts.feedBeforeCut : 2);
  }

  function crozzoResolveTicketEndCut(tpl, buildOpts, hadCutBlock) {
    tpl = tpl || {};
    buildOpts = buildOpts || {};
    var end = String(tpl.cutEnd || buildOpts.cutEnd || 'auto').toLowerCase();
    if (end === 'auto') {
      if (hadCutBlock) return null;
      end = 'partial';
    }
    if (end === 'none' || end === 'off' || end === 'sin') return null;
    var feed =
      tpl.cutEndFeed != null
        ? Number(tpl.cutEndFeed)
        : buildOpts.feedBeforeCut != null
          ? Number(buildOpts.feedBeforeCut)
          : 2;
    return {
      cutMode: end === 'full' || end === 'total' ? 'full' : 'partial',
      feedBeforeCut: Math.max(0, Math.min(8, feed)),
    };
  }

  function crozzoPrintKindToRole(kind) {
    var k = String(kind || '');
    if (k.indexOf('comanda') === 0) return 'comanda';
    if (k.indexOf('bodega') === 0) return 'bodega';
    return 'caja';
  }

  function crozzoGetComandasAreas() {
    try {
      if (typeof global.getComandasConfig === 'function') {
        var cfg = global.getComandasConfig();
        return Array.isArray(cfg.areas) ? cfg.areas : [];
      }
    } catch (_) {}
    return [];
  }

  function crozzoResolveComandaPrinter(comanda) {
    if (!comanda) return getComandaPrinter();
    var p = String(comanda.impresora || '').trim();
    if (p) return crozzoResolvePrinterForJob(p, 'comanda');
    var areas = crozzoGetComandasAreas();
    if (Array.isArray(areas) && comanda.areaId) {
      for (var i = 0; i < areas.length; i++) {
        if (areas[i].id === comanda.areaId && areas[i].impresora) {
          return crozzoResolvePrinterForJob(String(areas[i].impresora).trim(), 'comanda');
        }
      }
    }
    return getComandaPrinter();
  }

  function escQr(chunks, data) {
    if (!data) return;
    var s = String(data);
    var enc = new TextEncoder();
    var payload = enc.encode(s);
    var storeLen = payload.length + 3;
    var pL = storeLen & 0xff;
    var pH = (storeLen >> 8) & 0xff;
    chunks.push(0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30);
    for (var i = 0; i < payload.length; i++) chunks.push(payload[i]);
    chunks.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
    escFeed(chunks, 1);
  }

  function escChunksToUint8(chunks) {
    return new Uint8Array(chunks);
  }

  function crozzoAbsUrl(path) {
    if (typeof global.crozzoResolveAssetUrl === 'function') return global.crozzoResolveAssetUrl(path);
    var p = String(path || '').trim();
    if (!p || /^(data:|https?:|blob:|file:)/i.test(p)) return p;
    try {
      if (global.location && global.location.href) return new URL(p, global.location.href).href;
    } catch (_) {}
    return p;
  }

  function crozzoWarmTicketLogoEscCache(logoUrl, paperSz, mode) {
    mode = mode || 'full';
    return new Promise(function (resolve) {
      var url = crozzoAbsUrl(logoUrl);
      if (!url || typeof document === 'undefined') return resolve(null);
      var key = url + '|' + (paperSz === '58' ? '58' : '80') + '|logo2x-crop|' + mode;
      var cacheMap = global.__CROZZO_TICKET_LOGO_ESC_MAP || (global.__CROZZO_TICKET_LOGO_ESC_MAP = {});
      var hit = cacheMap[key];
      if (hit && hit.raster && hit.raster.length) return resolve(hit);

      var img = new Image();
      img.onload = function () {
        try {
          var maxW;
          var maxH;
          if (mode === 'inline') {
            maxW = paperSz === '58' ? 160 : 200;
            maxH = paperSz === '58' ? 96 : 120;
          } else {
            maxW = paperSz === '58' ? 384 : 576;
            maxH = paperSz === '58' ? 384 : 504;
          }
          var nw = img.naturalWidth || img.width || 1;
          var nh = img.naturalHeight || img.height || 1;
          if (!nw || !nh) return resolve(null);
          var scale = Math.min(maxW / nw, maxH / nh, 2);
          var w = Math.max(8, Math.ceil(((nw * scale) | 0) / 8) * 8);
          var h = Math.max(8, Math.round(nh * scale));
          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.imageSmoothingEnabled = true;
          if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);
          var px = ctx.getImageData(0, 0, w, h).data;
          var pi;
          for (pi = 0; pi < px.length; pi += 4) {
            var lum0 = 0.299 * px[pi] + 0.587 * px[pi + 1] + 0.114 * px[pi + 2];
            lum0 = lum0 < 128 ? lum0 * 0.82 : Math.min(255, lum0 * 1.08 + 12);
            px[pi] = px[pi + 1] = px[pi + 2] = lum0;
          }
          ctx.putImageData(new ImageData(px, w, h), 0, 0);
          px = ctx.getImageData(0, 0, w, h).data;
          var bytesPerLine = w / 8;
          var raster = [];
          var y;
          var bx;
          var bit;
          for (y = 0; y < h; y++) {
            for (bx = 0; bx < bytesPerLine; bx++) {
              var byte = 0;
              for (bit = 0; bit < 8; bit++) {
                var x = bx * 8 + bit;
                var i = (y * w + x) * 4;
                var lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
                var alpha = px[i + 3];
                if (alpha > 96 && lum < 158) byte |= 0x80 >> bit;
              }
              raster.push(byte);
            }
          }
          var pack = escCropLogoRaster({
            key: key,
            url: url,
            xL: bytesPerLine & 0xff,
            xH: (bytesPerLine >> 8) & 0xff,
            yL: h & 0xff,
            yH: (h >> 8) & 0xff,
            raster: raster,
          });
          cacheMap[key] = pack;
          if (mode === 'full') global.__CROZZO_TICKET_LOGO_ESC = pack;
          resolve(pack);
        } catch (err) {
          console.warn('[crozzo-print] logo raster', err);
          resolve(null);
        }
      };
      img.onerror = function () {
        resolve(null);
      };
      img.src = url;
    });
  }

  /** Quita bandas blancas arriba/abajo del bitmap (evita efecto “doble logo”). */
  function escCropLogoRaster(pack) {
    if (!pack || !pack.raster || !pack.raster.length) return pack;
    var bytesPerLine = (pack.xL & 0xff) + ((pack.xH & 0xff) << 8);
    var h = (pack.yL & 0xff) + ((pack.yH & 0xff) << 8);
    if (!bytesPerLine || !h) return pack;
    var first = -1;
    var last = -1;
    var y;
    var bx;
    for (y = 0; y < h; y++) {
      var row = y * bytesPerLine;
      var dark = false;
      for (bx = 0; bx < bytesPerLine; bx++) {
        if (pack.raster[row + bx] !== 0) {
          dark = true;
          break;
        }
      }
      if (dark) {
        if (first < 0) first = y;
        last = y;
      }
    }
    if (first < 0) return pack;
    var pad = 4;
    var top = Math.max(0, first - pad);
    var bot = Math.min(h - 1, last + pad);
    var newH = bot - top + 1;
    if (newH >= h) return pack;
    var trimmed = [];
    for (y = top; y <= bot; y++) {
      for (bx = 0; bx < bytesPerLine; bx++) {
        trimmed.push(pack.raster[y * bytesPerLine + bx]);
      }
    }
    return {
      key: pack.key,
      url: pack.url,
      xL: pack.xL,
      xH: pack.xH,
      yL: newH & 0xff,
      yH: (newH >> 8) & 0xff,
      raster: trimmed,
    };
  }

  function escPushLogoRaster(chunks, logoEsc, topFeed, afterFeed, align) {
    if (!logoEsc || !logoEsc.raster || !logoEsc.raster.length) return false;
    escAlign(chunks, align || 'center');
    var top = topFeed != null && Number(topFeed) > 0 ? Math.max(0, Math.min(6, Number(topFeed))) : 1;
    if (top > 0) escFeed(chunks, top);
    chunks.push(0x1d, 0x76, 0x30, 0x00, logoEsc.xL, logoEsc.xH, logoEsc.yL, logoEsc.yH);
    var i;
    for (i = 0; i < logoEsc.raster.length; i++) chunks.push(logoEsc.raster[i]);
    var after = afterFeed != null && Number(afterFeed) > 0 ? Math.max(1, Math.min(3, Number(afterFeed))) : 1;
    escFeed(chunks, after);
    return true;
  }

  function escTightAfterLogo(nextBlock) {
    if (!nextBlock) return false;
    var t = nextBlock.t;
    return (
      t === 'company' ||
      t === 'razon' ||
      t === 'rotulo_nombre' ||
      t === 'salon_etiqueta' ||
      t === 'title'
    );
  }

  function tplUsesInlineLogo(tpl) {
    var dt = tpl && tpl.docType;
    return dt === 'salon' || dt === 'bodega' || dt === 'bodega_entrada';
  }

  function escSalonEtiquetaCompact(chunks, data, tpl, b) {
    var sit =
      data.salonItem ||
      (data.lines && data.lines[0]
        ? {
            nombre: data.lines[0].n,
            precio: data.lines[0].p,
            precioGramo: data.lines[0].pGramo,
            gramaje: data.lines[0].gramaje,
            enDescuento: data.lines[0].enDescuento,
            precioAnterior: data.lines[0].precioAnt,
          }
        : {});
    escAlign(chunks, 'left');
    escFont(chunks, 'md');
    escBold(chunks, true);
    escPushText(chunks, sit.nombre || sit.n || 'Producto');
    escBold(chunks, false);
    escFont(chunks, 'lg');
    escBold(chunks, true);
    escPushText(chunks, escFmtMoneyPlain(sit.precio != null ? sit.precio : sit.p));
    escBold(chunks, false);
    var muestraGramo =
      typeof global.crozzoSalonMuestraPrecioGramo === 'function'
        ? global.crozzoSalonMuestraPrecioGramo(sit)
        : sit.gramaje > 0 && sit.precioGramo != null && sit.precioGramo > 0;
    if (muestraGramo) {
      escFont(chunks, 'xs');
      escPushText(chunks, escFmtMoneyPlain(sit.precioGramo) + '/g');
    }
    if (sit.enDescuento) {
      escBold(chunks, true);
      escPushText(chunks, 'OFERTA');
      escBold(chunks, false);
    }
    escFont(chunks, b && b.fs ? b.fs : 'sm');
  }

  function escFechasBlankCompact(chunks, width) {
    var wF = width >= 42 ? 22 : 14;
    var lineF = Array(wF).join('_');
    escAlign(chunks, 'left');
    escFont(chunks, 'xs');
    escPushText(chunks, 'FE ' + lineF);
    escPushText(chunks, 'FI ' + lineF);
    escPushText(chunks, 'FV ' + lineF);
  }

  global.crozzoEscSanitizeForThermal = escSanitizeForThermal;
  global.crozzoEscFmtMoneyPlain = escFmtMoneyPlain;
  global.crozzoEscFmtDatePlain = escFmtDatePlain;

  function crozzoBuildEscPosBytesAsync(tpl, payload, buildOpts) {
    buildOpts = buildOpts || {};
    var sz = tpl && tpl.sz === '58' ? '58' : '80';
    var logoUrl = payload && payload.logoUrl;
    return crozzoWarmTicketLogoEscCache(logoUrl, sz, 'full')
      .then(function (logoEsc) {
        buildOpts.logoEsc = logoEsc;
        if (!tplUsesInlineLogo(tpl) || !logoUrl) return null;
        return crozzoWarmTicketLogoEscCache(logoUrl, sz, 'inline');
      })
      .then(function (logoEscInline) {
        if (logoEscInline) buildOpts.logoEscInline = logoEscInline;
        return crozzoBuildEscPosFromPayload(tpl, payload, buildOpts);
      });
  }

  function crozzoBuildEscPosFromPayload(tpl, data, buildOpts) {
    buildOpts = buildOpts || {};
    var chunks = [];
    escInit(chunks);
    var blocks = tpl && tpl.blocks ? tpl.blocks.slice().sort(function (a, b) { return (a.o || 0) - (b.o || 0); }) : [];
    var width = tpl && tpl.sz === '58' ? 32 : 42;

    function lineLR(left, right) {
      left = escSanitizeForThermal(left || '');
      right = escSanitizeForThermal(right || '');
      var space = width - left.length - right.length;
      if (space < 1) return left + ' ' + right;
      return left + Array(space + 1).join(' ') + right;
    }

    var hadCutBlock = false;
    var visibleBlocks = blocks.filter(function (bx) {
      return bx && bx.v !== false;
    });
    var lastPrintedType = null;
    var skipUntil = -1;

    visibleBlocks.forEach(function (b, vi) {
      if (vi <= skipUntil) return;
      if (b.t === 'logo' && tplUsesInlineLogo(tpl) && !data.logoUrl) return;
      if (b.t === 'cut') {
        hadCutBlock = true;
        escApplyCut(chunks, b.c || 'partial', b.sp != null ? b.sp : 5);
        return;
      }
      var nextBlock = visibleBlocks[vi + 1];
      var thirdBlock = visibleBlocks[vi + 2];
      escAlign(chunks, b.a || 'center');
      escFont(chunks, b.fs || 'sm');
      escBold(chunks, !!b.fw);
      if (Number(b.sp) > 0 && b.t !== 'logo') escFeed(chunks, Math.min(3, Number(b.sp)));

      switch (b.t) {
        case 'logo': {
          var inlineLabel =
            tplUsesInlineLogo(tpl) && data.logoUrl && nextBlock && escTightAfterLogo(nextBlock);
          if (inlineLabel) {
            var logoPack = buildOpts.logoEscInline || buildOpts.logoEsc;
            if (!escPushLogoRaster(chunks, logoPack, 0, 1, 'left')) {
              escAlign(chunks, 'left');
              escFont(chunks, 'xs');
              escBold(chunks, true);
              var nomCorto = escSanitizeForThermal(String(data.nameE || b.c || '').slice(0, 10));
              if (nomCorto) escPushText(chunks, nomCorto);
              escBold(chunks, false);
            }
            if (nextBlock.t === 'salon_etiqueta') {
              escSalonEtiquetaCompact(chunks, data, tpl, nextBlock);
              skipUntil = vi + 1;
            } else if (nextBlock.t === 'rotulo_nombre') {
              escAlign(chunks, 'left');
              escFont(chunks, nextBlock.fs || 'lg');
              escBold(chunks, true);
              escPushText(chunks, data.rotuloNombre || nextBlock.c || '');
              escBold(chunks, false);
              if (thirdBlock && thirdBlock.t === 'fechas_blank') {
                escFechasBlankCompact(chunks, width);
                skipUntil = vi + 2;
              } else {
                skipUntil = vi + 1;
              }
            }
            lastPrintedType = skipUntil >= vi + 2 ? 'fechas_blank' : nextBlock.t;
            break;
          }
          var tightName = escTightAfterLogo(nextBlock);
          var logoTop = Number(b.sp) > 0 ? Math.min(4, Math.round(Number(b.sp))) : 1;
          var logoAfter = tightName ? 1 : 2;
          if (!escPushLogoRaster(chunks, buildOpts.logoEsc, logoTop, logoAfter)) {
            if (logoTop > 0) escFeed(chunks, logoTop);
            escBold(chunks, true);
            escPushText(chunks, data.nameE || b.c || 'CROZZO POS');
            escBold(chunks, false);
          }
          break;
        }
        case 'company':
          if (lastPrintedType === 'logo' && buildOpts.logoEsc && buildOpts.logoEsc.raster && buildOpts.logoEsc.raster.length) {
            escAlign(chunks, b.a || 'center');
            escFont(chunks, b.fs || 'sm');
            escBold(chunks, false);
            if (data.nameE) escPushText(chunks, data.nameE);
            break;
          }
          escPushText(chunks, data.nameE || '');
          break;
        case 'ornament':
          if (
            lastPrintedType === 'logo' &&
            nextBlock &&
            (nextBlock.t === 'company' ||
              nextBlock.t === 'razon' ||
              nextBlock.t === 'rotulo_nombre' ||
              nextBlock.t === 'salon_etiqueta')
          ) {
            break;
          }
          escAlign(chunks, 'center');
          escPushText(
            chunks,
            global.CrozzoTermicaPremium && global.CrozzoTermicaPremium.ornamentText
              ? global.CrozzoTermicaPremium.ornamentText(b.c || 'diamond', tpl)
              : '--- * ---'
          );
          break;
        case 'razon': {
          var colR = global.CrozzoTermicaColombia;
          if (colR && colR.namesEqual && colR.namesEqual(data.nameE, data.razonE)) break;
          if (data.razonE) escPushText(chunks, data.razonE);
          break;
        }
        case 'nit':
          escPushText(chunks, 'NIT ' + (data.nitE || ''));
          break;
        case 'tel':
          if (data.telE) escPushText(chunks, 'Tel. ' + data.telE);
          break;
        case 'ciudad':
          if (data.ciudadE) escPushText(chunks, data.ciudadE);
          break;
        case 'regimen':
          if (data.regimenE) escPushText(chunks, data.regimenE);
          break;
        case 'address':
          if (data.dirE) escPushText(chunks, data.dirE);
          break;
        case 'num_fe':
          escBold(chunks, true);
          escPushText(chunks, 'No. ' + (data.numFe || data.consecutivo || ''));
          escBold(chunks, false);
          break;
        case 'resol_full':
          if (data.resolFull) escPushText(chunks, data.resolFull);
          break;
        case 'iva_disc':
          if (data.ivaDisc) escPushText(chunks, data.ivaDisc);
          break;
        case 'legal_co':
          if (data.legalCo) escPushText(chunks, data.legalCo);
          break;
        case 'divider':
          escDivider(chunks, tpl);
          break;
        case 'line':
          escPushText(chunks, Array(width + 1).join('-'));
          break;
        case 'title':
          escBold(chunks, true);
          escPushText(chunks, b.c || data.head || 'COMPROBANTE');
          escBold(chunks, false);
          break;
        case 'consec':
          escPushText(chunks, 'No. ' + (data.consecutivo || ''));
          break;
        case 'date':
          escPushText(chunks, data.fecha || '');
          break;
        case 'client':
          escAlign(chunks, 'left');
          escPushText(chunks, data.cliTipo === 'NIT' ? 'Cliente' : data.cliTipo || 'Adquirente');
          escPushText(chunks, data.cliNom || '');
          escPushText(chunks, (data.cliTipo === 'NIT' ? 'NIT ' : 'Doc. ') + (data.cliNit || ''));
          break;
        case 'items':
          escAlign(chunks, 'left');
          escDivider(chunks, tpl);
          if (tpl.docType === 'inventario') {
            (data.lines || []).forEach(function (it) {
              var nom = String(it.n || 'Item')
                .replace(/\s*\((g|ml|und|kg)\)\s*$/i, '')
                .trim();
              var und = String(it.und || '').trim();
              if (!und) {
                var um = String(it.n || '').match(/\((g|ml|und|kg)\)\s*$/i);
                und = um ? um[1] : 'und';
              }
              escBold(chunks, true);
              escPushText(chunks, nom);
              escBold(chunks, false);
              escPushText(chunks, 'Unidad: ' + und);
              escPushText(chunks, 'Cantidad: ________________');
              escFeed(chunks, 1);
            });
          } else {
            (data.lines || []).forEach(function (it) {
              var qty = Number(it.q) || 0;
              var nom = String(it.n || 'Item');
              var pu = Number(it.p) || 0;
              var tot = escFmtMoneyPlain(pu * qty);
              escPushText(chunks, lineLR(qty + 'x ' + nom, tot));
              if (pu > 0) {
                escPushText(chunks, '  Vr.unit ' + escFmtMoneyPlain(pu));
              }
            });
          }
          escDivider(chunks, tpl);
          break;
        case 'total':
          escAlign(chunks, 'left');
          escPushText(chunks, lineLR('Subtotal', escFmtMoneyPlain(data.sub)));
          escPushText(chunks, lineLR('IVA', escFmtMoneyPlain(data.iva)));
          escBold(chunks, true);
          escPushText(chunks, lineLR(b.c || 'TOTAL', escFmtMoneyPlain(data.tot)));
          escBold(chunks, false);
          break;
        case 'payment':
          if (data.pago) escPushText(chunks, 'Pago: ' + data.pago);
          if (data.propina > 0) escPushText(chunks, 'Propina: ' + escFmtMoneyPlain(data.propina));
          if (data.recibido > 0) escPushText(chunks, 'Recibido: ' + escFmtMoneyPlain(data.recibido));
          if (data.cambio > 0) escPushText(chunks, 'Cambio: ' + escFmtMoneyPlain(data.cambio));
          break;
        case 'resol':
          escPushText(chunks, 'Resol. ' + (data.resol || ''));
          break;
        case 'cufe':
          if (data.cufe) {
            escAlign(chunks, 'left');
            escPushText(chunks, 'CUFE');
            escPushText(chunks, data.cufe);
          }
          break;
        case 'qr':
          if (data.qrUrl) {
            escAlign(chunks, 'center');
            escQr(chunks, data.qrUrl);
          }
          break;
        case 'footer':
          escPushText(chunks, b.c || 'Gracias por su compra');
          escFeed(chunks, 2);
          break;
        case 'marcacion':
          escBold(chunks, true);
          escPushText(chunks, 'SEQ ' + (data.marcacionId || data.consecutivo || ''));
          escBold(chunks, false);
          break;
        case 'bodega_ref':
          escAlign(chunks, 'left');
          escPushText(chunks, 'BODEGA: ' + (data.bodegaRef || b.c || ''));
          break;
        case 'obs':
          escAlign(chunks, 'left');
          escBold(chunks, true);
          escPushText(chunks, data.obs || b.c || '');
          escBold(chunks, false);
          break;
        case 'mp_lines':
          escAlign(chunks, 'left');
          escPushText(chunks, b.c || 'Materia prima:');
          (data.mpLines || []).forEach(function (ln) {
            escBold(chunks, true);
            escPushText(chunks, (ln.n || 'MP') + (ln.q ? ' - ' + ln.q : ''));
            escBold(chunks, false);
            if (ln.blank) {
              var wBl = width >= 42 ? 26 : 18;
              var lnBl = Array(wBl).join('_');
              escPushText(chunks, '  FE ' + lnBl);
              escPushText(chunks, '  FI ' + lnBl);
              escPushText(chunks, '  FV ' + lnBl);
            } else if (ln.fe || ln.fi || ln.fv) {
              escPushText(
                chunks,
                '  FE ' + (ln.fe || '-') + '  FI ' + (ln.fi || '-') + '  FV ' + (ln.fv || '-')
              );
            } else if (ln.q) {
              escPushText(chunks, '  ' + ln.q);
            }
          });
          break;
        case 'rotulo_nombre':
          if (vi <= skipUntil) break;
          if (!tplUsesInlineLogo(tpl) && global.CrozzoTermicaPremium && global.CrozzoTermicaPremium.ornamentText) {
            escAlign(chunks, 'center');
            escPushText(chunks, global.CrozzoTermicaPremium.ornamentText('flourish', tpl));
          }
          escAlign(chunks, tplUsesInlineLogo(tpl) ? 'left' : 'center');
          escFont(chunks, 'lg');
          escBold(chunks, true);
          escPushText(chunks, data.rotuloNombre || b.c || '');
          escBold(chunks, false);
          escFont(chunks, b.fs || 'sm');
          break;
        case 'fechas_blank': {
          if (vi <= skipUntil) break;
          if (tplUsesInlineLogo(tpl)) {
            escFechasBlankCompact(chunks, width);
            break;
          }
          var wF = width >= 42 ? 26 : 18;
          var lineF = Array(wF).join('_');
          escAlign(chunks, 'left');
          if (global.CrozzoTermicaPremium && global.CrozzoTermicaPremium.ornamentText) {
            escAlign(chunks, 'center');
            escPushText(chunks, global.CrozzoTermicaPremium.ornamentText('diamond', tpl));
            escAlign(chunks, 'left');
          }
          escFeed(chunks, 1);
          escPushText(chunks, 'FE ' + lineF);
          escPushText(chunks, 'FI ' + lineF);
          escPushText(chunks, 'FV ' + lineF);
          break;
        }
        case 'salon_etiqueta': {
          if (vi <= skipUntil) break;
          if (tplUsesInlineLogo(tpl)) {
            escSalonEtiquetaCompact(chunks, data, tpl, b);
            break;
          }
          if (global.CrozzoTermicaPremium && global.CrozzoTermicaPremium.ornamentText) {
            escAlign(chunks, 'center');
            escPushText(chunks, global.CrozzoTermicaPremium.ornamentText('flourish', tpl));
          }
          var sit =
            data.salonItem ||
            (data.lines && data.lines[0]
              ? {
                  nombre: data.lines[0].n,
                  precio: data.lines[0].p,
                  precioGramo: data.lines[0].pGramo,
                  gramaje: data.lines[0].gramaje,
                  enDescuento: data.lines[0].enDescuento,
                  precioAnterior: data.lines[0].precioAnt,
                }
              : {});
          escAlign(chunks, 'center');
          escFont(chunks, 'lg');
          escBold(chunks, true);
          escPushText(chunks, sit.nombre || sit.n || 'Producto');
          escBold(chunks, false);
          escFont(chunks, 'md');
          escBold(chunks, true);
          escPushText(chunks, escFmtMoneyPlain(sit.precio != null ? sit.precio : sit.p));
          escBold(chunks, false);
          var muestraGramo =
            typeof global.crozzoSalonMuestraPrecioGramo === 'function'
              ? global.crozzoSalonMuestraPrecioGramo(sit)
              : sit.gramaje > 0 && sit.precioGramo != null && sit.precioGramo > 0;
          if (muestraGramo) {
            escFont(chunks, 'xs');
            escPushText(chunks, escFmtMoneyPlain(sit.precioGramo) + '/g');
          }
          if (sit.enDescuento) {
            escBold(chunks, true);
            escPushText(chunks, '** OFERTA **');
            escBold(chunks, false);
            if (sit.precioAnterior != null && sit.precioAnterior > (sit.precio || sit.p)) {
              escPushText(chunks, 'Antes ' + escFmtMoneyPlain(sit.precioAnterior));
            }
          }
          break;
        }
        case 'space':
          escFeed(chunks, Math.max(1, Number(b.c) || 1));
          break;
        default:
          if (b.c) escPushText(chunks, b.c);
      }
      lastPrintedType = b.t;
    });

    var endCut = crozzoResolveTicketEndCut(tpl, buildOpts, hadCutBlock);
    if (endCut) escFinishTicket(chunks, endCut);
    return escChunksToUint8(chunks);
  }

  function crozzoBuildEscPosFromFactura(factura) {
    if (!factura) return Promise.resolve(new Uint8Array(0));
    var conf = getAdminConfig();
    var docType = 'factura';
    var tpl = null;
    if (global.CrozzoPrintStudioHub) {
      docType = global.CrozzoPrintStudioHub.docTypeFromFactura(factura);
      tpl = global.CrozzoPrintStudioHub.getPlantilla(docType, conf);
    } else if (typeof global.crozzoTermicaNormalizePlantilla === 'function') {
      var legacyRaw =
        conf.termicaPlantillas && conf.termicaPlantillas.factura
          ? conf.termicaPlantillas.factura
          : conf.termicaPlantilla;
      tpl = global.crozzoTermicaNormalizePlantilla(legacyRaw);
    }
    var payload =
      typeof global.crozzoTermicaPayloadFromFactura === 'function'
        ? global.crozzoTermicaPayloadFromFactura(factura)
        : null;
    if (!tpl && global.CrozzoPrintPresets && typeof global.CrozzoPrintPresets.getTemplate === 'function') {
      tpl = global.CrozzoPrintPresets.getTemplate(docType, global.CrozzoPrintPresets.DEFAULT_PRESET || 'clasico');
    }
    if (!payload && factura) {
      var items = Array.isArray(factura.items) ? factura.items : [];
      payload = {
        head: factura.estado === 'precuenta' ? 'PRECUENTA' : 'FACTURA',
        nameE: 'Crozzo POS',
        nitE: '',
        consecutivo: String(factura.consecutivo || factura.id || ''),
        fecha: String(factura.fecha || escFmtDatePlain(new Date())),
        cliNom: String(factura.compradorNombre || factura.clienteNombre || 'Cliente'),
        cliNit: String(factura.compradorNit || factura.clienteNit || ''),
        lines: items.map(function (it) {
          return {
            n: it.nombreVenta || it.nombre || 'Item',
            q: Number(it.cantidad) || 0,
            p: Number(it.precio) || 0,
          };
        }),
        sub: Number(factura.subtotal) || 0,
        iva: Number(factura.iva) || 0,
        tot: Number(factura.total) || 0,
        pago: String(factura.metodoPago || ''),
        cufe: String(factura.cufe || ''),
        qrUrl: String(factura.qrUrl || ''),
      };
    }
    if (tpl && payload) {
      if (!payload.logoUrl && typeof global.crozzoResolveTicketLogoUrl === 'function') {
        payload.logoUrl = global.crozzoResolveTicketLogoUrl();
      }
      return crozzoBuildEscPosBytesAsync(tpl, payload, {});
    }

    var chunks = [];
    escInit(chunks);
    if (payload) {
      escAlign(chunks, 'center');
      escBold(chunks, true);
      escPushText(chunks, payload.nameE);
      escBold(chunks, false);
      escPushText(chunks, 'NIT ' + payload.nitE);
      if (payload.dirE) escPushText(chunks, payload.dirE);
      escDivider(chunks, tpl);
      escBold(chunks, true);
      escPushText(chunks, payload.head);
      escBold(chunks, false);
      escPushText(chunks, 'No. ' + payload.consecutivo);
      escPushText(chunks, payload.fecha);
      escAlign(chunks, 'left');
      escPushText(chunks, 'Cliente: ' + payload.cliNom);
      escPushText(chunks, 'Doc. ' + payload.cliNit);
      escDivider(chunks, tpl);
      (payload.lines || []).forEach(function (it) {
        escPushText(
          chunks,
          (it.q || 0) + 'x ' + (it.n || '') + '  ' + escFmtMoneyPlain(Number(it.p) * Number(it.q))
        );
      });
      escDivider(chunks, tpl);
      escPushText(chunks, 'Subt: ' + escFmtMoneyPlain(payload.sub));
      escPushText(chunks, 'IVA:  ' + escFmtMoneyPlain(payload.iva));
      escBold(chunks, true);
      escPushText(chunks, 'TOTAL: ' + escFmtMoneyPlain(payload.tot));
      escBold(chunks, false);
      if (payload.pago) escPushText(chunks, 'Pago: ' + payload.pago);
      if (payload.cufe) {
        escPushText(chunks, 'CUFE:');
        escPushText(chunks, payload.cufe);
      }
      if (payload.qrUrl) escQr(chunks, payload.qrUrl);
      escPushText(chunks, 'Gracias por su compra');
    }
    escFeed(chunks, 2);
    escApplyCut(chunks, 'partial', 5);
    return Promise.resolve(escChunksToUint8(chunks));
  }

  function crozzoBuildEscPosFromComanda(comanda) {
    var conf = getAdminConfig();
    if (global.CrozzoPrintStudioHub) {
      var tpl = global.CrozzoPrintStudioHub.getPlantilla('ticket', conf);
      var emp = global.config && global.config.getEmpresa ? global.config.getEmpresa() || {} : {};
      var payload = {
        head: comanda.areaNombre || 'COMANDA',
        nameE: emp.nombreComercial || emp.razonSocial || 'Crozzo POS',
        consecutivo: String(comanda.id || ''),
        fecha: new Date(comanda.lastUpdateAt || comanda.createdAt || Date.now()).toLocaleString('es-CO'),
        cliNom:
          comanda.tipoServicio === 'mesa'
            ? 'Mesa ' + (comanda.referencia || '')
            : String(comanda.referencia || ''),
        cliNit: '',
        lines: (comanda.items || []).map(function (it) {
          return {
            n: (it.nombreVenta || it.nombre || 'Item') + (it.detalleConfig ? ' (' + it.detalleConfig + ')' : ''),
            q: Number(it.cantidad) || 0,
            p: 0,
          };
        }),
        sub: 0,
        iva: 0,
        tot: 0,
        logoUrl: typeof global.crozzoResolveTicketLogoUrl === 'function' ? global.crozzoResolveTicketLogoUrl() : '',
      };
      return crozzoBuildEscPosBytesAsync(tpl, payload, {});
    }
    var chunks = [];
    escInit(chunks);
    escAlign(chunks, 'center');
    escBold(chunks, true);
    var emp = global.config && global.config.getEmpresa ? global.config.getEmpresa() || {} : {};
    escPushText(chunks, comanda.areaNombre || 'COMANDA');
    escBold(chunks, false);
    escPushText(chunks, emp.nombreComercial || emp.razonSocial || 'Crozzo POS');
    escDivider(chunks, tpl);
    escAlign(chunks, 'left');
    escPushText(chunks, 'COMANDA #' + (comanda.id || ''));
    var ref =
      comanda.tipoServicio === 'mesa'
        ? 'Mesa ' + (comanda.referencia || '')
        : comanda.tipoServicio === 'llevar'
          ? 'Para llevar ' + (comanda.referencia || '')
          : String(comanda.referencia || '');
    escPushText(chunks, ref);
    escPushText(chunks, escFmtDatePlain(new Date(comanda.lastUpdateAt || comanda.createdAt || Date.now())));
    escDivider(chunks, tpl);
    (comanda.items || []).forEach(function (it) {
      var nom = it.nombreVenta || it.nombre || 'Item';
      var qty = Number(it.cantidad) || 0;
      var det = it.detalleConfig ? ' (' + it.detalleConfig + ')' : '';
      escBold(chunks, true);
      escPushText(chunks, qty + 'x ' + nom + det);
      escBold(chunks, false);
    });
    escFeed(chunks, 2);
    escApplyCut(chunks, 'partial', 4);
    return Promise.resolve(escChunksToUint8(chunks));
  }

  /** Cola serial de impresión — evita choques en hora pico. */
  var __crozzoPrintQueue = [];
  var __crozzoPrintQueueRunning = false;
  var __crozzoPrintQueueId = 0;

  function crozzoNotifyPrintQueueUi() {
    try {
      if (typeof global.crozzoUpdatePrintQueueBar === 'function') global.crozzoUpdatePrintQueueBar();
    } catch (_) {}
  }

  function crozzoGetPrintQueueStatus() {
    var pending = 0;
    var printing = 0;
    var errors = 0;
    __crozzoPrintQueue.forEach(function (j) {
      if (j.status === 'pending') pending++;
      else if (j.status === 'printing') printing++;
      else if (j.status === 'error') errors++;
    });
    return {
      pending: pending,
      printing: printing,
      errors: errors,
      recent: __crozzoPrintQueue.slice(-8).reverse(),
    };
  }

  function crozzoPrintQueueRunNext() {
    if (__crozzoPrintQueueRunning) return;
    var next = null;
    for (var i = 0; i < __crozzoPrintQueue.length; i++) {
      if (__crozzoPrintQueue[i].status === 'pending') {
        next = __crozzoPrintQueue[i];
        break;
      }
    }
    if (!next) return;
    __crozzoPrintQueueRunning = true;
    next.status = 'printing';
    crozzoNotifyPrintQueueUi();
    Promise.resolve()
      .then(function () {
        return next.run();
      })
      .then(function (ok) {
        next.status = ok ? 'done' : 'error';
        next.finishedAt = Date.now();
        return ok;
      })
      .catch(function () {
        next.status = 'error';
        next.finishedAt = Date.now();
      })
      .finally(function () {
        __crozzoPrintQueueRunning = false;
        if (__crozzoPrintQueue.length > 40) __crozzoPrintQueue = __crozzoPrintQueue.slice(-25);
        crozzoNotifyPrintQueueUi();
        crozzoPrintQueueRunNext();
      });
  }

  function crozzoPrintEnqueue(label, runFn) {
    var job = {
      id: ++__crozzoPrintQueueId,
      label: String(label || 'Impresión'),
      status: 'pending',
      at: Date.now(),
      run: runFn,
    };
    __crozzoPrintQueue.push(job);
    crozzoNotifyPrintQueueUi();
    crozzoPrintQueueRunNext();
    return job.id;
  }

  function crozzoInvokePrintRaw(resolved, bytes, copies) {
    var n = Math.max(1, Math.min(5, Number(copies) || 1));
    var b64 = crozzoBytesToBase64(bytes);
    var payloadB64 = {
      printerName: resolved,
      dataB64: b64,
      copies: n,
    };
    return crozzoTauriInvoke('crozzo_print_raw_b64', payloadB64).catch(function (errB64) {
      console.warn('[crozzo-print] b64 falló, reintento array', errB64);
      return crozzoTauriInvoke('crozzo_print_raw', {
        printerName: resolved,
        data: Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)),
        copies: n,
      });
    });
  }

  function crozzoPrintRawEscPos(printerName, bytes, copies, kind) {
    if (!bytes || !bytes.length) {
      if (typeof global.showToast === 'function') {
        global.showToast('Ticket vacío: revise el diseño o el modelo.', 'warning');
      }
      return Promise.resolve(false);
    }
    if (!crozzoIsTauri()) return Promise.resolve(false);
    var role = crozzoPrintKindToRole(kind);
    return crozzoResolvePrinterName(printerName, role)
      .then(function (resolved) {
        if (!resolved) {
          return Promise.reject(new Error('sin_impresora'));
        }
        if (crozzoIsPhantomPrinter(resolved)) {
          return Promise.reject(new Error('impresora_generica_invalida'));
        }
        return crozzoInvokePrintRaw(resolved, bytes, copies);
      })
      .then(function (res) {
        global.__CROZZO_LAST_PRINT = {
          ok: !!(res && res.ok),
          message: res && res.message ? res.message : '',
          kind: kind || '',
          at: Date.now(),
        };
        if (res && res.ok) {
          if (global.config && global.config.addAudit) {
            global.config.addAudit('impresion_tauri', (kind || 'ticket') + ' · ' + (res.message || 'ok'));
          }
          return true;
        }
        var errMsg = (res && res.message) || 'sin respuesta del spooler';
        return Promise.reject(new Error(errMsg));
      })
      .catch(function (err) {
        global.__CROZZO_LAST_PRINT = {
          ok: false,
          message: err && err.message ? err.message : String(err || 'error'),
          kind: kind || '',
          at: Date.now(),
        };
        if (typeof global.showToast === 'function') {
          var msg = err && err.message ? err.message : String(err || 'error');
          if (msg === 'sin_impresora') {
            global.showToast(
              'Sin impresora válida. Actualizar lista → elija POS-80 (nombre exacto de Windows).',
              'warning'
            );
          } else if (msg === 'impresora_generica_invalida') {
            global.showToast('«Generic 80mm» no existe. Elija la térmica real.', 'warning');
          } else {
            global.showToast('Impresión: ' + msg, 'error');
          }
        }
        return false;
      });
  }

  /** Prueba unificada: carga impresoras → resuelve nombre → envía ESC/POS. */
  function crozzoRunThermalPrintTest(opts) {
    opts = opts || {};
    if (!crozzoIsTauri()) {
      var browserOpts = {
        printer: opts.printer || '',
        copies: opts.copies || 1,
        silent: false,
        allowDialog: true,
        role: opts.role || 'caja',
        kind: opts.kind || 'test',
      };
      if (opts.tpl && opts.payload && typeof global.crozzoPrintEscPosTemplate === 'function') {
        return global.crozzoPrintEscPosTemplate(opts.tpl, opts.payload, browserOpts);
      }
      if (opts.factura && typeof global.crozzoPrintFactura === 'function') {
        return global.crozzoPrintFactura(opts.factura, Object.assign({}, browserOpts, { skipQueue: true }));
      }
      var pingHtml =
        '<div class="crozzo-ticket" style="font-family:Consolas,monospace;padding:8px;text-align:center">' +
        '<strong>PRUEBA CROZZO POS</strong><br>' +
        new Date().toLocaleString('es-CO') +
        '</div>';
      return crozzoPrintThermalHtmlFallback(pingHtml, '80mm', browserOpts.copies, browserOpts);
    }
    if (typeof global.crozzoFacturasAdminPersistPrinters === 'function') {
      global.crozzoFacturasAdminPersistPrinters({ silent: true });
    }
    return crozzoEnsurePrintersLoaded().then(function () {
      var role = opts.role || 'caja';
      var printer = crozzoResolvePrinterForJob(opts.printer || '', role);
      if (!printer) {
        if (typeof global.showToast === 'function') {
          global.showToast('Elija impresora en el desplegable (pestaña Impresoras o Diseño).', 'warning');
        }
        return false;
      }
      var bytesP = Promise.resolve(opts.bytes);
      if (!opts.bytes || !opts.bytes.length) {
        if (opts.tpl && opts.payload) {
          bytesP = crozzoBuildEscPosBytesAsync(opts.tpl, opts.payload, {});
        } else if (opts.factura) {
          bytesP = crozzoBuildEscPosFromFactura(opts.factura);
        } else {
          bytesP = Promise.resolve(crozzoBuildPingEscPos());
        }
      }
      return bytesP.then(function (bytes) {
        return crozzoPrintRawEscPos(printer, bytes, opts.copies || 1, opts.kind || 'test');
      });
    });
  }

  /* ---------- Fallback HTML ---------- */
  function ensurePrintFrame() {
    var iframe = document.getElementById('crozzoPrintFrame');
    if (iframe) return iframe;
    iframe = document.createElement('iframe');
    iframe.id = 'crozzoPrintFrame';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.title = 'Impresión Crozzo';
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
    document.body.appendChild(iframe);
    return iframe;
  }

  function buildThermalPrintDocument(innerHtml, pageW) {
    var bodyW = pageW === '58mm' ? '58mm' : '80mm';
    return (
      '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Crozzo</title><style>' +
      '@page{size:' + pageW + ' auto;margin:0}body{margin:0;width:' + bodyW + ';font-family:Consolas,monospace}' +
      '</style></head><body>' + innerHtml + '</body></html>'
    );
  }

  function normalPageCss(pageFormat) {
    var pf = String(pageFormat || 'a4').toLowerCase();
    if (pf === 'legal' || pf === 'oficio') return '@page{size:legal;margin:12mm}';
    return '@page{size:A4;margin:12mm}';
  }

  function buildNormalPrintDocument(innerHtml, opts) {
    opts = opts || {};
    return (
      '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Crozzo</title><style>' +
      normalPageCss(opts.pageFormat) +
      'body{margin:0;font-family:Georgia,\'Times New Roman\',serif;color:#141414;background:#f5f2eb}' +
      '.crozzo-label-sheet{display:block;max-width:78mm;margin:0 auto 14mm;padding:8mm 5mm;' +
      'border:1px solid #c9a962;border-radius:2px;box-shadow:0 2px 12px rgba(0,0,0,.08);' +
      'page-break-after:always;page-break-inside:avoid;background:#fffef9}' +
      '.crozzo-label-sheet:last-child{page-break-after:auto}' +
      '.crozzo-label-sheet .crozzo-label-inner{font-size:inherit;line-height:1.42}' +
      '.crozzo-label-sheet .crozzo-ticket{box-shadow:none!important}' +
      '</style></head><body>' +
      innerHtml +
      '</body></html>'
    );
  }

  function crozzoRenderTplToHtml(tpl, payload) {
    if (!tpl || typeof global.crozzoTermicaRenderPlantillaHtml !== 'function') return '';
    return global.crozzoTermicaRenderPlantillaHtml(tpl, payload || {});
  }

  function pageFormatFromPrintOutput(outputId) {
    var o = String(outputId || '').toLowerCase();
    if (o === 'oficio' || o === 'legal') return 'legal';
    return 'a4';
  }

  function crozzoPrintHtmlWithDialog(htmlDocument, options) {
    options = options || {};
    return crozzoPrintThermalHtmlFallback('', 'a4', options.copies || 1, {
      allowDialog: true,
      silent: false,
      useFullDocument: true,
      htmlDocument: htmlDocument,
      toast: options.toast !== false,
    });
  }

  function crozzoPrintHtmlSilentTauri(htmlDocument, options) {
    options = options || {};
    if (!htmlDocument || !crozzoIsTauri()) return Promise.resolve(false);
    var role = options.role || 'caja';
    var requested = String(options.printer || '').trim();
    return crozzoResolvePrinterName(requested, role).then(function (resolved) {
      if (!resolved) {
        if (typeof global.showToast === 'function') {
          global.showToast(
            'Sin impresora de caja. Elija «EPSON…» o su térmica en Configuración → Facturas e impresión → Impresoras.',
            'warning'
          );
        }
        return crozzoPrintHtmlWithDialog(htmlDocument, options);
      }
      return crozzoTauriInvoke('crozzo_print_html_b64', {
        printerName: resolved,
        htmlB64: crozzoUtf8ToBase64(htmlDocument),
        copies: options.copies || 1,
        landscape: options.landscape === true,
      })
        .then(function (res) {
          global.__CROZZO_LAST_PRINT = {
            ok: !!(res && res.ok),
            message: res && res.message ? res.message : '',
            at: Date.now(),
          };
          if (res && res.ok) {
            if (typeof global.showToast === 'function' && options.toast !== false) {
              var fmt =
                options.printOutput === 'oficio' || options.pageFormat === 'legal'
                  ? 'Oficio'
                  : 'Carta';
              global.showToast(
                (res.message || 'Impreso') + ' · ' + fmt + ' · «' + resolved + '»',
                'success'
              );
            }
            return true;
          }
          if (typeof global.showToast === 'function') {
            global.showToast(
              (res && res.message) || 'Impresión directa falló; abriendo cuadro de impresión…',
              'warning'
            );
          }
          return crozzoPrintHtmlWithDialog(htmlDocument, options);
        })
        .catch(function (err) {
          console.warn('[crozzo-print] html silent', err);
          if (typeof global.showToast === 'function') {
            global.showToast('Impresión directa falló; abriendo cuadro de impresión…', 'warning');
          }
          return crozzoPrintHtmlWithDialog(htmlDocument, options);
        });
    });
  }

  function crozzoPrintHtmlWindowOpen(htmlDocument, options) {
    options = options || {};
    if (!htmlDocument) return Promise.resolve(false);
    var w = window.open('', '_blank', 'width=960,height=720');
    if (!w) return Promise.resolve(false);
    w.document.write(htmlDocument);
    w.document.close();
    return new Promise(function (resolve) {
      global.setTimeout(function () {
        try {
          w.focus();
          w.print();
          resolve(true);
        } catch (_) {
          resolve(false);
        }
      }, options.delayMs != null ? options.delayMs : 450);
    });
  }

  function crozzoPrintRollLabelsHtml(jobs, options) {
    options = options || {};
    jobs = jobs || [];
    if (!jobs.length) return Promise.resolve(false);
    var tpl = (jobs[0] && jobs[0].tpl) || {};
    var pageW = tpl.sz === '58' ? '58mm' : '80mm';
    var parts = [];
    jobs.forEach(function (job) {
      if (!job || !job.tpl) return;
      var payload = job.payload && typeof job.payload === 'object' ? Object.assign({}, job.payload) : {};
      if (!payload.logoUrl && typeof global.crozzoResolveTicketLogoUrl === 'function') {
        payload.logoUrl = global.crozzoResolveTicketLogoUrl();
      }
      var inner = crozzoRenderTplToHtml(job.tpl, payload);
      if (inner) parts.push('<div class="crozzo-roll-label">' + inner + '</div>');
    });
    if (!parts.length) return Promise.resolve(false);
    var sep =
      '<div class="crozzo-roll-label-break" style="page-break-after:always;height:0;margin:0;padding:0"></div>';
    var joined = parts.join(sep);
    var htmlDoc = buildThermalPrintDocument(joined, pageW);
    if (crozzoIsTauri() && options.allowDialog !== true && options.silent !== false) {
      return crozzoPrintHtmlSilentTauri(htmlDoc, Object.assign({ landscape: false }, options));
    }
    return crozzoPrintThermalHtmlFallback(joined, pageW, options.copies || 1, {
      allowDialog: options.allowDialog !== false,
      silent: false,
      htmlDocument: htmlDoc,
      useFullDocument: true,
    });
  }

  function crozzoPrintTemplateHtml(tpl, data, options) {
    options = options || {};
    if (!options.pageFormat && tpl && tpl.printOutput) {
      options = Object.assign({}, options, { pageFormat: pageFormatFromPrintOutput(tpl.printOutput) });
    }
    if (!tpl || !tpl.blocks || !tpl.blocks.length) {
      if (typeof global.showToast === 'function') {
        global.showToast('Plantilla vacía.', 'warning');
      }
      return Promise.resolve(false);
    }
    var payload = data && typeof data === 'object' ? Object.assign({}, data) : {};
    if (!payload.logoUrl && typeof global.crozzoResolveTicketLogoUrl === 'function') {
      payload.logoUrl = global.crozzoResolveTicketLogoUrl();
    }
    var inner = crozzoRenderTplToHtml(tpl, payload);
    if (!inner) {
      if (typeof global.showToast === 'function') {
        global.showToast('No se pudo generar vista para impresora normal.', 'warning');
      }
      return Promise.resolve(false);
    }
    var wrapped =
      '<div class="crozzo-label-sheet"><div class="crozzo-label-inner">' + inner + '</div></div>';
    var html = options.layout === 'thermal'
      ? buildThermalPrintDocument(inner, tpl.sz === '58' ? '58mm' : '80mm')
      : buildNormalPrintDocument(wrapped, options);
    var pageW = options.layout === 'thermal' ? (tpl.sz === '58' ? '58mm' : '80mm') : 'a4';
    var printOpts = {
      allowDialog: true,
      silent: false,
      htmlDocument: html,
      useFullDocument: true,
    };
    var isSheetDoc =
      options.channel === 'normal' || options.preferNormal || options.pageFormat;
    var wantSilent =
      crozzoIsTauri() &&
      options.allowDialog !== true &&
      options.silent !== false &&
      isSheetDoc &&
      options.layout !== 'thermal';
    var printP = wantSilent
      ? crozzoPrintHtmlSilentTauri(html, Object.assign({}, options, printOpts))
      : crozzoPrintThermalHtmlFallback(inner, pageW, options.copies || 1, printOpts);
    return printP.then(function (ok) {
      if (!ok && wantSilent) {
        return crozzoPrintHtmlWithDialog(html, Object.assign({}, options, printOpts, { allowDialog: true, silent: false }));
      }
      if (ok && typeof global.showToast === 'function' && options.toast !== false) {
        global.showToast(
          options.layout === 'thermal'
            ? 'Abra el cuadro de impresión y elija su impresora de etiquetas o térmica.'
            : 'Abra el cuadro de impresión y elija su impresora normal (láser, oficina o PDF).',
          'info'
        );
      }
      return ok;
    });
  }

  function crozzoPrintBatchLabelsHtml(jobs, options) {
    options = options || {};
    jobs = jobs || [];
    if (!jobs.length) return Promise.resolve(false);
    var parts = [];
    jobs.forEach(function (job) {
      if (!job || !job.tpl) return;
      var payload = job.payload && typeof job.payload === 'object' ? Object.assign({}, job.payload) : {};
      if (!payload.logoUrl && typeof global.crozzoResolveTicketLogoUrl === 'function') {
        payload.logoUrl = global.crozzoResolveTicketLogoUrl();
      }
      var inner = crozzoRenderTplToHtml(job.tpl, payload);
      if (inner) {
        parts.push('<div class="crozzo-label-sheet"><div class="crozzo-label-inner">' + inner + '</div></div>');
      }
    });
    if (!parts.length) return Promise.resolve(false);
    if (!options.pageFormat) {
      var batchOut = String(
        options.printOutput ||
          (jobs[0] && jobs[0].opts && jobs[0].opts.printOutput) ||
          (jobs[0] && jobs[0].tpl && jobs[0].tpl.printOutput) ||
          'carta'
      ).toLowerCase();
      if (batchOut === 'thermal' || batchOut === 'roll' || batchOut === 'termica') batchOut = 'carta';
      if (batchOut === 'normal' || batchOut === 'html' || batchOut === 'a4') batchOut = 'carta';
      options = Object.assign({}, options, { pageFormat: pageFormatFromPrintOutput(batchOut), printOutput: batchOut });
    }
    var html = buildNormalPrintDocument(parts.join(''), options);
    if (crozzoIsTauri() && options.allowDialog !== true && options.silent !== false) {
      var silentOpts = Object.assign({ role: 'caja', landscape: false }, options);
      if (!silentOpts.printer && jobs[0] && jobs[0].opts && jobs[0].opts.printer) {
        silentOpts.printer = jobs[0].opts.printer;
      }
      return crozzoPrintHtmlSilentTauri(html, silentOpts).then(function (ok) {
        if (ok && typeof global.showToast === 'function' && options.toast !== false) {
          global.showToast(
            'Impresión ' +
              (options.printOutput === 'oficio' ? 'oficio' : 'carta') +
              ': ' +
              parts.length +
              ' etiqueta(s).',
            'success'
          );
        }
        return ok;
      });
    }
    return crozzoPrintThermalHtmlFallback('', 'a4', 1, {
      allowDialog: true,
      silent: false,
      htmlDocument: html,
      useFullDocument: true,
    }).then(function (ok) {
      if (ok && typeof global.showToast === 'function' && options.toast !== false) {
        global.showToast('Impresión normal: ' + parts.length + ' etiqueta(s) en un solo documento.', 'success');
      }
      return ok;
    });
  }

  function crozzoPrintThermalHtmlFallback(innerHtml, pageW, copies, options) {
    options = options || {};
    if (crozzoPreferSilentPrint(options)) {
      if (typeof global.showToast === 'function') {
        global.showToast(
          'Impresión directa no disponible. Elija impresora en la lista y use la app de escritorio (Tauri).',
          'warning'
        );
      }
      return Promise.resolve(false);
    }
    var html =
      options.useFullDocument && options.htmlDocument
        ? options.htmlDocument
        : buildThermalPrintDocument(innerHtml, pageW || '80mm');
    var n = Math.max(1, Number(copies) || 1);
    function runCopy(idx) {
      return new Promise(function (resolve) {
        var iframe = ensurePrintFrame();
        var win = iframe.contentWindow;
        if (!win) return resolve(false);
        win.document.open();
        win.document.write(html);
        win.document.close();
        global.setTimeout(function () {
          try {
            win.focus();
            win.print();
            resolve(true);
          } catch (_) {
            resolve(false);
          }
        }, idx === 0 ? 350 : 900);
      });
    }
    var chain = Promise.resolve(true);
    for (var i = 0; i < n; i++) {
      chain = chain.then(function () {
        return runCopy(i);
      });
    }
    return chain;
  }

  /** Impresión HTML (inventario, reportes): en Tauri envía directo a la impresora configurada; allowDialog:true fuerza cuadro Windows. */
  function crozzoPrintHtmlDocument(htmlDocument, options) {
    options = options || {};
    if (!htmlDocument) return Promise.resolve(false);
    if (!options.pageFormat && options.printOutput) {
      options = Object.assign({}, options, { pageFormat: pageFormatFromPrintOutput(options.printOutput) });
    }
    if (crozzoIsTauri() && options.allowDialog !== true && options.silent !== false) {
      return crozzoPrintHtmlSilentTauri(htmlDocument, options);
    }
    return crozzoPrintHtmlWithDialog(htmlDocument, options).then(function (ok) {
      if (!ok && typeof global.showToast === 'function') {
        global.showToast(
          'No se abrió la impresión. Permita ventanas emergentes o configure la impresora en Facturas e impresión.',
          'warning'
        );
      }
      return ok;
    });
  }

  function crozzoPrintThermalContent(innerHtml, pageW, options) {
    options = options || {};
    if (!innerHtml && !(options.escpos && options.escpos.length)) return Promise.resolve(false);

    if (crozzoIsTauri()) {
      var bytes = options.escpos;
      if (!bytes && innerHtml && typeof global.crozzoBuildEscPosFromFactura === 'undefined') {
        bytes = null;
      }
      if (bytes && bytes.length) {
        return crozzoPrintRawEscPos(options.printer, bytes, options.copies || 1, options.kind);
      }
    }

    return crozzoPrintThermalHtmlFallback(innerHtml, pageW, options.copies || 1, options);
  }

  function crozzoPrintFacturaInternal(factura, options) {
    options = options || {};
    if (!factura) return Promise.resolve(false);
    var copies = options.copies != null ? options.copies : getCopies();
    var printer = (options.printer || getCajaPrinter()).trim();
    var pageW =
      typeof global.crozzoFacturaThermalPageMm === 'function' ? global.crozzoFacturaThermalPageMm(factura) : '80mm';
    var inner =
      typeof global.crozzoFacturaBuildThermalHtml === 'function' ? global.crozzoFacturaBuildThermalHtml(factura) : '';
    return crozzoBuildEscPosFromFactura(factura).then(function (escpos) {
      if (crozzoIsTauri()) {
        if (!printer) {
          if (typeof global.showToast === 'function') {
            global.showToast('Seleccione la impresora de caja en Configuración → Impresoras.', 'warning');
          }
          return false;
        }
        if (escpos.length) {
          return crozzoPrintRawEscPos(printer, escpos, copies, 'factura').then(function (ok) {
          if (!ok && typeof global.showToast === 'function') {
            global.showToast('No se pudo imprimir en «' + printer + '». Revise conexión y nombre.', 'error');
          }
            return ok;
          });
        }
        return false;
      }
      return crozzoPrintThermalHtmlFallback(inner, pageW, copies, options).then(function (ok) {
        if (!ok && typeof global.showToast === 'function') {
          global.showToast('No se pudo imprimir. Revise la impresora predeterminada.', 'warning');
        }
        return ok;
      });
    });
  }

  function crozzoPrintFactura(factura, options) {
    options = options || {};
    if (!factura) return Promise.resolve(false);
    if (options.skipQueue) return crozzoPrintFacturaInternal(factura, options);
    var label = 'Recibo #' + (factura.consecutivo || factura.uuid || '—');
    return new Promise(function (resolve) {
      crozzoPrintEnqueue(label, function () {
        return crozzoPrintFacturaInternal(factura, options).then(resolve);
      });
    });
  }

  function crozzoPrintRetryFailed() {
    var retried = false;
    __crozzoPrintQueue.forEach(function (j) {
      if (j.status === 'error') {
        j.status = 'pending';
        j.finishedAt = null;
        retried = true;
      }
    });
    if (retried) {
      crozzoNotifyPrintQueueUi();
      crozzoPrintQueueRunNext();
      if (typeof global.showToast === 'function') global.showToast('Reintentando impresiones fallidas…', 'info');
    } else if (typeof global.showToast === 'function') {
      global.showToast('No hay impresiones fallidas en cola', 'info');
    }
    return retried;
  }

  function crozzoAutoPrintFacturaIfConfigured(factura) {
    if (getAdminConfig().autoImprimir === false) return Promise.resolve(false);
    var printer = getCajaPrinter();
    return crozzoPrintFactura(factura, { silent: true, copies: getCopies(), printer: printer }).then(function (ok) {
      if (ok && typeof global.showToast === 'function') {
        var msg = '🖨️ Recibo impreso (' + getCopies() + ' copia' + (getCopies() > 1 ? 's' : '') + ')';
        if (crozzoIsTauri()) msg += printer ? ' · ' + printer : ' · impresora predeterminada';
        global.showToast(msg, 'info');
      }
      return ok;
    });
  }

  function crozzoBuildComandaThermalHtml(comanda) {
    if (!comanda) return '';
    var emp = global.config && global.config.getEmpresa ? global.config.getEmpresa() || {} : {};
    var ref =
      comanda.tipoServicio === 'mesa'
        ? 'Mesa ' + (comanda.referencia || '—')
        : comanda.tipoServicio === 'llevar'
          ? 'Para llevar · ' + (comanda.referencia || '—')
          : String(comanda.referencia || '—');
    var lines = (comanda.items || [])
      .map(function (it) {
        return (Number(it.cantidad) || 0) + '× ' + (it.nombreVenta || it.nombre || 'Ítem');
      })
      .join('\n');
    return (
      '<pre style="font-family:Consolas,monospace;font-size:11px;margin:0;padding:2mm;width:72mm;">' +
      (comanda.areaNombre || 'COMANDA') +
      '\n' +
      (emp.nombreComercial || '') +
      '\n---\n#' +
      comanda.id +
      ' · ' +
      ref +
      '\n' +
      lines +
      '\n</pre>'
    );
  }

  function crozzoPrintComandaInternal(comanda, options) {
    options = options || {};
    if (!comanda) return Promise.resolve(false);
    var printer = String(options.printer || crozzoResolveComandaPrinter(comanda) || '').trim();
    return crozzoBuildEscPosFromComanda(comanda).then(function (escpos) {
      if (crozzoIsTauri()) {
        if (!printer) {
          if (typeof global.showToast === 'function') {
            global.showToast(
              'Sin impresora para «' + (comanda.areaNombre || 'comanda') + '». Asigne una en Cocina/Comandas o en Configuración → Cocina/barra.',
              'warning'
            );
          }
          return false;
        }
        if (escpos && escpos.length) {
          return crozzoPrintRawEscPos(printer, escpos, 1, 'comanda');
        }
        return false;
      }
      return crozzoPrintThermalHtmlFallback(crozzoBuildComandaThermalHtml(comanda), '80mm', 1, options);
    });
  }

  function crozzoPrintComanda(comanda, options) {
    options = options || {};
    if (!comanda) return Promise.resolve(false);
    if (options.skipQueue) return crozzoPrintComandaInternal(comanda, options);
    var label = 'Comanda #' + (comanda.id || '—') + ' · ' + (comanda.referencia || '');
    return new Promise(function (resolve) {
      crozzoPrintEnqueue(label, function () {
        return crozzoPrintComandaInternal(comanda, options).then(resolve);
      });
    });
  }

  function crozzoPrintTestTicket() {
    var sample = {
      estado: 'timbrada',
      consecutivo: 'TEST-0001',
      fecha: escFmtDatePlain(new Date()),
      compradorNombre: 'Cliente de prueba',
      compradorNit: '222222222-2',
      items: [
        { nombreVenta: 'Producto demo A', cantidad: 2, precio: 12500 },
        { nombreVenta: 'Producto demo B', cantidad: 1, precio: 8900 },
      ],
      subtotal: 33900,
      iva: 6441,
      total: 40341,
      metodoPago: 'efectivo',
      paymentMeta: { valorRecibido: 50000, devueltas: 9659 },
      cufe: '',
      qrUrl: '',
    };
    return crozzoRunThermalPrintTest({
      factura: sample,
      role: 'caja',
      kind: 'test_caja',
      copies: 1,
    }).then(function (ok) {
      if (ok && typeof global.showToast === 'function') {
        global.showToast('Ticket de prueba enviado a la térmica.', 'success');
      }
      return ok;
    });
  }

  function crozzoFacturaPrintThermal(factura, options) {
    options = options || {};
    var copies =
      options.copies != null
        ? options.copies
        : factura && factura.estado === 'precuenta'
          ? 1
          : getCopies();
    return crozzoPrintFactura(factura, {
      copies: copies,
      printer: options.printer || getCajaPrinter(),
      silent: options.silent != null ? options.silent : false,
    });
  }

  function crozzoPrintEscPosTemplate(tpl, data, options) {
    options = options || {};
    if (!tpl || !tpl.blocks || !tpl.blocks.length) {
      if (typeof global.showToast === 'function') {
        global.showToast('Plantilla vacía. Elija un modelo o edite en el diseñador.', 'warning');
      }
      return Promise.resolve(false);
    }
    var isSheet =
      options.channel === 'normal' || options.preferNormal === true || !!options.pageFormat;
    var labelDoc =
      tpl.docType === 'bodega' || tpl.docType === 'bodega_entrada' || tpl.docType === 'salon' || options.forceHtml;
    if (labelDoc && !options.preferEscPos && !isSheet) {
      return crozzoPrintTemplateHtml(tpl, data, Object.assign({ layout: 'thermal' }, options));
    }
    if (isSheet) {
      return crozzoPrintTemplateHtml(tpl, data, options);
    }
    var printer = crozzoResolvePrinterForJob(options.printer || '', options.role || 'caja');
    var payload = data && typeof data === 'object' ? Object.assign({}, data) : {};
    if (!payload.logoUrl && typeof global.crozzoResolveTicketLogoUrl === 'function') {
      payload.logoUrl = global.crozzoResolveTicketLogoUrl();
    }
    return crozzoBuildEscPosBytesAsync(tpl, payload, options).then(function (bytes) {
      if (crozzoIsTauri()) {
        if (!printer || !bytes.length) {
          if (typeof global.showToast === 'function') {
            global.showToast(
              !printer
                ? 'Sin impresora térmica configurada — abriendo cuadro de impresión…'
                : 'Ticket vacío — abriendo vista de impresión…',
              'info'
            );
          }
          var innerFb =
            typeof global.crozzoTermicaRenderPlantillaHtml === 'function'
              ? global.crozzoTermicaRenderPlantillaHtml(tpl, payload)
              : '';
          var pageWFb = tpl && tpl.sz === '58' ? '58mm' : '80mm';
          return crozzoPrintThermalHtmlFallback(innerFb, pageWFb, options.copies || 1, {
            allowDialog: true,
            silent: false,
          });
        }
        return crozzoPrintRawEscPos(printer, bytes, options.copies || 1, options.kind || 'designer_test').then(function (ok) {
          if (!ok) {
            var innerRetry =
              typeof global.crozzoTermicaRenderPlantillaHtml === 'function'
                ? global.crozzoTermicaRenderPlantillaHtml(tpl, payload)
                : '';
            var pageWR = tpl && tpl.sz === '58' ? '58mm' : '80mm';
            return crozzoPrintThermalHtmlFallback(innerRetry, pageWR, options.copies || 1, {
              allowDialog: true,
              silent: false,
            }).then(function (htmlOk) {
              if (!htmlOk && typeof global.showToast === 'function') {
                global.showToast('No se pudo imprimir en «' + printer + '». Revise conexión.', 'error');
              } else if (htmlOk && typeof global.showToast === 'function' && options.silent !== true) {
                global.showToast('Impresión por cuadro del sistema (térmica no respondió).', 'info');
              }
              return htmlOk;
            });
          }
          if (ok && typeof global.showToast === 'function' && options.silent !== true) {
            global.showToast('Ticket enviado a «' + printer + '».', 'success');
          }
          return ok;
        });
      }
      var inner =
        typeof global.crozzoTermicaRenderPlantillaHtml === 'function'
          ? global.crozzoTermicaRenderPlantillaHtml(tpl, payload)
          : '';
      var pageW = tpl && tpl.sz === '58' ? '58mm' : '80mm';
      return crozzoPrintThermalHtmlFallback(inner, pageW, options.copies || 1, options);
    });
  }

  global.crozzoMatchSystemPrinter = crozzoMatchSystemPrinter;
  global.crozzoResolvePrinterForJob = crozzoResolvePrinterForJob;
  global.crozzoResolveComandaPrinter = crozzoResolveComandaPrinter;
  global.crozzoIsPhantomPrinter = crozzoIsPhantomPrinter;
  global.crozzoSanitizeSavedPrinterConfig = crozzoSanitizeSavedPrinterConfig;
  global.crozzoGetPrintBackend = crozzoGetPrintBackend;
  global.crozzoPrintEscPosTemplate = crozzoPrintEscPosTemplate;
  global.crozzoIsTauriPrint = crozzoIsTauri;
  global.crozzoGetAvailablePrinters = crozzoGetAvailablePrinters;
  global.crozzoRefreshPrinterList = crozzoRefreshPrinterList;
  global.crozzoLoadSystemPrintersAsync = crozzoLoadSystemPrintersAsync;
  global.crozzoPrintThermalContent = crozzoPrintThermalContent;
  global.crozzoPrintHtmlDocument = crozzoPrintHtmlDocument;
  global.crozzoPrintTemplateHtml = crozzoPrintTemplateHtml;
  global.crozzoPrintBatchLabelsHtml = crozzoPrintBatchLabelsHtml;
  global.crozzoPrintRollLabelsHtml = crozzoPrintRollLabelsHtml;
  global.crozzoPrintHtmlWindowOpen = crozzoPrintHtmlWindowOpen;
  global.crozzoPrintFactura = crozzoPrintFactura;
  global.crozzoAutoPrintFacturaIfConfigured = crozzoAutoPrintFacturaIfConfigured;
  global.crozzoPrintComanda = crozzoPrintComanda;
  global.crozzoBuildComandaThermalHtml = crozzoBuildComandaThermalHtml;
  global.crozzoBuildEscPosFromFactura = crozzoBuildEscPosFromFactura;
  global.crozzoBuildEscPosFromPayload = crozzoBuildEscPosFromPayload;
  global.crozzoPrintTestTicket = crozzoPrintTestTicket;
  global.crozzoRunThermalPrintTest = crozzoRunThermalPrintTest;
  global.crozzoEnsurePrintersLoaded = crozzoEnsurePrintersLoaded;
  global.crozzoBuildPingEscPos = crozzoBuildPingEscPos;
  global.crozzoFacturaPrintThermal = crozzoFacturaPrintThermal;
  global.crozzoGetPrintQueueStatus = crozzoGetPrintQueueStatus;
  global.crozzoPrintEnqueue = crozzoPrintEnqueue;
  global.crozzoPrintRetryFailed = crozzoPrintRetryFailed;

  if (!Array.isArray(global.AVAILABLE_PRINTERS) || !global.AVAILABLE_PRINTERS.length) {
    global.AVAILABLE_PRINTERS = DEFAULT_PRINTERS.slice();
  }
  crozzoRefreshPrinterList();
  if (typeof document !== 'undefined') {
    function crozzoSchedulePrinterScan(force) {
      void crozzoLoadSystemPrintersAsync({ force: !!force });
    }
    document.addEventListener('DOMContentLoaded', function () {
      crozzoSchedulePrinterScan(false);
    });
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      crozzoSchedulePrinterScan(false);
    }
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      var last = global.__CROZZO_PRINTERS_LOADED_AT || 0;
      if (Date.now() - last > 120000) crozzoSchedulePrinterScan(false);
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
