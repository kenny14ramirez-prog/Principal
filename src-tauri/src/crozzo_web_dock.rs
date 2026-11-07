//! Web Dock V2 - 2 instancias (media + nav) con consumo minimo.
//!
//! Creado de forma perezosa, destruido al cerrar, suspendido al ocultar.
//! No usa std::thread::sleep en comandos async (evita bloqueo del runtime).

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::webview::{Color, PageLoadEvent};
use tauri::{
    LogicalSize, Manager, PhysicalPosition, Position, Size, WebviewUrl, WebviewWindowBuilder,
};

const WEB_DOCK_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const WEB_DOCK_MOBILE_UA: &str =
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

// =========================================================================
// MEDIA SLOT (Spotify / YouTube)
// =========================================================================

const MEDIA_DOCK_LABEL: &str = "crozzo-web-media-dock";
static MEDIA_CREATING: AtomicBool = AtomicBool::new(false);
static MEDIA_WANT_VISIBLE: AtomicBool = AtomicBool::new(false);
static MEDIA_LAST_LEFT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static MEDIA_LAST_TOP: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static MEDIA_LAST_WIDTH: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static MEDIA_LAST_HEIGHT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn media_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
        .map(|p| p.join("web-media-dock"))
}

fn store_media_rect(left: f64, top: f64, width: f64, height: f64) {
    MEDIA_LAST_LEFT.store(left.to_bits(), Ordering::SeqCst);
    MEDIA_LAST_TOP.store(top.to_bits(), Ordering::SeqCst);
    MEDIA_LAST_WIDTH.store(width.to_bits(), Ordering::SeqCst);
    MEDIA_LAST_HEIGHT.store(height.to_bits(), Ordering::SeqCst);
}

fn load_media_rect() -> (f64, f64, f64, f64) {
    (
        f64::from_bits(MEDIA_LAST_LEFT.load(Ordering::SeqCst)),
        f64::from_bits(MEDIA_LAST_TOP.load(Ordering::SeqCst)),
        f64::from_bits(MEDIA_LAST_WIDTH.load(Ordering::SeqCst)),
        f64::from_bits(MEDIA_LAST_HEIGHT.load(Ordering::SeqCst)),
    )
}

fn hide_media_dock(app: &tauri::AppHandle) {
    MEDIA_WANT_VISIBLE.store(false, Ordering::SeqCst);
    if let Some(dock) = app.get_webview_window(MEDIA_DOCK_LABEL) {
        let _ = dock.hide();
    }
}

fn validate_media_url(url: &str) -> Result<&str, String> {
    let url = url.trim();
    if url.is_empty() {
        return Err(String::from("URL vacia"));
    }
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err(String::from("Protocolo no permitido"));
    }
    // Solo medios permitidos
    if url.contains("spotify.com") || url.contains("youtube.com") || url.contains("youtu.be") {
        return Ok(url);
    }
    Err(String::from("Dominio no permitido (solo Spotify/YouTube)"))
}

fn build_media_dock(app: &tauri::AppHandle, url: &str) -> Result<tauri::WebviewWindow, String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| String::from("Ventana principal no encontrada"))?;
    let parsed: tauri::Url = url.parse().map_err(|e| format!("URL invalida: {e}"))?;
    let data_dir = media_data_dir(app)?;
    let mut builder = WebviewWindowBuilder::new(app, MEDIA_DOCK_LABEL, WebviewUrl::External(parsed))
        .title("")
        .visible(false)
        .focused(false)
        .skip_taskbar(true)
        .resizable(false)
        .always_on_top(false)
        .decorations(false)
        .background_color(Color(255, 255, 255, 255))
        .user_agent(WEB_DOCK_MOBILE_UA)
        .data_directory(data_dir)
        .enable_clipboard_access()
        .inner_size(320.0, 240.0)
        .on_page_load(|window, payload| {
            if payload.event() == PageLoadEvent::Finished
                && MEDIA_WANT_VISIBLE.load(Ordering::SeqCst)
            {
                let app = window.app_handle();
                if let (Some(main), Some(dock)) = (
                    app.get_webview_window("main"),
                    app.get_webview_window(MEDIA_DOCK_LABEL),
                ) {
                    let (l, t, w, h) = load_media_rect();
                    if w >= 80.0 && h >= 80.0 {
                        let scale = main.scale_factor().unwrap_or(1.0);
                        let inner = main.inner_position().unwrap_or(tauri::PhysicalPosition { x: 0, y: 0 });
                        let px = inner.x + (l * scale).round() as i32;
                        let py = inner.y + (t * scale).round() as i32;
                        let _ = dock.set_size(Size::Logical(LogicalSize::new(w.max(80.0), h.max(80.0))));
                        let _ = dock.set_position(Position::Physical(PhysicalPosition::new(px, py)));
                    }
                    let _ = dock.show();
                }
            }
        });

    #[cfg(debug_assertions)]
    {
        builder = builder.devtools(true);
    }
    #[cfg(windows)]
    {
        builder = builder.owner(&main).map_err(|e| format!("Owner media: {e}"))?;
    }
    #[cfg(all(not(windows), target_os = "macos"))]
    {
        builder = builder.parent(&main).map_err(|e| format!("Parent media: {e}"))?;
    }

    let dock = builder.build().map_err(|e| format!("Ventana media: {e}"))?;
    let _ = dock.hide();
    Ok(dock)
}

fn ensure_media_dock(app: &tauri::AppHandle, url: &str) -> Result<tauri::WebviewWindow, String> {
    if let Some(dock) = app.get_webview_window(MEDIA_DOCK_LABEL) {
        return Ok(dock);
    }
    if MEDIA_CREATING.swap(true, Ordering::SeqCst) {
        // Esperar sin bloquear el runtime: dormir en hilo dedicado
        for _ in 0..20 {
            std::thread::sleep(std::time::Duration::from_millis(50));
            if let Some(dock) = app.get_webview_window(MEDIA_DOCK_LABEL) {
                MEDIA_CREATING.store(false, Ordering::SeqCst);
                return Ok(dock);
            }
        }
        MEDIA_CREATING.store(false, Ordering::SeqCst);
        return Err(String::from("Timeout creando ventana media"));
    }
    let result = build_media_dock(app, url);
    MEDIA_CREATING.store(false, Ordering::SeqCst);
    result
}

// =========================================================================
// NAV SLOT (navegacion general: Dataico, DIAN, Gmail, Drive, etc.)
// =========================================================================

const NAV_DOCK_LABEL: &str = "crozzo-web-nav-dock";
static NAV_CREATING: AtomicBool = AtomicBool::new(false);
static NAV_WANT_VISIBLE: AtomicBool = AtomicBool::new(false);
static NAV_LAST_LEFT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static NAV_LAST_TOP: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static NAV_LAST_WIDTH: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static NAV_LAST_HEIGHT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn nav_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
        .map(|p| p.join("web-nav-dock"))
}

fn store_nav_rect(left: f64, top: f64, width: f64, height: f64) {
    NAV_LAST_LEFT.store(left.to_bits(), Ordering::SeqCst);
    NAV_LAST_TOP.store(top.to_bits(), Ordering::SeqCst);
    NAV_LAST_WIDTH.store(width.to_bits(), Ordering::SeqCst);
    NAV_LAST_HEIGHT.store(height.to_bits(), Ordering::SeqCst);
}

fn load_nav_rect() -> (f64, f64, f64, f64) {
    (
        f64::from_bits(NAV_LAST_LEFT.load(Ordering::SeqCst)),
        f64::from_bits(NAV_LAST_TOP.load(Ordering::SeqCst)),
        f64::from_bits(NAV_LAST_WIDTH.load(Ordering::SeqCst)),
        f64::from_bits(NAV_LAST_HEIGHT.load(Ordering::SeqCst)),
    )
}

fn hide_nav_dock(app: &tauri::AppHandle) {
    NAV_WANT_VISIBLE.store(false, Ordering::SeqCst);
    if let Some(dock) = app.get_webview_window(NAV_DOCK_LABEL) {
        let _ = dock.hide();
    }
}

fn validate_nav_url(url: &str) -> Result<&str, String> {
    let url = url.trim();
    if url.is_empty() {
        return Err(String::from("URL vacia"));
    }
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err(String::from("Protocolo no permitido"));
    }
    Ok(url)
}

fn build_nav_dock(app: &tauri::AppHandle, url: &str) -> Result<tauri::WebviewWindow, String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| String::from("Ventana principal no encontrada"))?;
    let parsed: tauri::Url = url.parse().map_err(|e| format!("URL invalida: {e}"))?;
    let data_dir = nav_data_dir(app)?;
    let mut builder = WebviewWindowBuilder::new(app, NAV_DOCK_LABEL, WebviewUrl::External(parsed))
        .title("")
        .visible(false)
        .focused(false)
        .skip_taskbar(true)
        .resizable(false)
        .always_on_top(false)
        .decorations(false)
        .background_color(Color(255, 255, 255, 255))
        .user_agent(WEB_DOCK_UA)
        .data_directory(data_dir)
        .enable_clipboard_access()
        .inner_size(320.0, 240.0)
        .on_page_load(|window, payload| {
            if payload.event() == PageLoadEvent::Finished && NAV_WANT_VISIBLE.load(Ordering::SeqCst) {
                let app = window.app_handle();
                if let (Some(main), Some(dock)) = (
                    app.get_webview_window("main"),
                    app.get_webview_window(NAV_DOCK_LABEL),
                ) {
                    let (l, t, w, h) = load_nav_rect();
                    if w >= 80.0 && h >= 80.0 {
                        let scale = main.scale_factor().unwrap_or(1.0);
                        let inner = main.inner_position().unwrap_or(tauri::PhysicalPosition { x: 0, y: 0 });
                        let px = inner.x + (l * scale).round() as i32;
                        let py = inner.y + (t * scale).round() as i32;
                        let _ = dock.set_size(Size::Logical(LogicalSize::new(w.max(80.0), h.max(80.0))));
                        let _ = dock.set_position(Position::Physical(PhysicalPosition::new(px, py)));
                    }
                    let _ = dock.show();
                }
            }
        });

    #[cfg(debug_assertions)]
    {
        builder = builder.devtools(true);
    }
    #[cfg(windows)]
    {
        builder = builder.owner(&main).map_err(|e| format!("Owner nav: {e}"))?;
    }
    #[cfg(all(not(windows), target_os = "macos"))]
    {
        builder = builder.parent(&main).map_err(|e| format!("Parent nav: {e}"))?;
    }

    let dock = builder.build().map_err(|e| format!("Ventana nav: {e}"))?;
    let _ = dock.hide();
    Ok(dock)
}

fn ensure_nav_dock(app: &tauri::AppHandle, url: &str) -> Result<tauri::WebviewWindow, String> {
    if let Some(dock) = app.get_webview_window(NAV_DOCK_LABEL) {
        return Ok(dock);
    }
    if NAV_CREATING.swap(true, Ordering::SeqCst) {
        for _ in 0..20 {
            std::thread::sleep(std::time::Duration::from_millis(50));
            if let Some(dock) = app.get_webview_window(NAV_DOCK_LABEL) {
                NAV_CREATING.store(false, Ordering::SeqCst);
                return Ok(dock);
            }
        }
        NAV_CREATING.store(false, Ordering::SeqCst);
        return Err(String::from("Timeout creando ventana nav"));
    }
    let result = build_nav_dock(app, url);
    NAV_CREATING.store(false, Ordering::SeqCst);
    result
}

// =========================================================================
// COMANDOS PUBLICOS
// =========================================================================

#[cfg(desktop)]
#[tauri::command]
pub async fn crozzo_web_dock_create(
    app: tauri::AppHandle,
    slot: String,
    url: String,
    left: f64,
    top: f64,
    width: f64,
    height: f64,
) -> Result<String, String> {
    let (_label, validate) = match slot.as_str() {
        "media" => (MEDIA_DOCK_LABEL, validate_media_url(&url)?),
        "nav" => (NAV_DOCK_LABEL, validate_nav_url(&url)?),
        _ => return Err(format!("Slot desconocido: {slot}")),
    };
    let _ = validate;

    // Guardar rect segun slot
    match slot.as_str() {
        "media" => store_media_rect(left, top, width, height),
        "nav" => store_nav_rect(left, top, width, height),
        _ => {}
    }

    match slot.as_str() {
        "media" => MEDIA_WANT_VISIBLE.store(true, Ordering::SeqCst),
        "nav" => NAV_WANT_VISIBLE.store(true, Ordering::SeqCst),
        _ => {}
    }

    let target_url = url;
    let dock = match slot.as_str() {
        "media" => ensure_media_dock(&app, &target_url)?,
        "nav" => ensure_nav_dock(&app, &target_url)?,
        _ => return Err(format!("Slot desconocido: {slot}")),
    };

    let main = app
        .get_webview_window("main")
        .ok_or_else(|| String::from("Ventana principal no encontrada"))?;

    // Posicionar
    if slot == "media" {
        let (l, t, w, h) = load_media_rect();
        if w >= 80.0 && h >= 80.0 {
            let scale = main.scale_factor().unwrap_or(1.0);
            let inner = main.inner_position().unwrap_or(tauri::PhysicalPosition { x: 0, y: 0 });
            let px = inner.x + (l * scale).round() as i32;
            let py = inner.y + (t * scale).round() as i32;
            let _ = dock.set_size(Size::Logical(LogicalSize::new(w.max(80.0), h.max(80.0))));
            let _ = dock.set_position(Position::Physical(PhysicalPosition::new(px, py)));
        }
    } else {
        let (l, t, w, h) = load_nav_rect();
        if w >= 80.0 && h >= 80.0 {
            let scale = main.scale_factor().unwrap_or(1.0);
            let inner = main.inner_position().unwrap_or(tauri::PhysicalPosition { x: 0, y: 0 });
            let px = inner.x + (l * scale).round() as i32;
            let py = inner.y + (t * scale).round() as i32;
            let _ = dock.set_size(Size::Logical(LogicalSize::new(w.max(80.0), h.max(80.0))));
            let _ = dock.set_position(Position::Physical(PhysicalPosition::new(px, py)));
        }
    }

    // Navegar si es necesario
    let want: tauri::Url = target_url.parse().map_err(|e| format!("URL: {e}"))?;
    let needs_nav = dock
        .url()
        .ok()
        .map(|current| current.as_str() != want.as_str())
        .unwrap_or(true);
    if needs_nav {
        let _ = dock.hide();
        dock.navigate(want).map_err(|e| format!("Navigate: {e}"))?;
    }

    // Mostrar (sin delay de 2s: mostrar inmediatamente tras posicion)
    let _ = dock.show();

    Ok(format!("created:{slot}:{left:.0},{top:.0},{width:.0}x{height:.0}"))
}

#[cfg(desktop)]
#[tauri::command]
pub async fn crozzo_web_dock_navigate(
    app: tauri::AppHandle,
    slot: String,
    url: String,
) -> Result<String, String> {
    let label = match slot.as_str() {
        "media" => MEDIA_DOCK_LABEL,
        "nav" => NAV_DOCK_LABEL,
        _ => return Err(format!("Slot desconocido: {slot}")),
    };
    let validate = match slot.as_str() {
        "media" => validate_media_url(&url)?,
        "nav" => validate_nav_url(&url)?,
        _ => return Err(format!("Slot desconocido: {slot}")),
    };
    let _ = validate;

    let dock = app
        .get_webview_window(label)
        .ok_or_else(|| format!("Dock {label} no existe"))?;

    let want: tauri::Url = url.parse().map_err(|e| format!("URL: {e}"))?;
    let _ = dock.hide();
    dock.navigate(want).map_err(|e| format!("Navigate: {e}"))?;
    let _ = dock.show();

    Ok(format!("navigated:{slot}:{url}"))
}

#[cfg(desktop)]
#[tauri::command]
pub async fn crozzo_web_dock_destroy(
    app: tauri::AppHandle,
    slot: String,
) -> Result<String, String> {
    let label = match slot.as_str() {
        "media" => MEDIA_DOCK_LABEL,
        "nav" => NAV_DOCK_LABEL,
        _ => return Err(format!("Slot desconocido: {slot}")),
    };
    match slot.as_str() {
        "media" => MEDIA_WANT_VISIBLE.store(false, Ordering::SeqCst),
        "nav" => NAV_WANT_VISIBLE.store(false, Ordering::SeqCst),
        _ => {}
    }
    if let Some(dock) = app.get_webview_window(label) {
        let _ = dock.hide();
        let _ = dock.close();
    }
    Ok(format!("destroyed:{slot}"))
}

#[cfg(desktop)]
#[tauri::command]
pub async fn crozzo_web_dock_hide(
    app: tauri::AppHandle,
    slot: String,
) -> Result<String, String> {
    match slot.as_str() {
        "media" => hide_media_dock(&app),
        "nav" => hide_nav_dock(&app),
        _ => return Err(format!("Slot desconocido: {slot}")),
    }
    Ok(format!("hidden:{slot}"))
}

#[cfg(not(desktop))]
#[tauri::command]
pub async fn crozzo_web_dock_create(
    _app: tauri::AppHandle,
    _slot: String,
    _url: String,
    _left: f64,
    _top: f64,
    _width: f64,
    _height: f64,
) -> Result<String, String> {
    Err(String::from("Web dock solo en escritorio"))
}

#[cfg(not(desktop))]
#[tauri::command]
pub async fn crozzo_web_dock_navigate(
    _app: tauri::AppHandle,
    _slot: String,
    _url: String,
) -> Result<String, String> {
    Err(String::from("Web dock solo en escritorio"))
}

#[cfg(not(desktop))]
#[tauri::command]
pub async fn crozzo_web_dock_destroy(
    _app: tauri::AppHandle,
    _slot: String,
) -> Result<String, String> {
    Err(String::from("Web dock solo en escritorio"))
}

#[cfg(desktop)]
#[tauri::command]
pub async fn crozzo_web_dock_set_zoom(
    app: tauri::AppHandle,
    slot: String,
    zoom: f64,
) -> Result<String, String> {
    let label = match slot.as_str() {
        "media" => MEDIA_DOCK_LABEL,
        "nav" => NAV_DOCK_LABEL,
        _ => return Err(format!("Slot desconocido: {slot}")),
    };
    let dock = app
        .get_webview_window(label)
        .ok_or_else(|| format!("Dock {label} no existe"))?;
    let z = if zoom.is_finite() {
        zoom.clamp(0.5, 2.0)
    } else {
        1.0
    };
    dock.set_zoom(z).map_err(|e| e.to_string())?;
    Ok(format!("zoom:{slot}:{z}"))
}

#[cfg(not(desktop))]
#[tauri::command]
pub async fn crozzo_web_dock_set_zoom(
    _app: tauri::AppHandle,
    _slot: String,
    _zoom: f64,
) -> Result<String, String> {
    Err(String::from("Web dock solo en escritorio"))
}

#[cfg(not(desktop))]
#[tauri::command]
pub async fn crozzo_web_dock_hide(
    _app: tauri::AppHandle,
    _slot: String,
) -> Result<String, String> {
    Err(String::from("Web dock solo en escritorio"))
}
