# PLAN MAESTRO - OPTIMIZACIÓN HORA MAESTRA

**Estado:** FASE 2/3 - CONSOLIDADO PARA REVISIÓN  
**Objetivo:** Hacer el sistema sentir ultra-megapotente, confiable, predecible. Sin romper funcionalidad crítica.  
**Foco actual:** ESTABILIDAD HÍBRIDA CAJA<->TABLETS + DOMAR TIMERS/POLLS  
**Regla:** Investigar → Pesar → Planificar → **APROBACIÓN EXPLÍCITA** → Ejecutar paso a paso

---

## 1. RESUMEN EJECUTIVO

Tras investigación forense con agentes especializados:

- **Cadena híbrida está bien protegida** por invariantes (skipCartReconcile, merge por `_slotUpdatedAt`, ACK/OpAckRegistry). El riesgo real es **TIMING/RACE CONDITIONS** entre transports, no lógica incorrecta.
- **214 timers/polls totales** detectados. `CrozzoPosMain.js` solo tiene 173 (15 intervals + 158 timeouts). Esto genera ruido y posible *thundering herd* bajo estrés.
- **Flap entre transportes** es el síntoma más probable de "se traba/varía". Orquestador tiene controles anti-flap pero puede mejorar.
- **Sistema resistió jornada caos** (0 errores fatales) - es robusto, pero se puede pulir para sentir más ágil y predecible.

**Meta:** Menos solapamiento, menos cambios innecesarios de transporte, respuestas más inmediatas. Misma fiabilidad, mejor sensación.

---

## 2. AGENTES DESPLEGADOS Y HALLAZGOS

| Agente | Estado | Hallazgos Clave |
|--------|--------|-----------------|
| **ARQUITECTO-BOOT** | COMPLETADO | Arranque híbrido eager+lazy correcto. `initPOS()` y flujo OK. |
| **PESADOR-RECURSOS** | COMPLETADO | PosMain 2331KB (monolito). Infra 1065KB. Muchos globals/listeners. |
| **GUARDIAN-SYNC** | COMPLETADO | Cadena Z0 INTANGIBLE: OpFanout, LanSyncBridge/Ops, OpAckRegistry, Runtime/Comandas, Orchestrator. NO MOVER SIN EVIDENCIA IRREFUTABLE. |
| **HYBRID-FORENSIC** | COMPLETADO | Fanout/ACK críticos. WS+poll fallback. Runtime merge guardado con skipCartReconcile. Riesgo: timing/flap. |
| **TIMERS-SCHEDULER** | COMPLETADO | 23 intervals + 191 timeouts = 214 total. PosMain concentra mayor carga. Necesita consolidación/visibility-aware/backoff+jitter. |
| **FLAKE-HUNTER** | COMPLETADO | Sin races obvios en muestra. Recomienda tracing runtime para flap real. |
| **Bucle retroalimentación** | ACTIVO | `agent-feedback.mjs` creado. Agentes aprenden entre ellos via `shared-knowledge.json`. |

---

## 3. ZONAS INTANGIBLES (PROTEGIDAS)

**NUNCA TOCAR SIN PEDIDO EXPLÍCITO:**

- `app/infra/CrozzoOpFanout.js` - Fanout híbrido Z0
- `app/infra/CrozzoOpAckRegistry.js` - ACK/idempotencia
- `app/infra/CrozzoLanSyncBridge.js` / `app/infra/CrozzoLanOpsSync.js` - Tramo LAN
- `app/infra/CrozzoLanActionDedup.js` - Deduplicación
- `app/infra/CrozzoCloudSyncPriorities.js` - Zonas/prioridades
- `app/infra/CrozzoConnectivityOrchestrator.js` / `CrozzoConnectivityDirector.js` - Solo ajustes MÍNIMOS con evidencia
- `app/modules/CrozzoPosRuntimeCloud.js` / `app/modules/CrozzoComandasCloudSync.js` - Respetar `skipCartReconcile`, merge LWW
- `app/core/CrozzoPosMain.js` - Solo EXTRACCIÓN si 100% seguro, nunca borrar
- Auth/Security, Costeo cascade, Fiscal - Intangibles

---

## 4. PLAN DE ACCIÓN PROPUESTO (POR FASES - SOLO TRAS APROBACIÓN)

### FASE A: ESTABILIZAR HÍBRIDO (PRIORIDAD 0) - IMPACTO ALTO, RIESGO BAJO-MEDIO
| ID | Acción | Archivos | Riesgo | Mitigante | Verificación |
|---|---|---|---|---|---|
| A1 | **Trazado flap runtime** - Añadir logging estructurado (solo debug) para transiciones de transporte | Orchestrator | BAJO | Solo console.debug, desactivable, sin cambiar lógica | Ver logs, sin cambios funcionales |
| A2 | **Consolidar heartbeats** - Evitar heartbeats duplicados entre módulos | Orchestrator/LanOpsSync | BAJO-MEDIO | Revisar dependencias, mantener intervalos existentes o unificar con flags | Sin pérdida de presencia/failover |
| A3 | **Afinar hold cloud->lan** - Revisar cooldowns para reducir flap innecesario | ConnectivityOrchestrator | MEDIO | **SOLO AJUSTES NUMÉRICOS** tras evidencia. Respetar lógica anti-flap existente | Probar transición nube<->LAN, verificar ACKs |

### FASE B: DOMAR TIMERS/POLLS (PRIORIDAD 0) - IMPACTO ALTO, RIESGO BAJO
| ID | Acción | Archivos | Riesgo | Mitigante | Verificación |
|---|---|---|---|---|---|
| B1 | **Visibility-aware** - Pausar polls cuando `document.hidden` | LanOpsSync, RuntimeCloud, ComandasCloudSync | BAJO | Reactivar al volver a foco/visible. Mantener heartbeats críticos si necesarios | App oculta no genera tráfico innecesario |
| B2 | **Jitter en polls** - Añadir pequeño jitter (±10-15%) | Mismos | BAJO | Evita sincronización masiva | Menor solapamiento, misma funcionalidad |
| B3 | **Backoff inteligente** - Backoff en errores/red | Mismos | BAJO | Reset en éxito. No afectar path normal | Más resiliente sin ralentizar normal |
| B4 | **Limpiar huérfanos** - Auditar clearInterval/clearTimeout en navegación/logout | PosMain | BAJO-MEDIO | Buscar y limpiar donde falte. No tocar timers críticos vivos | Sin leaks evidentes |

### FASE C: PULIR FLUIDEZ (PRIORIDAD 1) - IMPACTO MEDIO-ALTO, RIESGO BAJO
| ID | Acción | Archivos | Riesgo | Mitigante | Verificación |
|---|---|---|---|---|---|
| C1 | **Reducir globals innecesarios** - Identificar candidatos seguros | Varios | BAJO | Solo lectura+propuesta primero. Nunca borrar APIs usadas | Grep exhaustivo antes |
| C2 | **Debounce solapados** - Evitar ejecuciones concurrentes | LanOpsSync/RuntimeCloud | BAJO | Flags in-flight existentes donde aplique | Sin perder updates |
| C3 | **Lazy fine-tuning** - Ver si hay algo eager no crítico | index.html/LazyModules | MEDIO | Validar con mapa boot. Test navegación completa | Boot más ágil, todo carga bien |

### FASE D: VALIDACIÓN Y ENDURECIMIENTO (PRIORIDAD 1)
| ID | Acción | Archivos | Riesgo | Mitigante | Verificación |
|---|---|---|---|---|---|
| D1 | **Jornada caos validación** | N/A | BAJO | Correr tras cambios | Sin errores fatales |
| D2 | **Sync clinical** | N/A | BAJO | Obligatorio | `npm run test:sync-clinical` PASS |
| D3 | **Map refresh** | N/A | BAJO | Obligatorio tras cada cambio | `npm run map:refresh` OK |

---

## 5. MÉTRICAS DE ÉXITO

| Métrica | Actual | Objetivo | Cómo medir |
|---------|--------|----------|------------|
| **Flap transportes** | Desconocido (sospechoso) | < 2-3 cambios/hora en operación normal | Logs Orchestrator |
| **Timers activos simultáneos** | ~214 | Reducir solapamiento 15-25% | Conteo + observación |
| **Sensación híbrida** | "A veces traba" | "Instantáneo, predecible" | Test real caja<->tablet |
| **Errores fatales caos** | 0 | 0 (mantener) | Jornada caos |
| **Sync clinical** | TBD | PASS | Automatizado |

---

## 6. ORDEN DE EJECUCIÓN (SI SE APRUEBA)

**ORDEN ESTRICTO: B1 → A1 → B2 → B3 → A2 → D2 → A3 (solo si evidencia) → resto**

- **Paso 1:** B1 Visibility-aware (bajo riesgo, alto impacto percibido)
- **Paso 2:** A1 Trazado para confirmar hipotesis flap
- **Paso 3:** B2+B3 Jitter/backoff
- **Paso 4:** A2 Consolidar heartbeats con evidencia
- **Paso 5:** Validar con test:sync-clinical
- **Paso 6:** A3 Solo si trazado muestra flap excesivo

**NUNCA** tocar A3 sin datos concretos del trazado A1.

---

## 7. CRITERIOS DE APROBACIÓN

Para ejecutar CADA cambio:
1. ✅ Plan específico mostrado con archivos/líneas/razón
2. ✅ Riesgo + mitigante claros
3. ✅ Respeta zonas intangibles
4. ✅ `edit:scope` si archivo crítico
5. ✅ Ejecutar cambio mínimo
6. ✅ `npm run sync` (obligatorio)
7. ✅ `npm run map:refresh`
8. ✅ `npm run test:sync-clinical`
9. ✅ Validar funcionalidad afectada
10. ✅ Solo pasar al siguiente si TODO OK

**SI FALLA CUALQUIER PASO → DETENER, REVERTIR SI NECESARIO, EXPLICAR.**

---

## ESTADO ACTUAL

- [x] Investigación masiva completada
- [x] Agentes forenses desplegados y alimentados
- [x] Bucle retroalimentación activo
- [x] Plan maestro consolidado
- [ ] **ESPERANDO APROBACIÓN EXPLÍCITA PARA EJECUTAR**

**RESPONDA:** `APROBAR FASE A+B` o indique qué fases desea ejecutar. Sin aprobación, NO se realizará ningún cambio.