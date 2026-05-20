/**
 * Crozzo POS — actualizaciones inteligentes (Tauri v2)
 * CRÍTICO: toast + instalación en background
 * OPCIONAL: modal con elegir / recordar después
 * Sin modificar lógica de negocio del POS.
 */
(function () {
  'use strict';

  var isTauri = typeof window.__TAURI__ !== 'undefined';
  var isDesktop = isTauri || window.location.protocol === 'file:';
  if (!isTauri) return;

  var RT = window.CrozzoRuntime || {};
  var isTablet =
    RT.isTablet ||
    /Mobi|Android|Tablet|iPad/i.test(navigator.userAgent) ||
    (window.innerWidth < 1024 && 'ontouchstart' in window);

  var UPDATE_JSON_URL =
    'https://github.com/kenny14ramirez-prog/Principal/releases/latest/download/latest.json';
  var SNOOZE_KEY = 'crozzo_update_snooze_until';
  var PENDING_WHATS_NEW_KEY = 'crozzo_pending_whats_new';
  var SEEN_PREFIX = 'crozzo_seen_v';

  var state = {
    update: null,
    meta: null,
    updateType: 'optional',
    installing: false,
  };

  function injectStyles() {
    if (document.getElementById('crozzo-updater-styles')) return;
    var s = document.createElement('style');
    s.id = 'crozzo-updater-styles';
    s.textContent =
      '#crozzo-update-toast.crozzo-update-toast{' +
      'position:fixed;bottom:20px;right:20px;z-index:10060;max-width:360px;' +
      'background:#dc2626;color:#fff;padding:14px 18px;border-radius:12px;' +
      'box-shadow:0 12px 40px rgba(220,38,38,.45);font-size:.95rem;line-height:1.45;' +
      'animation:crozzoToastIn .35s ease}' +
      '#crozzo-update-toast .crozzo-update-toast-title{font-weight:700;margin-bottom:6px;font-size:1.05rem}' +
      '#crozzo-update-overlay{position:fixed;inset:0;z-index:10055;background:rgba(0,0,0,.65);' +
      'display:flex;align-items:center;justify-content:center;padding:16px}' +
      '#crozzo-update-overlay[hidden],#crozzo-whatsnew-overlay[hidden]{display:none!important}' +
      '.crozzo-update-modal,.crozzo-whatsnew-modal{background:linear-gradient(145deg,#1e1b4b 0%,#0f172a 100%);' +
      'color:#f8fafc;border:1px solid rgba(255,255,255,.12);border-radius:16px;' +
      'box-shadow:0 24px 80px rgba(0,0,0,.55);width:min(440px,94vw);padding:24px}' +
      '.crozzo-update-modal.is-tablet,.crozzo-whatsnew-modal.is-tablet{width:min(560px,96vw);padding:28px;font-size:1.05rem}' +
      '.crozzo-update-modal h2,.crozzo-whatsnew-modal h2{margin:0 0 10px;font-size:1.35rem}' +
      '.crozzo-update-modal p,.crozzo-whatsnew-modal p{margin:0 0 18px;color:#cbd5e1;line-height:1.55;white-space:pre-wrap}' +
      '.crozzo-update-actions{display:flex;gap:10px;flex-wrap:wrap}' +
      '.crozzo-btn-update{flex:1;min-height:44px;border:0;border-radius:10px;cursor:pointer;' +
      'font-weight:600;font-size:.95rem;background:#10b981;color:#fff}' +
      '.crozzo-btn-snooze{flex:1;min-height:44px;border:1px solid rgba(255,255,255,.25);border-radius:10px;' +
      'cursor:pointer;font-weight:600;font-size:.95rem;background:transparent;color:#e2e8f0}' +
      '.crozzo-whatsnew-modal .crozzo-whatsnew-icon{font-size:2.2rem;margin-bottom:8px}' +
      '.crozzo-btn-whatsnew{width:100%;min-height:48px;border:0;border-radius:10px;cursor:pointer;' +
      'font-weight:600;font-size:1rem;background:#3b82f6;color:#fff;margin-top:8px}' +
      '@keyframes crozzoToastIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}';
    document.head.appendChild(s);
  }

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function showCriticalToast(version, notes) {
    var old = document.getElementById('crozzo-update-toast');
    if (old) old.remove();
    var t = el(
      'div',
      'crozzo-update-toast',
      '<div class="crozzo-update-toast-title">🔥 Actualización crítica</div>' +
        '<div>Crozzo POS <strong>v' +
        version +
        '</strong> se instalará automáticamente…</div>' +
        (notes ? '<div style="margin-top:8px;opacity:.9;font-size:.85rem">' + escapeHtml(notes) + '</div>' : '')
    );
    t.id = 'crozzo-update-toast';
    document.body.appendChild(t);
    setTimeout(function () {
      if (t.parentNode) {
        t.style.opacity = '0';
        t.style.transition = 'opacity .4s';
        setTimeout(function () {
          if (t.parentNode) t.remove();
        }, 400);
      }
    }, 5000);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ensureOptionalModal() {
    var ov = document.getElementById('crozzo-update-overlay');
    if (ov) return ov;
    ov = el('div', '', '');
    ov.id = 'crozzo-update-overlay';
    ov.hidden = true;
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    var modal = el('div', 'crozzo-update-modal' + (isTablet ? ' is-tablet' : ''), '');
    modal.innerHTML =
      '<h2>🎨 Actualización disponible</h2>' +
      '<p id="crozzo-update-modal-notes"></p>' +
      '<div class="crozzo-update-actions">' +
      '<button type="button" class="crozzo-btn-update" id="crozzo-btn-update-now">Actualizar ahora</button>' +
      '<button type="button" class="crozzo-btn-snooze" id="crozzo-btn-update-snooze">Recordar después</button>' +
      '</div>';
    ov.appendChild(modal);
    document.body.appendChild(ov);
    document.getElementById('crozzo-btn-update-now').addEventListener('click', function () {
      ov.hidden = true;
      runInstall();
    });
    document.getElementById('crozzo-btn-update-snooze').addEventListener('click', function () {
      var until = Date.now() + 24 * 60 * 60 * 1000;
      try {
        localStorage.setItem(SNOOZE_KEY, String(until));
      } catch (_) {}
      ov.hidden = true;
    });
    return ov;
  }

  function showOptionalModal(version, notes) {
    var ov = ensureOptionalModal();
    var p = document.getElementById('crozzo-update-modal-notes');
    if (p) {
      p.textContent =
        'Versión ' +
        version +
        ' lista para instalar.\n\n' +
        (notes || 'Mejoras y correcciones en Crozzo POS.');
    }
    ov.hidden = false;
  }

  function ensureWhatsNewModal() {
    var ov = document.getElementById('crozzo-whatsnew-overlay');
    if (ov) return ov;
    ov = el('div', '', '');
    ov.id = 'crozzo-whatsnew-overlay';
    ov.hidden = true;
    ov.setAttribute('role', 'dialog');
    var modal = el('div', 'crozzo-whatsnew-modal' + (isTablet ? ' is-tablet' : ''), '');
    modal.innerHTML =
      '<div class="crozzo-whatsnew-icon">✨</div>' +
      '<h2>¿Qué hay de nuevo?</h2>' +
      '<p id="crozzo-whatsnew-body"></p>' +
      '<button type="button" class="crozzo-btn-whatsnew" id="crozzo-btn-whatsnew-ok">Entendido</button>';
    ov.appendChild(modal);
    document.body.appendChild(ov);
    document.getElementById('crozzo-btn-whatsnew-ok').addEventListener('click', function () {
      ov.hidden = true;
    });
    return ov;
  }

  function showWhatsNew(version, notes) {
    var key = SEEN_PREFIX + version;
    try {
      if (localStorage.getItem(key) === 'true') return;
    } catch (_) {}
    var ov = ensureWhatsNewModal();
    var body = document.getElementById('crozzo-whatsnew-body');
    if (body) body.textContent = notes || 'Gracias por actualizar Crozzo POS.';
    ov.hidden = false;
    try {
      localStorage.setItem(key, 'true');
    } catch (_) {}
    try {
      localStorage.removeItem(PENDING_WHATS_NEW_KEY);
    } catch (_) {}
  }

  function isSnoozed() {
    try {
      var until = Number(localStorage.getItem(SNOOZE_KEY) || 0);
      return until > Date.now();
    } catch (_) {
      return false;
    }
  }

  function classifyUpdateType(meta, notes) {
    if (meta && meta.update_type === 'critical') return 'critical';
    if (meta && meta.update_type === 'optional') return 'optional';
    var blob = ((notes || '') + ' ' + (meta && meta.notes ? meta.notes : '')).toLowerCase();
    if (/🔥|critico|crítico|critical|urgente|seguridad|grave/.test(blob)) return 'critical';
    return 'optional';
  }

  async function fetchLatestMeta() {
    var res = await fetch(UPDATE_JSON_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('latest.json HTTP ' + res.status);
    return res.json();
  }

  async function runInstall() {
    if (state.installing || !state.update) return;
    state.installing = true;
    try {
      var notes = (state.meta && state.meta.notes) || state.update.body || '';
      var version = state.update.version;
      try {
        localStorage.setItem(
          PENDING_WHATS_NEW_KEY,
          JSON.stringify({ version: version, notes: notes, at: Date.now() })
        );
      } catch (_) {}
      await state.update.downloadAndInstall();
      location.reload();
    } catch (e) {
      state.installing = false;
      console.warn('[crozzo-updater] install', e);
      if (typeof showToast === 'function') showToast('No se pudo instalar la actualización', 'error');
    }
  }

  function handleUpdateAvailable(update, meta) {
    state.update = update;
    state.meta = meta;
    var notes = (meta && meta.notes) || update.body || '';
    state.updateType = classifyUpdateType(meta, notes);
    var version = update.version || (meta && meta.version) || '?';

    if (state.updateType === 'critical') {
      showCriticalToast(version, notes);
      setTimeout(function () {
        runInstall();
      }, 1200);
      return;
    }

    if (isSnoozed()) {
      console.info('[crozzo-updater] actualización opcional pospuesta (snooze)');
      return;
    }

    showOptionalModal(version, notes);
  }

  function checkPendingWhatsNew() {
    try {
      var raw = localStorage.getItem(PENDING_WHATS_NEW_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data && data.version) showWhatsNew(data.version, data.notes || '');
    } catch (_) {}
  }

  async function startSmartUpdater() {
    injectStyles();
    checkPendingWhatsNew();

    var mod;
    try {
      mod = await import('@tauri-apps/plugin-updater');
    } catch (e) {
      console.info('[crozzo-updater] plugin no disponible', e);
      return;
    }

    var meta = null;
    try {
      meta = await fetchLatestMeta();
    } catch (e) {
      console.info('[crozzo-updater] sin latest.json', e);
    }

    try {
      var update = await mod.check();
      if (!update) return;
      if (!meta && update.rawJson && typeof update.rawJson === 'object') meta = update.rawJson;
      if (meta && meta.version && update.version && meta.version !== update.version) {
        meta = Object.assign({}, meta, { version: update.version });
      }
      handleUpdateAvailable(update, meta);
    } catch (e) {
      console.info('[crozzo-updater] check', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startSmartUpdater);
  } else {
    startSmartUpdater();
  }

  window.CrozzoSmartUpdater = {
    classifyUpdateType: classifyUpdateType,
    check: startSmartUpdater,
  };
})();
