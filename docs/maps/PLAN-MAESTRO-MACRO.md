# PLAN MAESTRO MACRO — MISIÓN CIEN (consolidado de 5 investigadores)

**Fecha:** 2026-10-29 · **Rama:** task/aligned-20260727 @ f59eabd + WIP
**Fuentes:** FC-A (POS core), FC-B (comandas), FC-C (config/admin), FC-D (fiscal/recursos), FC-E (conectividad/updates). Solo lectura; no se modificó código.

## P0 — Bloqueantes (pérdida de venta / no actualizable / no comunica)

### Cobro / factura (FC-A, FC-B)
1. `cartDirecto` vacío en POS restaurante → `iniciarCobroDesdeCaja()` retorna temprano, no abre modal de cobro (FC-A). Cita `app/core/CrozzoPosMain.js:27257-27298`.
2. Factura POS sin guard por UUID → reintento/doble cobro duplica (FC-A, FC-E). `app/core/CrozzoPosMain.js:33083,33118-33119`.
3. Consecutivo no atómico entre cajas → duplicado (FC-A, FC-E). `app/core/pos/CrozzoPosConfigManager.js:661-666`.
4. Outbox fiscal truncado a 200 en silencio (FC-A, FC-D, FC-E). `app/core/pos/CrozzoPosDianLib.js:480`.
5. `upsert_comanda_snapshot` descarta estado si la fila no existe → comanda atascada (FC-B). `crozzo_lan_sync_server.rs:434`.
6. Aislamiento por mesa roto — 12/111 checks fallan, pedido perdido/duplicado al cambiar mesa (FC-B). `scripts/_connectivity-orchestrator-check.mjs:545-559`.
7. Digest FNV UTF-8 (Rust) vs UTF-16 (JS) diverge → pull permanente (FC-B, FC-E). `crozzo_lan_sync_server.rs:996,216-223`; `CrozzoLanOpsSync.js:410`.
8. `saved_at=now_ms()` finge frescura (FC-B). `crozzo_lan_sync_server.rs:996`.

### Fiscal / contingencia (FC-D)
9. Contingencia fiscal embarcada en `app/index.html:1211` pero **ausente en `src/index.html`** → APK no ejecuta contingencia/outbox (FC-D, FC-E). `src/modules/CrozzoContingenciaFiscal.js`.
10. Lock fiscal solo en proceso → doble timbrado entre ventanas (FC-B, FC-D). `CrozzoFiscalOutboxDrain.js:9,99`.

### Conectividad / actualización (FC-E)
11. **OTA roto**: pubkey embebida `A0EE9D152E5A3C9E` ≠ clave que firma releases `AD59656123565E0B` → ningún arreglo llega (FC-E). `src-tauri/tauri.conf.json:57`.
12. **No se puede compilar** (sin MSVC/Windows SDK/NSIS) → no hay build reproducible (FC-E). `cargo check` falla.
13. **Frontend divergente**: `src/index.html` (104.362 B) ≠ `app/index.html` (111.168 B) (FC-E).
14. **mDNS anuncia 127.0.0.1** sin internet → descubrimiento LAN muere offline (FC-E). `crozzo_mdns.rs:50-61`.
15. **BLE mesh no transmite en Android** (send retorna Ok sin transmitir) (FC-E). `crozzo_ble_mesh.rs:148,188`.
16. **Hotspot solo Windows WinRT**, sin ACL/límite (FC-E). `crozzo_hotspot.rs:66`.
17. **LAN WS `Handle::block_on` en contexto async** (broadcast) (FC-E). `crozzo_lan_ws.rs:43-45`.
18. **HTTP sin keep-alive** (`Connection: close`) (FC-E). `crozzo_lan_sync_server.rs:308`.
19. **Semáforo HTTP fijo en 64** (FC-E). `crozzo_lan_sync_server.rs:34`.
20. **ACK de sync ausente en ACL** → cola nunca purga, FIFO descarta (FC-E). `CrozzoLanSyncBridge.js:743-744`; `permissions/crozzo-commands.toml`.
21. **Sin `tauri-plugin-single-instance`** → instancias compiten (FC-E). `Cargo.toml`.
22. **`crozzo_save_pdf_b64` no existe en Rust** aunque JS lo invoca (FC-E). `permissions/crozzo-print.toml:14`.
23. **`crozzo_lan_sync_ack` registrado en Rust pero falta en ACL** (FC-E). `lib.rs:176`.

### Seguridad (FC-B, FC-D, FC-E)
24. GET `/api/comandas` sin token + secreto de pareo hardcodeado (FC-B, FC-E). `crozzo_lan_sync_server.rs:852,980`; `CrozzoPairingSeal.js:14`.
25. Secreto de emparejamiento hardcodeado `CrozzoBonaOrigenPairSeal2026` (FC-E). `CrozzoPairingSeal.js:14`.
26. `postMessage` sin validación de `origin` en diseñador de tickets (FC-C). `app/core/CrozzoPosMain.js:44253-44255`.

## P1 — Degradación seria

- Cloud REST sin retry/timeout propio; Realtime se corta al degradar WAN (FC-E). `CrozzoPosCloud.js:889,906`.
- LAN HTTP sync POST serializado, timeout 5.5s; WS reconnect 4.2s + jitter; HTTP poll 12s (FC-E).
- Gossip UDP: trama máx 7.800 B sin fragmentación; cola 256; 120 peers (FC-E). `crozzo_gossip_udp.rs:12`.
- BLE desktop delega a UDP; en Android no hay fallback (FC-E).
- mDNS fallback a candidatos en memoria (FC-E). `CrozzoMdnsBridge.js:96`.
- Comandos sin permiso (greet, append_dev_log, adq_enrich_*, hotspot_*) denegados con ACL activa (FC-E). `lib.rs:96,100,158-164,184-188`.
- Estado caliente en `localStorage` (~5 MB) → trim (FC-E). `CrozzoStorageHygiene.js:9`.
- Sync remoto sobrescribe carrito (FC-A). `CrozzoPosMain.js`.
- Sin versionado de esquema de config (FC-A, FC-C).
- Fallback frágil del hub de impresión: si `CrozzoPrintStudioHub` no carga, ignora `termicaPlantillas` por docType (FC-C). `app/core/CrozzoPosMain.js:35473-35478`.
- Migración legacy→múltiple plantillas solo en hub (FC-C). `CrozzoPrintStudioHub.js:334-361`.
- Permisos por rol: solo A/B, no existe rol C (FC-B, FC-E). `CrozzoBlePeerRegistry.js:125`.
- Polling adaptativo implementado pero sin cobertura del check de mesa (FC-B). `CrozzoComandasCloudSync.js`.
- Mesero performance dashboard / RRHH / marcaciones: sin auditoría dedicada (FC-B).
- Dead code / espejo sucio: `src/core/CrozzoPosMain.js.backup`, doble árbol en src/ (FC-D). `src/`.
- Idempotencia declarada pero no verificable en runtime Tauri (FC-D). `CrozzoPosMain.js:30129/30143`.

## P2 — Higiene / deriva / no bloquea hoy

- «100 dispositivos» no probado: máximo 10 contra mock (FC-B, FC-E). `qa-fleet-matrix.mjs:14,23`.
- QA de personas caído (6/6 P0): `ceo-qa.mjs:87,100` (FC-B).
- Timers nominales 650/1800 ms con piso efectivo 700–3200 / 1800–4800 (FC-B). `CrozzoLanOpsSync.js:380-389`.
- `BlobStore`/`ComandaArchive` no cargados al arranque (FC-B). `src/index.html`.
- `releases/latest.json` del repo no es el feed del updater (sin `platforms`/`signature`) (FC-E).
- `src/` no se regenera en build local (sin `beforeBuildCommand`) (FC-E).
- Copia muerta `src/CrozzoPosMain.js` (1.012.628 B) vs `src/core/CrozzoPosMain.js` (2.387.011 B) (FC-E).
- Versión meta en `src/index.html` dice 1.0.231 mientras HEAD está 31 commits adelante (FC-E).
- 45-49 rutas sin commitear (FC-E).
- `CrozzoContingenciaFiscal.js`/`CrozzoMotorImpuestos.js` existen pero no se embarcan (FC-E).
- `app/` (60 MB) abandonado pero sigue siendo "fuente" del sync (FC-E).
- `makensis.exe` ausente (instalar NSIS) (FC-E).
- Bundles generados en `app/bundles/` y `app/Crozzo_POS_Completo.html` (1.4 MB) duplicados en `src/` y `dist/` (FC-D).
- OCR bundles (`app/bundles/CrozzoBundleCompras.js`) 16k+ líneas en un solo archivo (FC-D).
- `localStorage` usado para contingencia sin limpieza documentada (FC-D). `CrozzoContingenciaFiscal.js:83`.
- Onboarding/preservación en actualización no verificable (FC-C). `app/core/CrozzoPosMain.js:44459-44467`.
- Diseñador de tickets ↔ impresión conectado (FC-C) — único hallazgo positivo.

## Fases propuestas (alineadas con OPORD F0–F11)

- **F0 Baseline y desbloqueo:** congelar WIP en rama, instalar toolchain Rust (E2), arreglar `_connectivity-orchestrator-check` a 0 fallos, línea base de recursos.
- **F1 Presupuesto de recursos:** sacar estado caliente de localStorage a IndexedDB/SQLite, manejo de QuotaExceededError, retención, topes duros.
- **F2 Contrato de datos:** sobre versionado, codec posicional/CBOR, compatibilidad de versiones.
- **F3 Log idempotente y reloj:** op_id UUIDv7 + HLC, append-only, idempotencia, compactación.
- **F4 Delta, rooms y HTTP:** delta sync, rooms, keep-alive, semáforo configurable.
- **F5 Compresión:** zstd diccionarios.
- **F6 Cifrado:** emparejamiento, claves, LAN TLS/Noise.
- **F7 Gateway/lease:** elección por capacidad, epoch/fencing, failover.
- **F8 Fiscal:** CUFE, contingencia, outbox, idempotencia, embarcar en src/.
- **F9 UX capacidades:** pill P0, degradación explícita.
- **F10 Auditorías:** personas, escala, caos (reconstruir).
- **F11 Cierre:** runbooks, formación, evidencia.

## Acciones inmediatas (orden de ejecución)
1. Congelar WIP: `git checkout -b wip/macro-20261029` + commit (F0-T01).
2. Instalar MSVC Build Tools + Windows SDK + NSIS (F0-T02).
3. Sincronizar `app/` → `src/` con `npm run sync` y verificar `src/index.html` contiene contingencia (F8/F0).
4. Arreglar OTA: regenerar pubkey o re-firmar releases (P0-11).
5. Arreglar aislamiento por mesa (P0-6).
6. Arreglar cobro: `cartDirecto` poblado (P0-1).
7. Migrar a Tokio async: `block_on` → async (P0-17), keep-alive (P0-18), semáforo configurable (P0-19).
8. Fix ACK en ACL (P0-20), single-instance (P0-21), PDF save (P0-22).
9. mDNS offline (P0-14), BLE mesh Android (P0-15), hotspot (P0-16).
10. Eliminar dead code: backup en src/, doble árbol, bundles duplicados (P2).
11. Reducir consumo: localStorage→IndexedDB, trim, bundles split (P1/P2).

**No se modificó código.** Toda afirmación citada a archivo:línea verificable.
EOF