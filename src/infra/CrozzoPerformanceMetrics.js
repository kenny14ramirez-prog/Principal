/**
 * Crozzo POS — Métricas de rendimiento del dispositivo.
 *
 * Recolecta métricas de rendimiento en tiempo real:
 * memoria, latencia de red, tiempo de sync, FPS, uptime, tamaño de storage.
 * Se integra con CrozzoFieldDiagnostic para incluirse en el reporte de campo.
 */
(function (global) {
  'use strict';

  var __metrics = {
    startTime: Date.now(),
    syncTimes: [],
    pingTimes: [],
    renderTimes: [],
    errorCount: 0,
    commandCount: 0,
    lastSyncAt: 0,
    lastPingAt: 0,
  };

  var MAX_SAMPLES = 50;

  function now() { return Date.now(); }

  // ── Memoria ──
  function getMemory() {
    var mem = { available: false };
    try {
      if (performance && performance.memory) {
        mem.available = true;
        mem.usedJSHeapSize = performance.memory.usedJSHeapSize;
        mem.totalJSHeapSize = performance.memory.totalJSHeapSize;
        mem.jsHeapSizeLimit = performance.memory.jsHeapSizeLimit;
        mem.usedMB = Math.round(mem.usedJSHeapSize / 1024 / 1024);
        mem.totalMB = Math.round(mem.totalJSHeapSize / 1024 / 1024);
        mem.limitMB = Math.round(mem.jsHeapSizeLimit / 1024 / 1024);
        mem.usagePercent = Math.round((mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100);
      }
    } catch (_) {}
    return mem;
  }

  // ── Uptime ──
  function getUptime() {
    return {
      ms: now() - __metrics.startTime,
      seconds: Math.round((now() - __metrics.startTime) / 1000),
      minutes: Math.round((now() - __metrics.startTime) / 60000),
      formatted: formatDuration(now() - __metrics.startTime),
    };
  }

  function formatDuration(ms) {
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    var h = Math.floor(m / 60);
    s = s % 60;
    m = m % 60;
    return (h > 0 ? h + 'h ' : '') + (m > 0 ? m + 'm ' : '') + s + 's';
  }

  // ── Latencia de red (ping a la caja) ──
  async function measurePing() {
    var md = (typeof global.getMultiDeviceConfig === 'function') ? global.getMultiDeviceConfig() : {};
    if (!md.centralIp && md.role !== 'A') return null;
    var ip = md.role === 'A' ? '127.0.0.1' : String(md.centralIp || '').trim();
    if (!ip) return null;
    var port = Number(md.port) || 3000;
    var start = performance.now();
    try {
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function() { ctrl.abort(); }, 3000) : null;
      var res = await fetch('http://' + ip + ':' + port + '/health', { signal: ctrl ? ctrl.signal : undefined });
      if (timer) clearTimeout(timer);
      var ms = Math.round(performance.now() - start);
      __metrics.pingTimes.push(ms);
      if (__metrics.pingTimes.length > MAX_SAMPLES) __metrics.pingTimes.shift();
      __metrics.lastPingAt = now();
      return { ok: res.ok, ms: ms };
    } catch (e) {
      var ms = Math.round(performance.now() - start);
      __metrics.pingTimes.push(ms);
      if (__metrics.pingTimes.length > MAX_SAMPLES) __metrics.pingTimes.shift();
      return { ok: false, ms: ms, error: String(e) };
    }
  }

  // ── Tiempo de sync ──
  function recordSyncTime(ms) {
    __metrics.syncTimes.push(ms);
    if (__metrics.syncTimes.length > MAX_SAMPLES) __metrics.syncTimes.shift();
    __metrics.lastSyncAt = now();
    __metrics.commandCount++;
  }

  function recordRenderTime(ms) {
    __metrics.renderTimes.push(ms);
    if (__metrics.renderTimes.length > MAX_SAMPLES) __metrics.renderTimes.shift();
  }

  function recordError() { __metrics.errorCount++; }

  // ── Storage ──
  function getStorageSize() {
    var result = { localStorage: 0, indexedDB: 'N/A' };
    try {
      var total = 0;
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key) {
          total += (key.length + (localStorage.getItem(key) || '').length) * 2; // UTF-16
        }
      }
      result.localStorage = Math.round(total / 1024); // KB
      result.localStorageKeys = localStorage.length;
    } catch (_) {}
    return result;
  }

  // ── FPS (si disponible) ──
  function getFPS() {
    // No se puede medir FPS de forma síncrona; retornar estimación basada en renderTimes
    if (__metrics.renderTimes.length === 0) return null;
    var avg = __metrics.renderTimes.reduce((a, b) => a + b, 0) / __metrics.renderTimes.length;
    return Math.round(1000 / avg);
  }

  // ── Resumen de métricas ──
  function getMetricsSummary() {
    var pings = __metrics.pingTimes;
    var syncs = __metrics.syncTimes;
    var renders = __metrics.renderTimes;
    return {
      uptime: getUptime(),
      memory: getMemory(),
      storage: getStorageSize(),
      network: {
        pingSamples: pings.length,
        pingAvg: pings.length > 0 ? Math.round(pings.reduce((a, b) => a + b, 0) / pings.length) : null,
        pingMin: pings.length > 0 ? Math.min(...pings) : null,
        pingMax: pings.length > 0 ? Math.max(...pings) : null,
        lastPingAt: __metrics.lastPingAt ? new Date(__metrics.lastPingAt).toISOString() : null,
      },
      sync: {
        samples: syncs.length,
        avgMs: syncs.length > 0 ? Math.round(syncs.reduce((a, b) => a + b, 0) / syncs.length) : null,
        minMs: syncs.length > 0 ? Math.min(...syncs) : null,
        maxMs: syncs.length > 0 ? Math.max(...syncs) : null,
        lastSyncAt: __metrics.lastSyncAt ? new Date(__metrics.lastSyncAt).toISOString() : null,
        totalCommands: __metrics.commandCount,
      },
      render: {
        samples: renders.length,
        avgMs: renders.length > 0 ? Math.round(renders.reduce((a, b) => a + b, 0) / renders.length) : null,
        estimatedFPS: getFPS(),
      },
      errors: __metrics.errorCount,
    };
  }

  // ── Formato texto para reporte ──
  function buildMetricsText() {
    var m = getMetricsSummary();
    var lines = [];
    lines.push('═══ MÉTRICAS DE RENDIMIENTO ═══');
    lines.push('Uptime: ' + m.uptime.formatted);
    lines.push('');
    lines.push('Memoria:');
    if (m.memory.available) {
      lines.push('  Usada: ' + m.memory.usedMB + ' MB / ' + m.memory.totalMB + ' MB (límite: ' + m.memory.limitMB + ' MB)');
      lines.push('  Uso: ' + m.memory.usagePercent + '%');
    } else {
      lines.push('  No disponible (navegador no soporta performance.memory)');
    }
    lines.push('');
    lines.push('Storage:');
    lines.push('  localStorage: ' + m.storage.localStorage + ' KB (' + (m.storage.localStorageKeys || 0) + ' keys)');
    lines.push('');
    lines.push('Red (ping a caja):');
    if (m.network.pingSamples > 0) {
      lines.push('  Muestras: ' + m.network.pingSamples);
      lines.push('  Promedio: ' + m.network.pingAvg + ' ms');
      lines.push('  Mín: ' + m.network.pingMin + ' ms | Máx: ' + m.network.pingMax + ' ms');
      lines.push('  Último: ' + m.network.lastPingAt);
    } else {
      lines.push('  Sin muestras (no se ha medido)');
    }
    lines.push('');
    lines.push('Sync:');
    if (m.sync.samples > 0) {
      lines.push('  Muestras: ' + m.sync.samples);
      lines.push('  Promedio: ' + m.sync.avgMs + ' ms');
      lines.push('  Mín: ' + m.sync.minMs + ' ms | Máx: ' + m.sync.maxMs + ' ms');
      lines.push('  Último: ' + m.sync.lastSyncAt);
      lines.push('  Total comandos: ' + m.sync.totalCommands);
    } else {
      lines.push('  Sin muestras');
    }
    lines.push('');
    lines.push('Render:');
    if (m.render.samples > 0) {
      lines.push('  Muestras: ' + m.render.samples);
      lines.push('  Promedio: ' + m.render.avgMs + ' ms');
      lines.push('  FPS estimado: ' + (m.render.estimatedFPS || 'N/A'));
    } else {
      lines.push('  Sin muestras');
    }
    lines.push('');
    lines.push('Errores registrados: ' + m.errors);
    return lines.join('\n');
  }

  // ── Hook: medir ping periódicamente ──
  function startPingLoop() {
    setInterval(async function() {
      var r = await measurePing();
      if (r) {
        if (global.CrozzoDeviceReport) global.CrozzoDeviceReport.log('info', 'Ping: ' + r.ms + 'ms ' + (r.ok ? 'OK' : 'FAIL'));
      }
    }, 10000);
  }

  // ── Hook: medir render time ──
  function hookRender() {
    try {
      var origRAF = global.requestAnimationFrame;
      if (origRAF) {
        global.requestAnimationFrame = function(cb) {
          var start = performance.now();
          return origRAF(function(ts) {
            recordRenderTime(performance.now() - start);
            cb(ts);
          });
        };
      }
    } catch (_) {}
  }

  // ── Hook: contar errores ──
  function hookErrors() {
    global.addEventListener('error', function() { recordError(); });
    global.addEventListener('unhandledrejection', function() { recordError(); });
  }

  // ── Start ──
  function start() {
    hookRender();
    hookErrors();
    setTimeout(startPingLoop, 2000);
    if (global.CrozzoDeviceReport) global.CrozzoDeviceReport.log('info', 'Métricas de rendimiento iniciadas');
  }

  // ── Integrar con CrozzoFieldDiagnostic ──
  try {
    if (global.CrozzoFieldDiagnostic) {
      var origBuild = global.CrozzoFieldDiagnostic.buildFullTextReport;
      global.CrozzoFieldDiagnostic.buildFullTextReport = function() {
        var text = origBuild();
        return text + '\n\n' + buildMetricsText();
      };
    }
  } catch (_) {}

  // Exponer API
  global.CrozzoPerformanceMetrics = {
    getMemory: getMemory,
    getUptime: getUptime,
    measurePing: measurePing,
    recordSyncTime: recordSyncTime,
    recordRenderTime: recordRenderTime,
    recordError: recordError,
    getStorageSize: getStorageSize,
    getMetricsSummary: getMetricsSummary,
    buildMetricsText: buildMetricsText,
  };
  global.crozzoPerfMetrics = getMetricsSummary;
  global.crozzoRecordSync = recordSyncTime;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(start, 1000); });
  } else {
    setTimeout(start, 1000);
  }
})(window);
