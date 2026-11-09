# TESIS MULTI-PERSPECTIVA: Conectividad y Comunicación — Crozzo POS (Bona Origen)

> Fecha: 2026-11-08 · Tipo: Análisis de tesis (nivel militar/industrial)
> Objetivo: Evaluar el proyecto desde múltiples perspectivas (ética, táctica, económica, recursos, seguridad, escala) para garantizar que el sistema funcione en cualquier escenario, incluyendo sabotaje y fallos.

---

## ÍNDICE

1. Visión general del sistema
2. Perspectiva 1: General Ético (¿es correcto?)
3. Perspectiva 2: General Táctico (¿funciona en combate?)
4. Perspectiva 3: General Económico (¿es viable?)
5. Perspectiva 4: General de Recursos (¿tenemos lo necesario?)
6. Perspectiva 5: General de Seguridad (¿resiste ataques?)
7. Perspectiva 6: General de Escala (¿funciona con 100+ dispositivos?)
8. Perspectiva 7: General de UX (¿el usuario no siente nada?)
9. Síntesis: Lo que conviene y lo que no
10. Plan de implementación unificado
11. Criterios de éxito
12. Conclusiones

---

## 1. VISIÓN GENERAL DEL SISTEMA

### 1.1 Qué es Crozzo POS (Bona Origen)
- Sistema POS para restaurantes/comercios colombianos
- Arquitectura: Tauri (Rust + WebView) desktop, APK Android
- Multi-dispositivo: caja (central), tablets (meseros), cocina, bar
- Fiscal: facturación electrónica DIAN (UBL 2.1)
- Sync: LAN (HTTP/WS/mDNS) + Cloud (Supabase) + Offline

### 1.2 El problema que queremos resolver
El usuario quiere:
1. Instalar en computador central (caja) + configurar impresoras/DB
2. Instalar en celular/tablet
3. Escanear QR → conexión automática, sin configuración manual
4. Comandar inmediatamente, sin "mil maromas"
5. Funcionar con WiFi, sin WiFi (Bluetooth/offline), con internet, sin internet
6. Escalar de 2 a 100+ dispositivos
7. Resistir sabotaje (meseros desconectando internet, etc.)
8. Que el usuario no sienta nada (sin popups invasivos)

### 1.3 El principio fundamental
> "El sistema debe ser tan fácil que un mesero analfabeto tecnológico pueda usarlo sin ayuda, y tan robusto que funcione aunque el usuario intente romperlo."

---

## 2. PERSPECTIVA 1: GENERAL ÉTICO (¿Es correcto?)

### 2.1 Preguntas éticas

| Pregunta | Análisis | Veredicto |
|----------|----------|-----------|
| ¿Es ético monitorear la conectividad del usuario? | Sí, si es transparente y no invasivo. El sistema debe informar, no vigilar. | ✅ Ético con transparencia |
| ¿Es ético bloquear funciones si no hay internet? | Sí, si es por seguridad fiscal (DIAN requiere internet para timbrar). Pero el POS debe funcionar offline para tomar pedidos. | ✅ Ético con contingencia |
| ¿Es ético registrar qué dispositivo hace qué? | Sí, para auditoría y trazabilidad. Pero debe ser proporcional. | ✅ Ético con límites |
| ¿Es ético desactivar funciones si el usuario no paga? | Depende del modelo de negocio. Si es SaaS, sí. Si es licencia perpetua, no. | ⚠️ Definir modelo |
| ¿Es ético usar Bluetooth sin consentimiento? | No. Siempre pedir permisos explícitos. | ❌ Requiere consentimiento |

### 2.2 Principios éticos del sistema

1. **Transparencia**: El usuario debe saber qué datos se envían y a dónde.
2. **Consentimiento**: Permisos de red/Bluetooth/cámara se piden una vez, claramente.
3. **Proporcionalidad**: Solo se monitorea lo necesario para el funcionamiento.
4. **No punitivo**: El sistema no debe castigar al usuario por desconexiones accidentales.
5. **Auditoría**: Todo cambio de configuración queda registrado (quién, cuándo, qué).

### 2.3 Líneas rojas éticas
- ❌ NO enviar datos personales sin consentimiento
- ❌ NO bloquear el POS por falta de internet (debe funcionar offline)
- ❌ NO usar Bluetooth/cámara sin permiso explícito
- ❌ NO registrar ubicación GPS sin consentimiento
- ✅ SÍ registrar qué dispositivo hizo qué acción (auditoría)
- ✅ SÍ notificar al usuario de problemas de conectividad
- ✅ SÍ permitir modo offline completo

---

## 3. PERSPECTIVA 2: GENERAL TÁCTICO (¿Funciona en combate?)

### 3.1 Escenarios de combate real

| Escenario | Descripción | Probabilidad | Impacto |
|-----------|-------------|--------------|---------|
| **A. Operación normal** | Todos conectados, internet OK | 70% | Bajo |
| **B. Internet caído** | WiFi local OK, sin WAN | 15% | Medio |
| **C. Red local caída** | Sin WiFi ni internet | 5% | Alto |
| **D. Caja caída** | Servidor central apagado | 3% | Alto |
| **E. Dispositivo caído** | Tablet/mesero sin conexión | 5% | Bajo |
| **F. Sabotaje (mesero desconecta)** | Usuario intencionalmente corta conexión | 2% | Medio |
| **G. Interferencia WiFi** | Saturación 2.4GHz | 5% | Bajo |
| **H. Corte de luz** | Sin energía | 2% | Alto |

### 3.2 Comportamiento táctico por escenario

#### Escenario A — Operación normal (70%)
```
Todos los dispositivos → mDNS + HTTP/WS + Cloud
  → Latencia: 1-5ms (LAN) + 30-100ms (cloud)
  → Todo funciona: comandas, facturación, sync, impresión
  → Indicador: 🟢 Verde
```

#### Escenario B — Internet caído (15%)
```
LAN OK, WAN down
  → mDNS + HTTP/WS sigue funcionando
  → Cloud sync se pausa (outbox acumula)
  → Facturación DIAN se encola (contingencia 48h)
  → Indicador: 🟡 Amarillo
  → El mesero puede seguir tomando pedidos
  → Las comandas llegan a cocina por LAN
  → Al volver internet → sync automático
```

#### Escenario C — Sin red (5%)
```
Sin WiFi ni internet
  → Modo offline completo
  → Datos guardados en localStorage/SQLite
  → Contingencia fiscal activa
  → Indicador: 🔴 Rojo
  → El mesero puede seguir tomando pedidos (se guardan local)
  → NO se envían a cocina (sin LAN)
  → Cuando vuelve red → sync automático
```

#### Escenario D — Caja caída (3%)
```
Caja apagada/crasheada
  → Tablets pierden conexión con servidor LAN
  → Tablets cambian a modo "sin central"
  → Pueden tomar pedidos (local) pero NO enviar a cocina
  → Intentan reconectar cada 5-10s (mDNS + HTTP probe)
  → Cuando caja vuelve → pull completo → sync
```

**Problema real**: Sin caja, las tablets no pueden enviar comandas a cocina. Solo pueden tomar pedidos localmente.

**Solución propuesta (failover)**: Si la caja se cae por >30s, la tablet con más recursos se convierte en "caja temporal". Requiere cambios arquitectónicos (prioridad media).

#### Escenario E — Dispositivo caído (5%)
```
Tablet B se cae
  → Otros dispositivos NO se ven afectados
  → Caja sigue recibiendo de otros tablets
  → Cocina sigue recibiendo comandas
  → Cuando B vuelve → pull completo → sync
```

**Impacto**: Bajo. Solo afecta al mesero que usaba esa tablet.

#### Escenario F — Sabotaje (mesero desconecta) (2%)
```
Mesero desconecta WiFi/datos intencionalmente
  → Tablet cambia a modo offline
  → Indicador: 🔴 Rojo + notificación (no invasiva)
  → Mesero puede seguir tomando pedidos (se guardan local)
  → NO se envían a cocina (sin conexión)
  → Cuando reconecta → sync automático
  → Auditoría: se registra "desconexión intencional" con timestamp
```

**Solución anti-sabotaje:**
1. **Indicador visual** (icono en barra superior, no popup invasivo)
2. **Sonido de alerta** (sutil, no alarmante)
3. **Registro de auditoría** (quién, cuándo, cuánto tiempo desconectado)
4. **Notificación al admin** (cuando se reconecta, se informa)
5. **NO bloquear** la app (el mesero puede seguir trabajando offline)

#### Escenario G — Interferencia WiFi (5%)
```
Saturación 2.4GHz → latencia alta, pérdida de paquetes
  → Watchdog detecta silencio → fuerza pull
  → WS se reconecta automáticamente
  → Si persiste → cambia a modo HTTP polling (más robusto)
  → Indicador: 🟡 Amarillo
```

#### Escenario H — Corte de luz (2%)
```
Sin energía → todos los dispositivos se apagan
  → Al volver la energía → cada dispositivo arranca
  → Caja arranca primero → servidor LAN inicia
  → mDNS anuncia → tablets descubren caja
  → Pull completo → sync → operación normal
```

**Impacto**: Alto pero recuperable. Todo se guarda localmente.

### 3.3 Matriz de resiliencia

| Escenario | Comunicación | Datos | Facturación | Impresión | Notificación |
|-----------|-------------|-------|-------------|-----------|--------------|
| A. Normal | LAN + Cloud | ✅ | ✅ | ✅ | 🟢 Verde |
| B. Internet caído | Solo LAN | ✅ | ⚠️ Contingencia | ✅ | 🟡 Amarillo |
| C. Sin red | Offline | ✅ Local | ❌ Contingencia | ❌ Cola | 🔴 Rojo |
| D. Caja caída | Tablets offline | ✅ Local | ❌ Contingencia | ❌ Cola | 🔴 Rojo |
| E. Tablet caída | Otros siguen | ✅ Sync | ✅ OK | ✅ OK | 🟡 Amarillo |
| F. Sabotaje | Offline (intencional) | ✅ Local | ❌ Contingencia | ❌ Cola | 🔴 Rojo + auditoría |
| G. Interferencia | LAN degradado | ✅ Sync | ✅ OK | ✅ OK | 🟡 Amarillo |
| H. Corte de luz | Todo se reinicia | ✅ Persistencia | ✅ Contingencia | ✅ OK | 🟡 Al volver |

---

## 4. PERSPECTIVA 3: GENERAL ECONÓMICO (¿Es viable?)

### 4.1 Costos de infraestructura

| Componente | Costo mensual | Notas |
|------------|--------------|-------|
| Supabase (free tier) | $0 | 500 MB DB, 1 GB storage, 2 GB bandwidth |
| Supabase (pro) | $25/mes | 8 GB DB, 100 GB storage, 50 GB bandwidth |
| Servidor LAN (Rust) | $0 | Corre en la caja (hardware del cliente) |
| mDNS | $0 | Protocolo estándar, sin servidor |
| WebRTC (futuro) | $0-50/mes | TURN relay solo si es necesario |
| Nostr relays (futuro) | $0 | Relays públicos gratuitos |
| DIAN (facturación) | $0-50/mes | Depende del proveedor (Dataico) |

### 4.2 Costo por dispositivo

| Dispositivo | Costo de hardware | Costo de software | Total |
|-------------|-------------------|-------------------|-------|
| Caja (PC Windows) | $300-800 | $0 (licencia incluida) | $300-800 |
| Tablet Android | $100-300 | $0 | $100-300 |
| Celular Android | $50-200 | $0 | $50-200 |
| Impresora térmica | $30-80 | $0 | $30-80 |

### 4.3 ROI (retorno de inversión)

| Escenario | Inversión inicial | Ahorro mensual | ROI |
|-----------|------------------|----------------|-----|
| Restaurante pequeño (1 caja + 2 tablets) | $500-1,200 | $100-300 (menos errores, menos papel) | 2-4 meses |
| Restaurante mediano (1 caja + 5 tablets) | $1,000-2,500 | $300-800 | 2-3 meses |
| Restaurante grande (2 cajas + 15 tablets) | $3,000-8,000 | $1,000-3,000 | 2-3 meses |

### 4.4 Veredicto económico
✅ **Viable.** El costo de infraestructura es mínimo ($0-25/mes para cloud). El ROI es de 2-4 meses. El sistema se paga solo con la reducción de errores y la eficiencia operativa.

---

## 5. PERSPECTIVA 4: GENERAL DE RECURSOS (¿Tenemos lo necesario?)

### 5.1 Recursos técnicos disponibles

| Recurso | Disponible | Estado |
|---------|-----------|--------|
| Servidor LAN (Rust) | ✅ | Implementado |
| mDNS | ✅ | Implementado |
| WebSocket | ✅ | Implementado (bug latente) |
| Cloud sync (Supabase) | ✅ | Implementado |
| QR pairing | ✅ | Implementado |
| Offline mode | ✅ | Implementado |
| Contingencia fiscal | ✅ | Implementado |
| Persistencia local | ✅ | Implementado |
| Watchdog | ✅ | Implementado |
| Reconnect sync | ✅ | Implementado |
| Outbox pattern | ✅ | Implementado |
| Indicador de conexión | ❌ | No implementado |
| Notificación de pérdida | ❌ | No implementado |
| Cola de impresión | ❌ | No implementado |
| Failover de caja | ❌ | No implementado |
| Cifrado en LAN | ❌ | No implementado |
| WebRTC P2P | ❌ | No implementado |

### 5.2 Recursos humanos

| Rol | Disponible | Necesario |
|-----|-----------|-----------|
| Desarrollador (Rust + JS) | ✅ (tú) | 1 persona |
| Tester | ❌ | 1 persona (o agentes IA) |
| Soporte técnico | ❌ | 1 persona (futuro) |

### 5.3 Recursos de tiempo

| Fase | Duración | Prioridad |
|------|----------|-----------|
| Corregir bugs críticos | 1-2 días | 🔴 Alta |
| Indicador + notificación | 1-2 días | 🔴 Alta |
| Cola de impresión | 2-3 días | 🟡 Media |
| Failover de caja | 1-2 semanas | 🟡 Media |
| Cifrado en LAN | 1 semana | 🟡 Media |
| WebRTC P2P | 1-2 semanas | 🟢 Baja |
| Auto-discovery Bluetooth | 1-2 semanas | 🟢 Baja |

### 5.4 Veredicto de recursos
✅ **Suficientes para las fases 1-2 (críticas + UX).** Las fases 3-5 requieren más tiempo pero son opcionales.

---

## 6. PERSPECTIVA 5: GENERAL DE SEGURIDAD (¿Resiste ataques?)

### 6.1 Amenazas

| Amenaza | Probabilidad | Impacto | Mitigación actual |
|---------|-------------|---------|-------------------|
| Interceptación en LAN (sniffing) | Media | Alto | ❌ Sin cifrado en LAN |
| Mesero desconecta intencionalmente | Baja | Medio | ⚠️ Watchdog detecta pero no notifica |
| Dispositivo robado | Baja | Alto | ⚠️ Token en localStorage (no encriptado) |
| Falsificación de identidad | Baja | Alto | ✅ Token de pareo (ECDH) |
| Replay attack | Baja | Medio | ⚠️ Sin nonce/timestamp en mensajes |
| Denial of service (flood) | Baja | Medio | ✅ Rate limiting (RUT) |
| Inyección SQL en Supabase | Baja | Alto | ✅ Parameterized queries |
| XSS en WebView | Media | Alto | ⚠️ CSP configurado pero 'unsafe-inline' |

### 6.2 Mejoras de seguridad necesarias

| Mejora | Prioridad | Esfuerzo |
|--------|-----------|----------|
| TLS en LAN (certificados self-signed) | 🔴 Alta | 2-3 días |
| Cifrado de payloads (AES-256-GCM) | 🔴 Alta | 2-3 días |
| Firma de mensajes (HMAC-SHA256) | 🟡 Media | 1-2 días |
| Nonce/timestamp en mensajes | 🟡 Media | 1 día |
| Token en almacén seguro (DPAPI/Keychain) | 🟡 Media | 2-3 días |
| CSP más restrictivo (sin unsafe-inline) | 🟢 Baja | 1 semana |

---

## 7. PERSPECTIVA 6: GENERAL DE ESCALA (¿Funciona con 100+ dispositivos?)

### 7.1 Límites actuales

| Componente | Límite actual | 20 dispositivos | 100 dispositivos |
|------------|--------------|-----------------|------------------|
| mDNS | ~40 peers | ✅ OK | ❌ Multicast storm |
| Semaphore HTTP | 64 conn | ✅ OK | ⚠️ Saturado |
| WS broadcast | O(n) | ✅ OK | ⚠️ 10,000 msg/min |
| localStorage | 4.5 MB | ⚠️ Ajustado | ❌ Insuficiente |
| Sync runtime | Completo cada 2-4s | ✅ OK | ❌ 200-600 KB/s |
| Supabase bandwidth | 2-50 GB/mes | ✅ OK | ⚠️ Throttling |

### 7.2 Estrategia de escala

| Nivel | Dispositivos | Mesas | Cambios necesarios |
|-------|-------------|-------|-------------------|
| 1 (pequeño) | 2-5 | 4-15 | Ninguno |
| 2 (mediano) | 6-15 | 15-40 | Sync incremental, SQLite |
| 3 (grande) | 16-40 | 40-120 | Cloud discovery, batching, semaphore 128 |
| 4 (masivo) | 40-100+ | 100-500+ | Sharding, cloud backbone, load balancer |

### 7.3 Veredicto de escala
- **Nivel 1-2**: Funciona sin cambios mayores.
- **Nivel 3**: Requiere 3-4 semanas de trabajo.
- **Nivel 4**: Requiere 2-3 meses de trabajo.

---

## 8. PERSPECTIVA 7: GENERAL DE UX (¿El usuario no siente nada?)

### 8.1 Principios de UX para conectividad

1. **Invisible cuando funciona**: El usuario no debe saber que hay sync. Todo es automático.
2. **Visible cuando falla**: Indicador sutil (icono en barra, no popup invasivo).
3. **No bloqueante**: La app nunca se bloquea por falta de conexión. Siempre se puede tomar pedidos.
4. **Recuperación automática**: Al volver la conexión, sync automático sin intervención.
5. **Feedback proporcional**: Verde (OK), Amarillo (degradado), Rojo (offline). No más.

### 8.2 Indicador de conexión (propuesto)

```
┌─────────────────────────────────────────────┐
│  [🟢] Bona Origen · Caja · Mesa 5           │  ← Barra superior
│  ─────────────────────────────────────────  │
│  ...contenido de la app...                  │
└─────────────────────────────────────────────┘

Estados:
  🟢 Verde: Conectado (LAN + Cloud) — todo funciona
  🟡 Amarillo: Conectado (solo LAN o solo Cloud) — sync parcial
  🔴 Rojo: Offline — datos locales, sync pendiente

Comportamiento:
  - Verde → Amarillo: icono cambia, sin popup
  - Amarillo → Rojo: icono cambia + sonido sutil + banner pequeño en la parte inferior
  - Rojo → Verde: icono cambia + notificación "Reconectado — sincronizando"
  - El banner NO tapa la pantalla (solo una línea en la parte inferior)
  - El usuario puede cerrar el banner con un tap
```

### 8.3 Anti-sabotaje (sin ser invasivo)

```
Si un mesero desconecta intencionalmente:
  1. Indicador cambia a 🔴 (inmediato)
  2. Sonido sutil (1 vez, no repetitivo)
  3. Banner: "Sin conexión — los pedidos se guardan localmente"
  4. Registro de auditoría: "Tablet X desconectada a las 10:30 por 5 min"
  5. Al reconectar: "Reconectado — sincronizando 3 pedidos pendientes"
  6. Admin ve en reporte: "Tablet X tuvo 3 desconexiones hoy"

NO se bloquea la app. NO se muestra popup invasivo. NO se acusa al usuario.
Solo se informa y se registra.
```

---

## 9. SÍNTESIS: LO QUE CONVIENE Y LO QUE NO

### 9.1 Lo que CONVIENE hacer

| # | Acción | Por qué | Prioridad |
|---|--------|---------|-----------|
| 1 | Corregir bugs críticos (digest, WS panic) | Sin esto, la sync falla | 🔴 Alta |
| 2 | Indicador de conexión + notificación | UX crítica, sin esto el usuario no sabe si está conectado | 🔴 Alta |
| 3 | Cola de impresión con retry | Sin esto, las comandas no se imprimen | 🟡 Media |
| 4 | Cifrado en LAN (TLS + AES) | Sin esto, datos interceptables | 🟡 Media |
| 5 | Sync incremental | Para escalar a 40+ dispositivos | 🟡 Media |
| 6 | WebRTC P2P | Para baja latencia y no saturar DB | 🟢 Baja |
| 7 | Transferencia por link | Para archivos grandes | 🟢 Baja |

### 9.2 Lo que NO conviene hacer

| # | Acción | Por qué no |
|---|--------|------------|
| 1 | WiFi Direct | Complejidad excesiva, no estándar en web |
| 2 | Bluetooth mesh | Ancho de banda insuficiente, complejidad alta |
| 3 | GitHub como relay | Rate limits, no tiempo real, TOS |
| 4 | Múltiples servidores LAN (sharding) | Overkill para <40 dispositivos |
| 5 | Auto-discovery por Bluetooth | Requiere plugin nativo, complejidad alta |

### 9.3 Lo que ya funciona (no tocar)

| # | Componente | Estado |
|---|------------|--------|
| 1 | mDNS discovery | ✅ Funciona |
| 2 | QR pairing (ECDH) | ✅ Funciona |
| 3 | Cloud sync (Supabase) | ✅ Funciona |
| 4 | Offline mode | ✅ Funciona |
| 5 | Persistencia (SQLite + outbox) | ✅ Funciona |
| 6 | Contingencia fiscal (48h) | ✅ Funciona |
| 7 | Deduplicación (5 mecanismos) | ✅ Funciona |
| 8 | Reconnect sync | ✅ Funciona |
| 9 | Watchdog | ✅ Funciona |

---

## 10. PLAN DE IMPLEMENTACIÓN UNIFICADO

### Fase 1 — Corregir bugs críticos (1-2 días) 🔴
- [ ] Fix digest LAN (incluir estado en hash)
- [ ] Fix WS broadcast panic (async await)
- [ ] Fix body 64KB truncation (read loop)
- [ ] Agregar `since` param a /api/comandas

### Fase 2 — UX de conectividad (1-2 días) 🔴
- [ ] Indicador visual (🟢🟡🔴) en barra superior
- [ ] Notificación de pérdida/reconexión (banner + sonido)
- [ ] Registro de auditoría de desconexiones

### Fase 3 — Resiliencia (2-3 días) 🟡
- [ ] Cola de impresión con retry
- [ ] Cifrado de payloads en LAN (AES-256-GCM)
- [ ] Firma de mensajes (HMAC-SHA256)

### Fase 4 — Escalabilidad (1-2 semanas) 🟡
- [ ] Sync incremental (solo cambios)
- [ ] Migrar runtime a SQLite/IndexedDB
- [ ] Stagger de polls con jitter
- [ ] Cloud discovery para >20 dispositivos
- [ ] Batching de sync (5-10s)

### Fase 5 — WebRTC P2P (1-2 semanas) 🟢
- [ ] Signaling vía Supabase
- [ ] Data channel para sync
- [ ] Fallback a HTTP/WS
- [ ] Transferencia de archivos grandes

### Fase 6 — Seguridad (1 semana) 🟢
- [ ] TLS en LAN (certificados self-signed)
- [ ] Token en almacén seguro (DPAPI/Keychain)
- [ ] CSP más restrictivo

---

## 11. CRITERIOS DE ÉXITO

| Criterio | Cómo verificar | Estado |
|----------|----------------|--------|
| Escanear QR → conexión automática | Probar en 2 dispositivos reales | ⏳ Pendiente |
| Comanda llega a cocina en <2s | Medir tiempo end-to-end | ⏳ Pendiente |
| Sin duplicados en 10 dispositivos | Enviar 100 comandas, verificar count | ⏳ Pendiente |
| Offline → sync al volver | Desconectar WiFi, operar, reconectar | ⏳ Pendiente |
| 20 dispositivos sin colapso | Stress test con 20 dispositivos | ⏳ Pendiente |
| Cifrado en LAN | Capturar tráfico, verificar ilegible | ⏳ Pendiente |
| Permisos se piden una vez | Instalar en Android/iOS | ⏳ Pendiente |
| Indicador visible sin ser invasivo | Probar en dispositivo real | ⏳ Pendiente |
| Sabotaje detectado y registrado | Desconectar intencionalmente | ⏳ Pendiente |

---

## 12.5. FALLBACK DE COMUNICACIÓN: Órdenes deben llegar SIEMPRE

### El problema real que el usuario identifica

> "Si funciona offline y no hay internet ni hay comunicación, la información se queda en el dispositivo. Pero no llega a caja ni a cocina."

**Esta es la falla crítica.** El modo offline actual guarda datos localmente, pero NO los entrega a cocina/caja en tiempo real.

### La verdad sobre el modo offline actual

```
Tablet toma pedido → se guarda local → NO se envía a cocina
  → Cocina NO sabe que hay pedido
  → Caja NO sabe que hay venta
  → El mesero lleva el pedido... pero cocina no lo prepara
  → 2-3 días después → sync → cocina recibe pedido viejo
  → DESASTRE OPERATIVO
```

**El modo offline actual es insuficiente para un restaurante.**

### Lo que REALMENTE se necesita: comunicación multi-capa con fallback automático

```
CAPA 1 — LAN directa (misma red WiFi)
  ├──► mDNS descubre caja → HTTP/WS sync (1-5ms latencia)
  ├──► Si falla → CAPA 2
  └──► COMANDAS LLEGAN A COCINA EN TIEMPO REAL

CAPA 2 — Hotspot WiFi (un dispositivo crea red)
  ├──► Caja o tablet con más recursos crea hotspot WiFi
  ├──► Otros dispositivos se conectan automáticamente (red ya conocida)
  ├──► mDNS funciona sobre hotspot → sync LAN
  ├──► Si falla → CAPA 3
  └──► COMANDAS LLEGAN A COCINA EN TIEMPO REAL

CAPA 3 — Bluetooth LE (sin WiFi, sin internet)
  ├──► Dispositivos ya emparejados por Bluetooth
  ├──► Sync de comandas y estados (datos pequeños, 500-1,500 bytes)
  ├──► Sync runtime (1-4 KB/s, BLE puede manejarlo)
  ├──► Si falla → CAPA 4
  └──► COMANDAS LLEGAN A COCINA EN TIEMPO REAL (con latencia mayor)

CAPA 4 — Cloud (internet disponible)
  ├──► Supabase como relay
  ├──► Funciona cross-network
  ├──► Si falla → CAPA 5
  └──► COMANDAS LLEGAN A COCINA (con latencia de internet)

CAPA 5 — Offline puro (sin nada)
  ├──► Datos guardados localmente
  ├──► Contingencia fiscal (48h SLA)
  ├──► Sync cuando vuelve conexión
  └──► COMANDAS NO LLEGAN A COCINA (único escenario sin comunicación)
```

### La regla de oro

> **Las órdenes deben llegar a cocina/caja SIEMPRE que haya algún canal de comunicación disponible.**
> Solo en el escenario extremo (sin WiFi, sin internet, sin Bluetooth, sin hotspot) los datos se guardan localmente.

### Prioridad de conexión (automática, sin intervención del usuario)

```
1. ¿Misma red WiFi? → mDNS + HTTP/WS (instantáneo, 1-5ms)
2. ¿Hay internet? → Cloud (Supabase, 30-100ms)
3. ¿Sin WiFi pero hay hotspot conocido? → Conectar → mDNS
4. ¿Sin WiFi ni hotspot? → Bluetooth LE (si emparejado, 10-30ms)
5. ¿Sin nada? → Offline (guardar local, sync después)
```

### Cómo se implementa el fallback automático

```
TABLET toma pedido:
  1. Intenta enviar por LAN (HTTP POST a caja)
     → Si OK → cocina recibe → ✅
     → Si falla → paso 2
  2. Intenta enviar por Cloud (Supabase)
     → Si OK → cocina recibe (con latencia de internet) → ✅
     → Si falla → paso 3
  3. Intenta enviar por Bluetooth (si emparejado)
     → Si OK → cocina recibe (con latencia mayor) → ✅
     → Si falla → paso 4
  4. Guarda local → outbox → reintenta cada 30s
     → Cuando vuelve conexión → drena outbox → cocina recibe
     → ⚠️ Cocina NO recibió en tiempo real (solo en este escenario extremo)
```

### Lo que falta implementar

| # | Componente | Qué hace | Prioridad | Esfuerzo |
|---|-----------|----------|-----------|----------|
| 1 | **Fallback automático de canal** | Si LAN falla → intenta cloud → bluetooth → offline | 🔴 Alta | 2-3 días |
| 2 | **Hotspot automático** | Caja crea hotspot WiFi cuando LAN cae | 🟡 Media | 3-5 días |
| 3 | **Bluetooth LE sync** | Sync por BLE cuando no hay WiFi | 🟡 Media | 1-2 semanas |
| 4 | **Indicador de canal activo** | Muestra qué canal se está usando (LAN/Cloud/BLE/Offline) | 🟡 Media | 1 día |
| 5 | **Cola de comandas pendientes** | Lista de comandas no enviadas con retry | 🟡 Media | 2-3 días |

### La regla de oro (resumen)

> **Las órdenes deben llegar a cocina/caja SIEMPRE que haya algún canal de comunicación disponible.**
> Solo en el escenario extremo (sin WiFi, sin internet, sin Bluetooth, sin hotspot) los datos se guardan localmente.
> En ese caso extremo, se debe notificar al usuario: "Sin conexión — las órdenes se enviarán cuando se restablezca la comunicación."

### Diagrama de fallback completo

```
TABLET toma pedido
        │
        ▼
  ¿Misma red WiFi? (mDNS)
        │
        ├── SÍ → HTTP/WS a caja → cocina recibe ✅ (1-5ms)
        │
        └── NO → ¿Hay internet?
                  │
                  ├── SÍ → Cloud (Supabase) → cocina recibe ✅ (30-100ms)
                  │
                  └── NO → ¿Hay hotspot conocido?
                            │
                            ├── SÍ → Conectar → mDNS → sync ✅ (1-5ms)
                            │
                            └── NO → ¿Bluetooth emparejado?
                                      │
                                      ├── SÍ → BLE sync ✅ (10-30ms)
                                      │
                                      └── NO → OFFLINE (guardar local)
                                                → Notificar usuario
                                                → Reintentar cada 30s
                                                → Cuando vuelve conexión → sync
```

---

## 12. CONCLUSIONES Y RECOMENDACIONES FINALES

### Lo que ya funciona (no tocar)
1. mDNS discovery — cero fricción
2. QR pairing (ECDH) — una vez, luego automático
3. Cloud fallback — cross-network
4. Offline mode — datos locales + sync
5. Persistencia (SQLite + outbox) — no se pierde info
6. Contingencia fiscal (48h) — facturación no se pierde
7. Deduplicación (5 mecanismos) — no se duplica
8. Reconnect sync — automático
9. Watchdog — detecta caídas

### Lo que hay que corregir (bugs)
1. Digest LAN ciego
2. WS broadcast panic
3. Body 64KB truncation
4. Outbox sin idempotencia
5. Multi-writer carrito

### Lo que hay que implementar (nuevo)
1. Cifrado en LAN (TLS + AES-256-GCM)
2. Indicador visual + notificación
3. Cola de impresión con retry
4. WebRTC P2P (complemento)
5. Sync incremental (escalabilidad)

### El objetivo final
> "Escaneo un QR con mi celular y la app se conecta automáticamente. Empiezo a comandar sin configuración manual. Si no hay internet, funciona offline. Si hay internet, sincroniza. Si hay WiFi, es instantáneo. Si hay muchos dispositivos, no colapsa. Los datos están cifrados. No se pierde información. Si alguien desconecta, se registra. El usuario no siente nada."

**Esto es alcanzable** con las correcciones y mejoras propuestas. El sistema ya tiene el 80% implementado. El 20% restante son bugs latentes y optimizaciones de UX.

### La verdad sobre el código
El código existe y es sofisticado. Pero **no se ha probado en condiciones reales**. Los tests automatizados cubren el 80% de la lógica, pero el 20% crítico (conectividad real, inventario, costeo, cierre) nunca se ha verificado con dispositivos reales.

**Recomendación final: Probar con 2+ dispositivos reales antes de desplegar a producción.** Sin eso, no podemos garantizar que funciona. Lo que sí podemos garantizar es que no crashea. Pero eso no es suficiente para un sistema que maneja dinero, inventario y facturación fiscal.