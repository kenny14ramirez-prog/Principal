/**
 * Archivo mensual de facturas — mantiene el historial activo liviano.
 * Las facturas archivadas quedan en localStorage por mes (YYYY-MM).
 */
(function (global) {
  'use strict';

  var LS_INDEX = 'crozzo_facturas_archivo_index_v1';
  var LS_PREFIX = 'crozzo_facturas_archivo_';
  var __autoTimer = null;
  var __periodArchiveCache = [];
  var __periodArchiveKey = '';

  function getConfig() {
    try {
      if (typeof config !== 'undefined' && config.get) {
        return config.get('facturasArchivo') || {};
      }
    } catch (_) {}
    return {};
  }

  function settings() {
    var c = getConfig();
    return {
      enabled: c.enabled !== false,
      maxActivas: Math.max(500, Number(c.maxActivas) || 2500),
      minAgeDays: Math.max(1, Number(c.minAgeDays) || 3),
      defaultViewDays: Math.max(1, Number(c.defaultViewDays) || 1),
      autoOnBoot: c.autoOnBoot !== false,
      keepMonths: Math.max(1, Number(c.keepMonths) || 24),
    };
  }

  function facturaDateKey(f) {
    var d = f && (f.fecha || f.fechaEmision);
    if (!d) return '';
    return String(d).slice(0, 10);
  }

  function monthKey(isoDate) {
    return String(isoDate || '').slice(0, 7);
  }

  function readIndex() {
    try {
      var raw = JSON.parse(localStorage.getItem(LS_INDEX) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (_) {
      return [];
    }
  }

  function writeIndex(rows) {
    try {
      localStorage.setItem(LS_INDEX, JSON.stringify(rows));
    } catch (e) {
      console.warn('[facturas-archivo] index', e);
    }
  }

  function readMonthBlob(yyyyMm) {
    try {
      return JSON.parse(localStorage.getItem(LS_PREFIX + yyyyMm) || 'null');
    } catch (_) {
      return null;
    }
  }

  function writeMonthBlob(yyyyMm, blob) {
    try {
      localStorage.setItem(LS_PREFIX + yyyyMm, JSON.stringify(blob));
      return true;
    } catch (e) {
      console.warn('[facturas-archivo] write', e);
      return false;
    }
  }

  function hashSummary(facturas) {
    var refs = (facturas || [])
      .map(function (f) {
        return [
          String(f.uuid || f.consecutivo || ''),
          facturaDateKey(f),
          String(Number(f.total) || 0),
        ].join(':');
      })
      .sort()
      .join('|');
    var h = 5381 >>> 0;
    for (var i = 0; i < refs.length; i++) h = (((h << 5) + h) ^ refs.charCodeAt(i)) >>> 0;
    return 'a' + h.toString(16).padStart(8, '0');
  }

  function daysAgo(isoEnd) {
    try {
      var end = new Date(isoEnd + 'T23:59:59').getTime();
      return (Date.now() - end) / 86400000;
    } catch (_) {
      return 0;
    }
  }

  function lastDayOfMonth(yyyyMm) {
    var p = yyyyMm.split('-');
    var y = parseInt(p[0], 10);
    var m = parseInt(p[1], 10);
    var last = new Date(y, m, 0).getDate();
    return yyyyMm + '-' + String(last).padStart(2, '0');
  }

  function groupMonths(facturas) {
    var map = {};
    (facturas || []).forEach(function (f) {
      var dk = facturaDateKey(f);
      if (!dk) return;
      var mk = monthKey(dk);
      if (!map[mk]) map[mk] = [];
      map[mk].push(f);
    });
    return map;
  }

  function setActiveFacturas(next) {
    window.__crozzoArchiveWriteBypass = true;
    try {
      if (typeof config !== 'undefined' && config.set) config.set('facturas', next);
    } finally {
      window.__crozzoArchiveWriteBypass = false;
    }
  }

  function archiveMonth(yyyyMm, opts) {
    opts = opts || {};
    if (!yyyyMm || !/^\d{4}-\d{2}$/.test(yyyyMm)) return { ok: false, reason: 'mes_invalido' };
    var all = typeof config !== 'undefined' && config.getFacturas ? config.getFacturas() || [] : [];
    var toArchive = [];
    var keep = [];
    all.forEach(function (f) {
      if (monthKey(facturaDateKey(f)) === yyyyMm) toArchive.push(f);
      else keep.push(f);
    });
    if (!toArchive.length) return { ok: false, reason: 'sin_datos', count: 0 };
    if (!opts.force) {
      var s = settings();
      var endIso = lastDayOfMonth(yyyyMm);
      if (daysAgo(endIso) < s.minAgeDays) {
        return { ok: false, reason: 'mes_reciente', minAgeDays: s.minAgeDays };
      }
    }
    var existing = readMonthBlob(yyyyMm);
    var merged = existing && Array.isArray(existing.facturas) ? existing.facturas.concat(toArchive) : toArchive;
    var blob = {
      version: 1,
      month: yyyyMm,
      archivedAt: new Date().toISOString(),
      count: merged.length,
      total: merged.reduce(function (a, f) {
        return a + (Number(f.total) || 0);
      }, 0),
      summaryHash: hashSummary(merged),
      facturas: merged,
    };
    if (!writeMonthBlob(yyyyMm, blob)) return { ok: false, reason: 'storage_full' };
    setActiveFacturas(keep);
    var idx = readIndex().filter(function (r) {
      return r && r.month !== yyyyMm;
    });
    idx.unshift({
      month: yyyyMm,
      count: blob.count,
      total: blob.total,
      archivedAt: blob.archivedAt,
      summaryHash: blob.summaryHash,
    });
    var s2 = settings();
    if (idx.length > s2.keepMonths) {
      var drop = idx.splice(s2.keepMonths);
      drop.forEach(function (r) {
        try {
          localStorage.removeItem(LS_PREFIX + r.month);
        } catch (_) {}
      });
    }
    writeIndex(idx);
    try {
      if (typeof config !== 'undefined' && config.addAudit) {
        config.addAudit(
          'facturas_archivadas',
          yyyyMm + ' · ' + toArchive.length + ' comprobante(s) → archivo local · activos: ' + keep.length
        );
      }
    } catch (_) {}
    return { ok: true, month: yyyyMm, archived: toArchive.length, active: keep.length };
  }

  function pickMonthToArchive(facturas) {
    var s = settings();
    if (facturas.length <= s.maxActivas) return null;
    var groups = groupMonths(facturas);
    var months = Object.keys(groups).sort();
    for (var i = 0; i < months.length; i++) {
      var mk = months[i];
      if (daysAgo(lastDayOfMonth(mk)) < s.minAgeDays) continue;
      var remaining = facturas.length - groups[mk].length;
      if (remaining > 0) return mk;
    }
    return null;
  }

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function periodBounds(days) {
    days = Math.max(1, Number(days) || 1);
    var end = new Date();
    end.setHours(23, 59, 59, 999);
    var start = new Date(end);
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);
    var pad = function (n) {
      return String(n).padStart(2, '0');
    };
    return {
      from:
        start.getFullYear() + '-' + pad(start.getMonth() + 1) + '-' + pad(start.getDate()),
      to: end.getFullYear() + '-' + pad(end.getMonth() + 1) + '-' + pad(end.getDate()),
    };
  }

  function facturaInBounds(f, fromIso, toIso) {
    var dk = facturaDateKey(f);
    if (!dk) return false;
    return dk >= fromIso && dk <= toIso;
  }

  function monthsBetween(fromIso, toIso) {
    var out = [];
    if (!fromIso || !toIso) return out;
    var p = fromIso.slice(0, 7);
    var end = toIso.slice(0, 7);
    while (p <= end) {
      out.push(p);
      var y = parseInt(p.slice(0, 4), 10);
      var m = parseInt(p.slice(5, 7), 10);
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
      p = y + '-' + String(m).padStart(2, '0');
    }
    return out;
  }

  function oldestActiveDate(facturas) {
    var min = '';
    (facturas || []).forEach(function (f) {
      var dk = facturaDateKey(f);
      if (dk && (!min || dk < min)) min = dk;
    });
    return min;
  }

  function loadArchiveMonths(monthKeys) {
    var loaded = [];
    (monthKeys || []).forEach(function (mk) {
      var blob = readMonthBlob(mk);
      if (!blob || !Array.isArray(blob.facturas)) return;
      blob.facturas.forEach(function (f, i) {
        loaded.push({ f: f, archived: true, archId: mk + ':' + i });
      });
    });
    return loaded;
  }

  /** Carga facturas archivadas necesarias para el rango de días (solo bajo demanda). */
  function loadForPeriod(days) {
    days = Math.max(1, Number(days) || settings().defaultViewDays);
    var key = String(days);
    if (__periodArchiveKey === key) {
      return Promise.resolve(__periodArchiveCache);
    }
    var bounds = periodBounds(days);
    var monthKeys = monthsBetween(bounds.from, bounds.to);
    var currentMonth = monthKey(todayIso());
    var archivedMonths = readIndex().map(function (r) {
      return r && r.month;
    });
    monthKeys = monthKeys.filter(function (mk) {
      return mk < currentMonth && archivedMonths.indexOf(mk) >= 0;
    });
    return new Promise(function (resolve) {
      try {
        __periodArchiveCache = loadArchiveMonths(monthKeys).filter(function (row) {
          return facturaInBounds(row.f, bounds.from, bounds.to);
        });
        __periodArchiveKey = key;
        resolve(__periodArchiveCache);
      } catch (e) {
        console.warn('[facturas-archivo] loadForPeriod', e);
        resolve([]);
      }
    });
  }

  function clearPeriodCache() {
    __periodArchiveKey = '';
    __periodArchiveCache = [];
  }

  /** Archiva meses calendario ya cerrados (fin de mes + política minAgeDays). */
  function archiveCompleteMonths() {
    var all = typeof config !== 'undefined' && config.getFacturas ? config.getFacturas() || [] : [];
    if (!all.length) return { archived: 0 };
    var groups = groupMonths(all);
    var months = Object.keys(groups).sort();
    var currentMonth = monthKey(todayIso());
    var n = 0;
    for (var i = 0; i < months.length; i++) {
      var mk = months[i];
      if (mk >= currentMonth) continue;
      var endIso = lastDayOfMonth(mk);
      if (daysAgo(endIso) < settings().minAgeDays) continue;
      var r = archiveMonth(mk, { force: false });
      if (r.ok) n += r.archived || 0;
    }
    if (n) clearPeriodCache();
    return { archived: n };
  }

  function maybeAutoArchive() {
    var s = settings();
    if (!s.enabled) return { ok: false, skipped: 'disabled' };
    var closed = archiveCompleteMonths();
    if (closed.archived > 0) return { ok: true, auto: true, archived: closed.archived, reason: 'month_close' };
    var all = typeof config !== 'undefined' && config.getFacturas ? config.getFacturas() || [] : [];
    if (all.length <= s.maxActivas) return { ok: false, skipped: 'under_limit', active: all.length };
    var mk = pickMonthToArchive(all);
    if (!mk) return { ok: false, skipped: 'no_eligible_month', active: all.length };
    var r = archiveMonth(mk, { force: false, auto: true });
    if (r.ok) clearPeriodCache();
    return r;
  }

  function scheduleAutoArchive() {
    clearTimeout(__autoTimer);
    __autoTimer = setTimeout(function () {
      try {
        maybeAutoArchive();
      } catch (_) {}
    }, 2000);
  }

  function stats() {
    var idx = readIndex();
    var active = typeof config !== 'undefined' && config.getFacturas ? (config.getFacturas() || []).length : 0;
    var archived = idx.reduce(function (a, r) {
      return a + (Number(r.count) || 0);
    }, 0);
    return {
      active: active,
      archived: archived,
      months: idx.length,
      index: idx,
      settings: settings(),
    };
  }

  function exportMonthJson(yyyyMm) {
    var blob = readMonthBlob(yyyyMm);
    if (!blob) return false;
    try {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(blob, null, 2)], { type: 'application/json' }));
      a.download = 'facturas_archivo_' + yyyyMm + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
      return true;
    } catch (_) {
      return false;
    }
  }

  function renderFacturasArchivoBannerHtml() {
    var st = stats();
    if (!st.settings.enabled && !st.months) return '';
    var s = st.settings;
    var warn = st.active >= s.maxActivas * 0.9;
    var idxRows =
      st.index.length === 0
        ? '<p class="crozzo-fact-archivo__empty">Sin meses archivados aún. Meses calendario cerrados (≥ ' +
          s.minAgeDays +
          ' días) se archivan solos; también si supera ' +
          s.maxActivas +
          ' comprobantes activos.</p>'
        : '<ul class="crozzo-fact-archivo__list">' +
          st.index
            .slice(0, 6)
            .map(function (r) {
              return (
                '<li><span>' +
                r.month +
                '</span> · ' +
                r.count +
                ' docs · $' +
                Math.round(Number(r.total) || 0).toLocaleString('es-CO') +
                ' <button type="button" class="btn btn-outline btn-sm" onclick="crozzoFacturasArchivoExport(\'' +
                r.month +
                '\')">JSON</button></li>'
              );
            })
            .join('') +
          '</ul>';
    return (
      '<div class="crozzo-fact-archivo' +
      (warn ? ' crozzo-fact-archivo--warn' : '') +
      '">' +
      '<div class="crozzo-fact-archivo__head"><strong>Archivo mensual</strong> · ' +
      st.active +
      ' activos · ' +
      st.archived +
      ' archivados (' +
      st.months +
      ' meses)</div>' +
      idxRows +
      '<div class="crozzo-fact-archivo__actions">' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="crozzoFacturasArchivoRunAuto()">Archivar elegible ahora</button>' +
      '</div></div>'
    );
  }

  global.CrozzoFacturasArchivo = {
    settings: settings,
    stats: stats,
    archiveMonth: archiveMonth,
    archiveCompleteMonths: archiveCompleteMonths,
    maybeAutoArchive: maybeAutoArchive,
    scheduleAutoArchive: scheduleAutoArchive,
    exportMonthJson: exportMonthJson,
    renderBannerHtml: renderFacturasArchivoBannerHtml,
    periodBounds: periodBounds,
    facturaInBounds: facturaInBounds,
    loadForPeriod: loadForPeriod,
    clearPeriodCache: clearPeriodCache,
    todayIso: todayIso,
  };

  global.crozzoFacturasArchivoRunAuto = function () {
    var r = maybeAutoArchive();
    if (r.ok) {
      if (typeof showToast === 'function') showToast('Archivado ' + r.month + ' · ' + r.archived + ' comprobantes', 'success');
      if (typeof renderPage === 'function' && typeof currentPage !== 'undefined' && currentPage === 'facturas') {
        renderPage('facturas');
      }
    } else if (typeof showToast === 'function') {
      showToast(
        r.skipped === 'under_limit'
          ? 'Aún no se necesita archivo (' + (r.active || stats().active) + ' activos)'
          : r.reason === 'mes_reciente'
            ? 'El mes candidato es muy reciente (política ' + settings().minAgeDays + ' días)'
            : 'No hay mes elegible para archivar',
        'info'
      );
    }
    return r;
  };

  global.crozzoFacturasArchivoExport = function (yyyyMm) {
    if (exportMonthJson(yyyyMm)) {
      if (typeof showToast === 'function') showToast('Exportado ' + yyyyMm, 'success');
    } else if (typeof showToast === 'function') showToast('No se pudo exportar', 'warning');
  };

  global.crozzoFacturasArchivoStats = stats;
})(typeof window !== 'undefined' ? window : globalThis);
