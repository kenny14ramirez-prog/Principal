/**
 * Crozzo — Federación Opción B: bodegas, remisiones, préstamos, sync mínimo entre Supabase.
 */
(function (global) {
  'use strict';

  var LS = 'crozzo_federacion_v1';
  var LS_FED_CFG = 'crozzo_federacion_config_v1';

  var TIPOS_DOC = [
    { id: 'transferencia', label: 'Transferencia / remisión' },
    { id: 'prestamo', label: 'Préstamo entre sedes' },
    { id: 'devolucion', label: 'Devolución' },
    { id: 'produccion', label: 'Salida de producción' },
  ];

  var TIPOS_BODEGA = [
    { id: 'central', label: 'Bodega central' },
    { id: 'frios', label: 'Fríos / cámara' },
    { id: 'area', label: 'Estación de área' },
    { id: 'produccion', label: 'Centro de producción' },
    { id: 'transito', label: 'En tránsito' },
  ];

  function uid(prefix) {
    return (prefix || 'fed') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function uuid() {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function esc(s) {
    if (global.CrozzoIntApi && global.CrozzoIntApi.esc) return global.CrozzoIntApi.esc(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(m, t) {
    if (typeof global.showToast === 'function') global.showToast(m, t || 'info');
  }

  function businessId() {
    try {
      if (typeof global.getMultiDeviceConfig === 'function') {
        var md = global.getMultiDeviceConfig();
        if (md && md.businessId) return String(md.businessId).trim();
      }
    } catch (_) {}
    try {
      return (localStorage.getItem('crozzo_business_id') || 'default').trim() || 'default';
    } catch (_) {
      return 'default';
    }
  }

  function emptyStore() {
    return {
      version: 1,
      negocio: {
        id: businessId(),
        nombre: '',
        claveApi: '',
      },
      bodegas: [],
      socios: [],
      remisiones: [],
      outbox: [],
      inbox: [],
    };
  }

  function loadStore() {
    try {
      var raw = JSON.parse(localStorage.getItem(LS) || '{}');
      if (!raw || raw.version !== 1) return emptyStore();
      if (!raw.negocio) raw.negocio = emptyStore().negocio;
      if (!raw.bodegas) raw.bodegas = [];
      if (!raw.socios) raw.socios = [];
      if (!raw.remisiones) raw.remisiones = [];
      if (!raw.outbox) raw.outbox = [];
      if (!raw.inbox) raw.inbox = [];
      raw.negocio.id = raw.negocio.id || businessId();
      return raw;
    } catch (_) {
      return emptyStore();
    }
  }

  function saveStore(st) {
    try {
      localStorage.setItem(LS, JSON.stringify(st));
    } catch (_) {}
  }

  function loadFedConfig() {
    try {
      var raw = JSON.parse(localStorage.getItem(LS_FED_CFG) || '{}');
      return {
        syncIntervalMin: Number(raw.syncIntervalMin) > 0 ? Number(raw.syncIntervalMin) : 5,
        autoSync: raw.autoSync !== false,
        hubUrl: String(raw.hubUrl || '').trim(),
        hubAnonKey: String(raw.hubAnonKey || '').trim(),
        sqlDone: !!raw.sqlDone,
        torreActiva: !!raw.torreActiva,
      };
    } catch (_) {
      return { syncIntervalMin: 5, autoSync: true, hubUrl: '', hubAnonKey: '', sqlDone: false, torreActiva: false };
    }
  }

  function saveFedConfig(cfg) {
    try {
      localStorage.setItem(LS_FED_CFG, JSON.stringify(cfg || {}));
    } catch (_) {}
  }

  function ensureDefaultBodegas(st) {
    if (st.bodegas.length) return st;
    var bid = st.negocio.id || businessId();
    st.bodegas = [
      { id: 'bod_principal', businessId: bid, nombre: 'Bodega principal', tipo: 'central', activo: true, linkComandaArea: '' },
      { id: 'bod_transito', businessId: bid, nombre: 'En tránsito', tipo: 'transito', activo: true, linkComandaArea: '' },
    ];
    return st;
  }

  function listBodegas() {
    var st = ensureDefaultBodegas(loadStore());
    saveStore(st);
    return st.bodegas.filter(function (b) {
      return b.activo !== false;
    });
  }

  function upsertBodega(data) {
    var st = loadStore();
    var row = {
      id: data.id || uid('bod'),
      businessId: st.negocio.id,
      nombre: String(data.nombre || '').trim() || 'Bodega',
      tipo: data.tipo || 'area',
      linkComandaArea: String(data.linkComandaArea || '').trim(),
      activo: data.activo !== false,
    };
    var idx = st.bodegas.findIndex(function (b) {
      return b.id === row.id;
    });
    if (idx >= 0) st.bodegas[idx] = Object.assign({}, st.bodegas[idx], row);
    else st.bodegas.push(row);
    saveStore(st);
    return row;
  }

  function listSocios() {
    return loadStore().socios.filter(function (s) {
      return s.activo !== false;
    });
  }

  function upsertSocio(data) {
    var st = loadStore();
    var row = {
      id: data.id || uid('soc'),
      partnerNegocioId: String(data.partnerNegocioId || '').trim(),
      partnerNombre: String(data.partnerNombre || '').trim(),
      partnerSupabaseUrl: String(data.partnerSupabaseUrl || '').trim().replace(/\/$/, ''),
      partnerAnonKey: String(data.partnerAnonKey || '').trim(),
      puedeEnviar: data.puedeEnviar !== false,
      puedeRecibir: data.puedeRecibir !== false,
      bodegaDefaultId: String(data.bodegaDefaultId || '').trim(),
      activo: data.activo !== false,
    };
    if (!row.partnerNegocioId) return null;
    var idx = st.socios.findIndex(function (s) {
      return s.id === row.id || s.partnerNegocioId === row.partnerNegocioId;
    });
    if (idx >= 0) st.socios[idx] = Object.assign({}, st.socios[idx], row);
    else st.socios.push(row);
    saveStore(st);
    return row;
  }

  function deleteSocio(id) {
    var st = loadStore();
    st.socios = st.socios.filter(function (s) {
      return s.id !== id;
    });
    saveStore(st);
  }

  function bodegaLabel(id) {
    var b = listBodegas().find(function (x) {
      return x.id === id;
    });
    return b ? b.nombre : id || '—';
  }

  function socioLabel(id) {
    var s = loadStore().socios.find(function (x) {
      return x.id === id || x.partnerNegocioId === id;
    });
    return s ? s.partnerNombre || s.partnerNegocioId : id || '—';
  }

  function listRemisiones(filter) {
    filter = filter || {};
    var st = loadStore();
    var rows = st.remisiones.slice();
    if (filter.estado) rows = rows.filter(function (r) { return r.estado === filter.estado; });
    if (filter.tipo) rows = rows.filter(function (r) { return r.tipo === filter.tipo; });
    /* direccion saliente: el store local solo tiene remisiones de este equipo */
    rows.sort(function (a, b) {
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
    return rows.slice(0, filter.limit || 200);
  }

  function getRemision(id) {
    return loadStore().remisiones.find(function (r) {
      return r.id === id || r.remisionUuid === id;
    }) || null;
  }

  function createRemision(data) {
    var st = loadStore();
    var now = new Date().toISOString();
    var row = {
      id: uid('rem'),
      remisionUuid: uuid(),
      businessId: st.negocio.id,
      tipo: data.tipo || 'transferencia',
      estado: 'borrador',
      origenBodegaId: data.origenBodegaId || '',
      destinoBodegaId: data.destinoBodegaId || '',
      destinoNegocioId: data.destinoNegocioId || '',
      destinoNegocioNombre: data.destinoNegocioNombre || '',
      destinoSocioId: data.destinoSocioId || '',
      lineas: Array.isArray(data.lineas) ? data.lineas : [],
      notas: String(data.notas || '').trim(),
      enviadoPor: String(data.enviadoPor || '').trim(),
      recibidoPor: '',
      createdAt: now,
      enviadaAt: null,
      recibidaAt: null,
    };
    st.remisiones.unshift(row);
    saveStore(st);
    return row;
  }

  function updateRemision(id, patch) {
    var st = loadStore();
    var idx = st.remisiones.findIndex(function (r) {
      return r.id === id || r.remisionUuid === id;
    });
    if (idx < 0) return null;
    st.remisiones[idx] = Object.assign({}, st.remisiones[idx], patch || {});
    saveStore(st);
    return st.remisiones[idx];
  }

  function buildEnvelope(rem) {
    var st = loadStore();
    return {
      remision_uuid: rem.remisionUuid,
      origen_negocio_id: st.negocio.id,
      origen_negocio_nombre: st.negocio.nombre || st.negocio.id,
      tipo: rem.tipo,
      payload: {
        origen_bodega_id: rem.origenBodegaId,
        destino_bodega_id: rem.destinoBodegaId,
        lineas: rem.lineas,
        notas: rem.notas,
        enviado_por: rem.enviadoPor,
        created_at: rem.createdAt,
      },
    };
  }

  function localSupabaseCreds() {
    try {
      if (typeof global.readCrozzoSupabaseJson === 'function') {
        var sb = global.readCrozzoSupabaseJson();
        if (sb && sb.url) {
          var key =
            typeof global.crozzoSupabaseEffectiveAnonKey === 'function'
              ? global.crozzoSupabaseEffectiveAnonKey(sb)
              : sb.key || sb.anonKey || '';
          return { url: String(sb.url).replace(/\/$/, ''), key: String(key).trim() };
        }
      }
    } catch (_) {}
    var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
    var s = md.supabase || {};
    var ak =
      typeof global.crozzoSupabaseEffectiveAnonKey === 'function'
        ? global.crozzoSupabaseEffectiveAnonKey(s)
        : s.anonKey || '';
    return { url: String(s.url || '').replace(/\/$/, ''), key: String(ak).trim() };
  }

  function restPost(creds, table, body) {
    if (!creds.url || !creds.key) return Promise.resolve({ ok: false, error: 'sin_credenciales' });
    return fetch(creds.url + '/rest/v1/' + encodeURIComponent(table), {
      method: 'POST',
      headers: {
        apikey: creds.key,
        Authorization: 'Bearer ' + creds.key,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    }).then(function (res) {
      if (res.ok) return { ok: true };
      return res.text().then(function (txt) {
        return { ok: false, error: txt || 'HTTP ' + res.status };
      });
    }).catch(function (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    });
  }

  function restGet(creds, table, query) {
    if (!creds.url || !creds.key) return Promise.resolve({ ok: false, error: 'sin_credenciales', data: [] });
    var q = query || '?select=*&limit=50';
    return fetch(creds.url + '/rest/v1/' + encodeURIComponent(table) + q, {
      headers: {
        apikey: creds.key,
        Authorization: 'Bearer ' + creds.key,
        'Content-Type': 'application/json',
      },
    })
      .then(function (res) {
        if (!res.ok) return res.text().then(function (t) { return { ok: false, error: t, data: [] }; });
        return res.json().then(function (data) {
          return { ok: true, data: data };
        });
      })
      .catch(function (e) {
        return { ok: false, error: String(e && e.message ? e.message : e), data: [] };
      });
  }

  function enviarRemision(remisionId) {
    var rem = getRemision(remisionId);
    if (!rem) return Promise.resolve({ ok: false, error: 'no_encontrada' });
    if (!rem.lineas || !rem.lineas.length) return Promise.resolve({ ok: false, error: 'sin_lineas' });

    var st = loadStore();
    var socio = st.socios.find(function (s) {
      return s.id === rem.destinoSocioId || s.partnerNegocioId === rem.destinoNegocioId;
    });

    function remoteFromSocio(s) {
      return { url: s.partnerSupabaseUrl, key: s.partnerAnonKey };
    }

    var envelope = buildEnvelope(rem);
    var now = new Date().toISOString();
    var esExterna = !!(
      socio &&
      socio.partnerSupabaseUrl &&
      socio.partnerAnonKey &&
      rem.destinoSocioId &&
      socio.id === rem.destinoSocioId
    );

    if (rem.estado === 'enviada' || rem.estado === 'recibida') {
      if (esExterna) {
        return restPost(remoteFromSocio(socio), 'crozzo_federacion_entrante', {
          remision_uuid: envelope.remision_uuid,
          origen_negocio_id: envelope.origen_negocio_id,
          origen_negocio_nombre: envelope.origen_negocio_nombre,
          tipo: envelope.tipo,
          payload: envelope.payload,
          estado: 'pendiente',
        }).then(function (r) {
          return r.ok ? { ok: true, externa: true, reenvio: true } : r;
        });
      }
      return Promise.resolve({ ok: true, externa: false, skip: true, reenvio: true });
    }

    if (esExterna) {
      if (!socio.puedeEnviar) return Promise.resolve({ ok: false, error: 'socio_no_permite_envio' });
      var remote = remoteFromSocio(socio);
      if (!remote.key) return Promise.resolve({ ok: false, error: 'falta_anon_key_socio' });
      return restPost(remote, 'crozzo_federacion_entrante', {
        remision_uuid: envelope.remision_uuid,
        origen_negocio_id: envelope.origen_negocio_id,
        origen_negocio_nombre: envelope.origen_negocio_nombre,
        tipo: envelope.tipo,
        payload: envelope.payload,
        estado: 'pendiente',
      }).then(function (r) {
        if (!r.ok) {
          st.outbox.unshift({
            id: uid('ob'),
            remisionId: rem.id,
            socioId: socio.id,
            envelope: envelope,
            estado: 'error',
            intentos: 1,
            lastError: r.error,
            createdAt: now,
          });
          saveStore(st);
          return r;
        }
        updateRemision(rem.id, { estado: 'enviada', enviadaAt: now });
        aplicarSalidaOrigen(rem);
        return { ok: true, externa: true };
      });
    }

    var localTransfer = !esExterna;
    var local = localSupabaseCreds();
    var pLocal = local.url && local.key
      ? restPost(local, 'crozzo_remisiones', {
          remision_uuid: rem.remisionUuid,
          business_id: st.negocio.id,
          tipo: rem.tipo,
          estado: 'enviada',
          origen_bodega_id: rem.origenBodegaId,
          destino_bodega_id: rem.destinoBodegaId,
          destino_negocio_id: rem.destinoNegocioId || st.negocio.id,
          lineas: rem.lineas,
          notas: rem.notas,
          enviado_por: rem.enviadoPor,
          enviada_at: now,
        })
      : Promise.resolve({ ok: true, skip: true });

    return pLocal.then(function () {
      updateRemision(rem.id, { estado: 'enviada', enviadaAt: now });
      aplicarSalidaOrigen(getRemision(rem.id) || rem);
      if (localTransfer && rem.destinoBodegaId) aplicarEntradaDestino(getRemision(rem.id) || rem);
      return { ok: true, externa: false };
    });
  }

  function pullEntrantes() {
    var local = localSupabaseCreds();
    if (!local.url || !local.key) return Promise.resolve({ ok: false, count: 0 });
    var st = loadStore();
    return restGet(
      local,
      'crozzo_federacion_entrante',
      '?estado=eq.pendiente&select=*&order=created_at.desc&limit=40'
    ).then(function (r) {
      if (!r.ok) return r;
      var added = 0;
      (r.data || []).forEach(function (row) {
        if (
          st.inbox.some(function (x) {
            return x.remisionUuid === row.remision_uuid && x.origenNegocioId === row.origen_negocio_id;
          })
        )
          return;
        st.inbox.unshift({
          id: uid('in'),
          cloudId: row.id,
          remisionUuid: row.remision_uuid,
          origenNegocioId: row.origen_negocio_id,
          origenNegocioNombre: row.origen_negocio_nombre,
          tipo: row.tipo,
          payload: row.payload || {},
          estado: 'pendiente',
          createdAt: row.created_at || new Date().toISOString(),
        });
        added++;
      });
      saveStore(st);
      return { ok: true, count: added };
    });
  }

  function pullAcuses() {
    var st = loadStore();
    var local = localSupabaseCreds();
    if (!local.url || !local.key) return Promise.resolve({ ok: false, count: 0 });
    return restGet(
      local,
      'crozzo_federacion_acuse',
      '?origen_negocio_id=eq.' + encodeURIComponent(st.negocio.id) + '&select=*&order=created_at.desc&limit=40'
    ).then(function (r) {
      if (!r.ok) return r;
      var n = 0;
      (r.data || []).forEach(function (row) {
        var rem = st.remisiones.find(function (x) {
          return x.remisionUuid === row.remision_uuid;
        });
        if (rem && rem.estado === 'enviada') {
          updateRemision(rem.id, {
            estado: row.estado === 'recibida' ? 'recibida' : row.estado,
            recibidaAt: row.created_at,
          });
          n++;
        }
      });
      return { ok: true, count: n };
    });
  }

  function confirmarEntrante(inboxId, opts) {
    opts = opts || {};
    var st = loadStore();
    var row = st.inbox.find(function (x) {
      return x.id === inboxId;
    });
    if (!row) return Promise.resolve({ ok: false, error: 'no_encontrada' });
    if (row.estado !== 'pendiente') return Promise.resolve({ ok: false, error: 'ya_procesada' });

    var local = localSupabaseCreds();
    var now = new Date().toISOString();
    var estado = opts.rechazar ? 'rechazada' : opts.parcial ? 'parcial' : 'recibida';

    row.estado = estado;
    row.recibidoPor = opts.recibidoPor || '';
    row.procesadaAt = now;
    saveStore(st);

    var p1 = row.cloudId && local.url
      ? fetch(local.url + '/rest/v1/crozzo_federacion_entrante?id=eq.' + encodeURIComponent(row.cloudId), {
          method: 'PATCH',
          headers: {
            apikey: local.key,
            Authorization: 'Bearer ' + local.key,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            estado: opts.rechazar ? 'rechazada' : opts.parcial ? 'parcial' : 'recibida',
            recibido_por: opts.recibidoPor || '',
            procesada_at: now,
            acuse: { notas: opts.notas || '', lineas: opts.lineas || row.payload.lineas },
          }),
        })
      : Promise.resolve({ ok: true });

    var socio = st.socios.find(function (s) {
      return s.partnerNegocioId === row.origenNegocioId;
    });
    var p2 = Promise.resolve({ ok: true });
    if (socio && socio.partnerSupabaseUrl && socio.partnerAnonKey) {
      p2 = restPost(
        { url: socio.partnerSupabaseUrl, key: socio.partnerAnonKey },
        'crozzo_federacion_acuse',
        {
          remision_uuid: row.remisionUuid,
          destino_negocio_id: st.negocio.id,
          origen_negocio_id: row.origenNegocioId,
          estado: estado,
          acuse: { recibido_por: opts.recibidoPor, notas: opts.notas || '' },
        }
      );
    }

    return Promise.all([p1, p2]).then(function () {
      if (!opts.rechazar) aplicarEntradaEntrante(row);
      return { ok: true, estado: estado };
    });
  }

  function syncAll() {
    return pullEntrantes()
      .then(function () {
        return pullAcuses();
      })
      .then(function () {
        var st = loadStore();
        var pending = st.outbox.filter(function (o) {
          return o.estado === 'error' || o.estado === 'pendiente';
        });
        var chain = Promise.resolve();
        pending.slice(0, 10).forEach(function (ob) {
          chain = chain.then(function () {
            return enviarRemision(ob.remisionId).then(function (r) {
              if (r.ok) ob.estado = 'ok';
              else {
                ob.estado = 'error';
                ob.intentos = (ob.intentos || 0) + 1;
                ob.lastError = r.error;
              }
              saveStore(st);
            });
          });
        });
        return chain.then(function () {
          return { ok: true };
        });
      });
  }

  function saveNegocioIdentity(data) {
    var st = loadStore();
    st.negocio = Object.assign({}, st.negocio, {
      id: String(data.id || businessId()).trim() || businessId(),
      nombre: String(data.nombre || '').trim(),
      claveApi: String(data.claveApi || '').trim(),
    });
    saveStore(st);
    return st.negocio;
  }

  function getSqlFederacion() {
    if (global.CrozzoFederacionSql && global.CrozzoFederacionSql.text) return global.CrozzoFederacionSql.text;
    return '-- Ver docs/SUPABASE-SQL-FEDERACION.sql';
  }

  var BODEGA_PRINCIPAL = 'bod_principal';

  function reservorio() {
    return global.CrozzoReservorio;
  }

  function invMovEsEntrada(tipo) {
    var t = String(tipo || '').toLowerCase();
    return t.indexOf('entrada') >= 0 || t.indexOf('inicial') >= 0 || t === 'ajuste_entrada';
  }

  function invMovEsSalida(tipo) {
    var t = String(tipo || '').toLowerCase();
    return t.indexOf('salida') >= 0 || t.indexOf('merma') >= 0 || t.indexOf('consumo') >= 0 || t === 'ajuste_salida';
  }

  function listMovsInventario(limit) {
    var rv = reservorio();
    if (!rv) return [];
    if (rv.migrateLegacy) return (rv.migrateLegacy().inventarioMovimientos || []).slice(0, limit || 5000);
    if (rv.listInventarioMovimientos) return rv.listInventarioMovimientos(limit || 5000) || [];
    return [];
  }

  function movAplicaABodega(m, bodegaId) {
    bodegaId = bodegaId || BODEGA_PRINCIPAL;
    var bid = m.bodegaId || '';
    if (!bid) return bodegaId === BODEGA_PRINCIPAL;
    return bid === bodegaId;
  }

  function stockBodegaMp(mpId, bodegaId) {
    if (!mpId) return 0;
    var qty = 0;
    listMovsInventario().forEach(function (m) {
      if (String(m.productoRefId || '') !== String(mpId)) return;
      if (!movAplicaABodega(m, bodegaId)) return;
      var cant = Number(m.cantidad) || 0;
      if (invMovEsEntrada(m.tipo)) qty += cant;
      else if (invMovEsSalida(m.tipo)) qty -= cant;
    });
    return Math.round(qty * 1000) / 1000;
  }

  function remisionMovExists(refId, tipo, mpId) {
    return listMovsInventario().some(function (m) {
      return (
        m.refTipo === 'remision' &&
        String(m.refId) === String(refId) &&
        m.tipo === tipo &&
        String(m.productoRefId) === String(mpId)
      );
    });
  }

  function registrarMovRemision(opts) {
    var rv = reservorio();
    if (!rv || !rv.addInventarioMovimiento) return false;
    if (!opts || !opts.mpId || !opts.cantidad) return false;
    if (remisionMovExists(opts.refId, opts.tipo, opts.mpId)) return false;
    rv.addInventarioMovimiento({
      tipo: opts.tipo,
      refTipo: 'remision',
      refId: opts.refId,
      productoRefId: opts.mpId,
      productoRefTipo: 'materia_prima',
      productoNombre: opts.producto || opts.mpId,
      cantidad: Number(opts.cantidad) || 0,
      unidad: opts.und || 'kg',
      bodegaId: opts.bodegaId || '',
      bodegaDestinoId: opts.bodegaDestinoId || '',
      notas: opts.notas || '',
      fecha: opts.fecha || new Date().toISOString().slice(0, 10),
    });
    return true;
  }

  function aplicarSalidaOrigen(rem) {
    if (!rem || !rem.origenBodegaId || !rem.lineas || !rem.lineas.length) return 0;
    var nota =
      'Remisión ' +
      String(rem.remisionUuid || rem.id).slice(0, 8) +
      (rem.destinoNegocioNombre ? ' → ' + rem.destinoNegocioNombre : '');
    var n = 0;
    rem.lineas.forEach(function (ln) {
      if (!ln.mpId) return;
      if (
        registrarMovRemision({
          refId: rem.id,
          tipo: 'salida_remision',
          mpId: ln.mpId,
          producto: ln.producto,
          cantidad: ln.cantidad,
          und: ln.und,
          bodegaId: rem.origenBodegaId,
          bodegaDestinoId: rem.destinoBodegaId || '',
          notas: nota,
        })
      )
        n++;
    });
    return n;
  }

  function aplicarEntradaDestino(rem, destBodegaId) {
    destBodegaId = destBodegaId || rem.destinoBodegaId;
    if (!destBodegaId || !rem.lineas || !rem.lineas.length) return 0;
    var refId = rem.id || rem.remisionUuid;
    var nota =
      'Remisión ' +
      String(rem.remisionUuid || rem.id).slice(0, 8) +
      (rem.origenNegocioNombre ? ' ← ' + rem.origenNegocioNombre : '');
    var n = 0;
    rem.lineas.forEach(function (ln) {
      if (!ln.mpId) return;
      if (
        registrarMovRemision({
          refId: refId,
          tipo: 'entrada_remision',
          mpId: ln.mpId,
          producto: ln.producto,
          cantidad: ln.cantidad,
          und: ln.und,
          bodegaId: destBodegaId,
          bodegaDestinoId: rem.origenBodegaId || '',
          notas: nota,
        })
      )
        n++;
    });
    return n;
  }

  function aplicarEntradaEntrante(row) {
    if (!row || row.estado === 'rechazada') return 0;
    var payload = row.payload || {};
    var lineas = payload.lineas || [];
    if (!lineas.length) return 0;
    var destBod = payload.destino_bodega_id || BODEGA_PRINCIPAL;
    var pseudo = {
      id: row.remisionUuid,
      remisionUuid: row.remisionUuid,
      origenNegocioNombre: row.origenNegocioNombre || row.origenNegocioId,
      destinoBodegaId: destBod,
      lineas: lineas.map(function (l) {
        return {
          mpId: l.mpId || l.productoRefId || '',
          producto: l.producto || l.productoNombre || l.mpId || 'ítem',
          cantidad: l.cantidad,
          und: l.und || l.unidad || 'kg',
        };
      }),
    };
    return aplicarEntradaDestino(pseudo, destBod);
  }

  function validarStockOrigen(rem) {
    if (!rem || !rem.origenBodegaId || !rem.lineas) return { ok: true, faltantes: [] };
    var faltantes = [];
    rem.lineas.forEach(function (ln) {
      if (!ln.mpId) return;
      var need = Number(ln.cantidad) || 0;
      if (need <= 0) return;
      var have = stockBodegaMp(ln.mpId, rem.origenBodegaId);
      if (have + 0.001 < need) {
        faltantes.push({
          mpId: ln.mpId,
          producto: ln.producto || ln.mpId,
          need: need,
          have: have,
          und: ln.und || 'kg',
        });
      }
    });
    return { ok: !faltantes.length, faltantes: faltantes };
  }

  function empresaNombre() {
    try {
      if (typeof global.getEmpresaConfig === 'function') {
        var e = global.getEmpresaConfig();
        if (e && (e.nombreComercial || e.razonSocial || e.nombre)) return e.nombreComercial || e.razonSocial || e.nombre;
      }
    } catch (_) {}
    var st = loadStore();
    return st.negocio.nombre || st.negocio.id || 'Crozzo POS';
  }

  function tipoDocLabel(id) {
    var t = TIPOS_DOC.find(function (x) {
      return x.id === id;
    });
    return t ? t.label : id || 'Remisión';
  }

  function remisionNormalizeOutput(id) {
    var s = String(id || 'roll_80').toLowerCase();
    if (s === 'thermal' || s === 'roll' || s === 'termica') return 'roll_80';
    if (s === 'normal' || s === 'html' || s === 'a4') return 'carta';
    if (s === 'roll_58' || s === '58' || s === '50') return 'roll_58';
    if (s === 'roll_80' || s === '80') return 'roll_80';
    if (s === 'oficio' || s === 'legal') return 'oficio';
    if (s === 'carta') return 'carta';
    return 'roll_80';
  }

  function remisionOutputMeta(id) {
    id = remisionNormalizeOutput(id);
    if (id === 'roll_58') return { id: id, kind: 'roll', sz: '58', page: 'a4', printerHint: 'Térmica bodega (58 mm)' };
    if (id === 'roll_80') return { id: id, kind: 'roll', sz: '80', page: 'a4', printerHint: 'Térmica bodega (80 mm)' };
    if (id === 'oficio') return { id: id, kind: 'sheet', page: 'legal', printerHint: 'Oficio apaisado' };
    return { id: 'carta', kind: 'sheet', page: 'a4', printerHint: 'Carta A4' };
  }

  function remisionSavedPrintOutput() {
    try {
      if (global.CrozzoPrintStudioHub && global.CrozzoPrintStudioHub.getPrintOutput) {
        return remisionNormalizeOutput(global.CrozzoPrintStudioHub.getPrintOutput('remision'));
      }
      if (global.CrozzoPrintStudioHub && global.CrozzoPrintStudioHub.savedPrintOutput) {
        return remisionNormalizeOutput(global.CrozzoPrintStudioHub.savedPrintOutput('remision'));
      }
      var stored = localStorage.getItem('crozzo_print_output_remision');
      if (stored) return remisionNormalizeOutput(stored);
      var bod = localStorage.getItem('crozzo_print_output_bodega');
      if (bod) return remisionNormalizeOutput(bod);
    } catch (_) {}
    return 'roll_80';
  }

  function remisionSavePrintOutput(id) {
    id = remisionNormalizeOutput(id);
    if (global.CrozzoPrintStudioHub && global.CrozzoPrintStudioHub.pickPrintOutput) {
      global.CrozzoPrintStudioHub.pickPrintOutput('remision', id);
      return;
    }
    try {
      localStorage.setItem('crozzo_print_output_remision', id);
    } catch (_) {}
  }

  function remisionResolvePrintOpts(extra) {
    extra = extra || {};
    if (
      !extra.printOutput &&
      global.CrozzoPrintStudioHub &&
      typeof global.CrozzoPrintStudioHub.getRemisionPrintOpts === 'function'
    ) {
      var base = global.CrozzoPrintStudioHub.getRemisionPrintOpts();
      return Object.assign(base, extra);
    }
    var outputId = extra.printOutput ? remisionNormalizeOutput(extra.printOutput) : remisionSavedPrintOutput();
    var meta = remisionOutputMeta(outputId);
    var conf = typeof global.getFacturacionAdminConfig === 'function' ? global.getFacturacionAdminConfig() : {};
    var isRoll = meta.kind === 'roll';
    var printer = '';
    if (global.CrozzoPrintStudioHub && typeof global.CrozzoPrintStudioHub.resolvePrinterForOutput === 'function') {
      printer = global.CrozzoPrintStudioHub.resolvePrinterForOutput(outputId, conf, 'bodega');
    } else {
      printer = String(conf.impresoraBodega || conf.impresoraCajaPos || '').trim();
    }
    return {
      printOutput: meta.id,
      pageFormat: isRoll ? undefined : meta.page,
      landscape: !isRoll && outputId !== 'carta',
      allowDialog: extra.allowDialog !== false,
      silent: !!extra.silent,
      printer: printer,
      role: 'bodega',
      channel: isRoll ? 'roll' : 'normal',
      paperSz: meta.sz,
      preferEscPos: isRoll,
    };
  }

  var FED_PRINT_CSS_THERMAL =
    '@page{size:80mm auto;margin:2mm}' +
    'body{margin:0;padding:4px 6px;width:72mm;font-family:Consolas,monospace;font-size:11px;color:#000}' +
    'h1{font-size:13px;margin:0 0 6px;line-height:1.2;text-transform:uppercase}' +
    '.meta{font-size:9px;margin:0 0 6px;color:#333;line-height:1.35}' +
    '.fed-thermal-item{padding:6px 0;border-bottom:1px dashed #444;page-break-inside:avoid}' +
    '.fed-thermal-name{font-size:11px;font-weight:700;line-height:1.25;margin:0 0 2px;word-wrap:break-word}' +
    '.fed-thermal-qty{font-size:11px;margin:0}' +
    '.fed-thermal-qty strong{font-size:13px}' +
    '.fed-sign{margin-top:14px;font-size:9px}' +
    '.fed-sign-line{display:block;margin:18px 0 8px;border-bottom:1px solid #000;min-height:1px}' +
    '.foot{font-size:8px;margin-top:10px;color:#555}';

  function remisionDestinoLabel(rem, st) {
    return (
      rem.destinoNegocioNombre ||
      (rem.destinoNegocioId && rem.destinoNegocioId !== st.negocio.id ? rem.destinoNegocioId : bodegaLabel(rem.destinoBodegaId))
    );
  }

  function buildRemisionItemsThermal(rem) {
    return (rem.lineas || [])
      .map(function (ln, i) {
        return (
          '<div class="fed-thermal-item">' +
          '<div class="fed-thermal-name">' +
          (i + 1) +
          '. ' +
          esc(ln.producto || ln.mpId) +
          '</div>' +
          '<div class="fed-thermal-qty"><strong>' +
          esc(ln.cantidad) +
          ' ' +
          esc(ln.und || 'kg') +
          '</strong></div></div>'
        );
      })
      .join('');
  }

  function remisionFromInbox(row) {
    var p = (row && row.payload) || {};
    return {
      id: row.id,
      remisionUuid: row.remisionUuid,
      tipo: row.tipo || 'transferencia',
      estado: row.estado || 'pendiente',
      origenBodegaId: p.origen_bodega_id || '',
      destinoBodegaId: p.destino_bodega_id || BODEGA_PRINCIPAL,
      origenNegocioNombre: row.origenNegocioNombre || row.origenNegocioId,
      destinoNegocioNombre: loadStore().negocio.nombre,
      lineas: (p.lineas || []).map(function (l) {
        return {
          mpId: l.mpId || l.productoRefId || '',
          producto: l.producto || l.productoNombre || l.mpId || 'ítem',
          cantidad: l.cantidad,
          und: l.und || l.unidad || 'kg',
        };
      }),
      enviadoPor: p.enviado_por || '',
      notas: p.notas || '',
      createdAt: row.createdAt || p.created_at || new Date().toISOString(),
    };
  }

  function buildRemisionPrintHtml(rem, printOpts) {
    if (!rem) return '';
    printOpts = remisionResolvePrintOpts(printOpts || {});
    var st = loadStore();
    var meta = remisionOutputMeta(printOpts.printOutput);
    var isRoll = meta.kind === 'roll';
    var dest = remisionDestinoLabel(rem, st);
    var origenExt = rem.origenNegocioNombre && !rem.origenBodegaId;
    var fecha = esc(String(rem.createdAt || '').slice(0, 16).replace('T', ' '));
    var ref = esc(String(rem.remisionUuid || rem.id).slice(0, 13));

    if (isRoll) {
      var css = FED_PRINT_CSS_THERMAL.replace(/80mm/g, meta.sz === '58' ? '58mm' : '80mm').replace(/72mm/g, meta.sz === '58' ? '52mm' : '72mm');
      var deTxt = origenExt
        ? esc(rem.origenNegocioNombre)
        : esc(bodegaLabel(rem.origenBodegaId));
      var aTxt = origenExt ? esc(bodegaLabel(rem.destinoBodegaId) || dest) : esc(dest || '—');
      return (
        '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Remisión</title><style>' +
        css +
        '</style></head><body>' +
        '<h1>' +
        esc(tipoDocLabel(rem.tipo)) +
        ' · ' +
        meta.sz +
        'mm</h1>' +
        '<p class="meta"><strong>' +
        esc(empresaNombre()) +
        '</strong><br>' +
        fecha +
        ' · ' +
        esc(rem.estado || 'borrador') +
        '<br>Ref: ' +
        ref +
        '</p>' +
        '<p class="meta">DE: ' +
        deTxt +
        '<br>A: ' +
        aTxt +
        (rem.enviadoPor ? '<br>Envía: ' + esc(rem.enviadoPor) : '') +
        (rem.notas ? '<br>Nota: ' + esc(rem.notas) : '') +
        '</p>' +
        buildRemisionItemsThermal(rem) +
        '<div class="fed-sign">ENTREGA / ENVÍA<span class="fed-sign-line"></span>RECIBE / CONFIRMA<span class="fed-sign-line"></span></div>' +
        '<p class="foot">' +
        new Date().toLocaleString('es-CO') +
        ' · Crozzo POS</p></body></html>'
      );
    }

    var lineas = rem.lineas || [];
    var rows = lineas
      .map(function (ln, i) {
        return (
          '<tr><td>' +
          (i + 1) +
          '</td><td>' +
          esc(ln.producto || ln.mpId) +
          '</td><td class="num">' +
          esc(ln.cantidad) +
          '</td><td>' +
          esc(ln.und || 'kg') +
          '</td></tr>'
        );
      })
      .join('');
    var destLabel = remisionDestinoLabel(rem, st);
    return (
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Remisión</title><style>' +
      'body{font-family:Segoe UI,system-ui,sans-serif;font-size:12px;color:#111;margin:24px;max-width:720px}' +
      'h1{font-size:18px;margin:0 0 4px}h2{font-size:13px;font-weight:600;margin:16px 0 8px;color:#444}' +
      '.meta{font-size:11px;color:#555;line-height:1.5;margin-bottom:14px}' +
      'table{width:100%;border-collapse:collapse;margin:8px 0 20px}' +
      'th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}' +
      'th{background:#f3f4f6;font-size:10px;text-transform:uppercase}' +
      '.num{text-align:right;font-variant-numeric:tabular-nums}' +
      '.sign{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:32px}' +
      '.sign div{border-top:1px solid #333;padding-top:6px;font-size:10px;text-align:center}' +
      '.foot{margin-top:20px;font-size:9px;color:#888}' +
      '</style></head><body>' +
      '<h1>' +
      esc(empresaNombre()) +
      '</h1>' +
      '<p class="meta"><strong>' +
      esc(tipoDocLabel(rem.tipo)) +
      '</strong><br>UUID: <code>' +
      esc(rem.remisionUuid || rem.id) +
      '</code><br>Fecha: ' +
      esc(String(rem.createdAt || '').slice(0, 16).replace('T', ' ')) +
      '<br>Estado: ' +
      esc(rem.estado || 'borrador') +
      '</p>' +
      '<h2>Ruta</h2><p class="meta">Origen bodega: <strong>' +
      esc(bodegaLabel(rem.origenBodegaId)) +
      '</strong><br>Destino: <strong>' +
      esc(destLabel || '—') +
      '</strong>' +
      (rem.enviadoPor ? '<br>Enviado por: ' + esc(rem.enviadoPor) : '') +
      (rem.recibidoPor ? '<br>Recibido por: ' + esc(rem.recibidoPor) : '') +
      (rem.notas ? '<br>Notas: ' + esc(rem.notas) : '') +
      '</p>' +
      '<h2>Ítems</h2><table><thead><tr><th>#</th><th>Producto / MP</th><th class="num">Cant.</th><th>Und</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="4">Sin líneas</td></tr>') +
      '</tbody></table>' +
      '<div class="sign"><div>Entrega / envía</div><div>Recibe / confirma</div></div>' +
      '<p class="foot">Impreso ' +
      new Date().toLocaleString('es-CO') +
      ' · Crozzo POS · Remisión federada</p></body></html>'
    );
  }

  function printRemision(remisionId, extra) {
    extra = extra || {};
    var rem =
      typeof remisionId === 'object'
        ? remisionId
        : getRemision(remisionId);
    if (!rem) {
      toast('Remisión no encontrada', 'warning');
      return Promise.resolve(false);
    }
    var printOpts = remisionResolvePrintOpts(extra);
    var meta = remisionOutputMeta(printOpts.printOutput);
    var html = buildRemisionPrintHtml(rem, printOpts);
    var docOpts = {
      allowDialog: printOpts.allowDialog !== false,
      silent: printOpts.silent === true,
      toast: true,
      landscape: printOpts.landscape === true,
      pageFormat: printOpts.pageFormat,
      printOutput: printOpts.printOutput,
      printer: printOpts.printer,
      role: printOpts.role || 'bodega',
      channel: printOpts.channel || (meta.kind === 'roll' ? 'roll' : 'normal'),
      paperSz: printOpts.paperSz || meta.sz,
      preferEscPos: meta.kind === 'roll',
    };
    var fmtLbl = meta.printerHint || printOpts.printOutput;
    if (typeof global.crozzoPrintHtmlDocument === 'function') {
      return global.crozzoPrintHtmlDocument(html, docOpts).then(function (ok) {
        if (!ok) {
          var w = window.open('', '_blank', meta.kind === 'roll' ? 'width=320,height=720' : 'width=800,height=720');
          if (w) {
            w.document.write(html);
            w.document.close();
            w.focus();
            w.print();
          } else toast('Permita ventanas emergentes para imprimir', 'warning');
        } else toast('Remisión impresa · ' + fmtLbl, 'success');
        return ok;
      });
    }
    var w = window.open('', '_blank', 'width=800,height=720');
    if (!w) {
      toast('Permita ventanas emergentes para imprimir', 'warning');
      return Promise.resolve(false);
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
    return Promise.resolve(true);
  }

  global.CrozzoFederacionEngine = {
    LS: LS,
    TIPOS_DOC: TIPOS_DOC,
    TIPOS_BODEGA: TIPOS_BODEGA,
    loadStore: loadStore,
    saveStore: saveStore,
    loadFedConfig: loadFedConfig,
    saveFedConfig: saveFedConfig,
    saveNegocioIdentity: saveNegocioIdentity,
    listBodegas: listBodegas,
    upsertBodega: upsertBodega,
    listSocios: listSocios,
    upsertSocio: upsertSocio,
    deleteSocio: deleteSocio,
    bodegaLabel: bodegaLabel,
    socioLabel: socioLabel,
    listRemisiones: listRemisiones,
    getRemision: getRemision,
    createRemision: createRemision,
    updateRemision: updateRemision,
    enviarRemision: enviarRemision,
    pullEntrantes: pullEntrantes,
    pullAcuses: pullAcuses,
    confirmarEntrante: confirmarEntrante,
    syncAll: syncAll,
    stockBodegaMp: stockBodegaMp,
    validarStockOrigen: validarStockOrigen,
    buildRemisionPrintHtml: buildRemisionPrintHtml,
    printRemision: printRemision,
    remisionFromInbox: remisionFromInbox,
    remisionSavedPrintOutput: remisionSavedPrintOutput,
    remisionSavePrintOutput: remisionSavePrintOutput,
    remisionResolvePrintOpts: remisionResolvePrintOpts,
    remisionOutputMeta: remisionOutputMeta,
    localSupabaseCreds: localSupabaseCreds,
    getSqlFederacion: getSqlFederacion,
    esc: esc,
    toast: toast,
    businessId: businessId,
  };
})(typeof window !== 'undefined' ? window : globalThis);
