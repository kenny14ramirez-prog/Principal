# Plan maestro — reparación sync Crozzo POS (Z0 + roles + zonas)

> **Fuente de verdad para agentes.** Progreso machine-readable: [`sync-repair-progress.json`](sync-repair-progress.json)  
> **Última actualización:** 2026-07-07  
> **Relacionado:** [SYNC-INVARIANTS.md](SYNC-INVARIANTS.md) · [KNOWN-ISSUES.md](KNOWN-ISSUES.md) · [CONNECTIONS.md](CONNECTIONS.md)

---

## Objetivo

Restaurar operación en tiempo real (mesas, carritos, comandas, cocina) con:

1. **Z0** confiable (nube + LAN híbrido honesto)
2. **Z1/Z2/Z3** sin cargar dispositivos innecesariamente
3. **Perfil de usuario** que limite lecturas (mesero ≠ admin)
4. **Reservorio operativo** respetado (no vaciar mesa/carrito por sync)
5. **Supabase** alineado (tablas, RLS, `location_id`)

---

## Reglas de ejecución (agente)

| Antes de cada paso | Comando / acción |
|--------------------|------------------|
| ¿Ya existe fix? | `npm run issues:search -- "síntoma"` |
| Editar archivo crítico | `npm run edit:scope -- app/.../File.js symbol` |
| Tras editar `app/` | `npm run sync` |
| Cambio sync/LAN | `npm run test:sync-clinical` |
| Marcar progreso | Actualizar `sync-repair-progress.json` |
| Bug nuevo resuelto | `known-issues.json` → `npm run issues:refresh` |

**Archivos críticos:** PosMain, PosRuntimeCloud, ComandasCloudSync, OpFanout, LanOpsSync, LanSyncBridge, CloudSyncPriorities, PageCloudWatch.

**No tocar:** `CrozzoReservorio*` (compras/costos), bundles generados, `src/` directo.

---

## Mapa de zonas (deseo ↔ código)

| Zona | Nombre | Cuándo sync | Módulo principal | Dominios típicos |
|------|--------|-------------|------------------|------------------|
| **Z0** | Operación RT | Pantallas P0 activas | PageCloudWatch + RuntimeCloud + ComandasCloudSync | `runtime`, `comandas` |
| **Z1** | Nav / bajo demanda | Entrar/salir pantalla, botón buscar | PageCloudWatch `onPageEnter/Leave` | `sales`, `factura`, `clients` |
| **Z2** | Cola / batch | Timer ~240s, flush al salir | `syncOfflineQueue`, purge 12h comandas | `queue`, `audit` |
| **Z3** | Admin diferido | Solo al abrir config/compras | CloudSyncPriorities `Z3_DEFER_PAGES` | catálogo, tenant |

Pantallas Z0: `cajero`, `tablets`, `comandas`, `cocina`, `mesas`, `venta-comercial`.

---

## FASE 0 — Diagnóstico y base de datos

**Estado:** `pending` · **Bloquea:** nada (paralelo a Fase 1)

### 0.1 Verificar git y versión

- [ ] `git fetch origin && git status -sb` — 0 behind `origin/main`
- [ ] `releases/latest.json` = meta `crozzo-app-version` en `app/index.html`

### 0.2 Supabase — esquema operativo

Tablas Z0 obligatorias:

| Tabla | Uso |
|-------|-----|
| `crozzo_mesa_runtime` | Carritos/slots por mesa (preferida) |
| `crozzo_sede_runtime` | Fallback agregado sede |
| `comandas` | Comandas activas + estados cocina |

Comandos repo:

```bash
node scripts/_supabase-schema-audit.mjs   # si hay credenciales
npm run issues:search -- "locationId"
```

Checklist SQL (consola Supabase):

- [ ] `comandas`: columnas `id`, `location_id`, `business_id`, `status`, `payload`, `updated_at`
- [ ] `crozzo_mesa_runtime`: `location_id`, `kind`, `ref`, `payload`, `source_device_id`, `updated_at`
- [ ] Realtime habilitado en `comandas` y runtime
- [ ] Índices en `location_id` + `updated_at`

### 0.3 Supabase — RLS y seguridad por rol (futuro)

- [ ] Política: mesero/staff solo SELECT comandas/runtime de su `location_id`
- [ ] Admin/encargado: SELECT ampliado en `sales`, facturas
- [ ] Documentar en `DECISIONS.md` cuando se aplique

### 0.4 Configuración en tienda (todos los dispositivos)

En consola (caja y tablet):

```javascript
getMultiDeviceConfig()           // role A/B, centralIp, locationId
crozzoComandaOutboxStatus()
crozzoCloudSyncPathReady()
CrozzoConnectivityOrchestrator?.getState?.()
```

- [ ] **Misma `locationId`** en todos (KI-010)
- [ ] Caja `role: 'A'`, tablets `role: 'B'` con `centralIp` de caja
- [ ] Tras comandar: fila en `comandas` + filas en `crozzo_mesa_runtime`

### 0.5 LAN / puertos

- [ ] Caja: HTTP :3000 + WS activos (`crozzo_lan_sync_start`)
- [ ] Tablets alcanzan `http://<ip-caja>:3000/api/health`
- [ ] Sin error “puerto ocupado” al reiniciar (fix LanSyncBridge + Rust)

**Criterio de hecho Fase 0:** checklist completado en al menos 1 sede piloto; issues documentados.

---

## FASE 1 — Desbloquear Z0 (transporte híbrido honesto)

**Estado:** `in_progress` · **Prioridad:** CRÍTICA  
**Síntomas:** comandas asimétricas, tablet no ve caja, LAN apagado con socket “sano”

### 1.1 `lanParallelPushNeeded` — LAN cuando híbrido Z0 o outbox pendiente

**Archivo:** `app/modules/CrozzoComandasCloudSync.js`  
**Función:** `lanParallelPushNeeded`

- [x] Si `crozzoZ0HybridParallelLan()` → `true` (paralelo en operación)
- [x] Si outbox con `attempts > 0` o `lastErr` → `true`
- [ ] Verificar fanout comanda desde caja llega a tablet

### 1.2 Caja empuja comandas por LAN

**Archivo:** `app/modules/CrozzoComandasCloudSync.js`  
**Funciones:** `pushComandaLan`, `pushComandaEstadoLan`

- [x] Eliminar early-return `role === 'A'`
- [x] Delegar en `crozzoLanPostSync` (invoke nativo Tauri en caja)

### 1.3 Standby LAN no ocultar fallos de outbox

**Archivo:** `app/infra/CrozzoConnectivityStandby.js`  
**Función:** `crozzoDeferLocalSync`

- [x] Si outbox comandas con reintentos → no deferir LAN (`return false`)

### 1.4 Verificación clínica

- [ ] `npm run sync`
- [ ] `npm run test:sync-clinical`

**Criterio de hecho Fase 1:** caja comanda → tablet y cocina ven en &lt;3s (nube o LAN); outbox `pending: 0` tras 30s.

---

## FASE 2 — Reservorio operativo (merge runtime)

**Estado:** `pending` · **KI:** 016, 017, 018, 019

### 2.1 Snapshot vacío no pisa trabajo activo

**Archivo:** `app/modules/CrozzoPosRuntimeCloud.js`  
**Función:** `applyRemoteRow`

- [x] Ignorar snapshot remoto vacío si hay comandas activas locales (no solo carrito)
- [ ] Usar `CrozzoOperativeReservorio.slotHasActiveWork` por slot

### 2.2 `mesaRowsFromSnap` incluye slots con comanda activa

**Archivo:** `app/modules/CrozzoPosRuntimeCloud.js`  
**Función:** `mesaRowsFromSnap`

- [ ] Slot con comanda no-entregada debe aparecer en push aunque carrito vacío

### 2.3 LISTO cocina ≠ liberar mesa

**Archivos:** PosMain (estado comanda), PosRuntimeCloud  
- [ ] LISTO solo cambia `estado` comanda; mesa libre solo tras cobro/`allowCloudAuthoritativeEmpty`

### 2.4 Presencia mesa (LWW)

**Archivo:** PosMain — `slotSessionPresence`  
- [ ] Heartbeat + merge `expiresAt`; salir mesa limpia presencia local y push

**Criterio de hecho Fase 2:** carrito no desaparece a los 30–60s; LISTO no borra mesa ocupada.

---

## FASE 3 — Perfil sync por rol de usuario

**Estado:** `pending` · **Nota:** respeta invariante #5 (transporte Z0 no bloquea mesero)

### 3.1 Capa `USER_SYNC_PROFILE`

**Archivo nuevo propuesto:** `app/infra/CrozzoUserSyncProfile.js`

| Perfil | Dominios permitidos |
|--------|---------------------|
| `mesero` | `runtime`, `comandas` |
| `cocina` | `comandas`, `preparations`, recetas |
| `cajero` | `runtime`, `comandas`, `sales` (Z1) |
| `admin` / `encargado` | todos (Z1/Z3 bajo demanda) |
| `kiosko` (sin sesión) | `comandas` |

### 3.2 Integrar con PageCloudWatch

**Archivo:** `app/infra/CrozzoPageCloudWatch.js`

- [ ] `dominios_efectivos = PAGE.domains ∩ USER_SYNC_PROFILE[perfil]`
- [ ] Resolver perfil desde `sessionStorage crozzo_session_user` + `CrozzoPerfilesLogica`

### 3.3 UI vs transporte

- [ ] Permisos UI: `CrozzoPerfilesLogica` (existente)
- [ ] Lecturas nube: filtro dominios + RLS Supabase (Fase 0.3)

**Criterio de hecho Fase 3:** mesero en tablets no dispara probes de `sales`/`factura`; admin en inicio no carga facturas hasta navegar.

---

## FASE 4 — Zonas Z1/Z2/Z3 y carga Supabase

**Estado:** `pending`

### 4.1 Z1 — confirmar nav-only

- [ ] Auditar `PAGE_REGISTRY` P1: facturas, cierre-caja, inicio-operacion
- [ ] `onPageLeave` hace flush cola (CloudSyncPriorities)

### 4.2 Z2 — cola y purge centralizado

- [ ] Purge 12h comandas: solo caja/admin (`purgeDeliveredComandasFromCloud`)
- [ ] `syncOfflineQueue` background: no en Z3; throttle bajo presión

### 4.3 Métrica “calidad nube” (socket vs datos)

**Archivo:** `app/infra/CrozzoConnectivityStandby.js` o extensión

- [ ] `write_ok`: último push runtime/comanda OK
- [ ] `read_ok`: último pull aplicó datos coherentes
- [ ] Standby LAN solo si `write_ok && read_ok` (no solo SUBSCRIBED)

**Criterio de hecho Fase 4:** 100 dispositivos en Z0 no saturan Supabase; admin carga facturas solo al abrir pantalla.

---

## FASE 5 — QA en tienda

**Estado:** `pending` · Ver también [`docs/QA-OPERATIVO-ORO.md`](../QA-OPERATIVO-ORO.md)

| # | Escenario | Dispositivos | Esperado |
|---|-----------|--------------|----------|
| 1 | Caja comanda | Caja + tablet + cocina | Los 3 ven comanda |
| 2 | Tablet comanda | Idem | Cocina LISTO, caja ve estado |
| 3 | Entrar/salir mesa | Tablet + caja | Presencia coherente &lt;2s |
| 4 | LISTO cocina | Cocina + caja | Mesa sigue ocupada hasta cobro |
| 5 | Offline LAN | WiFi caído, LAN OK | Sync local entre equipos |
| 6 | Mesero login | Tablet | Sin requests facturas en Network |

---

## Orden de ejecución recomendado

```
Fase 0 (diagnóstico) ──┐
                       ├──► Fase 1 (transporte) ──► Fase 2 (merge) ──► Fase 5 (QA)
Fase 3 (roles) ────────┘         ▲
Fase 4 (zonas) ──────────────────┘ (paralelo tras Fase 1)
```

---

## Registro de sesiones

| Fecha | Fase | Cambios | Verificado |
|-------|------|---------|------------|
| 2026-07-07 | Plan | Creación SYNC-REPAIR-PLAN + progress JSON | — |
| 2026-07-07 | 1–4 | Fases 1–4 código completo; test:sync-clinical 92/92 OK | sync-clinical |
| 2026-07-07 | 5 | Pendiente QA manual tienda | — |
