/**
 * Crozzo Failure Reporter - Agrega fallas del sistema y las reporta a Supabase + descarga local.
 */
(function (global) {
  'use strict';

  function safe(fn, def) {
    try { return fn(); } catch (_) { return (def === undefined ? null : def); }
  }

  function md() {
    return safe(function () {
      return typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
    }, {});
  }

  function getCurrentUserSafe() {
    return safe(function () {
      return typeof global.getCurrentUser === 'function' ? global.getCurrentUser() : null;
    }, null);
  }

  function deviceId() {
    return safe(function () {
      if (typeof global.ensureCrozzoDeviceId === 'function') return global.ensureCrozzoDeviceId();
      return String((md() && md().deviceId) || global.localStorage.getItem('crozzo_device_id') || '').trim();
    }, '');
  }

  async function resolveCreds() {
    try {
      if (typeof global.crozzoResolveSupabaseCredentials === 'function') {
        var c = global.crozzoResolveSupabaseCredentials();
        if (c && c.url && c.key) return c;
      }
    } catch (_) {}
    // OS secret store (DPAPI). Sin fallback hardcodeado.
    try {
      if (global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function') {
        var u = await global.__TAURI__.core.invoke('crozzo_secret_get', { name: 'supabase_url' });
        var k = await global.__TAURI__.core.invoke('crozzo_secret_get', { name: 'supabase_anon_key' });
        if (u && k) return { url: String(u).trim(), key: String(k).trim() };
      }
    } catch (_) {}
    try {
      if (typeof global.localStorage !== 'undefined' && global.localStorage) {
        var ul = global.localStorage.getItem('crozzo_secret_supabase_url');
        var kl = global.localStorage.getItem('crozzo_secret_supabase_anon_key');
        if (ul && kl) return { url: String(ul).trim(), key: String(kl).trim() };
      }
    } catch (_) {}
    return { ok: false, error: 'no credentials' };
  }

  async function runDiag() {
    var runner = null;
    if (global.CrozzoComunicacionDiag && typeof global.CrozzoComunicacionDiag.run === 'function') {
      runner = global.CrozzoComunicacionDiag.run.bind(global.CrozzoComunicacionDiag);
    } else if (typeof global.crozzoDiagComunicacion === 'function') {
      runner = global.crozzoDiagComunicacion;
    } else if (typeof global.crozzoComunicacionDiag === 'function') {
      runner = global.crozzoComunicacionDiag;
    }
    if (!runner) return null;
    try {
      var rep = await runner();
      try { global.__crozzoLastDiag = rep; } catch (_) {}
      return rep;
    } catch (_) { return null; }
  }

  function printersList() {
    var out = [];
    try {
      if (typeof global.getAvailablePrintersList === 'function') out = global.getAvailablePrintersList() || [];
    } catch (_) { out = []; }
    try {
      var detected = JSON.parse(global.localStorage.getItem('crozzo_detected_printers') || '[]');
      if (Array.isArray(detected) && detected.length) out = out.concat(detected.map(function (p) { return (p && p.name) ? p.name : p; }));
    } catch (_) {}
    return out;
  }

  // --- P2.5: opt-in y redaccion de PII ---
  function isOptIn() {
    try { return global.localStorage && global.localStorage.getItem('crozzo_failure_report_optin') === '1'; } catch (_) { return false; }
  }
  function setOptIn(v) {
    try { if (global.localStorage) global.localStorage.setItem('crozzo_failure_report_optin', v ? '1' : '0'); } catch (_) {}
  }
  function redactText(s) {
    s = String(s == null ? '' : s);
    // NITs / identificadores numericos largos
    s = s.replace(/\b\d{6,10}(?:-\d)?\b/g, '[REDACTED]');
    return s;
  }
  function redactReport(report) {
    var out = null;
    try { out = JSON.parse(JSON.stringify(report || {})); } catch (_) { out = report || {}; }
    try {
      if (out.user) {
        if (out.user.nombre) out.user.nombre = '[redacted]';
        if (out.user.name) out.user.name = '[redacted]';
        if (out.user.id) out.user.id = '[redacted]';
      }
      if (Array.isArray(out.failures)) {
        out.failures = out.failures.filter(function (f) { return !f || f.type !== 'console_error'; });
        out.failures.forEach(function (f) { if (f && f.detail) f.detail = redactText(f.detail); });
      }
      if (out.health && out.health.consoleErrors) {
        out.health.consoleErrors.recent = [];
        out.health.consoleErrors.count = 0;
      }
    } catch (_) {}
    return out;
  }

  function honeypotStatus() {
    var st = { active: false, blocked: false, stats: null };
    try {
      if (global.CrozzoHoneypotJaula) {
        if (typeof global.CrozzoHoneypotJaula.isJaulaActive === 'function') st.active = !!global.CrozzoHoneypotJaula.isJaulaActive();
        if (typeof global.CrozzoHoneypotJaula.isBlocked === 'function') st.blocked = !!global.CrozzoHoneypotJaula.isBlocked();
        if (typeof global.CrozzoHoneypotJaula.getStats === 'function') st.stats = global.CrozzoHoneypotJaula.getStats();
      }
    } catch (_) {}
    try { st.simAvailable = !!global.CrozzoHoneypotSim; } catch (_) {}
    return st;
  }

  async function generateReport() {
    var failures = [];
    var health = {};
    var user = getCurrentUserSafe() || null;
    var dev = deviceId();

    // 1. Diagnostic pillar
    var diag = await runDiag();
    if (diag) {
      var rows = Array.isArray(diag.rows) ? diag.rows : [];
      rows.forEach(function (r) {
        if (r && (r.status === 'fail' || r.status === 'warn')) {
          failures.push({
            type: String(r.id || 'diag'),
            detail: String((r.label || '') + ': ' + (r.detail || '')),
            severity: r.status === 'fail' ? 'high' : 'medium'
          });
        }
      });
      health.diag = {
        ok: !!diag.ok,
        verdict: diag.verdict || '',
        fails: rows.filter(function (r) { return r && r.status === 'fail'; }).length,
        warns: rows.filter(function (r) { return r && r.status === 'warn'; }).length
      };
    } else {
      health.diag = { ok: null, verdict: 'no disponible', fails: 0, warns: 0 };
    }

    // 2. Connectivity
    var online = (typeof navigator !== 'undefined') ? !!navigator.onLine : true;
    var orch = null;
    try {
      if (global.CrozzoConnectivityOrchestrator && typeof global.CrozzoConnectivityOrchestrator.getState === 'function') {
        orch = global.CrozzoConnectivityOrchestrator.getState();
      }
    } catch (_) {}
    health.connectivity = { online: online, orchestrator: orch };
    if (!online) {
      failures.push({ type: 'connectivity', detail: 'navigator.onLine = false', severity: 'high' });
    }
    if (orch && orch.level && orch.level !== 'cloud') {
      failures.push({ type: 'connectivity', detail: 'nivel activo: ' + orch.level + ' (' + (orch.reason || '') + ')', severity: orch.level === 'qr' ? 'high' : 'medium' });
    }

    // 3. Printers
    var prs = printersList();
    health.printers = { available: prs, count: prs.length, deploymentCenter: !!global.CrozzoDeploymentCenter };
    if (!prs || prs.length === 0) {
      failures.push({ type: 'printer', detail: 'No se encontraron impresoras configuradas', severity: 'medium' });
    }
    // Consultar CrozzoDeploymentCenter si expone verificacion
    try {
      if (global.CrozzoDeploymentCenter && typeof global.CrozzoDeploymentCenter._dcCheckPrinters === 'function') {
        global.CrozzoDeploymentCenter._dcCheckPrinters();
      }
    } catch (_) {}

    // 4. Honeypot
    var hp = honeypotStatus();
    health.honeypot = hp;
    if (hp.blocked) {
      failures.push({ type: 'honeypot', detail: 'Honeypot bloqueado/activo (jaula)', severity: 'high' });
    }

    // 5. Console errors
    var recentErrors = [];
    try {
      if (global.CrozzoErrorMonitor && typeof global.CrozzoErrorMonitor.getErrorLog === 'function') {
        var all = global.CrozzoErrorMonitor.getErrorLog() || [];
        recentErrors = all.slice(-20);
      }
    } catch (_) {}
    health.consoleErrors = { count: recentErrors.length, recent: recentErrors };
    recentErrors.forEach(function (e) {
      failures.push({
        type: 'console_error',
        detail: String((e && e.message) || e || ''),
        severity: (e && e.severity) ? e.severity : 'low'
      });
    });

    var report = {
      timestamp: new Date().toISOString(),
      device: dev,
      user: user ? { id: user.id, nombre: user.nombre || user.name, rol: user.rol } : null,
      failures: failures,
      health: health
    };
    return report;
  }

  function fingerprintFor(report) {
    try {
      return String(report.device || '') + '|' + String((typeof navigator !== 'undefined' && navigator.userAgent) || '');
    } catch (_) { return String(report.device || ''); }
  }

  async function upload(report) {
    report = report || {};
    if (!isOptIn()) {
      return { ok: false, error: 'opt-in required', via: 'none' };
    }
    report = redactReport(report);
    var creds = await resolveCreds();
    if (!creds || creds.ok === false || !creds.url || !creds.key) {
      return { ok: false, error: 'no credentials', via: 'none' };
    }
    var url = String(creds.url).trim();
    var key = String(creds.key).trim();
    var sb = global.__SUPABASE || null;
    var fp = fingerprintFor(report);
    var user = report.user || null;
    var payload = {
      fingerprint: fp,
      user_id: user ? (user.id || null) : null,
      user_name: user ? (user.nombre || null) : null,
      report: report,
      created_at: report.timestamp || new Date().toISOString()
    };

    // Try supabase client table insert
    if (sb && typeof sb.from === 'function') {
      try {
        var res = await sb.from('pos_failure_reports').insert(payload);
        if (res && res.error) throw res.error;
        return { ok: true, via: 'client-insert' };
      } catch (e) { /* fallback */ }
    }
    // Try RPC via client
    if (sb && typeof sb.rpc === 'function') {
      try {
        var r = await sb.rpc('register_failure_report', { p_fingerprint: fp, p_user: user || {}, p_report: report });
        if (r && r.error) return { ok: false, error: (r.error.message || String(r.error)), via: 'client-rpc' };
        return { ok: true, via: 'client-rpc' };
      } catch (e) { /* fallback */ }
    }
    // REST with anon key
    if (url && key) {
      try {
        var resp = await fetch(url + '/rest/v1/pos_failure_reports', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': key,
            'Authorization': 'Bearer ' + key,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(payload)
        });
        if (resp.ok) return { ok: true, status: resp.status, via: 'rest-insert' };
        // Try RPC
        try {
          var resp2 = await fetch(url + '/rest/v1/rpc/register_failure_report', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': key,
              'Authorization': 'Bearer ' + key
            },
            body: JSON.stringify({ p_fingerprint: fp, p_user: user || {}, p_report: report })
          });
          if (resp2.ok) return { ok: true, status: resp2.status, via: 'rest-rpc' };
          return { ok: false, status: resp2.status, via: 'rest-rpc' };
        } catch (e2) {
          return { ok: false, status: resp.status, error: e2 && e2.message ? e2.message : String(e2), via: 'rest' };
        }
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e), via: 'rest' };
      }
    }
    return { ok: false, error: 'no supabase credentials', via: 'none' };
  }

  function download(report) {
    try {
      var blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      var objUrl = (global.URL || window.URL).createObjectURL(blob);
      var a = document.createElement('a');
      a.href = objUrl;
      a.download = 'pos_failure_report_' + String((report && report.timestamp) || Date.now()).replace(/[:.]/g, '-') + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { try { document.body.removeChild(a); } catch (_) {} try { (global.URL || window.URL).revokeObjectURL(objUrl); } catch (_) {} }, 0);
      return true;
    } catch (_) { return false; }
  }

  async function runAll() {
    var report = await generateReport();
    var up = await upload(report);
    var dl = download(report);
    return {
      report: report,
      upload: up,
      downloaded: dl,
      summary: 'Fallas: ' + report.failures.length + '. Subida: ' + (up && up.ok ? 'OK' : 'FAIL') + '. Descarga: ' + (dl ? 'OK' : 'FAIL') + '.'
    };
  }

  global.CrozzoFailureReporter = {
    generateReport: generateReport,
    run: generateReport,
    aggregate: generateReport,
    upload: upload,
    download: download,
    runAll: runAll,
    isOptIn: isOptIn,
    setOptIn: setOptIn,
    redactReport: redactReport
  };
})(typeof window !== 'undefined' ? window : globalThis);
