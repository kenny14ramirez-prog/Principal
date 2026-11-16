# Plan de Implementación: Sistema Honeypot "Jaula de Ratas"
## BONA origen POS · Análisis y Diseño Detallado

---

## 1. Concepto

Cuando un atacante intenta ingresar con credenciales de cuentas señuelo (decoys) como `admin/admin`, `root/root`, `SUPERADMIN/[REDACTED]`, etc., el sistema **no lo rechaza**. En su lugar:

1. Le permite "entrar" a un **entorno falso idéntico** al sistema real.
2. Muestra **datos completamente ficticios** (ventas, clientes, inventario, facturas).
3. El atacante puede navegar, hacer clic, "vender", "cobrar" — todo funciona visualmente.
4. Tras un **tiempo aleatorio (30-90 segundos)**, empiezan a aparecer **alertas sutiles** que escalan.
5. Finalmente, el sistema se **bloquea irreversiblemente** con un mensaje de que se detectó acceso no autorizado y se envió información del dispositivo a soporte.
6. Para desbloquear: código del superadmin o reinstalación.

**Objetivo:** que el atacante crea que accedió al sistema real, mientras realmente está en una jaula cerrada que registra todo y eventualmente lo bloquea.

---

## 2. Arquitectura del sistema existente

### Componentes ya implementados (base)

| Componente | Ubicación | Estado |
|---|---|---|
| Cuentas decoy (~45) | `DECOY_ACCOUNTS_DEFAULT` en CrozzoAuthSecurity.js | ✅ Listas |
| Detección de decoy en login | `crozzoHoneypotFindDecoyByUser()` | ✅ Funciona |
| Cuarentena legendaria | `hp.legendaryActive` | ⚠️ Desactivada |
| Overlay de honeypot | `#crozzoHoneypotOverlay` en index.html | ✅ Existe |
| Bloqueo por intentos | `crozzoLoginIsLocked()` | ✅ Funciona |
| Registro de intentos | `tripLog`, `tripCount`, `lastTripId` | ✅ Funciona |
| Código de desbloqueo | `unlockCodeHash` + `unlockCodeSalt` | ✅ Existe |
| Modo producción estricta | `produccionEstricta` | ❌ Desactivado |
| Bloqueo irreversible | `crozzoKennyMasterClearAllSecurityBlocks` | ❌ No-op |

### Flujo de login actual

```
handleLoginSubmit()
  → isKennyMasterLogin? (KENNY/141414) → bypass completo
  → honeypot lock activo? → bloqueo
  → crozzoLoginIsRealStaffCandidate(rawUser) → busca usuario real
  → crozzoTryLoginDecoyTrap(rawUser, pwd) → detecta decoy
  → crozzoHoneypotProbeBait() → sondea trampa
  → crozzoHoneypotFindDecoyByUser() → identifica decoy
  → si decoy + scan trigger → crozzoHpExecuteDecoyTrip() → cuarentena
  → si no decoy → login normal o error
```

### Lo que falta

1. **Modo jaula**: cuando un decoy hace login exitoso, cargar datos ficticios en vez de los reales.
2. **Alertas progresivas**: toasts/banners que escalan de sutiles a explícitos.
3. **Bloqueo final**: pantalla de "acceso no autorizado detectado" con datos del dispositivo.
4. **Flag persistente**: marcar el dispositivo como "comprometido" en localStorage.
5. **Código de desbloqueo**: requerir PIN del superadmin para reactivar.

---

## 3. Diseño detallado del sistema honeypot

### 3.1 Detección de decoy en login

**Punto de entrada:** `handleLoginSubmit()` en `CrozzoPosMain.js` (línea ~3486).

**Flujo modificado:**

```javascript
// Después de detectar que el usuario es un decoy:
if (decoy) {
  // En vez de bloquear, activar modo jaula
  window.__crozzoModoJaula = true;
  sessionStorage.setItem('crozzo_modo_jaula', '1');
  sessionStorage.setItem('crozzo_jaula_start', String(Date.now()));
  
  // Cargar datos ficticios
  crozzoJaulaCargarDatosFalsos();
  
  // Login "exitoso" pero en modo jaula
  currentSessionUserId = decoy.rol === 'superadmin' ? 'SUPERADMIN' : decoy.user;
  crozzoFinishLoginSuccess({
    channel: 'local',
    authSource: 'decoy',
    userId: decoy.user,
    toastMessage: 'Bienvenido, ' + decoy.label,
  });
  
  // Programar alertas progresivas
  crozzoJaulaProgramarAlertas();
  return;
}
```

### 3.2 Datos ficticios (modo jaula)

Se deben generar datos que parezcan reales pero sean completamente falsos:

| Dato | Real | Falso (jaula) |
|---|---|---|
| Productos | Productos reales del menú | Productos genéricos con nombres similares |
| Ventas del día | Ventas reales | Ventas ficticias con montos aleatorios |
| Clientes | Clientes reales del CRM | Clientes ficticios con nombres genéricos |
| Inventario | Stock real | Stock ficticio |
| Facturas | Facturas reales | Facturas con CUFE falsos |
| Caja | Caja real | Caja con montos ficticios |
| Usuarios | Usuarios reales | Usuarios ficticios |
| Reportes | Reportes reales | Reportes con datos aleatorios |

**Implementación:** Crear un módulo `CrozzoHoneypotJaula.js` que:
- Intercepte `getUsuariosConfig()`, `config.get()`, etc. cuando `modoJaula === true`.
- Devuelva datos ficticios en lugar de los reales.
- Genere datos consistentes (mismos productos, mismas ventas en toda la sesión).

### 3.3 Alertas progresivas

**Timing aleatorio:**
- **Fase 0 (0-30s):** Sin alertas. El atacante navega libremente. Todo parece normal.
- **Fase 1 (30-60s):** Toast sutil: "Sincronizando datos..." (parece normal).
- **Fase 2 (60-90s):** Toast: "Verificando permisos de dispositivo..." (un poco más sospechoso).
- **Fase 3 (90-120s):** Modal pequeño: "Se detectó un nuevo inicio de sesión en este dispositivo. ¿Fue usted?" con botones Sí/No. (El sistema ignora la respuesta).
- **Fase 4 (120-150s):** Toast rojo: "⚠️ Acceso no autorizado detectado en este dispositivo."
- **Fase 5 (150-180s):** Modal grande: "Se está enviando información del dispositivo a soporte. No cierre la aplicación."
- **Fase 6 (180s+):** Bloqueo total: pantalla roja con datos del dispositivo y mensaje "SISTEMA BLOQUEADO. Contacte a soporte."

**Implementación:** Usar `setTimeout` con delays aleatorios dentro de rangos. Cada fase muestra un componente diferente.

### 3.4 Bloqueo final

**Pantalla de bloqueo:**
```
┌─────────────────────────────────────────────┐
│  🔴 ACCESO NO AUTORIZADO DETECTADO          │
│                                             │
│  Se ha detectado actividad sospechosa en     │
│  este dispositivo.                          │
│                                             │
│  Información registrada:                    │
│  • Dispositivo: [device_id]                 │
│  • IP: [ip]                                 │
│  • Usuario intentado: [user]                │
│  • Pantallas visitadas: [lista]             │
│  • Acciones realizadas: [count]             │
│  • Duración de sesión: [X] min              │
│                                             │
│  Los datos han sido enviados a soporte.     │
│                                             │
│  Para desbloquear, ingrese el código de     │
│  recuperación del superadministrador:       │
│  [____]                                     │
│                                             │
│  [Desbloquear]                              │
│                                             │
│  Si no tiene el código, reinstale la app.   │
└─────────────────────────────────────────────┘
```

**Flag persistente:** `localStorage.setItem('crozzo_jaula_bloqueado', '1')`. La app no carga mientras este flag esté presente.

**Código de desbloqueo:** Comparar con `unlockCodeHash` (ya existe). Si coincide, limpiar el flag y permitir acceso.

### 3.5 Registro de evidencia

Cada acción del atacante en modo jaula se registra:
```javascript
window.__crozzoJaulaLog = window.__crozzoJaulaLog || [];
function jaulaLog(action, detail) {
  window.__crozzoJaulaLog.push({
    ts: Date.now(),
    action: action,
    detail: detail,
    screen: currentPage || 'unknown',
  });
  // Persistir en localStorage cada 10 acciones
  if (window.__crozzoJaulaLog.length % 10 === 0) {
    try { localStorage.setItem('crozzo_jaula_log', JSON.stringify(window.__crozzoJaulaLog)); } catch (_) {}
  }
}
```

---

## 4. Implementación por fases

### Fase 1 — Activar honeypot existente (bajo riesgo)
**Cambios:**
1. `produccionEstricta: true` en config.
2. Activar `legendaryActive: true`.
3. Verificar que los decoys activan la cuarentena.

**Archivos a modificar:**
- `app/core/CrozzoAuthSecurity.js` (activar funciones deshabilitadas).
- localStorage `pos_dian_config` → `seguridad.honeypot`.

**Prueba:** Intentar login con `SUPERADMIN/[REDACTED]` → debe activar cuarentena.

### Fase 2 — Modo jaula con datos falsos (medio riesgo)
**Cambios:**
1. Crear `app/modules/CrozzoHoneypotJaula.js`.
2. Interceptar `getUsuariosConfig()`, `config.get()` cuando `modoJaula === true`.
3. Generar datos ficticios consistentes.
4. Activar `modoJaula` cuando un decoy hace login.

**Archivos a crear/modificar:**
- `app/modules/CrozzoHoneypotJaula.js` (nuevo).
- `app/core/CrozzoPosMain.js` (handleLoginSubmit, getUsuariosConfig, config.get).
- `app/CrozzoManifest.js` (registrar módulo).

**Prueba:** Login con decoy → debe mostrar POS con datos ficticios.

### Fase 3 — Alertas progresivas (medio riesgo)
**Cambios:**
1. Programar toasts/banners con timing aleatorio.
2. Modal de "¿Fue usted?" (ignorar respuesta).
3. Escalada de alertas hasta bloqueo final.

**Archivos a modificar:**
- `app/modules/CrozzoHoneypotJaula.js` (añadir alertas).
- `app/index.html` (añadir overlay de bloqueo final).

**Prueba:** Login con decoy → esperar 30-180s → verificar alertas aparecen.

### Fase 4 — Bloqueo irreversible (alto riesgo)
**Cambios:**
1. Flag persistente `crozzo_jaula_bloqueado`.
2. Pantalla de bloqueo con datos del dispositivo.
3. Código de desbloqueo del superadmin.
4. Registro de evidencia en localStorage.

**Archivos a modificar:**
- `app/modules/CrozzoHoneypotJaula.js` (añadir bloqueo).
- `app/index.html` (añadir overlay de bloqueo).
- `app/core/CrozzoPosMain.js` (verificar flag al arranque).

**Prueba:** Login con decoy → esperar bloqueo → verificar que la app no funciona hasta ingresar código.

---

## 5. Consideraciones de seguridad

### Lo que NO debe hacer el sistema jaula
- **NO** exponer datos reales en ningún momento.
- **NO** permitir que el atacante salga del modo jaula.
- **NO** revelar que es un honeypot hasta el bloqueo final.
- **NO** permitir borrar el flag de bloqueo sin código de superadmin.

### Lo que SÍ debe hacer
- Registrar todo (pantallas, acciones, tiempos).
- Mostrar datos consistentes y creíbles.
- Escalar las alertas gradualmente (no revelar de golpe).
- Bloquear irreversiblemente al final.
- Requerir intervención humana (código de superadmin) para desbloquear.

### Riesgos
- **Falsos positivos:** Un usuario legítimo podría activar el honeypot si usa un ID de decoy por error. Mitigación: solo los decoys exactos (SUPERADMIN, ROOT, etc.) activan la jaula; usuarios normales no.
- **Evasión:** Un atacante sofisticado podría detectar que los datos son falsos (ej. ventas con patrones repetitivos). Mitigación: generar datos con suficiente variabilidad.
- **Bloqueo accidental:** Si el flag persistente se activa por error, el sistema queda inutilizable. Mitigación: código de desbloqueo + backup en servidor.

---

## 6. Próximos pasos

1. **Autorización del usuario** para implementar Fase 1 (activar honeypot existente).
2. **Implementación incremental** con pruebas en cada fase.
3. **Verificación** de que los datos ficticios son consistentes y creíbles.
4. **Documentación** del sistema para el equipo de soporte.

---

*Plan de implementación del sistema honeypot "Jaula de Ratas". Pendiente de autorización para implementar.*