//! Permisos de cámara/micrófono en WebView2 (Windows).
//! ALLOW en perfil + handler: Windows Privacidad ya controla el SO; WebView2 no debe bloquear en silencio.
#[cfg(windows)]
const CAMERA_ORIGINS: &[&str] = &[
    "https://tauri.localhost",
    "http://tauri.localhost",
    "https://asset.localhost",
    "http://asset.localhost",
];

#[cfg(windows)]
fn apply_camera_profile_state(
    profile4: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Profile4,
    state: webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_PERMISSION_STATE,
) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use windows::core::HSTRING;

    unsafe {
        for origin in CAMERA_ORIGINS {
            let origin = HSTRING::from(*origin);
            profile4
                .SetPermissionState(COREWEBVIEW2_PERMISSION_KIND_CAMERA, &origin, state, None)
                .map_err(|e| e.to_string())?;
            profile4
                .SetPermissionState(COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, &origin, state, None)
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg(windows)]
use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(windows)]
static CAMERA_HANDLER_INSTALLED: AtomicBool = AtomicBool::new(false);

#[cfg(windows)]
pub fn install_camera_permission_handler(window: &tauri::WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use webview2_com::PermissionRequestedEventHandler;

    if CAMERA_HANDLER_INSTALLED.swap(true, Ordering::SeqCst) {
        return;
    }

    let _ = window.with_webview(|wv| {
        unsafe {
            let Ok(webview) = wv.controller().CoreWebView2() else {
                eprintln!("[CXF] camera handler: CoreWebView2 no disponible");
                return;
            };
            let mut token: i64 = 0;
            let hr = webview.add_PermissionRequested(
                &PermissionRequestedEventHandler::create(Box::new(|_, args| {
                    if let Some(args) = args {
                        let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
                        if args.PermissionKind(&mut kind).is_ok()
                            && (kind == COREWEBVIEW2_PERMISSION_KIND_CAMERA
                                || kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE)
                        {
                            // ALLOW: Windows ya tiene privacidad activa; WebView2 debe conceder sin bloquear.
                            let _ = args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW);
                        }
                    }
                    Ok(())
                })),
                &mut token,
            );
            if hr.is_err() {
                eprintln!("[CXF] camera handler: add_PermissionRequested falló");
            } else {
                eprintln!("[CXF] camera handler: PermissionRequested registrado");
            }
        }
    });
}

#[cfg(windows)]
fn reset_webview_camera_profile(window: &tauri::WebviewWindow) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use windows::core::Interface;

    window
        .with_webview(|wv| {
            if let Err(e) = (|| -> Result<(), String> {
                unsafe {
                    let webview = wv.controller().CoreWebView2().map_err(|e| e.to_string())?;
                    let webview13: ICoreWebView2_13 = webview.cast().map_err(|e| e.to_string())?;
                    let profile = webview13.Profile().map_err(|e| e.to_string())?;
                    let profile4: ICoreWebView2Profile4 = profile.cast().map_err(|e| e.to_string())?;
                    apply_camera_profile_state(&profile4, COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                }
                Ok(())
            })() {
                eprintln!("[CXF] reset camera permission: {e}");
            }
        })
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(windows)]
#[tauri::command]
pub fn cxf_reset_webview_camera_permission(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;

    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Ventana principal no encontrada".to_string())?;

    reset_webview_camera_profile(&window)
}

#[cfg(windows)]
#[tauri::command]
pub fn cxf_open_windows_camera_settings(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    app.opener()
        .open_url("ms-settings:privacy-webcam", None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(not(windows))]
pub fn install_camera_permission_handler(_window: &tauri::WebviewWindow) {}

#[cfg(not(windows))]
#[tauri::command]
pub fn cxf_reset_webview_camera_permission(_app: tauri::AppHandle) -> Result<(), String> {
    Ok(())
}

#[cfg(not(windows))]
#[tauri::command]
pub fn cxf_open_windows_camera_settings(_app: tauri::AppHandle) -> Result<(), String> {
    Ok(())
}
