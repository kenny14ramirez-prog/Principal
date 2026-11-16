<!-- AUTO-GENERATED from known-issues.json — editar JSON, luego npm run issues:refresh -->

# Errores conocidos y soluciones

> **48 entradas** · actualizado 2026-11-13T23:07:17.108Z · fuente canónica: [`known-issues.json`](known-issues.json)

Consultar **antes** de parchear sync/LAN/CSS/APK. Buscar: `npm run issues:search -- "texto"`

---

## Índice rápido

| ID | Severidad | Título | Tags |
|----|-----------|--------|------|
| [KI-001](#ki-001) | critical | Editar src/ en vez de app/ | workflow, stale, mirror |
| [KI-002](#ki-002) | critical | Git local detrÃ¡s de origin/main | workflow, stale, git |
| [KI-003](#ki-003) | critical | Carrito revierte tras cobro / runtime remoto (falta skipCartReconcile) | sync, cart, runtime, regression |
| [KI-004](#ki-004) | high | Pin local bloquea carrito remoto (mergePinned) | sync, cart, tablet, regression |
| [KI-005](#ki-005) | high | LAN vuelve a cloud pero tablets quedan stale | lan, cloud, tier, reconnect |
| [KI-006](#ki-006) | high | Pulso LAN sin pull local | lan, comandas, pull |
| [KI-007](#ki-007) | medium | Fix CSS/APK no se ve ('no aplica') | css, apk, tablet, workflow |
| [KI-008](#ki-008) | high | Parche PosMain con fragmento stale / lÃ­nea incorrecta | posmain, workflow, stale |
| [KI-009](#ki-009) | medium | Fanout LAN-only early-return (nube no recibe) | sync, fanout, cloud, lan |
| [KI-010](#ki-010) | medium | locationId distinta entre dispositivos | sync, config, field |
| [KI-011](#ki-011) | low | Tocar Reservorio en fix de sync Z0 | scope, reservorio |
| [KI-012](#ki-012) | medium | Editar app/bundles/*.js a mano | workflow, bundles |
| [KI-013](#ki-013) | low | Hooks/reglas Cursor nuevos sin reiniciar IDE | workflow, cursor |
| [KI-014](#ki-014) | medium | Permiso bloqueado en capa transporte (mesero no escribe) | sync, permissions |
| [KI-015](#ki-015) | critical | PosMain SyntaxError Illegal return (cabecera funciÃ³n borrada) | syntax, posmain, regression, release |
| [KI-016](#ki-016) | critical | Comandas/mesas parpadean y desaparecen (reconcile loop + purge) | sync, comandas, cocina, regression, fleet |
| [KI-017](#ki-017) | critical | Despacho cocina borra cuenta en caja | sync, cart, cocina, caja, comandas |
| [KI-018](#ki-018) | critical | Mesas borradas al entrar/salir â€” parches vs reservorio operativo | sync, cart, caja, mesa, architecture, reservorio |
| [KI-019](#ki-019) | medium | Riesgos residuales â€” reservorio operativo y sync mesas | sync, watch, mesa, reservorio |
| [KI-020](#ki-020) | low | INSERT Realtime aplicado:false en echo propio | sync, comandas, realtime, noise |
| [KI-021](#ki-021) | high | Venta directa abre selector de mesas/llevar | caja, ui, venta-directa |
| [KI-022](#ki-022) | high | Cliente / facturaciÃ³n en caja: click no abre panel | caja, crm, ui, factura |
| [KI-023](#ki-023) | critical | LISTO cocina reaparece; mesas moradas; Limpiar no libera | sync, comandas, cocina, mesa, outbox |
| [KI-024](#ki-024) | high | KDS Entreg. no archiva; SyncGate rehidrata carrito | sync, comandas, cocina, kds, mesa |
| [KI-025](#ki-025) | high | LISTO sticky reaparece; eco LAN; entregada fantasma en KDS | sync, comandas, cocina, ux, lan |
| [KI-026](#ki-026) | critical | Caja: Limpiar Directa tumba M1; cobro sin comanda; panel cierra tras comandar | caja, cobro, precuenta, comandar, directa |
| [KI-027](#ki-027) | high | Mesero tablet: âˆ’/nota/comandar usan carrito o gates incorrectos | tablet, mesero, cart, permisos, sync |
| [KI-028](#ki-028) | critical | Encargado: botÃ³n âˆ’ en lÃ­nea comandada solo toast; no anula ni void cocina | encargado, anular_comandado, tablet, caja, comandas |
| [KI-029](#ki-029) | high | Encargado legacy sin anular_comandado (migraciÃ³n v1 solo admin) | encargado, permisos, admin, migration |
| [KI-030](#ki-030) | critical | Cerrar/cambiar modo abandona mesa con consumo sin cobro | caja, recepcion, cuenta, gestion, interaction |
| [KI-031](#ki-031) | high | RecepciÃ³n RBAC desalinhado; precuenta caja exigÃ­a tab_precuenta | recepcion, permisos, precuenta, caja, rbac |
| [KI-032](#ki-032) | high | LISTO/Entreg. sin permiso despachar (solo ver abre cocina) | cocina, comandas, permisos, listo |
| [KI-033](#ki-033) | high | Reimprimir/arqueo/descuento/inventario/abrir mesa: gates y menÃºs rotos | permisos, cocina, cierre, inventario, caja, gestion |
| [KI-034](#ki-034) | critical | Residuales sede: tablet RBAC, open slot, reimprimir legacy, automation LISTO | tablet, permisos, caja, recepcion, cocina, residual |
| [KI-035](#ki-035) | high | Sidebar hover oscila al scrollear (abre/cierra en bucle) | css, ui, sidebar, motion, desktop |
| [KI-036](#ki-036) | high | DiseÃ±ador ticket: ediciÃ³n de ley/tÃ­tulo no se refleja ni persiste | print, ticket, designer, factura, ui |
| [KI-037](#ki-037) | high | Reporte IA: UI remonta y borra key / Guardar parece fallar | ai, nvidia, ui, super-admin, regression |
| [KI-038](#ki-038) | critical | Cierre de turnos titila: remount por fanout LAN/comandas | cierre, remount, lan, regression, ui |
| [KI-039](#ki-039) | high | WhatsApp dock no se activaba (setWaActive) | docks, whatsapp |
| [KI-040](#ki-040) | high | Gmail/Drive invocaban comando de WhatsApp | docks, gmail, drive |
| [KI-041](#ki-041) | medium | Zoom no aplicaba a Gmail/Drive | docks, zoom |
| [KI-042](#ki-042) | high | Timer de 2s + show() sin comprobar WANT_VISIBLE en 9 ventanas | docks, rust, timer |
| [KI-043](#ki-043) | high | renderPage devuelve cadena vacía en 6 páginas de docks | docks, ui |
| [KI-044](#ki-044) | medium | Supabase dock: id desalineado (supabase vs supabase-nube vs supabase-nube-web) | docks, supabase |
| [KI-045](#ki-045) | high | YouTube y Facebook no están en la política de apps (no usables) | docks, policy |
| [KI-046](#ki-046) | medium | Click-outside atado al primer dock inicializado | docks, ui |
| [KI-047](#ki-047) | high | Auth LAN desactivable con token vacío | lan, security |
| [KI-048](#ki-048) | critical | OTA con clave no coincidente | ota, firma |

---

## Entradas

### KI-001

**Editar src/ en vez de app/** · `resolved` · severidad **critical**

**Síntomas**

- El cambio no aparece en Tauri/APK
- git diff muestra src/ pero no app/
- El agente parcheÃ³ el espejo

**Causa raíz:** Tauri sirve src/ generado; app/ es la fuente canÃ³nica. Editar src/ se pierde en el prÃ³ximo sync o nunca existiÃ³ en app/.

**Solución verificada:** Revertir edit en src/. Aplicar el mismo diff en app/ equivalente. Ejecutar npm run sync. Hook block-src-mirror-writes debe bloquear nuevos intentos.

**NO repetir**

- Parchear src/core/CrozzoPosMain.js
- Confiar en fragmentos leÃ­dos solo de src/

Archivos: `app/`, `src/` · ADR: D-001 · Corregido: 2026-07 â€” hooks + .cursorignore · Aprendido de: Sesiones con diff en src/ sin reflejo en app/

---

### KI-002

**Git local detrÃ¡s de origin/main** · `watch` · severidad **critical**

**Síntomas**

- PosMain tiene ~44k lÃ­neas cuando origin tiene ~51k
- Funciones sync que el agente cita no existen
- test:sync-clinical pasa pero tienda falla

**Causa raíz:** HEAD local desalineado; el agente razona sobre cÃ³digo viejo cacheado o en disco.

**Solución verificada:** git fetch origin && git status -sb. Si behind > 0: git pull --rebase origin main (o alinear segÃºn polÃ­tica del equipo). Verificar releases/latest.json y crozzo-app-version en index.html.

**NO repetir**

- Parchear sobre PosMain viejo sin pull
- Asumir que la sesiÃ³n anterior tiene la versiÃ³n correcta

Archivos: `app/core/CrozzoPosMain.js` · Tests: `test:sync-clinical` · Aprendido de: Reset a a1858cb v1.0.223 tras 70 commits behind

---

### KI-003

**Carrito revierte tras cobro / runtime remoto (falta skipCartReconcile)** · `resolved` · severidad **critical**

**Síntomas**

- Ãtems reaparecen en caja despuÃ©s de pagar
- Tablet y caja desincronizados tras snapshot nube
- Cobro hecho pero carrito vuelve al estado anterior

**Causa raíz:** crozzoHandleRemoteRuntimeUiSync sin skipCartReconcile ejecuta crozzoReconcileOpenSlotCartFromComandas y repone Ã­tems desde comandas encima del runtime.

**Solución verificada:** Desde CrozzoPosRuntimeCloud.js: crozzoHandleRemoteRuntimeUiSync({ skipCartReconcile: true }) tras applyPosRuntimeSnapshot / applyRemoteRow. No reintroducir reconcile post-runtime.

**NO repetir**

- Llamar crozzoReconcileOpenSlotCartFromComandas despuÃ©s de apply runtime
- Quitar skipCartReconcile 'para arreglar' otro bug sin leer SEQUENCES S2

Archivos: `app/modules/CrozzoPosRuntimeCloud.js`, `app/core/CrozzoPosMain.js` · Símbolos: `crozzoHandleRemoteRuntimeUiSync`, `crozzoReconcileOpenSlotCartFromComandas`, `applyPosRuntimeSnapshot` · ADR: D-003 · Tests: `test:sync-clinical` · Corregido: v1.0.223 · Aprendido de: RegresiÃ³n carrito post-cobro en tienda

---

### KI-004

**Pin local bloquea carrito remoto (mergePinned)** · `resolved` · severidad **high**

**Síntomas**

- Caja cambia mesa/carrito pero tablet no refleja
- Remoto nunca gana aunque _slotUpdatedAt sea mÃ¡s nuevo

**Causa raíz:** crozzoSlotCartMergePinned() devolvÃ­a true ~120s bloqueando crozzoReplaceCartsMaps remoto.

**Solución verificada:** crozzoSlotCartMergePinned() â†’ false. Merge LWW por _slotUpdatedAt vs __crozzoLocalEdit con margen ~250ms y excepciÃ³n recentTyping ~12s.

**NO repetir**

- Reintroducir pin fijo que siempre gana local
- Ignorar _slotUpdatedAt remoto

Archivos: `app/core/CrozzoPosMain.js` · Símbolos: `crozzoReplaceCartsMaps`, `crozzoSlotCartMergePinned`, `remoteSlotBeatsLocal` · ADR: D-002 · Tests: `test:sync-clinical` · Corregido: v1.0.223 · Aprendido de: Modelo caja manda rojo â†’ todos rojo

---

### KI-005

**LAN vuelve a cloud pero tablets quedan stale** · `resolved` · severidad **high**

**Síntomas**

- Nube OK pero datos viejos en tablets
- Recover cloud no corre tras tier lanâ†’cloud
- Ventana hÃ­brida LAN impide reconnect

**Causa raíz:** onTierChanged priorizaba LAN ops; crozzoRunFullReconnectSync no ejecutaba al volver cloud.

**Solución verificada:** En CrozzoLanOpsSync onTierChanged: si to==='cloud' y WAN OK â†’ stopLanOpsSync() + crozzoRunFullReconnectSync ANTES de reactivar LAN. Ver test Recover cloud en test:lan-ops-sync.

**NO repetir**

- Mantener lanSyncAllowed true indefinidamente tras volver nube
- Solo broadcast WS sin pull en dispositivos

Archivos: `app/infra/CrozzoLanOpsSync.js`, `app/infra/CrozzoReconnectSync.js` · Símbolos: `onTierChanged`, `crozzoRunFullReconnectSync`, `stopLanOpsSync` · Tests: `test:lan-ops-sync`, `test:sync-clinical` · Corregido: 2026-07 comunicaciÃ³n inter-dispositivos · Aprendido de: Corte 1 LanOpsSync â€” check Recover cloud

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

- Asumir que POST a caja actualiza automÃ¡ticamente UI remota
- Solo loguear pulso sin side-effect pull

Archivos: `app/infra/CrozzoLanOpsSync.js`, `app/infra/CrozzoLanWebSocketBridge.js`, `app/modules/CrozzoComandasCloudSync.js` · Símbolos: `doEmit`, `crozzoPullComandasFromLan` · Tests: `test:lan-ops-sync` · Corregido: 2026-07 comunicaciÃ³n inter-dispositivos · Aprendido de: Corte 2 LanOpsSync â€” Pulso dispara pull

---

### KI-007

**Fix CSS/APK no se ve ('no aplica')** · `watch` · severidad **medium**

**Síntomas**

- Usuario dice que el cambio CSS no aparece
- OK en desktop pero roto en tablet
- Regla parece correcta en DevTools desktop

**Causa raíz:** Regla competidora (media query vs crozzo-touch-shell), edit en src/ sin sync, o cachÃ© Tauri/WebView.

**Solución verificada:** 1) Grep clases en PosMain body.classList + CSS. 2) Editar app/css/*. 3) npm run sync. 4) Ctrl+Shift+R en Tauri. 5) Verificar html.crozzo-touch-shell vs @media max-width 1024px.

**NO repetir**

- Solo probar en viewport desktop
- AÃ±adir !important sin grep de reglas APK existentes

Archivos: `app/css/CrozzoPosStyles.css`, `app/css/CrozzoPantallasShell.css` · Aprendido de: Regla crozzo-apk-verify-before-change

---

### KI-008

**Parche PosMain con fragmento stale / lÃ­nea incorrecta** · `watch` · severidad **high**

**Síntomas**

- old_string no encontrado
- FunciÃ³n editada no es la que corre en runtime
- POSMAIN-SYNC-SYMBOLS lÃ­nea no coincide

**Causa raíz:** Contexto de sesiÃ³n anterior, mapa desactualizado, o grep en src/ en vez de app/.

**Solución verificada:** npm run map:refresh. npm run edit:scope -- app/core/CrozzoPosMain.js nombreFuncion. Re-leer funciÃ³n completa Â±35 lÃ­neas. Grep referencias en app/ solamente.

**NO repetir**

- Parchear sin edit:scope en archivos crÃ­ticos
- Confiar en nÃºmero de lÃ­nea de chat previo

Archivos: `app/core/CrozzoPosMain.js` · ADR: D-005 · Aprendido de: Monolito 51k â€” mapas + edit:scope

---

### KI-009

**Fanout LAN-only early-return (nube no recibe)** · `watch` · severidad **medium**

**Síntomas**

- LAN OK pero Supabase sin fila
- Otros locales no ven cambio
- Solo dispositivos LAN actualizados

**Causa raíz:** if (lan) { ... return; } en fanout/comandas sin drenar outbox cloud.

**Solución verificada:** HÃ­brido Z0: OpFanout + ComandasCloudSync deben enviar LAN y nube. Ver test Fanout sin early-return LAN-only.

**NO repetir**

- return temprano tras POST LAN
- Desactivar cloud path 'porque estamos en LAN'

Archivos: `app/infra/CrozzoOpFanout.js`, `app/modules/CrozzoComandasCloudSync.js` · Símbolos: `fanoutComandaEstado`, `crozzoOpFanout` · Tests: `test:sync-clinical`, `test:op-fanout` · Corregido: 2026-07 · Aprendido de: test connectivity-equilibrium check 9

---

### KI-010

**locationId distinta entre dispositivos** · `watch` · severidad **medium**

**Síntomas**

- Nunca sincroniza aunque LAN/nube OK
- Realtime suscrito pero sin eventos Ãºtiles
- Mesas vacÃ­as en un dispositivo

**Causa raíz:** Tablets/caja con distinta locationId o sede canÃ³nica mal resuelta post-QR.

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
- Tests sync OK pero regresiÃ³n costos

**Causa raíz:** Scope creep â€” Reservorio es dominio separado sin acoplamiento runtime mesa.

**Solución verificada:** Revertir cambios en CrozzoReservorio*. Limitar PR a archivos CONNECTIONS sync Z0. npm run consolidate solo si mÃ³dulo fuente Reservorio fue pedido explÃ­citamente.

**NO repetir**

- Refactor Reservorio 'de paso'
- Importar Reservorio desde PosMain sync

Archivos: `app/modules/CrozzoReservorio.js` · ADR: D-004 · Aprendido de: PolÃ­tica explÃ­cita usuario

---

### KI-012

**Editar app/bundles/*.js a mano** · `watch` · severidad **medium**

**Síntomas**

- Cambio desaparece tras npm run consolidate
- Diff en bundle pero no en mÃ³dulo fuente

**Causa raíz:** Bundles son artefactos generados desde mÃ³dulos Reservorio/Compras/Costos.

**Solución verificada:** Editar mÃ³dulo fuente en app/modules/. npm run consolidate && npm run sync.

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

**Causa raíz:** Cursor carga hooks.json y rules al inicio de sesiÃ³n.

**Solución verificada:** Reiniciar Cursor tras cambiar .cursor/hooks.json o rules. Verificar .cursorignore activo.

**NO repetir**

- Asumir hook activo sin reinicio
- Editar hooks solo en src/

Archivos: `.cursor/hooks.json` · Aprendido de: Stack anti-stale Cursor 2026-07

---

### KI-014

**Permiso bloqueado en capa transporte (mesero no escribe)** · `watch` · severidad **medium**

**Síntomas**

- Mesero no puede comandar aunque UI deberÃ­a permitir
- LAN/Supabase rechaza por rol en backend cliente

**Causa raíz:** ValidaciÃ³n de rol en fanout/sync en vez de solo UI (crozzoHasCajaPermiso).

**Solución verificada:** Transporte siempre escribe; UI oculta/deshabilita segÃºn permiso. anular_comandado solo UI con permiso admin.

**NO repetir**

- if (!isCaja) return en crozzoSyncPosRuntimeCritical
- Mapear anular_comandado a tab_*

Archivos: `app/core/CrozzoPosMain.js` · Símbolos: `crozzoHasCajaPermiso`, `anular_comandado` · Tests: `test:sync-clinical` · Aprendido de: SYNC-INVARIANTS #5 #6

---

### KI-015

**PosMain SyntaxError Illegal return (cabecera funciÃ³n borrada)** · `resolved` · severidad **critical**

**Síntomas**

- Uncaught SyntaxError: Illegal return statement Â· CrozzoPosMain.js
- App no arranca â€” pantalla en blanco o POS congelado
- node --check: return fuera de funciÃ³n ~lÃ­nea 7313

**Causa raíz:** En v1.0.223 al editar crozzoNotifySlotCartUserEdit se eliminÃ³ la lÃ­nea `function crozzoKnownSalonSlotIds(tipo) {` dejando el cuerpo suelto con return out al nivel global.

**Solución verificada:** Restaurar `function crozzoKnownSalonSlotIds(tipo) {` inmediatamente antes del bloque const list/mesasCaja (~7301). Verificar con node --check app/core/CrozzoPosMain.js. Eliminar duplicado crozzoForceSedeCanonical si existe (~347).

**NO repetir**

- Editar bloques try/catch sin verificar que la funciÃ³n siguiente conserva su function header
- Entregar release sin node --check en PosMain

Archivos: `app/core/CrozzoPosMain.js` · Símbolos: `crozzoKnownSalonSlotIds`, `crozzoNotifySlotCartUserEdit` · Corregido: post-v1.0.223 hotfix · Aprendido de: GitHub v1.0.223 â€” diff a1858cb lÃ­nea crozzoKnownSalonSlotIds borrada

---

### KI-016

**Comandas/mesas parpadean y desaparecen (reconcile loop + purge)** · `resolved` · severidad **critical**

**Síntomas**

- Mesas fantasma, comandas no en pantalla pero sÃ­ en mesas/cocina
- Enviar en cocina parpadea ~10 veces
- comandas obsoletas eliminadas (ausentes en nube): N
- Cobros desaparecen, mesa huÃ©rfana en cocina

**Causa raíz:** OpFanoutâ†’activateâ†’FleetReconcile en cada despacho/runtime; crozzoHandleRemoteRuntimeUiSync sin skipCartReconcile repone carritos; reconcileStale borra comandas si pull nube vacÃ­o/parcial (401/locationId).

**Solución verificada:** skipCartReconcile en paths post-pull infra; quitar activateLocalSyncPath de OpFanout estado/runtime; guardas en reconcileStaleLocalComandas; no reconcileStale al boot; no crozzoReconcileOpenSlotCartFromComandas en cada merge cloud.

**NO repetir**

- Fleet reconcile en cada lan_up/op_fanout
- reconcileStale con cloudRows vacÃ­o y local activo
- Reconcile global carrito tras apply runtime remoto

Archivos: `app/modules/CrozzoComandasCloudSync.js`, `app/infra/CrozzoOpFanout.js`, `app/infra/CrozzoFleetOperationalReconcile.js`, `app/infra/CrozzoPairingAutoConnect.js` · Símbolos: `reconcileStaleLocalComandas`, `crozzoHandleRemoteRuntimeUiSync`, `despacharComanda` · ADR: D-003 · Tests: `test:sync-clinical` · Corregido: post-v1.0.223 hotfix · Aprendido de: Logs tienda v1.0.223 â€” purge 6 comandas + pushMesaRows loop

---

### KI-017

**Despacho cocina borra cuenta en caja** · `resolved` · severidad **critical**

**Síntomas**

- LISTO/enviar en pantalla cocina/bar y la mesa en caja queda vacÃ­a
- Cuenta desaparece pero mesa cambiÃ³ color
- Runtime remoto vacÃ­o desde cocina pisa cartsPorMesa en caja

**Causa raíz:** Despacho en cocina llamaba schedulePosRuntimeSave â†’ pushMesaRows podÃ­a escribir filas vacÃ­as autoritativas; merge remoto no distinguÃ­a autoridad caja (role A) vs seÃ±al cocina.

**Solución verificada:** SeparaciÃ³n de dominios: comanda = seÃ±al (tabla comandas + fanout); carrito = solo crozzoRuntimeCartWriteAllowed (caja/tablet). pull incluye source_role; merge vacÃ­o remoto solo si source_role A o closedSlots. despacharComanda persiste local sin push runtime.

**NO repetir**

- Vaciar carrito caja al marcar comanda entregada en cocina
- Confundir lÃ­nea comanda-cocina con lÃ­nea cobro-caja
- Parches que conserven carrito local sin regla cloud (source_role)

Archivos: `app/core/CrozzoPosMain.js`, `app/modules/CrozzoPosRuntimeCloud.js` · Símbolos: `crozzoRuntimeCartWriteAllowed`, `crozzoRemoteCartSlotAuthoritative`, `crozzoReplaceCartsMaps`, `despacharComanda`, `pushMesaRows`, `snapFromMesaRows` · ADR: D-003 · Tests: `test:sync-clinical` · Corregido: post-v1.0.223 hotfix · Aprendido de: Tienda â€” despachar comandas pantalla borra cuentas caja

---

### KI-018

**Mesas borradas al entrar/salir â€” parches vs reservorio operativo** · `resolved` · severidad **critical**

**Síntomas**

- Mesa en rojo/comandada en grid; al abrirla el carrito vacÃ­o
- Al cerrar panel de mesa (Cerrar) la mesa queda libre sin cobrar
- Datos desaparecen al cambiar sesiÃ³n caja o reconectar nube
- Parches OperationalPersistOnly / freshness no detienen el borrado

**Causa raíz:** Arquitectura invertida: el runtime operativo tenÃ­a muchos caminos que BORRABAN por defecto (freshness discard, reconcileStale, pushMesaRows vaciado autoritativo al cerrar mesa, crozzoPrepareSlotForNewService limpiando sellos al abrir). Los parches posteriores bloqueaban sÃ­ntomas en 6+ archivos sin un contrato Ãºnico â€” seguÃ­an compitiendo con sync en caja_close_order.

**Solución verificada:** CrozzoOperativeReservorio.js â€” mismo contrato que CrozzoReservorio: loadRaw+persist con backup v1/v2; allowAutoDiscard() siempre false salvo userConfirmed; allowCloudAuthoritativeEmpty() solo tras cobro (__crozzoRuntimeForceEmptySlots/closedSlots) o vaciar (slotLocallyClearedAt); slotHasActiveWork() evita reset en crozzoPrepareSlotForNewService; crozzoCloseCajaOrderSession reconcilia+flush antes de sync. Un mÃ³dulo de polÃ­tica, hooks mÃ­nimos en PosMain/RuntimeCloud/SyncGate/ComandasCloud/Reconnect.

**NO repetir**

- AÃ±adir if (!persist) en cada funciÃ³n de discard â€” usar CrozzoOperativeReservorio.allowAutoDiscard
- Parchear selectMesa/crozzoRemoteCartMergeKeepLocal sin tocar pushMesaRows vaciado autoritativo
- crozzoPrepareSlotForNewService en mesas con comanda/carrito activo
- reconcileStale / freshness purge como limpieza al entrar a caja
- MÃºltiples capas de polÃ­tica (OperationalPersistOnly + RemoteCartMerge + EnsureSlotFresh) en PosMain

Archivos: `app/modules/CrozzoOperativeReservorio.js`, `app/core/CrozzoPosMain.js`, `app/modules/CrozzoPosRuntimeCloud.js`, `app/modules/CrozzoOperativeSyncGate.js`, `app/modules/CrozzoComandasCloudSync.js`, `app/infra/CrozzoReconnectSync.js` · Símbolos: `CrozzoOperativeReservorio`, `allowAutoDiscard`, `allowCloudAuthoritativeEmpty`, `slotHasActiveWork`, `pushMesaRows`, `crozzoPrepareSlotForNewService`, `crozzoCloseCajaOrderSession`, `crozzoDiscardStaleOperationalLocal` · ADR: D-003 · Tests: `test:sync-clinical`, `_fleet-coordination-check.mjs` · Corregido: post-v1.0.223 operative-reservorio · Aprendido de: SesiÃ³n 2026-07 â€” usuario: guardar siempre, borrar solo con permiso; reset desde v1.0.223 + reservorio

---

### KI-019

**Riesgos residuales â€” reservorio operativo y sync mesas** · `watch` · severidad **medium**

**Síntomas**

- Mesa con solo comanda (carrito vacÃ­o en snap) no entra en presentKeys de pushMesaRows
- Doble push al cerrar mesa: slot_presence_exit + caja_close_order
- Backups crozzo_pos_runtime_backup_v1 vacÃ­os hasta primer save post-deploy
- Dos equipos editando misma mesa â€” merge por timestamp aÃºn puede confundir

**Causa raíz:** mesaRowsFromSnap omite slots sin lÃ­neas en carrito aunque haya comanda; release de sesiÃ³n aÃºn dispara sync; backups nuevos; multi-writer sin lock fuerte en carrito.

**Solución verificada:** Monitorear en tienda. Si reaparece borrado al cerrar: incluir refs con comanda activa en mesaRowsFromSnap. skipRuntimePush en release (pendiente). Verificar crozzoOperativeReservorio.getHealth() tras deploy.

**NO repetir**

- Asumir que allowCloudAuthoritativeEmpty cubre todos los paths de vaciado remoto en crozzoReplaceCartsMaps
- Release sin node --check PosMain ni test:sync-clinical

Archivos: `app/modules/CrozzoOperativeReservorio.js`, `app/modules/CrozzoPosRuntimeCloud.js`, `app/core/CrozzoPosMain.js` · Símbolos: `mesaRowsFromSnap`, `crozzoReleaseCajaSlotSession`, `crozzoReplaceCartsMaps` · ADR: D-003 · Tests: `test:sync-clinical` · Aprendido de: RevisiÃ³n post-mortem KI-018 â€” 2026-07

---

### KI-020

**INSERT Realtime aplicado:false en echo propio** · `resolved` · severidad **low**

**Síntomas**

- Consola muestra INSERT aplicado: false tras comandar desde el mismo equipo
- Parece fallo de sync pero la comanda ya estÃ¡ en pantalla

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

**Solución verificada:** En setCajaMode('directa') y crozzoPrepareDirectSaleSession: forzar directSaveMenuOpen=false. TambiÃ©n en crozzoCajeroPostCobroDirecta. Refuerzo 2026-07-14: al restaurar UI desde runtime local, si tipoServicioCaja==='directa' forzar directSaveMenuOpen=false (el snapshot no debe reabrir el picker).

**NO repetir**

- Cambiar orderOpen / tabs de servicio sin revisar el branch directSaveMenuOpen en renderCajero
- Asumir que setCajaMode('directa') solo cambia tipoServicioCaja
- Restaurar directSaveMenuOpen desde runtime sin mirar tipoServicioCaja

Archivos: `app/core/CrozzoPosMain.js` · Símbolos: `setCajaMode`, `crozzoPrepareDirectSaleSession`, `renderCajero`, `directSaveMenuOpen` · Corregido: 2026-07-09 · Aprendido de: Reporte caja: Directa abre mesas/llevar

---

### KI-022

**Cliente / facturaciÃ³n en caja: click no abre panel** · `resolved` · severidad **high**

**Síntomas**

- En caja, botÃ³n Cliente / facturaciÃ³n no hace nada
- No se puede buscar cliente por NIT ni integrarlo a la factura desde el carrito

**Causa raíz:** crozzoRetailToggleCliente delegaba siempre a crozzoRetailClientePopoverToggle (popup de venta-comercial). En cajero no existe #crozzoRetailClientePopoverWrap, asÃ­ que returnaba sin abrir el acordeÃ³n #crozzoRetailCliente.

**Solución verificada:** En crozzoRetailToggleCliente: si existe popover â†’ usar popover; si no â†’ toggle clase is-open en #crozzoRetailCliente y enfocar crozzoCrmSearch. CSS: overflow visible + z-index en CRM del ticket de caja para dropdown Usarâ†’.

**NO repetir**

- Asumir que crozzoRetailToggleCliente = popover en todas las pantallas
- Usar solo crozzoRetailClientePopoverToggle desde el acordeÃ³n de cajero

Archivos: `app/core/CrozzoPosMain.js`, `app/css/CrozzoPosStyles.css` · Símbolos: `crozzoRetailToggleCliente`, `crozzoRetailClientePanelHtml`, `crozzoCrmLiteBindCartUi` · Corregido: 2026-07-09 · Aprendido de: Reporte: buscar cliente NIT e integrar a factura â€” click muerto en caja

---

### KI-023

**LISTO cocina reaparece; mesas moradas; Limpiar no libera** · `resolved` · severidad **critical**

**Síntomas**

- Enviar/LISTO en cocina anima y la comanda vuelve
- Mesas siguen moradas (comandado) tras despachar
- Limpiar mesa: salgo/entro y el pedido vuelve; color sigue ocupado

**Causa raíz:** despacharComanda encola outbox y luego splice a comandaHistory; drainOutbox solo buscaba en comandas[] activas y dropeaba la clave sin upsert entregada. Pull reinyectaba la fila activa. Limpiar con comanda viva solo hacÃ­a detach (morado a propÃ³sito) y prepareSlot borraba sellos cleared al reabrir.

**Solución verificada:** Outbox: snapshot payload + outboxFindInHistory; no drop ciego de entregada. Anti-resurrecciÃ³n en EmergencyApply/applyComandaFromCloudRow si tid ya en history entregada. Limpiar archiva comandas vivas + markSlotLocallyCleared; prepareSlot conserva sellos si carrito vacÃ­o. skipCartReconcile en removed/refresh cajero; render mesas tras despacho.

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

- BotÃ³n Entreg./Entregada en cocina KDS deja la comanda en pantalla o mesa morada
- Al entrar a caja/tablets el carrito vuelve tras vaciar/limpiar

**Causa raíz:** updateComandaEstado('entregada') marcaba estado pero no llamaba despacharComanda (sin splice/outbox history). getSlotStateInfo contaba comandas con estado entregada aÃºn en el array. OperativeSyncGate llamaba crozzoHandleRemoteRuntimeUiSync() sin skipCartReconcile tras pull.

**Solución verificada:** updateComandaEstado â†’ despacharComanda si entregada; no sync runtime crÃ­tico desde cocina/comandas en Prep/Lista; getSlotStateInfo ignora estado entregada; SyncGate usa skipCartReconcile:true.

**NO repetir**

- Dejar entregada en comandas[] activas
- crozzoSyncPosRuntimeCritical desde pantalla cocina al cambiar estado
- HandleRemoteRuntimeUiSync sin skipCartReconcile tras pull operativo

Archivos: `app/core/CrozzoPosMain.js`, `app/modules/CrozzoOperativeSyncGate.js` · Símbolos: `updateComandaEstado`, `despacharComanda`, `getSlotStateInfo`, `ensureOperativeReady` · ADR: D-013 · Tests: `test:sync-clinical`, `_op-fanout-check.mjs` · Corregido: 2026-07-14 · Aprendido de: Pruebas post KI-023 â€” hunt hermanos LISTO/mesas

---

### KI-025

**LISTO sticky reaparece; eco LAN; entregada fantasma en KDS** · `resolved` · severidad **high**

**Síntomas**

- LISTO anima y la nota vuelve un momento
- Flicker / doble eco al despachar por LAN
- KDS/corcho muestra tickets ya entregados

**Causa raíz:** AnimaciÃ³n LISTO despachaba al final â†’ refresh reponÃ­a sticky. Receptores LAN/mesh re-fanouteaban entregada. cocinaComandaMatchesFilters y purge keep'eaban entregada en comandas[].

**Solución verificada:** despacharComanda antes de animar (skipRender); skipFanout en despacho remoto; filtros/purge sacan entregada del array activo; toast Limpiar parcial honesto.

**NO repetir**

- Despachar solo en callback de animaciÃ³n
- despacharComanda remoto sin skipFanout
- keep.push de entregada en comandas activas

Archivos: `app/core/CrozzoPosMain.js`, `app/infra/CrozzoLanSyncBridge.js`, `app/infra/CrozzoLanWebSocketBridge.js`, `app/infra/CrozzoOperationalIngest.js`, `app/infra/CrozzoOfflineGossip.js` · Símbolos: `crozzoStickyMarcarListo`, `despacharComanda`, `cocinaComandaMatchesFilters`, `crozzoPurgeGhostComandasForClearedSlots`, `crozzoRemoveStaleComandas` · ADR: D-013 · Tests: `test:sync-clinical` · Corregido: 2026-07-14 · Aprendido de: RevisiÃ³n humana post KI-023/024 â€” funcionamiento a medias

---

### KI-026

**Caja: Limpiar Directa tumba M1; cobro sin comanda; panel cierra tras comandar** · `resolved` · severidad **critical**

**Síntomas**

- Vaciar venta directa libera/archiva mesa M1 en cocina
- Cobrar en Directa factura aunque la comanda quedÃ³ pendiente/fallÃ³
- Tras Comandar en mesa vuelve al grid y no se puede precuenta/cobrar seguido
- MenÃº Cuenta / precuenta sin feedback o sin permiso

**Causa raíz:** clearCart mapeaba Directa a tipo mesa+mesaSeleccionada(M1). confirmarCobro/efectivo rÃ¡pido llamaban comandarDesdeCaja sin chequear resultado. comandarDesdeCaja cerraba sesiÃ³n al no haber pendientes. Precuenta caja sin gate tab_precuenta; returns silenciosos.

**Solución verificada:** purgeLocalOnly para directa/comercial; cobro Directa aborta si comandar=false (pending vacÃ­o = true); no auto-cerrar panel tras comandar; permiso precuenta + toasts en menÃº/cobro vacÃ­o.

**NO repetir**

- Usar mesaSeleccionada al vaciar cartDirecto
- facturar tras comandarDesdeCaja sin mirar retorno
- crozzoCloseCajaOrderSession inmediato tras comandar en caja

Archivos: `app/core/CrozzoPosMain.js` · Símbolos: `clearCart`, `comandarDesdeCaja`, `confirmarCobroDesdeCaja`, `cobrarEfectivoExactoDesdeCaja`, `crozzoCuentaCobroElegir`, `crozzoPrecuentaRapidaImprimir` · ADR: D-013 · Tests: `test:sync-clinical` · Corregido: 2026-07-14 · Aprendido de: Pedido: cada acciÃ³n de caja debe funcionar (cobrar/precuenta/comandar/borrar)

---

### KI-027

**Mesero tablet: âˆ’/nota/comandar usan carrito o gates incorrectos** · `resolved` · severidad **high**

**Síntomas**

- En tablets el botÃ³n âˆ’ quita de cartDirecto (caja) en vez del carrito de mesa
- Subir cantidad o cambiar nota no marca edit local / no finaliza mutaciÃ³n (revierte sync)
- confirmTabletComanda sin chequeo de permiso ni toast si carrito vacÃ­o
- clearCart en pÃ¡gina tablets usaba context caja / carrito de mesaSeleccionada

**Causa raíz:** crozzoCartLineRemoveFromBtn â†’ removeFromCart â†’ getActiveCart (directa). Add/nota sin crozzoMarkCartLineLocalEdit + crozzoFinalizeCartMutation. Permiso tab_abrir solo en showTabletConfirmComanda (ruta muerta). clearCart no delegaba a tabletClearCart.

**Solución verificada:** Remove en tablets â†’ tabletRemoveFromCart; add/nota con mark+finalize; confirmTabletComanda chequea abrir_orden context tablet + toasts; clearCart en tablets â†’ tabletClearCart. Nota post-comanda gated con crozzoOperativeCanTouchSentLine.

**NO repetir**

- Usar getActiveCart/removeFromCart desde UI de tablets
- Mutar carrito tablet sin finalize/mark local edit
- Bloquear el + de cantidad con gate post-comanda (suma pendiente es vÃ¡lido)

Archivos: `app/core/CrozzoPosMain.js` · Símbolos: `crozzoCartLineAddFromBtn`, `crozzoCartLineRemoveFromBtn`, `crozzoEditCartItemNotaByIndex`, `crozzoSaveCartItemNotaFromModal`, `confirmTabletComanda`, `clearCart`, `tabletClearCart` · ADR: D-013 · Tests: `test:sync-clinical` · Corregido: 2026-07-14 · Aprendido de: Oleada B ROLE-OPS â€” auditorÃ­a 1Ã—1 mesero tablets

---

### KI-028

**Encargado: botÃ³n âˆ’ en lÃ­nea comandada solo toast; no anula ni void cocina** · `resolved` · severidad **critical**

**Síntomas**

- Encargado ve âˆ’ en lÃ­nea ya enviada pero al tocarlo solo dice 'solo encargado puede'
- Anular desde tablet no baja cantidad ni actualiza comanda en cocina
- UI crozzoCartLineShowMinus permite âˆ’ pero removeFromCart/tabletRemoveFromCart bloquean siempre

**Causa raíz:** removeFromCart y tabletRemoveFromCart hacÃ­an early-return si cantidad<=sent con crozzoNotifyPostComandarBlocked sin consultar crozzoCanAnularComandado ni crozzoVoidCartLineInComandas. Solo removeCartItemCompletely (botÃ³n Eliminar) tenÃ­a el path de anular.

**Solución verificada:** Si cantidad<=sent y crozzoCanAnularComandado: void 1 ud (o lÃ­nea) vÃ­a crozzoVoidCartLineInComandas, bajar sentCantidad/cantidad, finalize mutation. Mesero sigue bloqueado con toast.

**NO repetir**

- Mostrar âˆ’ post-comanda sin path de anular
- Anular solo en Eliminar y no en âˆ’
- Bajar cantidad comandada sin void en comandas[]

Archivos: `app/core/CrozzoPosMain.js` · Símbolos: `removeFromCart`, `tabletRemoveFromCart`, `crozzoVoidCartLineInComandas`, `crozzoCanAnularComandado`, `crozzoCartLineShowMinus` · ADR: D-013 · Tests: `test:sync-clinical` · Corregido: 2026-07-14 · Aprendido de: Oleada D ROLE-OPS â€” encargado anular 1Ã—1

---

### KI-029

**Encargado legacy sin anular_comandado (migraciÃ³n v1 solo admin)** · `resolved` · severidad **high**

**Síntomas**

- Usuario rol encargado no puede anular Ã­tems comandados aunque la plantilla sÃ­ lo incluye
- BotÃ³n âˆ’ / Eliminar post-comanda siempre denegado para encargado de tienda antigua

**Causa raíz:** crozzoMigrateStaffCajaSecurity v1 aÃ±adÃ­a anular_comandado solo a admin/superadmin/KENNY. Encargados creados antes o con permisos parciales nunca recibÃ­an el flag.

**Solución verificada:** MigraciÃ³n crozzo_caja_security_v9: rol encargado recibe anular_comandado, eliminar_item, tab_eliminar, descuento_autorizado si faltan.

**NO repetir**

- Asumir que rol===encargado implica anular sin mirar u.permisos.caja
- Migrar solo admin y dejar encargado a mano

Archivos: `app/core/CrozzoPosMain.js` · Símbolos: `crozzoMigrateStaffCajaSecurity`, `CROZZO_CAJA_PERMISOS_POR_ROL` · Tests: `test:sync-clinical` · Corregido: 2026-07-14 · Aprendido de: Oleada D/E ROLE-OPS â€” permisos plantilla vs staff legacy

---

### KI-030

**Cerrar/cambiar modo abandona mesa con consumo sin cobro** · `resolved` · severidad **critical**

**Síntomas**

- Con mesa abierta y consumo, Cerrar o Directa/Mesas/Llevar suelta el slot sin cobrar
- crozzoGuardLeaveUnpaidSlot solo corrÃ­a al cambiar de mesa, no al cerrar panel
- Unir/Dividir en Directa o sin slot abierto fallaba en silencio

**Causa raíz:** crozzoCloseCajaOrderSession y setCajaMode no llamaban crozzoGuardLeaveUnpaidSlot. Unir/dividir tenÃ­an return bare en directa/!ref.

**Solución verificada:** Guard unpaid en close + setCajaMode (skipUnpaidGuard tras check). Toasts en unir/dividir para directa y slot vacÃ­o.

**NO repetir**

- Cerrar sesiÃ³n de mesa sin mirar consumo pendiente
- return silencioso en flujos de gestiÃ³n de cuenta

Archivos: `app/core/CrozzoPosMain.js` · Símbolos: `crozzoCloseCajaOrderSession`, `setCajaMode`, `crozzoGuardLeaveUnpaidSlot`, `crozzoShowUnirCuentaModal`, `crozzoShowDividirCuentaModal` · Tests: `test:sync-clinical` · Corregido: 2026-07-14 · Aprendido de: Oleada F ROLE-OPS â€” gestiÃ³n interacciÃ³n cuenta

---

### KI-031

**RecepciÃ³n RBAC desalinhado; precuenta caja exigÃ­a tab_precuenta** · `resolved` · severidad **high**

**Síntomas**

- Plantilla recepciÃ³n â‰  Policy â‰  menÃº hotel (eliminar/cierre vs unir)
- Precuenta en menÃº Cuenta siempre denegada para caja/recepciÃ³n sin tab_precuenta
- PerfilesLogica trataba recepciÃ³n como caja (fallback)

**Causa raíz:** Tres fuentes de verdad: CROZZO_CAJA_PERMISOS_POR_ROL, ROLE_PERM_PRESETS (recepcion fuera de ROLE_ORDER), OPERATIVE_PROFILES sin recepcion. Precuenta post KI-026 solo tab_precuenta.

**Solución verificada:** Alinear plantilla+Policy+plantilla staff; ROLE_ORDER+LABELS recepcion; perfil operativo recepciÃ³n; precuenta OK con facturar|tab_precuenta; migraciÃ³n v10.

**NO repetir**

- Tener recepciÃ³n solo en un archivo de permisos
- Exigir tab_precuenta en caja cuando facturar ya implica cobrar/precuenta

Archivos: `app/core/CrozzoPosMain.js`, `app/modules/CrozzoPermisosPolicy.js`, `app/modules/CrozzoPerfilesLogica.js` · Símbolos: `CROZZO_CAJA_PERMISOS_POR_ROL`, `ROLE_PERM_PRESETS`, `crozzoCuentaCobroElegir`, `crozzoMigrateStaffCajaSecurity` · Tests: `test:sync-clinical` · Corregido: 2026-07-14 · Aprendido de: Oleada F ROLE-OPS â€” recepciÃ³n + precuenta

---

### KI-032

**LISTO/Entreg. sin permiso despachar (solo ver abre cocina)** · `resolved` · severidad **high**

**Síntomas**

- Usuario con comandas:ver puede marcar LISTO y archivar
- crozzoOperativeCan('marcar_listo') existÃ­a pero no se llamaba

**Causa raíz:** crozzoStickyMarcarListo y updateComandaEstado despachaban sin crozzoCanMarcarListoComanda.

**Solución verificada:** crozzoCanMarcarListoComanda (operative + despachar); gate LISTO y updateComandaEstado salvo skipFanout/skipPermiso remoto.

**NO repetir**

- Confundir PAGE_PERMISOS (entrar) con acciÃ³n despachar
- Gatear despacharComanda interno de Limpiar/remoto sin skipPermiso

Archivos: `app/core/CrozzoPosMain.js` · Símbolos: `crozzoCanMarcarListoComanda`, `crozzoStickyMarcarListo`, `updateComandaEstado` · ADR: D-013 · Tests: `test:sync-clinical` · Corregido: 2026-07-14 · Aprendido de: Oleada F ROLE-OPS â€” cocina rol vs ver-only

---

### KI-033

**Reimprimir/arqueo/descuento/inventario/abrir mesa: gates y menÃºs rotos** · `resolved` · severidad **high**

**Síntomas**

- Reimprimir comanda sin permiso reimprimir (solo ver)
- RecepciÃ³n con cierre_arqueo no podÃ­a cerrar; encargado cerraba aunque le quitaran el flag
- calcArqueo/finalizeArqueo denegaban en silencio
- Quitar descuento sin descuento_autorizado
- Inventario: No autorizado en proveedores/cotizaciones (menÃº incompleto)
- Abrir mesa sin abrir_orden

**Causa raíz:** reprintComanda sin gate; canPerformArqueo por rol hardcode no cierre_arqueo; inventario fallback menus sin compras-proveedores/cotizaciones; selectMesa sin permiso; quitar descuento sin require.

**Solución verificada:** crozzoCanReimprimirComanda; canPerformArqueoâ†’cierre_arqueo + toasts; menÃºs inventario + cotizaciones/recepcion; selectMesa/Llevar abrir_orden; crozzoQuitarDescuentoVenta gated; cocina MENU_PERM_MAP + reimprimir.

**NO repetir**

- Autorizar arqueo solo por rol string
- MenÃº inventario = solo centro-compras
- AcciÃ³n cocina (reprint/LISTO) sin subpermiso comandas

Archivos: `app/core/CrozzoPosMain.js`, `app/modules/CrozzoCierreTurnos.js`, `app/modules/CrozzoPermisosPolicy.js`, `app/modules/CrozzoPerfilesOperativos.js` · Símbolos: `reprintComanda`, `canPerformArqueo`, `selectMesa`, `selectLlevar`, `crozzoQuitarDescuentoVenta`, `getMenusForRole` · Tests: `test:sync-clinical` · Corregido: 2026-07-14 · Aprendido de: Mejora ROLE-OPS F â€” inventario/cierre/reimprimir

---

### KI-034

**Residuales sede: tablet RBAC, open slot, reimprimir legacy, automation LISTO** · `resolved` · severidad **critical**

**Síntomas**

- Caja/recepciÃ³n en tablets: tab_precuenta hace fallar abrir_orden/comandar
- selectTabletMesa sin gate; selectMesa bloqueaba encargado solo-anular
- Cocina legacy sin reimprimir tras KI-033
- printAllPendingByArea y AutomationApi LISTO sin skipPermiso

**Causa raíz:** hasTabSet incluÃ­a tab_precuenta y cortaba fallback POS; tablet open ungated; sin migraciÃ³n reimprimir; automation llamaba updateComandaEstado sin skipPermiso.

**Solución verificada:** Tablet: aceptar lista.includes(sub) POS; crozzoCanOpenOrderSlot(abrir|anular); gate selectTablet*; migraciÃ³n v11 reimprimir; printAllPending gated; Automation skipPermiso.

**NO repetir**

- Tratar tab_precuenta como set completo de tab_abrir/editar/eliminar
- Gatear solo selectMesa y olvidar selectTabletMesa

Archivos: `app/core/CrozzoPosMain.js`, `app/infra/CrozzoAutomationApi.js` · Símbolos: `crozzoHasCajaPermiso`, `crozzoCanOpenOrderSlot`, `selectTabletMesa`, `selectTabletLlevar`, `crozzoMigrateStaffCajaSecurity`, `printAllPendingByArea`, `updateKitchenOrder` · Tests: `test:sync-clinical` · Corregido: 2026-07-14 · Aprendido de: VerificaciÃ³n residual pre-sede ROLE-OPS

---

### KI-035

**Sidebar hover oscila al scrollear (abre/cierra en bucle)** · `resolved` · severidad **high**

**Síntomas**

- Al abrir el panel lateral e intentar bajar, abre y cierra muchas veces por segundo
- Tras ~1s queda cerrado y luego 'funciona'
- Parches CSS de 1cm empeoran otras pantallas

**Causa raíz:** MÃ¡quina hover en CrozzoSidebarNav: pointer+mouse duplicados, pointermove global pelea con leave durante width transition; remount del toggle dispara leave; scroll no armaba lock; --sidebar-ease-open con overshoot empeoraba hit-testing.

**Solución verificada:** Solo canal pointer; lock transiciÃ³n + scroll/wheel; ignorar leave durante lock/DOM remount; easing sin overshoot; debug __CROZZO_SIDEBAR_HOVER_DEBUG. Archivos: app/ui/CrozzoSidebarNav.js, tokens sidebar en CrozzoPosStyles.css.

**NO repetir**

- Mover mÃ¡rgenes/easing a ciegas sin tocar la mÃ¡quina de estados
- Re-aÃ±adir mouseenter/mouseleave junto a pointerenter/leave
- Animar page-enter en P0 para 'compensar' el feel del sidebar

Archivos: `app/ui/CrozzoSidebarNav.js`, `app/css/CrozzoPosStyles.css` · Símbolos: `bindDesktopSidebarHover`, `scheduleHoverOpen`, `scheduleHoverClose`, `armSidebarScrollLock`, `isSidebarHoverLocked` · Corregido: 2026-07-20 · Aprendido de: Reporte usuario: sidebar abre/cierra ~10Ã—/s al scrollear

---

### KI-036

**DiseÃ±ador ticket: ediciÃ³n de ley/tÃ­tulo no se refleja ni persiste** · `resolved` · severidad **high**

**Síntomas**

- Al editar tÃ­tulo legal o pie legal, la vista previa no cambia
- El editor parece actualizarse solo y pierde el texto escrito
- Tras sync idle o reabrir DiseÃ±o, el tÃ­tulo vuelve vacÃ­o

**Causa raíz:** normalizeFacturaTplBlocks vaciaba title.c en cada polish; exportTpl hacÃ­a ensure/dedupe sobre slice shallow (mutaba state); preview/print de legal_co/resol ignoraban b.c; crozzoTermicaNormalizePlantilla con skipPolish aÃºn corrÃ­a ensureFacturaBlocks.

**Solución verificada:** stripDynamicTitle solo con opts explÃ­cito; exportTpl deep-clone + polish light (sin ensure/dedupe); preview/print usan String(b.c).trim()||dato DIAN; skipPolish salta ensure. Archivos: Crozzo_POS_DisenadorTicket.html, CrozzoTermicaColombia.js, CrozzoPrintService.js, CrozzoTermicaPremium.js, crozzoTermicaNormalizePlantilla en PosMain.

**NO repetir**

- Llamar ensureFacturaBlocks/polishTplForDocType en cada tecla o idle sync del diseÃ±ador
- Vaciar title.c en normalizaciÃ³n de plantilla de estudio
- Renderizar legal_co solo con data.legalCo ignorando b.c

Archivos: `app/Crozzo_POS_DisenadorTicket.html`, `app/core/CrozzoTermicaColombia.js`, `app/core/CrozzoPrintService.js`, `app/core/CrozzoTermicaPremium.js`, `app/core/CrozzoPosMain.js` · Símbolos: `normalizeFacturaTplBlocks`, `exportTpl`, `polishTplForDesigner`, `crozzoTermicaNormalizePlantilla` · Corregido: 2026-07-20 · Aprendido de: Reporte: comando actualizar ley se bugea y no refleja ediciÃ³n

---

### KI-037

**Reporte IA: UI remonta y borra key / Guardar parece fallar** · `resolved` · severidad **high**

**Síntomas**

- Panel Inteligencia se actualiza solo y vacÃ­a la key pegada
- Guardar no deja probar; input se limpia y parece que no persistiÃ³
- Click Configurar Reporte IA resetea el formulario estando ya en Nube

**Causa raíz:** mountAiInsightsAdminCard siempre reemplazaba host.innerHTML; crozzoOpenAiInsightsConfig hacÃ­a navigateTo aunque currentPage ya era super-admin-nube; saveApiKey hacÃ­a await invokeFn(save_key,{force:true}) a Edge (CORS/hang) antes de confirmar UX.

**Solución verificada:** Skip remount si card live/draft/busy/lock; openConfig solo scroll si ya en nube; saveApiKey local-first; probe session fuera del DOM (setProbeSession/applyProbeSessionToDom) para sobrevivir remount; Rust timeout NVIDIA 120s (async). Archivos: CrozzoAiInsights.js, CrozzoSuperAdminNube.js, crozzo_http.rs.

**NO repetir**

- Remontar el card AI en cada init/retry sin comprobar draft
- navigateTo('super-admin-nube') si ya estÃ¡ en esa pÃ¡gina solo para scroll
- Bloquear Guardar esperando Edge/CORS
- Vaciar #crozzoAiApiKey sin confirmar localStorage
- Actualizar probe con closures DOM stale tras remount
- Timeout Rust 35s (NVIDIA NIM suele >60s)

Archivos: `app/modules/CrozzoAiInsights.js`, `app/modules/CrozzoSuperAdminNube.js` · Símbolos: `mountAiInsightsAdminCard`, `crozzoOpenAiInsightsConfig`, `saveApiKey`, `formHasDraft`, `setAiBusy` · Corregido: 2026-07-20 · Aprendido de: SesiÃ³n: interfaz se actualiza sola, borra datos, no deja probar NVIDIA

---

### KI-038

**Cierre de turnos titila: remount por fanout LAN/comandas** · `resolved` · severidad **critical**

**Síntomas**

- Al entrar a Cierre la pantalla parpadea / recarga muchas veces
- KPIs y panel se reinician en vivo con LAN/comandas activos

**Causa raíz:** crozzoScheduleOperationalPageRefresh(currentPage) con currentPage=cierre-caja no tenÃ­a patch; caÃ­a a renderPage â†’ mountCierrePage (innerHTML wipe). LanOps/Ingest/PageCloudWatch/fleet disparan schedule con la pÃ¡gina actual aunque el evento sea de comandas.

**Solución verificada:** crozzoPatchOperationalPageFromRemote('cierre-caja') â†’ CrozzoCierreTurnos.refreshPanel({full:true}) sin remount. Defensa extra en schedule antes de renderPage. Suprimir page-enter motion en cierre-caja. Card AuditorÃ­a IA debajo de KPIs (no al final).

**NO repetir**

- renderPage('cierre-caja') desde refresh operativo/LAN
- Asumir que patch solo aplica a Z0 y dejar cierre caer a remount
- Poner UI crÃ­tica de cierre al final del scroll sin KPIs cerca

Archivos: `app/core/CrozzoPosMain.js`, `app/modules/CrozzoCierreTurnos.js`, `app/modules/CrozzoAiInsights.js` · Símbolos: `crozzoPatchOperationalPageFromRemote`, `crozzoScheduleOperationalPageRefresh`, `mountCierrePage`, `refreshPanel` · Corregido: 2026-07-20 · Aprendido de: SesiÃ³n: mando â€” cierre titila y no ve auditorÃ­a IA

---

### KI-039

**WhatsApp dock no se activaba (setWaActive)** · `resolved` · severidad **high**

**Síntomas**

- Dock en blanco al abrir WhatsApp

**Causa raíz:** openDock en CrozzoWhatsAppDock.js no llamaba setWaActive(true), a diferencia del factory core

**Solución verificada:** Añadir setWaActive(true) antes del retry

**NO repetir**

- Copiar openDock sin revisar paridad con el core

Archivos: `app/modules/CrozzoWhatsAppDock.js` · Símbolos: `openDock`, `setWaActive` · ADR: D-016 · Corregido: 2026-11-02 · Aprendido de: Auditoría docks

---

### KI-040

**Gmail/Drive invocaban comando de WhatsApp** · `resolved` · severidad **high**

**Síntomas**

- Ventana incorrecta al abrir Gmail o Drive

**Causa raíz:** invokeCmd hardcodeado a crozzo_whatsapp_dock_sync en ambos wrappers

**Solución verificada:** Cambiar a crozzo_gmail_dock_sync / crozzo_drive_dock_sync

**NO repetir**

- Copiar wrapper sin revisar invokeCmd

Archivos: `app/modules/CrozzoGmailDock.js`, `app/modules/CrozzoDriveDock.js` · Símbolos: `invokeCmd` · ADR: D-016 · Corregido: 2026-11-02 · Aprendido de: Auditoría docks

---

### KI-041

**Zoom no aplicaba a Gmail/Drive** · `resolved` · severidad **medium**

**Síntomas**

- Slider de zoom sin efecto en Gmail/Drive

**Causa raíz:** Lista de servicios en el binding global omitía gmail y drive

**Solución verificada:** Añadir ramas gmail/drive al binding y al closeDock

Archivos: `app/modules/CrozzoWebEmbedDockCore.js` · Símbolos: `crozzoDockPanelZoom` · ADR: D-016 · Corregido: 2026-11-02 · Aprendido de: Auditoría docks

---

### KI-042

**Timer de 2s + show() sin comprobar WANT_VISIBLE en 9 ventanas** · `watch` · severidad **high**

**Síntomas**

- Ventana reaparece tras cerrarla en menos de 2 s

**Causa raíz:** hilo sleep(2s) llama dock.show() sin verificar la bandera *_WANT_VISIBLE

**Solución verificada:** Comprobar *_WANT_VISIBLE antes de show()

**NO repetir**

- Copiar el patrón de timer sin revisar la bandera

Archivos: `src-tauri/src/crozzo_external.rs` · Símbolos: `build_*_dock` · Corregido: 2026-11-03 (corregido) · Aprendido de: Auditoría Asuntos Internos

---

### KI-043

**renderPage devuelve cadena vacía en 6 páginas de docks** · `resolved` · severidad **high**

**Síntomas**

- Página en blanco al navegar a gmail-web, drive-web, dataico-web, dian-vpfe-web, spotify-web, whatsapp-web

**Causa raíz:** return '' antes del template HTML en CrozzoWebEmbedDockCore.js y CrozzoWhatsAppDock.js

**Solución verificada:** Eliminar el return '' temprano

**NO repetir**

- Dejar código inalcanzable tras un return

Archivos: `app/modules/CrozzoWebEmbedDockCore.js`, `app/modules/CrozzoWhatsAppDock.js` · Símbolos: `renderPage`, `renderWhatsAppWebPage` · Corregido: 2026-11-03 · Aprendido de: Auditoría Asuntos Internos

---

### KI-044

**Supabase dock: id desalineado (supabase vs supabase-nube vs supabase-nube-web)** · `watch` · severidad **medium**

**Síntomas**

- La pestaña Supabase no abre nada

**Causa raíz:** navTab '', TAB_DEFS 'supabase', PAGE_ID 'supabase-nube-web', zoom 'supabase-nube' son cuatro nombres distintos

**Solución verificada:** Unificar en un único id

Archivos: `app/modules/CrozzoSupabaseSqlDock.js`, `app/modules/CrozzoWebEmbedHeadNav.js` · Símbolos: `navTab`, `PAGE_ID` · Corregido: pendiente · Aprendido de: Auditoría frontend docks

---

### KI-045

**YouTube y Facebook no están en la política de apps (no usables)** · `watch` · severidad **high**

**Síntomas**

- El dock muestra 'No tiene permiso' incluso para super admin

**Causa raíz:** APPS en CrozzoQuickAppsPolicy.js no incluye youtube ni facebook; webEmbedPageToQuickApp devuelve null

**Solución verificada:** Añadir a APPS y DEFAULTS, o retirar de la carga por defecto

Archivos: `app/modules/CrozzoQuickAppsPolicy.js` · Símbolos: `APPS`, `webEmbedPageToQuickApp` · Corregido: 2026-11-03 (retirados de carga por defecto) · Aprendido de: Auditoría frontend docks

---

### KI-046

**Click-outside atado al primer dock inicializado** · `watch` · severidad **medium**

**Síntomas**

- Clic fuera no cierra el dock activo si no es el primero

**Causa raíz:** El listener captura PAGE_ID e isPageActive del primer dock que llama initPage

**Solución verificada:** Consultar el dock activo en el momento del clic

Archivos: `app/modules/CrozzoWebEmbedDockCore.js` · Símbolos: `bindUiOverlaySync` · Corregido: pendiente · Aprendido de: Auditoría frontend docks

---

### KI-047

**Auth LAN desactivable con token vacío** · `watch` · severidad **high**

**Síntomas**

- Servidor acepta peticiones sin token

**Causa raíz:** auth_ok = auth_token.is_empty() || ... en crozzo_lan_sync_server.rs

**Solución verificada:** Token obligatorio; comparación constante de digests; bind a IP LAN

Archivos: `src-tauri/src/crozzo_lan_sync_server.rs` · Símbolos: `crozzo_lan_sync_start`, `auth_ok` · Corregido: 2026-11-03 (parcial: token obligatorio + hash constante + bind LAN) · Aprendido de: Auditoría Asuntos Internos

---

### KI-048

**OTA con clave no coincidente** · `watch` · severidad **critical**

**Síntomas**

- Actualizaciones rechazadas en campo

**Causa raíz:** Pubkey A0EE en config vs 65A8 en crozzo-pos.key.pub vs firma AD59 en 1.0.231

**Solución verificada:** Localizar privada o regenerar par; actualizar a tauri >=2.12.0; requireSignedVersion

Archivos: `src-tauri/tauri.conf.json`, `crozzo-pos.key.pub` · Símbolos: `pubkey` · Corregido: pendiente (bloqueante) · Aprendido de: Auditoría OTA

---

## Agregar entrada nueva

1. `npm run issues:next-id` → copiar plantilla en [`ISSUE-TEMPLATE.json`](ISSUE-TEMPLATE.json)
2. Pegar en `known-issues.json` → `issues[]`
3. `npm run issues:validate && npm run issues:refresh`
4. Si es decisión permanente, también [`DECISIONS.md`](DECISIONS.md)
