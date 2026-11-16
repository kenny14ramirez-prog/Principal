# Validacion - Sync y Conectividad (Escuadron POS Crozzo)

- Directorio de trabajo: `C:\proyectos\sistema pos`
- Fecha de ejecucion: 2026-11-13
- Agente: Validacion Sync y Conectividad
- Total checks: 23
- Resultado: 23 PASSED / 0 FAILED

## Resumen

| # | Check | Exit | Duracion (s) |
|---|-------|------|--------------|
| 1 | connectivity-equilibrium | OK 0 | 2.1 |
| 2 | lan-ops-sync | OK 0 | 86.7 |
| 3 | legendary-connectivity | OK 0 | 6.1 |
| 4 | ops-plane-presence | OK 0 | 2.1 |
| 5 | sede-combat | OK 0 | 1 |
| 6 | connectivity-flow | OK 0 | 3.1 |
| 7 | connectivity-orchestrator | OK 0 | 1 |
| 8 | connectivity-mixed-flow | OK 0 | 1 |
| 9 | connectivity-ux | OK 0 | 1 |
| 10 | connectivity-visibility | OK 0 | 1 |
| 11 | channel-fallback | OK 0 | 1 |
| 12 | central-failover | OK 0 | 1 |
| 13 | cloud-discovery | OK 0 | 1 |
| 14 | offline-gossip | OK 0 | 1 |
| 15 | chaos-network | OK 0 | 10.1 |
| 16 | sync-property | OK 0 | 1 |
| 17 | staff-sync-gate | OK 0 | 1 |
| 18 | operative-sync-gate | OK 0 | 1 |
| 19 | operative-journal | OK 0 | 1 |
| 20 | fleet-coordination | OK 0 | 1 |
| 21 | op-fanout | OK 0 | 1 |
| 22 | connectivity-standby | OK 0 | 1 |
| 23 | federacion-flow | OK 0 | 1 |

## Detalle por check

### 1. connectivity-equilibrium

- Comando: `npm run test:connectivity-equilibrium`
- Exit code: 0
- Duracion: 2.1s

Ultimas 20 lineas:

```

=== Crozzo equilibrio conectividad — verificación clínica ===

✓ Prioridades zonas — app/infra/CrozzoCloudSyncPriorities.js
✓ PageCloudWatch Z0 — app/infra/CrozzoPageCloudWatch.js
✓ Pulso UI Z0 — app/infra/CrozzoZ0OperativePulse.js
✓ Autoguarda Z0 — app/infra/CrozzoZ0AutoGuard.js
✓ Startup arranca autoguarda — app/infra/CrozzoStartupReady.js
✓ LanOps equilibrio — app/infra/CrozzoLanOpsSync.js
✓ Comandas fanout híbrido — app/modules/CrozzoComandasCloudSync.js
✓ Estado comanda → outbox cloud — fanoutComandaEstado drena nube
✓ Fanout sin early-return LAN-only — sin regresión /if \(lan\) \{\s*[\s\S]{0,120}return;\s*
✓ Reconnect estable — app/infra/CrozzoReconnectSync.js
✓ Orquestador anti-flap — app/infra/CrozzoConnectivityOrchestrator.js
✓ Cloud throttle — app/infra/CrozzoCloudThrottle.js
✓ Runtime UI sin pull comandas — crozzoHandleRemoteRuntimeUiSync no dispara SELECT comandas

Todo OK (13 checks)


```

### 2. lan-ops-sync

- Comando: `npm run test:lan-ops-sync`
- Exit code: 0
- Duracion: 86.7s

Ultimas 20 lineas:

```
✓ LAN bridge puente nube — app/infra/CrozzoLanSyncBridge.js
✓ Rust post LAN nativo — src-tauri/src/crozzo_lan_sync_server.rs
✓ Rust compile — cargo check OK
✓ Sandbox carga — API global
✓ tier lan activo — tierAllows=true
✓ Pull comandas LAN — aplicó snapshot remoto
✓ Apply comanda — id=42 desde /api/comandas
✓ Fetch central — Rol B apunta a caja
✓ Pull forzado fuera Z0 — force bypass página operativa
✓ Apply forzado — snapshot remoto aplicado
✓ Pulso dispara pull — fetch adicional tras emit
✓ Recover cloud — crozzoRunFullReconnectSync al volver nube
✓ Nube activa defer — no LAN ops cuando deferLocalSync
✓ WS fresco skip poll — softPollCoveredByWs=true con isOpen+RX
✓ Path health WS — transport=ws_primary
✓ Sin WS no skip — poll HTTP sigue activo

Todo OK (38 checks)


```

### 3. legendary-connectivity

- Comando: `npm run test:legendary-connectivity`
- Exit code: 0
- Duracion: 6.1s

Ultimas 20 lineas:

```
  ✓ L2: reconnectStaggerMs canónico
  ✓ Existe src-tauri/src/crozzo_lan_sync_server.rs — src-tauri/src/crozzo_lan_sync_server.rs
  ✓ L2: const COMANDAS_ACTIVE_MAX
  ✓ L2: helper purge/trim
  ✓ L2: entregada se purga
  ✓ Existe app/infra/CrozzoSedeAutosanable.js — app/infra/CrozzoSedeAutosanable.js
  ✓ L3: API rescue
  ✓ L3: no llama FleetOperationalReconcile (KI-016)
  ✓ L3: anuncia identidad
  ✓ Existe app/index.html — app/index.html
  ✓ L3: script en index.html
  ✓ Existe app/modules/CrozzoComunicacionDiag.js — app/modules/CrozzoComunicacionDiag.js
  ✓ L3: Diag Reparar usa autosanable
  ✓ L3: export global rescue
  ✓ L3: rescue() ok — {"ok":true,"reason":"check","steps":["WS LAN reconnect","Rediscover caja (Rol B)","Anuncio identidad flota","Soft-heal flota solo","Director re-evalúa path","Mesh standby"],"usedFleetReconcile":false,"fleet":{"peerCount":2,"label":"ok"}}
  ✓ L3: rescue no usó FleetReconcile

Total: 38 · fallos: 0
✅ CONECTIVIDAD LEGENDARIA: PASS

```

### 4. ops-plane-presence

- Comando: `npm run test:ops-plane-presence`
- Exit code: 0
- Duracion: 2.1s

Ultimas 20 lineas:

```
  PASS  R2: export API
  PASS  Existe app/modules/CrozzoPosRuntimeCloud.js — app/modules/CrozzoPosRuntimeCloud.js
  PASS  R0: instrumentación meta upsert
  PASS  Existe app/index.html — app/index.html
  PASS  R1: boot index.html
  PASS  Existe app/Crozzo_POS_Completo.html — app/Crozzo_POS_Completo.html
  PASS  R1: boot Completo
  PASS  Existe docs/maps/LEGENDARY-CONNECTIVITY-DRILLS.md — docs/maps/LEGENDARY-CONNECTIVITY-DRILLS.md
  PASS  R3: Drill D4 enter/leave storm
  PASS  R3: Drill D5 WAN off presencia LAN
  PASS  R3: Drill D6 caja off WAN on
  PASS  R3: Drill D7 ambos off + backup
  PASS  R3: métricas/POE en drills
  PASS  R2: drill backup central
  PASS  Existe docs/maps/INDEX.md — docs/maps/INDEX.md
  PASS  R0: INDEX enlaza protocolo

─── PASS (44 checks) ───


```

### 5. sede-combat

- Comando: `npm run test:sede-combat`
- Exit code: 0
- Duracion: 1s

Ultimas 20 lineas:

```
✓ Diag usa Command Bridge unificado — app/modules/CrozzoComunicacionDiag.js
✓ Command Bridge fachada única — app/infra/CrozzoCommandBridge.js
✓ LAN poll adaptativo flota 100 — app/infra/CrozzoLanOpsSync.js
✓ Rust LAN semáforo HTTP 64 — src-tauri/src/crozzo_lan_sync_server.rs
✓ Revisión militar estrés documentada — docs/maps/STRESS-MILITARY-REVISION.md
✓ Automation expone mando — app/infra/CrozzoAutomationApi.js
✓ Completo: paridad stack mando — app/Crozzo_POS_Completo.html
✓ Fiscal outbox drain — app/infra/CrozzoFiscalOutboxDrain.js
✓ Command scorecard mercado — app/infra/CrozzoCommandScorecard.js
✓ H3a demo offline combat — scripts/_offline-combat-demo.mjs
✓ H3a narrativa offline — docs/maps/OFFLINE-COMBAT-NARRATIVE.md
✓ L3 sede autosanable — app/infra/CrozzoSedeAutosanable.js
✓ L1 drills conectividad legendaria — docs/maps/LEGENDARY-CONNECTIVITY-DRILLS.md
✓ Reconnect drena cola fiscal — app/infra/CrozzoReconnectSync.js
✓ Scripts mando en index — app/index.html
✓ Doctrina militar documentada — docs/maps/MILITARY-COMMAND-DOCTRINE.md

Todo OK (23 checks)


```

### 6. connectivity-flow

- Comando: `node scripts/_connectivity-flow-check.mjs`
- Exit code: 0
- Duracion: 3.1s

Ultimas 20 lineas:

```
✓ Archivo — app/core/CrozzoPosCloud.js
✓ Archivo — src-tauri/src/crozzo_lan_sync_server.rs
✓ Archivo — docs/SUPABASE-SQL-POS-RUNTIME.sql
✓ ReconnectSync API — app/infra/CrozzoReconnectSync.js
✓ LAN bridge — app/infra/CrozzoLanSyncBridge.js
✓ WiFi zone — app/infra/CrozzoWifiZoneBridge.js
✓ PosMain conectividad — app/core/CrozzoPosMain.js
✓ Servidor LAN Rust — src-tauri/src/crozzo_lan_sync_server.rs
✓ UI login + badge — app/index.html
✓ Orden scripts — core/CrozzoPosMain.js → infra/CrozzoReconnectSync.js
✓ Orden scripts — modules/CrozzoComandasCloudSync.js → infra/CrozzoReconnectSync.js
✓ Orden scripts — infra/CrozzoLanSyncBridge.js → core/CrozzoPosExtensions.js
✓ QR emparejamiento — payload v4 con nube + LAN
✓ P2P dual — señalización nube + LAN
✓ Rust — cargo check OK
✓ Sync src — CrozzoReconnectSync en src/

Todo OK (21 checks)


```

### 7. connectivity-orchestrator

- Comando: `node scripts/_connectivity-orchestrator-check.mjs`
- Exit code: 0
- Duracion: 1s

Ultimas 20 lineas:

```
✓ Reloj desde header Date — offset ~200s
✓ Por-mesa carga — internos expuestos
✓ Por-mesa: fila por mesa — mesa 5 y 6 separadas
✓ Por-mesa: fila llevar — L1
✓ Por-mesa: fila directo — __directo__
✓ Por-mesa: fila meta — estado global
✓ Por-mesa: meta sin carritos — meta limpia
✓ Por-mesa: round-trip mesa 5 — carrito intacto
✓ Por-mesa: round-trip llevar — L1 intacto
✓ Por-mesa: round-trip directo — directo intacto
✓ Por-mesa: meta restaurada — estado global intacto
✓ Por-mesa: aislamiento — editar mesa 6 no toca mesa 5
✓ Cambio de sede: push suprimido — no escribe en la nube nueva durante el cambio
✓ Escalonado expuesto — crozzoReconnectStaggerMs
✓ Escalonado en rango — 700..7100 -> 883
✓ Escalonado determinista por equipo — |a-b|<=400

Todo OK (111 checks)


```

### 8. connectivity-mixed-flow

- Comando: `node scripts/_connectivity-mixed-flow-check.mjs`
- Exit code: 0
- Duracion: 1s

Ultimas 20 lineas:

```
MIXED-FLOW CHECK: OK

```

### 9. connectivity-ux

- Comando: `node scripts/_connectivity-ux-check.mjs`
- Exit code: 0
- Duracion: 1s

Ultimas 20 lineas:

```
✓ API — start
✓ API — render
✓ API — auditLog
✓ API — getAuditLog
✓ API — tierEmoji
audit entries: 1
✓ audit — 1 entries

Todo OK


```

### 10. connectivity-visibility

- Comando: `node scripts/_connectivity-visibility-check.mjs`
- Exit code: 0
- Duracion: 1s

Ultimas 20 lineas:

```
VISIBILITY CHECK: OK

```

### 11. channel-fallback

- Comando: `node scripts/_channel-fallback-check.mjs`
- Exit code: 0
- Duracion: 1s

Ultimas 20 lineas:

```
✓ API — tryLan
✓ API — tryCloud
✓ API — tryHotspot
✓ API — runFallback
✓ API — getActive
✓ API — isDesktopTauri
tryHotspot result: true
✓ tryHotspot — true
active channel: hotspot
✓ active channel — hotspot

Todo OK


```

### 12. central-failover

- Comando: `node scripts/_central-failover-check.mjs`
- Exit code: 0
- Duracion: 1s

Ultimas 20 lineas:

```
✓ Caída breve                — no promueve dentro del hold (anti-flapping)
✓ Hold sin cumplir           — sigue esperando confirmación
✓ Promoción                  — promueve tras caída sostenida sin nube
✓ Nube sana                  — no promueve si hay nube disponible
✓ Reset por parpadeo         — el hold se reinicia al recuperar
✓ Sin promoción por parpadeo — un parpadeo no promueve
✓ Regreso sin confirmar      — no degrada al instante (estabiliza)
✓ Degradación                — cede a la primaria cuando vuelve estable
✓ Sigue sirviendo            — mantiene el rol central mientras la primaria no vuelve
✓ Archivo                    — CrozzoCentralFailover.js existe
✓ Script en app/index.html   — CrozzoCentralFailover.js incluido
✓ Orden de carga app/index.h — tras WifiZoneBridge y antes de Boot
✓ Script en app/Crozzo_POS_C — CrozzoCentralFailover.js incluido
✓ Orden de carga app/Crozzo_ — tras WifiZoneBridge y antes de Boot
✓ Descubrimiento             — backupIp en gatewayCandidates
✓ Wiring                     — afterMainInit en Extensions
✓ Wiring                     — runOnce('central_failover') en orquestador

OK (20 checks)

```

### 13. cloud-discovery

- Comando: `node scripts/_cloud-discovery-check.mjs`
- Exit code: 0
- Duracion: 1s

Ultimas 20 lineas:

```
✓ API — isCloudAvailable
✓ API — registerDevice
✓ API — pullDevices
✓ API — discoverCentral
✓ API — startHeartbeatWatch
✓ API — afterMainInit
isCloudAvailable: true
✓ isCloudAvailable — true

Todo OK


```

### 14. offline-gossip

- Comando: `node scripts/_offline-gossip-check.mjs`
- Exit code: 0
- Duracion: 1s

Ultimas 20 lineas:

```
OFFLINE-GOSSIP CHECK: OK (8/8)

```

### 15. chaos-network

- Comando: `node scripts/_chaos-network-check.mjs`
- Exit code: 0
- Duracion: 10.1s

Ultimas 20 lineas:

```

──────── CHAOS NETWORK ────────
  [OK] app renderiza en offline
  [OK] app renderiza tras reconexión
  [OK] sin errores fatales JS
  [OK] observabilidad captura fallos red
  Obs: {"startedAt":"2026-11-13T19:09:19.674Z","errors":0,"rejections":0,"consoleErrors":0,"networkFailures":3,"replayEvents":0,"rrwebStarted":false}
──────────────────────────────
  4/4 OK

```

### 16. sync-property

- Comando: `node scripts/_sync-property-check.mjs`
- Exit code: 0
- Duracion: 1s

Ultimas 20 lineas:

```
[OK] allowCloudAuthoritativeEmpty: 1000 runs passed
[OK] allowAutoDiscard: 1000 runs passed
[OK] activeWorkBlocksDiscard: 1000 runs passed
[OK] LWW no contradiction: 1000 runs passed

4/4 property suites passed

```

### 17. staff-sync-gate

- Comando: `node scripts/_staff-sync-gate-check.mjs`
- Exit code: 0
- Duracion: 1s

Ultimas 20 lineas:

```

=== staff-sync-gate-check ===

OK    API staff auth — crozzoEnsureRemoteStaffCatalogSync
OK    tenant sync pre-login — startCrozzoRemoteTenantSync
OK    broadcast tras push — pos_staff notify
OK    debounced pull force — staff_pull
OK    bypass staff_auth — CloudSyncPriorities
OK    hub staff domain — inicio-operacion
OK    login overlay pull — showLoginOverlay
OK    login interval — 45s refresh
OK    login retry pull — loginWithCredentials
OK    ensure cloud staff — crozzoEnsureCloudSyncActive

10/10 checks


```

### 18. operative-sync-gate

- Comando: `node scripts/_operative-sync-gate-check.mjs`
- Exit code: 0
- Duracion: 1s

Ultimas 20 lineas:

```
OK   overlay timeout — ≤4.5s
OK   recent pull fast path — sin overlay si bootstrap reciente
OK   parallel pulls — runtime + comandas en paralelo
OK   skip pre probe on fast entry — sin SELECT duplicado antes del pull
OK   post analyze sin probe — usa runtime ya aplicado
OK   lan gated — LAN solo si segmento activo
OK   last pull timestamp — expuesto para fast path
OK   probe lan opts — timeout configurable

0 fallos — operative-sync-gate-check OK


```

### 19. operative-journal

- Comando: `node scripts/_operative-journal-check.mjs`
- Exit code: 0
- Duracion: 1s

Ultimas 20 lineas:

```

=== Crozzo diario operativo — verificación ===

✓ Diario operativo — app/infra/CrozzoOperativeJournal.js
✓ DevTap — app/infra/CrozzoDevTap.js
✓ Autoguarda + journal — app/infra/CrozzoZ0AutoGuard.js
✓ Startup journal/dev/perf — app/infra/CrozzoStartupReady.js
✓ Perf continuo — app/core/CrozzoDevicePerf.js
✓ Diag diario — app/modules/CrozzoComunicacionDiag.js
✓ Scripts index — app/index.html
✓ Rust dev log — src-tauri/src/crozzo_dev_log.rs
✓ Lib dev log — src-tauri/src/lib.rs
✓ Observador dev — dev-session-observer.mjs
✓ npm dev:observe — package.json
✓ test journal en sync-clinical — package.json

Todo OK (12 checks)


```

### 20. fleet-coordination

- Comando: `node scripts/_fleet-coordination-check.mjs`
- Exit code: 0
- Duracion: 1s

Ultimas 20 lineas:

```
✓ Fleet UI refresh — no usa fleet_reconcile como página
✓ Circuit breaker QR interno — app/modules/CrozzoInternalQrRegistry.js
✓ LAN pull bajo presión nube — app/infra/CrozzoLanSyncBridge.js
✓ ConnectionManager global — app/core/CrozzoConnectionManager.js
✓ Startup flota — app/infra/CrozzoStartupReady.js
✓ Startup sin invalidar gate — startup usa skipInvalidate
✓ Auto-conexión post-QR — app/infra/CrozzoPairingAutoConnect.js
✓ QR exchange sin invalidar gate — qr_exchange usa skipInvalidate
✓ Sync gate pull runtime LAN — app/modules/CrozzoOperativeSyncGate.js
✓ Mesero Z0 + sync híbrido + sede canónica — app/core/CrozzoPosMain.js
✓ PageCloudWatch híbrido paralelo — app/infra/CrozzoPageCloudWatch.js
✓ Z0 híbrido LAN paralelo — app/infra/CrozzoCloudSyncPriorities.js
✓ Reservorio operativo mesas/caja — app/modules/CrozzoOperativeReservorio.js
✓ Runtime realtime → UI + LAN paralelo — app/modules/CrozzoPosRuntimeCloud.js
✓ Fleet script index — index.html
✓ AutoConnect script index — index.html

Todo OK (30 checks)


```

### 21. op-fanout

- Comando: `node scripts/_op-fanout-check.mjs`
- Exit code: 0
- Duracion: 1s

Ultimas 20 lineas:

```
✓ LanActionDedup delega OpAck — app/infra/CrozzoLanActionDedup.js
✓ Comandas fanout + outbox entregada + anti-resurrect — app/modules/CrozzoComandasCloudSync.js
✓ Outbox snapshot entregada — enqueue guarda payload; find mira history
✓ LISTO/limpiar/KDS Entreg → despachar + mesas — app/core/CrozzoPosMain.js
✓ SyncGate no rehidrata carrito post-pull — app/modules/CrozzoOperativeSyncGate.js
✓ LISTO archive-first + sin fantasma entregada — app/core/CrozzoPosMain.js
✓ LAN HTTP despacho sin re-fanout — app/infra/CrozzoLanSyncBridge.js
✓ LAN WS despacho sin re-fanout — app/infra/CrozzoLanWebSocketBridge.js
✓ Ingest despacho sin re-fanout — app/infra/CrozzoOperationalIngest.js
✓ Caja Directa/cobro/precuenta (KI-026) — app/core/CrozzoPosMain.js
✓ LAN WS emite ACK — app/infra/CrozzoLanWebSocketBridge.js
✓ Gossip ACK + force fanout — app/infra/CrozzoOfflineGossip.js
✓ Orden OpAck antes LanActionDedup — index.html
✓ Orden PathHealth antes OpFanout — index.html
✓ Script WifiDirect en index — index.html
✓ test op-fanout en sync-clinical — package.json

Todo OK (20 checks)


```

### 22. connectivity-standby

- Comando: `node scripts/_connectivity-standby-check.mjs`
- Exit code: 0
- Duracion: 1s

Ultimas 20 lineas:

```

=== Crozzo standby LAN — verificación ===

✓ Standby conectividad — app/infra/CrozzoConnectivityStandby.js
✓ WAN bajo presión — app/infra/CrozzoCloudThrottle.js
✓ WS standby — app/infra/CrozzoLanWebSocketBridge.js
✓ Transport LAN standby — app/infra/CrozzoLanSyncBridge.js
✓ LanOps standby — app/infra/CrozzoLanOpsSync.js
✓ Comandas LAN standby — app/modules/CrozzoComandasCloudSync.js
✓ Standby después PosMain — index.html
✓ test standby en sync-clinical — package.json

Todo OK (8 checks)


```

### 23. federacion-flow

- Comando: `node scripts/_federacion-flow-check.mjs`
- Exit code: 0
- Duracion: 1s

Ultimas 20 lineas:

```
OK — federacion flow check passed

```

## Conclusion

Todos los 23 checks de Sync y Conectividad pasaron (exit 0).
