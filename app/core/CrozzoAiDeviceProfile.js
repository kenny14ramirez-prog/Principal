/**
 * Bona Origen — Perfil de rendimiento para IA.
 * Clasifica el equipo en tiers de IA (disabled/light/medium/full) usando CrozzoDevicePerf
 * y navigator.deviceMemory/hardwareConcurrency. Notifica limitaciones.
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

  function getDeviceTier() {
    try {
      if (global.CrozzoDevicePerf && typeof global.CrozzoDevicePerf.tier === 'function') {
        var t = global.CrozzoDevicePerf.tier();
        var cores = (global.navigator && global.navigator.hardwareConcurrency) || 4;
        var mem = (global.navigator && global.navigator.deviceMemory) || null;
        // Clasificación IA
        if (t === 'low' && (mem === null || mem <= 2) && cores <= 2) return TIER_DISABLED;
        if (t === 'low') return TIER_LIGHT;
        if (t === 'medium') return TIER_MEDIUM;
        return TIER_FULL;
      }
    } catch (_) {}
    // Fallback por navigator
    var cores2 = (global.navigator && global.navigator.hardwareConcurrency) || 4;
    var mem2 = (global.navigator && global.navigator.deviceMemory) || 4;
    if (mem2 <= 2 && cores2 <= 2) return TIER_DISABLED;
    if (mem2 <= 4 || cores2 <= 4) return TIER_LIGHT;
    if (mem2 <= 8) return TIER_MEDIUM;
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
    // No ocultar el FAB; el asistente mostrará mensaje si está deshabilitado
  }

  global.CrozzoAiDeviceProfile = {
    getTier: getDeviceTier,
    recommendedModel: recommendedModel,
    isEnabled: isAiEnabled,
    notify: notifyTier,
    apply: applyTierToModelManager,
  };

  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { setTimeout(function () { notifyTier(); applyTierToModelManager(); }, 500); }, { once: true });
    } else {
      setTimeout(function () { notifyTier(); applyTierToModelManager(); }, 500);
    }
  } catch (_) {}
})(typeof window !== 'undefined' ? window : globalThis);