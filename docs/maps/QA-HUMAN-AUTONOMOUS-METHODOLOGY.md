# Metodología QA Autónomo "Cajero-Humano"

**Versión:** 1.0  
**Objetivo:** Simular un cajero real recorriendo la interfaz solo con clicks/fills/navegación, detectar fallos funcionales/UI/errores y generar reporte accionable.  
**Principio:** "Human-First" - Actuar como humano, NO llamar funciones internas.  
**Alcance:** Login → Apertura → Mesas/Directa → Comandar → Cobro → Cierre de Caja → Validaciones finales.

---

## 1. Filosofía
- **Metódico**: Seguir orden estricto, validar en cada paso antes de continuar.
- **Humano**: Solo usar lo que ve el usuario (botones, modales, formularios).
- **Observador**: Capturar consola, errores JS, requests fallidos, overlays bloqueantes.
- **Accionable**: Cada hallazgo debe tener: síntoma, evidencia, pasos para reproducir, severidad, propuesta de fix.
- **Sin inventar**: Basado en rutas/reales del sistema.

---

## 2. Flujo de revisión (Pasos obligatorios)

| Fase | Acción | Validaciones | Severidad si falla |
|---|---|---|---|
| **F0 - Pre-vuelo** | Cargar `http://localhost:1420` o app Tauri. Esperar carga. | Consola limpia de errores fatales, sin 404 críticos, `crozzo-lazy-ready` signal detectado o UI lista. | **P0** |
| **F1 - Login** | Ir a login. Completar credenciales de cajero. Click "Entrar". | Redirección correcta, sin modal bloqueante, sin errores. Usuario logueado visible. | **P0** |
| **F2 - Apertura de Caja/Turno** | Detectar modal "Apertura de caja"/"Abrir turno". Completar monto apertura si aparece. Guardar. | Modal se cierra, indicador de turno/caja activo aparece. | **P0** |
| **F3 - Navegación POS** | Ir a "Mesas" o "Venta directa" según UI. Verificar carga. | Grid de mesas visible o lista productos visible. Sin overlays. | **P0** |
| **F4 - Tomar orden** | Abrir mesa (ej. M1) o ir Directa. Agregar >=1 producto. | Carrito se actualiza, totales correctos, cantidades funcionan. | **P0** |
| **F5 - Comandar** | Click "Comandar y guardar" / "Enviar". | Comanda enviada sin error, feedback visible, sin crash. | **P0** |
| **F6 - Cobro** | Ir a cobro (botón "Cobrar" o flujo). Seleccionar "Efectivo". Completar monto. Cobrar. | Cálculo vuelto correcto, cobro exitoso, confirmación visible. Mesa/libre o estado correcto. | **P0** |
| **F7 - Validación post-cobro** | Verificar carrito vacío, mesa liberada/libre, sin modal atascado. | Estado coherente, sin errores. | **P0** |
| **F8 - Cierre de Caja/Arqueo** | Buscar ruta "Cierre"/"Arqueo"/"Cierre de turno". Abrir. Revisar totales. Intentar cerrar con datos válidos. | Totales mostrados, sin errores, cierre procesa o muestra validación clara. | **P0** |
| **F9 - Verificación final** | Revisar consola, toasts, overlays. Capturar evidencia. | Sin errores nuevos, UI funcional. | **P1** |

---

## 3. Criterios de detección de fallos

| Tipo | Qué detectar | Acción |
|---|---|---|
| **Botón roto** | Botón clickeable pero no hace nada / sin respuesta | Capturar selector, estado, evento, screenshot |
| **Modal atascado** | Modal no cierra, backdrop bloquea, z-index alto | Detectar overlay con alta opacidad/bloqueo |
| **Error JS** | `console.error`, `Uncaught`, stack trace | Capturar mensaje + stack |
| **Request fallido** | Fetch/XHR 4xx/5xx | Capturar URL, status, respuesta |
| **UI rota** | Elemento `undefined`, `NaN`, texto vacío inesperado | Validar totales/montos |
| **Flujo quebrado** | No avanza de paso, redirección incorrecta | Marcar como P0 |
| **Overlay bloqueante** | Elemento cubriendo toda pantalla sin cerrar | Intentar cerrar o reportar |

---

## 4. Evidencia a capturar
- **Screenshot** por fase crítica (login, cobro, cierre)
- **Console logs** (errores/warnings relevantes)
- **Network failures** 
- **DOM snapshot** del elemento problemático
- **Pasos reproducidos** (clicks exactos)
- **Timestamp** y fase

---

## 5. Reporte de salida
Generar `docs/reports/QA-CAJERO-HUMANO-YYYY-MM-DD-HH-MM-SS.md` con:
- Resumen ejecutivo (PASS/FAIL, P0/P1/P2)
- Tabla por fase con resultado
- Hallazgos detallados con evidencia
- Plan de acción priorizado
- Sugerencias de fix
- Recomendaciones para corrección

---

## 6. Reglas de ejecución
- **NO llamar window.* internos** - Solo interacción DOM
- **Ser paciente** - Esperar renders/modales (timeouts razonables)
- **Detenerse en P0 crítico** - Si bloquea flujo principal, reportar inmediatamente
- **Reutilizable** - Funciona con dev server o build
- **Seguro** - Usa datos de prueba, no afecta producción
- **Metódico** - Un paso a la vez, validar antes de siguiente
