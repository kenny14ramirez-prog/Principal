# Decisiones arquitectónicas (ADRs ligeros)

> Formato: fecha · decisión · razón · no hacer

---

## D-018 — BONA Aire: Siempre / Al necesitar / Nunca (2026-07-20)

**Decisión:** En caja P0 cada UI es una de tres clases (progressive disclosure):

| Clase | Qué va | Ejemplos |
|-------|--------|----------|
| **Siempre** | Imprescindible para vender ahora | Total, ítems, Cobrar, búsqueda/productos, 1 pill sede |
| **Al necesitar** | Se revela al expandir o si hay estado | IVA/detalle fiscal, Unir/Dividir, Precuenta, Cliente, cola print, meta/atajos |
| **Nunca en caja** | Solo encargado/diag | DEFCON, banners, companion, score |

**Razón:** Menos saturación visual y cognitiva (estilo Apple: construir paso a paso). Belleza BONA sin “panel de aeropuerto”.  
**No hacer:** Más badges/banners; esconder Cobrar; tocar OpFanout por estética; mostrar detalle fiscal siempre abierto.

---

## D-017 — Léxico humano P0 (BONA Obra · 2026-07-20)

**Decisión:** En pantallas P0 (caja / tablets / comandas / cocina) el *texto visible* del pill de flota usa léxico humano fijo. Jerga (DEFCON, SEAL, Z0, LAN, peers) queda en `title`/tip o en diag encargado — nunca como label del chip.

| Condición (infra) | Texto visible |
|-------------------|---------------|
| Sede operable (DEFCON ≤2 / nube OK) | **Sede lista** |
| Local / sin nube / malla operable | **En local · sincroniza sola** |
| Cola pendiente / reconectando | **Recuperando…** |
| Riesgo cobro FE / digital | **Atención · cobro simple** |

**Razón:** Fogg (credibilidad = trustworthiness + expertise) + Norman (feedback sin ansiedad): el cajero siente control y honestidad; el músculo técnico no se apaga, solo se traduce.  
**No hacer:** Banners P0; chips nuevos; mostrar DEFCON/SEAL en caja; tocar OpFanout/ConnectivityStandby solo por copy.

---

## D-016 — Command Bridge fachada única (2026-07-17)

**Decisión:** Todo el stack de armas (seal, scorecard, drain, pay, path) se consume vía `CrozzoCommandBridge` (briefing / recover / diagRows). Diag y Automation no ensamblan a mano. Paridad en `index.html` y `Crozzo_POS_Completo.html`.  
**Razón:** Sensación de sistema cerrado tipo armamento, no módulos sueltos.  
**No hacer:** Añadir banners P0; nuevo “chip mando” en caja; segundo roster de APIs globales sin pasar por Bridge.

---

## D-015 — Scorecard mando + drenaje fiscal en reconnect (2026-07-17)

**Decisión:** `CrozzoCommandScorecard` pondera vs Alegra/Gestro/Loggro (peso flota/ops/fiscal). `CrozzoFiscalOutboxDrain` reintenta cola Dataico al `runFullReconnectSync`. Doctrina en `MILITARY-COMMAND-DOCTRINE.md`.  
**Razón:** Verificar superioridad con métrica, no feeling; no dejar ventas sin CUFE tras WAN.  
**No hacer:** Banners de score en caja P0; drenar sin Auth-token (skip).

---

## D-014 — Sello sede + fiscal honesto + pago idempotente (2026-07-17)

**Decisión:**  
1) `CrozzoSedeReadiness` agrega DEFCON/seal pre-turno (diag admin; sin banners P0).  
2) `dataicoStamp(xml, factura, config)` llama API Dataico real; stub solo con `allowSimulatedStamp`; outbox fiscal si red falla (venta `pendiente_fiscal`, no CUFE falso).  
3) `CrozzoDigitalPayConduit.ensurePaid` con Idempotency-Key; Wompi si hay llaves; si no, referencia manual obligatoria.  
**Razón:** Auditoría CO — no fingir DIAN/pagos; offline-first no pierde venta.  
**No hacer:** `isDemo: false` en simulación; aprobar Nequi sin ref ni pasarela; banners readiness en cobro.

---

## D-001 — app/ canónico, src/ espejo

**Decisión:** Toda edición frontend en `app/`; Tauri sirve `src/` vía `npm run sync`.  
**Razón:** Un solo source of truth; evitar diffs divergentes.  
**No hacer:** Parchear `src/core/CrozzoPosMain.js` directo.

---

## D-002 — Nube gana carrito (LWW por slot)

**Decisión:** Merge por `_slotUpdatedAt` vs `__crozzoLocalEdit`; excepción digitación reciente.  
**Razón:** Modelo “caja dice rojo → todos rojo”; eliminar pin 120s y merge local siempre gana.  
**No hacer:** Reintroducir `crozzoSlotCartMergePinned` bloqueando remoto.

---

## D-003 — skipCartReconcile tras runtime remoto

**Decisión:** Tras `applyRemoteRow`, UI sync con `skipCartReconcile: true`.  
**Razón:** Reconcile post-sync reponía ítems desde comandas y deshacía cobros/caja.  
**No hacer:** Llamar `crozzoReconcileOpenSlotCartFromComandas` después de apply runtime.

---

## D-004 — Reservorio fuera de scope sync Z0

**Decisión:** No tocar `CrozzoReservorio*` en fixes de mesas/comandas/LAN.  
**Razón:** Dominio compras/costos/planilla separado; bundles pesados.  
**No hacer:** “Aprovechar” y refactorizar Reservorio en el mismo PR que sync.

---

## D-005 — Mapas en docs/maps/

**Decisión:** Índice + conexiones + secuencias + auto-generados (`map:refresh`).  
**Razón:** PosMain 51k líneas no cabe en contexto; navegar por mapa.  
**No hacer:** Leer PosMain entero por cada parche.

---

## D-006 — Errores conocidos (known-issues.json)

**Decisión:** Base JSON + KNOWN-ISSUES.md auto + búsqueda CLI; actualizar tras cada fix verificado.  
**Razón:** Evitar que agentes repitan regresiones ya corregidas (skipCartReconcile, src/, LAN tier, etc.).  
**No hacer:** Parchear de nuevo sin `issues:search`; dejar fixes solo en chat sin JSON.

---

## D-007 — crozzoDeferLocalSync único (ConnectivityStandby)

**Decisión:** `window.crozzoDeferLocalSync` solo lo define `CrozzoConnectivityStandby.js` (carga después de PosMain). PosMain no reexporta su propia versión.  
**Razón:** Una sola regla: outbox pendiente + híbrido realtime + write/read OK recientes antes de posponer LAN.  
**No hacer:** Redefinir defer en PosMain ni duplicar lógica WAN/realtime.

---

## D-013 — Limpiar mesa libera cocina; outbox entregada sobrevive al splice

**Decisión:** (1) Outbox de comandas guarda snapshot (`estado`/`payload`) y resuelve también desde `comandaHistory` — nunca dropear `entregada` porque ya no está en `comandas[]`. (2) Pull/LAN no reinsertan tid ya entregada en history. (3) **Limpiar** (vaciar todo con permiso) archiva comandas vivas del slot + `slotLocalClearedAt`; no deja “cocina fantasma” con mesa morada. Sellos cleared se conservan al reabrir si el carrito sigue vacío.

**Razón:** LISTO local sin upsert nube → pull revive sticky; Limpiar-solo-detach contradice expectativa de mesa libre (KI-023).

**Consecuencia:** Dominio comanda ≠ carrito (KI-017) se mantiene en LISTO cocina (no push runtime vacío); Limpiar es acción de caja/autorizada que sí cierra el ciclo cocina+mesa.

## D-012 — Eco de roster desde caja + heal de descubrimiento

**Decisión:** Rol A, al ingerir `identity_card`, responde (throttle ~12s/deviceId) con `fleet_roster` (self + `peersForQrHint`). Diag Reparar y PostPair/AutoConnect fuerzan `announceIdentity` si flota ≤1. Soft-heal Rol B post `lan-up` (announce → rediscover → Director) **sin** `FleetOperationalReconcile`. Sede divergente incrementa contador visible en diag (no mezcla sedes).

**Razón:** Fallo típico “no se comunican” = roster vacío / IP incorrecta, no falta de WebSocket. Patrón hub relay-peers sin CRDT/SWIM.

**Consecuencia:** Ver FLEET-IDENTITY.md; no escanear subred completa ni segundo roster.

## D-011 — PeerDirectory = roster de flota (carnet + anuncio)

**Decisión:** Tras QR/boot, `announceIdentity` publica `identity_card` v3 (deviceId, locationId, lanIp propia, centralIp, transports) por nube + LAN + gossip + BLE. QR lleva `fp[]` peers recientes. Rol B **no** usa `centralIp` como su `lanIp`.

**Razón:** Sin identidad compartida las vías no saben a quién hablar (descubrimiento ≠ transporte).

**Consecuencia:** `crozzoFleetSnapshot` / diag flota; ver FLEET-IDENTITY.md.

## D-010 — Multi-transporte: scoreboard + mesh supervivencia + digest

**Decisión:** `CrozzoTransportPathHealth` etiqueta el path (`ws_primary` / `mesh_survival`…). OpFanout emite mesh (gossip/BLE/Wi‑Fi Direct) solo si `shouldEmitMesh` o force/retry. Anti-entropy: `GET /api/ops-digest` (count+hash) omite soft pull si coincide. Wi‑Fi Direct = puente JS `http_peer_relay` (+ stub nativo APK); no Ditto/Yjs/MQTT.

**Razón:** Misma idea Ditto (varios radios, un apply) sin reescribir dominio; OpAck ya es first-wins.

**Consecuencia:** Discovery APK vía `CrozzoMdnsBridge.rediscoverCentral` + silencio ancla.

## D-009 — LAN: WS primario, poll HTTP de respaldo (anti-solape)

**Decisión:** Si WebSocket LAN está OPEN y hubo RX reciente (`WS_FRESH_SKIP_POLL_MS`), omitir poll HTTP suave de runtime/comandas. Silencio largo fuerza pull + `crozzo-lan-anchor-silence` (Director re-busca caja).

**Razón:** Cloud + LAN + poll no deben pelear por el mismo op; OpAck ya deduplica aplicación; el solape caro es el transporte (CPU/red).

**Consecuencia:** `CrozzoLanOpsSync.softPollCoveredByWs` / `getPathHealth`; no apagar LAN en Z0 híbrido.

## D-008 — Enrich FE contacto en fondo (RUES + Scrapling sidecar)

**Decisión:** Tras lookup DIAN (a menudo solo nombre), enriquecer **email/dirección/teléfono** en segundo plano: primero RUES opendata+DetalleRM en JS; si falta, sidecar local Scrapling `127.0.0.1:18765` vía Tauri (`adq_enrich_*`). El cobro/UI nunca esperan al sidecar.  
**Razón:** FE necesita más que razón social; Scrapling MCP de Cursor no sirve en caja.  
**No hacer:** Bloquear `runForForm`/`lookupAdquiriente` con scrape; scrapear DIAN autenticado; asumir correo 100% sin preguntar al cliente; depender del sidecar para que el POS arranque.

---

## Plantilla nueva entrada

```markdown
## D-00N — Título
**Decisión:** …
**Razón:** …
**No hacer:** …
```
