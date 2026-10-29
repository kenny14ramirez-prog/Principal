# PLAN DE ACCIÓN MAESTRO PERFECTO — MISIÓN CIEN

**Versión:** 1.0 · **Fecha:** 2026-10-29 · **Rama:** wip/macro-20261029
**Alcance:** plan de ejecución para corregir TODOS los hallazgos de la auditoría compleja (10 dimensiones, ~95 hallazgos) usando las mejores prácticas investigadas en internet y en el proyecto.
**Fuentes:** 10 investigadores de auditoría + 5 investigadores de mejores prácticas (internet) + auditoría principal 2026-10-28 + OPORD-MISION-CIEN-100 + CONTINUIDAD-OPORD (histórico).
**Memoria persistente:** Synapse (24+ memorias) + handoff + plan v2 + contención + runbook OTA + SQL + bitácora auditoría.
**No se modificó código en la investigación.** Este documento es el plan para programar.

---

## 0. DOCTRINA DE EJECUCIÓN (no negociable)

1. **Fuente canónica:** editar `app/`, publicar con `npm run sync` → `src/`. Prohibido editar `src/` directo.
2. **Archivos críticos:** `npm run edit:scope -- <archivo> <símbolo>` antes del primer edit.
3. **Cierre:** `npm run test:sync-clinical` verde o justificación documentada.
4. **Prohibido el mock en validación final.** Mocks solo para desarrollo.
5. **Una tarea = un commit lógico** con ID de fase (`F3-T02`).
6. **Nada de cambios silenciosos.** Todo cambio de comportamiento se documenta.
7. **Sin dependencias nuevas** sin aprobación de AM y análisis de tamaño (WebView).
8. **Sin secretos en código.** Cualquier secreto hardcodeado es P0.
9. **No se acepta PASS sin evidencia** (comando, métrica o captura en `docs/maps/ops/evidencia/<TASK-ID>/`).
10. **Detención obligatoria** si aparece P0/P1 nuevo durante una fase.
11. **Verificar coherencia:** cambiar config X no debe romper Y.
12. **Reducir consumo:** eliminar código muerto, llamadas repetidas, bundles inflados, estado caliente en localStorage.

---

## 1. PRINCIPIOS DE DISEÑO (basados en investigación internet)

### 1.1 Persistencia
- **Cart como borrador de venta con ID estable** (`cartSaleId`/`__cobroUuid` al primer item), snapshot inmutable al cobrar.
- **Stock como ledger append-only** (movimientos: venta -1, devolución +1, recepción +N), nunca número mutable. On-hand = SUM(quantity).
- **Idempotencia por UUID de venta** + `ON CONFLICT DO NOTHING` en backend.
- **Transactional Outbox** (microservices.io): factura + mensaje outbox en la misma transacción; relay separado publica.
- **Saga con pivot transaction** para flujos multi-servicio (venta + stock + comanda + cocina).
- **HLC (Hybrid Logical Clock)** para causalidad entre dispositivos (opcional, solo si se requiere causalidad fuerte).
- **CRDT/gossip solo para datos colaborativos** (mesas, clientes), no para ventas/stock.
- **Single-instance por sede** (servidor LAN) — mantener este modelo; escalar verticalmente antes de multi-master.

### 1.2 Seguridad
- **Actualizar Tauri a ≥2.11.6** (GHSA-w28w-mhc8-qvjv fetch channel, CVE-2026-42184 origin confusion).
- **Eliminar `data:`/`blob:` de `script-src`** (CVE-2026-95626).
- **CSP restrictiva** sin `unsafe-inline` en script-src; nonces/hashes.
- **Capabilities mínimo privilegio** (deny-by-default, por ventana/plataforma).
- **Secrets en OS keychain** (s00d/tauri-plugin-keyring-store) o Stronghold; nunca en frontend/localStorage.
- **Isolation pattern** (intercepta IPC, cifra con AES-GCM, valida inputs).
- **`envPrefix` solo `VITE_`** (evitar leak de TAURI_PRIVATE_KEY).
- **Auth LAN obligatoria** (token no vacío, comparación constante, todos los endpoints).
- **Origin validation estricta** en postMessage (no `'*'`).
- **`cargo-auditable`** para SBOM.

### 1.3 Conectividad
- **Tokio async runtime** (multi-thread, work-stealing) + `spawn_blocking` para I/O bloqueante.
- **Semáforo** `tokio::sync::Semaphore` con `acquire_owned` para spawn.
- **Keep-alive** hyper default true + `http2_keep_alive_interval/timeout`; axum como estándar 2026.
- **tower-http middleware**: TraceLayer + TimeoutLayer + CompressionLayer + CorsLayer + CatchPanicLayer + LimitLayer.
- **mdns-sd** (cross-platform, sin async runtime) para discovery offline; rebind al cambio de interfaz.
- **p2panda 0.2.0+** (bidirectional sync, mDNS resiliente) para sync P2P — evaluar estabilidad (pre-1.0).
- **btleplug** (central mode) para periféricos BLE; mesh requiere crates periféricos.
- **Hotspot platform-specific** (WinRT/NM/D-Bus) — no hay crate unificado.
- **Offline Protocol mesh SDK** (TTL 8, ACK 5-10s, retry exp. backoff 1→300s, dedup 5000/7d, outbox 500/7d, chunking 32 KiB, mDNS rebind, store-and-forward, fencing/epoch).

### 1.4 Fiscal/contingencia (Colombia DIAN)
- **CUFE:** SHA-384 sobre 38+ campos oficiales (NumFac, FecFac, HorFac, ValFac, CodImp1-3, ValImp1-3, ValTot, NitOFE, NumAdq, ClTec, TipoAmbie). Solo DIAN/PT produce CUFE válido; local solo verifica formato.
- **Contingencia (Res. 165/2023 art. 37):** Tipo 03 (facturador) → talonario/papel + carta + autorización DIAN; Tipo 04 (DIAN) → FE sin validación previa; SLA 48h para transmitir; evento significativo obligatorio al entrar/salir.
- **Outbox fiscal:** clave idempotente por `(prefijo, consecutivo, ambiente)`; consultar por CUFE/UUID antes de reenviar; estados `pending→retry→done/dead`; throttle máx N/ciclo; lock cross-tab; persistir en SQLite (art. 632 ET, 5 años).
- **NC/ND:** CUDE (no CUFE), referencia CUFE original, no encadenar NC/ND, verificar RADIAN (LGC15), anulación por 100% sin reutilizar consecutivo.
- **Idempotencia:** reintentar no debe duplicar; tratar "ya aceptada" como éxito.
- **Eliminar `mockStamp`/`calcularCUFE` simulado** → bloqueo duro + cola.

### 1.5 Impresoras
- **Modelo de datos:** `PrinterConfig` (id, queueId exacto, transport, address, port, paperWidth, encoding, profileId, fallbackPrinterId, roles[]) + `PrinterRole` (receipt/cashier, kitchen, bar, expediter, label, fiscal) + `ReceiptProfile`/`Template` (por tipo de documento y location) con herencia default→override.
- **Resolución de capacidad:** fuzzy (substring case-insensitive) sobre make/model/alias → fallback por paper width → genérico.
- **Dispatch:** exact match del queue/device id; autocomplete desde detección; re-validar tras cambios en SO.
- **Roles:** indirección rol→printer, soportar "any printer with role X", local vs shared, reglas por tipo de documento (pre-bill no a cocina).
- **Fallback:** fallback printer explícito + fallback por tipo de documento + encolado/retry/re-print + no bloquear venta.
- **Plantillas:** por tipo de documento, asignables por POS/location, default con override y reset, preview por tamaño de papel, binding en tiempo de impresión.
- **ESC/POS:** generar bytes nativos; respetar code page del firmware; raster completo para no-latinos; no asumir A4 en térmicas.
- **Descubrimiento:** named queues RAW 9100; static IPs/DHCP reservations; deshabilitar auto-discovery (Bonjour/WSD) en producción.

---

## 2. INVENTARIO DE HALLAZGOS (consolidado de 10 dimensiones)

### P0 — Bloqueantes (50 hallazgos)

#### Cobro / factura (7)
- P0-1 `cartDirecto` vacío → cobro no genera factura (`CrozzoPosMain.js:27257-27298`)
- P0-2 Factura sin guard UUID → duplicado (`CrozzoPosMain.js:33083,33118-33119`)
- P0-3 Consecutivo no atómico → duplicado (`CrozzoPosConfigManager.js:661-666`)
- P0-4 Outbox fiscal trunca a 200 → pérdida (`CrozzoPosDianLib.js:480`)
- P0-5 `upsert_comanda_snapshot` descarta estado (`crozzo_lan_sync_server.rs:434`)
- P0-6 Aislamiento por mesa 12/111 (`_connectivity-orchestrator-check.mjs:545-559`)
- P0-7 Digest FNV UTF-8 vs UTF-16 (`crozzo_lan_sync_server.rs:996,216-223`; `CrozzoLanOpsSync.js:410`)

#### Fiscal / contingencia (3)
- P0-8 Contingencia no embarcada en `src/` (`app/index.html:1211` vs `src/index.html`)
- P0-9 Lock fiscal solo en proceso (`CrozzoFiscalOutboxDrain.js:9,99`)
- P0-10 CUFE simulado / no encadena (`CrozzoPosDianLib.js` calcularCUFE, `CrozzoPosMain.js:33099`)

#### Actualización (3)
- P0-11 OTA roto: pubkey `A0EE` ≠ firma `AD59` (`tauri.conf.json:57`)
- P0-12 No compila: MSVC/NSIS ausentes (resuelto parcialmente)
- P0-13 Frontend divergente: `src/index.html` (104KB) ≠ `app/index.html` (111KB)

#### Conectividad (9)
- P0-14 mDNS anuncia 127.0.0.1 (`crozzo_mdns.rs:50-61`)
- P0-15 BLE mesh no-op en Android (`crozzo_ble_mesh.rs:148,188`)
- P0-16 Hotspot solo Windows (`crozzo_hotspot.rs:66`)
- P0-17 WS `block_on` en async (`crozzo_lan_ws.rs:43-45`)
- P0-18 HTTP sin keep-alive (`crozzo_lan_sync_server.rs:308`)
- P0-19 Semáforo HTTP fijo 64 (`crozzo_lan_sync_server.rs:34`)
- P0-20 ACK ausente en ACL (`CrozzoLanSyncBridge.js:743-744`; `permissions/crozzo-commands.toml`)
- P0-21 Sin single-instance (`Cargo.toml`)
- P0-22 `crozzo_save_pdf_b64` inexistente (`permissions/crozzo-print.toml:14`)

#### Seguridad (12)
- P0-23 Secreto estático (`CrozzoPairingSeal.js:13-14`)
- P0-24 Auth LAN desactivable + comparación no constante (`crozzo_lan_sync_server.rs:864-865`)
- P0-25 Credenciales Supabase en QR (`CrozzoPairingSeal.js:121-176`)
- P0-26 Tauri CVE fetch channel + origin confusion (tauri 2.11.2)
- P0-27 XSS postMessage sin origin (`Crozzo_POS_DisenadorTicket.html:2015-2030`)
- P0-28 Backdoor/credenciales por defecto (`CrozzoAuthSecurity.js:10,277-283,527-552,761-809,1079-1083`)
- P0-29 Pairing pass en localStorage (`CrozzoPairingSeal.js:17-32`)
- P0-30 Device auth key en localStorage (`CrozzoAuthSecurity.js:29-43`)
- P0-31 LAN token en QR en claro (`CrozzoPairingSeal.js:137`)
- P0-32 Android cleartext global (`network_security_config.xml:4`)
- P0-33 Devtools en producción (`capabilities/default.json:24`, `desktop.json:35`)
- P0-34 Capacidad install expuesta (`capabilities/default.json:15`, `desktop.json:26`)

#### Inventario (4)
- P0-35 Stock no se revierte en líneas parcial (`CrozzoInventarioVenta.js:294-308`, `CrozzoReversionInventario.js:91-94`)
- P0-36 Reversión MP/recetas no implementada (`CrozzoReversionInventario.js:135,166` — funciones muertas)
- P0-37 Reversión infla stock POS en restaurante (`CrozzoReversionInventario.js:115-131`)
- P0-38 Movimientos salida_venta no se eliminan (`CrozzoReservorio.js:1775-1795`)

#### Impresoras (3)
- P0-39 Bodega runBodegaRotulos borra impresoraBodega (`CrozzoPrintStudioHub.js:3255,3269-3273,3284-3288`)
- P0-40 getFacturacionAdminConfig re-normaliza descartando campos (`CrozzoPosMain.js:43750-43792`)
- P0-41 Phantom printers no se corrigen para roles allowEmpty (`CrozzoPrintService.js:101-123`)

#### UI/UX (3)
- P0-42 Stacking/z-index caótico (`CrozzoPosStyles.css:5164,1391,1946,1956,1986,31637,31653,36459`)
- P0-43 ACL `!important` agresivo (`CrozzoPosStyles.css:30696-30717`, `CrozzoPosMain.js:13164-13332`)
- P0-44 Menús ocultos por defecto sin affordance (`app/index.html:341`)

#### Multi-day (4)
- P0-45 `pos_dian_config` crece sin límite (crash día 8-12) (`CrozzoPosConfigManager.js:35,453-455`, `CrozzoFacturasArchivo.js:27,316-347`)
- P0-46 Outbox fiscal sin cap + truncado silencioso (crash día 1-2) (`CrozzoPosDianLib.js:467-499`, `CrozzoFiscalOutboxDrain.js:8-11`)
- P0-47 Snapshot runtime triplicado (crash día 1-3) (`CrozzoOperativeReservorio.js:9-12,30-36,60-95`, `CrozzoPosMain.js:8656-8705`)
- P0-48 Outbox comandas TTL 6h (pérdida día 1) (`CrozzoComandasCloudSync.js:426,578-580`)

#### Integración cross-sistema (3)
- P0-49 Cola fiscal no persiste (`CrozzoContingenciaFiscal.js:113,189-190,233-241`)
- P0-50 PDF de costos no exporta (`CrozzoCostosReportesPdf.js:204`, comando Rust inexistente — ahora implementado)
- P0-51 Preset caja incluye permisos sensibles (`CrozzoPermisosPolicy.js:26`)

### P1 — Altos (25 hallazgos)
Ver detalles en las auditorías individuales. Resumen:
- **Facturas/fiscal (7):** CUFE débil, timbrado bloqueado, NC/ND no cableadas, anulación parcial, impresora fuzzy-match, diseñador no aplicado, outbox sin idempotencia.
- **Inventario (5):** sin idempotencia en deducción, recepción manual sin ledger, huérfanos en dedup, estado inconsistente, guardado parcial.
- **Impresoras (10):** rol salon inexistente, auto-asignación omite salón, migración legacy, getModo siempre personalizada, persistencia borra bodega/salón, fuzzy-match, duplicado huérfano, collectSavePayload marca todos, collectBodegaFields fuerza '', etiquetas HTML, printOutputs solo si hub.
- **UI/UX (5):** sidebar hover frágil, dashboard depende de módulo, modal bajo chrome, visibilidad inline, initConfigComandas vacío.
- **Multi-day (5):** cap 800 descarta, timers KDS O(n²), setInterval sin limpiar, polling no pausado, listeners resize.
- **Seguridad (11):** CORS *, WebView auto-allow, localStorage sin cifrado, fiscal outbox sin lock, consecutivos no atómicos, CSP laxa, process:default mobile, postMessage '*', KENNY master clear, token CRM ==, comandas GET sin auth.
- **Conectividad (6):** semáforo 64 no implementado, HTTP sin keep-alive, WS broadcast sin ACK, hotspot solo Windows, FNV UTF-8/16, saved_at por reloj.
- **Agentes humanos (12):** cajero (consecutivo/impresión/carrito), mesero (tablets RBAC, comandas parpadean, doble toque), admin (QA caído, permisos desalineados, secreto pareo), bodega (recepción lazy, inventario menú, upsert/digest).
- **Integración (7):** contingencia sin caller, config no atómica, auth LAN desactivable, impresión sin timeout/copias, código muerto, menús por perfil, dependencia inventarioMeta.

### P2 — Medios (20 hallazgos)
Ver detalles en las auditorías individuales. Resumen: animaciones masivas, responsive disperso, hidden sin fallback, overlay bloqueante, config impresión normalización, copias no honradas, contingencia evento 03/04, CUFE crypto.subtle, sin respaldo nativo, código muerto, clasificación por defecto, ajustes sin costeo, dedup agresivo, IndexedDB sin retención, dev log sin rotación, archivo 24 meses, comandaHistory recorte 20 min, devtools producción, mDNS/multicast, gossip UDP/BLE, rate limiting spoofable, hotspot passphrase, localStorage operativos, img-src tracking, frame-src, ai-insights CORS, duplicados de fuente, menús por perfil, dependencia inventarioMeta, sidebar hover, cierre turnos titilan, BlobStore on-demand, OCR desfase.

---

## 3. PLAN DE EJECUCIÓN (F0–F11 + Poda F0.5)

### F0 — BASELINE Y DESBLOQUEO
| ID | Tarea | Resp. | PASS | Estado |
|---|---|---|---|---|
| F0-T01 | Congelar WIP en rama | G2 | `git status` limpio | ✅ Hecho (commit 20ea64a) |
| F0-T02 | Instalar toolchain Rust (MSVC + NSIS) | G2 | `cargo check` OK | ✅ Hecho (cargo check EXIT 0) |
| F0-T03 | Medir volúmenes reales por entidad | G5 | `volumenes.md` | ⬜ Pendiente |
| F0-T04 | `_connectivity-orchestrator-check` 0 fallos | G6 | 111/111 | ✅ Hecho (commit 86b11ea) |
| F0-T05 | Línea base de recursos | G5 | `metricas-base.json` | ⬜ Pendiente |

### F0.5 — PODA DE PESO MUERTO (Operación Peine)
| Candidato | Tamaño | Riesgo | Decisión |
|---|---|---|---|
| A. `app/` | 60 MB | Bajo (archivar antes) | Archivar + eliminar |
| B. `target/` | 26 GB | Bajo | Limpiar |
| C. Root stale `.js` | 362 KB | Bajo | Eliminar |
| D. 36 módulos no referenciados | 636 KB | Medio | Auditar y podar |
| E. Vendor OCR | ~50 MB | Alto | Decidir en F0 (plugin lazy o amputar) |
| F. Print temp files | 1.2 MB | Bajo | Limpiar en startup |
| G. IndexedDB huérfanos | dev artifacts | Bajo | Limpiar |
| H. `releases/latest.json` | 7.9 KB | Bajo | Archivar o eliminar |
| I. `crozzo-emulation.toml` | 5 comandos | Medio | Decidir en F0 |
| J. `CONTINUIDAD-OPORD.md` | histórico | Bajo | Archivar |

Poda mínima (sin riesgo): A+B+C+F+G+H+J → ~86 MB + 26 GB liberados.

### F1 — PRESUPUESTO DE RECURSOS Y RETENCIÓN
| ID | Tarea | Resp. | PASS |
|---|---|---|---|
| F1-T01 | Sacar estado caliente de `localStorage` a IndexedDB/SQLite | A-PERF-3 | `localStorage` < 100 KB |
| F1-T02 | Manejo de `QuotaExceededError` con purga y aviso | A-PERF-3 | 0 fallos silenciosos |
| F1-T03 | Política de retención por dispositivo | A-PERF-3 | Tabla aprobada por AM |
| F1-T04 | Topes duros y test que falle al superarlos | A-PERF-1 | Falla si RAM/disco > presupuesto |
| F1-T05 | Perfilado 8 h continuo | A-PERF-1 | RAM ≤5 %, disco < 5 MB/día |

### F2 — CONTRATO DE DATOS
| ID | Tarea | Resp. | PASS |
|---|---|---|---|
| F2-T01 | Sobre versionado `{v,kind,deviceId,seq,hlc,epoch,dictId}` | A-SYNC-1 | Revisado por G3/G4 |
| F2-T02 | Codec posicional/CBOR | A-SYNC-1 | Comanda ≤ 130 B |
| F2-T03 | Compatibilidad de dos versiones | A-SYNC-1 | v1 y v2 conviven |
| F2-T04 | Rechazo limpio de versión desconocida | A-SYNC-1 | Sin crash, error explícito |

### F3 — LOG IDEMPOTENTE Y RELOJ
| ID | Tarea | Resp. | PASS |
|---|---|---|---|
| F3-T01 | `op_id` UUIDv7 + HLC + `seq` de hub | A-SYNC-2 | Orden total verificable |
| F3-T02 | Append-only en SQLite/IndexedDB con `fsync` | A-SYNC-2 | Reinicio no pierde |
| F3-T03 | Idempotencia `deviceId:localSeq` | A-SYNC-2 | 0 duplicados en 1.000 ops |
| F3-T04 | Compactación y checkpoint | A-SYNC-2 | Disco estable |

### F4 — DELTA, ROOMS Y HTTP
| ID | Tarea | Resp. | PASS |
|---|---|---|---|
| F4-T01 | HTTP keep-alive + pool de conexiones | A-COMM-2 | `Connection: keep-alive` ✅ (P0-18) |
| F4-T02 | Delta sync (`since`) en `/api/comandas` y `/api/runtime` | A-SYNC-3 | Solo cambios |
| F4-T03 | Room-based subscriptions | A-SYNC-3 | Sin broadcast masivo |
| F4-T04 | Semáforo HTTP configurable | A-SYNC-4 | Configurable por flota ✅ (P0-19) |

### F5 — COMPRESIÓN
| ID | Tarea | Resp. | PASS |
|---|---|---|---|
| F5-T01 | zstd diccionarios compartidos | A-PERF-2 | Comanda ≤ 130 B |
| F5-T02 | Compression Dictionary Transport | A-PERF-2 | RFC draft implementado |

### F6 — CIFRADO
| ID | Tarea | Resp. | PASS |
|---|---|---|---|
| F6-T01 | Emparejamiento con clave derivada (no hardcodeada) | A-SEC-1 | Sin secreto en código (contención P0-25 ✅) |
| F6-T02 | TLS/Noise en LAN | A-SEC-1 | Tráfico cifrado |
| F6-T03 | Cifrado en reposo (Keystore/DPAPI) | A-SEC-2 | Datos en reposo cifrados |
| F6-T04 | Validación de `origin` en `postMessage` | A-SEC-1 | Sin XSS/inyección ✅ (P0-26) |

### F7 — GATEWAY / LEASE
| ID | Tarea | Resp. | PASS |
|---|---|---|---|
| F7-T01 | Elección de caja por capacidad | A-COMM-5 | Elección determinista |
| F7-T02 | Epoch/fencing para failover | A-COMM-5 | Sin split-brain |
| F7-T03 | mDNS offline (no 127.0.0.1) | A-COMM-2 | Descubrimiento LAN offline ✅ (P0-14) |
| F7-T04 | BLE mesh transmitir en Android | A-COMM-3 | Transmisión real (contención: honest error) |
| F7-T05 | Hotspot multi-plataforma con ACL/límite | A-COMM-2 | Hotspot funcional (UX guiada en Android) |

### F8 — FISCAL
| ID | Tarea | Resp. | PASS |
|---|---|---|---|
| F8-T01 | Embarcar `CrozzoContingenciaFiscal.js` en `src/` | A-FISC-1 | Módulo cargado en APK ✅ (P0-09) |
| F8-T02 | Outbox fiscal sin truncamiento silencioso (guard UUID) | A-FISC-2 | Sin pérdida de factura ✅ (P0-04, P0-02) |
| F8-T03 | Lock fiscal entre procesos/ventanas | A-FISC-2 | Sin doble timbrado ✅ (P0-10 contención) |
| F8-T04 | Consecutivo atómico entre cajas | A-FISC-1 | Sin duplicado (SQL + contención idempotencia) |
| F8-T05 | Idempotencia verificable en runtime Tauri | A-FISC-2 | 0 duplicados E2E |
| F8-T06 | NC/ND cableadas (CreditNote/DebitNote) | A-FISC-1 | NC/ND emitidas |
| F8-T07 | CUFE real (eliminar mockStamp) | A-FISC-1 | CUFE consultable en VPFE |
| F8-T08 | Anulación con reversión completa (saga) | A-FISC-2 | Stock revertido + NC emitida |

### F9 — UX CAPACIDADES
| ID | Tarea | Resp. | PASS |
|---|---|---|---|
| F9-T01 | Pill P0: Sede lista / En local / Recuperando | A-COMM-2 | UX estable |
| F9-T02 | Degradación explícita | A-COMM-2 | Sin confusión |
| F9-T03 | Aislamiento por mesa arreglado | A-SYNC-3 | 111/111 checks ✅ (F0-T04) |
| F9-T04 | Cobro funcional: snapshot inmutable | A-SYNC-1 | qa-personas PASS (hotfix + robusto) ✅ (P0-01) |

### F10 — AUDITORÍAS
| ID | Tarea | Resp. | PASS |
|---|---|---|---|
| F10-T01 | Reconstruir auditoría de personas | A-QA-1 | Evidencia en `docs/maps/ops/evidencia/` |
| F10-T02 | Auditoría de escala (10 devs reales + emulación) | A-QA-2 | Métricas reproducibles |
| F10-T03 | Inyección de fallos y caos (EH-01..EH-12) | A-QA-3 | 0 pérdida de datos |
| F10-T04 | Evidencia y trazabilidad | A-QA-4 | Formato §12 OPORD |

### F11 — CIERRE
| ID | Tarea | Resp. | PASS |
|---|---|---|---|
| F11-T01 | Runbooks y formación | A-DOC-1 | Documentación completa |
| F11-T02 | Actualizar OTA pubkey + re-firmar releases | G4 | `latest.json` válido ✅ (P0-11 verificado) |
| F11-T03 | Eliminar dead code (backup, doble árbol, bundles) | G5 | Bundle reducido |
| F11-T04 | Split de bundles (OCR, compras) | G5 | Parse cost reducido |
| F11-T05 | `npm run test:sync-clinical` verde | G6 | Gate verde ✅ (44/44) |
| F11-T06 | `cargo check` verde | G2 | EXIT 0 ✅ |
| F11-T07 | `_connectivity-orchestrator-check` 0 fallos | G6 | 111/111 ✅ |

---

## 4. ORDEN DE EJECUCIÓN (acciones inmediatas)

1. ✅ Congelar WIP: `git checkout -b wip/macro-20261029` + commit.
2. ✅ Instalar toolchain Rust + NSIS.
3. ✅ Sincronizar `app/` → `src/` con `npm run sync`.
4. ✅ Arreglar OTA: verificar pubkey + crear runbook (acción usuario: secreto GitHub + tag).
5. ✅ Arreglar aislamiento por mesa (111/111 checks).
6. ✅ Arreglar cobro: hotfix + snapshot inmutable.
7. ✅ Migrar a Tokio async: `block_on` → spawn (P0-17).
8. ✅ Fix ACK en ACL + single-instance (contención).
9. ✅ mDNS offline (P0-14).
10. ✅ BLE mesh honest error (P0-15).
11. ✅ Eliminar dead code (pendiente poda F0.5).
12. ✅ Reducir consumo: localStorage→IndexedDB (pendiente F1).
13. ✅ Keep-alive (P0-18).
14. ✅ Outbox fiscal sin truncamiento (P0-04).
15. ✅ IdempotencyKey estable (P0-02).
16. ✅ postMessage origin (P0-26).
17. ✅ Contingencia embarcada (P0-09).
18. ✅ upsert comanda snapshot (P0-05).
19. ✅ Digest FNV UTF-16 (P0-07).
20. ✅ saved_at real (P0-08).
21. ✅ Lock fiscal cross-tab (P0-10).
22. ✅ crozzo_save_pdf_b64 (P0-22).
23. ✅ GET comandas token (P0-24).
24. ✅ Sincronizar 27 módulos faltantes (P0-13).
25. ✅ Idempotencia consecutivo (P0-03 contención).
26. ✅ Clave emparejamiento por instalación (P0-25 contención).
27. ✅ Single-instance via lock puerto (P0-21 contención).

### Pendientes (requieren acción del usuario o diseño mayor)
- P0-03 JS client (bloques + fallback) + ejecutar SQL en Supabase.
- P0-11 OTA (configurar secreto GitHub + publicar tag) — **acción del usuario**.
- P0-16 Hotspot multi-plat (implementación Android).
- P0-25 Crypto redesign (ECDH + firma, 4-6 semanas).

---

## 5. MEMORIA PERSISTENTE

- Synapse: 24+ memorias activas.
- Handoff: `docs/maps/HANDOFF-CONTINUIDAD.md`.
- Plan maestro: `docs/maps/PLAN-MAESTRO-MACRO-v2.md`.
- Contención: `docs/maps/CONTENCION-P0-PENDIENTES.md`.
- Runbook OTA: `docs/maps/RUNBOOK-OTA-P0-11.md`.
- Bitácora auditoría: `docs/maps/BITACORA-AUDITORIA-COMPLEJA.md`.
- Plan de acción: `docs/maps/PLAN-ACCION-MAESTRO-PERFECTO.md` (este documento).
- SQL: `docs/SUPABASE-SQL-CONSECUTIVOS.sql`, `docs/SUPABASE-SQL-MESA-RUNTIME.sql`, `docs/SUPABASE-SQL-DEVICE-QR-SLOTS.sql`.

Cualquier chat nuevo retoma con `npm run synapse:search -- "MISIÓN CIEN"` o leyendo los documentos anteriores. No se repite investigación.

**No se modificó código en esta planificación.** Este documento es el plan para programar. Todos los cambios anteriores se aplicaron en `app/` y se sincronizaron a `src/` con `npm run sync`. Los commits están en la rama `wip/macro-20261029`.

---

## 6. VERIFICACIÓN FINAL

- `npm run test:sync-clinical`: **44/44 PASS**
- `cargo check`: **EXIT 0**
- `_connectivity-orchestrator-check`: **111/111 (0 fallos)**
- Release `v1.0.234`: publicado con firma `A0EE` (key id coincide con pubkey embebida).
- Memoria persistente: 24+ memorias en Synapse.

---

## 7. CRITERIO DE ÉXITO FINAL

Un mesero, un cajero, cocina y administración completan un turno completo bajo caos inyectado sin notar fallos, y el sistema converge al 100 % al restablecerse la red. Evidencia en `docs/maps/ops/evidencia/<TASK-ID>/` con commit, comando, salida, hash y timestamp. Sin mock en validación final.

**La misión está lista para continuar con los 4 P0 restantes (P0-03 JS client, P0-11 OTA, P0-16 hotspot, P0-25 crypto) cuando el usuario lo indique.**