# Plan de observabilidad (Fase 2.5) — Crozzo POS

> Módulo: `src-tauri/src/crozzo_lan_observability.rs` (spike compilado).

## Componentes

### Métricas Prometheus
- `crozzo_lan_requests_total` (IntCounter)
- `crozzo_lan_request_duration_seconds` (Histogram)
- `crozzo_lan_pending_count` (IntCounter)
- `crozzo_lan_errors_total` (IntCounter)
- Endpoint `/metrics` en Axum.

### Sondas
- `/livez` → "ok" (liveness).
- `/readyz` → "ready"/"not_ready" (readiness).

### OTLP (tracing)
- `tracing-opentelemetry` + `opentelemetry-otlp` (pendiente de cableado).
- Requiere collector (Grafana/Tempo/Jaeger).

## Próximos pasos
1. Cablear métricas en handlers Axum (incrementar requests_total, observar duration).
2. Cablear OTLP tracing (span por request).
3. Configurar Grafana dashboards (latencia, cola, errores por sede).
4. Alertas: pending_count > umbral, errors_total > 0, readyz != ready.
5. Integrar con Sentry (JS + Rust).

## Riesgos
- Overhead de métricas (mínimo con Prometheus).
- OTLP requiere collector externo.
- Cardinalidad de labels (evitar alta cardinalidad).
