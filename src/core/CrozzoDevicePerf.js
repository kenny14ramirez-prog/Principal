/**
 * Crozzo POS — perfil de rendimiento adaptativo (PC potente vs tablet económica).
 * Expone tier high | medium | low y ajusta crozzo-perf-lite sin congelar la UI APK.
 */
(function (global) {
  'use strict';

  var TIER_HIGH = 'high';
  var TIER_MED = 'medium';
  var TIER_LOW = 'low';
  var _tier = null;
  var _jankScheduled = false;
  var _jankDone = false;
  var _contStarted = false;
  var _contTimer = null;
  var CONT_PROBE_MS = 120000;

  function safe(fn) {
    try {
      return fn();
    } catch (_) {}
  }

  function journalPerf(code, detail) {
    safe(function () {
      if (global.CrozzoOperativeJournal && typeof global.CrozzoOperativeJournal.record === 'function') {
        global.CrozzoOperativeJournal.record({ kind: 'perf', code: code, detail: detail });
      }
    });
  }

  function isAndroidApk() {
    try {
      var ua = String((global.navigator && global.navigator.userAgent) || '');
      var tauri = !!(global.__CROZZO_IS_TAURI__ || global.__TAURI__ || global.__TAURI_INTERNALS__);
      return /Android/i.test(ua) && tauri;
    } catch (_) {
      return false;
    }
  }

  function readManualTier() {
    try {
      var explicit = localStorage.getItem('crozzo_perf_tier');
      if (explicit === TIER_HIGH || explicit === TIER_MED || explicit === TIER_LOW) return explicit;
      var lite = localStorage.getItem('crozzo_perf_lite');
      if (lite === '0') return TIER_HIGH;
      if (lite === '1' || lite === 'true') return TIER_LOW;
    } catch (_) {}
    return null;
  }

  function scoreDevice() {
    var nav = global.navigator || {};
    var score = 0;
    var cores = nav.hardwareConcurrency || 4;
    var mem = nav.deviceMemory;
    var apk = isAndroidApk();

    if (cores <= 2) score += 5;
    else if (cores <= 4) score += 3;
    else if (cores <= 6) score += 1;

    if (mem != null) {
      if (mem <= 2) score += 5;
      else if (mem <= 3) score += 3;
      else if (mem <= 4) score += 2;
      else if (mem <= 6) score += 1;
    } else if (apk) {
      score += 2;
    }

    if (apk) score += 2;

    try {
      if (global.matchMedia && global.matchMedia('(pointer: coarse)').matches) score += 1;
    } catch (_) {}

    if (!apk && cores >= 8 && (mem == null || mem >= 8)) score = Math.max(0, score - 3);

    return score;
  }

  function scoreToTier(score) {
    if (score >= 6) return TIER_LOW;
    if (score >= 3) return TIER_MED;
    return TIER_HIGH;
  }

  function detectTier() {
    var manual = readManualTier();
    if (manual) return manual;
    return scoreToTier(scoreDevice());
  }

  function applyTier(tier, opts) {
    opts = opts || {};
    _tier = tier;
    var doc = global.document && global.document.documentElement;
    if (!doc) return tier;
    doc.setAttribute('data-crozzo-perf-tier', tier);
    var lite = tier === TIER_LOW || tier === TIER_MED;
    try {
      if (localStorage.getItem('crozzo_perf_lite') === '0' && tier !== TIER_LOW) lite = false;
    } catch (_) {}
    doc.classList.toggle('crozzo-perf-lite', lite);
    doc.classList.toggle('crozzo-perf-minimal', tier === TIER_LOW);
    if (opts.fromJank && tier === TIER_LOW) {
      try {
        doc.setAttribute('data-crozzo-perf-jank', '1');
      } catch (_) {}
    }
    return tier;
  }

  function scheduleJankProbe() {
    if (_jankScheduled || _jankDone) return;
    _jankScheduled = true;
    var run = function () {
      if (_jankDone || readManualTier()) return;
      _jankDone = true;
      var last = 0;
      var spikes = 0;
      var n = 0;
      function frame(t) {
        if (last) {
          if (t - last > 34) spikes++;
          n++;
        }
        last = t;
        if (n < 20) {
          global.requestAnimationFrame(frame);
          return;
        }
        if (spikes >= 5 && _tier !== TIER_LOW) {
          applyTier(TIER_LOW, { fromJank: true });
          journalPerf('jank_boot', { spikes: spikes });
        }
      }
      global.requestAnimationFrame(function (t) {
        last = t;
        global.requestAnimationFrame(frame);
      });
    };
    if (global.requestIdleCallback) {
      global.requestIdleCallback(run, { timeout: 4000 });
    } else {
      global.setTimeout(run, 1200);
    }
  }

  function runContinuousJankSample() {
    if (readManualTier()) return;
    if (typeof global.crozzoOperationalRealtimeActive === 'function' && !global.crozzoOperationalRealtimeActive()) {
      return;
    }
    if (typeof document !== 'undefined' && document.hidden) return;
    var last = 0;
    var spikes = 0;
    var n = 0;
    function frame(t) {
      if (last) {
        if (t - last > 34) spikes++;
        n++;
      }
      last = t;
      if (n < 15) {
        global.requestAnimationFrame(frame);
        return;
      }
      if (spikes >= 4 && _tier !== TIER_LOW) {
        applyTier(TIER_LOW, { fromJank: true });
        journalPerf('jank_sustained', { spikes: spikes, tier: TIER_LOW });
      }
    }
    global.requestAnimationFrame(function (t) {
      last = t;
      global.requestAnimationFrame(frame);
    });
  }

  function startContinuousProbe() {
    if (_contStarted) return;
    _contStarted = true;
    global.setTimeout(function () {
      runContinuousJankSample();
    }, 18000);
    _contTimer = global.setInterval(runContinuousJankSample, CONT_PROBE_MS);
  }

  function apply() {
    applyTier(detectTier());
    scheduleJankProbe();
    return _tier;
  }

  function tier() {
    if (!_tier) apply();
    return _tier || TIER_MED;
  }

  function comandaFxMode() {
    try {
      if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'minimal';
    } catch (_) {}
    var t = tier();
    if (t === TIER_LOW) return 'minimal';
    if (t === TIER_MED) return 'lite';
    return 'full';
  }

  function sortableAnimationMs() {
    var t = tier();
    if (t === TIER_LOW) return 0;
    if (t === TIER_MED) return 120;
    return 200;
  }

  global.crozzoDevicePerfApply = apply;
  global.crozzoDevicePerfTier = tier;
  global.crozzoComandaFxMode = comandaFxMode;
  global.crozzoDeviceSortableAnimMs = sortableAnimationMs;
  global.CrozzoDevicePerf = {
    apply: apply,
    tier: tier,
    comandaFxMode: comandaFxMode,
    sortableAnimationMs: sortableAnimationMs,
    startContinuousProbe: startContinuousProbe,
  };

  apply();
})(typeof window !== 'undefined' ? window : global);
