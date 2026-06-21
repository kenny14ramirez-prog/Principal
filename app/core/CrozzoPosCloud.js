/**
 * Módulo POS ↔ Supabase + LocalDB (vanilla, offline-first).
 * - Sin modal bloqueante: arranque siempre usable en modo local.
 * - Modo nube solo si localStorage.crozzo_supabase_config existe con syncEnabled + URL/key válidas (guardado por Super Admin).
 * - Espejo opcional: SUPABASE_URL / supabase_url (solo si sync activa y se sincronizan claves legacy).
 * - Cliente: createClient solo con credenciales válidas → window.__SUPABASE.
 * - Tablas esperadas (PostgREST): profiles, categories, taxes, clients, devices, products, sales, sale_items,
 *   comandas, sync_queue, audit_logs, company_config, dian_config (ajusta columnas en SQL si difieren).
 * - devices: id (uuid PK) = id del equipo; name, last_sync_at; type según devices_type_check (p. ej. central|tablet|pos|…); is_active; legacy device_id soportado.
 * - RLS: el cliente usa la sesión de auth; políticas deben permitir lectura/escritura según rol.
 *
 * Modelo de datos (importante):
 * - Config fiscal/empresa (`pos_dian_config` vía ConfigManager) y catálogo guardado (`catalogoProductos`) persisten en localStorage del navegador.
 * - Estado operativo en vivo (carritos, comandas abiertas, historial reciente, slots cobrados) se respalda en `crozzo_pos_runtime_v1` localmente y, con nube activa, en `crozzo_sede_runtime` por `location_id` (`CrozzoPosRuntimeCloud.js`).
 * - Supabase es la fuente de verdad para entidades explícitas (p. ej. `products` cuando la nube está activa); comandas activas se sincronizan vía tabla `comandas` + `CrozzoComandasCloudSync.js`.
 * - Tras login local/Supabase y al volver a la pestaña (visible) se vuelve a descargar `products` y se repinta la página actual si la nube está activa (`__crozzoRefreshCloudCatalogUi`).
 *
 * Estrategia offline (resumen): cola `sync_queue` + reintentos; marcas de tiempo en facturas; resolución de conflicto «dos servidor A» vía UI;
 * validación de columnas PostgREST antes de mirror (mensajes guiados); modo híbrido/offline en runtime. Contingencia DIAN formal = roadmap (ver `crozzo-roadmap-recomendaciones.csv`).
 */
window.CROZZO_QUIET = true;
function crozzoCloudFacingErr(err) {
  if (typeof global.crozzoUserFacingError === 'function') return global.crozzoUserFacingError(err);
  const msg = err && typeof err === 'object' ? String(err.message || err.error || err.details || '') : String(err || '');
  return msg || 'No se pudo conectar. Revise su internet e intente de nuevo.';
}
(function crozzoQuietConsoleErrors() {
  try {
    if (typeof console === 'undefined' || console.__crozzoErrPatched) return;
    console.__crozzoErrPatched = true;
    var orig = console.error.bind(console);
    console.error = function () {
      var s = arguments.length ? String(arguments[0]) : '';
      if (window.CROZZO_QUIET && /supabase|401|unauthorized|fetch failed|network|postgrest|jwt|cors|failed to fetch/i.test(s)) {
        return console.warn.apply(console, arguments);
      }
      return orig.apply(console, arguments);
    };
  } catch (_) {}
})();
const LS = {
  URL_PRIMARY: 'SUPABASE_URL',
  KEY_PRIMARY: 'SUPABASE_ANON_KEY',
  URL_LEGACY: 'supabase_url',
  KEY_LEGACY: 'supabase_anon_key',
  DEVICE_NAME: 'device_name',
  DEVICE_ID: 'device_id',
  OFFLINE_QUEUE: 'sync_queue_temp',
};
/** Archivo único de credenciales / toggle (solo Super Admin lo escribe desde Multi-Dispositivo). */
const CROZZO_SB_FILE = 'crozzo_supabase_config';
const CROZZO_SYNC_QUEUE_KEY = 'crozzo_sync_queue';
/** Cabeceras PostgREST (no usar ?apikey= en la URL). */
function crozzoIsSupabasePublishableKey(key) {
  return /^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(String(key || '').trim());
}
window.crozzoIsSupabasePublishableKey = crozzoIsSupabasePublishableKey;
function crozzoIsSupabaseSecretKey(key) {
  const k = String(key || '').trim();
  return /^sb_secret_[A-Za-z0-9_-]+/.test(k);
}
window.crozzoIsSupabaseSecretKey = crozzoIsSupabaseSecretKey;
function crozzoIsSupabaseLegacyJwtKey(key) {
  const k = String(key || '').trim();
  return k.startsWith('eyJ') && k.split('.').length >= 2;
}
function crozzoSupabaseKeyLooksValid(key) {
  const k = String(key || '').trim();
  if (!k) return false;
  if (crozzoIsSupabaseSecretKey(k)) return false;
  if (crozzoIsSupabasePublishableKey(k)) return true;
  if (crozzoIsSupabaseLegacyJwtKey(k) && k.length >= 20) {
    const payload = crozzoJwtPayload(k);
    if (payload && String(payload.role || '').toLowerCase() === 'service_role') return false;
    return true;
  }
  return false;
}
window.crozzoSupabaseKeyLooksValid = crozzoSupabaseKeyLooksValid;
function crozzoSupabaseRestHeaders(anonKey, opts) {
  opts = opts || {};
  const k = String(anonKey || '').trim();
  const h = {
    apikey: k,
    'Content-Type': 'application/json',
  };
  const userJwt = String(opts.userJwt || '').trim();
  if (userJwt) {
    h.Authorization = 'Bearer ' + userJwt;
  } else if (!crozzoIsSupabasePublishableKey(k)) {
    // Legacy anon JWT — PostgREST acepta Bearer con la misma anon key.
    h.Authorization = 'Bearer ' + k;
  }
  return h;
}
window.crozzoSupabaseRestHeaders = crozzoSupabaseRestHeaders;
/** Un solo aviso en consola ante 401 de PostgREST (evita spam). */
function crozzoNotifySupabase401Once() {
  try {
    if (typeof window !== 'undefined' && window.__crozzoSb401Notified) return;
    if (typeof window !== 'undefined') window.__crozzoSb401Notified = true;
    console.warn('⚠️ Verifica tu Anon Key en Configuración');
  } catch (_) {}
}
window.crozzoNotifySupabase401Once = crozzoNotifySupabase401Once;
function readCrozzoSupabaseJson() {
  try {
    const r = localStorage.getItem(CROZZO_SB_FILE);
    return r ? JSON.parse(r) : null;
  } catch {
    return null;
  }
}
window.readCrozzoSupabaseJson = readCrozzoSupabaseJson;
/** Anon key desde `crozzo_supabase_config`: propiedad `key` o `anonKey` (legacy). */
function crozzoSupabaseEffectiveAnonKey(obj) {
  if (!obj || typeof obj !== 'object') return '';
  const fromKey = obj.key != null ? String(obj.key).trim() : '';
  if (fromKey) return fromKey;
  return String(obj.anonKey || '').trim();
}
window.crozzoSupabaseEffectiveAnonKey = crozzoSupabaseEffectiveAnonKey;
/** Modo nube si hay credenciales válidas en cualquier almacén (archivo, multidispositivo o legacy). */
function crozzoOnlineConfigReady() {
  const creds = crozzoResolveSupabaseCredentials();
  return !!(creds.syncOn && isValidSupabasePair(creds.url, creds.key));
}
window.__crozzoIsLocalDataMode = function crozzoIsLocalDataMode() {
  return !crozzoOnlineConfigReady() || !window.__SUPABASE;
};
/** Catálogo de tablas del proyecto (referencia para loadTableData / cola). */
window.__CROZZO_SB_TABLES = Object.freeze([
  'profiles',
  'categories',
  'taxes',
  'clients',
  'devices',
  'products',
  'sales',
  'sale_items',
  'comandas',
  'sync_queue',
  'crozzo_sede_runtime',
  'audit_logs',
  'company_config',
  'pos_staff',
  'dian_config',
  'crozzo_empleados',
  'crozzo_marcaciones',
  'crozzo_rrhh_config',
  'crozzo_pedidos_internos',
  'crozzo_integracion_config',
  'crozzo_nomina_periodos',
  'crozzo_proveedores_ops',
  'crozzo_recepciones',
]);
function crozzoRandomIdFallback() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
function lsGet(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
/**
 * Auto-sanado de almacenamiento lleno (error humano/organico: tablet sin espacio).
 * Borra cachés regenerables (pull de emparejamiento, QR del día) para liberar
 * espacio sin perder datos de negocio. Devuelve cuántas claves liberó.
 */
function crozzoPruneExpendableStorage() {
  var removed = 0;
  try {
    var toRemove = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (!key) continue;
      if (key.indexOf('crozzo_pair_pull_') === 0) toRemove.push(key);
    }
    toRemove.push('crozzo_daily_pairing_v1');
    toRemove.push('crozzo_daily_pairing_v2');
    for (var j = 0; j < toRemove.length; j++) {
      try {
        if (localStorage.getItem(toRemove[j]) != null) {
          localStorage.removeItem(toRemove[j]);
          removed++;
        }
      } catch (_) {}
    }
  } catch (_) {}
  return removed;
}
window.crozzoPruneExpendableStorage = crozzoPruneExpendableStorage;
function crozzoIsQuotaError(e) {
  if (!e) return false;
  var name = String(e.name || '');
  var msg = String(e.message || e || '');
  return /quota|exceeded|NS_ERROR_DOM_QUOTA/i.test(name) || /quota|exceeded/i.test(msg) || e.code === 22 || e.code === 1014;
}
window.crozzoIsQuotaError = crozzoIsQuotaError;
function lsSet(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch (e) {
    if (crozzoIsQuotaError(e) && crozzoPruneExpendableStorage() > 0) {
      try {
        localStorage.setItem(k, v);
        return;
      } catch (_) {}
    }
    console.warn('[crozzo-sb] lsSet', k, e);
  }
}
/**
 * Unifica claves nuevas (SUPABASE_*) y legacy; debe ejecutarse antes de leer credenciales.
 */
function initConfigPersistence() {
  const uNew = (lsGet(LS.URL_PRIMARY) || '').trim();
  const kNew = (lsGet(LS.KEY_PRIMARY) || '').trim();
  const uOld = (lsGet(LS.URL_LEGACY) || '').trim();
  const kOld = (lsGet(LS.KEY_LEGACY) || '').trim();
  if (uNew && !uOld) lsSet(LS.URL_LEGACY, uNew);
  if (kNew && !kOld) lsSet(LS.KEY_LEGACY, kNew);
  if (!uNew && uOld) lsSet(LS.URL_PRIMARY, uOld);
  if (!kNew && kOld) lsSet(LS.KEY_PRIMARY, kOld);
}
function readResolvedUrl() {
  const creds = crozzoResolveSupabaseCredentials();
  return creds.syncOn ? String(creds.url || '').trim() : '';
}
function readResolvedKey() {
  const creds = crozzoResolveSupabaseCredentials();
  return creds.syncOn ? String(creds.key || '').trim() : '';
}
function mirrorCredentialsToBothKeys(url, key) {
  if (url) {
    lsSet(LS.URL_PRIMARY, url);
    lsSet(LS.URL_LEGACY, url);
  }
  if (key) {
    lsSet(LS.KEY_PRIMARY, key);
    lsSet(LS.KEY_LEGACY, key);
  }
}
function ensureStandaloneDeviceId() {
  try {
    let id = (lsGet(LS.DEVICE_ID) || '').trim();
    if (!id) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : crozzoRandomIdFallback();
      lsSet(LS.DEVICE_ID, id);
    }
    return id;
  } catch {
    return '';
  }
}
/** UUID estable para PostgREST (tablas con id uuid / device_id uuid). Distinto de crozzo_device_id (DEV-…). */
function crozzoCloudDeviceUuidForRest() {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  try {
    let v = (lsGet(LS.DEVICE_ID) || '').trim();
    if (v && UUID_RE.test(v)) return v;
    v = (lsGet('crozzo_supabase_device_uuid') || '').trim();
    if (v && UUID_RE.test(v)) return v;
    v = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : crozzoRandomIdFallback();
    lsSet('crozzo_supabase_device_uuid', v);
    if (!(lsGet(LS.DEVICE_ID) || '').trim()) lsSet(LS.DEVICE_ID, v);
    return v;
  } catch (_) {
    return crozzoRandomIdFallback();
  }
}
window.crozzoCloudDeviceUuidForRest = crozzoCloudDeviceUuidForRest;

function crozzoSupabaseHostFromUrl(url) {
  const u = String(url || '').trim();
  const m = u.match(/^https:\/\/([^/?#]+)/i);
  return m ? m[1].toLowerCase() : '';
}
function crozzoSupabaseProjectRefFromUrl(url) {
  const host = crozzoSupabaseHostFromUrl(url);
  const m = host.match(/^([^.]+)\.supabase\.co$/i);
  return m ? m[1] : '';
}
/** URL de señuelo honeypot: 8 dígitos + x + 4 hex (p. ej. 00004513x656b.supabase.co). */
function crozzoIsHoneypotChaffUrl(url) {
  const ref = crozzoSupabaseProjectRefFromUrl(url);
  return /^\d{8}x[a-f0-9]{4}$/i.test(ref);
}
window.crozzoIsHoneypotChaffUrl = crozzoIsHoneypotChaffUrl;
function crozzoIsHoneypotChaffConfig(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (obj._hpChaff === true) return true;
  return crozzoIsHoneypotChaffUrl(obj.url || obj.supabaseUrl || '');
}
window.crozzoIsHoneypotChaffConfig = crozzoIsHoneypotChaffConfig;
function crozzoJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch (_) {
    return null;
  }
}
function crozzoAnonKeyMatchesSupabaseUrl(url, key) {
  const hostRef = crozzoSupabaseProjectRefFromUrl(url);
  if (!hostRef || crozzoIsHoneypotChaffUrl(url)) return false;
  if (crozzoIsSupabasePublishableKey(key)) return true;
  const payload = crozzoJwtPayload(key);
  if (!payload || typeof payload !== 'object') return false;
  const jwtRef = String(payload.ref || '').trim().toLowerCase();
  if (!jwtRef) return false;
  return jwtRef === hostRef.toLowerCase();
}
window.crozzoAnonKeyMatchesSupabaseUrl = crozzoAnonKeyMatchesSupabaseUrl;
/** Base del proyecto: `https://{ref}.supabase.co` (sin /rest/v1 ni rutas del dashboard). */
function crozzoNormalizeSupabaseProjectUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  const dash = raw.match(/supabase\.com\/dashboard\/project\/([^/?#]+)/i);
  if (dash && dash[1]) return 'https://' + String(dash[1]).trim().toLowerCase() + '.supabase.co';
  const ref = crozzoSupabaseProjectRefFromUrl(raw);
  if (ref && !crozzoIsHoneypotChaffUrl(raw)) return 'https://' + ref.toLowerCase() + '.supabase.co';
  return raw.replace(/\/+$/, '').replace(/\/rest\/v1.*$/i, '').replace(/\/auth\/v1.*$/i, '');
}
window.crozzoNormalizeSupabaseProjectUrl = crozzoNormalizeSupabaseProjectUrl;
function isValidSupabasePair(url, key) {
  const u = crozzoNormalizeSupabaseProjectUrl(url);
  const k = String(key || '').trim();
  if (!u || !crozzoSupabaseKeyLooksValid(k)) return false;
  if (!/^https:\/\/[^/?#]+\.supabase\.co\/?$/i.test(u)) return false;
  if (crozzoIsHoneypotChaffUrl(u)) return false;
  if (crozzoIsSupabasePublishableKey(k)) return true;
  return crozzoAnonKeyMatchesSupabaseUrl(u, k);
}
window.isValidSupabasePair = isValidSupabasePair;
function crozzoSupabasePairRejectMessage(url, key) {
  const u = crozzoNormalizeSupabaseProjectUrl(url);
  const k = String(key || '').trim();
  if (!u && !k) {
    return 'Supabase no configurado en esta caja. Super Admin → Nube → Paso 1: pegue URL + anon key → «Guardar y conectar» → genere el QR de nuevo.';
  }
  if (!u) {
    return 'Falta la URL del proyecto Supabase. Use el formato https://xxxx.supabase.co (sin /rest/v1). Super Admin → Nube → Paso 1 → «Guardar y conectar».';
  }
  if (!k || !crozzoSupabaseKeyLooksValid(k)) {
    if (crozzoIsSupabaseSecretKey(k)) {
      return 'Esta clave es secreta (sb_secret_). Use la clave pública «Publishable» del dashboard, nunca la secret ni service_role. Super Admin → Nube → Paso 1.';
    }
    return 'Clave inválida. Use «Publishable» (sb_publishable_…) o «anon public» legacy (eyJ…) del mismo proyecto. Super Admin → Nube → Paso 1.';
  }
  if (!/^https:\/\/[^/?#]+\.supabase\.co\/?$/i.test(u)) {
    return 'URL de Supabase inválida. Debe ser https://xxxx.supabase.co (copie «Project URL», no el enlace /rest/v1). Super Admin → Nube → corrija y guarde.';
  }
  if (!crozzoIsSupabasePublishableKey(k) && !crozzoAnonKeyMatchesSupabaseUrl(u, k)) {
    const payload = crozzoJwtPayload(k);
    if (!payload || !payload.ref) {
      return 'La clave JWT no es válida. Use «Publishable» (sb_publishable_…) o «anon public» (eyJ…). Super Admin → Nube → Paso 1.';
    }
    return 'La anon key JWT no corresponde a ese proyecto Supabase (ref distinto). Verifique URL y clave del mismo proyecto en Super Admin → Nube → «Guardar y conectar».';
  }
  return '';
}
window.crozzoSupabasePairRejectMessage = crozzoSupabasePairRejectMessage;
/** Normaliza URL guardada y recupera credenciales desde multidispositivo si hace falta. */
function crozzoHealSupabaseConfigStorage() {
  let healed = false;
  try {
    const j = readCrozzoSupabaseJson();
    if (j && j.syncEnabled && !crozzoIsHoneypotChaffConfig(j)) {
      const normalized = crozzoNormalizeSupabaseProjectUrl(j.url);
      const key = crozzoSupabaseEffectiveAnonKey(j);
      if (normalized && normalized !== String(j.url || '').trim() && isValidSupabasePair(normalized, key)) {
        j.url = normalized;
        localStorage.setItem(CROZZO_SB_FILE, JSON.stringify(j));
        mirrorCredentialsToBothKeys(normalized, key);
        healed = true;
      }
    }
  } catch (e) {
    console.warn('[crozzo-sb] heal config', e);
  }
  if (!crozzoOnlineConfigReady()) {
    try {
      if (crozzoRecoverSupabaseFromMultiDevice()) healed = true;
    } catch (_) {}
  }
  try {
    crozzoEnsureSupabaseConfigFileFromAnySource();
  } catch (_) {}
  return healed;
}
window.crozzoHealSupabaseConfigStorage = crozzoHealSupabaseConfigStorage;

const CROZZO_HP_CHAFF_LS_KEYS = [
  'crozzo_supabase_config',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'supabase_url',
  'supabase_key',
  'supabase_anon_key',
  'crozzo_db_direct_url',
  'crozzo_reservorio_pg_url',
  'crozzo_hp_env_backup',
  'crozzo_pg_pooler_url',
  'crozzo_secrets_vault_v2',
  'crozzo_vault_key_hint',
  'crozzo_config_sealed_b64',
  'crozzo_staff_export_enc',
];
function crozzoRecoverSupabaseFromMultiDevice() {
  let url = '';
  let key = '';
  let deviceId = '';
  let deviceName = '';
  try {
    const raw = localStorage.getItem('crozzo_multidevice_config');
    if (raw) {
      const md = JSON.parse(raw);
      url = String(md?.supabase?.url || '').trim();
      key = String(md?.supabase?.anonKey || '').trim();
      deviceId = String(md?.deviceId || '').trim();
    }
  } catch (_) {}
  if (!url || !key) {
    try {
      const raw = localStorage.getItem('pos_dian_config');
      if (raw) {
        const cfg = JSON.parse(raw);
        const md = cfg?.multidispositivo || {};
        url = url || String(md?.supabase?.url || '').trim();
        key = key || String(md?.supabase?.anonKey || '').trim();
        deviceId = deviceId || String(md?.deviceId || '').trim();
        deviceName = String(md?.deviceName || '').trim();
      }
    } catch (_) {}
  }
  if (!isValidSupabasePair(url, key)) return false;
  const file = {
    version: 1,
    syncEnabled: true,
    url,
    anonKey: key,
    deviceId: deviceId || ensureStandaloneDeviceId(),
    deviceName,
    savedAt: Date.now(),
    recoveredFrom: 'multidispositivo',
  };
  try {
    localStorage.setItem(CROZZO_SB_FILE, JSON.stringify(file));
    mirrorCredentialsToBothKeys(url, key);
    if (file.deviceId) lsSet(LS.DEVICE_ID, file.deviceId);
    return true;
  } catch (e) {
    console.warn('[crozzo-sb] recover from multidispositivo', e);
    return false;
  }
}
function crozzoTeardownSupabaseClient() {
  try {
    if (typeof window.crozzoStopPosRuntimeCloudSync === 'function') window.crozzoStopPosRuntimeCloudSync();
  } catch (_) {}
  try {
    if (typeof window.crozzoStopComandasCloudSync === 'function') window.crozzoStopComandasCloudSync();
  } catch (_) {}
  try {
    if (typeof crozzoStopRemoteTenantSync === 'function') crozzoStopRemoteTenantSync();
  } catch (_) {}
  try {
    const sb = window.__SUPABASE;
    if (sb && typeof sb.removeAllChannels === 'function') sb.removeAllChannels();
  } catch (_) {}
  window.__SUPABASE = null;
}
window.crozzoTeardownSupabaseClient = crozzoTeardownSupabaseClient;
/** Quita credenciales de señuelo honeypot si la sesión de trampa ya terminó. */
function crozzoScrubStaleHoneypotChaff() {
  const hpLive =
    typeof window !== 'undefined' && window.__crozzoHoneypotLive && window.__crozzoHoneypotLive.active;
  if (hpLive) return false;
  const readJ = readCrozzoSupabaseJson();
  const legacyUrl = (lsGet(LS.URL_PRIMARY) || lsGet(LS.URL_LEGACY) || '').trim();
  const contaminated =
    (readJ && crozzoIsHoneypotChaffConfig(readJ)) || crozzoIsHoneypotChaffUrl(legacyUrl);
  if (!contaminated) return false;
  try {
    if (window.CrozzoHoneypotSim && typeof window.CrozzoHoneypotSim.scrubDbChaffFromStorage === 'function') {
      window.CrozzoHoneypotSim.scrubDbChaffFromStorage(window);
    }
  } catch (_) {}
  const stillBad =
    crozzoIsHoneypotChaffConfig(readCrozzoSupabaseJson()) ||
    crozzoIsHoneypotChaffUrl(lsGet(LS.URL_PRIMARY) || lsGet(LS.URL_LEGACY) || '');
  if (stillBad) {
    CROZZO_HP_CHAFF_LS_KEYS.forEach(function (k) {
      try {
        localStorage.removeItem(k);
      } catch (_) {}
    });
  }
  const recovered = crozzoRecoverSupabaseFromMultiDevice();
  crozzoTeardownSupabaseClient();
  if (!window.__crozzoHpChaffScrubNotified) {
    window.__crozzoHpChaffScrubNotified = true;
    console.warn(
      '[crozzo-sb] Credenciales de señuelo (honeypot) eliminadas' +
        (recovered ? ' — restauradas desde Multi-Dispositivo.' : '. Reconfigure nube en Super Admin.')
    );
    if (typeof showToast === 'function') {
      showToast(
        recovered
          ? 'Señuelo de seguridad retirado — nube restaurada desde Multi-Dispositivo.'
          : 'Señuelo de seguridad retirado — configure Supabase en Multi-Dispositivo.',
        recovered ? 'success' : 'warning'
      );
    }
  }
  return true;
}
window.crozzoScrubStaleHoneypotChaff = crozzoScrubStaleHoneypotChaff;

function crozzoIsSupabaseJwtError(err) {
  const s = String((err && err.message) || (err && err.error_description) || err || '');
  return /InvalidJWTToken|JWT claim|invalid.*jwt|jwt expired|token.*expired/i.test(s);
}
window.crozzoIsSupabaseJwtError = crozzoIsSupabaseJwtError;

function crozzoJwtExpMs(token) {
  if (!token || typeof token !== 'string') return 0;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return 0;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64));
    const exp = Number(payload.exp);
    return Number.isFinite(exp) ? exp * 1000 : 0;
  } catch (_) {
    return 0;
  }
}

function crozzoIsJwtExpired(token, skewMs) {
  const expMs = crozzoJwtExpMs(token);
  if (!expMs) return false;
  return Date.now() >= expMs - (skewMs || 60000);
}

function crozzoFindSupabaseAuthStorageKeys() {
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /^sb-.+-auth-token/.test(k)) keys.push(k);
    }
  } catch (_) {}
  return keys;
}

/** Quita sesiones Supabase Auth caducadas (causan InvalidJWTToken en PostgREST). */
function crozzoPurgeExpiredSupabaseAuthStorage() {
  let removed = false;
  crozzoFindSupabaseAuthStorageKeys().forEach(function (k) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) return;
      const pack = JSON.parse(raw);
      let expired = false;
      if (pack && typeof pack === 'object') {
        const access = String(pack.access_token || (pack.currentSession && pack.currentSession.access_token) || '');
        if (access && crozzoIsJwtExpired(access)) expired = true;
        else if (pack.expires_at && Date.now() >= Number(pack.expires_at) * 1000 - 60000) expired = true;
      }
      if (expired) {
        localStorage.removeItem(k);
        removed = true;
      }
    } catch (_) {
      try {
        localStorage.removeItem(k);
        removed = true;
      } catch (_) {}
    }
  });
  if (removed) {
    try {
      window.__crozzoSupabaseSessionCached = false;
    } catch (_) {}
  }
  return removed;
}
window.crozzoPurgeExpiredSupabaseAuthStorage = crozzoPurgeExpiredSupabaseAuthStorage;

async function crozzoRecoverSupabaseAuthFromJwtError(opts) {
  opts = opts || {};
  const hadStale = crozzoPurgeExpiredSupabaseAuthStorage();
  try {
    if (window.__SUPABASE && window.__SUPABASE.auth && typeof window.__SUPABASE.auth.signOut === 'function') {
      await window.__SUPABASE.auth.signOut({ scope: 'local' });
    }
  } catch (_) {}
  crozzoFindSupabaseAuthStorageKeys().forEach(function (k) {
    try {
      localStorage.removeItem(k);
    } catch (_) {}
  });
  try {
    window.__crozzoSupabaseSessionCached = false;
  } catch (_) {}
  if (hadStale && !opts.quiet && typeof showToast === 'function') {
    showToast('Sesión de nube expirada — se limpió. La sync sigue con la clave anónima.', 'info');
  }
  return hadStale;
}
window.crozzoRecoverSupabaseAuthFromJwtError = crozzoRecoverSupabaseAuthFromJwtError;

async function crozzoEnsureSupabaseAuthHealthy(sb) {
  if (!sb || !sb.auth || typeof sb.auth.getSession !== 'function') return;
  try {
    const res = await sb.auth.getSession();
    if (res && res.error && crozzoIsSupabaseJwtError(res.error)) {
      await crozzoRecoverSupabaseAuthFromJwtError({ quiet: true });
    } else if (res && res.data && res.data.session) {
      const access = res.data.session.access_token;
      if (access && crozzoIsJwtExpired(access)) {
        await crozzoRecoverSupabaseAuthFromJwtError({ quiet: !!window.__crozzoJwtPurgeNotified });
        window.__crozzoJwtPurgeNotified = true;
      } else {
        window.__crozzoSupabaseSessionCached = true;
      }
    }
  } catch (e) {
    if (crozzoIsSupabaseJwtError(e)) {
      await crozzoRecoverSupabaseAuthFromJwtError({ quiet: true });
    } else {
      console.warn('[crozzo-sb] auth health', e);
    }
  }
  if (!sb.__crozzoAuthHealthHook) {
    sb.__crozzoAuthHealthHook = true;
    try {
      sb.auth.onAuthStateChange(function (event) {
        if (event === 'SIGNED_OUT') window.__crozzoSupabaseSessionCached = false;
        if (event === 'TOKEN_REFRESHED') window.__crozzoSupabaseSessionCached = true;
      });
    } catch (_) {}
  }
}

/** Resuelve URL + anon key desde crozzo_supabase_config, multidispositivo o claves legacy. */
function crozzoResolveSupabaseCredentials() {
  const readJ = readCrozzoSupabaseJson();
  let url = '';
  let key = '';
  let syncOn = false;
  let deviceId = '';
  let deviceName = '';
  const fileIsChaff = readJ && crozzoIsHoneypotChaffConfig(readJ);
  if (readJ && readJ.syncEnabled && !fileIsChaff) {
    url = String(readJ.url || '').trim();
    key = crozzoSupabaseEffectiveAnonKey(readJ);
    syncOn = true;
    deviceId = String(readJ.deviceId || '').trim();
    deviceName = String(readJ.deviceName || '').trim();
  }
  try {
    if (typeof getMultiDeviceConfig === 'function') {
      const md = getMultiDeviceConfig();
      const mdUrl = String(md.supabase?.url || '').trim();
      const mdKey = String(md.supabase?.anonKey || '').trim();
      if (fileIsChaff || !url) {
        if (isValidSupabasePair(mdUrl, mdKey)) {
          url = mdUrl;
          key = mdKey;
          syncOn = true;
        }
      }
      if (!url) url = mdUrl;
      if (!key) key = mdKey;
      if (!deviceId) deviceId = String(md.deviceId || '').trim();
      if (md.supabaseSyncEnabled && isValidSupabasePair(url, key)) syncOn = true;
    }
  } catch (_) {}
  if (!url) url = (lsGet(LS.URL_PRIMARY) || lsGet(LS.URL_LEGACY) || '').trim();
  if (!key) key = (lsGet(LS.KEY_PRIMARY) || lsGet(LS.KEY_LEGACY) || '').trim();
  if (crozzoIsHoneypotChaffUrl(url)) {
    url = '';
    key = '';
    syncOn = false;
  }
  url = crozzoNormalizeSupabaseProjectUrl(url);
  if (isValidSupabasePair(url, key)) syncOn = true;
  else if (!isValidSupabasePair(url, key)) syncOn = false;
  return { syncOn, url, key, deviceId, deviceName };
}
window.crozzoResolveSupabaseCredentials = crozzoResolveSupabaseCredentials;
/** Escribe crozzo_supabase_config si hay credenciales en cualquier almacén pero falta el archivo. */
function crozzoEnsureSupabaseConfigFileFromAnySource() {
  const existing = readCrozzoSupabaseJson();
  if (existing && existing.syncEnabled && isValidSupabasePair(existing.url, crozzoSupabaseEffectiveAnonKey(existing))) {
    return existing;
  }
  const creds = crozzoResolveSupabaseCredentials();
  if (!creds.syncOn || !isValidSupabasePair(creds.url, creds.key)) return null;
  const file = {
    version: 1,
    syncEnabled: true,
    url: creds.url,
    anonKey: creds.key,
    deviceId: creds.deviceId || ensureStandaloneDeviceId(),
    deviceName: creds.deviceName || '',
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(CROZZO_SB_FILE, JSON.stringify(file));
    mirrorCredentialsToBothKeys(creds.url, creds.key);
  } catch (e) {
    console.warn('[crozzo-sb] ensure config file', e);
    return null;
  }
  return file;
}
window.crozzoEnsureSupabaseConfigFileFromAnySource = crozzoEnsureSupabaseConfigFileFromAnySource;
/** Tras emparejar QR: persiste nube en todos los almacenes que lee la UI. */
window.crozzoFinalizeCloudConfigAfterPairing = function crozzoFinalizeCloudConfigAfterPairing(payload) {
  if (!payload) return false;
  const url = String(payload.supabase_url || payload.url || '').trim();
  const key = String(payload.supabase_key || payload.anonKey || payload.key || '').trim();
  if (!isValidSupabasePair(url, key)) return false;
  const save = {
    version: 1,
    syncEnabled: true,
    url: url,
    anonKey: key,
    deviceName: String(payload.device_name || payload.deviceName || '').trim(),
    deviceId: String(payload.device_id || payload.deviceId || ensureStandaloneDeviceId()).trim(),
    savedAt: Date.now(),
  };
  if (typeof window.crozzoPersistSupabaseConfigFromPairing === 'function') {
    window.crozzoPersistSupabaseConfigFromPairing(save);
  }
  if (typeof persistMultiDeviceConfig === 'function') {
    try {
      const base = typeof getMultiDeviceConfig === 'function' ? getMultiDeviceConfig() : {};
      const bid = String(payload.business_id || payload.businessId || '').trim();
      const bname = String(payload.business_name || payload.businessName || '').trim();
      let loc = String(payload.location_id || base.locationId || '').trim();
      if (!loc || loc === 'default') {
        try {
          if (typeof window.crozzoEnsureSedeLocationId === 'function') {
            loc = String(window.crozzoEnsureSedeLocationId() || '').trim() || loc;
          }
        } catch (_) {}
      }
      persistMultiDeviceConfig({
        ...base,
        supabaseSyncEnabled: true,
        supabase: { ...(base.supabase || {}), url: url, anonKey: key },
        locationId: loc || base.locationId,
        role: 'B',
        businessId: bid || base.businessId,
        businessName: bname || base.businessName,
      });
    } catch (e) {
      console.warn('[crozzo-sb] finalize md', e);
    }
  }
  try {
    if (typeof hydrateMdSupabaseInputsFromLs === 'function') hydrateMdSupabaseInputsFromLs();
  } catch (_) {}
  try {
    if (typeof window.crozzoRefreshBusinessConnectedUi === 'function') window.crozzoRefreshBusinessConnectedUi();
  } catch (_) {}
  return true;
};
window.__crozzoApplyStandaloneSupabaseToConfig = function crozzoApplyStandaloneSupabaseToConfig(cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return cfg;
  if (!cfg.multidispositivo || typeof cfg.multidispositivo !== 'object') cfg.multidispositivo = {};
  const devId = ensureStandaloneDeviceId();
  const j = readCrozzoSupabaseJson();
  const lsUrl = j && j.syncEnabled ? String(j.url || '').trim() : '';
  const lsKey = j && j.syncEnabled ? crozzoSupabaseEffectiveAnonKey(j) : '';
  const prevSb = JSON.stringify(cfg.multidispositivo.supabase || {});
  const prevDev = String(cfg.multidispositivo.deviceId || '');
  cfg.multidispositivo.supabase = {
    url: '',
    anonKey: '',
    schema: 'public',
    deviceConfigsTable: 'devices',
    syncQueueTable: 'sync_queue',
    ...(cfg.multidispositivo.supabase || {}),
  };
  if (devId) cfg.multidispositivo.deviceId = devId;
  cfg.multidispositivo.supabase.url = lsUrl || '';
  cfg.multidispositivo.supabase.anonKey = lsKey || '';
  const nextSb = JSON.stringify(cfg.multidispositivo.supabase);
  const nextDev = String(cfg.multidispositivo.deviceId || '');
  if (nextSb !== prevSb || nextDev !== prevDev) {
    try {
      localStorage.setItem('pos_dian_config', JSON.stringify(cfg));
    } catch (e) {
      console.warn('[crozzo-sb] persist pos_dian_config', e);
    }
  }
  return cfg;
};
window.__crozzoSyncStandaloneKeys = function crozzoSyncStandaloneKeys(saved) {
  try {
    const sb = saved && saved.supabase && typeof saved.supabase === 'object' ? saved.supabase : saved;
    const u = String(sb?.url || '').trim();
    const k = crozzoSupabaseEffectiveAnonKey(sb) || String(sb?.anonKey || '').trim();
    mirrorCredentialsToBothKeys(u || undefined, k || undefined);
    const devId = saved?.deviceId || sb?.deviceId;
    if (devId) lsSet(LS.DEVICE_ID, String(devId).trim());
  } catch (e) {
    console.warn('[crozzo-sb] sync standalone', e);
  }
};
/** Guarda credenciales Supabase tras emparejamiento QR (sin UI Super Admin). */
window.crozzoPersistSupabaseConfigFromPairing = function crozzoPersistSupabaseConfigFromPairing(payload) {
  if (!payload || payload.syncEnabled === false) return false;
  const url = String(payload.url || '').trim();
  const key = crozzoSupabaseEffectiveAnonKey(payload);
  if (!isValidSupabasePair(url, key)) return false;
  try {
    const file = {
      version: 1,
      syncEnabled: true,
      url: url,
      anonKey: key,
      deviceName: String(payload.deviceName || '').trim(),
      deviceId: String(payload.deviceId || '').trim(),
      savedAt: Date.now(),
    };
    localStorage.setItem(CROZZO_SB_FILE, JSON.stringify(file));
    mirrorCredentialsToBothKeys(url, key);
    if (file.deviceId) lsSet(LS.DEVICE_ID, file.deviceId);
    if (file.deviceName) {
      try {
        localStorage.setItem('device_name', file.deviceName);
      } catch (_) {}
    }
    try {
      document.dispatchEvent(
        new CustomEvent('crozzo-supabase-config-saved', { detail: { url: url, syncEnabled: true } })
      );
    } catch (_) {}
    return true;
  } catch (e) {
    console.warn('[crozzo-sb] persist pairing cloud', e);
    return false;
  }
};
/** Cliente Supabase (solo si credenciales válidas). Nunca createClient con strings vacíos. */
async function initSupabaseClient() {
  window.__SUPABASE = null;
  try {
    crozzoScrubStaleHoneypotChaff();
  } catch (_) {}
  try {
    crozzoHealSupabaseConfigStorage();
  } catch (_) {}
  crozzoPurgeExpiredSupabaseAuthStorage();
  const creds = crozzoResolveSupabaseCredentials();
  const url = String(creds.url || '').trim();
  const key = String(creds.key || '').trim();
  if (!creds.syncOn || !url || !key || !isValidSupabasePair(url, key)) return null;
  try {
    const umd =
      typeof window !== 'undefined' && typeof window.supabase !== 'undefined' && window.supabase
        ? window.supabase
        : typeof supabase !== 'undefined'
          ? supabase
          : typeof globalThis !== 'undefined'
            ? globalThis.supabase
            : null;
    const createClient = umd && typeof umd.createClient === 'function' ? umd.createClient.bind(umd) : null;
    if (!createClient) {
      return null;
    }
    window.__SUPABASE = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storage: window.localStorage,
      },
    });
    await crozzoEnsureSupabaseAuthHealthy(window.__SUPABASE);
    return window.__SUPABASE;
  } catch (e) {
    console.warn('[crozzo-sb] initSupabaseClient', e);
    window.__SUPABASE = null;
    return null;
  }
}
/**
 * Ejecuta una consulta PostgREST con tolerancia a fallos (sin propagar errores duros a la UI).
 * @param {string} tableName
 * @param {(q: any) => Promise<any>} runner
 */
async function crozzoSafeQuery(tableName, runner) {
  if (!__CROZZO_SB_TABLES.includes(tableName)) {
    return { data: null, error: new Error('tabla_no_catalogada') };
  }
  const sb = window.__SUPABASE;
  if (!sb) return { data: null, error: null };
  try {
    return await runner(sb);
  } catch (e) {
    console.warn('[crozzo-sb] safeQuery', tableName, e);
    return { data: null, error: null };
  }
}
window.crozzoSafeQuery = crozzoSafeQuery;
function crozzoReadPairPullCacheRows(tableName) {
  try {
    const raw = localStorage.getItem('crozzo_pair_pull_' + tableName);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return Array.isArray(o.rows) ? o.rows : null;
  } catch {
    return null;
  }
}
window.crozzoReadPairPullCacheRows = crozzoReadPairPullCacheRows;
/**
 * SELECT genérico con filtros eq opcionales.
 * @param {string} tableName — nombre PostgREST exacto
 * @param {{ select?: string, where?: Record<string, unknown>, order?: { column: string, ascending?: boolean }, limit?: number }} [filters]
 */
async function loadTableData(tableName, filters = {}) {
  if (!__CROZZO_SB_TABLES.includes(tableName)) {
    return { data: null, error: new Error('tabla_no_catalogada') };
  }
  const sb = window.__SUPABASE;
  const cached = crozzoReadPairPullCacheRows(tableName);
  if (!sb) {
    return { data: cached, error: cached ? null : new Error('supabase_no_inicializado') };
  }
  const sel = filters.select || '*';
  try {
    let q = sb.from(tableName).select(sel);
    const where = filters.where || {};
    for (const [col, val] of Object.entries(where)) {
      q = q.eq(col, val);
    }
    if (filters.order?.column) q = q.order(filters.order.column, { ascending: filters.order.ascending !== false });
    if (Number.isFinite(filters.limit)) q = q.limit(filters.limit);
    const res = await q;
    if (res && res.error) {
      const msg = String(res.error.message || res.error.details || res.error.hint || res.error || '');
      if (crozzoIsSupabaseJwtError(res.error) || /InvalidJWTToken|JWT claim.*exp/i.test(msg)) {
        await crozzoRecoverSupabaseAuthFromJwtError({ quiet: true });
        try {
          const res2 = await q;
          if (res2 && !res2.error) return res2;
        } catch (_) {}
        return { data: cached, error: null };
      }
      if (/401|404|jwt|permission denied|rls|forbidden|invalid|42703|does not exist|column .* does not exist/i.test(msg)) {
        console.warn('[crozzo-sb] loadTableData soft-fail', tableName, res.error);
        return { data: cached, error: null };
      }
      console.warn('[crozzo-sb] loadTableData', tableName, res.error);
      return { data: cached != null ? cached : res.data, error: null };
    }
    return res;
  } catch (e) {
    if (crozzoIsSupabaseJwtError(e)) {
      await crozzoRecoverSupabaseAuthFromJwtError({ quiet: true });
    }
    console.warn('[crozzo-sb] loadTableData catch', tableName, e);
    return { data: cached, error: null };
  }
}
function readOfflineQueue() {
  try {
    const raw = lsGet(CROZZO_SYNC_QUEUE_KEY) || lsGet(LS.OFFLINE_QUEUE);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function writeOfflineQueue(arr) {
  lsSet(CROZZO_SYNC_QUEUE_KEY, JSON.stringify(arr));
  try {
    localStorage.removeItem(LS.OFFLINE_QUEUE);
  } catch (_) {}
}
function newOfflineSyncTransactionId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `tx-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
function isSyncQueueUniqueViolation(err) {
  if (!err) return false;
  if (err.code === '23505') return true;
  const msg = String(err.message || err.details || err.hint || '');
  return /duplicate|unique constraint|violates unique|already exists/i.test(msg);
}
window.__crozzoIsSyncQueueUniqueViolation = isSyncQueueUniqueViolation;
window.__crozzoNewOfflineSyncTransactionId = newOfflineSyncTransactionId;
function crozzoSyncPriorityForOp(op) {
  if (op && op.syncPriority != null && Number.isFinite(Number(op.syncPriority))) {
    return Math.max(0, Math.min(2, Number(op.syncPriority)));
  }
  if (typeof window.crozzoSyncPriorityForType === 'function') {
    return window.crozzoSyncPriorityForType(op && op.type);
  }
  const t = String((op && op.type) || '').toLowerCase();
  if (t === 'emergency_comanda' || t === 'comanda' || t === 'runtime') return 0;
  if (t === 'sale' || t === 'shift_close' || t === 'factura' || t === 'client' || t === 'pedido_interno' || t === 'preparation') return 1;
  return 2;
}
/** Encola operación cuando no hay red o falla insert a sync_queue. */
function enqueueOfflineOperation(op) {
  const q = readOfflineQueue();
  const payloadTid = op.payload && (op.payload.transaction_id || op.payload.sync_transaction_id);
  const tid =
    op.transaction_id ||
    op.sync_transaction_id ||
    op._emergency_tid ||
    payloadTid;
  const effectiveTid = tid || newOfflineSyncTransactionId();
  const dup = q.some((r) => {
    const rt = r.transaction_id || r.sync_transaction_id || r._emergency_tid || (r.payload && r.payload.transaction_id);
    return rt && String(rt) === String(effectiveTid);
  });
  if (dup) return { deduped: true };
  const row = {
    ...op,
    transaction_id: effectiveTid,
    syncPriority: crozzoSyncPriorityForOp(op),
    ts: Date.now(),
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
  };
  if (row.type === 'emergency_comanda' && tid && !row._emergency_tid) row._emergency_tid = tid;
  q.push(row);
  writeOfflineQueue(q);
}
window.enqueueOfflineOperation = enqueueOfflineOperation;
/**
 * Idempotencia de cola por factura (evita duplicar si se reintenta el mismo guardado).
 * DDL sugerido en Supabase (ajusta si ya tienes otra forma):
 *   create table if not exists public.sales (
 *     id uuid primary key default gen_random_uuid(),
 *     device_id uuid,
 *     total_amount numeric,
 *     currency text default 'COP',
 *     status text,
 *     snapshot jsonb,
 *     created_at timestamptz default now()
 *   );
 */
function crozzoSaleSyncTransactionId(f) {
  if (!f) return newOfflineSyncTransactionId();
  const attempt = f.saleAttemptId != null ? String(f.saleAttemptId) : '';
  if (attempt) return 'sale-attempt-' + attempt;
  const u = f.uuid != null ? String(f.uuid) : '';
  if (u) return 'sale-' + u;
  const c = f.consecutivo != null ? String(f.consecutivo) : '';
  if (c) return 'sale-consec-' + c + '-' + String(f.fechaEmision || f.fecha || '');
  return newOfflineSyncTransactionId();
}
/**
 * Estados locales del POS (pos, demo, timbrada) suelen violar CHECK en nube (p. ej. facturas_estado_check).
 * Mapea a etiquetas habituales en esquemas Supabase tipo emitida/borrador/anulada.
 */
function crozzoMapLocalFacturaEstadoForSupabase(estado, isDemo) {
  if (isDemo) return 'borrador';
  const e = String(estado || '')
    .toLowerCase()
    .trim();
  if (e === 'demo' || e === 'borrador') return 'borrador';
  if (e === 'anulada' || e === 'cancelada') return 'anulada';
  return 'emitida';
}
function crozzoCloudMirrorSaleStatusCandidates(primary) {
  const p = String(primary || 'emitida').trim() || 'emitida';
  const pool = [
    p,
    p.toUpperCase(),
    'emitida',
    'EMITIDA',
    'paid',
    'completed',
    'finalizada',
    'pagada',
    'PAGADA',
    'activa',
    'ACTIVA',
    'borrador',
    'BORRADOR',
  ];
  const out = [];
  const seen = new Set();
  for (const x of pool) {
    const s = String(x).trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}
function crozzoMirrorSaleCheckConstraintError(err) {
  if (!err) return false;
  if (String(err.code || '') === '23514') return true;
  const msg = String(err.message || err.details || err.hint || '');
  return /check constraint|facturas_estado_check|estado_check/i.test(msg);
}
function crozzoOfflineQueueHasSaleDuplicate(q, f, tid) {
  if (!Array.isArray(q) || !f) return false;
  const t = tid != null ? String(tid) : '';
  const attempt = f.saleAttemptId != null ? String(f.saleAttemptId) : '';
  const uuid = f.uuid != null ? String(f.uuid) : '';
  return q.some(function (r) {
    if (!r || r.type !== 'sale') return false;
    const rt =
      r.transaction_id ||
      r.sync_transaction_id ||
      (r.payload && (r.payload.transaction_id || r.payload.sync_transaction_id));
    if (t && rt && String(rt) === t) return true;
    const pf = r.payload && r.payload.factura;
    if (!pf) return false;
    if (uuid && pf.uuid && String(pf.uuid) === uuid) return true;
    if (attempt && pf.saleAttemptId != null && String(pf.saleAttemptId) === attempt) return true;
    return false;
  });
}
function crozzoQueueFacturaForCloudSync(f) {
  if (!f) return;
  try {
    const tid = crozzoSaleSyncTransactionId(f);
    const q = readOfflineQueue();
    if (crozzoOfflineQueueHasSaleDuplicate(q, f, tid)) {
      return;
    }
    const estadoSupa = crozzoMapLocalFacturaEstadoForSupabase(f.estado, !!f.is_demo);
    const facturaPayload = { ...f, estado: estadoSupa, saleAttemptId: f.saleAttemptId };
    const enq = enqueueOfflineOperation({
      operation: 'insert',
      table_name: 'sales',
      type: 'sale',
      transaction_id: tid,
      payload: {
        factura: facturaPayload,
        transaction_id: tid,
        at: Date.now(),
      },
      device_id: typeof crozzoCloudDeviceUuidForRest === 'function' ? crozzoCloudDeviceUuidForRest() : undefined,
    });
    if (enq && enq.deduped) return;
  } catch (e) {
    console.warn('[crozzo-sb] cola ventas', e);
  }
  if (typeof navigator !== 'undefined' && navigator.onLine && typeof syncOfflineQueue === 'function') {
    void Promise.resolve().then(() => syncOfflineQueue({ kind: 'sale_enqueue', priority: 1, force: true }));
  }
}
async function crozzoTryMirrorShiftCloseToSupabase(rec) {
  if (!rec || !window.__CROZZO_ONLINE_DATA || !window.__SUPABASE) return { ok: false, reason: 'offline_o_sin_cliente' };
  const sb = window.__SUPABASE;
  try {
    let id;
    try {
      id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'shift-' + Date.now();
    } catch (_) {
      id = 'shift-' + Date.now();
    }
    const dev = typeof crozzoCloudDeviceUuidForRest === 'function' ? crozzoCloudDeviceUuidForRest() : null;
    const row = {
      id,
      device_id: dev || null,
      business_date: rec.businessDate || null,
      shift_type: rec.shiftType || null,
      shift_id: rec.shiftId || null,
      closed_at: rec.closedAt || new Date().toISOString(),
      closed_by: rec.closedBy || null,
      closed_by_id: rec.closedById || null,
      sales_count: rec.salesCount != null ? Number(rec.salesCount) : null,
      total_sales: rec.totalSales != null ? Number(rec.totalSales) : null,
      cash_sales: rec.cashSales != null ? Number(rec.cashSales) : null,
      fondo: rec.fondo != null ? Number(rec.fondo) : null,
      expected: rec.expected != null ? Number(rec.expected) : null,
      actual: rec.actual != null ? Number(rec.actual) : null,
      diff: rec.diff != null ? Number(rec.diff) : null,
      auto_closed: !!rec.autoClosed,
      facturas_hash: rec.facturasHash || null,
      notes: rec.notes || null,
      record_json: rec,
    };
    const ins = await sb.from('shift_closes').insert(row);
    if (ins.error) {
      console.warn('[crozzo-sb] shift_closes insert', ins.error);
      return { ok: false, error: ins.error };
    }
    return { ok: true };
  } catch (e) {
    console.warn('[crozzo-sb] shift_closes', e);
    return { ok: false, error: e };
  }
}
window.crozzoTryMirrorShiftCloseToSupabase = crozzoTryMirrorShiftCloseToSupabase;

function crozzoTryMirrorAuditToSupabase(entry) {
  if (!entry || entry.synthetic) return;
  try {
    const dev = typeof crozzoCloudDeviceUuidForRest === 'function' ? crozzoCloudDeviceUuidForRest() : null;
    enqueueOfflineOperation({
      operation: 'insert',
      table_name: 'audit_logs',
      type: 'audit',
      transaction_id: 'audit-' + String(entry.chainHash || entry.timestamp || Date.now()),
      payload: {
        event_type: String(entry.action || 'event'),
        detail: String(entry.details == null ? '' : entry.details).slice(0, 4000),
        meta: {
          user: entry.user || null,
          modo: entry.modo || null,
          prev_hash: entry.prevHash || null,
          chain_hash: entry.chainHash || null,
          channel: entry.channel || 'operational',
        },
        device_id: dev || undefined,
        created_at: entry.timestamp || new Date().toISOString(),
      },
      device_id: dev || undefined,
    });
  } catch (e) {
    console.warn('[crozzo-sb] audit_logs queue', e);
  }
  if (typeof navigator !== 'undefined' && navigator.onLine && typeof syncOfflineQueue === 'function') {
    void Promise.resolve().then(() => syncOfflineQueue({ kind: 'audit_enqueue', priority: 2 }));
  }
}
window.crozzoTryMirrorAuditToSupabase = crozzoTryMirrorAuditToSupabase;

async function crozzoTryMirrorSaleToSupabase(f) {
  if (!f || !window.__CROZZO_ONLINE_DATA || !window.__SUPABASE) return;
  const sb = window.__SUPABASE;
  let id;
  try {
    id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'sale-' + Date.now();
  } catch (_) {
    id = 'sale-' + Date.now();
  }
  const dev = typeof crozzoCloudDeviceUuidForRest === 'function' ? crozzoCloudDeviceUuidForRest() : '';
  const total = Number(f.total) || 0;
  const primaryStatus = crozzoMapLocalFacturaEstadoForSupabase(f.estado, !!f.is_demo);
  const statusCandidates = crozzoCloudMirrorSaleStatusCandidates(primaryStatus);
  for (let si = 0; si < statusCandidates.length; si++) {
    const status = statusCandidates[si];
    let snap = { ...f, estado: status };
    try {
      const s = JSON.stringify(snap);
      if (s.length > 120000) {
        snap = {
          ...f,
          estado: status,
          items: Array.isArray(f.items) ? f.items.slice(0, 200) : [],
          _crozzo_truncated: true,
        };
      }
    } catch (_) {
      snap = { uuid: f.uuid, consecutivo: f.consecutivo, total, estado: status };
    }
    const attempts = [
      { id, device_id: dev, total_amount: total, currency: 'COP', status, snapshot: snap },
      { id, device_id: dev, total, estado: status, items: f.items || [], meta: { uuid: f.uuid, consecutivo: f.consecutivo, cufe: f.cufe } },
      { id, device_id: dev, payload: snap },
    ];
    let tryNextStatus = false;
    for (let i = 0; i < attempts.length; i++) {
      const r = await sb.from('sales').insert(attempts[i]);
      if (!r.error) return;
      const msg = String(r.error?.message || r.error?.details || '');
      if (/PGRST204|42703|column|schema cache|Could not find|does not exist/i.test(msg)) continue;
      if (/duplicate|23505|unique/i.test(msg)) return;
      if (crozzoMirrorSaleCheckConstraintError(r.error)) {
        tryNextStatus = true;
        break;
      }
      break;
    }
    if (!tryNextStatus) break;
  }
  if (!window.__crozzoSalesMirrorWarned) {
    window.__crozzoSalesMirrorWarned = true;
    console.warn(
      '[crozzo-sb] Insert en `sales` no coincide con tu esquema. Crea columnas (p. ej. snapshot, total_amount, device_id) o revisa Network. La venta sigue en cola offline.'
    );
  }
}
window.crozzoMapLocalFacturaEstadoForSupabase = crozzoMapLocalFacturaEstadoForSupabase;
window.crozzoQueueFacturaForCloudSync = crozzoQueueFacturaForCloudSync;
window.crozzoSaleSyncTransactionId = crozzoSaleSyncTransactionId;
window.crozzoOfflineQueueHasSaleDuplicate = crozzoOfflineQueueHasSaleDuplicate;
window.crozzoTryMirrorSaleToSupabase = crozzoTryMirrorSaleToSupabase;
/**
 * Normaliza fila para sync_queue antes de enviar a PostgREST.
 * Requiere: id, device_id, operation, table_name, payload, status (más type/transaction_id compat).
 */
function crozzoBuildSyncQueueInsertBody(row) {
  const payloadRaw = row.payload != null ? row.payload : row;
  const payload = payloadRaw != null && typeof payloadRaw === 'object' && !Array.isArray(payloadRaw) ? payloadRaw : { data: payloadRaw };
  let transaction_id =
    row.transaction_id ||
    row.sync_transaction_id ||
    (payload && (payload.transaction_id || payload.sync_transaction_id));
  if (!transaction_id) transaction_id = newOfflineSyncTransactionId();
  let id = row.id;
  try {
    if (!id && typeof crypto !== 'undefined' && crypto.randomUUID) id = crypto.randomUUID();
  } catch (_) {}
  if (!id) id = 'sq-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  const device_id = String(row.device_id || crozzoCloudDeviceUuidForRest() || '').trim();
  const operation = String(row.operation || row.type || row.action || 'sync').trim() || 'sync';
  const table_name = String(row.table_name || row.table || (payload && (payload.table_name || payload.table)) || 'unknown').trim() || 'unknown';
  const status = String(row.status || 'pending').trim() || 'pending';
  if (!device_id || !operation || !table_name) {
    console.warn('[crozzo-sb] sync_queue: fila inválida (device_id/operation/table_name)', {
      device_id,
      operation,
      table_name,
    });
    return null;
  }
  return {
    id,
    device_id,
    operation,
    table_name,
    payload,
    status,
    type: row.type || row.action || operation,
    transaction_id,
  };
}
/** Ajusta `payload.factura.estado` en cola offline para triggers que escriben `facturas` en Supabase. */
function crozzoSanitizeSyncQueueInsertBodyForFacturaEstado(insertBody) {
  if (!insertBody || typeof insertBody.payload !== 'object' || insertBody.payload === null) return insertBody;
  const p = insertBody.payload;
  const fac = p.factura;
  if (!fac || typeof fac !== 'object' || Array.isArray(fac)) return insertBody;
  const mapped = crozzoMapLocalFacturaEstadoForSupabase(fac.estado, !!fac.is_demo);
  if (mapped === fac.estado) return insertBody;
  return {
    ...insertBody,
    payload: {
      ...p,
      factura: { ...fac, estado: mapped },
    },
  };
}
/** Drena localStorage.sync_queue_temp → tabla sync_queue (payload flexible según tu DDL). */
async function syncOfflineQueue(opts) {
  opts = opts || {};
  if (!crozzoOnlineConfigReady()) return { ok: false, reason: 'config_invalida' };
  const sb = window.__SUPABASE;
  if (!sb || typeof navigator !== 'undefined' && !navigator.onLine) return { ok: false, reason: 'offline_o_sin_cliente' };
  const throttle = window.CrozzoCloudThrottle;
  const bypassThrottle =
    !!opts.force ||
    (window.CrozzoCloudSyncPriorities &&
      typeof window.CrozzoCloudSyncPriorities.shouldBypassThrottle === 'function' &&
      window.CrozzoCloudSyncPriorities.shouldBypassThrottle(
        opts.priority != null ? opts.priority : 2,
        opts
      ));
  if (throttle && typeof throttle.canRunDrain === 'function' && !bypassThrottle) {
    if (!throttle.canRunDrain(opts.kind || 'queue')) {
      return { ok: true, pushed: 0, skipped: 'throttle_gap' };
    }
  }
  // Candado de re-entrancia (fail-safe con TTL): evita que dos drenados solapados
  // de la misma cola inserten el mismo lote a la vez.
  if (window.__crozzoSyncQueueBusy && Date.now() - window.__crozzoSyncQueueBusy < 30000) {
    return { ok: true, pushed: 0, skipped: 'busy_reentrant' };
  }
  window.__crozzoSyncQueueBusy = Date.now();
  try {
  let pending = readOfflineQueue();
  if (window.CrozzoIdempotentSync && typeof CrozzoIdempotentSync.deduplicateQueue === 'function') {
    const ded = CrozzoIdempotentSync.deduplicateQueue(pending);
    if (ded.length !== pending.length) writeOfflineQueue(ded);
    pending = ded;
  }
  if (window.CrozzoCloudSyncPriorities && typeof window.CrozzoCloudSyncPriorities.sortQueueByPriority === 'function') {
    pending = window.CrozzoCloudSyncPriorities.sortQueueByPriority(pending);
  } else {
    pending = pending.slice().sort((a, b) => {
      const pa = crozzoSyncPriorityForOp(a);
      const pb = crozzoSyncPriorityForOp(b);
      if (pa !== pb) return pa - pb;
      return (Number(a.ts) || 0) - (Number(b.ts) || 0);
    });
  }
  if (!pending.length) return { ok: true, pushed: 0 };
  const batchMax =
    throttle && typeof throttle.batchLimit === 'function' ? throttle.batchLimit() : 8;
  const batch = pending.slice(0, batchMax);
  const deferred = pending.slice(batchMax);
  const remain = deferred.slice();
  let pushed = 0;
  for (const row of batch) {
    try {
      let insertBody = crozzoBuildSyncQueueInsertBody(row);
      if (insertBody) insertBody = crozzoSanitizeSyncQueueInsertBodyForFacturaEstado(insertBody);
      if (!insertBody) {
        remain.push(row);
        continue;
      }
      row.transaction_id = insertBody.transaction_id;
      let ins = await sb.from('sync_queue').insert(insertBody);
      if (ins.error) {
        const errStr = String(ins.error.message || ins.error.details || ins.error.hint || ins.error || '');
        if (/column|schema|could not find|42703|PGRST204|undefined column/i.test(errStr)) {
          const slim = {
            type: insertBody.type,
            payload: insertBody.payload,
            status: insertBody.status,
            device_id: insertBody.device_id,
            transaction_id: insertBody.transaction_id,
          };
          ins = await sb.from('sync_queue').insert(slim);
          if (ins.error) {
            const err2 = String(ins.error.message || ins.error.details || ins.error.hint || ins.error || '');
            if (/column|schema|could not find|42703|PGRST204|undefined column/i.test(err2)) {
              ins = await sb.from('sync_queue').insert({
                type: insertBody.type,
                payload_json: insertBody.payload,
                status: insertBody.status,
                device_id: insertBody.device_id,
                transaction_id: insertBody.transaction_id,
              });
            }
          }
        }
      }
      if (ins.error && isSyncQueueUniqueViolation(ins.error)) {
        pushed += 1;
        continue;
      }
      if (!ins.error) {
        pushed += 1;
        continue;
      }
      if (throttle && typeof throttle.noteSupabaseError === 'function') {
        throttle.noteSupabaseError(ins.error);
      }
      if (insertBody.transaction_id) {
        const slimUp = {
          type: insertBody.type,
          payload: insertBody.payload,
          status: insertBody.status,
          device_id: insertBody.device_id,
          transaction_id: insertBody.transaction_id,
        };
        const up = await sb.from('sync_queue').upsert(slimUp, { onConflict: 'transaction_id', ignoreDuplicates: true });
        if (!up.error) {
          pushed += 1;
          continue;
        }
        if (up.error && isSyncQueueUniqueViolation(up.error)) {
          pushed += 1;
          continue;
        }
        throw up.error;
      }
      throw ins.error;
    } catch (e) {
      if (throttle && typeof throttle.noteSupabaseError === 'function') throttle.noteSupabaseError(e);
      console.warn('[crozzo-sb] sync_queue item falló, se conserva en cola local', e);
      remain.push(row);
    }
  }
  writeOfflineQueue(remain);
  return { ok: true, pushed, remaining: remain.length, batched: batch.length };
  } finally {
    window.__crozzoSyncQueueBusy = 0;
  }
}
function mapDbRoleToAppRole(dbRole) {
  const r = String(dbRole || '').toLowerCase().replace(/\s+/g, '_');
  if (r === 'super_admin' || r === 'superadmin') return 'superadmin';
  if (r === 'admin') return 'admin';
  if (r === 'cajero' || r === 'caja') return 'caja';
  if (r === 'mesero') return 'mesero';
  return 'caja';
}
function buildSyntheticUserFromProfile(profile) {
  const appRol = mapDbRoleToAppRole(profile.role);
  const base = {
    id: profile.id,
    nombre: profile.full_name || profile.display_name || profile.email || 'Usuario',
    rol: appRol,
    activo: true,
    cloud: true,
    permisos: {
      caja: [
        'vista_pos',
        'vista_facturas',
        'vista_clientes',
        'abrir_orden',
        'editar_orden',
        'facturar',
      ],
      comandas: ['ver', 'despachar', 'reimprimir'],
      admin: [],
      inventario: [],
      productos: [],
    },
  };
  if (appRol === 'superadmin') {
    base.permisos.caja = [
      'vista_pos',
      'vista_tablets',
      'vista_facturas',
      'vista_clientes',
      'abrir_orden',
      'editar_orden',
      'eliminar_item',
      'anular_comandado',
      'tab_abrir',
      'tab_editar',
      'tab_eliminar',
      'facturar',
    ];
    base.permisos.admin = [
      'config_empresa',
      'config_impuestos',
      'config_comandas',
      'config_salon',
      'config_conexiones',
      'config_facturas_admin',
      'config_usuarios',
      'auditoria',
    ];
    base.permisos.inventario = ['reportes', 'proveedores'];
    base.permisos.productos = ['catalogo'];
  } else if (appRol === 'admin') {
    base.permisos.caja = [
      'vista_pos',
      'vista_tablets',
      'vista_facturas',
      'vista_clientes',
      'abrir_orden',
      'editar_orden',
      'eliminar_item',
      'anular_comandado',
      'tab_abrir',
      'tab_editar',
      'tab_eliminar',
      'facturar',
    ];
    base.permisos.admin = ['config_empresa', 'config_impuestos', 'config_usuarios', 'auditoria', 'nomina_planilla'];
    base.permisos.inventario = ['reportes', 'proveedores'];
    base.permisos.productos = ['catalogo'];
  } else if (appRol === 'mesero') {
    base.permisos.caja = ['vista_tablets', 'vista_clientes', 'tab_abrir', 'tab_editar'];
    base.permisos.comandas = ['ver', 'despachar'];
  } else if (appRol === 'caja') {
    base.permisos.caja = [
      'vista_pos',
      'vista_facturas',
      'vista_clientes',
      'abrir_orden',
      'editar_orden',
      'facturar',
    ];
  }
  return base;
}
/** Refuerzo visual por rol de profiles (no elimina nodos; solo display). */
function applyRolePermissions() {
  if (typeof window.applyAccessControl === 'function') {
    try {
      window.applyAccessControl();
    } catch (e) {
      console.warn('[crozzo-sb] applyAccessControl', e);
    }
  }
}
async function hydrateProfileFromSession(session) {
  const sb = window.__SUPABASE;
  if (!sb || !session?.user?.id) return null;
  if (!window.__crozzoAuthInteractiveThisBoot) {
    const live = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (!live) return null;
  }
  try {
    const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    if (error) throw error;
    let profile = data;
    if (!profile) {
      profile = {
        id: session.user.id,
        email: session.user.email,
        role: String(session.user.user_metadata?.role || 'cajero'),
        updated_at: new Date().toISOString(),
      };
      try {
        await sb.from('profiles').upsert(profile);
      } catch (upsertErr) {
        console.warn('[crozzo-sb] profiles upsert', upsertErr);
      }
    }
    const synthetic = buildSyntheticUserFromProfile(profile);
    const pack = { profile, synthetic, email: session.user.email };
    sessionStorage.setItem('crozzo_cloud_profile', JSON.stringify(pack));
    sessionStorage.setItem('crozzo_session_user', profile.id);
    try {
      sessionStorage.setItem('crozzo_cloud_auth_uid', session.user.id);
    } catch (_) {}
    currentSessionUserId = profile.id;
    if (typeof window.crozzoIssueSessionProof === 'function') {
      window.crozzoIssueSessionProof(profile.id);
    } else if (typeof CrozzoAuthSecurity !== 'undefined' && CrozzoAuthSecurity.crozzoIssueAuthProof) {
      CrozzoAuthSecurity.crozzoIssueAuthProof(profile.id);
    }
    if (typeof crozzoSyncUserRoleStorage === 'function') crozzoSyncUserRoleStorage();
    return pack;
  } catch (e) {
    console.warn('[crozzo-sb] profiles', e);
    return null;
  }
}
/** Crear usuario login nube (email + contraseña). Requiere Auth habilitado en Supabase. */
window.crozzoCreateCloudUser = async function crozzoCreateCloudUser(opts) {
  opts = opts || {};
  const sb = window.__SUPABASE;
  if (!sb || !sb.auth) {
    return { ok: false, message: 'Active la nube (Supabase) antes de crear usuarios.' };
  }
  const email = String(opts.email || '').trim();
  const password = String(opts.password || '').trim();
  const role = String(opts.role || 'cajero').trim() || 'cajero';
  if (!email.includes('@')) return { ok: false, message: 'Ingrese un correo válido.' };
  if (password.length < 6) return { ok: false, message: 'La contraseña debe tener al menos 6 caracteres.' };
  try {
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { role } },
    });
    if (error) return { ok: false, message: crozzoCloudFacingErr(error) };
    if (data?.user?.id) {
      try {
        await sb.from('profiles').upsert({
          id: data.user.id,
          email,
          role,
          updated_at: new Date().toISOString(),
        });
      } catch (_) {}
    }
    const needsConfirm = !data?.session;
    return {
      ok: true,
      needsConfirm,
      message: needsConfirm
        ? 'Usuario creado. Si Supabase pide confirmar correo, revise el email o desactive «Confirm email» en Authentication → Providers → Email.'
        : 'Usuario creado. Ya puede iniciar sesión con ese correo y contraseña.',
    };
  } catch (e) {
    return { ok: false, message: crozzoCloudFacingErr(e) };
  }
};
window.__crozzoHandleLoginWithSupabase = async function handleLoginWithSupabase() {
  if (typeof crozzoSecurityBlocksRealSession === 'function' && crozzoSecurityBlocksRealSession()) {
    return { handled: true, ok: false, error: 'sistema_bloqueado' };
  }
  const sb = window.__SUPABASE;
  const rawUser = (document.getElementById('loginUsername')?.value || '').trim();
  const pwd = (document.getElementById('loginPassword')?.value || '').trim();
  if (!sb || !rawUser.includes('@')) return { handled: false };
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email: rawUser, password: pwd });
    if (error) return { handled: true, ok: false, error: crozzoCloudFacingErr(error) };
    if (typeof window.crozzoMarkInteractiveLoginBoot === 'function') window.crozzoMarkInteractiveLoginBoot();
    await hydrateProfileFromSession(data.session);
    return { handled: true, ok: true };
  } catch (e) {
    return { handled: true, ok: false, error: crozzoCloudFacingErr(e) };
  }
};
window.__crozzoSupabaseSignOut = async function crozzoSupabaseSignOut() {
  try {
    if (typeof crozzoStopRemoteTenantSync === 'function') crozzoStopRemoteTenantSync();
    if (typeof crozzoStopPosRuntimeCloudSync === 'function') crozzoStopPosRuntimeCloudSync();
    if (typeof crozzoStopComandasCloudSync === 'function') crozzoStopComandasCloudSync();
    sessionStorage.removeItem('crozzo_cloud_profile');
    if (window.__SUPABASE?.auth) await window.__SUPABASE.auth.signOut();
  } catch (e) {
    console.warn('[crozzo-sb] signOut', e);
  }
};
window.__crozzoRegisterDeviceHeartbeat = async function registerDeviceHeartbeat() {
  const sb = window.__SUPABASE;
  if (!sb) return;
  const deviceId = crozzoCloudDeviceUuidForRest();
  const name = (lsGet(LS.DEVICE_NAME) || 'POS').trim() || 'POS';
  const ts = new Date().toISOString();
  let deviceType = 'central';
  try {
    if (typeof config !== 'undefined' && config && typeof config.get === 'function') {
      const role = (config.get('conexionSistemas') || {}).role;
      if (role === 'B') deviceType = 'tablet';
    }
  } catch (_) {}
  const rowLegacy = { device_id: deviceId, name, last_sync_at: ts };
  const patch = { name, last_sync_at: ts, is_active: true };
  /** Alineado a devices_type_check típico: central, tablet, pos, terminal, register, sync, mobile, desktop, A, B. */
  const allowedTypes = ['central', 'tablet', 'pos', 'terminal', 'register', 'sync', 'mobile', 'desktop', 'A', 'B'];
  const orderedTypes = [deviceType, ...allowedTypes.filter((t) => t !== deviceType)];
  try {
    for (let i = 0; i < orderedTypes.length; i++) {
      const typ = orderedTypes[i];
      const upd = await sb.from('devices').update({ ...patch, type: typ }).eq('id', deviceId).select('id');
      if (!upd.error && Array.isArray(upd.data) && upd.data.length) return;
      const ins = await sb.from('devices').insert({ id: deviceId, name, last_sync_at: ts, type: typ, is_active: true }).select('id');
      if (!ins.error) return;
      const msg = String(ins.error.message || ins.error.details || ins.error.code || '');
      const dup = /duplicate|unique|23505|409/i.test(msg);
      if (dup) {
        const u2 = await sb.from('devices').update({ ...patch, type: typ }).eq('id', deviceId).select('id');
        if (!u2.error) return;
      }
      const isCheck = String(ins.error.code || '') === '23514' || /check constraint|devices_type_check/i.test(msg);
      if (!isCheck) {
        const msg2 = String(ins.error.message || ins.error.details || '');
        if (/42703|column|does not exist|PGRST204/i.test(msg2) && /device_id/i.test(msg2)) {
          const resL = await sb.from('devices').upsert(rowLegacy, { onConflict: 'device_id' });
          if (!resL.error) return;
        }
        console.warn('[crozzo-sb] devices insert', ins.error);
        return;
      }
    }
    console.warn('[crozzo-sb] devices heartbeat: ningún type válido para CHECK');
  } catch (e) {
    console.warn('[crozzo-sb] devices heartbeat', e);
  }
};
function mapRemoteProductToLocal(row) {
  const price = Number(row.price ?? row.precio ?? 0);
  const stock = row.stock != null ? Number(row.stock) : undefined;
  return {
    id: Number(row.id) || row.id,
    nombre: row.name || row.nombre || 'Producto',
    precio: price,
    ivaRate: row.iva_rate != null ? Number(row.iva_rate) : Number(row.ivaRate ?? 0),
    icon: row.icon || '📦',
    categoria: row.category_slug || row.categoria || 'general',
    barcode: row.barcode || row.code || '',
    sku: row.sku || '',
    stock,
    areaComanda: row.area_comanda || row.areaComanda,
    areasComanda: Array.isArray(row.areas_comanda)
      ? row.areas_comanda
      : Array.isArray(row.areasComanda)
        ? row.areasComanda
        : row.area_comanda || row.areaComanda
          ? [row.area_comanda || row.areaComanda]
          : undefined,
    opcionGrupos: Array.isArray(row.opcion_grupos) ? row.opcion_grupos : row.opcionGrupos,
    arrastraProductos: Array.isArray(row.arrastra_productos) ? row.arrastra_productos : row.arrastraProductos,
  };
}
window.mapRemoteProductToLocal = mapRemoteProductToLocal;
/** Fila PostgREST `products` desde el modelo UI (nombres alineados a mapRemoteProductToLocal). */
function mapLocalProductToSupabaseRow(p) {
  const id = p.id != null ? p.id : null;
  const row = {
    id,
    name: String(p.nombre || 'Producto').trim() || 'Producto',
    price: Number(p.precio) || 0,
    iva_rate: p.ivaRate != null ? Number(p.ivaRate) : 0,
    icon: p.icon || '📦',
    category_slug: String(p.categoria || 'general').trim() || 'general',
  };
  if (p.barcode) row.barcode = String(p.barcode);
  if (p.sku) row.sku = String(p.sku);
  if (p.stock != null && !Number.isNaN(Number(p.stock))) row.stock = Number(p.stock);
  if (p.areaComanda) row.area_comanda = String(p.areaComanda);
  if (Array.isArray(p.areasComanda) && p.areasComanda.length) {
    row.areas_comanda = p.areasComanda.map(String);
  }
  return row;
}
/** Catálogo en `pos_dian_config` para sobrevivir recargas y otro equipo (misma cuenta/archivo). */
function hydrateCatalogFromConfig() {
  try {
    const saved = config.get('catalogoProductos');
    if (!Array.isArray(saved) || saved.length === 0) return;
    products.length = 0;
    saved.forEach((x) => products.push({ ...x }));
    ensureProductsArea();
  } catch (e) {
    console.warn('[catalog] hydrate', e);
  }
}
function persistCatalogProductosLocal() {
  try {
    config.set(
      'catalogoProductos',
      products.map((p) => JSON.parse(JSON.stringify(p)))
    );
  } catch (e) {
    console.warn('[catalog] persist local', e);
  }
}
async function pushProductRowToSupabase(productId) {
  if (!window.__CROZZO_ONLINE_DATA || !window.__SUPABASE) return;
  const p = products.find((x) => String(x.id) === String(productId));
  if (!p) return;
  const sb = window.__SUPABASE;
  const row = mapLocalProductToSupabaseRow(p);
  if (row.id == null) return;
  try {
    const up = await sb.from('products').update(row).eq('id', row.id).select('id');
    if (!up.error && Array.isArray(up.data) && up.data.length) return;
    const ins = await sb.from('products').insert(row).select('id');
    if (!ins.error) return;
    await sb.from('products').upsert(row, { onConflict: 'id' });
  } catch (e) {
    console.warn('[catalog] push cloud', e);
  }
}
function persistCatalogProductos(productId) {
  persistCatalogProductosLocal();
  if (productId != null && window.__CROZZO_ONLINE_DATA && window.__SUPABASE) {
    void pushProductRowToSupabase(productId);
  }
}
/**
 * Sube TODO el catálogo local (productos) a la nube de una sola vez. Útil cuando
 * la caja construyó su menú offline/antes de activar la nube: la tabla `products`
 * queda vacía y los equipos nuevos no tienen qué descargar. Los productos llevan
 * categoría (category_slug) e IVA (iva_rate) embebidos, así que el menú queda
 * completo. También refresca marca/usuarios (company_config). Best-effort por lotes.
 */
async function crozzoSubirCatalogoNube(opts) {
  opts = opts || {};
  const sb = window.__SUPABASE;
  if (!sb || typeof crozzoOnlineConfigReady !== 'function' || !crozzoOnlineConfigReady()) {
    return { ok: false, reason: 'sin_nube', message: 'Active la nube (Supabase) antes de subir el catálogo.' };
  }
  const list = typeof products !== 'undefined' && Array.isArray(products) ? products : [];
  const rows = [];
  for (let i = 0; i < list.length; i++) {
    try {
      const r = mapLocalProductToSupabaseRow(list[i]);
      if (r && r.id != null) rows.push(r);
    } catch (_) {}
  }
  let pushed = 0;
  let failed = 0;
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    if (typeof opts.onProgress === 'function') {
      try {
        opts.onProgress(Math.min(i + chunk.length, rows.length), rows.length);
      } catch (_) {}
    }
    try {
      const res = await sb.from('products').upsert(chunk, { onConflict: 'id' });
      if (res.error) {
        // Reintento fila por fila: tolera filas/columnas problemáticas sin abortar.
        for (let j = 0; j < chunk.length; j++) {
          try {
            const r1 = await sb.from('products').upsert(chunk[j], { onConflict: 'id' });
            if (r1.error) failed++;
            else pushed++;
          } catch (_) {
            failed++;
          }
        }
      } else {
        pushed += chunk.length;
      }
    } catch (e) {
      failed += chunk.length;
    }
  }
  let tenant = false;
  try {
    if (typeof crozzoPushTenantSnapshotToCloud === 'function') tenant = await crozzoPushTenantSnapshotToCloud();
  } catch (_) {}
  return { ok: failed === 0, total: rows.length, pushed: pushed, failed: failed, tenant: tenant };
}
window.crozzoSubirCatalogoNube = crozzoSubirCatalogoNube;
window.hydrateCatalogFromConfig = hydrateCatalogFromConfig;
window.persistCatalogProductos = persistCatalogProductos;
window.__crozzoBootstrapCloudData = async function bootstrapCloudData() {
  const sb = window.__SUPABASE;
  if (!sb || typeof window.__crozzoApplyProductsFromRemote !== 'function') return;
  try {
    const { data, error } = await sb.from('products').select('*').limit(500);
    if (error) throw error;
    if (Array.isArray(data) && data.length) {
      window.__crozzoApplyProductsFromRemote(data.map(mapRemoteProductToLocal));
      try {
        persistCatalogProductosLocal();
      } catch (_) {}
    }
  } catch (e) {
    console.warn('[crozzo-sb] products bootstrap (opcional)', e);
  }
};
async function crozzoEnsureCloudClientReady() {
  if (!crozzoOnlineConfigReady()) return false;
  if (window.__SUPABASE) return true;
  try {
    await initSupabaseClient();
  } catch (e) {
    console.warn('[crozzo-sb] ensureCloudClientReady', e);
    return false;
  }
  return !!window.__SUPABASE;
}
window.crozzoEnsureCloudClientReady = crozzoEnsureCloudClientReady;
/** Prueba viva REST contra Supabase (Wi‑Fi o datos móviles). */
window.crozzoProbeSupabaseLive = async function crozzoProbeSupabaseLive() {
  if (!(await crozzoEnsureCloudClientReady())) return false;
  var sb = window.__SUPABASE;
  if (!sb) return false;
  try {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var tid = ctrl ? setTimeout(function () { ctrl.abort(); }, 5000) : null;
    var res = await sb.from('crozzo_sede_runtime').select('location_id').limit(1);
    if (tid) clearTimeout(tid);
    if (res && res.error) {
      var msg = String((res.error && res.error.message) || res.error || '');
      if (/relation|does not exist|404|PGRST205/i.test(msg)) {
        res = await sb.from('devices').select('id').limit(1);
      }
    }
    var ok = !!(res && !res.error);
    if (ok && typeof window.crozzoNoteWanReachable === 'function') window.crozzoNoteWanReachable();
    return ok;
  } catch (e) {
    return false;
  }
};
window.__crozzoPostInitCloud = async function postInitCloud() {
  if (!(await crozzoEnsureCloudClientReady())) return;
  var wait = 0;
  while (
    wait < 12 &&
    (typeof crozzoStartPosRuntimeCloudSync !== 'function' || typeof crozzoStartComandasCloudSync !== 'function')
  ) {
    await new Promise(function (r) {
      setTimeout(r, 150);
    });
    wait++;
  }
  try {
    if (typeof window.crozzoEnsureCloudSyncActive === 'function') {
      await window.crozzoEnsureCloudSyncActive({ source: 'postInit', resetTableMissing: true });
    } else {
      if (typeof crozzoStartComandasCloudSync === 'function') crozzoStartComandasCloudSync();
      if (typeof crozzoStartPosRuntimeCloudSync === 'function') crozzoStartPosRuntimeCloudSync();
    }
    if (typeof crozzoPullRemoteTenantState === 'function') {
      await crozzoPullRemoteTenantState({ skipRender: true, quiet: true });
    }
  } catch (ePull) {
    console.warn('[crozzo-sb] cloud pull init', ePull);
  }
  try {
    if (typeof crozzoPushPosStaffToCloud === 'function') {
      await crozzoPushPosStaffToCloud();
    }
  } catch (_) {}
  try {
    if (typeof crozzoPullRemoteStaffState === 'function') {
      await crozzoPullRemoteStaffState({ quiet: true });
    }
  } catch (_) {}
  if (typeof getCurrentUser === 'function' && !getCurrentUser()) return;
  try {
    await window.__crozzoRegisterDeviceHeartbeat?.();
    await window.__crozzoBootstrapCloudData?.();
  } catch (e) {
    console.warn('[crozzo-sb] postInitCloud', e);
  }
  applyRolePermissions();
  try {
    if (typeof startCrozzoRemoteTenantSync === 'function') startCrozzoRemoteTenantSync();
  } catch (e2) {
    console.warn('[crozzo-sb] tenant sync init', e2);
  }
};
/** Vuelve a leer `products` desde Supabase y opcionalmente repinta la vista actual (otro dispositivo / pestaña). */
window.__crozzoRefreshCloudCatalogUi = async function crozzoRefreshCloudCatalogUi(opts) {
  if (!(await crozzoEnsureCloudClientReady())) return false;
  try {
    if (typeof window.__crozzoBootstrapCloudData === 'function') await window.__crozzoBootstrapCloudData();
  } catch (e) {
    console.warn('[crozzo-sb] refreshCloudCatalogUi', e);
    return false;
  }
  try {
    if (typeof window.updateCrozzoStorageModeBadge === 'function') window.updateCrozzoStorageModeBadge();
  } catch (_) {}
  if (opts && opts.skipRender) return true;
  try {
    if (
      typeof crozzoPatchOperationalPageFromRemote === 'function' &&
      crozzoPatchOperationalPageFromRemote(typeof currentPage !== 'undefined' ? currentPage : '')
    ) {
      return true;
    }
    if (typeof currentPage !== 'undefined' && typeof renderPage === 'function') {
      renderPage(currentPage || 'cajero', { background: true });
    }
  } catch (e2) {
    console.warn('[crozzo-sb] refreshCloudCatalogUi render', e2);
  }
  return true;
};
// --- Sincronización remota: logos / identidad, permisos de staff y perfil Supabase ---
var __crozzoTenantSyncStarted = false;
var __crozzoTenantHub = null;
var __crozzoTenantPgCh = null;
var __crozzoTenantDebounceT = null;
var __crozzoTenantProductsDebounceT = null;
var __crozzoTenantPushTimer = null;
var __crozzoTenantPushEchoUntil = 0;
var __crozzoTenantRealtimeLive = false;
var __crozzoTenantLastPullAt = 0;
var __crozzoBizLookupCache = {};
var CROZZO_TENANT_VIS_SKIP_MS = 90000;
var __crozzoTenantReconnectT = null;
var __crozzoTenantReconnectTry = 0;
var __crozzoTenantWatchdogT = null;
var CROZZO_TENANT_RECONNECT_MAX = 6;
var __crozzoTenantBC =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('crozzo_tenant_v1') : null;
function crozzoTenantRealtimeIsLive() {
  return !!(__crozzoTenantRealtimeLive && __crozzoTenantPgCh);
}
window.crozzoTenantRealtimeIsLive = crozzoTenantRealtimeIsLive;
window.crozzoShouldSkipVisibilityCloudPull = function crozzoShouldSkipVisibilityCloudPull() {
  if (!crozzoTenantRealtimeIsLive()) return false;
  return Date.now() - __crozzoTenantLastPullAt < CROZZO_TENANT_VIS_SKIP_MS;
};
function crozzoTenantMarkPullDone() {
  __crozzoTenantLastPullAt = Date.now();
}
function crozzoTenantDebouncedProductsSync() {
  if (__crozzoTenantProductsDebounceT) clearTimeout(__crozzoTenantProductsDebounceT);
  __crozzoTenantProductsDebounceT = setTimeout(function () {
    __crozzoTenantProductsDebounceT = null;
    if (Date.now() < __crozzoTenantPushEchoUntil) return;
    if (typeof window.__crozzoBootstrapCloudData !== 'function') return;
    window.__crozzoBootstrapCloudData().catch(function (e) {
      console.warn('[crozzo-tenant] products realtime', e);
    });
  }, 1400);
}
function crozzoStopRemoteTenantSync() {
  __crozzoTenantSyncStarted = false;
  __crozzoTenantRealtimeLive = false;
  if (__crozzoTenantReconnectT) {
    clearTimeout(__crozzoTenantReconnectT);
    __crozzoTenantReconnectT = null;
  }
  if (__crozzoTenantWatchdogT) {
    clearInterval(__crozzoTenantWatchdogT);
    __crozzoTenantWatchdogT = null;
  }
  try {
    if (__crozzoTenantPgCh && typeof __crozzoTenantPgCh.unsubscribe === 'function') {
      __crozzoTenantPgCh.unsubscribe();
    }
  } catch (_) {}
  __crozzoTenantPgCh = null;
  try {
    if (__crozzoTenantHub && typeof __crozzoTenantHub.unsubscribe === 'function') {
      __crozzoTenantHub.unsubscribe();
    }
  } catch (_) {}
  __crozzoTenantHub = null;
}
window.crozzoStopRemoteTenantSync = crozzoStopRemoteTenantSync;
/**
 * Reconexión del realtime de la sub base (tenant) con backoff exponencial.
 * Solo actúa si la nube está configurada, hay cliente y hay red; nunca resucita
 * un sync detenido a propósito (logout / sync apagado dejan __SUPABASE/config off).
 */
function crozzoScheduleTenantRealtimeReconnect(reason) {
  if (typeof crozzoOnlineConfigReady !== 'function' || !crozzoOnlineConfigReady() || !window.__SUPABASE) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (__crozzoTenantReconnectT) return;
  var tryN = Math.min(__crozzoTenantReconnectTry, CROZZO_TENANT_RECONNECT_MAX);
  var delay = Math.min(30000, 1500 * Math.pow(2, tryN)) + Math.floor(Math.random() * 600);
  __crozzoTenantReconnectT = setTimeout(function () {
    __crozzoTenantReconnectT = null;
    if (crozzoTenantRealtimeIsLive()) {
      __crozzoTenantReconnectTry = 0;
      return;
    }
    __crozzoTenantReconnectTry++;
    console.warn('[crozzo-tenant] realtime reconnect (' + (reason || 'auto') + ') intento ' + __crozzoTenantReconnectTry);
    try {
      crozzoStopRemoteTenantSync();
    } catch (_) {}
    try {
      startCrozzoRemoteTenantSync();
    } catch (_) {}
    if (typeof crozzoPullRemoteTenantState === 'function') {
      crozzoPullRemoteTenantState({ skipRender: true, quiet: true }).catch(function () {});
    }
  }, delay);
}
window.crozzoScheduleTenantRealtimeReconnect = crozzoScheduleTenantRealtimeReconnect;
function crozzoParseTenantSnapshotFromRow(row) {
  if (!row || typeof row !== 'object') return null;
  if (row.tenant_snapshot && typeof row.tenant_snapshot === 'object') return row.tenant_snapshot;
  try {
    if (row.config_json && typeof row.config_json === 'object' && row.config_json.tenant_snapshot) {
      return row.config_json.tenant_snapshot;
    }
  } catch (_) {}
  if (row.data && typeof row.data === 'object' && (row.data.branding || row.data.staff_meta)) return row.data;
  if (row.settings && typeof row.settings === 'object' && row.settings.tenant_snapshot) return row.settings.tenant_snapshot;
  if (row.branding && typeof row.branding === 'object') return { branding: row.branding, staff_meta: row.staff_meta, updated_at: row.updated_at };
  return null;
}
function crozzoApplyRemoteTenantBundle(bundle, opts) {
  if (!bundle || typeof bundle !== 'object') return false;
  let changed = false;
  const quiet = opts && opts.quiet;
  try {
    if (bundle.branding && typeof bundle.branding === 'object' && typeof setCrozzoBranding === 'function') {
      setCrozzoBranding(bundle.branding);
      if (typeof applyCrozzoBrandingChrome === 'function') applyCrozzoBrandingChrome();
      changed = true;
    }
  } catch (e) {
    console.warn('[crozzo-tenant] branding', e);
  }
  try {
    if (Array.isArray(bundle.staff_meta) && bundle.staff_meta.length && typeof getUsuariosConfig === 'function' && typeof saveUsuarios === 'function') {
      const conf = getUsuariosConfig();
      const prevStaff = conf.staff || [];
      const metaById = {};
      bundle.staff_meta.forEach(function (r) {
        if (r && r.id) metaById[String(r.id).toUpperCase()] = r;
      });
      let next = prevStaff.map(function (u) {
        const r = metaById[String(u.id || '').toUpperCase()];
        if (!r) return u;
        if (u.rol === 'superadmin' && u.id === 'KENNY') return u;
        return {
          ...u,
          nombre: r.nombre != null ? r.nombre : u.nombre,
          rol: r.rol != null ? r.rol : u.rol,
          activo: r.activo !== undefined ? !!r.activo : u.activo,
          permisos: r.permisos && typeof r.permisos === 'object' ? r.permisos : u.permisos,
          configDispositivo:
            r.configDispositivo && typeof r.configDispositivo === 'object'
              ? { ...(u.configDispositivo || {}), ...r.configDispositivo }
              : u.configDispositivo,
        };
      });
      Object.keys(metaById).forEach(function (idKey) {
        if (idKey === 'KENNY') return;
        if (next.some(function (u) { return String(u.id || '').toUpperCase() === idKey; })) return;
        const r = metaById[idKey];
        next.push({
          id: idKey,
          nombre: r.nombre || idKey,
          rol: r.rol || 'caja',
          activo: r.activo !== false,
          requiereClaveInicial: true,
          permisos: r.permisos && typeof r.permisos === 'object' ? r.permisos : { caja: [], comandas: [], admin: [], inventario: [], productos: [] },
          configDispositivo: r.configDispositivo && typeof r.configDispositivo === 'object' ? r.configDispositivo : {},
        });
        changed = true;
      });
      if (JSON.stringify(next) !== JSON.stringify(prevStaff)) {
        saveUsuarios(next);
        changed = true;
      }
    }
  } catch (e2) {
    console.warn('[crozzo-tenant] staff_meta', e2);
  }
  if (changed && !quiet && typeof showToast === 'function') {
    showToast('Cambios del negocio aplicados desde la nube', 'info');
  }
  if (changed && typeof crozzoRebuildMenusFromRoles === 'function') crozzoRebuildMenusFromRoles();
  if (changed && typeof applyAccessControl === 'function') applyAccessControl();
  return changed;
}
function crozzoPosStaffCloudCtx() {
  var md = typeof getMultiDeviceConfig === 'function' ? getMultiDeviceConfig() : {};
  var loc = String(md.locationId || 'default').trim() || 'default';
  try {
    if (typeof crozzoEnsureSedeLocationId === 'function') {
      var ensured = String(crozzoEnsureSedeLocationId() || '').trim();
      if (ensured) loc = ensured;
    }
  } catch (_) {}
  return {
    locationId: loc,
    businessId: String(md.businessId || '').trim(),
  };
}
function crozzoLocalStaffToPosStaffRow(u, ctx) {
  ctx = ctx || crozzoPosStaffCloudCtx();
  if (!u || !u.id || String(u.id).toUpperCase() === 'KENNY') return null;
  var row = {
    id: String(u.id).toUpperCase(),
    location_id: ctx.locationId || 'default',
    nombre: u.nombre || u.id,
    rol: u.rol || 'caja',
    activo: u.activo !== false,
    permisos: u.permisos && typeof u.permisos === 'object' ? u.permisos : {},
    config_dispositivo:
      u.configDispositivo && typeof u.configDispositivo === 'object' ? u.configDispositivo : {},
    updated_at: new Date().toISOString(),
  };
  if (ctx.businessId) row.business_id = ctx.businessId;
  if (u.claveHash && u.claveSalt) {
    row.pin_hash = String(u.claveHash) + ':' + String(u.claveSalt);
    return row;
  }
  return null;
}
/** Sube hashes de contraseña (pos_staff) para que tablets/APK usen las mismas credenciales que la caja. */
async function crozzoPushPosStaffToCloud() {
  if (typeof crozzoOnlineConfigReady !== 'function' || !crozzoOnlineConfigReady() || !window.__SUPABASE) {
    return false;
  }
  if (typeof getUsuariosConfig !== 'function') return false;
  var ctx = crozzoPosStaffCloudCtx();
  var staff = getUsuariosConfig().staff || [];
  var rows = [];
  for (var i = 0; i < staff.length; i++) {
    var r = crozzoLocalStaffToPosStaffRow(staff[i], ctx);
    if (r) rows.push(r);
  }
  if (!rows.length) return false;
  var sb = window.__SUPABASE;
  try {
    var res = await sb.from('pos_staff').upsert(rows, { onConflict: 'id,location_id' });
    if (res && res.error) {
      res = await sb.from('pos_staff').upsert(rows, { onConflict: 'id' });
    }
    if (res && res.error) {
      console.warn('[crozzo-sb] push pos_staff', res.error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[crozzo-sb] push pos_staff', e);
    return false;
  }
}
window.crozzoPushPosStaffToCloud = crozzoPushPosStaffToCloud;
/** Descarga pos_staff (credenciales) desde Supabase hacia este equipo. */
async function crozzoPullRemoteStaffState(opts) {
  opts = opts || {};
  if (typeof crozzoOnlineConfigReady !== 'function' || !crozzoOnlineConfigReady() || !window.__SUPABASE) {
    return false;
  }
  if (typeof loadTableData !== 'function' || typeof crozzoApplyPosStaffFromRemote !== 'function') return false;
  var ctx = crozzoPosStaffCloudCtx();
  var loc = ctx.locationId;
  var res = null;
  if (loc && loc !== 'default') {
    res = await loadTableData('pos_staff', { where: { location_id: loc }, limit: 200 });
  }
  var rows = res && Array.isArray(res.data) ? res.data : [];
  if (!rows.length) {
    res = await loadTableData('pos_staff', { limit: 200 });
    rows = res && Array.isArray(res.data) ? res.data : [];
  }
  if (!rows.length) return false;
  var applied = crozzoApplyPosStaffFromRemote(rows, loc);
  if (applied && !opts.quiet && typeof showToast === 'function') {
    showToast('Usuarios actualizados desde la nube', 'info');
  }
  return applied;
}
window.crozzoPullRemoteStaffState = crozzoPullRemoteStaffState;
/** Importa usuarios de caja desde `pos_staff` (nube) tras emparejamiento QR. */
window.crozzoApplyPosStaffFromRemote = function crozzoApplyPosStaffFromRemote(rows, locationId) {
  if (!Array.isArray(rows) || !rows.length) return false;
  if (typeof getUsuariosConfig !== 'function' || typeof saveUsuarios !== 'function') return false;
  const loc = String(locationId || 'default').trim();
  const conf = getUsuariosConfig();
  let staff = (conf.staff || []).slice();
  let changed = false;
  rows.forEach(function (row) {
    if (!row || !row.id) return;
    if (loc && row.location_id && String(row.location_id) !== loc) return;
    const id = String(row.id).toUpperCase();
    if (id === 'KENNY') return;
    const prev = staff.find(function (s) {
      return String(s.id || '').toUpperCase() === id;
    });
    const merged = {
      ...(prev || { id: id, requiereClaveInicial: true }),
      nombre: row.nombre || (prev && prev.nombre) || id,
      rol: row.rol || (prev && prev.rol) || 'caja',
      activo: row.activo !== false,
      permisos:
        row.permisos && typeof row.permisos === 'object'
          ? row.permisos
          : prev && prev.permisos
            ? prev.permisos
            : { caja: [], comandas: [], admin: [], inventario: [], productos: [] },
      configDispositivo:
        row.config_dispositivo || row.configDispositivo || (prev && prev.configDispositivo) || {},
    };
    if (row.pin_hash && typeof row.pin_hash === 'string' && row.pin_hash.indexOf(':') > 0) {
      const parts = row.pin_hash.split(':');
      if (parts.length >= 2) {
        merged.claveHash = parts[0];
        merged.claveSalt = parts.slice(1).join(':');
        delete merged.requiereClaveInicial;
        delete merged.clave;
        delete merged.clavePendienteRotacion;
      }
    } else if (!prev) {
      merged.requiereClaveInicial = true;
    }
    if (!prev) {
      staff.push(merged);
      changed = true;
    } else if (JSON.stringify(prev) !== JSON.stringify(merged)) {
      staff = staff.map(function (s) {
        return String(s.id || '').toUpperCase() === id ? merged : s;
      });
      changed = true;
    }
  });
  if (changed) saveUsuarios(staff);
  return changed;
};
function crozzoTenantHubBroadcast() {
  try {
    if (__crozzoTenantBC) __crozzoTenantBC.postMessage({ t: 'pull', at: Date.now() });
  } catch (_) {}
  try {
    if (__crozzoTenantHub && typeof __crozzoTenantHub.send === 'function') {
      __crozzoTenantHub.send({ type: 'broadcast', event: 'refresh', payload: { at: Date.now() } }).catch(function () {});
    }
  } catch (_) {}
}
function crozzoTenantDebouncedPull() {
  if (__crozzoTenantDebounceT) clearTimeout(__crozzoTenantDebounceT);
  __crozzoTenantDebounceT = setTimeout(function () {
    __crozzoTenantDebounceT = null;
    if (Date.now() < __crozzoTenantPushEchoUntil) return;
    if (typeof crozzoPullRemoteTenantState === 'function') {
      crozzoPullRemoteTenantState({ skipRender: true, quiet: true }).catch(function () {});
    }
  }, 750);
}
function startCrozzoRemoteTenantSync() {
  if (__crozzoTenantSyncStarted) return;
  if (typeof crozzoOnlineConfigReady !== 'function' || !crozzoOnlineConfigReady() || !window.__SUPABASE) return;
  __crozzoTenantSyncStarted = true;
  if (__crozzoTenantBC) {
    try {
      __crozzoTenantBC.onmessage = function () {
        crozzoTenantDebouncedPull();
      };
    } catch (_) {}
  }
  try {
    __crozzoTenantHub = window.__SUPABASE.channel('crozzo_tenant_events');
    __crozzoTenantHub.on('broadcast', { event: 'refresh' }, function () {
      crozzoTenantDebouncedPull();
    });
    __crozzoTenantHub.subscribe(function (status) {
      if (status === 'CHANNEL_ERROR') {
        if (typeof crozzoOnlineConfigReady !== 'function' || !crozzoOnlineConfigReady()) {
          crozzoStopRemoteTenantSync();
          return;
        }
        console.warn('[crozzo-tenant] broadcast channel');
      }
    });
  } catch (e) {
    console.warn('[crozzo-tenant] hub subscribe', e);
  }
  try {
    __crozzoTenantPgCh = window.__SUPABASE.channel('crozzo_pg_tenant_v2');
    __crozzoTenantPgCh.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'company_config' },
      function () {
        crozzoTenantDebouncedPull();
      }
    );
    __crozzoTenantPgCh.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'profiles' },
      function () {
        crozzoTenantDebouncedPull();
      }
    );
    __crozzoTenantPgCh.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'products' },
      function () {
        crozzoTenantDebouncedProductsSync();
      }
    );
    __crozzoTenantPgCh.subscribe(function (st) {
      if (st === 'SUBSCRIBED') {
        __crozzoTenantRealtimeLive = true;
        __crozzoTenantReconnectTry = 0;
        if (__crozzoTenantReconnectT) {
          clearTimeout(__crozzoTenantReconnectT);
          __crozzoTenantReconnectT = null;
        }
      } else if (st === 'CHANNEL_ERROR' || st === 'CLOSED' || st === 'TIMED_OUT') {
        __crozzoTenantRealtimeLive = false;
        crozzoScheduleTenantRealtimeReconnect(st);
      }
    });
  } catch (e2) {
    __crozzoTenantRealtimeLive = false;
    crozzoScheduleTenantRealtimeReconnect('subscribe_throw');
  }
  if (!__crozzoTenantWatchdogT) {
    __crozzoTenantWatchdogT = setInterval(function () {
      if (typeof crozzoOnlineConfigReady !== 'function' || !crozzoOnlineConfigReady() || !window.__SUPABASE) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      if (!crozzoTenantRealtimeIsLive()) crozzoScheduleTenantRealtimeReconnect('watchdog');
    }, 45000);
  }
}
async function crozzoRefreshSessionProfileFromCloud() {
  try {
    const live =
      typeof getCurrentUser === 'function' && getCurrentUser()
        ? getCurrentUser()
        : null;
    if (!live) return;
    const sb = window.__SUPABASE;
    if (!sb || !sb.auth || typeof hydrateProfileFromSession !== 'function') return;
    const { data } = await sb.auth.getSession();
    if (data && data.session) await hydrateProfileFromSession(data.session);
  } catch (e) {
    console.warn('[crozzo-tenant] profile refresh', e);
  }
}
async function crozzoPullRemoteTenantState(opts) {
  if (typeof crozzoOnlineConfigReady !== 'function' || !crozzoOnlineConfigReady() || !window.__SUPABASE) return false;
  if (typeof loadTableData !== 'function') return false;
  let rows = [];
  try {
    const res = await loadTableData('company_config', { limit: 15 });
    rows = (res && res.data) || [];
    if ((!rows || !rows.length) && typeof crozzoReadPairPullCacheRows === 'function') {
      const cached = crozzoReadPairPullCacheRows('company_config');
      if (Array.isArray(cached)) rows = cached;
    }
  } catch (e) {
    console.warn('[crozzo-tenant] pull company_config', e);
    return false;
  }
  let best = null;
  let bestTs = 0;
  for (let i = 0; i < rows.length; i++) {
    const snap = crozzoParseTenantSnapshotFromRow(rows[i]);
    if (!snap) continue;
    const t = Date.parse(snap.updated_at || rows[i].updated_at || 0) || 0;
    if (t >= bestTs) {
      bestTs = t;
      best = snap;
    }
  }
  if (!best && rows.length) best = crozzoParseTenantSnapshotFromRow(rows[0]);
  let changed = false;
  if (best) {
    changed = !!crozzoApplyRemoteTenantBundle(best, { quiet: !!(opts && opts.quiet) });
  }
  await crozzoRefreshSessionProfileFromCloud();
  try {
    if (typeof window.__crozzoRefreshCloudCatalogUi === 'function') {
      await window.__crozzoRefreshCloudCatalogUi({ skipRender: true });
    }
  } catch (_) {}
  if (!(opts && opts.skipRender) && typeof currentPage !== 'undefined' && typeof renderPage === 'function') {
    try {
      if (
        typeof crozzoPatchOperationalPageFromRemote === 'function' &&
        crozzoPatchOperationalPageFromRemote(currentPage)
      ) {
        /* parche incremental */
      } else {
        renderPage(currentPage || 'cajero', { background: true });
      }
    } catch (e2) {
      console.warn('[crozzo-tenant] render', e2);
    }
  }
  crozzoTenantMarkPullDone();
  return changed || !!best;
}
async function crozzoPushTenantSnapshotToCloud() {
  if (!window.__CROZZO_ONLINE_DATA || !window.__SUPABASE) {
    crozzoTenantHubBroadcast();
    return false;
  }
  if (typeof getCrozzoBranding !== 'function' || typeof getUsuariosConfig !== 'function') return false;
  __crozzoTenantPushEchoUntil = Date.now() + 2600;
  let branding = null;
  try {
    branding = getCrozzoBranding();
  } catch (_) {
    branding = null;
  }
  const staffRaw = (getUsuariosConfig().staff || []).map(function (s) {
    return {
      id: s.id,
      nombre: s.nombre,
      rol: s.rol,
      activo: !!s.activo,
      permisos: s.permisos,
      configDispositivo: s.configDispositivo,
    };
  });
  let bizId = '';
  let bizName = '';
  try {
    const md = typeof getMultiDeviceConfig === 'function' ? getMultiDeviceConfig() : {};
    bizId = String(md.businessId || '').trim();
    bizName = String(md.businessName || '').trim();
  } catch (_) {}
  const bundle = {
    updated_at: new Date().toISOString(),
    branding: branding,
    staff_meta: staffRaw,
    negocio: { businessId: bizId, businessName: bizName },
  };
  let loc = 'default';
  try {
    loc = String((config.get('multidispositivo') || {}).locationId || 'default').trim() || 'default';
  } catch (_) {}
  if (loc.length > 120) loc = loc.slice(0, 120);
  const sb = window.__SUPABASE;
  const rowBase = { id: loc, updated_at: bundle.updated_at };
  if (bizId) rowBase.business_id = bizId;
  const attempts = [
    { ...rowBase, tenant_snapshot: bundle },
    { ...rowBase, config_json: { tenant_snapshot: bundle, updated_at: bundle.updated_at } },
  ];
  for (let a = 0; a < attempts.length; a++) {
    try {
      const r = await sb.from('company_config').upsert(attempts[a], { onConflict: 'id' });
      if (!r.error) {
        if (bizId && bizName) {
          crozzoUpsertBusinessRegistryToCloud(bizId, bizName).catch(function () {});
        }
        crozzoTenantHubBroadcast();
        return true;
      }
    } catch (e) {
      /* siguiente variante */
    }
  }
  try {
    const r2 = await sb.from('company_config').insert(attempts[0]);
    if (!r2.error) {
      if (bizId && bizName) {
        crozzoUpsertBusinessRegistryToCloud(bizId, bizName).catch(function () {});
      }
      crozzoTenantHubBroadcast();
      return true;
    }
  } catch (_) {}
  crozzoTenantHubBroadcast();
  return false;
}
function crozzoNormalizeBusinessLookupKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]/g, '');
}
function crozzoEscapeIlikeFragment(text) {
  return String(text || '').replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
function crozzoExtractBusinessNameFromTenantSnapshot(snap) {
  if (!snap || typeof snap !== 'object') return '';
  try {
    if (snap.negocio && typeof snap.negocio === 'object') {
      const n = String(snap.negocio.businessName || snap.negocio.name || '').trim();
      if (n) return n;
    }
  } catch (_) {}
  try {
    if (snap.branding && typeof snap.branding === 'object') {
      const b = String(snap.branding.empresa || snap.branding.nombre || snap.branding.name || '').trim();
      if (b) return b;
    }
  } catch (_) {}
  return '';
}
function crozzoPickBestBusinessLookupHit(hits, key, rawName) {
  if (!hits || !hits.length) return null;
  const rawLower = String(rawName || '').trim().toLowerCase();
  let exact = hits.find(function (h) {
    return crozzoNormalizeBusinessLookupKey(h.businessName) === key;
  });
  if (exact) return exact;
  exact = hits.find(function (h) {
    return String(h.businessName || '').trim().toLowerCase() === rawLower;
  });
  if (exact) return exact;
  exact = hits.find(function (h) {
    return String(h.businessId || '').trim().toLowerCase() === rawLower;
  });
  if (exact) return exact;
  return hits[0];
}
function crozzoBusinessLookupFromRegistry(sb, raw, key) {
  const hits = [];
  const needle = crozzoEscapeIlikeFragment(raw);
  return sb
    .from('crozzo_business_registry')
    .select('business_id,business_name')
    .ilike('business_name', '%' + needle + '%')
    .limit(8)
    .then(function (r) {
      if (r.error) return hits;
      (r.data || []).forEach(function (row) {
        const bid = String(row.business_id || '').trim();
        const bn = String(row.business_name || '').trim();
        if (!bid) return;
        hits.push({ businessId: bid, businessName: bn || raw, source: 'registry' });
      });
      return hits;
    })
    .catch(function () {
      return hits;
    });
}
function crozzoBusinessLookupFromCompanyConfig(sb, raw, key) {
  const hits = [];
  return sb
    .from('company_config')
    .select('business_id,tenant_snapshot,config_json,data,settings')
    .limit(40)
    .then(function (r) {
      if (r.error) return hits;
      (r.data || []).forEach(function (row) {
        const bid = String(row.business_id || '').trim();
        const snap = crozzoParseTenantSnapshotFromRow(row);
        let bn = crozzoExtractBusinessNameFromTenantSnapshot(snap);
        if (!bn && snap && snap.negocio) {
          bn = String(snap.negocio.businessName || '').trim();
        }
        if (!bn && bid) return;
        const rowKey = crozzoNormalizeBusinessLookupKey(bn);
        if (!rowKey) return;
        if (
          rowKey === key ||
          (rowKey.length >= 3 && (rowKey.indexOf(key) >= 0 || key.indexOf(rowKey) >= 0))
        ) {
          hits.push({
            businessId: bid || 'default',
            businessName: bn,
            source: 'company_config',
          });
        }
      });
      return hits;
    })
    .catch(function () {
      return hits;
    });
}
async function crozzoLookupBusinessInCloud(name) {
  const raw = String(name || '').trim();
  if (raw.length < 2) return null;
  const key = crozzoNormalizeBusinessLookupKey(raw);
  if (!key) return null;
  if (__crozzoBizLookupCache[key]) return __crozzoBizLookupCache[key];
  if (!window.__CROZZO_ONLINE_DATA || !window.__SUPABASE) return null;
  const sb = window.__SUPABASE;
  const hits = [];
  try {
    const regHits = await crozzoBusinessLookupFromRegistry(sb, raw, key);
    regHits.forEach(function (h) {
      hits.push(h);
    });
  } catch (_) {}
  try {
    const ccHits = await crozzoBusinessLookupFromCompanyConfig(sb, raw, key);
    ccHits.forEach(function (h) {
      hits.push(h);
    });
  } catch (_) {}
  const best = crozzoPickBestBusinessLookupHit(hits, key, raw);
  if (best) __crozzoBizLookupCache[key] = best;
  return best;
}
async function crozzoUpsertBusinessRegistryToCloud(businessId, businessName) {
  const bid = String(businessId || '').trim();
  const bn = String(businessName || '').trim();
  if (!bid || !bn || !window.__CROZZO_ONLINE_DATA || !window.__SUPABASE) return false;
  const sb = window.__SUPABASE;
  const row = {
    business_id: bid,
    business_name: bn,
    updated_at: new Date().toISOString(),
  };
  try {
    const r = await sb.from('crozzo_business_registry').upsert(row, { onConflict: 'business_id' });
    if (!r.error) {
      __crozzoBizLookupCache = {};
      return true;
    }
  } catch (_) {}
  return false;
}
window.crozzoLookupBusinessInCloud = crozzoLookupBusinessInCloud;
window.crozzoUpsertBusinessRegistryToCloud = crozzoUpsertBusinessRegistryToCloud;
function crozzoScheduleTenantSnapshotPush() {
  if (!window.__CROZZO_ONLINE_DATA || !window.__SUPABASE) {
    crozzoTenantHubBroadcast();
    return;
  }
  if (__crozzoTenantPushTimer) clearTimeout(__crozzoTenantPushTimer);
  __crozzoTenantPushTimer = setTimeout(function () {
    __crozzoTenantPushTimer = null;
    crozzoPushTenantSnapshotToCloud().catch(function () {});
    crozzoPushPosStaffToCloud().catch(function () {});
  }, 1600);
}
window.crozzoPullRemoteTenantState = crozzoPullRemoteTenantState;
window.crozzoPushTenantSnapshotToCloud = crozzoPushTenantSnapshotToCloud;
window.startCrozzoRemoteTenantSync = startCrozzoRemoteTenantSync;
function crozzoSetStatusPill(el, dotClass, text, title, extraClass) {
  if (!el) return;
  el.className = extraClass || 'crozzo-status-pill';
  el.title = title || '';
  var dot = el.querySelector('.crozzo-status-dot');
  var txt = el.querySelector('.crozzo-status-txt');
  if (dot && txt) {
    dot.className = 'crozzo-status-dot ' + (dotClass || '');
    txt.textContent = text;
  } else {
    el.innerHTML =
      '<span class="crozzo-status-dot ' +
      (dotClass || '') +
      '" aria-hidden="true"></span><span class="crozzo-status-txt">' +
      (text || '') +
      '</span>';
  }
}
function crozzoRefreshLucideIcons(scopeEl) {
  try {
    if (typeof lucide === 'undefined' || !lucide.createIcons) return;
    var nodes = [];
    if (scopeEl && scopeEl.nodeType === 1) nodes.push(scopeEl);
    else {
      var mc = document.getElementById('mainContent');
      var sb = document.querySelector('.sidebar');
      var mbn = document.getElementById('crozzoMobileBottomNav');
      if (mc) nodes.push(mc);
      if (sb) nodes.push(sb);
      if (mbn) nodes.push(mbn);
    }
    if (!nodes.length) return;
    lucide.createIcons({ nodes: nodes, attrs: { 'stroke-width': 1.5 } });
  } catch (_) {}
}
function crozzoInitNavSearch() {
  try {
    if (window.CrozzoSidebarNav) {
      if (typeof CrozzoSidebarNav.bindNavSearch === 'function') CrozzoSidebarNav.bindNavSearch();
      else if (typeof CrozzoSidebarNav.init === 'function') CrozzoSidebarNav.init();
      var inp = document.getElementById('crozzoNavSearch');
      if (inp && inp.value && typeof CrozzoSidebarNav.runNavSearch === 'function') {
        CrozzoSidebarNav.runNavSearch();
      }
      return;
    }
  } catch (_) {}
}
function crozzoInitClarityUX() {
  crozzoInitNavSearch();
  crozzoRefreshLucideIcons();
  try {
    if (window.CrozzoSidebarNav && typeof CrozzoSidebarNav.isReady === 'function' && !CrozzoSidebarNav.isReady() && typeof CrozzoSidebarNav.init === 'function') {
      CrozzoSidebarNav.init();
    }
  } catch (_) {}
  try {
    if (window.CrozzoA11yUser && typeof CrozzoA11yUser.init === 'function') CrozzoA11yUser.init();
  } catch (_) {}
  try {
    if (window.CrozzoViewportFit && typeof CrozzoViewportFit.schedule === 'function') {
      CrozzoViewportFit.schedule();
      setTimeout(function () {
        CrozzoViewportFit.schedule();
      }, 400);
    }
  } catch (_) {}
}
function updateCrozzoStorageModeBadge() {
  const el = document.getElementById('crozzoStorageModeBadge');
  if (!el) return;
  let sb = null;
  let lan = null;
  try {
    const rs = localStorage.getItem('crozzo_supabase_config');
    if (rs) sb = JSON.parse(rs);
  } catch (e) {
    sb = null;
  }
  try {
    const rl = localStorage.getItem('crozzo_lan_config');
    if (rl) lan = JSON.parse(rl);
  } catch (e) {
    lan = null;
  }
  const cloudOn = !!(sb && sb.syncEnabled);
  const lanOn = !!(lan && lan.lanSyncEnabled);
  const online = !!(crozzoOnlineConfigReady() && window.__SUPABASE);
  window.__CROZZO_ONLINE_DATA = online;
  let net = true;
  try {
    net =
      typeof window.crozzoWanLikely === 'function'
        ? window.crozzoWanLikely()
        : typeof window.crozzoWanOnline === 'function'
          ? window.crozzoWanOnline()
          : typeof navigator === 'undefined' || navigator.onLine !== false;
  } catch (_) {
    net = true;
  }
  let text = 'Local';
  let dot = 'warn';
  let title = 'Solo local: IndexedDB y localStorage en este equipo';
  if (online && net) {
    if (cloudOn && lanOn) {
      text = 'Híbrido';
      dot = 'ok';
      title = 'Cloud (Supabase) y LAN activos; red disponible.';
    } else if (cloudOn) {
      text = 'Cloud';
      dot = 'ok';
      title = 'Sincronización vía internet con Supabase.';
    } else if (lanOn) {
      text = 'LAN';
      dot = 'ok';
      title = 'Sincronización en red local; red disponible.';
    } else {
      text = 'Online';
      dot = 'ok';
      title = 'Red disponible.';
    }
  } else if (online && !net) {
    text = 'Sin red';
    dot = 'err';
    title = 'Sesión Supabase activa pero sin conectividad; usará cola local hasta reconectar.';
  } else if (cloudOn && lanOn) {
    text = 'Híbrido';
    dot = 'warn';
    title = 'Cloud (Supabase) y LAN activos. El enrutador prioriza Cloud y usa LAN como respaldo.';
  } else if (cloudOn) {
    text = 'Cloud';
    dot = 'warn';
    title = online
      ? 'Sincronización vía internet con Supabase.'
      : 'Cloud configurado; la sesión con Supabase se restablece al conectar.';
  } else if (lanOn) {
    text = 'LAN';
    dot = 'warn';
    title = 'Sincronización en red local, sin depender de internet.';
  }
  crozzoSetStatusPill(el, dot, text, title, 'crozzo-status-pill');
}
function crozzoMdCloudFormHasDraft() {
  try {
    const ae = document.activeElement;
    if (ae && ae.closest && ae.closest('#crozzo-nube-hub, #mdTabPanelCloud')) {
      const tag = String(ae.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    }
  } catch (_) {}
  const ids = ['mdSupabaseUrl', 'mdSupabaseKey', 'mdCloudDeviceName', 'mdCloudDeviceIdInput', 'mdBusinessName', 'mdBusinessId'];
  for (let i = 0; i < ids.length; i++) {
    const el = document.getElementById(ids[i]);
    if (el && el.dataset && el.dataset.crozzoDirty === '1') return true;
  }
  return false;
}
window.crozzoMdCloudFormHasDraft = crozzoMdCloudFormHasDraft;
function hydrateMdSupabaseInputsFromLs(opts) {
  opts = opts || {};
  const force = !!opts.force;
  const urlEl = document.getElementById('mdSupabaseUrl');
  const keyEl = document.getElementById('mdSupabaseKey');
  const syncEl = document.getElementById('mdSupabaseSyncEnabled');
  const nameEl = document.getElementById('mdCloudDeviceName');
  const idEl = document.getElementById('mdCloudDeviceIdInput');
  if (!urlEl || !keyEl) return;
  if (!force && crozzoMdCloudFormHasDraft()) return;
  const j = readCrozzoSupabaseJson();
  if (j) {
    if (j.url && urlEl.dataset.crozzoDirty !== '1' && !String(urlEl.value || '').trim()) {
      urlEl.value = j.url;
    }
    const ak = crozzoSupabaseEffectiveAnonKey(j) || j.anonKey || '';
    if (keyEl.dataset.crozzoDirty !== '1' && !String(keyEl.value || '').trim()) {
      if (typeof window.crozzoBindAnonKeyMaskedInput === 'function') {
        window.crozzoBindAnonKeyMaskedInput(keyEl, ak);
      } else if (ak) {
        keyEl.value = ak;
      }
    }
    if (syncEl && document.activeElement !== syncEl) syncEl.checked = !!j.syncEnabled;
    if (nameEl && j.deviceName && nameEl.dataset.crozzoDirty !== '1' && !String(nameEl.value || '').trim()) {
      nameEl.value = j.deviceName;
    }
    if (idEl && j.deviceId && !idEl.value) idEl.value = j.deviceId;
  } else {
    const u = (lsGet(LS.URL_PRIMARY) || lsGet(LS.URL_LEGACY) || '').trim();
    const k = (lsGet(LS.KEY_PRIMARY) || lsGet(LS.KEY_LEGACY) || '').trim();
    if (u && urlEl.dataset.crozzoDirty !== '1' && !String(urlEl.value || '').trim()) urlEl.value = u;
    if (keyEl.dataset.crozzoDirty !== '1' && !String(keyEl.value || '').trim()) {
      if (typeof window.crozzoBindAnonKeyMaskedInput === 'function') {
        window.crozzoBindAnonKeyMaskedInput(keyEl, k);
      } else if (k) {
        keyEl.value = k;
      }
    }
    if (syncEl && document.activeElement !== syncEl) syncEl.checked = false;
  }
  if (idEl && !idEl.value) {
    let did = '';
    try {
      did = (localStorage.getItem('device_id') || '').trim();
    } catch (e) {
      did = '';
    }
    if (did) idEl.value = did;
  }
  try {
    if (typeof getMultiDeviceConfig === 'function') {
      const md = getMultiDeviceConfig();
      const bnameEl = document.getElementById('mdBusinessName');
      const bidEl = document.getElementById('mdBusinessId');
      if (bnameEl && md.businessName && bnameEl.dataset.crozzoDirty !== '1' && !String(bnameEl.value || '').trim()) {
        bnameEl.value = md.businessName;
      }
      if (bidEl && md.businessId && bidEl.dataset.crozzoDirty !== '1' && !String(bidEl.value || '').trim()) {
        bidEl.value = md.businessId;
      }
    }
    if (typeof window.crozzoRefreshBusinessConnectedUi === 'function') window.crozzoRefreshBusinessConnectedUi();
  } catch (_) {}
}
/** IndexedDB: almacenes espejo de entidades (offline-first). */
const CROZZO_LOCAL_MAP = {
  products: 'local_products',
  sales: 'local_sales',
  clients: 'local_clients',
  inventory: 'local_inventory',
  audit_logs: 'local_audit',
  categories: 'local_categories',
  taxes: 'local_taxes',
  comandas: 'local_comandas',
};
class LocalDB {
  constructor() {
    this.db = null;
    this._opening = null;
  }
  open() {
    if (this.db) return Promise.resolve(this.db);
    if (this._opening) return this._opening;
    this._opening = new Promise((resolve, reject) => {
      const req = indexedDB.open('CrozzoLocalData', 3);
      req.onupgradeneeded = (event) => {
        const db = req.result;
        const oldV = event.oldVersion || 0;
        Object.values(CROZZO_LOCAL_MAP).forEach((store) => {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, { keyPath: 'id' });
          }
        });
        if (oldV < 3) {
          const tx = event.target.transaction;
          try {
            const p = tx.objectStore('local_products');
            if (!p.indexNames.contains('bynombre')) p.createIndex('bynombre', 'nombre', { unique: false });
          } catch (_) {}
          try {
            const c = tx.objectStore('local_clients');
            if (!c.indexNames.contains('bynombre')) c.createIndex('bynombre', 'nombre', { unique: false });
          } catch (_) {}
        }
      };
      req.onsuccess = () => {
        this.db = req.result;
        this._opening = null;
        resolve(this.db);
      };
      req.onerror = () => {
        this._opening = null;
        reject(req.error);
      };
    });
    return this._opening;
  }
  _store(logical) {
    const n = CROZZO_LOCAL_MAP[logical];
    if (!n) throw new Error('tabla_local_desconocida:' + logical);
    return n;
  }
  async get(table, id = null) {
    await this.open();
    const storeName = this._store(table);
    const tx = this.db.transaction(storeName, 'readonly');
    const st = tx.objectStore(storeName);
    if (id != null && id !== '') {
      return new Promise((res, rej) => {
        const r = st.get(id);
        r.onsuccess = () => res(r.result ?? null);
        r.onerror = () => rej(r.error);
      });
    }
    return new Promise((res, rej) => {
      const r = st.getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    });
  }
  async insert(table, data) {
    await this.open();
    const row = { ...data };
    if (row.id == null || row.id === '') row.id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'L' + Date.now();
    const storeName = this._store(table);
    const tx = this.db.transaction(storeName, 'readwrite');
    return new Promise((res, rej) => {
      const r = tx.objectStore(storeName).put(row);
      r.onsuccess = () => res(row);
      r.onerror = () => rej(r.error);
    });
  }
  async update(table, id, patch) {
    const cur = await this.get(table, id);
    if (!cur) return null;
    const next = { ...cur, ...patch, id: cur.id };
    await this.open();
    const storeName = this._store(table);
    const tx = this.db.transaction(storeName, 'readwrite');
    return new Promise((res, rej) => {
      const r = tx.objectStore(storeName).put(next);
      r.onsuccess = () => res(next);
      r.onerror = () => rej(r.error);
    });
  }
  async delete(table, id) {
    await this.open();
    const storeName = this._store(table);
    const tx = this.db.transaction(storeName, 'readwrite');
    return new Promise((res, rej) => {
      const r = tx.objectStore(storeName).delete(id);
      r.onsuccess = () => res(true);
      r.onerror = () => rej(r.error);
    });
  }
}
const crozzoLocalDb = new LocalDB();
async function crozzoDbGet(table, idOrFilters) {
  if (window.__CROZZO_ONLINE_DATA && window.__SUPABASE) {
    const filters = typeof idOrFilters === 'object' && idOrFilters && !Array.isArray(idOrFilters) ? idOrFilters : {};
    if (idOrFilters != null && (typeof idOrFilters === 'string' || typeof idOrFilters === 'number')) {
      filters.where = { ...(filters.where || {}), id: idOrFilters };
    }
    return loadTableData(table, filters);
  }
  const id = typeof idOrFilters === 'string' || typeof idOrFilters === 'number' ? idOrFilters : null;
  const data = await crozzoLocalDb.get(table, id);
  return { data, error: null };
}
async function crozzoDbInsert(table, row) {
  if (window.__CROZZO_ONLINE_DATA && window.__SUPABASE) return crozzoTableInsert(table, row);
  const data = await crozzoLocalDb.insert(table, row);
  return { data: [data], error: null };
}
async function crozzoDbUpdate(table, id, patch) {
  if (window.__CROZZO_ONLINE_DATA && window.__SUPABASE) return crozzoTableUpdate(table, { id }, patch);
  const data = await crozzoLocalDb.update(table, id, patch);
  return { data: data ? [data] : [], error: null };
}
async function crozzoDbDelete(table, id) {
  if (window.__CROZZO_ONLINE_DATA && window.__SUPABASE) {
    const sb = window.__SUPABASE;
    return await sb.from(table).delete().eq('id', id);
  }
  await crozzoLocalDb.delete(table, id);
  return { data: null, error: null };
}
initConfigPersistence();
try {
  crozzoScrubStaleHoneypotChaff();
} catch (_) {}
try {
  document.getElementById('crozzoSupabaseRequiredOverlay')?.remove();
} catch {
  /* ignore */
}
void (async function __crozzoSupabaseBootstrap() {
  try {
    crozzoEnsureSupabaseConfigFileFromAnySource();
    if (crozzoOnlineConfigReady()) {
      try {
        await initSupabaseClient();
        const sb = window.__SUPABASE;
        if (sb) {
          if (crozzoPurgeExpiredSupabaseAuthStorage()) {
            try {
              if (typeof showToast === 'function') {
                showToast('Sesión de nube expirada — limpiada. Sync con clave anónima.', 'info');
              }
            } catch (_) {}
          }
          if (typeof window.__crozzoPostInitCloud === 'function') {
            window.__crozzoPostInitCloud().catch(function (e3) {
              console.warn('[crozzo-sb] postInit tras bootstrap', e3);
            });
          }
        }
      } catch (e) {
        console.warn('[crozzo-sb] arranque cliente/sesión', e);
      }
    } else {
      window.__SUPABASE = null;
    }
  } catch (e2) {
    console.warn('[crozzo-sb] bootstrap', e2);
    try {
      window.__SUPABASE = null;
    } catch (_) {}
  }
  try {
    updateCrozzoStorageModeBadge();
  } catch (_) {}
})();
window.addEventListener('online', () => {
  syncOfflineQueue({ force: true, kind: 'online', priority: 1 }).catch((e) => console.warn('[crozzo-sb] syncOfflineQueue', e));
  try {
    if (typeof crozzoInvalidateCloudPingCache === 'function') crozzoInvalidateCloudPingCache();
  } catch (_) {}
  try {
    if (
      typeof crozzoCloudFirstSyncEnabled === 'function' &&
      crozzoCloudFirstSyncEnabled() &&
      typeof crozzoEnsureCloudSyncActive === 'function' &&
      crozzoOnlineConfigReady()
    ) {
      crozzoEnsureCloudSyncActive({ source: 'online', resetTableMissing: false }).catch(function () {});
    }
  } catch (_) {}
  try {
    if (typeof window.__crozzoRefreshCloudCatalogUi === 'function') {
      window.__crozzoRefreshCloudCatalogUi().catch((e) => console.warn('[crozzo-sb] refresh on online', e));
    }
  } catch (_) {}
  try {
    if (
      typeof crozzoOnlineConfigReady === 'function' &&
      crozzoOnlineConfigReady() &&
      typeof crozzoTenantRealtimeIsLive === 'function' &&
      !crozzoTenantRealtimeIsLive()
    ) {
      __crozzoTenantReconnectTry = 0;
      crozzoScheduleTenantRealtimeReconnect('online');
    }
  } catch (_) {}
  try {
    if (typeof updateCrozzoStorageModeBadge === 'function') updateCrozzoStorageModeBadge();
  } catch (_) {}
});
window.addEventListener('offline', () => {
  try {
    if (typeof updateCrozzoStorageModeBadge === 'function') updateCrozzoStorageModeBadge();
  } catch (_) {}
});
/** INSERT genérico (respeta RLS). */
async function crozzoTableInsert(tableName, row) {
  const sb = window.__SUPABASE;
  if (!sb) return { data: null, error: new Error('supabase_no_inicializado') };
  if (!__CROZZO_SB_TABLES.includes(tableName)) return { data: null, error: new Error('tabla_no_catalogada') };
  return await sb.from(tableName).insert(row).select();
}
/** UPDATE por igualdad en match (ej. { id: saleId }). */
async function crozzoTableUpdate(tableName, match, patch) {
  const sb = window.__SUPABASE;
  if (!sb) return { data: null, error: new Error('supabase_no_inicializado') };
  if (!__CROZZO_SB_TABLES.includes(tableName)) return { data: null, error: new Error('tabla_no_catalogada') };
  let q = sb.from(tableName).update(patch);
  for (const [col, val] of Object.entries(match || {})) q = q.eq(col, val);
  return await q.select();
}
window.initConfigPersistence = initConfigPersistence;
window.initSupabaseClient = initSupabaseClient;
window.loadTableData = loadTableData;
window.syncOfflineQueue = syncOfflineQueue;
window.applyRolePermissions = applyRolePermissions;
window.__crozzoEnqueueOffline = enqueueOfflineOperation;
window.crozzoTableInsert = crozzoTableInsert;
window.crozzoTableUpdate = crozzoTableUpdate;
window.crozzoLocalDB = crozzoLocalDb;
window.crozzoDbGet = crozzoDbGet;
window.crozzoDbInsert = crozzoDbInsert;
window.crozzoDbUpdate = crozzoDbUpdate;
window.crozzoDbDelete = crozzoDbDelete;
window.updateCrozzoStorageModeBadge = updateCrozzoStorageModeBadge;
window.crozzoOnlineConfigReady = crozzoOnlineConfigReady;
window.crozzoDb = {
  get: crozzoDbGet,
  insert: crozzoDbInsert,
  update: crozzoDbUpdate,
  delete: crozzoDbDelete,
  isLocal: () => !!(typeof window.__crozzoIsLocalDataMode === 'function' && window.__crozzoIsLocalDataMode()),
};
const __crozzoMainEl = document.getElementById('mainContent');
if (__crozzoMainEl) {
  let __crozzoMdHydrateT = null;
  const __crozzoTryHydrateMdOnce = () => {
    const urlEl = document.getElementById('mdSupabaseUrl');
    const keyEl = document.getElementById('mdSupabaseKey');
    if (!urlEl || !keyEl) return;
    if (urlEl._crozzoLsHydrated && keyEl._crozzoLsHydrated) return;
    if (crozzoMdCloudFormHasDraft()) return;
    urlEl._crozzoLsHydrated = true;
    keyEl._crozzoLsHydrated = true;
    try {
      hydrateMdSupabaseInputsFromLs({ force: true });
    } catch (_) {}
  };
  const mo = new MutationObserver(() => {
    if (__crozzoMdHydrateT) return;
    __crozzoMdHydrateT = setTimeout(() => {
      __crozzoMdHydrateT = null;
      __crozzoTryHydrateMdOnce();
    }, 250);
  });
  mo.observe(__crozzoMainEl, { childList: true, subtree: true });
}
document.addEventListener('DOMContentLoaded', () => {
  try {
    hydrateMdSupabaseInputsFromLs({ force: true });
  } catch (_) {}
  updateCrozzoStorageModeBadge();
});