/**
 * Crozzo POS — Reporte de diagnóstico del dispositivo.
 *
 * Captura en tiempo real todo lo que el dispositivo recibe y ejecuta:
 * conexiones, sync, comandas, errores, tier changes, etc.
 * Permite descargar o compartir por WhatsApp un reporte JSON/texto
 * para comparar con el PC (F12) y diagnosticar problemas en campo.
 */
(function (global) {
  'use strict';

  var MAX_LOGS = 500;
  var __logs = [];
  var __startTime = Date.now();
  var __panelEl = null;
  var __panelVisible = false;

  function now() { return new Date().toISOString(); }
  function elapsed() { return Date.now() - __startTime; }

  function log(type, msg, data) {
    var entry = {
      t: now(),
      ms: elapsed(),
      type: String(type || 'info'),
      msg: String(msg || ''),
      data: data || null,
    };
    __logs.push(entry);
    if (__logs.length > MAX_LOGS) __logs.shift();
    // Emitir evento para el panel
    try { global.dispatchEvent(new CustomEvent('crozzo-device-log', { detail: entry })); } catch (_) {}
    // También a console
    try { console.log('[CROZZO-REPORT]', type, msg, data || ''); } catch (_) {}
    return entry;
  }

  function getLogs() { return __logs.slice(); }
  function clearLogs() { __logs = []; __startTime = Date.now(); }

  function getDiagnostics() {
    var md = (typeof global.getMultiDeviceConfig === 'function') ? (global.getMultiDeviceConfig() || {}) : {};
    var issues = [];
    var info = {};

    // Configuración de dispositivo
    info.deviceId = md.deviceId || '';
    info.role = md.role || '';
    info.centralIp = md.centralIp || '';
    info.port = md.port || '';
    info.lanToken = md.lanToken ? 'configurado' : 'no configurado';

    // Base de datos / conexión
    info.tier = global.__CROZZO_TIER_LAST || 'unknown';
    info.channel = global.__CROZZO_ACTIVE_CHANNEL || 'unknown';
    info.isOnline = (typeof navigator !== 'undefined') ? navigator.onLine : 'unknown';

    // Verificar configuración
    if (!md.deviceId) issues.push('deviceId no configurado — el dispositivo no se ha emparejado');
    if (!md.centralIp && md.role !== 'A') issues.push('IP de la caja no configurada — no se puede conectar por LAN');
    if (!md.lanToken) issues.push('Token LAN no configurado — emparejamiento incompleto');
    if (info.tier === 'offline') issues.push('Sin conexión — operando en modo local');
    if (info.tier === 'qr') issues.push('Modo QR — sin conexión a la caja, solo QR disponible');

    // Outbox
    try {
      var outbox = global.crozzoComandaOutboxPending ? global.crozzoComandaOutboxPending() : 0;
      info.outboxPending = outbox;
      if (outbox > 0) issues.push('Hay ' + outbox + ' comandas pendientes en outbox (sin sincronizar)');
    } catch (_) { info.outboxPending = 'N/A'; }

    // Impresora
    try {
      if (typeof global.crozzoPrinterReady === 'function') {
        info.printerReady = global.crozzoPrinterReady();
        if (!info.printerReady) issues.push('Impresora no lista o no configurada');
      } else {
        info.printerReady = 'no verificado';
      }
    } catch (_) { info.printerReady = 'error'; }

    // Errores recientes
    var recentErrors = __logs.filter(l => l.type === 'error').slice(-5);
    info.recentErrors = recentErrors.map(l => l.msg);

    // Conexiones recientes
    var recentConns = __logs.filter(l => l.type === 'connection').slice(-5);
    info.recentConnections = recentConns.map(l => l.msg);

    return { info: info, issues: issues };
  }

  function getSummary() {
    var errors = __logs.filter(l => l.type === 'error');
    var warnings = __logs.filter(l => l.type === 'warn');
    var comandas = __logs.filter(l => l.type === 'comanda');
    var syncs = __logs.filter(l => l.type === 'sync');
    var connections = __logs.filter(l => l.type === 'connection');
    var diag = getDiagnostics();
    return {
      startTime: new Date(__startTime).toISOString(),
      durationMs: elapsed(),
      totalLogs: __logs.length,
      errors: errors.length,
      warnings: warnings.length,
      comandasReceived: comandas.length,
      syncs: syncs.length,
      connections: connections.length,
      tier: (global.__CROZZO_TIER_LAST || 'unknown'),
      channel: (global.__CROZZO_ACTIVE_CHANNEL || 'unknown'),
      deviceId: (typeof global.getMultiDeviceConfig === 'function' ? (global.getMultiDeviceConfig().deviceId || '') : ''),
      role: (typeof global.getMultiDeviceConfig === 'function' ? (global.getMultiDeviceConfig().role || '') : ''),
      diagnostics: diag,
    };
  }

  function buildReport() {
    var summary = getSummary();
    var report = {
      summary: summary,
      logs: __logs,
      exportedAt: now(),
      userAgent: (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
      url: (typeof location !== 'undefined' ? location.href : ''),
    };
    return report;
  }

  function buildTextReport() {
    var s = getSummary();
    var diag = s.diagnostics;
    var lines = [];
    lines.push('=== CROZZO POS — REPORTE DE DISPOSITIVO ===');
    lines.push('Fecha: ' + s.startTime);
    lines.push('Duración: ' + Math.round(s.durationMs / 1000) + 's');
    lines.push('Dispositivo: ' + s.deviceId + ' (Rol ' + s.role + ')');
    lines.push('Tier: ' + s.tier + ' | Canal: ' + s.channel);
    lines.push('Online: ' + diag.info.isOnline);
    lines.push('Logs: ' + s.totalLogs + ' | Errores: ' + s.errors + ' | Warnings: ' + s.warnings);
    lines.push('Comandas recibidas: ' + s.comandasReceived + ' | Syncs: ' + s.syncs + ' | Conexiones: ' + s.connections);
    lines.push('');
    lines.push('--- DIAGNÓSTICO DE CONFIGURACIÓN ---');
    lines.push('Device ID: ' + (diag.info.deviceId || '(vacío)'));
    lines.push('Rol: ' + (diag.info.role || '(vacío)'));
    lines.push('IP caja: ' + (diag.info.centralIp || '(vacío)'));
    lines.push('Puerto: ' + (diag.info.port || '(vacío)'));
    lines.push('Token LAN: ' + (diag.info.lanToken || '(vacío)'));
    lines.push('Impresora: ' + (diag.info.printerReady || 'no verificado'));
    lines.push('Outbox pendiente: ' + (diag.info.outboxPending || 0));
    lines.push('');
    if (diag.issues.length > 0) {
      lines.push('--- PROBLEMAS DETECTADOS ---');
      for (var i = 0; i < diag.issues.length; i++) {
        lines.push('⚠️ ' + diag.issues[i]);
      }
      lines.push('');
    } else {
      lines.push('--- SIN PROBLEMAS DETECTADOS ---');
      lines.push('✅ Configuración OK');
      lines.push('');
    }
    if (diag.info.recentErrors && diag.info.recentErrors.length > 0) {
      lines.push('--- ERRORES RECIENTES ---');
      for (var i = 0; i < diag.info.recentErrors.length; i++) {
        lines.push('❌ ' + diag.info.recentErrors[i]);
      }
      lines.push('');
    }
    lines.push('--- LOG DETALLADO ---');
    for (var i = 0; i < __logs.length; i++) {
      var l = __logs[i];
      lines.push('[' + l.t + '] [' + l.type.toUpperCase() + '] ' + l.msg + (l.data ? ' | ' + JSON.stringify(l.data) : ''));
    }
    lines.push('');
    lines.push('=== FIN DEL REPORTE ===');
    return lines.join('\n');
  }

  function downloadReport() {
    var text = buildTextReport();
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'crozzo-report-' + Date.now() + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    log('info', 'Reporte descargado');
  }

  function shareReport() {
    var text = buildTextReport();
    if (navigator.share) {
      navigator.share({ title: 'Crozzo POS — Reporte de dispositivo', text: text }).then(function() {
        log('info', 'Reporte compartido por Web Share');
      }).catch(function(e) {
        log('warn', 'Web Share cancelado o no disponible: ' + String(e));
        // Fallback: copiar al portapapeles
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
          log('info', 'Reporte copiado al portapapeles');
          showToast('Reporte copiado al portapapeles');
        });
      } else {
        // Fallback textarea
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        log('info', 'Reporte copiado al portapapeles (fallback)');
        showToast('Reporte copiado al portapapeles');
      }
    } catch (e) {
      log('error', 'No se pudo copiar: ' + String(e));
    }
  }

  function showToast(msg) {
    try {
      if (typeof global.showToast === 'function') {
        global.showToast(msg, 'info');
        return;
      }
    } catch (_) {}
    try {
      var t = document.createElement('div');
      t.textContent = msg;
      t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 20px;border-radius:8px;z-index:99999;font-size:14px;';
      document.body.appendChild(t);
      setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 3000);
    } catch (_) {}
  }

  function createPanel() {
    if (__panelEl) return __panelEl;
    var el = document.createElement('div');
    el.id = 'crozzoDeviceReportPanel';
    el.style.cssText = 'position:fixed;bottom:0;left:0;right:0;max-height:40vh;overflow-y:auto;background:rgba(0,0,0,.9);color:#0f0;font-family:monospace;font-size:11px;padding:8px;z-index:99998;display:none;border-top:2px solid #0f0;';
    var header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
    header.innerHTML = '<span style="font-weight:bold;">📋 Reporte de dispositivo</span><span style="cursor:pointer;" id="crozzoReportClose">✕</span>';
    el.appendChild(header);
    var content = document.createElement('div');
    content.id = 'crozzoReportContent';
    content.style.cssText = 'white-space:pre-wrap;word-break:break-all;';
    el.appendChild(content);
    document.body.appendChild(el);
    __panelEl = el;

    // Close button
    var closeBtn = el.querySelector('#crozzoReportClose');
    if (closeBtn) closeBtn.addEventListener('click', togglePanel);

    // Listen for logs
    global.addEventListener('crozzo-device-log', function(e) {
      if (!__panelVisible) return;
      var c = el.querySelector('#crozzoReportContent');
      if (c) {
        var line = '[' + new Date(e.detail.t).toLocaleTimeString() + '] [' + e.detail.type.toUpperCase() + '] ' + e.detail.msg;
        c.textContent = (c.textContent + '\n' + line).slice(-5000);
        c.scrollTop = c.scrollHeight;
      }
    });

    return el;
  }

  function togglePanel() {
    var el = createPanel();
    __panelVisible = !__panelVisible;
    el.style.display = __panelVisible ? 'block' : 'none';
    if (__panelVisible) {
      var c = el.querySelector('#crozzoReportContent');
      if (c) {
        c.textContent = __logs.map(l => '[' + new Date(l.t).toLocaleTimeString() + '] [' + l.type.toUpperCase() + '] ' + l.msg).join('\n');
        c.scrollTop = c.scrollHeight;
      }
    }
  }

  function createFloatingButton() {
    var btn = document.createElement('button');
    btn.id = 'crozzoReportBtn';
    btn.textContent = '📋';
    btn.style.cssText = 'position:fixed;bottom:10px;right:10px;z-index:99999;width:40px;height:40px;border-radius:50%;background:#333;color:#fff;border:none;font-size:20px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3);';
    btn.addEventListener('click', function() {
      // Show menu
      var menu = document.createElement('div');
      menu.style.cssText = 'position:fixed;bottom:60px;right:10px;background:#fff;border:1px solid #ccc;border-radius:8px;padding:8px;z-index:100000;box-shadow:0 4px 12px rgba(0,0,0,.2);';
      menu.innerHTML = '<div style="padding:8px;cursor:pointer;border-bottom:1px solid #eee;" id="crShowPanel">📋 Ver log en vivo</div><div style="padding:8px;cursor:pointer;border-bottom:1px solid #eee;" id="crDownload">💾 Descargar reporte</div><div style="padding:8px;cursor:pointer;" id="crShare">📤 Compartir por WhatsApp</div>';
      document.body.appendChild(menu);
      menu.querySelector('#crShowPanel').addEventListener('click', function() { togglePanel(); menu.remove(); });
      menu.querySelector('#crDownload').addEventListener('click', function() { downloadReport(); menu.remove(); });
      menu.querySelector('#crShare').addEventListener('click', function() { shareReport(); menu.remove(); });
      // Auto-close
      setTimeout(function() { if (menu.parentNode) menu.parentNode.removeChild(menu); }, 5000);
    });
    document.body.appendChild(btn);

    // Also inject a button in the config/wizard area if it exists
    try {
      var toolbar = document.querySelector('.crozzo-toolbar, .app-toolbar, #toolbar, .toolbar');
      if (toolbar && !document.getElementById('crozzoReportToolbarBtn')) {
        var tb = document.createElement('button');
        tb.id = 'crozzoReportToolbarBtn';
        tb.textContent = '📋 Reporte';
        tb.style.cssText = 'margin-left:8px;padding:4px 10px;border-radius:6px;background:#333;color:#fff;border:none;font-size:12px;cursor:pointer;';
        tb.addEventListener('click', function() { togglePanel(); });
        toolbar.appendChild(tb);
      }
    } catch (_) {}

    // Inject into config section if it exists
    try {
      var configSection = document.querySelector('[data-group="configuracion"], #configuracion, .config-section');
      if (configSection && !document.getElementById('crozzoReportConfigBtn')) {
        var cb = document.createElement('button');
        cb.id = 'crozzoReportConfigBtn';
        cb.textContent = '📋 Reporte de conexión';
        cb.style.cssText = 'margin:8px 0;padding:8px 16px;border-radius:6px;background:#333;color:#fff;border:none;font-size:14px;cursor:pointer;width:100%;';
        cb.addEventListener('click', function() { togglePanel(); });
        configSection.appendChild(cb);
      }
    } catch (_) {}
  }

  // Auto-hook: capture errors
  global.addEventListener('error', function(e) {
    log('error', (e.message || 'Error desconocido') + ' @ ' + (e.filename || '') + ':' + (e.lineno || ''));
  });
  global.addEventListener('unhandledrejection', function(e) {
    log('error', 'Promise rechazada: ' + String(e.reason || ''));
  });

  // Hook tier changes
  global.addEventListener('crozzo-tier-changed', function(e) {
    var d = (e && e.detail) || {};
    log('connection', 'Tier cambiado: ' + (d.from || '?') + ' → ' + (d.to || '?'), d);
  });
  global.addEventListener('crozzo-channel-changed', function(e) {
    var d = (e && e.detail) || {};
    log('connection', 'Canal cambiado: ' + (d.channel || '?'), d);
  });

  // Hook comandas
  global.addEventListener('crozzo-comanda-received', function(e) {
    var d = (e && e.detail) || {};
    log('comanda', 'Comanda recibida: ' + (d.transaction_id || d.id || '?'), d);
  });

  // Start (sin botón flotante — solo botón en menú de usuario)
  function start() {
    log('info', 'Reporte de dispositivo iniciado', { deviceId: (typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig().deviceId : '') });
  }

  function showMenu() {
    try {
      // Remove existing menu
      var existing = document.getElementById('crozzoReportMenu');
      if (existing) existing.remove();

      var menu = document.createElement('div');
      menu.id = 'crozzoReportMenu';
      menu.style.cssText = 'position:fixed;bottom:60px;right:10px;background:#fff;border:1px solid #ccc;border-radius:8px;padding:8px;z-index:100000;box-shadow:0 4px 12px rgba(0,0,0,.2);min-width:200px;';
      menu.innerHTML = '<div style="padding:10px;cursor:pointer;border-bottom:1px solid #eee;font-size:14px;" id="crShowPanel">📋 Ver log en vivo</div><div style="padding:10px;cursor:pointer;border-bottom:1px solid #eee;font-size:14px;" id="crDownload">💾 Descargar reporte</div><div style="padding:10px;cursor:pointer;font-size:14px;" id="crShare">📤 Compartir por WhatsApp</div>';
      document.body.appendChild(menu);

      menu.querySelector('#crShowPanel').addEventListener('click', function() { togglePanel(); menu.remove(); });
      menu.querySelector('#crDownload').addEventListener('click', function() { downloadReport(); menu.remove(); });
      menu.querySelector('#crShare').addEventListener('click', function() { shareReport(); menu.remove(); });

      // Auto-close after 8s
      setTimeout(function() { if (menu.parentNode) menu.parentNode.removeChild(menu); }, 8000);
    } catch (e) {
      console.error('Error al mostrar menú de reporte:', e);
      try { showToast('Error al abrir reporte: ' + String(e)); } catch (_) {}
    }
  }

  global.CrozzoDeviceReport = {
    log: log,
    getLogs: getLogs,
    clearLogs: clearLogs,
    getSummary: getSummary,
    buildReport: buildReport,
    buildTextReport: buildTextReport,
    downloadReport: downloadReport,
    shareReport: shareReport,
    togglePanel: togglePanel,
    show: showMenu,
    showMenu: showMenu,
  };
  global.crozzoDeviceReport = buildReport;
  global.crozzoDeviceLog = log;
  global.crozzoDeviceReportShow = showMenu;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(start, 1000); });
  } else {
    setTimeout(start, 1000);
  }
})(window);
