# PLAN — MODERNIZACIÓN DE DOCUMENTOS (facturas, cotizaciones, costos, reportes, impresiones)

**Clasificación:** Interna — agentes y generales.
**Estado:** Plan (pendiente de aprobación de AM-1).
**Autoridad:** G7 DOCTRINA (docs) + G4 SEC/FISC (fiscal) + AM-1 (alcance).

## 1. Situación

Los documentos generados por el sistema tienen **estilos inconsistentes**: algunos modernos (Recetario, TermicaPremium, CostosReportesPdf) y otros con aspecto de "recibo de caja clásico" (comandas, cierre, remisiones, inventario, facturas térmicas, QyC). Fuentes genéricas (`Segoe UI`, `Consolas`, `helvetica`), paletas dispares, tablas básicas sin zebra, sin branding consistente, sin iconografía moderna.

## 2. Objetivo

Unificar la identidad visual de **todos** los documentos generados (impresos y PDF) bajo un sistema de diseño moderno, coherente con la marca **Bona Origen**, con branding, tipografía, colores y layout consistentes. Migrar los generadores "viejos" al render moderno existente.

## 3. Principios (no negociables)

1. **Fuente canónica:** editar `app/`, publicar con `npm run sync` → `src/`. No editar `src/` directo.
2. **Una tarea = un commit lógico** con ID de fase (`DOC-T##`).
3. **No mock en validación final.** Verificación con `test:sync-clinical` (44/44) + `connectivity` (111/111) + capturas en `docs/maps/ops/evidencia/`.
4. **No romper fiscal:** los comprobantes DIAN (CUFE, totales, legal) deben mantener exactitud de datos; solo cambia presentación.
5. **Bundles:** tras cambios en `modules/`, ejecutar `npm run consolidate` + `npm run sync`.
6. **Sin dependencias nuevas** sin aprobación de AM (usar fuentes via `@font-face`/Google Fonts ya disponibles).

## 4. Inventario de generadores (23 superficies)

### A. Modernos (referencia de estilo — NO tocar, solo unificar tokens)
| # | Archivo | Función | Estilo |
|---|---|---|---|
| 1 | `CrozzoRecetarioCocina.js` | `REC_PRINT_CSS` | Georgia gold, tarjetas con sombra |
| 2 | `CrozzoTermicaPremium.js` | `render` | GOLD/INK/PAPER, centrado |
| 3 | `CrozzoCostosReportesPdf.js` | `buildGeneralPdf`, `buildDetalladoPdf` | jsPDF helvetica + gold header |
| 4 | `CrozzoFlujosMapaPdf.js` | `PdfBuilder` | jsPDF diagrama |

### B. Viejos (migrar a moderno)
| # | Archivo | Función | Problema |
|---|---|---|---|
| 5 | `CrozzoPrintService.js` | `crozzoBuildComandaThermalHtml` | `<pre>` monoespaciado, sin branding |
| 6 | `CrozzoPrintService.js` | `crozzoFacturaBuildThermalHtmlBuiltin` | texto plano concatenado |
| 7 | `CrozzoPrintService.js` | `buildThermalPrintDocument` | genérico, sin branding |
| 8 | `CrozzoCierrePrint.js` | `cierrePrintStyles`, `cierreThermalStyles` | tablas `#bbb`, `.slip` borde grueso |
| 9 | `CrozzoCierrePrint.js` | `buildDiaReportHtml`, `buildHistorialPrintHtml` | tabla básica |
| 10 | `CrozzoFederacionEngine.js` | `FED_PRINT_CSS_THERMAL`, remisión normal | `th{background:#f3f4f6}`, h1 18px, sin logo |
| 11 | `CrozzoPedidosInternosEngine.js` | `buildPedidoPrintHtml` | Consolas, dashed, sin logo |
| 12 | `CrozzoSistemaCostos.js` | `INV_PRINT_CSS_THERMAL`, `buildInventarioPrintHtml` | Consolas, dashed |
| 13 | `CrozzoPosMain.js` | inventario productos (hoja) | `th{background:#f5f0e6}`, sin zebra |
| 14 | `CrozzoPosMain.js` | `crozzoBuildCotizacionSheetDocumentHtml` | slate, badge verde, sin logo |
| 15 | `CrozzoPosFacturasPage.js` | `crozzoBuildFacturaSheetDocumentHtml` | slate, badge azul, sin logo |
| 16 | `CrozzoQyC_App.html` | `generarCuentaCobro`, reportes jsPDF | jsPDF texto línea por línea |
| 17 | `CrozzoTermicaColombia.js` | lógica/legal térmica | sin branding |
| 18 | `CrozzoPrintStudioHub.js` | diseñador de plantillas | UI de diseño (no documento) |
| 19 | `CrozzoPrintPresets.js` | presets | configuración |
| 20 | `CrozzoPrintDeviceRegistry.js` | registro impresoras | no documento |
| 21 | `CrozzoPrinterRescue.js` | recuperación | no documento |
| 22 | `CrozzoCrmRegistroTemplate.js` | registro cliente (web) | ya moderno (Plus Jakarta Sans) |
| 23 | `Crozzo_POS_DisenadorTicket.html` | diseñador visual térmico | UI de diseño |

### C. Templates de impresión (HTML inline con estilo)
- `CrozzoPrintService.js`: `buildThermalPrintDocument`, `buildNormalPrintDocument`, `crozzoPrintHtmlDocument`, `crozzoExportHtmlToPdf`, `crozzoPrintFactura`, `crozzoPrintComanda`, `crozzoPrintTemplateHtml`, `crozzoPrintBatchLabelsHtml`, `crozzoPrintRollLabelsHtml`, `crozzoPrintTestTicket`, `crozzoPrintComandaThermalHtml`.

## 5. Plan de ejecución (fases)

### Fase DOC-0 — Sistema de diseño compartido (fundación)
**Archivos nuevos:**
- `app/core/CrozzoDocDesign.js` — tokens CSS + clases reutilizables (header, footer, tabla, totales, firma, QR, banner) + helpers JS (`docHeader`, `docFooter`, `docTable`, `docTotals`, `docSign`, `docQr`).

**Tokens:**
```css
:root {
  --doc-font: "Plus Jakarta Sans", "Inter", system-ui, sans-serif;
  --doc-font-mono: "JetBrains Mono", "Consolas", monospace;
  --doc-ink: #0f172a;
  --doc-muted: #64748b;
  --doc-accent: #0f766e;        /* teal Bona Origen */
  --doc-accent-light: #ccfbf1;
  --doc-gold: #c9a962;
  --doc-border: #e2e8f0;
  --doc-bg: #f8fafc;
  --doc-paper: #ffffff;
  --doc-radius: 8px;
  --doc-shadow: 0 1px 3px rgba(0,0,0,.08);
}
```

**Estilo térmico:**
```css
.doc-thermal { font-family: var(--doc-font-mono); font-size: 11px; width: 72mm; }
.doc-thermal .header { text-align: center; border-bottom: 1px dashed var(--doc-border); }
.doc-thermal .total { font-size: 14px; font-weight: 700; }
```

**Estilo hoja:**
```css
.doc-sheet { font-family: var(--doc-font); font-size: 11px; max-width: 720px; margin: 0 auto; }
.doc-sheet .header { display: flex; justify-content: space-between; align-items: center; }
.doc-sheet .table th { background: var(--doc-ink); color: #fff; }
.doc-sheet .table tbody tr:nth-child(even) { background: var(--doc-bg); }
.doc-sheet .totals { text-align: right; }
.doc-sheet .footer { border-top: 1px solid var(--doc-border); font-size: 9px; color: var(--doc-muted); }
```

**PASS:** `test:sync-clinical` 44/44 + captura de documento de prueba.

### Fase DOC-1 — Migrar generadores térmicos al render premium
**Archivos a modificar:**
- `app/core/CrozzoPrintService.js` → `crozzoBuildComandaThermalHtml`, `crozzoFacturaBuildThermalHtmlBuiltin`, `buildThermalPrintDocument`, `crozzoPrintComandaThermalHtml`: usar `CrozzoTermicaPremium.render` + branding Bona Origen.
- `app/modules/CrozzoPedidosInternosEngine.js` → `buildPedidoPrintHtml`: usar render premium.
- `app/modules/CrozzoSistemaCostos.js` → `INV_PRINT_CSS_THERMAL`: usar render premium.

**PASS:** comanda impresa se ve moderna (captura) + `test:sync-clinical` 44/44.

### Fase DOC-2 — Migrar hojas A4/Legal (factura, cotización, remisión, cierre, inventario)
**Archivos a modificar:**
- `app/core/pos/CrozzoPosFacturasPage.js` → `crozzoBuildFacturaSheetDocumentHtml`.
- `app/core/CrozzoPosMain.js` → `crozzoBuildCotizacionSheetDocumentHtml`, inventario productos.
- `app/modules/CrozzoFederacionEngine.js` → remisión normal.
- `app/modules/CrozzoCierrePrint.js` → `cierrePrintStyles`, `buildDiaReportHtml`, `buildHistorialPrintHtml`.
- `app/modules/CrozzoSistemaCostos.js` → `buildInventarioPrintHtml`.

**Usar:** `CrozzoDocDesign` (header, footer, tabla, totales, firma).

**PASS:** factura/cotización/remisión/cierre/inventario se ven modernos (capturas) + `test:sync-clinical` 44/44.

### Fase DOC-3 — Migrar reportes jsPDF a HTML+CSS
**Archivos a modificar:**
- `app/modules/CrozzoCostosReportesPdf.js` → `buildGeneralPdf`, `buildDetalladoPdf`: usar `crozzoExportHtmlToPdf` con template HTML moderno.
- `app/CrozzoQyC_App.html` → `generarCuentaCobro`, reportes: migrar a HTML+CSS.
- `app/modules/CrozzoFlujosMapaPdf.js` → `PdfBuilder`: modernizar layout.
- `app/modules/CrozzoRecetarioCocina.js` → `buildKitchenPdf`: modernizar (ya es el más moderno, solo unificar tokens).

**PASS:** reportes PDF se ven modernos (capturas) + `test:sync-clinical` 44/44.

### Fase DOC-4 — Branding y componentes reutilizables
- Header con logo Bona Origen + NIT + dirección + contacto en todos los documentos.
- Footer con "Generado el … · Bona Origen · v1.0.238" + paginación.
- QR/CUFE en bloque consistente.
- Firma en documentos de cierre/remisión.

**PASS:** branding consistente en todos los documentos (capturas).

### Fase DOC-5 — Centralizar generación
- Crear `app/core/CrozzoDocumentTemplates.js` con plantillas por tipo.
- Los módulos solo proveen datos; las plantillas proveen estilo.
- Eliminar fallbacks `window.open` dispersos; usar `CrozzoPrintService` como única vía.

**PASS:** `test:sync-clinical` 44/44 + no regresiones en impresión.

### Fase DOC-6 — Consolidar bundles y verificar
- `npm run consolidate` + `npm run sync`.
- `npm run map:refresh`.
- `npm run test:sync-clinical` (44/44).
- `node scripts/_connectivity-orchestrator-check.mjs` (111/111).
- Capturas de todos los documentos en `docs/maps/ops/evidencia/DOC-*/`.

## 6. Orden de ejecución

1. DOC-0 (fundación) → 2. DOC-1 (térmicos) → 3. DOC-2 (hojas) → 4. DOC-3 (PDFs) → 5. DOC-4 (branding) → 6. DOC-5 (centralizar) → 7. DOC-6 (verificar).

## 7. Riesgos

- **Fiscal:** los datos (CUFE, totales, legal) no deben cambiar; solo presentación. Validar con `_legalidad-fiscal-check.mjs`.
- **Impresión térmica:** el render premium ya existe; migrar comandas a él debe mantener el formato ESC/POS.
- **Tamaño de documentos:** CSS compartido puede aumentar tamaño de HTML; verificar que no exceda límites de impresora.
- **Bundles:** tras cambios, regenerar bundles para que no queden desactualizados.
- **Tests:** `qa-personas-mision-cien.mjs` debe seguir pasando (15/2).

## 8. Estimación

- DOC-0: 2-3 días.
- DOC-1: 3-4 días.
- DOC-2: 4-5 días.
- DOC-3: 3-4 días.
- DOC-4: 2-3 días.
- DOC-5: 3-4 días.
- DOC-6: 1-2 días.
- **Total:** ~3-4 semanas.

## 9. Decisión requerida

AM-1 debe aprobar:
- El sistema de diseño compartido (tokens, fuentes, colores).
- La migración de jsPDF a HTML+CSS (o mantener jsPDF con estilo mejorado).
- El branding "Bona Origen" en todos los documentos.

---

**Próximo paso sugerido:** aprobar DOC-0 (fundación) y ejecutar. ¿Autorizo?