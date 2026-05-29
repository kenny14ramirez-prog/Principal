//! Descarga setup.exe del release y lo ejecuta en silencio (fallback sin verificar firma del updater).

#[tauri::command]
pub fn install_setup_from_url(url: String) -> Result<(), String> {
    let url = url.trim();
    if url.is_empty() || !url.starts_with("https://") {
        return Err("URL de instalador inválida".into());
    }

    let tmp = std::env::temp_dir().join(format!(
        "crozzo-setup-{}.exe",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0)
    ));

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(900))
        .build()
        .map_err(|e| e.to_string())?;

    let bytes = client
        .get(url)
        .send()
        .map_err(|e| format!("Descarga falló: {e}"))?
        .bytes()
        .map_err(|e| e.to_string())?;

    std::fs::write(&tmp, &bytes).map_err(|e| format!("No se pudo guardar instalador: {e}"))?;

    #[cfg(windows)]
    {
        std::process::Command::new(&tmp)
            .arg("/S")
            .spawn()
            .map_err(|e| format!("No se pudo ejecutar instalador: {e}"))?;
        return Ok(());
    }

    #[cfg(not(windows))]
    {
        let _ = tmp;
        Err("Instalación silenciosa solo disponible en Windows".into())
    }
}
