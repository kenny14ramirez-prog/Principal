# Reporte Agente Profundo

**Run:** smoke-2026-11-07T21-23-03-048Z
**Preset:** smoke
**URL:** http://127.0.0.1:8123/index.html
**Inicio:** 2026-11-07T21:23:03.049Z
**Fin:** 2026-11-07T21:25:45.250Z

## Resumen
- Pasos: 10
- Hallazgos: 1
- Errores consola: 93
- Fallos red: 93

## Hallazgos
- [P0] F5-COMANDA: Enviar/comandar falló — locator.click: Timeout 30000ms exceeded.
Call log:
[2m  - waiting for locator('button, .btn, [role="button"]').filter({ hasText: /Comandar|Enviar|Guardar/i }).first()[22m
[2m    - locator resolved to <button type="button" id="crozzo-arqueo-confirm-btn" data-crozzo-act="crozzoShiftFinalize" class="btn btn-primary crozzo-arqueo-actions__primary">…</button>[22m
[2m  - attempting click action[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is not visible[22m
[2m    - retrying click action[22m
[2m    - waiting 20ms[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is not visible[22m
[2m    - retrying click action[22m
[2m      - waiting 100ms[22m
[2m    56 × waiting for element to be visible, enabled and stable[22m
[2m       - element is not visible[22m
[2m     - retrying click action[22m
[2m       - waiting 500ms[22m


## Pasos
- [WARN] 1. F0-PREVUELO: Cargar aplicación → title="BONA origen · Sistema POS"
- [WARN] 2. F1-LOGIN: Detectar y usar login → login intentado
- [WARN] 3. F2-APERTURA: Abrir caja si se requiere → no requiere apertura
- [WARN] 4. F3-NAV: Navegar a POS/mesas → navegado
- [WARN] 5. F4-VENTA: Tomar una mesa/producto → producto clickeado
- [FAIL] 6. F5-COMANDA: Enviar/comandar → EXCEPTION: locator.click: Timeout 30000ms exceeded.
Call log:
[2m  - waiting for locator('button, .btn, [role="button"]').filter({ hasText: /Comandar|Enviar|Guardar/i }).first()[22m
[2m    - locator resolved to <button type="button" id="crozzo-arqueo-confirm-btn" data-crozzo-act="crozzoShiftFinalize" class="btn btn-primary crozzo-arqueo-actions__primary">…</button>[22m
[2m  - attempting click action[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is not visible[22m
[2m    - retrying click action[22m
[2m    - waiting 20ms[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is not visible[22m
[2m    - retrying click action[22m
[2m      - waiting 100ms[22m
[2m    56 × waiting for element to be visible, enabled and stable[22m
[2m       - element is not visible[22m
[2m     - retrying click action[22m
[2m       - waiting 500ms[22m

- [PASS] 7. F6-COBRO: Cobrar venta → sin botón cobrar
- [WARN] 8. F7-FACTURACION: Intentar facturación (cliente + factura) → sin botón facturar detectado
- [WARN] 9. F8-IMPRESION: Intentar imprimir comanda/cuenta → impresión intentada (ver consola/red para errores)
- [WARN] 10. F9-CIERRE: Buscar cierre de caja → cierre intentado

## Evidencia
Screenshots/trace en: C:\proyectos\sistema pos\docs\reports\agent-runs\smoke-2026-11-07T21-23-03-048Z
