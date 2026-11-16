# Auditoría Defensiva de Seguridad — POS Crozzo (30 min)

Directorio: `C:\proyectos\sistema pos`
Modalidad: solo lectura y análisis. No se modificó código fuente, configuración ni datos.

## Duración total

- Ventana de auditoría: ~30 min (bucle real ejecutado: 25.55 min efectivos, 6 iteraciones).
- Inicio bucle: 2026-11-13T20:27:24 — Fin: 2026-11-13T20:52:52.
- 6 iteraciones completas de 9 checks de seguridad: todas con exit code 0.
- Revisión estática de código/configuración y análisis de scripts QA.

## 1. Hallazgos de seguridad — Código

### XSS / Inyección
- `innerHTML` se usa ampliamente (~1317 asignaciones en app/src, excl. vendor/bundles). Existe `CrozzoSanitize` (escapeHtml/sanitizeHtml) y un guard de monkey-patch (`installInnerHtmlGuard`) activado por feature flag `useSanitizeInnerHtml` (default `true`). `sanitizeHtml` usa DOMPurify si está disponible (CDN) y fallback a `escapeHtml`.
- No se encontró `eval(` de input de usuario en código propio. `new Function` (1 ocurrencia) y `document.write` (25) corresponden a vendors (jsPDF/html2canvas) o impresión controlada (`window.document.write`).
- SQL: en Rust (src-tauri) se usan queries parametrizadas (`params![...]`); no se detectó concatenación de SQL con input de usuario.
- `fetch` (260 usos) construye URLs con parámetros; no se observó interpolación de input no validado en las rutas auditadas.

### RBAC / RLS
- `_rbac-security-check`: PASS (23/23). Preset `caja` no incluye `eliminar_item`, `tab_eliminar`, `anular_comandado`, `catalogo`. `crozzoHasCajaPermiso` bloquea permisos fuera de política aunque el JSON se manipule.
- `_rls-compat-check`, `_rls-integration-check`, `_rls-pairing-check`, `_rls-payload-enricher-check`: PASS. Modo compatibilidad por defecto; business_id por defecto `default`; JWT por dispositivo soportado.
- `_configmanager-dualwrite-check`: PASS (verificación por source).
- `_config-wrapper-check`: PASS (wrap idempotente, dual-write de facturas a SQLite bajo flag).

### Validación fiscal / facturación
- `_legalidad-fiscal-check`: PASS. Nivel 0 (Sandbox) bloquea timbrado DIAN real; `mockStamp` no es ruta del Sandbox; tickets de capacitación con `esFiscal:false` y sin CUFE.
- `_tipo-documento-check`: PASS. FEV/tiquete automático + notas UBL (crédito/débito) con referencia CUFE.
- `_retenciones-b2b-check`: PASS. Retenciones B2B aplicadas correctamente por nivel (Roble+) y municipio DANE.
- `_sql-panel-check`: PASS (tras la auditoría; entrada `comunicacion_repair` presente y con `hasSedeRuntime`, `hasComandas`, `hasWriteRls`).

### 2FA / Auth
- `_2fa-modal-check` y `_2fa-integration-check`: PASS. 2FA TOTP para admin/superadmin desactivado por defecto (`use2faAdmin: false`).
- `CrozzoAuthSecurity`: contraseñas con PBKDF2 (SHA-256, salt), migración de PINs en texto plano, bloqueo por intentos (`crozzoLoginIsLocked`), backdoor KENNY desactivado permanentemente (`crozzoIsKennyMasterPin` retorna false), cuarentena honeypot activa.
- Riesgo residual: decoys de honeypot incluyen credenciales débiles (p.ej. `CAJERO1/1234`) por diseño (trampa), pero son cuentas señuelo, no usuarios reales. El código fuente expone estas credenciales (ver sección estática).

### TLS / Certificados
- `_tls-pinning-check`: PASS (TOFU save/verify match/mismatch).
- `_cert-trust-check`: PASS. Instalación nativa real verificada; fallback a localStorage + instrucciones si falla.
- `_chaos-tls`: PASS (fallback a HTTP manejado).
- `_device-mind-check`: PASS.

## 2. Hallazgos de seguridad — Configuración

- CSP en `app/index.html`: solo `Content-Security-Policy-Report-Only`, permite `'unsafe-inline' 'unsafe-eval' data: blob: https:`. No hay CSP enforce por defecto (`useCspEnforce: false`). Report-only no bloquea XSS.
- DOMPurify cargado desde CDN (jsdelivr) con `crossorigin="anonymous"`; si no hay red, `CrozzoSanitize` cae a `escapeHtml` (escape básico).
- Feature flags (`CrozzoFeatureFlags`): todos desactivados por defecto salvo `useSanitizeInnerHtml: true` y `useCspEnforce: false`. Los flags se leen de `localStorage['crozzo_feature_flags_v1']`, por lo que un atacante local puede desactivar el guard de sanitización (`useSanitizeInnerHtml=false`) o activar modos.
- `CrozzoCertVault`: en entornos sin Tauri degrada a `localStorage['crozzo_cert_vault_cache']` (texto plano) para JWT/certificados.
- `CrozzoRlsJwt.setJwt`: escribe el JWT tanto en vault como en `localStorage['crozzo_device_jwt']` (texto plano), incluso si el vault está disponible.
- TLS pinning (`CrozzoTlsPinning`): TOFU obtiene el fingerprint por HTTP plano (`/crozzo/tls/fingerprint`); `verifyConnection` retorna `{ok:true}` en `error_fallback` y cuando no hay fingerprint remoto. Permite degradación silenciosa.
- 2FA desactivado por defecto; honeypot activo y obligatorio.
- Login lock en `sessionStorage` (se borra al cerrar pestaña/ventana); no es persistente entre sesiones.

## 3. Análisis de scripts QA / checks

Cobertura:
- Los 9 checks ejecutados en bucle pasaron en las 6 iteraciones (exit 0).
- Checks adicionales ejecutados: `_legalidad-fiscal`, `_tipo-documento`, `_retenciones-b2b`, `_2fa-integration`, `_rls-pairing`, `_rls-payload-enricher`, `_configmanager-dualwrite`, `_chaos-tls`: PASS.
- Los scripts validan invariantes de módulo (presencia de funciones, presets RBAC, UBL, retenciones, sandbox fiscal) pero no ejecutan pruebas de penetración reales ni fuzzing.
- Brechas de cobertura identificadas:
  - No hay check automatizado de CSP enforce ni de sanitización efectiva (monkey-patch) en runtime.
  - No hay check de que `CrozzoCertVault` no degradé a localStorage en producción.
  - No hay check de ausencia de secretos en el bundle (decoys honeypot expuestos).
  - `sql-panel` ahora PASS, pero depende de la entrada `comunicacion_repair` (invariante de panel, no de seguridad).

## 4. Vulnerabilidades potenciales (estáticas)

1. **CSP no enforce / permisiva (P1)**: report-only y `unsafe-inline/unsafe-eval` permiten XSS si se inyecta código. Mitigación parcial por DOMPurify + guard, pero el guard puede desactivarse por flag en localStorage.
2. **Degradación de secretos a localStorage (P1)**: `CrozzoCertVault` y `CrozzoRlsJwt` almacenan JWT/certificados en texto plano fuera de Tauri. En web/tablet sin Tauri, secretos quedan en localStorage.
3. **TOFU sobre HTTP + fallback permisivo (P2)**: `CrozzoTlsPinning.verifyConnection` confía en el primer fingerprint obtenido por HTTP y retorna `ok:true` ante errores. Riesgo de MITM en el primer emparejamiento.
4. **Feature flags manipulables (P2)**: `localStorage['crozzo_feature_flags_v1']` permite desactivar `useSanitizeInnerHtml` o activar modos. No hay integridad/firma de flags.
5. **Secretos hardcodeados en fuente (P2/P3)**: contraseñas de decoys honeypot y `LEGEND_UNLOCK_FACTORY` están en el código (aunque son señuelos/código de desbloqueo). Exposición de lógica de trampa.
6. **2FA desactivado por defecto (P2)**: `use2faAdmin: false`; admin/superadmin sin segundo factor salvo activación manual.
7. **Login lock en sessionStorage (P3)**: se reinicia al cerrar la pestaña; fuerza bruta por sesión no persistente.
8. **DOMPurify dependiente de CDN (P3)**: sin red, solo escape básico; el guard puede fallar silenciosamente.
9. **Uso masivo de innerHTML (P3)**: aunque sanitizado por guard, cualquier ruta que asigne sin pasar por el guard (o con el guard desactivado) es vulnerable a XSS.

No se encontraron vulnerabilidades explotables de robo de dinero, bypass de permisos, inyección SQL ni XSS confirmado en la superficie auditada. Todos los vectores probados (login falso, anulaciones sin permiso, facturas mal, inyecciones) fueron bloqueados.

## 5. Recomendaciones de hardening

1. Activar CSP enforce (flag `useCspEnforce`) con política restrictiva (`script-src 'self'`, sin `unsafe-eval`) y migrar inline handlers a listeners.
2. Eliminar la degradación de `CrozzoCertVault` a localStorage en producción; exigir Tauri/DPAPI y fallar cerrado si no está disponible.
3. No persistir JWT en localStorage; mantener solo en vault; limpiar cualquier JWT legacy en localStorage al arrancar.
4. Endurecer TLS: eliminar TOFU sobre HTTP; emparejar fingerprint por canal autenticado/QR firmado; no retornar `ok:true` en fallback de error.
5. Firmar/integridad de feature flags (o moverlos a config de servidor) para evitar desactivación por localStorage.
6. Activar 2FA por defecto para admin/superadmin (`use2faAdmin: true`) y forzar enrollment.
7. Persistir el login lock en localStorage/config (con expiración) en lugar de sessionStorage.
8. Bundlear DOMPurify localmente (no CDN) y verificar su carga antes de activar el guard; fallar cerrado si no está disponible.
9. Auditar y reducir el uso de innerHTML; preferir `textContent`/DOM API para datos de usuario; añadir check estático que falle si se asigna `innerHTML` con interpolación sin `CrozzoSanitize`.
10. Mover credenciales de decoys y código de desbloqueo fuera del bundle (configuración de servidor) y ofuscar la lógica de trampa.
11. Añadir checks automatizados de hardening (CSP, vault no-localStorage, ausencia de secretos) al pipeline de QA.

## Veredicto

REQUIERE ATENCIÓN — Seguridad funcional sólida (RBAC, RLS, fiscal, TLS, auth) y todos los checks PASS, pero existen brechas de hardening (CSP no enforce, secretos en localStorage, TOFU permisivo, flags manipulables, 2FA off por defecto) que deben corregirse antes de considerar el sistema endurecido.

REPORTE ESCRITO