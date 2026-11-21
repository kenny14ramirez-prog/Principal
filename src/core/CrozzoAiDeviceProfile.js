/**
 * Bona Origen — Perfil de rendimiento para IA.
 * Clasifica el equipo en tiers de IA (disabled/light/medium/full) usando RAM real
 * (crozzo_device_ram vía Tauri) con fallback a navigator.deviceMemory.
 */
(function (global) {
  'use strict';

  var TIER_DISABLED = 'disabled';
  var TIER_LIGHT = 'light';
  var TIER_MEDIUM = 'medium';
  var TIER_FULL = 'full';

  var MODEL_BY_TIER = {
    disabled: null,
    light: 'qwen2.5:1.5b',
    medium: 'phi4-mini',
    full: 'llama3.2:3b',
  };

  var MESSAGES = {
    disabled: 'Su equipo tiene rendimiento muy bajo. El asistente IA no puede ejecutarse aquí. Se deshabilita para evitar lentitud.',
    light: 'Equipo de bajo rendimiento: se usará un modelo ligero (rápido, menos preciso).',
    medium: 'Equipo de rendimiento medio: modelo balanceado.',
    full: 'Equipo de buen rendimiento: modelo completo disponible.',
  };

  var _realRamMB = null;
  var _ramPromise = null;

  function isTauri() {
    try { return !!(global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function'); } catch (_) { return false; }
  }

  function navigatorRamMB() {
    try {
      var nav = global.navigator || {};
      // navigator.deviceMemory está en GB y topeado a 8 en navegadores.
      if (typeof nav.deviceMemory === 'number' && isFinite(nav.deviceMemory) && nav.deviceMemory > 0) {
        return Math.round(nav.deviceMemory * 1024);
      }
    } catch (_) {}
    return null;
  }

  function fetchRealRam() {
    if (_ramPromise) return _ramPromise;
    _ramPromise = (async function () {
      if (isTauri()) {
        try {
          var r = await global.__TAURI__.core.invoke('crozzo_device_ram');
          var n = (typeof r === 'string') ? Number(r) : r;
          if (typeof n === 'number' && isFinite(n) && n > 0) {
            _realRamMB = Math.round(n);
            return _realRamMB;
          }
        } catch (e) { /* fallback */ }
      }
      var nm = navigatorRamMB();
      if (nm != null) _realRamMB = nm;
      return _realRamMB;
    })();
    return _ramPromise;
  }

  function getRamMB() {
    if (_realRamMB != null) return _realRamMB;
    try { fetchRealRam(); } catch (_) {}
    return navigatorRamMB();
  }

  function tierFromRam(ramMB) {
    var gb = (ramMB != null ? ramMB : 0) / 1024;
    if (gb < 4) return TIER_DISABLED;
    if (gb < 6) return TIER_LIGHT;
    if (gb < 10) return TIER_MEDIUM;
    return TIER_FULL;
  }

  function getDeviceTier() {
    var ram = getRamMB();
    if (ram != null) return tierFromRam(ram);
    // Fallback por navigator (memoria topeada a 8)
    var cores = (global.navigator && global.navigator.hardwareConcurrency) || 4;
    var mem = (global.navigator && global.navigator.deviceMemory) || 4;
    var memMB = mem * 1024;
    if (memMB < 4096 && cores <= 2) return TIER_DISABLED;
    if (memMB < 6144 || cores <= 4) return TIER_LIGHT;
    if (memMB < 10240) return TIER_MEDIUM;
    return TIER_FULL;
  }

  function recommendedModel(tier) {
    return MODEL_BY_TIER[tier] || null;
  }

  function isAiEnabled() {
    return getDeviceTier() !== TIER_DISABLED;
  }

  function notifyTier() {
    var tier = getDeviceTier();
    var msg = MESSAGES[tier];
    try {
      if (typeof global.showToast === 'function') {
        var type = tier === TIER_DISABLED ? 'warning' : 'info';
        global.showToast(msg, type);
      }
    } catch (_) {}
    try {
      if (global.CrozzoOperativeJournal && typeof global.CrozzoOperativeJournal.record === 'function') {
        global.CrozzoOperativeJournal.record({ kind: 'ai', code: 'device_tier', detail: tier + ': ' + msg });
      }
    } catch (_) {}
  }

  function applyTierToModelManager() {
    var tier = getDeviceTier();
    var model = recommendedModel(tier);
    if (model) {
      try { if (typeof localStorage !== 'undefined') localStorage.setItem('crozzo_ollama_model', model); } catch (_) {}
    }
  }

  global.CrozzoAiDeviceProfile = {
    getTier: getDeviceTier,
    recommendedModel: recommendedModel,
    isEnabled: isAiEnabled,
    notify: notifyTier,
    apply: applyTierToModelManager,
    getRamMB: getRamMB,
    refreshRam: fetchRealRam,
  };

  function init() {
    fetchRealRam().then(function () {
      try { notifyTier(); applyTierToModelManager(); } catch (_) {}
    }).catch(function () {
      try { notifyTier(); applyTierToModelManager(); } catch (_) {}
    });
  }

  try {
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 500); }, { once: true });
      } else {
        setTimeout(init, 500);
      }
    }
  } catch (_) {}
})(typeof window !== 'undefined' ? window : globalThis);