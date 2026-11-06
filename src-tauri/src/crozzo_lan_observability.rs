// Fase 2.5 — Observabilidad: Prometheus metrics + sondas /livez /readyz + OTLP (spike).
#![allow(dead_code)]

use prometheus::{Encoder, TextEncoder, Registry, IntCounter, Histogram, HistogramOpts};
use std::sync::Arc;

/// Métricas del servidor LAN sync.
pub struct LanMetrics {
    pub registry: Registry,
    pub requests_total: IntCounter,
    pub request_duration: Histogram,
    pub pending_count: IntCounter,
    pub errors_total: IntCounter,
}

impl LanMetrics {
    pub fn new() -> Self {
        let registry = Registry::new();
        let requests_total = IntCounter::new("crozzo_lan_requests_total", "Total HTTP requests").unwrap();
        let request_duration = Histogram::with_opts(HistogramOpts::new("crozzo_lan_request_duration_seconds", "Request duration")).unwrap();
        let pending_count = IntCounter::new("crozzo_lan_pending_count", "Pending ops count").unwrap();
        let errors_total = IntCounter::new("crozzo_lan_errors_total", "Total errors").unwrap();
        registry.register(Box::new(requests_total.clone())).unwrap();
        registry.register(Box::new(request_duration.clone())).unwrap();
        registry.register(Box::new(pending_count.clone())).unwrap();
        registry.register(Box::new(errors_total.clone())).unwrap();
        Self { registry, requests_total, request_duration, pending_count, errors_total }
    }

    pub fn encode(&self) -> String {
        let encoder = TextEncoder::new();
        let mut buf = Vec::new();
        encoder.encode(&self.registry.gather(), &mut buf).unwrap_or(());
        String::from_utf8(buf).unwrap_or_default()
    }
}

/// Sonda de vida (liveness): el proceso está vivo.
pub fn livez() -> &'static str { "ok" }

/// Sonda de readiness: el servidor está listo para tráfico.
pub fn readyz(running: bool) -> &'static str {
    if running { "ready" } else { "not_ready" }
}

/// Wrapper thread-safe.
pub type SharedMetrics = Arc<LanMetrics>;

pub fn new_shared() -> SharedMetrics {
    Arc::new(LanMetrics::new())
}
