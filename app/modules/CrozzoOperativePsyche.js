/**
 * Crozzo POS — Capa psicológica operativa: confort, refuerzo positivo y estados de apoyo.
 */
(function (global) {
  'use strict';

  var LS = 'crozzo_operative_psyche_v1';
  var SS_CHIP = 'crozzo_psyche_chip_dismiss';
  var SS_CONCIERGE = 'crozzo_concierge_strip_dismiss';
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

  /** Humanización suave (header, toasts, confort) — todos con sesión activa. */
  function shouldApplyHumanLayer() {
    if (shouldApplyComfortUx()) return true;
    return shouldApplyPsycheLayer();
  }

  /** Cabina premium: sensación de estabilidad y baja fatiga (todos los roles). */
  function shouldApplyLuxuryCockpit() {
    return shouldApplyComfortUx();
  }

  var SESSION_WARMTH_MS = 2 * 3600000;
  var SESSION_DEEP_WARMTH_MS = 5 * 3600000;

  var TEMPO_CALM = 'calm';
  var TEMPO_FLOW = 'flow';
  var TEMPO_RUSH = 'rush';
  var TEMPO_RANK = { calm: 0, flow: 1, rush: 2 };
  var TEMPO_DEESCALATE_MS = { 'rush->flow': 70000, 'rush->calm': 120000, 'flow->calm': 90000 };
  var _lastOperationalTempo = '';
  var _tempoResolved = TEMPO_CALM;
  var _tempoRawLowerSince = 0;
  var _tempoRawLowerTarget = '';
  var _tempoMorphTimer = null;
  var _tempoThresholdsCache = null;
  var _tempoThresholdsCacheKey = '';

  var STABILITY_LINES = {
    ok: [
      'Espacio tranquilo · avance sin presión',
      'Todo bajo control · el sistema le acompaña',
      'Puede tomarse su tiempo · datos respaldados',
      'Turno sereno · precisión sin prisa',
    ],
    flow: ['Ritmo activo · respuesta inmediata', 'Servicio en movimiento · control total', 'Operación fluida · sync en segundo plano'],
    rush: ['Alta demanda · respuesta priorizada', 'Modo intenso · cada acción registrada al instante', 'Pico operativo · datos seguros en local'],
    offline: ['Modo local seguro · cola respaldada', 'Sin red · operación continua en local', 'Sync al reconectar · sin pérdida de datos'],
    queue: ['Sync en cola · todo guardado localmente', 'Pendientes en cola · se enviarán solos'],
  };

  var CALM_CARE_LINES = [
    'Estamos aquí — avance con calma',
    'Su turno, su ritmo — sin presión',
    'Todo listo para cuidarle el trabajo',
    'Respire: el sistema vigila por usted',
  ];

  var CALM_CARE_BY_ROLE = {
    caja: 'Caja tranquila — cada paso con respaldo',
    mesero: 'Sala serena — el cliente espera, usted no',
    cocina: 'Cocina al ritmo justo — sin prisa falsa',
    chef: 'Producción en calma — orden antes que velocidad',
    admin: 'Visión clara — delegue con confianza',
    gerente: 'Equipo en calma — usted marca el pulso',
    inventario: 'Compras sin afán — todo queda trazado',
    user: 'Su espacio protegido — avance con calma',
  };

  var TEMPO_HEADER_CUE = {
    calm: { txt: 'Acompañado', title: 'Espacio tranquilo — avance sin presión, el sistema le cuida' },
  };

  var TEMPO_SCALE_HINT = {
    pequeno: 'local íntimo',
    mediano: 'operación ágil',
    grande: 'salón amplio',
    xl: 'alta capacidad',
  };

  var CALM_CARE_BY_PHASE = {
    manana: 'Buen arranque — sin prisa, con respaldo',
    mediodia: 'Mediodía sereno — un paso a la vez',
    tarde: 'Tarde fluida — el sistema le acompaña',
    noche: 'Turno nocturno — vaya con calma',
    madrugada: 'Madrugada tranquila — aquí estamos',
  };

  var CALM_AFTER_RUSH = {
    manana: 'bajó el ritmo — buen arranque de nuevo.',
    mediodia: 'bajó el ritmo — respire un momento.',
    tarde: 'bajó el ritmo — retome con calma.',
    noche: 'bajó el ritmo — respire, lo hizo bien.',
    madrugada: 'bajó el ritmo — aquí seguimos.',
  };

  var RUSH_TOAST_SUCCESS = [
    { re: /comanda enviada|comanda #\d+ creada|cocina recibió|comanda.*actualizada/i, msg: '✓ Cocina' },
    { re: /venta registrada|cobro exitoso|pago registrado|cobrado/i, msg: '✓ Cobrado' },
    { re: /guardado|actualizado|sincroniz/i, msg: '✓ Listo' },
  ];

  var FLOW_TOAST_SUCCESS = [
    { re: /comanda enviada|comanda #\d+ creada|cocina recibió/i, msg: 'Comanda en cocina' },
    { re: /venta registrada|cobro exitoso|pago registrado/i, msg: 'Cobro registrado' },
    { re: /comanda.*actualizada/i, msg: 'Comanda actualizada' },
  ];

  function isTempoHighLoad() {
    if (!shouldApplyLuxuryCockpit()) return false;
    var t = getOperationalTempo();
    return t === TEMPO_FLOW || t === TEMPO_RUSH;
  }

  function isTempoCalmCare() {
    return shouldApplyLuxuryCockpit() && getOperationalTempo() === TEMPO_CALM;
  }

  function pickCalmCareLine() {
    var r = getRoleNorm();
    var phase = getOperativeDayPhase();
    if (CALM_CARE_BY_ROLE[r] && Math.floor(Date.now() / 240000) % 3 !== 0) {
      return CALM_CARE_BY_ROLE[r];
    }
    if (CALM_CARE_BY_PHASE[phase]) return CALM_CARE_BY_PHASE[phase];
    return CALM_CARE_LINES[Math.floor(Date.now() / 180000) % CALM_CARE_LINES.length];
  }

  function getOperativeDayPhase() {
    var h = new Date().getHours();
    if (h >= 5 && h < 11) return 'manana';
    if (h >= 11 && h < 15) return 'mediodia';
    if (h >= 15 && h < 20) return 'tarde';
    if (h >= 20 || h < 2) return 'noche';
    return 'madrugada';
  }

  function buildTempoCueTitle(cue) {
    var parts = [cue.title];
    var th = getTempoThresholds();
    if (th.scale && TEMPO_SCALE_HINT[th.scale]) parts.push(TEMPO_SCALE_HINT[th.scale]);
    var phase = getOperativeDayPhase();
    if (phase === 'noche' || phase === 'madrugada') parts.push('turno nocturno');
    return parts.join(' · ');
  }

  function pickStabilityLine(pool) {
    var lines = pool || STABILITY_LINES.ok;
    return lines[Math.floor(Date.now() / 120000) % lines.length];
  }

  function detectOperacionTipo() {
    try {
      if (typeof global.crozzoGetPerfilEmpresa === 'function') {
        var p = String(global.crozzoGetPerfilEmpresa() || '').toLowerCase();
        if (p.indexOf('tienda') >= 0 || p === 'basico_tienda' || p === 'retail') return 'retail';
      }
      if (typeof global.crozzoGetPerfilOperativo === 'function') {
        var m = global.crozzoGetPerfilOperativo();
        if (m && m.tipo === 'retail') return 'retail';
      }
    } catch (_) {}
    return 'restaurante';
  }

  function detectSalonCapacity() {
    try {
      if (Array.isArray(global.mesasCaja) && global.mesasCaja.length > 0) {
        return global.mesasCaja.length;
      }
      if (typeof global.getSalonConfig === 'function') {
        var sc = global.getSalonConfig();
        if (sc && Number(sc.mesaCount) > 0) return Number(sc.mesaCount);
      }
      if (typeof global.config !== 'undefined' && global.config && typeof global.config.get === 'function') {
        var salon = global.config.get('salon') || global.config.get('salonConfig') || {};
        var n = Number(salon.mesaCount || salon.mesas);
        if (n > 0) return n;
      }
    } catch (_) {}
    return 12;
  }

  function computeAutoStressThresholds(capacity, tipo) {
    var cap = Math.max(4, Math.min(80, Number(capacity) || 12));
    if (tipo === 'retail') {
      return {
        stressComandasBusy: 9999,
        stressComandasRush: 9999,
        stressVentasHoraBusy: Math.max(6, Math.round(cap * 0.45)),
        stressVentasHoraRush: Math.max(12, Math.round(cap * 0.85)),
        scale: cap <= 8 ? 'pequeno' : cap <= 18 ? 'mediano' : cap <= 32 ? 'grande' : 'xl',
        capacity: cap,
        tipo: 'retail',
      };
    }
    var busyCom = Math.max(3, Math.round(cap * 0.32));
    var rushCom = Math.max(busyCom + 2, Math.round(cap * 0.62));
    var busySales = Math.max(6, Math.round(cap * 0.85));
    var rushSales = Math.max(busySales + 4, Math.round(cap * 1.55));
    return {
      stressComandasBusy: busyCom,
      stressComandasRush: rushCom,
      stressVentasHoraBusy: busySales,
      stressVentasHoraRush: rushSales,
      scale: cap <= 8 ? 'pequeno' : cap <= 18 ? 'mediano' : cap <= 32 ? 'grande' : 'xl',
      capacity: cap,
      tipo: 'restaurante',
    };
  }

  function invalidateTempoThresholdsCache() {
    _tempoThresholdsCache = null;
    _tempoThresholdsCacheKey = '';
  }

  function getTempoThresholds() {
    var cap = detectSalonCapacity();
    var tipo = detectOperacionTipo();
    var cacheKey = cap + '|' + tipo;
    if (_tempoThresholdsCache && _tempoThresholdsCacheKey === cacheKey) return _tempoThresholdsCache;
    var auto = computeAutoStressThresholds(cap, tipo);
    var out = {
      busyCom: auto.stressComandasBusy,
      rushCom: auto.stressComandasRush,
      busySales: auto.stressVentasHoraBusy,
      rushSales: auto.stressVentasHoraRush,
      scale: auto.scale,
      capacity: auto.capacity,
      tipo: auto.tipo,
      auto: true,
    };
    try {
      if (typeof global.crozzoShiftGetRestaurantStress === 'function') {
        var rs = global.crozzoShiftGetRestaurantStress();
        if (rs && rs.thresholds) {
          out = Object.assign({}, out, {
            busyCom: rs.thresholds.busyCom,
            rushCom: rs.thresholds.rushCom,
            busySales: rs.thresholds.busySales,
            rushSales: rs.thresholds.rushSales,
            scale: rs.tempoScale || out.scale,
            capacity: rs.tempoCapacity || out.capacity,
            auto: rs.tempoAuto !== false,
          });
        }
      }
    } catch (_) {}
    _tempoThresholdsCache = out;
    _tempoThresholdsCacheKey = cacheKey;
    return out;
  }

  function mergeOperativeStressThresholds(base) {
    if (!base || base.stressManual === true || base.stressAutoScale === false) return base;
    invalidateTempoThresholdsCache();
    var cap = detectSalonCapacity();
    var auto = computeAutoStressThresholds(cap, detectOperacionTipo());
    return Object.assign({}, base, {
      stressComandasBusy: auto.stressComandasBusy,
      stressComandasRush: auto.stressComandasRush,
      stressVentasHoraBusy: auto.stressVentasHoraBusy,
      stressVentasHoraRush: auto.stressVentasHoraRush,
      _tempoScale: auto.scale,
      _tempoCapacity: auto.capacity,
      _tempoAuto: true,
    });
  }

  function getDeescalateHoldMs(from, to) {
    var key = from + '->' + to;
    var base = TEMPO_DEESCALATE_MS[key] || 90000;
    var cap = detectSalonCapacity();
    if (cap <= 8) return Math.round(base * 0.82);
    if (cap >= 32) return Math.round(base * 1.12);
    return base;
  }

  function getRawStressSnapshot() {
    try {
      if (global.CrozzoOnboardingOperativo && global.CrozzoOnboardingOperativo.getCombinedStress) {
        return global.CrozzoOnboardingOperativo.getCombinedStress();
      }
      if (typeof global.crozzoShiftGetRestaurantStress === 'function') {
        return global.crozzoShiftGetRestaurantStress();
      }
    } catch (_) {}
    return { level: 'calm', combined: 'calm', activeComandas: 0, salesHour: 0 };
  }

  function getRawOperationalTempo() {
    var snap = getRawStressSnapshot();
    if (snap.combined === 'critical' || snap.level === 'rush') return TEMPO_RUSH;
    if (snap.level === 'busy') return TEMPO_FLOW;
    return TEMPO_CALM;
  }

  function getTempoIntensity() {
    var snap = getRawStressSnapshot();
    var th = snap.thresholds || getTempoThresholds();
    var com = Number(snap.activeComandas) || 0;
    var sales = Number(snap.salesHour) || 0;
    var rushCom = Math.max(1, Number(th.rushCom) || 16);
    var rushSales = Math.max(1, Number(th.rushSales) || 30);
    var busyCom = Math.max(1, Number(th.busyCom) || 8);
    var busySales = Math.max(1, Number(th.busySales) || 15);
    var comPct = (com / rushCom) * 100;
    var salesPct = (sales / rushSales) * 100;
    var pct = Math.max(comPct, salesPct);
    if (snap.combined === 'critical' || snap.level === 'rush') {
      return Math.min(100, Math.max(82, Math.round(pct)));
    }
    if (snap.level === 'busy') {
      var busyPct = Math.max(com / busyCom, sales / busySales) * 78;
      return Math.min(81, Math.max(42, Math.round(busyPct)));
    }
    return Math.min(38, Math.round(pct * 0.38));
  }

  function resolveOperationalTempo() {
    var raw = getRawOperationalTempo();
    var now = Date.now();
    var rawRank = TEMPO_RANK[raw] || 0;
    var curRank = TEMPO_RANK[_tempoResolved] || 0;
    if (rawRank > curRank) {
      _tempoResolved = raw;
      _tempoRawLowerSince = 0;
      _tempoRawLowerTarget = '';
      return _tempoResolved;
    }
    if (rawRank === curRank) {
      _tempoRawLowerSince = 0;
      _tempoRawLowerTarget = '';
      return _tempoResolved;
    }
    if (_tempoRawLowerTarget !== raw) {
      _tempoRawLowerTarget = raw;
      _tempoRawLowerSince = now;
    }
    var hold = getDeescalateHoldMs(_tempoResolved, raw);
    if (now - _tempoRawLowerSince >= hold) {
      _tempoResolved = raw;
      _tempoRawLowerSince = 0;
      _tempoRawLowerTarget = '';
    }
    return _tempoResolved;
  }

  function getOperationalTempo() {
    if (!shouldApplyLuxuryCockpit()) return getRawOperationalTempo();
    return resolveOperationalTempo();
  }

  function pulseTempoMorph() {
    if (!document.body) return;
    document.body.classList.add('crozzo-tempo-morph');
    if (_tempoMorphTimer) clearTimeout(_tempoMorphTimer);
    _tempoMorphTimer = setTimeout(function () {
      _tempoMorphTimer = null;
      if (document.body) document.body.classList.remove('crozzo-tempo-morph');
    }, 720);
  }

  function scheduleTempoPulse() {
    if (global.__crozzoTempoPulseTimer) return;
    global.__crozzoTempoPulseTimer = setTimeout(function () {
      global.__crozzoTempoPulseTimer = null;
      syncOperationalTempo();
    }, 600);
  }

  function syncOperationalTempo() {
    if (!document.body || !shouldApplyLuxuryCockpit()) return;
    var tempo = getOperationalTempo();
    var intensity = getTempoIntensity();
    var th = getTempoThresholds();
    document.body.setAttribute('data-crozzo-tempo', tempo);
    document.body.setAttribute('data-crozzo-tempo-intensity', String(intensity));
    if (th.scale) document.body.setAttribute('data-crozzo-tempo-scale', th.scale);
    if (th.capacity) document.body.setAttribute('data-crozzo-tempo-capacity', String(th.capacity));
    document.body.setAttribute('data-crozzo-tempo-phase', getOperativeDayPhase());
    document.body.style.setProperty('--crozzo-tempo-intensity', String(intensity / 100));
    document.body.classList.toggle('crozzo-tempo-calm', tempo === TEMPO_CALM);
    document.body.classList.toggle('crozzo-tempo-flow', tempo === TEMPO_FLOW);
    document.body.classList.toggle('crozzo-tempo-rush', tempo === TEMPO_RUSH);
    document.body.classList.toggle('crozzo-tempo-care', tempo === TEMPO_CALM);
    document.body.classList.toggle('crozzo-tempo-shield', tempo === TEMPO_FLOW || tempo === TEMPO_RUSH);
    if (document.documentElement) {
      var forceOff = false;
      try {
        forceOff = localStorage.getItem('crozzo_perf_lite') === '0';
      } catch (_) {}
      if ((tempo === TEMPO_RUSH || tempo === TEMPO_FLOW) && !forceOff) {
        document.documentElement.classList.add('crozzo-perf-lite');
        document.documentElement.setAttribute('data-crozzo-tempo-perf', '1');
      } else if (document.documentElement.getAttribute('data-crozzo-tempo-perf') === '1') {
        document.documentElement.classList.remove('crozzo-perf-lite');
        document.documentElement.removeAttribute('data-crozzo-tempo-perf');
      }
    }
    updateTempoHeaderCue(tempo);
    updateTempoRailCue(intensity, tempo);
    if (tempo !== _lastOperationalTempo) {
      var prev = _lastOperationalTempo;
      _lastOperationalTempo = tempo;
      pulseTempoMorph();
      if (tempo === TEMPO_FLOW || tempo === TEMPO_RUSH) {
        try {
          sessionStorage.removeItem('crozzo_calm_after_rush');
        } catch (_) {}
      }
      updateHeaderPsycheLine();
      updateStabilityHint();
      injectPeakBreatheStrip();
      injectPsycheChipHost(false);
      maybeCareAfterRush(prev, tempo);
      try {
        document.dispatchEvent(
          new CustomEvent('crozzo-tempo-changed', {
            detail: { from: prev || null, to: tempo, intensity: intensity },
            bubbles: true,
          })
        );
      } catch (_) {}
    }
  }

  function maybeCareAfterRush(prev, tempo) {
    if (tempo !== TEMPO_CALM || (prev !== TEMPO_RUSH && prev !== TEMPO_FLOW)) return;
    if (!shouldApplyLuxuryCockpit()) return;
    try {
      if (sessionStorage.getItem('crozzo_calm_after_rush') === '1') return;
      sessionStorage.setItem('crozzo_calm_after_rush', '1');
    } catch (_) {}
    if (typeof global.showToast !== 'function') return;
    var first = getFirstName();
    var phase = getOperativeDayPhase();
    var closer = CALM_AFTER_RUSH[phase] || 'bajó el ritmo — respire. Estamos aquí.';
    var msg = first ? first + ', ' + closer : 'Bajó el ritmo — respire. Estamos aquí.';
    global.__crozzoAffirmToastLock = true;
    try {
      global.showToast(msg, 'success');
    } finally {
      global.__crozzoAffirmToastLock = false;
    }
  }

  function updateTempoHeaderCue(tempo) {
    if (!shouldApplyLuxuryCockpit()) return;
    var cluster = document.querySelector('.crozzo-header__status--elite');
    if (!cluster) return;
    var cue = TEMPO_HEADER_CUE[tempo];
    var el = document.getElementById('crozzoTempoBadge');
    if (!cue) {
      if (el) el.hidden = true;
      return;
    }
    if (!el) {
      el = document.createElement('span');
      el.id = 'crozzoTempoBadge';
      el.className = 'crozzo-status-pill crozzo-tempo-pill crozzo-mobile-secondary';
      el.innerHTML =
        '<span class="crozzo-status-dot" aria-hidden="true"></span><span class="crozzo-status-txt"></span>';
      cluster.insertBefore(el, cluster.firstChild);
    }
    el.hidden = false;
    el.classList.remove('crozzo-tempo-pill--flow', 'crozzo-tempo-pill--rush');
    el.classList.add('crozzo-tempo-pill--calm');
    el.title = buildTempoCueTitle(cue);
    el.setAttribute('aria-label', el.title);
    var dot = el.querySelector('.crozzo-status-dot');
    var txt = el.querySelector('.crozzo-status-txt');
    if (dot) {
      dot.className = 'crozzo-status-dot ok';
    }
    if (txt) txt.textContent = cue.txt;
  }

  function updateTempoRailCue(intensity, tempo) {
    if (!shouldApplyLuxuryCockpit()) return;
    var rail = document.querySelector('.crozzo-header__rail');
    if (!rail) return;
    if (tempo === TEMPO_CALM) {
      rail.style.removeProperty('--crozzo-rail-fill');
      rail.removeAttribute('data-crozzo-rail-tempo');
      return;
    }
    rail.setAttribute('data-crozzo-rail-tempo', tempo);
    rail.style.setProperty('--crozzo-rail-fill', String(Math.max(0.08, Math.min(1, intensity / 100))));
    rail.title =
      tempo === TEMPO_RUSH
        ? 'Demanda alta · ' + intensity + '% de capacidad operativa'
        : 'Ritmo activo · ' + intensity + '% de capacidad operativa';
  }

  function getStabilityNarrative() {
    var offline = false;
    var queue = 0;
    try {
      if (typeof global.crozzoWanOnline === 'function') offline = !global.crozzoWanOnline();
      else if (typeof global.navigator !== 'undefined') offline = global.navigator.onLine === false;
    } catch (_) {}
    try {
      if (typeof global.readOfflineQueue === 'function') {
        queue = (global.readOfflineQueue() || []).length;
      }
    } catch (_) {}
    if (offline) return pickStabilityLine(STABILITY_LINES.offline);
    if (queue > 0) return pickStabilityLine(STABILITY_LINES.queue);
    var tempo = shouldApplyLuxuryCockpit() ? getOperationalTempo() : TEMPO_CALM;
    if (tempo === TEMPO_RUSH) return pickStabilityLine(STABILITY_LINES.rush);
    if (tempo === TEMPO_FLOW) return pickStabilityLine(STABILITY_LINES.flow);
    return pickStabilityLine(STABILITY_LINES.ok);
  }

  function isOperativaPage(page) {
    var p = page;
    try {
      if (!p && global.currentPage) p = global.currentPage;
    } catch (_) {}
    p = String(p || '');
    return (
      p === 'cajero' ||
      p === 'venta-comercial' ||
      p === 'tablets' ||
      p === 'cocina' ||
      p === 'comandas' ||
      p === 'cierre-caja'
    );
  }

  function applySessionWarmthClasses() {
    if (!document.body || !shouldApplyLuxuryCockpit()) return;
    var elapsed = Date.now() - getSessionStartMs();
    document.body.classList.toggle('crozzo-session-warmth', elapsed >= SESSION_WARMTH_MS);
    document.body.classList.toggle('crozzo-session-deep-warmth', elapsed >= SESSION_DEEP_WARMTH_MS);
  }

  function syncOperativaAmbience(page) {
    if (!document.body) return;
    var op = isOperativaPage(page);
    document.body.classList.toggle('crozzo-cockpit-operativa', shouldApplyLuxuryCockpit() && op);
  }

  function updateStabilityHint() {
    if (!shouldApplyLuxuryCockpit()) return;
    var cluster = document.querySelector('.crozzo-header__status--elite');
    if (cluster) {
      cluster.setAttribute('data-crozzo-stability', getStabilityNarrative());
      cluster.title = getStabilityNarrative();
    }
    var rail = document.querySelector('.crozzo-header__rail');
    if (rail && shouldApplyLuxuryCockpit()) {
      rail.setAttribute('title', getStabilityNarrative());
    }
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
      '<button type="button" class="crozzo-break-nudge__close" aria-label="Cerrar recordatorio" data-crozzo-act="crozzoDismissBreakNudge" data-crozzo-args="45">×</button>' +
      '<p class="crozzo-break-nudge__text">' +
      escBreakHtml(line) +
      '</p>' +
      '<div class="crozzo-break-nudge__actions">' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="CrozzoOperativePsyche.ackBreakPause()">☕ Pausa</button>' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="CrozzoOperativePsyche.snoozeBreakAndClose(90)">Más tarde</button>' +
      '</div>';
    document.body.appendChild(wrap);
    global.__crozzoBreakNudgeEl = wrap;
    try {
      if (typeof global.crozzoCspWireTree === 'function') global.crozzoCspWireTree(wrap);
    } catch (_) {}
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
    if (shouldApplyLuxuryCockpit() && getOperationalTempo() !== TEMPO_CALM) return;
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
    var tempo = shouldApplyLuxuryCockpit() ? getOperationalTempo() : TEMPO_CALM;
    if (type === 'success') {
      if (tempo === TEMPO_RUSH) {
        for (var r = 0; r < RUSH_TOAST_SUCCESS.length; r++) {
          if (RUSH_TOAST_SUCCESS[r].re.test(msg)) return RUSH_TOAST_SUCCESS[r].msg;
        }
        if (msg.length > 36) return msg.split(/[.—!]/)[0].slice(0, 28).trim() || msg;
      }
      if (tempo === TEMPO_FLOW) {
        for (var f = 0; f < FLOW_TOAST_SUCCESS.length; f++) {
          if (FLOW_TOAST_SUCCESS[f].re.test(msg)) return FLOW_TOAST_SUCCESS[f].msg;
        }
      }
      for (var j = 0; j < HUMAN_TOAST_SUCCESS.length; j++) {
        if (HUMAN_TOAST_SUCCESS[j].re.test(msg)) return HUMAN_TOAST_SUCCESS[j].msg;
      }
    }
    if (type === 'error' || type === 'warning') {
      for (var i = 0; i < HUMAN_TOAST_SOFT.length; i++) {
        if (HUMAN_TOAST_SOFT[i].re.test(msg)) return HUMAN_TOAST_SOFT[i].msg;
      }
      if (
        type === 'error' &&
        !/—|gracias|calma|juntos/i.test(msg) &&
        !(shouldApplyLuxuryCockpit() && getOperationalTempo() === TEMPO_RUSH)
      ) {
        return msg.replace(/\.$/, '') + ' — estamos aquí para ayudarle.';
      }
    }
    return msg;
  }

  function celebrateWinMilestones(wins) {
    if (isTempoHighLoad()) return;
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
    var human = shouldApplyHumanLayer();
    var psyche = shouldApplyPsycheLayer();
    var cockpit = shouldApplyLuxuryCockpit();
    document.body.classList.toggle('crozzo-comfort-ux', comfort);
    document.body.classList.toggle('crozzo-session-comfort', human);
    document.body.classList.toggle('crozzo-premium-human', human);
    document.body.classList.toggle('crozzo-premium-psyche', psyche);
    document.body.classList.toggle('crozzo-psyche-active', psyche);
    document.body.classList.toggle('crozzo-luxury-cockpit', cockpit);
    applySessionWarmthClasses();
    syncOperativaAmbience();
    syncOperationalTempo();
    updateStabilityHint();
  }

  function schedulePsycheChromeRefresh() {
    if (_psycheChromeTimer) return;
    _psycheChromeTimer = setTimeout(function () {
      _psycheChromeTimer = null;
      refreshPsycheChrome(false);
    }, 120);
  }

  function refreshPsycheChrome(force) {
    applySessionWarmthClasses();
    syncOperativaAmbience();
    syncOperationalTempo();
    updateStabilityHint();
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

  function shouldSuppressToast(message, type) {
    if (!shouldApplyLuxuryCockpit() || !isTempoHighLoad()) return false;
    if (global.__crozzoAffirmToastLock) return false;
    var t = type || 'info';
    var msg = String(message || '');
    var dedupeKey = t + '|' + msg.slice(0, 48);
    var now = Date.now();
    if (global.__crozzoLastToastKey === dedupeKey && now - (global.__crozzoLastToastAt || 0) < 2800) {
      return true;
    }
    global.__crozzoLastToastKey = dedupeKey;
    global.__crozzoLastToastAt = now;
    if (t === 'error' || t === 'warning') return false;
    if (t === 'info') return true;
    if (t === 'success') {
      if (/bienvenid|turno|espacio de trabajo|respire|estamos aquí/i.test(msg)) return true;
    }
    return false;
  }

  function isToastMinimal(message, type) {
    if (!isTempoHighLoad()) return false;
    var t = type || 'info';
    return t === 'success';
  }

  function trimToastStack(container, max) {
    if (!container || !max) return;
    while (container.children.length >= max) {
      var first = container.firstElementChild;
      if (!first) break;
      if (typeof first._crozzoDismiss === 'function') first._crozzoDismiss();
      else first.remove();
    }
  }

  function patchHumanToasts() {
    if (global.__crozzoHumanToastPatched || typeof global.showToast !== 'function') return;
    global.__crozzoHumanToastPatched = true;
    var orig = global.showToast;
    global.showToast = function (message, type) {
      var t = type || 'info';
      if (shouldSuppressToast(message, t)) return;
      if (!global.__crozzoAffirmToastLock) maybeAffirmComandaFromToast(message);
      var msg = humanizeToastMessage(message, t);
      if (document.body && document.body.classList.contains('crozzo-premium-human') && (t === 'warning' || t === 'error')) {
        orig.call(global, msg, t === 'error' ? 'warning' : t);
      } else {
        orig.call(global, msg, t);
      }
      if (t === 'success' && shouldApplyLuxuryCockpit()) scheduleTempoPulse();
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
    if (isTempoHighLoad()) return;
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
    var el = document.getElementById('crozzoHeaderPsycheLine');
    if (shouldApplyLuxuryCockpit() && isTempoHighLoad()) {
      if (el) {
        el.textContent = '';
        el.hidden = true;
      }
      _psycheHeaderCache = '';
      return;
    }
    var line = getRoleLine();
    if (shouldApplyLuxuryCockpit()) {
      var tempo = getOperationalTempo();
      if (tempo === TEMPO_CALM) {
        var care = pickCalmCareLine();
        line = shouldApplyPsycheLayer() ? care : getRoleLine() + ' · ' + care;
      } else if (!shouldApplyPsycheLayer()) {
        line = line + ' · ' + getStabilityNarrative();
      }
    }
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
    el.classList.toggle('crozzo-header-psyche-line--care', shouldApplyLuxuryCockpit() && getOperationalTempo() === TEMPO_CALM);
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
    if (shouldApplyLuxuryCockpit()) return '';
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
      '<button type="button" class="crozzo-psyche-chip__close" data-crozzo-act="crozzoDismissPsycheChip" aria-label="Ocultar">×</button></div>'
    );
  }

  function bindPsycheDismissCapture() {
    if (global.__crozzoPsycheDismissCapture) return;
    global.__crozzoPsycheDismissCapture = true;
    document.addEventListener(
      'click',
      function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        if (t.closest('.crozzo-concierge-strip__close')) {
          e.preventDefault();
          e.stopPropagation();
          dismissConciergeStrip();
          return;
        }
        if (t.closest('.crozzo-psyche-chip__close')) {
          e.preventDefault();
          e.stopPropagation();
          dismissChip();
          return;
        }
        if (t.closest('.crozzo-break-nudge__close')) {
          e.preventDefault();
          e.stopPropagation();
          dismissBreakNudge(45);
        }
      },
      true
    );
  }

  function dismissConciergeStrip() {
    try {
      sessionStorage.setItem(SS_CONCIERGE, '1');
    } catch (_) {}
    if (typeof global.navigateTo === 'function' && global.currentPage === 'inicio-operacion') {
      global.navigateTo('inicio-operacion');
    }
  }

  function renderConciergeStrip() {
    if (!shouldApplyPsycheLayer()) return '';
    try {
      if (sessionStorage.getItem(SS_CONCIERGE) === '1') return '';
    } catch (_) {}
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
      (shouldApplyPsycheLayer() && global.CrozzoHelpHub
        ? '<button type="button" class="crozzo-concierge-strip__link" onclick="CrozzoHelpHub.open()">Ayuda</button>'
        : shouldApplyPsycheLayer() && global.CrozzoOnboardingOperativo
          ? '<button type="button" class="crozzo-concierge-strip__link" onclick="CrozzoOnboardingOperativo.openModal()">Checklist</button>'
          : '') +
      '</div>' +
      '<button type="button" class="crozzo-concierge-strip__close" data-crozzo-act="crozzoDismissConciergeStrip" title="Ocultar mensaje" aria-label="Ocultar mensaje de bienvenida">×</button></aside>'
    );
  }

  function injectPeakBreatheStrip() {
    if (!shouldApplyComfortUx() && !shouldApplyHumanLayer()) return;
    if (isOperativaPage()) return;
    var host = document.getElementById('crozzo-peak-breathe-host');
    if (shouldApplyLuxuryCockpit()) {
      if (getOperationalTempo() !== TEMPO_CALM) {
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
        '<div class="crozzo-peak-breathe crozzo-peak-breathe--soft crozzo-calm-care-strip crozzo-calm-care-strip--enter" role="status" aria-live="polite">' +
        '<span class="crozzo-calm-care-strip__icon" aria-hidden="true">🌿</span>' +
        '<span class="crozzo-calm-care-strip__txt">' +
        pickCalmCareLine() +
        ' — sin prisa, todo queda respaldado.</span></div>';
      return;
    }
    var s = getPsychState();
    var critical = s.id === 'peak';
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
    var stripCls = critical ? 'crozzo-peak-breathe--rush' : 'crozzo-peak-breathe--flow';
    var icon = critical ? '⚡' : '✨';
    var msg = critical
      ? 'Alta demanda — enfoque esencial. Cada acción queda registrada al instante.'
      : 'Ritmo activo — respuesta ágil con la precisión de siempre.';
    host.innerHTML =
      '<div class="crozzo-peak-breathe crozzo-peak-breathe--soft ' +
      stripCls +
      '" role="status" aria-live="polite">' +
      '<span aria-hidden="true">' +
      icon +
      '</span>' +
      '<span>' +
      msg +
      '</span></div>';
  }

  function maybeAffirmComandaFromToast(message) {
    if (!shouldApplyPsycheLayer() || !message || isTempoHighLoad()) return;
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
      '<button type="button" class="crozzo-psyche-chip__close" data-crozzo-act="crozzoDismissPsycheChip" title="Ocultar por esta sesión" aria-label="Ocultar">×</button></div>'
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
    if (shouldApplyLuxuryCockpit() && isTempoHighLoad()) {
      _psycheChipHtmlCache = '';
      _peakStripActive = false;
      var peakHostShield = document.getElementById('crozzo-peak-breathe-host');
      if (peakHostShield) peakHostShield.innerHTML = '';
      var hShield = document.getElementById('crozzo-psyche-chip-host');
      if (hShield) {
        hShield.innerHTML = '';
        hShield.hidden = true;
      }
      return;
    }
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
    global.crozzoDismissPsycheChip = dismissChip;
    global.crozzoDismissConciergeStrip = dismissConciergeStrip;
    global.crozzoDismissBreakNudge = dismissBreakNudge;
    bindPsycheDismissCapture();
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
        applySessionWarmthClasses();
        syncOperationalTempo();
        updateStabilityHint();
        injectPsycheChipHost(false);
      }, 45000);
    }
    if (!global.__crozzoCockpitStabilityPoll) {
      global.__crozzoCockpitStabilityPoll = setInterval(function () {
        if (!shouldApplyLuxuryCockpit()) return;
        updateStabilityHint();
        updateHeaderPsycheLine();
      }, 120000);
    }
    if (!global.__crozzoCockpitStabilityBound) {
      global.__crozzoCockpitStabilityBound = true;
      var onStabilityChange = function () {
        updateStabilityHint();
        updateHeaderPsycheLine();
        scheduleTempoPulse();
      };
      try {
        global.addEventListener('online', onStabilityChange);
        global.addEventListener('offline', onStabilityChange);
        global.addEventListener('crozzo:pos-operation-state', onStabilityChange);
      } catch (_) {}
      document.addEventListener('crozzo-sync-queue-changed', onStabilityChange);
      document.addEventListener('crozzo-connectivity-changed', onStabilityChange);
      document.addEventListener('crozzo-salon-config-changed', function () {
        invalidateTempoThresholdsCache();
        scheduleTempoPulse();
      });
      document.addEventListener('crozzo-tempo-changed', function () {
        injectPsycheChipHost(false);
      });
    }
    if (!global.__crozzoTempoFastPoll) {
      global.__crozzoTempoFastPoll = setInterval(function () {
        if (!shouldApplyLuxuryCockpit()) return;
        syncOperationalTempo();
      }, 12000);
    }
  }

  global.crozzoMergeOperativeStressThresholds = mergeOperativeStressThresholds;

  global.CrozzoOperativePsyche = {
    init: init,
    shouldApplyComfortUx: shouldApplyComfortUx,
    shouldApplyLuxuryCockpit: shouldApplyLuxuryCockpit,
    comfortMotionSoft: comfortMotionSoft,
    syncOperativaAmbience: syncOperativaAmbience,
    syncOperationalTempo: syncOperationalTempo,
    getOperationalTempo: getOperationalTempo,
    getRawOperationalTempo: getRawOperationalTempo,
    getTempoIntensity: getTempoIntensity,
    getTempoThresholds: getTempoThresholds,
    detectSalonCapacity: detectSalonCapacity,
    isTempoHighLoad: isTempoHighLoad,
    shouldSuppressToast: shouldSuppressToast,
    isToastMinimal: isToastMinimal,
    trimToastStack: trimToastStack,
    getStabilityNarrative: getStabilityNarrative,
    snoozeBreakReminder: snoozeBreakReminder,
    dismissBreakNudge: dismissBreakNudge,
    snoozeBreakAndClose: snoozeBreakAndClose,
    ackBreakPause: ackBreakPause,
    getBreakIntervalMs: getBreakIntervalMs,
    getPsychState: getPsychState,
    getWellbeingSummary: getWellbeingSummary,
    renderPsycheChip: renderPsycheChip,
    dismissChip: dismissChip,
    dismissConciergeStrip: dismissConciergeStrip,
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
