# Agente Fiscal/Contingencia — Validación 30 min

**Duración total:** 1804 s (30.07 min)
**Inicio:** 2026-11-14T00:30:44.148Z
**Fin:** 2026-11-14T01:00:48.051Z
**Iteraciones completas:** 293
**Ejecuciones totales:** 2342 (PASS 2342, FAIL 0)

## Escenarios fiscales ejecutados

| Check | Ejecuciones | PASS | FAIL | Veredicto |
|---|---:|---:|---:|---|
| test:legalidad-fiscal | 293 | 293 | 0 | OK |
| test:contingencia-fiscal | 293 | 293 | 0 | OK |
| test:retenciones-b2b | 293 | 293 | 0 | OK |
| test:tipo-documento | 293 | 293 | 0 | OK |
| test:ticket-qr | 293 | 293 | 0 | OK |
| _fiscal-sandbox-check | 293 | 293 | 0 | OK |
| _fiscal-dualwrite-check | 292 | 292 | 0 | OK |
| _ocr-factura-check | 292 | 292 | 0 | OK |

## Comportamiento del sistema

### test:legalidad-fiscal
- Ejecuciones: 293, PASS: 293, FAIL: 0.
- Comportamiento: estable, sin fallos en 293 ejecuciones consecutivas.

### test:contingencia-fiscal
- Ejecuciones: 293, PASS: 293, FAIL: 0.
- Comportamiento: estable, sin fallos en 293 ejecuciones consecutivas.

### test:retenciones-b2b
- Ejecuciones: 293, PASS: 293, FAIL: 0.
- Comportamiento: estable, sin fallos en 293 ejecuciones consecutivas.

### test:tipo-documento
- Ejecuciones: 293, PASS: 293, FAIL: 0.
- Comportamiento: estable, sin fallos en 293 ejecuciones consecutivas.

### test:ticket-qr
- Ejecuciones: 293, PASS: 293, FAIL: 0.
- Comportamiento: estable, sin fallos en 293 ejecuciones consecutivas.

### _fiscal-sandbox-check
- Ejecuciones: 293, PASS: 293, FAIL: 0.
- Comportamiento: estable, sin fallos en 293 ejecuciones consecutivas.

### _fiscal-dualwrite-check
- Ejecuciones: 292, PASS: 292, FAIL: 0.
- Comportamiento: estable, sin fallos en 292 ejecuciones consecutivas.

### _ocr-factura-check
- Ejecuciones: 292, PASS: 292, FAIL: 0.
- Comportamiento: estable, sin fallos en 292 ejecuciones consecutivas.

## Observaciones fiscales

- Legalidad fiscal: bloqueo Sandbox, sin CUFE real en Nivel 0, candado anti-mockStamp.
- Contingencia: SLA y drenaje verificados; mockStamp eliminado del path principal.
- Retenciones B2B: UBL WithholdingTaxTotal por municipio DANE.
- Tipo documento: FEV/tiquete automático, notas crédito/débito UBL.
- Ticket QR: render condicionado a CUFE real; sandbox no muestra QR.
- Fiscal sandbox/dual-write/OCR: sanidad de módulos y persistencia dual.

## Veredicto

**SEGURO** — todos los checks fiscales pasaron en todas las ejecuciones del bucle de 30 min.
