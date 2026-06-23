/**

 * Pestañas superiores WhatsApp / Gmail / Drive / Dataico / DIAN / Spotify + volver a BONA (visible sobre el embed).

 */

(function (global) {

  'use strict';



  var TAB_DEFS = [

    { id: 'wa', label: 'WhatsApp', cls: 'wa' },

    { id: 'gmail', label: 'Gmail', cls: 'gmail' },

    { id: 'drive', label: 'Drive', cls: 'drive' },

    { id: 'dataico', label: 'Dataico', cls: 'dataico' },

    { id: 'dian', label: 'DIAN', cls: 'dian' },

    { id: 'spotify', label: 'Spotify', cls: 'spotify' },

  ];



  function allowedTabIds() {

    var list =

      typeof global.crozzoUserAllowedQuickApps === 'function'

        ? global.crozzoUserAllowedQuickApps()

        : TAB_DEFS.map(function (t) { return t.id; });

    var set = {};

    (list || []).forEach(function (id) { set[id] = true; });

    return set;

  }



  function canSwitchTo(kind) {

    if (kind === 'home') return true;

    if (typeof global.crozzoUserCanUseQuickApp === 'function') {

      return global.crozzoUserCanUseQuickApp(kind);

    }

    return true;

  }



  function headNavHtml(active) {

    active = active || '';

    var allowed = allowedTabIds();

    function tab(id, label, cls) {

      if (!allowed[id]) return '';

      var on = active === id ? ' is-active' : '';

      return (

        '<button type="button" class="crozzo-web-embed-tabs__btn crozzo-web-embed-tabs__btn--' +

        cls +

        on +

        '" data-crozzo-embed-tab="' +

        id +

        '" title="' +

        label +

        '">' +

        label +

        '</button>'

      );

    }

    var tabs = TAB_DEFS.map(function (def) {

      return tab(def.id, def.label, def.cls);

    }).join('');

    return (

      '<nav class="crozzo-web-embed-tabs" id="crozzoWebEmbedTabs" aria-label="Cambiar app integrada">' +

      tabs +

      (tabs ? '<span class="crozzo-web-embed-tabs__sep" aria-hidden="true"></span>' : '') +

      tab('home', '← BONA', 'home') +

      '</nav>'

    );

  }



  function switchEmbed(kind) {

    if (!canSwitchTo(kind)) {

      if (typeof global.showToast === 'function') global.showToast('No tiene permiso para esta app', 'warning');

      return;

    }

    if (kind === 'home') {

      if (typeof global.crozzoWhatsAppDockIsOpen === 'function' && global.crozzoWhatsAppDockIsOpen()) {

        global.crozzoWhatsAppDockClose();

        return;

      }

      if (typeof global.crozzoGmailDockIsOpen === 'function' && global.crozzoGmailDockIsOpen()) {

        global.crozzoGmailDockClose();

        return;

      }

      if (typeof global.crozzoDriveDockIsOpen === 'function' && global.crozzoDriveDockIsOpen()) {

        global.crozzoDriveDockClose();

        return;

      }

      if (typeof global.crozzoDataicoDockIsOpen === 'function' && global.crozzoDataicoDockIsOpen()) {

        global.crozzoDataicoDockClose();

        return;

      }

      if (typeof global.crozzoDianVpfeDockIsOpen === 'function' && global.crozzoDianVpfeDockIsOpen()) {

        global.crozzoDianVpfeDockClose();

        return;

      }

      if (typeof global.crozzoSpotifyDockIsOpen === 'function' && global.crozzoSpotifyDockIsOpen()) {

        global.crozzoSpotifyDockClose();

      }

      return;

    }

    if (kind === 'wa' && typeof global.crozzoWhatsAppDockOpen === 'function') global.crozzoWhatsAppDockOpen();

    if (kind === 'gmail' && typeof global.crozzoGmailDockOpen === 'function') global.crozzoGmailDockOpen();

    if (kind === 'drive' && typeof global.crozzoDriveDockOpen === 'function') global.crozzoDriveDockOpen();

    if (kind === 'dataico' && typeof global.crozzoDataicoDockOpen === 'function') global.crozzoDataicoDockOpen();

    if (kind === 'dian' && typeof global.crozzoDianVpfeDockOpen === 'function') global.crozzoDianVpfeDockOpen();

    if (kind === 'spotify' && typeof global.crozzoSpotifyDockOpen === 'function') global.crozzoSpotifyDockOpen();

  }



  function bindHeadNav(active) {

    var nav = document.getElementById('crozzoWebEmbedTabs');

    if (!nav || nav._crozzoEmbedTabsBound) return;

    nav._crozzoEmbedTabsBound = true;

    nav.addEventListener('click', function (e) {

      var btn = e.target && e.target.closest ? e.target.closest('[data-crozzo-embed-tab]') : null;

      if (!btn || !nav.contains(btn)) return;

      e.preventDefault();

      switchEmbed(btn.getAttribute('data-crozzo-embed-tab'));

    });

    markHeadNavActive(active);

  }



  function markHeadNavActive(active) {

    var nav = document.getElementById('crozzoWebEmbedTabs');

    if (!nav) return;

    nav.querySelectorAll('[data-crozzo-embed-tab]').forEach(function (btn) {

      btn.classList.toggle('is-active', btn.getAttribute('data-crozzo-embed-tab') === active);

    });

  }



  global.crozzoWebEmbedHeadNavHtml = headNavHtml;

  global.crozzoBindWebEmbedHeadNav = bindHeadNav;

  global.crozzoMarkWebEmbedHeadNav = markHeadNavActive;

})(typeof window !== 'undefined' ? window : global);

