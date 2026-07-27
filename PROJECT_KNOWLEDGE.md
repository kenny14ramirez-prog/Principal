#  PROJECT_KNOWLEDGE.md - Crozzo POS

## Arquitectura General
- **Frontend:** JavaScript vanilla (no framework)
- **Backend:** Tauri + Rust
- **Base de datos:** Supabase (PostgreSQL) + IndexedDB local
- **Sync LAN:** WebSocket (tungstenite) + HTTP básico

## Módulos Principales
- src/core/CrozzoPosMain.js - Archivo principal (40,000+ líneas)
- src/core/CrozzoPosCloud.js - Sincronización con Supabase
- src/infra/CrozzoConnectivityOrchestrator.js - Orquesta conectividad
- src/infra/CrozzoLanOpsSync.js - Operaciones LAN
- src-tauri/src/crozzo_lan_sync_server.rs - Servidor LAN (WebSocket + HTTP)

## Decisiones Técnicas
- ✅ WebSocket sobre HTTP para LAN (menor latencia)
- ✅ Offline-first con sync eventual
- ✅ Polling HTTP cada 650ms (runtime) y 1400ms (comandas)
- ️ Servidor HTTP síncrono (1 hilo/conexión) - NECESITA MIGRACIÓN A ASYNC
- ️ Límite actual: 10-15 dispositivos estables

## Endpoints HTTP Actuales (Puerto 3000)
- /health - Health check
- /status - Estado del servidor
- /api/sync - Sincronización de datos
- /api/comandas - Gestión de comandas
- /api/runtime - Datos de runtime

## WebSocket (Puerto 3001)
- Librería: tungstenite 0.24
- Bridge: CrozzoLanWebSocketBridge.connect()
- Uso: Broadcast de pulsos LAN y sync en tiempo real

## Problemas Conocidos
1. Polling intensivo: 225 req/seg con 100 dispositivos
2. Escritura síncrona a disco en cada operación
3. Sin límites de conexión concurrente
4. Límite de 800 comandas activas en memoria

## Plan de Escalado (Identificado)
- **Paso 1:** Migrar a Tokio async (urgente)
- **Paso 2:** Long-polling + cache
- **Paso 3:** SQLite + sharding por zonas
