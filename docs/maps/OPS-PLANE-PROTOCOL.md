# Plano Ops Efímero (POE) — Canal ops ≠ base de datos

**Vigencia:** 2026-07-30 · **Campaña:** presencia viva · **Doctrina:** SYNC-INVARIANTS · KI-003 · KI-016

> Enter/exit mesa y “estoy aquí” viajan por canal efímero.  
> Carts, cobro, closedSlots, comandas y FE siguen en Postgres + LAN híbrido.

---

## Regla de oro

| Tráfico | Canal | DB? |
|---------|-------|-----|
| `slot_presence_enter` / `exit` / heartbeat occupancy | Broadcast + LAN `slot_presence` + mesh `SLOT_PRESENCE` | **No** por evento |
| Checkpoint presencia (~90s o cobro) | `crozzo_mesa_runtime` meta | Sí (raro) |
| Carrito / cobro / locks críticos | Runtime REST + LAN `runtime` | Sí |
| Comandas | `comandas` + OpFanout + mesh | Sí |
| FE | Cola honesta `pendiente_*` | Sí |

---

## Módulo

- [`app/infra/CrozzoOpsPresenceBus.js`](../../app/infra/CrozzoOpsPresenceBus.js) — `crozzoOpsPresencePublish` / `crozzoOpsPresenceApply` / `crozzoOpsPresenceMetrics`
- Extiende [`CrozzoCloudOpsPulse.js`](../../app/modules/CrozzoCloudOpsPulse.js) — `kind: 'presence'`
- LAN: `type: 'slot_presence'` (WS + HTTP sync, Rust no upserta como comanda)
- Mesh: gossip `SLOT_PRESENCE` (R2)

Consola:

```js
crozzoOpsPresenceMetrics()
CrozzoCloudOpsPulse.status()
```

---

## Métricas R0 (contadores en vivo)

| Campo | Significado |
|-------|-------------|
| `publishEnter` / `publishExit` | Emisiones POE |
| `publishHeartbeat` | Heartbeat occupancy (sin force meta) |
| `applyRemote` | Aplicaciones remotas |
| `cloudBroadcast` / `lanEmit` / `meshEmit` | Vías usadas |
| `metaCheckpoint` | Volcados raros a meta DB (~90s / cobro) |
| `skippedMetaForce` | Enter/exit que ya no fuerzan meta |
| `dbMetaUpserts` / `dbMesaUpserts` | Upserts reales a `crozzo_mesa_runtime` (R0) |
| `opsPulseLive` | CloudOpsPulse Broadcast vivo |

### Procedimiento bitácora sede/lab (1 h)

1. Anotar `crozzoOpsPresenceMetrics()` al inicio y cada 15 min.  
2. Contar enter/exit humanos vs `publishEnter`/`publishExit`.  
3. Latencia percibida “abrí mesa → otro ve nombre” (PASS &lt;1s LAN).  
4. Confirmar `opsPulseLive` con WAN.  
5. PASS R0: números reales en bitácora (no fantasy).

---

## Backup central (R2)

Sedes con &gt;1 PC: ensayar `CrozzoCentralFailover` promote cuando cae la caja primaria.  
Sin backup + WAN off: mesh trae comandas + `SLOT_PRESENCE`; carrito compartido limitado (documentado en D7).

---

## Drills campo

Ver [`LEGENDARY-CONNECTIVITY-DRILLS.md`](LEGENDARY-CONNECTIVITY-DRILLS.md) D4–D7.

## Gate

```bash
npm run test:ops-plane-presence
npm run test:sync-clinical
```
