# POS Crozzo — Diseño de Hardening P0 (Seguridad y Compliance)

**Fecha:** 2026-11-11
**Enfoque:** Diseño de controles de seguridad y cumplimiento fiscal (2FA, RLS real, vault de certificados, WAF, CSP enforce). Sin implementación de código complejo; diseño para ejecución en Fase -2/P0.

---

## 1. 2FA para admin/superadmin

### Diseño
- **Método:** TOTP (RFC 6238) vía `otplib` o WebAuthn (passkeys) para mayor seguridad.
- **Flujo:**
  1. Usuario admin/superadmin inicia sesión con usuario+contraseña.
  2. Si 2FA habilitado, solicitar código TOTP (6 dígitos, 30s).
  3. Validar con secreto almacenado en vault (no en localStorage).
  4. Emitir token de sesión con expiración corta (15 min).
- **Almacenamiento:** Secreto TOTP en vault (Supabase Vault / HashiCorp) o DPAPI (Windows) / Keystore (Android).
- **Fallback:** Códigos de recuperación (one-time) generados al habilitar 2FA.
- **Feature flag:** `use2faAdmin` (por defecto false, activar gradualmente).

### Implementación (Fase -2/P0)
- Backend: comando Tauri `crozzo_totp_verify` (Rust) usando `totp-rs` crate.
- Frontend: modal de código TOTP en login para roles admin/superadmin.
- Config: `config.usuarios[i].totpSecret` (cifrado en vault, no en localStorage).

---

## 2. RLS real (Supabase)

### Diseño actual (inseguro)
```sql
CREATE POLICY "allow all" ON comandas FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
```

### Diseño objetivo
- **JWT por dispositivo:** Al emparejar (QR), el dispositivo recibe un JWT firmado por Supabase con claims `business_id`, `device_id`, `role`.
- **Políticas restrictivas:**
  ```sql
  CREATE POLICY "device_isolation" ON comandas
    FOR ALL TO authenticated
    USING (business_id = (auth.jwt() ->> 'business_id'))
    WITH CHECK (business_id = (auth.jwt() ->> 'business_id'));
  ```
- **Modo compatibilidad:** Tablets legacy sin JWT usan anon key con RLS `using (true)` pero con fecha de expiración (ej. 30 días). Después, se requiere JWT.
- **Migración gradual:** Notificar a tablets legacy que deben re-emparejar para obtener JWT.

### Implementación (Fase -2/P0)
- Supabase: configurar JWT claims en `auth.users` o usar service role para emitir tokens por dispositivo.
- Frontend: almacenar JWT en vault (no localStorage); enviar en header `Authorization: Bearer <jwt>`.
- RLS: migrar políticas de `using (true)` a `using (business_id = ...)`.

---

## 3. Vault de certificados

### Diseño
- **Problema actual:** Certificado DIAN solo flag `encrypted` en localStorage; sin verificación de vigencia/firma.
- **Solución:** Migrar certificado a vault:
  - **Desktop:** DPAPI (Windows) o Keychain (macOS) vía Tauri.
  - **Cloud:** Supabase Vault (para backup cifrado).
  - **Android:** Android Keystore.
- **Verificación:** Al cargar, verificar vigencia (`expiryDate`) y firma (certificado válido).
- **Rotación:** Alertar 30 días antes de vencimiento; permitir subir nuevo certificado.

### Implementación (Fase -2/P0)
- Comando Tauri: `crozzo_cert_store_set` / `crozzo_cert_store_get` (DPAPI en Windows).
- Validación: `canGoLive()` verifica `cert.expiryDate > now` y firma válida.
- UI: Mostrar estado del certificado (vigente/vencido/próximo a vencer).

---

## 4. WAF y protección de endpoints

### Diseño
- **WAF:** Cloudflare frente a Supabase (rate limiting, DDoS protection, bot detection).
- **Rate limiting:** Por IP/dispositivo en endpoints críticos (login, facturación, sync).
- **Auditoría externa:** Pentest inicial + escaneo de dependencias en CI.
- **SIEM:** Alertas de seguridad (intentos de login fallidos, accesos no autorizados, cambios de permisos).

### Implementación (Fase 3)
- Cloudflare: configurar WAF rules + rate limiting.
- CI: `npm audit` + `cargo audit` + Snyk/Dependabot.
- SIEM: integrar logs de Supabase + Tauri a un sistema de alertas (ej. Sentry).

---

## 5. CSP enforce

### Diseño
- **Actual:** CSP report-only (añadido en Fase -2).
- **Objetivo:** CSP enforce con `default-src 'self'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: blob:`, `connect-src 'self' https: wss:`.
- **Migración:** Report-only → enforce gradual (feature flag `useCspEnforce`).
- **Trusted Types:** Para `innerHTML` (migrar a DOMPurify + Trusted Types).

### Implementación (Fase 3)
- CSP enforce en `tauri.conf.json` (headers) y meta tag.
- DOMPurify para sanitización de inputs.
- Trusted Types para `innerHTML`.

---

## 6. Eliminación de secretos del bundle

### Diseño
- **Problema:** Contraseñas hardcodeadas (SUPERADMIN: admin123, etc.) y honeypot `decoyPass` en bundle.
- **Solución:** Mover a config en runtime (localStorage/SQLite), no en bundle. Forzar cambio de contraseña en primer login.
- **Honeypot:** Rediseñar sin credenciales en bundle; detección server-side.

### Implementación (Fase -2/P0)
- Redactar `decoyPass` (hecho).
- Redactar contraseñas de usuarios seed (pendiente, alto riesgo de romper login).
- Mover usuarios seed a config inicial (no bundle).
- Forzar cambio de contraseña en primer login.

---

## 7. Veredicto

El hardening P0 requiere:
1. **2FA** (TOTP/WebAuthn) para admin/superadmin.
2. **RLS real** (JWT por dispositivo, políticas restrictivas).
3. **Vault de certificados** (DPAPI/Keystore, verificación de vigencia).
4. **WAF + auditoría externa + pentest.**
5. **CSP enforce + Trusted Types + DOMPurify.**
6. **Eliminación de secretos del bundle.**

**Estimación:** 4-6 semanas adicionales (Fase -2/P0). No bloquea el POS interno; se puede desplegar en paralelo.

---

*Documento de diseño de hardening P0. Complementa `docs/POS-VALIDACION-ESCUDRON.md` y `docs/POS-AUDITORIA-INTERNA-ANTIFRAUDE.md`.*
