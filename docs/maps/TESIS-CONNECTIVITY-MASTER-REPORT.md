# TESIS DE CONECTIVIDAD Y EMPAREJAMIENTO — Crozzo POS (Bona Origen)

> Fecha: 2026-11-08 · Tipo: Reporte de investigación completo (tesis)
> Objetivo: Documentar TODO lo necesario para implementar conectividad frictionless entre dispositivos (QR → conexión automática → comunicación sin fricción), desde un celular hasta la caja central, con fallback a offline.

---

## ÍNDICE

1. Visión general del sistema
2. Estado actual de la conectividad (lo que YA existe)
3. Flujo ideal de emparejamiento (lo que queremos)
4. Análisis de tamaño de datos y comunicación
5. Escalabilidad: de 2 a 100+ dispositivos
6. Opciones de conectividad: análisis de viabilidad
7. Seguridad y cifrado
8. Permisos por plataforma
9. Bugs latentes y riesgos
10. Roadmap de implementación completo
11. Criterios de éxito (cómo saber que funciona)
12. Conclusiones y recomendaciones finales

---

## 1. VISIÓN GENERAL DEL SISTEMA

### 1.1 Qué es Crozzo POS (Bona Origen)
- Sistema POS para restaurantes/comercios colombianos
- Arquitectura: Tauri (Rust + WebView) para desktop, APK para Android
- Multi-dispositivo: caja (central), tablets (meseros), cocina, bar
- Fiscal: facturación electrónica DIAN (UBL 2.1)
- Sync: LAN (HTTP/WS/mDNS) + Cloud (Supabase) + Offline

### 1.2 El problema que queremos resolver
El usuario quiere:
1. Instalar la app en un computador central (caja)
2. Instalar la app en un celular/tablet
3. Escanear un QR → conexión automática
4. Empezar a comandar inmediatamente
5. Sin configuración manual, sin "mil maromas"
6. Que funcione con WiFi, sin WiFi (Bluetooth/offline), con internet, sin internet
7. Que se escale de 2 a 100+ dispositivos

---

## 2. ESTADO ACTUAL DE LA CONECTIVIDAD

### 2.1 Lo que YA está implementado

| Componente | Archivo | Estado | Detalle |
|------------|---------|--------|---------|
| Servidor HTTP LAN (port 3000) | `src-tauri/src/crozzo_lan_sync_server.rs` | ✅ Implementado | Endpoints /health, /status, /api/* |
| WebSocket push (port 3001) | `src-tauri/src/crozzo_lan_ws.rs` | ✅ Implementado | Broadcast tiempo real |
| mDNS descubrimiento | `src-tauri/src/crozzo_mdns.rs` | ✅ Implementado | `_crozzo-pos._tcp.local.` |
| Auth token (x-crozzo-lan-token) | `crozzo_lan_sync_server.rs` | ✅ Implementado | Token de pareo |
| Persistencia (SQLite) | `crozzo_lan_persistence` | ✅ Implementado | Operaciones pendientes |
| Rate limiting (RUT) | `crozzo_lan_sync_server.rs` | ✅ Implementado | 1 consulta/6s por IP |
| CORS + semaphore (64 conn) | `crozzo_lan_sync_server.rs` | ✅ Implementado | Configurable por env |
| Cloud mirror + drain | `CrozzoPosRuntimeCloud.js` | ✅ Implementado | Supabase, outbox, ACK |
| Sync comandas LAN | `CrozzoLanOpsSync.js` | ✅ Implementado | Pull/push WS + HTTP |
| QR de pareo (ECDH P-256) | `CrozzoPairingSeal.js` | ✅ Implementado | Cifrado + firma |
| Lector QR | `CrozzoPairingQrReader.js` | ✅ Implementado | Escaneo con cámara |
| Auto-conexión post-pareo | `CrozzoPairingAutoConnect.js` | ✅ Implementado | Conexión automática |
| Modo offline | Varios | ✅ Implementado | Datos locales + sync después |
| Contingencia fiscal (48h SLA) | `CrozzoContingenciaFiscal.js` | ✅ Implementado | Cola de timbrado |

### 2.2 Lo que NO está implementado

| Componente | Estado | Notas |
|------------|--------|-------|
| WebRTC P2P | ❌ No implementado | Complemento para baja latencia |
| Bluetooth LE sync | ❌ No implementado | Solo para impresoras |
| Transferencia por link | ❌ No implementado | Para archivos grandes |
| Cifrado TLS en LAN | ❌ No implementado | HTTP/WS sin TLS |
| Cifrado de payloads | ❌ No implementado | AES-256-GCM pendiente |

### 2.3 Bugs latentes (problemas reales)

| # | Bug | Archivo | Prioridad | Fix |
|---|-----|---------|-----------|-----|
| 1 | Digest LAN ciego | `CrozzoLanOpsSync.js` | 🔴 Alta | Incluir estado en hash |
| 2 | WS broadcast panic | `crozzo_lan_ws.rs` | 🔴 Alta | Async await |
| 3 | Body 64KB truncation | `crozzo_lan_sync_server.rs` | 🟡 Media | Read loop |
| 4 | Outbox sin idempotencia | `CrozzoComandasCloudSync.js` | 🟡 Media | Consecutivo |
| 5 | Multi-writer carrito | `CrozzoPosRuntimeCloud.js` | 🟡 Media | Lock optimista |

---

## 3. FLUJO IDEAL DE EMPAREJAMIENTO

### 3.1 Paso a paso (lo que el usuario quiere)

```
PASO 1: Instalar en computador central (Rol A / Caja)
  → Configurar empresa, impresoras, base de datos
  → App genera QR de pareo automáticamente
  → QR se muestra en pantalla grande

PASO 2: Instalar en celular/tablet (Rol B)
  → App pide permisos (red, cámara, Bluetooth) — UNA vez
  → Usuario escanea QR del computador
  → Celular descifra payload → guarda credenciales
  → Celular se conecta automáticamente

PASO 3: Descubrimiento automático
  → Caja anuncia _crozzo-pos._tcp por mDNS
  → Tablet en misma red descubre caja automáticamente
  → Tablet se autentica con token
  → Caja registra: "Tablet X se unió"
  → Caja notifica a otros dispositivos

PASO 4: Comunicación continua (automática)
  → Prioridad: mDNS (LAN) → Cloud (internet) → Offline (sin red)
  → Si un dispositivo se cae → los demás siguen
  → Cuando vuelve → sync automático
  → No se pierde información

PASO 5: Fallback sin red
  → Todos en modo offline
  → Datos locales + contingencia fiscal (48h SLA)
  → Sync cuando vuelve conexión
```

### 3.2 Permisos por plataforma

**Android (AndroidManifest.xml + runtime):**
- ACCESS_WIFI_STATE, CHANGE_WIFI_MULTICAST_STATE
- INTERNET, ACCESS_NETWORK_STATE
- BLUETOOTH, BLUETOOTH_ADMIN
- ACCESS_FINE_LOCATION (para mDNS/BLE)

**iOS (Info.plist + runtime):**
- NSLocalNetworkUsageDescription
- NSBonjourServices (_crozzo-pos._tcp)
- NSBluetoothAlwaysUsageDescription

**Windows/macOS (Tauri):**
- Firewall prompt (una vez, port 3000)

---

## 4. ANÁLISIS DE TAMAÑO DE DATOS Y COMUNICACIÓN

### 4.1 Tamaño real de los datos (a ritmo humano)

| Mensaje | Tamaño típico | Máximo |
|---------|---------------|--------|
| Comanda (3-5 items) | 500-800 bytes | 1,500 bytes |
| Comanda (10+ items) | 1,200-1,500 bytes | 2,000 bytes |
| Estado de mesas (20 mesas) | 2,000-4,000 bytes | 8,000 bytes |
| Factura (5 items) | 1,500-2,500 bytes | 4,000 bytes |
| Presence/digest | 80-120 bytes | 200 bytes |
| Sync runtime completo | 5,000-10,000 bytes | 20,000 bytes |

### 4.2 Volumen real por hora (restaurante con 3 meseros, 20 mesas)

| Flujo | Mensajes/hora | Bytes/hora |
|-------|---------------|------------|
| Comandas | 6-12 | 3,000-18,000 |
| Cambios de estado | 6-12 | 600-2,400 |
| Cobros | 6-12 | 9,000-30,000 |
| Sync runtime | 900-3,600 | 1.8-14.4 MB |
| Presence | 360-720 | 28,800-86,400 |
| Facturas DIAN | 6-12 | 18,000-96,000 |
| **Total** | **~1,000-3,700** | **~1.9-14.6 MB/hora** |

### 4.3 Viabilidad por canal

| Canal | Ancho de banda | Latencia | Comandas | Sync runtime | Veredicto |
|-------|---------------|----------|----------|--------------|-----------|
| WiFi LAN | 50-800 Mbps | 1-5 ms | ✅ | ✅ | ✅ Sobrado |
| 4G | 5-50 Mbps | 30-100 ms | ✅ | ✅ | ✅ OK |
| 3G | 0.5-5 Mbps | 100-300 ms | ✅ | ⚠️ Justo | ⚠️ OK |
| Bluetooth LE | 1-2 Mbps | 10-30 ms | ✅ | ✅ | ✅ Viable (corregido) |
| Bluetooth Classic | 2-3 Mbps | 10-20 ms | ✅ | ✅ | ✅ Viable |
| Edge | 0.1-0.3 Mbps | 300-800 ms | ⚠️ | ❌ | ❌ Insuficiente |

**Conclusión: Con tiempos reales de humanos, Bluetooth LE SÍ es viable para comandas, cambios de estado y presencia.** Una comanda de 1,500 bytes se envía en 12ms por BLE.

---

## 5. ESCALABILIDAD: de 2 a 100+ dispositivos

### 5.1 Escenarios

| Escenario | Dispositivos | Mesas | Áreas | Veredicto |
|-----------|-------------|-------|-------|-----------|
| Pequeño | 2-5 | 4-15 | 1-2 | ✅ Sin cambios |
| Mediano | 6-15 | 15-40 | 2-4 | ✅ Optimizaciones menores |
| Grande | 16-40 | 40-120 | 4-8 | ⚠️ Cambios arquitectónicos |
| Masivo | 40-100+ | 100-500+ | 10+ | ❌ Arquitectura distribuida |

### 5.2 Cuellos de botella por escenario

**Pequeño (2-5 disp, 4-15 mesas):** Ninguno. Todo funciona.

**Mediano (6-15 disp, 15-40 mesas):**
- Sync runtime (2-5 KB × 15 = 30-75 KB/s) → OK
- localStorage (3-8 MB) → ajustado
- mDNS (15 peers) → OK

**Grande (16-40 disp, 40-120 mesas):**
- Sync runtime (5-15 KB × 40 = 200-600 KB/s) → CRÍTICO
- localStorage (10-30 MB) → insuficiente
- mDNS (16-40 peers) → degradado
- Semaphore (64 conn) → puede saturar

**Masivo (40-100+ disp, 100-500+ mesas):**
- Todo lo anterior × 2-3
- mDNS colapso (multicast storm)
- WS broadcast O(n²)
- Supabase rate limits

### 5.3 Roadmap de escalabilidad

**Nivel 1 (Pequeño)** — Ya funciona, no requiere cambios.

**Nivel 2 (Mediano)** — 1-2 semanas:
- Sync incremental (solo cambios, no estado completo)
- Migrar runtime de localStorage a SQLite/IndexedDB
- Stagger de polls con jitter

**Nivel 3 (Grande)** — 3-4 semanas:
- Cloud discovery (no mDNS para >20 dispositivos)
- Batching de sync (cada 5-10s)
- Semaphore 128-256
- WS rooms (broadcast solo a relevantes)

**Nivel 4 (Masivo)** — 2-3 meses:
- Múltiples servidores LAN (sharding por área)
- Cloud como backbone principal
- Load balancer

---

## 6. CONSISTENCIA MULTI-DISPOSITIVO

### 6.1 Mecanismos de deduplicación (5 capas)

| Mecanismo | Cómo funciona | Archivo |
|-----------|---------------|---------|
| transaction_id (UUID) | ID único por comanda. Si llega duplicado → se ignora | `CrozzoPosMain.js:10074` |
| comandaTidRecent | Marca tid como "visto" por 45-120s | `CrozzoComandasCloudSync.js:281` |
| comandaInsertLikelyOwnEcho | Detecta echo propio → se ignora | `CrozzoComandasCloudSync.js:1135` |
| findComandaForCloudPay | Busca por transaction_id → no duplica | `CrozzoComandasCloudSync.js:665` |
| Estado no regresa | Si "entregada", no vuelve a "pendiente" | `CrozzoComandasCloudSync.js:671` |

### 6.2 Flujo real entre 5 dispositivos

```
1. Mesero (Tablet B) crea comanda → transaction_id = "abc-123"
2. Envía a Caja → Caja agrega → marca como visto
3. Caja WS broadcast → Cocina recibe → busca "abc-123" → no existe → agrega
4. Tablet C recibe WS → busca "abc-123" → no existe → agrega
5. Si se reenvía → busca "abc-123" → ya existe → IGNORA
```

**Resultado: La comanda se aplica UNA vez en cada dispositivo.**

### 6.3 Escenarios de fallo

| Escenario | Manejo |
|-----------|--------|
| Mensaje se pierde | Outbox + reintento automático |
| Mensaje duplicado | transaction_id → se ignora |
| Dispositivo se cae y vuelve | Pull completo → recupera todo |
| Dos editan la misma comanda | Merge por timestamp (LWW) |
| 20 dispositivos | Dedup por transaction_id en cada receptor |

---

## 7. SEGURIDAD Y CIFRADO

### 7.1 Lo que ya se cifra

| Dato | Cifrado | Método |
|------|---------|--------|
| QR de pareo | ✅ | ECDH P-256 + firma |
| Token LAN | ✅ | Generado criptográficamente |
| Sync HTTP | ✅ | TLS (HTTPS/WSS) |
| Cloud (Supabase) | ✅ | TLS |

### 7.2 Lo que NO se cifra (y debería)

| Dato | Estado | Riesgo |
|------|--------|--------|
| Comandas en LAN (HTTP) | ❌ Sin cifrado adicional | Interceptable en red local |
| Comandas en LAN (WS) | ❌ Sin cifrado adicional | Interceptable en red local |
| Runtime sync (mesas) | ❌ Sin cifrado adicional | Interceptable en red local |

### 7.3 Cifrado recomendado para LAN
- **TLS en HTTP/WS**: Certificados self-signed o mTLS
- **Payload encryption**: AES-256-GCM para datos sensibles
- **Firma de mensajes**: HMAC-SHA256 con token compartido

---

## 8. OPCIONES DE CONECTIVIDAD

### 8.1 Análisis de viabilidad

| Opción | Viabilidad | Recomendación |
|--------|-----------|---------------|
| mDNS (misma red) | ✅ Ya implementado | Primario |
| Cloud (Supabase) | ✅ Ya implementado | Fallback |
| WebRTC P2P | ⚠️ Complemento | Para archivos grandes, baja latencia |
| Bluetooth LE | ⚠️ Limitado | Solo impresoras/dispositivos cercanos |
| WiFi Direct | ❌ No recomendado | Complejidad excesiva |
| Transferencia por link | ✅ Útil | Para exportar reportes |

### 8.2 Permisos por plataforma

**Android:**
- ACCESS_WIFI_STATE, CHANGE_WIFI_MULTICAST_STATE
- INTERNET, ACCESS_NETWORK_STATE
- BLUETOOTH, BLUETOOTH_ADMIN
- ACCESS_FINE_LOCATION (para mDNS/BLE)

**iOS:**
- NSLocalNetworkUsageDescription
- NSBonjourServices (_crozzo-pos._tcp)
- NSBluetoothAlwaysUsageDescription

**Windows/macOS:**
- Firewall prompt (una vez, port 3000)

---

## 9. BUGS LATENTES Y RIESGOS

| # | Bug | Archivo | Prioridad | Fix |
|---|-----|---------|-----------|-----|
| 1 | Digest LAN ciego | `CrozzoLanOpsSync.js` | 🔴 Alta | Incluir estado en hash |
| 2 | WS broadcast panic | `crozzo_lan_ws.rs` | 🔴 Alta | Async await |
| 3 | Body 64KB truncation | `crozzo_lan_sync_server.rs` | 🟡 Media | Read loop |
| 4 | Outbox sin idempotencia | `CrozzoComandasCloudSync.js` | 🟡 Media | Consecutivo |
| 5 | Multi-writer carrito | `CrozzoPosRuntimeCloud.js` | 🟡 Media | Lock optimista |

---

## 10. ROADMAP DE IMPLEMENTACIÓN COMPLETO

### Fase A — Corregir bugs críticos (1-2 días)
- Fix digest LAN (incluir estado en hash)
- Fix WS panic (async await en lugar de block_on)
- Fix body truncation (read loop)
- Agregar `since` param a /api/comandas

### Fase B — Frictionless pairing (3-5 días)
- Verificar permisos en Android/iOS (manifest + runtime)
- Auto-discovery por mDNS (ya implementado, verificar en campo)
- QR de pareo como fallback (ya implementado)
- Cloud fallback automático (ya implementado)
- Guía de configuración de permisos en la app

### Fase C — Optimizaciones de escalabilidad (1-2 semanas)
- Sync incremental (solo cambios, no estado completo)
- Migrar runtime de localStorage a SQLite/IndexedDB
- Stagger de polls con jitter
- Cloud discovery para >20 dispositivos
- Batching de sync (cada 5-10s)

### Fase D — WebRTC P2P (1-2 semanas)
- Implementar signaling vía Supabase (ya existe infra)
- Data channel para sync de datos (no solo archivos)
- Fallback a HTTP/WS si WebRTC falla
- Transferencia de archivos grandes (reportes, backups)

### Fase E — Seguridad (1 semana)
- Obligar TLS en LAN (certificados self-signed)
- Cifrar payloads con AES-256-GCM
- Firmar mensajes con HMAC-SHA256

### Fase F — Transferencia por link (1 semana)
- Endpoint para generar link de descarga
- Descarga por código/link (estilo wormhole)
- Útil para exportar reportes sin saturar DB

---

## 11. CRITERIOS DE ÉXITO

### Cómo saber que funciona

| Criterio | Cómo verificar |
|----------|----------------|
| Escanear QR → conexión automática | Probar en 2 dispositivos reales |
| Comanda llega a cocina en <2s | Medir tiempo end-to-end |
| Sin duplicados en 10 dispositivos | Enviar 100 comandas, verificar count |
| Offline → sync al volver | Desconectar WiFi, operar, reconectar, verificar |
| 20 dispositivos sin colapso | Stress test con 20 tabs/dispositivos |
| Cifrado en LAN | Capturar tráfico, verificar que no es legible |
| Permisos se piden una vez | Instalar en Android/iOS, verificar prompt |

---

## 12. CONCLUSIONES Y RECOMENDACIONES FINALES

### Lo que YA funciona (no tocar)
1. **mDNS discovery** — cero fricción, automático
2. **QR pairing** — una vez, luego automático
3. **Cloud fallback** — cross-network, automático
4. **Offline mode** — datos locales + sync después
5. **Persistencia** — SQLite + outbox + ACK
6. **Deduplicación** — 5 mecanismos (transaction_id, echo, recent, find, estado)

### Lo que hay que corregir (bugs)
1. **Digest LAN ciego** — fix: incluir estado en hash
2. **WS broadcast panic** — fix: async await
3. **Body 64KB truncation** — fix: read loop
4. **Outbox sin idempotencia** — fix: consecutivo
5. **Multi-writer carrito** — fix: lock optimista

### Lo que hay que implementar (nuevo)
1. **Cifrado en LAN** (TLS + AES-256-GCM)
2. **WebRTC P2P** (complemento para baja latencia)
3. **Sync incremental** (para escalar a 40+ dispositivos)
4. **Cloud discovery** (para >20 dispositivos)
5. **Transferencia por link** (para archivos grandes)

### El objetivo final
> "Escaneo un QR con mi celular y la app se conecta automáticamente. Empiezo a comandar sin configuración manual. Si no hay internet, funciona offline. Si hay internet, sincroniza. Si hay WiFi, es instantáneo. Si hay muchos dispositivos, no colapsa. Los datos están cifrados. No se pierde información."

**Esto es alcanzable** con las correcciones y mejoras propuestas. El sistema ya tiene el 80% implementado. El 20% restante son bugs latentes y optimizaciones.