/**
 * Crozzo POS — Cumpleaños del equipo: recordatorios, animación al login y preferencias.
 */
(function (global) {
  'use strict';

  var BALLOON_COLORS = ['#f472b6', '#60a5fa', '#fbbf24', '#34d399', '#a78bfa', '#fb7185', '#38bdf8'];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function cfg() {
    return typeof global.config !== 'undefined' && global.config.get ? global.config : null;
  }

  function dateUtils() {
    return typeof global.CrozzoCrmIntel !== 'undefined' ? global.CrozzoCrmIntel : null;
  }

  function daysUntil(fecha, fromDate) {
    var u = dateUtils();
    if (u && u.daysUntilBirthday) return u.daysUntilBirthday(fecha, fromDate);
    return null;
  }

  function isToday(fecha, fromDate) {
    var u = dateUtils();
    if (u && u.isBirthdayToday) return u.isBirthdayToday(fecha, fromDate);
    return daysUntil(fecha, fromDate) === 0;
  }

  function getStaff() {
    if (typeof global.getUsuariosConfig === 'function') {
      var conf = global.getUsuariosConfig();
      return Array.isArray(conf && conf.staff) ? conf.staff : [];
    }
    var c = cfg();
    var u = c && c.get ? c.get('usuarios') : null;
    return u && Array.isArray(u.staff) ? u.staff : [];
  }

  function defaultSettings() {
    return {
      cumpleActivo: true,
      cumpleDiasAntes: 3,
      animacionLogin: true,
    };
  }

  function loadSettings() {
    var c = cfg();
    var base = defaultSettings();
    if (!c || !c.get) return base;
    var stored = c.get('staffCelebrations');
    if (stored && typeof stored === 'object') {
      Object.keys(base).forEach(function (k) {
        if (stored[k] !== undefined) base[k] = stored[k];
      });
    }
    base.cumpleDiasAntes = Math.max(0, Math.min(30, Number(base.cumpleDiasAntes) || 3));
    base.cumpleActivo = base.cumpleActivo !== false;
    base.animacionLogin = base.animacionLogin !== false;
    return base;
  }

  function saveSettings(patch) {
    var c = cfg();
    if (!c || !c.get || !c.set || !c.save) return;
    var next = loadSettings();
    patch = patch || {};
    Object.keys(patch).forEach(function (k) {
      next[k] = patch[k];
    });
    c.set('staffCelebrations', next);
    c.save();
  }

  function applyDefaultStaffFields(u) {
    if (!u) return u;
    if (u.fechaNacimiento === undefined) u.fechaNacimiento = '';
    if (u.cumpleRecordatorio === undefined) u.cumpleRecordatorio = true;
    if (u.cumpleDiasAntes === undefined) u.cumpleDiasAntes = null;
    return u;
  }

  function firstName(nombre) {
    return String(nombre || 'Equipo')
      .trim()
      .split(/\s+/)[0] || 'Equipo';
  }

  function listStaffBirthdayReminders(opts) {
    opts = opts || {};
    var settings = loadSettings();
    if (!settings.cumpleActivo && !opts.ignoreMaster) return [];
    var windowDays = opts.diasAntes != null ? opts.diasAntes : settings.cumpleDiasAntes;
    var out = [];
    getStaff().forEach(function (u) {
      if (!u || u.activo === false) return;
      if (u.id === 'KENNY' || u.rol === 'superadmin') return;
      applyDefaultStaffFields(u);
      if (!u.fechaNacimiento) return;
      if (u.cumpleRecordatorio === false) return;
      var days = daysUntil(u.fechaNacimiento);
      var clientWindow =
        u.cumpleDiasAntes != null && u.cumpleDiasAntes !== ''
          ? Math.max(0, Math.min(30, Number(u.cumpleDiasAntes) || 0))
          : windowDays;
      if (days == null || days > clientWindow) return;
      out.push({ user: u, days: days });
    });
    out.sort(function (a, b) {
      return a.days - b.days;
    });
    return out;
  }

  function staffBirthdayBadge(u) {
    applyDefaultStaffFields(u || {});
    if (!u.fechaNacimiento) return '';
    var days = daysUntil(u.fechaNacimiento);
    if (days == null || days > 7) return '';
    if (days === 0) return ' <span class="crozzo-staff-bday-badge crozzo-staff-bday-badge--today" title="¡Cumple hoy!">🎂</span>';
    return ' <span class="crozzo-staff-bday-badge" title="Cumple en ' + days + ' d">🎂 ' + days + 'd</span>';
  }

  function renderHubBanner() {
    var list = listStaffBirthdayReminders();
    if (!list.length) return '';
    var chips = list
      .slice(0, 8)
      .map(function (row) {
        var u = row.user;
        var lbl = row.days === 0 ? '¡Hoy!' : 'En ' + row.days + ' d';
        return (
          '<div class="crozzo-staff-bday-chip">' +
          '<div><strong>' +
          esc(u.nombre || u.id) +
          '</strong><span>' +
          lbl +
          ' · ' +
          esc(rolLabel(u.rol)) +
          '</span></div></div>'
        );
      })
      .join('');
    return (
      '<div class="crozzo-staff-bday-banner">' +
      '<div class="crozzo-staff-bday-banner__head"><span aria-hidden="true">🎈</span><strong>Cumpleaños del equipo</strong><span>' +
      list.length +
      ' persona(s)</span></div>' +
      '<div class="crozzo-staff-bday-banner__list">' +
      chips +
      (list.length > 8 ? '<p class="form-hint">+' + (list.length - 8) + ' más</p>' : '') +
      '</div></div>'
    );
  }

  function rolLabel(rol) {
    if (typeof global.rolFuncionalLabel === 'function') return global.rolFuncionalLabel(rol);
    return String(rol || '');
  }

  function renderSettingsPanel() {
    var s = loadSettings();
    return (
      '<details class="crozzo-staff-bday-settings card" open>' +
      '<summary class="crozzo-staff-bday-settings__sum">🎂 Cumpleaños del equipo · recordatorios y animación</summary>' +
      '<div class="crozzo-staff-bday-settings__body">' +
      '<label class="crozzo-staff-bday-check">' +
      '<input type="checkbox" id="staffCelCumpleActivo"' +
      (s.cumpleActivo ? ' checked' : '') +
      '> Activar recordatorios de cumpleaños del personal</label>' +
      '<label class="crozzo-staff-bday-check">' +
      '<input type="checkbox" id="staffCelAnimLogin"' +
      (s.animacionLogin ? ' checked' : '') +
      '> Activar animación de globos y torta al iniciar sesión en el cumpleaños</label>' +
      '<p class="form-hint" style="margin:0 0 12px;font-size:.78rem;">La animación y el mensaje personal solo los ve quien cumple años en su propia sesión. El resto del equipo solo recibe recordatorio (toast), sin animación.</p>' +
      '<div class="form-group"><label class="form-label">Avisar con anticipación (días)</label>' +
      '<input type="number" class="form-input" id="staffCelCumpleDias" min="0" max="30" value="' +
      esc(s.cumpleDiasAntes) +
      '"></div>' +
      '<p class="form-hint">Registre la fecha en cada usuario (Editar → Cuenta). El cumpleañero ve animación solo en su sesión; el resto del equipo recibe aviso sin animación.</p>' +
      '<button type="button" class="btn btn-primary btn-sm" id="staffCelSaveSettings">Guardar preferencias</button></div></details>'
    );
  }

  function renderEditFields(u) {
    applyDefaultStaffFields(u || {});
    u = u || {};
    var settings = loadSettings();
    return (
      '<div class="crozzo-staff-bday-edit card" style="margin-top:12px;padding:12px;border-color:rgba(244,114,182,.28);">' +
      '<h4 style="margin:0 0 10px;font-size:.9rem;">🎂 Cumpleaños</h4>' +
      '<div class="form-group"><label class="form-label">Fecha de nacimiento</label>' +
      '<input type="date" class="form-input" id="editUserCumple" value="' +
      esc(u.fechaNacimiento || '') +
      '"></div>' +
      '<label class="crozzo-staff-bday-check">' +
      '<input type="checkbox" id="editUserCumpleRec"' +
      (u.cumpleRecordatorio !== false ? ' checked' : '') +
      '> Incluir en recordatorios del equipo</label>' +
      '<div class="form-group"><label class="form-label">Días de anticipación (vacío = global · ' +
      esc(settings.cumpleDiasAntes) +
      ')</label>' +
      '<input type="number" class="form-input" id="editUserCumpleDias" min="0" max="30" placeholder="' +
      esc(settings.cumpleDiasAntes) +
      '" value="' +
      (u.cumpleDiasAntes != null && u.cumpleDiasAntes !== '' ? esc(u.cumpleDiasAntes) : '') +
      '"></div></div>'
    );
  }

  function renderNewUserFields() {
    return (
      '<div class="form-group"><label class="form-label">Fecha de cumpleaños (opcional)</label>' +
      '<input type="date" class="form-input" id="newUserCumple"></div>'
    );
  }

  function collectEditFields(row) {
    if (!row) return;
    applyDefaultStaffFields(row);
    var inp = document.getElementById('editUserCumple');
    var rec = document.getElementById('editUserCumpleRec');
    var dias = document.getElementById('editUserCumpleDias');
    row.fechaNacimiento = inp ? String(inp.value || '').trim() : row.fechaNacimiento;
    row.cumpleRecordatorio = rec ? !!rec.checked : row.cumpleRecordatorio;
    if (dias && String(dias.value || '').trim() !== '') {
      row.cumpleDiasAntes = Math.max(0, Math.min(30, Number(dias.value) || 0));
    } else {
      row.cumpleDiasAntes = null;
    }
  }

  function collectNewUserFields(row) {
    if (!row) return;
    applyDefaultStaffFields(row);
    var inp = document.getElementById('newUserCumple');
    if (inp && inp.value) row.fechaNacimiento = String(inp.value).trim();
  }

  function prefersReducedMotion() {
    try {
      return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) {
      return false;
    }
  }

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function sessionShownKey(userId) {
    return 'crozzo_staff_bday_anim_' + String(userId || '') + '_' + todayKey();
  }

  function spawnBalloons(root, count) {
    count = count || 14;
    for (var i = 0; i < count; i++) {
      var b = document.createElement('div');
      b.className = 'crozzo-bday-balloon';
      b.style.left = Math.random() * 100 + '%';
      b.style.animationDelay = Math.random() * 2.5 + 's';
      b.style.animationDuration = 4 + Math.random() * 3 + 's';
      b.style.background = BALLOON_COLORS[i % BALLOON_COLORS.length];
      b.style.transform = 'scale(' + (0.7 + Math.random() * 0.6) + ')';
      root.appendChild(b);
    }
  }

  function spawnConfetti(root, count) {
    count = count || 40;
    for (var i = 0; i < count; i++) {
      var p = document.createElement('span');
      p.className = 'crozzo-bday-confetti';
      p.style.left = Math.random() * 100 + '%';
      p.style.background = BALLOON_COLORS[i % BALLOON_COLORS.length];
      p.style.animationDelay = Math.random() * 1.2 + 's';
      p.style.animationDuration = 2.2 + Math.random() * 1.5 + 's';
      root.appendChild(p);
    }
  }

  function dismissCelebration(overlay) {
    if (!overlay || overlay._dismissed) return;
    overlay._dismissed = true;
    overlay.classList.add('crozzo-bday-overlay--out');
    setTimeout(function () {
      try {
        overlay.remove();
      } catch (_) {}
    }, 650);
  }

  function resolveSessionUser(user) {
    var cur = typeof global.getCurrentUser === 'function' ? global.getCurrentUser() : null;
    if (!cur || !cur.id) return null;
    if (user && user.id && String(user.id).toUpperCase() !== String(cur.id).toUpperCase()) return null;
    var fresh = getStaff().find(function (s) {
      return s && String(s.id).toUpperCase() === String(cur.id).toUpperCase();
    });
    return fresh || cur;
  }

  function showLoginCelebration(user) {
    user = resolveSessionUser(user);
    if (!user || !user.id) return;
    var settings = loadSettings();
    if (!settings.animacionLogin) return;
    applyDefaultStaffFields(user);
    if (!user.fechaNacimiento || !isToday(user.fechaNacimiento)) return;
    try {
      if (sessionStorage.getItem(sessionShownKey(user.id))) return;
      sessionStorage.setItem(sessionShownKey(user.id), '1');
    } catch (_) {}

    injectStyles();
    var existing = document.getElementById('crozzo-bday-celebration');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'crozzo-bday-celebration';
    overlay.className = 'crozzo-bday-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Feliz cumpleaños');

    var name = firstName(user.nombre);
    var reduced = prefersReducedMotion();

    overlay.innerHTML =
      '<div class="crozzo-bday-overlay__sky" aria-hidden="true"></div>' +
      (reduced ? '' : '<div class="crozzo-bday-overlay__balloons" aria-hidden="true"></div>') +
      (reduced ? '' : '<div class="crozzo-bday-overlay__confetti" aria-hidden="true"></div>') +
      '<div class="crozzo-bday-overlay__card">' +
      '<div class="crozzo-bday-cake" aria-hidden="true">' +
      '<span class="crozzo-bday-cake__layer crozzo-bday-cake__layer--3"></span>' +
      '<span class="crozzo-bday-cake__layer crozzo-bday-cake__layer--2"></span>' +
      '<span class="crozzo-bday-cake__layer crozzo-bday-cake__layer--1"></span>' +
      '<span class="crozzo-bday-cake__candle"></span>' +
      '<span class="crozzo-bday-cake__flame"></span></div>' +
      '<p class="crozzo-bday-overlay__eyebrow">¡Feliz cumpleaños!</p>' +
      '<h2 class="crozzo-bday-overlay__title">' +
      esc(name) +
      '</h2>' +
      '<p class="crozzo-bday-overlay__sub">Que este día esté lleno de alegría, buena energía y ventas redondas 🎈</p>' +
      '<button type="button" class="btn btn-primary crozzo-bday-overlay__btn">¡Gracias!</button></div>';

    document.body.appendChild(overlay);

    if (!reduced) {
      var balloonsHost = overlay.querySelector('.crozzo-bday-overlay__balloons');
      var confettiHost = overlay.querySelector('.crozzo-bday-overlay__confetti');
      if (balloonsHost) spawnBalloons(balloonsHost, 16);
      if (confettiHost) spawnConfetti(confettiHost, 48);
    }

    var btn = overlay.querySelector('.crozzo-bday-overlay__btn');
    if (btn) {
      btn.addEventListener('click', function () {
        dismissCelebration(overlay);
      });
    }
    overlay.addEventListener('click', function (ev) {
      if (ev.target === overlay) dismissCelebration(overlay);
    });

    setTimeout(function () {
      dismissCelebration(overlay);
    }, reduced ? 4000 : 7000);

    try {
      if (typeof global.showToast === 'function') {
        global.showToast('🎂 ¡Feliz cumpleaños, ' + name + '!', 'success');
      }
    } catch (_) {}
  }

  function onLoginSuccess(user) {
    user = resolveSessionUser(user);
    if (!user) return;
    showLoginCelebration(user);
    maybeStaffTeamReminder(user);
  }

  /** Recordatorio silencioso para todo el equipo — sin animación (solo toast). */
  function maybeStaffTeamReminder(currentUser) {
    try {
      var settings = loadSettings();
      if (!settings.cumpleActivo) return;
      var key = 'crozzo_staff_team_cumple_ping_' + todayKey();
      if (sessionStorage.getItem(key)) return;
      var list = listStaffBirthdayReminders();
      if (currentUser && currentUser.id) {
        list = list.filter(function (row) {
          return row.user && String(row.user.id).toUpperCase() !== String(currentUser.id).toUpperCase();
        });
      }
      if (!list.length) return;
      sessionStorage.setItem(key, '1');
      if (typeof global.showToast === 'function') {
        var names = list
          .slice(0, 3)
          .map(function (row) {
            return firstName(row.user.nombre);
          })
          .join(', ');
        var extra = list.length > 3 ? ' +' + (list.length - 3) + ' más' : '';
        global.showToast('🎈 Cumple del equipo próximo: ' + names + extra + ' — revise Usuarios', 'info');
      }
    } catch (_) {}
  }

  function maybeAdminReminder() {
    maybeStaffTeamReminder(typeof global.getCurrentUser === 'function' ? global.getCurrentUser() : null);
  }

  function bindUsuariosPage() {
    injectStyles();
    var saveBtn = document.getElementById('staffCelSaveSettings');
    if (saveBtn && !saveBtn._bound) {
      saveBtn._bound = true;
      saveBtn.addEventListener('click', function () {
        var act = document.getElementById('staffCelCumpleActivo');
        var anim = document.getElementById('staffCelAnimLogin');
        var dias = document.getElementById('staffCelCumpleDias');
        saveSettings({
          cumpleActivo: act ? !!act.checked : true,
          animacionLogin: anim ? !!anim.checked : true,
          cumpleDiasAntes: dias ? Number(dias.value) : 3,
        });
        if (typeof global.showToast === 'function') global.showToast('Preferencias de cumpleaños guardadas', 'success');
        if (typeof global.crozzoRefreshUsuariosPage === 'function') global.crozzoRefreshUsuariosPage();
      });
    }
  }

  function getCss() {
    return (
      '.crozzo-staff-bday-banner{border:1px solid rgba(244,114,182,.35);border-radius:14px;padding:14px;margin-bottom:14px;background:rgba(244,114,182,.06)}' +
      '.crozzo-staff-bday-banner__head{display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:.85rem}' +
      '.crozzo-staff-bday-banner__list{display:flex;flex-wrap:wrap;gap:8px}' +
      '.crozzo-staff-bday-chip{padding:8px 12px;border-radius:10px;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.08)}' +
      '.crozzo-staff-bday-chip span{display:block;font-size:.72rem;color:var(--text-secondary)}' +
      '.crozzo-staff-bday-settings{margin-bottom:14px}' +
      '.crozzo-staff-bday-settings__sum{cursor:pointer;font-weight:600;padding:12px 14px;list-style:none}' +
      '.crozzo-staff-bday-settings__body{padding:0 14px 14px}' +
      '.crozzo-staff-bday-check{display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:.85rem;cursor:pointer}' +
      '.crozzo-staff-bday-badge{font-size:.72rem;margin-left:4px}' +
      '.crozzo-staff-bday-badge--today{animation:crozzoBdayPulse 1.2s ease-in-out infinite}' +
      '@keyframes crozzoBdayPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}' +
      '.crozzo-bday-overlay{position:fixed;inset:0;z-index:100050;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(8,10,18,.72);backdrop-filter:blur(6px);animation:crozzoBdayFadeIn .5s ease}' +
      '.crozzo-bday-overlay--out{animation:crozzoBdayFadeOut .55s ease forwards}' +
      '@keyframes crozzoBdayFadeIn{from{opacity:0}to{opacity:1}}' +
      '@keyframes crozzoBdayFadeOut{to{opacity:0;pointer-events:none}}' +
      '.crozzo-bday-overlay__sky{position:absolute;inset:0;background:radial-gradient(circle at 50% 120%,rgba(244,114,182,.25),transparent 55%),radial-gradient(circle at 20% 20%,rgba(96,165,250,.2),transparent 40%);pointer-events:none}' +
      '.crozzo-bday-overlay__balloons,.crozzo-bday-overlay__confetti{position:absolute;inset:0;overflow:hidden;pointer-events:none}' +
      '.crozzo-bday-balloon{position:absolute;bottom:-80px;width:36px;height:44px;border-radius:50% 50% 45% 45%;opacity:.92;animation:crozzoBdayBalloonRise linear forwards}' +
      '.crozzo-bday-balloon::after{content:"";position:absolute;bottom:-14px;left:50%;width:2px;height:18px;background:rgba(255,255,255,.45);transform:translateX(-50%)}' +
      '@keyframes crozzoBdayBalloonRise{0%{transform:translateY(0) rotate(-6deg);opacity:0}10%{opacity:.95}100%{transform:translateY(-115vh) rotate(8deg);opacity:.2}}' +
      '.crozzo-bday-confetti{position:absolute;top:-10px;width:8px;height:14px;border-radius:2px;opacity:.9;animation:crozzoBdayConfettiFall linear forwards}' +
      '@keyframes crozzoBdayConfettiFall{0%{transform:translateY(0) rotate(0deg);opacity:1}100%{transform:translateY(100vh) rotate(720deg);opacity:0}}' +
      '.crozzo-bday-overlay__card{position:relative;z-index:2;text-align:center;max-width:420px;width:100%;padding:28px 24px 24px;border-radius:22px;border:1px solid rgba(255,255,255,.15);background:linear-gradient(160deg,rgba(30,27,46,.97),rgba(18,22,32,.98));box-shadow:0 24px 60px rgba(0,0,0,.45);animation:crozzoBdayCardPop .65s cubic-bezier(.34,1.56,.64,1)}' +
      '@keyframes crozzoBdayCardPop{0%{transform:scale(.82) translateY(24px);opacity:0}100%{transform:scale(1) translateY(0);opacity:1}}' +
      '.crozzo-bday-overlay__eyebrow{margin:0 0 8px;font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:rgba(244,114,182,.95)}' +
      '.crozzo-bday-overlay__title{margin:0 0 10px;font-size:clamp(1.5rem,5vw,2rem);background:linear-gradient(90deg,#fbbf24,#f472b6,#60a5fa);-webkit-background-clip:text;background-clip:text;color:transparent}' +
      '.crozzo-bday-overlay__sub{margin:0 0 18px;font-size:.9rem;color:var(--text-secondary);line-height:1.5}' +
      '.crozzo-bday-overlay__btn{min-width:140px}' +
      '.crozzo-bday-cake{position:relative;width:88px;height:72px;margin:0 auto 18px}' +
      '.crozzo-bday-cake__layer{position:absolute;left:50%;transform:translateX(-50%);border-radius:8px}' +
      '.crozzo-bday-cake__layer--1{bottom:0;width:88px;height:28px;background:linear-gradient(180deg,#fcd34d,#f59e0b)}' +
      '.crozzo-bday-cake__layer--2{bottom:22px;width:72px;height:22px;background:linear-gradient(180deg,#f9a8d4,#ec4899)}' +
      '.crozzo-bday-cake__layer--3{bottom:38px;width:56px;height:18px;background:linear-gradient(180deg,#93c5fd,#3b82f6)}' +
      '.crozzo-bday-cake__candle{position:absolute;bottom:54px;left:50%;width:6px;height:22px;margin-left:-3px;background:#fff;border-radius:3px}' +
      '.crozzo-bday-cake__flame{position:absolute;bottom:74px;left:50%;width:12px;height:16px;margin-left:-6px;background:radial-gradient(circle at 50% 80%,#fde047,#f97316);border-radius:50% 50% 50% 50%;animation:crozzoBdayFlame .35s ease-in-out infinite alternate}' +
      '@keyframes crozzoBdayFlame{from{transform:scale(1) translateY(0)}to{transform:scale(1.08) translateY(-2px)}}' +
      '@media(prefers-reduced-motion:reduce){.crozzo-bday-balloon,.crozzo-bday-confetti,.crozzo-bday-cake__flame,.crozzo-staff-bday-badge--today{animation:none!important}}'
    );
  }

  function injectStyles() {
    var st = document.getElementById('crozzo-staff-celebrations-styles');
    if (!st) {
      st = document.createElement('style');
      st.id = 'crozzo-staff-celebrations-styles';
      document.head.appendChild(st);
    }
    st.textContent = getCss();
  }

  global.CrozzoStaffCelebrations = {
    applyDefaultStaffFields: applyDefaultStaffFields,
    loadSettings: loadSettings,
    saveSettings: saveSettings,
    listStaffBirthdayReminders: listStaffBirthdayReminders,
    staffBirthdayBadge: staffBirthdayBadge,
    renderHubBanner: renderHubBanner,
    renderSettingsPanel: renderSettingsPanel,
    renderEditFields: renderEditFields,
    renderNewUserFields: renderNewUserFields,
    collectEditFields: collectEditFields,
    collectNewUserFields: collectNewUserFields,
    onLoginSuccess: onLoginSuccess,
    showLoginCelebration: showLoginCelebration,
    maybeStaffTeamReminder: maybeStaffTeamReminder,
    bindUsuariosPage: bindUsuariosPage,
    injectStyles: injectStyles,
  };
})(typeof window !== 'undefined' ? window : globalThis);
