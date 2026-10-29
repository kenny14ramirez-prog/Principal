# EMPRESA DE AGENTES AUTÓNOMOS - QA FACTORY

**Clasificación:** MANDO - DOCTRINA  
**Objetivo:** Crear una "fábrica" de agentes que actúen como trabajadores humanos, aprendan con el uso y validen aptitud para uso real.  
**Filosofía:** *"Un sistema no está listo hasta que un cajero novato pueda usarlo sin frustrarse."*

---

## 1. Principios

- **Human-First**: Solo interacción DOM. Clicks, fills, navegación. Nunca llamar APIs internas.
- **Curva de aprendizaje**: Novato → Aprendiz → Competente → Experto → Veterano
- **Memoria colectiva**: Lo que aprende un agente lo comparte con el resto vía Knowledge Base
- **Simulación temporal**: Poder ver evolución a 1 día, 8 días, 1 mes, 1 año, 2 años
- **Detección real**: Botones rotos, modales atascados, overlays bloqueantes, errores consola, flujos rotos
- **Sin experiencia inicial**: Primera ejecución = completo desconocimiento del sistema
- **Crítico con experiencia**: Con experiencia busca regresiones que un novato pasaría por alto

---

## 2. Roles y responsabilidades

| Rol | Personalidad | Enfoque |
|---|---|---|
| **CEO-QA** | Metódico, pragmático | Orquesta, prioriza P0, decide "¿Listo para sede?" |
| **CAJERO** | Rápido pero cuidadoso | Venta, cobro, vuelto, apertura/cierre |
| **MESERO** | Ágil, multitarea | Mesas, comandar, notas, modificar pedido |
| **COCINA** | Directo, eficiente | KDS, estados, entrega. Cuida integridad con caja |
| **ENCARGADO** | Supervisior | Arqueo, totales, validación, control |
| **RECEPCION** | Detallista | Compras/Recepción + OCR facturas proveedor |
| **UX-INSPECTOR** | Exigente con humano | Fricción, confusión, clicks, legibilidad |

---

## 3. Ciclo de aprendizaje

```text
EJECUCIÓN 1 (NOVATO) → Observa → Falla → Aprende → Guarda SOP
EJECUCIÓN 2-3 (APRENDIZ) → Recuerda errores → Intenta rutas probadas → Mejora
EJECUCIÓN 4+ (EXPERTO) → Va directo → Detecta regresiones → Más exigente
```

**Memoria por agente:**
- `knownRoutes`: Rutas que funcionaron
- `brokenSelectors`: Selectores que fallaron
- `successfulFlows`: Flujos completos exitosos
- `frictionLog`: Puntos de fricción
- `timeStats`: Tiempo por acción
- `mistakes`: Errores cometidos y cómo los resolvió

---

## 4. Frecuencias y presets

| Preset | Jornadas | Uso |
|---|---|---|
| `smoke` | 1 | Validación rápida post-cambio |
| `diario` | 1 (jornada real) | Monitoreo continuo |
| `8dias` | 8 | Prueba con curva de aprendizaje |
| `mensual` | 30 | Estabilidad con uso diario |
| `trimestral` | 90 | Detección de regresiones acumuladas |
| `anual` | 365 | Test de resistencia a largo plazo |
| `bienal` | 730 | Visión estratégica 2 años |

---

## 5. Reportes

**Por ejecución:** `agents/runs/YYYY-MM-DD/REPORTE-<PRESET>-<TIMESTAMP>.md`

**Timeline histórico:** `agents/runs/TIMELINE-HISTORICO.json`

**Scorecard humano:** `agents/runs/HUMAN-APTITUDE-SCORECARD.md`

Cada reporte incluye:
- **VEREDICTO:** APTO/NO APTO + Score 0-100
- **Por rol:** Resultados individuales con experiencia
- **Hallazgos P0/P1/P2:** Con evidencia, pasos, propuesta fix
- **Curva de aprendizaje:** Novato vs Experto comparación
- **Fricción humana:** ¿Difícil para humano real?
- **Recomendaciones:** Accionables

---

## 6. Comandos

```bash
# Inicializar fábrica
npm run qa:empresa:init

# Ejecutar preset
npm run qa:empresa:run -- --preset=smoke
npm run qa:empresa:run -- --preset=8dias
npm run qa:empresa:run -- --preset=mensual
npm run qa:empresa:run -- --preset=anual
npm run qa:empresa:run -- --preset=bienal

# Ver evolución
npm run qa:empresa:timeline
npm run qa:empresa:status
```

---

**MANDATO:** Actuar como empresa real. Criticar con honestidad. Si NO es apto para humano, decirlo claro con evidencia.
