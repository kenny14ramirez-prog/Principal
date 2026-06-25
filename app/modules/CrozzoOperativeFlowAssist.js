/**
 * Crozzo POS — Asistencia por área: colas, ETA, más libre/ocupada. UI mínima, sin bloquear.
 */
(function (global) {
  'use strict';

  var POLL_MS = 15000;
  var BURST_WINDOW_MS = 5 * 60000;
  var CAJA_ALERT_COOLDOWN_MS = 240000;
  var _pollTimer = null;
  var _lastSendHintKey = '';
  var _lastSendHintAt = 0;
  var _cajaAlertAt = {};
  var _prevAreaLevel = {};

  var LEVEL_RANK = { ok: 0, busy: 1, saturated: 2, collapsed: 3 };

  function esc(s) {
    if (typeof global.escHtml === 'function') return global.escHtml(String(s == null ? '' : s));
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getComandasList() {
    try {
      if (typeof global.crozzoGetComandasList === 'function') return global.crozzoGetComandasList();
      if (Array.isArray(global.comandas)) return global.comandas.slice();
    } catch (_) {}
    return [];
  }

  function getAreasConfig() {
    try {
      if (typeof global.getComandasConfig === 'function') {
        var cfg = global.getComandasConfig();
        return Array.isArray(cfg.areas) ? cfg.areas : [];
      }
    } catch (_) {}
    return [{ id: 'COCINA', nombre: 'Cocina', tiempoOkMin: 8, tiempoWarnMin: 15 }];
  }

  function areaTargets(areaId) {
    try {
      if (typeof global.crozzoComandaAreaTimeTargets === 'function') {
        return global.crozzoComandaAreaTimeTargets(areaId);
      }
    } catch (_) {}
    return { okMin: 8, warnMin: 15 };
  }

  function getCapacity() {
    try {
      if (global.CrozzoOperativePsyche && typeof global.CrozzoOperativePsyche.detectSalonCapacity === 'function') {
        return global.CrozzoOperativePsyche.detectSalonCapacity();
      }
    } catch (_) {}
    return 12;
  }

  function getRoleNorm() {
    try {
      if (typeof global.crozzoNormalizeAppRol === 'function' && typeof global.getCurrentUser === 'function') {
        var u = global.getCurrentUser();
        if (u && u.rol) return global.crozzoNormalizeAppRol(u.rol);
      }
    } catch (_) {}
    return '';
  }

  function isHighLoadUi() {
    try {
      if (global.CrozzoOperativePsyche && typeof global.CrozzoOperativePsyche.isTempoHighLoad === 'function') {
        return global.CrozzoOperativePsyche.isTempoHighLoad();
      }
    } catch (_) {}
    return false;
  }

  function isCajaRole(role) {
    return role === 'caja' || role === 'admin' || role === 'gerente';
  }

  function computeThresholds() {
    var cap = Math.max(4, Math.min(80, getCapacity()));
    return {
      busyPending: Math.max(3, Math.round(cap * 0.22)),
      collapsePending: Math.max(5, Math.round(cap * 0.38)),
      burstRecent: Math.max(4, Math.round(cap * 0.28)),
    };
  }

  function comandaElapsedMs(c) {
    var t = c && (c.createdAt || c.lastUpdateAt);
    if (!t) return 0;
    var ms = Date.parse(t);
    if (!ms || isNaN(ms)) return 0;
    return Math.max(0, Date.now() - ms);
  }

  function isActiveComanda(c) {
    return c && String(c.estado || '') !== 'entregada';
  }

  function isPendingComanda(c) {
    return String(c && c.estado || 'pendiente') === 'pendiente';
  }

  function isPreparingComanda(c) {
    return String(c && c.estado || '') === 'preparando';
  }

  function loadScore(snap) {
    return snap.etaMin + snap.levelRank * 9 + snap.pendingCount * 2.2 + snap.delayedCount * 1.5;
  }

  function shortName(nombre) {
    var n = String(nombre || '').trim();
    if (!n) return '?';
    if (n.length <= 4) return n;
    var w = n.split(/\s+/)[0];
    return w.length <= 4 ? w : w.slice(0, 3);
  }

  function resolveLevel(metrics, th) {
    if (
      metrics.pendingCount >= th.collapsePending &&
      (metrics.delayedCount >= 2 || metrics.avgWaitMin >= metrics.warnMin)
    ) {
      return 'collapsed';
    }
    if (metrics.recentBurst >= th.burstRecent || metrics.delayedCount >= 3) return 'saturated';
    if (metrics.pendingCount >= th.busyPending || metrics.avgWaitMin >= metrics.okMin) return 'busy';
    return 'ok';
  }

  function estimateEtaMin(metrics) {
    var prep = Math.max(1, metrics.okMin);
    var queue = metrics.pendingCount;
    var inPrep = metrics.preparingCount;
    var backlog = queue * prep + inPrep * prep * 0.45;
    if (metrics.oldestWaitMin > metrics.warnMin) {
      backlog += Math.min(12, (metrics.oldestWaitMin - metrics.warnMin) * 0.6);
    }
    return Math.max(1, Math.round(backlog || prep));
  }

  function analyzeArea(areaId, areaCfg, th, now) {
    var targets = areaTargets(areaId);
    var okMin = targets.okMin;
    var warnMin = targets.warnMin;
    var list = getComandasList().filter(function (c) {
      return c && c.areaId === areaId && isActiveComanda(c);
    });
    var pendingCount = 0;
    var preparingCount = 0;
    var delayedCount = 0;
    var waitSum = 0;
    var oldestWaitMin = 0;
    var recentBurst = 0;

    list.forEach(function (c) {
      var elapsed = comandaElapsedMs(c);
      var waitMin = elapsed / 60000;
      waitSum += waitMin;
      if (waitMin > oldestWaitMin) oldestWaitMin = waitMin;
      if (isPendingComanda(c)) pendingCount++;
      if (isPreparingComanda(c)) preparingCount++;
      if (waitMin >= warnMin) delayedCount++;
      var created = Date.parse(c.createdAt || '');
      if (created && now - created <= BURST_WINDOW_MS) recentBurst++;
    });

    var activeCount = list.length;
    var avgWaitMin = activeCount ? waitSum / activeCount : 0;
    var metrics = {
      areaId: areaId,
      nombre: (areaCfg && areaCfg.nombre) || areaId,
      short: shortName((areaCfg && areaCfg.nombre) || areaId),
      okMin: okMin,
      warnMin: warnMin,
      activeCount: activeCount,
      pendingCount: pendingCount,
      preparingCount: preparingCount,
      delayedCount: delayedCount,
      avgWaitMin: Math.round(avgWaitMin * 10) / 10,
      oldestWaitMin: Math.round(oldestWaitMin * 10) / 10,
      recentBurst: recentBurst,
    };
    metrics.level = resolveLevel(metrics, th);
    metrics.etaMin = estimateEtaMin(metrics);
    metrics.levelRank = LEVEL_RANK[metrics.level] || 0;
    metrics.score = loadScore(metrics);
    return metrics;
  }

  function getAllAreaSnapshots() {
    var th = computeThresholds();
    var now = Date.now();
    return getAreasConfig()
      .map(function (a) {
        return analyzeArea(a.id, a, th, now);
      })
      .sort(function (a, b) {
        return b.score - a.score;
      });
  }

  function getAreaSnapshot(areaId) {
    var areas = getAreasConfig();
    var hit = areas.find(function (a) {
      return a.id === areaId;
    });
    return analyzeArea(areaId, hit || { id: areaId, nombre: areaId }, computeThresholds(), Date.now());
  }

  function getRouteHint() {
    var snaps = getAllAreaSnapshots();
    if (snaps.length < 1) return null;
    var byFree = snaps.slice().sort(function (a, b) {
      return a.score - b.score;
    });
    var freest = byFree[0];
    var busiest = snaps[0];
    if (!freest || !busiest) return null;
    if (snaps.length === 1) {
      if (busiest.levelRank < LEVEL_RANK.busy) return null;
      return { freest: freest, busiest: busiest, delta: busiest.etaMin, single: true };
    }
    var delta = busiest.etaMin - freest.etaMin;
    if (busiest.levelRank <= LEVEL_RANK.busy && delta < 3) return null;
    return { freest: freest, busiest: busiest, delta: delta, single: false };
  }

  function predictAreasForItems(items) {
    var out = {};
    if (!Array.isArray(items) || !items.length) return out;
    var defaultArea = getAreasConfig()[0] ? getAreasConfig()[0].id : 'COCINA';
    items.forEach(function (it) {
      var ids = [];
      try {
        if (typeof global.crozzoProductComandaAreas === 'function') ids = global.crozzoProductComandaAreas(it);
      } catch (_) {}
      if (!ids.length) ids = [it.areaComanda || defaultArea];
      ids.forEach(function (id) {
        out[id] = (out[id] || 0) + (Number(it && it.cantidad) || 1);
      });
    });
    return out;
  }

  function getCartSendEtas(items) {
    var map = predictAreasForItems(items);
    var snaps = getAllAreaSnapshots();
    var out = [];
    Object.keys(map).forEach(function (areaId) {
      var snap = snaps.find(function (s) {
        return s.areaId === areaId;
      });
      if (!snap) snap = getAreaSnapshot(areaId);
      out.push({
        areaId: areaId,
        nombre: snap.nombre,
        short: snap.short,
        level: snap.level,
        etaMin: snap.etaMin,
        pendingCount: snap.pendingCount,
        qty: map[areaId],
        levelRank: snap.levelRank,
      });
    });
    out.sort(function (a, b) {
      return (b.levelRank || 0) - (a.levelRank || 0) || b.etaMin - a.etaMin;
    });
    return out;
  }

  function levelClass(level) {
    return 'crozzo-flow-lvl--' + (level || 'ok');
  }

  function buildMicroLine(opts) {
    opts = opts || {};
    var hint = getRouteHint();
    if (!hint) return { line: '', title: '', level: 'ok', visible: false };
    var freest = hint.freest;
    var busiest = hint.busiest;
    var role = opts.role || getRoleNorm();
    var line = '';
    var title = '';

    if (hint.single) {
      line = '↑' + busiest.short + ' ' + busiest.etaMin + 'm';
      title = busiest.nombre + ' · ' + busiest.pendingCount + ' en cola · ~' + busiest.etaMin + ' min';
    } else if (isCajaRole(role)) {
      line = freest.short + ' ' + freest.etaMin + ' · ↑' + busiest.short + ' ' + busiest.etaMin;
      title =
        'Más libre: ' +
        freest.nombre +
        ' (~' +
        freest.etaMin +
        ' min) · Más cargada: ' +
        busiest.nombre +
        ' (~' +
        busiest.etaMin +
        ' min, ' +
        busiest.pendingCount +
        ' cola)';
    } else {
      line = freest.short + '↓' + freest.etaMin + ' · ' + busiest.short + '↑' + busiest.etaMin;
      title =
        'Sugerencia: ' +
        freest.nombre +
        ' más ágil · ' +
        busiest.nombre +
        ' más llena — avise tiempos al cliente';
    }

    return {
      line: line,
      title: title,
      level: busiest.level,
      visible: true,
      freest: freest,
      busiest: busiest,
    };
  }

  function buildCartTitle(items) {
    var etas = getCartSendEtas(items);
    if (!etas.length) return '';
    var worst = etas[0];
    if (worst.levelRank <= LEVEL_RANK.busy && worst.pendingCount <= 2) {
      return etas.map(function (e) {
        return e.short + ' ~' + e.etaMin + 'm';
      }).join(' · ');
    }
    var hint = getRouteHint();
    var base = etas
      .map(function (e) {
        return e.short + (e.levelRank >= LEVEL_RANK.saturated ? '↑' : '') + ' ~' + e.etaMin + 'm';
      })
      .join(' · ');
    if (hint && !hint.single) {
      return base + ' · más libre: ' + hint.freest.short;
    }
    return base;
  }

  function buildSendToastMessage(touchedIds) {
    var ids = Array.isArray(touchedIds) ? touchedIds : [];
    var list = getComandasList();
    var areaIds = {};
    ids.forEach(function (id) {
      var c = list.find(function (x) {
        return x && x.id === id;
      });
      if (c && c.areaId) areaIds[c.areaId] = true;
    });
    var snaps = Object.keys(areaIds)
      .map(function (aid) {
        return getAreaSnapshot(aid);
      })
      .sort(function (a, b) {
        return b.levelRank - a.levelRank;
      });
    if (!snaps.length) return '';
    if (snaps[0].levelRank <= LEVEL_RANK.busy) return '';
    return snaps
      .map(function (s) {
        return s.short + (s.levelRank >= LEVEL_RANK.saturated ? '↑' : '') + ' ~' + s.etaMin + 'm';
      })
      .join(' · ');
  }

  function shouldShowHeaderCue(role, page) {
    if (role === 'mesero') return page === 'tablets';
    if (role === 'cocina' || role === 'chef') return page === 'comandas' || page === 'cocina';
    if (isCajaRole(role)) return page === 'cajero' || page === 'comandas' || page === 'tablets';
    return page === 'comandas';
  }

  function ensureHeaderCueHost() {
    var host = document.getElementById('crozzoFlowMicroCue');
    if (host) return host;
    var status = document.querySelector('.crozzo-header__status');
    if (!status) return null;
    host = document.createElement('button');
    host.type = 'button';
    host.id = 'crozzoFlowMicroCue';
    host.className = 'crozzo-flow-micro-cue';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    host.title = '';
    host.hidden = true;
    host.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
    });
    status.insertBefore(host, status.firstChild);
    return host;
  }

  function mountHeaderMicroCue() {
    var page = typeof global.currentPage !== 'undefined' ? global.currentPage : '';
    var role = getRoleNorm();
    var host = ensureHeaderCueHost();
    if (!host) return;
    if (!shouldShowHeaderCue(role, page)) {
      host.hidden = true;
      host.textContent = '';
      return;
    }
    var micro = buildMicroLine({ role: role });
    if (!micro.visible) {
      host.hidden = true;
      host.textContent = '';
      return;
    }
    host.hidden = false;
    host.textContent = micro.line;
    host.title = micro.title;
    host.className = 'crozzo-flow-micro-cue ' + levelClass(micro.level);
  }

  function updateCartButtonCue() {
    var btn = document.getElementById('btnTabletConfirmComanda');
    if (!btn) return;
    var cart = null;
    try {
      if (typeof global.getTabletActiveCart === 'function') cart = global.getTabletActiveCart();
    } catch (_) {}
    if (!cart || !cart.length) {
      btn.removeAttribute('data-crozzo-flow-title');
      if (btn.getAttribute('data-crozzo-flow-had-title') === '1') {
        btn.title = '';
        btn.removeAttribute('data-crozzo-flow-had-title');
      }
      return;
    }
    var pending = cart;
    try {
      if (typeof global.getTabletPendingItems === 'function') pending = global.getTabletPendingItems(cart);
    } catch (_) {}
    if (!pending.length) return;
    var t = buildCartTitle(pending);
    if (!t) return;
    btn.title = t;
    btn.setAttribute('data-crozzo-flow-had-title', '1');
  }

  function maybeCajaCollapseToast(snaps) {
    var role = getRoleNorm();
    if (!isCajaRole(role)) return;
    var now = Date.now();
    snaps.forEach(function (snap) {
      var prev = _prevAreaLevel[snap.areaId] || 'ok';
      var prevRank = LEVEL_RANK[prev] || 0;
      _prevAreaLevel[snap.areaId] = snap.level;
      if (snap.levelRank < LEVEL_RANK.saturated) return;
      var escalated = snap.levelRank > prevRank;
      var last = _cajaAlertAt[snap.areaId] || 0;
      if (!escalated && prevRank >= LEVEL_RANK.saturated) return;
      if (!escalated && now - last < CAJA_ALERT_COOLDOWN_MS) return;
      _cajaAlertAt[snap.areaId] = now;
      var msg =
        snap.short +
        (snap.level === 'collapsed' ? ' colapsa' : ' saturada') +
        ' · ' +
        snap.pendingCount +
        ' cola · ~' +
        snap.etaMin +
        'm';
      try {
        if (typeof global.showToast === 'function') global.showToast(msg, 'warning');
      } catch (_) {}
    });
  }

  function removeLegacyStrips() {
    document.querySelectorAll('[data-crozzo-area-flow-assist]').forEach(function (el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    document.querySelectorAll('.crozzo-area-flow-cart-hint').forEach(function (el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
  }

  function getStationNoteAssistHtml(areaId) {
    var snap = getAreaSnapshot(areaId);
    if (!snap || snap.activeCount === 0) return '';
    if (snap.levelRank <= LEVEL_RANK.busy && snap.pendingCount <= 1) return '';
    var mark = snap.levelRank >= LEVEL_RANK.saturated ? '↑' : '';
    var tip =
      snap.nombre +
      ' · ~' +
      snap.etaMin +
      ' min' +
      (snap.pendingCount ? ' · ' + snap.pendingCount + ' cola' : '');
    return (
      '<span class="crozzo-station-note__flow-micro ' +
      levelClass(snap.level) +
      '" data-crozzo-station-flow="' +
      esc(areaId) +
      '" title="' +
      esc(tip) +
      '"> · ' +
      mark +
      '~' +
      snap.etaMin +
      'm</span>'
    );
  }

  function getAreasAssistStripHtml() {
    return '';
  }

  function getCartAssistHintHtml() {
    return '';
  }

  function refreshStationNotes() {
    document.querySelectorAll('.crozzo-station-note[data-crozzo-comanda-area-id]').forEach(function (art) {
      var aid = art.getAttribute('data-crozzo-comanda-area-id');
      if (!aid) return;
      var old = art.querySelector('[data-crozzo-station-flow]');
      var html = getStationNoteAssistHtml(aid);
      if (old) {
        if (html) old.outerHTML = html;
        else if (old.parentNode) old.parentNode.removeChild(old);
        return;
      }
      if (!html) return;
      var countEl = art.querySelector('.crozzo-station-note__count');
      if (countEl) countEl.insertAdjacentHTML('beforeend', html);
    });
  }

  function onComandaSent(touchedIds) {
    var msg = buildSendToastMessage(touchedIds);
    if (msg) {
      var key = msg + '|' + (Array.isArray(touchedIds) ? touchedIds.join(',') : '');
      var now = Date.now();
      if (_lastSendHintKey !== key || now - _lastSendHintAt >= 8000) {
        _lastSendHintKey = key;
        _lastSendHintAt = now;
        try {
          if (typeof global.showToast === 'function') global.showToast(msg, 'info');
        } catch (_) {}
      }
    }
    refreshAssistChrome();
  }

  function refreshAssistChrome() {
    try {
      removeLegacyStrips();
      var snaps = getAllAreaSnapshots();
      maybeCajaCollapseToast(snaps);
      mountHeaderMicroCue();
      updateCartButtonCue();
      refreshStationNotes();
    } catch (e) {
      console.warn('[flow-assist]', e);
    }
  }

  function startPolling() {
    if (_pollTimer) return;
    _pollTimer = global.setInterval(refreshAssistChrome, POLL_MS);
  }

  function stopPolling() {
    if (!_pollTimer) return;
    global.clearInterval(_pollTimer);
    _pollTimer = null;
  }

  function init() {
    startPolling();
    refreshAssistChrome();
    try {
      global.addEventListener('crozzo:pos-operation-state', refreshAssistChrome);
      global.addEventListener('crozzo-salon-config-changed', refreshAssistChrome);
    } catch (_) {}
  }

  global.CrozzoOperativeFlowAssist = {
    getAllAreaSnapshots: getAllAreaSnapshots,
    getAreaSnapshot: getAreaSnapshot,
    getRouteHint: getRouteHint,
    predictAreasForItems: predictAreasForItems,
    getCartSendEtas: getCartSendEtas,
    getAreasAssistStripHtml: getAreasAssistStripHtml,
    getCartAssistHintHtml: getCartAssistHintHtml,
    getStationNoteAssistHtml: getStationNoteAssistHtml,
    buildMicroLine: buildMicroLine,
    getCartButtonTitle: buildCartTitle,
    onComandaSent: onComandaSent,
    refreshAssistChrome: refreshAssistChrome,
    startPolling: startPolling,
    stopPolling: stopPolling,
    init: init,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    global.setTimeout(init, 400);
  }
})(typeof window !== 'undefined' ? window : globalThis);
