# Plan mejoras comunicación (anti-solape + failover + rendimiento)

Fecha: 2026-07-14 · Relacionado: LOGICAS-PLAN-BASICO, FLEET-DIAG-SEDE, SYNC-INVARIANTS

## Principio (industria + Crozzo)

- **Un resultado, muchos caminos:** cloud + LAN + mesh pueden *transportar* el mismo op; solo **una** aplicación (OpAck / seen / LWW).
- **No pelear por el canal:** si WS LAN está fresco, el poll HTTP es respaldo (no competencia).
- **Zero-touch:** el usuario no elige tier; el director + híbrido Z0 eligen.
- **Nodo caído:** silencio → heal LAN → mesh force → QR (último).

## Pasos de esta entrega

| # | Estado | Entrega |
|---|--------|---------|
| 1 | ✅ | Anti-solape: `softPollCoveredByWs` omite poll HTTP suave si WS OPEN + RX &lt; 4.8s (`WS_FRESH_SKIP_POLL_MS`). Force a 9s intacto. |
| 2 | ✅ (ya existía) | Dedup cloud: `gateComandaNew` / OpAck en `applyComandaFromCloudRow` — no re-aplicar. |
| 3 | ✅ | Failover: silencio &gt; 18s → `healAnchorSilence` → evento `crozzo-lan-anchor-silence` + WS reconnect + pull force + mesh standby (Rol B). Director re-evalúa. |
| 4 | ✅ | `CrozzoLanOpsSync.getPathHealth()` + WS `isOpen` / `noteWsActivity`. |
| 5 | ✅ | Checks en `_lan-ops-sync-check.mjs` + `npm run test:sync-clinical`. |

Extras en la misma pasada: preset RBAC `recepcion`; companion silencioso en `mesas` + `venta-comercial`.

## Escenarios de fallo de nodo (comportamiento esperado)

| Nodo caído | Qué debe pasar |
|------------|----------------|
| Tablet B | Resto sigue; al volver, pull + outbox |
| Caja A (LAN) | B detecta silencio → heal/seek → mesh si hay peers |
| Cocina | Solo pierde UI; datos siguen en caja/nube |
| Supabase | LAN lleva Z0; outbox drena al volver |
| Wi‑Fi router | Hotspot o mesh |
| Todos aislados | Mesh + QR |

## No hacer

- Reordenar boot scripts
- Apagar LAN en Z0 porque “cloud está bien”
- CRDT completo en esta pasada (ya hay LWW + OpAck)
