//! Peticiones HTTP desde el backend (evita CORS del WebView hacia GitHub Releases / NVIDIA).

use serde::Serialize;
use std::time::Duration;

const NVIDIA_CHAT_URL: &str = "https://integrate.api.nvidia.com/v1/chat/completions";

fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(120))
        .redirect(reqwest::redirect::Policy::limited(10))
        .user_agent("CrozzoPOS-Updater/1.0")
        .build()
        .map_err(|e| e.to_string())
}

#[derive(Debug, Serialize)]
pub struct CrozzoHttpHeadResult {
    pub status: u16,
    pub content_length: u64,
}

#[tauri::command]
pub fn crozzo_http_get_text(url: String) -> Result<String, String> {
    let url = url.trim();
    if url.is_empty() {
        return Err("URL vacía".into());
    }
    if !url.starts_with("https://") {
        return Err("Solo se permiten URLs HTTPS".into());
    }
    let client = client()?;
    let resp = client
        .get(url)
        .send()
        .map_err(|e| format!("GET falló: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    resp.text().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn crozzo_http_head(url: String) -> Result<CrozzoHttpHeadResult, String> {
    let url = url.trim();
    if url.is_empty() {
        return Err("URL vacía".into());
    }
    if !url.starts_with("https://") {
        return Err("Solo se permiten URLs HTTPS".into());
    }
    let client = client()?;
    let resp = client
        .head(url)
        .send()
        .map_err(|e| format!("HEAD falló: {e}"))?;
    // GitHub a veces no responde HEAD; intentar GET con rango mínimo
    if !resp.status().is_success() || resp.content_length().unwrap_or(0) == 0 {
        let resp2 = client
            .get(url)
            .header(reqwest::header::RANGE, "bytes=0-0")
            .send()
            .map_err(|e| format!("GET range falló: {e}"))?;
        return Ok(CrozzoHttpHeadResult {
            status: resp2.status().as_u16(),
            content_length: resp2.content_length().unwrap_or(0),
        });
    }
    Ok(CrozzoHttpHeadResult {
        status: resp.status().as_u16(),
        content_length: resp.content_length().unwrap_or(0),
    })
}

#[derive(Debug, Serialize)]
pub struct CrozzoNvidiaChatResult {
    pub status: u16,
    pub body: String,
}

fn nvidia_client() -> Result<reqwest::blocking::Client, String> {
    // NIM puede tardar ~60–100s; UI no se congela (comando async + spawn_blocking).
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(120))
        .connect_timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("CrozzoPOS-AiInsights/1.0")
        .build()
        .map_err(|e| e.to_string())
}

fn nvidia_chat_blocking(api_key: String, body_json: String) -> Result<CrozzoNvidiaChatResult, String> {
    let key = api_key.trim();
    if key.is_empty() || !key.starts_with("nvapi-") {
        return Err("API key NVIDIA inválida (debe empezar por nvapi-)".into());
    }
    if key.len() < 24 {
        return Err("API key NVIDIA demasiado corta".into());
    }
    let body = body_json.trim();
    if body.is_empty() {
        return Err("body_json vacío".into());
    }
    let _: serde_json::Value =
        serde_json::from_str(body).map_err(|e| format!("body_json no es JSON: {e}"))?;

    let client = nvidia_client()?;
    let resp = client
        .post(NVIDIA_CHAT_URL)
        .header("Authorization", format!("Bearer {key}"))
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .body(body.to_string())
        .send()
        .map_err(|e| format!("NVIDIA POST falló: {e}"))?;
    let status = resp.status().as_u16();
    let text = resp.text().map_err(|e| e.to_string())?;
    if !(200..300).contains(&status) {
        let snippet: String = text.chars().take(280).collect();
        return Err(format!("NVIDIA HTTP {status}: {snippet}"));
    }
    Ok(CrozzoNvidiaChatResult {
        status,
        body: text,
    })
}

/// Chat NVIDIA fuera del hilo UI (evita «BONA origen no responde»).
#[tauri::command]
pub async fn crozzo_nvidia_chat(
    api_key: String,
    body_json: String,
) -> Result<CrozzoNvidiaChatResult, String> {
    tauri::async_runtime::spawn_blocking(move || nvidia_chat_blocking(api_key, body_json))
        .await
        .map_err(|e| format!("NVIDIA task join: {e}"))?
}
