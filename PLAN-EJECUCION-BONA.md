# Plan de Ejecución BONA — Sistema POS Crozzo

## Estado: COMPLETADO

## Objetivo
Hacer que la interfaz BONA se sienta de lujo extremo: súper deportivo, edificio exclusivo, servicio personalizado. Cada detalle transmite exclusividad, calma y sensación premium.

## Restricciones vigentes
- KENNY (PIN 141414) activo, sin modificar credenciales.
- Solo KENNY y POS Admin gestionan permisos.
- KENNY invisible para otros usuarios.
- MFA desactivado pero intacto (`MFA_TEMP_DISABLED = true`).
- Centro de Despliegue solo para Super Admin.
- Contextual help off por defecto.
- No tocar updater/releases/versiones sin autorización.
- Notificaciones menos invasivas (campana con badge rojo, toasts discretos).
- Modo demo sin bloqueo ni honeypot.

## Paleta y tokens de marca (NO inventar colores)
- Oro: `#B59A6D`
- Crema: `#FAF9F7`
- Carbón: `#1C1C1C`
- Títulos: Cormorant Garamond
- Interfaz: DM Sans

## Fases ejecutadas

### Fase 1: Capa premium BONA
- Tokens, vidrio crema, Cormorant Garamond
- Reskin Super Admin (commit 3f7def7)
- Archivo: `app/css/CrozzoPremiumShell.css`

### Fase 2: Capa silenciosa y emoji de chrome
- Banner de conexión, toasts, pills, nav inferior neutralizados a crema/oro
- Emoji de chrome reemplazados por Lucide o glifos monocromáticos
- Commit: a480483

### Fase 3: Centro de Despliegue gateado a Super Admin
- Mesas 1-100 y llevar 1-60
- Commit: 2185cfd

### Fase 4: Integración Fase 0 con flags
- `useDedupMultilevel`, `useOutboxRuntime` en `false`
- CSP en modo enforce
- Commit: 15ea850

### Fase 5: Migración innerHTML a CrozzoSanitize
- Módulos no-bundle migrados (commits 9beb520...5665a36)
- DOMPurify permite atributos `on*`

### Fase 6: CSP enforce y Resend
- CSP enforce (commit 5aca816)
- Resend con FROM configurable (commit f8c556b)
- Consecutivo con rollback (commit 5c6fb1e)

### Fase 7: Solucionador y Exportar reporte
- Solucionador reparado (commit a2632d8)
- Exportar reporte reparado (commit 6905d34)

### Fase 8: Honeypot demo
- adminPreview nunca bloquea
- Verificación de bloqueo en nube desactivada
- Commits: 8c78eff, f3f0225

### Fase 9: dc-menu-btn y palette click
- dc-menu-btn (commit cbdee5b)
- palette click (commit 13567af)

### Fase 10: config-usuarios null-safe
- Commit: a78b80c

### Fase 11: Centro de notificaciones y toasts discretos
- Campana con badge rojo en header
- Toasts máximo 2 visibles, 2 segundos
- Commit: 6a9b584

### Fase 12: Auditoría visual y mejoras de diseño
- Modal de conflicto de servidor oculto con [hidden]
- Toasts movidos abajo a la derecha
- Rojo fijo #dc2626 → var(--danger, #d32f2f)
- Título del encabezado completo (no cortado)
- Píldora "Sin conexión" sin alarma roja, una sola línea
- Tarjetas de módulo con material premium (degradado, filo oro, reflejo, sombra cálida)
- Botones de módulo con oro en hoja con reflejo
- Etiquetas y pills con pátina de oro
- Rojo de alerta como esmalte
- Pastilla de salud con marco de oro
- Textura de lino sutil en tarjetas
- Menú Super Admin en carbón de marca con filo de oro
- Solucionador de problemas con acabado premium
- Título en Cormorant Garamond

### Fase 13: Personalización (asistente familiar)
- Módulo `CrozzoCompanion.js` (nuevo)
- Saludo por ritmo y región (Colombia / Eje Cafetero Pereira)
- Preferencias: nombre, tratamiento (tú/usted), región, ritmo, mayordomo, pausa
- Memoria de turno (último cierre de caja)
- Mayordomo de anticipación (sugerencias en inicio)
- Logros por cierres limpios (3, 10, 25)
- Recordatorio de pausa en jornadas largas
- Tooltip de memoria en el saludo
- Pausa desde inicio de sesión
- Acompañamiento en errores (frases de acompañamiento)
- Panel "Tu asistente" con vista previa
- Comando en paleta: "Personalizar asistente"
- Todo se guarda solo en este equipo (localStorage)

### Fase 14: Solucionador de problemas
- Botones inertes corregidos (data-dc-fn + listeners delegados)
- Botón "Ver qué sigue" agregado
- Verificado: "Verificar conexión" y "Ver qué sigue" funcionan

### Fase 15: Filtros de Facturas
- Chips de periodo (7 días, 30 días, 90 días) inertes corregidos
- Listener delegado agregado
- Verificado: todos cambian el periodo activo

### Fase 16: Filtro de categorías de la caja
- Causa raíz: CrozzoCspDomWire migra onclick a addEventListener, pero listeners se pierden en re-render
- Solución: listener delegado en CrozzoPosMain.js que intercepta clics en .category-chip
- Verificado: "Bebidas" cambia a activo

## Archivos modificados
- `app/css/CrozzoPremiumShell.css` (secciones 21-25)
- `app/core/CrozzoCspDomWire.js` (delegación + listener en boot)
- `app/core/CrozzoCompanion.js` (nuevo módulo)
- `app/core/CrozzoPosMain.js` (saludo, tooltip, listener delegado para chips)
- `app/core/CrozzoCommandCenter.js` (entrada en paleta)
- `app/core/CrozzoNotificationCenter.js` (acompañamiento en errores)
- `app/core/CrozzoDeploymentCenter.js` (botón "Ver qué sigue")
- `app/core/pos/CrozzoPosFacturasPage.js` (listener delegado para chips)
- `app/index.html` y `app/Crozzo_POS_Completo.html` (carga de CrozzoCompanion)
- Sync a `src/` de todos los anteriores

## Verificación final
- `check-invariants`: 12 PASS
- `test:operativo-oro:raw`: OK=17, FAIL=0
- `_smoke-boot-check`: 11/11 OK
- `_rbac-security-check`: PASS
- `_fase0-integration-check`: PASS
- Sin errores en consola

## Lo que queda pendiente (requiere autorización)
1. Causa raíz de CrozzoCspDomWire (el listener delegado es un parche, no la solución definitiva)
2. CI `Verificar maps frescos` (sin logs accesibles)
3. Emojis de chrome (requieren autorización de archivos no premium)
4. MFA real, Resend, impresión nativa, WAF/Sentry (dependen de terceros)

## Regla de oro
Ningún agente puede modificar código sin autorización explícita del dueño. Un plan aprobado no autoriza editar código. Si el dueño pide un cambio en el plan, solo se edita el plan.

## Regla absoluta del dueño
Si el dueño dice blanco, es blanco. Sin cuestionar, sin probar, sin inventar. Las órdenes se siguen al pie de la letra. No se gastan recursos en pruebas innecesarias. No se hacen cambios sin autorización explícita. No se inventan planes alternativos. Se ejecuta exactamente lo que se ordena, nada más.