/**
 * Diagnóstico y auto-reparación de la comunicación en tiempo real.
 * Cubre los dos canales: comandas a cocina (tabla `comandas`) y la cuenta de
 * mesa que cobra caja (runtime: `crozzo_sede_runtime` / `crozzo_mesa_runtime`).
 *
 * Detecta el punto exacto del corte (sede divergente, nube caída, tabla
 * ausente, RLS, impresión mal configurada) y repara lo común sin tocar el
 * flujo que ya funciona.
 *
 * Abrir el panel: Ctrl+Alt+D · window.crozzoAbrirDiagnostico() · URL #diagnostico
 */
(function (global) {
  'use strict';

  var doc = global.document;
  var OVERLAY_ID = 'crozzo-diag-comunicacion';

  function safe(fn, def) {
    try {
      return fn();
    } catch (_) {
      return def;
    }
  }

  function md() {
    return safe(function () {
      return typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
    }, {});
  }
  function sb() {
    return global.__SUPABASE || null;
  }
  function onlineReady() {
    return safe(function () {
      return (
        typeof global.crozzoOnlineConfigReady === 'function' &&
        global.crozzoOnlineConfigReady() &&
        !!sb()
      );
    }, false);
  }
  function tier() {
    return String(global.__CROZZO_TIER_LAST || 'offline');
  }
  function bizId() {
    return String(md().businessId || 'default').trim() || 'default';
  }
  function locId() {
    var l = String(md().locationId || 'default').trim() || 'default';
    if ((!l || l === 'default') && typeof global.crozzoEnsureSedeLocationId === 'function') {
      l = String(safe(global.crozzoEnsureSedeLocationId, '') || '').trim() || l;
    }
    return l;
  }
  function canonicalSede() {
    return safe(function () {
      return typeof global.crozzoCanonicalLocationFromBusiness === 'function'
        ? String(global.crozzoCanonicalLocationFromBusiness(bizId()) || '')
        : '';
    }, '');
  }
  function deviceId() {
    return safe(function () {
      return String(
        (typeof global.ensureCrozzoDeviceId === 'function' && global.ensureCrozzoDeviceId()) ||
          md().deviceId ||
          global.localStorage.getItem('crozzo_device_id') ||
          ''
      ).trim();
    }, '');
  }
  function role() {
    return md().role === 'B' ? 'B' : 'A';
  }

  function classifyDbError(err) {
    var m = String((err && err.message) || err || '');
    if (/relation|does not exist|404|PGRST205|schema cache/i.test(m)) return { state: 'missing', msg: m };
    if (/permission|rls|denied|401|403|jwt|forbidden/i.test(m)) return { state: 'rls', msg: m };
    return { state: 'error', msg: m };
  }

  async function probeTable(table, filters) {
    var client = sb();
    if (!client) return { state: 'no-cloud' };
    try {
      var q = client.from(table).select('*', { count: 'exact', head: true });
      (filters || []).forEach(function (f) {
        if (f && f.col && f.val && f.val !== 'default') q = q.eq(f.col, f.val);
      });
      var res = await q;
      if (res.error) return classifyDbError(res.error);
      return { state: 'ok', count: res.count != null ? res.count : null };
    } catch (e) {
      return classifyDbError(e);
    }
  }

  function row(id, label, status, detail, hint) {
    return { id: id, label: label, status: status, detail: detail || '', hint: hint || '' };
  }

  function printState() {
    var isTauri = !!global.__CROZZO_IS_TAURI__ || safe(function () {
      return typeof global.crozzoIsTauriPrint === 'function' && global.crozzoIsTauriPrint();
    }, false);
    var cfg = safe(function () {
      return typeof global.getComandasConfig === 'function' ? global.getComandasConfig() : {};
    }, {});
    var autoPrint = cfg && cfg.autoPrint !== false;
    var pantalla = safe(function () {
      return typeof global.crozzoGetDevicePantallaId === 'function'
        ? String(global.crozzoGetDevicePantallaId() || '').trim()
        : '';
    }, '');
    var areas = (cfg && cfg.areas) || [];
    var areasConImpresora = areas.filter(function (a) {
      return safe(function () {
        return (
          typeof global.crozzoComandaAreaEffectivePrinter === 'function' &&
          !!global.crozzoComandaAreaEffectivePrinter(a)
        );
      }, false);
    });
    var canStation = safe(function () {
      return typeof global.crozzoCanStationPrintComandas === 'function'
        ? global.crozzoCanStationPrintComandas()
        : isTauri;
    }, isTauri);
    return {
      isTauri: isTauri,
      autoPrint: autoPrint,
      pantalla: pantalla,
      areas: areas.length,
      areasConImpresora: areasConImpresora.length,
      canStation: canStation,
    };
  }

  async function run() {
    var rows = [];
    var biz = bizId();
    var loc = locId();
    var can = canonicalSede();
    var dev = deviceId();

    // 1. Identidad / sede
    if (biz === 'default' || !biz) {
      rows.push(
        row(
          'identidad',
          'Negocio y sede',
          'fail',
          'Este equipo no tiene Negocio configurado (businessId vacío).',
          'Empareje el equipo o configure el negocio en Configuración → Conexiones. Sin negocio, cada equipo queda aislado.'
        )
      );
    } else if (can && loc !== can) {
      rows.push(
        row(
          'identidad',
          'Negocio y sede',
          'fail',
          'La sede de este equipo (' + loc + ') NO coincide con la sede del negocio (' + can + '). Tablet y caja están escribiendo en sedes distintas y no se ven.',
          'Pulse "Reparar automáticamente": unifica la sede a la del negocio y reinicia la sincronización.'
        )
      );
    } else {
      rows.push(row('identidad', 'Negocio y sede', 'ok', 'Negocio ' + biz + ' · sede ' + loc + ' · rol ' + role() + ' · equipo ' + dev));
    }

    // 2. Nube conectada
    if (!onlineReady()) {
      rows.push(
        row(
          'nube',
          'Conexión a la nube',
          tier() === 'offline' ? 'warn' : 'fail',
          'Cliente Supabase no listo (tier=' + tier() + '). En modo offline la mesa solo viaja por red local (LAN/Bluetooth).',
          'Verifique internet y las credenciales de Supabase en Configuración → Conexiones.'
        )
      );
    } else {
      rows.push(row('nube', 'Conexión a la nube', 'ok', 'Conectado a la nube (tier=' + tier() + ').'));
    }

    // 3. Tabla de mesas (lo que cobra caja)
    if (onlineReady()) {
      var sede = await probeTable('crozzo_sede_runtime', [{ col: 'location_id', val: loc }]);
      var mesa = await probeTable('crozzo_mesa_runtime', [{ col: 'location_id', val: loc }]);
      var best = mesa.state === 'ok' ? mesa : sede.state === 'ok' ? sede : mesa.state !== 'missing' ? mesa : sede;
      if (best.state === 'ok') {
        rows.push(
          row(
            'runtime',
            'Mesas / cuenta de caja (nube)',
            'ok',
            'Tabla de mesas accesible. Filas de esta sede: ' + (best.count != null ? best.count : '?') + '.'
          )
        );
      } else if (best.state === 'missing') {
        rows.push(
          row(
            'runtime',
            'Mesas / cuenta de caja (nube)',
            'fail',
            'La tabla de mesas no existe en Supabase (crozzo_sede_runtime / crozzo_mesa_runtime). Por eso caja no carga los productos de la mesa.',
            'En la app abra Super Admin → Nube → panel de SQL y ejecute en Supabase el script OBLIGATORIO "10. Runtime sede (mesas en vivo)". Luego active Realtime en esa tabla.'
          )
        );
      } else if (best.state === 'rls') {
        rows.push(
          row(
            'runtime',
            'Mesas / cuenta de caja (nube)',
            'fail',
            'Supabase rechaza por permisos/RLS la tabla de mesas: ' + (best.msg || ''),
            'Revise las políticas RLS de crozzo_sede_runtime/crozzo_mesa_runtime en Supabase para permitir lectura/escritura del negocio.'
          )
        );
      } else {
        rows.push(row('runtime', 'Mesas / cuenta de caja (nube)', 'warn', 'No se pudo verificar la tabla de mesas: ' + (best.msg || 'error transitorio') + '.'));
      }

      // 4. Tabla de comandas (cocina)
      var com = await probeTable('comandas', [{ col: 'business_id', val: biz }, { col: 'location_id', val: loc }]);
      if (com.state === 'ok') {
        rows.push(row('comandas', 'Comandas a cocina (nube)', 'ok', 'Tabla de comandas accesible. Comandas activas de esta sede: ' + (com.count != null ? com.count : '?') + '.'));
      } else if (com.state === 'missing') {
        rows.push(row('comandas', 'Comandas a cocina (nube)', 'fail', 'La tabla `comandas` no existe en Supabase.', 'En Super Admin → Nube → panel de SQL ejecute el script de comandas y active Realtime en la tabla `comandas`.'));
      } else if (com.state === 'rls') {
        rows.push(row('comandas', 'Comandas a cocina (nube)', 'fail', 'Supabase rechaza por permisos/RLS la tabla de comandas: ' + (com.msg || ''), 'Revise las políticas RLS de la tabla `comandas`.'));
      } else {
        rows.push(row('comandas', 'Comandas a cocina (nube)', 'warn', 'No se pudo verificar la tabla de comandas: ' + (com.msg || 'error transitorio') + '.'));
      }

      // 4b. Escritura real (RLS puede permitir leer pero bloquear guardar)
      if (typeof global.crozzoPushPosRuntimeCloudNow === 'function' && best.state === 'ok') {
        var wrote = false;
        try {
          wrote = await global.crozzoPushPosRuntimeCloudNow();
        } catch (_) {}
        if (wrote) {
          rows.push(row('escritura', 'Guardado en la nube (escritura)', 'ok', 'Este equipo SÍ puede guardar la mesa/cuenta en la nube.'));
        } else {
          rows.push(
            row(
              'escritura',
              'Guardado en la nube (escritura)',
              'fail',
              'Este equipo puede LEER pero NO logró GUARDAR en la nube. Por eso lo que se comanda no llega a caja.',
              'Casi siempre es RLS de escritura: ejecute el script "10. Runtime sede" (incluye políticas de escritura) y verifique que la sede coincide en todos los equipos.'
            )
          );
        }
      }
    }

    // 4c. Modo de escritura de mesas (sede = destructivo entre equipos)
    var modeSt = safe(function () {
      return typeof global.crozzoRuntimeRealtimeStatus === 'function' ? global.crozzoRuntimeRealtimeStatus() : null;
    }, null) || {};
    if (onlineReady()) {
      if (modeSt.mode === 'mesa') {
        rows.push(row('modo-mesas', 'Modo de mesas (escritura)', 'ok', 'Por-mesa: cada mesa es un registro independiente. Comandar desde varios equipos NO se pisa.'));
      } else if (modeSt.mode === 'sede') {
        rows.push(
          row(
            'modo-mesas',
            'Modo de mesas (escritura)',
            'fail',
            'Modo SEDE (un solo registro para toda la sede): el último equipo que guarda PISA lo de los demás. Por eso al comandar desde tablet, caja no ve los items (y viceversa) y no puedes cobrar. Causa: la tabla crozzo_mesa_runtime no acepta escritura (RLS/401) o no existe.',
            'Ejecute el script "9. REPARAR comunicación en vivo" (Super Admin → Nube → SQL): crea crozzo_mesa_runtime con permisos y Realtime, lo que activa el modo por-mesa NO destructivo. Luego pulse "Reparar automáticamente".'
          )
        );
      } else {
        rows.push(row('modo-mesas', 'Modo de mesas (escritura)', 'warn', 'Modo de mesas aún sin determinar (' + (modeSt.mode || '?') + '). Si persiste, ejecute el script "9. REPARAR comunicación en vivo".'));
      }
    }

    // 5. Tiempo real P0 (canal Realtime instantáneo: mesas + comandas)
    var rtRun = safe(function () {
      return typeof global.crozzoRuntimeRealtimeStatus === 'function' ? global.crozzoRuntimeRealtimeStatus() : null;
    }, null) || {};
    var rtCom = safe(function () {
      return typeof global.crozzoComandaRealtimeStatus === 'function' ? global.crozzoComandaRealtimeStatus() : null;
    }, null) || {};
    var ageTxt = function (ms) {
      if (ms == null) return 'sin eventos aún';
      var s = Math.round(ms / 1000);
      return 'último evento hace ' + (s < 60 ? s + 's' : Math.round(s / 60) + 'min');
    };
    var runLive = !!rtRun.live;
    var comLive = !!rtCom.live;
    var mesaTxt = runLive
      ? 'EN VIVO (' + ageTxt(rtRun.lastEventAgoMs) + ', modo ' + (rtRun.mode || '?') + ')'
      : rtRun.hasChannel
      ? 'canal abierto pero NO confirmado (solo respaldo)'
      : 'sin canal (solo respaldo cada ~2.5s)';
    var comTxt = comLive
      ? 'EN VIVO (' + ageTxt(rtCom.lastEventAgoMs) + ')'
      : rtCom.hasChannel
      ? 'canal abierto pero NO confirmado (solo respaldo)'
      : 'sin canal (solo respaldo cada ~4s)';
    var bothLive = runLive && comLive;
    var pg = safe(function () {
      return global.CrozzoPageCloudWatch && global.CrozzoPageCloudWatch.getActivePage
        ? global.CrozzoPageCloudWatch.getActivePage()
        : '';
    }, '');
    var pgPri = safe(function () {
      return global.CrozzoCloudSyncPriorities && pg
        ? global.CrozzoCloudSyncPriorities.priorityLabel(global.CrozzoCloudSyncPriorities.getPagePriority(pg))
        : '';
    }, '');
    rows.push(
      row(
        'sync',
        'Tiempo real P0 (instantáneo)',
        bothLive ? 'ok' : onlineReady() ? 'fail' : 'warn',
        'Mesas→caja: ' + mesaTxt + ' · Comandas→cocina: ' + comTxt + '.' +
          (pg ? ' Pantalla actual: ' + pg + (pgPri ? ' [' + pgPri + ']' : '') + '.' : ''),
        bothLive
          ? ''
          : 'Si NO está EN VIVO, el dato llega por respaldo lento (se siente "no en tiempo real"). Causa típica: Realtime no habilitado en la tabla en Supabase. Ejecute el script "9. REPARAR comunicación en vivo" (Super Admin → Nube → SQL) que habilita Realtime, y pulse "Reparar automáticamente".'
      )
    );

    // 5a-bis. Pulso operativo (segunda vía de tiempo real, independiente de la réplica).
    var pulse = safe(function () {
      return global.CrozzoCloudOpsPulse && typeof global.CrozzoCloudOpsPulse.status === 'function'
        ? global.CrozzoCloudOpsPulse.status()
        : null;
    }, null);
    if (onlineReady() && pulse) {
      rows.push(
        row(
          'pulso',
          'Pulso operativo (2ª vía tiempo real)',
          pulse.live ? 'ok' : 'warn',
          pulse.live
            ? 'Canal de pulso EN VIVO: cuando un equipo guarda, los demás bajan al instante aunque la réplica de la tabla se atrase.'
            : 'Canal de pulso aún no confirmado. Es un refuerzo; el Realtime y el respaldo siguen cubriendo. Se reabre solo al recuperar red.'
        )
      );
    }

    // 5b. Respaldo de entrega (outbox): comandas que aún no confirman en la nube.
    var ob = safe(function () {
      return typeof global.crozzoComandaOutboxStatus === 'function' ? global.crozzoComandaOutboxStatus() : null;
    }, null) || { pending: 0, entries: [] };
    if (!ob.pending) {
      rows.push(
        row(
          'respaldo',
          'Respaldo de entrega (outbox)',
          'ok',
          'Sin comandas pendientes: todo lo enviado quedó confirmado en la nube. Si un push falla, el outbox reintenta solo hasta confirmar.'
        )
      );
    } else {
      var maxAge = 0;
      (ob.entries || []).forEach(function (e) { if (e.ageMs > maxAge) maxAge = e.ageMs; });
      var ageS = Math.round(maxAge / 1000);
      rows.push(
        row(
          'respaldo',
          'Respaldo de entrega (outbox)',
          maxAge > 60000 ? 'warn' : 'ok',
          ob.pending + ' comanda(s) reintentando entrega (la más antigua hace ' + (ageS < 60 ? ageS + 's' : Math.round(ageS / 60) + 'min') + '). El outbox sigue intentando hasta confirmar; no se pierden.',
          maxAge > 60000
            ? 'Llevan rato sin confirmar: revise conexión a internet y que la tabla `comandas` acepte escritura (RLS). Al recuperar red se entregan solas.'
            : ''
        )
      );
    }

    // 6. Impresión
    var ps = printState();
    if (!ps.isTauri) {
      rows.push(row('impresion', 'Impresión de comandas', 'warn', 'Este equipo no es estación con impresora (no es Tauri/PC). La impresión la hace el equipo de cocina/caja.'));
    } else if (ps.areasConImpresora === 0) {
      rows.push(
        row(
          'impresion',
          'Impresión de comandas',
          'fail',
          'No hay ninguna área con impresora asignada (' + ps.areas + ' áreas configuradas). Por eso no imprime.',
          'En Configuración → Comandas, asigne una impresora a cada área (Cocina, Barra, etc.).'
        )
      );
    } else if (!ps.autoPrint) {
      rows.push(
        row(
          'impresion',
          'Impresión de comandas',
          'fail',
          'La impresión automática está APAGADA. ' + ps.areasConImpresora + ' área(s) con impresora.',
          'Active "Impresión automática" en Configuración → Comandas.'
        )
      );
    } else if (ps.pantalla && !ps.canStation) {
      rows.push(
        row(
          'impresion',
          'Impresión de comandas',
          'warn',
          'Este equipo tiene una pantalla de área fija (' + ps.pantalla + '); solo imprime/recibe esa área.',
          'Si esta caja debe imprimir todas las áreas, déjela en "Sin pantalla fija (Todas)".'
        )
      );
    } else {
      rows.push(row('impresion', 'Impresión de comandas', 'ok', 'Impresión automática activa · ' + ps.areasConImpresora + ' área(s) con impresora' + (ps.pantalla ? ' · pantalla ' + ps.pantalla : ' · recibe todas las áreas') + '.'));
    }

    var fails = rows.filter(function (r) {
      return r.status === 'fail';
    });
    var verdict = fails.length
      ? 'Se encontraron ' + fails.length + ' problema(s) que rompen la comunicación. Revise los puntos en rojo.'
      : 'Comunicación en buen estado en este equipo. Si el problema persiste, ejecute este diagnóstico también en la tablet y en cocina.';
    return { generatedAt: new Date().toISOString(), rows: rows, ok: !fails.length, verdict: verdict };
  }

  async function repair() {
    var steps = [];
    var can = canonicalSede();
    var loc = locId();
    if (can && loc !== can && typeof global.crozzoForceSedeCanonical === 'function') {
      var nv = safe(global.crozzoForceSedeCanonical, '');
      if (nv) steps.push('Sede unificada a ' + nv + ' (igual que el negocio).');
    } else if (typeof global.crozzoEnsureSedeLocationId === 'function') {
      safe(global.crozzoEnsureSedeLocationId, '');
    }
    if (typeof global.crozzoResetRuntimeSyncDedup === 'function') safe(global.crozzoResetRuntimeSyncDedup, null);
    if (typeof global.crozzoEnsureCloudSyncActive === 'function') {
      try {
        await global.crozzoEnsureCloudSyncActive({ force: true, resetTableMissing: true, source: 'diag_repair' });
        steps.push('Sincronización en la nube reiniciada.');
      } catch (_) {}
    }
    if (typeof global.crozzoPushPosRuntimeCloudNow === 'function') {
      try {
        await global.crozzoPushPosRuntimeCloudNow();
      } catch (_) {}
    }
    if (typeof global.crozzoPullPosRuntimeCloud === 'function') {
      try {
        await global.crozzoPullPosRuntimeCloud({ force: true, quiet: true });
        steps.push('Cuentas de mesa re-sincronizadas.');
      } catch (_) {}
    }
    if (typeof global.crozzoStartComandasCloudSync === 'function') {
      try {
        global.crozzoStartComandasCloudSync();
      } catch (_) {}
    }
    if (typeof global.crozzoPullComandasFromCloud === 'function') {
      try {
        await global.crozzoPullComandasFromCloud({ skipPrint: true, silent: true });
        steps.push('Comandas re-sincronizadas.');
      } catch (_) {}
    }
    if (!steps.length) steps.push('No había nada automático que reparar; revise los puntos en rojo del diagnóstico.');
    return steps;
  }

  /** Auto-reparación silenciosa al arrancar: unifica sede si quedó divergente. */
  function bootSelfHeal() {
    try {
      var can = canonicalSede();
      var loc = String(md().locationId || '').trim();
      if (can && loc && loc !== 'default' && loc !== can && typeof global.crozzoForceSedeCanonical === 'function') {
        var nv = safe(global.crozzoForceSedeCanonical, '');
        if (nv && typeof global.crozzoEnsureCloudSyncActive === 'function') {
          global.crozzoEnsureCloudSyncActive({ force: true, resetTableMissing: true, source: 'diag_selfheal' }).catch(function () {});
        }
        try {
          console.warn('[diag] Sede divergente auto-corregida:', loc, '→', nv);
        } catch (_) {}
      }
    } catch (_) {}
  }

  // ---------------- UI ----------------
  var COLORS = { ok: '#16a34a', warn: '#d97706', fail: '#dc2626' };
  var ICON = { ok: '✓', warn: '!', fail: '✕' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function reportHtml(rep) {
    var items = rep.rows
      .map(function (r) {
        return (
          '<div style="display:flex;gap:10px;padding:12px 14px;border-bottom:1px solid #eee;align-items:flex-start">' +
          '<span style="flex:0 0 22px;height:22px;border-radius:50%;background:' +
          COLORS[r.status] +
          ';color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;font-size:13px">' +
          ICON[r.status] +
          '</span>' +
          '<div style="flex:1">' +
          '<div style="font-weight:700;color:#111">' + esc(r.label) + '</div>' +
          '<div style="color:#333;font-size:13px;margin-top:2px">' + esc(r.detail) + '</div>' +
          (r.hint ? '<div style="color:#0369a1;font-size:12px;margin-top:4px">→ ' + esc(r.hint) + '</div>' : '') +
          '</div>' +
          '</div>'
        );
      })
      .join('');
    return (
      '<div style="padding:14px 16px;background:' +
      (rep.ok ? '#ecfdf5' : '#fef2f2') +
      ';border-bottom:1px solid #eee;font-weight:600;color:' +
      (rep.ok ? '#065f46' : '#7f1d1d') +
      '">' +
      esc(rep.verdict) +
      '</div>' +
      items
    );
  }

  function ensureOverlay() {
    if (!doc) return null;
    var el = doc.getElementById(OVERLAY_ID);
    if (el) return el;
    el = doc.createElement('div');
    el.id = OVERLAY_ID;
    el.style.cssText =
      'position:fixed;inset:0;z-index:2147483600;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;font-family:Inter,system-ui,sans-serif';
    el.innerHTML =
      '<div style="background:#fff;width:min(640px,94vw);max-height:88vh;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.35)">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:#1e3a8a;color:#fff">' +
      '<strong>Diagnóstico de comunicación en tiempo real</strong>' +
      '<button data-diag-close style="background:transparent;border:0;color:#fff;font-size:20px;cursor:pointer;line-height:1">×</button>' +
      '</div>' +
      '<div data-diag-body style="overflow:auto;flex:1"><div style="padding:24px;text-align:center;color:#555">Analizando…</div></div>' +
      '<div style="display:flex;gap:8px;padding:12px 16px;border-top:1px solid #eee;flex-wrap:wrap;justify-content:flex-end">' +
      '<button data-diag-copy style="padding:9px 14px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;cursor:pointer">Copiar reporte</button>' +
      '<button data-diag-retry style="padding:9px 14px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;cursor:pointer">Reintentar</button>' +
      '<button data-diag-repair style="padding:9px 16px;border:0;background:#16a34a;color:#fff;border-radius:8px;cursor:pointer;font-weight:700">Reparar automáticamente</button>' +
      '</div>' +
      '</div>';
    doc.body.appendChild(el);
    el.addEventListener('click', function (e) {
      if (e.target === el || e.target.hasAttribute('data-diag-close')) close();
    });
    el.querySelector('[data-diag-retry]').addEventListener('click', refresh);
    el.querySelector('[data-diag-copy]').addEventListener('click', function () {
      try {
        global.navigator.clipboard.writeText(JSON.stringify(global.__crozzoLastDiag || {}, null, 2));
        this.textContent = 'Copiado ✓';
        var b = this;
        global.setTimeout(function () {
          b.textContent = 'Copiar reporte';
        }, 1500);
      } catch (_) {}
    });
    el.querySelector('[data-diag-repair]').addEventListener('click', async function () {
      var b = this;
      b.textContent = 'Reparando…';
      b.disabled = true;
      var steps = await repair();
      b.disabled = false;
      b.textContent = 'Reparar automáticamente';
      try {
        if (typeof global.showToast === 'function') global.showToast('🔧 ' + steps.join(' '), 'info');
      } catch (_) {}
      await refresh();
    });
    return el;
  }

  async function refresh() {
    var el = ensureOverlay();
    if (!el) return;
    var body = el.querySelector('[data-diag-body]');
    body.innerHTML = '<div style="padding:24px;text-align:center;color:#555">Analizando…</div>';
    var rep = await run();
    global.__crozzoLastDiag = rep;
    body.innerHTML = reportHtml(rep);
  }

  function open() {
    ensureOverlay();
    refresh();
  }
  function close() {
    var el = doc && doc.getElementById(OVERLAY_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  global.crozzoDiagComunicacion = run;
  global.crozzoRepararComunicacion = repair;
  global.crozzoAbrirDiagnostico = open;

  if (doc) {
    doc.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.altKey && String(e.key || '').toLowerCase() === 'd') {
        e.preventDefault();
        open();
      }
    });
    // Gesto táctil para tablets/APK sin teclado: 5 toques rápidos en la esquina superior izquierda.
    var tapCount = 0;
    var tapTimer = null;
    doc.addEventListener(
      'pointerdown',
      function (e) {
        if (e.clientX > 70 || e.clientY > 70) {
          tapCount = 0;
          return;
        }
        tapCount++;
        if (tapTimer) global.clearTimeout(tapTimer);
        tapTimer = global.setTimeout(function () {
          tapCount = 0;
        }, 2000);
        if (tapCount >= 5) {
          tapCount = 0;
          open();
        }
      },
      true
    );
    var onReady = function () {
      try {
        if (String(global.location && global.location.hash) === '#diagnostico') open();
      } catch (_) {}
      global.setTimeout(bootSelfHeal, 4000);
    };
    if (doc.readyState === 'complete' || doc.readyState === 'interactive') onReady();
    else doc.addEventListener('DOMContentLoaded', onReady);
  }
})(typeof window !== 'undefined' ? window : globalThis);
