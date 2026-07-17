/**
 * Crozzo — Dominios de sync nube según perfil de usuario (mesero, cocina, caja, admin).
 * Intersecta con PAGE_REGISTRY.domains; no bloquea transporte Z0 de escritura (invariante #5).
 */
(function (global) {
  'use strict';

  /** null = sin filtro (todos los dominios de la pantalla). */
  var SYNC_DOMAINS_BY_PROFILE = {
    mesero: ['runtime', 'comandas'],
    caja: ['runtime', 'comandas', 'sales', 'clients', 'queue'],
    cocina: ['comandas', 'preparations', 'products'],
    encargado: null,
    admin: null,
    superadmin: null,
    inventario: ['products', 'preparations', 'tenant', 'queue'],
    kiosko: ['comandas'],
  };

  function safe(fn) {
    try {
      return fn();
    } catch (_) {
      return undefined;
    }
  }

  function normalizeProfileId(raw) {
    raw = String(raw || '').trim().toLowerCase();
    if (!raw) return '';
    if (global.CrozzoPerfilesLogica && typeof global.CrozzoPerfilesLogica.normalizeRol === 'function') {
      return global.CrozzoPerfilesLogica.normalizeRol(raw);
    }
    return raw;
  }

  function resolveStaffRolFromSession() {
    try {
      if (global.__crozzoKioskChosenThisBoot) return 'kiosko';
    } catch (_) {}
    try {
      if (typeof global.crozzoKioskComandasEffective === 'function' && global.crozzoKioskComandasEffective()) {
        return 'kiosko';
      }
    } catch (_) {}
    var sid = safe(function () {
      return global.sessionStorage.getItem('crozzo_session_user');
    });
    if (!sid || !String(sid).trim()) return '';
    try {
      if (typeof global.getCurrentUser === 'function') {
        var u = global.getCurrentUser();
        if (u && (u.rol || u.role)) return normalizeProfileId(u.rol || u.role);
      }
    } catch (_) {}
    try {
      if (typeof global.crozzoResolveSessionStaffIdentity === 'function') {
        var ident = global.crozzoResolveSessionStaffIdentity();
        if (ident && (ident.rol || ident.role)) return normalizeProfileId(ident.rol || ident.role);
      }
    } catch (_) {}
    return '';
  }

  function profileIdNow() {
    return resolveStaffRolFromSession();
  }

  function allowedDomainsForProfile(profileId) {
    profileId = normalizeProfileId(profileId);
    if (!profileId) return null;
    if (Object.prototype.hasOwnProperty.call(SYNC_DOMAINS_BY_PROFILE, profileId)) {
      return SYNC_DOMAINS_BY_PROFILE[profileId];
    }
    return null;
  }

  /** PAGE.domains ∩ perfil usuario (si perfil define lista). */
  function effectiveSyncDomains(pageDomains, profileId) {
    if (!Array.isArray(pageDomains) || !pageDomains.length) return [];
    var allowed = allowedDomainsForProfile(profileId != null ? profileId : profileIdNow());
    if (!allowed || !allowed.length) return pageDomains.slice();
    var out = [];
    for (var i = 0; i < pageDomains.length; i++) {
      if (allowed.indexOf(pageDomains[i]) >= 0) out.push(pageDomains[i]);
    }
    return out;
  }

  global.CrozzoUserSyncProfile = {
    SYNC_DOMAINS_BY_PROFILE: SYNC_DOMAINS_BY_PROFILE,
    profileIdNow: profileIdNow,
    allowedDomainsForProfile: allowedDomainsForProfile,
    effectiveSyncDomains: effectiveSyncDomains,
  };
  global.crozzoUserSyncProfileId = profileIdNow;
  global.crozzoEffectiveSyncDomains = function (pageDomains) {
    return effectiveSyncDomains(pageDomains);
  };
})(typeof window !== 'undefined' ? window : globalThis);
