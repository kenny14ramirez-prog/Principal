# Plan detallado de pendientes — 2026-11-15

## 1. POS sin turno abierto — Requiere flujo de apertura de caja/backend

### 1.1 Diagnóstico

**Problema:** El POS (cajero) no permite agregar productos a la orden ni cobrar cuando no hay un turno abierto. Los botones "Comandar" y "Cobrar" permanecen deshabilitados. No existe un botón visible de "Abrir caja/turno" en la pantalla del POS.

**Causa raíz identificada:**
- `crozzoRequireCajaSession()` (línea ~14757 de CrozzoPosMain.js) verifica que exista un usuario autenticado. Si no hay usuario, muestra login y retorna false.
- El POS depende de un "turno" (shift) activo que se gestiona en `CrozzoCierreTurnos.js` (módulo de cierre de caja).
- En modo navegador (sin Tauri/backend), el flujo de apertura de turno no es accesible porque:
  - Requiere un backend de caja (SQLite/Tauri) que no está disponible.
  - No hay botón "Abrir turno" visible en la pantalla POS.
  - El módulo de cierre de turnos se carga pero no se integra con el POS para abrir turnos.

**Archivos involucrados:**
- `app/core/CrozzoPosMain.js` — render del POS, verificación de sesión
- `app/modules/CrozzoCierreTurnos.js` — gestión de turnos/cierres
- `app/core/CrozzoStorage.js` — persistencia de estado de turno
- `app/modules/CrozzoOnboardingOperativo.js` — onboarding (menciona "abrir turno")

**Flujo actual:**
1. Usuario login → sesión válida
2. Navega a POS → catálogo carga OK
3. Intenta agregar producto → bloqueado porque no hay turno abierto
4. No hay UI para abrir turno → POS inoperable

### 1.2 Plan de acción

#### Fase A: Investigación (1-2 días)
1. **Mapear el flujo de apertura de turno:**
   - Buscar en `CrozzoCierreTurnos.js` las funciones de apertura de turno (`abrirTurno`, `openShift`, `iniciarTurno`, etc.)
   - Identificar qué datos requiere un turno (base en efectivo, cajero, fecha, etc.)
   - Verificar si el turno se persiste en localStorage o en SQLite

2. **Verificar dependencias Tauri:**
   - Identificar qué funciones de turno requieren Tauri/SQLite
   - Determinar si se puede abrir un turno en modo navegador (solo localStorage)

3. **Revisar el onboarding:**
   - `CrozzoOnboardingOperativo.js` menciona "Cierre de caja → abrir turno → arqueo de prueba"
   - Verificar si hay un flujo guiado de apertura

#### Fase B: Implementación (2-3 días)
1. **Agregar botón "Abrir turno" en el POS:**
   - En el template del POS, añadir un botón visible cuando no hay turno activo
   - El botón debe abrir un modal de "Apertura de turno" con campos: cajero, base en efectivo, fecha/hora

2. **Implementar apertura de turno en modo navegador:**
   - Crear función `crozzoAbrirTurnoBrowser()` que:
     - Valida que haya un usuario autenticado
     - Crea un objeto turno en localStorage (`crozzo_turno_activo`)
     - Establece el turno como activo en memoria
     - Habilita los botones Comandar/Cobrar
   - Si Tauri está disponible, delegar a `CrozzoCierreTurnos`

3. **Integrar con el POS:**
   - Modificar `crozzoRequireCajaSession()` para también verificar turno activo
   - Si no hay turno, mostrar el botón de apertura en lugar de bloquear silenciosamente
   - Al abrir turno, recargar el POS con los botones habilitados

4. **Persistencia y cierre:**
   - Al cerrar sesión o recargar, verificar si hay turno activo
   - El cierre de turno debe marcar el turno como cerrado y limpiar estado

#### Fase C: Testing (1 día)
1. Login como CAJERO → POS → verificar que aparece "Abrir turno"
2. Abrir turno con base en efectivo → verificar que Comandar/Cobrar se habilitan
3. Agregar producto → verificar que se agrega a la orden
4. Cobrar → verificar que se registra la venta
5. Cerrar turno → verificar que se limpia el estado
6. Reload de página → verificar que el turno se recupera o se pide reabrir

### 1.3 Riesgos
- **Alto:** El flujo de turno puede depender de SQLite/Tauri para persistencia. En modo navegador, los turnos se perderán al recargar.
- **Medio:** Modificar `crozzoRequireCajaSession()` puede afectar otros módulos que dependen de esta función.
- **Bajo:** El botón de apertura puede no ser visible en el layout actual del POS.

### 1.4 Estimación
- Investigación: 1-2 días
- Implementación: 2-3 días
- Testing: 1 día
- **Total: 4-6 días**

---

## 2. Rendimiento real — Code-splitting de bundles (~1 MB, 800 ms task)

### 2.1 Diagnóstico

**Problema:** El bundle principal `CrozzoBundleCompras.js` (1021 KB) se carga en todas las páginas de compras. Aunque se creó `CrozzoBundleComprasCore.js` (312 KB) para páginas no-recepción, los bundles restantes (~500 KB cada uno) siguen bloqueando el parseo inicial.

**Bundles identificados:**
| Bundle | Tamaño | Páginas que lo usan |
|--------|--------|---------------------|
| CrozzoBundleCompras.js | 1021 KB | compras-recepcion, centro-compras |
| CrozzoBundleComprasCore.js | 312 KB | inventarios, compras-dashboard, etc. |
| CrozzoBundleCore.js | ~800 KB | Todas (carga inicial) |
| CrozzoBundleConfig.js | ~600 KB | Configuración |
| CrozzoBundleSuperAdmin.js | ~500 KB | Super admin |

**Causa raíz:**
- `Crozzo_POS_Completo.html` carga todos los bundles de forma sincrónica en el `<head>`.
- Se añadió `defer` a 6 scripts no críticos (Fix 6 y 7), pero los bundles principales siguen bloqueando.
- El monolito `CrozzoPosMain.js` (~2 MB) contiene 2352 funciones globales y se carga completo.

**Trace de carga (Lighthouse):**
- 4 long tasks, 815 ms de bloqueo
- Task más largo: ~800 ms (`v8.parseOnBackground`/`FunctionCall`)
- Bundle de compras: ~1 MB

### 2.2 Plan de acción

#### Fase A: Análisis de dependencias (2-3 días)
1. **Mapear el grafo de dependencias:**
   - Usar `scripts/check-invariants.mjs` y `scripts/crozzo-map-refresh.mjs` para generar el mapa de módulos
   - Identificar qué funciones de `CrozzoPosMain.js` se usan en cada página
   - Determinar qué módulos son realmente críticos para el primer render

2. **Analizar CrozzoLazyModules.js:**
   - Ya existe un sistema de carga lazy (`CrozzoLazyModules.js`)
   - Verificar qué módulos ya se cargan de forma lazy
   - Identificar oportunidades de extender el lazy loading

3. **Medir el impacto actual:**
   - Ejecutar Lighthouse antes y después de cada cambio
   - Usar Chrome DevTools Performance para identificar los cuellos de botella

#### Fase B: Code-splitting del monolito (3-5 días)
1. **Separar CrozzoPosMain.js en chunks:**
   - `CrozzoPosCore.js` — funciones de arranque, login, navegación, sesión (~300 KB)
   - `CrozzoPosCajero.js` — POS, carrito, cobro, comandas (~400 KB)
   - `CrozzoPosConfig.js` — configuración, usuarios, permisos (~300 KB)
   - `CrozzoPosReportes.js` — reportes, dashboard, analytics (~200 KB)
   - `CrozzoPosCompras.js` — compras, recepción, proveedores (ya existe como bundle)

2. **Implementar dynamic imports:**
   - Usar `import()` dinámico para cargar chunks bajo demanda
   - `CrozzoLazyModules.js` ya soporta esto; extenderlo para los nuevos chunks

3. **Optimizar el bundle de compras:**
   - Separar `CrozzoRecepcionFacturas.js` (385 KB) en un chunk separado
   - Separar `CrozzoRecepcionFeDian.js` (324 KB) en un chunk separado
   - Solo cargarlos cuando el usuario navega a "Entrada de factura"

#### Fase C: Optimización de carga (2-3 días)
1. **Preload de chunks críticos:**
   - Usar `<link rel="preload">` para los chunks del primer render
   - Usar `<link rel="prefetch">` para los chunks que se cargarán pronto

2. **Reducción de bundle size:**
   - Tree-shaking de funciones no usadas
   - Minificación más agresiva
   - Eliminar código muerto (funciones de debug, comentarios)

3. **Optimización de parseo:**
   - Usar `defer` en todos los scripts no críticos
   - Considerar `async` para scripts independientes
   - Implementar `requestIdleCallback` para carga diferida de módulos no críticos

#### Fase D: Testing y validación (1-2 días)
1. **Lighthouse audit** en login y dashboard
2. **Performance trace** para verificar reducción de long tasks
3. **Smoke test** de todas las páginas (navegación, render, funcionalidad)
4. **Comparar métricas** antes/después

### 2.3 Riesgos
- **Alto:** Separar `CrozzoPosMain.js` puede romper dependencias globales. Muchas funciones se llaman entre sí sin imports explícitos.
- **Alto:** El sistema de bundles (`consolidate-crozzo-bundles.mjs`) es complejo y puede fallar al regenerar.
- **Medio:** Dynamic imports pueden causar race conditions si un módulo se carga antes de sus dependencias.
- **Bajo:** Lighthouse puede no reflejar mejoras reales en producción (Tauri).

### 2.4 Estimación
- Análisis: 2-3 días
- Code-splitting: 3-5 días
- Optimización: 2-3 días
- Testing: 1-2 días
- **Total: 8-13 días**

---

## 3. Seguridad — Revertir backdoor KENNY (141414)

### 3.1 Diagnóstico

**Problema:** El backdoor KENNY/141414 está activo en `CrozzoAuthSecurity.js`. Esto permite acceso completo al sistema con credenciales de fábrica, lo que es un riesgo de seguridad crítico.

**Estado actual del backdoor:**
- `crozzoIsKennyMasterPinLogin(userId, plain)` → retorna `true` para KENNY + 141414
- `crozzoKennyMasterGuaranteedLogin(clave, globalRef)` → crea/repara KENNY con PIN 141414
- `crozzoIsKennyMasterPin(plain, user)` → retorna `false` (contradicción: la primera función está activa pero esta no)
- `LEGACY_KENNY_PIN` → `null` (pero el código usa fallback a '141414')

**Inconsistencias detectadas:**
1. `crozzoIsKennyMasterPin` retorna `false` (desactivado) pero `crozzoIsKennyMasterPinLogin` retorna `true` (activado) — inconsistencia.
2. `crozzoVerifyPassword` no verifica el backdoor KENNY (línea ~308: "Backdoor KENNY desactivado permanentemente").
3. `crozzoKennyMasterGuaranteedLogin` puede crear/reparar KENNY con PIN 141414 (línea ~646).

**Archivos involucrados:**
- `app/core/CrozzoAuthSecurity.js` — funciones de autenticación KENNY
- `app/core/CrozzoPosMain.js` — login flow, invocación de KENNY functions
- `app/core/CrozzoPosBoot.js` — bootstrap de KENNY al arranque

### 3.2 Plan de acción

#### Fase A: Auditoría de código KENNY (1 día)
1. **Identificar todos los puntos de entrada del backdoor:**
   - Buscar todas las referencias a `crozzoIsKennyMasterPinLogin`, `crozzoKennyMasterGuaranteedLogin`, `crozzoAcceptKennyLegacy141414Login`, `crozzoRestoreKennyLegacyPin141414`
   - Mapear el flujo completo de login KENNY

2. **Verificar la inconsistencia:**
   - `crozzoIsKennyMasterPin` retorna `false` → ¿se usa en algún lugar?
   - `crozzoIsKennyMasterPinLogin` retorna `true` → ¿dónde se invoca?
   - `crozzoVerifyPassword` no verifica KENNY → ¿cómo entonces funciona el login KENNY?

3. **Documentar el flujo actual:**
   - Paso a paso de cómo KENNY/141414 logra entrar al sistema
   - Qué funciones se invocan y en qué orden

#### Fase B: Desactivación del backdoor (1-2 días)
1. **Desactivar `crozzoIsKennyMasterPinLogin`:**
   ```javascript
   function crozzoIsKennyMasterPinLogin(userId, plain) {
     return false; // Backdoor desactivado por seguridad
   }
   ```

2. **Desactivar `crozzoKennyMasterGuaranteedLogin`:**
   - Cambiar para que no cree ni repare KENNY
   - Retornar `{ ok: false, reason: 'backdoor_disabled' }`

3. **Desactivar `crozzoAcceptKennyLegacy141414Login`:**
   - Retornar `{ ok: false, reason: 'backdoor_disabled' }`

4. **Desactivar `crozzoRestoreKennyLegacyPin141414`:**
   - No-op (no restaurar PIN)

5. **Limpiar `LEGACY_KENNY_PIN`:**
   - Ya es `null`; verificar que no haya fallback a '141414'

6. **Eliminar referencias en `CrozzoPosMain.js` y `CrozzoPosBoot.js`:**
   - Buscar y eliminar llamadas a las funciones KENNY
   - Asegurar que no haya creación automática de KENNY

#### Fase C: Migración de cuenta KENNY (1 día)
1. **Cambiar contraseña de KENNY:**
   - Si KENNY existe en el sistema, cambiar su contraseña a una segura
   - Forzar cambio de contraseña en primer login

2. **Verificar que KENNY no se puede crear con 141414:**
   - Intentar login con KENNY/141414 → debe fallar
   - Verificar que no se crea cuenta automáticamente

#### Fase D: Testing (1 día)
1. Intentar login con KENNY/141414 → debe fallar
2. Login con otras credenciales válidas → debe funcionar
3. Verificar que no hay creación automática de KENNY
4. Verificar que el sistema arranca sin errores

### 3.3 Riesgos
- **Alto:** Si KENNY es la única cuenta superadmin, desactivar el backdoor puede bloquear el acceso al sistema. Asegurar que exista otra cuenta superadmin antes de desactivar.
- **Medio:** Eliminar referencias en `CrozzoPosMain.js` puede romper el flujo de login si no se hace cuidadosamente.
- **Bajo:** El usuario puede querer mantener el backdoor activo para testing.

### 3.4 Estimación
- Auditoría: 1 día
- Desactivación: 1-2 días
- Migración: 1 día
- Testing: 1 día
- **Total: 4-5 días**

### 3.5 Nota importante
⚠️ **Esta tarea requiere autorización explícita del dueño del sistema** (per AGENTS.md). El backdoor KENNY está protegido por reglas de seguridad. No se debe modificar sin autorización por escrito.

---

## 4. Honeypot Phases 2-4 — Implementar las fases adicionales del plan

### 4.1 Diagnóstico

**Estado actual del honeypot:**
- **Phase 1 (completada):** `produccionEstricta=true`, `legendaryActive=false` por defecto, bloques cleared on boot. Decoy login (ADMIN/admin) activa jaula mode con alertas progresivas (toast→modal→bloqueo) en ~90-150s.
- **Módulo `CrozzoHoneypotJaula.js` (creado):** Implementa modo jaula con:
  - Datos ficticios (16 productos, 5 clientes, ventas falsas)
  - Alertas progresivas (8 alertas en 6 fases)
  - Bloqueo final irreversible con device dump
  - Código de desbloqueo: `CROZZO-UNLOCK-2026`
  - Tracking de pantallas visitadas
  - Intercepción de config para datos señuelo

**Plan original (PLAN_HONEYPOT_JAULA_2026-11-15.md):**
- Phase 1: Activación básica (completada)
- Phase 2: Mejoras de realismo (pendiente)
- Phase 3: Persistencia y logging (pendiente)
- Phase 4: Integración avanzada (pendiente)

### 4.2 Plan de acción

#### Phase 2: Mejoras de realismo (2-3 días)

**Objetivo:** Hacer que el honeypot sea indistinguible de un sistema real para el atacante.

1. **Datos ficticios más realistas:**
   - Expandir `FAKE_PRODUCTS` de 16 a 40+ productos con categorías, imágenes, stock variable
   - Expandir `FAKE_CLIENTES` de 5 a 20+ con historial de compras
   - Generar `FAKE_VENTAS` con patrones realistas (picos en hora de almuerzo, estacionalidad)
   - Añadir `FAKE_PROVEEDORES` para el módulo de compras
   - Añadir `FAKE_FACTURAS` con numeración consecutiva

2. **Intercepción de más funciones:**
   - Interceptar `crozzoGetVentas()` para devolver ventas ficticias
   - Interceptar `crozzoGetClientes()` para devolver clientes ficticios
   - Interceptar `crozzoGetProductos()` para devolver productos ficticios
   - Interceptar `crozzoGetFacturas()` para devolver facturas ficticias
   - Interceptar `crozzoGetProveedores()` para devolver proveedores ficticios

3. **Comportamiento realista:**
   - Simular delay en operaciones (200-800ms) para parecer un sistema real con latencia
   - Simular errores ocasionales ("Error de conexión", "Timeout") para parecer un sistema con problemas
   - Permitir que el atacante "venda" productos (el carrito funciona con datos ficticios)
   - Permitir que el atacante "facture" (genera facturas ficticias con numeración)
   - Simular notificaciones de otros usuarios ("María abrió una comanda")

4. **Navegación realista:**
   - Todas las pantallas deben renderizar con datos ficticios
   - Los reportes deben mostrar datos ficticios coherentes
   - El dashboard debe mostrar KPIs ficticios (ventas del día, ticket promedio, etc.)

#### Phase 3: Persistencia y logging (2-3 días)

**Objetivo:** Registrar todo lo que el atacante hace y persistir el estado del honeypot.

1. **Logging detallado:**
   - Registrar cada clic, navegación, búsqueda, y acción del atacante
   - Registrar intentos de acceso a funciones sensibles (configuración, usuarios, seguridad)
   - Registrar texto ingresado en campos de búsqueda y formularios
   - Registrar tiempo en cada pantalla
   - Formato: `{ timestamp, action, screen, detail, userAgent, ip (si disponible) }`

2. **Persistencia del honeypot:**
   - Guardar el log de acciones en localStorage (`crozzo_jaula_log`)
   - Guardar el estado del honeypot (activo, bloqueado, tiempo restante)
   - Al recargar la página, restaurar el estado del honeypot
   - Si el atacante cierra y reabre el navegador, el honeypot debe seguir activo

3. **Envío de datos (opcional, requiere backend):**
   - Si hay conexión a internet, enviar el log a un endpoint de monitoreo
   - Usar Supabase o un endpoint propio para almacenar los logs
   - Incluir datos del dispositivo (user agent, IP, resolución, etc.)

4. **Panel de administración del honeypot:**
   - En `config-seguridad`, añadir una sección "Honeypot" con:
     - Estado actual (activo/inactivo/bloqueado)
     - Log de acciones del último ataque
     - Botón para desbloquear (con código)
     - Botón para limpiar logs
     - Estadísticas (número de ataques, tiempo promedio hasta bloqueo, etc.)

#### Phase 4: Integración avanzada (3-4 días)

**Objetivo:** Integrar el honeypot con el resto del sistema para una protección completa.

1. **Detección inteligente:**
   - Detectar patrones de ataque (intentos de acceso a rutas admin, fuerza bruta, etc.)
   - Activar el honeypot automáticamente cuando se detecta comportamiento sospechoso
   - Usar un sistema de puntuación de riesgo (risk score) para activar el honeypot

2. **Múltiples capas de honeypot:**
   - Capa 1: Decoys existentes (ADMIN, CAJERO, etc.) — ya implementada
   - Capa 2: Honeypot en APIs (endpoints falsos que registran intentos)
   - Capa 3: Honeypot en configuración (campos falsos que registran accesos)

3. **Integración con auditoría:**
   - Registrar eventos del honeypot en la tabla de auditoría
   - Incluir el log de acciones del honeypot en los reportes de auditoría
   - Enviar alertas al administrador cuando se activa el honeypot

4. **Modo de prueba:**
   - Añadir un modo "preview" para que el administrador pueda ver cómo se ve el honeypot
   - Usar `adminPreview: true` en `crozzoHoneypotLiveBegin` para mostrar el badge de preview
   - Permitir al administrador probar el flujo completo sin activar el bloqueo real

### 4.3 Riesgos
- **Alto:** Phase 2 requiere interceptar muchas más funciones, lo que puede causar conflictos con el código real.
- **Alto:** Phase 3 requiere persistencia que puede ser detectada por el atacante (localStorage visible en DevTools).
- **Medio:** Phase 4 requiere integración con el sistema de auditoría y alertas.
- **Bajo:** El modo preview puede ser detectado por el atacante si no se implementa correctamente.

### 4.4 Estimación
- Phase 2: 2-3 días
- Phase 3: 2-3 días
- Phase 4: 3-4 días
- **Total: 7-10 días**

---

## Resumen de estimaciones

| Item | Estimación | Prioridad | Requiere autorización |
|------|-----------|-----------|----------------------|
| 1. POS sin turno | 4-6 días | Alta | No |
| 2. Rendimiento | 8-13 días | Media | No |
| 3. Seguridad KENNY | 4-5 días | Crítica | **Sí** |
| 4. Honeypot Phases 2-4 | 7-10 días | Media | No |

**Total estimado: 23-34 días de trabajo**

## Notas

- Todos los cambios deben seguir el flujo: modificar en `app/` → `npm run sync` → verificar en navegador.
- Antes de modificar código, se requiere autorización del dueño del sistema (per AGENTS.md).
- El backdoor KENNY (item 3) requiere autorización explícita y por escrito.
- Se recomienda implementar en orden: Item 1 → Item 4 → Item 2 → Item 3 (el último requiere autorización).

---

*Generado: 2026-11-15*
*Autor: Análisis automatizado*
