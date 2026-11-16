/**
 * Crozzo POS — Observability Dashboard (Fase -1)
 * ----------------------------------------------
 * Dashboard interno de métricas: outbox size, facturas pendiente_fiscal,
 * duplicados, estado de sync, feature flags. Se inyecta en una página interna.
 */
(function (global) {
  'use strict';

  function collectMetrics() {
    var m = {};
    // Feature flags
    try { m.flags = global.CrozzoFeatureFlags ? global.CrozzoFeatureFlags.getAll() : {}; } catch (_) { m.flags = {}; }
    // Outbox size
    try {
      var q = global.localStorage.getItem('crozzo_sync_queue');
      m.outboxSize = q ? (JSON.parse(q).length || 0) : 0;
    } catch (_) { m.outboxSize = 0; }
    // Facturas pendiente_fiscal
    try {
      var facturas = (global.config && typeof global.config.getFacturas === 'function') ? global.config.getFacturas() : [];
      m.facturasTotal = facturas.length;
      m.facturasPendienteFiscal = facturas.filter(function (f) { return f.estado === 'pendiente_fiscal' || !f.cufe; }).length;
    } catch (_) { m.facturasTotal = 0; m.facturasPendienteFiscal = 0; }
    // RLS status
    try { m.rls = global.CrozzoRlsCompat ? global.CrozzoRlsCompat.status() : {}; } catch (_) { m.rls = {}; }
    // Storage backend
    try { m.storageBackend = global.CrozzoStorage ? global.CrozzoStorage.backend() : 'unknown'; } catch (_) { m.storageBackend = 'unknown'; }
    // Sanitize patched
    try { m.sanitizePatched = !!(global.CrozzoSanitize && global.CrozzoSanitize.installInnerHtmlGuard); } catch (_) { m.sanitizePatched = false; }
    m.timestamp = new Date().toISOString();
    return m;
  }

  function renderHtml(m) {
    var flagsHtml = Object.keys(m.flags || {}).map(function (k) {
      return '<tr><td>' + k + '</td><td>' + (m.flags[k] ? '✅ ON' : '⬜ OFF') + '</td></tr>';
    }).join('');
    return '<div style="font-family:monospace;padding:16px;background:#1e1e1e;color:#d4d4d4;border-radius:8px;">' +
      '<h2 style="color:#4ec9b0;">📊 Crozzo POS — Observability Dashboard</h2>' +
      '<p style="color:#808080;">Timestamp: ' + m.timestamp + '</p>' +
      '<h3 style="color:#9cdcfe;">Métricas</h3>' +
      '<table style="width:100%;border-collapse:collapse;">' +
      '<tr><td>Outbox size</td><td>' + m.outboxSize + '</td></tr>' +
      '<tr><td>Facturas total</td><td>' + m.facturasTotal + '</td></tr>' +
      '<tr><td>Facturas pendiente_fiscal</td><td>' + m.facturasPendienteFiscal + '</td></tr>' +
      '<tr><td>Storage backend</td><td>' + m.storageBackend + '</td></tr>' +
      '<tr><td>RLS compat mode</td><td>' + (m.rls.compatMode ? 'Sí' : 'No') + '</td></tr>' +
      '<tr><td>RLS business_id</td><td>' + (m.rls.businessId || '—') + '</td></tr>' +
      '<tr><td>Sanitize patched</td><td>' + (m.sanitizePatched ? 'Sí' : 'No') + '</td></tr>' +
      '</table>' +
      '<h3 style="color:#9cdcfe;margin-top:12px;">Feature Flags</h3>' +
      '<table style="width:100%;border-collapse:collapse;">' + flagsHtml + '</table>' +
      '</div>';
  }

  function show(containerId) {
    var container = (containerId && document.getElementById(containerId)) || document.body;
    var m = collectMetrics();
    container.innerHTML = CrozzoSanitize.sanitizeHtml(CrozzoSanitize ? renderHtml(m) : renderHtml(m));
  }

  global.CrozzoObservabilityDashboard = {
    collectMetrics: collectMetrics,
    renderHtml: renderHtml,
    show: show
  };
})(typeof window !== 'undefined' ? window : globalThis);
