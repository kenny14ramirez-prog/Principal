//! Gestor de modelos GGUF para llama-server (descarga/progreso/borrado).
//! Los modelos se guardan en <app_data>/models/.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::sync::{LazyLock, Mutex};

static CANCEL_FLAGS: LazyLock<Mutex<HashMap<String, bool>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Debug, Clone, Serialize)]
pub struct LlamaModelDef {
    pub id: String,
    pub label: String,
    pub size: String,
    pub filename: String,
    pub url: String,
    pub min_ram_gb: u32,
    pub expected_sha256: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModelStatus {
    pub model_id: String,
    pub installed: bool,
    pub path: String,
    pub size_bytes: u64,
    pub sha256_ok: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModelProgress {
    pub model_id: String,
    pub status: String,
    pub downloaded: u64,
    pub total: u64,
    pub percent: f64,
    pub error: Option<String>,
}

fn models() -> Vec<LlamaModelDef> {
    vec![
        LlamaModelDef {
            id: "1b".into(),
            label: "Llama 3.2 1B Instruct (Q4_K_M)".into(),
            size: "1B".into(),
            filename: "Llama-3.2-1B-Instruct-Q4_K_M.gguf".into(),
            url: "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf".into(),
            min_ram_gb: 4,
            expected_sha256: None,
        },
        LlamaModelDef {
            id: "3b".into(),
            label: "Llama 3.2 3B Instruct (Q4_K_M)".into(),
            size: "3B".into(),
            filename: "Llama-3.2-3B-Instruct-Q4_K_M.gguf".into(),
            url: "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf".into(),
            min_ram_gb: 8,
            expected_sha256: None,
        },
        LlamaModelDef {
            id: "4b".into(),
            label: "Gemma 3 4B Instruct (Q4_K_M)".into(),
            size: "4B".into(),
            filename: "gemma-3-4b-it-Q4_K_M.gguf".into(),
            url: "https://huggingface.co/bartowski/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_K_M.gguf".into(),
            min_ram_gb: 16,
            expected_sha256: None,
        },
    ]
}

fn find_model(id: &str) -> Option<LlamaModelDef> {
    models().into_iter().find(|m| m.id == id)
}

fn models_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("models");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn sha256_file(path: &std::path::Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 65536];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn verify_model_hash(m: &LlamaModelDef, path: &std::path::Path) -> bool {
    match &m.expected_sha256 {
        Some(expected) if !expected.is_empty() => {
            match sha256_file(path) {
                Ok(actual) => actual.eq_ignore_ascii_case(expected),
                Err(_) => false,
            }
        }
        _ => true,
    }
}

#[tauri::command]
pub fn crozzo_llama_model_list() -> Vec<LlamaModelDef> {
    models()
}

#[tauri::command]
pub fn crozzo_llama_model_status(app: tauri::AppHandle, model_id: String) -> Result<ModelStatus, String> {
    let m = find_model(&model_id).ok_or_else(|| "modelo desconocido".to_string())?;
    let dir = models_dir(&app)?;
    let path = dir.join(&m.filename);
    let size = path.metadata().map(|md| md.len()).unwrap_or(0);
    let sha_ok = if path.exists() && size > 0 {
        verify_model_hash(&m, &path)
    } else {
        false
    };
    Ok(ModelStatus {
        model_id,
        installed: path.exists() && size > 0 && sha_ok,
        path: path.to_string_lossy().to_string(),
        size_bytes: size,
        sha256_ok: sha_ok,
    })
}

#[tauri::command]
pub fn crozzo_llama_model_verify(app: tauri::AppHandle, model_id: String) -> Result<bool, String> {
    let m = find_model(&model_id).ok_or_else(|| "modelo desconocido".to_string())?;
    let dir = models_dir(&app)?;
    let path = dir.join(&m.filename);
    if !path.exists() {
        return Ok(false);
    }
    Ok(verify_model_hash(&m, &path))
}

#[tauri::command]
pub fn crozzo_llama_model_cancel(model_id: String) -> Result<(), String> {
    let mut flags = CANCEL_FLAGS.lock().map_err(|e| e.to_string())?;
    flags.insert(model_id, true);
    Ok(())
}

#[tauri::command]
pub fn crozzo_llama_model_delete(app: tauri::AppHandle, model_id: String) -> Result<(), String> {
    let _ = crozzo_llama_model_cancel(model_id.clone());
    let m = find_model(&model_id).ok_or_else(|| "modelo desconocido".to_string())?;
    let dir = models_dir(&app)?;
    let path = dir.join(&m.filename);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn crozzo_llama_model_download(app: tauri::AppHandle, model_id: String) -> Result<(), String> {
    let m = find_model(&model_id).ok_or_else(|| "modelo desconocido".to_string())?;
    {
        let mut f = CANCEL_FLAGS.lock().map_err(|e| e.to_string())?;
        f.insert(model_id.clone(), false);
    }
    let app2 = app.clone();
    let mid = model_id.clone();
    std::thread::spawn(move || {
        use tauri::Emitter;
        let emit_progress = |app: &tauri::AppHandle, p: ModelProgress| {
            let _ = app.emit("crozzo-llama-model-progress", p);
        };

        let dir = match models_dir(&app2) {
            Ok(d) => d,
            Err(e) => {
                emit_progress(
                    &app2,
                    ModelProgress {
                        model_id: mid.clone(),
                        status: "error".into(),
                        downloaded: 0,
                        total: 0,
                        percent: 0.0,
                        error: Some(e),
                    },
                );
                return;
            }
        };
        let path = dir.join(&m.filename);

        let mut existing = path.metadata().map(|md| md.len()).unwrap_or(0);

        let client = match reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(3600))
            .redirect(reqwest::redirect::Policy::limited(10))
            .user_agent("CrozzoPOS/1.0")
            .build()
        {
            Ok(c) => c,
            Err(e) => {
                emit_progress(
                    &app2,
                    ModelProgress {
                        model_id: mid.clone(),
                        status: "error".into(),
                        downloaded: existing,
                        total: 0,
                        percent: 0.0,
                        error: Some(e.to_string()),
                    },
                );
                return;
            }
        };

        let mut req = client.get(&m.url);
        if existing > 0 {
            req = req.header("Range", format!("bytes={}-", existing));
        }
        let resp = match req.send() {
            Ok(r) => r,
            Err(e) => {
                emit_progress(
                    &app2,
                    ModelProgress {
                        model_id: mid.clone(),
                        status: "error".into(),
                        downloaded: existing,
                        total: 0,
                        percent: 0.0,
                        error: Some(e.to_string()),
                    },
                );
                return;
            }
        };

        let code = resp.status().as_u16();
        if code != 200 && code != 206 {
            emit_progress(
                &app2,
                ModelProgress {
                    model_id: mid.clone(),
                    status: "error".into(),
                    downloaded: existing,
                    total: 0,
                    percent: 0.0,
                    error: Some(format!("http_{}", code)),
                },
            );
            return;
        }

        let total = if code == 206 {
            existing + resp.content_length().unwrap_or(0)
        } else {
            existing = 0;
            let _ = std::fs::remove_file(&path);
            resp.content_length().unwrap_or(0)
        };

        let mut file = if existing > 0 && code == 206 {
            match OpenOptions::new().append(true).open(&path) {
                Ok(f) => f,
                Err(e) => {
                    emit_progress(
                        &app2,
                        ModelProgress {
                            model_id: mid.clone(),
                            status: "error".into(),
                            downloaded: existing,
                            total,
                            percent: 0.0,
                            error: Some(e.to_string()),
                        },
                    );
                    return;
                }
            }
        } else {
            match File::create(&path) {
                Ok(f) => f,
                Err(e) => {
                    emit_progress(
                        &app2,
                        ModelProgress {
                            model_id: mid.clone(),
                            status: "error".into(),
                            downloaded: 0,
                            total,
                            percent: 0.0,
                            error: Some(e.to_string()),
                        },
                    );
                    return;
                }
            }
        };

        let mut downloaded = existing;
        emit_progress(
            &app2,
            ModelProgress {
                model_id: mid.clone(),
                status: "downloading".into(),
                downloaded,
                total,
                percent: if total > 0 {
                    downloaded as f64 / total as f64 * 100.0
                } else {
                    0.0
                },
                error: None,
            },
        );

        let mut buf = [0u8; 65536];
        let mut reader = resp;
        let mut counter: u32 = 0;
        loop {
            let cancelled = CANCEL_FLAGS
                .lock()
                .map(|f| *f.get(&mid).unwrap_or(&false))
                .unwrap_or(false);
            if cancelled {
                emit_progress(
                    &app2,
                    ModelProgress {
                        model_id: mid.clone(),
                        status: "cancelled".into(),
                        downloaded,
                        total,
                        percent: if total > 0 {
                            downloaded as f64 / total as f64 * 100.0
                        } else {
                            0.0
                        },
                        error: None,
                    },
                );
                return;
            }
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    if let Err(e) = file.write_all(&buf[..n]) {
                        emit_progress(
                            &app2,
                            ModelProgress {
                                model_id: mid.clone(),
                                status: "error".into(),
                                downloaded,
                                total,
                                percent: if total > 0 {
                                    downloaded as f64 / total as f64 * 100.0
                                } else {
                                    0.0
                                },
                                error: Some(e.to_string()),
                            },
                        );
                        return;
                    }
                    downloaded += n as u64;
                    counter += 1;
                    if counter % 8 == 0 {
                        emit_progress(
                            &app2,
                            ModelProgress {
                                model_id: mid.clone(),
                                status: "downloading".into(),
                                downloaded,
                                total,
                                percent: if total > 0 {
                                    downloaded as f64 / total as f64 * 100.0
                                } else {
                                    0.0
                                },
                                error: None,
                            },
                        );
                    }
                }
                Err(e) => {
                    emit_progress(
                        &app2,
                        ModelProgress {
                            model_id: mid.clone(),
                            status: "error".into(),
                            downloaded,
                            total,
                            percent: if total > 0 {
                                downloaded as f64 / total as f64 * 100.0
                            } else {
                                0.0
                            },
                            error: Some(e.to_string()),
                        },
                    );
                    return;
                }
            }
        }
        let _ = file.flush();
        // SHA256 verification after download
        if let Some(expected) = &m.expected_sha256 {
            if !expected.is_empty() {
                match sha256_file(&path) {
                    Ok(actual) if actual.eq_ignore_ascii_case(expected) => {}
                    Ok(actual) => {
                        let _ = std::fs::remove_file(&path);
                        emit_progress(
                            &app2,
                            ModelProgress {
                                model_id: mid.clone(),
                                status: "error".into(),
                                downloaded,
                                total: if total > 0 { total } else { downloaded },
                                percent: 0.0,
                                error: Some(format!("sha256_mismatch: expected {} got {}", expected, actual)),
                            },
                        );
                        return;
                    }
                    Err(e) => {
                        let _ = std::fs::remove_file(&path);
                        emit_progress(
                            &app2,
                            ModelProgress {
                                model_id: mid.clone(),
                                status: "error".into(),
                                downloaded,
                                total: if total > 0 { total } else { downloaded },
                                percent: 0.0,
                                error: Some(e),
                            },
                        );
                        return;
                    }
                }
            }
        }
        emit_progress(
            &app2,
            ModelProgress {
                model_id: mid.clone(),
                status: "done".into(),
                downloaded,
                total: if total > 0 { total } else { downloaded },
                percent: 100.0,
                error: None,
            },
        );
    });

    Ok(())
}
