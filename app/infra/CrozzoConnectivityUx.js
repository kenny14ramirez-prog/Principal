/**
 * Crozzo POS — UX de conectividad: indicador visual (🟢🟡🔴) + notificación
 * (banner + sonido) + registro de auditoría de desconexiones/reconexiones.
 *
 * Se auto-inyecta en la barra superior si existe; si no, crea un badge flotante.
 * No depende de frameworks: solo DOM + Web Audio.
 */
(function (global) {
  'use strict';

  var AUDIT_KEY = 'crozzo_conn_audit_v1';
  var AUDIT_MAX = 200;
  var __lastTier = null;
  var __audioCtx = null;
  var __indicatorEl = null;
  var __bannerEl = null;
  var __bannerTimer = null;

  function tierNow() {
    return String(global.__CROZZO_TIER_LAST || 'offline');
  }

  function tierColor(t) {
    t = String(t || '').toLowerCase();
    if (t === 'cloud' || t === 'lan') return 'green';
    if (t === 'hotspot' || t === 'mesh' || t === 'qr') return 'yellow';
    return 'red';
  }

  function tierEmoji(t) {
    var c = tierColor(t);
    return c === 'green' ? '🟢' : c === 'yellow' ? '🟡' : '🔴';
  }

  function tierLabel(t) {
    t = String(t || '').toLowerCase();
    if (t === 'cloud') return 'Nube';
    if (t === 'lan') return 'LAN';
    if (t === 'hotspot') return 'Hotspot';
    if (t === 'mesh') return 'Malla';
    if (t === 'qr') return 'QR';
    return 'Sin conexión';
  }

  function auditLog(event, detail) {
    try {
      var arr = [];
      try { arr = JSON.parse(global.localStorage.getItem(AUDIT_KEY) || '[]') || []; } catch (_) { arr = []; }
      arr.push({ at: Date.now(), event: String(event || ''), detail: String(detail || ''), tier: tierNow() });
      if (arr.length > AUDIT_MAX) arr = arr.slice(arr.length - AUDIT_MAX);
      global.localStorage.setItem(AUDIT_KEY, JSON.stringify(arr));
    } catch (_) {}
  }

  function getAuditLog() {
    try { return JSON.parse(global.localStorage.getItem(AUDIT_KEY) || '[]') || []; } catch (_) { return []; }
  }

  function ensureIndicator() {
    if (__indicatorEl && document.body.contains(__indicatorEl)) return __indicatorEl;
    // Buscar barra superior existente
    var host = document.querySelector('.top-bar, .navbar, .app-header, header, #topBar, .toolbar');
    var el = document.createElement('span');
    el.id = 'crozzoConnIndicator';
    el.style.cssText = 'display:inline-flex;align-items:center;gap:4px;font-size:14px;padding:2px 8px;border-radius:12px;background:rgba(0,0,0,.06);cursor:default;user-select:none;';
    el.title = 'Estado de conexión';
    if (host) {
      host.appendChild(el);
    } else {
      el.style.cssText += 'position:fixed;top:8px;right:8px;z-index:9999;';
      document.body.appendChild(el);
    }
    __indicatorEl = el;
    return el;
  }

  function renderIndicator() {
    var el = ensureIndicator();
    if (!el) return;
    var t = tierNow();
    el.textContent = tierEmoji(t) + ' ' + tierLabel(t);
    el.title = 'Canal activo: ' + tierLabel(t);
  }

  function ensureBanner() {
    if (__bannerEl && document.body.contains(__bannerEl)) return __bannerEl;
    var el = document.createElement('div');
    el.id = 'crozzoConnBanner';
    el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:10000;padding:8px 16px;text-align:center;font-size:14px;font-weight:600;display:none;box-shadow:0 2px 8px rgba(0,0,0,.15);';
    document.body.appendChild(el);
    __bannerEl = el;
    return el;
  }

  function showBanner(msg, color) {
    var el = ensureBanner();
    if (!el) return;
    el.textContent = msg;
    el.style.background = color === 'red' ? '#fee2e2' : color === 'yellow' ? '#fef9c3' : '#dcfce7';
    el.style.color = color === 'red' ? '#991b1b' : color === 'yellow' ? '#854d0e' : '#166534';
    el.style.display = 'block';
    if (__bannerTimer) clearTimeout(__bannerTimer);
    __bannerTimer = setTimeout(function () { if (el) el.style.display = 'none'; }, 4000);
  }

  function playBeep(freq, ms) {
    try {
      if (!__audioCtx) __audioCtx = new (global.AudioContext || global.webkitAudioContext)();
      var ctx = __audioCtx;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.frequency.value = freq || 440;
      osc.type = 'sine';
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      setTimeout(function () { try { osc.stop(); } catch (_) {} }, ms || 180);
    } catch (_) {}
  }

  function onTierChange(e) {
    var detail = (e && e.detail) || {};
    var from = String(detail.from || __lastTier || '');
    var to = String(detail.to || tierNow());
    __lastTier = to;
    renderIndicator();
    if (to === 'offline') {
      auditLog('disconnected', 'tier ' + from + ' -> offline');
      showBanner('⚠️ Sin conexión — operando en modo local', 'red');
      playBeep(220, 300);
    } else if (from === 'offline' || from === '' ) {
      if (from !== '' && from !== to) {
        auditLog('reconnected', 'tier -> ' + to);
        showBanner('✅ Conexión restaurada (' + tierLabel(to) + ')', 'green');
        playBeep(660, 200);
      }
    } else if (to !== from) {
      auditLog('tier_changed', from + ' -> ' + to);
      showBanner('Canal cambiado a ' + tierLabel(to), 'yellow');
    }
  }

  function start() {
    renderIndicator();
    try {
      if (typeof global.addEventListener === 'function') {
        global.addEventListener('crozzo-tier-changed', onTierChange);
      }
    } catch (_) {}
    // Polling de respaldo por si no hay eventos
    setInterval(renderIndicator, 2000);
    // Estado inicial
    __lastTier = tierNow();
    auditLog('started', 'tier=' + __lastTier);
  }

  // Exponer API
  global.CrozzoConnectivityUx = {
    start: start,
    render: renderIndicator,
    auditLog: auditLog,
    getAuditLog: getAuditLog,
    tierEmoji: tierEmoji,
  };
  global.crozzoConnAuditLog = getAuditLog;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    setTimeout(start, 0);
  }
})(window);
