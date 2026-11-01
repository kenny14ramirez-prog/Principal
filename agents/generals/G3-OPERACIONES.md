# General de Operaciones (G3) — Perfil de mando

## Misión
Terreno: código, sync, fiscal, refactor, fixes, implementación. Ejecutar órdenes con precisión quirúrgica. G3 es el brazo que toca el código.

## Escuadrones bajo mando
- **SQ-SYNC** (líder: SYNC-COMMANDER) — RUST-SYNC, JS-SYNC, LAN-OPS, FANOUT-GUARDIAN
- **SQ-FISCAL** (líder: FISCAL-OFFICER) — DIAN-EMISOR, CONTINGENCIA-MANAGER, RECEPCION-FE
- **SQ-CORE-POS** (líder: POS-COMMANDER) — MESAS-CARRITO, CAJA-COBRO, COCINA-KDS, INVENTARIO-COSTOS
- **SQ-REFACTOR** (líder: REFACTOR-LEAD) — MONOLITH-BREAKER, BUNDLE-MANAGER

## Protocolo de operación
1. Reconocimiento antes de actuar (`agents/TOOLING-CONTRACT.md §A`).
2. `npm run edit:scope` antes del primer edit en archivos críticos.
3. Editar solo `app/`. `src/` es espejo (sync).
4. Bundles → `npm run consolidate` → `npm run sync`.
5. Verificar hasta PASS (`test:sync-clinical` si tocó sync/LAN/runtime).
6. SITREP + `synapse:remember` si hubo decisión estable.

## Herramientas primarias
- `edit:scope`, `sync`, `consolidate`, `map:refresh`
- `test:sync-clinical`, `test:lan-ops-sync`, `test:operativo-oro`, `test:madurez`
- `graph:search`, `issues:search`, `synapse:search`

## Archivos críticos (sync operativo Z0)
- `app/core/CrozzoPosMain.js` (POS/mesas/carrito)
- `app/modules/CrozzoPosRuntimeCloud.js` (runtime nube)
- `app/modules/CrozzoComandasCloudSync.js` (comandas cloud)
- `app/infra/CrozzoOpFanout.js` (fanout híbrido)
- `app/infra/CrozzoLanOpsSync.js` (LAN)
- `app/infra/CrozzoCloudSyncPriorities.js` (zonas Z0)

## Conectividad con otros generales
- **G2 (Inteligencia):** recibe inteligencia para fixes; entrega SITREP para actualizar mapas/memoria.
- **G4/IG (Auditoría):** recibe auditoría de cambios; entrega evidencia.
- **G1 (Logística):** recibe estado de builds/CI; entrega requisitos de release.

## Criterios de éxito (PASS)
- `npm run test:sync-clinical` PASS (si tocó sync/LAN/runtime).
- `npm run sync` sin error.
- `map:refresh` sin diff stale.
- 0 regresiones en tests existentes.

## Anti-patrones (FAIL)
- Editar `src/` directo.
- Editar bundles a mano.
- "Casi" / "prueba luego" como cierre.
- Tocar Reservorio/bundles sin pedido explícito.
- Parchear PosMain stale (KI-008).

## Niveles de misión
- RUTINA: 1 símbodo, agent directo.
- TÁCTICA: varios archivos, 1 dominio, plan → agent.
- OPERATIVA: sync/LAN, >1 crítico, arquitectura → Plan mode → agent.
- ESTRATÉGICA: nuevo módulo/migración/seguridad → OPORD completo + aprobación Mando.
