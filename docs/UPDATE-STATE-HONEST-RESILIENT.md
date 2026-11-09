# Estado de actualización honesto y resiliente

> Para `Crozzo POS` (Tauri/WebView + PWA). Problema actual: `localStorage` decide si la app está actualizada y puede quedar "phantom" tras fallo/cierre abrupto. Esta guía define el patrón recomendado.

## 1. Diagnóstico del fallo actual

En `app/infra/CrozzoSystemUpdates.js`:

- `VERSION` se carga desde meta/localStorage y `markEntryFullyApplied()` (línea ~698) **avanza `VERSION` al remoto aunque el binario no haya cambiado**.
- `isEntryApplied()` (línea ~862) usa `VERSION` (derivado de localStorage) como autoridad. Si `stored > binary`, la app cree que ya está actualizada.
- `reconcileAppliedEntriesForVersion()` (línea ~878) marca todo `≤ VERSION` como aplicado, propagando el estado fantasma.
- `_installInProgress` y `_criticalInstallState` viven solo en memoria: un cierre abrupto los pierde y deja la instalación a medias sin reintento.
- `loadAppliedEntryIds()` parsea JSON sin validar esquema; un JSON corrupto se ignora silenciosamente, pero un JSON válido con ids inventados persiste.

**Consecuencia:** tras un fallo, la app no vuelve a ofrecer la actualización hasta "Restablecer avisos".

## 2. Principios

1. **El binario manda.** La versión instalada real es la del ejecutable/APK/HTML servido. `localStorage` es caché derivado, nunca autoridad.
2. **Separar conceptos:** `installedVersion` (binario) ≠ `appliedEntryIds` (OTA) ≠ `pendingRestart` (instalado, falta reinicio) ≠ `queue` (intentos).
3. **No avanzar estado sin evidencia.** Marcar "aplicada" solo después de verificar binario ≥ target (o build stamp en web).
4. **Idempotencia.** Re-ejecutar detección/instalación no duplica ni corrompe.
5. **Persistencia durable de intentos.** La cola de reintentos sobrevive cierre/reinicio con backoff.
6. **Autolimpieza.** Estado corrupto se detecta, respalda y se reconstruye desde el binario.
7. **Recuperación determinista al arranque.** Un único `recover()` reconcilia todo.

## 3. Fuente de verdad: versión instalada

```
getInstalledVersion():
  1. Tauri: invoke('plugin:app|version')  (timeout 2s)
  2. si falla: meta[name="crozzo-app-version"]
  3. si falla: localStorage (confianza LOW)
  4. si localStorage > binario real → descartar localStorage, log 'phantom_state_corrected'
  5. guardar { version, source, confidence, verifiedAt, buildStamp }
```

Regla: **nunca** usar `VERSION` de memoria como autoridad en `isEntryApplied`. Siempre leer `installed.version`.

## 4. Esquema de datos

Un solo store `crozzo_update_store_v2` (JSON) reemplaza las claves sueltas. Mantener lectura legacy solo para migración.

```json
{
  "schemaVersion": 2,
  "installed": {
    "version": "v1.0.274",
    "source": "binary | meta | stored",
    "confidence": "high | medium | low",
    "verifiedAt": 1731100000000,
    "buildStamp": "2026-11-09T..."
  },
  "appliedEntries": ["1.0.274-critical", "1.0.273-optional"],
  "pendingRestart": {
    "entryId": "1.0.275-critical",
    "version": "v1.0.275",
    "critical": true,
    "url": "https://...setup.exe",
    "savedAt": 1731100000000,
    "attempt": 1
  },
  "queue": [
    {
      "id": "q_1731100000000_1",
      "entryId": "1.0.275-critical",
      "plan": "A | C",
      "priority": 0,
      "status": "queued | downloading | installing | awaiting_restart | failed | abandoned",
      "attempt": 1,
      "nextRetryAt": 1731100060000,
      "lastError": "",
      "createdAt": 1731100000000,
      "updatedAt": 1731100000000,
      "heartbeatAt": 1731100000000
    }
  ],
  "snooze": { "1.0.274-optional": 1731186400000 },
  "dismissed": { "optional": ["1.0.272-optional"], "criticalAck": ["1.0.270-critical"] },
  "lastCheck": { "at": 1731100000000, "ok": true, "error": "" },
  "lease": { "owner": "boot", "expiresAt": 1731100120000 } | null
}
```

Claves legacy a migrar una sola vez: `crozzo_app_installed_version`, `crozzo_update_state`, `crozzo_update_applied_entry_ids`, `crozzo_update_pending_restart`, `crozzo_update_snooze_until`.

## 5. Sanitización (limpieza de estado corrupto)

`sanitizeStore(raw)`:

- Si `JSON.parse` falla → respaldar en `crozzo_update_store_corrupt_<ts>` y retornar store vacío.
- Validar `schemaVersion`; si no coincide → migrar o reset.
- Validar `installed.version` con `parseSemver`; si inválido → null.
- Si `installed.source === 'stored'` y `installed.version > binaryReal` → corregir a binaryReal, confidence high, log.
- Filtrar `appliedEntries` a strings; quitar ids que no sean string.
- Filtrar `queue` a objetos válidos con status conocido; descartar el resto.
- `snooze`/`dismissed`: solo objetos/arrays.
- Si `localStorage.setItem` lanza (cuota) → log y mantener en memoria; reintentar en próximo ciclo.

Ejecutar `sanitizeStore` en cada lectura y antes de cada decisión.

## 6. Idempotencia

- `markEntryFullyApplied(entry)`:
  - Si `entryId` ya está en `appliedEntries` **y** `installed.version ≥ entry.version` (con build stamp coincidente en web) → no-op.
  - Si no, verificar binario ≥ target; solo entonces mutar.
- `enqueue(entry, plan)`:
  - Si ya hay item activo (`queued/downloading/installing/awaiting_restart`) con mismo `entryId` → actualizar `plan/priority`, no duplicar.
  - Si existe `failed` con mismo entryId y no venció backoff → no reencolar; actualizar `nextRetryAt` solo si es más temprano.
- Descarga: nombre de archivo determinista `crozzo-<version>-<sha256>.tmp`; si existe y valida, saltar descarga.
- Instalador silencioso: reinstalar misma versión es seguro (NSIS `/S` idempotente).

## 7. Cola persistente con backoff

```
backoff(attempt): min(6h, 60s * 2^(attempt-1)) * (0.8..1.2 jitter)
```

Estados de item: `queued → downloading → installing → awaiting_restart → done | failed → (retry) → abandoned`.

Reglas:
- `attempt` incrementa solo en `failed`.
- Máximo 10 intentos → `abandoned` (requiere acción manual / "Restablecer avisos").
- Procesador se ejecuta: al arranque, on `online`, cada 5 min, y tras cerrar venta (evento POS idle).
- Concurrencia: un solo worker por `lease` con TTL 2 min. Si el lease expira, otro worker toma el relevo.

## 8. Recuperación tras reinicio / cierre abrupto

`recover()` al arranque (orden estricto):

1. `sanitizeStore()`.
2. `migrateLegacy()` si `schemaVersion < 2`.
3. `refreshInstalled()` (binario primero) → actualizar `installed`.
4. Procesar `pendingRestart`:
   - Si `installed.version ≥ pending.version`:
     - `markEntryFullyApplied(pending.entryId)` (idempotente)
     - `clear pendingRestart`
     - disparar cloud sync.
   - Si `installed.version < pending.version`:
     - mantener `pendingRestart`, encolar instalación con `priority 0` y `attempt` preservado.
   - Si `pending` es inválido/corrupto → descartar + log.
5. Resetear leases expirados; items `downloading/installing` con heartbeat viejo (>3 min) → `queued` con mismo attempt.
6. `reconcileApplied()`:
   - Para cada entry del registry:
     - si `installed.version ≥ entry.version` y build stamp coincide (o web sin stamp) → asegurar en `appliedEntries`.
     - si `installed.version < entry.version` → quitar de `appliedEntries` (evita fantasma).
7. `pruneQueue()` (quitar `done` > 7 días, `abandoned` viejos).
8. `processQueue()`.

## 9. Flujo de instalación (con persistencia)

```
install(entry):
  1. enqueue(entry, plan)  // idempotente
  2. worker adquiere lease
  3. status=downloading; heartbeat cada 5s
  4. descargar a temp determinista; verificar tamaño ≥ MIN; (opcional hash)
  5. status=installing; save pendingRestart {entryId, version, critical, url, savedAt, attempt}
  6. invocar instalador (Plan A → C)
  7. si éxito: status=awaiting_restart; NO marcar applied aún
  8. si fallo: status=failed; attempt++; nextRetryAt=backoff; release lease; log
  9. tras reinicio, recover() hace el commit (paso 4 de recover)
```

Clave: **el commit (mark applied) ocurre en el arranque siguiente**, cuando el binario ya refleja la nueva versión. Esto elimina el "avanzar VERSION sin evidencia".

## 10. Código de referencia (JS, estilo actual)

```js
var STORE_KEY = 'crozzo_update_store_v2';
var SCHEMA_VERSION = 2;

function loadStore() {
  var empty = { schemaVersion: SCHEMA_VERSION, installed: null, appliedEntries: [],
    pendingRestart: null, queue: [], snooze: {}, dismissed: { optional: [], criticalAck: [] },
    lastCheck: null, lease: null };
  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (!raw) return migrateLegacy() || empty;
    var parsed = JSON.parse(raw);
    return sanitizeStore(parsed) || empty;
  } catch (e) {
    try { localStorage.setItem(STORE_KEY + '_corrupt_' + Date.now(), raw); } catch (_) {}
    return empty;
  }
}

function saveStore(store) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); }
  catch (e) { console.warn('[updates] saveStore failed', e); /* keep in memory */ }
}

function sanitizeStore(s) {
  if (!s || typeof s !== 'object') return null;
  var out = loadStore.__empty || null; // placeholder
  // ...validaciones por campo...
  return out;
}

async function refreshInstalled() {
  var binary = await fetchTauriBinaryVersion(); // timeout 2s
  var meta = readMetaBuildVersion();
  var stored = readStoredInstalledVersion();
  var ver, source, confidence;
  if (binary) { ver = binary; source = 'binary'; confidence = 'high'; }
  else if (meta) { ver = meta; source = 'meta'; confidence = 'medium'; }
  else { ver = stored || 'v1.0.0'; source = 'stored'; confidence = 'low'; }
  if (stored && binary && compareSemver(stored, binary) > 0) {
    console.warn('[updates] phantom state corrected', stored, '->', binary);
  }
  var store = loadStore();
  store.installed = { version: ver, source: source, confidence: confidence,
    verifiedAt: Date.now(), buildStamp: readMetaBuildStamp() };
  saveStore(store);
  return ver;
}

function isEntryApplied(entry) {
  var store = loadStore();
  var installed = (store.installed && store.installed.version) || 'v1.0.0';
  var remote = normEntryVersion(entry);
  if (compareSemver(installed, remote) < 0) return false;
  if (compareSemver(installed, remote) > 0) return true;
  // misma semver: build stamp
  var local = readMetaBuildStamp();
  var remoteStamp = entryBuildStamp(entry);
  if (!local || !remoteStamp) return false; // desconocido, no forzar
  return local === remoteStamp;
}

function enqueue(entry, plan) {
  var store = loadStore();
  var eid = entryId(entry);
  var existing = store.queue.find(function (q) {
    return q.entryId === eid && ['queued','downloading','installing','awaiting_restart','failed'].indexOf(q.status) >= 0;
  });
  if (existing) {
    existing.plan = plan || existing.plan;
    existing.priority = Math.min(existing.priority, 0);
    existing.updatedAt = Date.now();
    saveStore(store);
    return existing.id;
  }
  var item = {
    id: 'q_' + Date.now() + '_' + Math.floor(Math.random()*1000),
    entryId: eid, plan: plan || 'A', priority: 0, status: 'queued',
    attempt: 1, nextRetryAt: Date.now(), lastError: '',
    createdAt: Date.now(), updatedAt: Date.now(), heartbeatAt: Date.now()
  };
  store.queue.push(item);
  saveStore(store);
  return item.id;
}

function backoffMs(attempt) {
  var base = 60000 * Math.pow(2, Math.max(0, attempt - 1));
  var capped = Math.min(base, 6 * 3600000);
  var jitter = 0.8 + Math.random() * 0.4;
  return Math.round(capped * jitter);
}
```

## 11. Observabilidad

- Log estructurado en `crozzo_update_local_log`: `{ at, action, entryId, version, from, to, error }`.
- Acciones a registrar: `phantom_state_corrected`, `store_sanitized`, `store_reset`, `enqueue`, `retry_scheduled`, `install_failed`, `commit_after_restart`, `lease_taken`, `lease_expired_reset`.
- Contadores por plan (A/C) de éxitos/fallos para detectar degradación.
- Exponer `crozzoUpdateDumpState()` para soporte (ya sugerido en plan de verificación).

## 12. Criterios de aceptación

1. Tras cierre abrupto a mitad de descarga, al reabrir la app reintenta automáticamente con backoff y no queda "ya actualizada".
2. `stored > binary` se corrige en el primer arranque y se registra `phantom_state_corrected`.
3. Una actualización marcada aplicada solo si el binario real ≥ target (verificado en arranque post-reinicio).
4. JSON corrupto en store → respaldo + reset, app arranca normal.
5. Re-ejecutar "Comprobar ahora" 5 veces no duplica entradas en la cola.
6. Máximo 10 intentos fallidos → `abandoned`, visible en UI con botón manual.

## 13. Checklist de implementación

- [ ] Crear `crozzo_update_store_v2` y `sanitizeStore` + `migrateLegacy`.
- [ ] Reemplazar lecturas de `VERSION` global por `store.installed.version` en `isEntryApplied`, `entryIsPending`, `reconcileAppliedEntriesForVersion`.
- [ ] Mover `_installInProgress` a `store.lease` con TTL.
- [ ] Implementar `recover()` y llamarlo en `runBootUpdatePipeline()` antes de cualquier detección.
- [ ] Implementar `enqueue`/`processQueue` con backoff y heartbeat.
- [ ] Mover commit de applied a post-reinicio (en `recover`, paso 4).
- [ ] Añadir tests unitarios para `sanitizeStore`, `isEntryApplied`, `backoffMs`, `recover` (con binario mockeado).
- [ ] Mantener claves legacy en modo solo-lectura 2 releases para migración segura.

---

**Referencias en el repo:**
- `app/infra/CrozzoSystemUpdates.js`: `refreshBinaryVersion` (:659), `markEntryFullyApplied` (:698), `isEntryApplied` (:862), `reconcileAppliedEntriesForVersion` (:878), `loadUpdateState` (:2034).
- `docs/PLAN-VERIFICACION-ACTUALIZACIONES.md`: causas raíz A-H y acciones P0-P5.