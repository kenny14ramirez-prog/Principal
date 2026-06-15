/**
 * Crozzo POS — Capa psicológica operativa: confort, refuerzo positivo y estados de apoyo.
 */
(function (global) {
  'use strict';

  var LS = 'crozzo_operative_psyche_v1';
  var SS_CHIP = 'crozzo_psyche_chip_dismiss';
  var SS_SESSION = 'crozzo_comfort_session_start';
  var LS_BREAK_SNOOZE = 'crozzo_break_snooze_until';
  var LS_BREAK_INTERVAL = 'crozzo_break_interval_min';
  var LS_COMFORT_OFF = 'crozzo_comfort_off';
  var DEFAULT_BREAK_MIN = 90;
  var MIN_BREAK_MIN = 60;
  var MAX_BREAK_MIN = 180;
  var BREAK_CHECK_MS = 120000;
  var BREAK_GRACE_MS = 45 * 60000;
  var BREAK_NUDGE_AUTO_MS = 18000;
  var _psycheChipHtmlCache = '';
  var _psycheHeaderCache = '';
  var _peakStripActive = null;
  var _psycheChromeTimer = null;

  var BREAK_LINES = [
    '☕ Un respiro breve ayuda — agua, estirar, mirar lejos de la pantalla.',
    '🌿 Lleva rato concentrado. Treinta segundos fuera recargan el enfoque.',
    '✨ Cuando quiera, pause un momento. La app sigue aquí.',
    '🪑 Cuídese un instante y vuelva con calma.',
  ];

  var WELCOME_BACK_LINES = [
    'De vuelta — siga cuando quiera, sin prisa.',
    'Bienvenido otra vez — todo sigue donde lo dejó.',
    'Qué bueno tenerle de vuelta. Tómelo con calma.',
  ];

  // Frases cálidas (acogida): se muestra una por día, de forma estable.
  var WARM_PHRASES = [
    'Tu trabajo hace que este lugar funcione. Gracias por estar hoy. 💛',
    'Hazlo a tu ritmo — un paso a la vez, lo estás haciendo bien. 🌿',
    'No tienes que saberlo todo: el sistema te acompaña en cada paso. 🤝',
    'Tu calma se contagia al equipo. Gracias por cuidarla. ✨',
    'Los errores son parte de aprender — aquí te cubrimos. 🌱',
    'Pequeños detalles, gran servicio. Tú ya los tienes. ⭐',
    'Respira, sonríe, y disfruta el turno. El resto lo resolvemos juntos. ☀️',
    'Hoy es un buen día para hacerlo simple y hacerlo bien. 🍃',
    'Cada cliente que atiendes con cariño deja huella. Gracias. 🌟',
    'Tu esfuerzo se nota y se valora. Bienvenido al equipo. 💫',
  ];

  function getWarmPhrase() {
    try {
      var d = new Date();
      var seed = d.getFullYear() * 1000 + (d.getMonth() * 31 + d.getDate());
      return WARM_PHRASES[seed % WARM_PHRASES.length];
    } catch (_) {
      return WARM_PHRASES[0];
    }
  }

  var STATES = {
    calm: { id: 'calm', label: 'Tranquilo', emoji: '🌿', tone: 'Puede avanzar con calma. El sistema está listo.', color: 'calm' },
    focus: { id: 'focus', label: 'En flujo', emoji: '✨', tone: 'Buen ritmo de servicio. Usted controla los pasos.', color: 'focus' },
    support: { id: 'support', label: 'Apoyado', emoji: '🤝', tone: 'Le ayudamos a evitar errores comunes — no está solo.', color: 'support' },
    peak: { id: 'peak', label: 'Pico con respaldo', emoji: '💪', tone: 'Servicio intenso: enfoque en lo esencial. Respire.', color: 'peak' },
  };

  var ROLE_LINES = {
    mesero: 'Hoy en sala: un paso a la vez, el cliente lo nota.',
    caja: 'Caja con respaldo: el sistema valida antes de cerrar.',
    cocina: 'Cocina en orden: marque listo cuando pueda, sin prisa falsa.',
    admin: 'Visión completa del negocio — delegue lo operativo con confianza.',
    inventario: 'Compras con trazabilidad: cada factura cuenta.',
    user: 'Bienvenido — el menú muestra solo lo que necesita.',
    gerente: 'Liderazgo con datos: revise cierre e inicio de ventas.',
    chef: 'Producción clara: comandas y pedidos internos a la mano.',
  };

  var EXPERT_ROLE_LINES = {
    mesero: 'Sala en control — ritmo y precisión.',
    caja: 'Caja precisa — cada cierre cuenta.',
    cocina: 'Producción al día.',
    admin: 'Visión ejecutiva del turno.',
    inventario: 'Compras bajo control.',
    gerente: 'Decisiones con datos en tiempo real.',
    chef: 'Cocina coordinada.',
    user: 'Acceso listo — elija su módulo.',
  };

  var ROLE_QUICK = {
    mesero: [{ page: 'tablets', label: 'Tablets' }, { page: 'comandas', label: 'Comandas' }],
    caja: [{ page: 'cajero', label: 'POS' }, { page: 'cierre-caja', label: 'Cierre' }],
    cocina: [{ page: 'cocina', label: 'Cocina' }, { page: 'comandas', label: 'Comandas' }],
    admin: [{ page: 'cajero', label: 'POS' }, { page: 'cierre-caja', label: 'Cierre' }],
    gerente: [{ page: 'inicio-operacion', label: 'Inicio' }, { page: 'cierre-caja', label: 'Cierre' }],
    inventario: [{ page: 'centro-compras', label: 'Compras' }, { page: 'inventarios', label: 'Inventario' }],
    chef: [{ page: 'cocina', label: 'Cocina' }, { page: 'pedidos-internos', label: 'Pedidos' }],
    user: [{ page: 'cajero', label: 'POS' }],
  };

  var ROLE_TIPS = {
    mesero: 'Tip: doble tap en Comandar es normal al inicio — el sistema lo detecta.',
    caja: 'Tip: registre la base de caja al abrir turno para un cierre sin estrés.',
    cocina: 'Tip: marcar «listo» libera mesa mentalmente — un clic menos de presión.',
    admin: 'Tip: perfil Pequeño simplifica el menú del equipo automáticamente.',
    inventario: 'Tip: recepción en DEMO primero — cero riesgo fiscal.',
    user: 'Tip: use Inicio ventas para elegir restaurante o tienda.',
  };

  var CLOSE_MESSAGES = [
    'Turno cerrado con orden. Descanse — mañana el contador reinicia limpio.',
    'Buen trabajo hoy. El cierre quedó registrado para el equipo.',
    'Cierre guardado. Cada arqueo honesto fortalece la confianza del local.',
  ];

  var AFFIRMATIONS = {
    dup_blocked: [
      'Buen reflejo revisar: evitamos un envío duplicado a cocina.',
      'El doble clic es muy común al inicio — usted lo detectó a tiempo.',
    ],
    obs_saved: ['Cuidar alergias protege al cliente y al equipo. Gracias por anotar.'],
    comanda_prueba: ['¡Primera comanda enviada! Un paso clave del aprendizaje.'],
    cierre_prueba: ['Cierre simulado completado. Ya conoce el flujo sin presión real.'],
    checklist_step: ['Paso completado — va construyendo confianza con el sistema.'],
    login_shift: ['Buen turno. En modo práctica no hay riesgo fiscal.'],
    arqueo_ok: ['Cierre registrado. Transparencia que genera confianza en el equipo.'],
    wellbeing_ok: ['Gracias por compartir cómo se siente — nos ayuda a mejorar el equipo.'],
    comanda_ok: ['Comanda en camino — cocina informada, usted en control.'],
    cobro_ok: ['Cobro registrado. Cada venta bien hecha suma al equipo.'],
    cliente_lookup_ok: ['Cliente identificado — un paso menos en caja.'],
  };

  function readStore() {
    try {
      var raw = localStorage.getItem(LS);
      if (!raw) return { affirmShown: {}, lastGreetUser: '', wins: 0, wellbeing: [] };
      var s = JSON.parse(raw);
      s.affirmShown = s.affirmShown || {};
      s.wellbeing = s.wellbeing || [];
      return s;
    } catch (_) {
      return { affirmShown: {}, lastGreetUser: '', wins: 0, wellbeing: [] };
    }
  }

  function writeStore(patch) {
    var cur = readStore();
    var next = Object.assign({}, cur, patch || {});
    if (patch && patch.affirmShown) next.affirmShown = Object.assign({}, cur.affirmShown, patch.affirmShown);
    if (patch && patch.wellbeing) {
      var merged = (cur.wellbeing || []).concat(patch.wellbeing);
      next.wellbeing = merged.slice(-120);
    }
    try {
      localStorage.setItem(LS, JSON.stringify(next));
    } catch (_) {}
    return next;
  }

  function getExperiencia() {
    try {
      if (typeof global.crozzoGetPerfilOperativo === 'function') {
        var m = global.crozzoGetPerfilOperativo(
          typeof global.crozzoGetPerfilEmpresa === 'function' ? global.crozzoGetPerfilEmpresa() : ''
        );
        return (m && m.experiencia) || 'mixed';
      }
    } catch (_) {}
    return 'mixed';
  }

  function getRoleNorm() {
    try {
      if (typeof global.crozzoNormalizeAppRol === 'function' && typeof global.getCurrentUser === 'function') {
        var u = global.getCurrentUser();
        if (u && u.rol) return global.crozzoNormalizeAppRol(u.rol);
      }
    } catch (_) {}
    return '';
  }

  function shouldApplyPsycheLayer() {
    return getExperiencia() === 'novice' || getExperiencia() === 'mixed';
  }

  function shouldApplyHumanLayer() {
    return shouldApplyPsycheLayer();
  }

  function isComfortOptedOut() {
    try {
      if (localStorage.getItem(LS_COMFORT_OFF) === '1') return true;
    } catch (_) {}
    return false;
  }

  /** Confort visual + pausas: todos los usuarios con sesión (no solo onboarding). */
  function shouldApplyComfortUx() {
    if (isComfortOptedOut()) return false;
    try {
      if (typeof global.getCurrentUser === 'function' && global.getCurrentUser()) return true;
    } catch (_) {}
    return false;
  }

  function comfortMotionSoft() {
    if (shouldApplyComfortUx()) return true;
    try {
      if (typeof global.crozzoMotionReduced === 'function' && global.crozzoMotionReduced()) return true;
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    } catch (_) {}
    return false;
  }

  function getBreakIntervalMs() {
    var m = DEFAULT_BREAK_MIN;
    try {
      m = parseInt(localStorage.getItem(LS_BREAK_INTERVAL), 10);
    } catch (_) {}
    if (!m || m < MIN_BREAK_MIN) m = DEFAULT_BREAK_MIN;
    if (m > MAX_BREAK_MIN) m = MAX_BREAK_MIN;
    return m * 60000;
  }

  function escBreakHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function isBusyOperationalPage() {
    try {
      var p = global.currentPage;
      if (p === 'cajero' || p === 'venta-comercial' || p === 'tablets' || p === 'cocina' || p === 'comandas') return true;
    } catch (_) {}
    return false;
  }

  function closeBreakNudge(snoozeMinutes) {
    var el = global.__crozzoBreakNudgeEl;
    if (el) {
      if (el._autoTimer) clearTimeout(el._autoTimer);
      el.classList.add('crozzo-break-nudge--exit');
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 320);
      global.__crozzoBreakNudgeEl = null;
    }
    if (snoozeMinutes != null) snoozeBreakReminder(snoozeMinutes);
  }

  function showBreakNudge() {
    if (global.__crozzoBreakNudgeEl) return;
    if (isBusyOperationalPage()) return;
    var line = BREAK_LINES[Math.floor(Math.random() * BREAK_LINES.length)];
    var wrap = document.createElement('div');
    wrap.className = 'crozzo-break-nudge';
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-live', 'polite');
    wrap.innerHTML =
      '<button type="button" class="crozzo-break-nudge__close" aria-label="Cerrar recordatorio" onclick="CrozzoOperativePsyche.dismissBreakNudge(45)">×</button>' +
      '<p class="crozzo-break-nudge__text">' +
      escBreakHtml(line) +
      '</p>' +
      '<div class="crozzo-break-nudge__actions">' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="CrozzoOperativePsyche.ackBreakPause()">☕ Pausa</button>' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="CrozzoOperativePsyche.snoozeBreakAndClose(90)">Más tarde</button>' +
      '</div>';
    document.body.appendChild(wrap);
    global.__crozzoBreakNudgeEl = wrap;
    wrap._autoTimer = setTimeout(function () {
      closeBreakNudge(45);
    }, BREAK_NUDGE_AUTO_MS);
  }

  function getSessionStartMs() {
    try {
      var s = sessionStorage.getItem(SS_SESSION);
      if (s) return parseInt(s, 10) || Date.now();
    } catch (_) {}
    return Date.now();
  }

  function markComfortSessionStart() {
    try {
      sessionStorage.setItem(SS_SESSION, String(Date.now()));
      sessionStorage.removeItem('crozzo_welcome_back_done');
    } catch (_) {}
  }

  function getBreakSnoozeUntil() {
    try {
      return parseInt(localStorage.getItem(LS_BREAK_SNOOZE), 10) || 0;
    } catch (_) {
      return 0;
    }
  }

  function snoozeBreakReminder(minutes) {
    var until = Date.now() + (minutes || 15) * 60000;
    try {
      localStorage.setItem(LS_BREAK_SNOOZE, String(until));
    } catch (_) {}
  }

  function maybeShowBreakReminder() {
    if (!shouldApplyComfortUx()) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    if (Date.now() < getBreakSnoozeUntil()) return;
    if (Date.now() - getSessionStartMs() < BREAK_GRACE_MS) return;
    if (isBusyOperationalPage()) return;
    var lastKey = 'crozzo_last_break_prompt';
    var last = 0;
    try {
      last = parseInt(sessionStorage.getItem(lastKey), 10) || 0;
    } catch (_) {}
    if (Date.now() - last < getBreakIntervalMs()) return;
    try {
      sessionStorage.setItem(lastKey, String(Date.now()));
    } catch (_) {}
    showBreakNudge();
  }

  function dismissBreakNudge(minutes) {
    closeBreakNudge(minutes != null ? minutes : 45);
  }

  function ackBreakPause() {
    closeBreakNudge(15);
    if (typeof global.showToast === 'function') {
      global.showToast('Tómese su tiempo — aquí estaremos cuando regrese.', 'success');
    }
  }

  function snoozeBreakAndClose(minutes) {
    closeBreakNudge(minutes || 90);
  }

  function startComfortBreakLoop() {
    if (global.__crozzoComfortBreakLoop) return;
    global.__crozzoComfortBreakLoop = setInterval(maybeShowBreakReminder, BREAK_CHECK_MS);
  }

  function stopComfortBreakLoop() {
    if (global.__crozzoComfortBreakLoop) {
      clearInterval(global.__crozzoComfortBreakLoop);
      global.__crozzoComfortBreakLoop = null;
    }
  }

  function patchVisibilityWelcomeBack() {
    if (global.__crozzoComfortVisPatched) return;
    global.__crozzoComfortVisPatched = true;
    var hiddenAt = 0;
    document.addEventListener('visibilitychange', function () {
      if (!shouldApplyComfortUx()) return;
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }
      if (!hiddenAt || Date.now() - hiddenAt < 90000) return;
      try {
        if (sessionStorage.getItem('crozzo_welcome_back_done') === '1') return;
        sessionStorage.setItem('crozzo_welcome_back_done', '1');
      } catch (_) {}
      if (typeof global.showToast !== 'function') return;
      var msg = WELCOME_BACK_LINES[Math.floor(Math.random() * WELCOME_BACK_LINES.length)];
      setTimeout(function () {
        global.showToast(msg, 'info');
      }, 400);
    });
  }

  function shouldApplyHumanToasts() {
    try {
      if (typeof global.getCurrentUser === 'function' && global.getCurrentUser()) return true;
    } catch (_) {}
    return shouldApplyPsycheLayer();
  }

  function getFirstName() {
    try {
      if (typeof global.crozzoPremiumFirstName === 'function' && typeof global.getCurrentUser === 'function') {
        var u = global.getCurrentUser();
        return global.crozzoPremiumFirstName(u && u.nombre);
      }
      var u2 = typeof global.getCurrentUser === 'function' ? global.getCurrentUser() : null;
      if (u2 && u2.nombre) return String(u2.nombre).trim().split(/\s+/)[0];
    } catch (_) {}
    return '';
  }

  var HUMAN_TOAST_SOFT = [
    { re: /sin acceso|no tiene permisos/i, msg: 'Aún no tiene módulos asignados — pida ayuda a su encargado con calma.' },
    { re: /comande todo a cocina/i, msg: 'Falta comandar a cocina — un paso más y puede cobrar tranquilo.' },
    { re: /sesión cerrada/i, msg: 'Sesión cerrada. Gracias por su turno.' },
    { re: /indica el motivo/i, msg: 'Cuéntenos brevemente el motivo — nos ayuda a dejar registro ordenado.' },
    { re: /diferencia significativa/i, msg: 'Cierre con diferencia — quedó registrado para revisión sin juicio.' },
    { re: /duplicad|doble/i, msg: 'Detectamos un envío muy similar — revisamos juntos antes de mandar.' },
    { re: /sin cobrar|consumo sin/i, msg: 'Hay consumo pendiente de cobro — un paso más antes de salir.' },
    { re: /solo encargados|solo administradores/i, msg: 'Esta acción la realiza su encargado — avísele con tranquilidad.' },
  ];

  var HUMAN_TOAST_SUCCESS = [
    { re: /comanda enviada|comanda #\d+ creada|cocina recibió/i, msg: 'Listo — cocina ya recibe el pedido. Buen servicio.' },
    { re: /venta registrada| cobro |cobrado/i, msg: 'Venta registrada. Gracias por cuidar cada detalle.' },
    { re: /comanda.*actualizada/i, msg: 'Comanda actualizada — cocina verá los cambios al instante.' },
    { re: /cierre registrado|turno cerrado/i, msg: 'Cierre guardado con orden. Buen trabajo.' },
  ];

  function humanizeToastMessage(message, type) {
    if (!shouldApplyHumanToasts() || !message) return message;
    var msg = String(message);
    if (type === 'success') {
      for (var j = 0; j < HUMAN_TOAST_SUCCESS.length; j++) {
        if (HUMAN_TOAST_SUCCESS[j].re.test(msg)) return HUMAN_TOAST_SUCCESS[j].msg;
      }
    }
    if (type === 'error' || type === 'warning') {
      for (var i = 0; i < HUMAN_TOAST_SOFT.length; i++) {
        if (HUMAN_TOAST_SOFT[i].re.test(msg)) return HUMAN_TOAST_SOFT[i].msg;
      }
      if (type === 'error' && !/—|gracias|calma|juntos/i.test(msg)) {
        return msg.replace(/\.$/, '') + ' — estamos aquí para ayudarle.';
      }
    }
    return msg;
  }

  function celebrateWinMilestones(wins) {
    var milestones = { 5: '5 aciertos con apoyo del sistema — va tomando confianza.', 10: '10 aciertos — el equipo y el POS ya trabajan en equipo.', 25: '25 aciertos — dominio sólido sin presión innecesaria.' };
    var keys = Object.keys(milestones).map(Number).sort(function (a, b) { return a - b; });
    for (var i = 0; i < keys.length; i++) {
      var n = keys[i];
      if (wins === n && typeof global.showToast === 'function') {
        global.showToast(milestones[n], 'success');
        return;
      }
    }
  }

  function applyComfortClasses() {
    if (!document.body) return;
    var comfort = shouldApplyComfortUx();
    var human = comfort || shouldApplyHumanLayer();
    var psyche = human && shouldApplyPsycheLayer();
    document.body.classList.toggle('crozzo-comfort-ux', comfort);
    document.body.classList.toggle('crozzo-session-comfort', human);
    document.body.classList.toggle('crozzo-premium-human', human);
    document.body.classList.toggle('crozzo-premium-psyche', psyche);
    document.body.classList.toggle('crozzo-psyche-active', psyche);
  }

  function schedulePsycheChromeRefresh() {
    if (_psycheChromeTimer) return;
    _psycheChromeTimer = setTimeout(function () {
      _psycheChromeTimer = null;
      refreshPsycheChrome(false);
    }, 120);
  }

  function refreshPsycheChrome(force) {
    updateHeaderPsycheLine();
    injectPsycheChipHost(!!force);
  }

  function syncPsycheAfterRoleStorage() {
    applyComfortClasses();
    schedulePsycheChromeRefresh();
  }

  function bindLoginWelcomeOnce() {
    if (global.__crozzoLoginWelcomeBound) return;
    global.__crozzoLoginWelcomeBound = true;
    document.addEventListener('crozzo-ready', function (ev) {
      try {
        if (ev && ev.detail && ev.detail.source === 'login') onLoginWelcome();
      } catch (_) {}
    });
  }

  function patchHumanToasts() {
    if (global.__crozzoHumanToastPatched || typeof global.showToast !== 'function') return;
    global.__crozzoHumanToastPatched = true;
    var orig = global.showToast;
    global.showToast = function (message, type) {
      var t = type || 'info';
      if (!global.__crozzoAffirmToastLock) maybeAffirmComandaFromToast(message);
      var msg = humanizeToastMessage(message, t);
      if (document.body && document.body.classList.contains('crozzo-premium-human') && (t === 'warning' || t === 'error')) {
        return orig.call(global, msg, t === 'error' ? 'warning' : t);
      }
      return orig.call(global, msg, t);
    };
  }

  function getPsychState() {
    var stress = { level: 'calm', label: 'Operación normal' };
    var hf = { score: 70, label: 'Equilibrio' };
    try {
      if (global.CrozzoOnboardingOperativo && global.CrozzoOnboardingOperativo.getCombinedStress) {
        var cs = global.CrozzoOnboardingOperativo.getCombinedStress();
        stress = cs;
        hf = cs.humanFactor || hf;
      } else if (typeof global.crozzoShiftGetRestaurantStress === 'function') {
        stress = global.crozzoShiftGetRestaurantStress();
      }
    } catch (_) {}
    if (stress.combined === 'critical' || stress.level === 'rush') {
      return Object.assign({}, STATES.peak, { hfScore: hf.score, hfLabel: hf.label });
    }
    if (stress.level === 'busy') return Object.assign({}, STATES.focus, { hfScore: hf.score, hfLabel: hf.label });
    if (getExperiencia() === 'novice' && hf.score < 55) {
      return Object.assign({}, STATES.support, { hfScore: hf.score, hfLabel: hf.label });
    }
    return Object.assign({}, STATES.calm, { hfScore: hf.score, hfLabel: hf.label });
  }

  function maybeAffirm(key, message) {
    if (!shouldApplyPsycheLayer()) return;
    var st = readStore();
    var today = new Date().toISOString().slice(0, 10);
    var dedupeKey = key + '_' + today + '_' + (getRoleNorm() || 'all');
    if (!global.__crozzoAffirmPending) global.__crozzoAffirmPending = {};
    if (st.affirmShown[dedupeKey] || global.__crozzoAffirmPending[dedupeKey]) return;
    var pool = AFFIRMATIONS[key];
    var msg = message || (pool && pool[Math.floor(Math.random() * pool.length)]) || '';
    if (!msg || typeof global.showToast !== 'function') return;
    global.__crozzoAffirmPending[dedupeKey] = 1;
    var shown = {};
    shown[dedupeKey] = 1;
    var newWins = (st.wins || 0) + 1;
    writeStore({ affirmShown: shown, wins: newWins });
    global.__crozzoAffirmToastLock = true;
    try {
      global.showToast(msg, 'success');
    } finally {
      global.__crozzoAffirmToastLock = false;
      delete global.__crozzoAffirmPending[dedupeKey];
    }
    celebrateWinMilestones(newWins);
  }

  function getRoleLine() {
    var r = getRoleNorm();
    if (getExperiencia() === 'expert') return EXPERT_ROLE_LINES[r] || EXPERT_ROLE_LINES.user;
    return ROLE_LINES[r] || ROLE_LINES.user;
  }

  function getRoleTip() {
    var r = getRoleNorm();
    return ROLE_TIPS[r] || '';
  }

  function updateHeaderPsycheLine() {
    if (!shouldApplyHumanLayer()) return;
    var line = getRoleLine();
    var el = document.getElementById('crozzoHeaderPsycheLine');
    if (el && line === _psycheHeaderCache && !el.hidden) return;
    _psycheHeaderCache = line;
    if (!el) {
      var greet = document.getElementById('crozzoHeaderGreeting');
      if (!greet || !greet.parentNode) return;
      el = document.createElement('span');
      el.id = 'crozzoHeaderPsycheLine';
      el.className = 'crozzo-header-psyche-line';
      greet.parentNode.insertBefore(el, greet.nextSibling);
    }
    el.textContent = line;
    el.hidden = false;
  }

  function onLoginWelcome() {
    if (!shouldApplyComfortUx() && !shouldApplyHumanLayer()) return;
    if (!global.__crozzoComfortSessionBooted) {
      global.__crozzoComfortSessionBooted = true;
      markComfortSessionStart();
      startComfortBreakLoop();
    }
    applyComfortClasses();
    schedulePsycheChromeRefresh();
    var u = typeof global.getCurrentUser === 'function' ? global.getCurrentUser() : null;
    if (!u) return;
    var st = readStore();
    var key = String(u.id || u.nombre || '');
    var today = new Date().toISOString().slice(0, 10);
    var greetKey = key + '_' + today;
    if (global.__crozzoWelcomeToastScheduled || global.__crozzoWelcomeToastDone === greetKey) return;
    if (st.lastGreetUser === greetKey) {
      global.__crozzoWelcomeToastDone = greetKey;
      return;
    }
    global.__crozzoWelcomeToastScheduled = true;
    writeStore({ lastGreetUser: greetKey });
    var first = getFirstName();
    var greet = typeof global.crozzoPremiumGreeting === 'function' ? global.crozzoPremiumGreeting() : 'Bienvenido';
    setTimeout(function () {
      global.__crozzoWelcomeToastScheduled = false;
      global.__crozzoWelcomeToastDone = greetKey;
      if (typeof global.showToast === 'function') {
        var closers = [
          'Su espacio de trabajo está listo. 💛',
          'Qué bueno tenerle hoy. Vamos con calma. 🌿',
          'Aquí estamos para acompañarle. ✨',
          'Listo para un buen turno. Un paso a la vez. ☀️',
        ];
        var closer = closers[Math.floor(Math.random() * closers.length)];
        var line = first ? greet + ', ' + first + '. ' + closer : greet + '. ' + closer;
        global.__crozzoAffirmToastLock = true;
        try {
          global.showToast(line, 'success');
        } finally {
          global.__crozzoAffirmToastLock = false;
        }
      }
      if (shouldApplyPsycheLayer()) maybeAffirm('login_shift');
    }, 700);
  }

  function renderMinimalHumanChip() {
    if (!shouldApplyHumanLayer() || shouldApplyPsycheLayer()) return '';
    try {
      if (sessionStorage.getItem(SS_CHIP) === '1') return '';
    } catch (_) {}
    var s = getPsychState();
    return (
      '<div class="crozzo-human-chip crozzo-human-chip--' +
      s.color +
      '" role="status">' +
      '<span aria-hidden="true">' +
      s.emoji +
      '</span>' +
      '<span>' +
      s.label +
      ' · ' +
      s.tone +
      '</span>' +
      '<button type="button" class="crozzo-psyche-chip__close" onclick="CrozzoOperativePsyche.dismissChip()" aria-label="Ocultar">×</button></div>'
    );
  }

  function renderConciergeStrip() {
    if (!shouldApplyPsycheLayer()) return '';
    try {
      if (
        document.documentElement.classList.contains('crozzo-android-apk') ||
        document.documentElement.classList.contains('crozzo-tauri-rail-ui')
      ) return '';
    } catch (_) {}
    var first = getFirstName();
    var greet = typeof global.crozzoPremiumGreeting === 'function' ? global.crozzoPremiumGreeting() : 'Bienvenido';
    var s = getPsychState();
    var r = getRoleNorm();
    var links = ROLE_QUICK[r] || ROLE_QUICK.user;
    var linksHtml = links
      .map(function (l) {
        return (
          '<button type="button" class="crozzo-concierge-strip__link" onclick="navigateTo(\'' +
          l.page +
          '\')">' +
          l.label +
          '</button>'
        );
      })
      .join('');
    var nameLine = first ? greet + ', <strong>' + first + '</strong>' : greet;
    return (
      '<aside class="crozzo-concierge-strip crozzo-concierge-strip--' +
      s.color +
      '" role="region" aria-label="Bienvenida">' +
      '<div class="crozzo-concierge-strip__main">' +
      '<span class="crozzo-concierge-strip__mark" aria-hidden="true">✦</span>' +
      '<div><p class="crozzo-concierge-strip__greet">' +
      nameLine +
      '</p>' +
      '<p class="crozzo-concierge-strip__tone">' +
      getRoleLine() +
      '</p>' +
      '<p class="crozzo-concierge-strip__warm">' +
      getWarmPhrase() +
      '</p></div></div>' +
      '<div class="crozzo-concierge-strip__actions">' +
      linksHtml +
      (shouldApplyPsycheLayer() && global.CrozzoOnboardingOperativo
        ? '<button type="button" class="crozzo-concierge-strip__link" onclick="CrozzoOnboardingOperativo.openModal()">Checklist</button>'
        : '') +
      '</div></aside>'
    );
  }

  function injectPeakBreatheStrip() {
    if (!shouldApplyComfortUx() && !shouldApplyHumanLayer()) return;
    var s = getPsychState();
    var critical = s.id === 'peak';
    var host = document.getElementById('crozzo-peak-breathe-host');
    if (!critical) {
      if (_peakStripActive === false) return;
      _peakStripActive = false;
      if (host) host.innerHTML = '';
      return;
    }
    if (_peakStripActive === true && host && host.innerHTML) return;
    _peakStripActive = true;
    if (!host) {
      host = document.createElement('div');
      host.id = 'crozzo-peak-breathe-host';
      host.className = 'crozzo-peak-breathe-host';
      var chip = document.getElementById('crozzo-psyche-chip-host');
      var main = document.getElementById('mainContent');
      var anchor = chip || main;
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(host, anchor);
    }
    host.innerHTML =
      '<div class="crozzo-peak-breathe crozzo-peak-breathe--soft" role="status" aria-live="polite">' +
      '<span aria-hidden="true">🌿</span>' +
      '<span>Rush de servicio — un respiro y lo esencial primero. Sin prisa falsa.</span></div>';
  }

  function maybeAffirmComandaFromToast(message) {
    if (!shouldApplyPsycheLayer() || !message) return;
    if (/comanda enviada|cocina recibió|comanda #\d+ creada/i.test(String(message))) {
      maybeAffirm('comanda_ok');
    }
    if (/venta registrada|cobro exitoso|pago registrado/i.test(String(message))) {
      maybeAffirm('cobro_ok');
    }
  }

  function renderPsycheChip() {
    if (!shouldApplyPsycheLayer()) return '';
    try {
      if (sessionStorage.getItem(SS_CHIP) === '1') return '';
    } catch (_) {}
    var s = getPsychState();
    var st = readStore();
    var tip = getRoleTip();
    return (
      '<div class="crozzo-psyche-chip crozzo-psyche-chip--' +
      s.color +
      '" role="status" aria-live="polite">' +
      '<span class="crozzo-psyche-chip__emoji" aria-hidden="true">' +
      s.emoji +
      '</span>' +
      '<div class="crozzo-psyche-chip__body">' +
      '<strong>' +
      s.label +
      '</strong>' +
      '<span class="form-hint">' +
      s.tone +
      '</span>' +
      (tip ? '<span class="crozzo-psyche-chip__tip">' + tip + '</span>' : '') +
      (st.wins > 0 ? '<span class="crozzo-psyche-chip__wins">🏆 ' + st.wins + ' aciertos con apoyo del sistema</span>' : '') +
      '</div>' +
      '<button type="button" class="crozzo-psyche-chip__close" onclick="CrozzoOperativePsyche.dismissChip()" title="Ocultar por esta sesión" aria-label="Ocultar">×</button></div>'
    );
  }

  function dismissChip() {
    try {
      sessionStorage.setItem(SS_CHIP, '1');
    } catch (_) {}
    _psycheChipHtmlCache = '';
    var host = document.getElementById('crozzo-psyche-chip-host');
    if (host) host.innerHTML = '';
  }

  function getSupportiveDupModalHtml(refLabel, dup) {
    return (
      '<div class="crozzo-psyche-modal">' +
      '<p class="crozzo-psyche-modal__lead">Envío muy similar hace <strong>' +
      dup.ageSec +
      ' s</strong> a <strong>' +
      refLabel +
      '</strong></p>' +
      '<p class="form-hint">No es un fallo suyo: el doble clic es el error #1 con personal nuevo.</p>' +
      '<div class="btn-group" style="justify-content:flex-end;margin-top:14px;flex-wrap:wrap;gap:8px;">' +
      '<button type="button" class="btn btn-primary" onclick="CrozzoOperativePsyche.affirmDupCancel();closeModal()">✓ Revisar — buena decisión</button>' +
      '<button type="button" class="btn btn-outline" onclick="CrozzoOnboardingOperativo.confirmDuplicateSend()">Es otro pedido distinto</button></div></div>'
    );
  }

  function getSupportiveObsModalHtml(refLabel, riesgo) {
    var list = riesgo.map(function (n) { return '<li>' + String(n).replace(/</g, '&lt;') + '</li>'; }).join('');
    return (
      '<div class="crozzo-psyche-modal">' +
      '<p class="crozzo-psyche-modal__lead">Cuidado al cliente en <strong>' + refLabel + '</strong></p>' +
      '<ul class="crozzo-onb-tour">' + list + '</ul>' +
      '<p class="form-hint">10 segundos de nota evitan incidentes. Si no hay restricciones, confirme.</p>' +
      '<div class="btn-group" style="justify-content:flex-end;margin-top:14px;flex-wrap:wrap;gap:8px;">' +
      '<button type="button" class="btn btn-primary" onclick="closeModal()">📝 Agregar nota</button>' +
      '<button type="button" class="btn btn-outline" onclick="CrozzoOnboardingOperativo.confirmObservacionSend()">Sin restricciones</button></div></div>'
    );
  }

  function getSupportiveArqueoModalHtml(cs, pending, formatMoney) {
    var fmt = formatMoney || function (n) {
      return '$' + Math.round(Math.abs(Number(n) || 0)).toLocaleString('es-CO');
    };
    return (
      '<div class="crozzo-psyche-modal">' +
      '<p class="crozzo-psyche-modal__lead">Antes de cerrar — un respiro para revisar</p>' +
      '<p class="form-hint">Servicio <strong>' + (cs.label || 'intenso') + '</strong>. Un cierre correcto evita estrés mañana.</p>' +
      '<ul class="crozzo-onb-tour"><li>Diferencia: <strong>' + fmt(pending.diff) + '</strong></li></ul>' +
      '<div class="btn-group" style="justify-content:flex-end;margin-top:14px;flex-wrap:wrap;gap:8px;">' +
      '<button type="button" class="btn btn-primary" onclick="closeModal()">Revisar con calma</button>' +
      '<button type="button" class="btn btn-outline" onclick="CrozzoOperativePsyche.proceedArqueo()">Confirmar cierre</button></div></div>'
    );
  }

  function renderWellbeingModal(onDone) {
    if (typeof onDone === 'function') global.__crozzoWellbeingOnDone = onDone;
    return (
      '<div class="crozzo-psyche-wellbeing">' +
      '<p class="crozzo-psyche-modal__lead">¿Cómo se sintió en este turno?</p>' +
      '<p class="form-hint">Un clic anónimo en este dispositivo — ayuda al local a cuidar al equipo.</p>' +
      '<div class="crozzo-psyche-wellbeing__opts">' +
      '<button type="button" class="crozzo-psyche-mood" onclick="CrozzoOperativePsyche.recordWellbeing(\'good\')">😊 Bien</button>' +
      '<button type="button" class="crozzo-psyche-mood" onclick="CrozzoOperativePsyche.recordWellbeing(\'ok\')">😐 Regular</button>' +
      '<button type="button" class="crozzo-psyche-mood" onclick="CrozzoOperativePsyche.recordWellbeing(\'hard\')">😓 Exigente</button>' +
      '</div>' +
      '<button type="button" class="btn btn-outline btn-sm" style="margin-top:12px;" onclick="CrozzoOperativePsyche.finishWellbeingSkip()">Omitir</button></div>'
    );
  }

  function finishWellbeingSkip() {
    if (typeof global.closeModal === 'function') global.closeModal();
    invokeWellbeingDone();
  }

  function invokeWellbeingDone() {
    if (typeof global.__crozzoWellbeingOnDone === 'function') {
      var done = global.__crozzoWellbeingOnDone;
      global.__crozzoWellbeingOnDone = null;
      done();
    }
  }

  function needsLogoutWellbeing() {
    if (!shouldApplyHumanLayer()) return false;
    var r = getRoleNorm();
    if (r !== 'mesero' && r !== 'cocina' && r !== 'user') return false;
    var st = readStore();
    var today = new Date().toISOString().slice(0, 10);
    var logoutKey = 'wellbeing_logout_' + today + '_' + (r || 'all');
    var arqueoKey = 'wellbeing_modal_' + today + '_' + (r || 'all');
    if (st.affirmShown[logoutKey] || st.affirmShown[arqueoKey]) return false;
    return true;
  }

  function maybeWellbeingBeforeLogout(finish) {
    if (!needsLogoutWellbeing() || typeof global.showModal !== 'function') {
      finish();
      return;
    }
    var st = readStore();
    var today = new Date().toISOString().slice(0, 10);
    var logoutKey = 'wellbeing_logout_' + today + '_' + (getRoleNorm() || 'all');
    var shown = {};
    shown[logoutKey] = 1;
    writeStore({ affirmShown: shown });
    global.showModal('🌙 Antes de salir', renderWellbeingModal(finish));
  }

  function resetComfortSessionFlags() {
    global.__crozzoComfortSessionBooted = false;
    global.__crozzoWelcomeToastScheduled = false;
    stopComfortBreakLoop();
  }

  function patchLogoutWellbeing() {
    if (global.__crozzoPsycheLogoutPatched || typeof global.crozzoRequestLogout !== 'function') return;
    global.__crozzoPsycheLogoutPatched = true;
    var orig = global.crozzoRequestLogout;
    global.crozzoRequestLogout = function (opts) {
      opts = opts && typeof opts === 'object' ? opts : {};
      if (opts._psycheLogoutBypass) {
        var next = Object.assign({}, opts);
        delete next._psycheLogoutBypass;
        resetComfortSessionFlags();
        return orig.call(global, next);
      }
      maybeWellbeingBeforeLogout(function () {
        resetComfortSessionFlags();
        orig.call(global, Object.assign({}, opts, { _psycheLogoutBypass: true }));
      });
    };
  }

  function recordWellbeing(mood) {
    var entry = { mood: mood, at: new Date().toISOString(), role: getRoleNorm() };
    writeStore({ wellbeing: [entry] });
    if (typeof global.closeModal === 'function') global.closeModal();
    if (mood === 'good' || mood === 'ok') maybeAffirm('wellbeing_ok');
    else if (typeof global.showToast === 'function') {
      global.showToast('Turno exigente registrado. Gracias — converse con su encargado si lo necesita.', 'info');
    }
    invokeWellbeingDone();
  }

  function onShiftClose(rec) {
    if (!shouldApplyPsycheLayer()) return;
    maybeAffirm('arqueo_ok');
    var st = readStore();
    var today = new Date().toISOString().slice(0, 10);
    var wbKey = 'wellbeing_modal_' + today + '_' + (getRoleNorm() || 'all');
    if (!st.affirmShown[wbKey]) {
      var msg = CLOSE_MESSAGES[Math.floor(Math.random() * CLOSE_MESSAGES.length)];
      if (typeof global.showToast === 'function') {
        setTimeout(function () {
          global.showToast(msg, 'success');
        }, 1600);
      }
      var shown = {};
      shown[wbKey] = 1;
      writeStore({ affirmShown: shown });
      setTimeout(function () {
        if (typeof global.showModal === 'function') {
          global.showModal('🌙 Fin de turno', renderWellbeingModal());
        }
      }, 2400);
    }
  }

  function affirmDupCancel() {
    maybeAffirm('dup_blocked');
  }

  function proceedArqueo() {
    if (global.CrozzoOnboardingOperativo && global.CrozzoOnboardingOperativo.proceedNoviceArqueo) {
      global.CrozzoOnboardingOperativo.proceedNoviceArqueo();
      return;
    }
    var fn = global.__crozzoNoviceArqueoProceed;
    global.__crozzoNoviceArqueoProceed = null;
    if (typeof global.closeModal === 'function') global.closeModal({ keepNoviceArqueo: true });
    global.__crozzoSkipNoviceArqueoGuard = true;
    try {
      if (typeof fn === 'function') fn();
    } finally {
      global.__crozzoSkipNoviceArqueoGuard = false;
    }
    maybeAffirm('arqueo_ok');
  }

  function patchIntegrations() {
    if (!global.__crozzoPsycheIdentityPatched && typeof global.crozzoUpdatePremiumIdentity === 'function') {
      global.__crozzoPsycheIdentityPatched = true;
      var origId = global.crozzoUpdatePremiumIdentity;
      global.crozzoUpdatePremiumIdentity = function (page) {
        origId.apply(global, arguments);
        schedulePsycheChromeRefresh();
      };
    }
    if (!global.__crozzoPsycheAccessPatched && typeof global.applyAccessControl === 'function') {
      global.__crozzoPsycheAccessPatched = true;
      var origAc = global.applyAccessControl;
      global.applyAccessControl = function () {
        var r = origAc.apply(global, arguments);
        try {
          schedulePsycheChromeRefresh();
        } catch (_) {}
        return r;
      };
    }
    if (!global.__crozzoPsychePeakPatched && global.CrozzoOnboardingOperativo && global.CrozzoOnboardingOperativo.applyPeakNoviceMode) {
      global.__crozzoPsychePeakPatched = true;
      var origPeak = global.CrozzoOnboardingOperativo.applyPeakNoviceMode;
      global.CrozzoOnboardingOperativo.applyPeakNoviceMode = function () {
        origPeak.apply(global.CrozzoOnboardingOperativo, arguments);
        schedulePsycheChromeRefresh();
      };
    }
    if (!global.__crozzoPsycheLoginPatched && typeof global.crozzoSyncUserRoleStorage === 'function') {
      global.__crozzoPsycheLoginPatched = true;
      var origSync = global.crozzoSyncUserRoleStorage;
      global.crozzoSyncUserRoleStorage = function () {
        origSync.apply(global, arguments);
        syncPsycheAfterRoleStorage();
      };
    }
  }

  function renderAdminWellbeingPanel() {
    try {
      if (typeof global.crozzoShowOperativeMetricsUi === 'function' && !global.crozzoShowOperativeMetricsUi()) return '';
    } catch (_) {}
    var r = getRoleNorm();
    if (r !== 'admin' && r !== 'superadmin' && r !== 'super_admin' && r !== 'gerente') return '';
    var wb = getWellbeingSummary();
    var hf = { score: '—', label: '' };
    try {
      if (global.CrozzoOnboardingOperativo && global.CrozzoOnboardingOperativo.getHumanFactorIndex) {
        hf = global.CrozzoOnboardingOperativo.getHumanFactorIndex();
      }
    } catch (_) {}
    var ph = { label: '—' };
    try {
      if (global.CrozzoOnboardingOperativo && global.CrozzoOnboardingOperativo.getOperationalPhase) {
        ph = global.CrozzoOnboardingOperativo.getOperationalPhase();
      }
    } catch (_) {}
    var st = readStore();
    var ihsCls =
      hf.score >= 72 ? 'crozzo-ihs--good' : hf.score >= 48 ? 'crozzo-ihs--mid' : 'crozzo-ihs--low';
    var feBtn = '';
    try {
      if (global.config && global.config.getOperacionModo && global.config.getOperacionModo() === 'electronic') {
        feBtn =
          '<button type="button" class="btn btn-outline btn-sm" onclick="CrozzoGuiaFeElectronica.openGuideModal()">📘 Guía FE</button>';
      }
    } catch (_) {}
    return (
      '<section class="crozzo-admin-wellbeing" aria-label="Salud operativa del equipo">' +
      '<div class="crozzo-admin-wellbeing__head"><h3>👥 Equipo y adopción</h3>' +
      '<span class="form-hint">' + ph.label + '</span></div>' +
      '<div class="crozzo-admin-wellbeing__grid">' +
      '<div class="crozzo-admin-wellbeing__stat"><span>IH-S</span><strong class="' +
      ihsCls +
      '">' +
      hf.score +
      '%</strong><small>' +
      (hf.label || '') +
      '</small></div>' +
      '<div class="crozzo-admin-wellbeing__stat"><span>Aciertos apoyo</span><strong>' + (st.wins || 0) + '</strong></div>' +
      (wb.total > 0
        ? '<div class="crozzo-admin-wellbeing__stat"><span>Bienestar 30d</span><strong>' + wb.pctGood + '%</strong><small>' +
          wb.hard + ' turno(s) exigente(s)</small></div>'
        : '<div class="crozzo-admin-wellbeing__stat"><span>Bienestar</span><strong>—</strong><small>Sin respuestas aún</small></div>') +
      '</div>' +
      '<p class="form-hint" style="margin:8px 0 0;">Revise turnos exigentes en charla con el equipo — datos anónimos por dispositivo.</p>' +
      '<div class="btn-group" style="margin-top:10px;flex-wrap:wrap;gap:8px;">' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="CrozzoOnboardingOperativo.exportMetricsCsv()">📥 Exportar métricas CSV</button>' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="CrozzoOnboardingOperativo.openModal()">📋 Checklist</button>' +
      feBtn +
      '</div></section>'
    );
  }

  function shouldHideChipOnPage() {
    try {
      var p = global.currentPage;
      if (p === 'inicio-operacion') return true;
      if (p === 'cajero' || p === 'venta-comercial' || p === 'tablets' || p === 'cocina' || p === 'comandas') {
        return true;
      }
    } catch (_) {}
    return false;
  }

  function injectPsycheChipHost(force) {
    if (!shouldApplyHumanLayer()) return;
    if (shouldHideChipOnPage()) {
      _psycheChipHtmlCache = '';
      _peakStripActive = false;
      var peakHost = document.getElementById('crozzo-peak-breathe-host');
      if (peakHost) peakHost.innerHTML = '';
      var h0 = document.getElementById('crozzo-psyche-chip-host');
      if (h0) {
        h0.innerHTML = '';
        h0.hidden = true;
      }
      return;
    }
    injectPeakBreatheStrip();
    var hostVis = document.getElementById('crozzo-psyche-chip-host');
    if (hostVis) hostVis.hidden = false;
    var html = shouldApplyPsycheLayer() ? renderPsycheChip() : renderMinimalHumanChip();
    if (!html) {
      _psycheChipHtmlCache = '';
      var h = document.getElementById('crozzo-psyche-chip-host');
      if (h && h.innerHTML) h.innerHTML = '';
      return;
    }
    var host = document.getElementById('crozzo-psyche-chip-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'crozzo-psyche-chip-host';
      host.className = 'crozzo-psyche-chip-host';
      var main = document.getElementById('mainContent');
      if (main && main.parentNode) main.parentNode.insertBefore(host, main);
    }
    if (!force && html === _psycheChipHtmlCache && host.innerHTML === html) return;
    _psycheChipHtmlCache = html;
    host.innerHTML = html;
  }

  function getWellbeingSummary() {
    var st = readStore();
    var wb = st.wellbeing || [];
    var last30 = wb.filter(function (e) {
      return Date.now() - new Date(e.at).getTime() < 30 * 86400000;
    });
    var good = last30.filter(function (e) { return e.mood === 'good'; }).length;
    var hard = last30.filter(function (e) { return e.mood === 'hard'; }).length;
    return { total: last30.length, good: good, hard: hard, pctGood: last30.length ? Math.round((good / last30.length) * 100) : null };
  }

  function getWellbeingEntries() {
    return (readStore().wellbeing || []).slice();
  }

  function init() {
    if (global.__crozzoPsycheInitDone) {
      schedulePsycheChromeRefresh();
      return;
    }
    global.__crozzoPsycheInitDone = true;
    patchHumanToasts();
    applyComfortClasses();
    patchIntegrations();
    patchLogoutWellbeing();
    patchVisibilityWelcomeBack();
    bindLoginWelcomeOnce();
    refreshPsycheChrome(true);
    if (typeof global.getCurrentUser === 'function' && global.getCurrentUser()) {
      onLoginWelcome();
    }
    if (!global.__crozzoPsychePoll) {
      global.__crozzoPsychePoll = setInterval(function () {
        injectPsycheChipHost(false);
      }, 45000);
    }
  }

  global.CrozzoOperativePsyche = {
    init: init,
    shouldApplyComfortUx: shouldApplyComfortUx,
    comfortMotionSoft: comfortMotionSoft,
    snoozeBreakReminder: snoozeBreakReminder,
    dismissBreakNudge: dismissBreakNudge,
    snoozeBreakAndClose: snoozeBreakAndClose,
    ackBreakPause: ackBreakPause,
    getBreakIntervalMs: getBreakIntervalMs,
    getPsychState: getPsychState,
    getWellbeingSummary: getWellbeingSummary,
    renderPsycheChip: renderPsycheChip,
    dismissChip: dismissChip,
    maybeAffirm: maybeAffirm,
    onLoginWelcome: onLoginWelcome,
    onShiftClose: onShiftClose,
    recordWellbeing: recordWellbeing,
    getSupportiveDupModalHtml: getSupportiveDupModalHtml,
    getSupportiveObsModalHtml: getSupportiveObsModalHtml,
    getSupportiveArqueoModalHtml: getSupportiveArqueoModalHtml,
    proceedArqueo: proceedArqueo,
    affirmDupCancel: affirmDupCancel,
    renderAdminWellbeingPanel: renderAdminWellbeingPanel,
    renderConciergeStrip: renderConciergeStrip,
    shouldApplyPsycheLayer: shouldApplyPsycheLayer,
    shouldApplyHumanLayer: shouldApplyHumanLayer,
    humanizeToastMessage: humanizeToastMessage,
    getWellbeingEntries: getWellbeingEntries,
    finishWellbeingSkip: finishWellbeingSkip,
    refreshChrome: refreshPsycheChrome,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 80); });
  } else {
    setTimeout(init, 80);
  }
})(typeof window !== 'undefined' ? window : globalThis);
