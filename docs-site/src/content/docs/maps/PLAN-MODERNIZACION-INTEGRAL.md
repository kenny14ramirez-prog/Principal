---
title: "PLAN MODERNIZACION INTEGRAL"
---

# PLAN — MODERNIZACIÓN INTEGRAL (documentos + plantillas + IA local)

**Clasificación:** Interna — agentes y generales.
**Estado:** Plan (pendiente de aprobación de AM-1).
**Autoridad:** G7 DOCTRINA + G4 SEC/FISC + G1 INTEL + AM-1.

## 0. Contexto (investigación completada)

El sistema **ya tiene** infraestructura moderna y personalizable:
- **11 presets** de estilo térmico (`bona`, `clasico`, `profesional`, `elegante`, `economizador`, `economizador-elegante`, `moderno`, `detallado`, `retail`, `restaurante`, `express`) en `CrozzoPrintPresets.js`.
- **7 tipos de documento**: factura, precuenta, ticket, bodega, bodega_entrada, salon, inventario (`CrozzoPrintStudioHub.js`).
- **Editor visual** ( Diseñador de tickets) con `postMessage` bidireccional.
- **Personalización por documento y global** (`termicaPlantillas`, `termicaModos`, `termicaPresets`, `termicaDocCustom`, `termicaEstiloGlobalId`, `printOutputs` roll_58/roll_80/carta/oficio).
- **Asistente de conexión de impresoras** (`CrozzoPrinterRescue.js`): 44 marcas, detección de phantom, generación de script PowerShell para puerto LAN, prueba de impresión.
- **Auditoría IA** (NVIDIA) en cierre/reportes + vista previa local robusta (`CrozzoAiInsights.js`).
- **IA local (Ollama)** ya usada en QyC (visión `qwen2.5vl:3b` para facturas de materia prima).

**Problema:** los generadores de documentos (comandas, cierre, remisiones, inventario, facturas térmicas, QyC) tienen estilos **inconsistentes** (algunos modernos, otros "recibo clásico"). La marca "Bona Origen" ya se aplicó a strings visibles, pero el diseño de documentos no está unificado.

## 1. Objetivo

Unificar la identidad visual de **todos** los documentos generados bajo un sistema de diseño moderno (DOC-0 ya creado), manteniendo:
- Personalización por plantilla (11 presets + editor visual).
- Compatibilidad con impresoras (ESC/POS genérico + HTML/CUPS/WinAPI).
- IA local **opcional** para análisis de cierres (con fallback a vista previa local).

## 2. Alcance (3 bloques)

### Bloque A — Modernización de documentos (DOC-1 a DOC-6)
Ya planificado en `docs/maps/PLAN-MODERNIZACION-DOCUMENTOS.md`. Resumen:
- DOC-0 ✅ (fundación: `CrozzoDocDesign.js` creado).
- DOC-1: migrar térmicos (comandas, pedidos internos, inventario) al render premium.
- DOC-2: migrar hojas A4/Legal (factura, cotización, remisión, cierre, inventario).
- DOC-3: migrar reportes jsPDF a HTML+CSS.
- DOC-4: branding consistente (logo, footer, QR/CUFE).
- DOC-5: centralizar generación (`CrozzoDocumentTemplates.js`).
- DOC-6: consolidar bundles + verificar.

### Bloque B — Reforzar plantillas y compatibilidad de impresoras
- **B-1:** Verificar que los 11 presets generen HTML válido para los 7 tipos de documento.
- **B-2:** Asegurar que el editor visual (`Crozzo_POS_DisenadorTicket.html`) funcione con el nuevo sistema de diseño (DOC-0).
- **B-3:** Mejorar compatibilidad de impresoras:
  - Verificar ESC/POS en Epson, Star, Bixolon, Xprinter, Generic.
  - Añadir detección de protocolo (ESC/POS vs TSPL/ZPL) para impresoras de etiquetas (Zebra, TSC, Honeywell) — hoy solo ESC/POS/HTML.
  - Mejorar `CrozzoPrinterRescue` con test de impresión real (no solo "prueba" genérica).
- **B-4:** Añadir `@media print` correcto para hoja (page-break, márgenes).
- **B-5:** Verificar que cambiar modelo/estilo no rompa la impresión (test con 3 impresoras físicas).

### Bloque C — IA local para análisis de cierres y estados de cuenta (opcional, con fallback)
**Visión del mando:** una IA pequeña (1-2 GB), pensada para procesar texto, que ordene y cree resúmenes de estado de cuenta, revise los cierres y notifique si existe algo raro. No para decisiones fiscales — solo narrativa y alertas.

- **C-0:** Seleccionar modelo pequeño optimizado para texto en español: `qwen2.5:1.5b` (≈1 GB, rápido en CPU) o `qwen2.5:3b` (≈2 GB, mejor calidad). Evitar modelos de visión (más pesados) para este uso.
- **C-1:** Añadir comando Rust `crozzo_ollama_chat` (similar a `crozzo_nvidia_chat`) para evitar CORS/CSP y tener timeout controlado.
- **C-2:** En `CrozzoCierreTurnos.js` / `CrozzoAiInsights.js`, añadir capa IA local opcional:
  - Verificar Ollama disponible (`GET /api/tags`).
  - Verificar modelo instalado (`qwen2.5:1.5b` o `qwen2.5:3b`).
  - Si disponible: generar resumen de cierre (totales, anomalías, alertas de arqueo, por hora, por usuario) + resumen de estado de cuenta (ingresos, egresos, saldo, tendencias).
  - Si no disponible: degradar a vista previa local (`buildBehaviorPack`) — ya existe.
- **C-3:** Flag de habilitación (`aiLocalEnabled` en config) + UI en Super Admin con indicador de modelo instalado.
- **C-4:** Timeout controlado (30s para 1.5b, 60s para 3b). Rate limit local (max 10 análisis/hora).
- **C-5:** Prompt estructurado: enviar JSON compacto de métricas (no datos sensibles de clientes), recibir narrativa + lista de alertas.
- **C-6:** Notificación proactiva: si la IA detecta anomalía (diferencia de arqueo > umbral, voids excesivos, patrón inusual), mostrar alerta en el dashboard.
- **C-7:** Documentar en `AI-INSIGHTS.md` + runbook de instalación de Ollama + modelo.

## 3. Principios (no negociables)

1. **Fuente canónica:** editar `app/`, publicar con `npm run sync` → `src/`.
2. **Una tarea = un commit lógico** con ID de fase (`DOC-T##`, `PRINT-T##`, `AI-T##`).
3. **No mock en validación final.** Verificación con `test:sync-clinical` (44/44) + `connectivity` (111/111) + capturas.
4. **No romper fiscal:** datos (CUFE, totales, legal) no cambian; solo presentación.
5. **Sin dependencias nuevas** sin aprobación de AM (usar Ollama vía HTTP/Rust, no SDK).
6. **IA es opcional:** siempre degradar a vista previa local si Ollama no está disponible.
7. **No romper impresoras:** cambiar modelo/estilo no debe romper la impresión (test con 3 impresoras físicas).

## 4. Orden de ejecución

### Fase 1 — DOC-1 (térmicos) + B-1/B-2 (plantillas)
1. Migrar comandas, pedidos internos, inventario térmico al render premium (DOC-1).
2. Verificar 11 presets × 7 tipos de documento (B-1).
3. Verificar editor visual con nuevo sistema de diseño (B-2).
4. **Asuntos internos:** revisar cada cambio.

### Fase 2 — DOC-2 (hojas) + B-3/B-4 (compatibilidad)
1. Migrar factura, cotización, remisión, cierre, inventario (DOC-2).
2. Mejorar compatibilidad de impresoras (B-3).
3. `@media print` correcto (B-4).
4. **Asuntos internos:** revisar.

### Fase 3 — DOC-3 (PDFs) + DOC-4 (branding)
1. Migrar reportes jsPDF a HTML+CSS (DOC-3).
2. Branding consistente (DOC-4).
3. **Asuntos internos:** revisar.

### Fase 4 — Bloque C (IA local para cierres)
1. Comando Rust `crozzo_ollama_chat` (C-1).
2. Capa IA local en cierre (C-2) + flag + UI (C-3).
3. Timeout + rate limit (C-4, C-5).
4. Documentar (C-6).
5. **Asuntos internos:** revisar.

### Fase 5 — DOC-5/DOC-6 (centralizar + verificar)
1. `CrozzoDocumentTemplates.js` (DOC-5).
2. Consolidar bundles + verificar (DOC-6).
3. **Auditoría final.**

## 5. Riesgos

- **Fiscal:** datos no cambian; solo presentación. Validar con `_legalidad-fiscal-check.mjs`.
- **Impresión:** cambiar estilo no debe romper ESC/POS. Test con 3 impresoras físicas.
- **IA:** Ollama puede no estar disponible; siempre degradar a vista previa local.
- **Bundles:** regenerar tras cambios.
- **Tests:** `qa-personas-mision-cien.mjs` debe seguir pasando (15/2).

## 6. Estimación

- Bloque A (DOC-1 a DOC-6): ~3-4 semanas.
- Bloque B (plantillas + compatibilidad): ~1-2 semanas.
- Bloque C (IA local): ~1-2 semanas.
- **Total:** ~5-8 semanas.

## 7. Decisión requerida

AM-1 debe aprobar:
1. El sistema de diseño compartido (DOC-0, ya creado).
2. La migración de jsPDF a HTML+CSS (o mantener jsPDF con estilo mejorado).
3. El branding "Bona Origen" en todos los documentos.
4. La IA local para cierres (opcional, con fallback).
5. La mejora de compatibilidad de impresoras (ESC/POS vs TSPL/ZPL).

---

**Próximo paso sugerido:** aprobar Fase 1 (DOC-1 + B-1/B-2) y ejecutar con asuntos internos revisando paso a paso. ¿Autorizo?