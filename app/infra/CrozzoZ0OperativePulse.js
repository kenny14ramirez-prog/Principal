/**
 * Crozzo — Pulso operativo Z0 (sensación tiempo real sin saturar nube).
 *
 * - Coalesced UI refresh vía requestAnimationFrame en cocina/comandas (≤1 paint/frame).
 * - Actividad reciente del usuario → PageCloudWatch puede acelerar tick suave.
 * - Envuelve crozzoScheduleOperationalPageRefresh sin tocar PosMain masivamente.
 */
(function (global) {
  'use strict';

  var FAST_PAGES = { comandas: 1, cocina: 1, cajero: 1, tablets: 1 };
  var FAST_MIN_GAP_MS = 16;
  var NORMAL_DEBOUNCE_MS = 120;
  var __lastActivityAt = 0;
  var __lastFastPaintAt = 0;
  var __fastRaf = 0;
  var __fastPage = '';
  var __normalTimer = null;
  var __normalPage = '';
  var __origSchedule = null;

  function safe(fn) {
    try {
      return fn();
    } catch (_) {
      return undefined;
    }
  }

  function activePage() {
    try {
      if (typeof global.crozzoGetActivePageId === 'function') {
        var p = String(global.crozzoGetActivePageId() || '').trim();
        if (p) return p;
      }
    } catch (_) {}
    try {
      if (global.CrozzoPageCloudWatch && typeof global.CrozzoPageCloudWatch.getActivePage === 'function') {
        var w = String(global.CrozzoPageCloudWatch.getActivePage() || '').trim();
        if (w) return w;
      }
    } catch (_) {}
    try {
      if (typeof global.currentPage !== 'undefined') return String(global.currentPage || '').trim();
    } catch (_) {}
    return '';
  }

  function isFastPage(page) {
    return !!FAST_PAGES[String(page || '').trim()];
  }

  function runRefresh(page) {
    page = String(page || activePage() || '').trim();
    if (!page) return false;
    try {
      if (typeof global.currentPage !== 'undefined' && global.currentPage !== page) return false;
    } catch (_) {}
    if (typeof global.crozzoPatchOperationalPageFromRemote === 'function') {
      if (global.crozzoPatchOperationalPageFromRemote(page)) return true;
    }
    if (typeof global.renderPage === 'function') {
      try {
        if (typeof global.crozzoPosIsOperationBusy === 'function' && global.crozzoPosIsOperationBusy()) {
          if (page === 'cajero' && typeof global.crozzoCajeroRefreshSlotPicker === 'function') {
            return !!global.crozzoCajeroRefreshSlotPicker();
          }
          if (page === 'tablets' && typeof global.crozzoPatchOperationalPageFromRemote === 'function') {
            return !!global.crozzoPatchOperationalPageFromRemote('tablets');
          }
          return false;
        }
        global.renderPage(page, { background: true });
        return true;
      } catch (_) {}
    }
    return false;
  }

  function flushFastLane() {
    __fastRaf = 0;
    var page = __fastPage;
    __fastPage = '';
    if (!page) return;
    __lastFastPaintAt = Date.now();
    runRefresh(page);
  }

  function scheduleFast(page) {
    page = String(page || activePage() || '').trim();
    if (!page || !isFastPage(page)) {
      scheduleNormal(page);
      return;
    }
    __fastPage = page;
    var now = Date.now();
    if (now - __lastFastPaintAt >= FAST_MIN_GAP_MS) {
      if (__fastRaf) {
        try {
          global.cancelAnimationFrame(__fastRaf);
        } catch (_) {}
        __fastRaf = 0;
      }
      flushFastLane();
      return;
    }
    if (__fastRaf) return;
    __fastRaf = global.requestAnimationFrame(flushFastLane);
  }

  function scheduleNormal(page) {
    page = String(page || activePage() || '').trim();
    if (!page) return;
    __normalPage = page;
    if (__normalTimer) return;
    __normalTimer = global.setTimeout(function () {
      __normalTimer = null;
      var p = __normalPage;
      __normalPage = '';
      runRefresh(p);
    }, NORMAL_DEBOUNCE_MS);
  }

  function crozzoZ0ScheduleUiRefresh(page, opts) {
    opts = opts || {};
    page = String(page || activePage() || '').trim();
    if (page && page.indexOf('_') >= 0 && !FAST_PAGES[page]) {
      var ap = activePage();
      if (ap) page = ap;
      else return;
    }
    if (!page) return;
    if (opts.lane === 'fast' || isFastPage(page)) scheduleFast(page);
    else scheduleNormal(page);
  }

  function crozzoNoteZ0UserActivity() {
    __lastActivityAt = Date.now();
  }

  function crozzoZ0UserActivityRecent(maxMs) {
    maxMs = maxMs == null ? 45000 : Number(maxMs) || 45000;
    return __lastActivityAt > 0 && Date.now() - __lastActivityAt < maxMs;
  }

  function crozzoZ0PulseState() {
    return {
      lastActivityAt: __lastActivityAt,
      activityRecent: crozzoZ0UserActivityRecent(45000),
      lastFastPaintAt: __lastFastPaintAt,
      fastPagePending: __fastPage,
      normalPagePending: __normalPage,
    };
  }

  function wrapScheduleRefresh() {
    if (typeof global.crozzoScheduleOperationalPageRefresh !== 'function') return false;
    if (__origSchedule) return true;
    __origSchedule = global.crozzoScheduleOperationalPageRefresh;
    global.crozzoScheduleOperationalPageRefresh = function (page) {
      page = String(page || activePage() || '').trim();
      if (!page) return;
      if (isFastPage(page)) scheduleFast(page);
      else __origSchedule(page);
    };
    return true;
  }

  function bindActivity() {
    if (global.__crozzoZ0ActivityBound) return;
    global.__crozzoZ0ActivityBound = true;
    var mark = function () {
      crozzoNoteZ0UserActivity();
    };
    safe(function () {
      global.addEventListener('pointerdown', mark, { passive: true, capture: true });
      global.addEventListener('keydown', mark, { passive: true, capture: true });
    });
    safe(function () {
      global.addEventListener('crozzo-comanda-estado', mark);
      global.addEventListener('crozzo-comanda-new', mark);
    });
  }

  function boot() {
    wrapScheduleRefresh();
    bindActivity();
  }

  if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    global.setTimeout(boot, 0);
  }

  global.CrozzoZ0OperativePulse = {
    schedule: crozzoZ0ScheduleUiRefresh,
    noteActivity: crozzoNoteZ0UserActivity,
    activityRecent: crozzoZ0UserActivityRecent,
    getState: crozzoZ0PulseState,
  };
  global.crozzoZ0ScheduleUiRefresh = crozzoZ0ScheduleUiRefresh;
  global.crozzoNoteZ0UserActivity = crozzoNoteZ0UserActivity;
  global.crozzoZ0UserActivityRecent = crozzoZ0UserActivityRecent;
  global.crozzoZ0PulseState = crozzoZ0PulseState;
})(typeof window !== 'undefined' ? window : globalThis);
