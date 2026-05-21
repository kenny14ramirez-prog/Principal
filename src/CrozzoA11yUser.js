/**
 * Crozzo POS — Menú de usuario + Asistente de accesibilidad (WCAG 2.2 AA)
 */
(function (global) {
  'use strict';

  var A11Y_LS_KEY = 'crozzo_a11y_prefs';
  var DEFAULT_PREFS = { fontScale: 1, highContrast: false, reduceMotion: false, focusMode: false };

  function safeParse(json, fallback) {
    try {
      return JSON.parse(json);
    } catch (_) {
      return fallback;
    }
  }

  function loadPrefs() {
    try {
      var raw = localStorage.getItem(A11Y_LS_KEY);
      if (raw) return Object.assign({}, DEFAULT_PREFS, safeParse(raw, DEFAULT_PREFS));
    } catch (_) {}
    var reduce = false;
    try {
      reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) {}
    return Object.assign({}, DEFAULT_PREFS, { reduceMotion: reduce });
  }

  function savePrefs(prefs) {
    try {
      localStorage.setItem(A11Y_LS_KEY, JSON.stringify(prefs));
    } catch (_) {}
  }

  function applyPrefs(prefs) {
    var p = prefs || loadPrefs();
    var root = document.documentElement;
    root.style.setProperty('--a11y-font-scale', String(p.fontScale || 1));
    ['theme-high-contrast', 'crozzo-a11y-reduce-motion', 'crozzo-a11y-focus-mode'].forEach(function (cls) {
      root.classList.remove(cls);
      if (document.body) document.body.classList.remove(cls);
    });
    if (p.highContrast) {
      root.classList.add('theme-high-contrast');
      if (document.body) document.body.classList.add('theme-high-contrast');
    }
    if (p.reduceMotion) {
      root.classList.add('crozzo-a11y-reduce-motion');
      if (document.body) document.body.classList.add('crozzo-a11y-reduce-motion');
    }
    if (p.focusMode) {
      root.classList.add('crozzo-a11y-focus-mode');
      if (document.body) document.body.classList.add('crozzo-a11y-focus-mode');
    }
    syncA11yControls(p);
    return p;
  }

  function syncA11yControls(prefs) {
    var panel = document.getElementById('crozzoA11yPanel');
    if (!panel) return;
    panel.querySelectorAll('.a11y-btn[data-scale]').forEach(function (btn) {
      var on = parseFloat(btn.getAttribute('data-scale')) === prefs.fontScale;
      btn.classList.toggle('a11y-btn--active', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    var ct = document.getElementById('contrast-toggle');
    var mt = document.getElementById('motion-toggle');
    var ft = document.getElementById('focus-toggle');
    if (ct) ct.checked = !!prefs.highContrast;
    if (mt) mt.checked = !!prefs.reduceMotion;
    if (ft) ft.checked = !!prefs.focusMode;
  }

  function ensureA11yPortal() {
    var panel = document.getElementById('crozzoA11yPanel');
    var backdrop = document.getElementById('crozzoA11yBackdrop');
    if (panel && panel.parentElement !== document.body) {
      document.body.appendChild(panel);
    }
    if (backdrop && backdrop.parentElement !== document.body) {
      if (panel) document.body.insertBefore(backdrop, panel);
      else document.body.appendChild(backdrop);
    }
    return { panel: panel, backdrop: backdrop };
  }

  function positionA11yPanel(panel) {
    if (!panel) return;
    var trigger = document.getElementById('crozzoA11yTrigger');
    if (!trigger || typeof trigger.getBoundingClientRect !== 'function') {
      panel.style.top = '72px';
      panel.style.right = '16px';
      panel.style.left = 'auto';
      panel.style.bottom = 'auto';
      return;
    }
    var r = trigger.getBoundingClientRect();
    var gap = 8;
    var panelW = Math.min(360, global.innerWidth - 24);
    var top = r.bottom + gap;
    var right = Math.max(8, global.innerWidth - r.right);
    if (top + 400 > global.innerHeight) {
      top = Math.max(8, r.top - 400 - gap);
    }
    panel.style.top = top + 'px';
    panel.style.right = right + 'px';
    panel.style.left = 'auto';
    panel.style.bottom = 'auto';
    panel.style.width = panelW + 'px';
  }

  var focusTrap = { container: null, prev: null };

  function getFocusables(container) {
    return Array.prototype.slice
      .call(
        container.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      )
      .filter(function (el) {
        var st = global.getComputedStyle ? global.getComputedStyle(el) : null;
        return st && st.visibility !== 'hidden' && st.display !== 'none';
      });
  }

  function trapFocus(container) {
    focusTrap.container = container;
    focusTrap.prev = document.activeElement;
    global.requestAnimationFrame(function () {
      var items = getFocusables(container);
      if (items[0]) items[0].focus();
    });
    document.addEventListener('keydown', onTrapKeydown, true);
  }

  function releaseFocus() {
    document.removeEventListener('keydown', onTrapKeydown, true);
    if (focusTrap.prev && focusTrap.prev.focus) {
      try {
        focusTrap.prev.focus();
      } catch (_) {}
    }
    focusTrap.container = null;
    focusTrap.prev = null;
  }

  function onTrapKeydown(e) {
    if (!focusTrap.container || e.key !== 'Tab') return;
    var items = getFocusables(focusTrap.container);
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  var userMenu = { open: false };

  function setUserMenuOpen(open) {
    var trigger = document.getElementById('userMenuTrigger');
    var dropdown = document.getElementById('userMenuDropdown');
    if (!trigger || !dropdown) return;
    userMenu.open = !!open;
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    dropdown.setAttribute('aria-hidden', open ? 'false' : 'true');
    dropdown.classList.toggle('is-open', open);
    if (open) {
      var first = dropdown.querySelector('.user-menu__item');
      if (first) first.focus();
    }
  }

  function closeUserMenu() {
    setUserMenuOpen(false);
  }

  function syncUserMenuProfile() {
    var nameEl = document.getElementById('userMenuName');
    var roleEl = document.getElementById('userMenuRole');
    var avatarEl = document.getElementById('userMenuAvatarInitial');
    var u = typeof global.getCurrentUser === 'function' ? global.getCurrentUser() : null;
    var nombre = (u && u.nombre) || 'Invitado';
    var rol = (u && u.rol) || '—';
    var rolLabels = {
      caja: 'Caja principal',
      mesero: 'Mesero',
      admin: 'Administrador',
      super_admin: 'Super Admin',
      superadmin: 'Super Admin'
    };
    if (nameEl) nameEl.textContent = nombre;
    if (roleEl) roleEl.textContent = rolLabels[rol] || rol;
    if (avatarEl) {
      avatarEl.textContent = nombre.trim().charAt(0).toUpperCase() || '?';
    }
  }

  function openChangePasswordModal() {
    closeUserMenu();
    var ov = document.getElementById('crozzoChangePasswordOverlay');
    if (!ov) return;
    ov.removeAttribute('hidden');
    var err = document.getElementById('changePasswordError');
    if (err) {
      err.textContent = '';
      err.hidden = true;
    }
    ['changePasswordCurrent', 'changePasswordNew', 'changePasswordConfirm'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
    trapFocus(ov.querySelector('.user-password-dialog') || ov);
    var cur = document.getElementById('changePasswordCurrent');
    if (cur) cur.focus();
  }

  function closeChangePasswordModal() {
    var ov = document.getElementById('crozzoChangePasswordOverlay');
    if (ov) ov.setAttribute('hidden', '');
    releaseFocus();
  }

  function validateChangePassword() {
    var cur = (document.getElementById('changePasswordCurrent') && document.getElementById('changePasswordCurrent').value) || '';
    var neu = (document.getElementById('changePasswordNew') && document.getElementById('changePasswordNew').value) || '';
    var conf = (document.getElementById('changePasswordConfirm') && document.getElementById('changePasswordConfirm').value) || '';
    var u = typeof global.getCurrentUser === 'function' ? global.getCurrentUser() : null;
    if (!u) return { ok: false, msg: 'No hay sesión activa.' };
    if (!cur.trim()) return { ok: false, msg: 'Ingresa tu contraseña actual.' };
    if (String(u.clave) !== String(cur)) return { ok: false, msg: 'La contraseña actual no coincide.' };
    if (neu.length < 4) return { ok: false, msg: 'La nueva contraseña debe tener al menos 4 caracteres.' };
    if (neu !== conf) return { ok: false, msg: 'La confirmación no coincide con la nueva contraseña.' };
    return { ok: true, neu: neu };
  }

  function submitChangePassword() {
    var v = validateChangePassword();
    var errEl = document.getElementById('changePasswordError');
    if (!v.ok) {
      if (errEl) {
        errEl.textContent = v.msg;
        errEl.hidden = false;
      }
      return;
    }
    var u = global.getCurrentUser();
    var conf = typeof global.getUsuariosConfig === 'function' ? global.getUsuariosConfig() : { staff: [] };
    conf.staff = (conf.staff || []).map(function (s) {
      if (s.id !== u.id) return s;
      return Object.assign({}, s, { clave: v.neu });
    });
    if (typeof global.saveUsuarios === 'function') global.saveUsuarios(conf.staff);
    if (typeof global.config !== 'undefined' && global.config && global.config.addAudit) {
      global.config.addAudit('password_cambiada', 'Usuario ' + u.id + ' actualizó su contraseña');
    }
    closeChangePasswordModal();
    if (typeof global.showToast === 'function') global.showToast('Contraseña actualizada correctamente', 'success');
  }

  function userMenuLogout() {
    closeUserMenu();
    if (!global.confirm('¿Seguro que deseas salir?')) return;
    if (typeof global.logoutCurrentUser === 'function') global.logoutCurrentUser();
    if (typeof global.applyAccessControl === 'function') global.applyAccessControl();
    if (typeof global.shouldRequireLogin === 'function' && global.shouldRequireLogin()) {
      if (typeof global.showLoginOverlay === 'function') global.showLoginOverlay();
    } else if (typeof global.navigateTo === 'function') {
      global.navigateTo('cajero');
      if (typeof global.showToast === 'function') global.showToast('Sesión cerrada', 'info');
    }
    try {
      if (typeof global.crozzoShiftSyncFabVisibility === 'function') global.crozzoShiftSyncFabVisibility();
    } catch (_) {}
    syncUserMenuProfile();
  }

  function initUserMenu() {
    var trigger = document.getElementById('userMenuTrigger');
    if (!trigger || trigger._crozzoUserMenuInit) return;
    trigger._crozzoUserMenuInit = true;

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      setUserMenuOpen(!userMenu.open);
      syncUserMenuProfile();
    });

    var cpBtn = document.getElementById('change-password-btn');
    if (cpBtn) cpBtn.addEventListener('click', openChangePasswordModal);
    var loBtn = document.getElementById('logout-btn');
    if (loBtn) loBtn.addEventListener('click', userMenuLogout);

    document.addEventListener('click', function (e) {
      if (!userMenu.open) return;
      var dropdown = document.getElementById('userMenuDropdown');
      if (trigger.contains(e.target) || (dropdown && dropdown.contains(e.target))) return;
      closeUserMenu();
    });

    document.addEventListener('keydown', function (e) {
      if (!userMenu.open) return;
      var dropdown = document.getElementById('userMenuDropdown');
      if (!dropdown) return;
      var items = Array.prototype.slice.call(dropdown.querySelectorAll('.user-menu__item'));
      if (!items.length) return;
      var idx = items.indexOf(document.activeElement);
      if (e.key === 'Escape') {
        e.preventDefault();
        closeUserMenu();
        trigger.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        items[(idx + 1) % items.length].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        items[(idx <= 0 ? items.length : idx) - 1].focus();
      }
    });

    var submitBtn = document.getElementById('changePasswordSubmit');
    if (submitBtn) submitBtn.addEventListener('click', submitChangePassword);
    var cancelBtn = document.getElementById('changePasswordCancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeChangePasswordModal);

    ['changePasswordCurrent', 'changePasswordNew', 'changePasswordConfirm'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', function () {
          var v = validateChangePassword();
          var errEl = document.getElementById('changePasswordError');
          if (!errEl) return;
          if (!el.value && !document.getElementById('changePasswordCurrent').value) {
            errEl.hidden = true;
            errEl.textContent = '';
            return;
          }
          errEl.textContent = v.ok ? '' : v.msg;
          errEl.hidden = !!v.ok;
        });
      }
    });

    var pwdOv = document.getElementById('crozzoChangePasswordOverlay');
    if (pwdOv) {
      pwdOv.addEventListener('click', function (e) {
        if (e.target === pwdOv) closeChangePasswordModal();
      });
      pwdOv.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeChangePasswordModal();
      });
    }

    syncUserMenuProfile();
  }

  var a11yPanelOpen = false;
  var prefs = loadPrefs();
  var a11yControlsBound = false;

  function setA11yPanelOpen(open) {
    var nodes = ensureA11yPortal();
    var trigger = document.getElementById('crozzoA11yTrigger');
    var panel = nodes.panel;
    var backdrop = nodes.backdrop;
    if (!panel) {
      console.warn('[a11y] Panel #crozzoA11yPanel no encontrado');
      return;
    }
    a11yPanelOpen = !!open;
    if (trigger) trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (backdrop) backdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
    panel.classList.toggle('is-open', open);
    if (backdrop) backdrop.classList.toggle('is-open', open);
    document.body.classList.toggle('crozzo-a11y-panel-open', open);
    if (open) {
      positionA11yPanel(panel);
      bindA11yPanelControls();
      global.requestAnimationFrame(function () {
        trapFocus(panel);
      });
    } else {
      releaseFocus();
    }
  }

  function toggleA11yPanel(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setA11yPanelOpen(!a11yPanelOpen);
  }

  function closeA11yPanel() {
    setA11yPanelOpen(false);
  }

  function updatePref(key, value) {
    prefs[key] = value;
    savePrefs(prefs);
    applyPrefs(prefs);
  }

  function bindA11yPanelControls() {
    if (a11yControlsBound) return;
    var panel = document.getElementById('crozzoA11yPanel');
    if (!panel) return;
    a11yControlsBound = true;

    panel.querySelectorAll('.a11y-btn[data-scale]').forEach(function (btn) {
      if (btn._crozzoScaleBound) return;
      btn._crozzoScaleBound = true;
      btn.addEventListener('click', function () {
        updatePref('fontScale', parseFloat(btn.getAttribute('data-scale')) || 1);
      });
    });

    var ct = document.getElementById('contrast-toggle');
    var mt = document.getElementById('motion-toggle');
    var ft = document.getElementById('focus-toggle');
    if (ct && !ct._crozzoA11yBound) {
      ct._crozzoA11yBound = true;
      ct.addEventListener('change', function () { updatePref('highContrast', ct.checked); });
    }
    if (mt && !mt._crozzoA11yBound) {
      mt._crozzoA11yBound = true;
      mt.addEventListener('change', function () { updatePref('reduceMotion', mt.checked); });
    }
    if (ft && !ft._crozzoA11yBound) {
      ft._crozzoA11yBound = true;
      ft.addEventListener('change', function () { updatePref('focusMode', ft.checked); });
    }

    document.querySelectorAll('.a11y-toggle__switch').forEach(function (sw) {
      if (sw._crozzoSwitchBound) return;
      sw._crozzoSwitchBound = true;
      sw.addEventListener('click', function () {
        var inp = sw.previousElementSibling;
        if (inp && inp.classList && inp.classList.contains('a11y-toggle__input')) {
          inp.checked = !inp.checked;
          inp.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });

    var resetBtn = document.getElementById('a11y-reset');
    if (resetBtn && !resetBtn._crozzoA11yBound) {
      resetBtn._crozzoA11yBound = true;
      resetBtn.addEventListener('click', function () {
        prefs = Object.assign({}, DEFAULT_PREFS);
        try {
          if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            prefs.reduceMotion = true;
          }
        } catch (_) {}
        savePrefs(prefs);
        applyPrefs(prefs);
        if (typeof global.showToast === 'function') global.showToast('Ajustes de accesibilidad restablecidos', 'info');
      });
    }
  }

  function initA11yDelegation() {
    if (document._crozzoA11yDelegation) return;
    document._crozzoA11yDelegation = true;

    document.addEventListener(
      'click',
      function (e) {
        if (e.target.closest('#crozzoA11yClose')) {
          e.preventDefault();
          closeA11yPanel();
          return;
        }
        if (e.target.id === 'crozzoA11yBackdrop') {
          closeA11yPanel();
          return;
        }
        if (a11yPanelOpen && panelClickOutside(e)) {
          closeA11yPanel();
        }
      },
      true
    );

    document.addEventListener('keydown', function (e) {
      if (a11yPanelOpen && e.key === 'Escape') {
        e.preventDefault();
        closeA11yPanel();
      }
    });

    global.addEventListener('resize', function () {
      if (a11yPanelOpen) positionA11yPanel(document.getElementById('crozzoA11yPanel'));
    });
  }

  function panelClickOutside(e) {
    var panel = document.getElementById('crozzoA11yPanel');
    var trigger = document.getElementById('crozzoA11yTrigger');
    if (!panel) return false;
    if (panel.contains(e.target)) return false;
    if (trigger && trigger.contains(e.target)) return false;
    return true;
  }

  function initA11yPanel() {
    ensureA11yPortal();
    initA11yDelegation();
    prefs = applyPrefs(loadPrefs());
    bindA11yPanelControls();
    var trigger = document.getElementById('crozzoA11yTrigger');
    if (trigger && !trigger._crozzoA11yClickBound) {
      trigger._crozzoA11yClickBound = true;
      trigger.addEventListener('click', function (e) {
        toggleA11yPanel(e);
      });
    }
  }

  function init() {
    if (global.__crozzoA11yModuleReady) return;
    global.__crozzoA11yModuleReady = true;
    try {
      initUserMenu();
    } catch (e) {
      console.warn('[a11y] initUserMenu', e);
    }
    try {
      initA11yPanel();
    } catch (e2) {
      console.warn('[a11y] initA11yPanel', e2);
    }
    try {
      if (typeof global.crozzoRefreshLucideIcons === 'function') global.crozzoRefreshLucideIcons();
    } catch (_) {}
  }

  global.CrozzoA11yUser = {
    loadPrefs: loadPrefs,
    savePrefs: savePrefs,
    applyPrefs: applyPrefs,
    init: init,
    syncUserMenuProfile: syncUserMenuProfile,
    togglePanel: toggleA11yPanel,
    openPanel: function () { setA11yPanelOpen(true); },
    closePanel: closeA11yPanel
  };
  global.__crozzoToggleA11y = toggleA11yPanel;

  function boot() {
    if (document.getElementById('crozzoA11yPanel')) {
      init();
    } else {
      global.addEventListener('load', init, { once: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
