# POS Crozzo — Plan Reforzado V2 (Análisis de desempeño del Plan V1)

**Fecha:** 2026-11-11
**Base:** `docs/POS-MAESTRO-ANALISIS-PLAN.md` (Plan V1)
**Veredicto sobre V1:** **MÁS O MENOS** — buena estructura y diagnóstico, pero le faltan fundamentos (observabilidad, métricas, migración, rollback, priorización por ROI, definition of done). No se descarta; se refuerza y reordena.
**Validación del escuadrón:** `docs/POS-VALIDACION-ESCUDRON.md` — veredicto consolidado: APROBADO CON MODIFICACIONES CRÍTICAS. Requiere Fase -2 (toolchain/congelación/CI/hardening) antes de Fase -1.

---

## 1. Análisis crítico del Plan V1

### 1.1 Fortalezas
- Diagnóstico real y específico (líneas, funciones, riesgos concretos).
- Orden lógico macro: estabilización → durabilidad → robustez → calidad → innovación.
- Incluye verificación (`_reversion-inventario-check.mjs`).
- Reconoce la deuda técnica (duplicación app/src, RLS, localStorage).

### 1.2 Debilidades detectadas (con evidencia)

| # | Debilidad | Evidencia en V1 | Impacto |
|---|-----------|-----------------|---------|
| D1 | **Sin línea base ni KPIs medibles.** "0 duplicados" es aspiracional; no hay instrumentación para medirlo. | §13 lista métricas sin forma de obtenerlas. | No se puede validar ninguna fase. |
| D2 | **Fase 0 mezcla micro-fixes y cambios críticos sin priorización por ROI.** | `crozzoInvRegistrarMovimiento` (cosmético) junto a propagación CUFE (crítico). | Esfuerzo mal invertido. |
| D3 | **Sin plan de migración de datos.** Cambiar localStorage→SQLite en producción con datos reales no tiene estrategia. | §11 Fase 1 dice "migrar persistencia" sin detalle. | Riesgo de pérdida de datos en producción. |
| D4 | **Sin rollback / feature flags.** | No mencionado. | Un cambio roto no se puede revertir rápido. |
| D5 | **Fase 4 (innovación) prematura.** CRDTs/KDS antes de durabilidad y consistencia. | §11 Fase 4. | Carreta antes del caballo; desperdicio. |
| D6 | **Sin definition of done ni criterios de aceptación.** | Tareas como checkboxes sin criterio. | Ambigüedad de "terminado". |
| D7 | **Sin análisis de dependencias ni blast radius.** | RLS `using (true)`→por business_id puede romper tablets legacy. | Cambios que rompen producción. |
| D8 | **Sin plan de pruebas automatizadas/CI.** | Solo checks manuales `node scripts/_*.mjs`. | Regresiones no detectadas. |
| D9 | **Observabilidad no es Fase 0.** | Observabilidad está en Fase 3. | Sin métricas, no se puede validar Fase 0/1/2. |
| D10 | **Sin estrategia UX offline.** | No se define qué ve el usuario offline. | Mala experiencia, soporte costoso. |
| D11 | **Sin plan de contingencia operativa** (caja dañada, backup/restauración). | No mencionado. | Riesgo operativo alto. |
| D12 | **Sin consideración de multi-sede a fondo.** | `business_id` existe pero races por sede. | Inconsistencias entre sedes. |
| D13 | **Fase 0 incluye micro-fixes que no atacan causa raíz.** | "Normalizar tipos en dedup" en vez de idempotencia por entidad. | Parches que no escalan. |
| D14 | **No hay estimación de esfuerzo ni capacidad del equipo.** | No mencionado. | Plan irrealizable. |

### 1.3 Decisiones técnicas del V1 a revisar

| Decisión V1 | Análisis | Recomendación V2 |
|-------------|----------|------------------|
| SQLite como reemplazo de localStorage | Riesgoso en producción; migración abrupta. | **Dual-write**: SQLite autoritativo + localStorage cache, con migración gradual y verificación. |
| Vector clocks | Overkill para POS (mesas/carritos). | **Versión monotónica por entidad** (counter + origin device) para LWW simple. |
| CRDTs (Fase 4) | Overkill; merge manual por campos es suficiente y más controlable. | Condicionar CRDTs a casos específicos (inventario multi-sede). Eliminar de roadmap por defecto. |
| Outbox persistente para runtime | Correcto y necesario. | Mantener, pero como parte de Fase 2 con dependencia de SQLite (Fase 1). |
| RLS por business_id | Correcto pero con blast radius. | Implementar con **modo compatibilidad** (permitir legacy tokens) y migración gradual de tablets. |

### 1.4 Veredicto

El Plan V1 es **"MÁS O MENOS"**: el diagnóstico es sólido, la estructura macro es correcta, pero le faltan fundamentos de ingeniería (observabilidad, métricas, migración, rollback, priorización, DoD). **No se descarta; se refuerza y reordena.** La Fase 4 de innovación se condiciona y se elimina CRDTs por defecto.

---

## 2. Plan Reforzado V2

### Principios rectores
1. **Observabilidad primero** — no se puede mejorar lo que no se mide.
2. **Migración gradual, nunca abrupta** — dual-write, feature flags, rollback.
3. **Priorización por ROI** — impacto fiscal/operativo alto primero.
4. **Definition of Done explícita** por tarea.
5. **Blast radius controlado** — cambios con modo compatibilidad.

### Fase -1 — Línea base y observabilidad (Semana 0, ANTES de cualquier cambio)

**Objetivo:** tener métricas y logging para validar todas las fases posteriores.

**Tareas:**
- [ ] Instrumentar `CrozzoComunicacionDiag` con métricas estructuradas: latencia por canal, tasa de éxito, duplicados detectados, tamaño de outbox, edad del ítem más viejo en cola.
- [ ] Agregar contadores en `syncOfflineQueue`: procesados/ok/fallidos/reintentados por ciclo.
- [ ] Agregar contador de duplicados en `OperationalIngest` (TID seen que llega repetido).
- [ ] Log estructurado (JSON) de impresión: job id, impresora, duración, error, backend.
- [ ] Dashboard mínimo (página interna o consola) mostrando: outbox size, edad, duplicados 24h, tasa de éxito sync, facturas pendiente_fiscal.
- [ ] Definir **línea base** (snapshot de métricas actuales) para comparar.

**DoD:** Dashboard muestra métricas en tiempo real; línea base documentada en `docs/POS-BASELINE.md`.

**KPIs:** N/A (esta fase crea los KPIs).

---

### Fase 0 — Estabilización crítica (Semanas 1-2)

**Objetivo:** corregir los defectos de mayor impacto fiscal/operativo con bajo riesgo.

**Prioridad por ROI (orden de ejecución):**

| # | Tarea | Impacto | Esfuerzo | Dependencia |
|---|-------|---------|----------|-------------|
| 0.1 | Propagar CUFE a `config.facturas` en drenaje (outbox fiscal + contingencia) | Alto fiscal | Medio | -1 |
| 0.2 | Numeración: no incrementar consecutivo si timbrado falla; marcar como "anulado" con auditoría | Alto fiscal | Medio | -1 |
| 0.3 | Normalizar tipos en dedup de outbox (`String(consecutivo)`) | Medio | Bajo | - |
| 0.4 | Validar permiso `comandar` explícito en `comandarDesdeCaja` | Medio operativo | Bajo | - |
| 0.5 | Agregar permiso granular `anular_venta` y verificar en `puedeAnular()` | Medio | Bajo | - |
| 0.6 | Implementar `crozzoInvRegistrarMovimiento` (alias a Reservorio) para auditoría retail | Medio | Bajo | - |
| 0.7 | Registrar faltantes de stock cuando `cur < qty` | Bajo | Bajo | - |
| 0.8 | `canGoLive()` exigir `prov.type==='dataico'` + credenciales + certificado vigente | Medio fiscal | Bajo | - |

**DoD por tarea:** check automatizado PASS + métrica de la Fase -1 no empeora + revisión de código.

**KPIs de salida:**
- Facturas `pendiente_fiscal` sin CUFE tras drenaje: **0**.
- Consecutivos con huecos por fallo de timbrado: **0**.
- Duplicados de comandas (medido): **reducción ≥50% vs línea base**.

---

### Fase 1 — Durabilidad fiscal (Semanas 3-6)

**Objetivo:** garantizar retención fiscal 5 años y persistencia durable.

**Tareas:**
- [ ] **Dual-write SQLite**: implementar comandos Tauri (`crozzo_fiscal_save_sqlite`, `crozzo_fiscal_load_sqlite`) para facturas/outbox/config. SQLite como autoritativo, localStorage como cache.
- [ ] **Migración gradual**: al arrancar, si SQLite vacío, importar desde localStorage; verificar integridad (count + hash); marcar `migrated=true` en meta. No borrar localStorage hasta verificar.
- [ ] **Rollback**: feature flag `useSqliteFiscal`; si falla, caer a localStorage.
- [ ] **Retención 5 años**: archivado durable en SQLite con partición por mes; exportación JSON.
- [ ] **Bloquear emisión FE** si falta email del adquiriente (readiness).
- [ ] **Separar permisos** `facturar_pos` vs `facturar_electronica`.
- [ ] **Hash SHA-256 encadenado** para auditoría (reemplazar djb2).
- [ ] **Enviar eventos significativos pendientes** al recuperar PT.

**DoD:** Facturas persisten tras limpiar localStorage (test); migración verificada con hash; rollback funcional.

**KPIs de salida:**
- 0 pérdida de facturas tras limpieza de navegador (test).
- Retención 5 años verificable (SQLite).
- Auditoría con hash encadenado verificable.

---

### Fase 2 — Robustez multi-dispositivo y offline (Semanas 7-12)

**Objetivo:** eliminar duplicados, pérdida de estado y conflictos en multi-dispositivo.

**Dependencias:** Fase 1 (SQLite) completada.

**Tareas:**
- [ ] **Outbox persistente para runtime**: cola SQLite de pushes de mesas/carritos con reintentos y merge (como comandas).
- [ ] **Persistir dedup** en IndexedDB: TID seen, ACKs, slot sigs (sobrevivir recargas).
- [ ] **Versiones monotónicas por entidad**: reemplazar `Date.now()` por counter + origin device para LWW. (No vector clocks; más simple y suficiente.)
- [ ] **Idempotencia por entidad**: clave estable `business_id + tabla + local_id` con `upsert` en cola global.
- [ ] **Reconciliación con ack**: marcar entradas del reservorio como `ok` solo tras confirmación cloud; si falla, revertir a `pendiente` con backoff.
- [ ] **Backoff exponencial + dead-letter** en sync y outbox fiscal.
- [ ] **Drenaje fiscal por lotes más grandes** con throttling y monitoreo SLA.
- [ ] **RLS por business_id** con modo compatibilidad (permitir legacy tokens) y migración gradual de tablets.
- [ ] **Failover de ancla LAN**: permitir degradación a cloud sin bloquear escrituras.
- [ ] **Eliminar duplicación app/src/bundles** con build automatizado + verificación en CI.

**DoD:** Test de caos (corte WAN/LAN, recarga, multi-dispositivo) sin pérdida ni duplicados; métricas de Fase -1 mejoran vs línea base.

**KPIs de salida:**
- Duplicados de comandas: **0** en test de caos.
- Pérdida de estado de mesas: **0** en test de caos.
- Tasa de éxito sync: **≥99%**.
- Outbox edad máxima: **<5 min** en operación normal.

---

### Fase 3 — Calidad, UX y observabilidad (Semanas 13-16)

**Objetivo:** experiencia de usuario, diagnóstico y pruebas automatizadas.

**Tareas:**
- [ ] **Observabilidad**: métricas por canal, alertas de outbox, SLA fiscal, logs estructurados de impresión.
- [ ] **QR local** (librería cliente) en lugar de `api.qrserver.com`.
- [ ] **Centralizar dedup de comandas** en backend/cloud por `transaction_id`.
- [ ] **Tests E2E** con emulador de impresora térmica.
- [ ] **Tests de reconexión** automatizados (corte WAN/LAN, cuota excedida, doble clic, conflicto concurrente).
- [ ] **Control de concurrencia multi-terminal** (bloqueo por producto/versión o sync inmediata post-venta).
- [ ] **Auto-cierre de turno** sin diff 0 asumido; alertar.
- [ ] **Nota crédito DIAN** o deshabilitar anulación en modo FE.
- [ ] **UX offline**: indicador visible de estado de conexión y cola pendiente; reintento manual.
- [ ] **Plan de contingencia operativa**: backup/restauración de datos, procedimiento de caja dañada.
- [ ] **Migraciones de permisos idempotentes** + auditoría de cambios.

**DoD:** Suite de tests automatizados en CI; dashboard de observabilidad operativo; UX offline documentada.

**KPIs de salida:**
- Cobertura de tests automatizados: **≥60%** de flujos críticos.
- Tiempo medio de detección de fallo: **<5 min** (alertas).
- 0 anulaciones en modo FE sin nota crédito (o deshabilitado).

---

### Fase 4 — Innovación (CONDICIONAL, solo si Fases 1-3 estables y medidas)

**Condición de entrada:** Fases 1-3 completadas con KPIs cumplidos durante ≥4 semanas.

**Tareas condicionales:**
- [ ] **KDS** con lanes por estación, batching de platos iguales, waiter routing, timing.
- [ ] **Failover de ancla** y alta disponibilidad.
- [ ] **IA para insights** sobre facturas/comandas (ya existe `CrozzoAiInsights`).
- [ ] **CRDTs solo para inventario multi-sede** (si merge manual resulta insuficiente).

**Eliminado del roadmap por defecto:** CRDTs generalizados, vector clocks, reescritura completa de sync.

---

## 3. Análisis de dependencias

```
Fase -1 (observabilidad)
    ↓
Fase 0 (estabilización crítica) — depende de métricas de -1
    ↓
Fase 1 (durabilidad fiscal) — depende de 0 (CUFE/numeración estables)
    ↓
Fase 2 (robustez multi-dispositivo) — depende de 1 (SQLite)
    ↓
Fase 3 (calidad/UX/tests) — depende de 2 (estabilidad)
    ↓
Fase 4 (innovación) — condicional a 3
```

**Dependencias internas clave:**
- Outbox runtime (2) → SQLite (1).
- Idempotencia por entidad (2) → dedup persistente (2) → SQLite (1).
- RLS por business_id (2) → migración gradual de tablets (2).
- Tests E2E (3) → estabilidad de 2.

---

## 4. Blast radius y mitigación

| Cambio | Blast radius | Mitigación |
|--------|--------------|------------|
| SQLite dual-write | Alto (toda la app) | Feature flag + fallback a localStorage + migración verificada |
| RLS por business_id | Alto (tablets legacy) | Modo compatibilidad + migración gradual |
| Permisos granulares | Medio (usuarios) | Migración automática v10 + auditoría |
| Numeración (no incrementar si falla) | Medio (facturación) | Marcar como anulado con auditoría, no perder número |
| Dedup persistente | Bajo | Solo agrega, no cambia flujo existente |

---

## 5. Estimación de esfuerzo (1 dev full-time)

| Fase | Semanas | Esfuerzo |
|------|---------|----------|
| -1 | 1 | 40h |
| 0 | 2 | 80h |
| 1 | 4 | 160h |
| 2 | 6 | 240h |
| 3 | 4 | 160h |
| 4 | 4+ | 160h+ |
| **Total (sin Fase 4)** | **17 semanas** | **~680h** |

---

## 6. Definition of Done (global)

Una fase se considera completa cuando:
1. Todas las tareas tienen check automatizado PASS.
2. KPIs de salida cumplidos durante ≥2 semanas en operación real.
3. No hay regresión en checks existentes.
4. Documentación actualizada.
5. Rollback probado (simulación de fallo + recuperación).

---

## 7. Comparación V1 vs V2

| Aspecto | V1 | V2 |
|---------|----|----|
| Observabilidad | Fase 3 | Fase -1 (primero) |
| SQLite | Reemplazo abrupto | Dual-write gradual |
| Vector clocks | Propuesto | Reemplazado por versiones monotónicas |
| CRDTs | Fase 4 | Condicional, solo inventario multi-sede |
| Priorización | Por área | Por ROI |
| Definition of Done | No | Sí, por tarea y global |
| Dependencias | No | Sí, con diagrama |
| Blast radius | No | Sí, con mitigación |
| Estimación | No | Sí (~680h sin Fase 4) |
| UX offline | No | Sí (Fase 3) |
| Contingencia operativa | No | Sí (Fase 3) |
| Migración de datos | No | Sí (dual-write + verificación) |
| Rollback | No | Sí (feature flags) |

---

## 8. Veredicto final

**El Plan V1 era "MÁS O MENOS". El Plan V2 es "SÍ, reforzado".**

Cambios clave que lo hacen superior:
1. Observabilidad antes que cualquier cambio (sin métricas no se valida nada).
2. Migración gradual con dual-write y rollback (sin riesgo de pérdida).
3. Priorización por ROI (impacto fiscal primero).
4. Dependencias y blast radius explícitos.
5. Definition of Done y KPIs medibles.
6. Innovación condicionada, sin over-engineering (sin CRDTs/vector clocks por defecto).

**Recomendación:** Ejecutar Fase -1 inmediatamente. No tocar código de producción hasta tener línea base y métricas.

---

*Documento generado por el agente de análisis POS. Complementa `docs/POS-MAESTRO-ANALISIS-PLAN.md` (Plan V1).*
