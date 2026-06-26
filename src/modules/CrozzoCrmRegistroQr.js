/**
 * Crozzo POS — QR de autoregistro de clientes vía Supabase (token ~1 h).
 * Caja o tablet generan el QR; el cliente escanea con datos móviles (sin Wi‑Fi del local).
 */
(function (global) {
  'use strict';

  var CFG_KEY = 'crmRegistroQr';
  var TOKENS_TABLE = 'crozzo_crm_registro_tokens';
  var INTAKE_TABLE = 'crozzo_crm_registro_intake';
  var STORAGE_BUCKET = 'crozzo-public';
  var STORAGE_OBJECT = 'crm-registro-cliente.html';
  var STORAGE_FALLBACK_BUCKET = 'oficina-docs';
  var STORAGE_FALLBACK_OBJECT = 'crozzo/crm-registro-cliente.html';
  var TTL_MS = 60 * 60 * 1000;
  var POLL_MS = 5000;
  var HTML_VERSION = 5;
  var URL_MODE_FUNCTION = 'function';
  var URL_MODE_STORAGE = 'storage';
  var URL_MODE_RELAY = 'relay';
  /** Formulario web central Crozzo — un solo deploy en nube (no por PC). */
  var CRM_REG_RELAY_FN = 'https://usookdisddnqsahtepce.supabase.co/functions/v1/crm-registro-cliente';
  var _pollTimer = null;
  var _tableMissing = false;
  var _tableMissingNotified = false;
  var STORAGE_UPLOAD_CANDIDATES = [
    { bucket: 'crozzo-public', object: 'crm-registro-cliente.html' },
    { bucket: 'crozzo-public', object: 'crm-registro/index.html' },
    { bucket: 'crozzo-public', object: 'crm-registro-cliente.htm' },
    { bucket: 'oficina-docs', object: 'crozzo/crm-registro-cliente.html' },
  ];
  var _kioskEl = null;
  var _kioskRetryTimer = null;

  function crmQrFeatureEnabled() {
    return typeof global.crozzoClientFeatureEnabled === 'function'
      ? global.crozzoClientFeatureEnabled('crm_registro_qr')
      : false;
  }

  function notifyQrFeatureLocked() {
    if (typeof global.crozzoNotifyFeatureLocked === 'function') {
      global.crozzoNotifyFeatureLocked('QR clientes');
    } else if (typeof global.showToast === 'function') {
      global.showToast('Próximamente en versiones avanzadas', 'info');
    }
  }

  function renderPanelHtmlLocked() {
    var hint =
      typeof global.crozzoRenderFeatureLockedHint === 'function'
        ? global.crozzoRenderFeatureLockedHint()
        : '<p class="crozzo-feature-locked-hint">Próximamente en versiones avanzadas</p>';
    return (
      '<div class="crozzo-crm-reg-panel card crozzo-crm-reg-panel--locked" id="crozzoCrmRegPanel" style="margin-top:16px;">' +
      '<div class="card-header" style="padding-bottom:8px;">' +
      '<div><h3 class="card-title" style="font-size:1rem;margin:0;">📲 QR para clientes</h3>' +
      '<p class="form-hint" style="margin:6px 0 0;">Autoregistro desde el celular del cliente.</p></div></div>' +
      '<div class="crozzo-crm-reg-body crozzo-crm-reg-body--compact">' +
      hint +
      '</div></div>'
    );
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function readCfg() {
    try {
      if (global.config && global.config.get) {
        var c = global.config.get(CFG_KEY);
        if (c && typeof c === 'object') return c;
      }
    } catch (_) {}
    return null;
  }

  function writeCfg(patch) {
    if (!global.config || !global.config.get || !global.config.set || !global.config.save) return null;
    var cur = readCfg() || {};
    var next = Object.assign({}, cur, patch || {});
    global.config.set(CFG_KEY, next);
    try {
      global.config.save();
    } catch (_) {}
    return next;
  }

  function randomToken() {
    var a = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var out = 'crmq_';
    for (var i = 0; i < 22; i++) out += a.charAt(Math.floor(Math.random() * a.length));
    return out;
  }

  function cloudCreds() {
    if (typeof global.crozzoResolveSupabaseCredentials !== 'function') return null;
    var c = global.crozzoResolveSupabaseCredentials();
    if (!c || !c.syncOn || !c.url || !c.key) return null;
    if (typeof global.isValidSupabasePair === 'function' && !global.isValidSupabasePair(c.url, c.key)) return null;
    return c;
  }

  function cloudReady() {
    return (
      typeof global.crozzoTierAllowsCloudSync === 'function' &&
      global.crozzoTierAllowsCloudSync() &&
      !!global.__SUPABASE &&
      !!cloudCreds()
    );
  }

  function sbBase() {
    var c = cloudCreds();
    if (!c) return '';
    return typeof global.crozzoNormalizeSupabaseProjectUrl === 'function'
      ? global.crozzoNormalizeSupabaseProjectUrl(c.url)
      : String(c.url || '').replace(/\/+$/, '');
  }

  function cloudProjectRef() {
    var base = sbBase();
    var m = base.match(/https?:\/\/([^.]+)\.supabase\.co/i);
    return m ? m[1] : '';
  }

  function renderStaffQrWaitHtml() {
    return (
      '<p class="form-hint" style="text-align:center;margin:12px 0;">Generando codigo QR…</p>'
    );
  }

  function staffToast(msg, kind) {
    if (typeof global.showToast === 'function') global.showToast(msg, kind || 'info');
  }

  function isCustomerKioskContext(statusId, qrHostId) {
    var s = String(statusId || '') + String(qrHostId || '');
    return s.indexOf('Kiosk') >= 0;
  }

  function renderCustomerKioskWaitHtml(soft) {
    return (
      '<div class="crozzo-crm-reg-kiosk__wait' +
      (soft ? ' is-soft' : '') +
      '">' +
      '<div class="crozzo-crm-reg-kiosk__wait-pulse" aria-hidden="true"></div>' +
      '<p class="crozzo-crm-reg-kiosk__wait-title">' +
      (soft ? 'QR en un momento' : 'Preparando codigo QR…') +
      '</p>' +
      '<p class="crozzo-crm-reg-kiosk__wait-sub">' +
      (soft ? 'Si tarda, avise al personal en caja' : 'Un instante, por favor') +
      '</p>' +
      '</div>'
    );
  }

  function stopKioskAutoRetry() {
    if (_kioskRetryTimer) {
      clearInterval(_kioskRetryTimer);
      _kioskRetryTimer = null;
    }
  }

  function startKioskAutoRetry(qrSize) {
    stopKioskAutoRetry();
    _kioskRetryTimer = setInterval(function () {
      if (!_kioskEl) {
        stopKioskAutoRetry();
        return;
      }
      var cfg = readCfg() || {};
      if (!cfg.token || tokenExpired(cfg)) return;
      safeQrUrlForToken(cfg.token).then(function (url) {
        if (!url) return;
        var qrHost = document.getElementById('crozzoCrmRegKioskQr');
        var statusEl = document.getElementById('crozzoCrmRegKioskStatus');
        if (qrHost) qrHost.innerHTML = renderQrImg(url, qrSize || 280, 'crozzoCrmRegKioskQrCanvas');
        if (statusEl) {
          statusEl.textContent = formatExpiryLabel(cfg);
          statusEl.className = 'crozzo-crm-reg-kiosk__status is-on';
        }
        stopKioskAutoRetry();
      });
    }, 12000);
  }

  function notifyStaffQrPending() {
    staffToast('No se pudo mostrar el QR. Avise a administracion del local.', 'warning');
  }

  function bindSetupHintActions() {
    /* reservado — configuracion solo en Super Admin → Nube */
  }

  function openCrmRegistroSqlWizard() {
    if (typeof global.crozzoNubeOpenCrmRegistroSql === 'function') {
      global.crozzoNubeOpenCrmRegistroSql();
      return;
    }
    if (typeof global.navigateTo === 'function') {
      global.__crozzoPendingSqlScriptKey = 'crm_registro_qr';
      global.navigateTo('super-admin-nube');
    }
  }

  function getCrmRegistroSqlText() {
    try {
      if (global.CrozzoSupabaseSqlExtras && global.CrozzoSupabaseSqlExtras.list) {
        var list = global.CrozzoSupabaseSqlExtras.list();
        var s = list.find(function (x) {
          return x.key === 'crm_registro_qr';
        });
        if (s && s.sql) return s.sql;
      }
    } catch (_) {}
    return '';
  }

  function copyCrmRegistroSql() {
    var sql = getCrmRegistroSqlText();
    if (!sql) {
      if (typeof global.showToast === 'function') global.showToast('Script 18 no cargado — recargue F5', 'warning');
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(sql).then(
        function () {
          if (typeof global.showToast === 'function') {
            global.showToast('SQL script 18 copiado — pegue en Supabase SQL Editor → Run', 'success');
          }
        },
        function () {
          if (typeof global.showToast === 'function') global.showToast('No se pudo copiar', 'error');
        }
      );
    }
  }

  function businessId() {
    return typeof global.getBusinessId === 'function' ? global.getBusinessId() : 'default';
  }

  function businessLabel() {
    try {
      var emp = (global.config && global.config.get && global.config.get('empresa')) || {};
      var md =
        typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() || {} : {};
      return String(
        md.businessName ||
          emp.nombreComercial ||
          emp.razonSocial ||
          emp.nombre ||
          (typeof global.crozzoAppDisplayName === 'function' ? global.crozzoAppDisplayName() : '') ||
          'Local'
      ).trim();
    } catch (_) {
      return 'Local';
    }
  }

  function tokenExpired(cfg) {
    cfg = cfg || readCfg() || {};
    var exp = cfg.expiresAt || cfg.expires_at;
    if (!exp) return true;
    return Date.parse(exp) <= Date.now();
  }

  function isTableMissingError(err) {
    var msg = String((err && err.message) || err || '');
    return /relation|does not exist|PGRST205|schema cache|Could not find the table|404/i.test(msg);
  }

  function notifyTableMissingOnce() {
    if (_tableMissingNotified) return;
    _tableMissingNotified = true;
    staffToast('QR no disponible. Avise a administracion del local.', 'warning');
  }

  function markTableMissing(err) {
    if (_tableMissing) return;
    if (!isTableMissingError(err)) return;
    _tableMissing = true;
    notifyTableMissingOnce();
  }

  function relayFunctionUrl() {
    if (global.CROZZO_CRM_REG_RELAY_FN) return String(global.CROZZO_CRM_REG_RELAY_FN).replace(/\/+$/, '');
    return CRM_REG_RELAY_FN;
  }

  function ownRegistroFunctionUrl() {
    return sbBase() + '/functions/v1/crm-registro-cliente';
  }

  function publicRegistroFunctionUrl() {
    return relayFunctionUrl() || ownRegistroFunctionUrl();
  }

  function registroFunctionCandidates() {
    var out = [];
    var relay = relayFunctionUrl();
    var own = ownRegistroFunctionUrl();
    if (relay) out.push(relay);
    if (!relay || relay !== own) out.push(own);
    return out;
  }

  function buildRegistroProbeUrl(base) {
    var c = cloudCreds();
    var url = String(base || '').split('?')[0] + '?t=probe&bid=default&b=probe';
    if (c) {
      url += '&sb=' + encodeURIComponent(sbBase());
      url += '&ak=' + encodeURIComponent(c.key);
    }
    return url;
  }

  function publicRegistroStorageUrl(bucket, object) {
    bucket = bucket || readCfg()?.storageBucket || STORAGE_BUCKET;
    object = object || readCfg()?.storageObject || STORAGE_OBJECT;
    return sbBase() + '/storage/v1/object/public/' + bucket + '/' + object;
  }

  function publicRegistroPageUrl() {
    return publicRegistroFunctionUrl();
  }

  function isPublicCloudRegistroUrl(url) {
    var u = String(url || '').trim().toLowerCase();
    return (
      u.indexOf('.supabase.co/functions/v1/crm-registro-cliente') > 0 ||
      (u.indexOf('.supabase.co/storage/v1/object/public/') > 0 && u.indexOf('crm-registro') > 0)
    );
  }

  function registroPageBaseUrl(cfg) {
    cfg = cfg || readCfg() || {};
    if (cfg.qrBaseUrl) {
      return String(cfg.qrBaseUrl).split('?')[0];
    }
    if (cfg.qrBaseMode === URL_MODE_RELAY || cfg.urlMode === URL_MODE_RELAY) {
      return relayFunctionUrl() || publicRegistroFunctionUrl();
    }
    if (cfg.functionAvailable === true || cfg.qrBaseMode === URL_MODE_FUNCTION) {
      return ownRegistroFunctionUrl();
    }
    return relayFunctionUrl() || ownRegistroFunctionUrl();
  }

  function persistQrBase(base, mode, bucket, object) {
    var patch = {
      qrBaseUrl: base,
      qrBaseMode: mode,
      pageReady: true,
      urlMode: mode === URL_MODE_RELAY ? URL_MODE_RELAY : mode === 'function' ? URL_MODE_FUNCTION : URL_MODE_STORAGE,
      functionAvailable: mode === 'function' || mode === URL_MODE_RELAY,
      storagePageReady: mode === 'storage',
    };
    if (bucket) patch.storageBucket = bucket;
    if (object) patch.storageObject = object;
    writeCfg(patch);
  }

  /** El celular solo debe escanear URLs que Supabase sirva como text/html (Storage no sirve HTML). */
  function checkUrlServesHtmlPage(url) {
    var raw = String(url || '').trim();
    if (!raw) return Promise.resolve(false);
    var testUrl = raw.indexOf('?') >= 0 ? raw : buildRegistroProbeUrl(raw);
    return fetch(testUrl, { method: 'GET', cache: 'no-store' })
      .then(function (res) {
        var ct = String(res.headers.get('content-type') || '').toLowerCase();
        return res.text().then(function (body) {
          var looksHtml = body.indexOf('<!DOCTYPE') >= 0 || body.indexOf('<html') >= 0;
          if (!res.ok || !looksHtml) return false;
          return ct.indexOf('text/html') >= 0 || ct.indexOf('application/xhtml') >= 0;
        });
      })
      .catch(function () {
        return false;
      });
  }

  function probeRegistroFunctionAt(base) {
    return checkUrlServesHtmlPage(buildRegistroProbeUrl(base));
  }

  function resolveQrBaseUrl(opts) {
    opts = opts || {};
    var cfg = readCfg() || {};
    if (!opts.forceUpload && cfg.qrBaseUrl) {
      return probeRegistroFunctionAt(cfg.qrBaseUrl).then(function (ok) {
        if (ok) {
          return { ok: true, base: cfg.qrBaseUrl, mode: cfg.qrBaseMode || URL_MODE_RELAY };
        }
        writeCfg({ qrBaseUrl: null, pageReady: false, functionAvailable: false });
        return resolveQrBaseUrl({ forceUpload: true });
      });
    }
    var candidates = registroFunctionCandidates();
    var chain = Promise.reject(new Error('start'));
    candidates.forEach(function (base) {
      chain = chain.catch(function () {
        return probeRegistroFunctionAt(base).then(function (ok) {
          if (!ok) throw new Error('no_html');
          var mode = base === relayFunctionUrl() ? URL_MODE_RELAY : URL_MODE_FUNCTION;
          persistQrBase(base, mode);
          return { ok: true, base: base, mode: mode };
        });
      });
    });
    return chain.catch(function () {
      return {
        ok: false,
        needsFunction: true,
        message: 'No se pudo preparar el QR. Avise a administracion del local.',
      };
    });
  }

  function buildCloudRegistroUrl(token) {
    if (!token) return '';
    var base = registroPageBaseUrl();
    if (!base || !isPublicCloudRegistroUrl(base)) return '';
    var c = cloudCreds();
    var url =
      base +
      '?t=' +
      encodeURIComponent(token) +
      '&bid=' +
      encodeURIComponent(businessId()) +
      '&b=' +
      encodeURIComponent(businessLabel());
    if (c) {
      url += '&sb=' + encodeURIComponent(sbBase());
      url += '&ak=' + encodeURIComponent(c.key);
    }
    return url;
  }

  function safeQrUrlForToken(token) {
    var url = buildCloudRegistroUrl(token);
    if (!url) return Promise.resolve('');
    return checkUrlServesHtmlPage(url).then(function (ok) {
      return ok ? url : '';
    });
  }

  function utf8HtmlBlob(html) {
    return new Blob([sanitizeRegistroHtml(html)], { type: 'text/html;charset=utf-8' });
  }

  function getRegistroHtmlTemplate() {
    var tpl = global.__CROZZO_CRM_REG_HTML_TEMPLATE;
    if (tpl && String(tpl).indexOf('<!DOCTYPE') >= 0) {
      return Promise.resolve(String(tpl));
    }
    return Promise.reject(
      new Error('Plantilla de registro no cargada. Recargue la app (F5) e intente de nuevo.')
    );
  }

  function buildRegistroHtmlForUpload() {
    var c = cloudCreds();
    if (!c) return Promise.reject(new Error('Supabase no configurado'));
    var inject = JSON.stringify({
      sb: sbBase(),
      ak: c.key,
      bid: businessId(),
      biz: businessLabel(),
      v: HTML_VERSION,
    });
    return getRegistroHtmlTemplate().then(function (html) {
      html = sanitizeRegistroHtml(html);
      return html.replace('/*CROZZO_REG_INJECT*/null', inject);
    });
  }

  /** Quita scripts que Tauri dev inyecta al leer HTML local (no deben subirse a Supabase). */
  function sanitizeRegistroHtml(html) {
    return String(html || '')
      .replace(/<script[\s\S]*?__tauri_cli[\s\S]*?<\/script>\s*/gi, '')
      .replace(/<script[\s\S]*?trunk[\s\S]*?autoreload[\s\S]*?<\/script>\s*/gi, '')
      .replace(/^\uFEFF/, '');
  }

  function fixHtmlMimetypeRpc(bucket, object) {
    var sb = global.__SUPABASE;
    if (!sb || typeof sb.rpc !== 'function') return Promise.resolve();
    return sb
      .rpc('crozzo_crm_registro_fix_html_mimetype', { p_bucket: bucket, p_path: object })
      .then(function () {})
      .catch(function () {});
  }

  function probeFunctionUrl() {
    var relay = relayFunctionUrl();
    return probeRegistroFunctionAt(relay || ownRegistroFunctionUrl()).then(function (ok) {
      if (ok) {
        writeCfg({
          urlMode: relay ? URL_MODE_RELAY : URL_MODE_FUNCTION,
          functionAvailable: true,
          pageReady: true,
        });
        return true;
      }
      return probeRegistroFunctionAt(ownRegistroFunctionUrl()).then(function (ok2) {
        writeCfg({
          urlMode: ok2 ? URL_MODE_FUNCTION : URL_MODE_STORAGE,
          functionAvailable: !!ok2,
          pageReady: !!ok2,
        });
        return ok2;
      });
    });
  }

  function backgroundUploadRegistroHtml() {
    if (!cloudReady()) return;
    uploadRegistroPageHtml().catch(function () {});
  }

  function verifyPublicRegistroPage(bucket, object) {
    var cfg = readCfg() || {};
    var url =
      cfg.urlMode === URL_MODE_STORAGE
        ? publicRegistroStorageUrl(bucket, object)
        : publicRegistroFunctionUrl() + '?t=verify&bid=default&b=verify';
    return fetch(url, { method: 'GET', cache: 'no-store' })
      .then(function (res) {
        var ct = String(res.headers.get('content-type') || '').toLowerCase();
        if (!res.ok) {
          throw new Error('Formulario publico no accesible (' + res.status + ')');
        }
        if (ct.indexOf('text/html') < 0) {
          throw new Error('Supabase sirve HTML como ' + (ct || 'texto') + ' — corrija mimetype o active la funcion en la nube (Supabase).');
        }
        return res.text();
      })
      .then(function (body) {
        if (body.indexOf('<!DOCTYPE') < 0 && body.indexOf('<html') < 0) {
          throw new Error('El enlace publico no devuelve una pagina web.');
        }
        if (body.indexOf('__tauri_cli') >= 0) {
          throw new Error('Formulario contaminado con script de desarrollo.');
        }
        return cfg.urlMode === URL_MODE_STORAGE
          ? publicRegistroStorageUrl(bucket, object)
          : publicRegistroFunctionUrl();
      });
  }

  function uploadViaRest(bucket, object, html) {
    var c = cloudCreds();
    if (!c) return Promise.reject(new Error('Supabase no configurado'));
    var base = sbBase();
    var clean = sanitizeRegistroHtml(html);
    return fetch(base + '/storage/v1/object/' + bucket + '/' + object, {
      method: 'POST',
      headers: {
        apikey: c.key,
        Authorization: 'Bearer ' + c.key,
        'Content-Type': 'text/html',
        'x-upsert': 'true',
      },
      body: clean,
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (body) {
          throw new Error(body || 'Error subiendo HTML (' + res.status + ')');
        });
      }
      return fixHtmlMimetypeRpc(bucket, object);
    });
  }

  function uploadToBucket(bucket, object, html) {
    var sb = global.__SUPABASE;
    if (!sb || !sb.storage) {
      return Promise.reject(new Error('Cliente Supabase no listo'));
    }
    return uploadViaRest(bucket, object, html)
      .catch(function () {
        var blob = utf8HtmlBlob(html);
        return sb.storage
          .from(bucket)
          .upload(object, blob, {
            contentType: 'text/html; charset=utf-8',
            cacheControl: '120',
            upsert: true,
          })
          .then(function (res) {
            if (res.error) throw res.error;
            return fixHtmlMimetypeRpc(bucket, object);
          });
      })
      .then(function () {
        writeCfg({
          storageBucket: bucket,
          storageObject: object,
          htmlVersion: HTML_VERSION,
          htmlUploadedAt: new Date().toISOString(),
          storagePageReady: true,
          pageReady: true,
          urlMode: URL_MODE_STORAGE,
        });
        return publicRegistroStorageUrl(bucket, object);
      });
  }

  function storageRlsHint(msg) {
    var m = String(msg || '');
    if (/row-level security|42501|403|401/i.test(m)) {
      return (
        'Storage Supabase sin permiso (RLS). Super Admin → SQL → script 18 (Autoregistro CRM) y ejecute de nuevo. ' +
        'Alternativa: active la funcion en la nube crm-registro-cliente (docs/SUPABASE-EDGE-CRM-REGISTRO.md).'
      );
    }
    return m || 'No se pudo publicar formulario en Supabase Storage';
  }

  function uploadRegistroPageHtml() {
    if (!cloudReady()) return Promise.reject(new Error('Supabase no configurado'));
    return buildRegistroHtmlForUpload().then(function (html) {
      return uploadToBucket(STORAGE_BUCKET, STORAGE_OBJECT, html).catch(function (err) {
        return uploadToBucket(STORAGE_FALLBACK_BUCKET, STORAGE_FALLBACK_OBJECT, html).catch(function (err2) {
          var msg = (err && err.message) || (err2 && err2.message) || 'No se pudo publicar formulario en Supabase Storage';
          throw new Error(storageRlsHint(msg));
        });
      });
    });
  }

  function verifyStoragePageHtml(bucket, object, retry) {
    var url = publicRegistroStorageUrl(bucket, object);
    return fetch(url, { method: 'GET', cache: 'no-store' })
      .then(function (res) {
        return res.text().then(function (body) {
          var ct = String(res.headers.get('content-type') || '').toLowerCase();
          var looksHtml = body.indexOf('<!DOCTYPE') >= 0 || body.indexOf('<html') >= 0;
          if (!res.ok) {
            throw new Error('Formulario no accesible (' + res.status + ')');
          }
          if (!looksHtml) {
            throw new Error('El enlace no devuelve una pagina web valida');
          }
          if (ct.indexOf('text/html') >= 0) {
            writeCfg({
              storagePageReady: true,
              urlMode: URL_MODE_STORAGE,
              storageBucket: bucket,
              storageObject: object,
              pageReady: true,
            });
            return true;
          }
          if (retry > 0) {
            return fixHtmlMimetypeRpc(bucket, object).then(function () {
              return verifyStoragePageHtml(bucket, object, retry - 1);
            });
          }
          writeCfg({
            storagePageReady: true,
            urlMode: URL_MODE_STORAGE,
            storageBucket: bucket,
            storageObject: object,
            pageReady: true,
          });
          return true;
        });
      });
  }

  /** Publica y verifica URL segura para celular (text/html, no codigo fuente). */
  function activateRegistroPage(opts) {
    opts = opts || {};
    if (!cloudReady()) {
      return Promise.reject(new Error('Configure Supabase en Super Admin → Nube'));
    }
    return resolveQrBaseUrl({ forceUpload: !!opts.forceUpload }).catch(function (err) {
      var msg = String((err && err.message) || err || '');
      if (/row-level security|42501|403|401|permission|does not exist|PGRST/i.test(msg)) {
        return {
          ok: false,
          needsSql: true,
          message:
            'Falta ejecutar SQL script 18 en Supabase (Super Admin → Nube → Autoregistro clientes QR). Luego pulse Activar de nuevo.',
        };
      }
      return {
        ok: false,
        needsFunction: /codigo|edge function|mime|text\/plain/i.test(msg),
        message: msg || 'No se pudo publicar el formulario',
      };
    });
  }

  function prepareRegistroDelivery(opts) {
    return activateRegistroPage(opts || {});
  }

  function ensurePublicRegistroPage() {
    return prepareRegistroDelivery({ strict: false }).then(function () {});
  }

  function renderQrImg(url, size, hostId) {
    var sz = size || 200;
    var elId = hostId || 'crozzoCrmRegQrCanvas';
    setTimeout(function () {
      var host = document.getElementById(elId);
      if (!host) return;
      host.innerHTML = '';
      if (typeof global.QRCode !== 'undefined') {
        try {
          new global.QRCode(host, {
            text: url,
            width: sz,
            height: sz,
            colorDark: '#0f172a',
            colorLight: '#ffffff',
            correctLevel: global.QRCode.CorrectLevel ? global.QRCode.CorrectLevel.M : 0,
          });
          return;
        } catch (_) {}
      }
      host.innerHTML =
        '<img src="https://api.qrserver.com/v1/create-qr-code/?size=' +
        sz +
        'x' +
        sz +
        '&data=' +
        encodeURIComponent(url) +
        '" width="' +
        sz +
        '" height="' +
        sz +
        '" alt="QR registro cliente" style="image-rendering:pixelated;border-radius:8px;"/>';
    }, 80);
    return (
      '<div id="' +
      elId +
      '" class="crozzo-crm-reg-qr-canvas" style="margin:0 auto;width:' +
      sz +
      'px;height:' +
      sz +
      'px;"></div>'
    );
  }

  function importPayloadToCrm(payload, meta) {
    meta = meta || {};
    if (typeof global.crozzoCrmValidateRequiredClientFields !== 'function') {
      return { ok: false, msg: 'CRM no disponible' };
    }
    var nitRaw = String(payload.nit || payload.documento || '').trim();
    var nom = String(payload.nombre || payload.razonSocial || '').trim();
    var emails = [];
    if (payload.email) emails.push(String(payload.email).trim());
    if (Array.isArray(payload.emails)) emails = emails.concat(payload.emails.map(String));
    emails = emails.filter(Boolean);
    var req = global.crozzoCrmValidateRequiredClientFields(nitRaw, nom, emails);
    if (!req.ok) return req;

    var list = global.crozzoCrmGetClients ? global.crozzoCrmGetClients() : [];
    if (!Array.isArray(list)) list = [];
    var dup = list.find(function (x) {
      return typeof global.crozzoCrmNitsEquivalent === 'function' && global.crozzoCrmNitsEquivalent(x.nit, req.nit);
    });
    if (dup) {
      dup.nombre = nom || dup.nombre;
      if (req.emails.length) {
        if (typeof global.crozzoCrmApplyEmailsToClientRecord === 'function') {
          global.crozzoCrmApplyEmailsToClientRecord(dup, req.emails);
        } else {
          dup.emails = req.emails;
          dup.email = req.emails[0];
        }
      }
      if (payload.telefono) dup.telefono = String(payload.telefono).trim();
      if (payload.ciudad) dup.ciudad = String(payload.ciudad).trim();
      if (payload.direccion) dup.direccion = String(payload.direccion).trim();
      if (payload.fechaNacimiento && !String(dup.fechaNacimiento || '').trim()) {
        dup.fechaNacimiento = String(payload.fechaNacimiento).trim();
      }
      if (!dup.notas) dup.notas = '';
      if (meta.origen === 'qr_registro' && dup.notas.indexOf('QR') < 0) {
        dup.notas = (dup.notas ? dup.notas + ' · ' : '') + 'Autoregistro QR';
      }
      global.config.save();
      if (typeof global.crozzoCrmEnqueueClientSync === 'function') global.crozzoCrmEnqueueClientSync(dup);
      return { ok: true, client: dup, updated: true };
    }

    var c = {
      id: typeof global.crozzoCrmNewClientId === 'function' ? global.crozzoCrmNewClientId() : 'crm_' + Date.now(),
      nit: req.nit || '',
      nombre: nom,
      telefono: String(payload.telefono || '').trim(),
      email: '',
      emails: [],
      ciudad: String(payload.ciudad || '').trim(),
      direccion: String(payload.direccion || '').trim(),
      notas: meta.origen === 'qr_registro' ? 'Autoregistro QR' : '',
      limiteCredito: 0,
      creditoUsado: 0,
      puntos: 0,
      totalCompras: 0,
      historial: [],
    };
    if (typeof global.CrozzoCrmIntel !== 'undefined' && global.CrozzoCrmIntel.applyDefaultClientFields) {
      global.CrozzoCrmIntel.applyDefaultClientFields(c);
    }
    if (payload.fechaNacimiento) c.fechaNacimiento = String(payload.fechaNacimiento).trim();
    if (typeof global.crozzoCrmApplyEmailsToClientRecord === 'function') {
      global.crozzoCrmApplyEmailsToClientRecord(c, req.emails);
    } else {
      c.emails = req.emails;
      c.email = req.emails[0] || '';
    }
    list.push(c);
    global.config.set('clientesCrm', list);
    global.config.save();
    if (typeof global.crozzoCrmEnqueueClientSync === 'function') global.crozzoCrmEnqueueClientSync(c);
    try {
      if (typeof global.config.addAudit === 'function') {
        global.config.addAudit('crm_cliente_qr', 'Autoregistro: ' + nom + (req.nit ? ' · ' + req.nit : ''));
      }
    } catch (_) {}
    return { ok: true, client: c, created: true };
  }

  function pollCloudIntakeOnce() {
    if (!cloudReady() || _tableMissing) return Promise.resolve(0);
    var sb = global.__SUPABASE;
    var bid = businessId();
    return sb
      .from(INTAKE_TABLE)
      .select('id,payload,created_at')
      .eq('business_id', bid)
      .eq('processed', false)
      .order('created_at', { ascending: true })
      .limit(25)
      .then(function (res) {
        if (res.error) {
          markTableMissing(res.error);
          return 0;
        }
        var rows = res.data || [];
        if (!rows.length) return 0;
        var n = 0;
        var chain = Promise.resolve();
        rows.forEach(function (row) {
          chain = chain.then(function () {
            var payload = row.payload || {};
            var r = importPayloadToCrm(payload, { origen: 'qr_registro', intakeId: row.id });
            if (!r.ok) return;
            n++;
            var msg = r.created ? 'Cliente nuevo: ' + payload.nombre : 'Cliente actualizado: ' + payload.nombre;
            if (typeof global.showToast === 'function') global.showToast('📲 ' + msg, 'success');
            return sb
              .from(INTAKE_TABLE)
              .update({ processed: true, processed_at: new Date().toISOString() })
              .eq('id', row.id);
          });
        });
        return chain.then(function () {
          if (n && typeof global.crozzoCajaClientesRefreshTable === 'function') {
            global.crozzoCajaClientesRefreshTable();
          }
          return n;
        });
      })
      .catch(function () {
        return 0;
      });
  }

  function startPolling() {
    stopPolling();
    if (!cloudReady()) return;
    _pollTimer = setInterval(function () {
      pollCloudIntakeOnce();
    }, POLL_MS);
    pollCloudIntakeOnce();
  }

  function stopPolling() {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
  }

  function ensureCrmRegistroSchema() {
    if (!cloudReady() || !global.__SUPABASE || typeof global.__SUPABASE.rpc !== 'function') {
      return Promise.resolve(false);
    }
    return global.__SUPABASE.rpc('crozzo_crm_registro_bootstrap')
      .then(function (res) {
        if (res.error) return false;
        return !!(res.data && res.data.ok);
      })
      .catch(function () {
        return false;
      });
  }

  function insertCloudTokenOnly() {
    if (!cloudReady()) {
      return Promise.reject(new Error('QR no disponible'));
    }
    var sb = global.__SUPABASE;
    var token = randomToken();
    var expiresAt = new Date(Date.now() + TTL_MS).toISOString();
    var deviceId =
      typeof global.crozzoCloudDeviceUuidForRest === 'function' ? global.crozzoCloudDeviceUuidForRest() : '';
    return ensureCrmRegistroSchema().then(function () {
      return sb
        .from(TOKENS_TABLE)
        .insert({
          token: token,
          business_id: businessId(),
          business_name: businessLabel(),
          expires_at: expiresAt,
          created_by_device: deviceId,
          revoked: false,
        })
        .select('token,expires_at')
        .single()
        .then(function (res) {
          if (res.error) {
            markTableMissing(res.error);
            throw new Error('No se pudo crear el codigo QR');
          }
          var row = res.data || {};
          writeCfg({
            token: row.token || token,
            expiresAt: row.expires_at || expiresAt,
            createdAt: new Date().toISOString(),
          });
          return readCfg();
        });
    });
  }

  function createCloudToken(opts) {
    opts = opts || {};
    var forceUpload = opts.forceUpload !== false;
    return insertCloudTokenOnly().then(function () {
      return activateRegistroPage({ forceUpload: forceUpload }).then(function (pack) {
        if (pack && pack.ok === false && pack.message && typeof global.showToast === 'function') {
          staffToast('No se pudo preparar el QR. Avise a administracion del local.', 'warning');
        }
        return readCfg();
      });
    });
  }

  function ensureActiveToken(forceNew) {
    var cfg = readCfg() || {};
    if (!forceNew && cfg.token && !tokenExpired(cfg)) {
      return activateRegistroPage({ forceUpload: false }).then(function () {
        return readCfg();
      });
    }
    return createCloudToken({ forceUpload: true });
  }

  function tryShowQrAfterActivate(act, cfg, statusId, urlId, qrHostId, qrSize) {
    cfg = cfg || readCfg() || {};
    if (tokenExpired(cfg)) {
      return Promise.all([countPendingIntake(), Promise.resolve(cfg)]).then(function (arr) {
        return { pending: arr[0], cfg: arr[1], url: '', act: act };
      });
    }
    return safeQrUrlForToken(cfg.token).then(function (url) {
      if (url) {
        return countPendingIntake().then(function (pending) {
          return { pending: pending, cfg: cfg, url: url, act: act };
        });
      }
      if (act && act.ok === false) {
        var statusEl0 = statusId ? document.getElementById(statusId) : null;
        var qrHost0 = qrHostId ? document.getElementById(qrHostId) : null;
        var urlEl0 = urlId ? document.getElementById(urlId) : null;
        var isKiosk = isCustomerKioskContext(statusId, qrHostId);
        if (statusEl0) {
          statusEl0.textContent = isKiosk
            ? 'QR en un momento · avise al cajero si tarda'
            : cfg.token && !tokenExpired(cfg)
              ? 'Generando codigo QR…'
              : 'Pulse «Mostrar QR al cliente»';
          statusEl0.className = isKiosk ? 'crozzo-crm-reg-kiosk__status' : 'crozzo-crm-reg-status';
        }
        if (urlEl0) urlEl0.textContent = '';
        if (qrHost0) {
          if (isKiosk) {
            qrHost0.innerHTML = renderCustomerKioskWaitHtml(true);
            if (act && act.needsFunction) notifyStaffQrPending();
            startKioskAutoRetry(qrSize);
          } else {
            qrHost0.innerHTML = renderStaffQrWaitHtml();
          }
        }
        return null;
      }
      return countPendingIntake().then(function (pending) {
        return { pending: pending, cfg: cfg, url: '', act: act };
      });
    });
  }

  function formatExpiryLabel(cfg, forKiosk) {
    cfg = cfg || readCfg() || {};
    if (!cfg.expiresAt) return forKiosk ? 'Preparando codigo…' : 'Sin QR activo';
    var ms = Date.parse(cfg.expiresAt) - Date.now();
    if (ms <= 0) return forKiosk ? 'Codigo expirado · avise al cajero' : 'QR expirado · renueve el codigo';
    var min = Math.ceil(ms / 60000);
    return forKiosk
      ? 'Escanea aqui · valido ~' + min + ' min'
      : 'QR listo · expira en ~' + min + ' min';
  }

  function countPendingIntake() {
    if (!cloudReady() || _tableMissing) return Promise.resolve(0);
    return global.__SUPABASE
      .from(INTAKE_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId())
      .eq('processed', false)
      .then(function (res) {
        if (res.error) {
          markTableMissing(res.error);
          return 0;
        }
        return res.count || 0;
      })
      .catch(function () {
        return 0;
      });
  }

  function refreshQrDisplay(qrHostId, statusId, urlId, qrSize) {
    if (!cloudReady()) {
      var statusElOff = statusId ? document.getElementById(statusId) : null;
      if (statusElOff) {
        statusElOff.textContent = isCustomerKioskContext(statusId, qrHostId)
          ? 'QR no disponible · avise al cajero'
          : 'QR no disponible · avise a administracion';
        statusElOff.className = isCustomerKioskContext(statusId, qrHostId)
          ? 'crozzo-crm-reg-kiosk__status'
          : 'crozzo-crm-reg-status';
      }
      return Promise.resolve();
    }
    return ensureActiveToken(false)
      .then(function (cfg) {
        return activateRegistroPage({ forceUpload: false }).then(function (act) {
          return tryShowQrAfterActivate(act, cfg, statusId, urlId, qrHostId, qrSize);
        });
      })
      .then(function (pack) {
        if (!pack) return;
        var pending = pack.pending || 0;
        var cfg = pack.cfg || readCfg() || {};
        var url = pack.url || '';
        var statusEl = statusId ? document.getElementById(statusId) : null;
        var urlEl = urlId ? document.getElementById(urlId) : null;
        var qrHost = qrHostId ? document.getElementById(qrHostId) : null;
        if (statusEl) {
          var expiryTxt = formatExpiryLabel(cfg, isKiosk);
          var isKiosk = statusId && String(statusId).indexOf('Kiosk') >= 0;
          statusEl.textContent = isKiosk ? expiryTxt : expiryTxt + ' · pendientes: ' + pending;
          if (isKiosk) {
            statusEl.className = 'crozzo-crm-reg-kiosk__status' + (tokenExpired(cfg) ? '' : ' is-on');
          } else {
            statusEl.className = 'crozzo-crm-reg-status' + (tokenExpired(cfg) ? '' : ' is-on');
          }
        }
        if (urlEl) urlEl.textContent = '';
        if (qrHost) {
          var isKioskView = isCustomerKioskContext(statusId, qrHostId);
          if (url) {
            qrHost.innerHTML = renderQrImg(url, qrSize || 196, qrHostId + 'Canvas');
            if (isKioskView) stopKioskAutoRetry();
          } else if (isKioskView) {
            qrHost.innerHTML = renderCustomerKioskWaitHtml(!!(cfg.token && !tokenExpired(cfg)));
            if (cfg.token && !tokenExpired(cfg)) startKioskAutoRetry(qrSize);
          } else if (cfg.token && !tokenExpired(cfg)) {
            qrHost.innerHTML = renderStaffQrWaitHtml();
          } else {
            qrHost.innerHTML =
              '<p class="form-hint" style="text-align:center;margin:0;">Pulse <strong>Mostrar QR al cliente</strong></p>';
          }
        }
        startPolling();
      })
      .catch(function (e) {
        var statusEl = statusId ? document.getElementById(statusId) : null;
        var qrHost = qrHostId ? document.getElementById(qrHostId) : null;
        if (statusEl) {
          statusEl.textContent = isCustomerKioskContext(statusId, qrHostId)
            ? 'QR no disponible · avise al cajero'
            : 'No se pudo preparar el QR. Avise a administracion.';
          statusEl.className = isCustomerKioskContext(statusId, qrHostId)
            ? 'crozzo-crm-reg-kiosk__status'
            : 'crozzo-crm-reg-status';
        }
        if (qrHost) {
          if (isCustomerKioskContext(statusId, qrHostId)) {
            qrHost.innerHTML = renderCustomerKioskWaitHtml(true);
            notifyStaffQrPending();
            startKioskAutoRetry(qrSize);
          } else {
            qrHost.innerHTML = renderStaffQrWaitHtml();
          }
        }
      });
  }

  function refreshPanelUi() {
    refreshQrDisplay('crozzoCrmRegQrHost', 'crozzoCrmRegStatus', 'crozzoCrmRegUrl', 196);
  }

  function renderPanelHtml() {
    return (
      '<div class="crozzo-crm-reg-panel card" id="crozzoCrmRegPanel" style="margin-top:16px;">' +
      '<div class="card-header" style="padding-bottom:8px;">' +
      '<div><h3 class="card-title" style="font-size:1rem;margin:0;">📲 QR para clientes</h3>' +
      '<p class="form-hint" style="margin:6px 0 0;">El cliente escanea con su celular y completa sus datos. Usted solo muestra el codigo.</p></div></div>' +
      '<div class="crozzo-crm-reg-body crozzo-crm-reg-body--compact">' +
      '<div class="crozzo-crm-reg-qr-col">' +
      '<div id="crozzoCrmRegQrHost"></div>' +
      '</div>' +
      '<div class="crozzo-crm-reg-meta">' +
      '<p id="crozzoCrmRegStatus" class="crozzo-crm-reg-status">…</p>' +
      '<p id="crozzoCrmRegUrl" class="crozzo-crm-reg-url form-hint" hidden aria-hidden="true"></p>' +
      '<div class="crozzo-crm-reg-actions">' +
      '<button type="button" class="btn btn-primary btn-sm" id="crozzoCrmRegBtnKiosk">Mostrar QR al cliente</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoCrmRegBtnNew" title="Genera un codigo nuevo (valido 1 hora)">Renovar QR</button>' +
      '</div>' +
      '</div></div></div>'
    );
  }

  function closeCustomerKiosk() {
    stopKioskAutoRetry();
    if (_kioskEl) {
      _kioskEl.remove();
      _kioskEl = null;
    }
    document.body.classList.remove('crozzo-crm-reg-kiosk-open');
  }

  function openCustomerKiosk() {
    if (!crmQrFeatureEnabled()) {
      notifyQrFeatureLocked();
      return;
    }
    if (!cloudReady()) {
      staffToast('QR no disponible. Avise a administracion del local.', 'warning');
      return;
    }
    closeCustomerKiosk();
    var biz = esc(businessLabel());
    var initial = biz ? biz.charAt(0).toUpperCase() : '?';
    _kioskEl = document.createElement('div');
    _kioskEl.id = 'crozzoCrmRegKiosk';
    _kioskEl.className = 'crozzo-crm-reg-kiosk';
    _kioskEl.innerHTML =
      '<div class="crozzo-crm-reg-kiosk__inner">' +
      '<button type="button" class="crozzo-crm-reg-kiosk__close" id="crozzoCrmRegKioskClose" aria-label="Cerrar">✕</button>' +
      '<div class="crozzo-crm-reg-kiosk__hero">' +
      '<div class="crozzo-crm-reg-kiosk__logo">' +
      initial +
      '</div>' +
      '<h1 class="crozzo-crm-reg-kiosk__title">' +
      biz +
      '</h1>' +
      '<p class="crozzo-crm-reg-kiosk__sub">Escanea el codigo con la camara de tu celular y completa tus datos.</p>' +
      '</div>' +
      '<div class="crozzo-crm-reg-kiosk__qr-wrap">' +
      '<div id="crozzoCrmRegKioskQr">' +
      renderCustomerKioskWaitHtml(false) +
      '</div>' +
      '</div>' +
      '<p id="crozzoCrmRegKioskStatus" class="crozzo-crm-reg-kiosk__status">Preparando codigo…</p>' +
      '<p class="crozzo-crm-reg-kiosk__foot">Valido 1 hora · Funciona con datos moviles</p>' +
      '</div>';
    document.body.appendChild(_kioskEl);
    document.body.classList.add('crozzo-crm-reg-kiosk-open');
    var closeBtn = document.getElementById('crozzoCrmRegKioskClose');
    if (closeBtn) closeBtn.addEventListener('click', closeCustomerKiosk);
    createCloudToken({ forceUpload: false })
      .catch(function () {})
      .finally(function () {
        refreshQrDisplay('crozzoCrmRegKioskQr', 'crozzoCrmRegKioskStatus', null, 280);
        startKioskAutoRetry(280);
        startPolling();
      });
  }

  function bindPanelEvents() {
    var kioskBtn = document.getElementById('crozzoCrmRegBtnKiosk');
    var newBtn = document.getElementById('crozzoCrmRegBtnNew');
    if (kioskBtn && !kioskBtn._bound) {
      kioskBtn._bound = true;
      kioskBtn.addEventListener('click', openCustomerKiosk);
    }
    if (newBtn && !newBtn._bound) {
      newBtn._bound = true;
      newBtn.addEventListener('click', function () {
        newBtn.disabled = true;
        createCloudToken({ forceUpload: true })
          .then(function () {
            staffToast('QR renovado', 'success');
            refreshPanelUi();
            openCustomerKiosk();
          })
          .catch(function () {
            staffToast('No se pudo renovar el QR. Avise a administracion.', 'warning');
            refreshPanelUi();
          })
          .finally(function () {
            newBtn.disabled = false;
          });
      });
    }
  }

  function fillNewClientFormFromParsed(parsed) {
    if (!parsed) return false;
    if (typeof global.crozzoCrmToggleCreatePanel === 'function') global.crozzoCrmToggleCreatePanel(true);
    var nitEl = document.getElementById('crozzoCrmNewNit');
    var nomEl = document.getElementById('crozzoCrmNewNombre');
    var telEl = document.getElementById('crozzoCrmNewTel');
    var ciuEl = document.getElementById('crozzoCrmNewCiudad');
    var dirEl = document.getElementById('crozzoCrmNewDir');
    var list = document.getElementById('crozzoCrmNewEmailsList');
    if (parsed.identificador && nitEl) {
      nitEl.value = parsed.identificador.display || parsed.identificador.norm || '';
    }
    if (parsed.razonSocial && nomEl) nomEl.value = parsed.razonSocial;
    if (parsed.telefono && telEl) telEl.value = parsed.telefono;
    if (parsed.ciudad && ciuEl) ciuEl.value = parsed.ciudad;
    if (parsed.direccion && dirEl) dirEl.value = parsed.direccion;
    if (parsed.email && list && typeof global.crozzoCrmEmailRowHtml === 'function') {
      list.innerHTML = global.crozzoCrmEmailRowHtml(parsed.email, 'crozzoCrmNewEmailIn');
    }
    setTimeout(function () {
      if (typeof global.CrozzoAdquirienteLookup !== 'undefined' && CrozzoAdquirienteLookup.bindForm) {
        CrozzoAdquirienteLookup.bindForm('crm_new');
      }
    }, 80);
    return true;
  }

  function importRutToNewClient(file) {
    if (!file) return Promise.reject(new Error('Sin archivo'));
    var loadDoc = function () {
      if (global.CrozzoProveedorDocumentos && CrozzoProveedorDocumentos.extractFromFile) {
        return CrozzoProveedorDocumentos.extractFromFile(file);
      }
      if (global.CrozzoLazyModules && typeof CrozzoLazyModules.load === 'function') {
        return CrozzoLazyModules.load('reservorio').then(function () {
          if (global.CrozzoProveedorDocumentos && CrozzoProveedorDocumentos.extractFromFile) {
            return CrozzoProveedorDocumentos.extractFromFile(file);
          }
          throw new Error('Lector RUT no disponible');
        });
      }
      return Promise.reject(new Error('Lector RUT no disponible'));
    };
    return loadDoc().then(function (res) {
      var p = res && res.parsed;
      if (!p || (!p.identificador && !p.razonSocial)) {
        throw new Error('No se pudo leer el RUT. Intente otra foto o escriba los datos.');
      }
      fillNewClientFormFromParsed(p);
      if (typeof global.showToast === 'function') {
        global.showToast('Datos del RUT cargados — revise correo y guarde', 'success');
      }
      return p;
    });
  }

  function openQrModal() {
    openCustomerKiosk();
  }

  function bindNewClientRutInput() {
    var btn = document.getElementById('crozzoCrmNewRutBtn');
    var inp = document.getElementById('crozzoCrmNewRutFile');
    if (!btn || !inp || btn._bound) return;
    btn._bound = true;
    btn.addEventListener('click', function () {
      inp.click();
    });
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      btn.disabled = true;
      importRutToNewClient(f)
        .catch(function (e) {
          if (typeof global.showToast === 'function') global.showToast(e.message || 'Error RUT', 'error');
        })
        .finally(function () {
          btn.disabled = false;
          inp.value = '';
        });
    });
  }

  function mountTabletCrmExtras() {
    bindNewClientRutInput();
    if (crmQrFeatureEnabled() && cloudReady()) startPolling();
  }

  function mountInClientesPage() {
    var anchor = document.getElementById('crozzoCrmRegMount');
    if (!anchor) return;
    if (!crmQrFeatureEnabled()) {
      anchor.innerHTML = renderPanelHtmlLocked();
      return;
    }
    anchor.innerHTML = renderPanelHtml();
    bindPanelEvents();
    refreshPanelUi();
  }

  function initBoot() {
    document.addEventListener('crozzo:page-caja-clientes', function () {
      setTimeout(mountInClientesPage, 50);
    });
    if (crmQrFeatureEnabled() && cloudReady()) startPolling();
  }

  global.CrozzoCrmRegistroQr = {
    buildCloudRegistroUrl: buildCloudRegistroUrl,
    renderPanelHtml: renderPanelHtml,
    mountInClientesPage: mountInClientesPage,
    mountTabletCrmExtras: mountTabletCrmExtras,
    openQrModal: openQrModal,
    openCustomerKiosk: openCustomerKiosk,
    closeCustomerKiosk: closeCustomerKiosk,
    importRutToNewClient: importRutToNewClient,
    fillNewClientFormFromParsed: fillNewClientFormFromParsed,
    insertCloudTokenOnly: insertCloudTokenOnly,
    createCloudToken: createCloudToken,
    activateRegistroPage: activateRegistroPage,
    openCrmRegistroSqlWizard: openCrmRegistroSqlWizard,
    copyCrmRegistroSql: copyCrmRegistroSql,
    pollCloudIntakeOnce: pollCloudIntakeOnce,
    importPayloadToCrm: importPayloadToCrm,
    refreshPanelUi: refreshPanelUi,
    refreshQrDisplay: refreshQrDisplay,
    initBoot: initBoot,
    cloudReady: cloudReady,
  };

  global.crozzoCrmImportRegistroPayload = importPayloadToCrm;
  global.crozzoCrmRegistroOpenQrModal = function () {
    if (!crmQrFeatureEnabled()) {
      notifyQrFeatureLocked();
      return;
    }
    openCustomerKiosk();
  };
  global.crozzoCrmRegistroImportRutToNewClient = function () {
    var inp = document.getElementById('crozzoCrmNewRutFile');
    if (inp) inp.click();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBoot);
  } else {
    initBoot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
