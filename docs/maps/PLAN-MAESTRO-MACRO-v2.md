# PLAN DE ACCIÓN MAESTRO — MISIÓN CIEN (REESTRUCTURACIÓN TOTAL)

**Versión:** 2.0 · **Fecha:** 2026-10-29 · **Rama:** task/aligned-20260727 @ f59eabd + WIP (45-49 rutas sin commitear)
**Alcance:** macro-reforma del sistema POS (Windows + Android + LAN + nube + impresión + actualización OTA).
**Fuentes consolidadas:** 5 investigadores (FC-A POS core, FC-B comandas, FC-C config/admin, FC-D fiscal/recursos, FC-E conectividad/updates) + auditoría principal 2026-10-28 + OPORD-MISION-CIEN-100 + CONTINUIDAD-OPORD (histórico).
**Memoria persistente:** Synapse id `b2cc907c…`, handoff `docs/maps/HANDOFF-CONTINUIDAD.md`.

---

## 0. DOCTRINA DE EJECUCIÓN (no negociable)

1. **Fuente canónica:** editar `app/`, publicar con `npm run sync` → `src/`. Prohibido editar `src/` directo (Tauri sirve `src/`, `frontendDist: "../src"`).
2. **Archivos críticos:** `npm run edit:scope -- <archivo> <símbolo>` antes del primer edit.
3. **Cierre:** `npm run test:sync-clinical` verde o justificación documentada de bloqueo ambiental.
4. **Prohibido el mock en validación final.** Mocks solo para desarrollo.
5. **Una tarea = un commit lógico** con ID de fase (`F3-T02`).
6. **Nada de cambios silenciosos.** Todo cambio de comportamiento se documenta.
7. **Sin dependencias nuevas** sin aprobación de AM y análisis de tamaño (WebView).
8. **Sin secretos en código.** Cualquier secreto hardcodeado es P0.
9. **No se acepta PASS sin evidencia** (comando, métrica o captura en `docs/maps/ops/evidencia/<TASK-ID>/`).
10. **Detención obligatoria** si aparece P0/P1 nuevo durante una fase.
11. **Verificar coherencia:** cambiar config X no debe romper Y; cada menú (impresión, dashboard meseros, etc.) debe estar conectado de punta a punta.
12. **Reducir consumo:** eliminar código muerto, llamadas repetidas, bundles inflados, estado caliente en localStorage.

---

## 1. INVENTARIO DE HALLAZGOS (consolidado de 5 investigadores)

### P0 — Bloquean operación / pérdida de venta / no actualizable / no comunica (26)

#### Cobro / factura (FC-A, FC-B, FC-E)
- P0-01 `cartDirecto` vacío en POS restaurante → `iniciarCobroDesdeCaja()` retorna temprano, no abre modal de cobro. `app/core/CrozzoPosMain.js:27257-27298`.
- P0-02 Factura POS sin guard por UUID → reintento/doble cobro duplica. `app/core/CrozzoPosMain.js:33083,33118-33119`.
- P0-03 Consecutivo no atómico entre cajas → duplicado. `app/core/pos/CrozzoPosConfigManager.js:661-666`.
- P0-04 Outbox fiscal truncado a 200 en silencio. `app/core/pos/CrozzoPosDianLib.js:480`.
- P0-05 `upsert_comanda_snapshot` descarta estado si la fila no existe → comanda atascada. `crozzo_lan_sync_server.rs:434`.
- P0-06 Aislamiento por mesa roto — 12/111 checks fallan → pedido perdido/duplicado al cambiar mesa. `scripts/_connectivity-orchestrator-check.mjs:545-559`.
- P0-07 Digest FNV UTF-8 (Rust) vs UTF-16 (JS) diverge → pull permanente/datos rancios. `crozzo_lan_sync_server.rs:996,216-223`; `CrozzoLanOpsSync.js:410`.
- P0-08 `saved_at=now_ms()` finge frescura. `crozzo_lan_sync_server.rs:996`.

#### Fiscal / contingencia (FC-D, FC-E)
- P0-09 Contingencia fiscal embarcada en `app/index.html:1211` pero **ausente en `src/index.html`** → APK no ejecuta contingencia/outbox. `src/modules/CrozzoContingenciaFiscal.js`.
- P0-10 Lock fiscal solo en proceso → doble timbrado entre ventanas/instancias. `CrozzoFiscalOutboxDrain.js:9,99`.

#### Actualización (FC-E)
- P0-11 **OTA roto**: pubkey embebida `A0EE9D152E5A3C9E` ≠ clave que firma releases `AD59656123565E0B` → ningún arreglo llega. `src-tauri/tauri.conf.json:57`.
- P0-12 **No se puede compilar** (sin MSVC/Windows SDK/NSIS) → no hay build reproducible. `cargo check` falla.
- P0-13 **Frontend divergente**: `src/index.html` (104.362 B) ≠ `app/index.html` (111.168 B). `tauri.conf.json` (`frontendDist: "../src"`).

#### Conectividad (FC-E)
- P0-14 mDNS anuncia `127.0.0.1` sin internet → descubrimiento LAN muere offline. `crozzo_mdns.rs:50-61`.
- P0-15 BLE mesh no transmite en Android (send retorna Ok sin transmitir). `crozzo_ble_mesh.rs:148,188`.
- P0-16 Hotspot solo Windows WinRT, sin ACL/límite de clientes. `crozzo_hotspot.rs:66`.
- P0-17 LAN WS `Handle::block_on` en contexto async (broadcast). `crozzo_lan_ws.rs:43-45`.
- P0-18 HTTP sin keep-alive (`Connection: close`). `crozzo_lan_sync_server.rs:308`.
- P0-19 Semáforo HTTP fijo en 64. `crozzo_lan_sync_server.rs:34`.
- P0-20 ACK de sync ausente en ACL → cola nunca purga, FIFO descarta. `CrozzoLanSyncBridge.js:743-744`; `permissions/crozzo-commands.toml`.
- P0-21 Sin `tauri-plugin-single-instance` → instancias compiten. `Cargo.toml`.
- P0-22 `crozzo_save_pdf_b64` no existe en Rust aunque JS lo invoca. `permissions/crozzo-print.toml:14`.
- P0-23 `crozzo_lan_sync_ack` registrado en Rust pero falta en ACL. `lib.rs:176`.

#### Seguridad (FC-B, FC-D, FC-E)
- P0-24 GET `/api/comandas` sin token + secreto de pareo hardcodeado. `crozzo_lan_sync_server.rs:852,980`; `CrozzoPairingSeal.js:14`.
- P0-25 Secreto de emparejamiento hardcodeado `CrozzoBonaOrigenPairSeal2026`. `CrozzoPairingSeal.js:14`.
- P0-26 `postMessage` sin validación de `origin` en diseñador de tickets. `app/core/CrozzoPosMain.js:44253-44255`.

### P1 — Degradación seria (18)

- Cloud REST sin retry/timeout propio; Realtime se corta al degradar WAN. `CrozzoPosCloud.js:889,906`.
- LAN HTTP sync POST serializado, timeout 5.5s; WS reconnect 4.2s + jitter; HTTP poll 12s. `CrozzoLanSyncBridge.js:238,632`; `CrozzoLanWebSocketBridge.js:406`.
- Gossip UDP: trama máx 7.800 B sin fragmentación; cola 256; 120 peers. `crozzo_gossip_udp.rs:12`.
- BLE desktop delega a UDP; en Android no hay fallback. `crozzo_ble_mesh.rs:148`.
- mDNS fallback a candidatos en memoria. `CrozzoMdnsBridge.js:96`.
- Comandos sin permiso (greet, append_dev_log, adq_enrich_*, hotspot_*) denegados con ACL activa. `lib.rs:96,100,158-164,184-188`.
- Estado caliente en `localStorage` (~5 MB) → trim. `CrozzoStorageHygiene.js:9`.
- Sync remoto sobrescribe carrito. `CrozzoPosMain.js`.
- Sin versionado de esquema de config. `CrozzoPosConfigManager.js`.
- Fallback frágil del hub de impresión: si `CrozzoPrintStudioHub` no carga, ignora `termicaPlantillas` por docType. `app/core/CrozzoPosMain.js:35473-35478`.
- Migración legacy→múltiple plantillas solo en hub. `CrozzoPrintStudioHub.js:334-361`.
- Permisos por rol: solo A/B, no existe rol C. `CrozzoBlePeerRegistry.js:125`.
- Polling adaptativo implementado pero sin cobertura del check de mesa. `CrozzoComandasCloudSync.js`.
- Mesero performance dashboard / RRHH / marcaciones: sin auditoría dedicada. (FC-B)
- Dead code / espejo sucio: `src/core/CrozzoPosMain.js.backup`, doble árbol en src/. `src/`.
- Idempotencia declarada pero no verificable en runtime Tauri. `CrozzoPosMain.js:30129/30143`.
- Corrupción con efecto retardado de `pos_dian_config` (FC-A).
- Conexión diseñador↔impresión no verificada (FC-A, FC-C parcialmente verificada: sí conectada con riesgos).

### P2 — Higiene / deriva (16)

- «100 dispositivos» no probado: máximo 10 contra mock. `qa-fleet-matrix.mjs:14,23`.
- QA de personas caído (6/6 P0): `ceo-qa.mjs:87,100`.
- Timers nominales 650/1800 ms con piso efectivo 700–3200 / 1800–4800. `CrozzoLanOpsSync.js:380-389`.
- `BlobStore`/`ComandaArchive` no cargados al arranque. `src/index.html`.
- `releases/latest.json` del repo no es el feed del updater (sin `platforms`/`signature`). `CrozzoTauriUpdater.js`.
- `src/` no se regenera en build local (sin `beforeBuildCommand`). `package.json:8`.
- Copia muerta `src/CrozzoPosMain.js` (1.012.628 B) vs `src/core/CrozzoPosMain.js` (2.387.011 B). `src/index.html`.
- Versión meta en `src/index.html` dice 1.0.231 mientras HEAD está 31 commits adelante. `src/index.html`.
- 45-49 rutas sin commitear. `git status`.
- `CrozzoContingenciaFiscal.js`/`CrozzoMotorImpuestos.js` existen pero no se embarcan. working tree vs tag.
- `app/` (60 MB) abandonado pero sigue siendo "fuente" del sync. `tauri.conf.json:7`.
- `makensis.exe` ausente (instalar NSIS). `Get-Command makensis`.
- Bundles generados en `app/bundles/` y `app/Crozzo_POS_Completo.html` (1.4 MB) duplicados en `src/` y `dist/`. `app/`.
- OCR bundles (`app/bundles/CrozzoBundleCompras.js`) 16k+ líneas en un solo archivo. `app/bundles/`.
- `localStorage` usado para contingencia sin limpieza documentada. `CrozzoContingenciaFiscal.js:83`.
- Onboarding/preservación en actualización no verificable. `app/core/CrozzoPosMain.js:44459-44467`.

### Hallazgo positivo (único)
- Diseñador de tickets POS ↔ impresión **sí está conectado**: cambios guardados en `facturacionAdmin.termicaPlantilla/termicaPlantillas` se consumen en `crozzoResolveTermicaTplForFactura` y pasan al flujo de impresión. `app/core/CrozzoPosMain.js:35463-35478,44086,44519-44520`.

---

## 2. COHERENCIA DE FEATURES (verificación cruzada)

| Feature | ¿Funciona? | ¿Conectado? | ¿Se preserva en update? | ¿Llamadas innecesarias? |
|---|---|---|---|---|
| Cobro | NO (P0-01) | Parcial | No verificado | Sí (sync remoto sobrescribe) |
| Factura | Parcial (sin guard UUID) | Sí | No versionado | Sí (outbox truncado) |
| Carrito | Parcial (sync sobrescribe) | Sí | No | Sí |
| Consecutivo | NO (no atómico) | Sí | No | — |
| Diseñador impresión | Sí | Sí (con fallback frágil) | No verificado | postMessage sin origin |
| Dashboard meseros | No auditado | No verificado | No | — |
| Comandas/mesas | Parcial (aislamiento roto) | Sí | No | Polling sin cobertura |
| Cocina KDS | Sí (auditado) | Sí | No | — |
| Fiscal/contingencia | NO (no embarcada) | No (módulo ausente en src/) | No | — |
| Conectividad LAN | Parcial (límites duros) | Sí | No | WS broadcast block_on |
| BLE mesh | NO en Android | No | No | — |
| OTA/updates | NO (pubkey mismatch) | No | No | — |
| mDNS | Parcial (muere offline) | Sí | No | — |

---

## 3. PLAN DE EJECUCIÓN (F0–F11, alineado con OPORD-MISION-CIEN-100)

### F0 — BASELINE Y DESBLOQUEO
| ID | Tarea | Resp. | PASS |
|---|---|---|---|
| F0-T01 | Congelar WIP en rama `wip/macro-20261029` | G2 | `git status` limpio en rama de trabajo |
| F0-T02 | Instalar toolchain Rust (MSVC Build Tools, Windows SDK, RC.EXE, link.exe, NSIS) | G2 | `cargo check` OK |
| F0-T03 | Medir volúmenes reales por entidad | G5 | `docs/maps/ops/volumenes.md` |
| F0-T04 | Dejar `_connectivity-orchestrator-check` en 0 fallos | G6 | 111/111 |
| F0-T05 | Registrar línea base de recursos | G5 | `metricas-base.json` |

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
| F2-T01 | Definir sobre versionado `{v,kind,deviceId,seq,hlc,epoch,dictId}` | A-SYNC-1 | Revisado por G3/G4 |
| F2-T02 | Implementar codec posicional/CBOR | A-SYNC-1 | Comanda ≤ 130 B |
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
| F4-T01 | HTTP keep-alive + pool de conexiones | A-COMM-2 | `Connection: keep-alive` |
| F4-T02 | Delta sync (`since` seq/timestamp) en `/api/comandas` y `/api/runtime` | A-SYNC-3 | Solo cambios |
| F4-T03 | Room-based subscriptions (área/mesa/interesados) | A-SYNC-3 | Sin broadcast masivo |
| F4-T04 | Semáforo HTTP configurable (no fijo 64) | A-SYNC-4 | Configurable por flota |

### F5 — COMPRESIÓN
| ID | Tarea | Resp. | PASS |
|---|---|---|---|
| F5-T01 | zstd diccionarios compartidos | A-PERF-2 | Comanda ≤ 130 B |
| F5-T02 | Compression Dictionary Transport | A-PERF-2 | RFC draft implementado |

### F6 — CIFRADO
| ID | Tarea | Resp. | PASS |
|---|---|---|---|
| F6-T01 | Emparejamiento con clave derivada (no hardcodeada) | A-SEC-1 | Sin secreto en código |
| F6-T02 | TLS/Noise en LAN | A-SEC-1 | Tráfico cifrado |
| F6-T03 | Cifrado en reposo (Keystore/DPAPI) | A-SEC-2 | Datos en reposo cifrados |
| F6-T04 | Validación de `origin` en `postMessage` | A-SEC-1 | Sin XSS/inyección |

### F7 — GATEWAY / LEASE
| ID | Tarea | Resp. | PASS |
|---|---|---|---|
| F7-T01 | Elección de caja por capacidad (no solo backup fijo) | A-COMM-5 | Elección determinista |
| F7-T02 | Epoch/fencing para failover | A-COMM-5 | Sin split-brain |
| F7-T03 | mDNS offline (no anunciar 127.0.0.1) | A-COMM-2 | Descubrimiento LAN offline |
| F7-T04 | BLE mesh transmitir en Android (no no-op) | A-COMM-3 | Transmisión real |
| F7-T05 | Hotspot multi-plataforma con ACL/límite | A-COMM-2 | Hotspot funcional |

### F8 — FISCAL
| ID | Tarea | Resp. | PASS |
|---|---|---|---|
| F8-T01 | Embarcar `CrozzoContingenciaFiscal.js` en `src/index.html` + sync | A-FISC-1 | Módulo cargado en APK |
| F8-T02 | Outbox fiscal sin truncamiento silencioso (guard por UUID) | A-FISC-2 | Sin pérdida de factura |
| F8-T03 | Lock fiscal entre procesos/ventanas (no solo en proceso) | A-FISC-2 | Sin doble timbrado |
| F8-T04 | Consecutivo atómico entre cajas | A-FISC-1 | Sin duplicado |
| F8-T05 | Idempotencia verificable en runtime Tauri | A-FISC-2 | 0 duplicados E2E |

### F9 — UX CAPACIDADES
| ID | Tarea | Resp. | PASS |
|---|---|---|---|
| F9-T01 | Pill P0: Sede lista / En local / Recuperando (nunca DEFCON/SEAL) | A-COMM-2 | UX estable |
| F9-T02 | Degradación explícita (usuario sabe qué puede/no) | A-COMM-2 | Sin confusión |
| F9-T03 | Aislamiento por mesa arreglado (round-trip) | A-SYNC-3 | 111/111 checks |
| F9-T04 | Cobro funcional: `cartDirecto` poblado, modal abre, factura genera | A-SYNC-1 | qa-personas PASS |

### F10 — AUDITORÍAS
| ID | Tarea | Resp. | PASS |
|---|---|---|---|
| F10-T01 | Reconstruir auditoría de personas (arnés real, sin mock) | A-QA-1 | Evidencia en `docs/maps/ops/evidencia/` |
| F10-T02 | Auditoría de escala (10 dispositivos reales + emulación) | A-QA-2 | Métricas reproducibles |
| F10-T03 | Inyección de fallos y caos (12 escenarios EH-01..EH-12) | A-QA-3 | 0 pérdida de datos |
| F10-T04 | Evidencia y trazabilidad (commit, comando, salida, hash, timestamp) | A-QA-4 | Formato §12 OPORD |

### F11 — CIERRE
| ID | Tarea | Resp. | PASS |
|---|---|---|---|
| F11-T01 | Runbooks y formación | A-DOC-1 | Documentación completa |
| F11-T02 | Actualizar OTA pubkey + re-firmar releases | G4 | `latest.json` válido |
| F11-T03 | Eliminar dead code (backup en src/, doble árbol, bundles duplicados) | G5 | Bundle reducido |
| F11-T04 | Split de bundles (OCR, compras) | G5 | Parse cost reducido |
| F11-T05 | `npm run test:sync-clinical` verde | G6 | Gate verde |

---

## 4. ORDEN DE EJECUCIÓN (acciones inmediatas)

1. **Congelar WIP:** `git checkout -b wip/macro-20261029` + commit (F0-T01).
2. **Instalar toolchain Rust + NSIS** (F0-T02).
3. **Sincronizar `app/` → `src/`** con `npm run sync`; verificar `src/index.html` contiene contingencia (F8-T01).
4. **Arreglar OTA:** regenerar pubkey o re-firmar releases (F11-T02).
5. **Arreglar aislamiento por mesa** (F9-T03).
6. **Arreglar cobro:** `cartDirecto` poblado (F9-T04).
7. **Migrar a Tokio async:** `block_on` → async (P0-17), keep-alive (P0-18), semáforo configurable (P0-19).
8. **Fix ACK en ACL** (P0-20), **single-instance** (P0-21), **PDF save** (P0-22).
9. **mDNS offline** (P0-14), **BLE mesh Android** (P0-15), **hotspot** (P0-16).
10. **Eliminar dead code** (P2, F11-T03).
11. **Reducir consumo:** localStorage→IndexedDB, trim, bundles split (F1/F11).

---

## 5. AUDITORÍA DE ASUNTOS INTERNOS (verificación de coherencia)

Antes de ejecutar, verificar que:
- Ninguna tarea se pise con otra (matriz RACI del OPORD §4.4).
- Cada cambio de config no rompa otra feature (ej. impresión: `CrozzoPrintStudioHub` + fallback legacy).
- El menú de personalización de impresiones POS está conectado (FC-C: sí, con riesgos P1).
- El dashboard de meseros de rendimiento sirve si está conectado (FC-B: no auditado — requiere auditoría dedicada).
- Cada actualización no rompa la configuración (sin versionado de esquema — P1).
- Recursos: eliminar código muerto, llamadas repetidas, bundles inflados (P2).

**Verificación en línea (coherencia técnica):**
- Tokio `block_on` en async: https://docs.rs/tokio/latest/tokio/runtime/struct.Handle.html → confirmado P0.
- Tungstenite `WebSocketConfig`: https://docs.rs/tungstenite/latest/tungstenite/protocol/struct.WebSocketConfig.html → confirmado.
- Límite BLE GATT Android: https://stackoverflow.com/questions/41365009/ → confirmado.
- Densidad Wi-Fi: https://documentation.meraki.com/ → confirmado.
- zstd diccionarios: https://github.com/facebook/zstd/blob/dev/programs/zstd.1.md → confirmado.
- Compression Dictionary Transport: https://datatracker.ietf.org/doc/draft-ietf-httpbis-compression-dictionary/ → confirmado.
- Noise Protocol: https://noiseprotocol.org/noise.html → confirmado.
- NIST GCM: https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf → confirmado.
- DIAN Res. 000227/2025: https://normograma.dian.gov.co/dian/compilacion/docs/resolucion_dian_0227_2025.htm → confirmado.
- Anexo Técnico FE v1.9: https://www.dian.gov.co/impuestos/factura-electronica/Documents/Anexo-Tecnico-Factura-Electronica-de-Venta-vr-1-9.pdf → confirmado.

---

## 6. MEMORIA PERSISTENTE

- **Synapse:** `npm run synapse:search -- "MISIÓN CIEN"` → memorias activas (158+).
- **Handoff:** `docs/maps/HANDOFF-CONTINUIDAD.md`.
- **Plan maestro:** `docs/maps/PLAN-MAESTRO-MACRO.md` + este `PLAN-MAESTRO-MACRO-v2.md`.
- **OPORD vigente:** `docs/maps/OPORD-MISION-CIEN-100.md` (§0 reconciliación).
- **CONTINUIDAD-OPORD.md:** histórico (H0–H4/L★/POE), no certifica.

---

## 7. PODA DE PESO MUERTO (hallazgos de sesión anterior, Operación Peine)

Consolidado de `docs/maps/ops/PODA-PESO-MUERTO.md` + `BITACORA-INVESTIGACION-TAURI.md`. Se ejecuta como **F0.5** (entre F0 y F1), después de congelar y antes de compilar. Nada se borra sin verificar que no se carga en `src/index.html` ni en `CrozzoLazyModules.js` ni por `createElement('script')` dinámico. Cada poda tiene PASS medible.

### Candidatos a poda (verificados)

| # | Candidato | Tamaño | Riesgo | Esfuerzo | Decisión |
|---|---|---|---|---|---|
| A | `app/` (60 MB, 179 scripts) | 60 MB | Bajo (archivar antes) | 1 h | **Archivar en branch + eliminar** |
| B | `src-tauri/target/` | 26 GB | Bajo | 5 min | **Limpiar** (`cargo clean` o borrar instaladores viejos) |
| C | Root stale `.js` en `src/` (13 archivos, incl. `CrozzoPosMain.js` duplicado) | 362 KB | Bajo | 2 h | **Eliminar** (trampa de parches) |
| D | 36 módulos no referenciados | 636 KB | Medio | 1 d | **Auditar y podar** |
| E | Vendor OCR (Tesseract 6 wasm + OpenCV) | ~50 MB | Alto | 2 d o 1 h | **Decidir en F0** (plugin lazy o amputar) |
| F | Print temp files (`crozzo-print/pdf-*.html`) | 1.2 MB | Bajo | 1 h | **Limpiar en startup** |
| G | IndexedDB huérfanos (dev artifacts) | dev artifacts | Bajo | 5 min | **Limpiar** |
| H | `releases/latest.json` (no es feed Tauri) | 7.9 KB | Bajo | 15 min | **Archivar o eliminar** |
| I | `crozzo-emulation.toml` (5 comandos sin capability) | 5 comandos | Medio | 1 h | **Decidir en F0** |
| J | `CONTINUIDAD-OPORD.md` (histórico) | — | Bajo | 5 min | **Archivar en `docs/maps/ops/historico/`** |

**Poda mínima (sin riesgo):** A + B + C + F + G + H + J → ~86 MB + 26 GB liberados, elimina la trampa del duplicado `CrozzoPosMain.js`.
**Poda completa (con decisión):** + D + E + I → hasta ~137 MB adicionales si se amputa OCR.

### Lo que NO se puede podar (y por qué)
- `src/core/CrozzoPosMain.js` (2,4 MB) — core del POS, cargado en `index.html:1146`.
- `src/bundles/*.js` (2 MB) — cargados dinámicamente (lazy).
- `src/vendor/*.js` (38 MB) — usados por bundles (OCR, PDF, Tesseract).
- `src-tauri/src/*.rs` (26 archivos) — código nativo, todos necesarios.
- `app/` sin archivar antes — única referencia del navegador abandonado.

### Decisión requerida del comandante (antes de F0.5)
1. **¿OCR es feature core?** Si sí → plugin lazy. Si no → amputar (ahorra 50 MB).
2. **¿Se archiva `app/` o se mantiene como referencia?** Recomendación: archivar en branch, eliminar del working tree.
3. **¿Se elimina `CrozzoEmulationHarness.js` si se elimina `crozzo-emulation.toml`?** Recomendación: sí.

### Auditoría de calidad (de sesión anterior)
- `mind:health` PASS.
- `test:sede-combat` PASS (16).
- `test:sync-clinical` PASS.
- `test:fleet-escala` (normal) APROBADA OK=10 FAIL=0.
- `test:fleet-escala:intensiva` APROBADA OK=17 FAIL=0 (hasta 100 dispositivos · 479ms).
- HTTP storm `_field-device-scale`: OK 2→100, 100-dev: 99/99 comandas · 166ms.
- Playwright Chromium instalado (requerido para flota).
- Escalones intensivos: 2–10 devs 9–33ms, 20 devs 104ms, 40 devs 174ms, 50 devs 272ms, 100 devs 479ms (flota) / 166ms (HTTP storm). Salón realista intensivo: 10 tablets + 5 PCs. Adversarial dedup: PASS.

### Mecanismos bajo lupa (STRESS-MILITARY-REVISION.md)
- Transporte LAN (WS + poll HTTP): HTTP sin keep-alive (P0-18), semáforo 64 (P0-19), polling intensivo 225 req/seg con 100 devs.
- Escritura síncrona a disco en cada operación.
- Sin límites de conexión concurrente.
- Límite de 800 comandas activas en memoria.
- Mecanismos que aguantan: WS broadcast, OpFanout multi-canal, OpAckRegistry idempotencia, ConnectivityOrchestrator cascada, BleMesh UDP gossip + WebBT + WebRTC, WifiDirectBridge, OfflineGossip.

### Plan de escalado (Identificado)
- Paso 1: Migrar a Tokio async (urgente) → P0-17.
- Paso 2: Long-polling + cache → F4.
- Paso 3: SQLite + shared memory → F1/F3.

### Conectividad legendaria (LEGENDARY-CONNECTIVITY-DRILLS.md)
- Definición PASS: WAN off 10 min → opera por LAN; caja ancla cae → re-ancla sin QR; vuelve red → sin thundering herd; pill P0 Sede lista/En local/Recuperando.
- Drills D1–Dn documentados en `docs/maps/LEGENDARY-CONNECTIVITY-DRILLS.md`.

### Escenarios cascada (ANALISIS-CASCADA-ESCENARIOS-50-DISP.md)
- Principios: un único canal activo; caja = autoridad para facturación/electrónica; elección determinista; idempotencia + dedup; anti-tormenta; autocorrección.
- Roles: A (caja/central), B (tablet), C (KDS/impresión — no existe aún).
- Escenarios analizados: caja con/sin internet, tablets con datos, hotspot, router caído, mesh/BLE.

### Informe consolidado (INFORME-ESCALADO-100-DISPOSITIVOS-CONSOLIDADO.md)
- Hallazgo clave: base sólida LAN-first híbrido ya existe; falta integrar y optimizar para 100 devs.
- Cuellos de botella: broadcast masivo (room-based subscriptions), snapshots completos (delta sync), N polls simultáneos (throttle + jitter), escritura síncrona disco (SQLite WAL + batch), sin límite conexión concurrente (semáforo + backpressure).

### INVESTIGACION-ESCALADO-100-DISPOSITIVOS.md
- Investigación forense con agentes especializados; estado actual por componente (LAN Server Rust bueno con semáforo 64, WS bueno, OpFanout bueno, OpAckRegistry bueno, ConnectivityOrchestrator bueno, BleMesh bueno, WifiDirectBridge bueno, OfflineGossip bueno).

### OPTIMIZACION-HALLAZGOS.json / OPTIMIZACION-PESOS.md / PLAN-MAESTRO-OPTIMIZACION-HORA-MAESTRA.md
- Hallazgos de optimización de pesos y rendimiento; plan maestro de optimización hora maestra.

### QA-HUMAN-AUTONOMOUS-METHODOLOGY.md
- Metodología de QA humano autónomo para auditoría de personas.

### EMPRESA-AGENTES-AUTONOMOS-DOCTRINA.md
- Doctrina de empresa de agentes autónomos.

### CERTIFICACION.md
- Estado de certificación: NO certificado.

### AGENTS.md (actualizado)
- Apunta a OPORD-MISION-CIEN-100.md como operación vigente; CONTINUIDAD-OPORD.md histórico.

---

## 7b. CRITERIO DE ÉXITO FINAL

Un mesero, un cajero, cocina y administración completan un turno completo bajo caos inyectado sin notar fallos, y el sistema converge al 100 % al restablecerse la red. Evidencia en `docs/maps/ops/evidencia/<TASK-ID>/` con commit, comando, salida, hash y timestamp. Sin mock en validación final.

**No se modificó código en esta investigación.** Toda afirmación citada a archivo:línea verificable en el árbol actual.
EOF