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
 * - Estado operativo en vivo (carritos, comandas abiertas, historial reciente, slots cobrados) se respalda en `crozzo_pos_runtime_v1` para sobrevivir cierre de pestaña y modo offline/híbrido.
 * - Supabase es la fuente de verdad para entidades explícitas (p. ej. `products` cuando la nube está activa); ventas/facturas/comandas completas como tablas dedicadas aún no se duplican fila a fila en esta build — la cola `sync_queue` / LAN cubre otros eventos según tu esquema.
 * - Tras login local/Supabase y al volver a la pestaña (visible) se vuelve a descargar `products` y se repinta la página actual si la nube está activa (`__crozzoRefreshCloudCatalogUi`).
 *
 * Estrategia offline (resumen): cola `sync_queue` + reintentos; marcas de tiempo en facturas; resolución de conflicto «dos servidor A» vía UI;
 * validación de columnas PostgREST antes de mirror (mensajes guiados); modo híbrido/offline en runtime. Contingencia DIAN formal = roadmap (ver `crozzo-roadmap-recomendaciones.csv`).
 */
window.CROZZO_QUIET = true;
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
function crozzoSupabaseRestHeaders(anonKey) {
  const k = String(anonKey || '').trim();
  return {
    'apikey': k,
    'Authorization': 'Bearer ' + k,
    'Content-Type': 'application/json',
  };
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
/** Modo nube solo si el archivo existe, sync activada y credenciales válidas. */
function crozzoOnlineConfigReady() {
  const j = readCrozzoSupabaseJson();
  if (!j || !j.syncEnabled) return false;
  const k = crozzoSupabaseEffectiveAnonKey(j);
  return isValidSupabasePair(j.url, k);
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
  'audit_logs',
  'company_config',
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
function lsSet(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch (e) {
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
  const j = readCrozzoSupabaseJson();
  if (j && j.syncEnabled) return String(j.url || '').trim();
  return '';
}
function readResolvedKey() {
  let j;
  try {
    j = JSON.parse(localStorage.getItem(CROZZO_SB_FILE) || '{}');
  } catch (e) {
    try {
      console.warn(e && e.message ? e.message : e);
    } catch (_) {}
    return '';
  }
  if (!j || !j.syncEnabled) return '';
  return crozzoSupabaseEffectiveAnonKey(j);
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
function isValidSupabasePair(url, key) {
  const u = String(url || '').trim().toLowerCase();
  const k = String(key || '').trim();
  return u.includes('supabase.co') && k.length >= 20;
}
window.isValidSupabasePair = isValidSupabasePair;
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
    const sb = saved?.supabase || {};
    const u = String(sb.url || '').trim();
    const k = crozzoSupabaseEffectiveAnonKey(sb) || String(sb.anonKey || '').trim();
    mirrorCredentialsToBothKeys(u || undefined, k || undefined);
    if (saved?.deviceId) lsSet(LS.DEVICE_ID, String(saved.deviceId).trim());
  } catch (e) {
    console.warn('[crozzo-sb] sync standalone', e);
  }
};
/** Cliente Supabase (solo si credenciales válidas). Nunca createClient con strings vacíos. */
async function initSupabaseClient() {
  window.__SUPABASE = null;
  const urlRaw = readResolvedUrl();
  const keyRaw = readResolvedKey();
  const url = String(urlRaw == null ? '' : urlRaw).trim();
  const key = String(keyRaw == null ? '' : keyRaw).trim();
  if (!url || !key || !isValidSupabasePair(url, key)) return null;
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
      if (/401|404|jwt|permission denied|rls|forbidden|invalid|42703|does not exist|column .* does not exist/i.test(msg)) {
        console.warn('[crozzo-sb] loadTableData soft-fail', tableName, res.error);
        return { data: cached, error: null };
      }
      console.warn('[crozzo-sb] loadTableData', tableName, res.error);
      return { data: cached != null ? cached : res.data, error: null };
    }
    return res;
  } catch (e) {
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
function crozzoQueueFacturaForCloudSync(f) {
  if (!f) return;
  try {
    const tid = crozzoSaleSyncTransactionId(f);
    const estadoSupa = crozzoMapLocalFacturaEstadoForSupabase(f.estado, !!f.is_demo);
    const facturaPayload = { ...f, estado: estadoSupa };
    enqueueOfflineOperation({
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
  } catch (e) {
    console.warn('[crozzo-sb] cola ventas', e);
  }
  if (typeof navigator !== 'undefined' && navigator.onLine && typeof syncOfflineQueue === 'function') {
    void Promise.resolve().then(() => syncOfflineQueue());
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
async function syncOfflineQueue() {
  const sb = window.__SUPABASE;
  if (!sb || typeof navigator !== 'undefined' && !navigator.onLine) return { ok: false, reason: 'offline_o_sin_cliente' };
  let pending = readOfflineQueue();
  if (window.CrozzoIdempotentSync && typeof CrozzoIdempotentSync.deduplicateQueue === 'function') {
    const ded = CrozzoIdempotentSync.deduplicateQueue(pending);
    if (ded.length !== pending.length) writeOfflineQueue(ded);
    pending = ded;
  }
  if (!pending.length) return { ok: true, pushed: 0 };
  const remain = [];
  let pushed = 0;
  for (const row of pending) {
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
      console.warn('[crozzo-sb] sync_queue item falló, se conserva en cola local', e);
      remain.push(row);
    }
  }
  writeOfflineQueue(remain);
  return { ok: true, pushed, remaining: remain.length };
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
      'config_conexiones',
      'config_facturas_admin',
      'config_usuarios',
      'auditoria',
      'facturas_limpiar',
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
    base.permisos.admin = ['config_empresa', 'config_impuestos', 'config_usuarios', 'facturas_limpiar'];
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
  try {
    const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    if (error) throw error;
    const profile = data || { id: session.user.id, email: session.user.email, role: 'cajero' };
    const synthetic = buildSyntheticUserFromProfile(profile);
    const pack = { profile, synthetic, email: session.user.email };
    sessionStorage.setItem('crozzo_cloud_profile', JSON.stringify(pack));
    sessionStorage.setItem('crozzo_session_user', profile.id);
    currentSessionUserId = profile.id;
    if (typeof crozzoSyncUserRoleStorage === 'function') crozzoSyncUserRoleStorage();
    return pack;
  } catch (e) {
    console.warn('[crozzo-sb] profiles', e);
    return null;
  }
}
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
    if (error) return { handled: true, ok: false, error: error.message || 'auth_error' };
    await hydrateProfileFromSession(data.session);
    return { handled: true, ok: true };
  } catch (e) {
    return { handled: true, ok: false, error: String(e?.message || e) };
  }
};
window.__crozzoSupabaseSignOut = async function crozzoSupabaseSignOut() {
  try {
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
    opcionGrupos: Array.isArray(row.opcion_grupos) ? row.opcion_grupos : row.opcionGrupos,
    arrastraProductos: Array.isArray(row.arrastra_productos) ? row.arrastra_productos : row.arrastraProductos,
  };
}
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
window.__crozzoPostInitCloud = async function postInitCloud() {
  if (!crozzoOnlineConfigReady() || !window.__SUPABASE) return;
  try {
    await window.__crozzoRegisterDeviceHeartbeat?.();
    await window.__crozzoBootstrapCloudData?.();
  } catch (e) {
    console.warn('[crozzo-sb] postInitCloud', e);
  }
  applyRolePermissions();
  try {
    if (typeof startCrozzoRemoteTenantSync === 'function') startCrozzoRemoteTenantSync();
    if (typeof crozzoPullRemoteTenantState === 'function') {
      await crozzoPullRemoteTenantState({ skipRender: true, quiet: true });
    }
  } catch (e2) {
    console.warn('[crozzo-sb] tenant sync init', e2);
  }
};
/** Vuelve a leer `products` desde Supabase y opcionalmente repinta la vista actual (otro dispositivo / pestaña). */
window.__crozzoRefreshCloudCatalogUi = async function crozzoRefreshCloudCatalogUi(opts) {
  if (!crozzoOnlineConfigReady() || !window.__SUPABASE) return false;
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
    if (typeof currentPage !== 'undefined' && typeof renderPage === 'function') {
      renderPage(currentPage || 'cajero');
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
var __crozzoTenantPushTimer = null;
var __crozzoTenantPushEchoUntil = 0;
var __crozzoTenantBC =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('crozzo_tenant_v1') : null;
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
      const next = prevStaff.map(function (u) {
        const r = bundle.staff_meta.find(function (x) {
          return x && x.id === u.id;
        });
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
      crozzoPullRemoteTenantState({ skipRender: false, quiet: true }).catch(function () {});
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
      if (status === 'CHANNEL_ERROR') console.warn('[crozzo-tenant] broadcast channel');
    });
  } catch (e) {
    console.warn('[crozzo-tenant] hub subscribe', e);
  }
  try {
    __crozzoTenantPgCh = window.__SUPABASE.channel('crozzo_pg_tenant');
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
    __crozzoTenantPgCh.subscribe(function (st) {
      if (st === 'CHANNEL_ERROR') {
        /* Realtime o políticas no habilitadas: se sigue usando broadcast + visibilidad */
      }
    });
  } catch (e2) {
    /* sin postgres_changes */
  }
}
async function crozzoRefreshSessionProfileFromCloud() {
  try {
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
  if (typeof crozzoRebuildMenusFromRoles === 'function') crozzoRebuildMenusFromRoles();
  try {
    if (typeof window.__crozzoRefreshCloudCatalogUi === 'function') {
      await window.__crozzoRefreshCloudCatalogUi({ skipRender: true });
    }
  } catch (_) {}
  if (!(opts && opts.skipRender) && typeof currentPage !== 'undefined' && typeof renderPage === 'function') {
    try {
      renderPage(currentPage || 'cajero');
    } catch (e2) {
      console.warn('[crozzo-tenant] render', e2);
    }
  }
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
  const bundle = {
    updated_at: new Date().toISOString(),
    branding: branding,
    staff_meta: staffRaw,
  };
  let loc = 'default';
  try {
    loc = String((config.get('multidispositivo') || {}).locationId || 'default').trim() || 'default';
  } catch (_) {}
  if (loc.length > 120) loc = loc.slice(0, 120);
  const sb = window.__SUPABASE;
  const attempts = [
    { id: loc, tenant_snapshot: bundle, updated_at: bundle.updated_at },
    { id: loc, config_json: { tenant_snapshot: bundle, updated_at: bundle.updated_at } },
  ];
  for (let a = 0; a < attempts.length; a++) {
    try {
      const r = await sb.from('company_config').upsert(attempts[a], { onConflict: 'id' });
      if (!r.error) {
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
      crozzoTenantHubBroadcast();
      return true;
    }
  } catch (_) {}
  crozzoTenantHubBroadcast();
  return false;
}
function crozzoScheduleTenantSnapshotPush() {
  if (!window.__CROZZO_ONLINE_DATA || !window.__SUPABASE) {
    crozzoTenantHubBroadcast();
    return;
  }
  if (__crozzoTenantPushTimer) clearTimeout(__crozzoTenantPushTimer);
  __crozzoTenantPushTimer = setTimeout(function () {
    __crozzoTenantPushTimer = null;
    crozzoPushTenantSnapshotToCloud().catch(function () {});
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
function crozzoRefreshLucideIcons() {
  try {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons({ attrs: { 'stroke-width': 1.5 } });
    }
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
    if (window.CrozzoSidebarNav && typeof CrozzoSidebarNav.init === 'function') CrozzoSidebarNav.init();
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
    net = typeof navigator === 'undefined' || navigator.onLine !== false;
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
function hydrateMdSupabaseInputsFromLs() {
  const urlEl = document.getElementById('mdSupabaseUrl');
  const keyEl = document.getElementById('mdSupabaseKey');
  const syncEl = document.getElementById('mdSupabaseSyncEnabled');
  const nameEl = document.getElementById('mdCloudDeviceName');
  const idEl = document.getElementById('mdCloudDeviceIdInput');
  if (!urlEl || !keyEl) return;
  const j = readCrozzoSupabaseJson();
  if (j) {
    if (j.url) urlEl.value = j.url;
    if (j.anonKey) keyEl.value = j.anonKey;
    if (syncEl) syncEl.checked = !!j.syncEnabled;
    if (nameEl && j.deviceName) nameEl.value = j.deviceName;
    if (idEl && j.deviceId && !idEl.value) idEl.value = j.deviceId;
  } else {
    const u = (lsGet(LS.URL_PRIMARY) || lsGet(LS.URL_LEGACY) || '').trim();
    const k = (lsGet(LS.KEY_PRIMARY) || lsGet(LS.KEY_LEGACY) || '').trim();
    if (u) urlEl.value = u;
    if (k) keyEl.value = k;
    if (syncEl) syncEl.checked = false;
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
  document.getElementById('crozzoSupabaseRequiredOverlay')?.remove();
} catch {
  /* ignore */
}
void (async function __crozzoSupabaseBootstrap() {
  try {
    if (crozzoOnlineConfigReady()) {
      try {
        await initSupabaseClient();
        const sb = window.__SUPABASE;
        if (sb) {
          const { data } = await sb.auth.getSession();
          if (data?.session) {
            await hydrateProfileFromSession(data.session);
            if (typeof crozzoRebuildMenusFromRoles === 'function') crozzoRebuildMenusFromRoles();
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
  syncOfflineQueue().catch((e) => console.warn('[crozzo-sb] syncOfflineQueue', e));
  try {
    if (typeof window.__crozzoRefreshCloudCatalogUi === 'function') {
      window.__crozzoRefreshCloudCatalogUi().catch((e) => console.warn('[crozzo-sb] refresh on online', e));
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
  const mo = new MutationObserver(() => {
    if (__crozzoMdHydrateT) return;
    __crozzoMdHydrateT = setTimeout(() => {
      __crozzoMdHydrateT = null;
      try {
        hydrateMdSupabaseInputsFromLs();
      } catch (_) {}
    }, 180);
  });
  mo.observe(__crozzoMainEl, { childList: true, subtree: true });
}
document.addEventListener('DOMContentLoaded', () => {
  hydrateMdSupabaseInputsFromLs();
  updateCrozzoStorageModeBadge();
});