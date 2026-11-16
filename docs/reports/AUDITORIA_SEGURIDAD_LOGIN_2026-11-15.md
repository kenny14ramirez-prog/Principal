# Auditoría de Seguridad — Módulo de Login y Autenticación
## BONA origen POS · 2026-11-15

---

## 1. Resumen ejecutivo

El sistema implementa un esquema de autenticación **100% client-side** (PBKDF2 + sessionStorage + localStorage). La seguridad depende de la integridad del código en el navegador, lo que limita su robustez frente a un atacante con acceso al DOM/consola.

Se identificaron **12 hallazgos**, de los cuales **4 son críticos**, **5 altos** y **3 medios**.

---

## 2. Hallazgos críticos

### H1 — Backdoor KENNY/141414 reactivado (CRÍTICO)
- **Ubicación:** `app/core/CrozzoAuthSecurity.js` (fix aplicado en esta sesión).
- **Descripción:** Se restauró `crozzoIsKennyMasterPinLogin` para aceptar KENNY + 141414. Aunque se desactivó en el código original, el bypass completo (master pin → sesión garantizada sin verificación de contraseña) permite acceso total como Super Admin.
- **Impacto:** Cualquiera que conozca el PIN 141414 (documentado en el código fuente) puede entrar como Super Admin.
- **Recomendación:** Revertir el fix (restaurar `return false`). Si se necesita acceso de emergencia, usar un mecanismo de recuperación fuera del código (ej. archivo de configuración en el servidor).

### H2 — Contraseñas de decoys en texto plano en localStorage (CRÍTICO)
- **Ubicación:** `pos_dian_config` → `seguridad.honeypot.decoys` (45 cuentas con contraseñas en claro).
- **Descripción:** Las contraseñas de todas las cuentas señuelo (SUPERADMIN, ADMIN, ROOT, SOPORTE, etc.) están almacenadas en texto plano en localStorage. Aunque son señuelos, un atacante puede leerlas, identificar el patrón y probarlas contra cuentas reales.
- **Impacto:** Exposición del mecanismo honeypot; posible reutilización de contraseñas en cuentas reales.
- **Recomendación:** Hashear las contraseñas de los decoys (aunque sean señuelos) o eliminarlas del config persistido y generarlas en memoria.

### H3 — Credenciales de usuarios reales en localStorage (CRÍTICO)
- **Ubicación:** `pos_dian_config` → `usuarios.staff` (KENNY, CAJERO, MESERO1, MESERO2).
- **Descripción:** Toda la base de usuarios (IDs, roles, permisos, y en algunos casos claves en texto plano) está en localStorage en texto plano. Un atacante con acceso al navegador puede leer/modificar usuarios directamente.
- **Impacto:** Modificación de permisos, creación de usuarios, escalación de privilegios.
- **Recomendación:** Migrar a un backend con autenticación server-side. En modo offline, cifrar el config con una clave derivada del dispositivo.

### H4 — Autenticación 100% client-side (CRÍTICO)
- **Ubicación:** Todo el módulo de auth.
- **Descripción:** No hay verificación server-side. `crozzoVerifyPassword` compara hashes en el navegador. Un atacante puede modificar el código (DevTools) para saltarse la verificación.
- **Impacto:** Bypass completo de autenticación.
- **Recomendación:** Para modo Tauri (desktop), implementar verificación en Rust (backend). Para modo web, usar Supabase Auth (ya integrado parcialmente).

---

## 3. Hallazgos altos

### H5 — Honeypot desactivado en producción (ALTO)
- **Ubicación:** `pos_dian_config` → `seguridad.honeypot.produccionEstricta = false`.
- **Descripción:** La cuarentena legendaria y el bloqueo por intrusión están desactivados. Los decoys no atrapan intrusos.
- **Recomendación:** Activar `produccionEstricta: true` en producción.

### H6 — KENNY sanitizado sin contraseña (ALTO)
- **Ubicación:** `crozzoSanitizeKennyStaffRecord()` (línea ~5474 de CrozzoPosMain.js).
- **Descripción:** Elimina `requiereClaveInicial` de KENNY, dejándolo sin hash y sin posibilidad de establecer contraseña. Combinado con el backdoor 141414, permite acceso total.
- **Recomendación:** No sanitizar la cuenta KENNY; requerir contraseña inicial como cualquier otro usuario.

### H7 — `prompt()` para PIN de administración (ALTO)
- **Ubicación:** `CrozzoModulosIntegradosAcceso.js:649` (reparado en esta sesión con modal custom).
- **Descripción:** Usaba `prompt()` nativo que puede ser bloqueado por el navegador o eludido.
- **Estado:** Reparado (modal custom con input password).

### H8 — SessionStorage como prueba de sesión (ALTO)
- **Ubicación:** `crozzo_auth_proof_v1` en sessionStorage.
- **Descripción:** La prueba de sesión (proof) se almacena en sessionStorage, accesible desde consola. Un atacante puede inyectar un proof válido si conoce el `CROZZO_BOOT_SESSION_TOKEN` y el `DEVICE_AUTH_KEY`.
- **Mitigación parcial:** El boot token es por-sesión-de-página (UUID aleatorio), y el device key está en localStorage. Un atacante con acceso a consola puede leer ambos.
- **Recomendación:** Vincular el proof a una firma criptográfica del dispositivo (Web Crypto API) que no sea extraíble.

### H9 — Decoy INSTALADOR con contraseña en texto plano (ALTO)
- **Ubicación:** `DECOY_ACCOUNTS_DEFAULT` → `{ user: 'INSTALADOR', pass: 'instalar', rol: 'superadmin' }`.
- **Descripción:** La cuenta INSTALADOR tiene contraseña en texto plano `instalar` con rol superadmin. Si los decoys se activan, esta cuenta es un vector de entrada real.
- **Recomendación:** Hashear la contraseña o eliminar esta cuenta decoy.

---

## 4. Hallazgos medios

### H10 — Política de contraseñas débil (MEDIO)
- **Ubicación:** `crozzoPasswordPolicy` (CrozzoAuthSecurity.js:219).
- **Descripción:** Solo requiere 8 caracteres y bloquea 5 contraseñas comunes. No requiere mayúsculas, números ni símbolos. KENNY no puede usar "kenny" en la contraseña, pero otros usuarios sí pueden usar su nombre.
- **Recomendación:** Requerir al menos 1 mayúscula, 1 número y 1 símbolo para administradores.

### H11 — Bloqueo de intentos en sessionStorage (MEDIO)
- **Ubicación:** `crozzo_login_lock_v1` en sessionStorage.
- **Descripción:** El bloqueo por intentos fallidos se almacena en sessionStorage, que se borra al cerrar la pestaña. Un atacante puede reiniciar el contador cerrando y abriendo la pestaña.
- **Recomendación:** Mover el bloqueo a localStorage o al backend.

### H12 — KENNY no aparece en directorio de usuarios (MEDIO)
- **Ubicación:** `config-usuarios` (solo muestra CAJERO, MESERO1, MESERO2).
- **Descripción:** KENNY está oculto del directorio de usuarios, lo que dificulta su auditoría y gestión. Un administrador no puede cambiar su contraseña desde la UI.
- **Recomendación:** Mostrar KENNY en el directorio (solo lectura para no-superadmin) o añadir una sección dedicada.

---

## 5. Vectores de ataque identificados

| Vector | Descripción | Severidad |
|---|---|---|
| **V1** | Usar KENNY/141414 (backdoor reactivado) para acceso total | Crítico |
| **V2** | Leer `pos_dian_config` en localStorage para obtener contraseñas de decoys y usuarios | Crítico |
| **V3** | Modificar `pos_dian_config` en localStorage para cambiar permisos/roles de cualquier usuario | Crítico |
| **V4** | Modificar código en DevTools para saltarse `crozzoVerifyPassword` | Crítico |
| **V5** | Reiniciar bloqueo de intentos cerrando la pestaña | Medio |
| **V6** | Usar cuenta INSTALADOR/instalar (decoy con rol superadmin) | Alto |
| **V7** | Inyectar proof válido en sessionStorage si se conoce device key + boot token | Alto |

---

## 6. Recomendaciones prioritarias

1. **Revertir el backdoor KENNY/141414** (restaurar `return false` en `crozzoIsKennyMasterPinLogin`).
2. **Migrar autenticación a backend** (Tauri Rust o Supabase Auth) para verificación server-side.
3. **Hashear contraseñas de decoys** o eliminarlas del config persistido.
4. **Cifrar `pos_dian_config`** en localStorage con clave derivada del dispositivo.
5. **Activar `produccionEstricta: true`** en producción.
6. **Mover bloqueo de intentos a localStorage** o backend.
7. **Fortalecer política de contraseñas** (mayúscula + número + símbolo).
8. **Mostrar KENNY en el directorio** para auditoría.

---

## 7. Medidas de seguridad existentes (positivas)

- ✅ PBKDF2 con 120,000 iteraciones para hash de contraseñas.
- ✅ Bloqueo por intentos fallidos (5 intentos → 5 min).
- ✅ Cuarentena legendaria (honeypot) con bloqueo extendido.
- ✅ Proof de sesión vinculado a boot token (anti-replay por reload).
- ✅ Device auth key (localStorage) para firma de proof.
- ✅ Sanitización de KENNY (elimina requiereClaveInicial).
- ✅ Desactivación del backdoor 141414 en el código original.
- ✅ CSP (Content Security Policy) configurado en Tauri.
- ✅ Decoys de mantenimiento filtrados en producción estricta.

---
*Auditoría de seguridad realizada sobre el código fuente y el comportamiento en navegador.*