/**
 * Crozzo AI Proactive Alerts - monitor de salud cada 5 min, notificacion rate-limited (1/h).
 */
(function (global) {
  'use strict';

  var INTERVAL_MS = 5 * 60 * 1000;
  var RATE_KEY = 'crozzo_ai_alert_last_at';
  var RATE_MS = 60 * 60 * 1000;

  function canNotify() {
    try {
      var last = Number(global.localStorage ? global.localStorage.getItem(RATE_KEY) : 0) || 0;
      return (Date.now() - last) >= RATE_MS;
    } catch (_) { return true; }
  }
  function markNotified() {
    try { if (global.localStorage) global.localStorage.setItem(RATE_KEY, String(Date.now())); } catch (_) {}
  }
  function notify(msg) {
    if (!canNotify()) return;
    markNotified();
    try { if (typeof global.showToast === 'function') global.showToast(msg, 'warning'); } catch (_) {}
    try {
      if (global.Notification && Notification.permission === 'granted') {
        new Notification('POS · Alerta', { body: msg });
      }
    } catch (_) {}
  }

  function checkHealth() {
    var anomalies = [];
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) anomalies.push('Sin conexion a internet');
    } catch (_) {}
    try {
      if (global.CrozzoErrorMonitor && typeof global.CrozzoErrorMonitor.getErrorLog === 'function') {
        var errs = global.CrozzoErrorMonitor.getErrorLog() || [];
        if (errs.length > 10) anomalies.push('Errores de consola acumulados: ' + errs.length);
      }
    } catch (_) {}
    try {
      var total = 0;
      if (global.localStorage) {
        for (var k in global.localStorage) {
          if (Object.prototype.hasOwnProperty.call(global.localStorage, k)) {
            try { total += String(global.localStorage.getItem(k) || '').length; } catch (_) {}
          }
        }
      }
      if (total > 4 * 1024 * 1024) anomalies.push('Almacenamiento local alto');
    } catch (_) {}
    if (anomalies.length) notify('Anomalia detectada: ' + anomalies.join('; '));
  }

  function start() {
    if (global.__crozzoAiProactiveStarted) return;
    global.__crozzoAiProactiveStarted = true;
    setTimeout(checkHealth, 10000);
    setInterval(checkHealth, INTERVAL_MS);
  }

  global.CrozzoAiProactiveAlerts = { start: start, checkHealth: checkHealth };

  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 2000); }, { once: true });
    } else {
      setTimeout(start, 2000);
    }
  } catch (_) {}
})(typeof window !== 'undefined' ? window : globalThis);