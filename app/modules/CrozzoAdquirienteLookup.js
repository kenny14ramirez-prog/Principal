/**
 * Crozzo POS — Consulta de adquiriente: local + DIAN (con UX calmada y humana).
 */
(function (global) {
  'use strict';

  var LS_CACHE = 'crozzo_adquiriente_cache_v1';
  var SS_AUTO = 'crozzo_adq_auto_lookup';
  var INPUT_DEBOUNCE_MS = 1100;
  var pendingByProfile = {};

  var DOC_TYPE = {
    nit: { schemeId: '31', schemeName: '31', label: 'NIT' },
    cc: { schemeId: '13', schemeName: '13', label: 'Cédula' },
    ce: { schemeId: '22', schemeName: '22', label: 'Cédula extranjería' },
    pasaporte: { schemeId: '41', schemeName: '41', label: 'Pasaporte' },
  };

  var DEMO_ADQUIRIENTES = {
    '3199991': { nombre: 'Nombre NIT 1 (prueba DIAN)', email: 'mail_nit1@prueba.dian', ciudad: 'Bogotá D.C.' },
    '3199992': { nombre: 'Nombre NIT 2 (prueba DIAN)', email: 'mail_nit2@prueba.dian', ciudad: 'Bogotá D.C.' },
    '4299991': { nombre: 'Nombre Documento prueba DIAN', email: 'mail_doc@prueba.dian', ciudad: 'Medellín' },
  };

  var SOURCE_LABEL = {
    crm_local: 'su directorio de clientes',
    reservorio_proveedor: 'compras anteriores',
    dian_demo: 'DIAN (prueba)',
    dian_tauri: 'DIAN',
    dian_supabase: 'DIAN',
    cache: 'memoria reciente',
  };

  function readCache() {
    try {
      var raw = localStorage.getItem(LS_CACHE);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function writeCacheEntry(key, data) {
    try {
      var c = readCache();
      c[key] = { at: Date.now(), data: data };
      var keys = Object.keys(c);
      if (keys.length > 200) {
        keys.sort(function (a, b) {
          return (c[a].at || 0) - (c[b].at || 0);
        });
        keys.slice(0, keys.length - 200).forEach(function (k) {
          delete c[k];
        });
      }
      localStorage.setItem(LS_CACHE, JSON.stringify(c));
    } catch (_) {}
  }

  function cacheGet(key) {
    var c = readCache();
    var e = c[key];
    if (!e || Date.now() - (e.at || 0) > 7 * 86400000) return null;
    return e.data;
  }

  function normDocKey(doc) {
    return (doc.typeKey || 'doc') + ':' + (doc.number || '');
  }

  function parseDocument(raw) {
    var clean = String(raw || '')
      .trim()
      .replace(/[^0-9-]/g, '');
    if (!clean) return null;
    var vr = null;
    try {
      if (typeof global.validarNIT === 'function') vr = global.validarNIT(raw, { relajado: true });
    } catch (_) {}
    if (vr && vr.valido && vr.modo === 'nit_dian') {
      return {
        typeKey: 'nit',
        type: DOC_TYPE.nit,
        number: vr.base,
        dv: String(vr.dv),
        display: vr.base + '-' + vr.dv,
        raw: clean,
      };
    }
    if (/^[0-9]+-[0-9]$/.test(clean)) {
      var p = clean.split('-');
      return {
        typeKey: 'nit',
        type: DOC_TYPE.nit,
        number: p[0],
        dv: p[1],
        display: clean,
        raw: clean,
      };
    }
    var digits = clean.replace(/-/g, '');
    if (/^[0-9]{4,15}$/.test(digits)) {
      var isNitLen = digits.length >= 9 && digits.length <= 11;
      return {
        typeKey: isNitLen ? 'nit' : 'cc',
        type: isNitLen ? DOC_TYPE.nit : DOC_TYPE.cc,
        number: digits,
        dv: '',
        display: digits,
        raw: digits,
      };
    }
    return null;
  }

  function docTypeHintHtml(doc) {
    if (!doc || !doc.type) return '';
    return (
      '<span class="crozzo-adq-doc-hint">Detectamos <strong>' +
      doc.type.label +
      '</strong> · puede pulsar Enter o «Buscar datos»</span>'
    );
  }

  function lookupLocalCrm(doc) {
    if (typeof global.crozzoCrmGetClients !== 'function' || typeof global.crozzoCrmNormNit !== 'function') return null;
    var norm = global.crozzoCrmNormNit(doc.display || doc.number);
    var list = global.crozzoCrmGetClients();
    var hit = list.find(function (c) {
      return global.crozzoCrmNormNit(c.nit) === norm;
    });
    if (!hit) return null;
    return {
      nombre: hit.nombre || '',
      email: hit.email || (hit.emails && hit.emails[0]) || '',
      emails: hit.emails || [],
      telefono: hit.telefono || '',
      ciudad: hit.ciudad || '',
      direccion: hit.direccion || '',
      clientId: hit.id,
      source: 'crm_local',
    };
  }

  function lookupLocalReservorio(doc) {
    try {
      if (typeof global.CrozzoReservorio === 'undefined' || !global.CrozzoReservorio.listProveedores) return null;
      var provs = global.CrozzoReservorio.listProveedores() || [];
      var num = String(doc.number || '').replace(/\D/g, '');
      var hit = provs.find(function (p) {
        if (!p) return false;
        var id = String(p.nit || p.identificador || p.rut || '').replace(/\D/g, '');
        return id && id === num;
      });
      if (!hit) return null;
      return {
        nombre: hit.razonSocial || hit.nombre || '',
        email: hit.email || hit.correo || '',
        telefono: hit.telefono || '',
        ciudad: hit.ciudad || '',
        direccion: hit.direccion || '',
        source: 'reservorio_proveedor',
      };
    } catch (_) {
      return null;
    }
  }

  function lookupDemo(doc) {
    try {
      if (typeof global.config === 'undefined' || !global.config.isDemoMode || !global.config.isDemoMode()) return null;
    } catch (_) {
      return null;
    }
    var key = String(doc.number || '').replace(/\D/g, '');
    var d = DEMO_ADQUIRIENTES[key];
    if (!d) return null;
    return Object.assign({}, d, { source: 'dian_demo' });
  }

  function lookupRemoteTauri(doc) {
    if (!global.__TAURI__ || !global.__TAURI__.core || typeof global.__TAURI__.core.invoke !== 'function') {
      return Promise.resolve(null);
    }
    return global.__TAURI__.core
      .invoke('fetch_dian_adquiriente', {
        schemeName: doc.type.schemeName,
        identification: doc.number,
        dv: doc.dv || null,
      })
      .then(function (r) {
        if (!r || !r.ok) return null;
        return {
          nombre: r.name || r.nombre || r.razonSocial || '',
          email: r.email || r.correo || '',
          ciudad: r.ciudad || r.municipio || '',
          direccion: r.direccion || '',
          source: 'dian_tauri',
        };
      })
      .catch(function () {
        return null;
      });
  }

  function lookupRemoteSupabase(doc) {
    try {
      if (typeof global.crozzoCloudRestFetch !== 'function') return Promise.resolve(null);
      var cfg = typeof global.crozzoGetSupabaseConfig === 'function' ? global.crozzoGetSupabaseConfig() : null;
      if (!cfg || !cfg.url) return Promise.resolve(null);
      return global
        .crozzoCloudRestFetch(
          'rpc/crozzo_lookup_adquiriente',
          {
            method: 'POST',
            body: JSON.stringify({
              scheme_name: doc.type.schemeName,
              identification: doc.number,
              dv: doc.dv || null,
            }),
          },
          { silent: true }
        )
        .then(function (r) {
          if (!r || !r.nombre) return null;
          return {
            nombre: r.nombre || r.name || '',
            email: r.email || '',
            ciudad: r.ciudad || '',
            direccion: r.direccion || '',
            source: 'dian_supabase',
          };
        })
        .catch(function () {
          return null;
        });
    } catch (_) {
      return Promise.resolve(null);
    }
  }

  function canUseDianLookup() {
    try {
      if (typeof global.config !== 'undefined' && global.config.getOperacionModo) {
        var m = global.config.getOperacionModo();
        if (m === 'demo') return true;
        if (m === 'electronic') return true;
      }
    } catch (_) {}
    return false;
  }

  function lookupAdquiriente(raw) {
    var doc = parseDocument(raw);
    if (!doc) {
      return Promise.resolve({ ok: false, error: 'Revise el documento — mínimo 4 dígitos numéricos.' });
    }
    var ck = normDocKey(doc);
    var cached = cacheGet(ck);
    if (cached) {
      return Promise.resolve({ ok: true, doc: doc, data: cached, source: 'cache' });
    }
    var local = lookupLocalCrm(doc) || lookupLocalReservorio(doc);
    if (local) {
      writeCacheEntry(ck, local);
      return Promise.resolve({ ok: true, doc: doc, data: local, source: local.source });
    }
    var demo = lookupDemo(doc);
    if (demo) {
      writeCacheEntry(ck, demo);
      return Promise.resolve({ ok: true, doc: doc, data: demo, source: demo.source });
    }
    if (!canUseDianLookup()) {
      return Promise.resolve({
        ok: false,
        doc: doc,
        soft: true,
        error: 'Sin datos guardados aún — escriba el nombre y quedará listo para la próxima venta.',
      });
    }
    return lookupRemoteTauri(doc).then(function (remote) {
      if (remote) {
        writeCacheEntry(ck, remote);
        return { ok: true, doc: doc, data: remote, source: remote.source };
      }
      return lookupRemoteSupabase(doc).then(function (remote2) {
        if (remote2) {
          writeCacheEntry(ck, remote2);
          return { ok: true, doc: doc, data: remote2, source: remote2.source };
        }
        return {
          ok: false,
          doc: doc,
          soft: true,
          error: 'No encontramos datos en DIAN — complete el nombre con calma; lo guardamos para usted.',
        };
      });
    });
  }

  var FORM_PROFILES = {
    crm_new: {
      nit: 'crozzoCrmNewNit',
      nombre: 'crozzoCrmNewNombre',
      tel: 'crozzoCrmNewTel',
      ciudad: 'crozzoCrmNewCiudad',
      dir: 'crozzoCrmNewDir',
      emailsList: 'crozzoCrmNewEmailsList',
      emailInputClass: 'crozzoCrmNewEmailIn',
      status: 'crozzoAdqStatusNew',
      hint: 'crozzoAdqHintNew',
    },
    crm_modal: {
      nit: 'cliDirNit',
      nombre: 'cliDirNom',
      tel: 'cliDirTel',
      ciudad: 'cliDirCiudad',
      dir: 'cliDirDir',
      emailsList: 'cliDirEmailsList',
      emailInputClass: 'cliDirEmailIn',
      status: 'cliDirAdqStatus',
      hint: 'cliDirAdqHint',
    },
  };

  function setStatus(statusId, html, loading) {
    var el = document.getElementById(statusId);
    if (!el) return;
    el.innerHTML = html || '';
    el.classList.toggle('crozzo-adq-lookup-status--loading', !!loading);
  }

  function setHint(hintId, html) {
    var el = document.getElementById(hintId);
    if (el) el.innerHTML = html || '';
  }

  function nombreEmpty(profileKey) {
    var p = FORM_PROFILES[profileKey];
    if (!p) return true;
    var nom = document.getElementById(p.nombre);
    return !nom || !nom.value.trim();
  }

  function applyLookupToForm(profileKey, data) {
    var p = FORM_PROFILES[profileKey];
    if (!p || !data) return false;
    var nom = document.getElementById(p.nombre);
    if (nom && data.nombre && !nom.value.trim()) nom.value = data.nombre;
    var tel = document.getElementById(p.tel);
    if (tel && data.telefono && !tel.value.trim()) tel.value = data.telefono;
    var ci = document.getElementById(p.ciudad);
    if (ci && data.ciudad && !ci.value.trim()) ci.value = data.ciudad;
    var di = document.getElementById(p.dir);
    if (di && data.direccion && !di.value.trim()) di.value = data.direccion;
    if (data.email && p.emailsList) {
      var first = document.querySelector('#' + p.emailsList + ' input.' + p.emailInputClass);
      if (first && !first.value.trim()) first.value = data.email;
    }
    var nitEl = document.getElementById(p.nit);
    if (nitEl) {
      nitEl.classList.add('crozzo-adq-input--filled');
      if (nitEl.dispatchEvent) nitEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (nom && data.nombre) {
      try {
        nom.focus();
        nom.setSelectionRange(nom.value.length, nom.value.length);
      } catch (_) {}
    }
    return true;
  }

  function tryApplyExistingClient(profileKey, data) {
    if (profileKey !== 'crm_new' || !data || !data.clientId) return false;
    if (typeof global.crozzoCrmClientById !== 'function' || typeof global.crozzoCrmApplyClientToUi !== 'function') {
      return false;
    }
    var c = global.crozzoCrmClientById(data.clientId);
    if (!c) return false;
    global.crozzoCrmApplyClientToUi(c);
    if (typeof global.showToast === 'function') {
      global.showToast('Cliente ya registrado — lo cargamos en este pedido.', 'success');
    }
    return true;
  }

  function sourceLabel(source) {
    return SOURCE_LABEL[source] || 'registro';
  }

  function runForForm(profileKey, opts) {
    opts = opts || {};
    var p = FORM_PROFILES[profileKey];
    if (!p) return;
    var nitEl = document.getElementById(p.nit);
    if (!nitEl) return;
    var raw = nitEl.value.trim();
    if (!raw || raw.replace(/\D/g, '').length < 4) {
      if (!opts.silent && typeof global.showToast === 'function') {
        global.showToast('Escriba cédula o NIT cuando pueda — sin prisa.', 'info');
      }
      return;
    }
    if (pendingByProfile[profileKey]) return;
    pendingByProfile[profileKey] = true;
    nitEl.classList.add('crozzo-adq-input--busy');
    setStatus(p.status, '<span class="crozzo-adq-lookup-pulse">Buscando con cuidado…</span>', true);
    lookupAdquiriente(raw)
      .then(function (res) {
        pendingByProfile[profileKey] = false;
        nitEl.classList.remove('crozzo-adq-input--busy');
        if (res.ok && res.data) {
          if (res.source === 'crm_local' && tryApplyExistingClient(profileKey, res.data)) {
            setStatus(p.status, '<span class="form-success">✓ Cliente conocido — listo en el pedido</span>');
            setHint(p.hint, '');
            return;
          }
          applyLookupToForm(profileKey, res.data);
          var lbl = sourceLabel(res.source);
          setStatus(p.status, '<span class="form-success">✓ Completado desde ' + lbl + '</span>');
          setHint(p.hint, '');
          if (!opts.silent && typeof global.showToast === 'function') {
            global.showToast('Listo — datos tomados de ' + lbl + '. Revise y continúe.', 'success');
          }
          if (
            global.CrozzoOperativePsyche &&
            typeof global.CrozzoOperativePsyche.maybeAffirm === 'function'
          ) {
            global.CrozzoOperativePsyche.maybeAffirm('cliente_lookup_ok');
          }
        } else {
          var msg = res.error || 'Sin datos por ahora';
          setStatus(p.status, '<span class="form-hint crozzo-adq-lookup-status--soft">' + msg + '</span>');
          if (!opts.silent && !res.soft && typeof global.showToast === 'function') {
            global.showToast(msg, 'info');
          } else if (!opts.silent && res.soft && typeof global.showToast === 'function') {
            global.showToast(msg, 'info');
          }
          if (res.doc && p.hint) setHint(p.hint, docTypeHintHtml(res.doc));
        }
      })
      .catch(function () {
        pendingByProfile[profileKey] = false;
        nitEl.classList.remove('crozzo-adq-input--busy');
        setStatus(p.status, '<span class="form-hint">No pudimos consultar ahora — complete manualmente.</span>');
      });
  }

  function onDocInput(profileKey) {
    var p = FORM_PROFILES[profileKey];
    if (!p) return;
    var nitEl = document.getElementById(p.nit);
    if (!nitEl) return;
    var raw = nitEl.value.trim();
    var doc = parseDocument(raw);
    if (p.hint) {
      if (doc && raw.replace(/\D/g, '').length >= 4) setHint(p.hint, docTypeHintHtml(doc));
      else setHint(p.hint, '');
    }
    if (!shouldAutoLookup() || !nombreEmpty(profileKey)) return;
    if (!doc || raw.replace(/\D/g, '').length < 8) return;
    if (nitEl._crozzoAdqTimer) clearTimeout(nitEl._crozzoAdqTimer);
    nitEl._crozzoAdqTimer = setTimeout(function () {
      if (nombreEmpty(profileKey)) runForForm(profileKey, { silent: true });
    }, INPUT_DEBOUNCE_MS);
  }

  function shouldAutoLookup() {
    try {
      if (sessionStorage.getItem(SS_AUTO) === '0') return false;
    } catch (_) {}
    return true;
  }

  function bindForm(profileKey) {
    var p = FORM_PROFILES[profileKey];
    if (!p) return;
    var nitEl = document.getElementById(p.nit);
    if (!nitEl || nitEl._crozzoAdqBound) return;
    nitEl._crozzoAdqBound = true;
    nitEl.setAttribute('autocomplete', 'off');
    nitEl.addEventListener('input', function () {
      onDocInput(profileKey);
    });
    nitEl.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        runForForm(profileKey, { silent: false });
      }
    });
  }

  function bindAllVisible() {
    Object.keys(FORM_PROFILES).forEach(bindForm);
  }

  function lookupFieldHtml(profileKey) {
    var hintId = FORM_PROFILES[profileKey] ? FORM_PROFILES[profileKey].hint : '';
    var statusId = FORM_PROFILES[profileKey] ? FORM_PROFILES[profileKey].status : '';
    return (
      '<div class="crozzo-adq-comfort">' +
      '<p class="crozzo-adq-comfort__lead">Escriba el documento — nosotros buscamos el resto cuando esté disponible.</p>' +
      '<div id="' +
      hintId +
      '" class="crozzo-adq-doc-hint-wrap"></div>' +
      '<div class="crozzo-adq-lookup-row">' +
      '<button type="button" class="btn btn-outline btn-sm crozzo-adq-lookup-btn" onclick="CrozzoAdquirienteLookup.runForForm(\'' +
      profileKey +
      '\')">' +
      '<span aria-hidden="true">✦</span> Buscar datos</button>' +
      '<span id="' +
      statusId +
      '" class="crozzo-adq-lookup-status form-hint"></span>' +
      '</div></div>'
    );
  }

  global.CrozzoAdquirienteLookup = {
    parseDocument: parseDocument,
    lookupAdquiriente: lookupAdquiriente,
    runForForm: runForForm,
    bindForm: bindForm,
    bindAllVisible: bindAllVisible,
    lookupFieldHtml: lookupFieldHtml,
    canUseDianLookup: canUseDianLookup,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(bindAllVisible, 300);
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
