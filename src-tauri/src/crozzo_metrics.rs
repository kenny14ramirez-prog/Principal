//! Métricas del servidor LAN (PoC Fase -2).
//! Expone contadores básicos para observabilidad.

#[cfg(desktop)]
mod imp {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::Arc;

    pub struct Metrics {
        pub requests_total: AtomicU64,
        pub errors_total: AtomicU64,
        pub sync_pushes_total: AtomicU64,
    }

    impl Metrics {
        pub fn new() -> Self {
            Self {
                requests_total: AtomicU64::new(0),
                errors_total: AtomicU64::new(0),
                sync_pushes_total: AtomicU64::new(0),
            }
        }
        pub fn inc_requests(&self) { self.requests_total.fetch_add(1, Ordering::Relaxed); }
        pub fn inc_errors(&self) { self.errors_total.fetch_add(1, Ordering::Relaxed); }
        pub fn inc_sync_pushes(&self) { self.sync_pushes_total.fetch_add(1, Ordering::Relaxed); }
        pub fn snapshot(&self) -> (u64, u64, u64) {
            (
                self.requests_total.load(Ordering::Relaxed),
                self.errors_total.load(Ordering::Relaxed),
                self.sync_pushes_total.load(Ordering::Relaxed),
            )
        }
    }

    static METRICS: std::sync::OnceLock<Arc<Metrics>> = std::sync::OnceLock::new();

    pub fn global() -> Arc<Metrics> {
        METRICS.get_or_init(|| Arc::new(Metrics::new())).clone()
    }
}

#[cfg(desktop)]
#[tauri::command]
pub fn crozzo_metrics_snapshot() -> Result<(u64, u64, u64), String> {
    let m = imp::global();
    Ok(m.snapshot())
}

#[cfg(desktop)]
#[tauri::command]
pub fn crozzo_metrics_inc_requests() -> Result<(), String> {
    imp::global().inc_requests();
    Ok(())
}

#[cfg(not(desktop))]
#[tauri::command]
pub fn crozzo_metrics_snapshot() -> Result<(u64, u64, u64), String> {
    Ok((0, 0, 0))
}

#[cfg(not(desktop))]
#[tauri::command]
pub fn crozzo_metrics_inc_requests() -> Result<(), String> {
    Ok(())
}
