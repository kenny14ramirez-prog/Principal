# Plan de migración a Axum (Fase 2) — Crozzo POS

> Basado en `docs/maps/LAN-SYNC-RUST-RESEARCH-REPORT.md`. Spike compilado OK (axum 0.7, feature ws).

## Objetivo
Migrar el servidor LAN sync (`crozzo_lan_sync_server.rs`, ~1433 líneas, HTTP crudo + tungstenite) a Axum + Tokio async, con HLC, idempotencia, TLS rustls, observabilidad.

## Fases

### F2.0 — Spike (COMPLETADO)
- Añadido `axum = { version = "0.7", features = ["ws"] }` a `Cargo.toml`.
- Creado `src/crozzo_lan_sync_axum.rs` con servidor mínimo (`/health`).
- `cargo check` PASS (exit 0).

### F2.1 — Quick wins (1-2 días)
- Reemplazar `std::sync::Mutex` por `tokio::sync::Mutex` en `ServerInner`.
- Añadir `tracing` + `tracing-subscriber` (JSON, env filter).
- fsync en persistencia (`crozzo_lan_pending.json`).
- CORS restrictivo (allowlist de origen Tauri).
- Gate: clippy sin warnings nuevos; logs estructurados.

### F2.2 — Migración a Axum (1 semana)
- Crear router Axum con handlers para `/health`, `/status`, `/api/sync`, `/api/comandas`, `/api/runtime`, `/api/p2p/signal`, `/api/pairing-cloud`, `/api/ops-digest`, `/api/consultar-rut`, `/mesh-ping`.
- WS unificado en mismo puerto (upgrade) o puerto separado con `axum::extract::ws`.
- Mover lógica de `ingest_api_sync`, drain, ack a funciones async.
- Mantener `ServerInner` como `Arc<tokio::sync::Mutex<ServerInner>>` o `Arc<dashmap>`.
- Gate: todos los endpoints responden igual que antes (tests de integración).

### F2.3 — Persistencia robusta (1 semana)
- Migrar cola `pending` a SQLite (rusqlite en `spawn_blocking`) con tabla `seen_ops` (dedup por op_id).
- Implementar HLC (48 bits ms + 16 bits counter + node id).
- Operation log append-only con fsync por commit.
- Compaction con snapshots.
- Gate: crash recovery sin pérdida; dedup verificado.

### F2.4 — Seguridad (1-2 semanas)
- TLS con rustls (cert autofirmado para LAN).
- Pairing QR con X25519/Ed25519 + HKDF→AES-256-GCM.
- Token LAN JWT/HMAC (no vacío por defecto).
- mTLS opcional.
- Gate: tráfico cifrado; pairing verificado.

### F2.5 — Observabilidad (3-5 días)
- Prometheus metrics (`axum-prometheus`): requests, latencia, cola, errores.
- OpenTelemetry OTLP (traces).
- Sondas `/livez`, `/readyz`.
- Gate: métricas en Grafana; trazas end-to-end.

### F2.6 — Ambicioso (opcional)
- Noise protocol (snow) para E2EE.
- CRDT para campos colaborativos (notas/carritos).
- Replicación multi-hub.

## Dependencias
- F2.1-F2.2: independientes (pueden empezar ya).
- F2.3 depende de F2.2 (persistencia bajo Axum).
- F2.4 depende de F2.2.
- F2.5 paralelo a F2.2+.

## Criterios de éxito (PASS)
- `cargo clippy -D warnings` OK.
- `cargo test` PASS.
- Load test 100 VUs sin errores.
- Métricas en Grafana.
- TLS verificado.
- Sin regresión en `test:sync-clinical`.

## Riesgos
- Migración de estado en memoria a persistente (comandas se pierden al reiniciar si no se drena).
- Compatibilidad con clientes JS (endpoints deben mantener contrato).
- Performance de Axum vs HTTP crudo (benchmark necesario).
