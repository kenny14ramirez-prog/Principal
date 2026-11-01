#![allow(dead_code)]
#![allow(unused_imports)]
// Spike Fase 2: servidor LAN sync basado en Axum (no cableado aún).
// Solo verifica compilación y patrón. No se usa en producción.
use axum::{routing::get, Router};
use std::net::SocketAddr;

pub async fn run_spike(addr: SocketAddr) {
    let app = Router::new().route("/health", get(|| async { "ok" }));
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

#[cfg(test)]
mod tests {
    #[test]
    fn compiles() {
        // smoke
    }
}
