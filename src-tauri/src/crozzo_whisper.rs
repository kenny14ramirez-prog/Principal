//! Transcripción de voz con whisper.cpp (sidecar o binario).
//! Degradación honesta: si el binario/modelo no está presente, devuelve error descriptivo.

use serde::Serialize;
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
pub struct WhisperResult {
    pub ok: bool,
    pub text: String,
    pub detail: String,
}

fn binary_candidates() -> Vec<std::path::PathBuf> {
    let mut out = Vec::new();
    let names = ["whisper-cli.exe", "whisper.exe", "main.exe", "whisper-cli", "whisper", "main"];
    // Solo directorios controlados por la app (sin PATH ni CWD).
    for n in names {
        out.push(std::path::PathBuf::from("src-tauri/binaries").join(n));
        out.push(std::path::PathBuf::from("binaries").join(n));
    }
    if let Ok(base) = std::env::var("APPDATA") {
        for n in names {
            out.push(std::path::PathBuf::from(&base).join("crozzo-pos").join("binaries").join(n));
        }
    }
    if let Ok(base) = std::env::var("LOCALAPPDATA") {
        for n in names {
            out.push(std::path::PathBuf::from(&base).join("crozzo-pos").join("binaries").join(n));
        }
    }
    out
}

fn find_binary() -> Option<std::path::PathBuf> {
    binary_candidates().into_iter().find(|p| p.exists() && p.is_file())
}

fn model_candidates() -> Vec<std::path::PathBuf> {
    let mut out = Vec::new();
    let names = ["ggml-base.bin", "ggml-small.bin", "ggml-base.en.bin", "ggml-small.en.bin"];
    if let Ok(m) = std::env::var("CROZZO_WHISPER_MODEL") {
        out.push(std::path::PathBuf::from(m));
    }
    for n in names {
        out.push(std::path::PathBuf::from("src-tauri/models").join(n));
        out.push(std::path::PathBuf::from("models").join(n));
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        for n in names {
            out.push(std::path::PathBuf::from(&local).join("crozzo-whisper").join("models").join(n));
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        for n in names {
            out.push(std::path::PathBuf::from(&home).join(".crozzo-whisper").join("models").join(n));
        }
    }
    out
}

fn find_model() -> Option<std::path::PathBuf> {
    model_candidates().into_iter().find(|p| p.exists() && p.is_file())
}

pub fn sweep_audio_temp() {
    let dir = std::env::temp_dir().join("crozzo-audio");
    if !dir.exists() {
        return;
    }
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for e in entries.flatten() {
            let path = e.path();
            if path.is_file() {
                let _ = std::fs::remove_file(&path);
            }
        }
    }
}

#[tauri::command]
pub fn crozzo_whisper_save_audio(audio_b64: String, ext: Option<String>) -> Result<String, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(audio_b64.trim())
        .map_err(|e| format!("base64 invalido: {e}"))?;
    let e = ext.unwrap_or_else(|| "wav".into());
    let safe_ext = if e.chars().all(|c| c.is_ascii_alphanumeric()) { e } else { "wav".into() };
    let dir = std::env::temp_dir().join("crozzo-audio");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let name = format!(
        "audio_{}_{}.{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0),
        safe_ext
    );
    let path = dir.join(&name);
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn crozzo_whisper_transcribe(audio_path: String) -> Result<String, String> {
    let result = (|| -> Result<String, String> {
        let bin = find_binary().ok_or_else(|| {
            "whisper no disponible: coloque whisper-cli.exe en src-tauri/binaries/".to_string()
        })?;
        if !bin.exists() || !bin.is_file() {
            return Err("whisper binario no existe".to_string());
        }
        let model = find_model().ok_or_else(|| {
            "modelo whisper no encontrado: ejecute scripts/download-whisper-model.mjs (base/small)".to_string()
        })?;
        let mut cmd = Command::new(&bin);
        cmd
            .arg("-m").arg(&model)
            .arg("-f").arg(&audio_path)
            .arg("-l").arg("es")
            .arg("--no-timestamps");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        let out = cmd.output().map_err(|e| format!("whisper exec: {e}"))?;
        if !out.status.success() {
            let err = String::from_utf8_lossy(&out.stderr).to_string();
            return Err(format!("whisper fallo: {}", err.trim()));
        }
        let stdout = String::from_utf8_lossy(&out.stdout).to_string();
        let text = stdout
            .lines()
            .map(|l| l.trim())
            .filter(|l| !l.is_empty())
            .collect::<Vec<_>>()
            .join(" ");
        if text.is_empty() {
            let txt_path = std::path::PathBuf::from(&audio_path).with_extension("txt");
            if txt_path.exists() {
                if let Ok(content) = std::fs::read_to_string(&txt_path) {
                    let t = content.trim().to_string();
                    if !t.is_empty() {
                        return Ok(t);
                    }
                }
            }
            return Err("whisper no produjo texto".to_string());
        }
        Ok(text)
    })();

    // Cleanup audio temp files after transcription.
    let _ = std::fs::remove_file(&audio_path);
    let txt_path = std::path::PathBuf::from(&audio_path).with_extension("txt");
    let _ = std::fs::remove_file(&txt_path);

    result
}
