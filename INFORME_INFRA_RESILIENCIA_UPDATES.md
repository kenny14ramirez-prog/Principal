# Informe de Infraestructura y Resiliencia — Sistema de Actualizaciones (Bona Origen)

**Agente:** Infraestructura y Resiliencia
**Archivos analizados:**
- `app/infra/CrozzoSystemUpdates.js` (~7000 líneas)
- `app/infra/CrozzoTauriUpdater.js` (~1600+ líneas)
- `src-tauri/tauri.conf.json`

**Alcance:** concurrencia, filesystem, red, estado, memoria, idempotencia, edge cases. Se asume implementados los cambios P0 (store v2, sanitización, recoverStore, lease, cola persistente, markEntryFullyApplied con verificación de binario).

---

## 1. Resumen ejecutivo

El sistema es muy completo funcionalmente, pero la resiliencia de infraestructura es **débil en varios ejes críticos**:

- La concurrencia entre pestañas/procesos **no está realmente protegida**: el lease solo cubre `processQueue`, y `_installInProgress` vive en memoria (no persistente). Dos pestañas pueden disparar descargas simultáneas.
- El lease con TTL 120 s es **insuficiente** para descargas grandes (APK/exe de varios MB) y su adquisición vía `localStorage` (read-modify-write) **no es atómica** entre pestañas.
- La red no maneja **rate limiting de GitHub** (HTTP 429 / `Retry-After`) ni expone un fallback real a un endpoint alternativo (todo apunta a `raw.githubusercontent.com`).
- `recoverStore()` se ejecuta **antes** de que se cargue el registry (`_registryEntries` vacío), por lo que el ramal de `pendingRestart` nunca encuentra el entry y no avanza la versión; depende de que `refreshBinaryVersion` lo corrija después.
- El `setInterval` de 5 min + listeners `online`/`crozzo:pos-operation-state` no se limpian y pueden **acumularse** si el módulo se re-inicializa.
- `enqueueUpdate` **no es idempotente** tras completar/fallar: crea un nuevo item con id aleatorio cuando el estado es `done`/`abandoned`, y el id no es determinista.
- No hay manejo de **disco lleno / quota de localStorage** (solo `console.warn`), ni limpieza explícita de temporales en el lado JS (depende de Rust, no visible).

**Severidad global: ALTA** (riesgo de descargas duplicadas, estado inconsistente y fallos silenciosos en producción).

---

## 2. Concurrencia

### Hallazgo C-1 — Race condition entre pestañas (crítico)
**Evidencia:** `_installInProgress` es una variable de módulo en memoria (`var _installInProgress = false;`). `startCriticalDownloadForRestart`, `startOptionalDownloadForRestart`, `runCriticalInstall` consultan/establecen esta bandera, pero **no** el lease persistente. El lease (`acquireLease`) solo se usa en `processQueue()`.

**Escenario:** dos pestañas del mismo navegador (o dos ventanas Tauri) abren la app. Ambas tienen `_installInProgress=false`. Ambas detectan la misma actualización crítica y ambas disparan `runCriticalInstall` → dos descargas paralelas del mismo `.exe`/APK, dos invocaciones `install_setup_from_url`, posible corrupción / doble relaunch.

**Severidad:** crítico.

**Recomendación:** extender el lease a todas las operaciones de descarga/instalación (no solo a `processQueue`). Crear `acquireLease('install-<entryId>', ttl)` al inicio de `runCriticalInstall`/`startCriticalDownloadForRestart`/`startOptionalDownloadForRestart` y liberarlo en `.finally`. Si no se adquiere, salir temprano (`{ skipped: true, reason: 'lease_held' }`).

### Hallazgo C-2 — Adquisición de lease no atómica (alto)
**Evidencia:** `acquireLease` hace `loadStore()` → compara → `saveStore()`. Entre dos pestañas, ambas pueden leer `lease=null` (o expirado) y ambas guardar su lease. localStorage no ofrece transacciones ni locking cross-tab.

**Severidad:** alto.

**Recomendación:** usar `BroadcastChannel` / `storage` event como señal de coordinación, o un token con `owner` + timestamp y re-verificar después de guardar (compare-and-swap manual: releer y confirmar que el lease sigue siendo el propio; si no, abortar). Alternativamente, mover la coordinación a un mutex en Rust (Tauri) para desktop. Documentar que en web multi-pestaña la protección es best-effort.

### Hallazgo C-3 — TTL del lease insuficiente para descargas grandes (alto)
**Evidencia:** `acquireLease(owner, ttlMs)` default 120 000 ms. `processQueue` adquiere con 120 s. `runInstallFromQueue` puede tardar varios minutos (descarga de APK/exe de 8–30 MB). El lease expira a mitad → otra instancia (o el `setInterval` de 5 min) adquiere y procesa el mismo item → descarga duplicada. El heartbeat se actualiza en `runInstallFromQueue` cada chunk, pero **no refresca el lease** (no hay `refreshLease` en el callback de progreso).

**Severidad:** alto.

**Recomendación:** (a) TTL dinámico basado en tamaño esperado (mín. 10 min); (b) llamar `refreshLease('queue-processor', 120000)` en cada heartbeat de progreso; (c) en `recoverStore`, los items `downloading`/`installing` con heartbeat < 3 min se reencolan — pero si dos procesos compiten, ambos podrían reencolar. Añadir un campo `lockedBy`/`lockExpiresAt` por item.

### Hallazgo C-4 — Watchdog de 5 min libera el lock sin limpiar estado (medio)
**Evidencia:** `startCriticalDownloadForRestart`: `setTimeout(function(){ _installInProgress=false; }, 5*60*1000)` incondicional, incluso si la descarga terminó antes (en ese caso el `.finally`/`.then` ya puso false, y el timer tardío vuelve a poner false — inofensivo pero si otro install arrancó en medio, lo libera prematuramente). En `startOptionalDownloadForRestart` y `runCriticalInstall` sí hay `.finally` que libera, pero el watchdog de 5 min de `startCriticalDownloadForRestart` no se cancela.

**Severidad:** medio.

**Recomendación:** guardar el handle del `setTimeout` y `clearTimeout` en `.finally`/`.then`/`.catch`. Patrón: `var watchdog = setTimeout(...); ... .finally(function(){ clearTimeout(watchdog); _installInProgress=false; })`.

### Hallazgo C-5 — `recoverStore` y `processQueue` pueden solaparse (medio)
**Evidencia:** `runBootUpdatePipeline` llama `recoverStore()` (síncrono en su arranque, pero internamente async via `fetchTauriBinaryVersion().then(...)`), y luego `refreshBinaryVersion()` (otra promesa). Ambas llaman `fetchTauriBinaryVersion` y escriben `store.installed`. Además `recoverStore` programa `setTimeout(processQueue, 1000)`. Si `checkForUpdates` (manual o automático) corre en paralelo, hay escrituras concurrentes al store.

**Severidad:** medio.

**Recomendación:** serializar: `recoverStore` debe devolver una promesa y `runBootUpdatePipeline` debe `await`/`.then` antes de `refreshBinaryVersion`. Añadir un flag `_recovering` para evitar reentradas.

### Hallazgo C-6 — Listeners acumulables (medio)
**Evidencia:** `wirePosIdleListener` protege con `global.__crozzoUpdatePosIdleWired`, OK. Pero el `window.addEventListener('online', ...)` (línea ~1044) y el `setInterval` de 5 min (línea ~1038) se registran al cargar el módulo **sin guard**. Si el módulo se re-evalúa (HMR/dev, o doble carga), se duplican. El `setInterval` nunca se limpia.

**Severidad:** medio (bajo en prod, pero memory leak real en dev/HMR).

**Recomendación:** guardar handles en variables de módulo y registrar solo una vez; añadir `beforeunload`/cleanup. Para el `setInterval`, usar `clearInterval` en un teardown.

---

## 3. Filesystem

### Hallazgo F-1 — Sin limpieza explícita de temporales en JS (alto)
**Evidencia:** las descargas se delegan a Rust (`invoke('crozzo_android_download_apk', ...)`, `invoke('install_setup_from_url', ...)`, `downloadAndInstallUpdate` vía plugin-updater). El lado JS no conoce rutas ni borra archivos. No hay rutina de cleanup al arrancar ni al fallar. Si una descarga se interrumpe, el archivo parcial queda en disco (gestionado por Rust, no visible en este análisis).

**Severidad:** alto (depende de Rust; verificar en `src-tauri/src`).

**Recomendación:** añadir comando Rust `cleanup_update_temp_files` invocado en `recoverStore` y al fallar instalación; documentar la política de temp en Rust. En JS, al menos registrar la ruta devuelta (`dl.installPath`) en el store para poder limpiarla después.

### Hallazgo F-2 — Sin manejo de disco lleno / quota (alto)
**Evidencia:** `saveStore` captura excepción y solo `console.warn('[updates] saveStore failed (quota?)', e)`. `localStorage.setItem` para `LS_LOCAL_LOG`, `LS_POST_UPDATE_WELCOME`, backups, etc. no tienen fallback. Si el disco/quota se llena, el estado no se persiste → en el siguiente arranque se pierde todo el progreso (queue, pendingRestart). `appendLocalLog` también traga errores.

**Severidad:** alto.

**Recomendación:** (a) detectar `QuotaExceededError` y, en ese caso, podar agresivamente (logs, entradas antiguas) y reintentar; (b) para descargas, propagar el error de Rust con código `ENOSPC` y mostrar mensaje claro al usuario ("libere espacio"); (c) persistir el store en un archivo (Tauri fs) en vez de localStorage para desktop, que es más robusto.

### Hallazgo F-3 — Nombres de temp no deterministas / no idempotentes (medio)
**Evidencia:** `enqueueUpdate` genera `id: 'q_' + Date.now() + '_' + Math.floor(Math.random()*1000)`. No es determinista. Si se llama 10 veces con el mismo entry:
- Mientras status sea `queued/downloading/installing/awaiting_restart/failed`, retorna el id existente (idempotente en ese tramo).
- Si el item ya está `done` o `abandoned`, la búsqueda inicial no lo encuentra → crea un **nuevo** item. Así que tras completar, re-llamar `enqueueUpdate` duplica la entrada en la cola.

**Severidad:** medio.

**Recomendación:** hacer el id determinista a partir de `entryId` (ej. `q_<entryId>` o `q_<entryId>_<plan>`), y en `enqueueUpdate` si existe item `done`/`abandoned` para ese entry, retornar su id en lugar de crear uno nuevo (o marcarlo como re-encolable solo si la versión remota cambió). También deduplicar por `(entryId, plan)`.

### Hallazgo F-4 — `pruneQueue` no limpia items huérfanos (bajo)
**Evidencia:** `pruneQueue` solo elimina `done` > 7 días y `abandoned` > 30 días. Items `queued`/`failed` antiguos permanecen indefinidamente. `failed` con `attempt>=10` se marca `abandoned` en `processQueue`, pero si `processQueue` nunca corre (offline prolongado), quedan `failed` con `nextRetryAt` en el pasado y se reintentan cada 5 min para siempre.

**Severidad:** bajo.

**Recomendación:** añadir expiración: items `failed`/`queued` con `createdAt` > 30 días → `abandoned`. También limitar tamaño de cola (p. ej. máx. 50 items).

---

## 4. Red

### Hallazgo N-1 — Sin manejo de rate limiting de GitHub (alto)
**Evidencia:** `fetchReleaseAssets` llama `httpGetJson(GITHUB_API_RELEASE + tag)` (api.github.com). Sin autenticación, límite 60 req/h por IP. En tiendas con varios POS compartiendo IP, se puede agotar. No se inspecciona status 429 ni header `Retry-After`. `fetchJsonWithFallback` lanza en `!res.ok` y cae al catch. `httpGetJson` en Tauri tampoco maneja 429.

**Severidad:** alto.

**Recomendación:** (a) detectar 429 y respetar `Retry-After` (con cap); (b) cachear el resultado de `fetchReleaseAssets` por tag en localStorage con TTL corto (5 min) para no repetir; (c) preferir `raw.githubusercontent.com` (sin límite estricto) para metadata y reservar api.github.com solo para assets; (d) considerar un token opcional de GitHub para elevar el límite.

### Hallazgo N-2 — Fallback a endpoint alternativo es cosmético (medio)
**Evidencia:** `fetchRegistryData` intenta `registryUrl` y `manifestUrl`, pero `getRegistryUrl()` deriva `manifestUrl.replace(latest→registry)` → ambos apuntan al mismo host (`raw.githubusercontent.com`). Si ese host cae, ambos fallan. No hay CDN/mirror alternativo ni `GITHUB_RAW_RELEASES_LATEST` como fallback real en esta función (sí se usa en `probeReleaseArtifacts`).

**Severidad:** medio.

**Recomendación:** definir una lista ordenada de endpoints (raw.githubusercontent.com, jsdelivr, github releases) y probarlos en cascada con `Promise.any`/secuencial. Reusar `releaseLatestJsonCandidates` que ya existe.

### Hallazgo N-3 — Reintentos de `fetchRegistryData` insuficientes y rápidos (medio)
**Evidencia:** solo 2 reintentos con 2 s fijos (`setTimeout 2000`). Timeout 12 s por fetch. En redes inestables (WiFi móvil en tienda), 2 intentos × 12 s puede no bastar, y el intervalo fijo no hace backoff.

**Severidad:** medio.

**Recomendación:** 3–4 reintentos con backoff exponencial + jitter (reusar `backoffMs`), y timeout adaptativo. Distinguir errores de red (reintentar) de 4xx (no reintentar).

### Hallazgo N-4 — Sin cancelación de descargas al cambiar de red (medio)
**Evidencia:** `fetchWithTimeout` usa `AbortController` (bien). Pero las descargas nativas (`invoke('install_setup_from_url')`, `crozzo_android_download_apk`) no reciben señal de aborto. Al cambiar WiFi→datos, la descarga nativa puede colgarse hasta timeout del SO (minutos), y el watchdog de 5 min libera `_installInProgress` pero la descarga nativa sigue consumiendo ancho de banda. El evento `online` solo dispara `processQueue` tras 2 s.

**Severidad:** medio.

**Recomendación:** exponer comando Rust `cancel_download` y llamarlo en `requestUpdateAbort()`; en JS, al evento `offline`/`online`, abortar descargas en curso y reintentar. Añadir detección de cambio de conexión (`navigator.connection.addEventListener('change')`).

### Hallazgo N-5 — Sleep del dispositivo (bajo/medio)
**Evidencia:** no hay manejo de `visibilitychange` ni `pagehide`. Si el dispositivo entra en sleep durante descarga, al despertar los timers se reanudan pero las conexiones TCP pueden estar muertas; `fetch` puede colgarse hasta timeout. `setInterval` de 5 min se reanuda. No hay revalidación de la conexión.

**Severidad:** medio.

**Recomendación:** escuchar `visibilitychange`: al volver a visible, verificar `navigator.onLine` y re-ejecutar `processQueue`/heartbeat check; si un item lleva > X min sin progreso, marcarlo `failed` y reencolar.

---

## 5. Estado

### Hallazgo E-1 — `recoverStore` corre antes del registry (alto)
**Evidencia:** en `runBootUpdatePipeline`, línea ~5107: `try { recoverStore(); } catch...` se ejecuta **antes** de `refreshBinaryVersion().then(fetchRegistryData())`. Por tanto `_registryEntries` está vacío cuando `recoverStore` procesa `pendingRestart` (línea ~860: `_registryEntries.find(...)` → `undefined` → rama else que solo pushea `appliedEntries` por id, **sin** avanzar `VERSION` ni `installed`). Luego `pendingRestart` se borra. El avance de versión queda a cargo de `refreshBinaryVersion` (que lee el binario). Si el binario ya es la nueva versión, OK; si no (instalación pendiente no aplicada), se pierde el pendingRestart y no se reencola correctamente... en realidad la rama else del `compareSemver(ver, pr.version) >= 0` es la de "no instalado aún → re-enqueue", pero `ver` ya es el binario (antiguo) < `pr.version`, así que entra en re-enqueue — pero `entry2` se busca en `_registryEntries` (vacío) → `entry2` undefined → **no se reencola**. pendingRestart se borra igual (línea 878-879 solo en la rama `>=0`; en la rama else no se borra pendingRestart... espera, en la rama else no hay `store.pendingRestart=null`). Releo: líneas 873-878: else re-enqueue, no borra pendingRestart. Así que pendingRestart persiste. OK, pero no se reencola por falta de entry. En el siguiente arranque, `_registryEntries` sí estará cargado... pero `recoverStore` se vuelve a ejecutar antes del registry otra vez. Bucle: nunca reencola.

**Severidad:** alto.

**Recomendación:** mover `recoverStore()` para que se ejecute **después** de `fetchRegistryData` en `runBootUpdatePipeline` (o pasarle las entries). Alternativamente, hacer `recoverStore` aceptar `entries` como parámetro y llamarlo tras cargar el registry. También hacer que la búsqueda de entry caiga a un placeholder si no está (ya lo hace en `applyPendingRestartInstallOnBoot`, pero no en `recoverStore`).

### Hallazgo E-2 — Sin validación de `schemaVersion` (medio)
**Evidencia:** `sanitizeStore` no verifica `raw.schemaVersion === SCHEMA_VERSION`. Un store v1 o de una versión futura se sanitiza igual. Podría aceptar datos incompatibles.

**Severidad:** medio.

**Recomendación:** si `raw.schemaVersion !== SCHEMA_VERSION`, intentar migración o reset con backup (como ya se hace en corrupción total).

### Hallazgo E-3 — Corrupción parcial se "sana" silenciosamente (medio)
**Evidencia:** `sanitizeStore` filtra campos inválidos y devuelve un store parcialmente poblado (defaults para lo que falta). No se registra qué se descartó. `loadStore` solo trata como corrupto si `sanitizeStore` devuelve `null` (que nunca ocurre porque siempre devuelve `emptyStore` modificado). Es decir, **nunca** se hace backup por corrupción parcial: los campos inválidos se descartan sin traza.

**Severidad:** medio (funcionalmente aceptable, pero pérdida de diagnóstico).

**Recomendación:** detectar si hubo cambios (comparar conteos) y, si se descartaron datos, hacer backup del raw original con sufijo `_partial_<ts>` y `appendLocalLog('store_sanitized', ...)`. Útil para soporte.

### Hallazgo E-4 — `markEntryFullyApplied` avanza VERSION sin verificar binario real en web (medio)
**Evidencia:** en web (no Tauri), `fetchTauriBinaryVersion` devuelve `null`, así que `store.installed.version` puede ser `meta` o `stored`. El guard `compareSemver(tv, binaryVer) > 0` usa `binaryVer = store.installed.version || VERSION`. Si el store dice una versión antigua pero el meta es nuevo, puede bloquear avance legítimo o, al revés, avanzar sin confirmación real. En web, "instalado" significa "recarga hecha", así que la verificación de binario no aplica — pero el código la aplica uniformemente.

**Severidad:** medio.

**Recomendación:** condicionar la verificación de binario a `getUpdateClientProfile().isDesktopBinary || isAndroid`. En web, permitir avance directo (como ya hace `applyClientUpdate` con `web_reload`).

### Hallazgo E-5 — `reconcileAppliedEntriesForVersion` marca aplicado todo lo `<= VERSION` (bajo)
**Evidencia:** en `recoverStore` paso 7 y `reconcileAppliedEntriesForVersion`, cualquier entry con `remote <= ver` se marca aplicado, incluso si nunca se instaló (solo porque la versión del binario es mayor). Esto puede ocultar actualizaciones parcialmente aplicadas. Pero es el comportamiento deseado para evitar bucles. Riesgo bajo.

**Severidad:** bajo.

**Recomendación:** mantener, pero registrar en log cuando se marca aplicado por reconciliación (para auditoría).

---

## 6. Memoria

### Hallazgo M-1 — `setInterval` de 5 min nunca se limpia (medio)
**Evidencia:** `setInterval(function(){ if (navigator.onLine !== false) processQueue(); }, 5*60*1000)` (línea ~1038). Handle no guardado. En SPAs con HMR o si el módulo se re-evalúa, se acumulan. Cada tick llama `processQueue` → `acquireLease` (lectura/escritura localStorage).

**Severidad:** medio.

**Recomendación:** guardar handle en `_queueTimer` y registrar cleanup. Añadir guard `if (global.__crozzoQueueTimer) return;`.

### Hallazgo M-2 — Listeners `online` y `crozzo:pos-operation-state` (medio)
**Evidencia:** `window.addEventListener('online', ...)` sin guard de duplicación (el `wirePosIdleListener` sí tiene guard). Si se carga dos veces, dos handlers.

**Severidad:** medio.

**Recomendación:** guard con flag `global.__crozzoOnlineWired`.

### Hallazgo M-3 — `renderLocalLogPanel` se llama en cada `appendLocalLog` (bajo)
**Evidencia:** `appendLocalLog` siempre llama `renderLocalLogPanel()` que toca el DOM. Si se llama en bucle (p. ej. durante recuperación), puede ser costoso. No es un leak, pero es ineficiente.

**Severidad:** bajo.

**Recomendación:** debounce o solo renderizar si el panel está visible.

### Hallazgo M-4 — Closures en `wireOnce` y overlays (bajo)
**Evidencia:** `ensureUpdateInstallOverlay` registra un `document.addEventListener('keydown', ...)` una sola vez (guard `__crozzoEscWired`). OK. Pero `ensureCriticalPlanBButtons` y otros usan `wireOnce` (no visible) — asumir OK. Sin leak evidente.

**Severidad:** bajo.

---

## 7. Idempotencia

### Hallazgo I-1 — `enqueueUpdate` no idempotente tras done/abandoned (medio)
**Evidencia:** ver F-3. Además, el item.id es aleatorio, así que dos llamadas "idempotentes" devuelven ids distintos en el tramo terminal.

**Severidad:** medio.

**Recomendación:** id determinista + dedup por `(entryId, plan)` incluso en estados terminales (retornar id existente).

### Hallazgo I-2 — `isEntryAppliedV2` puede dar falsos positivos/negativos (medio)
**Evidencia:** para la misma semver, compara build stamp (`publishedAt`/`updatedAt` del entry vs `readMetaBuildStamp()` del meta tag). Si el meta tag no se actualizó en el build (stamp vacío), retorna `false` siempre → el entry nunca se considera aplicado aunque la versión coincida → re-instalación eterna. Si ambos stamps vacíos, `false`. Si el entry no tiene `publishedAt`, stamp vacío → `false`.

**Severidad:** medio (riesgo de reinstalación infinita).

**Recomendación:** si `compareSemver(installed, remote) === 0` y no hay stamps, considerar aplicado cuando `source === 'binary'` (alta confianza). Añadir fallback a `entry.id` en `appliedEntries`.

### Hallazgo I-3 — `markEntryFullyApplied` no es idempotente en `appliedEntries` (bajo)
**Evidencia:** sí verifica `indexOf < 0` antes de push. OK. Pero `VERSION = tv` y `saveInstalledVersion` se ejecutan cada vez, incluso si ya aplicado. Inofensivo pero ruidoso. No es un bug crítico.

**Severidad:** bajo.

---

## 8. Edge cases

### Hallazgo X-1 — Cambio de red (WiFi→datos) (medio)
**Evidencia:** ver N-4. No hay aborto de descargas nativas ni revalidación. El evento `online` re-dispara `processQueue` tras 2 s, pero si una descarga nativa sigue viva, puede solaparse.

**Severidad:** medio.

### Hallazgo X-2 — Sleep del dispositivo (medio)
**Evidencia:** ver N-5.

**Severidad:** medio.

### Hallazgo X-3 — Múltiples pestañas + `localStorage` events (alto)
**Evidencia:** no se escucha el evento `storage` para sincronizar estado entre pestañas. Si una pestaña completa una instalación y actualiza el store, la otra no se entera hasta su próximo `checkForUpdates`. Puede mostrar UI desactualizada y disparar descargas duplicadas.

**Severidad:** alto.

**Recomendación:** añadir `window.addEventListener('storage', ...)` que, al detectar cambio en `STORE_KEY`, recargue el store y actualice `_registryEntries`/UI. Combinar con C-1 (lease compartido).

### Hallazgo X-4 — Reloj del sistema cambiado (bajo)
**Evidencia:** `nextRetryAt`, `snooze`, `lease.expiresAt` se basan en `Date.now()`. Si el reloj salta hacia atrás, leases "expirados" vuelven a ser válidos y snoozes se extienden; si salta hacia adelante, todo se considera expirado de golpe → reprocesamiento masivo. No hay protección.

**Severidad:** bajo.

**Recomendación:** usar `performance.now()` para intervalos cortos y validar saltos grandes del reloj (si `Date.now()` difiere > 5 min del último tick, resetear timers).

---

## 9. Tabla resumen de severidades

| ID | Área | Hallazgo | Severidad |
|----|------|----------|-----------|
| C-1 | Concurrencia | Race entre pestañas, `_installInProgress` en memoria | Crítico |
| C-2 | Concurrencia | Lease no atómico (localStorage read-modify-write) | Alto |
| C-3 | Concurrencia | TTL 120 s insuficiente, no refresh en heartbeat | Alto |
| C-4 | Concurrencia | Watchdog 5 min no cancelado | Medio |
| C-5 | Concurrencia | recoverStore/processQueue solapados | Medio |
| C-6 | Concurrencia/Memoria | Listeners/setInterval sin guard de duplicación | Medio |
| F-1 | Filesystem | Sin cleanup de temporales en JS | Alto |
| F-2 | Filesystem | Sin manejo de disco lleno/quota | Alto |
| F-3 | Filesystem/Idempotencia | enqueueUpdate no idempotente en estados terminales, id aleatorio | Medio |
| F-4 | Filesystem | pruneQueue no limpia huérfanos | Bajo |
| N-1 | Red | Sin manejo de rate limit GitHub (429) | Alto |
| N-2 | Red | Fallback endpoint cosmético | Medio |
| N-3 | Red | Reintentos insuficientes y sin backoff | Medio |
| N-4 | Red | Sin cancelación de descargas nativas al cambiar de red | Medio |
| N-5 | Red | Sin manejo de sleep del dispositivo | Medio |
| E-1 | Estado | recoverStore antes del registry → pendingRestart no reencola | Alto |
| E-2 | Estado | Sin validación de schemaVersion | Medio |
| E-3 | Estado | Corrupción parcial sin traza/backup | Medio |
| E-4 | Estado | Verificación de binario aplicada uniformemente (web) | Medio |
| E-5 | Estado | Reconciliación marca aplicado por versión | Bajo |
| M-1 | Memoria | setInterval sin cleanup | Medio |
| M-2 | Memoria | Listeners duplicables | Medio |
| M-3 | Memoria | renderLocalLogPanel en cada append | Bajo |
| I-1 | Idempotencia | enqueueUpdate no idempotente (terminal) | Medio |
| I-2 | Idempotencia | isEntryAppliedV2 falsos negativos por stamp vacío | Medio |
| I-3 | Idempotencia | markEntryFullyApplied no idempotente en VERSION | Bajo |
| X-1 | Edge | Cambio de red | Medio |
| X-2 | Edge | Sleep | Medio |
| X-3 | Edge | Multi-pestaña sin sync por storage event | Alto |
| X-4 | Edge | Reloj del sistema | Bajo |

---

## 10. Recomendaciones prioritarias (orden de implementación)

1. **(Crítico)** Proteger descargas/instalaciones con lease compartido entre pestañas (C-1, C-2, X-3): `acquireLease` al inicio de `runCriticalInstall`/`startCriticalDownloadForRestart`/`startOptionalDownloadForRestart`, más listener `storage` para sincronizar.
2. **(Alto)** Mover `recoverStore()` a después de cargar el registry en `runBootUpdatePipeline`, o pasarle las entries (E-1).
3. **(Alto)** Manejo de disco lleno/quota con poda y reintento (F-2); propagar `ENOSPC` desde Rust (F-1).
4. **(Alto)** Rate limiting de GitHub: detectar 429, cachear por tag, backoff (N-1, N-3).
5. **(Alto)** TTL dinámico del lease + refresh en heartbeat (C-3).
6. **(Medio)** Idempotencia de `enqueueUpdate`: id determinista + dedup terminal (F-3, I-1).
7. **(Medio)** `isEntryAppliedV2`: fallback cuando no hay stamps y source=binary (I-2).
8. **(Medio)** Cancelación de descargas nativas al cambiar de red / sleep (N-4, N-5, X-1, X-2).
9. **(Medio)** Validación de `schemaVersion` y traza de sanitización parcial (E-2, E-3).
10. **(Bajo)** Guards de duplicación para setInterval/listeners (C-6, M-1, M-2); cleanup en teardown.

---

*Fin del informe.*
