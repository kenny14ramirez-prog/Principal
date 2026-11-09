# Reporte de Contingencias de Conectividad — Crozzo POS

> Fecha: 2026-11-08 · Objetivo: analizar cómo se comporta el sistema ante cada tipo de fallo de conectividad, qué hace cada dispositivo, y qué opciones de contingencia existen. Desde un restaurante pequeño hasta uno grande.

---

## 1. Escenarios de fallo reales

### 1.1 Clasificación de fallos

| Tipo de fallo | Duración | Frecuencia | Impacto |
|---------------|----------|------------|---------|
| Intermitencia WiFi (fluctuación) | Segundos-minutos | Alta | Baja (sync reintenta) |
| Corte de internet (WAN) | Minutos-horas | Media | Media (LAN sigue funcionando) |
| Corte de red local (LAN) | Minutos-horas | Baja | Alta (solo offline) |
| Caja se reinicia/apaga | Minutos | Baja | Alta (dispositivos pierden central) |
| Tablet se cae | Minutos | Media | Baja (otros siguen) |
| Cocina se cae | Minutos | Baja | Media (comandas no se imprimen) |
| Batería baja en dispositivo | Variable | Media | Media (dispositivo se apaga) |

---

## 2. Comportamiento por escenario

### 2.1 Escenario: 3 tablets con internet, 3 sin internet, 3 con internet intermitente

```
DISPOSITIVOS:
  A1, A2, A3 → internet OK (cloud sync activo)
  B1, B2, B3 → sin internet (solo LAN)
  C1, C2, C3 → internet intermitente (LAN + cloud cuando puede)

CAJA (central):
  → Siempre tiene internet (asumido) o funciona offline
  → Sirve como servidor LAN (port 3000/3001)
  → mDNS anuncia _crozzo-pos._tcp

FLUJO:
  1. Tablets A (internet OK):
     - Sync por LAN (mDNS) + Cloud (Supabase) en paralelo
     - Latencia: 1-5ms (LAN) + 30-100ms (cloud)
     - Todo funciona normal

  2. Tablets B (sin internet):
     - Sync solo por LAN (mDNS + HTTP/WS)
     - Latencia: 1-5ms (LAN)
     - Todo funciona normal EN LA RED LOCAL
     - NO sincroniza con cloud (no hay internet)
     - Cuando vuelve internet → sync completo automático

  3. Tablets C (internet intermitente):
     - Cuando hay internet: LAN + cloud (paralelo)
     - Cuando se cae: solo LAN
     - Transición automática (sin intervención del usuario)
     - Watchdog detecta caída → cambia a modo LAN-only
     - Cuando vuelve → watchdog detecta → cambia a modo híbrido

RESULTADO:
  - Todas las tablets pueden tomar pedidos y enviar comandas
  - La caja recibe todo por LAN
  - Cocina recibe todo por LAN
  - Solo la sincronización con la nube (otros locales) se ve afectada
  - Cuando vuelve internet → sync automático, sin pérdida de datos
```

**¿Qué pasa si una tablet sin internet toma un pedido?**
```
1. Tablet B crea comanda → guarda local
2. Envía por LAN (HTTP/WS) → Caja recibe → Cocina recibe
3. NO se envía a Supabase (sin internet)
4. Tablet B marca comanda como "pendiente de sync cloud"
5. Cuando vuelve internet → outbox drena → Supabase recibe
6. Otros locales ven la comanda (con delay de minutos/horas)
```

**¿El usuario tiene que hacer algo?** NO. Todo es automático.

### 2.2 Escenario: Caja se reinicia o se apaga

```
CAJA se reinicia (crash, reboot, corte de luz)
        │
        ├──► Servidor LAN se detiene (port 3000/3001)
        ├──► mDNS deja de anunciar
        ├──► Tablets pierden conexión con caja
        │
        └──► COMPORTAMIENTO DE LAS TABLETS:
              │
              ├──► Detectan pérdida de conexión (WS disconnect / HTTP timeout)
              ├──► Cambian a modo "sin central"
              ├──► Siguen funcionando en modo offline:
              │       - Pueden tomar pedidos (se guardan local)
              │       - NO pueden enviar a cocina (sin caja)
              │       - NO pueden cobrar (sin caja)
              │
              ├──► Intentan reconectar cada 5-10 segundos
              │       - mDNS busca _crozzo-pos._tcp
              │       - HTTP probe a última IP conocida
              │
              └──► Cuando caja vuelve:
                    - mDNS rediscover → tablets se reconectan
                    - Pull completo → recuperan cambios perdidos
                    - Outbox drena → envía operaciones pendientes
                    - Notificación: "Reconectado"
```

**¿Se pierde información?** NO. Todo se guarda localmente en cada dispositivo.

**¿El usuario tiene que hacer algo?** NO. La reconexión es automática. Pero las comandas tomadas durante el corte NO se envían a cocina hasta que la caja vuelva (no hay servidor LAN).

**Problema real**: Si la caja se cae, las tablets no pueden enviar comandas a cocina. Solo pueden tomar pedidos localmente.

**Solución propuesta**: Permitir que un dispositivo (tablet con más batería/recursos) actúe como "caja temporal" (failover). Pero esto requiere cambios arquitectónicos.

### 2.3 Escenario: Caja se cae, pero hay una computadora en cocina

```
CAJA se cae → Cocina (computador) recibe comandas directamente?
        │
        ├──► ACTUALMENTE: NO
        │       - La cocina solo recibe comandas de la caja (via WS/HTTP)
        │       - Sin caja, la cocina no recibe nada
        │
        └──► PROPUESTA: Failover a cocina
              │
              ├──► Cocina actúa como servidor LAN temporal
              ├──► Tablets se conectan a cocina (mDNS)
              ├──► Comandas llegan a cocina directamente
              ├──► Cuando caja vuelve → cocina sincroniza con caja
              └──► Caja recupera todas las comandas
```

**Estado actual**: ❌ No implementado. La cocina es solo receptor, no servidor.

**Para implementar**: Requiere que la cocina pueda actuar como Rol A (servidor LAN) cuando la caja no está disponible. Esto es un cambio arquitectónico significativo.

### 2.4 Escenario: Tablet se cae (individual)

```
Tablet B se cae (crash, batería, etc.)
        │
        ├──► Otros dispositivos NO se ven afectados
        ├──► Caja sigue recibiendo de otros tablets
        ├──► Cocina sigue recibiendo comandas
        │
        └──► Cuando Tablet B vuelve:
              ├──► Pull completo → recupera cambios
              ├──► Outbox drena → envía pendientes
              └──► Notificación: "Reconectado"
```

**Impacto**: Bajo. Solo afecta al mesero que usaba esa tablet.

### 2.5 Escenario: Cocina se cae

```
Cocina se cae (computador apagado, etc.)
        │
        ├──► Comandas siguen llegando a caja
        ├──► Caja las guarda y reintenta enviar a cocina
        ├──► Impresión falla → cola de impresión
        │
        └──► Cuando cocina vuelve:
              ├──► Pull de comandas pendientes
              ├──► Imprime las que se perdieron
              └──► Notificación: "Reconectado"
```

**Impacto**: Medio. Las comandas se acumulan pero no se pierden.

### 2.6 Escenario: Todos los dispositivos pierden internet, pero están en la misma WiFi

```
Internet se cae → WAN down
        │
        ├──► LAN sigue funcionando (WiFi local OK)
        ├──► mDNS sigue funcionando
        ├──► HTTP/WS sigue funcionando
        ├──► Sync LAN sigue funcionando (comandas, mesas, estados)
        │
        └──► Lo que NO funciona:
              ├──► Cloud sync (Supabase) → outbox acumula
              ├──► Facturación DIAN (requiere internet)
              ├──► Auditoría IA (requiere Edge/NVIDIA)
              └──► Transferencia por link (requiere internet)
```

**Resultado**: El POS sigue funcionando para tomar pedidos, comandar, cobrar (sin factura electrónica). Facturación DIAN se encola en contingencia (48h SLA).

### 2.7 Escenario: Sin WiFi ni internet (solo Bluetooth)

```
Sin WiFi, sin internet, solo Bluetooth
        │
        ├──► Si los dispositivos ya están emparejados por Bluetooth:
        │       └──► Comunicación por BLE (datos pequeños)
        │             └──► Comandas, cambios de estado, presencia
        │             └──► Sync runtime (cada 2-4s, 1-4 KB/s) → BLE puede manejarlo
        │
        └──► Si NO están emparejados:
              └──► Sin comunicación (requiere mDNS/WiFi o QR)
```

**Resultado**: ⚠️ Parcial. Solo funciona si los dispositivos ya están emparejados por Bluetooth. No hay auto-descubrimiento por Bluetooth (requiere implementación).

---

## 3. Mecanismos de resiliencia (lo que ya existe)

### 3.1 Watchdog (CrozzoLanOpsSync.js)

```
Cada WATCHDOG_MS (variable, ~segundos):
  1. Verifica si hay silencio en la comunicación
  2. Si silencio > ANCHOR_SILENCE_EVENT_MS → healAnchorSilence()
  3. Si silencio > WATCHDOG_MS → triggerPull('all', { force: true })
  4. Reconecta WS bridge si está desconectado
```

**Función**: Detecta caídas silenciosas y fuerza reconexión.

### 3.2 Reconnect Sync (CrozzoReconnectSync.js)

```
Al volver internet (evento 'online'):
  1. Espera ONLINE_STABLE_MS (2.4s) para confirmar estabilidad
  2. Drena outbox (operaciones pendientes)
  3. Pull completo (recupera cambios perdidos)
  4. Push runtime (envía cambios locales)
  5. Notifica: "Reconectado"
```

**Función**: Recuperación automática al volver la conexión.

### 3.3 Tier Changed (CrozzoLanOpsSync.js)

```
Al cambiar de tier (offline → lan → cloud):
  1. Si to === 'cloud' y WAN OK:
     - stopLanOpsSync() (si no es híbrido)
     - crozzoRunFullReconnectSync (drena nube)
     - startLanStandby (si no es híbrido)
  2. Si to === 'lan':
     - startLanOpsSync (comienza sync LAN)
```

**Función**: Adaptación automática al cambio de conectividad.

### 3.4 Outbox Pattern (CrozzoComandasCloudSync.js)

```
Operación creada → encola en outbox (localStorage)
  → Reintenta cada X segundos
  → Cuando ACK → marca como confirmado
  → Sin ACK en 6h → sigue reintentando
```

**Función**: No se pierde ninguna operación.

### 3.5 Contingencia Fiscal (CrozzoContingenciaFiscal.js)

```
DIAN no disponible → documento encolado (pendiente_timbrado)
  → SLA: 48 horas para timbrar
  → Alerta a las 40 horas
  → Drenaje automático al recuperar
  → Reporte de evento significativo a DIAN
```

**Función**: Facturación no se pierde, se encola y reintenta.

### 3.6 Persistencia Local (CrozzoOperativeReservorio.js)

```
Datos guardados en localStorage/SQLite con:
  - Backup v1/v2 (rotación)
  - allowAutoDiscard = false (no borra automáticamente)
  - allowCloudAuthoritativeEmpty solo tras cobro/vaciado
  - slotHasActiveWork (evita reset en mesas activas)
```

**Función**: Datos no se pierden aunque se borre el navegador.

---

## 4. Lo que NO existe (y falta)

### 4.1 Failover de caja

```
PROBLEMA: Si la caja se cae, ningún dispositivo puede actuar como servidor LAN.
          Las tablets no pueden enviar comandas a cocina.

SOLUCIÓN PROPUESTA: Failover automático
  1. Caja cae → tablets detectan pérdida de conexión
  2. Tablet con más recursos/batería se convierte en "caja temporal"
  3. Tablets se conectan a la nueva caja (mDNS)
  4. Cuando la caja original vuelve → sincroniza con la temporal
  5. Caja original recupera rol de servidor

COMPLEJIDAD: Alta (requiere cambios arquitectónicos)
PRIORIDAD: Media (raro pero crítico)
```

### 4.2 Auto-discovery por Bluetooth

```
PROBLEMA: Si no hay WiFi ni internet, no hay auto-descubrimiento.
          Los dispositivos no se encuentran por Bluetooth.

SOLUCIÓN PROPUESTA: Bluetooth LE advertising
  1. Caja anuncia servicio BLE (_crozzo-pos)
  2. Tablets escanean BLE → encuentran caja
  3. Pairing por BLE → sync por BLE (datos pequeños)
  4. Cuando vuelve WiFi → migra a WiFi automáticamente

COMPLEJIDAD: Alta (requiere tauri-plugin-blec)
PRIORIDAD: Baja (raro, WiFi suele estar disponible)
```

### 4.3 Notificación de pérdida de conexión

```
PROBLEMA: Si un dispositivo pierde conexión, no se avisa al usuario.
          El mesero puede seguir tomando pedidos sin saber que no se envían.

SOLUCIÓN PROPUESTA: Indicador visual + sonoro
  1. Banner: "Sin conexión con la caja — los pedidos se guardarán localmente"
  2. Icono de estado en la barra superior (verde/amarillo/rojo)
  3. Sonido de alerta al perder conexión
  4. Notificación cuando se reconecta: "Reconectado — sincronizando"

COMPLEJIDAD: Baja
PRIORIDAD: Alta (UX crítica)
```

### 4.4 Cola de impresión con retry

```
PROBLEMA: Si no hay impresora, la impresión falla silenciosamente.
          Las comandas no se imprimen y no se reintenta.

SOLUCIÓN PROPUESTA: Cola de impresión con retry
  1. Impresión falla → encola en outbox de impresión
  2. Reintenta cada 30s
  3. Cuando se detecta impresora → drena cola
  4. Notificación: "X comandas pendientes de impresión"

COMPLEJIDAD: Media
PRIORIDAD: Media
```

---

## 5. Matriz de contingencia por escenario

| Escenario | Comunicación | Datos | Facturación | Impresión | Notificación |
|-----------|-------------|-------|-------------|-----------|--------------|
| Internet OK + LAN OK | LAN + Cloud | ✅ Sync completo | ✅ DIAN OK | ✅ OK | ✅ Verde |
| Internet caído + LAN OK | Solo LAN | ✅ Sync LAN | ⚠️ Contingencia 48h | ✅ OK | 🟡 Amarillo |
| Internet OK + LAN caído | Solo Cloud | ✅ Sync cloud | ✅ DIAN OK | ✅ OK | 🟡 Amarillo |
| Sin internet + sin LAN | Offline | ✅ Local | ❌ Contingencia | ❌ Cola | 🔴 Rojo |
| Caja caída | Tablets offline parcial | ✅ Local | ❌ Contingencia | ❌ Cola | 🔴 Rojo |
| Tablet caída | Otros siguen | ✅ Sync | ✅ OK | ✅ OK | 🟡 Amarillo |
| Cocina caída | Comandas acumuladas | ✅ Sync | ✅ OK | ❌ Cola | 🟡 Amarillo |

---

## 6. Lo que falta implementar (priorizado)

### Prioridad 1 — Crítico (UX)
1. **Indicador visual de conexión** (verde/amarillo/rojo en barra superior)
2. **Notificación de pérdida/reconexión** (banner + sonido)
3. **Cola de impresión con retry** (no fallar silenciosamente)

### Prioridad 2 — Importante (resiliencia)
4. **Fix digest LAN ciego** (incluir estado en hash)
5. **Fix WS broadcast panic** (async await)
6. **Failover de caja** (tablet como servidor temporal)

### Prioridad 3 — Deseable (escalabilidad)
7. **Sync incremental** (solo cambios)
8. **Migrar runtime a SQLite** (localStorage tope)
9. **Auto-discovery por Bluetooth** (fallback sin WiFi)

---

## 7. Conclusión

El sistema **ya tiene mecanismos de resiliencia robustos**:
- Watchdog que detecta caídas silenciosas
- Reconnect sync automático al volver internet
- Outbox pattern (no se pierde información)
- Contingencia fiscal (48h SLA)
- Persistencia local (backup v1/v2)
- Modo offline completo

**Lo que falta es visibilidad para el usuario** (saber si está conectado o no) y **failover de caja** (si la caja se cae, que otro dispositivo la reemplace).

**No se pierde información en ningún escenario.** El sistema siempre guarda localmente y sincroniza cuando puede. El único riesgo real es que el usuario no sepa que está offline y siga operando sin saber que las comandas no llegan a cocina.

**La solución más impactante y fácil de implementar es el indicador visual de conexión + notificación.** Eso solo tomaría 1-2 días y resolvería el 80% del problema de UX.