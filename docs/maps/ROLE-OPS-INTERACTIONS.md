# Mapa de interacciones por rol (gestión operativa)

Complementa [ROLE-OPS-AUDIT-PLAN.md](ROLE-OPS-AUDIT-PLAN.md).  
Progreso: [role-ops-audit-progress.json](role-ops-audit-progress.json).

## Matriz acción × rol

| Acción | Caja | Mesero | Recepción | Cocina | Encargado | Admin |
|--------|:----:|:------:|:---------:|:------:|:---------:|:-----:|
| Abrir mesa/llevar / Directa | ✅ | tablet | ✅ | — | ✅ | ✅ |
| +/− pre-comanda | ✅ | ✅ tab_* | ✅ editar | — | ✅ | ✅ |
| Comandar | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| Precuenta | ✅ facturar\|tab | ✅ tab | ✅ | — | ✅ | ✅ |
| Cobrar | ✅ | — | ✅ | — | ✅ | ✅ |
| Unir / Dividir | ✅ | — | ✅ | — | ✅ | ✅ |
| − post-comanda / anular | — | — | — | — | ✅ | ✅ |
| Limpiar total (+ archivar cocina) | pendientes | pendientes | — | — | ✅ | ✅ |
| LISTO / Entreg. | — | — | — | ✅ despachar | ✅ | ✅ |
| Reimprimir comanda | — | — | — | ✅ reimprimir | ✅ | ✅ |
| Cerrar panel con consumo | 🚫 toast | n/a | 🚫 toast | n/a | ✅ anular | ✅ |
| Cierre / arqueo turno | ✅ cierre_arqueo | — | ✅ cierre_arqueo | — | ✅ | ✅ |
| Proveedores / cotizaciones | — | — | — | — | ✅ | ✅ (rol inventario) |
| Abrir mesa (select) | ✅ abrir_orden | tablet | ✅ | — | ✅ | ✅ |
| Ver comandas (solo lectura) | — | — | ver | ✅ | ✅ | ✅ |

Leyenda: ✅ permitido · — no aplica / oculto · 🚫 bloqueado con feedback.

## Flujos dual-equipo (no romper)

1. **Mesero → Cocina → Caja:** comandar no vacía cuenta (KI-017). LISTO no pisa carrito.
2. **Caja Cerrar / modo:** no abandona consumo sin cobro ni `anular_comandado` (KI-030).
3. **Encargado −:** void en `comandas[]` + carrito (KI-028).
4. **Recepción:** plantilla = Policy = perfil operativo (KI-031). Sin anular.

## Fuentes de verdad RBAC (deben coincidir)

| Fuente | Archivo |
|--------|---------|
| Plantilla creación usuario | `CROZZO_CAJA_PERMISOS_POR_ROL` + `CROZZO_STAFF_PLANTILLAS` |
| Delegable admin | `CrozzoPermisosPolicy.ROLE_PERM_PRESETS` + `ROLE_ORDER` |
| Lógica post-comanda / LISTO | `CrozzoPerfilesLogica.OPERATIVE_PROFILES` |
| Menú hotel/restaurante | `crozzoResolveRoleMenus` / inicio-op roles |

## Checklist sede (por rol)

Usar [QA-TIENDA-P0-CHECKLIST.md](QA-TIENDA-P0-CHECKLIST.md) + una fila de esta matriz por rol en dispositivo real.
