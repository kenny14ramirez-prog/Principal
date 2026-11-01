# Plan de persistencia robusta (Fase 2.3) — Crozzo POS

> Módulo: `src-tauri/src/crozzo_lan_persistence.rs` (spike compilado).

## Componentes

### HLC (Hybrid Logical Clock)
- 48 bits ms + 16 bits counter + node_id.
- `now()`, `observe(remote)` para monotonicidad.
- `to_string_repr()` para serialización.

### Schema SQLite
- `pending_ops` (op_id PK, endpoint, payload, status, attempts).
- `seen_ops` (op_id PK, seen_at) — dedup.
- `op_log` (seq autoincrement, op_id, hlc_ms, hlc_counter, node_id, payload, created_at) — append-only.
- Índices en status, op_id.

### Funciones
- `init_schema`, `persist_pending`, `mark_seen`, `is_seen`, `record_op`, `load_pending`, `mark_drained`.
- `PersistenceDb` wrapper thread-safe (Arc<Mutex<Connection>>).

## Próximos pasos
1. Cablear `PersistenceDb` en `ServerInner` (reemplazar JSON pending por SQLite).
2. Migrar `seen_actions` (HashMap) a `seen_ops` (SQLite).
3. Migrar `comandas_active` a SQLite (o mantener en memoria + snapshot).
4. HLC en `ingest_api_sync` (observar remote HLC).
5. Migrar Mutex a `tokio::sync::Mutex` (o mantener std + spawn_blocking para DB).
6. fsync en `save_pending` (ya hecho en F2.1).
7. Compaction + snapshots.
8. Tests de crash recovery.

## Riesgos
- Migración de estado en memoria a persistente (comandas se pierden al reiniciar si no se drena).
- Compatibilidad con clientes JS (endpoints mantienen contrato).
- Performance de SQLite vs HashMap (benchmark necesario).
