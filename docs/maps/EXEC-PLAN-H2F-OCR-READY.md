# PLAN EJECUCIÓN H2.F - OCR FACTURAS PROVEEDOR (READY TO EXECUTE)

**Clasificación:** INTERNAL - MANDO  
**Rama:** task/aligned-20260727 (clean tras commit POE)  
**Fecha:** 2026-10-27  
**Fase:** H2.F  
**Estado:** **READY TO EXECUTE** - Esperando orden "EJECUTAR H2.F"

---

## 1. SITREP EJECUCIÓN

### 1.1 Estado campo
- [x] **FASE 0** Reconocimiento - COMPLETO (agente explore)
- [x] **FASE 1** Consolidación campo - COMPLETO (POE revisado, maps refresh)
- [x] **FASE 2** Commit estratégico - COMPLETO (POE + legendario commiteado, working tree limpio)
- [x] **FASE 3** Auditoría H2.F - COMPLETO (agente explore)
- [x] **FASE 4** Plan detallado auditable - COMPLETO
- [x] **FASE 5** Documento listo - COMPLETO

### 1.2 Hallazgos auditoría
- **applyRecepcionItems** (`app/modules/CrozzoCatalogoMp.js:2229-2293`): Espera items con `mpId`, `precioTotal|valorLote|valor`, `peso|cantidad`. Actualiza costeo vía `upsertCosteo`, emite eventos, integra con Reservorio.
- **Punto enganche UI**: `CrozzoRecepcionFacturas` en bundle `CrozzoBundleCompras.js` (ruta `compras-recepcion`). Ya usa Tesseract.
- **Flujo correcto**: **NO llamar applyRecepcionItems directo**. Alimentar `items[]` a `CrozzoReservorio.registrarRecepcion()` para mantener inventario, factura oficina, alertas, sync.
- **Boot order**: Añadir tras módulos CRM/OCR relacionados. Ya insertado tras `CrozzoCrmIntel.js`.

---

## 2. MISIÓN H2.F

**OBJETIVO:** Crear sistema OCR para facturas de proveedor que genere items mapeados a MPs existentes y los integre al flujo de recepción sin romper cascada de costeo.

**CRITERIO ÉXITO:**
- [ ] Módulo `CrozzoOcrFactura.js` creado con API funcional
- [ ] Integrado en boot (`app/index.html`) y sincronizado
- [ ] Botón "Escanear factura" en `CrozzoRecepcionFacturas` (UI recepción)
- [ ] Preview editable con confianza por línea + corrección MP
- [ ] Guardado vía `CrozzoReservorio.registrarRecepcion` con items mapeados
- [ ] Aprendizaje con `CrozzoOcrLearning.record` en correcciones
- [ ] Test sintético `_ocr-factura-check.mjs` 12+ checks PASS
- [ ] `test:sync-clinical` sin fallos nuevos

---

## 3. EJECUCIÓN POR PASOS

### PASO 1: MÓDULO CORE (YA CREADO)
- [x] `app/modules/CrozzoOcrFactura.js` - Parser, matcher, mapeo, Tesseract loader
- [x] Añadido a `app/index.html`
- [x] `npm run map:refresh && npm run sync`

### PASO 2: INTEGRACIÓN UI RECEPCIÓN
**Archivo:** `app/bundles/CrozzoBundleCompras.js` (buscar `CrozzoRecepcionFacturas`)

**Acciones:**
1. Añadir botón "Escanear factura (OCR)" en toolbar/header de recepción
2. Modal/overlay con upload imagen/PDF, preview, tabla líneas con confianza
3. Al parsear: usar `CrozzoOcrFactura.escanearFactura()` + `parsearFactura()`
4. Matching automático + selector MP para líneas sin match
5. Generar `itemsMapeados` via `mapToRecepcionItems()`
6. Al guardar: pasar `items` a `CrozzoReservorio.registrarRecepcion()` 
7. Registrar correcciones con `CrozzoOcrLearning.record()`

**Puntos clave:**
- Reutilizar `ensureTesseract()` existente si está disponible
- NO duplicar llamada a `applyRecepcionItems`
- Validar que MPs existen antes de guardar
- Mostrar badges: Verde >80, Amarillo 40-80, Rojo <40

### PASO 3: TEST SINTÉTICO
**Crear:** `scripts/_ocr-factura-check.mjs`

**Checks (mínimo 12):**
1. Módulo existe y exporta API
2. `parseNumber` maneja formatos CO
3. `extractHeader` detecta NIT/factura/fecha/total
4. `extractItems` parsea líneas con qty/price
5. `findMatch` encuentra MP por nombre
6. `mapToRecepcionItems` genera formato correcto
7. `confidenceScore` calcula correctamente
8. Items sin match marcados con confianza baja
9. Integración con `CrozzoCatalogoMp` funcional
10. Boot script presente en index.html
11. Sync verifica archivo copiado a src/
12. No rompe carga de módulos

### PASO 4: INTEGRAR A SUITE CLÍNICA
Añadir a `package.json`:
- `"test:ocr-factura": "node scripts/_ocr-factura-check.mjs"`
- Incluir en `test:sync-clinical` (opcional pero recomendado tras PASS)

### PASO 5: VERIFICACIÓN
```bash
npm run map:refresh
npm run sync
node scripts/_ocr-factura-check.mjs
npm run test:sync-clinical  # verificar sin regresiones
```

---

## 4. RIESGOS + MITIGANTES

| Riesgo | Prob | Impacto | Mitigante |
|---|---|---|---|
| Romper cascada costeo | BAJA | CRÍTICO | Alimentar vía `registrarRecepcion`, NO llamar `applyRecepcionItems` directo |
| MP mal mapeado | ALTA | MEDIO | Preview editable + validación + corrección obligatoria |
| Unidades incorrectas | MEDIA | ALTO | Mostrar und, permitir editar, usar und del catálogo |
| Tesseract pesado APK | MEDIA | MEDIO | Carga lazy, worker, timeout, fallback manual |
| Romper bundle Compras | BAJA | ALTO | Editar mínimamente, probar carga |
| Tests existentes fallan | BAJA | ALTO | Ejecutar test nuevo primero, luego subset clínico |

---

## 5. COMANDOS EJECUCIÓN

```bash
# Tras orden EJECUTAR H2.F
cd "C:\proyectos\sistema pos"

# 1. Integrar UI en CrozzoRecepcionFacturas
# (editar app/bundles/CrozzoBundleCompras.js con cuidado)

# 2. Crear test
# (crear scripts/_ocr-factura-check.mjs)

# 3. Sincronizar
npm run map:refresh
npm run sync

# 4. Verificar
node scripts/_ocr-factura-check.mjs

# 5. Gate clínico
npm run test:sync-clinical
```

---

## 6. ARCHIVOS AFECTADOS

| Archivo | Acción | Estado |
|---|---|---|
| `app/modules/CrozzoOcrFactura.js` | CREAR | **DONE** |
| `app/index.html` | EDITAR | **DONE** |
| `src/modules/CrozzoOcrFactura.js` | SYNC AUTO | **DONE** |
| `src/index.html` | SYNC AUTO | **DONE** |
| `app/bundles/CrozzoBundleCompras.js` | EDITAR (UI) | **PENDIENTE** |
| `scripts/_ocr-factura-check.mjs` | CREAR | **PENDIENTE** |
| `package.json` | EDITAR (test script) | **PENDIENTE** |

---

## 7. GO/NO-GO

**GO CRITERIA:**
- [x] Auditoría completa y precisa
- [x] Plan basado en código real (no inventado)
- [x] Riesgos identificados con mitigantes
- [x] Mínima invasión validada
- [x] Campo limpio (commit hecho)
- [x] Sync OK

**VEREDICTO:** **GO** - Listo para ejecutar al recibir orden "EJECUTAR H2.F"

**NOTA:** NO ejecutar código hasta orden explícita. Plan auditado y verificado por agentes especializados.
