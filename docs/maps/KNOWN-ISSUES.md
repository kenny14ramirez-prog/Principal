<!-- AUTO-GENERATED from known-issues.json — editar JSON, luego npm run issues:refresh -->

# Errores conocidos y soluciones

> **38 entradas** · actualizado 2026-07-21T01:36:45.352Z · fuente canónica: [`known-issues.json`](known-issues.json)

Consultar **antes** de parchear sync/LAN/CSS/APK. Buscar: `npm run issues:search -- "texto"`

---

## Índice rápido

| ID | Severidad | Título | Tags |
|----|-----------|--------|------|
| [KI-001](#ki-001) | critical | Editar src/ en vez de app/ | workflow, stale, mirror |
| [KI-002](#ki-002) | critical | Git local detrás de origin/main | workflow, stale, git |
| [KI-003](#ki-003) | critical | Carrito revierte tras cobro / runtime remoto (falta skipCartReconcile) | sync, cart, runtime, regression |
| [KI-004](#ki-004) | high | Pin local bloquea carrito remoto (mergePinned) | sync, cart, tablet, regression |
| [KI-005](#ki-005) | high | LAN vuelve a cloud pero tablets quedan stale | lan, cloud, tier, reconnect |
| [KI-006](#ki-006) | high | Pulso LAN sin pull local | lan, comandas, pull |
| [KI-007](#ki-007) | medium | Fix CSS/APK no se ve ('no aplica') | css, apk, tablet, workflow |
| [KI-008](#ki-008) | high | Parche PosMain con fragmento stale / línea incorrecta | posmain, workflow, stale |
| [KI-009](#ki-009) | medium | Fanout LAN-only early-return (nube no recibe) | sync, fanout, cloud, lan |
| [KI-010](#ki-010) | medium | locationId distinta entre dispositivos | sync, config, field |
| [KI-011](#ki-011) | low | Tocar Reservorio en fix de sync Z0 | scope, reservorio |
| [KI-012](#ki-012) | medium | Editar app/bundles/*.js a mano | workflow, bundles |
| [KI-013](#ki-013) | low | Hooks/reglas Cursor nuevos sin reiniciar IDE | workflow, cursor |
| [KI-014](#ki-014) | medium | Permiso bloqueado en capa transporte (mesero no escribe) | sync, permissions |
| [KI-015](#ki-015) | critical | PosMain SyntaxError Illegal return (cabecera función borrada) | syntax, posmain, regression, release |
| [KI-016](#ki-016) | critical | Comandas/mesas parpadean y desaparecen (reconcile loop + purge) | sync, comandas, cocina, regression, fleet |
| [KI-017](#ki-017) | critical | Despacho cocina borra cuenta en caja | sync, cart, cocina, caja, comandas |
| [KI-018](#ki-018) | critical | Mesas borradas al entrar/salir — parches vs reservorio operativo | sync, cart, caja, mesa, architecture, reservorio |
| [KI-019](#ki-019) | medium | Riesgos residuales — reservorio operativo y sync mesas | sync, watch, mesa, reservorio |
| [KI-020](#ki-020) | low | INSERT Realtime aplicado:false en echo propio | sync, comandas, realtime, noise |
| [KI-021](#ki-021) | high | Venta directa abre selector de mesas/llevar | caja, ui, venta-directa |
| [KI-022](#ki-022) | high | Cliente / facturación en caja: click no abre panel | caja, crm, ui, factura |
| [KI-023](#ki-023) | critical | LISTO cocina reaparece; mesas moradas; Limpiar no libera | sync, comandas, cocina, mesa, outbox |
| [KI-024](#ki-024) | high | KDS Entreg. no archiva; SyncGate rehidrata carrito | sync, comandas, cocina, kds, mesa |
| [KI-025](#ki-025) | high | LISTO sticky reaparece; eco LAN; entregada fantasma en KDS | sync, comandas, cocina, ux, lan |
| [KI-026](#ki-026) | critical | Caja: Limpiar Directa tumba M1; cobro sin comanda; panel cierra tras comandar | caja, cobro, precuenta, comandar, directa |
| [KI-027](#ki-027) | high | Mesero tablet: −/nota/comandar usan carrito o gates incorrectos | tablet, mesero, cart, permisos, sync |
| [KI-028](#ki-028) | critical | Encargado: botón − en línea comandada solo toast; no anula ni void cocina | encargado, anular_comandado, tablet, caja, comandas |
| [KI-029](#ki-029) | high | Encargado legacy sin anular_comandado (migración v1 solo admin) | encargado, permisos, admin, migration |
| [KI-030](#ki-030) | critical | Cerrar/cambiar modo abandona mesa con consumo sin cobro | caja, recepcion, cuenta, gestion, interaction |
| [KI-031](#ki-031) | high | Recepción RBAC desalinhado; precuenta caja exigía tab_precuenta | recepcion, permisos, precuenta, caja, rbac |
| [KI-032](#ki-032) | high | LISTO/Entreg. sin permiso despachar (solo ver abre cocina) | cocina, comandas, permisos, listo |
| [KI-033](#ki-033) | high | Reimprimir/arqueo/descuento/inventario/abrir mesa: gates y menús rotos | permisos, cocina, cierre, inventario, caja, gestion |
| [KI-034](#ki-034) | critical | Residuales sede: tablet RBAC, open slot, reimprimir legacy, automation LISTO | tablet, permisos, caja, recepcion, cocina, residual |
| [KI-035](#ki-035) | high | Sidebar hover oscila al scrollear (abre/cierra en bucle) | css, ui, sidebar, motion, desktop |
| [KI-036](#ki-036) | high | Diseñador ticket: edición de ley/título no se refleja ni persiste | print, ticket, designer, factura, ui |
| [KI-037](#ki-037) | high | Reporte IA: UI remonta y borra key / Guardar parece fallar | ai, nvidia, ui, super-admin, regression |
| [KI-038](#ki-038) | critical | Cierre de turnos titila: remount por fanout LAN/comandas | cierre, remount, lan, regression, ui |

---

## Entradas

### KI-001

**Editar src/ en vez de app/** · `resolved` · severidad **critical**

**Síntomas**

- El cambio no aparece en Tauri/APK
- git diff muestra src/ pero no app/
- El agente parcheó el espejo

**Causa raíz:** Tauri sirve src/ generado; app/ es la fuente canónica. Editar src/ se pierde en el próximo sync o nunca existió en app/.

**Solución verificada:** Revertir edit en src/. Aplicar el mismo diff en app/ equivalente. Ejecutar npm run sync. Hook block-src-mirror-writes debe bloquear nuevos intentos.

**NO repetir**

- Parchear src/core/CrozzoPosMain.js
- Confiar en fragmentos leídos solo de src/

Archivos: `app/`, `src/` · ADR: D-001 · Corregido: 2026-07 — hooks + .cursorignore · Aprendido de: Sesiones con diff en src/ sin reflejo en app/

---

### KI-002

**Git local detrás de origin/main** · `watch` · severidad **critical**

**Síntomas**

- PosMain tiene ~44k líneas cuando origin tiene ~51k
- Funciones sync que el agente cita no existen
- test:sync-clinical pasa pero tienda falla

**Causa raíz:** HEAD local desalineado; el agente razona sobre código viejo cacheado o en disco.

**Solución verificada:** git fetch origin && git status -sb. Si behind > 0: git pull --rebase origin main (o alinear según política del equipo). Verificar releases/latest.json y crozzo-app-version en index.html.

**NO repetir**

- Parchear sobre PosMain viejo sin pull
- Asumir que la sesión anterior tiene la versión correcta

Archivos: `app/core/CrozzoPosMain.js` · Tests: `test:sync-clinical` · Aprendido de: Reset a a1858cb v1.0.223 tras 70 commits behind

---

### KI-003

**Carrito revierte tras cobro / runtime remoto (falta skipCartReconcile)** · `resolved` · severidad **critical**

**Síntomas**

- Ítems reaparecen en caja después de pagar
- Tablet y caja desincronizados tras snapshot nube
- Cobro hecho pero carrito vuelve al estado anterior

**Causa raíz:** crozzoHandleRemoteRuntimeUiSync sin skipCartReconcile ejecuta crozzoReconcileOpenSlotCartFromComandas y repone ítems desde comandas encima del runtime.

**Solución verificada:** Desde CrozzoPosRuntimeCloud.js: crozzoHandleRemoteRuntimeUiSync({ skipCartReconcile: true }) tras applyPosRuntimeSnapshot / applyRemoteRow. No reintroducir reconcile post-runtime.

**NO repetir**

- Llamar crozzoReconcileOpenSlotCartFromComandas después de apply runtime
- Quitar skipCartReconcile 'para arreglar' otro bug sin leer SEQUENCES S2

Archivos: `app/modules/CrozzoPosRuntimeCloud.js`, `app/core/CrozzoPosMain.js` · Símbolos: `crozzoHandleRemoteRuntimeUiSync`, `crozzoReconcileOpenSlotCartFromComandas`, `applyPosRuntimeSnapshot` · ADR: D-003 · Tests: `test:sync-clinical` · Corregido: v1.0.223 · Aprendido de: Regresión carrito post-cobro en tienda

---

### KI-004

**Pin local bloquea carrito remoto (mergePinned)** · `resolved` · severidad **high**

**Síntomas**

- Caja cambia mesa/carrito pero tablet no refleja
- Remoto nunca gana aunque _slotUpdatedAt sea más nuevo

**Causa raíz:** crozzoSlotCartMergePinned() devolvía true ~120s bloqueando crozzoReplaceCartsMaps remoto.

**Solución verificada:** crozzoSlotCartMergePinned() → false. Merge LWW por _slotUpdatedAt vs __crozzoLocalEdit con margen ~250ms y excepción recentTyping ~12s.

**NO repetir**

- Reintroducir pin fijo que siempre gana local
- Ignorar _slotUpdatedAt remoto

Archivos: `app/core/CrozzoPosMain.js` · Símbolos: `crozzoReplaceCartsMaps`, `crozzoSlotCartMergePinned`, `remoteSlotBeatsLocal` · ADR: D-002 · Tests: `test:sync-clinical` · Corregido: v1.0.223 · Aprendido de: Modelo caja manda rojo → todos rojo

---

### KI-005

**LAN vuelve a cloud pero tablets quedan stale** · `resolved` · severidad **high**

**Síntomas**

- Nube OK pero datos viejos en tablets
- Recover cloud no corre tras tier lan→cloud
- Ventana híbrida LAN impide reconnect

**Causa raíz:** onTierChanged priorizaba LAN ops; crozzoRunFullReconnectSync no ejecutaba al volver cloud.

**Solución verificada:** En CrozzoLanOpsSync onTierChanged: si to==='cloud' y WAN OK → stopLanOpsSync() + crozzoRunFullReconnectSync ANTES de reactivar LAN. Ver test Recover cloud en test:lan-ops-sync.

**NO repetir**

- Mantener lanSyncAllowed true indefinidamente tras volver nube
- Solo broadcast WS sin pull en dispositivos

Archivos: `app/infra/CrozzoLanOpsSync.js`, `app/infra/CrozzoReconnectSync.js` · Símbolos: `onTierChanged`, `crozzoRunFullReconnectSync`, `stopLanOpsSync` · Tests: `test:lan-ops-sync`, `test:sync-clinical` · Corregido: 2026-07 comunicación inter-dispositivos · Aprendido de: Corte 1 LanOpsSync — check Recover cloud

---

### KI-006

**Pulso LAN sin pull local** · `resolved` · severidad **high**

**Síntomas**

- Comanda llega a caja pero tablet no la ve
- WS emit OK pero UI no actualiza
- Rol B no trae snapshot tras pulso

**Causa raíz:** doEmit / lan_ops_pulse broadcast sin disparar crozzoPullComandasFromLan o equivalente en clientes.

**Solución verificada:** Tras pulso LAN: pull forzado en clientes (crozzoPullComandasFromLan force:true o handler en LanWebSocketBridge). Ver tests Pulso dispara pull.

**NO repetir**

- Asumir que POST a caja actualiza automáticamente UI remota
- Solo loguear pulso sin side-effect pull

Archivos: `app/infra/CrozzoLanOpsSync.js`, `app/infra/CrozzoLanWebSocketBridge.js`, `app/modules/CrozzoComandasCloudSync.js` · Símbolos: `doEmit`, `crozzoPullComandasFromLan` · Tests: `test:lan-ops-sync` · Corregido: 2026-07 comunicación inter-dispositivos · Aprendido de: Corte 2 LanOpsSync — Pulso dispara pull

---

### KI-007

**Fix CSS/APK no se ve ('no aplica')** · `watch` · severidad **medium**

**Síntomas**

- Usuario dice que el cambio CSS no aparece
- OK en desktop pero roto en tablet
- Regla parece correcta en DevTools desktop

**Causa raíz:** Regla competidora (media query vs crozzo-touch-shell), edit en src/ sin sync, o caché Tauri/WebView.

**Solución verificada:** 1) Grep clases en PosMain body.classList + CSS. 2) Editar app/css/*. 3) npm run sync. 4) Ctrl+Shift+R en Tauri. 5) Verificar html.crozzo-touch-shell vs @media max-width 1024px.

**NO repetir**

- Solo probar en viewport desktop
- Añadir !important sin grep de reglas APK existentes

Archivos: `app/css/CrozzoPosStyles.css`, `app/css/CrozzoPantallasShell.css` · Aprendido de: Regla crozzo-apk-verify-before-change

---

### KI-008

**Parche PosMain con fragmento stale / línea incorrecta** · `watch` · severidad **high**

**Síntomas**

- old_string no encontrado
- Función editada no es la que corre en runtime
- POSMAIN-SYNC-SYMBOLS línea no coincide

**Causa raíz:** Contexto de sesión anterior, mapa desactualizado, o grep en src/ en vez de app/.

**Solución verificada:** npm run map:refresh. npm run edit:scope -- app/core/CrozzoPosMain.js nombreFuncion. Re-leer función completa ±35 líneas. Grep referencias en app/ solamente.

**NO repetir**

- Parchear sin edit:scope en archivos críticos
- Confiar en número de línea de chat previo

Archivos: `app/core/CrozzoPosMain.js` · ADR: D-005 · Aprendido de: Monolito 51k — mapas + edit:scope

---

### KI-009

**Fanout LAN-only early-return (nube no recibe)** · `watch` · severidad **medium**

**Síntomas**

- LAN OK pero Supabase sin fila
- Otros locales no ven cambio
- Solo dispositivos LAN actualizados

**Causa raíz:** if (lan) { ... return; } en fanout/comandas sin drenar outbox cloud.

**Solución verificada:** Híbrido Z0: OpFanout + ComandasCloudSync deben enviar LAN y nube. Ver test Fanout sin early-return LAN-only.

**NO repetir**

- return temprano tras POST LAN
- Desactivar cloud path 'porque estamos en LAN'

Archivos: `app/infra/CrozzoOpFanout.js`, `app/modules/CrozzoComandasCloudSync.js` · Símbolos: `fanoutComandaEstado`, `crozzoOpFanout` · Tests: `test:sync-clinical`, `test:op-fanout` · Corregido: 2026-07 · Aprendido de: test connectivity-equilibrium check 9

---

### KI-010

**locationId distinta entre dispositivos** · `watch` · severidad **medium**

**Síntomas**

- Nunca sincroniza aunque LAN/nube OK
- Realtime suscrito pero sin eventos útiles
- Mesas vacías en un dispositivo

**Causa raíz:** Tablets/caja con distinta locationId o sede canónica mal resuelta post-QR.

**Solución verificada:** Verificar pos_dian_config / crozzo_lan_config locationId igual en todos. crozzoAbrirDiagnostico() en tienda. Re-pairing QR si corrupto.

**NO repetir**

- Debuggear merge sin verificar sede primero
- Hardcode locationId en un solo dispositivo

Archivos: `app/core/CrozzoPosMain.js`, `app/infra/CrozzoPairingAutoConnect.js` · Aprendido de: SYNC-INVARIANTS #9

---

### KI-011

**Tocar Reservorio en fix de sync Z0** · `watch` · severidad **low**

**Síntomas**

- PR gigante mezclando compras y mesas
- Bundle Reservorio regenerado sin querer
- Tests sync OK pero regresión costos

**Causa raíz:** Scope creep — Reservorio es dominio separado sin acoplamiento runtime mesa.

**Solución verificada:** Revertir cambios en CrozzoReservorio*. Limitar PR a archivos CONNECTIONS sync Z0. npm run consolidate solo si módulo fuente Reservorio fue pedido explícitamente.

**NO repetir**

- Refactor Reservorio 'de paso'
- Importar Reservorio desde PosMain sync

Archivos: `app/modules/CrozzoReservorio.js` · ADR: D-004 · Aprendido de: Política explícita usuario

---

### KI-012

**Editar app/bundles/*.js a mano** · `watch` · severidad **medium**

**Síntomas**

- Cambio desaparece tras npm run consolidate
- Diff en bundle pero no en módulo fuente

**Causa raíz:** Bundles son artefactos generados desde módulos Reservorio/Compras/Costos.

**Solución verificada:** Editar módulo fuente en app/modules/. npm run consolidate && npm run sync.

**NO repetir**

- StrReplace directo en CrozzoBundleReservorio.js

Archivos: `app/bundles/` · ADR: D-001 · Aprendido de: AGENTS.md pipeline bundles

---

### KI-013

**Hooks/reglas Cursor nuevos sin reiniciar IDE** · `watch` · severidad **low**

**Síntomas**

- block-src no bloquea
- sessionStart no inyecta contexto
- edit:scope stamp ignorado

**Causa raíz:** Cursor carga hooks.json y rules al inicio de sesión.

**Solución verificada:** Reiniciar Cursor tras cambiar .cursor/hooks.json o rules. Verificar .cursorignore activo.

**NO repetir**

- Asumir hook activo sin reinicio
- Editar hooks solo en src/

Archivos: `.cursor/hooks.json` · Aprendido de: Stack anti-stale Cursor 2026-07

---

### KI-014

**Permiso bloqueado en capa transporte (mesero no escribe)** · `watch` · severidad **medium**

**Síntomas**

- Mesero no puede comandar aunque UI debería permitir
- LAN/Supabase rechaza por rol en backend cliente

**Causa raíz:** Validación de rol en fanout/sync en vez de solo UI (crozzoHasCajaPermiso).

**Solución verificada:** Transporte siempre escribe; UI oculta/deshabilita según permiso. anular_comandado solo UI con permiso admin.

**NO repetir**

- if (!isCaja) return en crozzoSyncPosRuntimeCritical
- Mapear anular_comandado a tab_*

Archivos: `app/core/CrozzoPosMain.js` · Símbolos: `crozzoHasCajaPermiso`, `anular_comandado` · Tests: `test:sync-clinical` · Aprendido de: SYNC-INVARIANTS #5 #6

---

### KI-015

**PosMain SyntaxError Illegal return (cabecera función borrada)** · `resolved` · severidad **critical**

**Síntomas**

- Uncaught SyntaxError: Illegal return statement · CrozzoPosMain.js
- App no arranca — pantalla en blanco o POS congelado
- node --check: return fuera de función ~línea 7313

**Causa raíz:** En v1.0.223 al editar crozzoNotifySlotCartUserEdit se eliminó la línea `function crozzoKnownSalonSlotIds(tipo) {` dejando el cuerpo suelto con return out al nivel global.

**Solución verificada:** Restaurar `function crozzoKnownSalonSlotIds(tipo) {` inmediatamente antes del bloque const list/mesasCaja (~7301). Verificar con node --check app/core/CrozzoPosMain.js. Eliminar duplicado crozzoForceSedeCanonical si existe (~347).

**NO repetir**

- Editar bloques try/catch sin verificar que la función siguiente conserva su function header
- Entregar release sin node --check en PosMain

Archivos: `app/core/CrozzoPosMain.js` · Símbolos: `crozzoKnownSalonSlotIds`, `crozzoNotifySlotCartUserEdit` · Corregido: post-v1.0.223 hotfix · Aprendido de: GitHub v1.0.223 — diff a1858cb línea crozzoKnownSalonSlotIds borrada

---

### KI-016

**Comandas/mesas parpadean y desaparecen (reconcile loop + purge)** · `resolved` · severidad **critical**

**Síntomas**

- Mesas fantasma, comandas no en pantalla pero sí en mesas/cocina
- Enviar en cocina parpadea ~10 veces
- comandas obsoletas eliminadas (ausentes en nube): N
- Cobros desaparecen, mesa huérfana en cocina

**Causa raíz:** OpFanout→activate→FleetReconcile en cada despacho/runtime; crozzoHandleRemoteRuntimeUiSync sin skipCartReconcile repone carritos; reconcileStale borra comandas si pull nube vacío/parcial (401/locationId).

**Solución verificada:** skipCartReconcile en paths post-pull infra; quitar activateLocalSyncPath de OpFanout estado/runtime; guardas en reconcileStaleLocalComandas; no reconcileStale al boot; no crozzoReconcileOpenSlotCartFromComandas en cada merge cloud.

**NO repetir**

- Fleet reconcile en cada lan_up/op_fanout
- reconcileStale con cloudRows vacío y local activo
- Reconcile global carrito tras apply runtime remoto

Archivos: `app/modules/CrozzoComandasCloudSync.js`, `app/infra/CrozzoOpFanout.js`, `app/infra/CrozzoFleetOperationalReconcile.js`, `app/infra/CrozzoPairingAutoConnect.js` · Símbolos: `reconcileStaleLocalComandas`, `crozzoHandleRemoteRuntimeUiSync`, `despacharComanda` · ADR: D-003 · Tests: `test:sync-clinical` · Corregido: post-v1.0.223 hotfix · Aprendido de: Logs tienda v1.0.223 — purge 6 comandas + pushMesaRows loop

---

### KI-017

**Despacho cocina borra cuenta en caja** · `resolved` · severidad **critical**

**Síntomas**

- LISTO/enviar en pantalla cocina/bar y la mesa en caja queda vacía
- Cuenta desaparece pero mesa cambió color
- Runtime remoto vacío desde cocina pisa cartsPorMesa en caja

**Causa raíz:** Despacho en cocina llamaba schedulePosRuntimeSave → pushMesaRows podía escribir filas vacías autoritativas; merge remoto no distinguía autoridad caja (role A) vs señal cocina.

**Solución verificada:** Separación de dominios: comanda = señal (tabla comandas + fanout); carrito = solo crozzoRuntimeCartWriteAllowed (caja/tablet). pull incluye source_role; merge vacío remoto solo si source_role A o closedSlots. despacharComanda persiste local sin push runtime.

**NO repetir**

- Vaciar carrito caja al marcar comanda entregada en cocina
- Confundir línea comanda-cocina con línea cobro-caja
- Parches que conserven carrito local sin regla cloud (source_role)

Archivos: `app/core/CrozzoPosMain.js`, `app/modules/CrozzoPosRuntimeCloud.js` · Símbolos: `crozzoRuntimeCartWriteAllowed`, `crozzoRemoteCartSlotAuthoritative`, `crozzoReplaceCartsMaps`, `despacharComanda`, `pushMesaRows`, `snapFromMesaRows` · ADR: D-003 · Tests: `test:sync-clinical` · Corregido: post-v1.0.223 hotfix · Aprendido de: Tienda — despachar comandas pantalla borra cuentas caja

---

### KI-018

**Mesas borradas al entrar/salir — parches vs reservorio operativo** · `resolved` · severidad **critical**

**Síntomas**

- Mesa en rojo/comandada en grid; al abrirla el carrito vacío
- Al cerrar panel de mesa (Cerrar) la mesa queda libre sin cobrar
- Datos desaparecen al cambiar sesión caja o reconectar nube
- Parches OperationalPersistOnly / freshness no detienen el borrado

**Causa raíz:** Arquitectura invertida: el runtime operativo tenía muchos caminos que BORRABAN por defecto (freshness discard, reconcileStale, pushMesaRows vaciado autoritativo al cerrar mesa, crozzoPrepareSlotForNewService limpiando sellos al abrir). Los parches posteriores bloqueaban síntomas en 6+ archivos sin un contrato único — seguían compitiendo con sync en caja_close_order.

**Solución verificada:** CrozzoOperativeReservorio.js — mismo contrato que CrozzoReservorio: loadRaw+persist con backup v1/v2; allowAutoDiscard() siempre false salvo userConfirmed; allowCloudAuthoritativeEmpty() solo tras cobro (__crozzoRuntimeForceEmptySlots/closedSlots) o vaciar (slotLocallyClearedAt); slotHasActiveWork() evita reset en crozzoPrepareSlotForNewService; crozzoCloseCajaOrderSession reconcilia+flush antes de sync. Un módulo de política, hooks mínimos en PosMain/RuntimeCloud/SyncGate/ComandasCloud/Reconnect.

**NO repetir**

- Añadir if (!persist) en cada función de discard — usar CrozzoOperativeReservorio.allowAutoDiscard
- Parchear selectMesa/crozzoRemoteCartMergeKeepLocal sin tocar pushMesaRows vaciado autoritativo
- crozzoPrepareSlotForNewService en mesas con comanda/carrito activo
- reconcileStale / freshness purge como limpieza al entrar a caja
- Múltiples capas de política (OperationalPersistOnly + RemoteCartMerge + EnsureSlotFresh) en PosMain

Archivos: `app/modules/CrozzoOperativeReservorio.js`, `app/core/CrozzoPosMain.js`, `app/modules/CrozzoPosRuntimeCloud.js`, `app/modules/CrozzoOperativeSyncGate.js`, `app/modules/CrozzoComandasCloudSync.js`, `app/infra/CrozzoReconnectSync.js` · Símbolos: `CrozzoOperativeReservorio`, `allowAutoDiscard`, `allowCloudAuthoritativeEmpty`, `slotHasActiveWork`, `pushMesaRows`, `crozzoPrepareSlotForNewService`, `crozzoCloseCajaOrderSession`, `crozzoDiscardStaleOperationalLocal` · ADR: D-003 · Tests: `test:sync-clinical`, `_fleet-coordination-check.mjs` · Corregido: post-v1.0.223 operative-reservorio · Aprendido de: Sesión 2026-07 — usuario: guardar siempre, borrar solo con permiso; reset desde v1.0.223 + reservorio

---

### KI-019

**Riesgos residuales — reservorio operativo y sync mesas** · `watch` · severidad **medium**

**Síntomas**

- Mesa con solo comanda (carrito vacío en snap) no entra en presentKeys de pushMesaRows
- Doble push al cerrar mesa: slot_presence_exit + caja_close_order
- Backups crozzo_pos_runtime_backup_v1 vacíos hasta primer save post-deploy
- Dos equipos editando misma mesa — merge por timestamp aún puede confundir

**Causa raíz:** mesaRowsFromSnap omite slots sin líneas en carrito aunque haya comanda; release de sesión aún dispara sync; backups nuevos; multi-writer sin lock fuerte en carrito.

**Solución verificada:** Monitorear en tienda. Si reaparece borrado al cerrar: incluir refs con comanda activa en mesaRowsFromSnap. skipRuntimePush en release (pendiente). Verificar crozzoOperativeReservorio.getHealth() tras deploy.

**NO repetir**

- Asumir que allowCloudAuthoritativeEmpty cubre todos los paths de vaciado remoto en crozzoReplaceCartsMaps
- Release sin node --check PosMain ni test:sync-clinical

Archivos: `app/modules/CrozzoOperativeReservorio.js`, `app/modules/CrozzoPosRuntimeCloud.js`, `app/core/CrozzoPosMain.js` · Símbolos: `mesaRowsFromSnap`, `crozzoReleaseCajaSlotSession`, `crozzoReplaceCartsMaps` · ADR: D-003 · Tests: `test:sync-clinical` · Aprendido de: Revisión post-mortem KI-018 — 2026-07

---

### KI-020

**INSERT Realtime aplicado:false en echo propio** · `resolved` · severidad **low**

**Síntomas**

- Consola muestra INSERT aplicado: false tras comandar desde el mismo equipo
- Parece fallo de sync pero la comanda ya está en pantalla

**Causa raíz:** Supabase Realtime devuelve el INSERT que el mismo dispositivo acaba de pushear; dedup (comandaTidRecent, findComandaForCloudPay, device_id) rechaza reaplicar.

**Solución verificada:** Tratar como echo esperado: comandaInsertLikelyOwnEcho en CrozzoComandasCloudSync; log solo con crozzo_debug_sync=1. No forzar apply.

**NO repetir**

- Parchear dedup para forzar INSERT en echo propio
- Confundir con fallo de fanout LAN/nube

Archivos: `app/modules/CrozzoComandasCloudSync.js` · Símbolos: `comandaInsertLikelyOwnEcho`, `applyComandaFromCloudRow` · Tests: `test:sync-clinical` · Corregido: 2026-07-07 LOG-RUNTIME-REPAIR Fase E · Aprendido de: Logs Tauri v1.0.229 post-login caja sola

---

### KI-021

**Venta directa abre selector de mesas/llevar** · `resolved` · severidad **high**

**Síntomas**

- En caja, al pulsar Directa se muestra el grid de mesas y para llevar
- No aparece la ventana de venta directa (productos + carrito mostrador)

**Causa raíz:** directSaveMenuOpen quedaba true (picker de guardar desde directa a mesa/llevar). renderCajero prioriza ese picker cuando tipoServicioCaja==='directa' && directSaveMenuOpen. setCajaMode('directa') no lo cerraba.

**Solución verificada:** En setCajaMode('directa') y crozzoPrepareDirectSaleSession: forzar directSaveMenuOpen=false. También en crozzoCajeroPostCobroDirecta. Refuerzo 2026-07-14: al restaurar UI desde runtime local, si tipoServicioCaja==='directa' forzar directSaveMenuOpen=false (el snapshot no debe reabrir el picker).

**NO repetir**

- Cambiar orderOpen / tabs de servicio sin revisar el branch directSaveMenuOpen en renderCajero
- Asumir que setCajaMode('directa') solo cambia tipoServicioCaja
- Restaurar directSaveMenuOpen desde runtime sin mirar tipoServicioCaja

Archivos: `app/core/CrozzoPosMain.js` · Símbolos: `setCajaMode`, `crozzoPrepareDirectSaleSession`, `renderCajero`, `directSaveMenuOpen` · Corregido: 2026-07-09 · Aprendido de: Reporte caja: Directa abre mesas/llevar

---

### KI-022

**Cliente / facturación en caja: click no abre panel** · `resolved` · severidad **high**

**Síntomas**

- En caja, botón Cliente / facturación no hace nada
- No se puede buscar cliente por NIT ni integrarlo a la factura desde el carrito

**Causa raíz:** crozzoRetailToggleCliente delegaba siempre a crozzoRetailClientePopoverToggle (popup de venta-comercial). En cajero no existe #crozzoRetailClientePopoverWrap, así que returnaba sin abrir el acordeón #crozzoRetailCliente.

**Solución verificada:** En crozzoRetailToggleCliente: si existe popover → usar popover; si no → toggle clase is-open en #crozzoRetailCliente y enfocar crozzoCrmSearch. CSS: overflow visible + z-index en CRM del ticket de caja para dropdown Usar→.

**NO repetir**

- Asumir que crozzoRetailToggleCliente = popover en todas las pantallas
- Usar solo crozzoRetailClientePopoverToggle desde el acordeón de cajero

Archivos: `app/core/CrozzoPosMain.js`, `app/css/CrozzoPosStyles.css` · Símbolos: `crozzoRetailToggleCliente`, `crozzoRetailClientePanelHtml`, `crozzoCrmLiteBindCartUi` · Corregido: 2026-07-09 · Aprendido de: Reporte: buscar cliente NIT e integrar a factura — click muerto en caja

---

### KI-023

**LISTO cocina reaparece; mesas moradas; Limpiar no libera** · `resolved` · severidad **critical**

**Síntomas**

- Enviar/LISTO en cocina anima y la comanda vuelve
- Mesas siguen moradas (comandado) tras despachar
- Limpiar mesa: salgo/entro y el pedido vuelve; color sigue ocupado

**Causa raíz:** despacharComanda encola outbox y luego splice a comandaHistory; drainOutbox solo buscaba en comandas[] activas y dropeaba la clave sin upsert entregada. Pull reinyectaba la fila activa. Limpiar con comanda viva solo hacía detach (morado a propósito) y prepareSlot borraba sellos cleared al reabrir.

**Solución verificada:** Outbox: snapshot payload + outboxFindInHistory; no drop ciego de entregada. Anti-resurrección en EmergencyApply/applyComandaFromCloudRow si tid ya en history entregada. Limpiar archiva comandas vivas + markSlotLocallyCleared; prepareSlot conserva sellos si carrito vacío. skipCartReconcile en removed/refresh cajero; render mesas tras despacho.

**NO repetir**

- outboxRemove cuando outboxFindComanda es null sin mirar history/payload
- Reinsertar comanda activa si history ya tiene entregada el mismo tid
- Limpiar solo con detach dejando cocina viva si el usuario espera mesa libre
- crozzoHandleRemoteRuntimeUiSync() sin skipCartReconcile tras remove remoto

Archivos: `app/modules/CrozzoComandasCloudSync.js`, `app/core/CrozzoPosMain.js` · Símbolos: `outboxFindComanda`, `outboxEnqueue`, `drainOutbox`, `despacharComanda`, `__crozzoEmergencyApplyComandaSnapshot`, `crozzoClearSlotCartLines`, `crozzoPrepareSlotForNewService`, `crozzoApplyComandaRemovedFromRemote` · ADR: D-013 · Tests: `test:sync-clinical`, `_op-fanout-check.mjs` · Corregido: 2026-07-14 · Aprendido de: Campo: LISTO vuelve + mesas moradas + limpiar inestable

---

### KI-024

**KDS Entreg. no archiva; SyncGate rehidrata carrito** · `resolved` · severidad **high**

**Síntomas**

- Botón Entreg./Entregada en cocina KDS deja la comanda en pantalla o mesa morada
- Al entrar a caja/tablets el carrito vuelve tras vaciar/limpiar

**Causa raíz:** updateComandaEstado('entregada') marcaba estado pero no llamaba despacharComanda (sin splice/outbox history). getSlotStateInfo contaba comandas con estado entregada aún en el array. OperativeSyncGate llamaba crozzoHandleRemoteRuntimeUiSync() sin skipCartReconcile tras pull.

**Solución verificada:** updateComandaEstado → despacharComanda si entregada; no sync runtime crítico desde cocina/comandas en Prep/Lista; getSlotStateInfo ignora estado entregada; SyncGate usa skipCartReconcile:true.

**NO repetir**

- Dejar entregada en comandas[] activas
- crozzoSyncPosRuntimeCritical desde pantalla cocina al cambiar estado
- HandleRemoteRuntimeUiSync sin skipCartReconcile tras pull operativo

Archivos: `app/core/CrozzoPosMain.js`, `app/modules/CrozzoOperativeSyncGate.js` · Símbolos: `updateComandaEstado`, `despacharComanda`, `getSlotStateInfo`, `ensureOperativeReady` · ADR: D-013 · Tests: `test:sync-clinical`, `_op-fanout-check.mjs` · Corregido: 2026-07-14 · Aprendido de: Pruebas post KI-023 — hunt hermanos LISTO/mesas

---

### KI-025

**LISTO sticky reaparece; eco LAN; entregada fantasma en KDS** · `resolved` · severidad **high**

**Síntomas**

- LISTO anima y la nota vuelve un momento
- Flicker / doble eco al despachar por LAN
- KDS/corcho muestra tickets ya entregados

**Causa raíz:** Animación LISTO despachaba al final → refresh reponía sticky. Receptores LAN/mesh re-fanouteaban entregada. cocinaComandaMatchesFilters y purge keep'eaban entregada en comandas[].

**Solución verificada:** despacharComanda antes de animar (skipRender); skipFanout en despacho remoto; filtros/purge sacan entregada del array activo; toast Limpiar parcial honesto.

**NO repetir**

- Despachar solo en callback de animación
- despacharComanda remoto sin skipFanout
- keep.push de entregada en comandas activas

Archivos: `app/core/CrozzoPosMain.js`, `app/infra/CrozzoLanSyncBridge.js`, `app/infra/CrozzoLanWebSocketBridge.js`, `app/infra/CrozzoOperationalIngest.js`, `app/infra/CrozzoOfflineGossip.js` · Símbolos: `crozzoStickyMarcarListo`, `despacharComanda`, `cocinaComandaMatchesFilters`, `crozzoPurgeGhostComandasForClearedSlots`, `crozzoRemoveStaleComandas` · ADR: D-013 · Tests: `test:sync-clinical` · Corregido: 2026-07-14 · Aprendido de: Revisión humana post KI-023/024 — funcionamiento a medias

---

### KI-026

**Caja: Limpiar Directa tumba M1; cobro sin comanda; panel cierra tras comandar** · `resolved` · severidad **critical**

**Síntomas**

- Vaciar venta directa libera/archiva mesa M1 en cocina
- Cobrar en Directa factura aunque la comanda quedó pendiente/falló
- Tras Comandar en mesa vuelve al grid y no se puede precuenta/cobrar seguido
- Menú Cuenta / precuenta sin feedback o sin permiso

**Causa raíz:** clearCart mapeaba Directa a tipo mesa+mesaSeleccionada(M1). confirmarCobro/efectivo rápido llamaban comandarDesdeCaja sin chequear resultado. comandarDesdeCaja cerraba sesión al no haber pendientes. Precuenta caja sin gate tab_precuenta; returns silenciosos.

**Solución verificada:** purgeLocalOnly para directa/comercial; cobro Directa aborta si comandar=false (pending vacío = true); no auto-cerrar panel tras comandar; permiso precuenta + toasts en menú/cobro vacío.

**NO repetir**

- Usar mesaSeleccionada al vaciar cartDirecto
- facturar tras comandarDesdeCaja sin mirar retorno
- crozzoCloseCajaOrderSession inmediato tras comandar en caja

Archivos: `app/core/CrozzoPosMain.js` · Símbolos: `clearCart`, `comandarDesdeCaja`, `confirmarCobroDesdeCaja`, `cobrarEfectivoExactoDesdeCaja`, `crozzoCuentaCobroElegir`, `crozzoPrecuentaRapidaImprimir` · ADR: D-013 · Tests: `test:sync-clinical` · Corregido: 2026-07-14 · Aprendido de: Pedido: cada acción de caja debe funcionar (cobrar/precuenta/comandar/borrar)

---

### KI-027

**Mesero tablet: −/nota/comandar usan carrito o gates incorrectos** · `resolved` · severidad **high**

**Síntomas**

- En tablets el botón − quita de cartDirecto (caja) en vez del carrito de mesa
- Subir cantidad o cambiar nota no marca edit local / no finaliza mutación (revierte sync)
- confirmTabletComanda sin chequeo de permiso ni toast si carrito vacío
- clearCart en página tablets usaba context caja / carrito de mesaSeleccionada

**Causa raíz:** crozzoCartLineRemoveFromBtn → removeFromCart → getActiveCart (directa). Add/nota sin crozzoMarkCartLineLocalEdit + crozzoFinalizeCartMutation. Permiso tab_abrir solo en showTabletConfirmComanda (ruta muerta). clearCart no delegaba a tabletClearCart.

**Solución verificada:** Remove en tablets → tabletRemoveFromCart; add/nota con mark+finalize; confirmTabletComanda chequea abrir_orden context tablet + toasts; clearCart en tablets → tabletClearCart. Nota post-comanda gated con crozzoOperativeCanTouchSentLine.

**NO repetir**

- Usar getActiveCart/removeFromCart desde UI de tablets
- Mutar carrito tablet sin finalize/mark local edit
- Bloquear el + de cantidad con gate post-comanda (suma pendiente es válido)

Archivos: `app/core/CrozzoPosMain.js` · Símbolos: `crozzoCartLineAddFromBtn`, `crozzoCartLineRemoveFromBtn`, `crozzoEditCartItemNotaByIndex`, `crozzoSaveCartItemNotaFromModal`, `confirmTabletComanda`, `clearCart`, `tabletClearCart` · ADR: D-013 · Tests: `test:sync-clinical` · Corregido: 2026-07-14 · Aprendido de: Oleada B ROLE-OPS — auditoría 1×1 mesero tablets

---

### KI-028

**Encargado: botón − en línea comandada solo toast; no anula ni void cocina** · `resolved` · severidad **critical**

**Síntomas**

- Encargado ve − en línea ya enviada pero al tocarlo solo dice 'solo encargado puede'
- Anular desde tablet no baja cantidad ni actualiza comanda en cocina
- UI crozzoCartLineShowMinus permite − pero removeFromCart/tabletRemoveFromCart bloquean siempre

**Causa raíz:** removeFromCart y tabletRemoveFromCart hacían early-return si cantidad<=sent con crozzoNotifyPostComandarBlocked sin consultar crozzoCanAnularComandado ni crozzoVoidCartLineInComandas. Solo removeCartItemCompletely (botón Eliminar) tenía el path de anular.

**Solución verificada:** Si cantidad<=sent y crozzoCanAnularComandado: void 1 ud (o línea) vía crozzoVoidCartLineInComandas, bajar sentCantidad/cantidad, finalize mutation. Mesero sigue bloqueado con toast.

**NO repetir**

- Mostrar − post-comanda sin path de anular
- Anular solo en Eliminar y no en −
- Bajar cantidad comandada sin void en comandas[]

Archivos: `app/core/CrozzoPosMain.js` · Símbolos: `removeFromCart`, `tabletRemoveFromCart`, `crozzoVoidCartLineInComandas`, `crozzoCanAnularComandado`, `crozzoCartLineShowMinus` · ADR: D-013 · Tests: `test:sync-clinical` · Corregido: 2026-07-14 · Aprendido de: Oleada D ROLE-OPS — encargado anular 1×1

---

### KI-029

**Encargado legacy sin anular_comandado (migración v1 solo admin)** · `resolved` · severidad **high**

**Síntomas**

- Usuario rol encargado no puede anular ítems comandados aunque la plantilla sí lo incluye
- Botón − / Eliminar post-comanda siempre denegado para encargado de tienda antigua

**Causa raíz:** crozzoMigrateStaffCajaSecurity v1 añadía anular_comandado solo a admin/superadmin/KENNY. Encargados creados antes o con permisos parciales nunca recibían el flag.

**Solución verificada:** Migración crozzo_caja_security_v9: rol encargado recibe anular_comandado, eliminar_item, tab_eliminar, descuento_autorizado si faltan.

**NO repetir**

- Asumir que rol===encargado implica anular sin mirar u.permisos.caja
- Migrar solo admin y dejar encargado a mano

Archivos: `app/core/CrozzoPosMain.js` · Símbolos: `crozzoMigrateStaffCajaSecurity`, `CROZZO_CAJA_PERMISOS_POR_ROL` · Tests: `test:sync-clinical` · Corregido: 2026-07-14 · Aprendido de: Oleada D/E ROLE-OPS — permisos plantilla vs staff legacy

---

### KI-030

**Cerrar/cambiar modo abandona mesa con consumo sin cobro** · `resolved` · severidad **critical**

**Síntomas**

- Con mesa abierta y consumo, Cerrar o Directa/Mesas/Llevar suelta el slot sin cobrar
- crozzoGuardLeaveUnpaidSlot solo corría al cambiar de mesa, no al cerrar panel
- Unir/Dividir en Directa o sin slot abierto fallaba en silencio

**Causa raíz:** crozzoCloseCajaOrderSession y setCajaMode no llamaban crozzoGuardLeaveUnpaidSlot. Unir/dividir tenían return bare en directa/!ref.

**Solución verificada:** Guard unpaid en close + setCajaMode (skipUnpaidGuard tras check). Toasts en unir/dividir para directa y slot vacío.

**NO repetir**

- Cerrar sesión de mesa sin mirar consumo pendiente
- return silencioso en flujos de gestión de cuenta

Archivos: `app/core/CrozzoPosMain.js` · Símbolos: `crozzoCloseCajaOrderSession`, `setCajaMode`, `crozzoGuardLeaveUnpaidSlot`, `crozzoShowUnirCuentaModal`, `crozzoShowDividirCuentaModal` · Tests: `test:sync-clinical` · Corregido: 2026-07-14 · Aprendido de: Oleada F ROLE-OPS — gestión interacción cuenta

---

### KI-031

**Recepción RBAC desalinhado; precuenta caja exigía tab_precuenta** · `resolved` · severidad **high**

**Síntomas**

- Plantilla recepción ≠ Policy ≠ menú hotel (eliminar/cierre vs unir)
- Precuenta en menú Cuenta siempre denegada para caja/recepción sin tab_precuenta
- PerfilesLogica trataba recepción como caja (fallback)

**Causa raíz:** Tres fuentes de verdad: CROZZO_CAJA_PERMISOS_POR_ROL, ROLE_PERM_PRESETS (recepcion fuera de ROLE_ORDER), OPERATIVE_PROFILES sin recepcion. Precuenta post KI-026 solo tab_precuenta.

**Solución verificada:** Alinear plantilla+Policy+plantilla staff; ROLE_ORDER+LABELS recepcion; perfil operativo recepción; precuenta OK con facturar|tab_precuenta; migración v10.

**NO repetir**

- Tener recepción solo en un archivo de permisos
- Exigir tab_precuenta en caja cuando facturar ya implica cobrar/precuenta

Archivos: `app/core/CrozzoPosMain.js`, `app/modules/CrozzoPermisosPolicy.js`, `app/modules/CrozzoPerfilesLogica.js` · Símbolos: `CROZZO_CAJA_PERMISOS_POR_ROL`, `ROLE_PERM_PRESETS`, `crozzoCuentaCobroElegir`, `crozzoMigrateStaffCajaSecurity` · Tests: `test:sync-clinical` · Corregido: 2026-07-14 · Aprendido de: Oleada F ROLE-OPS — recepción + precuenta

---

### KI-032

**LISTO/Entreg. sin permiso despachar (solo ver abre cocina)** · `resolved` · severidad **high**

**Síntomas**

- Usuario con comandas:ver puede marcar LISTO y archivar
- crozzoOperativeCan('marcar_listo') existía pero no se llamaba

**Causa raíz:** crozzoStickyMarcarListo y updateComandaEstado despachaban sin crozzoCanMarcarListoComanda.

**Solución verificada:** crozzoCanMarcarListoComanda (operative + despachar); gate LISTO y updateComandaEstado salvo skipFanout/skipPermiso remoto.

**NO repetir**

- Confundir PAGE_PERMISOS (entrar) con acción despachar
- Gatear despacharComanda interno de Limpiar/remoto sin skipPermiso

Archivos: `app/core/CrozzoPosMain.js` · Símbolos: `crozzoCanMarcarListoComanda`, `crozzoStickyMarcarListo`, `updateComandaEstado` · ADR: D-013 · Tests: `test:sync-clinical` · Corregido: 2026-07-14 · Aprendido de: Oleada F ROLE-OPS — cocina rol vs ver-only

---

### KI-033

**Reimprimir/arqueo/descuento/inventario/abrir mesa: gates y menús rotos** · `resolved` · severidad **high**

**Síntomas**

- Reimprimir comanda sin permiso reimprimir (solo ver)
- Recepción con cierre_arqueo no podía cerrar; encargado cerraba aunque le quitaran el flag
- calcArqueo/finalizeArqueo denegaban en silencio
- Quitar descuento sin descuento_autorizado
- Inventario: No autorizado en proveedores/cotizaciones (menú incompleto)
- Abrir mesa sin abrir_orden

**Causa raíz:** reprintComanda sin gate; canPerformArqueo por rol hardcode no cierre_arqueo; inventario fallback menus sin compras-proveedores/cotizaciones; selectMesa sin permiso; quitar descuento sin require.

**Solución verificada:** crozzoCanReimprimirComanda; canPerformArqueo→cierre_arqueo + toasts; menús inventario + cotizaciones/recepcion; selectMesa/Llevar abrir_orden; crozzoQuitarDescuentoVenta gated; cocina MENU_PERM_MAP + reimprimir.

**NO repetir**

- Autorizar arqueo solo por rol string
- Menú inventario = solo centro-compras
- Acción cocina (reprint/LISTO) sin subpermiso comandas

Archivos: `app/core/CrozzoPosMain.js`, `app/modules/CrozzoCierreTurnos.js`, `app/modules/CrozzoPermisosPolicy.js`, `app/modules/CrozzoPerfilesOperativos.js` · Símbolos: `reprintComanda`, `canPerformArqueo`, `selectMesa`, `selectLlevar`, `crozzoQuitarDescuentoVenta`, `getMenusForRole` · Tests: `test:sync-clinical` · Corregido: 2026-07-14 · Aprendido de: Mejora ROLE-OPS F — inventario/cierre/reimprimir

---

### KI-034

**Residuales sede: tablet RBAC, open slot, reimprimir legacy, automation LISTO** · `resolved` · severidad **critical**

**Síntomas**

- Caja/recepción en tablets: tab_precuenta hace fallar abrir_orden/comandar
- selectTabletMesa sin gate; selectMesa bloqueaba encargado solo-anular
- Cocina legacy sin reimprimir tras KI-033
- printAllPendingByArea y AutomationApi LISTO sin skipPermiso

**Causa raíz:** hasTabSet incluía tab_precuenta y cortaba fallback POS; tablet open ungated; sin migración reimprimir; automation llamaba updateComandaEstado sin skipPermiso.

**Solución verificada:** Tablet: aceptar lista.includes(sub) POS; crozzoCanOpenOrderSlot(abrir|anular); gate selectTablet*; migración v11 reimprimir; printAllPending gated; Automation skipPermiso.

**NO repetir**

- Tratar tab_precuenta como set completo de tab_abrir/editar/eliminar
- Gatear solo selectMesa y olvidar selectTabletMesa

Archivos: `app/core/CrozzoPosMain.js`, `app/infra/CrozzoAutomationApi.js` · Símbolos: `crozzoHasCajaPermiso`, `crozzoCanOpenOrderSlot`, `selectTabletMesa`, `selectTabletLlevar`, `crozzoMigrateStaffCajaSecurity`, `printAllPendingByArea`, `updateKitchenOrder` · Tests: `test:sync-clinical` · Corregido: 2026-07-14 · Aprendido de: Verificación residual pre-sede ROLE-OPS

---

### KI-035

**Sidebar hover oscila al scrollear (abre/cierra en bucle)** · `resolved` · severidad **high**

**Síntomas**

- Al abrir el panel lateral e intentar bajar, abre y cierra muchas veces por segundo
- Tras ~1s queda cerrado y luego 'funciona'
- Parches CSS de 1cm empeoran otras pantallas

**Causa raíz:** Máquina hover en CrozzoSidebarNav: pointer+mouse duplicados, pointermove global pelea con leave durante width transition; remount del toggle dispara leave; scroll no armaba lock; --sidebar-ease-open con overshoot empeoraba hit-testing.

**Solución verificada:** Solo canal pointer; lock transición + scroll/wheel; ignorar leave durante lock/DOM remount; easing sin overshoot; debug __CROZZO_SIDEBAR_HOVER_DEBUG. Archivos: app/ui/CrozzoSidebarNav.js, tokens sidebar en CrozzoPosStyles.css.

**NO repetir**

- Mover márgenes/easing a ciegas sin tocar la máquina de estados
- Re-añadir mouseenter/mouseleave junto a pointerenter/leave
- Animar page-enter en P0 para 'compensar' el feel del sidebar

Archivos: `app/ui/CrozzoSidebarNav.js`, `app/css/CrozzoPosStyles.css` · Símbolos: `bindDesktopSidebarHover`, `scheduleHoverOpen`, `scheduleHoverClose`, `armSidebarScrollLock`, `isSidebarHoverLocked` · Corregido: 2026-07-20 · Aprendido de: Reporte usuario: sidebar abre/cierra ~10×/s al scrollear

---

### KI-036

**Diseñador ticket: edición de ley/título no se refleja ni persiste** · `resolved` · severidad **high**

**Síntomas**

- Al editar título legal o pie legal, la vista previa no cambia
- El editor parece actualizarse solo y pierde el texto escrito
- Tras sync idle o reabrir Diseño, el título vuelve vacío

**Causa raíz:** normalizeFacturaTplBlocks vaciaba title.c en cada polish; exportTpl hacía ensure/dedupe sobre slice shallow (mutaba state); preview/print de legal_co/resol ignoraban b.c; crozzoTermicaNormalizePlantilla con skipPolish aún corría ensureFacturaBlocks.

**Solución verificada:** stripDynamicTitle solo con opts explícito; exportTpl deep-clone + polish light (sin ensure/dedupe); preview/print usan String(b.c).trim()||dato DIAN; skipPolish salta ensure. Archivos: Crozzo_POS_DisenadorTicket.html, CrozzoTermicaColombia.js, CrozzoPrintService.js, CrozzoTermicaPremium.js, crozzoTermicaNormalizePlantilla en PosMain.

**NO repetir**

- Llamar ensureFacturaBlocks/polishTplForDocType en cada tecla o idle sync del diseñador
- Vaciar title.c en normalización de plantilla de estudio
- Renderizar legal_co solo con data.legalCo ignorando b.c

Archivos: `app/Crozzo_POS_DisenadorTicket.html`, `app/core/CrozzoTermicaColombia.js`, `app/core/CrozzoPrintService.js`, `app/core/CrozzoTermicaPremium.js`, `app/core/CrozzoPosMain.js` · Símbolos: `normalizeFacturaTplBlocks`, `exportTpl`, `polishTplForDesigner`, `crozzoTermicaNormalizePlantilla` · Corregido: 2026-07-20 · Aprendido de: Reporte: comando actualizar ley se bugea y no refleja edición

---

### KI-037

**Reporte IA: UI remonta y borra key / Guardar parece fallar** · `resolved` · severidad **high**

**Síntomas**

- Panel Inteligencia se actualiza solo y vacía la key pegada
- Guardar no deja probar; input se limpia y parece que no persistió
- Click Configurar Reporte IA resetea el formulario estando ya en Nube

**Causa raíz:** mountAiInsightsAdminCard siempre reemplazaba host.innerHTML; crozzoOpenAiInsightsConfig hacía navigateTo aunque currentPage ya era super-admin-nube; saveApiKey hacía await invokeFn(save_key,{force:true}) a Edge (CORS/hang) antes de confirmar UX.

**Solución verificada:** Skip remount si card live/draft/busy/lock; openConfig solo scroll si ya en nube; saveApiKey local-first; probe session fuera del DOM (setProbeSession/applyProbeSessionToDom) para sobrevivir remount; Rust timeout NVIDIA 120s (async). Archivos: CrozzoAiInsights.js, CrozzoSuperAdminNube.js, crozzo_http.rs.

**NO repetir**

- Remontar el card AI en cada init/retry sin comprobar draft
- navigateTo('super-admin-nube') si ya está en esa página solo para scroll
- Bloquear Guardar esperando Edge/CORS
- Vaciar #crozzoAiApiKey sin confirmar localStorage
- Actualizar probe con closures DOM stale tras remount
- Timeout Rust 35s (NVIDIA NIM suele >60s)

Archivos: `app/modules/CrozzoAiInsights.js`, `app/modules/CrozzoSuperAdminNube.js` · Símbolos: `mountAiInsightsAdminCard`, `crozzoOpenAiInsightsConfig`, `saveApiKey`, `formHasDraft`, `setAiBusy` · Corregido: 2026-07-20 · Aprendido de: Sesión: interfaz se actualiza sola, borra datos, no deja probar NVIDIA

---

### KI-038

**Cierre de turnos titila: remount por fanout LAN/comandas** · `resolved` · severidad **critical**

**Síntomas**

- Al entrar a Cierre la pantalla parpadea / recarga muchas veces
- KPIs y panel se reinician en vivo con LAN/comandas activos

**Causa raíz:** crozzoScheduleOperationalPageRefresh(currentPage) con currentPage=cierre-caja no tenía patch; caía a renderPage → mountCierrePage (innerHTML wipe). LanOps/Ingest/PageCloudWatch/fleet disparan schedule con la página actual aunque el evento sea de comandas.

**Solución verificada:** crozzoPatchOperationalPageFromRemote('cierre-caja') → CrozzoCierreTurnos.refreshPanel({full:true}) sin remount. Defensa extra en schedule antes de renderPage. Suprimir page-enter motion en cierre-caja. Card Auditoría IA debajo de KPIs (no al final).

**NO repetir**

- renderPage('cierre-caja') desde refresh operativo/LAN
- Asumir que patch solo aplica a Z0 y dejar cierre caer a remount
- Poner UI crítica de cierre al final del scroll sin KPIs cerca

Archivos: `app/core/CrozzoPosMain.js`, `app/modules/CrozzoCierreTurnos.js`, `app/modules/CrozzoAiInsights.js` · Símbolos: `crozzoPatchOperationalPageFromRemote`, `crozzoScheduleOperationalPageRefresh`, `mountCierrePage`, `refreshPanel` · Corregido: 2026-07-20 · Aprendido de: Sesión: mando — cierre titila y no ve auditoría IA

---

## Agregar entrada nueva

1. `npm run issues:next-id` → copiar plantilla en [`ISSUE-TEMPLATE.json`](ISSUE-TEMPLATE.json)
2. Pegar en `known-issues.json` → `issues[]`
3. `npm run issues:validate && npm run issues:refresh`
4. Si es decisión permanente, también [`DECISIONS.md`](DECISIONS.md)
