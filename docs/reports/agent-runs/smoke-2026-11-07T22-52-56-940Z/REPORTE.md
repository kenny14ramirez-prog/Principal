# Reporte Agente Profundo

**Run:** smoke-2026-11-07T22-52-56-940Z
**Preset:** smoke
**URL:** http://127.0.0.1:8131/index.html
**Inicio:** 2026-11-07T22:52:56.941Z
**Fin:** 2026-11-07T22:55:57.828Z

## Resumen
- Pasos: 10
- Hallazgos: 0
- Errores consola: 81
- Fallos red: 81

## Hallazgos
✅ Sin hallazgos.


## Pasos
- [WARN] 1. F0-PREVUELO: Cargar aplicación → title="BONA origen · Sistema POS"
- [WARN] 2. F1-LOGIN: Detectar y usar login → login intentado
- [PASS] 3. F2-APERTURA: Abrir caja si se requiere → no requiere apertura
- [WARN] 4. F3-NAV: Navegar a POS/mesas → navegado
- [WARN] 5. F4-VENTA: Tomar una mesa/producto → producto clickeado
- [WARN] 6. F5-COMANDA: Enviar/comandar → comandar intentado
- [PASS] 7. F6-COBRO: Cobrar venta → sin botón cobrar
- [WARN] 8. F7-FACTURACION: Intentar facturación (cliente + factura + UBL/CUFE) → UBL 3900 bytes, CUFE E1E64EE6B734FFD6C2B8
- [WARN] 9. F8-IMPRESION: Intentar imprimir comanda/cuenta → impresión intentada (ver consola/red para errores)
- [WARN] 10. F9-CIERRE: Buscar cierre de caja → cierre intentado

## Evidencia
Screenshots/trace en: C:\proyectos\sistema pos\docs\reports\agent-runs\smoke-2026-11-07T22-52-56-940Z
