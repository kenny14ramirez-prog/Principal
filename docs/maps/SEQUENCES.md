# Mapa de secuencias lógicas

> Flujos temporales. Invariantes en [SYNC-INVARIANTS.md](SYNC-INVARIANTS.md).

---

## S1 — Tablet agrega producto → caja ve carrito

```
Usuario tablet: addToCart()
  → crozzoFinalizeCartMutation('cart_*')
    → crozzoSyncPosRuntimeCritical('cart_line' | 'tablet_cart_add')
      → crozzoPushPosRuntimeCloudNow()          [PosRuntimeCloud]
      → crozzoOpFanoutRuntimeTouch('flush')   [OpFanout → LAN + nube]
        → Supabase crozzo_mesa_runtime UPSERT
          → Realtime applyRemoteRow            [otros dispositivos]
            → applyPosRuntimeSnapshot({ skipUiFields: true })
              → crozzoReplaceCartsMaps (nube gana si más nuevo)
              → crozzoHandleRemoteRuntimeUiSync({ skipCartReconcile: true })
                → crozzoPatchOperationalPageFromRemote('cajero'|'tablets')
```

**Criterio éxito:** caja ve líneas en &lt;5s, mismo `locationId`, sin 401.

---

## S2 — Caja cobra → tablet cierra mesa

```
Usuario caja: cobro / cerrar orden
  → closedSlots[tipo][ref] = true
  → crozzoSyncPosRuntimeCritical('post_cobro' | 'slot_paid')
    → nube + LAN
      → Tablet applyPosRuntimeSnapshot
        → crozzoHandleRemoteRuntimeUiSync
          → if closedSlots[tipo][ref]: crozzoReleaseTabletSlotSession + toast
```

**Criterio éxito:** tablet no muestra carrito viejo; mesa libre en grilla.

---

## S3 — Comandar → cocina

```
Usuario: crozzoFinalizeComandaSend()
  → comandas[] local
  → CrozzoComandasCloudSync fanout (nube + LAN + gossip)
  → maybeGossipPublishEstado
  → crozzoTryAutoPrintComanda (si estación con térmica)
  → crozzoSyncPosRuntimeCritical('comanda_send')
```

---

## S4 — Arranque app → sync activo

```
index.html scripts (ver BOOT-ORDER.md)
  → CrozzoStartupReady.run()
    → CrozzoConnectivityOrchestrator
    → CrozzoPageCloudWatch
    → startComandasCloudSync / PosRuntimeCloud subscribe
  → CrozzoPosBoot → initPOS()
    → navigateTo página rol
```

---

## S5 — Reconexión nube tras offline

```
CrozzoReconnectSync / crozzoRunFullReconnectSync
  → drain sync_queue
  → pull runtime + comandas
  → applyPosRuntimeSnapshot
  → crozzoHandleRemoteRuntimeUiSync
```

---

## S6 — Agente edita código (meta-flujo)

```
1. docs/maps/INDEX.md → elegir mapa
2. npm run edit:scope -- app/.../File.js symbol
3. Read 1 archivo de CONNECTIONS "Debes revisar"
4. StrReplace (ancla ≥5 líneas)
5. npm run sync (hook)
6. npm run test:sync-clinical (si sync/LAN)
7. npm run map:refresh (si index.html o exports nuevos)
```
