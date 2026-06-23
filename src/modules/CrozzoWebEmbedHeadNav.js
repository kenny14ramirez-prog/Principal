/**
 * Pestañas superiores WhatsApp / Gmail / Drive + volver a BONA (visible sobre el embed).
 */
(function (global) {
  'use strict';

  function headNavHtml(active) {
    active = active || '';
    function tab(id, label, cls) {
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
    return (
      '<nav class="crozzo-web-embed-tabs" id="crozzoWebEmbedTabs" aria-label="Cambiar app integrada">' +
      tab('wa', 'WhatsApp', 'wa') +
      tab('gmail', 'Gmail', 'gmail') +
      tab('drive', 'Drive', 'drive') +
      '<span class="crozzo-web-embed-tabs__sep" aria-hidden="true"></span>' +
      tab('home', '← BONA', 'home') +
      '</nav>'
    );
  }

  function switchEmbed(kind) {
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
      }
      return;
    }
    if (kind === 'wa' && typeof global.crozzoWhatsAppDockOpen === 'function') global.crozzoWhatsAppDockOpen();
    if (kind === 'gmail' && typeof global.crozzoGmailDockOpen === 'function') global.crozzoGmailDockOpen();
    if (kind === 'drive' && typeof global.crozzoDriveDockOpen === 'function') global.crozzoDriveDockOpen();
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
