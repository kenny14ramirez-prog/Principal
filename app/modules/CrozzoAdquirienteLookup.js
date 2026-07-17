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

    '3199993': { nombre: 'Nombre NIT 3 (prueba DIAN)', email: 'mail_nit3@prueba.dian', ciudad: 'Medellín' },

    '4299991': { nombre: 'Nombre Documento prueba DIAN', email: 'mail_doc@prueba.dian', ciudad: 'Medellín' },

    '1399991': { nombre: 'Nombre Cédula de ciudadanía 1', email: 'mail_cc1@prueba.dian', ciudad: 'Bogotá D.C.' },

    '1399992': { nombre: 'Nombre Cédula de ciudadanía 2', email: 'mail_cc2@prueba.dian', ciudad: 'Bogotá D.C.' },

    '1399993': { nombre: 'Nombre Cédula de ciudadanía 3', email: 'mail_cc3@prueba.dian', ciudad: 'Cali' },

    '1399994': { nombre: 'Nombre Cédula de ciudadanía 4', email: 'mail_cc4@prueba.dian', ciudad: 'Barranquilla' },

  };



  var SOURCE_LABEL = {

    crm_local: 'su directorio de clientes',

    reservorio_proveedor: 'compras anteriores',

    dian_demo: 'DIAN (prueba)',

    dian_tauri: 'DIAN GetAcquirer',

    dian_supabase: 'DIAN (nube)',

    rues_opendata: 'RUES datos.gov.co',

    rues_enrich: 'RUES (fondo)',

    scrapling_enrich: 'RUES/Scrapling (fondo)',

    cache: 'memoria reciente',

    cedula_escaneada: 'cédula escaneada',

  };

  function getFeReadiness(data, doc) {
    data = data || {};
    var src = SOURCE_LABEL[data.source] || data.source || '—';
    var items = [
      {
        key: 'doc',
        ok: !!(doc && (doc.display || doc.number)),
        label: 'Documento',
        hint: doc && doc.type ? doc.type.label + ' ' + (doc.display || doc.number) : '',
      },
      {
        key: 'nombre',
        ok: !!String(data.nombre || '').trim(),
        label: 'Nombre / razón social',
        hint: data.source === 'rues_opendata' ? 'RUES suele traerlo' : '',
      },
      {
        key: 'email',
        ok: !!String(data.email || '').trim(),
        label: 'Correo FE',
        hint:
          data.source === 'dian_tauri' || data.source === 'dian_supabase' || data.source === 'dian_demo'
            ? 'DIAN puede traerlo'
            : data.source === 'rues_opendata'
              ? 'Pida al cliente — RUES casi nunca trae correo'
              : 'Obligatorio si envía FE por email',
      },
      {
        key: 'ciudad',
        ok: !!String(data.ciudad || '').trim(),
        label: 'Municipio',
        optional: true,
        hint: 'Recomendado en XML',
      },
    ];
    var required = items.filter(function (x) {
      return !x.optional;
    });
    var missing = required.filter(function (x) {
      return !x.ok;
    });
    return {
      ok: missing.length === 0,
      items: items,
      missing: missing,
      sourceLabel: src,
      source: data.source || '',
    };
  }

  function feReadinessSummary(data, doc) {
    var r = getFeReadiness(data, doc);
    if (r.ok) return 'Listo para FE · fuente: ' + r.sourceLabel;
    var miss = r.missing.map(function (m) {
      return m.label;
    });
    return 'Falta: ' + miss.join(', ') + ' · fuente: ' + r.sourceLabel;
  }

  function feReadinessHtml(data, doc) {
    var r = getFeReadiness(data, doc);
    var rows = r.items
      .map(function (it) {
        return (
          '<li class="' +
          (it.ok ? 'is-ok' : it.optional ? 'is-opt' : 'is-miss') +
          '"><span>' +
          (it.ok ? '✓' : it.optional ? '○' : '○') +
          '</span> ' +
          it.label +
          (it.hint ? ' <small>' + it.hint + '</small>' : '') +
          '</li>'
        );
      })
      .join('');
    return (
      '<div class="crozzo-fe-readiness' +
      (r.ok ? ' crozzo-fe-readiness--ok' : '') +
      '">' +
      '<p class="crozzo-fe-readiness__title">' +
      (r.ok ? '✅ Datos suficientes para facturar' : '⚠️ Complete antes de emitir FE') +
      '</p>' +
      '<ul class="crozzo-fe-readiness__list">' +
      rows +
      '</ul>' +
      '<p class="form-hint" style="margin:6px 0 0;">Fuente: ' +
      r.sourceLabel +
      '. Con certificado .p12, DIAN GetAcquirer aporta nombre y correo.</p></div>'
    );
  }

  var RUES_OPENDATA_URL = 'https://www.datos.gov.co/resource/c82u-588k.json';

  var RUES_DETALLE_RM_URL = 'https://ruesapi.rues.org.co/WEB2/api/Expediente/DetalleRM/';



  function ruesPickContact() {

    for (var i = 0; i < arguments.length; i++) {

      var v = String(arguments[i] == null ? '' : arguments[i]).trim();

      if (v) return v;

    }

    return '';

  }



  function buildRuesRmId(codCamara, matricula) {

    var cam = String(codCamara || '').replace(/\D/g, '');

    var mat = String(matricula || '').replace(/\D/g, '');

    if (!cam || !mat) return '';

    var matWidth = 12 - cam.length;

    if (matWidth < 1) return '';

    while (mat.length < matWidth) mat = '0' + mat;

    if (mat.length > matWidth) mat = mat.slice(-matWidth);

    return cam + mat;

  }



  function lookupRuesDetalleRm(rmId) {

    if (!rmId) return Promise.resolve(null);

    return fetch(RUES_DETALLE_RM_URL + encodeURIComponent(rmId), {

      method: 'GET',

      headers: { Accept: 'application/json' },

    })

      .then(function (r) {

        return r.ok ? r.json() : null;

      })

      .then(function (body) {

        if (!body || body.codigo_error !== '0000' || !body.registros) return null;

        return body.registros;

      })

      .catch(function () {

        return null;

      });

  }



  function annotateRuesContactFields(row) {

    if (!row) return row;

    row._contactFields = {

      nombre: !!row.nombre,

      email: !!row.email,

      telefono: !!row.telefono,

      ciudad: !!row.ciudad,

      direccion: !!row.direccion,

    };

    return row;

  }



  function mergeRuesDetalle(base, det) {

    if (!det) return annotateRuesContactFields(base);

    base.email = ruesPickContact(base.email, det.email_com, det.email_fiscal);

    base.telefono = ruesPickContact(base.telefono, det.tel_com_1, det.tel_com_2, det.tel_com_3, det.tel_fiscal_1);

    base.ciudad = ruesPickContact(base.ciudad, det.mun_comercial, det.mun_fiscal, det.camara);

    base.direccion = ruesPickContact(base.direccion, det.dir_comercial, det.dir_fiscal);

    if (det.razon_social && !base.nombre) base.nombre = String(det.razon_social).trim();

    return annotateRuesContactFields(base);

  }



  var enrichInflight = {};

  var enrichDoneAt = {};



  function needsContactEnrichment(data) {

    data = data || {};

    return !(

      String(data.email || '').trim() &&

      String(data.direccion || '').trim() &&

      String(data.telefono || '').trim()

    );

  }



  function mergeEmptyContact(base, extra) {

    if (!base) base = {};

    if (!extra) return annotateRuesContactFields(base);

    var added = false;

    if (!String(base.nombre || '').trim() && extra.nombre) {

      base.nombre = String(extra.nombre).trim();

      added = true;

    }

    if (!String(base.email || '').trim() && extra.email) {

      base.email = String(extra.email).trim();

      added = true;

    }

    if (!String(base.telefono || '').trim() && extra.telefono) {

      base.telefono = String(extra.telefono).trim();

      added = true;

    }

    if (!String(base.ciudad || '').trim() && extra.ciudad) {

      base.ciudad = String(extra.ciudad).trim();

      added = true;

    }

    if (!String(base.direccion || '').trim() && extra.direccion) {

      base.direccion = String(extra.direccion).trim();

      added = true;

    }

    /* Solo cambiar fuente si el enrich aportó algo nuevo (no pisar DIAN/RUES base). */

    if (added && extra.source && (extra.email || extra.direccion || extra.telefono || extra.ciudad)) {

      if (!base.email || !base.direccion || !base.telefono) base.source = extra.source;

    }

    return annotateRuesContactFields(base);

  }



  function setEnrichUi(profileKey, state, detail) {

    var p = FORM_PROFILES[profileKey];

    if (!p || !p.status) return;

    var el = document.getElementById(p.status);

    if (!el) return;

    if (state === 'busy') {

      el.innerHTML =

        '<span class="crozzo-adq-enrich crozzo-adq-enrich--busy">Buscando contacto…</span>';

      el.classList.add('crozzo-adq-lookup-status--loading');

      return;

    }

    el.classList.remove('crozzo-adq-lookup-status--loading');

    if (state === 'ok') {

      el.innerHTML =

        '<span class="crozzo-adq-enrich crozzo-adq-enrich--ok">✓ ' +

        (detail ? detail : 'Fuentes contrastadas') +

        '</span>';

      return;

    }

    if (state === 'empty') {

      el.innerHTML = '';

    }

  }



  function enrichFromRuesOpendata(doc) {

    return lookupRemoteRuesOpenData(doc).then(function (hit) {

      if (!hit) return null;

      hit.source = 'rues_enrich';

      return hit;

    });

  }



  function enrichFromSidecar(doc, data) {

    if (!global.__TAURI__ || !global.__TAURI__.core || typeof global.__TAURI__.core.invoke !== 'function') {

      return Promise.resolve(null);

    }

    var nit = String(doc && doc.number ? doc.number : '').replace(/\D/g, '');

    if (nit.length < 6) return Promise.resolve(null);

    return global.__TAURI__.core

      .invoke('adq_enrich_start_job', {

        nit: nit,

        nombreHint: (data && data.nombre) || null,

      })

      .then(function (start) {

        if (!start || !start.accepted || !start.jobId) return null;

        var jobId = start.jobId;

        var tries = 0;

        function poll() {

          tries += 1;

          return global.__TAURI__.core.invoke('adq_enrich_poll', { jobId: jobId }).then(function (st) {

            if (!st) return null;

            if (st.status === 'done' && st.data) {

              var d = st.data;

              return {

                nombre: d.nombre || '',

                email: d.email || '',

                telefono: d.telefono || '',

                ciudad: d.ciudad || '',

                direccion: d.direccion || '',

                source: d.source || 'scrapling_enrich',

              };

            }

            if (st.status === 'error' || st.status === 'missing') return null;

            if (tries >= 8) return null;

            return new Promise(function (resolve) {

              setTimeout(function () {

                resolve(poll());

              }, 1500);

            });

          });

        }

        return poll();

      })

      .catch(function () {

        return null;

      });

  }



  function applyEnrichmentResult(profileKey, doc, merged) {

    if (!merged) return;

    var ck = normDocKey(doc);

    writeCacheEntry(ck, merged);

    try {

      if (typeof global.crozzoCrmSetPendingLookup === 'function' && doc) {

        var pending = global.__crozzoCrmPendingLookup;

        var same =

          pending &&

          pending.doc &&

          String(pending.doc.number || '') === String(doc.number || '');

        if (same || !pending) {

          global.crozzoCrmSetPendingLookup(merged, doc, merged.source || (pending && pending.source) || '');

          if (typeof global.crozzoCrmRenderDropdown === 'function') {

            var q = (doc.display || doc.number || '').toString();

            var local =

              typeof global.crozzoCrmFindClientsByQuery === 'function'

                ? global.crozzoCrmFindClientsByQuery(q)

                : [];

            global.crozzoCrmRenderDropdown(local, {

              query: q,

              lookupCandidate: merged,

              lookupDoc: doc,

              lookupSource: merged.source,

            });

          }

        }

      }

    } catch (_) {}



    if (profileKey) applyLookupToForm(profileKey, merged);

    try {

      persistLookupToPos(merged, doc);

    } catch (_) {}

    var contrast = String(merged._contrast || '').trim();
    var fe = contrast || (typeof feReadinessSummary === 'function' ? feReadinessSummary(merged, doc) : '');
    setEnrichUi(profileKey, needsContactEnrichment(merged) ? 'empty' : 'ok', fe);

    if (typeof global.showToast === 'function') {

      var got = !!(merged.email || merged.direccion || merged.telefono);

      var contrast = String(merged._contrast || '').trim();

      if (got || contrast) {

        global.showToast(

          (got ? 'Contacto contrastado' : 'Datos contrastados') + (contrast ? ' · ' + contrast : ''),

          merged.email ? 'success' : 'info'

        );

      }

    }

  }



  function scheduleEnrichment(doc, data, profileKey) {
    if (!doc || !doc.number) return;
    if (!needsContactEnrichment(data)) return;
    var key = normDocKey(doc);
    if (enrichInflight[key]) return;
    enrichInflight[key] = true;
    setEnrichUi(profileKey, 'busy');
    var base = Object.assign({}, data || {});
    // Base (DIAN/RUES rápido) + RUES detalle + Scrapling/sidecar en paralelo; luego contrastan.
    Promise.all([
      enrichFromRuesOpendata(doc).catch(function () {
        return null;
      }),
      enrichFromSidecar(doc, base).catch(function () {
        return null;
      }),
    ])
      .then(function (hits) {
        var rues = hits[0];
        var side = hits[1];
        var parts = [{ label: 'base', source: base.source || 'internet', data: base }];
        if (rues) parts.push({ label: 'RUES', source: rues.source || 'rues_enrich', data: rues });
        if (side) parts.push({ label: 'Scrapling', source: side.source || 'scrapling_enrich', data: side });
        var merged = contrastMergeSources(parts);
        enrichDoneAt[key] = Date.now();
        if (rues || side) applyEnrichmentResult(profileKey, doc, merged);
        else setEnrichUi(profileKey, 'empty');
      })
      .catch(function () {
        setEnrichUi(profileKey, 'empty');
      })
      .then(function () {
        delete enrichInflight[key];
      });
  }

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



  function docLookupKeys(doc) {

    var keys = [];

    var num = String(doc.number || '').replace(/\D/g, '');

    var dv = String(doc.dv || '').replace(/\D/g, '');

    if (num) keys.push(num);

    if (num && dv) keys.push(num + dv);

    if (doc.display) {

      var d = String(doc.display).replace(/\D/g, '');

      if (d && keys.indexOf(d) < 0) keys.push(d);

    }

    return keys;

  }



  function parseDocument(raw) {

    var prep = typeof global.normalizarEntradaNit === 'function' ? global.normalizarEntradaNit(raw) : String(raw || '').trim();

    var clean = prep.replace(/[^0-9-]/g, '');

    if (!clean) return null;

    var vr = null;

    try {

      if (typeof global.validarNIT === 'function') vr = global.validarNIT(prep, { relajado: true });

    } catch (_) {}

    if (vr && vr.valido && vr.modo === 'nit_dian' && vr.base != null) {

      return {

        typeKey: 'nit',

        type: DOC_TYPE.nit,

        number: vr.base,

        dv: String(vr.dv),

        display: vr.base + '-' + vr.dv,

        raw: prep,

      };

    }

    if (vr && vr.valido && vr.modo === 'cedula_o_documento' && vr.base) {

      return {

        typeKey: 'cc',

        type: DOC_TYPE.cc,

        number: vr.base,

        dv: '',

        display: vr.base,

        raw: prep,

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

      var sp = typeof global.intentarSepararNitDv === 'function' ? global.intentarSepararNitDv(digits) : null;

      if (sp) {

        return {

          typeKey: 'nit',

          type: DOC_TYPE.nit,

          number: sp.base,

          dv: sp.dv,

          display: sp.display,

          raw: digits,

        };

      }

      var inf = typeof global.inferirNitDesdeSoloBase === 'function' ? global.inferirNitDesdeSoloBase(digits) : null;

      if (inf) {

        return {

          typeKey: 'nit',

          type: DOC_TYPE.nit,

          number: inf.base,

          dv: inf.dv,

          display: inf.display,

          raw: digits,

        };

      }

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

    return '';

  }



  function lookupLocalCrm(doc) {

    if (typeof global.crozzoCrmGetClients !== 'function') return null;

    var list = global.crozzoCrmGetClients();

    var equiv = typeof global.crozzoCrmNitsEquivalent === 'function' ? global.crozzoCrmNitsEquivalent : null;

    var normDigits = typeof global.crozzoCrmNormNitDigits === 'function' ? global.crozzoCrmNormNitDigits : null;

    var target = doc.display || doc.number;

    var hit = list.find(function (c) {

      if (equiv && equiv(c.nit, target)) return true;

      if (normDigits && normDigits(c.nit) === normDigits(target)) return true;

      return false;

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

      var keys = docLookupKeys(doc);

      for (var i = 0; i < keys.length; i++) {

        var d = DEMO_ADQUIRIENTES[keys[i]];

        if (d) return Object.assign({}, d, { source: 'dian_demo' });

      }

    } catch (_) {}

    return null;

  }



  function crozzoDianCertPayload() {

    try {

      if (typeof global.config === 'undefined' || !global.config.get) return { useHab: false };

      var c = global.config.get('certificado') || {};

      var useHab = typeof global.config.isDemoMode === 'function' && global.config.isDemoMode();

      if (c.p12Base64 && (c.password || c.p12Password)) {

        return {

          p12Base64: c.p12Base64,

          p12Password: c.password || c.p12Password,

          useHab: useHab,

        };

      }

      return { useHab: useHab };

    } catch (_) {

      return { useHab: false };

    }

  }



  function lookupRemoteTauri(doc) {

    if (!global.__TAURI__ || !global.__TAURI__.core || typeof global.__TAURI__.core.invoke !== 'function') {

      return Promise.resolve(null);

    }

    var cert = crozzoDianCertPayload();

    return global.__TAURI__.core

      .invoke('fetch_dian_adquiriente', {

        schemeName: doc.type.schemeName,

        identification: doc.number,

        dv: doc.dv || null,

        p12Base64: cert.p12Base64 || null,

        p12Password: cert.p12Password || null,

        useHab: !!cert.useHab,

      })

      .then(function (r) {

        if (!r || !r.ok) {

          if (r && r.motivo && typeof global.showToast === 'function') {

            global.__crozzoLastDianLookupError = r.motivo;

          }

          return null;

        }

        return {

          nombre: r.name || r.nombre || r.razonSocial || '',

          email: r.email || r.correo || '',

          telefono: r.telefono || r.phone || '',

          ciudad: r.ciudad || r.municipio || '',

          direccion: r.direccion || '',

          source: 'dian_tauri',

        };

      })

      .catch(function () {

        return null;

      });

  }



  function lookupRemoteRuesOpenData(doc) {

    if (!doc || !doc.number) return Promise.resolve(null);

    var nit = String(doc.number).replace(/\D/g, '');

    if (nit.length < 6) return Promise.resolve(null);

    var url = RUES_OPENDATA_URL + '?nit=' + encodeURIComponent(nit) + '&$limit=3';

    return fetch(url, { method: 'GET', headers: { Accept: 'application/json' } })

      .then(function (r) {

        if (!r.ok) return null;

        return r.json();

      })

      .then(function (rows) {

        if (!Array.isArray(rows) || !rows.length) return null;

        var hit = rows[0];

        var nombre = String(

          hit.razon_social || hit.nombre || hit.representante_legal || ''

        ).trim();

        if (!nombre) return null;

        var base = {

          nombre: nombre,

          email: '',

          telefono: '',

          ciudad: ruesPickContact(hit.municipio, hit.municipio_comercial, hit.camara_comercio),

          direccion: '',

          source: 'rues_opendata',

        };

        var rmId = buildRuesRmId(hit.codigo_camara, hit.matricula);

        if (!rmId) return Promise.resolve(annotateRuesContactFields(base));

        return lookupRuesDetalleRm(rmId).then(function (det) {

          return mergeRuesDetalle(base, det);

        });

      })

      .catch(function () {

        return null;

      });

  }




  function sourceRank(src) {
    src = String(src || '');
    if (src.indexOf('dian') === 0 || src === 'dian_supabase' || src === 'dian_tauri' || src === 'dian_demo') return 40;
    if (src === 'crm_local' || src === 'cache') return 35;
    if (src === 'rues_opendata' || src === 'rues_enrich') return 20;
    if (src === 'scrapling_enrich') return 15;
    return 10;
  }

  function fieldPreferRank(field, src) {
    src = String(src || '');
    var dian = src.indexOf('dian') === 0 || src === 'dian_supabase' || src === 'dian_tauri' || src === 'dian_demo';
    var rues = src === 'rues_opendata' || src === 'rues_enrich';
    var scrap = src === 'scrapling_enrich';
    if (field === 'nombre' || field === 'email') {
      if (dian) return 50;
      if (src === 'crm_local') return 45;
      if (rues) return 20;
      if (scrap) return 15;
      return 10;
    }
    if (field === 'telefono' || field === 'direccion') {
      if (scrap) return 45;
      if (rues) return 40;
      if (dian) return 20;
      return 10;
    }
    if (field === 'ciudad') {
      if (rues) return 45;
      if (scrap) return 35;
      if (dian) return 20;
      return 10;
    }
    return sourceRank(src);
  }

  /** Contrasta varias fuentes: llena vacíos y anota de dónde salió cada campo. */
  function contrastMergeSources(parts) {
    var fields = ['nombre', 'email', 'telefono', 'ciudad', 'direccion'];
    var merged = {
      nombre: '',
      email: '',
      telefono: '',
      ciudad: '',
      direccion: '',
      source: '',
      _fieldSources: {},
      _contrast: '',
    };
    var bestSrc = '';
    var bestRank = -1;
    var conflicts = [];
    (parts || []).forEach(function (part) {
      if (!part || !part.data) return;
      var d = part.data;
      var src = part.source || d.source || 'internet';
      var label = part.label || sourceLabel(src) || src;
      var r = sourceRank(src);
      if (r > bestRank) {
        bestRank = r;
        bestSrc = src;
      }
      fields.forEach(function (f) {
        var val = String(d[f] || '').trim();
        if (!val) return;
        var cur = String(merged[f] || '').trim();
        var fr = fieldPreferRank(f, src);
        var curSrc = merged._fieldSources[f] || '';
        var curFr = curSrc ? fieldPreferRank(f, curSrc) : -1;
        if (!cur) {
          merged[f] = val;
          merged._fieldSources[f] = src;
          return;
        }
        if (fr > curFr) {
          if (f === 'nombre' && cur.toLowerCase() !== val.toLowerCase()) {
            conflicts.push(f + ': ' + (sourceLabel(curSrc) || curSrc) + ' vs ' + label);
          }
          merged[f] = val;
          merged._fieldSources[f] = src;
        } else if (fr === curFr && cur.toLowerCase() !== val.toLowerCase() && f === 'nombre') {
          conflicts.push(f + ': ' + (sourceLabel(curSrc) || curSrc) + ' vs ' + label);
        }
      });
    });
    merged.source = bestSrc || (parts[0] && parts[0].source) || '';
    var bits = [];
    var by = {};
    Object.keys(merged._fieldSources).forEach(function (f) {
      var src = merged._fieldSources[f];
      var lab = sourceLabel(src) || src;
      if (!by[lab]) by[lab] = [];
      by[lab].push(f);
    });
    Object.keys(by).forEach(function (lab) {
      bits.push(lab + '·' + by[lab].join('+'));
    });
    if (conflicts.length) bits.push('revisar nombre');
    merged._contrast = bits.join(' · ');
    merged._conflicts = conflicts;
    return annotateRuesContactFields(merged);
  }

  function lookupRemoteAll(doc) {

    var tasks = [];

    if (global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function') {

      tasks.push(lookupRemoteTauri(doc));

    } else {

      tasks.push(Promise.resolve(null));

    }

    tasks.push(lookupRemoteSupabase(doc));

    tasks.push(lookupRemoteRuesOpenData(doc));

    return Promise.all(

      tasks.map(function (p) {

        return p.catch(function () {

          return null;

        });

      })

    ).then(function (hits) {

      var dian = hits[0];

      var sb = hits[1];

      var rues = hits[2];

      var parts = [];
      if (dian) parts.push({ label: 'DIAN', source: dian.source || 'dian_tauri', data: dian });
      if (sb) parts.push({ label: 'nube', source: sb.source || 'dian_supabase', data: sb });
      if (rues) parts.push({ label: 'RUES', source: rues.source || 'rues_opendata', data: rues });
      if (!parts.length) return null;
      return contrastMergeSources(parts);

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



  function lookupAdquiriente(raw, opts) {

    opts = opts || {};

    var doc = parseDocument(raw);

    if (!doc) {

      return Promise.resolve({ ok: false, error: 'Revise el documento — mínimo 4 dígitos numéricos.' });

    }

    var ck = normDocKey(doc);

    if (!opts.skipCache) {

      var cached = cacheGet(ck);

      if (cached) {

        return Promise.resolve({ ok: true, doc: doc, data: cached, source: 'cache' });

      }

    }

    if (!opts.skipLocal) {

      var local = lookupLocalCrm(doc) || lookupLocalReservorio(doc);

      if (local) {

        writeCacheEntry(ck, local);

        return Promise.resolve({ ok: true, doc: doc, data: local, source: local.source });

      }

    }

    if (!opts.skipJsDemo) {

      var demo = lookupDemo(doc);

      if (demo) {

        writeCacheEntry(ck, demo);

        return Promise.resolve({ ok: true, doc: doc, data: demo, source: demo.source });

      }

    }

    return lookupRemoteAll(doc).then(function (remote) {

      if (remote) {

        writeCacheEntry(ck, remote);

        return { ok: true, doc: doc, data: remote, source: remote.source };

      }

      return {

        ok: false,

        doc: doc,

        soft: true,

        error: 'No hay datos en internet para ese documento — escriba nombre y correo.',

      };

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



  function persistLookupToPos(data, doc) {

    if (typeof global.crozzoCrmEnsureClientFromLookup === 'function') {

      return global.crozzoCrmEnsureClientFromLookup(data, doc);

    }

    if (data && data.clientId && typeof global.crozzoCrmApplyClientToUi === 'function') {

      var c = typeof global.crozzoCrmClientById === 'function' ? global.crozzoCrmClientById(data.clientId) : null;

      if (c) {

        global.crozzoCrmApplyClientToUi(c);

        return c;

      }

    }

    return null;

  }


  function tryApplyExistingClient(profileKey, data) {

    if (!data || !data.clientId) return false;

    if (typeof global.crozzoCrmClientById !== 'function' || typeof global.crozzoCrmApplyClientToUi !== 'function') {

      return false;

    }

    var c = global.crozzoCrmClientById(data.clientId);

    if (!c) return false;

    global.crozzoCrmApplyClientToUi(c);

    if (typeof global.showToast === 'function') {

      global.showToast('Cliente listo.', 'success');

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

    lookupAdquiriente(raw, { skipJsDemo: true })

      .then(function (res) {

        pendingByProfile[profileKey] = false;

        nitEl.classList.remove('crozzo-adq-input--busy');

        if (res.ok && res.data) {

          if (res.data.clientId && tryApplyExistingClient(profileKey, res.data)) {

            setStatus(p.status, '<span class="form-success">✓ Cliente listo</span>');

            setHint(p.hint, '');

            return;

          }

          applyLookupToForm(profileKey, res.data);

          try {

            persistLookupToPos(res.data, res.doc);

          } catch (_) {}

          var contrast = String((res.data && res.data._contrast) || '').trim();

          var feSum =
            typeof feReadinessSummary === 'function' ? feReadinessSummary(res.data, res.doc) : '';
          setStatus(
            p.status,
            '<span class="form-success">✓ ' +
              (contrast || 'Datos contrastados') +
              '</span>' +
              (feSum && !contrast ? ' <small>· ' + feSum + '</small>' : '')
          );

          setHint(p.hint, '');

          if (!opts.silent && typeof global.showToast === 'function') {
            global.showToast(contrast || feSum || 'Datos del cliente listos.', res.data.email ? 'success' : 'info');

          }

          if (

            global.CrozzoOperativePsyche &&

            typeof global.CrozzoOperativePsyche.maybeAffirm === 'function'

          ) {

            global.CrozzoOperativePsyche.maybeAffirm('cliente_lookup_ok');

          }

          try {

            if (res.doc) scheduleEnrichment(res.doc, res.data, profileKey);

          } catch (_) {}

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

    if (!doc || raw.replace(/\D/g, '').length < 6) return;

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

      '<div class="crozzo-adq-comfort crozzo-adq-comfort--compact">' +

      '<div id="' +

      hintId +

      '" class="crozzo-adq-doc-hint-wrap" hidden></div>' +

      '<div class="crozzo-adq-lookup-row">' +

      '<button type="button" class="btn btn-outline btn-sm crozzo-adq-lookup-btn" onclick="CrozzoAdquirienteLookup.runForForm(\'' +

      profileKey +

      '\')" title="Consultar RUES / DIAN">' +

      'Buscar datos</button>' +

      '<span id="' +

      statusId +

      '" class="crozzo-adq-lookup-status form-hint"></span>' +

      '</div></div>'

    );

  }



  global.CrozzoAdquirienteLookup = {

    parseDocument: parseDocument,

    lookupAdquiriente: lookupAdquiriente,

    getFeReadiness: getFeReadiness,

    feReadinessSummary: feReadinessSummary,

    feReadinessHtml: feReadinessHtml,

    persistLookupToPos: persistLookupToPos,

    scheduleEnrichment: scheduleEnrichment,
    contrastMergeSources: contrastMergeSources,

    needsContactEnrichment: needsContactEnrichment,

    runForForm: runForForm,

    bindForm: bindForm,

    bindAllVisible: bindAllVisible,

    lookupFieldHtml: lookupFieldHtml,

    canUseDianLookup: canUseDianLookup,

    SOURCE_LABEL: SOURCE_LABEL,

  };



  if (document.readyState === 'loading') {

    document.addEventListener('DOMContentLoaded', function () {

      setTimeout(bindAllVisible, 300);

    });

  }

})(typeof window !== 'undefined' ? window : globalThis);


