# POS Crozzo — Sistema de Auditoría Interna y Anti-Fraude (Contraespionaje de Caja)

**Fecha:** 2026-11-11
**Módulos analizados:** `app/modules/CrozzoAiInsights.js`, `app/core/CrozzoAuthSecurity.js` (honeypot, KENNY), `app/core/CrozzoA11yUser.js`, `app/modules/CrozzoCierreTurnos.js`, `app/core/pos/CrozzoPosFacturasPage.js`.
**Enfoque:** Sistema de auditoría interna para detectar patrones de robo/fraude por cajeros, meseros, administradores. Superadmin oculto (código/combinación de teclas). IA para análisis de métricas agregadas.

---

## 1. Descripción del sistema

### 1.1 Acceso superadmin oculto
- **Entrada:** Combinación de teclas / código (KENNY + 141414) en `CrozzoAuthSecurity.js` (línea 698: "KENNY + 141414: levanta bloqueos de intentos, honeypot y cuarentena legendaria").
- **Propósito:** Validación del sistema a largo plazo; auditoría interna; forzar cierre de cuarentena.
- **No es un ingreso normal:** No aparece en UI estándar; solo superadmin lo conoce.
- **Auditoría:** Cada activación queda registrada (`config.addAudit('honeypot_leyenda_clear', ...)`).

### 1.2 Honeypot (trampa)
- **Ubicación:** `CrozzoAuthSecurity.js` (líneas 675-730, 1137-1160, 1440-1510).
- **Función:** Usuarios señuelo (decoy) con contraseñas conocidas; si alguien intenta login con ellos, se dispara `honeypot_disparado` con tripId, decoyUser, channel.
- **Detección:** Login con usuario decoy → registro de auditoría + cuarentena.
- **Debilidad:** `decoyPass` hardcodeado en bundle (redactado en Fase -2); honeypot detectable por ingeniería inversa.

### 1.3 Auditoría IA (contraespionaje de caja)
- **Módulo:** `CrozzoAiInsights.js`.
- **Dos motores:**
  1. **NVIDIA (cloud):** `probeConnection` con API key `nvapi-…`. Envía pack JSON de métricas agregadas (ventas, voids) a NVIDIA. Sistema: "Eres auditor operativo de un restaurante/café en Colombia (contraespionaje de caja). Recibes SOLO métricas agregadas. Nunca digas 'es ladrón' ni afirmes delito; habla de patrones a revisar."
  2. **Ollama (local/offline):** `requestLocalBehaviorInsight`. Analiza cierres con modelo local (qwen2.5, llama3.2, etc.). Genera resumen ejecutivo con alertas de anomalías (diferencias de arqueo, voids excesivos, patrones inusuales).
- **Datos analizados:** `buildBehaviorPack` / `buildPeriodPack` — métricas agregadas de ventas, voids, diferencias de arqueo, patrones por turno/usuario.
- **Salida:** Diagnóstico breve + hasta 3 hallazgos con cifras + 3 preguntas al encargado. Nunca afirma delito; habla de patrones a revisar.
- **Rate limiting:** `peekBehaviorRateLimit` / `commitBehaviorRateSuccess` / `clearBehaviorRateLimit` (evitar abuso).

### 1.4 Cierre de turnos y arqueo
- **Módulo:** `CrozzoCierreTurnos.js`.
- **Función:** Sesión de día operativo, turnos mañana/tarde/día. Métricas por turno filtrando facturas válidas. `canPerformArqueo()` por permiso. Hash de facturas por turno (`computeFacturasSnapshot`) para detectar cambios post-cierre. Auto-cierre con diff 0 asumido (riesgo).
- **Auditoría:** `config.addAudit` en login, factura emitida/anulada, honeypot, cierre de turno, migración de claves.

### 1.5 Anulación y reversión
- **Módulo:** `CrozzoReversionInventario.js` (corregido).
- **Función:** Anular factura restaura stock + genera movimiento `entrada_devolucion`. Solo admin/encargado. Idempotente.

---

## 2. Análisis del sistema anti-fraude

### 2.1 Fortalezas
- **IA para contraespionaje de caja:** Análisis de métricas agregadas (ventas, voids, arqueo) con NVIDIA y Ollama. No afirma delito; habla de patrones.
- **Honeypot:** Trampa con usuarios señuelo; detección de intentos de acceso no autorizado.
- **Auditoría encadenada:** Hash de facturas por turno para detectar cambios post-cierre.
- **Superadmin oculto:** Acceso por código/teclas, no visible en UI estándar.
- **Rate limiting:** Evita abuso de la IA.
- **Sin afirmar delito:** El sistema habla de patrones a revisar, no de culpabilidad.

### 2.2 Debilidades
- **Honeypot con secretos en bundle:** `decoyPass` hardcodeado (redactado en Fase -2, pero el valor real sigue en copias antiguas).
- **Honeypot detectable:** Por ingeniería inversa del bundle.
- **IA depende de NVIDIA (cloud):** Si no hay internet, solo Ollama local (requiere instalación).
- **Rate limiting por dispositivo:** Puede ser eludido con múltiples dispositivos.
- **Auto-cierre con diff 0 asumido:** Puede ocultar faltantes.
- **Sin control optimista de inventario:** Concurrencia multi-terminal sin bloqueo.
- **Sin nota crédito DIAN:** Anulación solo local.
- **Sin 2FA:** Admin/superadmin sin autenticación de dos factores.
- **Sin WAF/SIEM:** No hay protección de endpoints ni alertas de seguridad.

### 2.3 Patrones detectables (métricas básicas)
El sistema puede detectar:
1. **Diferencias de arqueo** (efectivo declarado vs. calculado).
2. **Voids excesivos** (anulaciones frecuentes).
3. **Patrones inusuales** (ventas fuera de horario, tickets sin productos, descuentos excesivos).
4. **Cambios post-cierre** (hash de facturas alterado).
5. **Intentos de acceso con usuarios decoy** (honeypot disparado).
6. **Login fallidos repetidos** (bloqueo por intentos).

### 2.4 Métricas de seguridad interna (a implementar)
- **Por cajero:** voids/día, descuentos/día, diferencias de arqueo, tickets anulados, ventas fuera de horario.
- **Por turno:** hash de facturas, total ventas, total anulaciones, diferencias.
- **Por administrador:** cambios de permisos, anulaciones, modificaciones de config.
- **Alertas:** umbral de voids, umbral de diferencias, patrones inusuales.

---

## 3. Recomendaciones para fortalecer el sistema anti-fraude

### P0 — Crítico (antes de go-live)
1. **Eliminar secretos del bundle:** Redactar `decoyPass` (hecho) y contraseñas hardcodeadas (FACTURACION, etc.).
2. **2FA para admin/superadmin:** TOTP o WebAuthn.
3. **Honeypot server-side:** Mover detección a backend (no en bundle).
4. **WAF + rate limiting** en endpoints críticos.
5. **Auditoría externa + pentest.**

### P1 — Robustez (Fases 0-1)
6. **Métricas por cajero/turno/administrator** con alertas configurables.
7. **Control optimista de inventario** (bloqueo por versión).
8. **Nota crédito DIAN** o bloqueo de anulación en modo FE.
9. **SIEM + alertas de seguridad.**
10. **CSP enforce + Trusted Types.**

### P2 — Mejora continua (Fases 2-3)
11. **IA local (Ollama) offline** para análisis sin internet.
12. **Dashboard de seguridad** con métricas en tiempo real.
13. **Exportación de reportes de auditoría** (PDF/CSV).
14. **Integración con contabilidad** (exportación de movimientos).

---

## 4. Veredicto

El sistema de auditoría interna (contraespionaje de caja) es **funcional y bien diseñado** en su concepto (IA para patrones, honeypot, superadmin oculto, hash de facturas). Sin embargo, tiene **debilidades de seguridad** (secretos en bundle, honeypot detectable, sin 2FA/WAF/SIEM) que deben corregirse antes de go-live. La IA (NVIDIA + Ollama) es un buen enfoque para detectar patrones sin afirmar delito.

**Recomendación:** Fortalecer el sistema anti-fraude con las recomendaciones P0/P1 antes de desplegar en producción. El POS interno debe tener métricas de seguridad básicas (voids, arqueo, patrones) integradas en el dashboard de observabilidad.

---

*Documento de análisis del sistema de auditoría interna y anti-fraude. Complementa `docs/POS-INTERNO-SUPREMO.md` y `docs/POS-VALIDACION-ESCUDRON.md`.*
