# Plan: auditoría 1×1 por rol y acción (operación)

Fecha: 2026-07-14 · Checklist sede: [QA-TIENDA-P0-CHECKLIST.md](QA-TIENDA-P0-CHECKLIST.md)  
Progreso: [role-ops-audit-progress.json](role-ops-audit-progress.json)

## Principio

No “revisar el sistema entero” de un golpe. Cada oleada = **un rol + lista de acciones** → bugs concretos → fix mínimo → KI + `test:sync-clinical` → checklist sede.

**Fuente de verdad roles:** `CROZZO_CAJA_PERMISOS_POR_ROL` + `CrozzoPerfilesLogica` + `CrozzoPerfilesOperativos` + `PAGE_PERMISOS` en PosMain.

## Matriz de oleadas

| Oleada | Rol | Páginas | Acciones 1×1 (orden) | Estado |
|--------|-----|---------|----------------------|--------|
| **A** | Caja | cajero, Directa, mesas | Limpiar, comandar, precuenta, cobrar, CRM, unir/dividir | Hecho parcial (KI-021…026) |
| **B** | Mesero | tablets | Abrir mesa, +/−, comandar, precuenta, no editar post-comanda, sync | Hecho parcial (KI-027) |
| **C** | Cocina | cocina, comandas | LISTO, Entreg., Prep/Lista, reimprimir; cuenta caja intacta | Hecho parcial (KI-023…025) |
| **D** | Encargado | caja+tablets+comandas | Anular comandado, Limpiar total, LISTO, multi-pantalla | Hecho parcial (KI-028, KI-029) |
| **E** | Admin | config + operar | Nav/permisos, plantillas, no romper Z0 | Hecho parcial (KI-029; sede pendiente) |
| **F** | Recepción / Inventario / SA | según perfil | Spot-check + no regresión Z0 | Hecho parcial (KI-030…032; mapa interacciones) |

**Mapa acción×rol:** [ROLE-OPS-INTERACTIONS.md](ROLE-OPS-INTERACTIONS.md)

## Reglas duras (no negociables)

1. Permisos solo en **UI** (`crozzoHasCajaPermiso` / `crozzoOperativeCan`) — nunca en transporte (KI-014).
2. Cocina = señal comanda; carrito = caja/tablet (KI-017).
3. Tras runtime remoto: `skipCartReconcile: true` (KI-003).
4. Editar `app/` → `npm run sync` → clinical si sync/LAN/caja.
5. Cada bug nuevo → `known-issues.json` (KI-NNN).

## Criterio de “rol verde”

- Cada acción de la oleada: feedback visible (toast/UI) o bloqueo con mensaje.
- Dual-equipo: mesero → cocina → caja sin cuenta borrada ni sticky fantasma.
- `npm run test:sync-clinical` verde.
- Checklist P0 marcada en sede para esa oleada.

## Orden de ejecución

```
A (caja) → B (mesero) → C (cocina) → D (encargado) → E (admin) → F (resto)
```

Dentro de cada oleada: **código** (hunt+fix) → **clinical** → **campo** (QA checklist) → siguiente.

## No incluir en este plan

- Refactor Reservorio / bundles compras
- CRDT / SWIM / segundo roster
- Rediseño visual completo
