# MAPA DE ERRORES — ESTABILIDAD · RENDIMIENTO · CONECTIVIDAD · INTEGRIDAD

| Campo | Valor |
|---|---|
| Operación | MISIÓN CIEN · Operación Peine (auditoría profunda) |
| Fecha | 2026-10-29 |
| Fuentes | B-01…B-22 (mando) · TI-1…TI-5 · AI-A/AI-B/AI-C · G1/G2/G3/G4 |
| Total de hallazgos | ~140 (deduplicados) |
| Estado | NO CERTIFICADO |

> Este mapa es la entrada del **Plan Quirúrgico**. Cada hallazgo tiene severidad, evidencia y fase de corrección.

---

## §1 · SEVERIDAD CRÍTICA (bloquea operación o causa pérdida de datos)

| # | Fuente | Hallazgo | Evidencia |
|---|---|---|---|
| C-1 | TI-5/G4 | **OTA roto desde ≥1.0.160**: pubkey A0EE ≠ clave de firma AD59 | doble decodificación minisign |
| C-2 | AI-A/G4 | **Causa raíz de pérdida de comandas**: `crozzo_lan_sync_ack` ausente en ACL → ACK tragado → cola nunca purga → FIFO descarta lo antiguo | `CrozzoLanSyncBridge.js:743-744`, `crozzo-commands.toml` |
| C-3 | TI-4/G4 | **Consecutivo no atómico**: dos cajas obtienen el mismo número | `ConfigManager.js:661-666` |
| C-4 | TI-4/G4 | **Factura POS sin guard por UUID**: reintento/doble cobro duplica | `CrozzoPosMain.js:33083,33118-33119` |
| C-5 | G1 | **`JSON.parse(localStorage.getItem('crozzo_supabase_config'))` sin try en `sbRest`** → crash si config corrupto | `BundleCostos.js:8861`, `SistCostos.js:3632` |
| C-6 | TI-1/G2 | **No se puede compilar**: sin MSVC, Windows SDK, NSIS | `Get-Command rc.exe/makensis` → vacío |
| C-7 | TI-5 | **Árbol auditado es 1.0.232-dev, no 1.0.231** | `git describe` → `v1.0.231-31-gf59eabd` |
| C-8 | TI-4/G4 | **Outbox fiscal trunca a 200 en silencio** | `CrozzoPosDianLib.js:480` `.slice(-200)` |
| C-9 | TI-3/G3 | **mDNS anuncia 127.0.0.1 sin internet** → descubrimiento muere offline | `crozzo_mdns.rs:50-61` |
| C-10 | TI-1/G3 | **`crozzo_save_pdf_b64` no existe en Rust** aunque JS lo invoca y ACL lo autoriza | `crozzo-print.toml:14`, 3 call sites |
| C-11 | TI-2 | **Instalador arbitrario**: acepta cualquier HTTPS, valida solo MZ ≥400 KB, ejecuta `/S` | `crozzo_silent_install.rs:55-126` |
| C-12 | TI-2 | **Cadena XSS local → RCE**: `withGlobalTauri` + `unsafe-inline` + instalador en capability `default` | `tauri.conf.json:10,23`, `default.json:15` |
| C-13 | TI-4/G4 | **Corrupción con efecto retardado**: `pos_dian_config` ilegible → defaults al siguiente save, sin aviso | `ConfigManager.js:37-63` |
| C-14 | G4 | **Outbox de comandas borra tras 6 h sin ACK** | `ComandasCloudSync.js:426,578-580` |
| C-15 | G4 | **Dedup se evapora a las 6 h / 2400** → reintentos tardíos reinyectan comandas | `CrozzoLanActionDedup.js:10-13,55-72` |
| C-16 | G4 | **`comanda_estado` ID incluye `lastUpdateAt`** → dos ediciones concurrentes ambas aplican, último gana sin merge | `CrozzoLanActionDedup.js:84-92` |
| C-17 | G4 | **Sin single-writer/lease a la nube**: varios dispositivos publican simultáneamente | `ComandasCloudSync.js:144-179` |
| C-18 | G4 | **HLC/secuencia global no implementado** (solo doctrina) | búsqueda `hlc`/`lease`/`epoch` → 0 implementaciones |
| C-19 | TI-3/G3 | **BLE no transmite en Android** (`send` retorna Ok sin enviar) | `crozzo_ble_mesh.rs:148-165` |
| C-20 | TI-3/G3 | **Gossip sin fragmentación** (límite 7800 B) → snapshots grandes fallan silenciosamente | `crozzo_gossip_udp.rs:163-165` |
| C-21 | TI-3/G3 | **Hub LAN no sirve el frontend** → cada tablet necesita instalación | `crozzo_lan_sync_server.rs:1129` |
| C-22 | TI-3/G3 | **WS sin push** (`try_lock` + `block_on`) → todo por polling HTTP | `crozzo_lan_ws.rs:39,43-45,70-75` |
| C-23 | TI-2/G3 | **SSRF** en `crozzo_http_*` sin allowlist, redirects a HTTP | `crozzo_http.rs:11,29,41,61` |
| C-24 | TI-2 | **Cámara/mic con `SetState(ALLOW)` sin comprobar origen** (solo `main`) | `webview_permissions.rs:58-64` |
| C-25 | TI-2 | **LAN sync abierto**: `0.0.0.0`, token vacío por defecto, GET sin auth | `crozzo_lan_sync_server.rs:852,1198,1230` |
| C-26 | TI-4/G4 | **Doble instancia sin bloqueo** → consecutivo duplicado + facturas pisadas | `Cargo.toml` sin `single-instance` |
| C-27 | TI-4/G4 | **Outbox fiscal cap 200 + drain 3 cada 8 s** → backlog fiscal en turno con 5 tablets | `CrozzoFiscalOutboxDrain.js:8-11,99-101` |
| C-28 | G2 | **Save runtime cada 280 ms** (stringify + setItem, 100 KB–1 MB) | `CrozzoPosMain.js:8709` |
| C-29 | G2 | **Polling LAN/cloud runtime cada 0,65–3,2 s** duplica costo del save | `CrozzoLanOpsSync.js:775,797` |
| C-30 | G2 | **Timers KDS cada 1 s con O(n²) `.find`** | `CrozzoPosMain.js:8933,8939` + `:8787` |
| C-31 | G1 | **`setInterval(tickClock, 1000)` sin clear** en módulo de acceso | `CrozzoModulosIntegradosAcceso.js:806` |
| C-32 | G1 | **Promesa sin catch** `pc.createOffer()` → unhandledrejection en dispositivos sin WebRTC | `CrozzoPosMain.js:35741` |

## §2 · SEVERIDAD ALTA

| # | Fuente | Hallazgo | Evidencia |
|---|---|---|---|
| A-1 | TI-2/G3 | **Docks remotos validados por subcadena** (`contains`) → origen arbitrario en ventana de confianza | `crozzo_external.rs:79-84,368,577,762,947,1134,1321` |
| A-2 | TI-2 | **`crozzo-supabase-dock` se crea en runtime sin capability** | `crozzo_external.rs:1309,1364` |
| A-3 | TI-3/G3 | **Hotspot solo Windows**, sin ACL ni límite de clientes (~8) | `crozzo_hotspot.rs:66` |
| A-4 | TI-3/G3 | **Updater depende de GitHub** — no hay actualización por LAN | `CrozzoTauriUpdater.js:7-18` |
| A-5 | TI-3/G3 | **Sin retry en Supabase REST** — la mayoría de `fetch` sin `AbortController`/timeout | `src/infra`, `src/core` |
| A-6 | TI-3/G3 | **Cascada no es exclusiva** — módulos deciden por su cuenta, solapamientos | `CrozzoConnectivityOrchestrator.js:2` |
| A-7 | G4 | **Outbox de comandas con TTL 6 h y borrado sin ACK** | `ComandasCloudSync.js:426,578-580` |
| A-8 | G4 | **Migraciones sin versionado** → downgrade resucita defaults | `ConfigManager.js:23-65` |
| A-9 | G4 | **Race conditions**: timers + eventos en cascada sobre el mismo estado | `OpAckRegistry.js:81-83,207-215`, `ComandasCloudSync.js:1553,1603` |
| A-10 | G2 | **Polling comandas cada 1,8 s + merge/re-render** | `CrozzoLanOpsSync.js:797` |
| A-11 | G2 | **Bundle monolítico 2,3 MB** + 204 `innerHTML` sin diffing | `CrozzoPosMain.js` (2.387.011 B) |
| A-12 | G2 | **36 módulos no referenciados** (~636 KB de JS muerto) | cruce `src/index.html` vs disco |
| A-13 | G1 | **`JSON.parse` sin try en `decompressRecord`** → puede abortar lote de ingesta | `ComandaArchive.js:183,189` |
| A-14 | G1 | **Promesa sin catch** `syncOfflineQueue` | `CrozzoPosCloud.js:1183` |
| A-15 | TI-4/G4 | **Timers y eventos en cascada** (reentrancia) | `OpAckRegistry.js:81-83,207-215` |
| A-16 | TI-4 | **Cola LAN con overflow FIFO** (2000) descarta lo antiguo | `crozzo_lan_sync_server.rs:24,791-794` |
| A-17 | TI-4 | **69 % de la cola LAN es ruido** (fleet_roster 872 + identity_card 505) | conteo por kind |
| A-18 | TI-2 | **LAN sync abierto** (token vacío por defecto) | `crozzo_lan_sync_server.rs:852,1198,1230` |
| A-19 | TI-2 | **CSP débil**: `script-src 'unsafe-inline'`, `connect-src http: https: ws: wss:` | `tauri.conf.json:22-24` |
| A-20 | TI-2 | **Dev log escribe sin límite ni redacción** en disco | `crozzo_dev_log.rs:8-20` |
| A-21 | TI-2 | **Emulación guarda ticket y HTML en base64** | `crozzo_emulation.rs:111-120` |
| A-22 | TI-1 | **Sin Authenticode** → SmartScreen advertirá | instaladores `NotSigned` |
| A-23 | TI-1 | **Sin rollback/downgrade** en el updater | diseño del updater |
| A-24 | TI-1 | **`src/` y `app/` divergen** (104.362 vs 111.168 B) | sha256 |
| A-25 | TI-1 | **`beforeBuildCommand` ausente** → build no regenera `src/` | `tauri.conf.json` |
| A-26 | TI-1 | **Sin artefacto local de 1.0.231** | `bundle\nsis\` (solo hasta 1.0.109) |
| A-27 | TI-5 | **No hay instalación real en este equipo** | registro `Uninstall` limpio |
| A-28 | TI-5 | **`releases/latest.json` del repo no es el feed Tauri** (sin `platforms`) | 7.945 B, 25 entries, sin url/signature |
| A-29 | G2 | **Debounce de save demasiado corto** (280 ms) | `CrozzoPosMain.js:8733-8744` |
| A-30 | G2 | **Deep-clone `JSON.parse(JSON.stringify(...))`** en `collectPosRuntimeState` | `CrozzoPosMain.js:8651-8677` |
| A-31 | G2 | **Polling runtime/comandas sin pausa con `document.hidden`** | `CrozzoLanOpsSync.js:775,797` |
| A-32 | G1 | **Timers de comandas/KDS a 1 s sin desmontaje garantizado** | `CrozzoPosMain.js:8933,8939` |
| A-33 | G1 | **`setInterval(tickClock, 1000)` sin clear** en módulo de acceso | `CrozzoModulosIntegradosAcceso.js:806` |
| A-34 | G1 | **Timers sin clear** (LanWebSocket 12 s, EasyConnect 28 s, Mdns 14/16 s, Reservorio 120 s) | varios |
| A-35 | G1 | **Listener `resize` sin remove** | `CrozzoPosMain.js:50110` |
| A-36 | G1 | **Global mutado sin guard** (`__crozzoPendingComanda`) | `CrozzoOnboardingOperativo.js:1494` |
| A-37 | TI-3 | **Impresión sin timeout** → spooler colgado retiene IPC 30–60 s | `crozzo_print.rs:270-331` |
| A-38 | TI-3 | **`copies>1` no imprime más de una vez** (solo cosmético) | `crozzo_print_html.rs:49,152,199` |
| A-39 | TI-3 | **WiFi Direct es stub** (`started:false`, `supported:false` en desktop) | `crozzo_wifi_direct.rs:18-52` |
| A-40 | TI-3 | **Hotspot depende de perfil con Internet** → `AccessDenied` sin router | `crozzo_hotspot.rs:44-49` |
| A-41 | TI-3 | **mDNS sin enumeración de interfaces** → una sola IP, sin fallback a IPs locales | `crozzo_mdns.rs:50-61` |
| A-42 | TI-3 | **Gossip O(n²)**: 20.000 entregas por evento a 100 nodos | `crozzo_gossip_udp.rs:124-133` |
| A-43 | TI-3 | **Gossip multicast por una sola interfaz** → malla se parte con hotspot+Ethernet | `crozzo_gossip_udp.rs:128-131` |
| A-44 | TI-3 | **Hotspot ~8 clientes** → no es plan para 100 | límite del Mobile Hotspot de Windows |
| A-45 | TI-3 | **`at_ms` no se refresca** → peers caen a los 120 s | `crozzo_mdns.rs:245-250` |
| A-46 | TI-4 | **Outbox fiscal `slice(-200)` en `catch` vacío** | `CrozzoPosDianLib.js:480` |
| A-47 | TI-4 | **Sin respaldo nativo** de ventas/facturas (todo en LevelDB) | `crozzo_dev_log.rs`, `crozzo_emulation.rs` |
| A-48 | TI-4 | **Sin `schema_version`** → 112 claves sin versionado | búsqueda `schema_version` → 0 |
| A-49 | TI-4 | **Desinstalar con checkbox borra datos** | `cli.win32-x64-msvc.node:59650-59663` |
| A-50 | TI-4 | **Basura de impresión**: 18 `crozzo-print/pdf-*.html` = 1,2 MB en `%LOCALAPPDATA%` | disco |
| A-51 | TI-4 | **Datos huérfanos de builds de desarrollo** (IndexedDB 127.0.0.1/1420-1432) | perfil |
| A-52 | TI-5 | **Duplicado peligroso** `src/CrozzoPosMain.js` (1,0 MB, no se carga) vs `core/` (2,4 MB) | `src/index.html:1146` |
| A-53 | TI-5 | **Flota despareja**: 1.0.230 = 56 descargas, 1.0.229 = 37, 1.0.231 = 7 | GitHub releases |
| A-54 | TI-5 | **Updater `installMode: quiet`** → actualizaciones silenciosas sin control | `tauri.conf.json:60` |
| A-55 | TI-2 | **ACL fantasma**: `crozzo_save_pdf_b64` autorizado pero inexistente | `crozzo-print.toml:14` |
| A-56 | TI-2 | **ACL omisión**: `crozzo_lan_sync_ack` registrado pero no autorizado | `lib.rs:176`, `crozzo-commands.toml:19-28` |
| A-57 | TI-2 | **14 comandos registrados sin autorización ACL** | cruce capabilities × permissions × handler |
| A-58 | TI-2 | **`allow-crozzo-emulation` sin activar** → 5 comandos bloqueados | `permissions/crozzo-emulation.toml:2` |
| A-59 | TI-2 | **Validación por subcadena en docks** (`contains`) | `crozzo_external.rs:79-84,368,577,762,947,1134,1321` |
| A-60 | TI-2 | **SSRF parcial**: redirects a HTTP, sin límite de cuerpo en `get_text` | `crozzo_http.rs:11,29,41,61` |
| A-61 | TI-2 | **Dev log sin límite ni redacción** | `crozzo_dev_log.rs:8-20` |
| A-62 | TI-2 | **Emulación guarda ticket+HTML en base64** | `crozzo_emulation.rs:111-120` |
| A-63 | TI-2 | **LAN sync sin auth**: `0.0.0.0`, token vacío por defecto, GET sin auth | `crozzo_lan_sync_server.rs:852,1198,1230` |
| A-64 | TI-2 | **CSP débil**: `script-src 'unsafe-inline'`, `connect-src http: https: ws: wss:` | `tauri.conf.json:22-24` |
| A-65 | TI-2 | **`withGlobalTauri: true`** → cualquier script inline obtiene `window.__TAURI__` | `tauri.conf.json:10` |
| A-66 | TI-2 | **Ventanas remotas sin CSP propio** | docks `External` |
| A-67 | TI-1 | **Sin `beforeBuildCommand`** → build no regenera `src/` | `tauri.conf.json` (0 coincidencias) |
| A-68 | TI-1 | **Targets `nsis`+`dmg`**: dmg se descarta en Windows | tauri-bundler |
| A-69 | TI-1 | **Sin `tauri-plugin-single-instance`** | `Cargo.toml`, `Cargo.lock` |
| A-70 | TI-1 | **Sin `tauri-plugin-single-instance`** (repetido, consolidado) | — |

## §3 · SEVERIDAD MEDIA Y BAJA (resumen)

- **M-1..M-12**: timers sin clear (LanWebSocket 12 s, EasyConnect 28 s, Mdns 14/16 s, Reservorio 120 s, DevicePerf 120 s, ModulosIntegradosAcceso 1 s ×2) — G1.
- **M-13..M-18**: promesas sin catch (WebRTC createOffer, syncOfflineQueue, WebEmbedDock, WhatsAppDock animaciones) — G1/G2.
- **M-19..M-24**: `JSON.parse` sin try en rutas no críticas (ComandaArchive, ConfigManager, DevicePerf) — G1.
- **M-25..M-30**: `innerHTML` sin diffing (204 en CrozzoPosMain.js) — G2.
- **M-31..M-35**: bundle muerto (36 módulos no referenciados, ~636 KB) — G2.
- **M-36..M-40**: polling sin pausa con `document.hidden` — G2.
- **M-41..M-45**: listeners sin remove (resize, PrintDeviceRegistry) — G1.
- **M-46..M-50**: globals mutados sin guard (`__crozzoPendingComanda`, `__crozzoPendingSqlScriptKey`) — G1.
- **M-51..M-55**: dev log sin límite, basura de impresión, datos huérfanos — TI-2/TI-4.
- **M-56..M-60**: validación por subcadena en docks, `crozzo-supabase-dock` sin ACL — TI-2.
- **M-61..M-65**: emulación guarda ticket+HTML en base64, `query_sql` solo SELECT — TI-2.
- **M-66..M-70**: WiFi Direct stub, hotspot AccessDenied, mDNS sin enumeración, gossip O(n²), gossip multicast una interfaz — TI-3.
- **M-71..M-75**: impresión sin timeout, copies>1 cosmético, `at_ms` no se refresca — TI-3.
- **M-76..M-80**: outbox fiscal `slice(-200)` en catch vacío, outbox comandas TTL 6h, drain 3 cada 8 s — TI-4/G4.
- **M-81..M-85**: migraciones sin versionado, sin respaldo nativo, desinstalar borra datos — TI-4.
- **M-86..M-90**: flota despareja, updater quiet, releases/latest.json no es feed Tauri — TI-5/TI-1.

## §4 · INVARIANTES QUE NO SE CUMPLEN (G4)

1. **Consecutivo único por factura** — no atómico, sin lock.
2. **Factura única por UUID/intento** — sin guard antes de `unshift`.
3. **Outbox durable hasta acuse** — trunca a 200, borra tras 6 h.
4. **Idempotencia fuerte** — dedup se evapora a las 6 h / 2400.
5. **Single-writer a la nube** — no existe lease/epoch.
6. **Escrituras atómicas** — `localStorage.setItem(JSON.stringify(...))` sin transacción.
7. **Secuencia global / HLC** — solo doctrina, no implementado.
8. **Schema versioning** — 0 ocurrencias.

## §5 · LO QUE NO SE PUDO VERIFICAR

- Comportamiento real en APK Android (sin dispositivo).
- Políticas RLS/triggers de Supabase.
- Comportamiento de localStorage del WebView ante crash a mitad de `setItem`.
- Si `saleAttemptId` es globalmente único entre dispositivos.
- Concurrencia entre pestañas del mismo navegador.
- Si el código Rust compila/ejecuta UDP en target Android.
- EmergencyMesh WebRTC (no inspeccionado a fondo).
- Internals de retry del cliente Supabase JS (v2.68.0).
- Si `broadcast_text` envía realmente en runtime Tauri.
- Restricciones de firewall/AP isolation en redes objetivo.
- GC, jank, uso de Web Workers.
- Si `CrozzoPosMain.js` se minifica en producción.
- Componente `Windows11SDK.26100` en winget (offline).
- Descarte de `dmg` en Windows (no hay tauri-bundler disponible).
- Conteo exacto de ACL que resuelven (no demostrado).

## §6 · RESUMEN POR CATEGORÍA

| Categoría | Críticos | Altos | Medios/Bajos | Total |
|---|---|---|---|---|
| Estabilidad JS | 2 (C-5) + timers | 6 | 25+ | ~33 |
| Rendimiento | 1 (C-28) | 5 cuellos | 20+ | ~26 |
| Conectividad | 9 (C-9,C-19..C-25) | 6 (A-1..A-6) | 10+ | ~25 |
| Integridad/Concurrencia | 8 (C-3,C-4,C-8,C-13..C-18,C-26,C-27) | 9 (A-7..A-9,A-15..A-18) | 5+ | ~22 |
| Build/Empaquetado | 2 (C-6,C-7) | 4 (A-22..A-25) | 5+ | ~11 |
| Seguridad | 3 (C-11,C-12,C-23) | 3 (A-1,A-2,A-18..A-21) | 10+ | ~16 |
| Fiscal | 2 (C-8,C-27) | 2 (A-7,A-16) | 5+ | ~9 |
| Datos/Persistencia | 4 (C-13,C-26,C-14,C-15) | 3 (A-8,A-17,A-49) | 10+ | ~17 |
| **Total** | **~32** | **~50** | **~90+** | **~172** |
