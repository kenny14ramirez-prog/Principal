/* CrozzoBrandKit — identidad de marca configurable (nombre, acento, logo). Solo UI. */
(function (global) {
  'use strict';
  var DEFAULTS = { name: 'BONA origen', accent: '#B59A6D', logo: 'assets/bona-origen-logo.png' };
  function readConfig() {
    try {
      var raw = global.localStorage.getItem('pos_dian_config');
      if (!raw) return {};
      var cfg = JSON.parse(raw);
      var emp = (cfg && cfg.empresa) || {};
      return { name: emp.nombre || emp.name || '', accent: emp.acento || emp.accent || '', logo: emp.logo || '' };
    } catch (e) { return {}; }
  }
  function getBrand() {
    var c = readConfig();
    return {
      name: String(c.name || DEFAULTS.name).trim() || DEFAULTS.name,
      accent: String(c.accent || DEFAULTS.accent).trim() || DEFAULTS.accent,
      logo: String(c.logo || DEFAULTS.logo).trim() || DEFAULTS.logo
    };
  }
  function applyBrand() {
    var b = getBrand();
    try { global.document.documentElement.style.setProperty('--cz-brand-accent', b.accent); } catch (e) { /* sin DOM */ }
    try {
      var slots = global.document.querySelectorAll('[data-crozzo-brand="name"]');
      for (var i = 0; i < slots.length; i++) slots[i].textContent = b.name;
    } catch (e) { /* sin DOM */ }
    try { if (global.document && global.document.title) global.document.title = b.name + ' · Sistema POS'; } catch (e) { /* sin DOM */ }
  }
  global.CrozzoBrandKit = { getBrand: getBrand, applyBrand: applyBrand, DEFAULTS: DEFAULTS };
  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', applyBrand);
    } else {
      global.setTimeout(applyBrand, 0);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);