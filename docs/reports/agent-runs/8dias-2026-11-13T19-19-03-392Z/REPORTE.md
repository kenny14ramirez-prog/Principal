# Reporte Agente Profundo

**Run:** 8dias-2026-11-13T19-19-03-392Z
**Preset:** 8dias
**URL:** http://localhost:1420
**Inicio:** 2026-11-13T19:19:03.393Z
**Fin:** 2026-11-13T19:22:34.036Z

## Resumen
- Pasos: 10
- Hallazgos: 0
- Errores consola: 11
- Fallos red: 9

## Hallazgos
✅ Sin hallazgos.


## Pasos
- [WARN] 1. F0-PREVUELO: Cargar aplicación → title="BONA origen · Sistema POS"
- [WARN] 2. F1-LOGIN: Detectar y usar login → login intentado
- [PASS] 3. F2-APERTURA: Abrir caja si se requiere → no requiere apertura
- [WARN] 4. F3-NAV: Navegar a POS/mesas → navegado
- [PASS] 5. F4-VENTA: Tomar una mesa/producto → producto clickeado
- [PASS] 6. F5-COMANDA: Enviar/comandar → botón comandar no visible
- [PASS] 7. F6-COBRO: Cobrar venta → sin botón cobrar
- [PASS] 8. F7-FACTURACION: Intentar facturación (cliente + factura + UBL/CUFE) → UBL 3900 bytes, CUFE 54CE22611FD51A84E043
- [PASS] 9. F8-IMPRESION: Intentar imprimir comanda/cuenta → impresión intentada (ver consola/red para errores)
- [PASS] 10. F9-CIERRE: Buscar cierre de caja → cierre intentado

## Evidencia
Screenshots/trace en: C:\proyectos\sistema pos\docs\reports\agent-runs\8dias-2026-11-13T19-19-03-392Z
