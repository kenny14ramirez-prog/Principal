# Validación Infra/Boot/Observabilidad/UI — Escuadrón POS Crozzo

Directorio: `C:\proyectos\sistema pos`
Ejecución secuencial, sin modificar código fuente.

## Resumen

| # | Check | Comando | Exit | Estado |
|---|-------|---------|------|--------|
| 1 | boot-hang | `node scripts/_boot-hang-check.mjs` | 0 | PASS (con warning pageerror) |
| 2 | smoke-boot | `node scripts/_smoke-boot-check.mjs` | 0 | PASS (11/11) |
| 3 | metrics-check | `node scripts/_metrics-check.mjs` | 0 | PASS |
| 4 | observability-dashboard | `node scripts/_observability-dashboard-check.mjs` | 0 | PASS |
| 5 | asset-size-check | `node scripts/_asset-size-check.mjs` | 0 | PASS (info tamaños) |
| 6 | bottom-gap | `node scripts/_bottom-gap-check.mjs` | 1 | FAIL |
| 7 | buttons-fix | `node scripts/_buttons-fix-check.mjs` | 0 | PASS |
| 8 | buttons-spot | `node scripts/_buttons-spot-check.mjs` | 0 | PASS |
| 9 | toggle-css | `node scripts/_toggle-css-check.mjs` | 0 | PASS |
| 10 | picker-flicker | `node scripts/_picker-flicker-check.mjs` | 0 | PASS (0 fallos) |
| 11 | perfiles-barrio | `npm run test:perfiles-barrio` | 0 | PASS |
| 12 | agent-eval | `node scripts/_agent-eval-check.mjs` | 0 | STRUCT OK (1 paso FAIL, 1 P0) |

## Detalles por check

### 1. boot-hang — exit 0
`ok: true`, login 516 ms, `mainLen: 14524`, usuario KENNY/superadmin, página `inicio-operacion`.
Warning: pageerror capturado:
```
Cannot read properties of null (reading 'classList')
```
No bloquea el boot (exit 0), pero requiere atención.

### 2. smoke-boot — exit 0
11/11 OK: sin errores fatales, `.app-container` visible, `#mainContent`, nombre app, navegación, ConfigManager, CrozzoDocScanner, CrozzoOcrLearning, `renderFacturas`, globals críticos.

### 3. metrics-check — exit 0
Snapshot con timestamp, rust metrics, business metrics, outboxSize 0. ✅ PASS.

### 4. observability-dashboard — exit 0
collectMetrics OK (outboxSize 0, facturasTotal 0), renderHtml string 1302 chars, show sin error. ✅ PASS.

### 5. asset-size-check — exit 0
Tamaños destacados:
- css/CrozzoPosStyles.css 2165.1 KB
- core/CrozzoPosMain.js 2285.9 KB
- core/CrozzoPosExtensions.js 159.9 KB
- core/CrozzoLazyModules.js 8.2 KB
- bundles/CrozzoBundleCompras.js 1019.3 KB
- bundles/CrozzoBundleCostos.js 647.7 KB
- bundles/CrozzoBundleReservorio.js 303.0 KB
- DEFER scripts: 0 on disk: 0 total 0.0 KB

### 6. bottom-gap — exit 1 (FAIL)
Métricas (viewport 420x820):
```
innerHeight: 820
htmlBottom: 820
bodyBottom: 820
appBottom: 0
mainBottom: 0
gapBelowApp: 820
gapBelowBody: 0
classes: crozzo-theme-light crozzo-touch-shell crozzo-field-tablet crozzo-auth-gate-pending crozzo-vp-ready crozzo-sidebar-touch crozzo-locale-es-co crozzo-form-mobile
contentH: 820px
touchNavH: 62px
mainPadBottom: 14px
```
FALLO: franja inferior ~820px. `.app-container` reporta bottom 0 (no layout/medición aplicada en este estado).

### 7. buttons-fix — exit 0
Todas las páginas probadas `ok: true`, sin errores (incl. compras-proveedores, config-impuestos, config-facturas-admin, control-acceso).

### 8. buttons-spot — exit 0
Boot OK, navegación expuesta. Smoke de páginas (cajero, comandas, venta-comercial, tablets, costos-federacion) renderiza contenido.

### 9. toggle-css — exit 0
Sidebar collapsed, btn toggle flex/relative, header 48px.

### 10. picker-flicker — exit 0
5/5 OK: sin pull, dedupe innerHTML, export visible sig, applyRemoteRow gate, quiet skip ui sync.

### 11. perfiles-barrio — exit 0
PASS: frutería/abasto/minimarket con gating + menú por rol. 18 checks OK.

### 12. agent-eval — exit 0 (estructural)
Run: `smoke-2026-11-13T19-07-10-348Z`. 6/6 checks estructurales OK.
Reporta: Pasos FAIL: 1 | Hallazgos P0: 1.
Causa: el dev server en `http://localhost:1420` no estaba corriendo (ERR_CONNECTION_REFUSED). El paso 1 (F0-PREVUELO "Cargar aplicación") falló por conexión rechazada; el resto quedó en estado de error de navegador. No es un fallo de código detectado por este check, sino de entorno (servidor no levantado).

## Fallas / acciones sugeridas

1. **bottom-gap (FAIL)**: revisar layout del shell táctil/móvil; `.app-container` queda con bottom 0 y gap ~820px cuando se aplican clases manualmente sin boot completo. Validar `CrozzoViewportFit.apply()` y estilos de `.app-container`.
2. **boot-hang warning**: investigar el `classList` null en runtime (posible elemento no presente en el flujo de login). No bloquea boot.
3. **agent-eval P0**: levantar el dev server (`localhost:1420`) antes de re-ejecutar el agente evaluador para obtener resultados válidos.

REPORTE ESCRITO