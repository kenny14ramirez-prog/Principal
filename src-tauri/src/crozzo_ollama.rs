//! Puente a Ollama local (IA texto) para análisis de cierres y resúmenes.
//! Degradación honesta: si Ollama no está disponible, el front usa la vista previa local.

use serde::Serialize;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn http_post_json(url: &str, body: &str, timeout_ms: u64) -> Result<String, String> {
    // Usar reqwest blocking (ya en deps para desktop).
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_millis(timeout_ms))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post(url)
        .header("Content-Type", "application/json")
        .body(body.to_string())
        .send()
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("ollama_http_{}: {}", status.as_u16(), text));
    }
    Ok(text)
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
pub fn crozzo_ollama_chat(url: String, model: String, prompt: String, timeout_ms: Option<u64>) -> Result<String, String> {
    let timeout = timeout_ms.unwrap_or(60_000);
    let body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "stream": false,
        "options": { "temperature": 0.3, "num_predict": 512 }
    })
    .to_string();
    let endpoint = format!("{}/api/generate", url.trim_end_matches('/'));
    http_post_json(&endpoint, &body, timeout)
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
pub fn crozzo_ollama_tags(url: String, timeout_ms: Option<u64>) -> Result<String, String> {
    let timeout = timeout_ms.unwrap_or(10_000);
    let endpoint = format!("{}/api/tags", url.trim_end_matches('/'));
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_millis(timeout))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(&endpoint).send().map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("ollama_tags_{}: {}", status.as_u16(), text));
    }
    Ok(text)
}

// Stubs para Android/iOS: Ollama no disponible en móvil (degradación honesta).
#[cfg(any(target_os = "android", target_os = "ios"))]
#[tauri::command]
pub fn crozzo_ollama_chat(_url: String, _model: String, _prompt: String, _timeout_ms: Option<u64>) -> Result<String, String> {
    Err("ollama_no_disponible_en_esta_plataforma".into())
}

#[cfg(any(target_os = "android", target_os = "ios"))]
#[tauri::command]
pub fn crozzo_ollama_tags(_url: String, _timeout_ms: Option<u64>) -> Result<String, String> {
    Ok("{}".into())
}

#[derive(Serialize)]
#[allow(dead_code)]
pub struct OllamaModelInfo {
    pub name: String,
    pub size_gb: f64,
}