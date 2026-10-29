# ANÁLISIS - Cascada híbrida para escenarios caóticos (50+ dispositivos)

**Objetivo:** Que ante cualquier combinación de conectividad (caja con/sin internet, tablets con datos, hotspot, router caído, mesh/BLE) el sistema se autorregule sin colapsar, duplicar o perder comandas.

## 1) Principios fundamentales

| Principio | Descripción |
|-----------|-------------|
| **Un único canal activo** | Solo un nivel de la cascada debe estar "activo" para escritura/realtime. Otros en standby. Ya aplicado con exclusividad. |
| **Caja = autoridad para facturación/electrónica** | La caja con ruta a DIAN/Cloud debe tener prioridad para emisión de factura electrónica. Si otro dispositivo tiene datos pero no es caja, NO debe emitir FE. |
| **Elección determinista** | Por rol (A=caja/central, B=tablet), capacidad (WAN/LAN/hotspot/mesh) y salud. Usar stagger para evitar tormentas. |
| **Idempotencia + deduplicación** | Todo op_id único, ACK, registro visto. Ya existe `OpAckRegistry`. |
| **Anti-tormenta** | `reconnectStaggerMs` por deviceId. Jitter ya aplicado. |
| **Autocorrección** | Si se pierde ancla, re-evaluar cascada + activar mesh/QR. Ya reforzado. |

## 2) Mapeo de roles

| Dispositivo | Rol típico | Autoridad |
|-------------|------------|-----------|
| **Caja/Central (PC/Tauri)** | A | Autoridad local (LAN server :3000/:3001), puede ser ancla. Debe ser quien intente subir a nube para FE si tiene internet. |
| **Tablet mesero/cocina** | B | Cliente. Debe preferir conectar a caja por LAN/hotspot. Solo usar nube directa si NO hay caja alcanzable Y tiene internet propio Y está autorizado. |
| **KDS/Cocina** | B/A según config | Similar a tablet pero crítico para recepción. |

## 3) Escenarios analizados

### Escenario A: Caja CON internet, todos en misma LAN (ideal)
- **Cascada:** cloud (caja) o hybrid. Tablets ven caja por LAN - usar LAN preferente para operación, cloud para anclaje.
- **Riesgo:** Solapamiento cloud+LAN. **Mitigado:** hold diferido + exclusividad + `z0HybridParallelLan` controlado.
- **Acción:** Mantener LAN activo para baja latencia, cloud para FE/respaldo.

### Escenario B: Caja SIN internet, router funciona, todos en LAN
- **Cascada:** LAN (nivel 2). 
- **Riesgo:** Tablets intentan salir por datos. **Mitigado:** Orquestador fuerza LAN si hay ancla alcanzable. Director evalúa y prefiere ancla.
- **Acción:** LAN server toma autoridad. Sync local. FE queda en cola hasta recuperar caja con internet.

### Escenario C: Caja SIN internet, router caído, crear hotspot desde caja (Tauri Windows)
- **Cascada:** hotspot (nivel 3)
- **Riesgo:** Tablets cambian red. **Mitigado:** `ensureHotspot()` + guía + watch WiFi.
- **Acción:** Tablets se conectan al AP de caja. Todo por LAN directo.

### Escenario D: Sin router, sin hotspot viable, tablets entre sí
- **Cascada:** mesh (nivel 4) - Gossip + BLE + WiFi Direct
- **Riesgo:** Particionado, pérdida de ancla única. **Mitigado:** Gossip con store/anti-entropía, OpAck para evitar duplicados, mesh solo para estados mínimos.
- **Acción:** Propagación entre pares. Al recuperar ancla, reconciliar.

### Escenario E: Aislado total + QR
- **Cascada:** qr (nivel 5)
- **Riesgo:** Sincronización manual. **Mitigado:** Outbox local, sync por QR/emparejamiento.
- **Acción:** Último recurso.

### Escenario F: Mixto caótico - 50/50 con/sin internet
**Crítico:** Algunos tablets tienen datos móviles y ven internet, otros no. Caja puede o no tenerlo.

**Problema:** Si tablet con datos decide "ir directo a nube" sin coordinarse con caja, puede:
1. Duplicar comandas (sube a Supabase mientras caja también procesa)
2. Crear estados inconsistentes
3. Sobrecargar Supabase con N conexiones simultáneas
4. Conflictos de ids/timestamps

**Solución propuesta:**
- **Preferencia estricta por ancla:** Si hay caja alcanzable por LAN/hotspot, TODOS los tablets deben usar esa ruta. NO deben ir directo a nube.
- **Solo rol "cloud_self"**: Si dispositivo NO tiene caja alcanzable Y tiene internet propio Y está configurado para funcionar standalone (poco común en restaurante), puede usar nube directa.
- **Elección centralizada**: `CrozzoConnectivityDirector` decide modo (`cloud_self` / `lan_client` / `lan_seek` / `isolated`). `CrozzoConnectivityOrchestrator` aplica cascada según director.
- **Coordinación multi-ancla:** Si múltiples dispositivos tienen internet, SOLO UN candidato debe actuar como "ancla nube". Otros deben relé vía ancla o usar LAN.
- **Throttling/colapso de conexiones:** Usar `CrozzoCloudThrottle`, `reconnectStaggerMs`, backoff. Limitar reintentos.

### Escenario G: 100 dispositivos reconectando a la vez
**Mitigado:** `reconnectStaggerMs` por deviceId, debounce, hold en orchestrator, digest-match en LAN para evitar pulls innecesarios.

## 4) Reglas de coordinación

### Regla 1: Jerarquía de autoridad
```
1. Caja/central con ruta a nube (para FE) > otros con datos
2. Si caja sin nube pero con LAN -> LAN como autoridad
3. Si sin caja -> mesh/gossip con líder o consenso ligero
```

### Regla 2: Prohibir escritura dual
- En modo `lan_client` (tablet ve caja), NO debe iniciar sync nube directo para operaciones Z0 (comandas/runtime)
- Solo puede usar nube para lecturas no-críticas o si `funnelCloudThroughHub` lo indica
- Ya hay lógica en `CloudSyncPriorities` y `ComandasCloudSync` para esto

### Regla 3: Un solo "uploader" a Supabase por negocio/sede
- `ReconnectSync.centralAuthorityPush()` hace que Rol A empuje si tiene nube
- Tablets en modo cliente deben delegar push a ancla
- Evitar que 50 tablets suban el mismo estado simultáneamente

### Regla 4: Idempotencia estricta
- `OpAckRegistry` con `op_id` único
- `ComandasCloudSync` ya tiene dedup por tid
- `LanActionDedup` para LAN
- Mantener

## 5) Acciones correctivas propuestas

### A) Endurecer Director para evitar "cloud_self" indebido
En `CrozzoConnectivityDirector.evaluate()`: si hay ancla LAN alcanzable, **NUNCA** poner tablet en `cloud_self`. Forzar `lan_client`. Solo `cloud_self` si realmente sin ancla y quiere funcionar standalone.

### B) Enforcar "delegate to anchor" en tablet
Cuando `director.mode === 'lan_client'` y hay ancla con cloud, deshabilitar push directo a Supabase desde tablet para Z0. Dejar que ancla replique.

### C) Stagger global en reconexiones
Ya existe `reconnectStaggerMs` - asegurar uso en todos los caminos de reconexión masiva.

### D) Circuit breaker por dispositivo
Si un dispositivo genera muchas escrituras fallidas/duplicadas, pausar y pasar a mesh/LAN.

### E) "Single writer" por entidad
Para runtime (mesas/carrito), solo ancla escribe a snapshot compartido. Clientes reciben por push/pull.

## 6) Plan de implementación inmediato

1. **Revisar `CrozzoConnectivityDirector`** - Asegurar que tablets nunca elijan `cloud_self` si ven ancla LAN
2. **Revisar `CrozzoComandasCloudSync` / `CrozzoPosRuntimeCloud`** - Respetar modo director (delegar a ancla)
3. **Añadir guard**: Si modo != cloud_self y hay ancla -> no iniciar cloud realtime directo
4. **Test lógico**: Simular mezcla 50/50 con trazas
5. **Sync y validar**

## Conclusión
El sistema ya tiene buena base (Director + Orchestrator + ReconnectSync + stagger). El punto crítico es **evitar que tablets con datos "salten" la ancla**. Con exclusividad por cascada + forzar delegación al ancla cuando existe, el caos mixto se autorregula sin saturar BD ni duplicar.