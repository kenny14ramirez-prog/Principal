# Informe Consolidado — Triangulación de Agentes

> **Metodología:** 3 agentes investigaron independientemente desde perspectivas distintas. Los resultados se constataron cruzando hallazgos. El General (IA) verifica y decide. Asuntos Internos (seguridad) valida las decisiones.

---

## 1. Constatación cruzada (qué encontraron los 3)

### Hallazgos coincidentes (alta confianza)

| # | Hallazgo | Infra | UX | Seguridad | Severidad consensuada |
|---|----------|-------|-----|-----------|----------------------|
| 1 | **Phantom state** (stored > binary → no ofrece update) | ✅ | — | ✅ | **Crítica** |
| 2 | **Firma/integridad** (registry sin firma, APK sin verificación de certificado) | — | — | ✅ | **Crítica** |
| 3 | **Comandos Tauri sin allowlist** (install_from_url arbitrario + XSS) | — | — | ✅ | **Crítica** |
| 4 | **Estado atascado en memoria** (_installInProgress sin recuperación) | ✅ | ✅ | — | **Alta** |
| 5 | **Botones destructivos sin confirmación** (Restablecer avisos, Forzar update) | — | ✅ | — | **Alta** |
| 6 | **Mensajes técnicos expuestos** (GitHub Actions, release not ready) | — | ✅ | — | **Media** |
| 7 | **Concurrencia multi-pestaña** (descargas duplicadas) | ✅ | — | — | **Alta** |
| 8 | **CSP permisiva** (unsafe-inline + connect-src *) | — | — | ✅ | **Media** |
| 9 | **Reintentos insuficientes** (2 × 2s fijos) | ✅ | — | — | **Media** |
| 10 | **Lease TTL insuficiente** (120s para APK/exe grandes) | ✅ | — | — | **Media** |

### Hallazgos únicos por agente

| Agente | Hallazgo único | Severidad |
|--------|----------------|-----------|
| Infra | `recoverStore()` corre antes del registry → pendingRestart nunca encuentra entry | Alta |
| Infra | `enqueueUpdate` no idempotente en estados terminales (id aleatorio) | Media |
| Infra | `setInterval` sin guard de duplicación ni cleanup | Media |
| Infra | Watchdog de 5 min no se cancela | Baja |
| UX | Card crítica mostrada una sola vez por sesión (puede ocultar info) | Baja |
| UX | Build-only updates no se diferencian visualmente de versión nueva | Baja |
| UX | Falta focus trap + ESC en modales | Media |
| UX | Barras de progreso sin ARIA | Baja |
| Seguridad | macOS signingIdentity "-" (ad-hoc, sin notarización) | Media |
| Seguridad | Keystore Android en GitHub Actions cache (cache poisoning) | Media |
| Seguridad | Downgrade via manipulación de localStorage | Alta |
| Seguridad | Store v2 sin firma/MAC (manipulable) | Alta |

---

## 2. Decisión del General (verificación y priorización)

### Prioridad 0 — Crítico (implementar YA)

| # | Decisión | Justificación | Agente que lo reportó |
|---|----------|---------------|----------------------|
| 1 | **Firmar registry.json/latest.json** con minisign y verificar en cliente antes de usar | Sin esto, compromiso del repo = malware distribuido a todos los clientes | Seguridad |
| 2 | **Allowlist de hosts en comandos Rust** (install_from_url, crozzo_http) — solo GitHub | XSS + comando arbitrario = RCE | Seguridad |
| 3 | **Eliminar install_setup_from_url con URL arbitraria** o restringir a URLs verificadas de GitHub Releases | Vector de ejecución remota | Seguridad |
| 4 | **Verificar SHA-256 de artefactos** post-descarga antes de ejecutar | Sin hash, archivo corrupto/tampered se instala | Seguridad + Infra |
| 5 | **Corregir recoverStore()** — mover después de cargar registry | pendingRestart nunca se procesa | Infra |

### Prioridad 1 — Alta (implementar en 1-2 semanas)

| # | Decisión | Justificación | Agente |
|---|----------|---------------|--------|
| 6 | **Confirmación antes de "Restablecer avisos" y "Forzar update"** | Destructivo sin confirmación | UX |
| 7 | **Deshabilitar botones durante ejecución** (Comprobar ahora, Forzar) | Concurrencia + UX | UX + Infra |
| 8 | **Indicador persistente de descarga en segundo plano** | Usuario no sabe que se está actualizando | UX |
| 9 | **Persistir versión instalada en almacenamiento seguro** (no solo localStorage) | Previene downgrade via manipulación | Seguridad |
| 10 | **Verificar fingerprint del certificado APK** en Rust | APK malicioso puede pasar validación | Seguridad |
| 11 | **Corregir lease TTL** — refresh en heartbeat, TTL proporcional al tamaño | Lease expira durante descargas grandes | Infra |
| 12 | **Idempotencia real en enqueueUpdate** — no duplicar en estados terminales | Cola se llena de duplicados | Infra |

### Prioridad 2 — Media (implementar en 2-4 semanas)

| # | Decisión | Justificación | Agente |
|---|----------|---------------|--------|
| 13 | **Endurecer CSP** (eliminar unsafe-inline, restringir connect-src) | Reduce impacto de XSS | Seguridad |
| 14 | **Focus trap + ESC en modales** | Accesibilidad | UX |
| 15 | **Mensajes de error amables** (sin jerga técnica) | UX para usuario no técnico | UX |
| 16 | **Reintentos con backoff exponencial** (no 2×2s fijos) | Mejora resiliencia de red | Infra |
| 17 | **Fallback real a endpoint alternativo** | Si GitHub falla, usar mirror | Infra |
| 18 | **Cleanup de temporales + manejo de disco lleno** | Previene fallos silenciosos | Infra |
| 19 | **Permitir más roles forzar update en Android** | Dependencia de Super Admin | UX |
| 20 | **No tratar signature mismatch como recuperable** | Enmascara bloqueo real | Seguridad |

### Prioridad 3 — Baja (backlog)

| # | Decisión | Justificación | Agente |
|---|----------|---------------|--------|
| 21 | Simplificar wizard opcional a vista única | UX | UX |
| 22 | Diferenciar parche vs versión nueva | UX | UX |
| 23 | ARIA en barras de progreso | Accesibilidad | UX |
| 24 | Notarización macOS | Seguridad | Seguridad |
| 25 | Proteger cache de keystore Android | Seguridad | Seguridad |
| 26 | Card crítica mostrada una sola vez → mostrar cada vez | UX | UX |

---

## 3. Validación de Asuntos Internos (seguridad)

### Decisiones validadas ✅

| Decisión | Validación | Nota |
|----------|-----------|------|
| Firmar registry | ✅ Validado — crítico para supply chain | Implementar con minisign o ed25519 |
| Allowlist en Rust | ✅ Validado — cierra vector RCE | Solo `github.com`, `raw.githubusercontent.com`, `api.github.com` |
| SHA-256 de artefactos | ✅ Validado — necesario para integridad | Publicar hash en registry firmado |
| Persistir versión en storage seguro | ✅ Validado — previene downgrade | Usar Tauri store plugin o keychain |
| Fingerprint APK | ✅ Validado — cierra gap de sideload | Verificar en Rust antes de instalar |
| No tratar signature mismatch como recuperable | ✅ Validado — evita bucles | Marcar como bloqueante, no recuperable |

### Decisiones con observaciones ⚠️

| Decisión | Observación | Acción |
|----------|------------|--------|
| Corregir recoverStore() (mover después de registry) | ✅ Correcto, pero asegurar que no rompe el flujo de pendingRestart existente | Testear con update pendiente |
| Lease TTL proporcional | ⚠️ Asegurar que el heartbeat se envía cada 5s durante descarga activa | Implementar refreshLease en heartbeat |
| Idempotencia en enqueueUpdate | ⚠️ Necesita manejar estados 'done' y 'abandoned' correctamente | Agregar guard para no re-encolar terminales |
| Endurecer CSP | ⚠️ 'unsafe-inline' es necesario para el frontend actual (estilos inline) | Migrar a nonces incrementalmente |

### Decisiones rechazadas ❌

| Decisión propuesta | Razón de rechazo | Alternativa |
|-------------------|-----------------|-------------|
| Eliminar withGlobalTauri | Rompería el frontend actual que usa __TAURI__ | Restringir comandos expuestos en su lugar |
| Notarización macOS inmediata | Requiere cuenta Apple Developer ($99/año) | Priorizar para Fase 3 |
| Eliminar unsafe-inline de inmediato | Requiere refactor masivo del frontend | Migrar incrementalmente con nonces |

---

## 4. Plan de implementación consolidado

### Sprint 1 (P0) — Seguridad crítica + corrección de recoverStore
**Duración:** 3-5 días

1. **Firmar registry.json** con minisign en el workflow de publicación
2. **Verificar firma en cliente** antes de usar el registry
3. **Allowlist de hosts** en `install_setup_from_url`, `install_dmg_from_url`, `crozzo_http_get_text`, `crozzo_http_head`
4. **Restringir install_from_url** a URLs que coincidan con `github.com/{owner}/{repo}/releases/`
5. **Corregir recoverStore()** — mover después de cargar registry
6. **Verificar SHA-256** de artefactos post-descarga

### Sprint 2 (P1) — UX + resiliencia
**Duración:** 5-7 días

7. **Confirmaciones** en botones destructivos
8. **Deshabilitar botones** durante ejecución
9. **Indicador persistente** de descarga
10. **Lease TTL proporcional** + refresh en heartbeat
11. **Idempotencia real** en enqueueUpdate
12. **Persistir versión** en almacenamiento seguro (Tauri store)
13. **Verificar fingerprint APK** en Rust

### Sprint 3 (P2) — Hardening + UX
**Duración:** 5-7 días

14. **Endurecer CSP** incrementalmente
15. **Focus trap + ESC** en modales
16. **Mensajes amables**
17. **Reintentos con backoff exponencial**
18. **Fallback real a endpoint alternativo**
19. **Cleanup de temporales + disco lleno**
20. **Permitir más roles forzar update en Android**
21. **No tratar signature mismatch como recuperable**

### Sprint 4 (P3) — Pulido + tests
**Duración:** 3-5 días

22. Simplificar wizard opcional
23. ARIA en barras de progreso
24. Tests unitarios (sanitizeStore, isEntryApplied, backoffMs, recover)
25. Tests de integración (Playwright)
26. Validación de registry en CI

---

## 5. Criterios de aceptación finales (pilar "jamás falla")

### Seguridad
- [ ] Registry firmado y verificado en cliente
- [ ] Allowlist de hosts en comandos Rust
- [ ] SHA-256 verificado post-descarga
- [ ] Fingerprint APK verificado
- [ ] Versión instalada en storage seguro
- [ ] CSP sin unsafe-inline (incremental)

### Resiliencia
- [ ] recoverStore() procesa pendingRestart correctamente
- [ ] Lease con TTL proporcional + refresh en heartbeat
- [ ] enqueueUpdate idempotente en todos los estados
- [ ] Reintentos con backoff exponencial
- [ ] Fallback real a endpoint alternativo
- [ ] Cleanup de temporales + manejo de disco lleno

### UX
- [ ] Confirmación en botones destructivos
- [ ] Botones deshabilitados durante ejecución
- [ ] Indicador persistente de descarga
- [ ] Mensajes sin jerga técnica
- [ ] Focus trap + ESC en modales

### Tests
- [ ] Tests unitarios pasan
- [ ] Tests de integración pasan
- [ ] Validación de registry en CI bloquea publicación si falla

---

## 6. Referencias

### Informes de agentes
- `INFORME_INFRA_RESILIENCIA_UPDATES.md` — Agente de Infraestructura
- (UX) — Agente de UX (informe en resultado de subagente)
- (Seguridad) — Agente de Seguridad (informe en resultado de subagente)

### Documentos técnicos
- `docs/PLAN-FORTALEZA-ACTUALIZACIONES.md` — Plan de fortaleza completo
- `docs/UPDATE-STATE-HONEST-RESILIENT.md` — Estado honesto y resiliente
- `docs/PLAN-VERIFICACION-ACTUALIZACIONES.md` — Plan de verificación
- `updater-robusto-tauri.md` — Updater robusto en Tauri
- `ANDROID_SIDELOAD_UPDATE_RECOMMENDATIONS.md` — Android sideload
- `docs/FRONTEND-PWA-UPDATE-ROBUST-PATTERNS.md` — OTA web/PWA
- `docs/TELEMETRIA-ACTUALIZACIONES-CANARY.md` — Telemetría y canary

### Archivos modificados
- `app/infra/CrozzoSystemUpdates.js` — Store v2, sanitización, recover, lease, cola, markEntryFullyApplied
- `src/infra/CrozzoSystemUpdates.js` — Sync de app/

---

**Verificado por:** General (IA) — Constatación cruzada de 3 agentes
**Validado por:** Asuntos Internos (Seguridad) — Decisiones P0/P1 validadas, P2/P3 con observaciones
**Fecha:** 2026-11-09