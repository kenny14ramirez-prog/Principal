# POS Crozzo — POS Interno de Alto Rendimiento (Supremo)

**Fecha:** 2026-11-11
**Enfoque:** Sistema POS interno (caja, mesas, comandas, cocina, tablets, inventario, impresión, permisos, offline, comunicación). **Sin tocar fiscal/gobierno** (Dataico/Siigo se conectan después, vía adaptador).
**Principio rector:** Blindar, mejorar y actualizar el POS interno sin dañar lo existente; más estabilidad, más fuerza, más poder; todo al 100%.

---

## 1. Visión

Un POS interno **offline-first, multi-dispositivo, de alto rendimiento** que:
- Funciona al 100% sin internet (caja, mesas, comandas, cocina, inventario, impresión).
- Sincroniza de forma confiable entre PC caja, tablets y cocina (cloud + LAN + mesh + P2P).
- No pierde datos, no duplica, no resucita mesas pagadas, no pierde comandas.
- Escala de 1 a N dispositivos sin degradación.
- Es auditable, observable y recuperable ante fallos.
- Está preparado para conectar Dataico/Siigo como adaptadores de FE (sin acoplamiento).

**No es:** una reescritura. Es una **capa de estabilidad/fuerza/poder** sobre lo existente, con migración gradual y rollback.

---

## 2. Principios rectores

1. **No dañar lo que ya funciona.** Todo cambio es aditivo o gradual; feature flags y rollback.
2. **Offline-first de verdad.** El sistema opera completo sin red; la nube es un espejo/relay, no una dependencia.
3. **Fuente única de verdad por plataforma.** SQLite (desktop) / wa-sqlite+Dexie (web/Android) como autoritativo; localStorage solo cache.
4. **Idempotencia por entidad.** Toda operación tiene clave estable; reintentos no duplican.
5. **Causalidad, no tiempo.** HLC por entidad; no depender de `Date.now()` para decisiones de sync.
6. **Tombstones para borrados.** Nunca borrar físicamente sin tombstone; estados terminales son absorbentes.
7. **Merge por campos, no LWW ciego.** Prioridad por rol (caja > mesero > cocina) y canal (cloud > LAN > mesh).
8. **Observabilidad primero.** Medir antes de cambiar; KPIs medibles.
9. **Tests de caos.** Corte de red, recarga, multi-device, clock skew inyectado.
10. **Adaptador fiscal desacoplado.** FE (Dataico/Siigo) es un plugin, no parte del core.

---

## 3. Arquitectura objetivo (capas)

```
┌─────────────────────────────────────────────────────────────┐
│  UI / Vistas (mesas, carrito, comandas, cocina, facturas)  │
├─────────────────────────────────────────────────────────────┤
│  Dominio POS (caja, mesas, comandas, inventario, impresión) │
├─────────────────────────────────────────────────────────────┤
│  Sync Coordinator (canales: cloud/LAN/WS/mesh/P2P, prioridad)│
├─────────────────────────────────────────────────────────────┤
│  Storage Abstraction (CrozzoStorage: SQLite/Dexie/wa-sqlite) │
├─────────────────────────────────────────────────────────────┤
│  Persistencia (SQLite desktop / wa-sqlite+Dexie web/Android) │
├─────────────────────────────────────────────────────────────┤
│  Transportes (Tauri invoke, fetch, WebSocket, BLE, WebRTC)  │
└─────────────────────────────────────────────────────────────┘
         ↕ (adaptador futuro)
┌─────────────────────────────────────────────────────────────┐
│  Fiscal Adapter (Dataico / Siigo) — plugin desacoplado      │
└─────────────────────────────────────────────────────────────┘
```

### 3.1 Módulos clave del POS interno

| Módulo | Responsabilidad | Estado actual |
|--------|-----------------|---------------|
| `CrozzoPosMain.js` (core) | Estado global, mesas, carritos, comandas, facturación | Monolito 53k líneas; refactor gradual |
| `CrozzoStorage` (nuevo) | Abstracción de persistencia por plataforma | No existe; crear |
| `CrozzoSyncCoordinator` (nuevo) | Orquestación de canales, prioridad, retry, dedup | Disperso en múltiples módulos |
| `CrozzoPosRuntimeCloud` | Sync de runtime/cart a cloud/LAN | Existe; reforzar con outbox persistente |
| `CrozzoComandasCloudSync` | Sync de comandas | Existe; reforzar dedup/idempotencia |
| `CrozzoReservorio` | Inventario MP, proveedores, costos | Existe; reforzar persistencia |
| `CrozzoPrintService` | Impresión térmica | Existe; reforzar cola/observabilidad |
| `CrozzoAuthSecurity` | Auth + permisos | Existe; reforzar (2FA, vault) |
| `CrozzoTabletShell/Nav` | UI tablet | Existe |
| `CrozzoConnectionManager` | Conexión/red | Existe |

### 3.2 Abstracción de storage (nueva)

```js
// CrozzoStorage — interfaz uniforme
CrozzoStorage.get(table, key) → Promise<row>
CrozzoStorage.set(table, key, value) → Promise<void>
CrozzoStorage.query(table, filter) → Promise<rows>
CrozzoStorage.transaction(fn) → Promise<void>
CrozzoStorage.subscribe(table, cb) → unsubscribe
```

Delega a:
- **Desktop (Windows):** `rusqlite` (Tauri) — ya en Cargo.toml.
- **Web/Android:** `wa-sqlite` (OPFS) o `Dexie.js` (IndexedDB) — mismo esquema lógico.

El monolito llama a `CrozzoStorage`, no a `localStorage` directamente.

---

## 4. Capacidades extraordinarias (realistas)

### 4.1 KDS (Kitchen Display System) — Fase 3
- Lanes por estación (barra, cocina, parrilla).
- Batching de platos iguales (agrupar mismos ítems).
- Waiter routing (asignar mesero a estación).
- Timing y estados (recibido → preparando → listo → entregado).
- Reimpresión y re-envío.

### 4.2 IA para insights — Fase 3 (ya existe `CrozzoAiInsights`)
- Análisis de facturas/comandas: platos más vendidos, horas pico, margen.
- Alertas de stock bajo, anomalías de ventas.
- Sugerencias de reposición.

### 4.3 Failover de ancla LAN — Fase 4 (condicional)
- Si la caja cae, otra PC/tablet asume rol A.
- Requiere quórum/electión (complejo; condicional).

### 4.4 Offline UX — Fase 3
- Indicador visible de estado de conexión y cola pendiente.
- Reintento manual.
- Notificación cuando se reconecta y sincroniza.

### 4.5 Impresión robusta — Fase 2/3
- Cola con backoff y retry automático.
- Test print automático al guardar impresora.
- Bloqueo de phantom printers.
- QR local (librería cliente).

### 4.6 Capacidades especiales ("gachas" / cachés)
- **Cache en memoria** de mesas/carritos para respuesta instantánea (patrón ya usado en runtime push).
- **Pre-carga predictiva** de productos/mesas frecuentes.
- **Modo "caos"** (ya existe `jornada-caos`) para stress testing.
- **Snapshot/restore** rápido para recuperación ante fallos.

---

## 5. Plan de estabilidad/fuerza/poder (POS interno)

### Fase A — Estabilización (Semanas 1-3, sin fiscal)
- [ ] Congelar base + toolchain + CI (Fase -2 del escuadrón).
- [ ] Observabilidad mínima (dashboard interno).
- [ ] Propagar CUFE a facturas (fiscal, pero mejora estabilidad interna de datos).
- [ ] Numeración robusta.
- [ ] Validar permiso `comandar`.
- [ ] Agregar permiso granular `anular_venta`.
- [ ] Implementar `crozzoInvRegistrarMovimiento`.
- [ ] Registrar faltantes de stock.
- [ ] HLC por entidad (mesas/carritos).
- [ ] Tombstones + guardas de estado terminal.
- [ ] Dedup multinivel.
- [ ] Outbox persistente para runtime.
- [ ] Abstracción `CrozzoStorage` (PoC).

### Fase B — Fuerza (Semanas 4-10)
- [ ] Dual-write SQLite solo facturas (PoC → gradual).
- [ ] Migración gradual + rollback.
- [ ] Backup cifrado offsite + WORM.
- [ ] Idempotencia por entidad.
- [ ] Reconciliación con ack.
- [ ] Backoff + dead-letter.
- [ ] Schema versioning.
- [ ] Compaction de tombstones.
- [ ] RLS por business_id (modo compatibilidad).
- [ ] Eliminar duplicación app/src/bundles.
- [ ] TypeScript gradual.
- [ ] Vite + ES modules.
- [ ] QR local.

### Fase C — Poder (Semanas 11-18)
- [ ] KDS con lanes por estación.
- [ ] IA insights (ya existe, mejorar).
- [ ] UX offline (indicador, reintento).
- [ ] Control de concurrencia multi-terminal.
- [ ] Auto-cierre sin diff 0 asumido.
- [ ] Tests E2E con emulador de impresora.
- [ ] Tests de reconexión automatizados.
- [ ] Auditoría externa + pentest.
- [ ] CSP enforcement + Trusted Types.
- [ ] WAF.

### Fase D — Adaptador fiscal (después, condicional)
- [ ] Diseñar `FiscalAdapter` interface (emitir FE, consultar estado, anular).
- [ ] Implementar adaptador Dataico (primario).
- [ ] Implementar adaptador Siigo (secundario).
- [ ] Sin acoplamiento al core POS (plugin).

---

## 6. Integración futura con Dataico/Siigo (adaptador)

El POS interno **no depende** de Dataico/Siigo. La FE se emite a través de un **adaptador desacoplado**:

```js
// FiscalAdapter interface
FiscalAdapter.emitir(factura) → { cufe, qrUrl, estado, xml }
FiscalAdapter.consultar(uuid) → { estado, cufe }
FiscalAdapter.anular(uuid, motivo) → { ok, notaCredito }
FiscalAdapter.test() → { ok, proveedor, latencia }
```

Implementaciones:
- `DataicoAdapter` (primario).
- `SiigoAdapter` (secundario, cuando esté listo).

El core POS llama a `FiscalAdapter.emitir()` solo si el modo es `electronic` y el adapter está configurado. Si no, degrada a `pos` (tiquete). Esto permite que el POS interno funcione al 100% sin fiscal.

---

## 7. Riesgos y mitigaciones (POS interno)

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Monolito 53k líneas sin modularización | Alto (velocidad/regresiones) | TypeScript gradual + Vite + abstracción `CrozzoStorage` |
| Sin CI | Alto (regresiones) | GitHub Actions con checks existentes + cargo test |
| Cuota localStorage | Medio (pérdida trazabilidad) | Dual-write + trim inteligente |
| Concurrencia multi-terminal | Medio (stock inconsistente) | Control optimista por versión + sync inmediata |
| Merge-on-write resucita mesas | Alto (operativo) | Tombstones + guardas de estado terminal |
| Clock skew | Medio (sync incorrecto) | HLC por entidad |
| Impresión timeout fijo | Bajo (UX) | Cola con backoff configurable |
| Duplicación app/src | Medio (calidad) | Build automatizado + verificación CI |

---

## 8. KPIs del POS interno

| KPI | Objetivo | Fase |
|-----|----------|------|
| Uptime offline (caja funcional sin red) | 100% | A |
| Pérdida de estado de mesas en test de caos | 0 | A |
| Duplicados de comandas en test de caos | 0 | A |
| Tasa de éxito sync | ≥99% | B |
| Outbox edad máxima | <5 min (normal) | B |
| Cobertura de tests automatizados | ≥60% flujos críticos | C |
| Tiempo medio de detección de fallo | <5 min | C |

---

## 9. Veredicto

El POS interno puede llevarse a un **nuevo nivel de estabilidad, fuerza y poder** sin tocar fiscal, siguiendo el plan del escuadrón (Fase -2 → A → B → C) y dejando la FE (Dataico/Siigo) como adaptador desacoplado para después. El principio rector es: **blindar lo que ya funciona, mejorar gradualmente, nunca romper.**

---

*Documento de visión/arquitectura POS interno. Complementa `docs/POS-VALIDACION-ESCUDRON.md` y `docs/POS-PLAN-REFORZADO-V2.md`.*
