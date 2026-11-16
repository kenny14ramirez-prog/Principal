# POS Crozzo — Análisis Integral y Plan de Mejora (Maestro)

**Fecha:** 2026-11-11
**Alcance:** Módulo de Caja/POS (facturación, mesas, comandas, cocina, tablets, inventario, impresión, FE DIAN), comunicación multi-dispositivo, offline/resiliencia.
**Estado:** Análisis completado · Cambios seguros aplicados (ver §12) · Plan de mejora por fases.
**Plan reforzado:** `docs/POS-PLAN-REFORZADO-V2.md` (veredicto V1: "más o menos" → V2: "sí, reforzado").

---

## 1. Resumen ejecutivo

El sistema POS de Crozzo es un **monolito grande** (~53k líneas en `CrozzoPosMain.js` + ~40 módulos) con capacidad real de operación multi-dispositivo (PC caja, tablets, cocina) vía **cloud Supabase + LAN HTTP/WS + BLE mesh + P2P WebRTC**, y una capa **offline-first** sobre `localStorage` + IndexedDB.

**Puntos fuertes:**
- Honestidad fiscal: sin CUFE simulado, contingencia DIAN con SLA 48h, outbox fiscal con drenaje.
- Capa offline con backups rotatorios, cola de sync global con prioridades, dedup por `transaction_id`.
- Comunicación multi-canal con dedup en memoria (`OperationalIngest`), idempotencia por `consecutivo`.
- Permisos por rol bien definidos (`CROZZO_CAJA_PERMISOS_POR_ROL`) y migraciones de seguridad.
- Reversión de inventario al anular (corregida en esta sesión).

**Riesgos principales (priorizados):**
1. **Persistencia solo en `localStorage`** para facturas/FE/outbox → no cumple retención fiscal 5 años (art. 632 ET) y riesgo de pérdida por cuota/limpieza.
2. **CUFE no se propaga a la factura** tras drenaje offline → facturas quedan `pendiente_fiscal` aunque se timbraron después.
3. **Numeración con huecos** (consecutivo incrementado antes de timbrar, sin rollback) y riesgo de duplicados multi-dispositivo.
4. **Dedup en memoria** se pierde al recargar → posibles duplicados de comandas/mesas.
5. **Runtime sin outbox persistente** → cambios de mesas/carritos pueden perderse si no hay red al cerrar.
6. **Merge de carritos inconsistente** (`mergeItemsInto` no sumaba `sentCantidad`) → comandas duplicadas/infladas. **Corregido.**
7. **Reversión de receta** no funcionaba (firma incorrecta). **Corregido.**
8. **Permisos**: `comandar` no validado explícitamente; `anular_comandado` puede otorgar apertura de órdenes.
9. **Impresión**: cola con timeout fijo 45s, dependencia de Tauri, dedup en memoria.
10. **RLS permisivo** (`using (true)`) en Supabase.

---

## 2. Metodología

Se ejecutaron **5 agentes de exploración** en paralelo sobre el código base, más **2 búsquedas web** sobre mejores prácticas POS offline-first y KDS, y se corrieron checks existentes (`_reversion-inventario-check.mjs`) para validar el estado real.

Módulos analizados:
- `app/core/CrozzoPosMain.js` (53k líneas) — caja, mesas, carritos, comandas, facturación, descuentos, propina, sync.
- `app/infra/CrozzoLanSyncBridge.js`, `CrozzoBleMesh.js`, `CrozzoConnectionManager.js`, `CrozzoPairingSeal.js`
- `app/modules/CrozzoComandasCloudSync.js`, `CrozzoPosRuntimeCloud.js`
- `app/modules/CrozzoReservorio.js`, `CrozzoReservorioOffline.js`, `CrozzoReservorioSql.js`
- `app/core/CrozzoStorageHygiene.js`, `app/core/CrozzoPosCloud.js`
- `app/core/CrozzoPrintService.js`, `CrozzoTermicaColombia.js`, `CrozzoTermicaPremium.js`
- `app/core/pos/CrozzoPosFacturasPage.js`, `CrozzoPosDianLib.js`, `CrozzoPosConfigManager.js`
- `app/modules/CrozzoContingenciaFiscal.js`, `CrozzoAdquirienteLookup.js`, `CrozzoReversionInventario.js`
- `app/modules/CrozzoCierreTurnos.js`, `CrozzoInventarioVenta.js`, `CrozzoPermisosPolicy.js`
- `app/core/CrozzoAuthSecurity.js`

---

## 3. Arquitectura del POS (caja)

### 3.1 Estado global clave
Variables en `CrozzoPosMain.js` (líneas ~4261-4317):
- `mesaSeleccionada`, `llevarSeleccionado`, `tipoServicioCaja`
- `cartDirecto`, `cartsPorMesa`, `cartsPorLlevar`
- `mesasCaja`, `llevarCaja`
- `comandas`, `nextComandaId`, `closedSlots`
- `descuentosPorSlot`, `descuentoDirecto`, `descuentoComercial`
- `clientePorSlot`

### 3.2 Flujos principales
- **Mesas/colores:** `getSlotStateInfo` (22902) → estados `libre | atendiendo | pendiente | comandado | salio | en-uso`; `getSlotCardClass` (22954); `crozzoRestSlotCardHtml` (25900).
- **Selección:** `selectMesa` (25227), `selectLlevar` (25261) — valida permiso `abrir_orden`, prepara slot, reconcilia carrito desde comandas.
- **Productos:** `addToCart` (27278), `removeFromCart` (27320) — maneja líneas comandadas (anulación con permiso `anular_comandado`).
- **Comandas:** `crearComanda` (23797), `comandarDesdeCaja` (27723), `comandarYGuardarDesdeDirecta` (27763).
- **Dividir/unir:** `crozzoConfirmUnirCuenta` (30998), `crozzoConfirmDividirCuenta` (31116) — transfiere comandas.
- **Descuentos:** `crozzoGetActiveDescuento` (23196), `crozzoSetActiveDescuento` (23208), `crozzoConfirmDescuentoVenta` (30888); prorrateo en `facturar`.
- **Propina:** `crozzoRestPropinaConfig` (28445), `crozzoCalcularPropinaDesdeCart` (28490); enriquecimiento en `facturar`.
- **Facturación:** `facturar` (32963) — permiso `facturar`, snapshot `__crozzoCartEnCobro`, validaciones NIT/stock/totales, consecutivo, crea factura POS/FE, guarda, inventario, CRM, auditoría, limpia slot.
- **Permisos:** `crozzoHasCajaPermiso` (14678), `crozzoRequireCajaPermiso` (14749).
- **Sync:** `crozzoSyncPosRuntimeCritical` (8515), `crozzoSyncActiveSlotCartToFleet` (8599), `crozzoEnsureSlotFreshBeforeEdit` (6992).

### 3.3 Riesgos detectados (caja)
1. **Merge inconsistente:** `mergeItemsInto` (24408) no sumaba `sentCantidad` → pendientes inflados y comandas duplicadas. **Corregido.**
2. **Idempotencia de `markTabletItemsAsSent`** (25393) — puede marcar de más en reintentos.
3. **Estado stale de mesas:** `crozzoPrepareSlotForNewService` (6782) retorna temprano si `slotHasActiveWork`, no limpia `closedSlots`; `markSlotAsPaid` (8507) no dispara render; comparaciones estrictas `===` con mismatch de tipo.
4. **Permisos:** `comandarDesdeCaja` no valida permiso explícito de comandar; `crozzoCanOpenOrderSlot` (25218) permite abrir órdenes a quien tenga `anular_comandado`; tablets consideran `tab_precuenta` válido si existe `facturar`.
5. **Sync:** `crozzoEnsureSlotFreshBeforeEdit` puede operar con carrito stale y sobrescribir remoto; runtime puede resucitar slots pagados si `closedSlots` no se respeta.

---

## 4. Comunicación multi-dispositivo

### 4.1 Arquitectura
- **Rol A (caja/PC, Tauri):** servidor LAN HTTP (puerto 3000) + WS LAN; sync Supabase.
- **Rol B (tablets/cocina):** clientes HTTP + Realtime/polling/LAN WS/mesh.
- **Nube:** Supabase (`comandas`, `crozzo_sede_runtime`, `crozzo_mesa_runtime`).
- **Canales:** Cloud (Supabase Realtime+REST), LAN HTTP, LAN WS, BLE mesh (gossip epidémico, MAX_HOPS=12, DEDUP 15min), WebRTC P2P, `OperationalIngest` unificado (dedup/prioridad).

### 4.2 Pairing
- QR firmado ECDSA P-256 v5 (`CrozzoPairingSeal`), fallback v4; token LAN; TLS pinning por fingerprint; IP propia; identidad de flota.

### 4.3 Flujos de comandas
Creación → `fanoutComandasByIds` (ComandasCloudSync 1884) → outbox + LAN paralelo + P2P + mesh; receptor aplica con guards de área/TID/eco/anti-resurrección. Estado (entregada) por canales paralelos.

### 4.4 Flujos de runtime/cart
Push con debounce (fast 120ms/normal 380ms) → P2P + cloud (merge-on-write por mesa) + LAN; pull por Realtime/poll/LAN con guards de timestamp/contenido; Realtime con resubscribe delay 2.5s.

### 4.5 Reintentos
- Outbox de comandas persistido en `localStorage` (`OUTBOX_LS_KEY`), backoff `1.7^attempts`, max age 6h, batch 2.
- Runtime push retry exponencial (2.2s × 1.6, máx 25s).
- LAN pressure backoff hasta 90s/180s.
- Mesh dedup TTL 15min.

### 4.6 Riesgos
1. Runtime sin outbox persistente → pérdida de estado si se cierra sin red.
2. Dedup en memoria se pierde al recargar → duplicados.
3. Clock skew → descarte de updates válidos o resurrección de comandas.
4. Mesh dedup TTL 15min → reinyección de mensajes antiguos.
5. Echo windows cortas (comandas 12s, runtime 2.6s) → re-aplicación en latencia alta.
6. Runtime merge-on-write puede resucitar mesas borradas por race.
7. Presencia por slot stale si un dispositivo se duerme.
8. Pairing legacy v4 acepta QR sin firma.
9. Outbox max age 6h descarta comandas silenciosamente.
10. Purge solo rol A → tabla crece.

---

## 5. Offline y resiliencia

### 5.1 Modelo de datos
- **Reservorio unificado:** `localStorage['crozzo_reservorio_v1']` (proveedores, recepciones, facturas oficina, cortes, inventario, costeo, cotizaciones, menú, recetas, matriz, planilla, syncQueue, feLinks, meta). Backups rotatorios `_v1/_v2`.
- **Cola global:** `localStorage['crozzo_sync_queue']`, migración one-time desde `sync_queue_temp`, dedup por `transaction_id`.
- **Runtime operativo:** `localStorage['crozzo_pos_runtime_v1']` + backups, historial comandas cap 120, máx ~4.5MB.
- **Config/maestro:** `pos_dian_config`, catálogo, usuarios; modo sync `runtimeSyncModo` (hybrid).
- **IndexedDB `CrozzoLocalData` v3:** espejo entidades (products, sales, clients, inventory, audit_logs, categories, taxes, comandas).
- **IndexedDB `CrozzoRuntimeIndexedDb`:** KV runtime, device id, IP LAN.
- **IndexedDB `crozzo_blob_store_v1`:** adjuntos (PDF/fotos) con Blob + metadatos.

### 5.2 Estrategia offline-first
- `CrozzoReservorioOffline.shouldUseCloud()` → false si modo offline, sin config cloud, tier no permite o sin red.
- Escribe primero local; nube asíncrona.
- Retención 365 días recepciones/inventario; `trimForQuota` recorta antiguos manteniendo pendientes.
- Adjuntos base64 migrados a IndexedDB.

### 5.3 Flujos de sync
- **Reservorio→cola global:** mutación → `pushSync` → `save` → debounce 450ms → `flushSyncQueueToCloud` → mirror a cola global con `transaction_id` determinista `resv-<tabla>-<op>-<id>`, prioridad 2.
- **Cola global→Supabase:** `syncOfflineQueue` valida config/gate/throttle, dedup, ordena por prioridad, lotes de 8, insert con fallback upsert por `transaction_id`, conserva fallidos.
- **Runtime:** push debounce + retry exponencial; pull Realtime/poll/LAN; supresión de eco por timestamps/contenido.
- **Dedup:** por `transaction_id`, `CrozzoIdempotentSync.deduplicateQueue`, violación de unicidad = éxito, `findRecepcionDuplicadaReciente` (120s), `dedupeRecepcionesBurst` (3s), ventas por `saleAttemptId/uuid/consecutivo+fecha`, IndexedDB `safeInsert` por `updated_at`+`sync_hash`.

### 5.4 Riesgos
1. Cuota de `localStorage` → `saveSafe` recorta o falla.
2. Trim agresivo → pérdida de trazabilidad si no hubo sync.
3. Backups solo 2 niveles.
4. Debounce 450ms + timers se pierden al cerrar (beforeunload solo rota backup).
5. Limpieza de navegador borra todo; no se observa restauración completa desde nube.
6. Migración runtime→IndexedDB one-time; migración parcial no se reintenta.
7. Entradas marcadas `encolado_nube` no vuelven a `pendiente` si el empuje posterior falla → pérdida silenciosa.
8. `insert` y `update` generan `transaction_id` distintos → no se deduplican entre sí.
9. Violación de unicidad contada como éxito aunque no se aplicó.
10. Runtime usa timestamps; relojes desalineados descartan updates válidos.
11. `mergeRecord` last-write-wins por `updated_at` sin reloj lógico → sobrescritura.
12. Schema mismatch en Supabase → ítem retenido indefinidamente.
13. Duplicación de código `app/` y `src/` + bundles generados.
14. RLS permisivo.

---

## 6. Impresión y página de Facturas

### 6.1 Arquitectura
- `CrozzoPrintService.js`: backends `winapi` (Tauri/Windows), `cups` (Mac/Linux), `html` (navegador/Android). Resolución de impresora por rol (`caja`, `comanda`, `bodega`), saneamiento de phantom.
- ESC/POS CP850 con init/align/bold/font/cut/QR/logo raster. Constructores para factura y comanda. Render HTML premium (`CrozzoTermicaPremium`, `CrozzoTermicaColombia`).
- Cola serial con timeout 45s, recuperación manual, cancelación/vaciado.
- Fallback HTML con diálogo.
- `CrozzoCierrePrint.js`: cierre/cuadre (roll 58/80, carta, oficio).
- `CrozzoPrinterRescue.js`: catálogo + modal de rescate.
- `CrozzoPosFacturasPage.js`: historial, filtros, preview, anulación, permisos.

### 6.2 Flujos
- Factura POS/FE: cobro → `crozzoPresentFacturaShareAfterPrint` → formato → `crozzoFacturaPrintPos` → encola → resuelve impresora → ESC/POS → raw o fallback HTML. Auto-impresión si configurada.
- Comandas: `crozzoTryAutoPrintComanda` → dedup por id/transaction_id + printed_at/by (90s) → `printComandaNow` → ESC/POS → raw.
- Reimpresión: botones POS/Carta/Oficio; comandas con permiso `crozzoCanReimprimirComanda`.
- Cola: `crozzoPrintEnqueue` → `crozzoPrintQueueRunNext` serial con timeout.
- Errores: fallback, phantom, test print, toasts.
- Facturas page: KPIs, chips de período, filtros estado, búsqueda, preview, anulación (solo si `puedeAnular`), limpieza solo Super Admin.

### 6.3 Riesgos
1. Duplicación `app/`/`src/`.
2. Cola timeout fijo 45s, recuperación manual.
3. Dependencia de Tauri para impresión silenciosa; navegador solo fallback con diálogo.
4. Resolución puede caer a "Generic 58/80mm" phantom.
5. Dedup de comandas en memoria (90s) + trackers distribuidos.
6. Historial local en localStorage; limpieza irreversible solo Super Admin, sin respaldo remoto.
7. Anulación local no emite nota crédito DIAN.
8. QR externo (`api.qrserver.com`) depende de red.
9. Dos rutas de render (ESC/POS vs HTML premium) pueden divergir.
10. Errores silenciosos (catch vacíos) y toasts genéricos.

---

## 7. Facturación electrónica DIAN

### 7.1 Arquitectura
- **Config:** `pos_dian_config` en localStorage (`empresa`, `dian`, `certificado`, `proveedor`, `impuestos`, `madurez`, `usuarios`, `facturas`, `ultimoConsecutivo`).
- **Madurez:** 5 niveles; Nivel 0 = Sandbox (bloqueo duro de timbrado); `canGoLive()` valida mínimos.
- **Modos:** `demo`/`simple`/`electronic`; en `simple` fuerza `pos`.
- **Lib DIAN:** validador NIT, CUFE (SHA-384), QR DIAN, builders UBL 2.1 (Invoice, NC, ND con retenciones), outbox fiscal (`crozzo_fiscal_outbox_v1`), adaptador Dataico (único PT real), factory de proveedores (Siigo/Facturama no implementados).
- **Contingencia:** régimen Res. 165/2023 art. 37, SLA 48h, alerta 40h, eventos significativos, drenaje.
- **Adquiriente:** cache, CRM local, reservorio proveedores, demo DIAN, remotos (Tauri GetAcquirer, Supabase, RUES), fusión por prioridad, enriquecimiento en background, readiness (email obligatorio si envía FE por correo).
- **Permisos:** `crozzoHasCajaPermiso('facturar')` único para POS y FE.
- **Almacenamiento:** `config.facturas` + `CrozzoFacturasArchivo` (archivado mensual en localStorage).

### 7.2 Flujos
- **Emisión FE:** `facturar()` → permiso, sanitiza carrito, in-flight, modo, NIT, resolución restante, totales, consecutivo, construye factura + XML → `timbrarFactura` → Dataico. Éxito con CUFE → `timbrada`; sin red → outbox `retry`, `pendiente_fiscal`; HTTP error → outbox + lanza; sin CUFE → outbox `pending`.
- **Emisión POS:** `pos`, UUID `POS-...`, `cufe='NO-APLICA-POS'`, `estado='pos'`.
- **Contingencia/drenaje:** detección WAN, `registrarCambioContingencia`, cola `pendiente_timbrado`, deadline 48h; `CrozzoFiscalOutboxDrain.drain` (lock cross-tab, debounce 8s, hasta 3 entradas, replay por payload/XML, estados `done/retry/dead`).
- **Numeración:** `getNextConsecutivo(saleAttemptId)` → cache por saleAttemptId → Supabase RPC `crozzo_next_consecutivo` → fallback local `ultimoConsecutivo+1`.
- **Validación adquiriente:** `lookupAdquiriente` con múltiples fuentes y readiness.

### 7.3 Riesgos
1. **Solo localStorage** para facturas/outbox/config/archivo → no cumple retención 5 años; `persistirSQLite()` retorna false (no implementado). Outbox trunca XML a 200k.
2. **CUFE no se propaga** a `config.facturas` tras drenaje → facturas quedan sin CUFE en vista principal. `drenarCola` actualiza cola, no factura.
3. **Numeración:** idempotencia por saleAttemptId depende de localStorage; Supabase RPC opcional/silencioso → fallback local puede duplicar en multi-dispositivo; consecutivo incrementado antes de timbrar sin rollback → huecos.
4. **Configuración:** `canGoLive()` exige credenciales solo si `prov.type !== 'mock'`; certificado solo flag `encrypted`, sin verificar vigencia/firma; NIT relajado permite documentos sin DV; consumidor final por defecto `222222222-2`.
5. **Adquiriente:** fuentes externas sin calidad uniforme; email puede faltar y no bloquea emisión FE; enriquecimiento en background puede no persistir.
6. **Permisos:** único `facturar` para POS y FE; no hay `facturar_electronica`.
7. **Auditoría:** hash djb2 (ligero, no criptográfico).
8. **Reintentos:** drenaje máx 3 por ciclo, gap 8s → colas grandes pueden incumplir SLA 48h; sin backoff exponencial ni dead-letter; entradas `dead` por falta de XML no se reintentan; eventos significativos solo encolados, no enviados al recuperar PT.
9. **Operación:** `facturar()` hace mucho trabajo síncrono en UI thread; errores en post-proceso (inventario, cloud sync) se tragan (`catch (_) {}`).

---

## 8. Inventario y permisos

### 8.1 Permisos
- `CrozzoAuthSecurity.js`: autenticación local PBKDF2 120k iter, bloqueo 5 intentos/5min, migración PINs, honeypot.
- `CrozzoPermisosPolicy.js`: delegación por rol, presets, sanitización.
- `CrozzoPosMain.js`: `CROZZO_CAJA_PERMISOS_POR_ROL` + `crozzoHasCajaPermiso`.
- Roles: superadmin (todo), admin (todo caja + facturar + cierre), encargado (similar + anular_comandado), caja (sin anular_comandado), recepcion (POS+cobro, sin anular), mesero (solo tablets), cocina (comandas).
- Reglas: `anular_comandado` bloqueado salvo admin/encargado; `facturas_limpiar` solo superadmin; soporte `opts.context='tablet'` (KI-034); mesero operativo si RBAC vacío; migraciones v1-v9 automáticas.
- `CrozzoReversionInventario.puedeAnular()` solo valida rol, no permiso granular.

### 8.2 Inventario
- `CrozzoInventarioVenta.js`: `crozzoInventarioAplicarVenta` — clasifica líneas `pos`/`receta`/`ninguno`; retail descuenta `products.stock` (mín 0); receta consume ingredientes en Reservorio (`salida_venta`); idempotente por `saleUuid`; adjunta `inventarioMeta`.
- `CrozzoReversionInventario.js`: `revertirVenta`/`anularFactura` — valida rol, idempotente, retail suma stock, receta llama `devolverVenta`, registra movimientos `entrada_devolucion`, marca factura anulada.
- `CrozzoCierreTurnos.js`: sesión de día, turnos, métricas filtrando facturas válidas, `canPerformArqueo()` por permiso, hash de facturas por turno, sync a nube + planilla. Auto-cierre con diff 0 asumido.

### 8.3 Riesgos
1. **Reversión de receta no funcionaba** (firma incorrecta). **Corregido.**
2. **`crozzoInvRegistrarMovimiento` no existe** → movimientos retail de devolución no se persisten en ledger; solo ajusta stock.
3. **Anulación sin permiso granular** → cualquier admin/encargado puede anular; no existe `anular_venta`.
4. **Stock negativo silencioso** → `Math.max(0, cur-qty)` sin registrar faltante ni bloquear venta.
5. **Concurrencia multi-terminal** → sin bloqueo/control optimista sobre stock.
6. **Auto-cierre con diff 0 asumido** → puede ocultar faltantes.
7. **Migraciones de permisos automáticas** v1-v9 → cambios silenciosos tras actualizaciones.
8. **Anulación solo local** → no emite nota crédito DIAN.
9. **Idempotencia dependiente de estado persistido** → si no se guarda, doble reversión.
10. **Honeypot** con contraseñas conocidas en el bundle.

---

## 9. Investigación externa (mejores prácticas)

### 9.1 Offline-first (Android/Web)
- Priorizar **local data** y funcionar sin red; sincronización eventual; conflict resolution (LWW, CRDTs, merge manual).
- **Turso Sync**, **Ditto** (CRDTs + property-based sync), **PowerSync**, **Electric SQL**, **Replicache**, **WatermelonDB**.
- Patrones: local store first → reconcile on reconnect; idempotency keys; vector clocks / logical clocks; offline queues con backoff; tombstones para deletes.

### 9.2 Restaurant POS + KDS
- **Offline-first POS** con tickets <60s, routing por estación, batching de platos iguales, waiter routing.
- **KDS** reemplaza tickets papel; lanes por área; timing y estados; integración POS↔KDS bidireccional.
- Reconciliación automática de caja vs. pagos digitales.

### 9.3 Aplicación a Crozzo
- Migrar persistencia fiscal/operativa a **SQLite** (Tauri) para durabilidad y retención.
- Implementar **outbox persistente para runtime** (como comandas) con reintentos.
- Reemplazar comparaciones por `Date.now()` con **versiones monotónicas por dispositivo/sede** (vector clocks) para evitar skew.
- **CRDTs o merge por campos** para evitar sobrescritura de ediciones concurrentes.
- **Idempotencia por entidad** (clave estable `business_id + tabla + local_id`) con `upsert` en lugar de insert+update separados.
- **Reconciliación con ack** (marcar `ok` solo tras confirmación cloud).
- **Failover de ancla LAN** o degradación a cloud sin bloquear escrituras.
- **QR local** (librería cliente) en lugar de `api.qrserver.com`.
- **Observabilidad**: métricas por canal, alertas de outbox, SLA.

---

## 10. Riesgos consolidados (priorizados)

| # | Riesgo | Impacto | Esfuerzo | Prioridad |
|---|--------|---------|----------|-----------|
| 1 | Persistencia solo localStorage (fiscal) | Alto (legal) | Alto | P0 |
| 2 | CUFE no se propaga tras drenaje | Alto (fiscal) | Medio | P0 |
| 3 | Numeración con huecos/duplicados | Alto (fiscal) | Medio | P0 |
| 4 | Dedup en memoria se pierde al recargar | Alto (operativo) | Medio | P1 |
| 5 | Runtime sin outbox persistente | Alto (operativo) | Medio | P1 |
| 6 | Merge de carritos inconsistente | Medio | Bajo | **Corregido** |
| 7 | Reversión de receta rota | Medio | Bajo | **Corregido** |
| 8 | Clock skew en sync | Medio | Medio | P1 |
| 9 | RLS permisivo | Alto (seguridad) | Bajo | P1 |
| 10 | Permisos comandar no validado | Medio | Bajo | P2 |
| 11 | Stock negativo silencioso | Medio | Bajo | P2 |
| 12 | Concurrencia multi-terminal | Medio | Alto | P2 |
| 13 | Cola impresión timeout fijo | Bajo | Medio | P3 |
| 14 | QR externo depende de red | Bajo | Bajo | P3 |
| 15 | Duplicación app/src/bundles | Medio (calidad) | Medio | P2 |

---

## 11. Plan de mejora por fases

### Fase 0 — Estabilización inmediata (1-2 semanas)
- [x] Corregir `mergeItemsInto` para sumar `sentCantidad`.
- [x] Corregir reversión de receta (`devolverVenta` firma + llamada).
- [ ] Hacer `devolverVenta` robusto (aceptar string/objeto) — **hecho**.
- [ ] Agregar `posDeducted`/`modo` al contrato de `inventarioMeta` (ya existe) y documentar.
- [ ] Implementar `crozzoInvRegistrarMovimiento` (alias a Reservorio) para auditoría retail.
- [ ] Agregar permiso granular `anular_venta` y verificar en `puedeAnular()`.
- [ ] Validar permiso `comandar` explícito en `comandarDesdeCaja`.
- [ ] Registrar faltantes de stock cuando `cur < qty`.
- [ ] Propagar CUFE a `config.facturas` en drenaje (fiscal outbox + contingencia).
- [ ] Normalizar tipos en dedup de outbox (`String(consecutivo)`).

### Fase 1 — Durabilidad y consistencia fiscal (2-4 semanas)
- [ ] Implementar comandos Tauri SQLite para facturas/outbox/config y migrar persistencia.
- [ ] Cumplir retención 5 años (art. 632 ET) con archivado durable.
- [ ] Numeración robusta: RPC obligatorio cuando haya credenciales; cola offline de asignación; rollback/compensación al fallar timbrado.
- [ ] `canGoLive()` exigir `prov.type==='dataico'` + credenciales + certificado vigente.
- [ ] Bloquear emisión FE si falta email del adquiriente.
- [ ] Separar permisos `facturar_pos` vs `facturar_electronica`.
- [ ] Hash SHA-256 encadenado para auditoría.
- [ ] Enviar eventos significativos pendientes al recuperar PT.

### Fase 2 — Robustez multi-dispositivo y offline (4-8 semanas)
- [ ] Outbox persistente para runtime (pushes de mesas/carritos) con reintentos y merge.
- [ ] Persistir dedup en IndexedDB/localStorage (TID seen, ACKs, slot sigs).
- [ ] Reemplazar `Date.now()` por versiones monotónicas por dispositivo/sede (vector clocks).
- [ ] Idempotencia por entidad (clave estable + upsert) en cola global.
- [ ] Reconciliación con ack (marcar `ok` solo tras confirmación).
- [ ] Backoff exponencial + dead-letter en sync/outbox fiscal.
- [ ] Drenaje fiscal por lotes más grandes con throttling y monitoreo SLA.
- [ ] Failover de ancla LAN o degradación a cloud sin bloquear escrituras.
- [ ] Endurecer RLS por `business_id`/dispositivo.
- [ ] Eliminar duplicación `app/`/`src/`/bundles con build automatizado + verificación en CI.

### Fase 3 — Calidad, UX y observabilidad (8-12 semanas)
- [ ] Observabilidad: métricas por canal, alertas de outbox, SLA fiscal, logs estructurados de impresión.
- [ ] QR local (librería cliente) en lugar de servicio externo.
- [ ] Centralizar dedup de comandas en backend/cloud por `transaction_id`.
- [ ] Tests E2E con emulador de impresora térmica.
- [ ] Tests de reconexión (corte WAN/LAN, cuota excedida, doble clic, conflicto concurrente).
- [ ] Control de concurrencia multi-terminal (bloqueo por producto/versión).
- [ ] Auto-cierre de turno sin diff 0 asumido; alertar.
- [ ] Nota crédito DIAN o deshabilitar anulación en modo FE.
- [ ] Revisar migraciones de permisos (idempotentes + auditoría).

### Fase 4 — Innovación (12+ semanas)
- [ ] Evaluar CRDTs (Ditto/Replicache/Electric SQL) para conflict-free sync.
- [ ] Evaluar PowerSync/Turso para sync SQLite local↔cloud.
- [ ] KDS con lanes por estación, batching de platos iguales, waiter routing, timing.
- [ ] Failover de ancla y alta disponibilidad.
- [ ] IA para insights (ya existe `CrozzoAiInsights`) sobre facturas/comandas.

---

## 12. Cambios aplicados en esta sesión

1. **`app/modules/CrozzoReversionInventario.js` y `src/...`**:
   - Retail branch ahora se activa si `posDeducted === true`, `modo === 'pos'`, o si el producto existe en catálogo y no se marcó explícitamente como receta.
   - Llamada a `crozzoReservorioDevolverVenta` ahora pasa objeto `{ facturaId, saleId, uuid }` (antes positional).
2. **`app/modules/CrozzoReservorio.js` y `src/...`**:
   - `devolverVenta` ahora acepta string/number además de objeto.
3. **`app/core/CrozzoPosMain.js` y `src/...`**:
   - `mergeItemsInto` ahora suma también `sentCantidad` (evita pendientes inflados/comandas duplicadas).

**Verificación:** `node scripts/_reversion-inventario-check.mjs` → PASS (0 fallos).

---

## 13. Métricas de éxito

- Check `_reversion-inventario-check.mjs` PASS.
- Check `_stress-comandas-tienda-audit.mjs` PASS.
- 0 facturas `pendiente_fiscal` sin CUFE tras drenaje.
- 0 duplicados de comandas en reconexión (medir por `transaction_id`).
- 0 pérdida de estado de mesas en corte de red (test de caos).
- Retención fiscal 5 años verificable (SQLite).
- SLA contingencia 48h cumplido (monitoreo).
- Auditoría con hash encadenado verificable.

---

## 14. Apéndice: archivos clave

| Área | Archivos |
|------|----------|
| Caja core | `app/core/CrozzoPosMain.js` |
| Facturas page | `app/core/pos/CrozzoPosFacturasPage.js` |
| DIAN lib | `app/core/pos/CrozzoPosDianLib.js`, `CrozzoPosConfigManager.js` |
| Comunicación | `app/infra/CrozzoLanSyncBridge.js`, `CrozzoBleMesh.js`, `CrozzoConnectionManager.js`, `CrozzoPairingSeal.js`, `CrozzoOperationalIngest.js`, `CrozzoLanWebSocketBridge.js` |
| Comandas cloud | `app/modules/CrozzoComandasCloudSync.js` |
| Runtime cloud | `app/modules/CrozzoPosRuntimeCloud.js` |
| Reservorio | `app/modules/CrozzoReservorio.js`, `CrozzoReservorioOffline.js`, `CrozzoReservorioSql.js` |
| Offline | `app/core/CrozzoStorageHygiene.js`, `app/core/CrozzoPosCloud.js`, `app/infra/CrozzoRuntimeIndexedDb.js` |
| Impresión | `app/core/CrozzoPrintService.js`, `CrozzoTermicaColombia.js`, `CrozzoTermicaPremium.js`, `app/modules/CrozzoPrinterRescue.js`, `CrozzoCierrePrint.js` |
| Inventario | `app/modules/CrozzoInventarioVenta.js`, `CrozzoReversionInventario.js`, `CrozzoCierreTurnos.js` |
| Permisos | `app/core/CrozzoAuthSecurity.js`, `app/modules/CrozzoPermisosPolicy.js` |
| FE/contingencia | `app/modules/CrozzoContingenciaFiscal.js`, `CrozzoAdquirienteLookup.js`, `CrozzoFiscalOutboxDrain.js` |
| Tablets | `app/core/CrozzoTabletShell.js`, `CrozzoTabletNav.js` |
| Checks | `scripts/_reversion-inventario-check.mjs`, `_stress-comandas-tienda-audit.mjs`, `_connectivity-*`, `_legendary-connectivity-check.mjs` |

---

*Documento generado por el agente de análisis POS. No se modificaron archivos de producción salvo los cambios listados en §12.*
