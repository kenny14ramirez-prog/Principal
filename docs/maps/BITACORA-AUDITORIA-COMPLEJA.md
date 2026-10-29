# BITÁCORA DE AUDITORÍA COMPLEJA — MISIÓN CIEN

**Fecha:** 2026-10-29 · **Rama:** wip/macro-20261029
**Alcance:** auditoría interna completa del proyecto "sistema pos" (Crozzo POS): UI/UX, facturas/fiscal, inventario, impresoras, multi-day, seguridad, conectividad, agentes humanos (roles), causa raíz de 5 P0, integración cross-sistema.
**Fuentes:** 10 investigadores en paralelo (UI/UX, invoice/fiscal, inventario, printer, multi-day, causa raíz 5 P0, seguridad, conectividad, agentes humanos, integración cross-sistema) + auditoría principal 2026-10-28 + OPORD-MISION-CIEN-100.
**Memoria persistente:** Synapse (23+ memorias) + handoff + plan v2 + contención + runbook OTA + SQL.

---

## 1. RESUMEN EJECUTIVO

| Dimensión | P0 | P1 | P2 | Estado |
|---|---|---|---|---|
| UI/UX (menús, animaciones, overlays) | 3 | 5 | 4 | Funcional con riesgos de stacking/ACL |
| Facturas/fiscal (CUFE, DIAN, contingencia) | 7 | 7 | 5 | **Bloqueado** (cobro no genera factura) |
| Inventario (entrada/salida/ajustes/reversión) | 4 | 5 | 4 | Reversión asimétrica (P0) |
| Impresoras (diseñador, config, resolución) | 3 | 10 | 4 | Conectado con pérdida de config |
| Multi-day (recursos, timers, cuotas) | 4 | 5 | 4 | Crash por cuota en día 8-12 |
| Seguridad (secretos, auth, CVEs, XSS) | 12 | 11 | 9 | **Crítico** (secretos estáticos, auth desactivable) |
| Conectividad (LAN, WS, BLE, mDNS, failover) | 9 | 6 | 5 | **Crítico** (mDNS 127.0.0.1, failover sin epoch) |
| Agentes humanos (cajero, mesero, admin, bodega) | 6 | 12 | 8 | Cajero/Admin bloqueados, Mesero parcial |
| Causa raíz 5 P0 | 5 | — | — | Diseño + implementación |
| Integración cross-sistema | 3 | 7 | 3 | 3 cadenas rotas (fiscal, PDF, permisos) |

**Total hallazgos únicos: ~95 (P0: ~50, P1: ~25, P2: ~20).**

---

## 2. DIMENSIÓN 1: UI/UX (MENÚS, ANIMACIONES, OVERLAYS)

### P0
1. **Stacking/z-index caótico** — modal-overlay z-index 1000 vs sidebars 9998-150000; backdrop no cubre menú lateral. (`CrozzoPosStyles.css:5164,1391,1946,1956,1986,31637,31653,36459`)
2. **ACL con `!important` agresivo** — `.crozzo-nav-acl-hidden` display:none !important; si applyAccessControl no limpia en remount, ítem queda invisible sin respuesta. (`CrozzoPosStyles.css:30696-30717`, `CrozzoPosMain.js:13164-13332`)
3. **Menús ocultos por defecto sin affordance** — `app/index.html:341` `li-menu-diag-comunicacion` nace hidden; sin mensaje de "sin permiso".

### P1
4. Sidebar hover frágil (KI-035, oscilación al scrollear) — `CrozzoSidebarNav.js`, `CrozzoPosStyles.css`.
5. Dashboard meseros depende de módulo opcional (si no carga, hueco silencioso) — `CrozzoPosMain.js:18597-18603`, `app/index.html:1169`.
6. Modal overlay base z-index por debajo de chrome — `CrozzoPosStyles.css:5164`.
7. Visibilidad de menús mutada inline (debugging difícil) — `CrozzoPosMain.js:13164-13183,13320-13332`.
8. `initConfigComandas` vacío — no reinicializa tras remount — `CrozzoPosMain.js:43748`.

### P2
9. 214 @keyframes, 537 transitions, 440 animations sin presupuesto centralizado.
10. Responsive con overrides dispersos (breakpoints en 27734, 38867, 74732).
11. Elementos inicialmente hidden sin fallback visual (sidebarImgPlatform, headerGreeting, toolbarTabletQr, userMenuTier, userMenuTabletQrItem).
12. Overlay de carga puede quedar bloqueando (spinner infinito).

### Menús verificados (conectividad)
| Menú | Entrada UI | Render/init | Estado |
|---|---|---|---|
| Impresión comandas | `app/index.html:338` | `CrozzoPosMain.js:43671` renderConfigComandas, `:43748` init (vacío) | Conectado |
| Impresión facturas | `app/index.html:342` | `CrozzoPosMain.js:44112` renderConfigFacturasAdmin, `:44244` init | Conectado |
| Reportes/dashboard | `app/index.html:288` | `CrozzoPosMain.js:17171` case inventarios | Conectado |
| Dashboard meseros | Embebido en Reportes (tabs equipo/operativo) | `CrozzoPosMain.js:18597-18603` + CrozzoStaffOpsReport | Conectado, depende de módulo |
| Configuración | `app/index.html:330-367` | `CrozzoPosMain.js:17286-17345` | Conectado |

---

## 3. DIMENSIÓN 2: FACTURAS/FISCAL

### P0
1. **Factura no se guarda / cobro sin registro** — `qa-personas` facturas 0→0; `CrozzoPosMain.js:32951` facturar, `:33144-33145` unshift+save POS, `:33326-33327` FE.
2. **Cadena fuente→build cortada** — sync parte de Crozzo_POS_Completo.html (155 scripts) no app/index.html (179). `sync-frontend-to-src.mjs:140,223`.
3. **Contingencia no encola bien** — encolarDocumento pasa objeto a save (espera array); saveAll inexistente; persistirSQLite fantasma. `CrozzoContingenciaFiscal.js:113,189-190,233-241`; `CrozzoPosDianLib.js:477-481`.
4. **Outbox fiscal trunca a 200** silencioso + enqueue sin dedupe. `CrozzoPosDianLib.js:480,484-489`.
5. **Consecutivo no atómico** — `CrozzoPosConfigManager.js:661-666`.
6. **Factura POS sin guard UUID** — `CrozzoPosMain.js:33109,33144`.
7. **Corrupción con efecto retardado** — `CrozzoPosConfigManager.js:37-63,453-455`.

### P1
8. CUFE débil + sin validación duplicado — `CrozzoPosDianLib.js` calcularCUFE, `CrozzoPosMain.js:33099`.
9. Timbrado bloqueado sin PT; error no persiste factura — `CrozzoPosDianLib.js` timbrarFactura, `CrozzoPosMain.js:33175-33200`.
10. Nota crédito/débito no cableada — `CrozzoPosDianLib.js:319,388` (0 llamadores).
11. Anulación parcial/persistencia condicionada — `CrozzoReversionInventario.js:204,220-230`.
12. Impresora fuzzy-match — `CrozzoPrintService.js:130-145,95-125`.
13. Diseñador no aplicado a impresión real — `CrozzoPrintStudioHub.js:440,1002,2532` (guardado) vs `CrozzoPrintService.js` (0 refs a printOutputs/termicaModos).

### P2
14. Config impresión normalización parcial — `CrozzoPosMain.js:43750-43792,43815-43819`.
15. Copias >1 no honradas en HTML/PDF — `crozzo_print_html.rs:49,199`.
16. Contingencia evento 03 vs 04 + SLA mal anclado — `CrozzoContingenciaFiscal.js:23-29,100-105`.
17. CUFE crypto.subtle + cufePrevio vacío — `CrozzoPosDianLib.js` calcularCUFE.
18. Sin respaldo nativo/migración esquema — `CrozzoPosConfigManager.js:37-63`.

---

## 4. DIMENSIÓN 3: INVENTARIO

### P0
1. **Stock no se revierte en líneas parcial** — `CrozzoInventarioVenta.js:294-308` marca parcial tras deducir; `CrozzoReversionInventario.js:91-94` solo revierte `ok`.
2. **Reversión MP/recetas no implementada** — `crozzoReservorioDevolverVenta` y `crozzoInvRegistrarMovimiento` no existen; `CrozzoReversionInventario.js:135,166`.
3. **Reversión infla stock POS en restaurante** — `CrozzoReversionInventario.js:115-131` suma stock que nunca se descontó.
4. **Movimientos salida_venta no se eliminan al anular** — `CrozzoReservorio.js:1775-1795`.

### P1
5. `crozzoInvDeductFromFactura` sin idempotencia — `CrozzoPosMain.js:19201-19227`.
6. Recepción manual no toca ledger — `CrozzoPosMain.js:19084-19104`.
7. Eliminación/dedup deja movimientos huérfanos — `CrozzoReservorio.js:1015-1044,1167-1193`.
8. Anulación parcialmente registrada si reservorio falla — `CrozzoInventarioVenta.js:292-363`.
9. Falla en lote de recepción corta guardado a medias — `CrozzoRecepcionFacturas.js:9964-9992`.

### P2
10. Código muerto (funciones inexistentes).
11. Clasificación por defecto de movimientos desconocidos como entrada — `CrozzoSistemaCostos.js:4434`.
12. Ajustes manuales no actualizan costeo — `CrozzoInventarioContinuo.js:380`.
13. Dedup agresivo por ventana de 2 min — `CrozzoReservorio.js:993-1013`.

### Flujos verificados OK
- Salida por venta/cobro: `CrozzoPosMain.js:33155,33337` → `crozzoInventarioAplicarVenta` → `CrozzoPosMain.js:19201` `crozzoInvDeductFromFactura`.
- Entrada por recepción: `CrozzoRecepcionFacturas.js:9972` → `CrozzoReservorio.js:1046` `registrarRecepcion` → `:847` `syncInventarioRecepcion`.
- Ajustes: `CrozzoInventarioContinuo.js:380` → `CrozzoReservorio.js:2317` `addInventarioMovimiento`.
- Idempotencia de venta: `CrozzoInventarioVenta.js:253-262`.
- Anulación (parcial): `CrozzoReversionInventario.js` restaura stock POS de líneas `ok`.

---

## 5. DIMENSIÓN 4: IMPRESORAS

### P0
1. **Bodega: runBodegaRotulos/runBodegaEntrada borran impresoraBodega** — `CrozzoPrintStudioHub.js:3255,3269-3273,3284-3288`.
2. **getFacturacionAdminConfig re-normaliza y re-guarda descartando campos** — `CrozzoPosMain.js:43750-43792,43776-43778`.
3. **Phantom printers no se corrigen para roles allowEmpty** — `CrozzoPrintService.js:101-123,120-122`.

### P1
4. Rol `salon` no existe en resolución de impresora — `CrozzoPrintService.js:37-82`, `CrozzoPrintStudioHub.js:1717-1719`.
5. Auto-asignación omite salón — `CrozzoPosMain.js:43815-43818`.
6. Migración legacy→múltiple plantillas casi nunca aplica — `CrozzoPrintStudioHub.js:392-398`.
7. `getModo` siempre devuelve `personalizada` (rama preset muerta) — `CrozzoPrintStudioHub.js:1805,1821-1824`.
8. Persistencia de impresoras desde UI puede borrar bodega/salón — `CrozzoPosMain.js:44411-44427`.
9. `crozzoMatchSystemPrinter` fuzzy-match impresora equivocada — `CrozzoPrintService.js:361-365`.
10. Duplicado huérfano `app/core/CrozzoPrintStudioHub.js` (no se carga).

### P2
11. `collectSavePayload` marca todos personalizada — `CrozzoPrintStudioHub.js:3495-3498`.
12. `collectBodegaFields` fuerza '' si select vacío — `CrozzoPrintStudioHub.js:3255,3511`.
13. Etiquetas usan HTML no ESC/POS (por diseño) — `CrozzoPrintService.js:2672-2678`.
14. `crozzoFacturasAdminPersistPrinters` solo recoge printOutputs si hub disponible — `CrozzoPosMain.js:44421-44426`.

### Verificación solicitada (cambio diseñador → impresión real)
- **Se refleja** cuando se guarda vía `saveFacturasAdminConfigCore` + `collectSavePayload` + `persistActiveTplFromJson` (`CrozzoPosMain.js:44489-44565`, `CrozzoPrintStudioHub.js:2739-2773,3485-3514`).
- **Impresión real** usa `CrozzoPrintStudioHub.getPlantilla` (`CrozzoPrintService.js:1339-1341`) y `crozzoResolveTermicaTplForFactura` (`CrozzoPosMain.js:35490-35534`).
- **Riesgo principal:** pérdida de config en guardados parciales y selección de impresora por rol incompleta.

---

## 6. DIMENSIÓN 5: MULTI-DAY (RECURSOS, TIMERS, CUOTAS)

### P0
1. **`pos_dian_config` crece sin límite por facturas** — crash por cuota ~día 8-12. `CrozzoPosConfigManager.js:35,453-455`; `CrozzoFacturasArchivo.js:27,316-347`.
2. **Outbox fiscal sin cap + truncado silencioso** — crash/pérdida fiscal ~día 1-2 si PT cae. `CrozzoPosDianLib.js:467-499`; `CrozzoFiscalOutboxDrain.js:8-11`.
3. **Snapshot de runtime triplicado en localStorage** — crash por cuota ~día 1-3. `CrozzoOperativeReservorio.js:9-12,30-36,60-95`; `CrozzoPosMain.js:8656-8705`.
4. **Outbox de comandas con TTL 6h** — pérdida de comandas en caídas largas. `CrozzoComandasCloudSync.js:426,578-580`.

### P1
5. Cap de 800 en archivo pendiente descarta comandas antiguas — `CrozzoComandaArchive.js:192-204`.
6. Timers KDS a 1s con O(n²) `.find` — jank/timeout. `CrozzoPosMain.js:8932-8947,8952,8787`.
7. `setInterval(tickClock, 1000)` sin handle/clear — fuga por cada apertura. `CrozzoModulosIntegradosAcceso.js:799-807`.
8. Polling LAN/cloud no se pausa con pestaña oculta — `CrozzoLanOpsSync.js:770,775-823`.
9. Fuga de listeners resize y mutación de globals sin guard — `CrozzoPosMain.js:49530,50013,50016,50141`; `CrozzoWhatsAppDock.js:853`; `CrozzoOnboardingOperativo.js:1494`.

### P2
10. IndexedDB local sin retención — `CrozzoPosCloud.js:3470-3479,3545-3580`.
11. Dev log append-only y basura de impresión en disco — `crozzo_dev_log.rs:10-21`; `crozzo_emulation.rs:110-128,153-164`.
12. Archivo de facturas conserva 24 meses — `CrozzoFacturasArchivo.js:31,177-185`.
13. `comandaHistory` global solo se recorta cada 20 min — `CrozzoComandaArchive.js:252-274,298-303`.

### Límites verificados
| Límite | Dónde | Estado |
|---|---|---|
| 800 comandas activas | `CrozzoComandaArchive.js:201` | No es cap duro de memoria; solo recorta archivo pendiente |
| 200 outbox fiscal | Documentado; código trunca a 500 (`CrozzoPosDianLib.js:487`) | Inconsistente con doctrina de 200 |
| localStorage 5MB | Guardas parciales: `CrozzoPosMain.js:8717`, `CrozzoOperativeReservorio.js:67` | No cubre claves múltiples ni `pos_dian_config` |

---

## 7. DIMENSIÓN 6: SEGURIDAD

### P0 (12)
1. Secreto de emparejamiento no es secreto (estático + por instalación en localStorage) — `CrozzoPairingSeal.js:13-14,17-33`; `CrozzoPosMain.js:51749-51751`.
2. Auth LAN desactivable por token vacío + comparación no constante + GET abiertos — `crozzo_lan_sync_server.rs:132-133,864-865,993-997,1021-1037,1247`.
3. Credenciales Supabase en QR en claro — `CrozzoPairingSeal.js:121-176`.
4. Tauri vulnerable a CVE fetch channel + origin confusion — `Cargo.toml:9` (tauri 2.11.2); `Cargo.lock:4020-4022`.
5. XSS via postMessage sin validación de origin en diseñador — `Crozzo_POS_DisenadorTicket.html:2015-2030`; `CrozzoPosMain.js:44280-44285`; `CrozzoPrintStudioHub.js:596,607,751,801,1032,2810`.
6. Backdoor/credenciales por defecto y código de desbloqueo hardcodeado — `CrozzoAuthSecurity.js:10,277-283,527-552,761-809,1079-1083`.
7. Pairing pass persistido en localStorage (no cifrado) — `CrozzoPairingSeal.js:17-32`.
8. Device auth key en localStorage (prueba de sesión forgeable) — `CrozzoAuthSecurity.js:29-43,45-52`.
9. LAN token en QR en claro — `CrozzoPairingSeal.js:137`.
10. Android cleartext globalmente — `network_security_config.xml:4`.
11. Capacidad devtools en producción — `capabilities/default.json:24`, `desktop.json:35`.
12. Capacidad install (instalador silencioso) expuesta — `capabilities/default.json:15`, `desktop.json:26`, `permissions/crozzo-commands.toml:7-9`.

### P1 (11)
13. CORS `*` en servidores locales — `crozzo_lan_sync_server.rs:317`, `crm_registro_server.rs:101`, `server.py:603,609`, `ai-insights/index.ts:17`, `field-mock-lan-central.mjs:143`.
14. WebView auto-allow cámara/mic — `webview_permissions.rs:20-28,60-65`.
15. localStorage sin cifrado para secretos — `CrozzoPairingSeal.js:20,26`; `CrozzoPosCloud.js:43-45,209,213,384,459,723,808,843,848`; `CrozzoAuthSecurity.js:31,37`.
16. Fiscal outbox sin lock/idempotencia — `CrozzoFiscalOutboxDrain.js:9-11,99,111`; `CrozzoContingenciaFiscal.js:113`.
17. Consecutivos no atómicos — `CrozzoPosConfigManager.js:661-666,453-455`.
18. CSP laxa (unsafe-inline, connect-src http:) — `tauri.conf.json` security.csp.
19. `process:default` y `android-package-install` en mobile — `capabilities/mobile.json:9,15`.
20. postMessage con '*' en múltiples módulos — `CrozzoPosMain.js:13620,44304`; `CrozzoCentroCompras.js:60`; bundles; `CrozzoPrintStudioHub.js:596,607,751,801,1032,2810`.
21. KENNY master clear de bloqueos — `CrozzoAuthSecurity.js:698-730,659-696`.
22. Comparación token CRM con `==` + token en body — `crm_registro_server.rs:187-195`.
23. Comandas GET sin auth cuando token vacío — `crozzo_lan_sync_server.rs:993-997`.

### P2 (9)
24. Devtools feature en producción — `Cargo.toml:9`.
25. mDNS/multicast sin auth — `crozzo_mdns.rs` (ref en `crozzo_lan_sync_server.rs:1264`).
26. Gossip UDP/BLE sin cifrado — `crozzo_gossip_udp.rs`, `crozzo_ble_mesh.rs`; capabilities.
27. Rate limiting RUT spoofable — `crozzo_lan_sync_server.rs:567-587`.
28. Hotspot passphrase en JSON — `crozzo_hotspot.rs:86-91`.
29. localStorage para datos operativos sin cifrado — múltiples.
30. `img-src https:` tracking — `tauri.conf.json` CSP.
31. `frame-src` whatsapp/fbcdn — `tauri.conf.json` CSP.
32. Supabase Edge Function ai-insights CORS `*` — `supabase/functions/ai-insights/index.ts:17`.

### Referencias externas
- Tauri GHSA-w28w-mhc8-qvjv (fetch channel IPC, High) — ≤2.11.5; parche ≥2.11.6. https://github.com/tauri-apps/tauri/security/advisories/GHSA-w28w-mhc8-qvjv
- Tauri CVE-2026-42184 / GHSA-7gmj-67g7-phm9 (origin confusion) — ≤2.11.0.
- Tauri CSP bypass CVE-2026-95626 (data:/blob: en script-src con nonce) — CWE-79.
- Penetration test Tauri v2 (Radically Open Security) — IPC desde cualquier origin/frame.

---

## 8. DIMENSIÓN 7: CONECTIVIDAD

### P0 (9)
1. **mDNS resuelve a 127.0.0.1 offline** y se persiste como caja central — `CrozzoMdnsBridge.js:70-93`, `CrozzoLanSyncBridge.js:226,341`, `CrozzoCapabilityMatrix.js:239-240`, `CrozzoFleetCommState.js:69-72`, `CrozzoPeerDirectory.js:112-114,295`, `CrozzoPosMain.js:214,37534`.
2. **Failover de caja sin epoch/fencing** → split-brain — `CrozzoCentralFailover.js:23,32-62,118-151`.
3. **BLE mesh no-op en Android** — `CrozzoBleMesh.js:83-93,95-97,128-136,728-757,797-823`.
4. **Gossip UDP sin fragmentación** → pérdida de mensajes grandes — `CrozzoOfflineGossip.js:308-329`, `CrozzoBleMesh.js:292-308`.
5. **Cloud sin retry/timeout** → pérdida de ventas/mesas — `CrozzoComandasCloudSync.js:843-894`, `CrozzoFiscalOutboxDrain.js:56`, `CrozzoPosRuntimeCloud.js:722-775`.
6. **ACK ausente** → duplicados y re-impresión — `CrozzoLanWebSocketBridge.js:112-120,119,507,581-583,609-611`; `CrozzoOpAckRegistry.js:246-271,151-181`.
7. **upsert descarta estado** (runtime/mesas) — `CrozzoPosRuntimeCloud.js:745,619-658`; `CrozzoComandasCloudSync.js:869`.
8. **TTL 6h de comandas** → pérdida de comandas no entregadas — `CrozzoComandasCloudSync.js:426,578-581`; `CrozzoLanActionDedup.js:10`; `CrozzoOpAckRegistry.js:8`.
9. **Outbox fiscal sin cap** → crecimiento sin límite — `CrozzoFiscalOutboxDrain.js:8,137-140`; `CrozzoOpAckRegistry.js:10`.

### P1 (6)
10. Semáforo HTTP 64 solo documentado, no implementado — `CrozzoCommandBridge.js:219`.
11. HTTP sin keep-alive explícito — `CrozzoLanOpsSync.js:437,591`; `CrozzoLanWebSocketBridge.js:475`.
12. WS broadcast fire-and-forget — `CrozzoLanWebSocketBridge.js:507,581-583,609-611`.
13. Hotspot solo Windows — `CrozzoCapabilityMatrix.js:72`; `CrozzoConnectivityOrchestrator.js:107,370-386`.
14. Digest FNV UTF-8 vs UTF-16 (latente) — `CrozzoLanOpsSync.js:392-419`; `crozzo_lan_sync_server.rs:224-231`.
15. `saved_at` como fuente de verdad de orden (relojes) — `CrozzoPosRuntimeCloud.js:595-606,1464`.

### P2 (5)
16. TTL de dedup 6h demasiado corto — `CrozzoOpAckRegistry.js:8`, `CrozzoLanActionDedup.js:10`.
17. Outbox comandas 6h (vs 7d recomendado) — `CrozzoComandasCloudSync.js:426`.
18. Sin store-and-forward en gossip — `CrozzoOfflineGossip.js:308-329`.
19. Sin hysteresis/cooldown en cambio de transporte — `CrozzoConnectivityOrchestrator.js:592-660`.
20. Sin métricas de éxito por transporte.

### Patrones de referencia
Offline Protocol mesh SDK (TTL 8, ACK 5-10s, retry exp. backoff 1→300s, dedup 5000/7d, outbox 500/7d, chunking 32 KiB, mDNS rebind, store-and-forward, fencing/epoch), p2panda 0.2.0, Bitchat, CRDT/gossip.

---

## 9. DIMENSIÓN 8: AGENTES HUMANOS (ROLES)

### Cajero
- **P0:** Cobro wizard vacío + factura no generada (`qa-personas` facturas 0→0); factura timbrada no persiste (`CrozzoPosMain.js:33274-33301`, `CrozzoPosConfigManager.js:453`); consecutivo no incrementa; impresión no auditable.
- **P1:** Venta directa/precuenta/cliente (KI-021, KI-022, KI-026); carrito revertido por runtime remoto (KI-003).
- **P2:** UI miente "Cobro registrado"; sidebar hover oscila (KI-035).

### Mesero
- **P0:** Aislamiento por mesa 12/111; mesas borradas al entrar/salir (KI-018, KI-019).
- **P1:** Tablets RBAC/gates rotos (KI-027, KI-034); comandas parpadean (KI-016); modo tablets depende de locationId (KI-010); doble toque Comandar (EH-04 no ejecutado).
- **P2:** KDS Entreg. no archivaba (KI-024); LISTO sticky/eco LAN (KI-025).

### Admin
- **P0:** Reportes no navega (`CrozzoPosMain.js:12517`, `:17171-17175`); cadena fuente→build cortada (`sync-frontend-to-src.mjs:140,223`); contingencia fuera del APK (`app/index.html:1211`).
- **P1:** QA caído (`ceo-qa.mjs:87,100`); Reporte IA UI remonta/borra key (KI-037); permisos/plantillas desalineados (KI-029,031,033,034); secreto pareo hardcodeado.
- **P2:** Sidebar hover oscila (KI-035); cierre de turnos titila (KI-038).

### Bodega/Compras
- **P0:** Lock fiscal solo en proceso (P0 #4).
- **P1:** Recepción depende de bundle lazy (`CrozzoPosMain.js:17176-17185`); inventario menú incompleto (KI-033); upsert descarta estado; digest FNV.
- **P2:** BlobStore no en arranque; OCR en src/ (desfase de build).

### Veredicto F10 (auditoría principal)
| Rol | P0 | P1 | P2 | Veredicto |
|-----|----|----|----|-----------|
| Cajero | Cobro wizard vacío + factura no persiste | Consecutivo/impresión/carrito | UI miente "Cobro registrado" | ❌ FAIL |
| Mesero | Aislamiento 12/111; mesas borradas | Tablets RBAC; comandas parpadean | KDS/eco LAN | ✅ PASS parcial |
| Admin | Reportes no navega; fuente→build; contingencia fuera APK | QA caído; permisos; secreto | Sidebar/cierre | ❌ FAIL (reportes) |
| Bodega/Compras | Lock fiscal solo en proceso | Recepción lazy; inventario; upsert/digest | BlobStore on-demand | No auditado |

### Acciones mínimas para desbloquear (sin tocar código aquí)
1. Reparar path de cobro para alcanzar `timbrarFactura` + `config.save()` + `showInvoiceResult` (`CrozzoPosMain.js:33274-33386`).
2. Hacer que menú "Reportes y dashboard" invoque `navigateTo('inventarios')` o añadir `page: 'inventarios'` (`CrozzoPosMain.js:12517`).
3. Unificar `app/index.html` → `app/Crozzo_POS_Completo.html` en sync (`sync-frontend-to-src.mjs:140`).
4. Corregir `ceo-qa.mjs:87,100` (`const result` → `let`).
5. Arreglar aislamiento por mesa (`_connectivity-orchestrator-check.mjs:550-567`).

---

## 10. DIMENSIÓN 9: INTEGRACIÓN CROSS-SISTEMA

### P0
1. **Facturas ↔ DIAN/contingencia: cola fiscal no persiste** — `CrozzoContingenciaFiscal.js:113` (objeto vs array), `:189-190` (saveAll inexistente), `:233-241` (persistirSQLite fantasma).
2. **Impresión ↔ diseñador: exportación PDF falla en Tauri** — `CrozzoCostosReportesPdf.js:204`, `CrozzoRecetarioCocina.js` invocan `tauriInvoke('crozzo_save_pdf_b64')` (ahora implementado en P0-22, pero estaba ausente).
3. **Roles ↔ permisos: preset caja incluye permisos sensibles** — `CrozzoPermisosPolicy.js:26` (`eliminar_item`, `anular_comandado`, `catalogo`).

### P1
4. Contingencia sin caller de producción — `CrozzoContingenciaFiscal.js:67,185`.
5. Config no atómica/cuota — `CrozzoPosConfigManager.js:453-455,661-666`; `CrozzoPosDianLib.js:480`.
6. Auth LAN desactivable — `crozzo_lan_sync_server.rs:852`.
7. Impresión sin timeout/copias — `crozzo_print.rs` (WritePrinter bloqueante, copies>1 no imprime).

### P2
8. Módulos cargados pero no usados / fuentes duplicadas — `src/CrozzoPosMain.js` (1MB copia muerta).
9. Roles ↔ menús ↔ planProducto — `CrozzoPosMain.js:12748`, `CrozzoPermisosPolicy.js` (perfiles barrio no reflejados).
10. POS ↔ inventario — depende de `inventarioMeta` para reversión.

---

## 11. SÍNTESIS FINAL

### Top 10 problemas por impacto
1. **Seguridad (P0-1..P0-6):** secretos estáticos, auth LAN desactivable, CVEs Tauri, XSS, backdoors. Requiere rediseño crypto + actualización Tauri + hardening CSP.
2. **Factura no persiste (P0-2 invoice):** localStorage sin transacción + outbox parcial + CUFE sin guard. Requiere migración a IndexedDB/SQLite transaccional.
3. **Cobro no genera factura (P0-1 invoice):** cartDirecto vacío por heurística de recencia. Hotfix aplicado (contención), robusto pendiente.
4. **Conectividad (P0 conn):** mDNS 127.0.0.1, failover sin epoch, BLE Android no-op, gossip sin fragmentación. Requiere fixes en Rust + JS.
5. **Inventario (P0 inv):** reversión asimétrica + funciones muertas + inflación de stock. Requiere saga/compensación.
6. **Impresoras (P0 print):** pérdida de config en guardados parciales + phantom printers + fuzzy-match. Requiere fix de persistencia.
7. **Multi-day (P0 multi):** crash por cuota en día 8-12, snapshot triplicado, outbox sin cap. Requiere retención + migración a IndexedDB.
8. **Roles (P0 human):** cajero bloqueado (cobro), admin bloqueado (reportes), mesero parcial (aislamiento).
9. **Integración (P0 cross):** cola fiscal no persiste, PDF no exporta, permisos sensibles en caja.
10. **UI/UX (P0 ui):** stacking/z-index, ACL agresivo, menús ocultos sin affordance.

### Causa raíz común
La mayoría de los P0 provienen de:
- **Estado mutable global sin identidad/versionado** (cartDirecto, pos_dian_config, consecutivo).
- **Persistencia no atómica** (localStorage reescribe todo el blob).
- **Heurísticas frágiles** (recencia de 5 min, TTL 6h) que fallan silenciosamente.
- **Fallbacks que ocultan errores** (preset default, defaults en loadFromStorage).
- **Código muerto protegido por `typeof === 'function'`** (funciones inexistentes que fallan silenciosamente).
- **Divergencia app/ vs src/** (sync desde Crozzo_POS_Completo.html, no app/index.html).

### Patrones de solución (internet)
- **Transactional Outbox** (microservices.io) para factura + cola fiscal.
- **Idempotency Key** por venta para cobro y consecutivo.
- **Saga / compensating transaction** para inventario.
- **State machine** con identidad de venta para carrito.
- **HLC (Hybrid Logical Clock)** para orden de sync.
- **Offline lease blocks** para consecutivos offline.
- **Exact match + fail loud** para impresoras.
- **ECDH efímero + firma** para emparejamiento seguro.
- **Offline Protocol mesh SDK** (TTL 8, ACK 5-10s, retry exp. backoff, dedup 5000/7d, outbox 500/7d, chunking 32 KiB, mDNS rebind, store-and-forward, fencing/epoch).

---

## 12. MEMORIA PERSISTENTE

- Synapse: 23+ memorias activas (estado, plan v2, poda, contención, runbook OTA, SQL consecutivos, progreso P0, bitácora auditoría).
- Handoff: `docs/maps/HANDOFF-CONTINUIDAD.md`.
- Plan maestro: `docs/maps/PLAN-MAESTRO-MACRO-v2.md`.
- Contención: `docs/maps/CONTENCION-P0-PENDIENTES.md`.
- Runbook OTA: `docs/maps/RUNBOOK-OTA-P0-11.md`.
- Bitácora auditoría: `docs/maps/BITACORA-AUDITORIA-COMPLEJA.md` (este documento).
- SQL: `docs/SUPABASE-SQL-CONSECUTIVOS.sql`, `docs/SUPABASE-SQL-MESA-RUNTIME.sql`, `docs/SUPABASE-SQL-DEVICE-QR-SLOTS.sql`.

Cualquier chat nuevo retoma con `npm run synapse:search -- "MISIÓN CIEN"` o leyendo los documentos anteriores. No se repite investigación.

**No se modificó código en esta auditoría.** Todos los hallazgos se entregan como reporte para corrección posterior.