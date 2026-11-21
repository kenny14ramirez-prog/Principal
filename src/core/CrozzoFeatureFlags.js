/**
 * Crozzo POS — Feature Flags (Fase -2)
 * ------------------------------------
 * Flags mínimos para migración gradual y rollback.
 * Se leen de localStorage['crozzo_feature_flags_v1'] o de config.pos_dian_config.featureFlags.
 * Por defecto todos desactivados (comportamiento actual).
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    useSqliteFiscal: false,        // dual-write SQLite para facturas
    useHlcSync: false,              // HLC por entidad en sync
    useTombstones: false,           // tombstones para mesas/slots
    useDedupMultilevel: false,     // dedup multinivel
    useOutboxRuntime: false,        // outbox persistente para runtime
    useRlsBusinessId: false,       // RLS por business_id (modo compatibilidad)
    useCspEnforce: true,           // CSP enforce (activado)
    useQrLocal: false,              // QR local (librería cliente)
    useTypeScriptModules: false,    // módulos TS (gradual)
    useSanitizeInnerHtml: true,    // sanitización automática de innerHTML (monkey-patch) - activado por defecto Fase -2
    use2faAdmin: false,           // 2FA TOTP para admin/superadmin (PoC)
    useVisionOcr: false           // OCR con LLM de visión (opt-in, solo tier full; Tesseract sigue siendo primario)
  };

  function load() {
    try {
      var raw = null;
      try { raw = global.localStorage.getItem('crozzo_feature_flags_v1'); } catch (_) {}
      if (!raw && global.config && global.config.featureFlags) raw = JSON.stringify(global.config.featureFlags);
      if (raw) {
        var parsed = JSON.parse(raw);
        return Object.assign({}, DEFAULTS, parsed || {});
      }
    } catch (_) {}
    return Object.assign({}, DEFAULTS);
  }

  function save(flags) {
    try {
      global.localStorage.setItem('crozzo_feature_flags_v1', JSON.stringify(flags || {}));
    } catch (_) {}
  }

  function isEnabled(name) {
    var f = load();
    return !!(f && f[name]);
  }

  function set(name, value) {
    var f = load();
    f[name] = !!value;
    save(f);
    return f;
  }

  function getAll() {
    return load();
  }

  global.CrozzoFeatureFlags = {
    DEFAULTS: DEFAULTS,
    load: load,
    save: save,
    isEnabled: isEnabled,
    set: set,
    getAll: getAll
  };
})(typeof window !== 'undefined' ? window : globalThis);
