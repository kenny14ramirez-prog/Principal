/**
 * CrozzoErrorMonitor — Monitoreo proactivo de errores del sistema.
 *
 * Captura errores globales (window.onerror, unhandledrejection),
 * los clasifica por severidad, y envía alertas por email a KENNY
 * cuando ocurren errores críticos.
 *
 * Severidades:
 * - critical: Error que bloquea el sistema (login falla, DB corrupta, etc.)
 * - high: Error que afecta funcionalidad importante (sync falla, impresión falla)
 * - medium: Error menor (UI no renderiza correctamente, etc.)
 * - low: Error informativo (console.warn, etc.)
 *
 * Alertas:
 * - critical: Email inmediato a KENNY
 * - high: Email si se repite 3+ veces en 5 minutos
 * - medium/low: Solo se registra localmente
 */
(function (global) {
  'use strict';

  var SUPABASE_CENTRAL_URL = 'https://hogeggkkodkpzossjfft.supabase.co';
  var SUPABASE_CENTRAL_ANON_KEY = 'sb_publishable_rNiFFu5h4YR-Ab5n8wxJSA_G58xhE64';

  var errorLog = [];
  var MAX_ERRORS = 100;
  var alertCooldown = {};
  var ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos entre alertas del mismo tipo

  // ── Clasificar severidad de un error ────────────────────────────
  function clasificarSeveridad(error, source) {
    var msg = String(error && error.message || error || '').toLowerCase();
    var src = String(source || '').toLowerCase();

    // Crítico: errores que bloquean el sistema
    if (msg.indexOf('cannot read') >= 0 && msg.indexOf('undefined') >= 0) return 'high';
    if (msg.indexOf('is not defined') >= 0) return 'high';
    if (msg.indexOf('failed to fetch') >= 0) return 'medium';
    if (msg.indexOf('network') >= 0) return 'medium';
    if (msg.indexOf('syntaxerror') >= 0) return 'critical';
    if (msg.indexOf('referenceerror') >= 0) return 'high';
    if (msg.indexOf('typeerror') >= 0) return 'high';
    if (src.indexOf('auth') >= 0 || src.indexOf('login') >= 0) return 'high';
    if (src.indexOf('sync') >= 0) return 'medium';
    if (src.indexOf('print') >= 0) return 'medium';

    return 'low';
  }

  // ── Registrar error ─────────────────────────────────────────────
  function registrarError(error, source, severity) {
    severity = severity || clasificarSeveridad(error, source);

    var entry = {
      ts: Date.now(),
      message: String(error && error.message || error || 'Unknown error'),
      stack: String(error && error.stack || '').slice(0, 500),
      source: source || 'unknown',
      severity: severity,
      url: (typeof location !== 'undefined' ? location.href : ''),
      userAgent: (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
      user: (typeof getCurrentUser === 'function' ? (getCurrentUser() && getCurrentUser().id) : 'unknown'),
    };

    errorLog.push(entry);
    if (errorLog.length > MAX_ERRORS) errorLog.shift();

    // Guardar en localStorage (últimos 20 errores)
    try {
      var recent = errorLog.slice(-20);
      safeLocalStorageSet('crozzo_error_log', JSON.stringify(recent));
    } catch (_) {}

    // Enviar alerta si es crítico o alto y no está en cooldown
    if (severity === 'critical' || severity === 'high') {
      _enviarAlerta(entry);
    }

    return entry;
  }

  // ── Enviar alerta por email ─────────────────────────────────────
  function _enviarAlerta(errorEntry) {
    var key = errorEntry.severity + ':' + errorEntry.source;
    var now = Date.now();
    if (alertCooldown[key] && now - alertCooldown[key] < ALERT_COOLDOWN_MS) {
      return; // En cooldown, no enviar
    }
    alertCooldown[key] = now;

    // Obtener email de KENNY desde Supabase
    try {
      fetch(SUPABASE_CENTRAL_URL + '/rest/v1/crozzo_superadmins?username=eq.KENNY&select=email', {
        headers: {
          'apikey': SUPABASE_CENTRAL_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_CENTRAL_ANON_KEY,
        },
      }).then(function (res) { return res.json(); }).then(function (data) {
        if (data && data.length > 0 && data[0].email) {
          var email = data[0].email;
          if (typeof CrozzoEmailTemplates !== 'undefined' && CrozzoEmailTemplates.enviarEmail) {
            var html = _templateAlertaError(email, errorEntry);
            CrozzoEmailTemplates.enviarEmail(email, '⚠️ Error crítico en BONA origen', html);
          }
        }
      }).catch(function () {});
    } catch (_) {}
  }

  // ── Template de alerta de error ─────────────────────────────────
  function _templateAlertaError(email, errorEntry) {
    var severityColor = errorEntry.severity === 'critical' ? '#e74c3c' : '#f39c12';
    var severityIcon = errorEntry.severity === 'critical' ? '🔴' : '⚠️';
    var severityText = errorEntry.severity === 'critical' ? 'CRÍTICO' : 'ALTO';

    return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8f9fa;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.08);overflow:hidden;">
        <tr><td style="background:#1a1a2e;padding:24px 32px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:1.5rem;font-weight:700;letter-spacing:1px;">BONA origen</h1>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:0.8rem;">Alerta de sistema</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#e74c3c;font-size:1.2rem;">${severityIcon} Error ${severityText} detectado</h2>
          <p style="margin:0 0 16px;color:#495057;font-size:0.95rem;line-height:1.6;">
            Se detectó un error ${severityText.toLowerCase()} en el sistema BONA origen.
          </p>
          <div style="background:#f8f9fa;border-radius:12px;padding:16px;margin:16px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:4px 0;color:#868e96;font-size:0.8rem;">Mensaje:</td><td style="padding:4px 0;color:#495057;font-size:0.85rem;font-weight:600;">${errorEntry.message}</td></tr>
              <tr><td style="padding:4px 0;color:#868e96;font-size:0.8rem;">Fuente:</td><td style="padding:4px 0;color:#495057;font-size:0.85rem;">${errorEntry.source}</td></tr>
              <tr><td style="padding:4px 0;color:#868e96;font-size:0.8rem;">Severidad:</td><td style="padding:4px 0;color:${severityColor};font-size:0.85rem;font-weight:600;">${errorEntry.severity.toUpperCase()}</td></tr>
              <tr><td style="padding:4px 0;color:#868e96;font-size:0.8rem;">Usuario:</td><td style="padding:4px 0;color:#495057;font-size:0.85rem;">${errorEntry.user}</td></tr>
              <tr><td style="padding:4px 0;color:#868e96;font-size:0.8rem;">Fecha:</td><td style="padding:4px 0;color:#495057;font-size:0.85rem;">${new Date(errorEntry.ts).toLocaleString('es-CO')}</td></tr>
              <tr><td style="padding:4px 0;color:#868e96;font-size:0.8rem;">URL:</td><td style="padding:4px 0;color:#495057;font-size:0.85rem;">${errorEntry.url}</td></tr>
            </table>
          </div>
          ${errorEntry.stack ? '<div style="background:#f1f3f5;border-radius:8px;padding:12px;margin-top:16px;"><p style="margin:0 0 4px;color:#868e96;font-size:0.75rem;">Stack trace:</p><pre style="margin:0;color:#495057;font-size:0.7rem;white-space:pre-wrap;word-break:break-all;">' + errorEntry.stack + '</pre></div>' : ''}
          <p style="margin:16px 0 0;color:#868e96;font-size:0.8rem;">Revisa el panel de auditoría del POS para más detalles.</p>
        </td></tr>
        <tr><td style="background:#f1f3f5;padding:16px 32px;text-align:center;border-top:1px solid #e9ecef;">
          <p style="margin:0;color:#868e96;font-size:0.75rem;">© ${new Date().getFullYear()} BONA origen · Sistema POS</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  // ── Capturar errores globales ───────────────────────────────────
  function _capturarErrores() {
    // window.onerror
    var originalOnError = window.onerror;
    window.onerror = function (message, source, lineno, colno, error) {
      registrarError(error || message, source || 'window.onerror', null);
      if (typeof originalOnError === 'function') {
        return originalOnError.apply(this, arguments);
      }
      return false;
    };

    // unhandledrejection
    window.addEventListener('unhandledrejection', function (event) {
      registrarError(event.reason, 'unhandledrejection', 'high');
    });

    // console.error (interceptar)
    var originalConsoleError = console.error;
    console.error = function () {
      var args = Array.prototype.slice.call(arguments);
      var msg = args.map(function (a) { return String(a); }).join(' ');
      // Solo registrar si no es un error ya capturado
      if (msg.indexOf('[crozzo') < 0) {
        registrarError(msg, 'console.error', 'medium');
      }
      originalConsoleError.apply(console, args);
    };
  }

  // ── Obtener log de errores ──────────────────────────────────────
  function getErrorLog() {
    return errorLog.slice();
  }

  // ── Obtener errores por severidad ───────────────────────────────
  function getErrorsBySeverity(severity) {
    return errorLog.filter(function (e) { return e.severity === severity; });
  }

  // ── Limpiar log de errores ──────────────────────────────────────
  function clearErrorLog() {
    errorLog = [];
    try { localStorage.removeItem('crozzo_error_log'); } catch (_) {}
  }

  // ── Obtener estadísticas de errores ─────────────────────────────
  function getErrorStats() {
    var stats = { total: errorLog.length, critical: 0, high: 0, medium: 0, low: 0 };
    errorLog.forEach(function (e) {
      stats[e.severity] = (stats[e.severity] || 0) + 1;
    });
    return stats;
  }

  // ── Registrar error manualmente ─────────────────────────────────
  function logError(message, source, severity) {
    return registrarError(message, source, severity);
  }

  // ── API pública ─────────────────────────────────────────────────
  global.CrozzoErrorMonitor = {
    registrarError: registrarError,
    logError: logError,
    getErrorLog: getErrorLog,
    getErrorsBySeverity: getErrorsBySeverity,
    clearErrorLog: clearErrorLog,
    getErrorStats: getErrorStats,
    clasificarSeveridad: clasificarSeveridad,
  };

  // Iniciar captura de errores
  if (typeof document !== 'undefined') {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(_capturarErrores, 100);
    } else {
      document.addEventListener('DOMContentLoaded', function () {
        setTimeout(_capturarErrores, 100);
      }, { once: true });
    }
  }

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
