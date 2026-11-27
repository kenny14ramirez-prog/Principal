//! Sidecar interno para LLM (llama.cpp / llama-server) en 127.0.0.1:11435.
//! Degradación honesta: si el binario no está presente, cae a Ollama externo o reporta no disponible.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::process::Command;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::LazyLock;
use std::time::Duration;

static SIDECAR_PID: AtomicU32 = AtomicU32::new(0);

const LLAMA_BASE: &str = "http://127.0.0.1:11435";

// Hash SHA256 esperado del binario llama-server. Vacío = omitir verificación (configurar en release).
const EXPECTED_LLAMA_SERVER_SHA256: &str = "";

// Token por instalación (generado una vez, guardado en app data).
static LLAMA_TOKEN: LazyLock<String> = LazyLock::new(llama_auth_token_load_or_create);

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
    let token = LLAMA_TOKEN.clone();
    match client
        .get(format!("{LLAMA_BASE}/health"))
        .header("Authorization", format!("Bearer {}", token))
        .send()
    {
        Ok(r) => r.status().is_success(),
        Err(_) => false,
    }
}

fn sidecar_binary_path() -> Option<std::path::PathBuf> {
    // Tauri sidecar resolution: binaries/llama-server-<target>
    let candidates = [
        std::path::PathBuf::from("src-tauri/binaries/llama-server-x86_64-pc-windows-msvc.exe"),
        std::path::PathBuf::from("binaries/llama-server-x86_64-pc-windows-msvc.exe"),
    ];
    candidates.into_iter().find(|c| c.exists() && c.is_file())
}

fn sha256_file(path: &std::path::Path) -> Result<String, String> {
    let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 65536];
    loop {
        use std::io::Read;
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn verify_binary(path: &std::path::Path) -> Result<(), String> {
    let expected = if !EXPECTED_LLAMA_SERVER_SHA256.is_empty() {
        EXPECTED_LLAMA_SERVER_SHA256.to_string()
    } else {
        std::env::var("CROZZO_LLAMA_SERVER_SHA256").unwrap_or_default()
    };
    if expected.is_empty() {
        return Ok(());
    }
    let actual = sha256_file(path)?;
    if actual.eq_ignore_ascii_case(&expected) {
        Ok(())
    } else {
        Err(format!("llama_server_sha256_mismatch: expected {} got {}", expected, actual))
    }
}

fn token_file_path() -> std::path::PathBuf {
    let base = std::env::var("APPDATA")
        .or_else(|_| std::env::var("LOCALAPPDATA"))
        .unwrap_or_else(|_| ".".to_string());
    std::path::PathBuf::from(base)
        .join("crozzo-pos")
        .join("llama-sidecar.token")
}

#[cfg(windows)]
fn gen_random_hex(nbytes: usize) -> String {
    let mut buf = vec![0u8; nbytes];
    // Fallback: derive from time+pid (unique per install).
    if buf.iter().all(|b| *b == 0) {
        use std::time::{SystemTime, UNIX_EPOCH};
        let seed = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
            ^ (std::process::id() as u128);
        let mut x = seed;
        for b in buf.iter_mut() {
            x = x.wrapping_mul(6364136223846793005).wrapping_add(1);
            *b = (x >> 32) as u8;
        }
    }
    hex_encode(&buf)
}

#[cfg(not(windows))]
fn gen_random_hex(nbytes: usize) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let mut buf = vec![0u8; nbytes];
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
        ^ (std::process::id() as u128);
    let mut x = seed;
    for b in buf.iter_mut() {
        x = x.wrapping_mul(6364136223846793005).wrapping_add(1);
        *b = (x >> 32) as u8;
    }
    hex_encode(&buf)
}

fn hex_encode(buf: &[u8]) -> String {
    const HEX: &[u8] = b"0123456789abcdef";
    let mut s = String::with_capacity(buf.len() * 2);
    for b in buf {
        s.push(HEX[(b >> 4) as usize] as char);
        s.push(HEX[(b & 0x0f) as usize] as char);
    }
    s
}

fn llama_auth_token_load_or_create() -> String {
    let path = token_file_path();
    if let Ok(v) = std::fs::read_to_string(&path) {
        let t = v.trim().to_string();
        if !t.is_empty() {
            return t;
        }
    }
    let token = gen_random_hex(32);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&path, &token);
    token
}

// Expose helper for callers needing the token.
pub fn llama_auth_token() -> String {
    LLAMA_TOKEN.clone()
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
#[allow(clippy::question_mark)]
pub fn crozzo_llama_ensure_sidecar() -> Result<bool, String> {
    if http_get_health() {
        return Ok(true);
    }
    let bin = match sidecar_binary_path() {
        Some(p) => p,
        None => return Ok(false),
    };
    if let Err(e) = verify_binary(&bin) {
        return Err(e);
    }
    let token = LLAMA_TOKEN.clone();
    let model = std::env::var("CROZZO_LLAMA_MODEL").unwrap_or_else(|_| "phi4-mini.gguf".into());
    let model_path = std::path::PathBuf::from("models").join(&model);
    let mut cmd = Command::new(&bin);
    cmd
        .arg("-m").arg(&model_path)
        .arg("--host").arg("127.0.0.1")
        .arg("--port").arg("11435")
        .arg("--ctx-size").arg("4096")
        .arg("--api-key").arg(&token);
    cmd.env("LLAMA_API_KEY", &token);
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
    let token = LLAMA_TOKEN.clone();
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
        .header("Authorization", format!("Bearer {}", token))
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
