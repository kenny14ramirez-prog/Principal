# Reporte Agente Profundo

**Run:** smoke-2026-11-08T17-53-55-620Z
**Preset:** smoke
**URL:** http://localhost:1420
**Inicio:** 2026-11-08T17:53:55.621Z
**Fin:** 2026-11-08T17:54:01.999Z

## Resumen
- Pasos: 10
- Hallazgos: 4
- Errores consola: 0
- Fallos red: 2

## Hallazgos
- [P0] F0-PREVUELO: Cargar aplicación falló — page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:1420/
Call log:
[2m  - navigating to "http://localhost:1420/", waiting until "domcontentloaded"[22m

- [P0] F7-FACTURACION: Intentar facturación (cliente + factura + UBL/CUFE) falló — page.waitForTimeout: Target page, context or browser has been closed
- [P0] F8-IMPRESION: Intentar imprimir comanda/cuenta falló — locator.count: Target page, context or browser has been closed
- [P0] F9-CIERRE: Buscar cierre de caja falló — locator.count: Target page, context or browser has been closed

## Pasos
- [FAIL] 1. F0-PREVUELO: Cargar aplicación → EXCEPTION: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:1420/
Call log:
[2m  - navigating to "http://localhost:1420/", waiting until "domcontentloaded"[22m

- [PASS] 2. F1-LOGIN: Detectar y usar login → sin botón login (quizá ya logueado)
- [PASS] 3. F2-APERTURA: Abrir caja si se requiere → no requiere apertura
- [WARN] 4. F3-NAV: Navegar a POS/mesas → navegado
- [PASS] 5. F4-VENTA: Tomar una mesa/producto → sin mesa/producto detectado
- [PASS] 6. F5-COMANDA: Enviar/comandar → sin botón comandar
- [PASS] 7. F6-COBRO: Cobrar venta → sin botón cobrar
- [FAIL] 8. F7-FACTURACION: Intentar facturación (cliente + factura + UBL/CUFE) → EXCEPTION: page.waitForTimeout: Target page, context or browser has been closed
- [FAIL] 9. F8-IMPRESION: Intentar imprimir comanda/cuenta → EXCEPTION: locator.count: Target page, context or browser has been closed
- [FAIL] 10. F9-CIERRE: Buscar cierre de caja → EXCEPTION: locator.count: Target page, context or browser has been closed

## Evidencia
Screenshots/trace en: C:\proyectos\sistema pos\docs\reports\agent-runs\smoke-2026-11-08T17-53-55-620Z
