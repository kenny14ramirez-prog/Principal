# Plan de Fortaleza — Sistema de Actualizaciones Bona Origen

> **Objetivo:** Que el sistema de actualizaciones sea un pilar que **jamás falle**, sin importar red, estado corrupto, cierre abrupto, o fallo parcial.
> **Filosofía:** Defensa en profundidad. Cada capa protege a la siguiente. Si una falla, la siguiente detecta y recupera.
> **Estado:** Plan reforzado + implementación P0.

---

## 0. Mapa de amenazas (qué puede fallar y dónde)

### Amenazas por capa

| Capa | Amenaza | Impacto | Probabilidad | Mitigación |
|------|---------|---------|--------------|------------|
| **Red** | Sin internet | No descarga | Alta | Caché local + reintento automático |
| **Red** | GitHub rate limit / CORS | fetch falla | Media | Fetch Rust primario + fallback JS |
| **Red** | DNS bloqueado | fetch falla | Baja | Fallback a endpoint alternativo |
| **Red** | Timeout parcial | descarga incompleta | Media | Verificación de tamaño + reanudación |
| **Estado** | localStorage corrupto | app no arranca o estado fantasma | Media | Sanitización + respaldo + reset |
| **Estado** | stored > binary (phantom) | no ofrece update | Alta | Binario manda siempre |
| **Estado** | JSON inválido en store | pérdida de estado | Baja | Sanitización + respaldo |
| **Estado** | Cuota localStorage excedida | no guarda estado | Baja | Fallback en memoria + reintento |
| **Instalación** | Descarga incompleta | instala corrupto | Media | Verificación tamaño + hash |
| **Instalación** | Firma no coincide | instalación falla | Media | Plan C fallback + mensaje claro |
| **Instalación** | Espacio insuficiente | instalación falla | Baja | Preflight check de espacio |
| **Instalación** | Antivirus bloquea | instalación falla | Media | Reintento + instrucciones |
| **Instalación** | Usuario cierra a mitad | instalación a medias | Media | Persistencia + recuperación al arranque |
| **Post-install** | Nueva versión no arranca | app inutilizable | Baja | Rollback automático |
| **Post-install** | Build stamp no cambia | bucle de update | Media | Verificación por binario, no stamp |
| **Concurrencia** | Dos updates simultáneos | estado corrupto | Baja | Lease con TTL |
| **Concurrencia** | Timer en memoria se pierde | no reintenta | Media | Persistencia de intentos en disco |
| **UI** | Botones no se conectan | usuario no puede actualizar | Media | Delegación de eventos |
| **UI** | Estado atascado en memoria | no ofrece update | Media | Sanitización + reset automático |
| **Publicación** | Release no listo | 404 en descarga | Media | Espera con reintento + mensaje claro |
| **Publicación** | latest.json apunta a MSI | updater falla | Baja | Verificación en CI |
| **Publicación** | Clave de firma incorrecta | signature mismatch | Baja | Verificación en CI + Plan C fallback |

### Modos de fallo compuestos (los más peligrosos)

1. **Phantom + cierre abrupto:** stored > binary → app cree que está actualizada → no ofrece update → usuario nunca actualiza.
2. **Descarga parcial + commit prematuro:** descarga incompleta pero se marca como aplicada → app reinicia con versión vieja → bucle infinito.
3. **Lease expirado sin reset:** instalación falla → lease no se libera → ningún otro worker puede tomar el relevo → update bloqueado para siempre.
4. **Timer en memoria + reinicio:** reintento programado en 2 min → usuario reinicia → timer perdido → update nunca se reintenta.
5. **Build stamp cacheado:** HTML viejo en caché del navegador → stamp local no cambia → isEntryApplied devuelve false → bucle de "pendiente".

---

## 1. Arquitectura de fortaleza (defensa en profundidad)

```
┌─────────────────────────────────────────────────────────────┐
│  CAPA 1: FUENTE DE VERDAD (Binario)                         │
│  - plugin:app|version (Tauri) / meta tag (web) / PackageManager (Android) │
│  - Si falla → meta → stored (con confianza LOW)             │
│  - Si stored > binary → descartar stored, log phantom       │
├─────────────────────────────────────────────────────────────┤
│  CAPA 2: SANITIZACIÓN (Estado)                              │
│  - sanitizeStore() en cada lectura                          │
│  - JSON corrupto → respaldo + reset                         │
│  - Validación de esquema por campo                          │
│  - Migración automática de legacy                           │
├─────────────────────────────────────────────────────────────┤
│  CAPA 3: RECUPERACIÓN (Arranque)                            │
│  - recover() determinista al arranque                       │
│  - Procesar pendingRestart (commit si binario ≥ target)     │
│  - Resetear leases expirados                                 │
│  - Reconciliar applied (añadir/quitar según binario)         │
│  - Reencolar instalaciones incompletas                      │
├─────────────────────────────────────────────────────────────┤
│  CAPA 4: COLA PERSISTENTE (Reintentos)                      │
│  - Persistida en disco con backoff exponencial + jitter      │
│  - Lease con TTL (no en memoria)                            │
│  - Máximo 10 intentos → abandoned                           │
│  - Heartbeat cada 5s para detectar worker muerto            │
├─────────────────────────────────────────────────────────────┤
│  CAPA 5: INSTALACIÓN (Transaccional)                        │
│  - Descarga a archivo determinista (idempotente)            │
│  - Verificación de tamaño mínimo                            │
│  - Verificación de firma/hash (cuando disponible)            │
│  - pendingRestart guardado ANTES de invocar instalador       │
│  - Commit de applied SOLO en arranque post-reinicio         │
├─────────────────────────────────────────────────────────────┤
│  CAPA 6: UI (Resiliente)                                    │
│  - Delegación de eventos (no se pierden botones)            │
│  - Estado visible (versión actual, disponible, último error) │
│  - "Restablecer avisos" siempre accesible                   │
│  - No bloquear UI por update (async)                        │
├─────────────────────────────────────────────────────────────┤
│  CAPA 7: MONITOREO (Observabilidad)                         │
│  - Log estructurado con acciones y errores                   │
│  - Contadores por plan (A/C) de éxitos/fallos               │
│  - Dump de estado para soporte (crozzoUpdateDumpState)       │
│  - Telemetría remota (futuro)                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Salvaguardas por capa (implementación)

### 2.1 Fuente de verdad: versión instalada

```javascript
// REGLA: nunca usar VERSION global como autoridad
function getInstalledVersion() {
  // 1. Tauri (alta confianza)
  // 2. Meta tag (media confianza)
  // 3. localStorage (baja confianza)
  // 4. Si stored > binary → descartar stored
  // 5. Guardar { version, source, confidence, verifiedAt, buildStamp }
}
```

**Salvaguarda:** Si `fetchTauriBinaryVersion()` devuelve null (invoke falla), se usa meta tag. Si meta tag también falla, se usa stored pero con confianza LOW. En el siguiente arranque se reintenta.

### 2.2 Sanitización

```javascript
function sanitizeStore(raw) {
  // 1. JSON.parse falla → respaldar + reset
  // 2. Validar schemaVersion
  // 3. Validar installed.version con parseSemver
  // 4. Si stored > binary → corregir
  // 5. Filtrar appliedEntries a strings
  // 6. Filtrar queue a objetos válidos
  // 7. snooze/dismissed: solo objetos/arrays
  // 8. Si setItem lanza → log + mantener en memoria
}
```

**Salvaguarda:** Ejecutar en cada lectura. Si falla, respaldar y resetear.

### 2.3 Recuperación al arranque

```javascript
function recover() {
  // 1. sanitizeStore()
  // 2. migrateLegacy() si schemaVersion < 2
  // 3. refreshInstalled() (binario primero)
  // 4. Procesar pendingRestart:
  //    - Si installed ≥ pending → commit + clear
  //    - Si installed < pending → reencolar
  //    - Si inválido → descartar + log
  // 5. Resetear leases expirados
  // 6. Items downloading/installing con heartbeat viejo (>3 min) → queued
  // 7. reconcileApplied() (añadir/quitar según binario)
  // 8. pruneQueue()
  // 9. processQueue()
}
```

**Salvaguarda:** Orden estricto. Cada paso es idempotente.

### 2.4 Cola persistente

```javascript
// Backoff: min(6h, 60s * 2^(attempt-1)) * (0.8..1.2 jitter)
// Estados: queued → downloading → installing → awaiting_restart → done | failed → retry → abandoned
// Máximo 10 intentos → abandoned
// Procesador: arranque, online, cada 5 min, evento POS idle
// Concurrencia: lease con TTL 2 min
```

**Salvaguarda:** Si el lease expira, otro worker toma el relevo. Si un item tiene heartbeat viejo, se reencola.

### 2.5 Instalación transaccional

```
install(entry):
  1. enqueue(entry, plan)  // idempotente
  2. worker adquiere lease
  3. status=downloading; heartbeat cada 5s
  4. descargar a temp determinista; verificar tamaño ≥ MIN
  5. status=installing; save pendingRestart {entryId, version, critical, url, savedAt, attempt}
  6. invocar instalador (Plan A → C)
  7. si éxito: status=awaiting_restart; NO marcar applied aún
  8. si fallo: status=failed; attempt++; nextRetryAt=backoff; release lease; log
  9. tras reinicio, recover() hace el commit
```

**Salvaguarda:** El commit (mark applied) ocurre en el arranque siguiente, cuando el binario ya refleja la nueva versión.

### 2.6 UI resiliente

- Delegación de eventos en `document` (no se pierden botones).
- Estado visible: versión actual, disponible, último chequeo, último error.
- "Restablecer avisos" siempre accesible.
- No bloquear UI por update (async).

**Salvaguarda:** Si `initActualizacionesSistema` se llama múltiples veces, los botones no se duplican ni se pierden.

---

## 3. Validaciones y pruebas

### 3.1 Validaciones en publicación (CI)

```yaml
# .github/workflows/tauri-release.yml
- Verificar que latest.json apunta a setup.exe (no MSI)
- Verificar que la firma coincide con pubkey de tauri.conf.json
- Verificar que version en tauri.conf.json == tag
- Verificar que registry.json tiene IDs únicos y versiones monótonas
```

### 3.2 Tests unitarios (Node)

```javascript
// tests/updates.test.mjs
describe('compareSemver', () => { ... });
describe('sanitizeStore', () => { ... });
describe('isEntryApplied', () => { ... });
describe('backoffMs', () => { ... });
describe('recover', () => { ... });
```

### 3.3 Tests de integración (Playwright)

```javascript
// tests/e2e/updates.spec.mjs
test('detecta update disponible', async ({ page }) => { ... });
test('instala update crítico', async ({ page }) => { ... });
test('recupera tras cierre abrupto', async ({ page }) => { ... });
test('reset de avisos recupera detección', async ({ page }) => { ... });
```

### 3.4 Tests de caos (manual)

1. Cortar red a mitad de descarga → verificar reintento.
2. Cerrar app a mitad de instalación → verificar recuperación.
3. Corromper localStorage → verificar sanitización.
4. Simular stored > binary → verificar corrección phantom.
5. Ejecutar "Comprobar ahora" 5 veces → verificar no duplica cola.

---

## 4. Monitoreo y alertas

### 4.1 Log estructurado

```javascript
// Cada acción se registra con:
{ at, action, entryId, version, from, to, error, plan, attempt }
```

**Acciones a registrar:**
- `phantom_state_corrected`
- `store_sanitized`
- `store_reset`
- `enqueue`
- `retry_scheduled`
- `install_failed`
- `commit_after_restart`
- `lease_taken`
- `lease_expired_reset`
- `abandoned`

### 4.2 Contadores por plan

```javascript
// Contadores en localStorage:
{ planA: { success: 0, fail: 0 }, planC: { success: 0, fail: 0 } }
```

**Alerta si:** ratio de fallo > 20% en cualquier plan.

### 4.3 Dump de estado para soporte

```javascript
window.crozzoUpdateDumpState = function() {
  return {
    version: VERSION,
    store: loadStore(),
    registry: _registryEntries,
    criticalState: _criticalInstallState,
    installInProgress: _installInProgress,
    pendingCritical: _pendingCriticalEntry,
    currentCritical: _currentCriticalId,
    currentOptional: _currentOptionalId,
    planCounters: loadPlanCounters(),
    lastCheck: loadStore().lastCheck
  };
};
```

### 4.4 Telemetría remota (futuro)

- Reportar a Supabase: versión instalada, disponible, resultado de cada intento.
- Dashboard de adopción para saber qué porcentaje ya actualizó.

---

## 5. Plan de implementación (ordenado por impacto)

### Fase 1 — Estado honesto (P0, 1–2 días)

**Cambios en `CrozzoSystemUpdates.js`:**

1. Crear `crozzo_update_store_v2` con esquema completo.
2. Implementar `sanitizeStore()` + `migrateLegacy()`.
3. Reemplazar `VERSION` global por `store.installed.version` en `isEntryApplied`, `entryIsPending`, `reconcileAppliedEntriesForVersion`.
4. Mover `_installInProgress` a `store.lease` con TTL.
5. Implementar `refreshInstalled()` (binario primero).
6. Implementar `recover()` y llamarlo en `runBootUpdatePipeline()` antes de cualquier detección.

**Cambios en `CrozzoTauriUpdater.js`:**

7. Añadir `crozzoUpdateDumpState()` a la API global.

**Verificación:**
- [ ] `stored > binary` se corrige en el primer arranque.
- [ ] JSON corrupto → respaldo + reset, app arranca normal.
- [ ] Re-ejecutar "Comprobar ahora" 5 veces no duplica entradas.

### Fase 2 — Cola persistente (P1, 2–3 días)

**Cambios en `CrozzoSystemUpdates.js`:**

1. Implementar `enqueue()` + `processQueue()` con backoff.
2. Implementar `backoffMs()` con jitter.
3. Implementar heartbeat en items de cola.
4. Mover commit de applied a post-reinicio (en `recover`, paso 4).
5. Implementar `pruneQueue()`.

**Verificación:**
- [ ] Tras cierre abrupto a mitad de descarga, al reabrir la app reintenta automáticamente.
- [ ] Máximo 10 intentos fallidos → `abandoned`, visible en UI.
- [ ] Lease expirado → otro worker toma el relevo.

### Fase 3 — Verificación y rollback (P1, 3–5 días)

**Cambios en `CrozzoTauriUpdater.js`:**

1. Añadir verificación de hash SHA-256 post-descarga.
2. Implementar backup de versión anterior (PC).
3. Implementar health-check post-arranque.
4. Implementar rollback automático si health-check falla.

**Cambios en `CrozzoSystemUpdates.js`:**

5. Añadir `rolloutPercent` al registry (preparar para Fase 4).

**Verificación:**
- [ ] Descarga corrupta → no instala, reintenta.
- [ ] Nueva versión no arranca → rollback automático.
- [ ] Firma no coincide → Plan C fallback.

### Fase 4 — Staged rollout (P2, 3–4 días)

**Cambios en registry:**

1. Añadir campos `rollout`, `telemetryTag`, `abortPolicy` a cada entry.
2. Implementar cálculo de bucket por cliente (hash determinista).

**Cambios en `CrozzoSystemUpdates.js`:**

3. Implementar `isEligibleForRollout(entry, clientId)`.
4. Implementar kill switch (globalDisable, disabledEntryIds).

**Verificación:**
- [ ] Cliente en bucket < percentage → elegible.
- [ ] Cliente en bucket ≥ percentage → no elegible.
- [ ] Kill switch activo → ningún cliente actualiza.

### Fase 5 — Telemetría (P2, 3–4 días)

**Cambios:**

1. Crear tabla `bona_update_telemetry` en Supabase.
2. Implementar cola de eventos en cliente.
3. Implementar flush batched con backoff.
4. Crear dashboard mínimo (vistas SQL).

**Verificación:**
- [ ] Eventos se reportan correctamente.
- [ ] Dashboard muestra adopción y salud.

### Fase 6 — Pruebas automatizadas (P3, 2–3 días)

**Cambios:**

1. Añadir tests unitarios (Node).
2. Añadir tests de integración (Playwright).
3. Añadir validación de registry en CI.

**Verificación:**
- [ ] Todos los tests pasan.
- [ ] CI bloquea publicación si validación falla.

---

## 6. Criterios de aceptación (pilar "jamás falla")

### Funcionales

1. Con release publicado y registry actualizado, **100% de clientes elegibles** muestran el aviso en ≤ 30 s tras arranque.
2. Una actualización crítica se instala y reinicia sin intervención en ≤ 5 min en red estable.
3. Tras reinicio, la versión del binario coincide con la del release y el aviso **no reaparece**.
4. Ante fallo de red, la app no queda en estado inconsistente y reintenta automáticamente.
5. "Restablecer avisos" siempre recupera la detección.
6. No existen estados atascados (`_installInProgress=true` sin instalación activa) tras 10 min.
7. JSON corrupto en store → respaldo + reset, app arranca normal.
8. Re-ejecutar "Comprobar ahora" 5 veces no duplica entradas en la cola.
9. Máximo 10 intentos fallidos → `abandoned`, visible en UI con botón manual.
10. Nueva versión no arranca → rollback automático en ≤ 2 min.

### No funcionales

11. Tiempo de arranque no aumenta más de 2 s por el sistema de updates.
12. Uso de memoria adicional < 5 MB.
13. Uso de disco adicional < 50 MB (backup de versión anterior).
14. Funciona sin internet (modo offline) sin errores.

---

## 7. Plan de rollback de emergencia

Si el sistema de updates se rompe completamente:

1. **Deshabilitar updates:** Setear `globalDisable: true` en registry.json y hacer push.
2. **Resetear estado en clientes:** Publicar instrucción para que usuarios ejecuten "Restablecer avisos".
3. **Rollback de versión:** Publicar un nuevo release con la versión anterior (con versionCode mayor en Android).
4. **Comunicación:** Notificar a usuarios por canal alternativo (email, WhatsApp).

---

## 8. Comandos de diagnóstico rápido

```bash
# Health check local
npm run updates:health

# Verificación de publicación
npm run updates:verify

# Simular OTA (si existe)
npm run updates:simulate -- v1.0.260 v1.0.274
```

### En cliente (consola del navegador)

```javascript
// Dump completo de estado
console.log(JSON.stringify(window.crozzoUpdateDumpState(), null, 2));

// Versión instalada
console.log('VERSION', window.CROZZO_APP_VERSION);

// Versión disponible
console.log('DISPONIBLE', window.CROZZO_APP_VERSION_DISPONIBLE);

// Registry
console.log('REGISTRY', window.CROZZO_UPDATE_REGISTRY);

// localStorage
console.log('INSTALLED LS', localStorage.getItem('crozzo_app_installed_version'));
console.log('STATE', localStorage.getItem('crozzo_update_state'));
console.log('APPLIED', localStorage.getItem('crozzo_update_applied_entry_ids'));
console.log('OTA AUTO', localStorage.getItem('crozzo_ota_auto'));
console.log('STORE V2', localStorage.getItem('crozzo_update_store_v2'));
```

### En Tauri (consola Rust)

```rust
// Verificar versión del binario
tauri::api::app::version()

// Verificar firma del updater
tauri::updater::check()
```

---

## 9. Checklist de implementación (master)

### Fase 1 — Estado honesto
- [ ] Crear `crozzo_update_store_v2` y `sanitizeStore` + `migrateLegacy`
- [ ] Reemplazar lecturas de `VERSION` global por `store.installed.version`
- [ ] Mover `_installInProgress` a `store.lease` con TTL
- [ ] Implementar `refreshInstalled()` (binario primero)
- [ ] Implementar `recover()` y llamarlo en `runBootUpdatePipeline()`
- [ ] Añadir `crozzoUpdateDumpState()` a API global
- [ ] Tests: `stored > binary` se corrige
- [ ] Tests: JSON corrupto → respaldo + reset

### Fase 2 — Cola persistente
- [ ] Implementar `enqueue()` + `processQueue()` con backoff
- [ ] Implementar `backoffMs()` con jitter
- [ ] Implementar heartbeat en items de cola
- [ ] Mover commit de applied a post-reinicio
- [ ] Implementar `pruneQueue()`
- [ ] Tests: cierre abrupto → reintento automático
- [ ] Tests: máximo 10 intentos → abandoned

### Fase 3 — Verificación y rollback
- [ ] Añadir verificación de hash SHA-256 post-descarga
- [ ] Implementar backup de versión anterior (PC)
- [ ] Implementar health-check post-arranque
- [ ] Implementar rollback automático
- [ ] Tests: descarga corrupta → no instala
- [ ] Tests: nueva versión no arranca → rollback

### Fase 4 — Staged rollout
- [ ] Añadir campos `rollout`, `telemetryTag`, `abortPolicy` a registry
- [ ] Implementar cálculo de bucket por cliente
- [ ] Implementar kill switch
- [ ] Tests: bucket < percentage → elegible

### Fase 5 — Telemetría
- [ ] Crear tabla `bona_update_telemetry` en Supabase
- [ ] Implementar cola de eventos en cliente
- [ ] Implementar flush batched con backoff
- [ ] Crear dashboard mínimo
- [ ] Tests: eventos se reportan correctamente

### Fase 6 — Pruebas automatizadas
- [ ] Añadir tests unitarios (Node)
- [ ] Añadir tests de integración (Playwright)
- [ ] Añadir validación de registry en CI
- [ ] Tests: todos pasan

---

## 10. Referencias

### Documentos generados por agentes
- `C:\proyectos\updater-robusto-tauri.md` — updater robusto en Tauri
- `C:\proyectos\ANDROID_SIDELOAD_UPDATE_RECOMMENDATIONS.md` — Android sideload
- `docs/FRONTEND-PWA-UPDATE-ROBUST-PATTERNS.md` — OTA web/PWA
- `docs/TELEMETRIA-ACTUALIZACIONES-CANARY.md` — telemetría y canary
- `docs/UPDATE-STATE-HONEST-RESILIENT.md` — estado honesto y resiliente
- `docs/PLAN-VERIFICACION-ACTUALIZACIONES.md` — plan de verificación original

### Archivos del repo
- `app/infra/CrozzoSystemUpdates.js` — lógica OTA
- `app/infra/CrozzoTauriUpdater.js` — updater Tauri
- `src-tauri/tauri.conf.json` — configuración updater
- `scripts/health-check-updates.mjs` — health check local
- `scripts/verificar-publicacion.mjs` — verificación de publicación

---

**Última actualización:** 2026-11-09
**Estado:** Plan reforzado listo. **Fase 1 (P0) implementada parcialmente** — store v2, sanitización, recover, markEntryFullyApplied con verificación de binario. Pendiente: tests y Fases 2-6.
