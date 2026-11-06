/**
 * UI helpers extraídos de CrozzoPosMain.js (F7, ola 1).
 */
(function (global) {
  'use strict';

  function crozzoIsMobilePhoneUi() {
    try {
      const doc = document.documentElement;
      if (!doc) return false;
      if (doc.classList.contains('crozzo-form-mobile')) return true;
      const tier = doc.getAttribute('data-crozzo-touch-tier') || '';
      return tier === 'phone-sm' || tier === 'phone' || tier === 'phone-lg';
    } catch (_) {
      return false;
    }
  }

  function crozzoIsComandasTouchUi() {
    try {
      if (typeof crozzoIsMobilePhoneUi === 'function' && crozzoIsMobilePhoneUi()) return true;
      const doc = document.documentElement;
      if (!doc) return false;
      if (
        doc.classList.contains('crozzo-form-tablet') ||
        doc.classList.contains('crozzo-android-apk') ||
        doc.classList.contains('crozzo-touch-shell') ||
        doc.getAttribute('data-crozzo-android') === '1'
      ) {
        return true;
      }
      const tier = doc.getAttribute('data-crozzo-touch-tier') || '';
      return tier === 'tablet' || tier === 'tablet-lg';
    } catch (_) {
      return false;
    }
  }

  // Exports
  global.crozzoIsMobilePhoneUi = crozzoIsMobilePhoneUi;
  global.crozzoIsComandasTouchUi = crozzoIsComandasTouchUi;
  global.crozzoIsComandasCompactUi = crozzoIsComandasTouchUi;
  // === Extraído de CrozzoPosMain.js (F7, ola 1) ===
  function crozzoGetAppVersionLabel() {
    var ver = '';
    try {
      var m = document.querySelector('meta[name="crozzo-app-version"]');
      if (m) ver = String(m.getAttribute('content') || '').trim();
      if (!ver && typeof window.CROZZO_APP_VERSION !== 'undefined') {
        ver = String(window.CROZZO_APP_VERSION).trim();
      }
    } catch (_) {}
    ver = ver.replace(/^v/i, '');
    return ver ? 'Versión ' + ver : 'Versión';
  }
  global.crozzoGetAppVersionLabel = crozzoGetAppVersionLabel;
  // === Extraído de CrozzoPosMain.js (F7, ola 1) ===
  function crozzoNavItemAclVisible(el) {
    if (!el) return false;
    return !el.classList.contains('crozzo-nav-acl-hidden') && !el.hidden;
  }
  global.crozzoNavItemAclVisible = crozzoNavItemAclVisible;
})(typeof window !== 'undefined' ? window : global);