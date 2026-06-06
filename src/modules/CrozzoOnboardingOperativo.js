/**
 * Crozzo POS — Onboarding operativo, guardas según perfil y panel de adopción.
 */
(function (global) {
  'use strict';

  var LS = 'crozzo_onboarding_operativo_v1';
  var LS_DISMISS = 'crozzo_onboarding_dismissed_v1';
  var LS_MARCACION_TOUR = 'crozzo_onboarding_marcacion_tour_v1';
  var LS_DAY0_WIZARD = 'crozzo_day0_wizard_done_v1';
  var LS_TIMELINE = 'crozzo_operative_timeline_v1';
  var LS_STAFF_BASE = 'crozzo_onb_staff_baseline_v1';
  var PEAK_PAGES = {
    'inicio-operacion': 1,
    cajero: 1,
    tablets: 1,
    comandas: 1,
    cocina: 1,
    'cierre-caja': 1,
  };

  var OBS_RIESGO_NOMBRES = ['hamburguesa', 'marisc', 'camar', 'nuez', 'maní', 'mani', 'lacteo', 'queso', 'huevo', 'gluten', 'sésamo', 'sesamo', 'ostra', 'langosta'];
  var OBS_SENAL_OK = /alerg|intoler|sin gluten|sin lact|sin huevo|apio|sulfit|nueces|maní|mani|celiac|evitar/i;

  var STEPS = [
    {
      id: 'perfil_operativo',
      phase: 0,
      label: 'Perfil operativo configurado',
      hint: 'Elija pequeño, mediano, grande, retail, etc. El menú se adapta por rol automáticamente.',
      page: 'gestion-perfiles-menus',
      optional: false,
    },
    {
      id: 'empresa',
      phase: 0,
      label: 'Datos del negocio',
      hint: 'Nombre, NIT y datos básicos en Configuración → Empresa.',
      page: 'config-empresa',
      optional: false,
    },
    {
      id: 'modo_practica',
      phase: 0,
      label: 'Practicar en modo DEMO o SIMPLE',
      hint: 'Modo DEMO los primeros días: sin riesgo fiscal. Ideal para capacitación del equipo.',
      page: 'config-empresa',
      optional: false,
    },
    {
      id: 'catalogo',
      phase: 0,
      label: 'Catálogo con al menos 5 productos',
      hint: 'Gestión → Catálogo. Puede cargar datos demo desde Sistema de costos.',
      page: 'productos',
      optional: false,
    },
    {
      id: 'alergenos_catalogo',
      phase: 0,
      label: 'Alérgenos en platos sensibles',
      hint: 'En cada producto declare gluten, lacteos, nueces, etc. Cocina los verá en comanda.',
      page: 'productos',
      optional: false,
    },
    {
      id: 'personal',
      phase: 0,
      label: 'Perfiles de personal (≥2 usuarios)',
      hint: 'Administración → Usuarios. Mesero solo tablets; caja solo POS y cierre.',
      page: 'admin',
      optional: false,
    },
    {
      id: 'comanda_prueba',
      phase: 0,
      label: 'Comanda de prueba a cocina',
      hint: 'Restaurante → mesa M1 → agregar ítems → Comandar (una sola vez).',
      page: 'cajero',
      optional: false,
    },
    {
      id: 'cierre_prueba',
      phase: 1,
      label: 'Cierre de turno simulado',
      hint: 'Cierre de caja → abrir turno → arqueo de prueba con base en efectivo.',
      page: 'cierre-caja',
      optional: false,
    },
    {
      id: 'marcacion',
      phase: 1,
      label: 'Marcación de personal (opcional)',
      hint: 'Kiosk con PIN. Tour guiado disponible desde el checklist.',
      page: 'control-acceso',
      optional: true,
    },
    {
      id: 'nube',
      phase: 1,
      label: 'Respaldo en nube (opcional)',
      hint: 'Multi-dispositivo → Supabase para sync y backup.',
      page: 'config-multidispositivo',
      optional: true,
    },
  ];

  function readStore() {
    try {
      var raw = localStorage.getItem(LS);
      if (!raw) return { manual: {}, comandaPrueba: false, cierrePrueba: false, dupBlocked: 0 };
      var s = JSON.parse(raw);
      return {
        manual: s.manual && typeof s.manual === 'object' ? s.manual : {},
        comandaPrueba: !!s.comandaPrueba,
        cierrePrueba: !!s.cierrePrueba,
        dupBlocked: Number(s.dupBlocked) || 0,
        perfilApplied: !!s.perfilApplied,
        obsWarnCount: Number(s.obsWarnCount) || 0,
      };
    } catch (_) {
      return { manual: {}, comandaPrueba: false, cierrePrueba: false, dupBlocked: 0, perfilApplied: false, obsWarnCount: 0 };
    }
  }

  function writeStore(patch) {
    var cur = readStore();
    var next = Object.assign({}, cur, patch || {});
    if (patch && patch.manual) {
      next.manual = Object.assign({}, cur.manual, patch.manual);
    }
    try {
      localStorage.setItem(LS, JSON.stringify(next));
    } catch (e) {
      console.warn('[onboarding]', e);
    }
    invalidateAdoptionCache();
    return next;
  }

  function isDismissed() {
    try {
      return localStorage.getItem(LS_DISMISS) === '1';
    } catch (_) {
      return false;
    }
  }

  function dismissBanner() {
    try {
      localStorage.setItem(LS_DISMISS, '1');
    } catch (_) {}
    refreshInicioIfActive();
  }

  function restoreBanner() {
    try {
      localStorage.removeItem(LS_DISMISS);
    } catch (_) {}
    refreshInicioIfActive();
    if (typeof global.showToast === 'function') global.showToast('Recordatorio de apertura restaurado', 'info');
  }

  function refreshInicioIfActive() {
    if (typeof global.navigateTo === 'function' && global.currentPage === 'inicio-operacion') {
      global.navigateTo('inicio-operacion');
    }
  }

  function getOperativoConfig() {
    if (typeof global.crozzoGetPerfilOperativo === 'function') {
      return global.crozzoGetPerfilOperativo(getPerfilEmpresa());
    }
    return {
      debounceMs: 700,
      dupWindowMs: 90000,
      dupRatio: 0.78,
      onboarding: true,
      shiftTip: true,
      experiencia: 'mixed',
      label: 'Completo',
    };
  }

  function formatMoney(n) {
    var v = Math.abs(Number(n) || 0);
    if (typeof global.formatMoney === 'function') return global.formatMoney(v);
    return '$' + Math.round(v).toLocaleString('es-CO');
  }

  function getCurrentUserRoleNorm() {
    try {
      if (typeof global.getCurrentUser !== 'function' || !global.getCurrentUser()) return '';
      if (typeof global.crozzoNormalizeAppRol === 'function') {
        return global.crozzoNormalizeAppRol(global.getCurrentUser().rol);
      }
      return String(global.getCurrentUser().rol || '').toLowerCase();
    } catch (_) {
      return '';
    }
  }

  /** Solo mesero/cocina/user ven nav reducido en pico; admin y caja mantienen control. */
  function shouldMuteNavInPeak() {
    if (typeof global.isSuperAdminUser === 'function' && global.isSuperAdminUser()) return false;
    var r = getCurrentUserRoleNorm();
    if (r === 'admin' || r === 'caja' || r === 'inventario' || r === 'gerente' || r === 'chef') return false;
    return r === 'mesero' || r === 'cocina' || r === 'user' || !r;
  }

  function getPerfilEmpresa() {
    if (typeof global.crozzoGetPerfilEmpresa === 'function') return global.crozzoGetPerfilEmpresa();
    try {
      return String(localStorage.getItem('crozzo_perfil_empresa') || '').toLowerCase();
    } catch (_) {
      return '';
    }
  }

  function detectStep(id) {
    var st = readStore();
    try {
      if (id === 'perfil_operativo') {
        var pe = getPerfilEmpresa();
        if (st.perfilApplied || st.manual.perfil_operativo) return true;
        return pe && pe !== 'completo' && pe !== 'personalizado';
      }
      if (id === 'empresa') {
        var cfg = global.config;
        if (!cfg || typeof cfg.getEmpresa !== 'function') return false;
        var e = cfg.getEmpresa() || {};
        return !!(String(e.nombreComercial || e.razonSocial || '').trim() && String(e.nit || '').trim());
      }
      if (id === 'modo_practica') {
        var cfg2 = global.config;
        if (!cfg2 || typeof cfg2.getOperacionModo !== 'function') return false;
        var m = cfg2.getOperacionModo();
        return m === 'demo' || m === 'simple' || !!st.manual.modo_practica;
      }
      if (id === 'catalogo') {
        var prods = global.products;
        return Array.isArray(prods) && prods.length >= 5;
      }
      if (id === 'alergenos_catalogo') {
        if (st.manual && st.manual.alergenos_catalogo) return true;
        var prodsAlg = global.products;
        if (!Array.isArray(prodsAlg)) return false;
        return prodsAlg.some(function (p) {
          if (!p) return false;
          var a = p.alergenos;
          return (Array.isArray(a) && a.length) || (typeof a === 'string' && String(a).trim());
        });
      }
      if (id === 'personal') {
        if (typeof global.getUsuariosConfig === 'function') {
          var staff = (global.getUsuariosConfig().staff || []).filter(function (u) {
            return u && u.activo !== false && u.rol !== 'superadmin' && u.id !== 'KENNY';
          });
          return staff.length >= 2;
        }
        return false;
      }
      if (id === 'comanda_prueba') {
        return st.comandaPrueba || !!st.manual.comanda_prueba;
      }
      if (id === 'cierre_prueba') {
        if (st.cierrePrueba || st.manual.cierre_prueba) return true;
        try {
          var hist = JSON.parse(localStorage.getItem('crozzo_shift_turn_history_v1') || '[]');
          return Array.isArray(hist) && hist.length > 0;
        } catch (_) {
          return false;
        }
      }
      if (id === 'marcacion') {
        try {
          var emps = JSON.parse(localStorage.getItem('crozzo_empleados_cache') || '[]');
          if (Array.isArray(emps) && emps.length >= 1) return true;
        } catch (_) {}
        return !!st.manual.marcacion;
      }
      if (id === 'nube') {
        try {
          var cloud = JSON.parse(localStorage.getItem('crozzo_supabase_config') || '{}');
          return !!(cloud && cloud.syncEnabled && cloud.url);
        } catch (_) {
          return false;
        }
      }
    } catch (e) {
      console.warn('[onboarding] detect', id, e);
    }
    return false;
  }

  function getProgress() {
    var required = STEPS.filter(function (s) {
      return !s.optional;
    });
    var done = 0;
    var items = STEPS.map(function (step) {
      var ok = detectStep(step.id);
      if (ok && !step.optional) done++;
      return { step: step, done: ok };
    });
    var pct = required.length ? Math.round((done / required.length) * 100) : 100;
    var phase = 0;
    if (pct >= 100) phase = 2;
    else if (pct >= 50) phase = 1;
    return { items: items, done: done, total: required.length, pct: pct, phase: phase };
  }

  function ensureTimelineStart() {
    try {
      if (!localStorage.getItem(LS_TIMELINE)) {
        localStorage.setItem(
          LS_TIMELINE,
          JSON.stringify({ startedAt: new Date().toISOString(), arqueoGuards: 0, peakSessions: 0 })
        );
      }
    } catch (_) {}
  }

  function readTimeline() {
    ensureTimelineStart();
    try {
      var raw = localStorage.getItem(LS_TIMELINE);
      return raw ? JSON.parse(raw) : { startedAt: new Date().toISOString() };
    } catch (_) {
      return { startedAt: new Date().toISOString() };
    }
  }

  function writeTimeline(patch) {
    var cur = readTimeline();
    var next = Object.assign({}, cur, patch || {});
    try {
      localStorage.setItem(LS_TIMELINE, JSON.stringify(next));
    } catch (_) {}
    return next;
  }

  function csvEscape(val) {
    var s = String(val == null ? '' : val);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function recordDailySnapshotIfNeeded() {
    var tl = readTimeline();
    var today = new Date().toISOString().slice(0, 10);
    tl.snapshots = tl.snapshots || [];
    if (tl.snapshots.some(function (s) { return s.date === today; })) return tl;
    var hf = getHumanFactorIndex();
    var ph = getOperationalPhase();
    var ad = getAdoptionMetricsCached(true);
    tl.snapshots.push({
      date: today,
      ihs: hf.score,
      ihsLabel: hf.label,
      phase: ph.phase,
      phaseLabel: ph.label,
      adoption: ad.score,
      checklistPct: ad.checklistPct,
      dupBlocked: hf.dupBlocked,
      obsWarnCount: hf.obsWarnCount,
      arqueoGuards: tl.arqueoGuards || 0,
    });
    tl.snapshots = tl.snapshots.slice(-365);
    writeTimeline({ snapshots: tl.snapshots });
    return tl;
  }

  function buildMetricsCsv() {
    recordDailySnapshotIfNeeded();
    var tl = readTimeline();
    var header =
      'tipo,fecha,ihs,ihs_label,fase,fase_label,adopcion,checklist_pct,dup_blocked,obs_warn,arqueo_guards,bienestar_mood,bienestar_rol';
    var lines = [header];
    (tl.snapshots || []).forEach(function (s) {
      lines.push(
        [
          'snapshot',
          s.date,
          s.ihs,
          csvEscape(s.ihsLabel),
          s.phase,
          csvEscape(s.phaseLabel),
          s.adoption,
          s.checklistPct,
          s.dupBlocked,
          s.obsWarnCount,
          s.arqueoGuards || 0,
          '',
          '',
        ].join(',')
      );
    });
    var today = new Date().toISOString().slice(0, 10);
    if (!(tl.snapshots || []).some(function (s) { return s.date === today; })) {
      var hf = getHumanFactorIndex();
      var ph = getOperationalPhase();
      var ad = getAdoptionMetricsCached(true);
      lines.push(
        [
          'actual',
          today,
          hf.score,
          csvEscape(hf.label),
          ph.phase,
          csvEscape(ph.label),
          ad.score,
          ad.checklistPct,
          hf.dupBlocked,
          hf.obsWarnCount,
          tl.arqueoGuards || 0,
          '',
          '',
        ].join(',')
      );
    }
    if (
      global.CrozzoOperativePsyche &&
      typeof global.CrozzoOperativePsyche.getWellbeingEntries === 'function'
    ) {
      global.CrozzoOperativePsyche.getWellbeingEntries().forEach(function (e) {
        lines.push(
          [
            'bienestar',
            String(e.at || '').slice(0, 10),
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            e.mood || '',
            e.role || '',
          ].join(',')
        );
      });
    }
    return lines.join('\r\n');
  }

  function exportMetricsCsv() {
    try {
      var csv = buildMetricsCsv();
      var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'crozzo-metricas-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (typeof global.showToast === 'function') global.showToast('Métricas exportadas a CSV', 'success');
    } catch (e) {
      if (typeof global.showToast === 'function') global.showToast('No se pudo exportar CSV', 'error');
    }
  }

  function openStaffRotationMiniChecklist() {
    if (typeof global.showModal !== 'function') return;
    var p = getProgress();
    var mini = p.items
      .filter(function (x) {
        return !x.done && !x.step.optional && ['personal', 'comanda_prueba', 'modo_practica'].indexOf(x.step.id) >= 0;
      })
      .slice(0, 3);
    var rows = mini
      .map(function (x) {
        return (
          '<li class="crozzo-onb-row"><span class="crozzo-onb-row__icon">⬜</span><div class="crozzo-onb-row__body"><strong>' +
          esc(x.step.label) +
          '</strong><p class="form-hint">' +
          esc(x.step.hint) +
          '</p>' +
          (x.step.page
            ? ' <button type="button" class="btn btn-outline btn-sm" onclick="closeModal();navigateTo(\'' +
              esc(x.step.page) +
              '\')">Ir</button>'
            : '') +
          '</div></li>'
        );
      })
      .join('');
    global.showModal(
      '👥 Capacitación — personal nuevo',
      '<p class="crozzo-psyche-modal__lead">Detectamos más usuarios activos. Repase estos pasos con quien ingresa:</p>' +
        (rows ? '<ul class="crozzo-onb-modal__list">' + rows + '</ul>' : '<p class="form-hint">Checklist base ya avanzado — repase comandas y cierre con el equipo.</p>') +
        '<div class="btn-group" style="justify-content:flex-end;margin-top:14px;flex-wrap:wrap;gap:8px;">' +
        '<button type="button" class="btn btn-outline" onclick="CrozzoOnboardingOperativo.openModal()">Checklist completo</button>' +
        '<button type="button" class="btn btn-primary" onclick="closeModal()">Entendido</button></div>'
    );
  }

  function detectStaffRotation() {
    try {
      if (typeof global.getUsuariosConfig !== 'function') return;
      var staff = (global.getUsuariosConfig().staff || []).filter(function (u) {
        return u && u.activo !== false;
      });
      var count = staff.length;
      if (count < 2) return;
      var baseRaw = localStorage.getItem(LS_STAFF_BASE);
      if (!baseRaw) {
        localStorage.setItem(LS_STAFF_BASE, String(count));
        writeTimeline({ lastStaffCount: count });
        return;
      }
      var base = parseInt(baseRaw, 10) || count;
      var growth = count - base;
      if (base > 0 && growth >= Math.max(2, Math.ceil(base * 0.25))) {
        localStorage.setItem(LS_STAFF_BASE, String(count));
        var tl = readTimeline();
        writeTimeline({ staffRotations: (tl.staffRotations || 0) + 1, lastStaffCount: count });
        var r = getCurrentUserRoleNorm();
        if ((r === 'admin' || r === 'caja' || r === 'gerente') && typeof global.showToast === 'function') {
          setTimeout(function () {
            global.showToast(
              'Personal nuevo detectado (+' + growth + ' usuarios). Revise capacitación en Inicio ventas.',
              'info'
            );
          }, 2200);
        }
        if (r === 'admin' && !localStorage.getItem('crozzo_staff_rot_modal_' + count)) {
          localStorage.setItem('crozzo_staff_rot_modal_' + count, '1');
          setTimeout(openStaffRotationMiniChecklist, 3800);
        }
      }
    } catch (_) {}
  }

  /** FASE 0–4 alineada con simulación operativa Día 0 → Año 2. */
  function getOperationalPhase() {
    var tl = readTimeline();
    var start = new Date(tl.startedAt || Date.now()).getTime();
    var days = Math.max(0, Math.floor((Date.now() - start) / 86400000));
    var phase = 0;
    var label = 'FASE 0 · Día 0–30';
    if (days >= 540) {
      phase = 4;
      label = 'FASE 4 · Año 1.5–2';
    } else if (days >= 365) {
      phase = 3;
      label = 'FASE 3 · Año 1–1.5';
    } else if (days >= 180) {
      phase = 2;
      label = 'FASE 2 · Mes 7–12';
    } else if (days >= 30) {
      phase = 1;
      label = 'FASE 1 · Mes 2–6';
    }
    return { phase: phase, days: days, label: label, startedAt: tl.startedAt };
  }

  function getRestaurantStressSnapshot() {
    if (typeof global.crozzoShiftGetRestaurantStress === 'function') {
      return global.crozzoShiftGetRestaurantStress();
    }
    return { level: 'calm', label: 'Operación normal', activeComandas: 0, salesHour: 0, hint: '' };
  }

  /** Índice humano vs sistema: adopción + errores mitigados vs fricción residual. */
  function getHumanFactorIndex(adSnapshot) {
    var st = readStore();
    var ad = adSnapshot || getAdoptionMetricsCached();
    var op = getOperativoConfig();
    var mitigated = (st.dupBlocked || 0) * 3 + Math.min(ad.checklistPct || 0, 100) * 0.4;
    var friction = (st.obsWarnCount || 0) * 2 + Math.max(0, 100 - (ad.score || 0)) * 0.35;
    if (op.experiencia === 'novice') friction += 8;
    var score = Math.round(Math.max(0, Math.min(100, 50 + mitigated - friction)));
    var label = score >= 72 ? 'Equilibrio humano-sistema' : score >= 48 ? 'Fricción moderada' : 'Riesgo humano elevado';
    return {
      score: score,
      label: label,
      dupBlocked: st.dupBlocked || 0,
      obsWarnCount: st.obsWarnCount || 0,
      adoption: ad.score,
      checklistPct: ad.checklistPct,
      experiencia: op.experiencia || 'mixed',
    };
  }

  var __adMetricsCache = null;
  var __adMetricsCacheAt = 0;

  function getAdoptionMetricsCached(force) {
    if (!force && __adMetricsCache && Date.now() - __adMetricsCacheAt < 20000) return __adMetricsCache;
    __adMetricsCache = getAdoptionMetrics();
    __adMetricsCacheAt = Date.now();
    return __adMetricsCache;
  }

  function invalidateAdoptionCache() {
    __adMetricsCache = null;
    __adMetricsCacheAt = 0;
  }

  function getCombinedStress() {
    var rest = getRestaurantStressSnapshot();
    var ad = getAdoptionMetricsCached();
    var hf = getHumanFactorIndex(ad);
    var op = getOperativoConfig();
    var combined = rest.level;
    if (op.experiencia === 'novice' && rest.level === 'rush' && hf.score < 58) combined = 'critical';
    else if (op.experiencia === 'novice' && rest.level === 'busy' && hf.score < 42) combined = 'critical';
    return Object.assign({}, rest, { humanFactor: hf, combined: combined });
  }

  function needsNoviceArqueoConfirm(diff) {
    var op = getOperativoConfig();
    if (op.experiencia !== 'novice') return false;
    var cs = getCombinedStress();
    var d = Math.abs(Number(diff) || 0);
    if (d >= 1500) return true;
    if (cs.level !== 'calm' && d >= 500) return true;
    return false;
  }

  function confirmNoviceArqueo(pending, proceed) {
    if (typeof global.showModal !== 'function' || !pending) {
      proceed();
      return;
    }
    writeTimeline({ arqueoGuards: (readTimeline().arqueoGuards || 0) + 1 });
    var cs = getCombinedStress();
    var arqueoBody =
      typeof global.CrozzoOperativePsyche !== 'undefined' &&
      global.CrozzoOperativePsyche.getSupportiveArqueoModalHtml
        ? global.CrozzoOperativePsyche.getSupportiveArqueoModalHtml(cs, pending, formatMoney)
        : '<p>Revise diferencia antes de cerrar.</p>' +
          '<div class="btn-group" style="justify-content:flex-end;margin-top:14px;">' +
          '<button type="button" class="btn btn-outline" onclick="closeModal()">Revisar</button>' +
          '<button type="button" class="btn btn-warning" onclick="CrozzoOnboardingOperativo.proceedNoviceArqueo()">Confirmar</button></div>';
    global.showModal('🧮 Cierre de turno — revisión tranquila', arqueoBody);
    global.__crozzoNoviceArqueoProceed = proceed;
  }

  function proceedNoviceArqueo() {
    var fn = global.__crozzoNoviceArqueoProceed;
    global.__crozzoNoviceArqueoProceed = null;
    if (typeof global.closeModal === 'function') global.closeModal({ keepPendingComanda: true, keepNoviceArqueo: true });
    global.__crozzoSkipNoviceArqueoGuard = true;
    try {
      if (typeof fn === 'function') fn();
    } finally {
      global.__crozzoSkipNoviceArqueoGuard = false;
    }
  }

  function applyPeakNoviceMode() {
    var cs = getCombinedStress();
    var op = getOperativoConfig();
    var stressActive =
      op.experiencia === 'novice' &&
      (cs.combined === 'critical' || cs.level === 'rush' || cs.level === 'busy');
    var navMute =
      stressActive &&
      (cs.combined === 'critical' || cs.level === 'rush') &&
      shouldMuteNavInPeak();
    if (document.body) {
      document.body.classList.toggle('crozzo-peak-novice', stressActive);
      document.body.classList.toggle('crozzo-peak-novice--mute', navMute);
      document.body.setAttribute('data-crozzo-stress', cs.combined || cs.level || 'calm');
      document.body.setAttribute('data-crozzo-hfsi', String((cs.humanFactor && cs.humanFactor.score) || 0));
    }
    document.querySelectorAll('.nav-item[data-page]').forEach(function (el) {
      if (!navMute) {
        el.classList.remove('crozzo-nav-peak-muted');
        return;
      }
      var pg = el.getAttribute('data-page');
      el.classList.toggle('crozzo-nav-peak-muted', !PEAK_PAGES[pg]);
    });
    if (stressActive && !global.__crozzoPeakSessionMarked) {
      global.__crozzoPeakSessionMarked = true;
      writeTimeline({ peakSessions: (readTimeline().peakSessions || 0) + 1 });
      if (navMute && typeof global.showToast === 'function') {
        global.showToast('Servicio intenso: solo lo esencial visible — usted va bien', 'info');
      }
      setTimeout(function () {
        global.__crozzoPeakSessionMarked = false;
      }, 600000);
    }
    if (document.documentElement) {
      var forcePerf = false;
      var forceOff = false;
      try {
        var perfPref = localStorage.getItem('crozzo_perf_lite');
        forcePerf = perfPref === '1' || perfPref === 'true';
        forceOff = perfPref === '0';
      } catch (_) {}
      if (stressActive && !forceOff) {
        document.documentElement.classList.add('crozzo-perf-lite');
        document.documentElement.setAttribute('data-crozzo-peak-perf', '1');
      } else if (!forcePerf && document.documentElement.getAttribute('data-crozzo-peak-perf') === '1') {
        document.documentElement.classList.remove('crozzo-perf-lite');
        document.documentElement.removeAttribute('data-crozzo-peak-perf');
      }
    }
  }

  function renderHumanStressPanel() {
    var ph = getOperationalPhase();
    var cs = getCombinedStress();
    var hf = cs.humanFactor || getHumanFactorIndex();
    var wb =
      typeof global.CrozzoOperativePsyche !== 'undefined' && global.CrozzoOperativePsyche.getWellbeingSummary
        ? global.CrozzoOperativePsyche.getWellbeingSummary()
        : null;
    var stressCls =
      cs.combined === 'critical' ? 'crozzo-hfsi--critical' : cs.level === 'rush' ? 'crozzo-hfsi--rush' : '';
    return (
      '<div class="crozzo-hfsi ' +
      stressCls +
      '">' +
      '<div class="crozzo-hfsi__head">' +
      '<span class="crozzo-hfsi__phase">' +
      esc(ph.label) +
      '</span>' +
      '<span class="crozzo-hfsi__score" title="Índice humano-sistema">' +
      hf.score +
      '%</span></div>' +
      '<p class="form-hint" style="margin:6px 0 0;">' +
      esc(hf.label) +
      ' · Servicio: <strong>' +
      esc(cs.label) +
      '</strong></p>' +
      '<p class="form-hint" style="margin:4px 0 0;">Mitigados: ' +
      hf.dupBlocked +
      ' duplicados · ' +
      hf.obsWarnCount +
      ' alertas obs.</p>' +
      (wb && wb.total > 0
        ? '<p class="form-hint crozzo-hfsi__wellbeing">Bienestar turnos (30 d): ' +
          wb.pctGood +
          '% positivo · ' +
          wb.hard +
          ' exigente(s)</p>'
        : '') +
      '</div>'
    );
  }

  function getAdoptionMetrics() {
    var p = getProgress();
    var st = readStore();
    var m = { comandas: 0, logins: 0, ventas: 0, dupBlocked: st.dupBlocked || 0 };
    try {
      var aud =
        global.config &&
        global.config.config &&
        Array.isArray(global.config.config.auditoria)
          ? global.config.config.auditoria
          : [];
      aud.forEach(function (e) {
        if (!e || !e.action) return;
        var a = String(e.action);
        if (a === 'comanda_enviada' || a === 'comanda_actualizada') m.comandas++;
        if (a === 'login_exitoso') m.logins++;
        if (a.indexOf('venta') >= 0 || a.indexOf('cobro') >= 0 || a === 'factura_emitida') m.ventas++;
      });
    } catch (_) {}
    var activity = Math.min(30, m.comandas * 2 + m.logins * 3 + Math.min(m.ventas, 5));
    var score = Math.min(100, Math.round(p.pct * 0.55 + activity * 1.5));
    return {
      score: score,
      checklistPct: p.pct,
      comandas: m.comandas,
      logins: m.logins,
      dupBlocked: m.dupBlocked,
      obsWarnCount: st.obsWarnCount || 0,
      perfil: getPerfilEmpresa() || 'completo',
      perfilLabel: getOperativoConfig().label || getPerfilEmpresa(),
    };
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderAdoptionPanel() {
    var ad = getAdoptionMetrics();
    return (
      renderHumanStressPanel() +
      '<div class="crozzo-onb-adoption">' +
      '<div class="crozzo-onb-adoption__score">' +
      '<span class="crozzo-onb-adoption__ring">' +
      ad.score +
      '%</span>' +
      '<div><strong>Índice de adopción</strong>' +
      '<p class="form-hint" style="margin:4px 0 0;">Perfil: <code>' +
      esc(ad.perfil) +
      '</code> · ' +
      esc(ad.perfilLabel) +
      ' · Checklist ' +
      ad.checklistPct +
      '%</p></div></div>' +
      '<div class="crozzo-onb-adoption__stats">' +
      '<span>🧾 ' +
      ad.comandas +
      ' comandas</span>' +
      '<span>🔐 ' +
      ad.logins +
      ' inicios</span>' +
      '<span>🛡️ ' +
      ad.dupBlocked +
      ' duplicados evitados</span>' +
      (ad.obsWarnCount ? '<span>⚠️ ' + ad.obsWarnCount + ' alertas obs.</span>' : '') +
      '</div></div>'
    );
  }

  function renderInicioCompactHfsi() {
    var op = getOperativoConfig();
    if (!op.onboarding && op.experiencia !== 'novice') return '';
    var cs = getCombinedStress();
    var ph = getOperationalPhase();
    var hf = cs.humanFactor || getHumanFactorIndex();
    var wb =
      typeof global.CrozzoOperativePsyche !== 'undefined' && global.CrozzoOperativePsyche.getWellbeingSummary
        ? global.CrozzoOperativePsyche.getWellbeingSummary()
        : null;
    return (
      '<aside class="crozzo-onb-banner crozzo-onb-banner--compact" role="region" aria-label="Salud operativa">' +
      '<div class="crozzo-onb-banner__head">' +
      '<div><strong>📊 ' +
      esc(ph.label) +
      '</strong>' +
      '<span class="crozzo-onb-banner__sub">IH-S ' +
      hf.score +
      '% · ' +
      esc(hf.label) +
      ' · ' +
      esc(cs.label) +
      '</span></div>' +
      '<div class="crozzo-onb-banner__actions">' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="CrozzoOnboardingOperativo.openModal()">Detalle</button>' +
      '</div></div>' +
      (wb && wb.total > 0
        ? '<p class="form-hint" style="margin:6px 0 0;">Bienestar equipo (30d): ' + wb.pctGood + '% positivo</p>'
        : '') +
      '</aside>'
    );
  }

  function renderInicioHtml() {
    var op = getOperativoConfig();
    if (isDismissed()) {
      if (op.experiencia === 'novice' || op.onboarding) return renderInicioCompactHfsi();
      return '';
    }
    var p = getProgress();
    if (p.pct >= 100) {
      return renderInicioCompactHfsi();
    }
    var ad = getAdoptionMetrics();
    var pending = p.items.filter(function (x) {
      return !x.done && !x.step.optional;
    }).slice(0, 3);
    var pendingHtml = pending
      .map(function (x) {
        return (
          '<li class="crozzo-onb__pending-item">' +
          '<span class="crozzo-onb__pending-dot" aria-hidden="true"></span>' +
          esc(x.step.label) +
          '</li>'
        );
      })
      .join('');
    var pills =
      typeof global.CrozzoPerfilesOperativos !== 'undefined' && global.CrozzoPerfilesOperativos.renderQuickPills
        ? global.CrozzoPerfilesOperativos.renderQuickPills(true)
        : '';
    return (
      '<aside class="crozzo-onb-banner" role="region" aria-label="Checklist de apertura">' +
      '<div class="crozzo-onb-banner__head">' +
      '<div><strong>🚀 Apertura · ' +
      esc(getOperativoConfig().label || 'Negocio') +
      '</strong>' +
      '<span class="crozzo-onb-banner__sub">Adopción ' +
      ad.score +
      '% · ' +
      p.done +
      '/' +
      p.total +
      ' pasos</span></div>' +
      '<div class="crozzo-onb-banner__actions">' +
      '<button type="button" class="btn btn-primary btn-sm" onclick="CrozzoOnboardingOperativo.openModal()">Checklist</button>' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="CrozzoOnboardingOperativo.openPerfilesModal()">Perfiles</button>' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="CrozzoOnboardingOperativo.dismissBanner()" title="Ocultar">×</button>' +
      '</div></div>' +
      (pills ? '<div class="crozzo-perfil-pills">' + pills + '</div>' : '') +
      '<div class="crozzo-onb-banner__bar" aria-hidden="true"><span style="width:' +
      p.pct +
      '%"></span></div>' +
      (pendingHtml ? '<ul class="crozzo-onb-banner__list">' + pendingHtml + '</ul>' : '') +
      '</aside>'
    );
  }

  function openModal() {
    if (typeof global.showModal !== 'function') return;
    var p = getProgress();
    var rows = p.items
      .map(function (x) {
        var s = x.step;
        var icon = x.done ? '✅' : s.optional ? '○' : '⬜';
        var cls = x.done ? 'crozzo-onb-row--done' : '';
        var extra = '';
        if (s.id === 'perfil_operativo' && typeof global.CrozzoPerfilesOperativos !== 'undefined') {
          extra =
            ' <button type="button" class="btn btn-outline btn-sm" onclick="CrozzoOnboardingOperativo.openPerfilesModal()">Elegir perfil</button>';
        }
        if (s.id === 'marcacion' && !localStorage.getItem(LS_MARCACION_TOUR)) {
          extra +=
            ' <button type="button" class="btn btn-outline btn-sm" onclick="CrozzoOnboardingOperativo.openMarcacionTour()">Tour</button>';
        }
        var go =
          s.page && typeof global.navigateTo === 'function'
            ? ' <button type="button" class="btn btn-outline btn-sm" onclick="closeModal();navigateTo(\'' +
              esc(s.page) +
              '\')">Ir</button>'
            : '';
        var mark =
          !x.done && !s.optional && s.id !== 'perfil_operativo'
            ? ' <button type="button" class="btn btn-outline btn-sm" onclick="CrozzoOnboardingOperativo.markManual(\'' +
              esc(s.id) +
              '\')">Marcar hecho</button>'
            : '';
        return (
          '<li class="crozzo-onb-row ' +
          cls +
          '">' +
          '<span class="crozzo-onb-row__icon">' +
          icon +
          '</span>' +
          '<div class="crozzo-onb-row__body">' +
          '<strong>' +
          esc(s.label) +
          (s.optional ? ' <em>(opcional)</em>' : '') +
          '</strong>' +
          '<p class="form-hint">' +
          esc(s.hint) +
          '</p>' +
          extra +
          go +
          mark +
          '</div></li>'
        );
      })
      .join('');
    global.showModal(
      '📋 Checklist operativo — Día 0 a mes 1',
      renderAdoptionPanel() +
        '<p class="form-hint" style="margin:12px 0;">Para restaurantes pequeños con personal nuevo. Complete los pasos antes del primer servicio real.</p>' +
        '<div class="crozzo-onb-modal__progress">' +
        '<span>Progreso checklist: <strong>' +
        p.pct +
        '%</strong></span>' +
        '<div class="crozzo-onb-banner__bar"><span style="width:' +
        p.pct +
        '%"></span></div></div>' +
        '<ul class="crozzo-onb-modal__list">' +
        rows +
        '</ul>' +
        '<div class="btn-group" style="justify-content:flex-end;margin-top:14px;flex-wrap:wrap;gap:8px;">' +
        '<button type="button" class="btn btn-outline" onclick="CrozzoOnboardingOperativo.exportMetricsCsv()">📥 Exportar CSV</button>' +
        '<button type="button" class="btn btn-outline" onclick="CrozzoOnboardingOperativo.restoreBanner();closeModal();">Mostrar banner</button>' +
        '<button type="button" class="btn btn-outline" onclick="CrozzoOnboardingOperativo.dismissBanner();closeModal();">Ocultar recordatorio</button>' +
        '<button type="button" class="btn btn-primary" onclick="closeModal()">Cerrar</button></div>'
    );
  }

  function openPerfilesModal() {
    if (typeof global.showModal !== 'function') return;
    var list =
      typeof global.CrozzoPerfilesOperativos !== 'undefined' && global.CrozzoPerfilesOperativos.list
        ? global.CrozzoPerfilesOperativos.list()
        : [];
    var cur = getPerfilEmpresa();
    var cards = list
      .map(function (m) {
        var active = cur === m.id ? ' crozzo-perfil-card--active' : '';
        return (
          '<button type="button" class="crozzo-perfil-card' +
          active +
          '" onclick="CrozzoOnboardingOperativo.applyPerfil(\'' +
          esc(m.id) +
          '\', true)">' +
          '<span class="crozzo-perfil-card__icon">' +
          (m.icon || '📦') +
          '</span>' +
          '<strong>' +
          esc(m.label) +
          '</strong>' +
          '<span class="form-hint">' +
          esc(m.desc) +
          '</span>' +
          (m.tamano ? '<span class="crozzo-perfil-card__tag">' + esc(m.tamano) + '</span>' : '') +
          '</button>'
        );
      })
      .join('');
    global.showModal(
      '📦 Perfiles operativos',
      '<p class="form-hint">Cada perfil define módulos visibles y menú por rol (caja, mesero, cocina, inventario, admin).</p>' +
        '<div class="crozzo-perfil-grid">' +
        cards +
        '</div>' +
        '<div class="btn-group" style="justify-content:flex-end;margin-top:14px;">' +
        '<button type="button" class="btn btn-outline" onclick="closeModal();navigateTo(\'gestion-perfiles-menus\')">Super Admin → Perfiles y menús</button>' +
        '<button type="button" class="btn btn-primary" onclick="closeModal()">Cerrar</button></div>'
    );
  }

  function applyPerfil(perfilId, fromModal) {
    if (typeof global.crozzoApplyPerfilEmpresa !== 'function') {
      if (typeof global.showToast === 'function') global.showToast('Recargue la aplicación (F5)', 'error');
      return;
    }
    var ok = global.crozzoApplyPerfilEmpresa(perfilId, { silent: true });
    if (!ok) {
      if (typeof global.showToast === 'function') global.showToast('No se pudo aplicar el perfil', 'error');
      return;
    }
    if (typeof global.showToast === 'function') {
      var meta = typeof global.crozzoGetPerfilOperativo === 'function' ? global.crozzoGetPerfilOperativo(perfilId) : null;
      global.showToast('Perfil «' + (meta && meta.label ? meta.label : perfilId) + '» activo', 'success');
    }
    writeStore({ perfilApplied: true, manual: { perfil_operativo: true } });
    refreshGuardConfig();
    if (fromModal && typeof global.closeModal === 'function') global.closeModal();
    refreshInicioIfActive();
    if (fromModal) setTimeout(openPerfilesModal, 200);
  }

  function applyPequenoNegocio(fromModal) {
    applyPerfil('pequeno', fromModal);
  }

  function openMarcacionTour() {
    try {
      localStorage.setItem(LS_MARCACION_TOUR, '1');
    } catch (_) {}
    if (typeof global.showModal === 'function') {
      global.showModal(
        '⏱️ Marcación — tour rápido (3 pasos)',
        '<ol class="crozzo-onb-tour">' +
          '<li><strong>Configurar admin</strong> — En Marcación → Config, defina clave admin (por defecto <code>admin2024</code>).</li>' +
          '<li><strong>Registrar empleados</strong> — Admin → Empleados: nombre, PIN de 4 dígitos, área.</li>' +
          '<li><strong>Kiosk</strong> — El personal marca entrada/salida con PIN; funciona sin login POS.</li>' +
          '</ol>' +
          '<p class="form-hint">La cola offline reintenta al reconectar si falla la red.</p>' +
          '<div class="btn-group" style="justify-content:flex-end;margin-top:14px;">' +
          '<button type="button" class="btn btn-outline" onclick="closeModal()">Cerrar</button>' +
          '<button type="button" class="btn btn-primary" onclick="closeModal();navigateTo(\'control-acceso\')">Abrir marcación</button></div>'
      );
    }
  }

  function markManual(stepId) {
    var manual = {};
    manual[stepId] = true;
    writeStore({ manual: manual });
    if (stepId === 'comanda_prueba') writeStore({ comandaPrueba: true });
    if (stepId === 'cierre_prueba') writeStore({ cierrePrueba: true });
    if (typeof global.CrozzoOperativePsyche !== 'undefined' && global.CrozzoOperativePsyche.maybeAffirm) {
      if (stepId === 'cierre_prueba') global.CrozzoOperativePsyche.maybeAffirm('cierre_prueba');
      else global.CrozzoOperativePsyche.maybeAffirm('checklist_step');
    }
    openModal();
    refreshInicioIfActive();
  }

  function markComandaPrueba() {
    writeStore({ comandaPrueba: true });
    if (typeof global.CrozzoOperativePsyche !== 'undefined' && global.CrozzoOperativePsyche.maybeAffirm) {
      global.CrozzoOperativePsyche.maybeAffirm('comanda_prueba');
    }
  }

  function incrementDupBlocked() {
    var st = readStore();
    writeStore({ dupBlocked: (st.dupBlocked || 0) + 1 });
  }

  function itemSignature(items) {
    if (!Array.isArray(items)) return '';
    return items
      .map(function (i) {
        var n = String(i.nombreVenta || i.nombre || '').toLowerCase().trim();
        var q = Number(i.cantidad) || 1;
        return n + '×' + q;
      })
      .sort()
      .join('|');
  }

  function detectDuplicateComanda(tipoServicio, referencia, items) {
    var cmds = global.comandas;
    if (!Array.isArray(cmds) || !items || !items.length) return null;
    var sig = itemSignature(items);
    if (!sig) return null;
    var now = Date.now();
    var ref = String(referencia || '').toUpperCase();
    for (var i = 0; i < cmds.length; i++) {
      var c = cmds[i];
      if (!c || c.estado === 'entregada') continue;
      if (String(c.tipoServicio || '') !== String(tipoServicio || '')) continue;
      if (String(c.referencia || '').toUpperCase() !== ref) continue;
      var created = c.lastUpdateAt || c.createdAt;
      if (!created) continue;
      var age = now - new Date(created).getTime();
      var op = getOperativoConfig();
      var winMs = op.dupWindowMs || 90000;
      var ratioMin = op.dupRatio || 0.78;
      if (age < 0 || age > winMs) continue;
      var existingSig = itemSignature(c.items);
      if (!existingSig) continue;
      var a = sig.split('|');
      var b = existingSig.split('|');
      var matches = 0;
      a.forEach(function (x) {
        if (b.indexOf(x) >= 0) matches++;
      });
      var ratio = a.length ? matches / a.length : 0;
      if (ratio >= ratioMin) {
        return { comandaId: c.id, ratio: Math.round(ratio * 100), ageSec: Math.round(age / 1000) };
      }
    }
    return null;
  }

  function detectObservacionRiesgo(items) {
    if (!Array.isArray(items) || !items.length) return [];
    var op = getOperativoConfig();
    if (op.experiencia !== 'novice') return [];
    var out = [];
    items.forEach(function (i) {
      var nom = String(i.nombreVenta || i.nombre || '').toLowerCase();
      var det = String(i.detalleConfig || '').trim();
      if (det && OBS_SENAL_OK.test(det)) return;
      if (Array.isArray(i.alergenos) && i.alergenos.length && !det) {
        out.push(i.nombreVenta || i.nombre);
        return;
      }
      if (i.alertaServicio || i.requiereNota) {
        out.push(i.nombreVenta || i.nombre);
        return;
      }
      for (var k = 0; k < OBS_RIESGO_NOMBRES.length; k++) {
        if (nom.indexOf(OBS_RIESGO_NOMBRES[k]) >= 0) {
          out.push(i.nombreVenta || i.nombre);
          break;
        }
      }
    });
    return out.filter(function (v, idx, arr) {
      return arr.indexOf(v) === idx;
    });
  }

  function guardComanda(origen, tipoServicio, referencia, items, total, proceed) {
    function finish() {
      if (global.__crozzoSkipAllComandaGuards) {
        proceed();
        return;
      }
      var riesgo = detectObservacionRiesgo(items);
      if (!riesgo.length || global.__crozzoSkipObsCheck || typeof global.showModal !== 'function') {
        proceed();
        return;
      }
      var st = readStore();
      writeStore({ obsWarnCount: (st.obsWarnCount || 0) + 1 });
      var refLabel = tipoServicio === 'mesa' ? 'Mesa ' + referencia : referencia;
      var obsBody =
        typeof global.CrozzoOperativePsyche !== 'undefined' &&
        global.CrozzoOperativePsyche.getSupportiveObsModalHtml
          ? global.CrozzoOperativePsyche.getSupportiveObsModalHtml(esc(refLabel), riesgo)
          : '<p>Ítems sensibles en <strong>' +
            esc(refLabel) +
            '</strong></p>' +
            '<div class="btn-group" style="justify-content:flex-end;margin-top:14px;">' +
            '<button type="button" class="btn btn-outline" onclick="closeModal()">Volver</button>' +
            '<button type="button" class="btn btn-warning" onclick="CrozzoOnboardingOperativo.confirmObservacionSend()">Comandar sin nota</button></div>';
      global.showModal('📝 Cuidado al cliente — observaciones', obsBody);
      global.__crozzoPendingComanda = {
        origen: origen,
        tipoServicio: tipoServicio,
        referencia: referencia,
        items: items,
        total: total,
        proceed: proceed,
      };
    }
    function checkDup() {
      if (global.__crozzoSkipDupCheck || global.__crozzoSkipAllComandaGuards) {
        finish();
        return;
      }
      var dup = detectDuplicateComanda(tipoServicio, referencia, items);
      if (!dup || typeof global.showModal !== 'function') {
        finish();
        return;
      }
      incrementDupBlocked();
      var refLabel = tipoServicio === 'mesa' ? 'Mesa ' + referencia : referencia;
      var dupBody =
        typeof global.CrozzoOperativePsyche !== 'undefined' &&
        global.CrozzoOperativePsyche.getSupportiveDupModalHtml
          ? global.CrozzoOperativePsyche.getSupportiveDupModalHtml(esc(refLabel), dup)
          : '<p>Comanda similar hace <strong>' +
            dup.ageSec +
            ' s</strong> (~' +
            dup.ratio +
            '%).</p>' +
            '<div class="btn-group" style="justify-content:flex-end;margin-top:14px;">' +
            '<button type="button" class="btn btn-outline" onclick="closeModal()">Cancelar</button>' +
            '<button type="button" class="btn btn-warning" onclick="CrozzoOnboardingOperativo.confirmDuplicateSend()">Enviar igual</button></div>';
      global.showModal('🛡️ Revisión amistosa de comanda', dupBody);
      global.__crozzoPendingComanda = {
        origen: origen,
        tipoServicio: tipoServicio,
        referencia: referencia,
        items: items,
        total: total,
        proceed: finish,
      };
    }
    checkDup();
  }

  function confirmDuplicateSend() {
    var pending = global.__crozzoPendingComanda;
    global.__crozzoPendingComanda = null;
    if (typeof global.closeModal === 'function') global.closeModal();
    if (!pending || typeof pending.proceed !== 'function') return;
    global.__crozzoSkipDupCheck = true;
    try {
      pending.proceed();
    } finally {
      global.__crozzoSkipDupCheck = false;
    }
  }

  function confirmObservacionSend() {
    var pending = global.__crozzoPendingComanda;
    global.__crozzoPendingComanda = null;
    if (typeof global.closeModal === 'function') global.closeModal();
    if (!pending || typeof pending.proceed !== 'function') return;
    global.__crozzoSkipObsCheck = true;
    try {
      pending.proceed();
    } finally {
      global.__crozzoSkipObsCheck = false;
    }
  }

  function day0WizardDone() {
    try {
      localStorage.setItem(LS_DAY0_WIZARD, '1');
    } catch (_) {}
    if (typeof global.closeModal === 'function') global.closeModal();
  }

  function day0WizardApplyAll() {
    applyPerfil('pequeno', false);
    try {
      if (global.config && typeof global.config.setOperacionModo === 'function') {
        global.config.setOperacionModo('demo');
      } else if (global.CrozzoModeManager && typeof global.CrozzoModeManager.applyOperatingMode === 'function') {
        global.CrozzoModeManager.applyOperatingMode('demo');
      }
    } catch (_) {}
    writeStore({ manual: { modo_practica: true, perfil_operativo: true }, perfilApplied: true });
    ensureTimelineStart();
    day0WizardDone();
    if (typeof global.showToast === 'function') global.showToast('Día 0: perfil Pequeño + modo DEMO activos', 'success');
    refreshInicioIfActive();
    setTimeout(openModal, 400);
  }

  function maybeDay0Wizard() {
    try {
      if (localStorage.getItem(LS_DAY0_WIZARD)) return;
      var op = getOperativoConfig();
      if (op.experiencia === 'expert' && getPerfilEmpresa() === 'grande') return;
      if (typeof global.getCurrentUser !== 'function' || !global.getCurrentUser()) return;
      var r =
        typeof global.crozzoNormalizeAppRol === 'function'
          ? global.crozzoNormalizeAppRol(global.getCurrentUser().rol)
          : '';
      var isSa = typeof global.isSuperAdminUser === 'function' && global.isSuperAdminUser();
      if (r !== 'admin' && !isSa) return;
      if (detectStep('perfil_operativo') && detectStep('modo_practica')) {
        localStorage.setItem(LS_DAY0_WIZARD, '1');
        return;
      }
      setTimeout(function () {
        if (typeof global.showModal !== 'function') return;
        var ov = document.getElementById('modalOverlay');
        if (ov && ov.classList.contains('active')) return;
        global.showModal(
          '🏁 Asistente Día 0 — Apertura',
          '<p>Simulación <strong>restaurante pequeño + personal inexperto</strong>. Configure en un clic lo mínimo para operar sin riesgo fiscal.</p>' +
            '<ol class="crozzo-onb-tour">' +
            '<li>Perfil <strong>Pequeño negocio</strong> (menú por rol)</li>' +
            '<li>Modo <strong>DEMO</strong> para capacitación</li>' +
            '<li>Checklist de apertura (30 días)</li>' +
            '</ol>' +
            '<div class="btn-group" style="flex-wrap:wrap;gap:8px;margin-top:14px;">' +
            '<button type="button" class="btn btn-primary" onclick="CrozzoOnboardingOperativo.day0WizardApplyAll()">⚡ Configurar todo (recomendado)</button>' +
            '<button type="button" class="btn btn-outline" onclick="CrozzoOnboardingOperativo.openModal();CrozzoOnboardingOperativo.day0WizardDone();">Solo checklist</button>' +
            '<button type="button" class="btn btn-outline" onclick="CrozzoOnboardingOperativo.day0WizardDone()">Omitir</button></div>'
        );
      }, 1800);
    } catch (_) {}
  }

  function patchCrearComanda() {
    if (typeof global.crearComanda !== 'function' || global.crearComanda._crozzoOnbPatched) return;
    var orig = global.crearComanda;
    global.crearComanda = function (origen, tipoServicio, referencia, items, total) {
      var args = arguments;
      var run = function () {
        orig.apply(global, args);
        markComandaPrueba();
      };
      guardComanda(origen, tipoServicio, referencia, items, total, run);
    };
    global.crearComanda._crozzoOnbPatched = true;
  }

  function patchCloseModalClearPending() {
    if (typeof global.closeModal !== 'function' || global.closeModal._crozzoOnbPendingClear) return;
    var origClose = global.closeModal;
    global.closeModal = function (options) {
      options = options || {};
      if (!options.keepPendingComanda && global.__crozzoPendingComanda) {
        global.__crozzoPendingComanda = null;
      }
      if (!options.keepNoviceArqueo && global.__crozzoNoviceArqueoProceed) {
        global.__crozzoNoviceArqueoProceed = null;
      }
      return origClose.apply(global, arguments);
    };
    global.closeModal._crozzoOnbPendingClear = true;
  }

  function patchComandarDebounce() {
    ['comandarDesdeCaja', 'confirmTabletComanda'].forEach(function (name) {
      if (typeof global[name] !== 'function' || global[name]._crozzoDebounced) return;
      var orig = global[name];
      var last = 0;
      global[name] = function () {
        var now = Date.now();
        var debounce = getOperativoConfig().debounceMs || 700;
        if (now - last < debounce) {
          if (typeof global.showToast === 'function') {
            global.showToast('Un instante — así cuidamos la cocina de duplicados', 'info');
          }
          return;
        }
        last = now;
        return orig.apply(global, arguments);
      };
      global[name]._crozzoDebounced = true;
    });
  }

  function patchNavigateShiftHint() {
    if (typeof global.navigateTo !== 'function' || global.navigateTo._crozzoShiftHint) return;
    var orig = global.navigateTo;
    global.navigateTo = function (page) {
      var op = getOperativoConfig();
      if (op.shiftTip && (page === 'cajero' || page === 'tablets')) {
        try {
          var day =
            typeof global.crozzoDaySessionEnsure === 'function' ? global.crozzoDaySessionEnsure() : null;
          var turn = typeof global.crozzoShiftLoadTurn === 'function' ? global.crozzoShiftLoadTurn() : null;
          if (day && turn && turn.cashOpen === 0 && turn.openedAt) {
            var opened = new Date(turn.openedAt).getTime();
            if (Date.now() - opened < 3600000 && typeof global.showToast === 'function') {
              global.showToast('Tip: registre la base de caja en Cierre de caja antes del servicio', 'info');
            }
          }
        } catch (_) {}
      }
      return orig.apply(global, arguments);
    };
    global.navigateTo._crozzoShiftHint = true;
  }

  function maybeAutoOpenChecklist() {
    try {
      var op = getOperativoConfig();
      if (!op.onboarding) return;
      if (isDismissed()) return;
      if (localStorage.getItem('crozzo_onboarding_auto_shown_v1')) return;
      var p = getProgress();
      if (p.pct >= 100) return;
      if (typeof global.getCurrentUser !== 'function' || !global.getCurrentUser()) return;
      var r =
        typeof global.crozzoNormalizeAppRol === 'function'
          ? global.crozzoNormalizeAppRol(global.getCurrentUser().rol)
          : '';
      if (r !== 'admin' && r !== 'caja') return;
      localStorage.setItem('crozzo_onboarding_auto_shown_v1', '1');
      setTimeout(function () {
        if (global.currentPage === 'inicio-operacion' && typeof global.showToast === 'function') {
          global.showToast('Complete el checklist de apertura en Inicio ventas', 'info');
        }
      }, 1200);
    } catch (_) {}
  }

  function refreshGuardConfig() {
    /* Guardas leen getOperativoConfig() en cada uso — nada que recachear */
    refreshInicioIfActive();
  }

  function bindPerfilChange() {
    if (global.__crozzoOnbPerfilBound) return;
    global.__crozzoOnbPerfilBound = true;
    global.addEventListener('crozzo-perfil-operativo-changed', function () {
      writeStore({ perfilApplied: true });
      refreshGuardConfig();
    });
  }

  function init() {
    ensureTimelineStart();
    recordDailySnapshotIfNeeded();
    detectStaffRotation();
    patchCrearComanda();
    patchCloseModalClearPending();
    patchComandarDebounce();
    patchNavigateShiftHint();
    bindPerfilChange();
    applyPeakNoviceMode();
    if (!global.__crozzoPeakPoll) {
      global.__crozzoPeakPoll = setInterval(applyPeakNoviceMode, 45000);
    }
    if (!global.crearComanda || !global.crearComanda._crozzoOnbPatched) {
      setTimeout(patchCrearComanda, 600);
      setTimeout(patchCrearComanda, 2500);
    }
    try {
      var pe = getPerfilEmpresa();
      if (document.body && pe) document.body.setAttribute('data-crozzo-perfil', pe);
    } catch (_) {}
    if (typeof global.crozzoOnboardingInicioHtml !== 'function') {
      global.crozzoOnboardingInicioHtml = renderInicioHtml;
    }
    maybeAutoOpenChecklist();
    maybeDay0Wizard();
  }

  var api = {
    init: init,
    renderInicioHtml: renderInicioHtml,
    openModal: openModal,
    dismissBanner: dismissBanner,
    restoreBanner: restoreBanner,
    markManual: markManual,
    getProgress: getProgress,
    getAdoptionMetrics: getAdoptionMetrics,
    applyPerfil: applyPerfil,
    applyPequenoNegocio: applyPequenoNegocio,
    openPerfilesModal: openPerfilesModal,
    openMarcacionTour: openMarcacionTour,
    detectDuplicateComanda: detectDuplicateComanda,
    confirmDuplicateSend: confirmDuplicateSend,
    confirmObservacionSend: confirmObservacionSend,
    day0WizardApplyAll: day0WizardApplyAll,
    day0WizardDone: day0WizardDone,
    getOperationalPhase: getOperationalPhase,
    getHumanFactorIndex: getHumanFactorIndex,
    getCombinedStress: getCombinedStress,
    needsNoviceArqueoConfirm: needsNoviceArqueoConfirm,
    confirmNoviceArqueo: confirmNoviceArqueo,
    proceedNoviceArqueo: proceedNoviceArqueo,
    applyPeakNoviceMode: applyPeakNoviceMode,
    renderHumanStressPanel: renderHumanStressPanel,
    exportMetricsCsv: exportMetricsCsv,
    recordDailySnapshotIfNeeded: recordDailySnapshotIfNeeded,
  };

  global.CrozzoOnboardingOperativo = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(init, 0);
    });
  } else {
    setTimeout(init, 0);
  }
})(typeof window !== 'undefined' ? window : globalThis);
