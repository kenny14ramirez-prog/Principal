//! WhatsApp Web — ventana auxiliar alineada al slot `#crozzoWaEmbedHost` (viewport lógico).

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::webview::{Color, PageLoadEvent};
use tauri::{
    LogicalSize, Manager, PhysicalPosition, Position, Size, WebviewUrl, WebviewWindowBuilder,
};

const WA_CHROME_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const WA_DOCK_LABEL: &str = "crozzo-whatsapp-dock";
const WA_EMBED_LABEL: &str = "crozzo-whatsapp-embed";
const WA_DEFAULT_URL: &str = "https://web.whatsapp.com/";

static WA_DOCK_CREATING: AtomicBool = AtomicBool::new(false);
static WA_WANT_VISIBLE: AtomicBool = AtomicBool::new(false);
static WA_LAST_LEFT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static WA_LAST_TOP: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static WA_LAST_WIDTH: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static WA_LAST_HEIGHT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn store_rect(left: f64, top: f64, width: f64, height: f64) {
    WA_LAST_LEFT.store(left.to_bits(), Ordering::SeqCst);
    WA_LAST_TOP.store(top.to_bits(), Ordering::SeqCst);
    WA_LAST_WIDTH.store(width.to_bits(), Ordering::SeqCst);
    WA_LAST_HEIGHT.store(height.to_bits(), Ordering::SeqCst);
}

fn load_rect() -> (f64, f64, f64, f64) {
    (
        f64::from_bits(WA_LAST_LEFT.load(Ordering::SeqCst)),
        f64::from_bits(WA_LAST_TOP.load(Ordering::SeqCst)),
        f64::from_bits(WA_LAST_WIDTH.load(Ordering::SeqCst)),
        f64::from_bits(WA_LAST_HEIGHT.load(Ordering::SeqCst)),
    )
}

fn validate_external_url(url: &str) -> Result<&str, String> {
    let url = url.trim();
    if url.is_empty() {
        return Err(String::from("URL vacía"));
    }
    let ok = url.starts_with("http://")
        || url.starts_with("https://")
        || url.starts_with("whatsapp://")
        || url.starts_with("mailto:");
    if !ok {
        return Err(String::from("Protocolo no permitido"));
    }
    Ok(url)
}

fn validate_embed_dock_url(url: &str) -> Result<&str, String> {
    let url = validate_external_url(url)?;
    if url.contains("whatsapp.com")
        || url.contains("wa.me")
        || url.contains("google.com")
        || url.contains("gmail.com")
    {
        return Ok(url);
    }
    Err(String::from(
        "Dominio no permitido (WhatsApp Web o Google)",
    ))
}

fn validate_whatsapp_url(url: &str) -> Result<&str, String> {
    validate_embed_dock_url(url)
}

fn whatsapp_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
        .map(|p| p.join("whatsapp-web"))
}

fn hide_dock(app: &tauri::AppHandle) {
    WA_WANT_VISIBLE.store(false, Ordering::SeqCst);
    if let Some(dock) = app.get_webview_window(WA_DOCK_LABEL) {
        let _ = dock.hide();
    }
}

fn teardown_legacy_embed(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window(WA_EMBED_LABEL) {
        let _ = win.hide();
        let _ = win.close();
    }
}

pub fn close_legacy_whatsapp_windows(app: &tauri::AppHandle) {
    teardown_legacy_embed(app);
    if let Some(dock) = app.get_webview_window(WA_DOCK_LABEL) {
        let _ = dock.close();
    }
    hide_dock(app);
}

fn position_dock_rect(
    dock: &tauri::WebviewWindow,
    main: &tauri::WebviewWindow,
    left: f64,
    top: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    if width < 80.0 || height < 80.0 {
        return Err(format!(
            "Área WhatsApp demasiado pequeña ({width:.0}x{height:.0})"
        ));
    }
    if left < 0.0 || top < 0.0 {
        return Err(format!("Posición WhatsApp inválida ({left:.0},{top:.0})"));
    }

    dock.set_size(Size::Logical(LogicalSize::new(
        width.max(80.0),
        height.max(80.0),
    )))
    .map_err(|e| e.to_string())?;

    let scale = main.scale_factor().unwrap_or(1.0);
    let inner = main.inner_position().map_err(|e| e.to_string())?;
    let px = inner.x + (left * scale).round() as i32;
    let py = inner.y + (top * scale).round() as i32;
    dock.set_position(Position::Physical(PhysicalPosition::new(px, py)))
        .map_err(|e| e.to_string())?;

    Ok(())
}

fn build_whatsapp_dock(
    app: &tauri::AppHandle,
    url: &str,
) -> Result<tauri::WebviewWindow, String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| String::from("Ventana principal no encontrada"))?;

    let parsed: tauri::Url = url
        .parse()
        .map_err(|e| format!("URL inválida: {e}"))?;

    let data_dir = whatsapp_data_dir(app)?;

    let mut builder = WebviewWindowBuilder::new(app, WA_DOCK_LABEL, WebviewUrl::External(parsed))
        .title("")
        .decorations(false)
        .visible(false)
        .focused(false)
        .skip_taskbar(true)
        .resizable(false)
        .always_on_top(false)
        .background_color(Color(255, 255, 255, 255))
        .user_agent(WA_CHROME_UA)
        .data_directory(data_dir)
        .enable_clipboard_access()
        .inner_size(320.0, 240.0)
        .on_page_load(|window, payload| {
            if payload.event() == PageLoadEvent::Finished && WA_WANT_VISIBLE.load(Ordering::SeqCst) {
                let app = window.app_handle();
                if let (Some(main), Some(dock)) = (
                    app.get_webview_window("main"),
                    app.get_webview_window(WA_DOCK_LABEL),
                ) {
                    let (l, t, w, h) = load_rect();
                    if w >= 80.0 && h >= 80.0 {
                        let _ = position_dock_rect(&dock, &main, l, t, w, h);
                    }
                    let _ = dock.show();
                } else {
                    let _ = window.show();
                }
            }
        });

    #[cfg(debug_assertions)]
    {
        builder = builder.devtools(true);
    }

    #[cfg(windows)]
    {
        builder = builder
            .owner(&main)
            .map_err(|e| format!("Owner WhatsApp: {e}"))?;
    }
    #[cfg(all(not(windows), target_os = "macos"))]
    {
        builder = builder
            .parent(&main)
            .map_err(|e| format!("Parent WhatsApp: {e}"))?;
    }

    let dock = builder
        .build()
        .map_err(|e| format!("Ventana WhatsApp: {e}"))?;
    let _ = dock.hide();
    Ok(dock)
}

fn ensure_whatsapp_dock(app: &tauri::AppHandle, url: &str) -> Result<tauri::WebviewWindow, String> {
    if let Some(dock) = app.get_webview_window(WA_DOCK_LABEL) {
        return Ok(dock);
    }

    if WA_DOCK_CREATING.swap(true, Ordering::SeqCst) {
        for _ in 0..40 {
            std::thread::sleep(std::time::Duration::from_millis(50));
            if let Some(dock) = app.get_webview_window(WA_DOCK_LABEL) {
                WA_DOCK_CREATING.store(false, Ordering::SeqCst);
                return Ok(dock);
            }
        }
        WA_DOCK_CREATING.store(false, Ordering::SeqCst);
        return Err(String::from("Timeout creando ventana WhatsApp"));
    }

    let result = build_whatsapp_dock(app, url);
    WA_DOCK_CREATING.store(false, Ordering::SeqCst);
    result
}

pub fn prewarm_whatsapp_dock(app: &tauri::AppHandle) {
    WA_WANT_VISIBLE.store(false, Ordering::SeqCst);
    if let Ok(dock) = ensure_whatsapp_dock(app, WA_DEFAULT_URL) {
        let _ = dock.hide();
    }
}

#[tauri::command]
pub fn crozzo_open_external_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let url = validate_external_url(&url)?;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| format!("No se abrió enlace: {e}"))
}

#[cfg(desktop)]
#[tauri::command]
pub async fn crozzo_whatsapp_dock_sync(
    app: tauri::AppHandle,
    open: bool,
    left: f64,
    top: f64,
    width: f64,
    height: f64,
    url: Option<String>,
) -> Result<String, String> {
    if !open {
        hide_dock(&app);
        return Ok(String::from("closed"));
    }

    hide_all_web_docks_except(&app, "whatsapp");

    let main = app
        .get_webview_window("main")
        .ok_or_else(|| String::from("Ventana principal no encontrada"))?;

    let (last_l, last_t, last_w, last_h) = load_rect();
    let same_rect = (last_l - left).abs() < 0.5
        && (last_t - top).abs() < 0.5
        && (last_w - width).abs() < 0.5
        && (last_h - height).abs() < 0.5;

    store_rect(left, top, width, height);

    let should_navigate = url.as_ref().is_some_and(|u| !u.trim().is_empty());
    let target_url = url
        .filter(|u| !u.trim().is_empty())
        .unwrap_or_else(|| String::from(WA_DEFAULT_URL));
    validate_whatsapp_url(&target_url)?;

    let dock = ensure_whatsapp_dock(&app, &target_url)?;
    if !same_rect {
        position_dock_rect(&dock, &main, left, top, width, height)?;
    }

    WA_WANT_VISIBLE.store(true, Ordering::SeqCst);

    if should_navigate {
        let want: tauri::Url = target_url
            .parse()
            .map_err(|e| format!("URL WhatsApp: {e}"))?;
        let needs_nav = dock
            .url()
            .ok()
            .map(|current| current.as_str() != want.as_str())
            .unwrap_or(true);
        if needs_nav {
            let _ = dock.hide();
            dock.navigate(want)
                .map_err(|e| format!("Navigate WhatsApp: {e}"))?;
        } else {
            dock.show().map_err(|e| e.to_string())?;
        }
    } else {
        dock.show().map_err(|e| e.to_string())?;
    }

    Ok(format!(
        "open:{left:.0},{top:.0},{width:.0}x{height:.0}"
    ))
}

#[cfg(not(desktop))]
#[tauri::command]
pub async fn crozzo_whatsapp_dock_sync(
    _app: tauri::AppHandle,
    _open: bool,
    _left: f64,
    _top: f64,
    _width: f64,
    _height: f64,
    _url: Option<String>,
) -> Result<String, String> {
    Err(String::from("WhatsApp embebido solo en escritorio"))
}

#[cfg(desktop)]
#[tauri::command]
pub async fn crozzo_open_whatsapp_web(app: tauri::AppHandle, url: String) -> Result<String, String> {
    let url_str = validate_whatsapp_url(&url)?.to_string();
    crozzo_whatsapp_dock_sync(app, true, 64.0, 120.0, 900.0, 700.0, Some(url_str)).await
}

#[cfg(not(desktop))]
#[tauri::command]
pub async fn crozzo_open_whatsapp_web(_app: tauri::AppHandle, _url: String) -> Result<String, String> {
    Err(String::from("WhatsApp Web solo en escritorio"))
}

// ── Gmail Web dock ──

const GMAIL_DOCK_LABEL: &str = "crozzo-gmail-dock";
const GMAIL_DEFAULT_URL: &str = "https://mail.google.com/";

static GMAIL_DOCK_CREATING: AtomicBool = AtomicBool::new(false);
static GMAIL_WANT_VISIBLE: AtomicBool = AtomicBool::new(false);
static GMAIL_LAST_LEFT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static GMAIL_LAST_TOP: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static GMAIL_LAST_WIDTH: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static GMAIL_LAST_HEIGHT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn validate_gmail_url(url: &str) -> Result<&str, String> {
    let url = validate_external_url(url)?;
    if url.contains("google.com") || url.contains("gmail.com") {
        return Ok(url);
    }
    Err(String::from("Solo enlaces Google / Gmail"))
}

fn gmail_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
        .map(|p| p.join("gmail-web"))
}

fn store_gmail_rect(left: f64, top: f64, width: f64, height: f64) {
    GMAIL_LAST_LEFT.store(left.to_bits(), Ordering::SeqCst);
    GMAIL_LAST_TOP.store(top.to_bits(), Ordering::SeqCst);
    GMAIL_LAST_WIDTH.store(width.to_bits(), Ordering::SeqCst);
    GMAIL_LAST_HEIGHT.store(height.to_bits(), Ordering::SeqCst);
}

fn load_gmail_rect() -> (f64, f64, f64, f64) {
    (
        f64::from_bits(GMAIL_LAST_LEFT.load(Ordering::SeqCst)),
        f64::from_bits(GMAIL_LAST_TOP.load(Ordering::SeqCst)),
        f64::from_bits(GMAIL_LAST_WIDTH.load(Ordering::SeqCst)),
        f64::from_bits(GMAIL_LAST_HEIGHT.load(Ordering::SeqCst)),
    )
}

fn hide_gmail_dock(app: &tauri::AppHandle) {
    GMAIL_WANT_VISIBLE.store(false, Ordering::SeqCst);
    if let Some(dock) = app.get_webview_window(GMAIL_DOCK_LABEL) {
        let _ = dock.hide();
    }
}

fn hide_all_web_docks_except(app: &tauri::AppHandle, keep: &str) {
    if keep != "whatsapp" {
        hide_dock(app);
    }
    if keep != "gmail" {
        hide_gmail_dock(app);
    }
    if keep != "drive" {
        hide_drive_dock(app);
    }
    if keep != "dataico" {
        hide_dataico_dock(app);
    }
    if keep != "dian" {
        hide_dian_vpfe_dock(app);
    }
    if keep != "spotify" {
        hide_spotify_dock(app);
    }
}

fn build_gmail_dock(app: &tauri::AppHandle, url: &str) -> Result<tauri::WebviewWindow, String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| String::from("Ventana principal no encontrada"))?;
    let parsed: tauri::Url = url.parse().map_err(|e| format!("URL inválida: {e}"))?;
    let data_dir = gmail_data_dir(app)?;
    let mut builder = WebviewWindowBuilder::new(app, GMAIL_DOCK_LABEL, WebviewUrl::External(parsed))
        .title("")
        .decorations(false)
        .visible(false)
        .focused(false)
        .skip_taskbar(true)
        .resizable(false)
        .always_on_top(false)
        .background_color(Color(255, 255, 255, 255))
        .user_agent(WA_CHROME_UA)
        .data_directory(data_dir)
        .enable_clipboard_access()
        .inner_size(320.0, 240.0)
        .on_page_load(|window, payload| {
            if payload.event() == PageLoadEvent::Finished && GMAIL_WANT_VISIBLE.load(Ordering::SeqCst) {
                let app = window.app_handle();
                if let (Some(main), Some(dock)) = (
                    app.get_webview_window("main"),
                    app.get_webview_window(GMAIL_DOCK_LABEL),
                ) {
                    let (l, t, w, h) = load_gmail_rect();
                    if w >= 80.0 && h >= 80.0 {
                        let _ = position_dock_rect(&dock, &main, l, t, w, h);
                    }
                    let _ = dock.show();
                } else {
                    let _ = window.show();
                }
            }
        });
    #[cfg(debug_assertions)]
    {
        builder = builder.devtools(true);
    }
    #[cfg(windows)]
    {
        builder = builder.owner(&main).map_err(|e| format!("Owner Gmail: {e}"))?;
    }
    #[cfg(all(not(windows), target_os = "macos"))]
    {
        builder = builder.parent(&main).map_err(|e| format!("Parent Gmail: {e}"))?;
    }
    let dock = builder.build().map_err(|e| format!("Ventana Gmail: {e}"))?;
    let _ = dock.hide();
    Ok(dock)
}

fn ensure_gmail_dock(app: &tauri::AppHandle, url: &str) -> Result<tauri::WebviewWindow, String> {
    if let Some(dock) = app.get_webview_window(GMAIL_DOCK_LABEL) {
        return Ok(dock);
    }
    if GMAIL_DOCK_CREATING.swap(true, Ordering::SeqCst) {
        for _ in 0..40 {
            std::thread::sleep(std::time::Duration::from_millis(50));
            if let Some(dock) = app.get_webview_window(GMAIL_DOCK_LABEL) {
                GMAIL_DOCK_CREATING.store(false, Ordering::SeqCst);
                return Ok(dock);
            }
        }
        GMAIL_DOCK_CREATING.store(false, Ordering::SeqCst);
        return Err(String::from("Timeout creando ventana Gmail"));
    }
    let result = build_gmail_dock(app, url);
    GMAIL_DOCK_CREATING.store(false, Ordering::SeqCst);
    result
}

#[cfg(desktop)]
#[tauri::command]
pub async fn crozzo_gmail_dock_sync(
    app: tauri::AppHandle,
    open: bool,
    left: f64,
    top: f64,
    width: f64,
    height: f64,
    url: Option<String>,
) -> Result<String, String> {
    if !open {
        hide_gmail_dock(&app);
        return Ok(String::from("closed"));
    }
    hide_all_web_docks_except(&app, "gmail");
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| String::from("Ventana principal no encontrada"))?;
    let (last_l, last_t, last_w, last_h) = load_gmail_rect();
    let same_rect = (last_l - left).abs() < 0.5
        && (last_t - top).abs() < 0.5
        && (last_w - width).abs() < 0.5
        && (last_h - height).abs() < 0.5;
    store_gmail_rect(left, top, width, height);
    let should_navigate = url.as_ref().is_some_and(|u| !u.trim().is_empty());
    let target_url = url
        .filter(|u| !u.trim().is_empty())
        .unwrap_or_else(|| String::from(GMAIL_DEFAULT_URL));
    validate_gmail_url(&target_url)?;
    let dock = ensure_gmail_dock(&app, &target_url)?;
    if !same_rect {
        position_dock_rect(&dock, &main, left, top, width, height)?;
    }
    GMAIL_WANT_VISIBLE.store(true, Ordering::SeqCst);
    if should_navigate {
        let want: tauri::Url = target_url.parse().map_err(|e| format!("URL Gmail: {e}"))?;
        let needs_nav = dock
            .url()
            .ok()
            .map(|current| current.as_str() != want.as_str())
            .unwrap_or(true);
        if needs_nav {
            let _ = dock.hide();
            dock.navigate(want).map_err(|e| format!("Navigate Gmail: {e}"))?;
        } else {
            dock.show().map_err(|e| e.to_string())?;
        }
    } else {
        dock.show().map_err(|e| e.to_string())?;
    }
    Ok(format!("open:{left:.0},{top:.0},{width:.0}x{height:.0}"))
}

#[cfg(not(desktop))]
#[tauri::command]
pub async fn crozzo_gmail_dock_sync(
    _app: tauri::AppHandle,
    _open: bool,
    _left: f64,
    _top: f64,
    _width: f64,
    _height: f64,
    _url: Option<String>,
) -> Result<String, String> {
    Err(String::from("Gmail embebido solo en escritorio"))
}

// ── Google Drive dock ──

const DRIVE_DOCK_LABEL: &str = "crozzo-drive-dock";
const DRIVE_DEFAULT_URL: &str = "https://drive.google.com/";

static DRIVE_DOCK_CREATING: AtomicBool = AtomicBool::new(false);
static DRIVE_WANT_VISIBLE: AtomicBool = AtomicBool::new(false);
static DRIVE_LAST_LEFT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static DRIVE_LAST_TOP: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static DRIVE_LAST_WIDTH: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static DRIVE_LAST_HEIGHT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn validate_drive_url(url: &str) -> Result<&str, String> {
    let url = validate_external_url(url)?;
    if url.contains("google.com") || url.contains("drive.google.com") {
        return Ok(url);
    }
    Err(String::from("Solo enlaces Google Drive"))
}

fn drive_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
        .map(|p| p.join("drive-web"))
}

fn store_drive_rect(left: f64, top: f64, width: f64, height: f64) {
    DRIVE_LAST_LEFT.store(left.to_bits(), Ordering::SeqCst);
    DRIVE_LAST_TOP.store(top.to_bits(), Ordering::SeqCst);
    DRIVE_LAST_WIDTH.store(width.to_bits(), Ordering::SeqCst);
    DRIVE_LAST_HEIGHT.store(height.to_bits(), Ordering::SeqCst);
}

fn load_drive_rect() -> (f64, f64, f64, f64) {
    (
        f64::from_bits(DRIVE_LAST_LEFT.load(Ordering::SeqCst)),
        f64::from_bits(DRIVE_LAST_TOP.load(Ordering::SeqCst)),
        f64::from_bits(DRIVE_LAST_WIDTH.load(Ordering::SeqCst)),
        f64::from_bits(DRIVE_LAST_HEIGHT.load(Ordering::SeqCst)),
    )
}

fn hide_drive_dock(app: &tauri::AppHandle) {
    DRIVE_WANT_VISIBLE.store(false, Ordering::SeqCst);
    if let Some(dock) = app.get_webview_window(DRIVE_DOCK_LABEL) {
        let _ = dock.hide();
    }
}

fn build_drive_dock(app: &tauri::AppHandle, url: &str) -> Result<tauri::WebviewWindow, String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| String::from("Ventana principal no encontrada"))?;
    let parsed: tauri::Url = url.parse().map_err(|e| format!("URL inválida: {e}"))?;
    let data_dir = drive_data_dir(app)?;
    let mut builder = WebviewWindowBuilder::new(app, DRIVE_DOCK_LABEL, WebviewUrl::External(parsed))
        .title("")
        .decorations(false)
        .visible(false)
        .focused(false)
        .skip_taskbar(true)
        .resizable(false)
        .always_on_top(false)
        .background_color(Color(255, 255, 255, 255))
        .user_agent(WA_CHROME_UA)
        .data_directory(data_dir)
        .enable_clipboard_access()
        .inner_size(320.0, 240.0)
        .on_page_load(|window, payload| {
            if payload.event() == PageLoadEvent::Finished && DRIVE_WANT_VISIBLE.load(Ordering::SeqCst) {
                let app = window.app_handle();
                if let (Some(main), Some(dock)) = (
                    app.get_webview_window("main"),
                    app.get_webview_window(DRIVE_DOCK_LABEL),
                ) {
                    let (l, t, w, h) = load_drive_rect();
                    if w >= 80.0 && h >= 80.0 {
                        let _ = position_dock_rect(&dock, &main, l, t, w, h);
                    }
                    let _ = dock.show();
                } else {
                    let _ = window.show();
                }
            }
        });
    #[cfg(debug_assertions)]
    {
        builder = builder.devtools(true);
    }
    #[cfg(windows)]
    {
        builder = builder.owner(&main).map_err(|e| format!("Owner Drive: {e}"))?;
    }
    #[cfg(all(not(windows), target_os = "macos"))]
    {
        builder = builder.parent(&main).map_err(|e| format!("Parent Drive: {e}"))?;
    }
    let dock = builder.build().map_err(|e| format!("Ventana Drive: {e}"))?;
    let _ = dock.hide();
    Ok(dock)
}

fn ensure_drive_dock(app: &tauri::AppHandle, url: &str) -> Result<tauri::WebviewWindow, String> {
    if let Some(dock) = app.get_webview_window(DRIVE_DOCK_LABEL) {
        return Ok(dock);
    }
    if DRIVE_DOCK_CREATING.swap(true, Ordering::SeqCst) {
        for _ in 0..40 {
            std::thread::sleep(std::time::Duration::from_millis(50));
            if let Some(dock) = app.get_webview_window(DRIVE_DOCK_LABEL) {
                DRIVE_DOCK_CREATING.store(false, Ordering::SeqCst);
                return Ok(dock);
            }
        }
        DRIVE_DOCK_CREATING.store(false, Ordering::SeqCst);
        return Err(String::from("Timeout creando ventana Drive"));
    }
    let result = build_drive_dock(app, url);
    DRIVE_DOCK_CREATING.store(false, Ordering::SeqCst);
    result
}

#[cfg(desktop)]
#[tauri::command]
pub async fn crozzo_drive_dock_sync(
    app: tauri::AppHandle,
    open: bool,
    left: f64,
    top: f64,
    width: f64,
    height: f64,
    url: Option<String>,
) -> Result<String, String> {
    if !open {
        hide_drive_dock(&app);
        return Ok(String::from("closed"));
    }
    hide_all_web_docks_except(&app, "drive");
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| String::from("Ventana principal no encontrada"))?;
    let (last_l, last_t, last_w, last_h) = load_drive_rect();
    let same_rect = (last_l - left).abs() < 0.5
        && (last_t - top).abs() < 0.5
        && (last_w - width).abs() < 0.5
        && (last_h - height).abs() < 0.5;
    store_drive_rect(left, top, width, height);
    let should_navigate = url.as_ref().is_some_and(|u| !u.trim().is_empty());
    let target_url = url
        .filter(|u| !u.trim().is_empty())
        .unwrap_or_else(|| String::from(DRIVE_DEFAULT_URL));
    validate_drive_url(&target_url)?;
    let dock = ensure_drive_dock(&app, &target_url)?;
    if !same_rect {
        position_dock_rect(&dock, &main, left, top, width, height)?;
    }
    DRIVE_WANT_VISIBLE.store(true, Ordering::SeqCst);
    if should_navigate {
        let want: tauri::Url = target_url.parse().map_err(|e| format!("URL Drive: {e}"))?;
        let needs_nav = dock
            .url()
            .ok()
            .map(|current| current.as_str() != want.as_str())
            .unwrap_or(true);
        if needs_nav {
            let _ = dock.hide();
            dock.navigate(want).map_err(|e| format!("Navigate Drive: {e}"))?;
        } else {
            dock.show().map_err(|e| e.to_string())?;
        }
    } else {
        dock.show().map_err(|e| e.to_string())?;
    }
    Ok(format!("open:{left:.0},{top:.0},{width:.0}x{height:.0}"))
}

#[cfg(not(desktop))]
#[tauri::command]
pub async fn crozzo_drive_dock_sync(
    _app: tauri::AppHandle,
    _open: bool,
    _left: f64,
    _top: f64,
    _width: f64,
    _height: f64,
    _url: Option<String>,
) -> Result<String, String> {
    Err(String::from("Drive embebido solo en escritorio"))
}

// ── Dataico dock ──

const DATAICO_DOCK_LABEL: &str = "crozzo-dataico-dock";
const DATAICO_DEFAULT_URL: &str = "https://app.dataico.com/login";

static DATAICO_DOCK_CREATING: AtomicBool = AtomicBool::new(false);
static DATAICO_WANT_VISIBLE: AtomicBool = AtomicBool::new(false);
static DATAICO_LAST_LEFT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static DATAICO_LAST_TOP: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static DATAICO_LAST_WIDTH: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static DATAICO_LAST_HEIGHT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn validate_dataico_url(url: &str) -> Result<&str, String> {
    let url = validate_external_url(url)?;
    if url.contains("dataico.com") {
        return Ok(url);
    }
    Err(String::from("Solo enlaces Dataico"))
}

fn dataico_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
        .map(|p| p.join("dataico-web"))
}

fn store_dataico_rect(left: f64, top: f64, width: f64, height: f64) {
    DATAICO_LAST_LEFT.store(left.to_bits(), Ordering::SeqCst);
    DATAICO_LAST_TOP.store(top.to_bits(), Ordering::SeqCst);
    DATAICO_LAST_WIDTH.store(width.to_bits(), Ordering::SeqCst);
    DATAICO_LAST_HEIGHT.store(height.to_bits(), Ordering::SeqCst);
}

fn load_dataico_rect() -> (f64, f64, f64, f64) {
    (
        f64::from_bits(DATAICO_LAST_LEFT.load(Ordering::SeqCst)),
        f64::from_bits(DATAICO_LAST_TOP.load(Ordering::SeqCst)),
        f64::from_bits(DATAICO_LAST_WIDTH.load(Ordering::SeqCst)),
        f64::from_bits(DATAICO_LAST_HEIGHT.load(Ordering::SeqCst)),
    )
}

fn hide_dataico_dock(app: &tauri::AppHandle) {
    DATAICO_WANT_VISIBLE.store(false, Ordering::SeqCst);
    if let Some(dock) = app.get_webview_window(DATAICO_DOCK_LABEL) {
        let _ = dock.hide();
    }
}

fn build_dataico_dock(app: &tauri::AppHandle, url: &str) -> Result<tauri::WebviewWindow, String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| String::from("Ventana principal no encontrada"))?;
    let parsed: tauri::Url = url.parse().map_err(|e| format!("URL inválida: {e}"))?;
    let data_dir = dataico_data_dir(app)?;
    let mut builder = WebviewWindowBuilder::new(app, DATAICO_DOCK_LABEL, WebviewUrl::External(parsed))
        .title("")
        .decorations(false)
        .visible(false)
        .focused(false)
        .skip_taskbar(true)
        .resizable(false)
        .always_on_top(false)
        .background_color(Color(255, 255, 255, 255))
        .user_agent(WA_CHROME_UA)
        .data_directory(data_dir)
        .enable_clipboard_access()
        .inner_size(320.0, 240.0)
        .on_page_load(|window, payload| {
            if payload.event() == PageLoadEvent::Finished && DATAICO_WANT_VISIBLE.load(Ordering::SeqCst) {
                let app = window.app_handle();
                if let (Some(main), Some(dock)) = (
                    app.get_webview_window("main"),
                    app.get_webview_window(DATAICO_DOCK_LABEL),
                ) {
                    let (l, t, w, h) = load_dataico_rect();
                    if w >= 80.0 && h >= 80.0 {
                        let _ = position_dock_rect(&dock, &main, l, t, w, h);
                    }
                    let _ = dock.show();
                } else {
                    let _ = window.show();
                }
            }
        });
    #[cfg(debug_assertions)]
    {
        builder = builder.devtools(true);
    }
    #[cfg(windows)]
    {
        builder = builder.owner(&main).map_err(|e| format!("Owner Dataico: {e}"))?;
    }
    #[cfg(all(not(windows), target_os = "macos"))]
    {
        builder = builder.parent(&main).map_err(|e| format!("Parent Dataico: {e}"))?;
    }
    let dock = builder.build().map_err(|e| format!("Ventana Dataico: {e}"))?;
    let _ = dock.hide();
    Ok(dock)
}

fn ensure_dataico_dock(app: &tauri::AppHandle, url: &str) -> Result<tauri::WebviewWindow, String> {
    if let Some(dock) = app.get_webview_window(DATAICO_DOCK_LABEL) {
        return Ok(dock);
    }
    if DATAICO_DOCK_CREATING.swap(true, Ordering::SeqCst) {
        for _ in 0..40 {
            std::thread::sleep(std::time::Duration::from_millis(50));
            if let Some(dock) = app.get_webview_window(DATAICO_DOCK_LABEL) {
                DATAICO_DOCK_CREATING.store(false, Ordering::SeqCst);
                return Ok(dock);
            }
        }
        DATAICO_DOCK_CREATING.store(false, Ordering::SeqCst);
        return Err(String::from("Timeout creando ventana Dataico"));
    }
    let result = build_dataico_dock(app, url);
    DATAICO_DOCK_CREATING.store(false, Ordering::SeqCst);
    result
}

#[cfg(desktop)]
#[tauri::command]
pub async fn crozzo_dataico_dock_sync(
    app: tauri::AppHandle,
    open: bool,
    left: f64,
    top: f64,
    width: f64,
    height: f64,
    url: Option<String>,
) -> Result<String, String> {
    if !open {
        hide_dataico_dock(&app);
        return Ok(String::from("closed"));
    }
    hide_all_web_docks_except(&app, "dataico");
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| String::from("Ventana principal no encontrada"))?;
    let (last_l, last_t, last_w, last_h) = load_dataico_rect();
    let same_rect = (last_l - left).abs() < 0.5
        && (last_t - top).abs() < 0.5
        && (last_w - width).abs() < 0.5
        && (last_h - height).abs() < 0.5;
    store_dataico_rect(left, top, width, height);
    let should_navigate = url.as_ref().is_some_and(|u| !u.trim().is_empty());
    let target_url = url
        .filter(|u| !u.trim().is_empty())
        .unwrap_or_else(|| String::from(DATAICO_DEFAULT_URL));
    validate_dataico_url(&target_url)?;
    let dock = ensure_dataico_dock(&app, &target_url)?;
    if !same_rect {
        position_dock_rect(&dock, &main, left, top, width, height)?;
    }
    DATAICO_WANT_VISIBLE.store(true, Ordering::SeqCst);
    if should_navigate {
        let want: tauri::Url = target_url.parse().map_err(|e| format!("URL Dataico: {e}"))?;
        let needs_nav = dock
            .url()
            .ok()
            .map(|current| current.as_str() != want.as_str())
            .unwrap_or(true);
        if needs_nav {
            let _ = dock.hide();
            dock.navigate(want).map_err(|e| format!("Navigate Dataico: {e}"))?;
        } else {
            dock.show().map_err(|e| e.to_string())?;
        }
    } else {
        dock.show().map_err(|e| e.to_string())?;
    }
    Ok(format!("open:{left:.0},{top:.0},{width:.0}x{height:.0}"))
}

#[cfg(not(desktop))]
#[tauri::command]
pub async fn crozzo_dataico_dock_sync(
    _app: tauri::AppHandle,
    _open: bool,
    _left: f64,
    _top: f64,
    _width: f64,
    _height: f64,
    _url: Option<String>,
) -> Result<String, String> {
    Err(String::from("Dataico embebido solo en escritorio"))
}

// ── DIAN VPFE dock (consulta CUFE) ──

const DIAN_VPFE_DOCK_LABEL: &str = "crozzo-dian-vpfe-dock";
const DIAN_VPFE_DEFAULT_URL: &str = "https://catalogo-vpfe.dian.gov.co/";

static DIAN_VPFE_DOCK_CREATING: AtomicBool = AtomicBool::new(false);
static DIAN_VPFE_WANT_VISIBLE: AtomicBool = AtomicBool::new(false);
static DIAN_VPFE_LAST_LEFT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static DIAN_VPFE_LAST_TOP: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static DIAN_VPFE_LAST_WIDTH: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static DIAN_VPFE_LAST_HEIGHT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn validate_dian_vpfe_url(url: &str) -> Result<&str, String> {
    let url = validate_external_url(url)?;
    if url.contains("dian.gov.co") {
        return Ok(url);
    }
    Err(String::from("Solo enlaces DIAN"))
}

fn dian_vpfe_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
        .map(|p| p.join("dian-vpfe-web"))
}

fn store_dian_vpfe_rect(left: f64, top: f64, width: f64, height: f64) {
    DIAN_VPFE_LAST_LEFT.store(left.to_bits(), Ordering::SeqCst);
    DIAN_VPFE_LAST_TOP.store(top.to_bits(), Ordering::SeqCst);
    DIAN_VPFE_LAST_WIDTH.store(width.to_bits(), Ordering::SeqCst);
    DIAN_VPFE_LAST_HEIGHT.store(height.to_bits(), Ordering::SeqCst);
}

fn load_dian_vpfe_rect() -> (f64, f64, f64, f64) {
    (
        f64::from_bits(DIAN_VPFE_LAST_LEFT.load(Ordering::SeqCst)),
        f64::from_bits(DIAN_VPFE_LAST_TOP.load(Ordering::SeqCst)),
        f64::from_bits(DIAN_VPFE_LAST_WIDTH.load(Ordering::SeqCst)),
        f64::from_bits(DIAN_VPFE_LAST_HEIGHT.load(Ordering::SeqCst)),
    )
}

fn hide_dian_vpfe_dock(app: &tauri::AppHandle) {
    DIAN_VPFE_WANT_VISIBLE.store(false, Ordering::SeqCst);
    if let Some(dock) = app.get_webview_window(DIAN_VPFE_DOCK_LABEL) {
        let _ = dock.hide();
    }
}

fn build_dian_vpfe_dock(app: &tauri::AppHandle, url: &str) -> Result<tauri::WebviewWindow, String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| String::from("Ventana principal no encontrada"))?;
    let parsed: tauri::Url = url.parse().map_err(|e| format!("URL inválida: {e}"))?;
    let data_dir = dian_vpfe_data_dir(app)?;
    let mut builder =
        WebviewWindowBuilder::new(app, DIAN_VPFE_DOCK_LABEL, WebviewUrl::External(parsed))
            .title("")
            .decorations(false)
            .visible(false)
            .focused(false)
            .skip_taskbar(true)
            .resizable(false)
            .always_on_top(false)
            .background_color(Color(255, 255, 255, 255))
            .user_agent(WA_CHROME_UA)
            .data_directory(data_dir)
            .enable_clipboard_access()
            .inner_size(320.0, 240.0)
            .on_page_load(|window, payload| {
                if payload.event() == PageLoadEvent::Finished
                    && DIAN_VPFE_WANT_VISIBLE.load(Ordering::SeqCst)
                {
                    let app = window.app_handle();
                    if let (Some(main), Some(dock)) = (
                        app.get_webview_window("main"),
                        app.get_webview_window(DIAN_VPFE_DOCK_LABEL),
                    ) {
                        let (l, t, w, h) = load_dian_vpfe_rect();
                        if w >= 80.0 && h >= 80.0 {
                            let _ = position_dock_rect(&dock, &main, l, t, w, h);
                        }
                        let _ = dock.show();
                    } else {
                        let _ = window.show();
                    }
                }
            });
    #[cfg(debug_assertions)]
    {
        builder = builder.devtools(true);
    }
    #[cfg(windows)]
    {
        builder = builder.owner(&main).map_err(|e| format!("Owner DIAN: {e}"))?;
    }
    #[cfg(all(not(windows), target_os = "macos"))]
    {
        builder = builder.parent(&main).map_err(|e| format!("Parent DIAN: {e}"))?;
    }
    let dock = builder.build().map_err(|e| format!("Ventana DIAN: {e}"))?;
    let _ = dock.hide();
    Ok(dock)
}

fn ensure_dian_vpfe_dock(app: &tauri::AppHandle, url: &str) -> Result<tauri::WebviewWindow, String> {
    if let Some(dock) = app.get_webview_window(DIAN_VPFE_DOCK_LABEL) {
        return Ok(dock);
    }
    if DIAN_VPFE_DOCK_CREATING.swap(true, Ordering::SeqCst) {
        for _ in 0..40 {
            std::thread::sleep(std::time::Duration::from_millis(50));
            if let Some(dock) = app.get_webview_window(DIAN_VPFE_DOCK_LABEL) {
                DIAN_VPFE_DOCK_CREATING.store(false, Ordering::SeqCst);
                return Ok(dock);
            }
        }
        DIAN_VPFE_DOCK_CREATING.store(false, Ordering::SeqCst);
        return Err(String::from("Timeout creando ventana DIAN"));
    }
    let result = build_dian_vpfe_dock(app, url);
    DIAN_VPFE_DOCK_CREATING.store(false, Ordering::SeqCst);
    result
}

#[cfg(desktop)]
#[tauri::command]
pub async fn crozzo_dian_vpfe_dock_sync(
    app: tauri::AppHandle,
    open: bool,
    left: f64,
    top: f64,
    width: f64,
    height: f64,
    url: Option<String>,
) -> Result<String, String> {
    if !open {
        hide_dian_vpfe_dock(&app);
        return Ok(String::from("closed"));
    }
    hide_all_web_docks_except(&app, "dian");
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| String::from("Ventana principal no encontrada"))?;
    let (last_l, last_t, last_w, last_h) = load_dian_vpfe_rect();
    let same_rect = (last_l - left).abs() < 0.5
        && (last_t - top).abs() < 0.5
        && (last_w - width).abs() < 0.5
        && (last_h - height).abs() < 0.5;
    store_dian_vpfe_rect(left, top, width, height);
    let should_navigate = url.as_ref().is_some_and(|u| !u.trim().is_empty());
    let target_url = url
        .filter(|u| !u.trim().is_empty())
        .unwrap_or_else(|| String::from(DIAN_VPFE_DEFAULT_URL));
    validate_dian_vpfe_url(&target_url)?;
    let dock = ensure_dian_vpfe_dock(&app, &target_url)?;
    if !same_rect {
        position_dock_rect(&dock, &main, left, top, width, height)?;
    }
    DIAN_VPFE_WANT_VISIBLE.store(true, Ordering::SeqCst);
    if should_navigate {
        let want: tauri::Url = target_url.parse().map_err(|e| format!("URL DIAN: {e}"))?;
        let needs_nav = dock
            .url()
            .ok()
            .map(|current| current.as_str() != want.as_str())
            .unwrap_or(true);
        if needs_nav {
            let _ = dock.hide();
            dock.navigate(want).map_err(|e| format!("Navigate DIAN: {e}"))?;
        } else {
            dock.show().map_err(|e| e.to_string())?;
        }
    } else {
        dock.show().map_err(|e| e.to_string())?;
    }
    Ok(format!("open:{left:.0},{top:.0},{width:.0}x{height:.0}"))
}

#[cfg(not(desktop))]
#[tauri::command]
pub async fn crozzo_dian_vpfe_dock_sync(
    _app: tauri::AppHandle,
    _open: bool,
    _left: f64,
    _top: f64,
    _width: f64,
    _height: f64,
    _url: Option<String>,
) -> Result<String, String> {
    Err(String::from("DIAN embebido solo en escritorio"))
}

// ── Spotify Web dock ──

const SPOTIFY_DOCK_LABEL: &str = "crozzo-spotify-dock";
const SPOTIFY_DEFAULT_URL: &str = "https://open.spotify.com/";

static SPOTIFY_DOCK_CREATING: AtomicBool = AtomicBool::new(false);
static SPOTIFY_WANT_VISIBLE: AtomicBool = AtomicBool::new(false);
static SPOTIFY_LAST_LEFT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static SPOTIFY_LAST_TOP: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static SPOTIFY_LAST_WIDTH: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static SPOTIFY_LAST_HEIGHT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn validate_spotify_url(url: &str) -> Result<&str, String> {
    let url = validate_external_url(url)?;
    if url.contains("spotify.com") {
        return Ok(url);
    }
    Err(String::from("Solo enlaces Spotify"))
}

fn spotify_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
        .map(|p| p.join("spotify-web"))
}

fn store_spotify_rect(left: f64, top: f64, width: f64, height: f64) {
    SPOTIFY_LAST_LEFT.store(left.to_bits(), Ordering::SeqCst);
    SPOTIFY_LAST_TOP.store(top.to_bits(), Ordering::SeqCst);
    SPOTIFY_LAST_WIDTH.store(width.to_bits(), Ordering::SeqCst);
    SPOTIFY_LAST_HEIGHT.store(height.to_bits(), Ordering::SeqCst);
}

fn load_spotify_rect() -> (f64, f64, f64, f64) {
    (
        f64::from_bits(SPOTIFY_LAST_LEFT.load(Ordering::SeqCst)),
        f64::from_bits(SPOTIFY_LAST_TOP.load(Ordering::SeqCst)),
        f64::from_bits(SPOTIFY_LAST_WIDTH.load(Ordering::SeqCst)),
        f64::from_bits(SPOTIFY_LAST_HEIGHT.load(Ordering::SeqCst)),
    )
}

fn hide_spotify_dock(app: &tauri::AppHandle) {
    SPOTIFY_WANT_VISIBLE.store(false, Ordering::SeqCst);
    if let Some(dock) = app.get_webview_window(SPOTIFY_DOCK_LABEL) {
        let _ = dock.hide();
    }
}

fn build_spotify_dock(app: &tauri::AppHandle, url: &str) -> Result<tauri::WebviewWindow, String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| String::from("Ventana principal no encontrada"))?;
    let parsed: tauri::Url = url.parse().map_err(|e| format!("URL inválida: {e}"))?;
    let data_dir = spotify_data_dir(app)?;
    let mut builder =
        WebviewWindowBuilder::new(app, SPOTIFY_DOCK_LABEL, WebviewUrl::External(parsed))
            .title("")
            .decorations(false)
            .visible(false)
            .focused(false)
            .skip_taskbar(true)
            .resizable(false)
            .always_on_top(false)
            .background_color(Color(255, 255, 255, 255))
            .user_agent(WA_CHROME_UA)
            .data_directory(data_dir)
            .enable_clipboard_access()
            .inner_size(320.0, 240.0)
            .on_page_load(|window, payload| {
                if payload.event() == PageLoadEvent::Finished
                    && SPOTIFY_WANT_VISIBLE.load(Ordering::SeqCst)
                {
                    let app = window.app_handle();
                    if let (Some(main), Some(dock)) = (
                        app.get_webview_window("main"),
                        app.get_webview_window(SPOTIFY_DOCK_LABEL),
                    ) {
                        let (l, t, w, h) = load_spotify_rect();
                        if w >= 80.0 && h >= 80.0 {
                            let _ = position_dock_rect(&dock, &main, l, t, w, h);
                        }
                        let _ = dock.show();
                    } else {
                        let _ = window.show();
                    }
                }
            });
    #[cfg(debug_assertions)]
    {
        builder = builder.devtools(true);
    }
    #[cfg(windows)]
    {
        builder = builder.owner(&main).map_err(|e| format!("Owner Spotify: {e}"))?;
    }
    #[cfg(all(not(windows), target_os = "macos"))]
    {
        builder = builder.parent(&main).map_err(|e| format!("Parent Spotify: {e}"))?;
    }
    let dock = builder.build().map_err(|e| format!("Ventana Spotify: {e}"))?;
    let _ = dock.hide();
    Ok(dock)
}

fn ensure_spotify_dock(app: &tauri::AppHandle, url: &str) -> Result<tauri::WebviewWindow, String> {
    if let Some(dock) = app.get_webview_window(SPOTIFY_DOCK_LABEL) {
        return Ok(dock);
    }
    if SPOTIFY_DOCK_CREATING.swap(true, Ordering::SeqCst) {
        for _ in 0..40 {
            std::thread::sleep(std::time::Duration::from_millis(50));
            if let Some(dock) = app.get_webview_window(SPOTIFY_DOCK_LABEL) {
                SPOTIFY_DOCK_CREATING.store(false, Ordering::SeqCst);
                return Ok(dock);
            }
        }
        SPOTIFY_DOCK_CREATING.store(false, Ordering::SeqCst);
        return Err(String::from("Timeout creando ventana Spotify"));
    }
    let result = build_spotify_dock(app, url);
    SPOTIFY_DOCK_CREATING.store(false, Ordering::SeqCst);
    result
}

#[cfg(desktop)]
#[tauri::command]
pub async fn crozzo_spotify_dock_sync(
    app: tauri::AppHandle,
    open: bool,
    left: f64,
    top: f64,
    width: f64,
    height: f64,
    url: Option<String>,
) -> Result<String, String> {
    if !open {
        hide_spotify_dock(&app);
        return Ok(String::from("closed"));
    }
    hide_all_web_docks_except(&app, "spotify");
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| String::from("Ventana principal no encontrada"))?;
    let (last_l, last_t, last_w, last_h) = load_spotify_rect();
    let same_rect = (last_l - left).abs() < 0.5
        && (last_t - top).abs() < 0.5
        && (last_w - width).abs() < 0.5
        && (last_h - height).abs() < 0.5;
    store_spotify_rect(left, top, width, height);
    let should_navigate = url.as_ref().is_some_and(|u| !u.trim().is_empty());
    let target_url = url
        .filter(|u| !u.trim().is_empty())
        .unwrap_or_else(|| String::from(SPOTIFY_DEFAULT_URL));
    validate_spotify_url(&target_url)?;
    let dock = ensure_spotify_dock(&app, &target_url)?;
    if !same_rect {
        position_dock_rect(&dock, &main, left, top, width, height)?;
    }
    SPOTIFY_WANT_VISIBLE.store(true, Ordering::SeqCst);
    if should_navigate {
        let want: tauri::Url = target_url.parse().map_err(|e| format!("URL Spotify: {e}"))?;
        let needs_nav = dock
            .url()
            .ok()
            .map(|current| current.as_str() != want.as_str())
            .unwrap_or(true);
        if needs_nav {
            let _ = dock.hide();
            dock.navigate(want).map_err(|e| format!("Navigate Spotify: {e}"))?;
        } else {
            dock.show().map_err(|e| e.to_string())?;
        }
    } else {
        dock.show().map_err(|e| e.to_string())?;
    }
    Ok(format!("open:{left:.0},{top:.0},{width:.0}x{height:.0}"))
}

#[cfg(not(desktop))]
#[tauri::command]
pub async fn crozzo_spotify_dock_sync(
    _app: tauri::AppHandle,
    _open: bool,
    _left: f64,
    _top: f64,
    _width: f64,
    _height: f64,
    _url: Option<String>,
) -> Result<String, String> {
    Err(String::from("Spotify embebido solo en escritorio"))
}
