/* Crozzo bundle: CrozzoBundleReservorio.js — generado, no editar */


/* --- CrozzoBlobStore.js --- */

/**
 * Crozzo — almacén de archivos (facturas PDF/fotos) en IndexedDB.
 * El reservorio guarda solo referencias; capacidad ~cientos de MB.
 * Preparado para cola de subida a Supabase Storage (fase nube).
 */
(function (global) {
  'use strict';

  var DB_NAME = 'crozzo_blob_store_v1';
  var DB_VER = 1;
  var STORE = 'blobs';
  var RETENTION_DAYS = 365;
  var THUMB_MAX = 320;

  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!global.indexedDB) {
        reject(new Error('IndexedDB no disponible'));
        return;
      }
      var req = global.indexedDB.open(DB_NAME, DB_VER);
      req.onerror = function () {
        reject(req.error || new Error('open failed'));
      };
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var os = db.createObjectStore(STORE, { keyPath: 'id' });
          os.createIndex('recepcionId', 'recepcionId', { unique: false });
          os.createIndex('createdAt', 'createdAt', { unique: false });
          os.createIndex('syncEstado', 'syncEstado', { unique: false });
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
    });
    return dbPromise;
  }

  function uid(prefix) {
    return (prefix || 'blob') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  }

  function dataUrlToBlob(dataUrl) {
    if (!dataUrl || dataUrl.indexOf('data:') !== 0) return null;
    var parts = dataUrl.split(',');
    if (parts.length < 2) return null;
    var meta = parts[0];
    var b64 = parts[1];
    var mime = 'application/octet-stream';
    var m = meta.match(/data:([^;]+)/);
    if (m) mime = m[1];
    try {
      var bin = atob(b64);
      var len = bin.length;
      var arr = new Uint8Array(len);
      for (var i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
      return new Blob([arr], { type: mime });
    } catch (_) {
      return null;
    }
  }

  function makeThumb(dataUrl, mime) {
    return new Promise(function (resolve) {
      if (!dataUrl || (mime && mime.indexOf('pdf') >= 0)) {
        resolve(null);
        return;
      }
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.width;
          var h = img.height;
          var scale = w > THUMB_MAX ? THUMB_MAX / w : 1;
          var cw = Math.max(1, Math.round(w * scale));
          var ch = Math.max(1, Math.round(h * scale));
          var c = document.createElement('canvas');
          c.width = cw;
          c.height = ch;
          var ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, cw, ch);
          resolve(c.toDataURL('image/jpeg', 0.72));
        } catch (_) {
          resolve(null);
        }
      };
      img.onerror = function () {
        resolve(null);
      };
      img.src = dataUrl;
    });
  }

  function txStore(mode) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var store = tx.objectStore(STORE);
        tx.oncomplete = function () {
          resolve(store);
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  function putRecord(rec) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(rec);
        tx.oncomplete = function () {
          resolve(rec);
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  function getRecord(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(id);
        req.onsuccess = function () {
          resolve(req.result || null);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  function putBlob(input) {
    input = input || {};
    var id = input.id || uid('blob');
    var dataUrl = input.dataUrl;
    var blob = input.blob || (dataUrl ? dataUrlToBlob(dataUrl) : null);
    if (!blob && !dataUrl) return Promise.reject(new Error('Sin datos de archivo'));

    return makeThumb(dataUrl, input.mime || (blob && blob.type)).then(function (thumb) {
      var rec = {
        id: id,
        recepcionId: input.recepcionId || null,
        nombre: input.nombre || 'archivo',
        mime: input.mime || (blob && blob.type) || 'application/octet-stream',
        bytes: blob ? blob.size : 0,
        blob: blob,
        thumbDataUrl: thumb,
        createdAt: input.createdAt || new Date().toISOString(),
        syncEstado: input.syncEstado || 'local',
        supabasePath: input.supabasePath || null,
      };
      if (!rec.blob && dataUrl) {
        rec.blob = dataUrlToBlob(dataUrl);
        rec.bytes = rec.blob ? rec.blob.size : 0;
      }
      return putRecord(rec);
    });
  }

  function getBlobUrl(id) {
    return getRecord(id).then(function (rec) {
      if (!rec || !rec.blob) return null;
      try {
        return URL.createObjectURL(rec.blob);
      } catch (_) {
        return null;
      }
    });
  }

  function getDataUrl(id) {
    return getRecord(id).then(function (rec) {
      if (!rec || !rec.blob) return null;
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () {
          resolve(reader.result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(rec.blob);
      });
    });
  }

  function toAdjuntoRef(rec) {
    if (!rec) return null;
    return {
      id: rec.id,
      nombre: rec.nombre,
      mime: rec.mime,
      bytes: rec.bytes,
      blobRef: rec.id,
      thumbDataUrl: rec.thumbDataUrl || null,
      syncEstado: rec.syncEstado || 'local',
    };
  }

  /**
   * Guarda documentos de una recepción en IDB y devuelve referencias ligeras (sin dataUrl).
   */
  function persistAdjuntos(recepcionId, docs) {
    docs = docs || [];
    if (!docs.length) return Promise.resolve([]);
    var chain = Promise.resolve([]);
    docs.forEach(function (d) {
      chain = chain.then(function (refs) {
        if (d.blobRef && !d.dataUrl) {
          refs.push({
            id: d.id,
            nombre: d.nombre,
            mime: d.mime,
            bytes: d.bytes,
            blobRef: d.blobRef,
            thumbDataUrl: d.thumbDataUrl,
            syncEstado: d.syncEstado || 'local',
          });
          return refs;
        }
        if (!d.dataUrl) return refs;
        return putBlob({
          id: d.id,
          recepcionId: recepcionId,
          nombre: d.nombre,
          mime: d.mime,
          dataUrl: d.dataUrl,
        }).then(function (rec) {
          refs.push(toAdjuntoRef(rec));
          return refs;
        });
      });
    });
    return chain;
  }

  function loadAdjuntosForUi(adjuntos) {
    adjuntos = adjuntos || [];
    return Promise.all(
      adjuntos.map(function (a) {
        if (a.dataUrl) {
          return Promise.resolve({
            id: a.id,
            nombre: a.nombre,
            mime: a.mime,
            dataUrl: a.dataUrl,
            blobRef: a.blobRef,
          });
        }
        if (!a.blobRef) return Promise.resolve(null);
        return getDataUrl(a.blobRef).then(function (url) {
          if (!url) {
            return {
              id: a.id,
              nombre: a.nombre,
              mime: a.mime,
              dataUrl: a.thumbDataUrl || '',
              blobRef: a.blobRef,
              _missing: true,
            };
          }
          return {
            id: a.id,
            nombre: a.nombre,
            mime: a.mime,
            dataUrl: url,
            blobRef: a.blobRef,
          };
        });
      })
    ).then(function (list) {
      return list.filter(Boolean);
    });
  }

  function migrateReservorioAdjuntos(reservorio) {
    if (!reservorio || !Array.isArray(reservorio.recepciones)) return Promise.resolve({ migrated: 0 });
    var n = 0;
    var chain = Promise.resolve();
    reservorio.recepciones.forEach(function (rec) {
      if (!rec || !rec.adjuntos || !rec.adjuntos.length) return;
      var needs = rec.adjuntos.some(function (a) {
        return a && a.dataUrl && !a.blobRef;
      });
      if (!needs) return;
      chain = chain.then(function () {
        return persistAdjuntos(rec.id, rec.adjuntos).then(function (refs) {
          rec.adjuntos = refs;
          n++;
        });
      });
    });
    return chain.then(function () {
      return { migrated: n };
    });
  }

  function estimateUsage() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).getAll();
        req.onsuccess = function () {
          var rows = req.result || [];
          var bytes = 0;
          rows.forEach(function (r) {
            bytes += Number(r.bytes) || 0;
          });
          resolve({
            count: rows.length,
            bytes: bytes,
            mb: Math.round((bytes / (1024 * 1024)) * 10) / 10,
          });
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  function listPendingCloud() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var idx = tx.objectStore(STORE).index('syncEstado');
        var req = idx.getAll('pendiente_nube');
        req.onsuccess = function () {
          resolve(req.result || []);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  function markSyncEstado(blobId, estado, supabasePath) {
    return getRecord(blobId).then(function (rec) {
      if (!rec) return null;
      rec.syncEstado = estado || rec.syncEstado;
      if (supabasePath) rec.supabasePath = supabasePath;
      return putRecord(rec);
    });
  }

  function isWithinRetention(fechaIso) {
    if (!fechaIso) return true;
    var d = new Date(fechaIso);
    if (isNaN(d.getTime())) return true;
    var cut = new Date();
    cut.setDate(cut.getDate() - RETENTION_DAYS);
    return d >= cut;
  }

  function retentionDays() {
    return RETENTION_DAYS;
  }

  global.CrozzoBlobStore = {
    RETENTION_DAYS: RETENTION_DAYS,
    open: openDb,
    putBlob: putBlob,
    getBlobUrl: getBlobUrl,
    getDataUrl: getDataUrl,
    persistAdjuntos: persistAdjuntos,
    loadAdjuntosForUi: loadAdjuntosForUi,
    migrateReservorioAdjuntos: migrateReservorioAdjuntos,
    estimateUsage: estimateUsage,
    listPendingCloud: listPendingCloud,
    markSyncEstado: markSyncEstado,
    isWithinRetention: isWithinRetention,
    retentionDays: retentionDays,
  };
})(typeof window !== 'undefined' ? window : globalThis);



/* --- CrozzoReservorioSql.js --- */

/**
 * SQL visible en POS — Reservorio y flujos unificados (generado, no editar a mano)
 * Regenerar: node scripts/build-reservorio-sql-js.mjs
 */
(function (global) {
  'use strict';
  global.CrozzoReservorioSql = {
    version: 1,
    generatedAt: "2026-05-23T23:57:40.601Z",
    bundles: [
  {
    "key": "orden",
    "label": "Orden de ejecución",
    "sql": "-- ORDEN OBLIGATORIO EN SUPABASE SQL EDITOR\n-- 1. SUPABASE-SQL-EDITOR.sql\n-- 2. SUPABASE-SQL-INTEGRACION.sql\n-- 3. SUPABASE-SQL-QYC.sql\n-- 4. SUPABASE-STORAGE-FOTOS-MARCACIONES.sql\n-- 5. SUPABASE-SQL-QYC-FIX-TARJETA.sql\n-- 6. SUPABASE-SQL-COSTOS.sql\n-- 7. SUPABASE-SQL-RESERVORIO-UNIFICADO.sql (este bloque)\n"
  },
  {
    "key": "costos",
    "label": "Sistema de costos (F1/F3/F6)",
    "sql": "-- Crozzo POS — Sistema de costos (matriz, inventario ledger, cola planilla)\r\n-- Ejecutar DESPUÉS de: SUPABASE-SQL-EDITOR.sql, INTEGRACION.sql, QYC.sql\r\n\r\n-- ── F1 · Matriz de precios ───────────────────────────────────────────────────\r\n\r\ncreate table if not exists public.crozzo_matriz_precios (\r\n  id uuid primary key default gen_random_uuid(),\r\n  business_id text not null default 'default',\r\n  nombre text not null default 'Matriz principal',\r\n  estado text not null default 'borrador'\r\n    check (estado in ('borrador', 'revision', 'aprobada', 'vigente', 'historica')),\r\n  vigencia_desde timestamptz,\r\n  vigencia_hasta timestamptz,\r\n  notas text,\r\n  creado_por text,\r\n  aprobado_por text,\r\n  created_at timestamptz not null default now(),\r\n  updated_at timestamptz not null default now()\r\n);\r\n\r\ncreate table if not exists public.crozzo_matriz_precios_items (\r\n  id uuid primary key default gen_random_uuid(),\r\n  matriz_id uuid not null references public.crozzo_matriz_precios(id) on delete cascade,\r\n  ref_tipo text not null check (ref_tipo in ('producto_pos', 'producto_qyc', 'materia_prima', 'receta', 'corte')),\r\n  ref_id text not null,\r\n  nombre_display text not null,\r\n  costo_unitario numeric(14, 4) not null default 0,\r\n  margen_objetivo_pct numeric(8, 4) not null default 0,\r\n  precio_recomendado numeric(14, 2) not null default 0,\r\n  precio_decidido numeric(14, 2),\r\n  unidad text default 'und',\r\n  meta jsonb default '{}'::jsonb,\r\n  created_at timestamptz not null default now(),\r\n  updated_at timestamptz not null default now(),\r\n  unique (matriz_id, ref_tipo, ref_id)\r\n);\r\n\r\ncreate table if not exists public.crozzo_matriz_programaciones (\r\n  id uuid primary key default gen_random_uuid(),\r\n  matriz_id uuid not null references public.crozzo_matriz_precios(id) on delete cascade,\r\n  fecha_vigencia date not null,\r\n  hora_vigencia time default '06:00:00',\r\n  estado text not null default 'programada'\r\n    check (estado in ('programada', 'aplicada', 'cancelada', 'fallida')),\r\n  aplicada_at timestamptz,\r\n  dispositivos_ok int default 0,\r\n  dispositivos_total int default 0,\r\n  log jsonb default '[]'::jsonb,\r\n  created_at timestamptz not null default now()\r\n);\r\n\r\n-- ── F3 · Inventario ledger ───────────────────────────────────────────────────\r\n\r\ncreate table if not exists public.crozzo_inventario_movimientos (\r\n  id uuid primary key default gen_random_uuid(),\r\n  business_id text not null default 'default',\r\n  fecha date not null default (current_date),\r\n  tipo text not null check (tipo in (\r\n    'inicial', 'entrada_proveedor', 'entrada_proceso', 'salida_venta',\r\n    'salida_merma', 'ajuste_conteo', 'ajuste_manual'\r\n  )),\r\n  ref_tipo text,\r\n  ref_id text,\r\n  producto_ref_tipo text check (producto_ref_tipo in ('producto_pos', 'producto_qyc', 'materia_prima')),\r\n  producto_ref_id text not null,\r\n  cantidad numeric(14, 4) not null,\r\n  unidad text default 'kg',\r\n  costo_unitario numeric(14, 4) default 0,\r\n  valor_total numeric(14, 2) generated always as (cantidad * costo_unitario) stored,\r\n  notas text,\r\n  usuario text,\r\n  created_at timestamptz not null default now()\r\n);\r\n\r\ncreate index if not exists idx_crozzo_inv_mov_fecha on public.crozzo_inventario_movimientos (business_id, fecha);\r\ncreate index if not exists idx_crozzo_inv_mov_prod on public.crozzo_inventario_movimientos (producto_ref_tipo, producto_ref_id);\r\n\r\ncreate table if not exists public.crozzo_inventario_cierres (\r\n  id uuid primary key default gen_random_uuid(),\r\n  business_id text not null default 'default',\r\n  fecha date not null,\r\n  inventario_inicial_valor numeric(14, 2) default 0,\r\n  entradas_valor numeric(14, 2) default 0,\r\n  salidas_valor numeric(14, 2) default 0,\r\n  teorico_final_valor numeric(14, 2) default 0,\r\n  conteo_fisico_valor numeric(14, 2),\r\n  diferencia_valor numeric(14, 2),\r\n  diferencia_pct numeric(8, 4),\r\n  estado text not null default 'abierto' check (estado in ('abierto', 'cerrado', 'auditado')),\r\n  cerrado_por text,\r\n  cerrado_at timestamptz,\r\n  detalle jsonb default '{}'::jsonb,\r\n  created_at timestamptz not null default now(),\r\n  unique (business_id, fecha)\r\n);\r\n\r\n-- ── F6 · Cola planilla (admin elige qué ingresar) ────────────────────────────\r\n\r\ncreate table if not exists public.crozzo_planilla_feed (\r\n  id uuid primary key default gen_random_uuid(),\r\n  business_id text not null default 'default',\r\n  origen text not null check (origen in ('ventas', 'compra', 'oficina', 'inventario', 'nomina', 'manual')),\r\n  fecha date not null default (current_date),\r\n  concepto text not null,\r\n  monto numeric(14, 2) not null default 0,\r\n  tipo_movimiento text not null default 'egreso' check (tipo_movimiento in ('ingreso', 'egreso')),\r\n  referencia_tipo text,\r\n  referencia_id text,\r\n  payload jsonb default '{}'::jsonb,\r\n  estado text not null default 'pendiente'\r\n    check (estado in ('pendiente', 'aceptado', 'rechazado', 'ingresado')),\r\n  revisado_por text,\r\n  revisado_at timestamptz,\r\n  planilla_periodo_id text,\r\n  planilla_dia date,\r\n  created_at timestamptz not null default now()\r\n);\r\n\r\ncreate index if not exists idx_crozzo_planilla_feed_estado on public.crozzo_planilla_feed (business_id, estado, fecha desc);\r\n\r\n-- ── RLS (mismo patrón POS) ───────────────────────────────────────────────────\r\n\r\nselect public.crozzo_enable_pos_rls('crozzo_matriz_precios');\r\nselect public.crozzo_enable_pos_rls('crozzo_matriz_precios_items');\r\nselect public.crozzo_enable_pos_rls('crozzo_matriz_programaciones');\r\nselect public.crozzo_enable_pos_rls('crozzo_inventario_movimientos');\r\nselect public.crozzo_enable_pos_rls('crozzo_inventario_cierres');\r\nselect public.crozzo_enable_pos_rls('crozzo_planilla_feed');\r\n"
  },
  {
    "key": "reservorio",
    "label": "Reservorio unificado + sync",
    "sql": "-- Crozzo POS — Reservorio unificado + flujos conectados\r\n-- Ejecutar EN ORDEN en SQL Editor de Supabase (proyecto del POS)\r\n--\r\n-- 1. docs/SUPABASE-SQL-EDITOR.sql\r\n-- 2. docs/SUPABASE-SQL-INTEGRACION.sql\r\n-- 3. docs/SUPABASE-SQL-QYC.sql\r\n-- 4. docs/SUPABASE-STORAGE-FOTOS-MARCACIONES.sql\r\n-- 5. docs/SUPABASE-SQL-QYC-FIX-TARJETA.sql\r\n-- 6. docs/SUPABASE-SQL-COSTOS.sql\r\n-- 7. ESTE ARCHIVO (reservorio + cola sync + puente proveedores)\r\n\r\n-- ── Puente proveedores POS ↔ QyC ───────────────────────────────────────────\r\n\r\nalter table if exists public.proveedores\r\n  add column if not exists pos_proveedor_id text,\r\n  add column if not exists categoria text default '',\r\n  add column if not exists activo boolean not null default true;\r\n\r\ncreate unique index if not exists idx_proveedores_pos_id\r\n  on public.proveedores (pos_proveedor_id)\r\n  where pos_proveedor_id is not null and pos_proveedor_id <> '';\r\n\r\ncomment on column public.proveedores.pos_proveedor_id is\r\n  'ID del proveedor en POS (proveedoresOC) para sincronizar offline → nube';\r\n\r\n-- ── Cola de sincronización (reservorio offline → nube) ───────────────────────\r\n\r\ncreate table if not exists public.crozzo_reservorio_sync_queue (\r\n  id uuid primary key default gen_random_uuid(),\r\n  business_id text not null default 'default',\r\n  op text not null check (op in ('insert', 'update', 'upsert', 'delete')),\r\n  tabla text not null,\r\n  payload jsonb not null default '{}'::jsonb,\r\n  estado text not null default 'pendiente'\r\n    check (estado in ('pendiente', 'procesando', 'ok', 'error')),\r\n  intentos int not null default 0,\r\n  error_msg text,\r\n  local_id text,\r\n  created_at timestamptz not null default now(),\r\n  processed_at timestamptz\r\n);\r\n\r\ncreate index if not exists idx_crozzo_sync_queue_pend\r\n  on public.crozzo_reservorio_sync_queue (business_id, estado, created_at desc);\r\n\r\n-- ── Snapshot reservorio (backup opcional por dispositivo) ────────────────────\r\n\r\ncreate table if not exists public.crozzo_reservorio_snapshots (\r\n  id uuid primary key default gen_random_uuid(),\r\n  business_id text not null default 'default',\r\n  device_id text,\r\n  version int not null default 1,\r\n  snapshot jsonb not null,\r\n  stats jsonb default '{}'::jsonb,\r\n  created_at timestamptz not null default now()\r\n);\r\n\r\ncreate index if not exists idx_crozzo_reservorio_snap\r\n  on public.crozzo_reservorio_snapshots (business_id, created_at desc);\r\n\r\n-- ── Vista operativa: flujo compras conectado ─────────────────────────────────\r\n\r\ncreate or replace view public.crozzo_v_flujo_compras as\r\nselect\r\n  r.id as recepcion_id,\r\n  r.fecha as recepcion_fecha,\r\n  r.proveedor_id,\r\n  p.nombre as proveedor_nombre,\r\n  r.total as recepcion_total,\r\n  f.id as factura_id,\r\n  f.estado as factura_estado,\r\n  f.metodo_pago,\r\n  f.total as factura_total\r\nfrom public.recepciones r\r\nleft join public.proveedores p on p.id = r.proveedor_id\r\nleft join public.facturas f on f.recepcion_id = r.id;\r\n\r\ncomment on view public.crozzo_v_flujo_compras is\r\n  'Recepción → proveedor → factura oficina (cadena F4/F5)';\r\n\r\n-- ── RLS ──────────────────────────────────────────────────────────────────────\r\n\r\nselect public.crozzo_enable_pos_rls('crozzo_reservorio_sync_queue');\r\nselect public.crozzo_enable_pos_rls('crozzo_reservorio_snapshots');\r\n\r\n-- ── Función auxiliar: marcar sync procesado ──────────────────────────────────\r\n\r\ncreate or replace function public.crozzo_sync_queue_done(p_id uuid, p_ok boolean, p_error text default null)\r\nreturns void\r\nlanguage plpgsql\r\nsecurity definer\r\nas $$\r\nbegin\r\n  update public.crozzo_reservorio_sync_queue\r\n  set\r\n    estado = case when p_ok then 'ok' else 'error' end,\r\n    error_msg = p_error,\r\n    processed_at = now(),\r\n    intentos = intentos + 1\r\n  where id = p_id;\r\nend;\r\n$$;\r\n"
  }
],
    getFullScript: function () {
      return this.bundles.map(function (b) {
        return '-- ═══ ' + b.label + ' ═══\n' + b.sql;
      }).join('\n\n');
    },
    getBundle: function (key) {
      var b = this.bundles.find(function (x) { return x.key === key; });
      return b ? b.sql : '';
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);



/* --- CrozzoReservorio.js --- */

/**
 * Crozzo POS — Reservorio unificado (memoria interna / localStorage)
 * Proveedores · Recepciones · Oficina · Inventario ledger · Cola planilla · Sync pendiente
 */
(function (global) {
  'use strict';

  var LS = 'crozzo_reservorio_v1';
  var LS_BACKUP = 'crozzo_reservorio_backup_v1';
  var LS_BACKUP2 = 'crozzo_reservorio_backup_v2';
  var VERSION = 1;
  var RETENTION_DAYS = 365;
  var healthMeta = { recoveredFromBackup: false, lastSaveOk: true, lastSaveError: null, blobMigrated: 0 };

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  function safeParse(raw, fb) {
    if (raw == null || (typeof raw === 'string' && !String(raw).trim())) return fb;
    try {
      var v = JSON.parse(raw);
      return v == null ? fb : v;
    } catch (_) {
      return fb;
    }
  }

  function emptyStore() {
    return {
      version: VERSION,
      businessId: 'default',
      updatedAt: new Date().toISOString(),
      proveedores: [],
      recepciones: [],
      facturasOficina: [],
      cortes: [],
      inventarioMovimientos: [],
      catalogoMp: [],
      costeoMp: [],
      cotizacionesMp: [],
      menuCostos: [],
      recetasPlatos: [],
      recetaDemo: null,
      matrizMp: [],
      planillaFeed: [],
      syncQueue: [],
      meta: { migrated: false, migrationNotes: [] },
    };
  }

  function businessId() {
    try {
      if (typeof global.getBusinessId === 'function') return global.getBusinessId();
      if (global.config && global.config.businessId) return global.config.businessId;
    } catch (_) {}
    return 'default';
  }

  function validateStore(st) {
    if (!st || typeof st !== 'object') return false;
    if (!Array.isArray(st.proveedores)) return false;
    return true;
  }

  function normalizeStore(st) {
    if (!st || typeof st !== 'object') st = emptyStore();
    if (!Array.isArray(st.proveedores)) st.proveedores = [];
    if (!Array.isArray(st.recepciones)) st.recepciones = [];
    if (!Array.isArray(st.facturasOficina)) st.facturasOficina = [];
    if (!Array.isArray(st.cortes)) st.cortes = [];
    if (!Array.isArray(st.inventarioMovimientos)) st.inventarioMovimientos = [];
    if (!Array.isArray(st.catalogoMp)) st.catalogoMp = [];
    if (!Array.isArray(st.costeoMp)) st.costeoMp = [];
    if (!Array.isArray(st.cotizacionesMp)) st.cotizacionesMp = [];
    if (!Array.isArray(st.menuCostos)) st.menuCostos = [];
    if (!Array.isArray(st.recetasPlatos)) st.recetasPlatos = [];
    if (!st.recetaDemo) st.recetaDemo = null;
    if (!Array.isArray(st.matrizMp)) st.matrizMp = [];
    if (!Array.isArray(st.planillaFeed)) st.planillaFeed = [];
    if (!Array.isArray(st.syncQueue)) st.syncQueue = [];
    st.businessId = businessId();
    if (!st.meta) st.meta = { migrated: false, migrationNotes: [] };
    if (!Array.isArray(st.meta.archivoRecepciones)) st.meta.archivoRecepciones = [];
    st.version = VERSION;
    return st;
  }

  function isWithinRetention(fecha) {
    if (!fecha) return true;
    var d = new Date(fecha);
    if (isNaN(d.getTime())) return true;
    var cut = new Date();
    cut.setDate(cut.getDate() - RETENTION_DAYS);
    return d >= cut;
  }

  /** Quita base64 del JSON; los bytes viven en CrozzoBlobStore (IndexedDB). */
  function sanitizeAdjuntos(adjuntos) {
    if (!Array.isArray(adjuntos)) return [];
    return adjuntos.slice(0, 16).map(function (a) {
      if (!a) return null;
      return {
        id: a.id,
        nombre: a.nombre,
        mime: a.mime,
        bytes: a.bytes || 0,
        blobRef: a.blobRef || null,
        thumbDataUrl: a.thumbDataUrl || null,
        syncEstado: a.syncEstado || 'local',
        supabasePath: a.supabasePath || null,
      };
    }).filter(Boolean);
  }

  function slimRecepcionArchivo(rec) {
    return {
      id: rec.id,
      fecha: rec.fecha,
      proveedorId: rec.proveedorId,
      proveedorNombre: rec.proveedorNombre,
      valor: rec.valor,
      numeroFactura: rec.numeroFactura,
      metodoPago: rec.metodoPago,
      estado: rec.estado,
      createdAt: rec.createdAt,
      archivedAt: new Date().toISOString(),
    };
  }

  function stripHeavyFromRecepciones(st) {
    st.recepciones.forEach(function (rec) {
      if (rec.adjuntos) rec.adjuntos = sanitizeAdjuntos(rec.adjuntos);
    });
    return st;
  }

  function trimForQuota(st) {
    stripHeavyFromRecepciones(st);
    if (st.syncQueue.length > 300) {
      var pend = st.syncQueue.filter(function (q) { return q.estado === 'pendiente'; });
      var done = st.syncQueue.filter(function (q) { return q.estado !== 'pendiente'; }).slice(0, 80);
      st.syncQueue = pend.concat(done).slice(0, 300);
    }
    if (st.inventarioMovimientos.length > 2500) {
      var invRecientes = st.inventarioMovimientos.filter(function (m) {
        return isWithinRetention(m.fecha || m.createdAt);
      });
      var invViejos = st.inventarioMovimientos.filter(function (m) {
        return !isWithinRetention(m.fecha || m.createdAt);
      });
      st.inventarioMovimientos = invRecientes.concat(invViejos.slice(0, 400));
    }
    var recientes = [];
    var viejas = [];
    st.recepciones.forEach(function (r) {
      if (isWithinRetention(r.fecha || r.createdAt)) recientes.push(r);
      else viejas.push(r);
    });
    if (viejas.length) {
      viejas.forEach(function (r) {
        if (!st.meta.archivoRecepciones.some(function (x) { return x.id === r.id; })) {
          st.meta.archivoRecepciones.unshift(slimRecepcionArchivo(r));
        }
      });
      if (st.meta.archivoRecepciones.length > 800) st.meta.archivoRecepciones.length = 800;
    }
    st.recepciones = recientes;
    if (st.recepciones.length > 2500) st.recepciones.length = 2500;
    if (st.planillaFeed.length > 600) st.planillaFeed.length = 600;
    if (st.facturasOficina.length > 600) st.facturasOficina.length = 600;
    if (st.matrizMp.length > 800) st.matrizMp.length = 800;
    if (st.cotizacionesMp.length > 800) st.cotizacionesMp.length = 800;
    return st;
  }

  function calcCotizacionUnit(precioTotal, peso) {
    var p = Number(precioTotal) || 0;
    var w = Number(peso) || 0;
    if (w <= 0) return 0;
    return Math.round((p / w) * 1000000) / 1000000;
  }

  function listCotizacionesMp(opts) {
    opts = opts || {};
    var st = migrateLegacy();
    var rows = (st.cotizacionesMp || []).slice();
    if (opts.mpId) {
      rows = rows.filter(function (r) {
        return r && String(r.mpId) === String(opts.mpId);
      });
    }
    rows.sort(function (a, b) {
      return String(b.fecha || b.createdAt || '').localeCompare(String(a.fecha || a.createdAt || ''));
    });
    return rows.slice(0, opts.limit || 500);
  }

  function addCotizacionMp(input) {
    if (!input || !input.mpId) return null;
    var st = migrateLegacy();
    var peso = Number(input.peso) || Number(input.cantidad) || 1000;
    var precioTotal = Number(input.precioTotal) || 0;
    if (precioTotal <= 0) return null;
    var row = {
      id: input.id || uid('cot'),
      mpId: String(input.mpId),
      proveedorId: input.proveedorId || null,
      proveedorNombre: String(input.proveedorNombre || input.proveedor || 'Proveedor').trim(),
      precioTotal: precioTotal,
      peso: peso,
      und: String(input.und || 'GR').toUpperCase(),
      precioUnit: calcCotizacionUnit(precioTotal, peso),
      fecha: input.fecha || new Date().toISOString().slice(0, 10),
      notas: input.notas || '',
      vigente: input.vigente !== false,
      createdAt: new Date().toISOString(),
    };
    st.cotizacionesMp.unshift(row);
    pushSync(st, { tipo: 'insert', tabla: 'crozzo_cotizaciones_mp', payload: row });
    save(st);
    try {
      document.dispatchEvent(new CustomEvent('crozzo-cotizaciones-mp:changed', { detail: { row: row }, bubbles: true }));
    } catch (_) {}
    return row;
  }

  function removeCotizacionMp(id) {
    var st = migrateLegacy();
    var before = st.cotizacionesMp.length;
    st.cotizacionesMp = st.cotizacionesMp.filter(function (r) {
      return r && String(r.id) !== String(id);
    });
    if (st.cotizacionesMp.length === before) return false;
    save(st);
    try {
      document.dispatchEvent(new CustomEvent('crozzo-cotizaciones-mp:changed', { detail: { id: id, tipo: 'delete' }, bubbles: true }));
    } catch (_) {}
    return true;
  }

  function upsertMatrizMp(item) {
    if (!item || !item.id) return null;
    var st = migrateLegacy();
    var idx = st.matrizMp.findIndex(function (x) {
      return x.id === item.id;
    });
    var row = {
      id: item.id,
      nombre: item.nombre,
      categoria: item.categoria,
      und: item.und,
      peso: item.peso,
      precioTotal: item.precioTotal,
      precioUnit: item.precioUnit,
      materiaPrimaId: item.materiaPrimaId || null,
      updatedAt: new Date().toISOString(),
    };
    if (idx >= 0) st.matrizMp[idx] = row;
    else st.matrizMp.unshift(row);
    pushSync(st, { tipo: 'upsert', tabla: 'crozzo_matriz_mp', payload: row });
    save(st);
    return row;
  }

  function listMatrizMp(limit) {
    return migrateLegacy().matrizMp.slice(0, limit || 500);
  }

  function rotateBackup(prevJson) {
    try {
      var b1 = localStorage.getItem(LS_BACKUP);
      if (b1) localStorage.setItem(LS_BACKUP2, b1);
      if (prevJson) localStorage.setItem(LS_BACKUP, prevJson);
    } catch (_) {}
  }

  function loadWithRecovery() {
    var st = safeParse(localStorage.getItem(LS), null);
    if (!validateStore(st)) {
      var bk = safeParse(localStorage.getItem(LS_BACKUP), null);
      if (validateStore(bk)) {
        st = bk;
        healthMeta.recoveredFromBackup = true;
      } else {
        var bk2 = safeParse(localStorage.getItem(LS_BACKUP2), null);
        if (validateStore(bk2)) {
          st = bk2;
          healthMeta.recoveredFromBackup = true;
        } else {
          st = emptyStore();
        }
      }
      try {
        localStorage.setItem(LS, JSON.stringify(normalizeStore(st)));
      } catch (_) {}
    }
    return normalizeStore(st);
  }

  function saveSafe(st) {
    st.updatedAt = new Date().toISOString();
    st.businessId = businessId();
    st.version = VERSION;
    var json = JSON.stringify(st);
    try {
      var prev = localStorage.getItem(LS);
      if (prev && prev !== json) rotateBackup(prev);
      localStorage.setItem(LS, json);
      healthMeta.lastSaveOk = true;
      healthMeta.lastSaveError = null;
      return { ok: true };
    } catch (e) {
      if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
        trimForQuota(st);
        json = JSON.stringify(st);
        try {
          rotateBackup(localStorage.getItem(LS));
          localStorage.setItem(LS, json);
          healthMeta.lastSaveOk = true;
          healthMeta.lastSaveError = null;
          return { ok: true, trimmed: true };
        } catch (e2) {
          healthMeta.lastSaveOk = false;
          healthMeta.lastSaveError = String(e2);
          return { ok: false, error: String(e2) };
        }
      }
      healthMeta.lastSaveOk = false;
      healthMeta.lastSaveError = String(e);
      return { ok: false, error: String(e) };
    }
  }

  function load() {
    return loadWithRecovery();
  }

  function save(st) {
    var r = saveSafe(st);
    if (!r.ok) {
      try {
        if (typeof global.showToast === 'function') {
          global.showToast('No se pudo guardar el reservorio: ' + (r.error || 'error'), 'error');
        }
      } catch (_) {}
    } else if (r.trimmed) {
      try {
        if (typeof global.showToast === 'function') {
          global.showToast('Espacio local ajustado — datos recientes conservados', 'warning');
        }
      } catch (_) {}
    }
    try {
      document.dispatchEvent(
        new CustomEvent('crozzo-reservorio-updated', { detail: { updatedAt: st.updatedAt, saveOk: r.ok } })
      );
    } catch (_) {}
    return st;
  }

  function getHealth() {
    var st = load();
    var arch = (st.meta && st.meta.archivoRecepciones) || [];
    return {
      ok: healthMeta.lastSaveOk !== false,
      hasBackup: !!localStorage.getItem(LS_BACKUP),
      hasBackup2: !!localStorage.getItem(LS_BACKUP2),
      recoveredFromBackup: healthMeta.recoveredFromBackup,
      lastSaveError: healthMeta.lastSaveError,
      blobMigrated: healthMeta.blobMigrated,
      retentionDays: RETENTION_DAYS,
      updatedAt: st.updatedAt,
      itemCounts: {
        proveedores: st.proveedores.length,
        recepciones: st.recepciones.length,
        recepcionesArchivo: arch.length,
        syncQueue: st.syncQueue.length,
      },
    };
  }

  function getStorageSummary() {
    var st = load();
    var arch = (st.meta && st.meta.archivoRecepciones) || [];
    var base = {
      retentionDays: RETENTION_DAYS,
      recepcionesActivas: st.recepciones.length,
      recepcionesArchivo: arch.length,
      reservorioKey: LS,
    };
    var B = global.CrozzoBlobStore;
    if (!B || !B.estimateUsage) return Promise.resolve(base);
    return B.estimateUsage()
      .then(function (u) {
        return Object.assign(base, { blobs: u });
      })
      .catch(function () {
        return base;
      });
  }

  function runBlobMigration(st) {
    var B = global.CrozzoBlobStore;
    if (!B || !B.migrateReservorioAdjuntos) return Promise.resolve(st);
    return B.migrateReservorioAdjuntos(st).then(function (r) {
      healthMeta.blobMigrated = (r && r.migrated) || 0;
      if (r && r.migrated) {
        stripHeavyFromRecepciones(st);
        saveSafe(st);
      }
      return st;
    });
  }

  function repairIfNeeded() {
    var st = loadWithRecovery();
    if (!st.meta.migrated) st = migrateLegacy();
    stripHeavyFromRecepciones(st);
    if (dedupeRecepcionesBurst(st)) save(st);
    syncProveedoresBidirectional();
    runBlobMigration(st);
    return st;
  }

  function flushBackup() {
    try {
      var cur = localStorage.getItem(LS);
      if (cur) rotateBackup(cur);
    } catch (_) {}
  }

  function emitCostos(eventName, detail) {
    detail = detail || {};
    try {
      if (typeof global.crozzoCostosEmit === 'function') global.crozzoCostosEmit(eventName, detail);
      else if (global.CrozzoSistemaCostos && global.CrozzoSistemaCostos.emit) global.CrozzoSistemaCostos.emit(eventName, detail);
    } catch (_) {}
  }

  function pushSync(st, op) {
    st.syncQueue.unshift({
      id: uid('sync'),
      op: op.tipo,
      tabla: op.tabla,
      payload: op.payload || {},
      estado: 'pendiente',
      createdAt: new Date().toISOString(),
    });
    if (st.syncQueue.length > 500) st.syncQueue.length = 500;
  }

  function migrateLegacy() {
    var st = load();
    if (st.meta.migrated) return st;
    var notes = [];

    try {
      var oldCompras = safeParse(localStorage.getItem('crozzo_compras_local_v1'), null);
      if (oldCompras) {
        (oldCompras.recepciones || []).forEach(function (r) {
          if (!st.recepciones.some(function (x) { return x.id === r.id; })) st.recepciones.push(r);
        });
        (oldCompras.cortes || []).forEach(function (c) {
          if (!st.cortes.some(function (x) { return x.id === c.id; })) st.cortes.push(c);
        });
        (oldCompras.facturasOficina || []).forEach(function (f) {
          if (!st.facturasOficina.some(function (x) { return x.id === f.id; })) st.facturasOficina.push(f);
        });
        notes.push('crozzo_compras_local_v1');
      }
    } catch (_) {}

    try {
      var oldFeed = safeParse(localStorage.getItem('crozzo_costos_feed_v1'), []);
      if (Array.isArray(oldFeed)) {
        oldFeed.forEach(function (it) {
          if (!st.planillaFeed.some(function (x) { return x.id === it.id; })) st.planillaFeed.push(it);
        });
        notes.push('crozzo_costos_feed_v1');
      }
    } catch (_) {}

    try {
      if (typeof global.config !== 'undefined' && global.config.get) {
        var poc = global.config.get('proveedoresOC') || [];
        poc.forEach(function (p) {
          upsertProveedorInternal(st, {
            id: p.id,
            nombre: p.name || p.nombre,
            nit: p.nit,
            telefono: p.phone || p.telefono,
            origen: 'proveedoresOC',
          });
        });
        if (poc.length) notes.push('proveedoresOC');
      }
    } catch (_) {}

    st.meta.migrated = true;
    st.meta.migrationNotes = notes;
    return save(st);
  }

  function upsertProveedorInternal(st, p) {
    var id = String(p.id || uid('prov'));
    var nombre = String(p.nombre || p.name || '').trim();
    if (!nombre) return null;
    var idx = st.proveedores.findIndex(function (x) {
      return String(x.id) === id || String(x.nombre || x.name || '').toUpperCase() === nombre.toUpperCase();
    });
    var row = {
      id: id,
      nombre: nombre,
      nit: p.nit || '',
      telefono: p.telefono || p.phone || '',
      categoria: p.categoria || p.tipoRubro || '',
      tipoRubro: p.tipoRubro || p.categoria || '',
      representante: p.representante || '',
      email: p.email || '',
      legal: p.legal && typeof p.legal === 'object' ? p.legal : {},
      activo: p.activo !== false,
      updatedAt: new Date().toISOString(),
    };
    if (idx >= 0) st.proveedores[idx] = Object.assign({}, st.proveedores[idx], row);
    else st.proveedores.push(row);
    return row;
  }

  function upsertProveedor(p) {
    var st = migrateLegacy();
    var row = upsertProveedorInternal(st, p);
    if (row) {
      pushSync(st, { tipo: 'upsert', tabla: 'proveedores', payload: row });
      syncProveedoresToConfig(st);
      save(st);
    }
    return row;
  }

  function syncProveedoresToConfig(st) {
    try {
      if (typeof global.config === 'undefined' || !global.config.set || !global.config.get) return;
      var list = (st || load()).proveedores.map(function (p) {
        return { id: p.id, name: p.nombre, nit: p.nit, phone: p.telefono };
      });
      global.config.set('proveedoresOC', list);
    } catch (_) {}
  }

  function listProveedores() {
    return migrateLegacy().proveedores.filter(function (p) { return p.activo !== false; });
  }

  /** Une reservorio ↔ config.proveedoresOC (entrada de factura + módulo Proveedores). */
  function syncProveedoresBidirectional() {
    var st = migrateLegacy();
    try {
      if (typeof global.config !== 'undefined' && global.config.get) {
        var oc = global.config.get('proveedoresOC') || [];
        if (Array.isArray(oc)) {
          oc.forEach(function (p) {
            if (!p || !(p.name || p.nombre)) return;
            upsertProveedorInternal(st, {
              id: p.id,
              nombre: p.name || p.nombre,
              nit: p.nit,
              telefono: p.phone || p.telefono,
              tipoRubro: p.tipoRubro || p.categoria || '',
            });
          });
        }
      }
    } catch (_) {}
    syncProveedoresToConfig(st);
    save(st);
    return st.proveedores.filter(function (p) { return p.activo !== false; });
  }

  function proveedorToOcRow(p) {
    return {
      id: p.id,
      name: p.nombre,
      nombre: p.nombre,
      nit: p.nit || '',
      phone: p.telefono || '',
      telefono: p.telefono || '',
      tipoRubro: p.tipoRubro || p.categoria || '',
      representante: p.representante || '',
      email: p.email || '',
    };
  }

  function listProveedoresOcFormat() {
    return syncProveedoresBidirectional().map(proveedorToOcRow);
  }

  function getProveedor(id) {
    return listProveedores().find(function (p) { return String(p.id) === String(id); });
  }

  function addInventarioMovimiento(st, mov) {
    var row = {
      id: uid('inv'),
      fecha: mov.fecha || new Date().toISOString().slice(0, 10),
      tipo: mov.tipo,
      refTipo: mov.refTipo || null,
      refId: mov.refId || null,
      productoRefTipo: mov.productoRefTipo || 'producto_pos',
      productoRefId: String(mov.productoRefId || mov.producto || 'general'),
      productoNombre: mov.productoNombre || mov.producto || '',
      cantidad: Number(mov.cantidad) || 0,
      unidad: mov.unidad || 'und',
      costoUnitario: Number(mov.costoUnitario) || 0,
      notas: mov.notas || '',
      createdAt: new Date().toISOString(),
    };
    st.inventarioMovimientos.unshift(row);
    if (st.inventarioMovimientos.length > 2000) st.inventarioMovimientos.length = 2000;
    pushSync(st, { tipo: 'insert', tabla: 'crozzo_inventario_movimientos', payload: row });
    return row;
  }

  function mpInvUnidad(und) {
    var u = String(und || 'GR').toUpperCase();
    if (u === 'ML') return 'ml';
    if (u === 'UND' || u === 'UNI') return 'und';
    if (u === 'KG') return 'kg';
    return 'g';
  }

  /** Reemplaza movimientos de inventario de una recepción y registra entradas por línea MP. */
  function syncInventarioRecepcion(st, rec, items) {
    if (!rec || !rec.id) return;
    st.inventarioMovimientos = (st.inventarioMovimientos || []).filter(function (m) {
      return !(m.refTipo === 'recepcion' && String(m.refId) === String(rec.id));
    });
    (items || []).forEach(function (line) {
      if (!line) return;
      var mpId = line.mpId || line.productoRefId;
      if (!mpId) return;
      var cant = Number(line.cantidad) || Number(line.peso) || 0;
      if (cant <= 0) return;
      var pTotal = Number(line.precioTotal != null ? line.precioTotal : line.valor) || 0;
      addInventarioMovimiento(st, {
        tipo: 'entrada_proveedor',
        refTipo: 'recepcion',
        refId: rec.id,
        productoRefId: mpId,
        productoRefTipo: 'materia_prima',
        productoNombre: line.productoNombre || line.nombre || 'Materia prima',
        cantidad: cant,
        unidad: mpInvUnidad(line.und || line.unidad),
        costoUnitario: cant > 0 && pTotal > 0 ? pTotal / cant : 0,
        notas:
          'Ingreso por factura' +
          (rec.numeroFactura ? ' ' + rec.numeroFactura : '') +
          (rec.proveedorNombre ? ' · ' + rec.proveedorNombre : ''),
        fecha: rec.fecha,
      });
    });
  }

  /**
   * Compras por materia prima en un rango (recepciones confirmadas).
   * opts: { dias, desde, hasta, categoria, mpId, q }
   */
  function getComprasMpResumen(opts) {
    opts = opts || {};
    var dias = Number(opts.dias);
    if (!isFinite(dias) || dias <= 0) dias = 30;
    var hasta = opts.hasta || new Date().toISOString().slice(0, 10);
    var desde = opts.desde;
    if (!desde) {
      var d0 = new Date();
      d0.setDate(d0.getDate() - dias);
      desde = d0.toISOString().slice(0, 10);
    }
    var catFilt = opts.categoria ? String(opts.categoria).toUpperCase() : '';
    var mpFilt = opts.mpId ? String(opts.mpId) : '';
    var q = opts.q ? String(opts.q).toLowerCase().trim() : '';
    var catApi = global.CrozzoCatalogoMp;
    var byMp = {};

    migrateLegacy().recepciones.forEach(function (rec) {
      if (!rec || rec.estado === 'anulada') return;
      var fecha = String(rec.fecha || rec.createdAt || '').slice(0, 10);
      if (fecha < desde || fecha > hasta) return;
      (rec.items || []).forEach(function (line) {
        if (!line) return;
        var mpId = String(line.mpId || line.productoRefId || '').trim();
        if (!mpId) return;
        var mp = catApi && catApi.get ? catApi.get(mpId) : null;
        var nombre = line.productoNombre || (mp && mp.nombre) || mpId;
        var categoria = String(line.categoria || (mp && mp.categoria) || 'OTRO').toUpperCase();
        if (catFilt && categoria !== catFilt) return;
        if (mpFilt && mpId !== mpFilt) return;
        if (q && nombre.toLowerCase().indexOf(q) < 0 && categoria.toLowerCase().indexOf(q) < 0) return;
        if (!byMp[mpId]) {
          byMp[mpId] = {
            mpId: mpId,
            nombre: nombre,
            categoria: categoria,
            und: (mp && mp.und) || line.und || 'GR',
            cantidad: 0,
            valor: 0,
            compras: 0,
          };
        }
        byMp[mpId].cantidad += Number(line.cantidad) || Number(line.peso) || 0;
        byMp[mpId].valor += Number(line.precioTotal) || 0;
        byMp[mpId].compras += 1;
      });
    });

    var filas = Object.keys(byMp).map(function (k) {
      return byMp[k];
    });
    filas.sort(function (a, b) {
      return b.valor - a.valor;
    });
    var totalValor = filas.reduce(function (s, f) {
      return s + f.valor;
    }, 0);
    var totalCant = filas.reduce(function (s, f) {
      return s + f.cantidad;
    }, 0);
    return {
      desde: desde,
      hasta: hasta,
      dias: dias,
      filas: filas,
      totalValor: totalValor,
      totalCant: totalCant,
      totalFilas: filas.length,
    };
  }

  function enqueuePlanilla(st, item) {
    var row = {
      id: item.id || uid('feed'),
      business_id: businessId(),
      origen: item.origen || 'manual',
      fecha: item.fecha || new Date().toISOString().slice(0, 10),
      concepto: item.concepto || 'Movimiento',
      monto: Number(item.monto) || 0,
      tipo_movimiento: item.tipo_movimiento || 'egreso',
      referencia_tipo: item.referencia_tipo || null,
      referencia_id: item.referencia_id || null,
      payload: item.payload || {},
      estado: item.estado || 'pendiente',
      created_at: item.created_at || new Date().toISOString(),
    };
    st.planillaFeed.unshift(row);
    if (st.planillaFeed.length > 500) st.planillaFeed.length = 500;
    pushSync(st, { tipo: 'insert', tabla: 'crozzo_planilla_feed', payload: row });
    emitCostos('crozzo-costos:feed-planilla', Object.assign({}, row, { enqueuePlanilla: false }));
    return row;
  }

  function pushAlertaPrecio(st, alerta) {
    if (!st.meta) st.meta = {};
    if (!Array.isArray(st.meta.alertasPrecio)) st.meta.alertasPrecio = [];
    var row = Object.assign(
      {
        id: uid('alrt'),
        fecha: new Date().toISOString(),
        leida: false,
      },
      alerta || {}
    );
    st.meta.alertasPrecio.unshift(row);
    if (st.meta.alertasPrecio.length > 80) st.meta.alertasPrecio.length = 80;
    return row;
  }

  /** Evita ráfagas de la misma factura (doble clic / handlers duplicados). */
  function findRecepcionDuplicadaReciente(input) {
    input = input || {};
    var pid = String(input.proveedorId || '');
    var nf = String(input.numeroFactura || '').trim();
    var val = Number(input.valor) || 0;
    var nItems = (input.items && input.items.length) || 0;
    var lim = Date.now() - 120000;
    var st = migrateLegacy();
    for (var i = 0; i < st.recepciones.length && i < 30; i++) {
      var r = st.recepciones[i];
      if (!r) continue;
      var t = new Date(r.createdAt || r.fecha || 0).getTime();
      if (t < lim) break;
      if (String(r.proveedorId) !== pid) continue;
      if (String(r.numeroFactura || '').trim() !== nf) continue;
      if (Math.abs(Number(r.valor) - val) >= 1) continue;
      if (((r.items && r.items.length) || 0) !== nItems) continue;
      return r;
    }
    return null;
  }

  function dedupeRecepcionesBurst(st) {
    if (!st || !Array.isArray(st.recepciones) || st.recepciones.length < 2) return false;
    var seen = {};
    var kept = [];
    var removed = 0;
    st.recepciones.forEach(function (r) {
      if (!r) return;
      var t = new Date(r.createdAt || r.fecha || 0).getTime();
      var bucket = isFinite(t) ? Math.floor(t / 3000) : 0;
      var sig =
        String(r.proveedorId || '') +
        '|' +
        String(r.numeroFactura || '').trim() +
        '|' +
        Math.round(Number(r.valor) || 0) +
        '|' +
        ((r.items && r.items.length) || 0) +
        '|' +
        bucket;
      if (seen[sig]) {
        removed++;
        return;
      }
      seen[sig] = true;
      kept.push(r);
    });
    if (!removed) return false;
    st.recepciones = kept;
    return true;
  }

  function registrarRecepcion(input) {
    input = input || {};
    var rid = input.id ? String(input.id) : '';
    if (rid) {
      var prev = getRecepcion(rid);
      if (prev) return actualizarRecepcion(rid, input);
    }
    if (!input._forceNew) {
      var dup = findRecepcionDuplicadaReciente(input);
      if (dup) return actualizarRecepcion(dup.id, input);
    }
    var st = migrateLegacy();
    var prov = getProveedor(input.proveedorId) || { id: input.proveedorId, nombre: input.proveedorNombre || 'Proveedor' };
    var valor = Number(input.valor) || 0;
    var rec = {
      id: input.id || uid('rec'),
      fecha: input.fecha || new Date().toISOString().slice(0, 10),
      proveedorId: prov.id,
      proveedorNombre: prov.nombre || input.proveedorNombre,
      valor: valor,
      notas: input.notas || '',
      numeroFactura: input.numeroFactura || '',
      metodoPago: input.metodoPago || input.metodo || 'por_definir',
      comentarios: input.comentarios || '',
      adjuntos: sanitizeAdjuntos(input.adjuntos),
      syncEstado: input.syncEstado || 'pendiente_nube',
      alertasPrecio: Array.isArray(input.alertasPrecio) ? input.alertasPrecio : [],
      estado: input.estado || 'confirmada',
      items: input.items || [],
      createdAt: input.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    st.recepciones.unshift(rec);

    var items = Array.isArray(input.items) ? input.items : [];
    if (items.length) {
      syncInventarioRecepcion(st, rec, items);
    } else {
      addInventarioMovimiento(st, {
        tipo: 'entrada_proveedor',
        refTipo: 'recepcion',
        refId: rec.id,
        productoRefId: input.productoRefId || 'recepcion-' + rec.id,
        productoNombre: input.productoNombre || rec.notas || 'Recepción proveedor',
        cantidad: input.cantidad || 1,
        unidad: input.unidad || 'und',
        costoUnitario: valor > 0 ? valor : 0,
        notas: 'Recepción: ' + (rec.proveedorNombre || ''),
      });
    }

    var factura = null;
    if (valor > 0 && input.crearOficina !== false) {
      factura = {
        id: uid('of'),
        fecha: rec.fecha,
        proveedorId: prov.id,
        proveedorNombre: prov.nombre,
        valor: valor,
        metodo: input.metodoPago || input.metodo || 'por_definir',
        estado: 'pendiente',
        recepcionId: rec.id,
        notas: rec.comentarios || rec.notas,
        numeroFactura: rec.numeroFactura,
        createdAt: new Date().toISOString(),
      };
      st.facturasOficina.unshift(factura);
      pushSync(st, { tipo: 'insert', tabla: 'facturas', payload: factura });
    }

    pushSync(st, { tipo: 'insert', tabla: 'recepciones', payload: rec });
    save(st);

    var costeoActualizado = [];
    if (items.length && global.CrozzoCatalogoMp && global.CrozzoCatalogoMp.applyRecepcionItems) {
      try {
        costeoActualizado = global.CrozzoCatalogoMp.applyRecepcionItems(items, {
          recepcionId: rec.id,
          fecha: rec.createdAt,
          skipConfirm: input.skipConfirmVariacion === true,
        }) || [];
      } catch (costeoErr) {
        console.warn('[reservorio] costeo recepción', costeoErr);
      }
    }

    if (rec.alertasPrecio && rec.alertasPrecio.length) {
      rec.alertasPrecio.forEach(function (a) {
        pushAlertaPrecio(st, Object.assign({ recepcionId: rec.id, proveedorNombre: rec.proveedorNombre }, a));
      });
    }

    emitCostos('crozzo-costos:recepcion-registrada', {
      recepcion: rec,
      facturaOficina: factura,
      proveedor: prov,
      items: items,
      costeoActualizado: costeoActualizado,
      alertasPrecio: rec.alertasPrecio,
    });
    try {
      global.dispatchEvent(
        new CustomEvent('crozzo-recepcion:guardada', {
          detail: { recepcion: rec, alertasPrecio: rec.alertasPrecio },
        })
      );
    } catch (_) {}

    return { recepcion: rec, facturaOficina: factura, costeoActualizado: costeoActualizado };
  }

  function getRecepcion(id) {
    return migrateLegacy().recepciones.find(function (r) {
      return String(r.id) === String(id);
    });
  }

  function listRecepciones(limit) {
    return migrateLegacy().recepciones.slice(0, limit || 100);
  }

  function eliminarRecepcion(id) {
    var st = migrateLegacy();
    var sid = String(id || '');
    if (!sid) return false;
    var idx = st.recepciones.findIndex(function (r) {
      return String(r.id) === sid;
    });
    if (idx < 0) return false;
    var removed = st.recepciones[idx];

    st.inventarioMovimientos = (st.inventarioMovimientos || []).filter(function (m) {
      return !(m.refTipo === 'recepcion' && String(m.refId) === sid);
    });

    st.facturasOficina = (st.facturasOficina || []).filter(function (f) {
      return String(f.recepcionId || '') !== sid;
    });

    if (st.meta && Array.isArray(st.meta.alertasPrecio)) {
      st.meta.alertasPrecio = st.meta.alertasPrecio.filter(function (a) {
        return String(a.recepcionId || '') !== sid;
      });
    }

    st.recepciones.splice(idx, 1);
    pushSync(st, { tipo: 'delete', tabla: 'recepciones', payload: { id: sid } });
    save(st);

    emitCostos('crozzo-costos:recepcion-eliminada', { recepcion: removed, id: sid });
    try {
      global.dispatchEvent(
        new CustomEvent('crozzo-recepcion:eliminada', {
          detail: { recepcion: removed, id: sid },
        })
      );
    } catch (_) {}

    return true;
  }

  function actualizarRecepcion(id, input) {
    var st = migrateLegacy();
    var idx = st.recepciones.findIndex(function (r) {
      return String(r.id) === String(id);
    });
    if (idx < 0) return null;
    var prev = st.recepciones[idx];
    var patch = Object.assign({}, input || {}, { updatedAt: new Date().toISOString() });
    if (patch.adjuntos) patch.adjuntos = sanitizeAdjuntos(patch.adjuntos);
    var next = Object.assign({}, prev, patch);
    st.recepciones[idx] = next;
    if (input && input.items && input.items.length) {
      syncInventarioRecepcion(st, next, input.items);
    }
    pushSync(st, { tipo: 'update', tabla: 'recepciones', payload: next });
    save(st);
    var costeoActualizado = [];
    if (input && input.items && global.CrozzoCatalogoMp && global.CrozzoCatalogoMp.applyRecepcionItems) {
      try {
        costeoActualizado = global.CrozzoCatalogoMp.applyRecepcionItems(input.items, {
          recepcionId: next.id,
          fecha: next.updatedAt,
          skipConfirm: input.skipConfirmVariacion === true,
        }) || [];
      } catch (costeoErr) {
        console.warn('[reservorio] costeo recepción (update)', costeoErr);
      }
    }
    emitCostos('crozzo-costos:recepcion-actualizada', {
      recepcion: next,
      anterior: prev,
      costeoActualizado: costeoActualizado,
    });
    return { recepcion: next, costeoActualizado: costeoActualizado };
  }

  function listAlertasPrecio(limit) {
    var st = migrateLegacy();
    var list = (st.meta && st.meta.alertasPrecio) || [];
    return list.slice(0, limit || 40);
  }

  function registrarOficina(input) {
    var st = migrateLegacy();
    var prov = getProveedor(input.proveedorId) || { id: input.proveedorId, nombre: input.proveedorNombre };
    var fac = {
      id: input.id || uid('of'),
      fecha: input.fecha || new Date().toISOString().slice(0, 10),
      proveedorId: prov.id,
      proveedorNombre: prov.nombre || input.proveedorNombre,
      numeroFactura: String(input.numeroFactura || '').trim(),
      valor: Number(input.valor) || 0,
      metodo: input.metodo || 'efectivo',
      estado: input.estado || 'pendiente',
      recepcionId: input.recepcionId || null,
      notas: input.notas || '',
      createdAt: new Date().toISOString(),
    };
    st.facturasOficina.unshift(fac);
    pushSync(st, { tipo: 'insert', tabla: 'facturas', payload: fac });
    save(st);
    if (fac.estado === 'pagada') onFacturaPagada(fac);
    return fac;
  }

  function actualizarEstadoOficina(facturaId, estado, extra) {
    var st = migrateLegacy();
    var fac = st.facturasOficina.find(function (f) { return f.id === facturaId; });
    if (!fac) return null;
    fac.estado = estado;
    if (extra) Object.assign(fac, extra);
    fac.updatedAt = new Date().toISOString();
    pushSync(st, { tipo: 'update', tabla: 'facturas', payload: fac });
    save(st);
    if (estado === 'pagada') onFacturaPagada(fac);
    return fac;
  }

  function onFacturaPagada(fac) {
    emitCostos('crozzo-costos:factura-pagada', { factura: fac });
    var st = load();
    var exists = st.planillaFeed.some(function (f) {
      return f.referencia_id === fac.id && f.origen === 'oficina' && f.estado !== 'rechazado';
    });
    if (exists) return;
    enqueuePlanilla(st, {
      origen: 'oficina',
      concepto: 'Pago proveedor: ' + (fac.proveedorNombre || ''),
      monto: fac.valor,
      tipo_movimiento: 'egreso',
      referencia_tipo: 'factura_oficina',
      referencia_id: fac.id,
      payload: fac,
    });
    save(st);
  }

  function registrarProceso(input) {
    var st = migrateLegacy();
    var cor = {
      id: input.id || uid('cor'),
      fecha: input.fecha || new Date().toISOString().slice(0, 10),
      producto: input.producto || '',
      kg: Number(input.kg) || 0,
      notas: input.notas || '',
      createdAt: new Date().toISOString(),
    };
    st.cortes.unshift(cor);
    addInventarioMovimiento(st, {
      tipo: 'entrada_proceso',
      refTipo: 'proceso',
      refId: cor.id,
      productoRefId: cor.producto,
      productoNombre: cor.producto,
      cantidad: cor.kg || 1,
      unidad: 'kg',
      notas: cor.notas,
    });
    pushSync(st, { tipo: 'insert', tabla: 'lotes_procesado', payload: cor });
    save(st);
    emitCostos('crozzo-costos:proceso-cerrado', { proceso: cor });
    return cor;
  }

  function registrarVenta(input) {
    var st = migrateLegacy();
    var total = Number(input.monto || input.total) || 0;
    var items = input.items || [];

    items.forEach(function (line) {
      var qty = Number(line.cantidad || line.qty) || 0;
      if (qty <= 0) return;
      addInventarioMovimiento(st, {
        tipo: 'salida_venta',
        refTipo: 'venta',
        refId: input.saleId || input.uuid,
        productoRefTipo: 'producto_pos',
        productoRefId: line.id || line.productId,
        productoNombre: line.nombre || '',
        cantidad: qty,
        unidad: 'und',
        notas: 'Venta POS',
      });
    });

    if (total > 0) {
      enqueuePlanilla(st, {
        origen: 'ventas',
        concepto: input.concepto || 'Ventas del día',
        monto: total,
        tipo_movimiento: 'ingreso',
        referencia_tipo: 'venta',
        referencia_id: input.saleId || input.uuid,
        payload: input,
      });
    }

    save(st);
    emitCostos('crozzo-costos:venta-registrada', input);
    return true;
  }

  function registrarOrdenCompraRecibida(po) {
    if (!po) return null;
    var st = migrateLegacy();
    (po.items || []).forEach(function (line) {
      addInventarioMovimiento(st, {
        tipo: 'entrada_proveedor',
        refTipo: 'orden_compra',
        refId: po.id,
        productoRefTipo: 'producto_pos',
        productoRefId: line.productId,
        productoNombre: line.nombre,
        cantidad: Number(line.qty) || 0,
        unidad: 'und',
        notas: 'OC recibida: ' + po.id,
      });
    });
    var rec = {
      id: uid('rec'),
      fecha: new Date().toISOString().slice(0, 10),
      proveedorId: po.supplierId,
      proveedorNombre: po.supplierName,
      valor: 0,
      notas: 'Recepción automática OC ' + po.id,
      ordenCompraId: po.id,
      items: po.items || [],
      createdAt: new Date().toISOString(),
    };
    st.recepciones.unshift(rec);
    pushSync(st, { tipo: 'insert', tabla: 'recepciones', payload: rec });
    save(st);
    emitCostos('crozzo-costos:recepcion-registrada', { recepcion: rec, origen: 'orden_compra' });
    return rec;
  }

  function getStats() {
    var st = migrateLegacy();
    var totalRec = st.recepciones.reduce(function (s, r) { return s + (Number(r.valor) || 0); }, 0);
    var totalOf = st.facturasOficina.reduce(function (s, f) { return s + (Number(f.valor) || 0); }, 0);
    var pagadas = st.facturasOficina.filter(function (f) { return f.estado === 'pagada'; });
    var pendientes = st.facturasOficina.filter(function (f) { return f.estado === 'pendiente' || f.estado === 'en_proceso'; });
    return {
      proveedores: st.proveedores.length,
      recepciones: st.recepciones.length,
      totalRecepciones: totalRec,
      facturasOficina: st.facturasOficina.length,
      totalOficina: totalOf,
      pagadas: pagadas.length,
      pendientes: pendientes.length,
      cortes: st.cortes.length,
      movimientosInv: st.inventarioMovimientos.length,
      colaPlanilla: st.planillaFeed.filter(function (f) { return f.estado === 'pendiente'; }).length,
      syncPendiente: st.syncQueue.filter(function (q) { return q.estado === 'pendiente'; }).length,
      updatedAt: st.updatedAt,
    };
  }

  function listInventarioMovimientos(limit) {
    return migrateLegacy().inventarioMovimientos.slice(0, limit || 100);
  }

  function listFeed(limit) {
    return migrateLegacy().planillaFeed.slice(0, limit || 100);
  }

  function updateFeedEstado(feedId, estado) {
    var st = migrateLegacy();
    var it = st.planillaFeed.find(function (f) { return f.id === feedId; });
    if (!it) return null;
    it.estado = estado;
    it.revisado_at = new Date().toISOString();
    pushSync(st, { tipo: 'update', tabla: 'crozzo_planilla_feed', payload: it });
    save(st);
    return it;
  }

  function exportSnapshot() {
    return migrateLegacy();
  }

  function fmtCop(n) {
    var x = Number(n);
    if (!isFinite(x)) return '—';
    try {
      return x.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
    } catch (_) {
      return '$' + Math.round(x);
    }
  }

  function renderComprasMpDashboardHtml(opts) {
    opts = opts || {};
    var res = getComprasMpResumen(opts);
    var undLbl = function (und) {
      var u = String(und || 'GR').toUpperCase();
      if (u === 'ML') return 'ml';
      if (u === 'UND' || u === 'UNI') return 'und';
      return 'g';
    };
    if (!res.filas.length) {
      return (
        '<p class="form-hint" style="margin:8px 0 0">Sin compras de materia prima entre ' +
        esc(res.desde) +
        ' y ' +
        esc(res.hasta) +
        '.</p>'
      );
    }
    var top = res.filas.slice(0, 15);
    return (
      '<div class="crozzo-compras-mp-dash" style="margin-top:14px">' +
      '<h3 style="margin:0 0 8px;font-size:1rem">Compras por materia prima</h3>' +
      '<p class="form-hint" style="margin:0 0 10px">Período ' +
      esc(res.desde) +
      ' → ' +
      esc(res.hasta) +
      ' · ' +
      res.totalFilas +
      ' producto(s) · ' +
      fmtCop(res.totalValor) +
      '</p>' +
      '<div class="crozzo-mod-table-scroll"><table class="crozzo-mod-table"><thead><tr>' +
      '<th>Materia prima</th><th>Categoría</th><th style="text-align:right">Cantidad</th><th style="text-align:right">Valor comprado</th><th style="text-align:right"># compras</th>' +
      '</tr></thead><tbody>' +
      top
        .map(function (f) {
          return (
            '<tr><td><strong>' +
            esc(f.nombre) +
            '</strong></td><td>' +
            esc(f.categoria) +
            '</td><td style="text-align:right">' +
            (Math.round(f.cantidad * 100) / 100).toLocaleString('es-CO') +
            ' ' +
            esc(undLbl(f.und)) +
            '</td><td style="text-align:right">' +
            fmtCop(f.valor) +
            '</td><td style="text-align:right">' +
            f.compras +
            '</td></tr>'
          );
        })
        .join('') +
      '</tbody></table></div>' +
      (res.filas.length > 15
        ? '<p class="form-hint" style="margin:8px 0 0">Mostrando top 15 de ' + res.filas.length + '.</p>'
        : '') +
      '</div>'
    );
  }

  function renderDashboardHtml(opts) {
    opts = opts || {};
    var s = getStats();
    var dias = Number(opts.dias) > 0 ? Number(opts.dias) : 30;
    return (
      '<div class="crozzo-reservorio-dash" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:14px">' +
      '<div class="card" style="padding:12px"><div class="form-hint">Proveedores</div><strong style="font-size:1.3rem">' + s.proveedores + '</strong></div>' +
      '<div class="card" style="padding:12px"><div class="form-hint">Recepciones</div><strong style="font-size:1.3rem">' + s.recepciones + '</strong><div style="font-size:.78rem;opacity:.8">' + fmtCop(s.totalRecepciones) + '</div></div>' +
      '<div class="card" style="padding:12px"><div class="form-hint">Oficina pend.</div><strong style="font-size:1.3rem">' + s.pendientes + '</strong></div>' +
      '<div class="card" style="padding:12px"><div class="form-hint">Cola planilla</div><strong style="font-size:1.3rem">' + s.colaPlanilla + '</strong></div>' +
      '<div class="card" style="padding:12px"><div class="form-hint">Sync pendiente</div><strong style="font-size:1.3rem">' + s.syncPendiente + '</strong></div>' +
      '<div class="card" style="padding:12px"><div class="form-hint">Mov. inventario</div><strong style="font-size:1.3rem">' + s.movimientosInv + '</strong></div>' +
      (function () {
        var al = (migrateLegacy().meta && migrateLegacy().meta.alertasPrecio) || [];
        var pend = al.filter(function (a) { return !a.leida && (a.nivel === 'alerta' || a.nivel === 'sube'); }).length;
        if (!pend) return '';
        return '<div class="card" style="padding:12px;border-color:rgba(255,159,10,.4)"><div class="form-hint">Alertas precio</div><strong style="font-size:1.3rem;color:var(--warning)">' + pend + '</strong></div>';
      })() +
      '</div>' +
      '<p class="form-hint" style="margin:0">Reservorio unificado · actualizado ' + esc(s.updatedAt || '') + '</p>' +
      renderComprasMpDashboardHtml({ dias: dias, categoria: opts.categoria, q: opts.q })
    );
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Init migration on load
  migrateLegacy();

  global.CrozzoReservorio = {
    LS: LS,
    load: load,
    save: save,
    migrateLegacy: migrateLegacy,
    listProveedores: listProveedores,
    syncProveedoresBidirectional: syncProveedoresBidirectional,
    listProveedoresOcFormat: listProveedoresOcFormat,
    getProveedor: getProveedor,
    upsertProveedor: upsertProveedor,
    syncProveedoresToConfig: syncProveedoresToConfig,
    listCotizacionesMp: listCotizacionesMp,
    addCotizacionMp: addCotizacionMp,
    removeCotizacionMp: removeCotizacionMp,
    registrarRecepcion: registrarRecepcion,
    getRecepcion: getRecepcion,
    listRecepciones: listRecepciones,
    eliminarRecepcion: eliminarRecepcion,
    actualizarRecepcion: actualizarRecepcion,
    listAlertasPrecio: listAlertasPrecio,
    pushAlertaPrecio: function (alerta) {
      var st = migrateLegacy();
      var row = pushAlertaPrecio(st, alerta);
      save(st);
      return row;
    },
    registrarOficina: registrarOficina,
    actualizarEstadoOficina: actualizarEstadoOficina,
    registrarProceso: registrarProceso,
    registrarVenta: registrarVenta,
    registrarOrdenCompraRecibida: registrarOrdenCompraRecibida,
    addInventarioMovimiento: function (mov) {
      var st = migrateLegacy();
      var row = addInventarioMovimiento(st, mov);
      save(st);
      return row;
    },
    getStats: getStats,
    listInventarioMovimientos: listInventarioMovimientos,
    upsertMatrizMp: upsertMatrizMp,
    listMatrizMp: listMatrizMp,
    listCatalogoMp: function (limit) {
      return migrateLegacy().catalogoMp.slice(0, limit || 500);
    },
    listFeed: listFeed,
    updateFeedEstado: updateFeedEstado,
    exportSnapshot: exportSnapshot,
    renderDashboardHtml: renderDashboardHtml,
    getComprasMpResumen: getComprasMpResumen,
    renderComprasMpDashboardHtml: renderComprasMpDashboardHtml,
    fmtCop: fmtCop,
    getHealth: getHealth,
    getStorageSummary: getStorageSummary,
    sanitizeAdjuntos: sanitizeAdjuntos,
    retentionDays: function () {
      return RETENTION_DAYS;
    },
    repairIfNeeded: repairIfNeeded,
    runBlobMigration: runBlobMigration,
    flushBackup: flushBackup,
  };

  global.crozzoReservorioRegistrarVenta = registrarVenta;
  global.crozzoReservorioUpsertProveedor = upsertProveedor;
})(typeof window !== 'undefined' ? window : globalThis);



/* --- CrozzoReservorioOffline.js --- */

/**
 * Crozzo POS — Guardián offline: conectividad, modo local seguro, salud del reservorio.
 */
(function (global) {
  'use strict';

  var state = { online: true, lastCheck: null };

  function isBrowserOnline() {
    try {
      return global.navigator ? global.navigator.onLine !== false : true;
    } catch (_) {
      return true;
    }
  }

  function hasCloudConfig() {
    try {
      return typeof global.crozzoOnlineConfigReady === 'function' && global.crozzoOnlineConfigReady();
    } catch (_) {
      return false;
    }
  }

  function runtimePrefersOffline() {
    try {
      if (global.config && global.config.get) {
        var m = global.config.get('runtimeSyncModo');
        if (m === 'offline') return true;
      }
    } catch (_) {}
    return false;
  }

  /** Nube solo si hay config, navegador online y preferencia no es offline puro */
  function shouldUseCloud() {
    if (runtimePrefersOffline()) return false;
    if (!isBrowserOnline()) return false;
    if (!hasCloudConfig()) return false;
    return true;
  }

  function modeInfo() {
    if (shouldUseCloud()) {
      return { mode: 'cloud', label: 'Nube activa', icon: '☁️', secure: true };
    }
    if (hasCloudConfig() && !isBrowserOnline()) {
      return { mode: 'offline-local', label: 'Sin internet — local seguro', icon: '🔒', secure: true };
    }
    if (runtimePrefersOffline()) {
      return { mode: 'offline-pref', label: 'Modo offline (preferencia)', icon: '💾', secure: true };
    }
    return { mode: 'local', label: 'Modo local — datos en este equipo', icon: '💾', secure: true };
  }

  function refreshConnectivity() {
    state.online = isBrowserOnline();
    state.lastCheck = new Date().toISOString();
    try {
      document.dispatchEvent(
        new CustomEvent('crozzo-connectivity-changed', {
          detail: { online: state.online, mode: modeInfo() },
        })
      );
    } catch (_) {}
    return state.online;
  }

  function onOffline() {
    refreshConnectivity();
    try {
      if (typeof global.showToast === 'function') {
        global.showToast('Sin internet — operando en modo local seguro (reservorio)', 'info');
      }
    } catch (_) {}
  }

  function onOnline() {
    refreshConnectivity();
    try {
      if (typeof global.showToast === 'function') {
        global.showToast('Conexión restablecida', 'success');
      }
    } catch (_) {}
  }

  function ensureReservorioReady() {
    var R = global.CrozzoReservorio;
    if (!R) return false;
    try {
      if (R.repairIfNeeded) R.repairIfNeeded();
      else if (R.migrateLegacy) R.migrateLegacy();
      if (R.syncProveedoresToConfig) R.syncProveedoresToConfig();
    } catch (e) {
      console.warn('[offline] reservorio init', e);
    }
    return true;
  }

  function getHealth() {
    var R = global.CrozzoReservorio;
    var base = R && R.getHealth ? R.getHealth() : { ok: !!R };
    var mi = modeInfo();
    return Object.assign({}, base, {
      connectivity: mi,
      browserOnline: isBrowserOnline(),
      cloudConfigured: hasCloudConfig(),
      shouldUseCloud: shouldUseCloud(),
      lastConnectivityCheck: state.lastCheck,
    });
  }

  function statusBarHtml(prefix) {
    prefix = prefix || '';
    var mi = modeInfo();
    var R = global.CrozzoReservorio;
    var h = R && R.getHealth ? R.getHealth() : {};
    var backup = h.hasBackup ? ' · copia de seguridad OK' : '';
    var recovered = h.recoveredFromBackup ? ' · <span style="color:#f59e0b">recuperado de backup</span>' : '';
    return (
      prefix +
      '<div class="crozzo-hub-status crozzo-offline-status" id="crozzo-hub-status" style="padding:6px 14px;font-size:11px;border-bottom:1px solid var(--border);background:var(--bg-card);color:var(--text-muted)">' +
      '<span>' +
      mi.icon +
      ' <strong style="color:var(--text-primary)">' +
      mi.label +
      '</strong>' +
      backup +
      recovered +
      '</span></div>'
    );
  }

  function exportBackupFile() {
    var R = global.CrozzoReservorio;
    if (!R || !R.exportSnapshot) return false;
    try {
      var snap = R.exportSnapshot();
      var name = 'crozzo-reservorio-' + new Date().toISOString().slice(0, 10) + '.json';
      var blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
      return true;
    } catch (e) {
      console.warn('[offline] export', e);
      return false;
    }
  }

  function init() {
    if (global.__crozzoOfflineInited) return;
    global.__crozzoOfflineInited = true;
    state.online = isBrowserOnline();
    ensureReservorioReady();
    global.addEventListener('online', onOnline);
    global.addEventListener('offline', onOffline);
    global.addEventListener('beforeunload', function () {
      try {
        if (global.CrozzoReservorio && global.CrozzoReservorio.flushBackup) global.CrozzoReservorio.flushBackup();
      } catch (_) {}
    });
    setInterval(function () {
      ensureReservorioReady();
    }, 120000);
  }

  global.crozzoShouldUseCloud = shouldUseCloud;
  global.crozzoIsBrowserOnline = isBrowserOnline;
  global.CrozzoReservorioOffline = {
    init: init,
    shouldUseCloud: shouldUseCloud,
    isBrowserOnline: isBrowserOnline,
    hasCloudConfig: hasCloudConfig,
    modeInfo: modeInfo,
    getHealth: getHealth,
    statusBarHtml: statusBarHtml,
    exportBackupFile: exportBackupFile,
    ensureReservorioReady: ensureReservorioReady,
    refreshConnectivity: refreshConnectivity,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);

