# Lógicas del plan básico — roles y sync

Fuente de código: [`CrozzoPerfilesOperativos.js`](../../app/modules/CrozzoPerfilesOperativos.js) · menús PosMain `CROZZO_PERFIL_EMPRESA_MENUS`.  
Cascada: [`FLEET-DIAG-SEDE.md`](FLEET-DIAG-SEDE.md) · invariantes [`SYNC-INVARIANTS.md`](SYNC-INVARIANTS.md).

## Perfiles

| ID | Estado | Dominios Z0 | Home |
|----|--------|-------------|------|
| `basico_restaurante` | Activo | runtime mesas + comandas | `inicio-operacion` |
| `basico_tienda` | Activo | `venta-comercial` | `venta-comercial` |
| `basico_hotel` | Scaffold F&B+recepción | runtime + comandas (+ folio ligero) | `inicio-operacion` |
| `personalizado` | Super Admin | manual | — |

Candidatos futuros (solo documentados): `basico_cafeteria`, `basico_dark_kitchen`, `basico_servicios`.

## Restaurante — usuarios

| Rol | Pantalla | Puede | No puede |
|-----|----------|-------|----------|
| caja | cajero | Cobrar, FE, unir/dividir | LISTO cocina |
| mesero | tablets | Pedir, comandar | Facturar |
| cocina | comandas | LISTO, reimprimir | Editar carrito caja |
| encargado | caja+tablets+comandas | Anular comandado | — |
| inventario | compras/costos | Stock | Sala |
| admin | preset | Config | Plataforma SA |

## Tienda — usuarios

| Rol | Pantalla | Puede |
|-----|----------|-------|
| caja / mesero | venta-comercial | Venta mostrador + cobro |
| inventario | compras/costos | Stock |
| admin | preset tienda | Config |

Sin tablets/comandas/cocina (bloqueados por tipo).

## Hotel F&B ligero — usuarios

| Rol | Pantalla | Puede |
|-----|----------|-------|
| recepcion | inicio + caja/facturas | Folio ligero / cargos (stub → evolución habitación) |
| caja | cajero | F&B + cargo a habitación (mismo runtime) |
| mesero | tablets | Mesa o habitación (slot `habitacion`) |
| cocina | comandas | Igual restaurante |
| encargado | supervisión | Anular + multi-pantalla |
| admin | preset hotel | Config |

**No PMS:** tarifas, channel manager, housekeeping avanzado quedan fuera.

## Verificación por acción (restaurante)

| Acción | Permiso / guarda | Canal sync |
|--------|------------------|------------|
| comandar | mesero/caja + companion guards | OpFanout cloud+LAN |
| cobrar | `facturar` | runtime critical + fanout |
| LISTO | cocina despacho | comanda estado fanout; **no** vaciar carrito |
| facturar | caja/encargado | nube (+ LAN si híbrido) |

## Cascada (sensación)

1. Nube → 2. LAN caja → 3. Hotspot → 4. Mesh → 5. QR  
En pantallas Z0, LAN **paralelo** aunque cloud parezca sana (tablet WAN floja).

## Escala flota

| Flota | Nota |
|-------|------|
| 1 tablet + 1 PC + 1 cocina | Meta Sprint 1 (cascada Z0 híbrido) |
| 2–5 tablets + multi-área | `crozzoDeviceShowsComandaArea` / pantalla fija cocina·bar·fríos; sin `areaId` → broadcast |
| 5+5+5 | LAN server ya es **Tokio async** (`crozzo_lan_sync_server.rs`); vigilar PENDING_MAX / saturación WS |

Hotel F&B: slots de mesa con nombre `Hab. N` (o label vía `crozzoSlotTipoLabel`); folio PMS queda fuera.
