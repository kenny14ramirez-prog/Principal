/**
 * CrozzoCommandCenter — capa de mando premium
 * ---------------------------------------------------------------------------
 * Qué añade (sin tocar módulos existentes):
 *   1. Insignia de salud del sistema en el header (agregado de subsistemas).
 *   2. Command Palette global (Ctrl/Cmd + K): páginas, acciones, diagnóstico.
 *   3. Hoja de atajos de teclado (?).
 *   4. Red de seguridad de render: si una página revienta, tarjeta de
 *      recuperación en vez de pantalla en blanco.
 *   5. Micro-interacciones: ripple en botones, transición de página.
 *   6. Utilidades reutilizables: estado vacío y skeleton.
 *
 * Todo degrada en silencio: si un subsistema no existe, se omite su fila.
 * No modifica contratos ni almacenamiento existente.
 */
(function (global) {
  'use strict';

  if (global.__crozzoCommandCenterReady) return;
  global.__crozzoCommandCenterReady = true;

  var doc = global.document;

  /* ── Utilidades ──────────────────────────────────────────────────────── */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function norm(s) {
    var out = String(s == null ? '' : s).toLowerCase();
    try {
      out = out.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch (_) {}
    return out;
  }

  function toast(msg, type) {
    try {
      if (typeof global.showToast === 'function') global.showToast(msg, type || 'info');
    } catch (_) {}
  }

  function isLoginOpen() {
    try { return doc.body.classList.contains('crozzo-login-open'); } catch (_) { return false; }
  }

  function isTypingTarget(node) {
    try {
      if (typeof global.crozzoIsTypingTarget === 'function') return global.crozzoIsTypingTarget(node);
    } catch (_) {}
    var el = node || doc.activeElement;
    if (!el) return false;
    var tag = String(el.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
  }

  function shortcutsBlocked() {
    try {
      if (typeof global.crozzoPosShortcutsBlocked === 'function') return !!global.crozzoPosShortcutsBlocked();
    } catch (_) {}
    return false;
  }

  function reducedMotion() {
    try {
      return (
        doc.body.classList.contains('crozzo-a11y-reduce-motion') ||
        (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches)
      );
    } catch (_) { return false; }
  }

  /* ── 1. Marcar el documento como "premium" (activa el CSS de movimiento) ── */

  function markPremium() {
    try {
      if (!doc.body.classList.contains('crozzo-premium')) doc.body.classList.add('crozzo-premium');
    } catch (_) {}
  }

  /* ── 2. Catálogo de comandos ─────────────────────────────────────────── */

  var registered = [];

  function navCommands() {
    var out = [];
    var nodes = doc.querySelectorAll('.nav-item[data-page]');
    Array.prototype.forEach.call(nodes, function (el) {
      var page = el.getAttribute('data-page');
      if (!page) return;
      var visible = true;
      if (typeof global.crozzoNavItemAclVisible === 'function') {
        try { visible = global.crozzoNavItemAclVisible(el); } catch (_) { visible = true; }
      }
      if (!visible) return;
      var labelEl = el.querySelector('.nav-item-label');
      var label = (labelEl && labelEl.textContent) || el.textContent || page;
      label = String(label).replace(/\s+/g, ' ').trim();
      if (!label) return;
      out.push({
        id: 'page:' + page,
        group: 'Páginas',
        glyph: '→',
        label: label,
        hint: 'Ir',
        keywords: page,
        run: function () {
          if (typeof global.navigateTo === 'function') global.navigateTo(page);
        },
      });
    });
    return out;
  }

  function actionCommands() {
    var out = [];

    var isSA = (typeof isSuperAdminUser === 'function') ? isSuperAdminUser() : false;

    if (isSA) {
      out.push({
        id: 'action:deploy',
        group: 'Acciones',
        glyph: '',
        label: 'Abrir Centro de Despliegue',
        hint: 'Despliegue',
        keywords: 'deployment setup wizard instalacion',
        run: function () {
          if (global.CrozzoDeploymentCenter && global.CrozzoDeploymentCenter.abrir) {
            global.CrozzoDeploymentCenter.abrir();
            if (typeof global._dcSwitchFace === 'function') global._dcSwitchFace('deploy');
          } else {
            toast('Centro de Despliegue no disponible', 'warning');
          }
        },
      });

      out.push({
        id: 'action:solver',
        group: 'Acciones',
        glyph: '',
        label: 'Solucionador de problemas',
        hint: 'Despliegue',
        keywords: 'solver soporte impresora conexion reparar',
        run: function () {
          if (global.CrozzoDeploymentCenter && global.CrozzoDeploymentCenter.abrir) {
            global.CrozzoDeploymentCenter.abrir();
            if (typeof global._dcSwitchFace === 'function') global._dcSwitchFace('solver');
          }
        },
      });

      out.push({
        id: 'action:diagnostic',
        group: 'Acciones',
        glyph: '',
        label: 'Diagnóstico del sistema',
        hint: 'Despliegue',
        keywords: 'diagnostico salud monitor estado reporte',
        run: function () {
          if (global.CrozzoDeploymentCenter && global.CrozzoDeploymentCenter.abrir) {
            global.CrozzoDeploymentCenter.abrir();
            if (typeof global._dcSwitchFace === 'function') global._dcSwitchFace('diagnostic');
          }
        },
      });
    }

    out.push({
      id: 'action:health',
      group: 'Acciones',
       glyph: '',
      label: 'Ver estado del sistema',
      hint: 'Salud',
      keywords: 'salud health estado sistema',
      run: function () { openHealth(); },
    });

    out.push({
      id: 'action:a11y',
      group: 'Acciones',
       glyph: '',
      label: 'Ajustes de accesibilidad',
      hint: 'Panel',
      keywords: 'accesibilidad contraste fuente ayuda motion',
      run: function () {
        if (typeof global.__crozzoToggleA11y === 'function') global.__crozzoToggleA11y();
        else toast('Panel de accesibilidad no disponible', 'warning');
      },
    });

    out.push({
      id: 'action:reload',
      group: 'Acciones',
      glyph: '⟳',
      label: 'Recargar interfaz',
      hint: 'F5',
      keywords: 'recargar reload refrescar',
      run: function () { global.location.reload(); },
    });

    out.push({
      id: 'action:logout',
      group: 'Acciones',
      glyph: '⏻',
      label: 'Cerrar sesión',
      hint: 'Salir',
      keywords: 'salir logout cerrar sesion',
      run: function () {
        if (typeof global.crozzoRequestLogout === 'function') {
          global.crozzoRequestLogout({ source: 'command-center', force: true });
          return;
        }
        if (typeof global.logoutCurrentUser === 'function') {
          global.logoutCurrentUser();
          if (typeof global.showLoginOverlay === 'function' && global.shouldRequireLogin && global.shouldRequireLogin()) {
            global.showLoginOverlay();
          }
        }
      },
    });

    return out;
  }

  function allCommands() {
    var list = [];
    try { list = list.concat(navCommands()); } catch (_) {}
    try { list = list.concat(registered); } catch (_) {}
    try { list = list.concat(actionCommands()); } catch (_) {}
    return list;
  }

  /* ── Motor de búsqueda (subsecuencia + prefijo) ──────────────────────── */

  function scoreOne(query, text) {
    if (!query) return 1;
    var t = norm(text);
    if (!t) return 0;
    var direct = t.indexOf(query);
    if (direct === 0) return 100;
    if (direct > 0) return 70 - Math.min(direct, 20);

    // subsecuencia
    var qi = 0;
    var gap = 0;
    var last = -1;
    for (var i = 0; i < t.length && qi < query.length; i++) {
      if (t.charAt(i) === query.charAt(qi)) {
        if (last >= 0) gap += i - last - 1;
        last = i;
        qi++;
      }
    }
    if (qi < query.length) return 0;
    return Math.max(1, 40 - gap);
  }

  function search(query) {
    var q = norm(String(query || '').trim());
    var list = allCommands();
    if (!q) return list;
    var scored = [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      var s = scoreOne(q, c.label) * 2 + scoreOne(q, c.keywords || '') + scoreOne(q, c.group || '') * 0.5;
      if (s > 0) scored.push({ c: c, s: s });
    }
    scored.sort(function (a, b) { return b.s - a.s; });
    return scored.map(function (x) { return x.c; });
  }

  /* ── 3. Command Palette ──────────────────────────────────────────────── */

  var palette = null;
  var paletteState = { items: [], index: 0 };

  function buildPalette() {
    var backdrop = doc.createElement('div');
    backdrop.className = 'cz-palette-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-label', 'Buscar en el sistema');
    backdrop.innerHTML = CrozzoSanitize.sanitizeHtml('<div class="cz-palette">' +
      '  <div class="cz-palette__search">' +
      '    <span class="cz-palette__icon" aria-hidden="true">⌕</span>' +
      '    <input class="cz-palette__input" type="text" autocomplete="off" spellcheck="false" ' +
      '      placeholder="Buscar página, acción o diagnóstico…" aria-controls="czPaletteList" aria-autocomplete="list">' +
      '    <span class="cz-palette__kbd">ESC</span>' +
      '  </div>' +
      '  <div class="cz-palette__list" id="czPaletteList" role="listbox" aria-label="Resultados"></div>' +
      '  <div class="cz-palette__foot">' +
      '    <span>↑↓ navegar</span><span>↵ abrir</span><span>esc cerrar</span>' +
      '  </div>' +
      '</div>');

    backdrop.addEventListener('mousedown', function (e) {
      if (e.target === backdrop) closePalette();
    });

    var input = backdrop.querySelector('.cz-palette__input');
    input.addEventListener('input', function () { renderPalette(input.value); });
    input.addEventListener('keydown', onPaletteKey);

    doc.body.appendChild(backdrop);
    return backdrop;
  }

  function onPaletteKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      movePalette(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      movePalette(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runPalette();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closePalette();
    } else if (e.key === 'Tab') {
      e.preventDefault();
    }
  }

  function movePalette(delta) {
    if (!paletteState.items.length) return;
    paletteState.index = (paletteState.index + delta + paletteState.items.length) % paletteState.items.length;
    paintPaletteActive();
  }

  function paintPaletteActive() {
    if (!palette) return;
    var rows = palette.querySelectorAll('.cz-palette__item');
    Array.prototype.forEach.call(rows, function (r, i) {
      var on = i === paletteState.index;
      r.classList.toggle('is-active', on);
      r.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) {
        try { r.scrollIntoView({ block: 'nearest' }); } catch (_) {}
      }
    });
  }

  function renderPalette(query) {
    if (!palette) return;
    var list = palette.querySelector('.cz-palette__list');
    var items = search(query);
    paletteState.items = items;
    paletteState.index = 0;

    if (!items.length) {
      list.innerHTML = CrozzoSanitize.sanitizeHtml('<div class="cz-palette__empty">Sin resultados para “' + esc(query) + '”.</div>');
      return;
    }

    var html = '';
    var group = '';
    for (var i = 0; i < items.length; i++) {
      var c = items[i];
      if (c.group && c.group !== group) {
        group = c.group;
        html += '<div class="cz-palette__group">' + esc(group) + '</div>';
      }
      html +=
        '<div class="cz-palette__item" role="option" data-idx="' + i + '" aria-selected="false">' +
        '<span class="cz-palette__item__glyph" aria-hidden="true">' + esc(c.glyph || '•') + '</span>' +
        '<span class="cz-palette__item__label">' + esc(c.label) + '</span>' +
        (c.hint ? '<span class="cz-palette__item__hint">' + esc(c.hint) + '</span>' : '') +
        '</div>';
    }
    list.innerHTML = CrozzoSanitize.sanitizeHtml(html);

    Array.prototype.forEach.call(list.querySelectorAll('.cz-palette__item'), function (row) {
      row.addEventListener('mouseenter', function () {
        paletteState.index = parseInt(row.getAttribute('data-idx'), 10) || 0;
        paintPaletteActive();
      });
      row.addEventListener('click', function () {
        paletteState.index = parseInt(row.getAttribute('data-idx'), 10) || 0;
        runPalette();
      });
    });

    paintPaletteActive();
  }

  function runPalette() {
    var c = paletteState.items[paletteState.index];
    if (!c) return;
    closePalette();
    // Dejar que el overlay desaparezca antes de navegar.
    global.setTimeout(function () {
      try { c.run(); } catch (err) {
        toast('No se pudo ejecutar: ' + (err && err.message ? err.message : err), 'error');
      }
    }, 10);
  }

  function openPalette() {
    if (isLoginOpen()) return;
    if (!palette) palette = buildPalette();
    palette.style.display = 'flex';
    var input = palette.querySelector('.cz-palette__input');
    input.value = '';
    renderPalette('');
    global.setTimeout(function () {
      try { input.focus(); input.select(); } catch (_) {}
    }, 20);
  }

  function closePalette() {
    if (!palette) return;
    palette.style.display = 'none';
  }

  function togglePalette() {
    if (palette && palette.style.display !== 'none') closePalette();
    else openPalette();
  }

  /* ── 4. Hoja de atajos ───────────────────────────────────────────────── */

  var shortcutsEl = null;

  var SHORTCUTS = [
    { keys: ['Ctrl', 'K'], label: 'Buscar en el sistema' },
    { keys: ['?'], label: 'Ver atajos de teclado' },
    { keys: ['Esc'], label: 'Cerrar ventana o paleta' },
    { keys: ['Ctrl', 'Shift', 'G'], label: 'Gestión de perfiles y menús' },
    { keys: ['Ctrl', 'L'], label: 'Buscar cliente (POS / tablets)' },
    { keys: ['⌕'], label: 'En tablet: botón flotante de búsqueda' },
  ];

  function buildShortcuts() {
    var wrap = doc.createElement('div');
    wrap.className = 'cz-shortcuts';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', 'Atajos de teclado');

    var rows = SHORTCUTS.map(function (s) {
      var keys = s.keys.map(function (k) { return '<span class="cz-shortcuts__key">' + esc(k) + '</span>'; }).join('');
      return '<div class="cz-shortcuts__row"><span>' + esc(s.label) + '</span><span class="cz-shortcuts__keys">' + keys + '</span></div>';
    }).join('');

    wrap.innerHTML = CrozzoSanitize.sanitizeHtml('<div class="cz-shortcuts__card">' +
      '  <div class="cz-shortcuts__title">Atajos de teclado</div>' +
      '  <div class="cz-shortcuts__sub">Muévete más rápido por el sistema. Pulsa <span class="cz-shortcuts__key">Esc</span> para cerrar.</div>' +
      '  <div class="cz-shortcuts__grid">' + rows + '</div>' +
      '</div>');

    wrap.addEventListener('mousedown', function (e) {
      if (e.target === wrap) closeShortcuts();
    });
    doc.body.appendChild(wrap);
    return wrap;
  }

  function openShortcuts() {
    if (isLoginOpen()) return;
    if (!shortcutsEl) shortcutsEl = buildShortcuts();
    shortcutsEl.style.display = 'flex';
  }

  function closeShortcuts() {
    if (shortcutsEl) shortcutsEl.style.display = 'none';
  }

  /* ── 5. Insignia de salud ────────────────────────────────────────────── */

  var healthEl = null;
  var healthPanel = null;
  var healthTimer = null;

  function tierLabel(t) {
    t = String(t || '').toLowerCase();
    if (t === 'cloud') return 'Nube';
    if (t === 'lan') return 'LAN';
    if (t === 'hotspot') return 'Hotspot';
    if (t === 'mesh') return 'Malla';
    if (t === 'qr') return 'QR';
    return 'Sin conexión';
  }

  function collectHealth() {
    var out = [];

    // Impresoras
    var printers = null;
    try {
      if (typeof global.getAvailablePrintersList === 'function') {
        printers = global.getAvailablePrintersList() || [];
      }
    } catch (_) { printers = null; }
    if (printers) {
      out.push({
        key: 'printers',
        label: 'Impresoras',
        value: printers.length ? printers.length + ' activa' + (printers.length === 1 ? '' : 's') : 'Sin configurar',
        state: printers.length ? 'ok' : 'warn',
      });
    }

    // Conexión / sync
    var tier = String(global.__CROZZO_TIER_LAST || '').toLowerCase();
    var online = false;
    try { online = !!global.navigator.onLine; } catch (_) {}
    var tierState = 'err';
    if (tier === 'cloud' || tier === 'lan') tierState = 'ok';
    else if (tier === 'hotspot' || tier === 'mesh' || tier === 'qr') tierState = 'warn';
    else if (online && !tier) tierState = 'warn';
    out.push({
      key: 'sync',
      label: 'Sincronización',
      value: tier ? tierLabel(tier) : online ? 'Pendiente' : 'Sin conexión',
      state: tierState,
    });

    // Nube
    var cloud = null;
    try {
      if (global.CrozzoSuperAdminCentral && typeof global.CrozzoSuperAdminCentral.isAvailable === 'function') {
        cloud = !!global.CrozzoSuperAdminCentral.isAvailable();
      }
    } catch (_) { cloud = null; }
    if (cloud !== null) {
      out.push({
        key: 'cloud',
        label: 'Nube',
        value: cloud ? 'Disponible' : 'No disponible',
        state: cloud ? 'ok' : 'warn',
      });
    }

    // Errores
    var stats = null;
    try {
      if (global.CrozzoErrorMonitor && typeof global.CrozzoErrorMonitor.getErrorStats === 'function') {
        stats = global.CrozzoErrorMonitor.getErrorStats();
      }
    } catch (_) { stats = null; }
    if (stats) {
      var total = Number(stats.total || 0);
      var critical = Number(stats.critical || 0);
      var high = Number(stats.high || 0);
      out.push({
        key: 'errors',
        label: 'Errores',
        value: total === 0 ? 'Ninguno' : String(total) + (critical ? ' · ' + critical + ' crítico' + (critical === 1 ? '' : 's') : ''),
        state: critical > 0 ? 'err' : high > 0 ? 'warn' : 'ok',
      });
    }

    // Seguridad / honeypot
    var hp = null;
    try {
      if (global.config && typeof global.config.get === 'function') {
        var seg = global.config.get('seguridad') || {};
        hp = seg.honeypot || null;
      }
    } catch (_) { hp = null; }
    if (hp) {
      var strict = !!hp.produccionEstricta;
      out.push({
        key: 'security',
        label: 'Seguridad',
        value: strict ? 'Blindada' : 'Reducida',
        state: strict ? 'ok' : 'warn',
      });
    }

    return out;
  }

  function aggregate(rows) {
    var state = 'ok';
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].state === 'err') return 'critical';
      if (rows[i].state === 'warn') state = 'degraded';
    }
    return state;
  }

  function aggregateLabel(state) {
    if (state === 'critical') return 'Atención';
    if (state === 'degraded') return 'Vigilar';
    return 'Óptimo';
  }

  function mountHealth() {
    if (healthEl) return;
    var cluster = doc.querySelector('.crozzo-header__cluster') || doc.querySelector('.main-header');
    if (!cluster) return;

    var btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'cz-health';
    btn.id = 'crozzoHealthBadge';
    btn.setAttribute('data-state', 'ok');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    btn.title = 'Estado del sistema — clic para ver el detalle';
    btn.innerHTML = CrozzoSanitize.sanitizeHtml('<span class="cz-health__dot" aria-hidden="true"></span><span class="cz-health__label">Sistema · Óptimo</span>');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleHealth();
    });

    // Va al inicio del clúster: jerarquía visual "estado global primero".
    cluster.insertBefore(btn, cluster.firstChild);
    healthEl = btn;
    refreshHealth();
  }

  function refreshHealth() {
    if (!healthEl) return;
    var rows = collectHealth();
    var state = aggregate(rows);
    healthEl.setAttribute('data-state', state);
    var label = healthEl.querySelector('.cz-health__label');
    if (label) label.textContent = 'Sistema · ' + aggregateLabel(state);
    if (healthPanel && healthPanel.style.display !== 'none') paintHealthPanel(rows);
  }

  function paintHealthPanel(rows) {
    if (!healthPanel) return;
    var list = healthPanel.querySelector('.cz-health-panel__rows');
    if (!list) return;
    if (!rows.length) {
      list.innerHTML = CrozzoSanitize.sanitizeHtml('<div class="cz-health-row"><span class="cz-health-row__label">Sin datos de subsistemas</span></div>');
      return;
    }
    list.innerHTML = CrozzoSanitize.sanitizeHtml(rows.map(function (r) {
      var dot = r.state === 'err' ? ' err' : r.state === 'warn' ? ' warn' : '';
      return (
        '<div class="cz-health-row">' +
        '<span class="cz-health-row__dot' + dot + '" aria-hidden="true"></span>' +
        '<span class="cz-health-row__label">' + esc(r.label) + '</span>' +
        '<span class="cz-health-row__value">' + esc(r.value) + '</span>' +
        '</div>'
      );
    }).join(''));
  }

  function buildHealthPanel() {
    var panel = doc.createElement('div');
    panel.className = 'cz-health-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Estado del sistema');
    panel.innerHTML = CrozzoSanitize.sanitizeHtml('<div class="cz-health-panel__title">Estado del sistema</div>' +
      '<div class="cz-health-panel__rows"></div>' +
      (isSuperAdminUser() ? ('<div class="cz-health-panel__actions">' +
      '  <button type="button" data-cz-act="diag">Diagnóstico</button>' +
      '  <button type="button" data-cz-act="solver">Solucionador</button>' +
      '</div>') : ''));

    if (isSuperAdminUser()) {
      var diagBtn = panel.querySelector('[data-cz-act="diag"]');
      var solverBtn = panel.querySelector('[data-cz-act="solver"]');
      if (diagBtn) diagBtn.addEventListener('click', function () {
        closeHealth();
        if (global.CrozzoDeploymentCenter && global.CrozzoDeploymentCenter.abrir) {
          global.CrozzoDeploymentCenter.abrir();
          if (typeof global._dcSwitchFace === 'function') global._dcSwitchFace('diagnostic');
        }
      });
      if (solverBtn) solverBtn.addEventListener('click', function () {
        closeHealth();
        if (global.CrozzoDeploymentCenter && global.CrozzoDeploymentCenter.abrir) {
          global.CrozzoDeploymentCenter.abrir();
          if (typeof global._dcSwitchFace === 'function') global._dcSwitchFace('solver');
        }
      });
    }

    doc.body.appendChild(panel);
    return panel;
  }

  function positionHealthPanel() {
    if (!healthEl || !healthPanel) return;
    var r = healthEl.getBoundingClientRect();
    var w = 320;
    var left = Math.min(Math.max(12, r.right - w), global.innerWidth - w - 12);
    healthPanel.style.left = left + 'px';
    healthPanel.style.top = Math.round(r.bottom + 8) + 'px';
  }

  function openHealth() {
    if (!healthPanel) healthPanel = buildHealthPanel();
    paintHealthPanel(collectHealth());
    healthPanel.style.display = 'block';
    positionHealthPanel();
    if (healthEl) healthEl.setAttribute('aria-expanded', 'true');
  }

  function closeHealth() {
    if (healthPanel) healthPanel.style.display = 'none';
    if (healthEl) healthEl.setAttribute('aria-expanded', 'false');
  }

  function toggleHealth() {
    if (healthPanel && healthPanel.style.display !== 'none') closeHealth();
    else openHealth();
  }

  /* ── 6. Red de seguridad de render ───────────────────────────────────── */

  var guardDepth = 0;
  var lastPage = '';

  function recoveryCard(page, err) {
    var detail = '';
    try {
      detail = String((err && err.stack) || (err && err.message) || err || 'Error desconocido');
    } catch (_) { detail = 'Error desconocido'; }
    var safePage = esc(page || '');
    return (
      '<div class="cz-recovery" role="alert">' +
      '<div class="cz-recovery__title">No pudimos abrir esta pantalla</div>' +
      '<div class="cz-recovery__text">La operación <strong>' + safePage + '</strong> se detuvo, pero el resto del sistema sigue funcionando. ' +
      'Puedes reintentar, volver al inicio o copiar el detalle técnico para soporte.</div>' +
      '<div class="cz-recovery__detail">' + esc(detail) + '</div>' +
      '<div class="cz-recovery__actions">' +
      '  <button type="button" class="btn btn-primary" data-cz-rec="retry">Reintentar</button>' +
      '  <button type="button" class="btn btn-outline" data-cz-rec="home">Ir al inicio</button>' +
      '  <button type="button" class="btn btn-outline" data-cz-rec="copy">Copiar detalle</button>' +
      '</div>' +
      '</div>'
    );
  }

  function showRecovery(page, err, container) {
    var host = container || doc.getElementById('mainContent');
    if (!host) return;
    try { host.innerHTML = CrozzoSanitize.sanitizeHtml(recoveryCard(page, err)); } catch (_) { return; }

    var detail = String((err && err.stack) || (err && err.message) || err || '');
    var retry = host.querySelector('[data-cz-rec="retry"]');
    var home = host.querySelector('[data-cz-rec="home"]');
    var copy = host.querySelector('[data-cz-rec="copy"]');

    if (retry) retry.addEventListener('click', function () {
      host.innerHTML = CrozzoSanitize.sanitizeHtml('');
      try {
        if (typeof global.renderPage === 'function') global.renderPage(page);
      } catch (e2) { showRecovery(page, e2, host); }
    });
    if (home) home.addEventListener('click', function () {
      if (typeof global.navigateTo === 'function') global.navigateTo('inicio-operacion');
    });
    if (copy) copy.addEventListener('click', function () {
      try {
        if (global.navigator.clipboard && global.navigator.clipboard.writeText) {
          global.navigator.clipboard.writeText(page + '\n' + detail);
        }
        toast('Detalle copiado al portapapeles', 'success');
      } catch (_) { toast('No se pudo copiar', 'warning'); }
    });
  }

  function logBoundaryError(page, err) {
    try {
      if (global.CrozzoErrorMonitor && typeof global.CrozzoErrorMonitor.logError === 'function') {
        global.CrozzoErrorMonitor.logError(
          'Render falló en "' + page + '": ' + ((err && err.message) || err),
          'CrozzoCommandCenter/errorBoundary',
          'critical'
        );
      }
    } catch (_) {}
  }

  function wrapRenderFns() {
    ['navigateTo', 'renderPage'].forEach(function (name) {
      var fn = global[name];
      if (typeof fn !== 'function' || fn.__czGuarded) return;
      var guarded = function () {
        var args = arguments;
        var page = args[0];
        if (guardDepth > 0) return fn.apply(this, args);
        guardDepth++;
        var startedAt = Date.now();
        try {
          return fn.apply(this, args);
        } catch (err) {
          logBoundaryError(page, err);
          showRecovery(page, err);
          return undefined;
        } finally {
          guardDepth--;
          // Transición de página (solo si hubo cambio real y fue rápido)
          try {
            if (name === 'navigateTo' && page !== lastPage && !reducedMotion() && Date.now() - startedAt < 900) {
              lastPage = page;
              var host = doc.getElementById('mainContent');
              if (host && host.children.length) {
                host.classList.remove('cz-page-enter');
                // reinicio de animación
                void host.offsetWidth;
                host.classList.add('cz-page-enter');
                global.setTimeout(function () { host.classList.remove('cz-page-enter'); }, 400);
              }
            }
          } catch (_) {}
        }
      };
      guarded.__czGuarded = true;
      global[name] = guarded;
    });
  }

  /* ── 7. Ripple + focus táctil ────────────────────────────────────────── */

  function installRipple() {
    if (reducedMotion()) return;
    doc.addEventListener('pointerdown', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.btn, .btn-luxury') : null;
      if (!btn) return;
      if (btn.disabled) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      var r = btn.getBoundingClientRect();
      var size = Math.max(r.width, r.height) * 1.15;
      var dot = doc.createElement('span');
      dot.className = 'cz-ripple';
      dot.style.position = 'fixed';
      dot.style.left = Math.round(e.clientX - size / 2) + 'px';
      dot.style.top = Math.round(e.clientY - size / 2) + 'px';
      dot.style.width = Math.round(size) + 'px';
      dot.style.height = Math.round(size) + 'px';
      dot.style.zIndex = '9999';
      dot.style.opacity = '0.55';
      doc.body.appendChild(dot);
      global.setTimeout(function () {
        if (dot && dot.parentNode) dot.parentNode.removeChild(dot);
      }, 560);
    }, { passive: true });
  }

  /* ── 9. Acceso flotante sin teclado (tablet/móvil) ───────────────────── */

  var fab = null;

  function ensureFab() {
    if (fab) return fab;
    fab = doc.createElement('button');
    fab.type = 'button';
    fab.className = 'cz-cmd-fab';
    fab.id = 'crozzoCommandFab';
    fab.setAttribute('aria-label', 'Buscar en el sistema');
    fab.title = 'Buscar en el sistema';
    fab.innerHTML = CrozzoSanitize.sanitizeHtml('<span aria-hidden="true">⌕</span>');
    fab.addEventListener('click', function (e) {
      e.stopPropagation();
      openPalette();
    });
    doc.body.appendChild(fab);
    return fab;
  }

  function syncFab() {
    // Si la insignia del header no tiene tamaño (chrome móvil/tablet), el
    // usuario no tiene entrada visible a la paleta: mostramos el flotante.
    try {
      var b = ensureFab();
      if (isLoginOpen()) {
        b.classList.remove('is-on');
        return;
      }
      var visible = false;
      if (healthEl) {
        var r = healthEl.getBoundingClientRect();
        visible = r.width > 0 && r.height > 0;
      }
      b.classList.toggle('is-on', !visible);
    } catch (_) {}
  }

  var fabQueued = false;
  function queueSyncFab() {
    if (fabQueued) return;
    fabQueued = true;
    try {
      global.requestAnimationFrame(function () {
        fabQueued = false;
        syncFab();
      });
    } catch (_) {
      fabQueued = false;
      syncFab();
    }
  }

  /* ── 10. Perro guardián de pantalla en blanco ────────────────────────── */

  var sawContent = false;

  function installCrashWatchdog() {
    // Marca si el área principal alguna vez mostró contenido: evita falsos
    // positivos durante el arranque (antes del primer render).
    try {
      var host = doc.getElementById('mainContent');
      if (host && host.children.length) sawContent = true;
      var mo = new global.MutationObserver(function () {
        var h = doc.getElementById('mainContent');
        if (h && h.children.length) sawContent = true;
      });
      if (host) mo.observe(host, { childList: true });
    } catch (_) {}

    var pending = null;
    function maybeRecover(err) {
      if (pending) return;
      pending = global.setTimeout(function () {
        pending = null;
        if (!sawContent) return;
        if (isLoginOpen()) return;
        var h = doc.getElementById('mainContent');
        if (!h) return;
        if (h.children.length > 0) return; // hay contenido: no es pantalla blanca
        showRecovery('pantalla', err || 'Error desconocido');
      }, 450);
    }

    global.addEventListener('error', function (ev) {
      maybeRecover((ev && (ev.error || ev.message)) || 'Error de ejecución');
    });
    global.addEventListener('unhandledrejection', function (ev) {
      maybeRecover((ev && ev.reason) || 'Promesa rechazada');
    });
  }

  /* ── 11. Teclado global ───────────────────────────────────────────────── */

  function installKeys() {
    doc.addEventListener('keydown', function (e) {
      try {
        if (shortcutsBlocked()) return;

        // Ctrl/Cmd + K
        if ((e.ctrlKey || e.metaKey) && !e.altKey && String(e.key || '').toLowerCase() === 'k') {
          e.preventDefault();
          e.stopPropagation();
          togglePalette();
          return;
        }

        // Escape cierra capas propias
        if (e.key === 'Escape' || e.key === 'Esc') {
          if (palette && palette.style.display !== 'none') { e.preventDefault(); closePalette(); return; }
          if (shortcutsEl && shortcutsEl.style.display !== 'none') { e.preventDefault(); closeShortcuts(); return; }
          if (healthPanel && healthPanel.style.display !== 'none') { e.preventDefault(); closeHealth(); return; }
          return;
        }

        // ? → atajos (solo fuera de campos de texto)
        if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget()) {
          e.preventDefault();
          openShortcuts();
          return;
        }
      } catch (_) {}
    }, true);
  }

  /* ── 12. Cierre al hacer clic fuera ──────────────────────────────────── */

  function installOutsideClose() {
    doc.addEventListener('mousedown', function (e) {
      if (!healthPanel || healthPanel.style.display === 'none') return;
      if (healthPanel.contains(e.target)) return;
      if (healthEl && healthEl.contains(e.target)) return;
      closeHealth();
    });
    global.addEventListener('resize', function () {
      if (healthPanel && healthPanel.style.display !== 'none') positionHealthPanel();
    });
    global.addEventListener('scroll', function () {
      if (healthPanel && healthPanel.style.display !== 'none') closeHealth();
    }, true);
  }

  /* ── 13. Utilidades públicas ─────────────────────────────────────────── */

  function emptyState(opts) {
    opts = opts || {};
    return (
      '<div class="cz-empty">' +
      '<div class="cz-empty__glyph" aria-hidden="true">' + esc(opts.glyph || '◇') + '</div>' +
      '<div class="cz-empty__title">' + esc(opts.title || 'Nada por aquí todavía') + '</div>' +
      (opts.hint ? '<div class="cz-empty__hint">' + esc(opts.hint) + '</div>' : '') +
      (opts.actionHtml || '') +
      '</div>'
    );
  }

  function skeleton(rows, opts) {
    rows = Math.max(1, parseInt(rows, 10) || 3);
    var h = (opts && opts.height) || 14;
    var out = '<div style="display:flex;flex-direction:column;gap:10px;" aria-hidden="true">';
    for (var i = 0; i < rows; i++) {
      var w = i % 3 === 0 ? '92%' : i % 3 === 1 ? '74%' : '84%';
      out += '<div class="cz-skeleton" style="height:' + h + 'px;width:' + w + ';"></div>';
    }
    out += '</div>';
    return out;
  }

  /* ── 14. Arranque ────────────────────────────────────────────────────── */

  function boot() {
    markPremium();
    wrapRenderFns();
    installCrashWatchdog();
    installKeys();
    installRipple();
    installOutsideClose();
    try { mountHealth(); } catch (_) {}
    try { syncFab(); } catch (_) {}
    global.addEventListener('resize', function () { queueSyncFab(); refreshHealth(); });
    // El login abre/cierra cambiando clases del body: mantenemos el flotante
    // alineado con el estado real de la sesión (con debounce por frame).
    try {
      new global.MutationObserver(queueSyncFab)
        .observe(doc.body, { attributes: true, attributeFilter: ['class'] });
    } catch (_) {}
    // Refresco periódico de la insignia (ligero, sin red)
    healthTimer = global.setInterval(function () { refreshHealth(); syncFab(); }, 20000);
    // Reintentar montaje de la insignia si el header se re-renderiza.
    try {
      var mo = new global.MutationObserver(function () {
        if (!doc.getElementById('crozzoHealthBadge')) {
          healthEl = null;
          mountHealth();
          syncFab();
        } else {
          refreshHealth();
        }
      });
      var header = doc.querySelector('.crozzo-header__cluster');
      if (header) mo.observe(header, { childList: true });
    } catch (_) {}
  }

  global.CrozzoCommandCenter = {
    open: openPalette,
    close: closePalette,
    toggle: togglePalette,
    openShortcuts: openShortcuts,
    openHealth: openHealth,
    closeHealth: closeHealth,
    refreshHealth: refreshHealth,
    health: collectHealth,
    emptyState: emptyState,
    skeleton: skeleton,
    registerCommands: function (list) {
      if (!Array.isArray(list)) return;
      registered = registered.concat(list);
    },
    search: search,
    stop: function () {
      if (healthTimer) global.clearInterval(healthTimer);
      closePalette();
      closeShortcuts();
      closeHealth();
    },
  };

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    global.setTimeout(boot, 0);
  }
})(window);
