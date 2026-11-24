use std::process::Command;

fn is_allowed_host(url: &str) -> bool {
    let hosts = ["raw.githubusercontent.com", "github.com", "api.github.com", "ollama.com"];
    hosts.iter().any(|h| url.contains(h))
}


const ALLOWED_HOSTS: &[&str] = &[
    "raw.githubusercontent.com",
    "github.com",
    "api.github.com",
    "ollama.com",
];

#[tauri::command]
pub fn crozzo_download_and_run_installer(url: String) -> Result<String, String> {
    let url = url.trim();
    if url.is_empty() || !url.starts_with("https://") {
        return Err("URL de instalador inválida".into());
    }
    if !is_allowed_host(url) {
        return Err("Host no permitido".into());
    }

    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let tmp = std::env::temp_dir().join(format!("crozzo-installer-{stamp}.exe"));

    // Download
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(url).send().map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Descarga falló: HTTP {}", resp.status()));
    }
    let bytes = resp.bytes().map_err(|e| e.to_string())?;
    std::fs::write(&tmp, &bytes).map_err(|e| format!("No se pudo guardar: {e}"))?;

    // Run installer (not silent - user sees the UI)
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        Command::new(&tmp)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("No se pudo ejecutar instalador: {e}"))?;
    }
    #[cfg(not(windows))]
    {
        Command::new(&tmp)
            .spawn()
            .map_err(|e| format!("No se pudo ejecutar instalador: {e}"))?;
    }

    Ok(tmp.to_string_lossy().to_string())
}