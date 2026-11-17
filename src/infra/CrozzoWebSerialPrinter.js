/**
 * CrozzoWebSerialPrinter — Comunicación serial con impresoras (Web Serial API).
 *
 * Usado como fallback para navegadores. En Tauri desktop, el spooler nativo
 * (crozzo_print.rs) es la ruta principal.
 *
 * Soporta: ESC/POS sobre puertos COM (USB-serial, Bluetooth SPP, RS-232).
 */
(function (global) {
  'use strict';

  function serialCapable() {
    try { return !!(global.navigator && global.navigator.serial && typeof global.navigator.serial.requestPort === 'function'); }
    catch (_) { return false; }
  }

  function isSecureContext() {
    try { return !!global.isSecureContext; } catch (_) { return false; }
  }

  // ── Listar puertos ya autorizados ────────────────────────────────
  async function listGrantedPorts() {
    if (!serialCapable()) return [];
    var out = [];
    try {
      var ports = await global.navigator.serial.getPorts();
      for (var i = 0; i < ports.length; i++) {
        var p = ports[i];
        var info = (typeof p.getInfo === 'function') ? p.getInfo() : {};
        out.push({
          port: p,
          usbVendorId: info.usbVendorId || null,
          usbProductId: info.usbProductId || null,
          info: info,
        });
      }
    } catch (e) { console.warn('[webserial] getPorts', e); }
    return out;
  }

  // ── Solicitar puerto (requiere gesto de usuario) ─────────────────
  async function requestPort(filters) {
    if (!serialCapable()) throw new Error('Web Serial no soportado');
    if (!isSecureContext()) throw new Error('Web Serial requiere contexto seguro (HTTPS/localhost)');
    var opts = filters ? { filters: filters } : undefined;
    var port = await global.navigator.serial.requestPort(opts);
    return port;
  }

  // ── Abrir puerto ─────────────────────────────────────────────────
  async function openPort(port, baudRate) {
    await port.open({
      baudRate: baudRate || 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: 'none',
    });
    return port;
  }

  // ── Escribir bytes ───────────────────────────────────────────────
  async function writeBytes(port, data) {
    var bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    var writer = port.writable.getWriter();
    try { await writer.write(bytes); }
    finally { writer.releaseLock(); }
  }

  // ── Leer bytes (con timeout) ─────────────────────────────────────
  async function readBytes(port, timeoutMs) {
    if (!port.readable) return new Uint8Array(0);
    var reader = port.readable.getReader();
    var chunks = [];
    var start = Date.now();
    var timeout = timeoutMs || 1000;
    try {
      while (Date.now() - start < timeout) {
        var result = await Promise.race([
          reader.read(),
          new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, timeout); })
        ]);
        if (result.done) break;
        if (result.value) chunks.push(result.value);
      }
    } catch (_) { /* timeout o cerrado */ }
    finally { reader.releaseLock(); }
    var total = 0;
    chunks.forEach(function (c) { total += c.byteLength; });
    var out = new Uint8Array(total);
    var off = 0;
    chunks.forEach(function (c) { out.set(c, off); off += c.byteLength; });
    return out;
  }

  // ── Cerrar puerto ────────────────────────────────────────────────
  async function closePort(port) {
    try { await port.close(); } catch (_) {}
  }

  // ── Flujo completo: conectar + imprimir ─────────────────────────
  async function connectAndPrint(escPosBytes, baudRate) {
    var port = await requestPort();
    await openPort(port, baudRate || 9600);
    await writeBytes(port, escPosBytes);
    return port;
  }

  // ── Auto-reconexión ──────────────────────────────────────────────
  async function autoReconnect(baudRate) {
    var ports = await listGrantedPorts();
    var opened = [];
    for (var i = 0; i < ports.length; i++) {
      try {
        await openPort(ports[i].port, baudRate || 9600);
        opened.push(ports[i].port);
      } catch (e) { console.warn('[webserial] open failed', e); }
    }
    return opened;
  }

  // ── Eventos hot-plug ─────────────────────────────────────────────
  function onConnect(cb) { if (serialCapable()) global.navigator.serial.addEventListener('connect', function (e) { cb(e.target || e.port); }); }
  function onDisconnect(cb) { if (serialCapable()) global.navigator.serial.addEventListener('disconnect', function (e) { cb(e.target || e.port); }); }

  // ── Identificar puerto por USB ID ────────────────────────────────
  function identifyPort(portInfo) {
    if (!portInfo || !portInfo.usbVendorId) return null;
    var vid = portInfo.usbVendorId;
    var PRINTER_DB = (global.CrozzoDeploymentCenter && global.CrozzoDeploymentCenter.PRINTER_DB) || [];
    for (var i = 0; i < PRINTER_DB.length; i++) {
      if (PRINTER_DB[i].ids.indexOf(vid) >= 0) return PRINTER_DB[i];
    }
    return null;
  }

  global.CrozzoWebSerialPrinter = {
    capable: serialCapable,
    secureContext: isSecureContext,
    listGranted: listGrantedPorts,
    request: requestPort,
    open: openPort,
    write: writeBytes,
    read: readBytes,
    close: closePort,
    connectAndPrint: connectAndPrint,
    autoReconnect: autoReconnect,
    onConnect: onConnect,
    onDisconnect: onDisconnect,
    identify: identifyPort,
  };
})(typeof window !== 'undefined' ? window : globalThis);
