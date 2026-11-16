# Plan de seguridad máxima para KENNY (Super Admin global) — 2026-11-15

## Objetivo
Proteger al usuario KENNY (PIN 141414) bajo todos los fundamentos, haciéndolo completamente incógnito. Solo el creador y las personas autorizadas deben saber de su existencia. El código fuente y el navegador no deben revelar su presencia.

## Principios
1. **Kenny no existe en el código visible** — Todas las referencias deben estar ofuscadas.
2. **Kenny no existe en localStorage** — Solo se materializa en memoria al login.
3. **Honeypot de super admin** — Cuentas señuelo que parecen super admins, pero son trampas.
4. **Detección de intentos** — Cada intento de acceso a Kenny se registra.
5. **Multi-factor** — PIN + código de tiempo + verificación de dispositivo.
6. **Cuentas de soporte** — Equipo de trabajo con permisos limitados, creadas desde Kenny.

## Capas de protección

### Capa 1: Ofuscación del código
- Eliminar strings literales "KENNY", "141414" del código fuente
- Renombrar funciones: `crozzoIsKennyMasterPinLogin` → `crozzoVerifyMasterCredential`
- Usar hashing para comparar credenciales (no texto plano)
- Ofuscar nombres de variables sensibles

### Capa 2: Honeypot de super admin
- 5 cuentas señuelo de "super admin": `SOPORTE_GLOBAL`, `ADMIN_MASTER`, `ROOT_SYSTEM`, `SUPERUSER`, `MASTER_KEY`
- Cada una con nombre realista, permisos completos, historial ficticio
- Al usarse, activan la jaula de ratas con panel de "admin falso"
- El atacante cree que encontró el super admin real

### Capa 3: Ocultamiento total de Kenny
- Kenny no aparece en `pos_dian_config` como usuario normal
- Se materializa solo en memoria al login exitoso
- Al cerrar sesión, se elimina de memoria
- No aparece en directorio, logs, ni búsquedas

### Capa 4: Detección de intentos
- Registrar cada intento de login con usuario "KENNY" o PIN "141414"
- Alerta al admin si hay más de 3 intentos fallidos en 5 minutos
- Bloqueo inmediato si alguien intenta acceder a funciones de Kenny sin ser Kenny

### Capa 5: Multi-factor (futuro)
- PIN 141414 como primer factor
- TOTP (Google Authenticator) como segundo factor
- Verificación de dispositivo (fingerprint) como tercer factor

### Capa 6: Cuentas de soporte
- `SOPORTE_1`, `SOPORTE_2`, etc. con permisos limitados
- Crear empresas, conectar DBs, configurar integraciones
- NO tienen acceso a datos de clientes
- Cada acción se registra en auditoría
- Se crean desde la sesión de Kenny

## Implementación inmediata (sin autorización adicional)

1. **Honeypot de super admin** — Añadir 5 decoys de super admin
2. **Ofuscación básica** — Renombrar funciones y eliminar strings literales
3. **Detección de intentos** — Registrar intentos de acceso a Kenny
4. **Ocultamiento en config** — Kenny no aparece en localStorage

## Implementación futura (requiere autorización)

5. **Multi-factor** — TOTP + device fingerprint
6. **Cuentas de soporte** — Sistema de cuentas de equipo
7. **Desactivar backdoor** — Cuando se haya implementado multi-factor

---

*Generado: 2026-11-15*
*Autor: Análisis automatizado*
