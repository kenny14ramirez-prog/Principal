# SITREP TIMERS-SCHEDULER

**Agente:** TIMERS-SCHEDULER  
**Fecha:** 2026-10-28T18:52:14.539Z

## Inventario

| Archivo | setInterval | setTimeout | Total |
|---------|-------------|------------|-------|
| app/core/CrozzoPosMain.js | 15 | 158 | 173 |
| app/infra/CrozzoLanOpsSync.js | 4 | 7 | 11 |
| app/infra/CrozzoConnectivityOrchestrator.js | 0 | 4 | 4 |
| app/modules/CrozzoPosRuntimeCloud.js | 2 | 10 | 12 |
| app/modules/CrozzoComandasCloudSync.js | 2 | 10 | 12 |
| app/infra/CrozzoOpFanout.js | 0 | 2 | 2 |
| **TOTAL** | **23** | **191** | **214** |

## Recomendaciones

1. **Consolidar** en un scheduler central con prioridades
2. **Visibility-aware** - pausar cuando pestaña oculta
3. **Backoff+jitter** - evitar thundering herd
4. **Limpiar** timers huérfanos en navegación/logout
5. **Debounce** polls solapados

