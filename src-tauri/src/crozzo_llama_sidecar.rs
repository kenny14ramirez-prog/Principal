//! Sidecar interno para LLM (llama.cpp / llama-server) en 127.0.0.1:11435.
//! Degradación honesta: si el binario no está presente, cae a Ollama externo o reporta no disponible.

use serde::Serialize;
use std::process::Command;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::Duration;

static SIDECAR_PID: AtomicU32 = AtomicU32::new(0);

const LLAMA_BASE: &str = "http://127.0.0.1:11435";

#[derive(Debug, Clone, Serialize)]
pub struct LlamaHealth {
    pub ok: bool,
    pub detail: String,
}

fn http_get_health() -> bool {
    let client = match reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };
    match client.get(format!("{LLAMA_BASE}/health")).send() {
        Ok(r) => r.status().is_success(),
        Err(_) => false,
    }
}

fn sidecar_binary_path() -> Option<std::path::PathBuf> {
    // Tauri sidecar resolution: binaries/llama-server-<target>
    let candidates = [
        std::path::PathBuf::from("src-tauri/binaries/llama-server-x86_64-pc-windows-msvc.exe"),
        std::path::PathBuf::from("binaries/llama-server-x86_64-pc-windows-msvc.exe"),
        std::path::PathBuf::from("llama-server.exe"),
    ];
    candidates.into_iter().find(|c| c.exists())
}

#[tauri::command]
pub fn crozzo_llama_health() -> LlamaHealth {
    if http_get_health() {
        LlamaHealth { ok: true, detail: "llama-server activo".into() }
    } else {
        LlamaHealth { ok: false, detail: "llama-server no responde".into() }
    }
}

#[tauri::command]
pub fn crozzo_llama_ensure_sidecar() -> Result<bool, String> {
    if http_get_health() {
        return Ok(true);
    }
    let bin = match sidecar_binary_path() {
        Some(p) => p,
        None => return Ok(false),
    };
    let model = std::env::var("CROZZO_LLAMA_MODEL").unwrap_or_else(|_| "phi4-mini.gguf".into());
    let model_path = std::path::PathBuf::from("models").join(&model);
    let mut cmd = Command::new(&bin);
    cmd.arg("-m").arg(&model_path).arg("--port").arg("11435").arg("--ctx-size").arg("4096");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    match cmd.spawn() {
        Ok(child) => {
            SIDECAR_PID.store(child.id(), Ordering::SeqCst);
            std::mem::forget(child);
            std::thread::sleep(Duration::from_millis(1200));
            Ok(http_get_health())
        }
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub fn crozzo_llama_stop_sidecar() {
    let pid = SIDECAR_PID.swap(0, Ordering::SeqCst);
    if pid != 0 {
        #[cfg(windows)]
        {
            let _ = Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/F", "/T"])
                .spawn();
        }
        #[cfg(not(windows))]
        {
            let _ = Command::new("kill").arg(pid.to_string()).spawn();
        }
    }
}

#[tauri::command]
pub fn crozzo_llama_chat(prompt: String, timeout_ms: Option<u64>) -> Result<String, String> {
    let timeout = timeout_ms.unwrap_or(60_000);
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(timeout))
        .build()
        .map_err(|e| e.to_string())?;
    let body = serde_json::json!({
        "model": "local",
        "messages": [{"role":"user","content": prompt}],
        "stream": false,
        "temperature": 0.4,
        "max_tokens": 512
    });
    let resp = client
        .post(format!("{LLAMA_BASE}/v1/chat/completions"))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("llama_http_{}: {}", status.as_u16(), text));
    }
    Ok(text)
}