# INFORME CONSOLIDADO - ESCALADO A 100 DISPOSITIVOS

**Fecha:** 2026-10-28  
**Estado:** INVESTIGACIÓN COMPLETADA - PARA REVISIÓN  
**Objetivo:** Cascada híbrida robusta para 100 dispositivos simultáneos

---

## 1) RESUMEN EJECUTIVO

Tras investigación forense con agentes especializados:

**HALLAZGO CLAVE:** El sistema YA TIENE base sólida para LAN-first híbrido. Lo que falta NO es "crear todo desde cero", sino **INTEGRAR Y OPTIMIZAR** para escalar a 100 dispositivos.

### Estado actual por componente
| Componente | Estado | Notas |
|------------|--------|-------|
| **LAN Server (Rust)** | BUENO | Tiene semáforo HTTP (64), WS separado, health/status, ACK queue. Funciona. |
| **LAN WS** | BUENO | Broadcast por lista de conexiones. Soporta múltiples clientes. |
| **OpFanout** | BUENO | Multi-canal (cloud+LAN+mesh) con ACK/retry. |
| **OpAckRegistry** | BUENO | Idempotencia/ACK. Necesita limpiar antiguos. |
| **ConnectivityOrchestrator** | BUENO | Tiene lógica de cascada. Menciona hotspot. |
| **BleMesh** | BUENO | Existe con UDP gossip + WebBT + WebRTC. Listo para uso. |
| **WifiDirectBridge** | BUENO | Existe. |
| **OfflineGossip** | BUENO | Existe. |

---

## 2) CUELLOS DE BOTELLA PARA 100 DISPOSITIVOS

| Riesgo | Severidad | Causa | Solución |
|--------|-----------|-------|----------|
| **Broadcast masivo** | ALTA | `OpFanout` puede enviar a todos | **Room-based subscriptions** - solo área/mesa/interesados |
| **Snapshots completos** | ALTA | Algunos polls envían todo el estado | **Delta sync** - solo cambios desde último seq/timestamp |
| **N polls simultáneos** | ALTA | Cada dispositivo con sus propios intervalos | **Throttle + jitter** (ya parcialmente aplicado) + centralizado |
| **WS broadcast ineficiente** | MEDIA-ALTA | Enviar mismo mensaje a todos | **Rooms/Channels** por `locationId:area:cocina:bar` |
| **ACK registry crece** | MEDIA | Sin limpieza agresiva | **TTL limpieza** cada X minutos |
| **Rust HTTP semáforo 64** | MEDIA | Límite 64 concurrentes HTTP | Para 100 devices puede ser ajustable según pruebas, o usar WS preferente |

---

## 3) CASCADA DESEADA - ANÁLISIS

### Comparativa

| Nivel | Deseado | Actual | Acción |
|-------|---------|--------|--------|
| **1. Cloud/Supabase** | Si internet sano | ✅ Implementado | Mantener con throttling |
| **2. LAN Router (HTTP/WS)** | Misma red, buscar central por IP/mDNS | ✅ Implementado (`LanOpsSync` + `LanSyncBridge`) | Mejorar descubrimiento |
| **3. Hotspot directo desde Caja/Central** | AP propio sin internet | **PARCIAL** - `WifiDirectBridge` existe pero no integrado en cascada principal | **INTEGRAR** a `ConnectivityOrchestrator` |
| **4. BLE Mesh / Gossip** | Malla entre dispositivos | **EXISTE** pero se usa mayormente en "offline/gossip", no como paso formal en cascada | **FORMALIZAR** como paso 4 |
| **5. QR/Outbox diferido** | Última contingencia | **EXISTE** en lógica pero poco visible | **FORMALIZAR** UX + sync por QR |

---

## 4) TECNOLOGÍAS A INTEGRAR/MEJORAR

| Tecnología | Prioridad | Estado | Razón |
|------------|-----------|--------|-------|
| **mDNS Discovery** | CRÍTICA | Parcial (`crozzo_mdns.rs` existe) | Auto-descubrir caja/central sin hardcode IP |
| **Room-based fanout** | CRÍTICA | FALTA | Reducir tráfico 70-90% con 100 devices |
| **Delta sync (seq + lastModified)** | CRÍTICA | Parcial | Enviar solo cambios |
| **Hotspot AP desde caja** | CRÍTICA | Parcial | Rompemuros clave |
| **WebRTC DataChannel P2P** | ALTA | Parcial en BleMesh | Evitar pasar todo por central bajo carga |
| **UDP Gossip refinement** | ALTA | Existe | Funciona bien para estados |
| **CRDT-lite para outbox** | ALTA | FALTA | Mejor merge en particiones |
| **Connection pooling/limit** | ALTA | Parcial (semáforo 64) | Proteger servidor |
| **QR sync batch** | MEDIA-ALTA | Parcial | Contingencia extrema funcional |

---

## 5) PLANES DE CONTINGENCIA

### PLAN A - INTEGRACIÓN MÍNIMA (RIESGO BAJO, IMPACTO ALTO)
**Objetivo:** Formalizar cascada sin grandes refactors

| Paso | Acción | Riesgo |
|------|--------|--------|
| A1 | Integrar Hotspot/WifiDirect en `ConnectivityOrchestrator` como paso 3 explícito | BAJO |
| A2 | Formalizar BLE Mesh/Gossip como paso 4 en orquestador | BAJO |
| A3 | Mejorar `OpFanout` con room-filter (por locationId/area) | BAJO-MEDIO |
| A4 | Añadir jitter/backoff ya hecho + visibility-aware ya hecho | YA HECHO |

### PLAN B - OPTIMIZACIÓN ESCALADO (RIESGO MEDIO, IMPACTO MUY ALTO)
**Objetivo:** Preparar para 100 dispositivos reales

| Paso | Acción | Riesgo |
|------|--------|--------|
| B1 | **Delta sync** - implementar `sync_since` con seq | MEDIO |
| B2 | **Room-based WS** - suscripciones por sala | MEDIO |
| B3 | **ACK cleanup** - TTL en `OpAckRegistry` | BAJO-MEDIO |
| B4 | **mDNS auto-discovery** robusto | MEDIO |
| B5 | **Rust WS limits** - evaluar subir límite o balancear | MEDIO |

### PLAN C - ARQUITECTURA FUTURA (RIESGO MEDIO-ALTO, IMPACTO MÁXIMO)
**Objetivo:** Ultra-robusto para masivo/multi-modelo

| Paso | Acción | Riesgo |
|------|--------|--------|
| C1 | **WebRTC mesh parcial** - tablets P2P entre ellos | MEDIO-ALTO |
| C2 | **CRDT-lite** para merges | MEDIO-ALTO |
| C3 | **Multi-central failover** - otra caja toma rol central | ALTO |
| C4 | **Edge cache** local inteligente | MEDIO-ALTO |

---

## 6) CAPACIDAD ACTUAL ESTIMADA

| Escenario | Capacidad Estimada | Notas |
|-----------|-------------------|-------|
| **10-20 dispositivos** | **ÓPTIMO** | Funciona muy bien hoy |
| **30-50 dispositivos** | **BUENO** | Con jitter/visibility-aware OK |
| **50-80 dispositivos** | **ACEPTABLE CON AJUSTES** | Necesita room-based + delta sync |
| **80-100 dispositivos** | **VIABLE CON PLAN A+B** | Requiere optimizaciones críticas |

**CONCLUSIÓN:** Con **PLAN A+B** es **VIABLE** llegar a 100 dispositivos sin colapsar. Plan A ya es mayoritariamente integración.

---

## 7) RECOMENDACIÓN INMEDIATA

**NO reinventar rueda. INTEGRAR lo que ya existe.**

Orden sugerido:
1. **FASE 1 - INTEGRACIÓN CASCADA** (Plan A) - Formalizar hotspot+mesh en orquestador
2. **FASE 2 - OPTIMIZACIÓN FANOUT** (Plan B parcial) - Room-based + delta básico
3. **FASE 3 - VALIDACIÓN** - Test con simulación multi-dispositivo

**TODO SIN TOCAR** zonas intangibles. Cambios mínimos, reversibles, testeables.

---

## 8) PRÓXIMOS PASOS

- [ ] Aprobar iniciar **FASE 1 - PLAN A**
- [ ] Integrar WifiDirect/Hotspot + BleMesh/OfflineGossip en cascada
- [ ] Mejorar descubrimiento mDNS
- [ ] Room-based básico en OpFanout
- [ ] Validar con sync-clinical tras cada cambio
- [ ] Simular carga con agentes

**ESPERANDO APROBACIÓN PARA INICIAR FASE 1**