# Invariantes sync Z0 (no violar)

> Si un cambio contradice uno de estos, es regresión — no “optimización”.

1. **Fuente única frontend:** editar `app/`; `src/` es espejo (`npm run sync`).
2. **Escritura:** mutación operativa → `crozzoSyncPosRuntimeCritical` o fanout comandas → nube **y** LAN (Z0 híbrido).
3. **Lectura carrito:** `crozzoReplaceCartsMaps` — nube gana si `_slotUpdatedAt` &gt; última edición local (~250ms margen), salvo `recentTyping` (~12s).
4. **Post-runtime UI:** `crozzoHandleRemoteRuntimeUiSync({ skipCartReconcile: true })` — no re-ejecutar reconcile desde comandas encima del runtime.
5. **Permisos:** solo UI (`crozzoHasCajaPermiso`); transporte no bloquea por rol mesero/caja.
6. **`anular_comandado`:** no mapea a `tab_*`; aplica en cualquier dispositivo con permiso.
7. **Presencia:** merge LWW por `deviceId` / `expiresAt`; heartbeat no hace flush nube solo.
8. **Realtime:** anti-flap re-suscripción (no loop SUBSCRIBED→CLOSED agresivo).
9. **Misma sede:** todos los equipos misma `locationId` canónica.
10. **Reservorio:** sin acoplamiento a runtime mesa/comandas salvo pedido explícito.
11. **Norma visual (aspecto):** paneles/menús nuevos usan tokens `--bg-card`, `--text-primary`, `--accent-rgb` y selectores `html[data-theme="bona-origen"]` / `html.crozzo-theme-dark`; al cambiar tema, escuchar `crozzo:theme-change` o depender solo de CSS vars. Tras nuevo script en `index.html`: `npm run map:refresh`.

Ver secuencias: [SEQUENCES.md](SEQUENCES.md).
