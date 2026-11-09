# Plan de Testing Virtual Exhaustivo — Crozzo POS

> Objetivo: maximizar la probabilidad de que el sistema funcione en dispositivos reales, detectando el mayor número de errores posible antes de tocar hardware físico.

---

## 1. Estado actual de testing

| Tipo | Cobertura | Herramientas | Gaps críticos |
|------|-----------|--------------|---------------|
| Unit (Node vm) | ~30-35% | 31 scripts _*.mjs | WebRTC, TLS, IndexedDB, Cloud Discovery, Cert Pinning |
| Integration | ~15-20% | Flujos _*-check.mjs | Sin backend real, sin sync real |
| E2E (Playwright) | ~40-45% | 35 scripts | Sin Tauri real, sin dispositivos |
| Property (Rust proptest) | ~10% | sync_props.rs | fast-check roto (dependencia faltante) |
| Stress | ~50% | qa-stress-* | Sin datos reales (1000+ productos) |
| Chaos | ~20-25% | _chaos-network-check | Sin red real, sin dispositivos |

**Cobertura global estimada: ~35-45%** (solo navegador, sin Tauri, sin backend real, sin dispositivos).

---

## 2. Estrategia de testing virtual exhaustivo

### 2.1 Pirámide de testing (de base a cima)

```
                    ┌─────────────┐
                    │  E2E Real   │  ← Dispositivos físicos (fase final)
                    │  (hardware)  │
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │  E2E Virtual│  ← Playwright + Tauri mock + Supabase mock
                    │  (navegador) │
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │ Integration │  ← Flujos completos con mocks
                    │  (Node vm)  │
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │    Unit     │  ← Funciones puras, invariantes
                    │  (Node vm)  │
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │  Property   │  ← Invariantes con inputs aleatorios
                    │  (proptest) │
                    └─────────────┘
```

### 2.2 Capas de testing virtual

#### Capa 1: Unit tests (funciones puras)
- **Qué:** Funciones sin efectos secundarios (digest, hash, merge, validación).
- **Cómo:** Node vm con contexto mínimo.
- **Cobertura objetivo:** 80% de funciones puras.
- **Gaps a cubrir:** digest LAN, outbox key, merge snapshots, validación de NIT, UBL/CUFE.

#### Capa 2: Integration tests (flujos con mocks)
- **Qué:** Flujos completos (comanda → sync → cocina) con mocks de Supabase, LAN, impresora.
- **Cómo:** Node vm con mocks de fetch, localStorage, Supabase.
- **Cobertura objetivo:** 60% de flujos críticos.
- **Gaps a cubrir:** WebRTC signaling, TLS pinning, IndexedDB, Cloud Discovery.

#### Capa 3: E2E virtual (navegador + mocks)
- **Qué:** App completa en navegador con mocks de Tauri y backend.
- **Cómo:** Playwright + servidor estático + mock backend.
- **Cobertura objetivo:** 70% de flujos de usuario.
- **Gaps a cubrir:** Pairing QR end-to-end, offline real, reconnect sync.

#### Capa 4: Property-based (invariantes)
- **Qué:** Invariantes que deben cumplirse para cualquier input.
- **Cómo:** proptest (Rust) + fast-check (JS, instalar dependencia).
- **Cobertura objetivo:** 100% de invariantes documentadas.
- **Gaps a cubrir:** dedup, LWW, merge, digest, outbox idempotencia.

#### Capa 5: Stress/Chaos
- **Qué:** Carga, concurrencia, fallos de red, corrupción de datos.
- **Cómo:** qa-stress-* + _chaos-network-check.
- **Cobertura objetivo:** 80% de escenarios de fallo.
- **Gaps a cubrir:** 1000+ productos reales, 20+ dispositivos simulados.

#### Capa 6: E2E real (hardware)
- **Qué:** Pruebas en dispositivos físicos.
- **Cómo:** 2+ tablets + caja + impresora real.
- **Cobertura objetivo:** 100% de criterios de éxito.

---

## 3. Plan de implementación de tests virtuales

### 3.1 Fase A — Corregir tooling roto (1 día)
- [ ] Instalar `fast-check` en devDependencies (roto `_sync-property-check.mjs`).
- [ ] Instalar `@playwright/test` si no está.
- [ ] Crear `_test-runner.mjs` que ejecute todos los checks en secuencia.

### 3.2 Fase B — Unit tests para módulos nuevos (2-3 días)
- [ ] `_tls-pinning-check.mjs`: verificar CrozzoTlsPinning (verify, save, TOFU, mismatch).
- [ ] `_cert-trust-check.mjs`: verificar CrozzoCertTrust (install, TOFU, fallback).
- [ ] `_indexeddb-check.mjs`: verificar CrozzoRuntimeIndexedDb (open, get, set, delete, getAll, fallback).
- [ ] `_cloud-discovery-check.mjs`: verificar CrozzoCloudDiscovery (register, pull, discover, heartbeat).
- [ ] `_webrtc-p2p-check.mjs`: verificar CrozzoWebRtcP2P (createOffer, createAnswer, send, fallback).
- [ ] `_channel-fallback-check.mjs`: verificar CrozzoChannelFallback (tryLan, tryCloud, tryHotspot, runFallback).
- [ ] `_print-queue-check.mjs`: verificar CrozzoPrintQueue (enqueue, drain, retry, backoff).
- [ ] `_connectivity-ux-check.mjs`: verificar CrozzoConnectivityUx (indicator, banner, audit).

### 3.3 Fase C — Integration tests (3-5 días)
- [ ] `_integration-comanda-flow.mjs`: comanda → sync LAN → cocina → cobro → factura (con mocks).
- [ ] `_integration-offline-reconnect.mjs`: offline → operar → reconectar → sync (con mocks).
- [ ] `_integration-pairing-flow.mjs`: QR → pairing → conexión → comandar (con mocks).
- [ ] `_integration-print-flow.mjs`: comanda → cola impresión → retry → éxito.
- [ ] `_integration-tls-flow.mjs`: cert gen → pinning → WSS → verificación.

### 3.4 Fase D — Property-based (2-3 días)
- [ ] Instalar fast-check.
- [ ] `_property-digest.mjs`: digest invariante (mismo estado → mismo hash).
- [ ] `_property-outbox.mjs`: outbox idempotencia (mismo consecutivo → mismo resultado).
- [ ] `_property-merge.mjs`: merge de snapshots (no perder mesas de otros).
- [ ] `_property-lww.mjs`: LWW no contradicción.

### 3.5 Fase E — E2E virtual completo (5-7 días)
- [ ] `_e2e-pairing.mjs`: pairing QR end-to-end en navegador.
- [ ] `_e2e-offline.mjs`: offline real (desconectar red, operar, reconectar).
- [ ] `_e2e-multi-device.mjs`: 3+ dispositivos simulados con sync.
- [ ] `_e2e-inventory.mjs`: compra → stock → venta → descuento.

### 3.6 Fase F — Stress/Chaos avanzado (3-5 días)
- [ ] `_stress-1000-products.mjs`: inyección de 1000+ productos con datos reales.
- [ ] `_stress-20-devices.mjs`: simulación de 20 dispositivos con sync.
- [ ] `_chaos-tls.mjs`: fallo de TLS → fallback a HTTP.
- [ ] `_chaos-indexeddb.mjs`: corrupción de IndexedDB → recuperación.

---

## 4. Probabilidad de detección de errores

### Con testing actual (35-45% cobertura)
- **Probabilidad de detectar bug de conectividad:** ~40%
- **Probabilidad de detectar bug de sync:** ~50%
- **Probabilidad de detectar bug de fiscal:** ~70%
- **Probabilidad de detectar bug de UX:** ~30%

### Con testing virtual exhaustivo (objetivo 80% cobertura)
- **Probabilidad de detectar bug de conectividad:** ~75%
- **Probabilidad de detectar bug de sync:** ~85%
- **Probabilidad de detectar bug de fiscal:** ~90%
- **Probabilidad de detectar bug de UX:** ~70%
- **Probabilidad de detectar bug de storage:** ~80%
- **Probabilidad de detectar bug de cifrado:** ~75%

### Con testing virtual + real (objetivo 95% cobertura)
- **Probabilidad de detectar bug antes de producción:** ~95%
- **Probabilidad de éxito en dispositivos reales:** ~90-95%

---

## 5. Herramientas a instalar

```json
{
  "devDependencies": {
    "fast-check": "^3.15.0",
    "@playwright/test": "^1.40.0",
    "msw": "^2.0.0",
    "fake-indexeddb": "^5.0.0",
    "jsdom": "^24.0.0"
  }
}
```

---

## 6. Runner de tests continuos

Crear `scripts/_test-runner.mjs` que:
1. Ejecuta todos los checks en secuencia.
2. Genera reporte consolidado.
3. Falla si algún check falla.
4. Se ejecuta en CI/CD.

---

## 7. Métricas de éxito

| Métrica | Actual | Objetivo |
|---------|--------|----------|
| Cobertura unit | 30-35% | 80% |
| Cobertura integration | 15-20% | 60% |
| Cobertura E2E | 40-45% | 70% |
| Cobertura property | 10% | 100% |
| Probabilidad detección bug | ~40-50% | ~80-90% |
| Probabilidad éxito en hardware | ~60% | ~90-95% |

---

## 8. Recomendación del Alto Mando

**Prioridad inmediata (hoy):**
1. Instalar `fast-check` y corregir `_sync-property-check.mjs`.
2. Crear `_test-runner.mjs` para ejecución continua.
3. Implementar los 8 checks unit de la Fase B.

**Prioridad corto plazo (esta semana):**
4. Integration tests (Fase C).
5. Property-based (Fase D).

**Prioridad mediano plazo (próxima semana):**
6. E2E virtual completo (Fase E).
7. Stress/Chaos avanzado (Fase F).

**Con este plan, la probabilidad de éxito en dispositivos reales sube de ~60% a ~90-95%.**
