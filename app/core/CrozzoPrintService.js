/**
 * Crozzo POS — impresión térmica unificada.
 * Tauri (Windows): ESC/POS directo vía WinAPI sin diálogo.
 * Navegador: fallback iframe + window.print().
 */
(function (global) {
  'use strict';

  var DEFAULT_PRINTERS = ['Generic 58mm', 'Generic 80mm'];
  global.__CROZZO_SYSTEM_PRINTERS = global.__CROZZO_SYSTEM_PRINTERS || [];

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

  function getAdminConfig() {
    return typeof global.getFacturacionAdminConfig === 'function' ? global.getFacturacionAdminConfig() : {};
  }

  function getCopies() {
    return Math.max(1, Math.min(5, Number(getAdminConfig().copiasFactura) || 1));
  }

  function getCajaPrinter() {
    return String(getAdminConfig().impresoraCajaPos || '').trim();
  }

  function getComandaPrinter() {
    return String(getAdminConfig().impresoraComandas || '').trim();
  }

  function crozzoGetAvailablePrinters() {
    var conf = getAdminConfig();
    var custom = Array.isArray(conf.impresorasCustom) ? conf.impresorasCustom : [];
    var system = global.__CROZZO_SYSTEM_PRINTERS || [];
    var caja = getCajaPrinter();
    var com = getComandaPrinter();
    var seen = {};
    var out = [];
    [caja, com].concat(system, custom, DEFAULT_PRINTERS).forEach(function (p) {
      p = String(p || '').trim();
      if (!p || seen[p.toLowerCase()]) return;
      seen[p.toLowerCase()] = true;
      out.push(p);
    });
    return out;
  }

  function crozzoRefreshPrinterList() {
    global.AVAILABLE_PRINTERS = crozzoGetAvailablePrinters();
    return global.AVAILABLE_PRINTERS;
  }

  function crozzoLoadSystemPrintersAsync() {
    if (!crozzoIsTauri()) {
      crozzoRefreshPrinterList();
      return Promise.resolve([]);
    }
    return crozzoTauriInvoke('crozzo_list_printers', {})
      .then(function (list) {
        global.__CROZZO_SYSTEM_PRINTERS = Array.isArray(list) ? list : [];
        crozzoRefreshPrinterList();
        return global.__CROZZO_SYSTEM_PRINTERS;
      })
      .catch(function () {
        return [];
      });
  }

  function crozzoResolvePrinterName(requested) {
    var name = String(requested || '').trim();
    if (name) return Promise.resolve(name);
    if (!crozzoIsTauri()) return Promise.resolve('');
    return crozzoTauriInvoke('crozzo_get_default_printer', {})
      .then(function (def) {
        return def ? String(def) : '';
      })
      .catch(function () {
        return '';
      });
  }

  /* ---------- ESC/POS ---------- */
  function escPushText(chunks, text) {
    var s = String(text == null ? '' : text);
    var enc = new TextEncoder();
    var bytes = enc.encode(s);
    for (var i = 0; i < bytes.length; i++) chunks.push(bytes[i]);
    chunks.push(0x0a);
  }

  function escInit(chunks) {
    chunks.push(0x1b, 0x40);
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

  function escDivider(chunks) {
    escPushText(chunks, '--------------------------------');
  }

  function escFeed(chunks, lines) {
    chunks.push(0x1b, 0x64, Math.max(1, Math.min(8, lines || 2)));
  }

  function escCut(chunks) {
    chunks.push(0x1d, 0x56, 0x00);
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

  function crozzoBuildEscPosFromPayload(tpl, data) {
    var chunks = [];
    escInit(chunks);
    var blocks = tpl && tpl.blocks ? tpl.blocks.slice().sort(function (a, b) { return (a.o || 0) - (b.o || 0); }) : [];
    var width = tpl && tpl.sz === '58' ? 32 : 42;

    function lineLR(left, right) {
      left = String(left || '');
      right = String(right || '');
      var space = width - left.length - right.length;
      if (space < 1) return left + ' ' + right;
      return left + Array(space + 1).join(' ') + right;
    }

    blocks.forEach(function (b) {
      if (b.v === false) return;
      escAlign(chunks, b.a || 'center');
      escFont(chunks, b.fs || 'sm');
      escBold(chunks, !!b.fw);
      if (Number(b.sp) > 0) escFeed(chunks, Math.min(3, Number(b.sp)));

      switch (b.t) {
        case 'logo':
          escBold(chunks, true);
          escPushText(chunks, b.c || data.nameE || 'CROZZO POS');
          escBold(chunks, false);
          break;
        case 'company':
          escPushText(chunks, data.nameE || '');
          break;
        case 'nit':
          escPushText(chunks, 'NIT ' + (data.nitE || ''));
          break;
        case 'address':
          if (data.dirE) escPushText(chunks, data.dirE);
          break;
        case 'divider':
          escDivider(chunks);
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
          escPushText(chunks, data.cliNom || '');
          escPushText(chunks, 'Doc. ' + (data.cliNit || ''));
          break;
        case 'items':
          escAlign(chunks, 'left');
          escDivider(chunks);
          (data.lines || []).forEach(function (it) {
            var qty = Number(it.q) || 0;
            var nom = String(it.n || 'Item');
            var tot =
              typeof global.crozzoTermicaFmtCOP === 'function'
                ? global.crozzoTermicaFmtCOP(Number(it.p) * qty)
                : '$' + Math.round(Number(it.p) * qty);
            escPushText(chunks, lineLR(qty + 'x ' + nom, tot));
          });
          escDivider(chunks);
          break;
        case 'total':
          escAlign(chunks, 'left');
          escPushText(
            chunks,
            lineLR(
              'Subtotal',
              typeof global.crozzoTermicaFmtCOP === 'function' ? global.crozzoTermicaFmtCOP(data.sub) : '$' + data.sub
            )
          );
          escPushText(
            chunks,
            lineLR(
              'IVA',
              typeof global.crozzoTermicaFmtCOP === 'function' ? global.crozzoTermicaFmtCOP(data.iva) : '$' + data.iva
            )
          );
          escBold(chunks, true);
          escPushText(
            chunks,
            lineLR(
              b.c || 'TOTAL',
              typeof global.crozzoTermicaFmtCOP === 'function' ? global.crozzoTermicaFmtCOP(data.tot) : '$' + data.tot
            )
          );
          escBold(chunks, false);
          break;
        case 'payment':
          if (data.pago) escPushText(chunks, 'Pago: ' + data.pago);
          if (data.propina > 0) escPushText(chunks, 'Propina: $' + Number(data.propina).toLocaleString('es-CO'));
          if (data.recibido > 0) escPushText(chunks, 'Recibido: $' + Number(data.recibido).toLocaleString('es-CO'));
          if (data.cambio > 0) escPushText(chunks, 'Cambio: $' + Number(data.cambio).toLocaleString('es-CO'));
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
          break;
        case 'space':
          escFeed(chunks, Math.max(1, Number(b.c) || 1));
          break;
        default:
          if (b.c) escPushText(chunks, b.c);
      }
    });

    escFeed(chunks, 3);
    escCut(chunks);
    return escChunksToUint8(chunks);
  }

  function crozzoBuildEscPosFromFactura(factura) {
    if (!factura) return new Uint8Array(0);
    var conf = getAdminConfig();
    var tpl =
      typeof global.crozzoTermicaNormalizePlantilla === 'function'
        ? global.crozzoTermicaNormalizePlantilla(conf.termicaPlantilla)
        : null;
    var payload =
      typeof global.crozzoTermicaPayloadFromFactura === 'function'
        ? global.crozzoTermicaPayloadFromFactura(factura)
        : null;
    if (conf.termicaModo === 'personalizada' && tpl && payload) {
      return crozzoBuildEscPosFromPayload(tpl, payload);
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
      escDivider(chunks);
      escBold(chunks, true);
      escPushText(chunks, payload.head);
      escBold(chunks, false);
      escPushText(chunks, 'No. ' + payload.consecutivo);
      escPushText(chunks, payload.fecha);
      escAlign(chunks, 'left');
      escPushText(chunks, 'Cliente: ' + payload.cliNom);
      escPushText(chunks, 'Doc. ' + payload.cliNit);
      escDivider(chunks);
      (payload.lines || []).forEach(function (it) {
        escPushText(chunks, (it.q || 0) + 'x ' + (it.n || '') + '  $' + (Number(it.p) * Number(it.q)).toLocaleString('es-CO'));
      });
      escDivider(chunks);
      escPushText(chunks, 'Subt: $' + Number(payload.sub).toLocaleString('es-CO'));
      escPushText(chunks, 'IVA:  $' + Number(payload.iva).toLocaleString('es-CO'));
      escBold(chunks, true);
      escPushText(chunks, 'TOTAL: $' + Number(payload.tot).toLocaleString('es-CO'));
      escBold(chunks, false);
      if (payload.pago) escPushText(chunks, 'Pago: ' + payload.pago);
      if (payload.cufe) {
        escPushText(chunks, 'CUFE:');
        escPushText(chunks, payload.cufe);
      }
      if (payload.qrUrl) escQr(chunks, payload.qrUrl);
      escPushText(chunks, 'Gracias por su compra');
    }
    escFeed(chunks, 3);
    escCut(chunks);
    return escChunksToUint8(chunks);
  }

  function crozzoBuildEscPosFromComanda(comanda) {
    var chunks = [];
    escInit(chunks);
    escAlign(chunks, 'center');
    escBold(chunks, true);
    var emp = global.config && global.config.getEmpresa ? global.config.getEmpresa() || {} : {};
    escPushText(chunks, comanda.areaNombre || 'COMANDA');
    escBold(chunks, false);
    escPushText(chunks, emp.nombreComercial || emp.razonSocial || 'Crozzo POS');
    escDivider(chunks);
    escAlign(chunks, 'left');
    escPushText(chunks, 'COMANDA #' + (comanda.id || ''));
    var ref =
      comanda.tipoServicio === 'mesa'
        ? 'Mesa ' + (comanda.referencia || '')
        : comanda.tipoServicio === 'llevar'
          ? 'Para llevar ' + (comanda.referencia || '')
          : String(comanda.referencia || '');
    escPushText(chunks, ref);
    escPushText(chunks, new Date(comanda.lastUpdateAt || comanda.createdAt || Date.now()).toLocaleString('es-CO'));
    escDivider(chunks);
    (comanda.items || []).forEach(function (it) {
      var nom = it.nombreVenta || it.nombre || 'Item';
      var qty = Number(it.cantidad) || 0;
      var det = it.detalleConfig ? ' (' + it.detalleConfig + ')' : '';
      escBold(chunks, true);
      escPushText(chunks, qty + 'x ' + nom + det);
      escBold(chunks, false);
    });
    escFeed(chunks, 2);
    escCut(chunks);
    return escChunksToUint8(chunks);
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

  function crozzoPrintRawEscPos(printerName, bytes, copies, kind) {
    if (!bytes || !bytes.length) return Promise.resolve(false);
    if (!crozzoIsTauri()) return Promise.resolve(false);
    return crozzoResolvePrinterName(printerName)
      .then(function (resolved) {
        return crozzoTauriInvoke('crozzo_print_raw', {
          printer_name: resolved,
          data: Array.from(bytes),
          copies: Math.max(1, Math.min(5, Number(copies) || 1)),
        });
      })
      .then(function (res) {
        if (res && res.ok && global.config && global.config.addAudit) {
          global.config.addAudit('impresion_tauri', (kind || 'ticket') + ' · ' + (res.message || 'ok'));
        }
        return !!(res && res.ok);
      })
      .catch(function (err) {
        if (typeof global.showToast === 'function') {
          global.showToast('Impresión: ' + String(err || 'error'), 'error');
        }
        return false;
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

  function crozzoPrintThermalHtmlFallback(innerHtml, pageW, copies) {
    var html = buildThermalPrintDocument(innerHtml, pageW || '80mm');
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

    return crozzoPrintThermalHtmlFallback(innerHtml, pageW, options.copies || 1);
  }

  function crozzoPrintFacturaInternal(factura, options) {
    options = options || {};
    if (!factura) return Promise.resolve(false);
    var copies = options.copies != null ? options.copies : getCopies();
    var printer = options.printer || getCajaPrinter();
    var pageW =
      typeof global.crozzoFacturaThermalPageMm === 'function' ? global.crozzoFacturaThermalPageMm(factura) : '80mm';
    var inner =
      typeof global.crozzoFacturaBuildThermalHtml === 'function' ? global.crozzoFacturaBuildThermalHtml(factura) : '';
    var escpos = crozzoBuildEscPosFromFactura(factura);

    if (crozzoIsTauri() && escpos.length) {
      return crozzoPrintRawEscPos(printer, escpos, copies, 'factura').then(function (ok) {
        if (!ok) {
          return crozzoPrintThermalHtmlFallback(inner, pageW, copies);
        }
        return ok;
      });
    }
    return crozzoPrintThermalHtmlFallback(inner, pageW, copies).then(function (ok) {
      if (!ok && typeof global.showToast === 'function') {
        global.showToast('No se pudo imprimir. Revise la impresora predeterminada.', 'warning');
      }
      return ok;
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
    var printer = String(comanda.impresora || options.printer || getComandaPrinter()).trim();
    var escpos = crozzoBuildEscPosFromComanda(comanda);
    if (crozzoIsTauri() && escpos.length) {
      return crozzoPrintRawEscPos(printer, escpos, 1, 'comanda_' + comanda.id);
    }
    return crozzoPrintThermalHtmlFallback(crozzoBuildComandaThermalHtml(comanda), '80mm', 1);
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
      fecha: new Date().toLocaleString('es-CO'),
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
    return crozzoPrintFactura(sample, { copies: 1, printer: getCajaPrinter() }).then(function (ok) {
      if (ok && typeof global.showToast === 'function') {
        global.showToast(
          crozzoIsTauri() ? 'Ticket de prueba enviado a la impresora (Tauri).' : 'Ticket de prueba enviado.',
          'success'
        );
      }
      return ok;
    });
  }

  function crozzoFacturaPrintThermal(factura) {
    return crozzoPrintFactura(factura, { copies: getCopies(), printer: getCajaPrinter(), silent: false });
  }

  function crozzoPrintEscPosTemplate(tpl, data, options) {
    options = options || {};
    var bytes = crozzoBuildEscPosFromPayload(tpl, data);
    var printer = options.printer || getCajaPrinter();
    if (crozzoIsTauri() && bytes.length) {
      return crozzoPrintRawEscPos(printer, bytes, options.copies || 1, 'designer_test');
    }
    var inner =
      typeof global.crozzoTermicaRenderPlantillaHtml === 'function'
        ? global.crozzoTermicaRenderPlantillaHtml(tpl, data)
        : '';
    var pageW = tpl && tpl.sz === '58' ? '58mm' : '80mm';
    return crozzoPrintThermalHtmlFallback(inner, pageW, options.copies || 1);
  }

  global.crozzoGetPrintBackend = crozzoGetPrintBackend;
  global.crozzoPrintEscPosTemplate = crozzoPrintEscPosTemplate;
  global.crozzoIsTauriPrint = crozzoIsTauri;
  global.crozzoGetAvailablePrinters = crozzoGetAvailablePrinters;
  global.crozzoRefreshPrinterList = crozzoRefreshPrinterList;
  global.crozzoLoadSystemPrintersAsync = crozzoLoadSystemPrintersAsync;
  global.crozzoPrintThermalContent = crozzoPrintThermalContent;
  global.crozzoPrintFactura = crozzoPrintFactura;
  global.crozzoAutoPrintFacturaIfConfigured = crozzoAutoPrintFacturaIfConfigured;
  global.crozzoPrintComanda = crozzoPrintComanda;
  global.crozzoBuildComandaThermalHtml = crozzoBuildComandaThermalHtml;
  global.crozzoBuildEscPosFromFactura = crozzoBuildEscPosFromFactura;
  global.crozzoBuildEscPosFromPayload = crozzoBuildEscPosFromPayload;
  global.crozzoPrintTestTicket = crozzoPrintTestTicket;
  global.crozzoFacturaPrintThermal = crozzoFacturaPrintThermal;
  global.crozzoGetPrintQueueStatus = crozzoGetPrintQueueStatus;
  global.crozzoPrintEnqueue = crozzoPrintEnqueue;

  if (!Array.isArray(global.AVAILABLE_PRINTERS) || !global.AVAILABLE_PRINTERS.length) {
    global.AVAILABLE_PRINTERS = DEFAULT_PRINTERS.slice();
  }
  crozzoRefreshPrinterList();
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      void crozzoLoadSystemPrintersAsync();
    });
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      void crozzoLoadSystemPrintersAsync();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
