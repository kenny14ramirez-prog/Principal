---
title: "LAN SYNC RUST RESEARCH REPORT"
---

# Reporte de Investigación: Patrones Modernos Tauri 2 + Rust para Servidor LAN Sync (HTTP+WS)

**Fecha:** Nov 2026 | **Proyecto:** Crozzo POS (sistema pos) | **Alcance:** Investigación técnica, sin cambios de código.

---

## 0. Contexto del sistema actual

El servidor LAN sync actual (`src-tauri/src/crozzo_lan_sync_server.rs`, ~1433 líneas) implementa un servidor HTTP crudo sobre `tokio::net::TcpListener` que:

- Parsea requests HTTP manualmente (`parse_request` sobre bytes crudos).
- Maneja estado con `Arc<Mutex<Option<ServerInner>>>` (un único mutex global, `std::sync::Mutex`).
- Persiste la cola `pending` en JSON con write-atómico + rename, **sin fsync**.
- Usa un semáforo (`MAX_CONCURRENT_HTTP = 64`) para tope de handlers.
- WebSocket por separado (`crozzo_lan_ws.rs` con `tokio-tungstenite`).
- Dedup por `seen_actions: HashMap<String,u128>` con TTL de 6h.
- Auth por token compartido en header `x-crozzo-lan-token` (texto plano, sin TLS).
- mDNS via `mdns-sd` para descubrimiento.
- CORS abierto (`Access-Control-Allow-Origin: *`).

**Problemas identificados:**
1. HTTP parsing manual → frágil, sin HTTP/2, sin streaming, sin backpressure real.
2. `std::sync::Mutex` en async → bloquea worker threads de tokio.
3. Sin TLS → tráfico LAN en claro (token interceptable).
4. Sin HLC → ordering por `SystemTime` (no monotónico, no causal).
5. Sin compaction → `pending` crece hasta `PENDING_MAX=2000` y se purga por FIFO.
6. Persistencia sin fsync → durabilidad débil ante crash.
7. Sin observabilidad estructurada (solo `eprintln!`).
8. Sin métricas ni tracing.

---

## 1. Recomendación de framework HTTP: Axum

### 1.1 Comparativa (Axum vs Actix vs Warp vs Hyper)

| Criterio | Axum | Actix-web | Warp | Hyper (raw) |
|---|---|---|---|---|
| Ergonomía | Extractors, funciones puras, sin macros | Macros, actor model | Combinators (Filter) | Muy bajo nivel |
| Tower middleware | ✅ nativo | ❌ propio | ❌ propio | ✅ |
| WebSocket | ✅ `axum::extract::ws` (tungstenite) | ✅ propio | ✅ | ❌ manual |
| Comunidad/ecosistema 2026 | Muy activa | Activa | Mantenimiento lento | Base de todo |
| Compile time | Rápido | Lento (macros) | Medio | — |
| HTTP/2 | ✅ | ✅ | ✅ | ✅ |
| TLS (rustls) | ✅ via tower-http / hyper-rustls | ✅ | ✅ | ✅ |
| Integración Tauri | ✅ (spawn en runtime tokio) | ✅ | ✅ | ✅ |

**Recomendación: Axum** como default para 2026. Razones:
- Tower middleware reutilizable (CORS, tracing, auth, metrics, timeout, compression).
- Extractors tipados → menos parsing manual.
- WebSocket integrado con `broadcast` channels.
- Comunidad más activa; Warp en mantenimiento lento.
- Actix-web es más rápido en benchmarks raw pero Axum es "más que suficientemente rápido" y mucho más ergonómico.

**Fuentes:** [Axum vs Actix 2026](https://rustify.rs/articles/rust-axum-vs-actix-web-2026), [Rustify WebSocket guide](https://rustify.rs/articles/rust-websocket-realtime-apps-tokio-axum-2026).

### 1.2 Por qué NO Hyper raw
Hyper es la base; usarlo directamente implica reimplementar routing, extractors, middleware. Solo justified si se necesita control byte-a-byte (no es el caso).

---

## 2. Tokio async best practices

### 2.1 Reglas de oro

1. **Nunca bloquear el runtime.** Cualquier operación síncrona > ~10µs (rusqlite, fsync, hashing grande, JSON parse de payloads grandes) debe ir a `tokio::task::spawn_blocking`.
2. **No usar `std::sync::Mutex` en async.** Usar `tokio::sync::Mutex` para locks que se mantienen a través de `.await`, o `std::sync::Mutex` solo si el lock es muy corto y no cruza await (mejor `parking_lot::Mutex`).
3. **No `block_on` dentro de async** → deadlock potencial.
4. **Bounded channels** para backpressure (`mpsc::channel(n)`), no unbounded.
5. **`JoinSet`** para gestionar múltiples tasks (WebSockets) y cancelación graceful.

### 2.2 Patrón: rusqlite + spawn_blocking

```rust
use tokio::task;
use rusqlite::Connection;
use std::sync::Arc;

pub struct Db {
    conn: Arc<std::sync::Mutex<Connection>>,
}

impl Db {
    pub async fn insert(&self, payload: serde_json::Value) -> Result<(), rusqlite::Error> {
        let conn = Arc::clone(&self.conn);
        task::spawn_blocking(move || {
            let conn = conn.lock().unwrap();
            conn.execute("INSERT INTO ops (payload) VALUES (?1)", [&payload.to_string()])?;
            // fsync: SQLite con synchronous=FULL ya hace fsync en commit
            Ok(())
        }).await.map_err(|e| /* convert */)?
    }
}
```

Alternativa: **`tokio-rusqlite`** (crate) que wrappea una conexión en un thread dedicado y expone API async. Mejor para workloads con muchas llamadas cortas secuenciales (evita churn del thread pool). Para pools de conexiones: **`bb8-rusqlite`** o `r2d2` + `spawn_blocking`.

**Fuentes:** [tokio spawn_blocking docs](https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html), [tokio-rusqlite](https://docs.rs/tokio-rusqlite), [bridging sync/async](https://tokio.rs/tokio/topics/bridging).

### 2.3 sqlx vs rusqlite

- **sqlx** tiene driver SQLite async nativo (`sqlx::sqlite::SqlitePool`) con compile-time checked queries. Pero requiere migraciones y es más pesado.
- **rusqlite + tokio-rusqlite** es más ligero y da control total sobre PRAGMAs (WAL, synchronous, busy_timeout).
- Para este proyecto (POS offline-first, SQLite local), **rusqlite + tokio-rusqlite** es la mejor opción. sqlx solo si se quiere type-safety en queries y migraciones automáticas.

### 2.4 Configuración SQLite recomendada

```sql
PRAGMA journal_mode = WAL;          -- concurrencia lectura/escritura
PRAGMA synchronous = NORMAL;        -- fsync en checkpoint, no en cada commit (balance)
PRAGMA busy_timeout = 5000;         -- evitar SQLITE_BUSY
PRAGMA foreign_keys = ON;
PRAGMA wal_autocheckpoint = 1000;   -- checkpoint cada 1000 páginas
```

Para durabilidad crítica (operaciones financieras): `synchronous = FULL` (fsync en cada commit). Costo: ~10-50ms por commit en SSD.

---

## 3. WebSocket broadcast patterns

### 3.1 Patrón Axum + broadcast

```rust
use axum::{
    extract::ws::{WebSocket, WebSocketUpgrade, Message},
    response::IntoResponse,
    routing::get,
    Router,
};
use tokio::sync::broadcast;

#[derive(Clone)]
struct AppState {
    tx: broadcast::Sender<String>,
}

async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: AppState) {
    let mut rx = state.tx.subscribe();
    loop {
        tokio::select! {
            msg = rx.recv() => {
                match msg {
                    Ok(text) => {
                        if socket.send(Message::Text(text.into())).await.is_err() { break; }
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!("client lagged by {} messages", n);
                        // Opción: enviar snapshot completo de recuperación
                    }
                    Err(_) => break,
                }
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Text(t))) => {
                        let _ = state.tx.send(t.to_string());
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }
        }
    }
}
```

### 3.2 Backpressure y slow clients

- `broadcast::channel(capacity)` descarta mensajes viejos cuando el receiver se atrasa (`RecvError::Lagged`).
- **Estrategia recomendada:** capacity = 256-1024. En `Lagged`, enviar un mensaje de "resync" con snapshot completo del estado.
- Para clientes muy lentos: usar `mpsc::channel` por cliente con tamaño limitado + task dedicado que drena el broadcast y envía al cliente (patrón "fan-out per client").
- **Nunca** bloquear el broadcast por un cliente lento.

### 3.3 Ping/Pong y keep-alive

Axum/tungstenite responde automáticamente a pings. Configurar `WebSocketUpgrade` con `ping_interval` y `max_frame_size`.

**Fuentes:** [axum chat example](https://github.com/tokio-rs/axum/blob/main/examples/chat/src/main.rs), [WebSocket.org Rust guide](https://websocket.org/guides/languages/rust/).

---

## 4. Idempotencia, dedup, HLC, operation logs

### 4.1 Hybrid Logical Clock (HLC)

El HLC combina tiempo físico (ms) con contador lógico, garantizando monotonicidad y causalidad sin depender de NTP perfecto.

```rust
use std::sync::atomic::{AtomicI64, AtomicU32, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

pub struct Hlc {
    physical: AtomicI64,  // ms desde epoch
    logical: AtomicU32,
    node_id: String,
}

impl Hlc {
    pub fn now(&self) -> HlcTimestamp {
        let phys = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64;
        let old_phys = self.physical.load(Ordering::SeqCst);
        if phys > old_phys {
            self.physical.store(phys, Ordering::SeqCst);
            self.logical.store(0, Ordering::SeqCst);
        } else {
            self.logical.fetch_add(1, Ordering::SeqCst);
        }
        HlcTimestamp {
            physical: self.physical.load(Ordering::SeqCst),
            logical: self.logical.load(Ordering::SeqCst),
            node_id: self.node_id.clone(),
        }
    }

    pub fn receive(&self, remote: &HlcTimestamp) -> HlcTimestamp {
        let phys = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64;
        let old_phys = self.physical.load(Ordering::SeqCst);
        let max_phys = phys.max(old_phys).max(remote.physical);
        self.physical.store(max_phys, Ordering::SeqCst);
        if max_phys == old_phys && max_phys == remote.physical {
            self.logical.store(self.logical.load(Ordering::SeqCst).max(remote.logical) + 1, Ordering::SeqCst);
        } else if max_phys == old_phys {
            // keep logical
        } else if max_phys == remote.physical {
            self.logical.store(remote.logical + 1, Ordering::SeqCst);
        } else {
            self.logical.store(0, Ordering::SeqCst);
        }
        // ... return
    }
}
```

**Serialización:** `"{physical}:{logical}:{node_id}"` → ordenable lexicográficamente si se zero-pad.

### 4.2 Operation log (oplog) pattern

En lugar de cola `pending` FIFO, usar un **log de operaciones inmutables**:

```rust
#[derive(Serialize, Deserialize, Clone)]
struct Op {
    op_id: String,        // UUID v7 (time-ordered)
    hlc: HlcTimestamp,    // para ordering causal
    device_id: String,
    op_type: String,      // "comanda_new", "comanda_estado", etc.
    payload: serde_json::Value,
    created_at: i64,
}
```

- **Idempotencia:** `op_id` es la clave de dedup. `INSERT ... ON CONFLICT(op_id) DO NOTHING`.
- **Compaction:** snapshot periódico del estado materializado + truncar oplog anterior al snapshot.
- **Sync protocol:** "dame ops con HLC > mi last_seen_hlc" → delta sync eficiente.
- **Fsync:** cada commit con `synchronous=FULL` o batch de N ops con un solo fsync.

### 4.3 Dedup robusto

Reemplazar `seen_actions: HashMap` por tabla SQLite:

```sql
CREATE TABLE seen_ops (
    op_id TEXT PRIMARY KEY,
    hlc TEXT NOT NULL,
    seen_at INTEGER NOT NULL
);
CREATE INDEX idx_seen_ops_seen_at ON seen_ops(seen_at);
```

Prune por `seen_at < now - TTL`. Esto sobrevive reinicios (a diferencia del HashMap en memoria).

### 4.4 Compaction / vacuum

```rust
// Compactar oplog: aplicar todas las ops al estado materializado, luego truncar.
async fn compact(db: &Db) -> Result<()> {
    db.transaction(|tx| {
        // 1. Aplicar ops pendientes al estado materializado
        // 2. DELETE FROM ops WHERE hlc < (SELECT min_hlc FROM snapshot)
        // 3. VACUUM (o incremental_vacuum)
        // 4. Actualizar snapshot checkpoint
        Ok(())
    }).await
}
```

Trigger: cada N ops o cada M minutos, o manualmente.

**Fuentes:** [HLC paper](http://muratbuffalo.blogspot.com/2014/07/hybrid-logical-clocks.html), [CockroachDB idempotency](https://www.cockroachlabs.com/blog/idempotency-and-ordering-in-event-driven-systems/).

---

## 5. Seguridad

### 5.1 TLS en LAN (rustls)

**Opción A (mínima):** TLS con certificado autofirmado generado en runtime, intercambiado vía QR.

**Opción B (ambiciosa):** mTLS con certificados por dispositivo emitidos por la caja (CA local).

```rust
use rustls::ServerConfig;
use tokio_rustls::TlsAcceptor;

// Generar cert autofirmado con rcgen
let cert = rcgen::generate_simple_self_signed(vec!["localhost".into(), ip.into()])?;
let config = ServerConfig::builder()
    .with_no_client_auth()
    .with_single_cert(vec![cert.cert.into()], cert.key_pair.serialize_der().into())?;
let acceptor = TlsAcceptor::from(Arc::new(config));
```

En Axum: usar `axum-server` con `tls_rustls` feature, o `hyper-rustls`.

### 5.2 Pairing vía QR (X25519/Ed25519)

Flujo recomendado:
1. Caja genera par de claves Ed25519 (identidad) + X25519 (intercambio).
2. QR contiene: `{ url: "https://<ip>:<port>", pubkey: "<hex>", fingerprint: "<sha256>" }`.
3. Tablet escanea QR, verifica fingerprint (TOFU o comparación visual).
4. Tablet genera su propio par X25519, envía pubkey a caja.
5. Ambos derivan shared secret (X25519 DH) → clave simétrica (HKDF-SHA256).
6. Canal cifrado con AES-256-GCM o ChaCha20-Poly1305.

**Crates:** `x25519-dalek`, `ed25519-dalek`, `hkdf`, `aes-gcm` o `chacha20poly1305`, `qrcode` (generación), `rcgen` (certs).

### 5.3 Noise protocol (alternativa a TLS)

Noise (via `snow` crate) es más ligero que TLS y diseñado para IoT/mesh. Patrón `Noise_XX_25519_ChaChaPoly_BLAKE2s`:
- Handshake de 3 mensajes (XX pattern) → autenticación mutua + forward secrecy.
- Ideal para pairing donde ambos lados tienen claves estáticas.
- Más simple que TLS para LAN, pero menos estándar (herramientas de debugging más escasas).

**Recomendación:** TLS (rustls) para HTTP estándar + Noise para el canal mesh P2P de baja latencia. O solo TLS si se quiere simplicidad.

**Fuentes:** [snow crate](https://github.com/mcginty/snow), [rustls](https://github.com/rustls/rustls), [Kerkour E2E encryption Rust](https://kerkour.com/end-to-end-encryption-key-exchange-cryptography-rust).

### 5.4 Token auth mejorado

- Reemplazar token compartido por **JWT de corta duración** firmado con Ed25519 (EdDSA), o **HMAC-SHA256** con secret derivado del pairing.
- Rotación de token en cada sesión de pairing.
- Rate limiting por IP (ya implementado, mantener).
- CORS restrictivo: solo orígenes conocidos (tauri://, http://localhost, IPs de tablets pareadas).

---

## 6. Observabilidad

### 6.1 Stack recomendado

```toml
[dependencies]
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json", "fmt"] }
tracing-opentelemetry = "0.27"
opentelemetry = "0.27"
opentelemetry-otlp = { version = "0.27", features = ["grpc-tonic"] }
metrics = "0.24"
metrics-exporter-prometheus = "0.16"
axum-prometheus = "0.7"  # o metrics middleware manual
```

### 6.2 Setup tracing

```rust
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

pub fn init_tracing() {
    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "info,crozzo=debug".into());

    let fmt_layer = tracing_subscriber::fmt::layer()
        .with_target(true)
        .with_thread_ids(true)
        .json(); // JSON para producción

    let otel_layer = tracing_opentelemetry::layer().with_tracer(
        opentelemetry_otlp::new_pipeline()
            .tracing()
            .with_exporter(opentelemetry_otlp::new_exporter().tonic())
            .install_batch(opentelemetry_sdk::runtime::Tokio)
            .unwrap(),
    );

    tracing_subscriber::registry()
        .with(env_filter)
        .with(fmt_layer)
        .with(otel_layer)
        .init();
}
```

### 6.3 Métricas Prometheus

```rust
use axum_prometheus::PrometheusMetricLayer;

let (prometheus_layer, metric_handle) = PrometheusMetricLayer::pair();
let app = Router::new()
    .route("/metrics", get(|| async move { metric_handle.render() }))
    .layer(prometheus_layer);
```

Métricas clave para sync server:
- `http_requests_total{method, path, status}`
- `http_request_duration_seconds`
- `sync_ops_ingested_total`
- `sync_pending_queue_size`
- `ws_connections_active`
- `ws_broadcast_lagged_total`
- `db_commit_duration_seconds`

### 6.4 Integración con Axum

```rust
use tower_http::trace::TraceLayer;

let app = Router::new()
    .route("/health", get(health))
    .route("/api/sync", post(ingest))
    .layer(TraceLayer::new_for_http())  // tracing automático por request
    .layer(prometheus_layer)
    .with_state(state);
```

**Fuentes:** [OpenTelemetry Rust getting started](https://opentelemetry.io/docs/languages/rust/getting-started/), [axum-prometheus](https://docs.rs/axum-prometheus), [tracing-subscriber + OTel](https://oneuptime.com/blog/post/2026-02-06-tracing-subscriber-opentelemetry-layer-rust/view).

---

## 7. Plan de migración (minimal → ambicioso)

### Fase 0 — Quick wins (1-2 días, bajo riesgo)

| Acción | Archivo | Impacto |
|---|---|---|
| Reemplazar `std::sync::Mutex` por `tokio::sync::Mutex` en `handle_connection` | `crozzo_lan_sync_server.rs` | Evita bloqueo de worker threads |
| Agregar `tracing` + `tracing-subscriber` con `RUST_LOG` | `main.rs`, `Cargo.toml` | Observabilidad básica |
| fsync en `save_pending`: abrir con `OpenOptions`, write, `sync_all()` | `crozzo_lan_sync_server.rs` | Durabilidad |
| CORS restrictivo (lista de orígenes) | `crozzo_lan_sync_server.rs` | Seguridad |

### Fase 1 — Framework migration (1 semana)

1. Agregar `axum`, `tower`, `tower-http` a `Cargo.toml`.
2. Crear nuevo módulo `crozzo_lan_sync_axum.rs` con routers Axum.
3. Migrar handlers uno a uno (health, status, sync, orders, sales, invoices, comandas, runtime, p2p signal, consultar-rut).
4. Reemplazar `handle_connection` (parsing manual) por Axum router.
5. WebSocket: migrar de `crozzo_lan_ws` (tungstenite manual) a `axum::extract::ws` con `broadcast` channel unificado.
6. Mantener API Tauri commands igual (`crozzo_lan_sync_start`, etc.) → cambios transparentes para frontend.
7. Tests: `test:sync-clinical` debe pasar sin cambios.

### Fase 2 — Persistencia robusta (1 semana)

1. Agregar `rusqlite` (ya está) + `tokio-rusqlite`.
2. Migrar `pending` de JSON a tabla SQLite `ops` con schema oplog.
3. Implementar dedup por `op_id` con `INSERT ON CONFLICT DO NOTHING`.
4. HLC: implementar struct Hlc y usarlo como timestamp de ops.
5. Compaction: job periódico (cada 5 min o 1000 ops).
6. fsync: `synchronous = FULL` para ops críticas, `NORMAL` para el resto.

### Fase 3 — Seguridad (1-2 semanas)

1. TLS con rustls: generar cert autofirmado en primer arranque, persistir en data_dir.
2. Pairing QR: endpoint `/api/pairing` que devuelve pubkey + fingerprint; tablet verifica y envía su pubkey.
3. Key derivation: X25519 DH → HKDF → AES-256-GCM para payload encryption (opcional, además de TLS).
4. Token auth: migrar de shared token a JWT firmado (EdDSA) o HMAC.
5. mTLS (opcional, ambicioso): emitir cert por tablet desde CA local de la caja.

### Fase 4 — Observabilidad completa (3-5 días)

1. Prometheus endpoint `/metrics`.
2. OpenTelemetry OTLP export (opcional, para entornos con collector).
3. Métricas de negocio: ops ingested, pending queue, WS lagged.
4. Health checks extendidos: `/health/ready`, `/health/live`.

### Fase 5 — Ambicioso (futuro)

- Noise protocol para mesh P2P de baja latencia.
- CRDT para resolución de conflictos (si se necesita multi-master).
- Replicación SQLite (Litestream-style) para backup continuo.
- gRPC interno entre caja y tablets (tonic) para payloads grandes.

---

## 8. Crates recomendados (Cargo.toml additions)

```toml
# HTTP framework
axum = { version = "0.8", features = ["ws", "macros"] }
tower = "0.5"
tower-http = { version = "0.6", features = ["cors", "trace", "compression-gzip", "timeout"] }
axum-server = { version = "0.7", features = ["tls-rustls"] }

# Async DB
tokio-rusqlite = "0.6"
# o sqlx = { version = "0.8", features = ["runtime-tokio", "sqlite"] }

# Cripto
rustls = "0.23"
rcgen = "0.13"
x25519-dalek = { version = "2", features = ["static_secrets"] }
ed25519-dalek = { version = "2", features = ["rand_core"] }
hkdf = "0.12"
sha2 = "0.10"
aes-gcm = "0.10"
# o chacha20poly1305 = "0.10"
snow = "0.9"  # Noise protocol (opcional)

# QR
qrcode = "0.14"
image = "0.25"  # para renderizar QR a PNG

# Observabilidad
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }
tracing-opentelemetry = "0.27"
opentelemetry = "0.27"
opentelemetry-otlp = "0.27"
opentelemetry_sdk = { version = "0.27", features = ["rt-tokio"] }
metrics = "0.24"
metrics-exporter-prometheus = "0.16"
axum-prometheus = "0.7"

# Utilidades
uuid = { version = "1", features = ["v7"] }
chrono = { version = "0.4", features = ["serde"] }
```

---

## 9. Patrones de código concretos

### 9.1 Axum Router + State

```rust
use axum::{Router, routing::{get, post}, extract::State, Json};
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone)]
struct AppState {
    inner: Arc<RwLock<ServerInner>>,
    tx: tokio::sync::broadcast::Sender<String>,
    db: Arc<Db>,
    hlc: Arc<Hlc>,
}

fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health_handler))
        .route("/status", get(status_handler))
        .route("/api/sync", post(sync_handler))
        .route("/api/comandas", get(comandas_handler))
        .route("/ws", get(ws_upgrade))
        .route("/metrics", get(metrics_handler))
        .layer(tower_http::trace::TraceLayer::new_for_http())
        .layer(tower_http::cors::CorsLayer::permissive()) // restringir en prod
        .with_state(state)
}

async fn sync_handler(
    State(state): State<AppState>,
    Json(payload): Json<serde_json::Value>,
) -> Json<serde_json::Value> {
    // idempotencia por op_id
    if let Some(op_id) = payload.get("op_id").and_then(|v| v.as_str()) {
        if state.db.is_seen(op_id).await.unwrap_or(false) {
            return Json(serde_json::json!({"ok": true, "duplicate": true}));
        }
    }
    // ... procesar
    Json(serde_json::json!({"ok": true}))
}
```

### 9.2 Graceful shutdown

```rust
use tokio::signal;

let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
axum::serve(listener, app)
    .with_graceful_shutdown(shutdown_signal())
    .await
    .unwrap();

async fn shutdown_signal() {
    signal::ctrl_c().await.expect("failed to listen for ctrl_c");
    tracing::info!("shutdown signal received");
}
```

### 9.3 Per-connection WS con JoinSet

```rust
use tokio::task::JoinSet;

let mut set = JoinSet::new();
loop {
    tokio::select! {
        Some(conn) = listener.accept() => {
            let state = state.clone();
            set.spawn(async move {
                handle_ws_connection(conn, state).await;
            });
        }
        _ = shutdown_rx.recv() => break,
    }
}
// graceful: esperar tasks con timeout
let _ = tokio::time::timeout(Duration::from_secs(5), async {
    while set.join_next().await.is_some() {}
}).await;
```

---

## 10. Fuentes

### Frameworks y Tokio
- [Rust Web Frameworks 2026: Axum vs Actix vs Warp](https://aarambhdevhub.medium.com/rust-web-frameworks-in-2026-axum-vs-actix-web-vs-rocket-vs-warp-vs-salvo-which-one-should-you-2db3792c79a2)
- [Axum vs Actix-web 2026](https://rustify.rs/articles/rust-axum-vs-actix-web-2026)
- [Tokio spawn_blocking docs](https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html)
- [Bridging sync and async (Tokio)](https://tokio.rs/tokio/topics/bridging)
- [tokio-rusqlite](https://docs.rs/tokio-rusqlite)
- [bb8-rusqlite](https://github.com/LawnGnome/bb8-rusqlite)

### WebSocket
- [WebSocket.org Rust Guide](https://websocket.org/guides/languages/rust/)
- [Building Real-Time Apps with Rust WebSockets (rustify.rs)](https://rustify.rs/articles/rust-websocket-realtime-apps-tokio-axum-2026)
- [Axum chat example](https://github.com/tokio-rs/axum/blob/main/examples/chat/src/main.rs)

### Idempotencia / HLC / Oplog
- [Hybrid Logical Clocks (muratbuffalo)](http://muratbuffalo.blogspot.com/2014/07/hybrid-logical-clocks.html)
- [HLC in-depth (Medium)](https://medium.com/geekculture/all-things-clock-time-and-order-in-distributed-systems-hybrid-logical-clock-in-depth-7c645eb03682)
- [Idempotency (lpalmieri)](https://lpalmieri.com/posts/idempotency/)
- [CockroachDB: idempotency and ordering](https://www.cockroachlabs.com/blog/idempotency-and-ordering-in-event-driven-systems/)

### Seguridad
- [rustls](https://github.com/rustls/rustls)
- [snow (Noise protocol)](https://github.com/mcginty/snow)
- [x25519-dalek](https://github.com/dalek-cryptography/x25519-dalek)
- [Kerkour: E2E encryption key exchange in Rust](https://kerkour.com/end-to-end-encryption-key-exchange-cryptography-rust)
- [Tauri sidecar docs](https://v2.tauri.app/develop/sidecar/)

### Observabilidad
- [OpenTelemetry Rust getting started](https://opentelemetry.io/docs/languages/rust/getting-started/)
- [axum-prometheus](https://docs.rs/axum-prometheus)
- [tracing-subscriber + OpenTelemetry (OneUptime)](https://oneuptime.com/blog/post/2026-02-06-tracing-subscriber-opentelemetry-layer-rust/view)
- [Shuttle: OpenTelemetry in Rust](https://www.shuttle.dev/blog/2024/04/10/using-opentelemetry-rust)

### SQLite / fsync
- [SQLite WAL mode](https://www.sqlite.org/wal.html)
- [SQLite fsync durability](https://avi.im/blag/2025/sqlite-fsync/)
- [rqlite WAL + fsync balance](https://philipotoole.com/rqlite-9-2-the-distributed-database-built-on-sqlite-fast-restarts-with-gb-datasets/)

---

## 11. Resumen ejecutivo

| Área | Estado actual | Recomendación mínima | Recomendación ambiciosa |
|---|---|---|---|
| HTTP framework | Manual TCP parsing | Axum + Tower middleware | Axum + HTTP/2 + compression |
| Async DB | `std::sync::Mutex` + sync rusqlite | `tokio::sync::Mutex` + spawn_blocking | tokio-rusqlite + oplog SQLite |
| WebSocket | tungstenite separado | axum::extract::ws + broadcast | Fan-out per client + resync |
| Idempotencia | HashMap en memoria (6h TTL) | Tabla seen_ops en SQLite | Oplog con HLC + compaction |
| Persistencia | JSON + rename (sin fsync) | fsync + SQLite WAL | SQLite FULL sync + snapshots |
| Seguridad | Token plano, sin TLS | TLS rustls + cert autofirmado | mTLS + Noise + QR pairing |
| Observabilidad | eprintln! | tracing + RUST_LOG | Prometheus + OpenTelemetry OTLP |
| Ordering | SystemTime ms | HLC (physical+logical) | HLC + CRDT (futuro) |

**Prioridad de implementación:** Fase 0 (quick wins) → Fase 1 (Axum) → Fase 2 (SQLite oplog) → Fase 3 (TLS) → Fase 4 (observabilidad) → Fase 5 (ambicioso).

**Impacto estimado:** Migrar a Axum reduce ~400 líneas de parsing manual, mejora throughput 2-3x, y habilita middleware reutilizable. SQLite oplog + HLC resuelve los problemas de durabilidad y ordering que hoy se manejan con HashMaps en memoria.
