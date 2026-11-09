/**
 * Crozzo POS — Diagnóstico de campo completo.
 *
 * Recolecta TODO lo que está pasando en el dispositivo en tiempo real:
 * identificación, conexión, dispositivos descubiertos, impresoras, comandas,
 * inventario, configuración, errores, logs y diagnóstico automático.
 *
 * Este es el "muestreo del campo" que permite entender exactamente qué
 * está pasando en un dispositivo físico sin estar ahí.
 */
(function (global) {
  'use strict';

  function safe(fn, fallback) {
    try { return fn(); } catch (_) { return (fallback !== undefined ? fallback : null); }
  }

  function now() { return new Date().toISOString(); }

  // ── 1. Identificación del dispositivo ──
  function getIdentification() {
    var md = safe(() => global.getMultiDeviceConfig ? global.getMultiDeviceConfig() : {}, {});
    return {
      deviceId: md.deviceId || '',
      role: md.role || '',
      roleLabel: md.role === 'A' ? 'Caja (Rol A)' : md.role === 'B' ? 'Mesero (Rol B)' : (md.role || 'Desconocido'),
      centralIp: md.centralIp || '',
      port: md.port || '',
      locationId: md.locationId || '',
      businessId: md.businessId || '',
      platform: (typeof navigator !== 'undefined' ? navigator.platform : 'unknown'),
      userAgent: (typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'),
      language: (typeof navigator !== 'undefined' ? navigator.language : 'unknown'),
      onLine: (typeof navigator !== 'undefined' ? navigator.onLine : 'unknown'),
      screen: (typeof screen !== 'undefined' ? screen.width + 'x' + screen.height : 'unknown'),
      appVersion: (global.CROZZO_APP_VERSION || global.CROZZO_APP_VERSION_DISPONIBLE || 'unknown'),
      timestamp: now(),
    };
  }

  // ── 2. Estado de conexión ──
  function getConnectionState() {
    var md = safe(() => global.getMultiDeviceConfig ? global.getMultiDeviceConfig() : {}, {});
    return {
      tier: global.__CROZZO_TIER_LAST || 'unknown',
      channel: global.__CROZZO_ACTIVE_CHANNEL || 'unknown',
      lanToken: md.lanToken ? 'configurado (' + md.lanToken.slice(0, 8) + '...)' : 'NO configurado',
      lanTransportAllowed: (typeof global.crozzoLanTransportAllowed === 'function') ? global.crozzoLanTransportAllowed() : 'N/A',
      wsOpen: (typeof global.CrozzoLanWebSocketBridge !== 'undefined' && typeof global.CrozzoLanWebSocketBridge.isOpen === 'function') ? global.CrozzoLanWebSocketBridge.isOpen() : 'N/A',
      cloudReachable: safe(() => global.__CROZZO_CLOUD_REACHABLE, 'N/A'),
      hotspotActive: safe(() => global.__CROZZO_HOTSPOT, null),
      hotspotSSID: safe(() => global.__CROZZO_HOTSPOT_SSID, ''),
      hotspotPass: safe(() => global.__CROZZO_HOTSPOT_PASSPHRASE, ''),
      tlsAvailable: safe(() => global.crozzoLanTlsAvailable ? global.crozzoLanTlsAvailable() : 'N/A', 'N/A'),
      pairedFingerprint: safe(() => global.crozzoTlsGetPairedFingerprint ? global.crozzoTlsGetPairedFingerprint() : '', ''),
      certTrusted: safe(() => localStorage.getItem('crozzo_cert_trusted'), 'no'),
    };
  }

  // ── 3. Dispositivos descubiertos ──
  function getDiscoveredDevices() {
    var devices = [];
    // mDNS discovered
    try {
      if (typeof global.crozzoMdnsDrainDiscovered === 'function') {
        var mdns = global.crozzoMdnsDrainDiscovered();
        if (Array.isArray(mdns)) devices = devices.concat(mdns.map(d => ({ source: 'mDNS', ...d })));
      }
    } catch (_) {}
    // Cloud discovered
    try {
      if (global.CrozzoCloudDiscovery && typeof global.CrozzoCloudDiscovery.pullDevices === 'function') {
        // async, skip for sync report
      }
    } catch (_) {}
    // Peer directory
    try {
      if (global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.getPeers === 'function') {
        var peers = global.CrozzoPeerDirectory.getPeers();
        if (Array.isArray(peers)) devices = devices.concat(peers.map(p => ({ source: 'peer', ...p })));
      }
    } catch (_) {}
    // BLE mesh peers
    try {
      if (global.CrozzoBlePeerRegistry && typeof global.CrozzoBlePeerRegistry.getPeers === 'function') {
        var ble = global.CrozzoBlePeerRegistry.getPeers();
        if (Array.isArray(ble)) devices = devices.concat(ble.map(p => ({ source: 'BLE', ...p })));
      }
    } catch (_) {}
    return devices;
  }

  // ── 4. Impresoras ──
  function getPrinters() {
    var printers = [];
    try {
      if (typeof global.crozzoListPrinters === 'function') {
        printers = global.crozzoListPrinters() || [];
      }
    } catch (_) {}
    try {
      if (typeof global.crozzoGetDefaultPrinter === 'function') {
        var def = global.crozzoGetDefaultPrinter();
        if (def) printers = printers.map(p => ({ ...p, isDefault: p.name === def.name || p.id === def.id }));
      }
    } catch (_) {}
    return printers;
  }

  // ── 5. Comandas ──
  function getComandasState() {
    var comandas = safe(() => global.comandas || [], []);
    var history = safe(() => global.comandaHistory || [], []);
    return {
      activeCount: comandas.length,
      historyCount: history.length,
      active: comandas.map(c => ({
        id: c.id,
        tid: c.transaction_id,
        estado: c.estado,
        mesa: c.mesa,
        items: (c.items || []).length,
        lastUpdate: c.lastUpdateAt,
      })),
      pendingOutbox: safe(() => (typeof global.crozzoComandaOutboxPending === 'function' ? global.crozzoComandaOutboxPending() : 0), 0),
    };
  }

  // ── 6. Inventario (resumen) ──
  function getInventorySummary() {
    var products = safe(() => global.productos || global.products || [], []);
    var lowStock = products.filter(p => (p.stock || 0) <= (p.minStock || 0));
    return {
      totalProducts: products.length,
      lowStockCount: lowStock.length,
      lowStock: lowStock.slice(0, 10).map(p => ({ id: p.id, name: p.name, stock: p.stock, min: p.minStock })),
    };
  }

  // ── 7. Configuración ──
  function getConfigState() {
    var md = safe(() => global.getMultiDeviceConfig ? global.getMultiDeviceConfig() : {}, {});
    return {
      empresa: safe(() => global.empresaNombre || global.EMPRESA_NOMBRE || '', ''),
      nit: safe(() => global.empresaNit || global.EMPRESA_NIT || '', ''),
      impresoraConfigurada: safe(() => (typeof global.crozzoPrinterReady === 'function' ? global.crozzoPrinterReady() : 'N/A'), 'N/A'),
      dbConfigurada: !!md.deviceId,
      supabaseUrl: safe(() => global.__SUPABASE_URL || '', ''),
      supabaseConfigurada: !!safe(() => global.__SUPABASE, null),
    };
  }

  // ── 8. Errores recientes ──
  function getRecentErrors() {
    try {
      var logs = global.CrozzoDeviceReport ? global.CrozzoDeviceReport.getLogs() : [];
      return logs.filter(l => l.type === 'error').slice(-20).map(l => ({
        time: l.t,
        msg: l.msg,
        data: l.data,
      }));
    } catch (_) { return []; }
  }

  // ── 9. Diagnóstico automático ──
  function getAutoDiagnosis() {
    var issues = [];
    var md = safe(() => global.getMultiDeviceConfig ? global.getMultiDeviceConfig() : {}, {});
    var tier = global.__CROZZO_TIER_LAST || 'unknown';
    var channel = global.__CROZZO_ACTIVE_CHANNEL || 'unknown';

    // Conexión
    if (tier === 'offline') issues.push({ severity: 'critical', msg: 'Sin conexión — operando en modo local. Las comandas NO llegan a cocina hasta que se reconecte.' });
    if (tier === 'qr') issues.push({ severity: 'warning', msg: 'Modo QR — sin conexión a la caja. Solo se puede emparejar por QR.' });
    if (channel === 'offline') issues.push({ severity: 'critical', msg: 'Canal offline — no hay comunicación con la caja.' });

    // Emparejamiento
    if (!md.deviceId) issues.push({ severity: 'critical', msg: 'Dispositivo no emparejado — no tiene deviceId. Escanear QR de la caja.' });
    if (!md.lanToken && md.role !== 'A') issues.push({ severity: 'critical', msg: 'Token LAN no configurado — emparejamiento incompleto. Re-emparejar.' });
    if (!md.centralIp && md.role !== 'A') issues.push({ severity: 'warning', msg: 'IP de la caja no configurada — no se puede conectar por LAN. Verificar mDNS o configurar manualmente.' });

    // Impresora
    try {
      if (typeof global.crozzoPrinterReady === 'function' && !global.crozzoPrinterReady()) {
        issues.push({ severity: 'warning', msg: 'Impresora no lista o no configurada. Verificar en Configuración → Impresoras.' });
      }
    } catch (_) {}

    // Outbox
    try {
      var outbox = global.crozzoComandaOutboxPending ? global.crozzoComandaOutboxPending() : 0;
      if (outbox > 0) issues.push({ severity: 'warning', msg: 'Hay ' + outbox + ' comandas pendientes en outbox (sin sincronizar). Verificar conexión.' });
    } catch (_) {}

    // Errores recientes
    var recentErrors = getRecentErrors();
    if (recentErrors.length > 0) {
      issues.push({ severity: 'info', msg: 'Se han registrado ' + recentErrors.length + ' errores recientes. Ver sección de errores.' });
    }

    // Dispositivos descubiertos
    var devices = getDiscoveredDevices();
    if (md.role === 'B' && devices.length === 0 && tier !== 'offline') {
      issues.push({ severity: 'warning', msg: 'No se han descubierto dispositivos en la red. Verificar mDNS o cloud discovery.' });
    }

    // Recomendaciones
    var recommendations = [];
    if (tier === 'offline') recommendations.push('Verificar WiFi, router y conexión a internet.');
    if (!md.deviceId) recommendations.push('Escanear el QR de la caja para emparejar.');
    if (issues.some(i => i.severity === 'critical')) recommendations.push('Resolver los problemas críticos antes de continuar operando.');
    if (recentErrors.length > 3) recommendations.push('Revisar los errores recientes para identificar patrones.');

    return { issues: issues, recommendations: recommendations };
  }

  // ── 10. Reporte completo ──
  function buildFullReport() {
    return {
      meta: {
        reportType: 'field-diagnostic',
        version: '1.0',
        generatedAt: now(),
        appVersion: (global.CROZZO_APP_VERSION || 'unknown'),
      },
      identification: getIdentification(),
      connection: getConnectionState(),
      discoveredDevices: getDiscoveredDevices(),
      printers: getPrinters(),
      comandas: getComandasState(),
      inventory: getInventorySummary(),
      config: getConfigState(),
      recentErrors: getRecentErrors(),
      logs: (global.CrozzoDeviceReport ? global.CrozzoDeviceReport.getLogs() : []),
      diagnosis: getAutoDiagnosis(),
    };
  }

  function buildFullTextReport() {
    var r = buildFullReport();
    var lines = [];
    lines.push('╔══════════════════════════════════════════════════╗');
    lines.push('║  CROZZO POS — REPORTE DE CAMPO (DIAGNÓSTICO)     ║');
    lines.push('╚══════════════════════════════════════════════════╝');
    lines.push('');
    lines.push('📅 Fecha: ' + r.meta.generatedAt);
    lines.push('📱 App: ' + r.meta.appVersion);
    lines.push('');

    // Identificación
    lines.push('═══ 1. IDENTIFICACIÓN DEL DISPOSITIVO ═══');
    lines.push('Device ID: ' + r.identification.deviceId);
    lines.push('Rol: ' + r.identification.roleLabel);
    lines.push('Plataforma: ' + r.identification.platform);
    lines.push('Pantalla: ' + r.identification.screen);
    lines.push('Idioma: ' + r.identification.language);
    lines.push('Online: ' + r.identification.onLine);
    lines.push('User Agent: ' + r.identification.userAgent);
    lines.push('');

    // Conexión
    lines.push('═══ 2. ESTADO DE CONEXIÓN ═══');
    lines.push('Tier: ' + r.connection.tier);
    lines.push('Canal activo: ' + r.connection.channel);
    lines.push('Token LAN: ' + r.connection.lanToken);
    lines.push('Transporte LAN permitido: ' + r.connection.lanTransportAllowed);
    lines.push('WebSocket abierto: ' + r.connection.wsOpen);
    lines.push('Cloud alcanzable: ' + r.connection.cloudReachable);
    lines.push('Hotspot activo: ' + r.connection.hotspotActive);
    lines.push('Hotspot SSID: ' + (r.connection.hotspotSSID || '(ninguno)'));
    lines.push('TLS disponible: ' + r.connection.tlsAvailable);
    lines.push('Fingerprint emparejado: ' + (r.connection.pairedFingerprint || '(ninguno)'));
    lines.push('Cert confiado: ' + r.connection.certTrusted);
    lines.push('');

    // Dispositivos descubiertos
    lines.push('═══ 3. DISPOSITIVOS DESCUBIERTOS (' + r.discoveredDevices.length + ') ═══');
    if (r.discoveredDevices.length === 0) {
      lines.push('(ninguno)');
    } else {
      for (var i = 0; i < r.discoveredDevices.length; i++) {
        var d = r.discoveredDevices[i];
        lines.push('  [' + (d.source || '?') + '] ' + (d.name || d.id || d.ip || '?') + ' - ' + (d.ip || '') + ':' + (d.port || ''));
      }
    }
    lines.push('');

    // Impresoras
    lines.push('═══ 4. IMPRESORAS (' + r.printers.length + ') ═══');
    if (r.printers.length === 0) {
      lines.push('(ninguna detectada)');
    } else {
      for (var i = 0; i < r.printers.length; i++) {
        var p = r.printers[i];
        lines.push('  ' + (p.isDefault ? '★ ' : '  ') + (p.name || p.id || '?') + (p.isDefault ? ' (default)' : ''));
      }
    }
    lines.push('');

    // Comandas
    lines.push('═══ 5. COMANDAS ═══');
    lines.push('Activas: ' + r.comandas.activeCount + ' | Historial: ' + r.comandas.historyCount);
    lines.push('Outbox pendiente: ' + r.comandas.pendingOutbox);
    if (r.comandas.active.length > 0) {
      lines.push('Activas:');
      for (var i = 0; i < r.comandas.active.length; i++) {
        var c = r.comandas.active[i];
        lines.push('  #' + c.id + ' tid=' + (c.tid || '?') + ' estado=' + (c.estado || '?') + ' mesa=' + (c.mesa || '?') + ' items=' + c.items);
      }
    }
    lines.push('');

    // Inventario
    lines.push('═══ 6. INVENTARIO ═══');
    lines.push('Total productos: ' + r.inventory.totalProducts);
    lines.push('Stock bajo: ' + r.inventory.lowStockCount);
    if (r.inventory.lowStock.length > 0) {
      lines.push('Productos con stock bajo:');
      for (var i = 0; i < r.inventory.lowStock.length; i++) {
        var p = r.inventory.lowStock[i];
        lines.push('  ' + (p.name || '?') + ' — stock: ' + p.stock + ' (mín: ' + p.min + ')');
      }
    }
    lines.push('');

    // Configuración
    lines.push('═══ 7. CONFIGURACIÓN ═══');
    lines.push('Empresa: ' + (r.config.empresa || '(no configurada)'));
    lines.push('NIT: ' + (r.config.nit || '(no configurado)'));
    lines.push('Impresora configurada: ' + r.config.impresoraConfigurada);
    lines.push('DB configurada: ' + r.config.dbConfigurada);
    lines.push('Supabase URL: ' + (r.config.supabaseUrl || '(no configurada)'));
    lines.push('Supabase configurado: ' + r.config.supabaseConfigurada);
    lines.push('');

    // Diagnóstico automático
    lines.push('═══ 8. DIAGNÓSTICO AUTOMÁTICO ═══');
    if (r.diagnosis.issues.length === 0) {
      lines.push('✅ Sin problemas detectados');
    } else {
      for (var i = 0; i < r.diagnosis.issues.length; i++) {
        var iss = r.diagnosis.issues[i];
        var icon = iss.severity === 'critical' ? '🔴' : iss.severity === 'warning' ? '🟡' : '🔵';
        lines.push(icon + ' [' + iss.severity.toUpperCase() + '] ' + iss.msg);
      }
    }
    if (r.diagnosis.recommendations.length > 0) {
      lines.push('');
      lines.push('Recomendaciones:');
      for (var i = 0; i < r.diagnosis.recommendations.length; i++) {
        lines.push('  → ' + r.diagnosis.recommendations[i]);
      }
    }
    lines.push('');

    // Errores recientes
    lines.push('═══ 9. ERRORES RECIENTES (' + r.recentErrors.length + ') ═══');
    if (r.recentErrors.length === 0) {
      lines.push('(ninguno)');
    } else {
      for (var i = 0; i < r.recentErrors.length; i++) {
        var e = r.recentErrors[i];
        lines.push('[' + e.time + '] ' + e.msg);
      }
    }
    lines.push('');

    // Log detallado
    lines.push('═══ 10. LOG DETALLADO (' + r.logs.length + ' entries) ═══');
    for (var i = 0; i < r.logs.length; i++) {
      var l = r.logs[i];
      lines.push('[' + l.t + '] [' + l.type.toUpperCase() + '] ' + l.msg + (l.data ? ' | ' + JSON.stringify(l.data) : ''));
    }
    lines.push('');
    lines.push('═══ FIN DEL REPORTE DE CAMPO ═══');

    return lines.join('\n');
  }

  function downloadFullReport() {
    var text = buildFullTextReport();
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'crozzo-field-report-' + Date.now() + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (global.CrozzoDeviceReport) global.CrozzoDeviceReport.log('info', 'Reporte de campo descargado');
  }

  function shareFullReport() {
    var text = buildFullTextReport();
    if (navigator.share) {
      navigator.share({ title: 'Crozzo POS — Reporte de campo', text: text }).then(function() {
        if (global.CrozzoDeviceReport) global.CrozzoDeviceReport.log('info', 'Reporte de campo compartido');
      }).catch(function() {
        copyToClipboard(text);
      });
    } else {
      copyToClipboard(text);
    }
  }

  function copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
          showToast('Reporte copiado al portapapeles');
        });
      } else {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('Reporte copiado al portapapeles');
      }
    } catch (e) {
      if (global.CrozzoDeviceReport) global.CrozzoDeviceReport.log('error', 'No se pudo copiar: ' + String(e));
    }
  }

  function showToast(msg) {
    try {
      if (typeof global.showToast === 'function') { global.showToast(msg, 'info'); return; }
    } catch (_) {}
    try {
      var t = document.createElement('div');
      t.textContent = msg;
      t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 20px;border-radius:8px;z-index:99999;font-size:14px;';
      document.body.appendChild(t);
      setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 3000);
    } catch (_) {}
  }

  // Exponer API
  global.CrozzoFieldDiagnostic = {
    getIdentification: getIdentification,
    getConnectionState: getConnectionState,
    getDiscoveredDevices: getDiscoveredDevices,
    getPrinters: getPrinters,
    getComandasState: getComandasState,
    getInventorySummary: getInventorySummary,
    getConfigState: getConfigState,
    getRecentErrors: getRecentErrors,
    getAutoDiagnosis: getAutoDiagnosis,
    buildFullReport: buildFullReport,
    buildFullTextReport: buildFullTextReport,
    downloadFullReport: downloadFullReport,
    shareFullReport: shareFullReport,
  };
  global.crozzoFieldDiagnostic = buildFullReport;
  global.crozzoFieldReportDownload = downloadFullReport;
  global.crozzoFieldReportShare = shareFullReport;

  // Integrar con el botón flotante existente
  try {
    if (global.CrozzoDeviceReport) {
      // Reemplazar downloadReport y shareReport con las versiones completas
      global.CrozzoDeviceReport.downloadReport = downloadFullReport;
      global.CrozzoDeviceReport.shareReport = shareFullReport;
      global.CrozzoDeviceReport.buildTextReport = buildFullTextReport;
    }
  } catch (_) {}

})(window);
