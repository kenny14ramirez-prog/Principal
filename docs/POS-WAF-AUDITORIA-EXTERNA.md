# POS Crozzo — WAF y Auditoría Externa (Diseño)

**Fecha:** 2026-11-11
**Enfoque:** Diseño de WAF (Cloudflare), auditoría externa (pentest), escaneo de dependencias y SIEM. Sin implementación de infraestructura; diseño para ejecución en Fase 3.

---

## 1. WAF (Cloudflare)

### Diseño
- **Objetivo:** Proteger endpoints de Supabase y Tauri server (LAN) de ataques (DDoS, SQLi, XSS, bot).
- **Implementación:**
  - Cloudflare como proxy frente a Supabase (custom domain).
  - Reglas WAF: bloquear SQLi, XSS, path traversal.
  - Rate limiting: por IP/dispositivo en endpoints críticos (login, facturación, sync).
  - Bot management: bloquear bots maliciosos.
  - DDoS protection: automático.

### Configuración sugerida
- **Rate limit login:** 5 intentos/min por IP.
- **Rate limit sync:** 60 req/min por dispositivo.
- **Rate limit facturación:** 10 req/min por dispositivo.
- **Geo-blocking:** Bloquear países no operativos (opcional).
- **IP allowlist:** Para admin (opcional).

### Implementación (Fase 3)
- Configurar Cloudflare WAF rules + rate limiting.
- Custom domain para Supabase.
- Monitoreo de bloqueos.

---

## 2. Auditoría externa (pentest)

### Diseño
- **Objetivo:** Identificar vulnerabilidades antes de go-live.
- **Alcance:**
  - Penetration testing (web, API, mobile).
  - Revisión de código (seguridad).
  - Análisis de dependencias (npm audit, cargo audit).
  - Pruebas de carga y estrés.
- **Frecuencia:** Inicial (pre-go-live) + anual.

### Implementación (Fase 3)
- Contratar pentest (empresa certificada).
- Ejecutar `npm audit` + `cargo audit` en CI.
- Snyk/Dependabot para monitoreo continuo.
- Reporte de hallazgos + remediación.

---

## 3. Escaneo de dependencias

### Diseño
- **Herramientas:** `npm audit`, `cargo audit`, Snyk, Dependabot.
- **CI:** Integrar en GitHub Actions.
- **Frecuencia:** En cada PR + semanal.

### Implementación (Fase -2/P0)
- Añadir `npm audit` y `cargo audit` al CI.
- Configurar Dependabot para PRs automáticos.

---

## 4. SIEM (Security Information and Event Management)

### Diseño
- **Objetivo:** Centralizar logs de seguridad y alertar sobre anomalías.
- **Fuentes:** Supabase logs, Tauri logs, frontend errors (Sentry), WAF logs.
- **Alertas:** Intentos de login fallidos, accesos no autorizados, cambios de permisos, anomalías de ventas.
- **Herramientas:** Sentry (frontend + Rust) + Supabase logs + Cloudflare logs.

### Implementación (Fase 3)
- Integrar Sentry en frontend y Rust.
- Configurar alertas en Sentry.
- Dashboard de seguridad (métricas en tiempo real).

---

## 5. Veredicto

WAF + auditoría externa + escaneo de dependencias + SIEM son **esenciales** para go-live en producción. El diseño está completo; la implementación requiere infraestructura externa (Cloudflare, pentest, Sentry) y se ejecuta en Fase 3 (post-estabilización).

**Prioridad:** P2 (Fase 3). No bloquea el POS interno; se puede desplegar en paralelo con la estabilización.

---

*Documento de diseño de WAF y auditoría externa. Complementa `docs/POS-HARDENING-DESIGN.md`.*
