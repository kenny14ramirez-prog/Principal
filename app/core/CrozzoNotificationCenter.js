/**
 * CrozzoNotificationCenter — Centro de notificaciones (campana + badge rojo).
 *
 * En vez de que los toasts cubran la pantalla, las notificaciones se
 * acumulan en un centro accesible desde la campana del header.
 * El toast sigue apareciendo brevemente (2s) pero limitado a 2 simultáneos.
 */
(function (global) {
  'use strict';

  var MAX_VISIBLE_TOASTS = 2;
  var TOAST_DURATION = 2000;
  var notifications = [];
  var bellBtn = null;
  var badge = null;
  var dropdown = null;
  var dropdownOpen = false;

  function ensureBell() {
    if (bellBtn && document.body.contains(bellBtn)) return bellBtn;
    var toolbar = document.querySelector('.crozzo-header__toolbar');
    if (!toolbar) return null;
    bellBtn = document.createElement('button');
    bellBtn.type = 'button';
    bellBtn.className = 'crozzo-toolbar-btn crozzo-toolbar-btn--notifications';
    bellBtn.id = 'crozzoNotifBell';
    bellBtn.title = 'Notificaciones';
    bellBtn.setAttribute('aria-label', 'Notificaciones');
    bellBtn.setAttribute('aria-expanded', 'false');
    bellBtn.innerHTML = '<i data-lucide="bell" aria-hidden="true"></i><span class="crozzo-notif-badge" id="crozzoNotifBadge" hidden>0</span>';
    // Insert before user menu divider or user menu
    var userMenu = document.getElementById('crozzoUserMenu');
    var divider = toolbar.querySelector('.crozzo-toolbar-divider');
    if (divider && divider.parentNode === toolbar) {
      toolbar.insertBefore(bellBtn, divider);
    } else if (userMenu && userMenu.parentNode === toolbar) {
      toolbar.insertBefore(bellBtn, userMenu);
    } else {
      toolbar.appendChild(bellBtn);
    }
    badge = document.getElementById('crozzoNotifBadge');
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      try { global.lucide.createIcons({ nodes: [bellBtn] }); } catch (_) {}
    }
    bellBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleDropdown();
    });
    // Close dropdown on outside click
    document.addEventListener('click', function (e) {
      if (dropdownOpen && dropdown && !dropdown.contains(e.target) && e.target !== bellBtn) {
        closeDropdown();
      }
    });
    return bellBtn;
  }

  function toggleDropdown() {
    if (dropdownOpen) { closeDropdown(); } else { openDropdown(); }
  }

  function openDropdown() {
    ensureBell();
    if (!bellBtn) return;
    if (dropdown) dropdown.remove();
    dropdown = document.createElement('div');
    dropdown.className = 'crozzo-notif-dropdown';
    dropdown.setAttribute('role', 'dialog');
    dropdown.setAttribute('aria-label', 'Notificaciones');
    var html = '<div class="crozzo-notif-dropdown__head"><span>Notificaciones</span><button type="button" class="crozzo-notif-clear" id="crozzoNotifClear">Limpiar</button></div>';
    if (notifications.length === 0) {
      html += '<div class="crozzo-notif-empty">Sin notificaciones</div>';
    } else {
      html += '<ul class="crozzo-notif-list">';
      notifications.slice().reverse().forEach(function (n, i) {
        html += '<li class="crozzo-notif-item crozzo-notif-item--' + (n.type || 'info') + '">' +
          '<span class="crozzo-notif-item__icon">' + (n.icon || '·') + '</span>' +
          '<span class="crozzo-notif-item__msg">' + (n.message || '') + '</span>' +
          '<span class="crozzo-notif-item__time">' + (n.time || '') + '</span>' +
          '</li>';
      });
      html += '</ul>';
    }
    dropdown.innerHTML = (global.CrozzoSanitize && global.CrozzoSanitize.sanitizeHtml) ? global.CrozzoSanitize.sanitizeHtml(html) : html;
    bellBtn.parentNode.insertBefore(dropdown, bellBtn.nextSibling);
    dropdownOpen = true;
    bellBtn.setAttribute('aria-expanded', 'true');
    var clearBtn = document.getElementById('crozzoNotifClear');
    if (clearBtn) clearBtn.addEventListener('click', function () { clearAll(); });
  }

  function closeDropdown() {
    if (dropdown) { dropdown.remove(); dropdown = null; }
    dropdownOpen = false;
    if (bellBtn) bellBtn.setAttribute('aria-expanded', 'false');
  }

  function clearAll() {
    notifications = [];
    updateBadge();
    closeDropdown();
  }

  function updateBadge() {
    if (!badge) { var b = document.getElementById('crozzoNotifBadge'); if (b) badge = b; }
    if (!badge) return;
    var count = notifications.length;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  function push(message, type) {
    var icon = (type === 'success') ? '✓' : (type === 'error') ? '✕' : (type === 'warning') ? '!' : 'i';
    var time = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    notifications.push({ message: String(message || ''), type: type || 'info', icon: icon, time: time });
    if (notifications.length > 50) notifications.shift();
    updateBadge();
  }

  // Hook into showToast: limit visible toasts
  function wrapShowToast() {
    if (typeof global.showToast !== 'function' || global.showToast.__ncWrapped) return;
    var orig = global.showToast;
    var visibleCount = 0;
    global.showToast = function (message, type) {
      push(message, type);
      // Limit visible toasts
      var container = document.getElementById('toastContainer');
      if (container) {
        var toasts = container.querySelectorAll('.toast');
        if (toasts.length >= MAX_VISIBLE_TOASTS) {
          // Remove oldest
          if (toasts[0] && toasts[0]._crozzoDismiss) toasts[0]._crozzoDismiss();
        }
      }
      orig(message, type);
    };
    global.showToast.__ncWrapped = true;
  }

  // Init
  function init() {
    ensureBell();
    wrapShowToast();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 500); }, { once: true });
  } else {
    setTimeout(init, 500);
  }

  global.CrozzoNotificationCenter = {
    push: push,
    clear: clearAll,
    open: openDropdown,
    close: closeDropdown,
    count: function () { return notifications.length; },
  };
})(typeof window !== 'undefined' ? window : globalThis);