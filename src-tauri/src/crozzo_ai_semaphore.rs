//! Single inference queue / semaphore for AI Tauri commands (P1.2).
//! Limits concurrent AI inference to MAX_CONCURRENT (2) to avoid OOM.

use std::sync::{Arc, Mutex};
use tokio::sync::Semaphore;

const MAX_CONCURRENT: usize = 2;

static SEM: std::sync::OnceLock<Arc<Semaphore>> = std::sync::OnceLock::new();
static HELD: std::sync::OnceLock<Mutex<Vec<tokio::sync::OwnedSemaphorePermit>>> =
    std::sync::OnceLock::new();

fn semaphore() -> Arc<Semaphore> {
    SEM.get_or_init(|| Arc::new(Semaphore::new(MAX_CONCURRENT))).clone()
}

fn held() -> &'static Mutex<Vec<tokio::sync::OwnedSemaphorePermit>> {
    HELD.get_or_init(|| Mutex::new(Vec::new()))
}

/// Acquire a permit (waits until one is available). Stored until release().
#[tauri::command]
pub async fn crozzo_ai_acquire() -> Result<(), String> {
    let permit = semaphore()
        .acquire_owned()
        .await
        .map_err(|e| e.to_string())?;
    held().lock().map_err(|e| e.to_string())?.push(permit);
    Ok(())
}

/// Release one previously acquired permit.
#[tauri::command]
pub fn crozzo_ai_release() -> Result<(), String> {
    let mut guard = held().lock().map_err(|e| e.to_string())?;
    if let Some(permit) = guard.pop() {
        drop(permit);
    }
    Ok(())
}

/// Helper: run an async body while holding a permit.
pub async fn with_permit<F, Fut, T>(f: F) -> T
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = T>,
{
    let permit = semaphore().acquire_owned().await.expect("semaphore closed");
    let out = f().await;
    drop(permit);
    out
}

/// Current number of held permits (diagnostics).
#[tauri::command]
pub fn crozzo_ai_semaphore_status() -> Result<usize, String> {
    Ok(held().lock().map_err(|e| e.to_string())?.len())
}
