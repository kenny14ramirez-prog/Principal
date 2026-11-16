# Invariantes de Sincronización — POS Crozzo

Documento de invariantes que deben cumplirse en toda operación de sync (cloud, LAN, mesh, P2P).

1. Toda operación de sync tiene `transaction_id` o `idempotency_key` estable (`resv-<tabla>-<op>-<id>` en `CrozzoReservorio.pushSync`).
2. `CrozzoOperationalIngest.gateComandaNew` dedupa por TID antes de aplicar (`__crozzoComandaTidSeen`).
3. `mergeItemsInto` suma `cantidad` y `sentCantidad` para evitar pendientes inflados (`CrozzoPosMain.js`).
4. Estados terminales (`pagado`, `cerrado`, `anulado`) son absorbentes: ningún snapshot con versión menor los revierte (`closedSlots`).
5. `crozzoEnsureSlotFreshBeforeEdit` debe abortar si no puede obtener slot fresco (no operar con carrito stale).
6. `markTabletItemsAsSent` solo incrementa `sentCantidad` hasta `cantidad` (nunca excede).
7. Outbox de comandas (`OUTBOX_LS_KEY`) persiste en `localStorage` con backoff `1.7^attempts` y max age 6h.
8. Runtime push retry exponencial (2.2s × 1.6, máx 25s) con `scheduleRuntimePushRetry`.
9. Mesh dedup por `msgId` con TTL 15 min (`DEDUP_MS` en `CrozzoBleMesh.js`).
10. `crozzoSyncPosRuntimeCritical` flushea runtime + fanout + push cloud en orden.
11. `crozzoMergeCartLinesInto` suma `sentCantidad` (consistencia con `mergeItemsInto`).
12. Facturas `pendiente_fiscal` deben propagar CUFE tras drenaje (outbox fiscal + contingencia).
