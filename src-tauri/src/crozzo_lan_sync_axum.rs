#![allow(dead_code)]
#![allow(unused_imports)]
// Fase 2.2 — Servidor LAN sync basado en Axum (migración incremental).
// Activar con env CROZZO_USE_AXUM=1 (pendiente de cableado en crozzo_lan_sync_start).
// Endpoints migrados: GET /health, /status, /mesh-ping, /api/pairing-cloud.
// Resto: 501 (pendiente de migración).
use axum::{
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde_json::json;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};

use crate::crozzo_lan_sync_server::{ServerInner, ServerMeta};

pub type SharedState = Arc<Mutex<Option<ServerInner>>>;

pub fn router(state: SharedState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/health/", get(health))
        .route("/status", get(status))
        .route("/status/", get(status))
        .route("/mesh-ping", get(mesh_ping))
        .route("/mesh-ping/", get(mesh_ping))
        .route("/mesh-ping.json", get(mesh_ping))
        .route("/mesh-ping.json/", get(mesh_ping))
        .route("/api/pairing-cloud", get(pairing_cloud))
        .route("/api/p2p/signal", get(p2p_signal))
        .route("/api/ops-digest", get(ops_digest))
        .route("/api/comandas", get(comandas))
        .route("/api/runtime", get(runtime))
        .route("/api/sync", post(not_yet))
        .route("/api/orders", post(not_yet))
        .route("/api/sales", post(not_yet))
        .route("/api/invoices", post(not_yet))
        .route("/api/p2p/signal", post(not_yet))
        .route("/api/consultar-rut", post(not_yet))
        .fallback(not_yet)
        .with_state(state)
}

async fn health() -> impl IntoResponse {
    (StatusCode::OK, Json(json!({"ok": true, "service": "crozzo-lan-sync-axum"})))
}

async fn status(State(state): State<SharedState>) -> impl IntoResponse {
    let guard = state.lock().unwrap();
    let (cloud_ok, cloud_at, comandas_count, meta, port) = match guard.as_ref() {
        Some(inner) => (
            inner.cloud_reachable(),
            inner.cloud_reachable_at_ms(),
            inner.comandas_count(),
            inner.meta(),
            inner.port(),
        ),
        None => (false, 0, 0, ServerMeta::default(), 0),
    };
    let resp = json!({
        "ok": true,
        "role": "A",
        "is_active_server": true,
        "location_id": meta.location_id,
        "device_id": meta.device_id,
        "business_id": meta.business_id,
        "service": "crozzo-lan-sync",
        "port": port,
        "cloud_reachable": cloud_ok,
        "cloud_reachable_at_ms": cloud_at,
        "comandas_active_count": comandas_count,
    });
    (StatusCode::OK, Json(resp))
}

async fn mesh_ping(State(state): State<SharedState>) -> impl IntoResponse {
    let guard = state.lock().unwrap();
    let meta = guard.as_ref().map(|i| i.meta()).unwrap_or_default();
    let port = guard.as_ref().map(|i| i.port()).unwrap_or(0);
    let bytes = crate::crozzo_lan_sync_server::mesh_ping_json(&meta, port);
    (StatusCode::OK, [("content-type", "application/json")], bytes)
}

async fn pairing_cloud(State(state): State<SharedState>, headers: axum::http::HeaderMap) -> impl IntoResponse {
    let guard = state.lock().unwrap();
    let (meta, auth_token) = match guard.as_ref() {
        Some(i) => (i.meta(), i.auth_token()),
        None => return (StatusCode::SERVICE_UNAVAILABLE, Json(json!({"ok": false, "error": "server_stopped"}))),
    };
    let provided = headers.get("x-crozzo-lan-token").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    if !auth_token.is_empty() && provided != auth_token {
        return (StatusCode::UNAUTHORIZED, Json(json!({"ok": false, "error": "auth_required"})));
    }
    let has_cloud = !meta.supabase_url.is_empty() && !meta.supabase_anon_key.is_empty();
    (StatusCode::OK, Json(json!({
        "ok": has_cloud,
        "supabase_url": meta.supabase_url,
        "supabase_anon_key": meta.supabase_anon_key,
        "location_id": meta.location_id,
        "business_id": meta.business_id,
        "business_name": meta.business_name,
    })))
}

async fn p2p_signal() -> impl IntoResponse {
    (StatusCode::NOT_IMPLEMENTED, Json(json!({"ok": false, "error": "not_migrated_yet"})))
}

async fn ops_digest() -> impl IntoResponse {
    (StatusCode::NOT_IMPLEMENTED, Json(json!({"ok": false, "error": "not_migrated_yet"})))
}

async fn comandas() -> impl IntoResponse {
    (StatusCode::NOT_IMPLEMENTED, Json(json!({"ok": false, "error": "not_migrated_yet"})))
}

async fn runtime() -> impl IntoResponse {
    (StatusCode::NOT_IMPLEMENTED, Json(json!({"ok": false, "error": "not_migrated_yet"})))
}

async fn not_yet() -> impl IntoResponse {
    (StatusCode::NOT_IMPLEMENTED, Json(json!({"ok": false, "error": "not_migrated_yet"})))
}

pub async fn run_spike(state: SharedState, addr: SocketAddr) {
    let app = router(state);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

pub async fn run_axum_server(state: SharedState, listener: tokio::net::TcpListener) {
    let app = router(state);
    axum::serve(listener, app).await.unwrap();
}
