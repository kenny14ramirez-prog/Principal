//! Permisos de cámara/micrófono en WebView2 (Windows).
//! Sin esto, getUserMedia puede quedar en "Permission denied" aunque Windows ya autorizó la app.

#[cfg(windows)]
pub fn install_camera_permission_handler(window: &tauri::WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use webview2_com::PermissionRequestedEventHandler;

    let _ = window.with_webview(|wv| {
        unsafe {
            let Ok(webview) = wv.controller().CoreWebView2() else {
                return;
            };
            let mut token: i64 = 0;
            let _ = webview.add_PermissionRequested(
                &PermissionRequestedEventHandler::create(Box::new(|_, args| {
                    if let Some(args) = args {
                        let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
                        if args.PermissionKind(&mut kind).is_ok()
                            && (kind == COREWEBVIEW2_PERMISSION_KIND_CAMERA
                                || kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE)
                        {
                            let _ = args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW);
                        }
                    }
                    Ok(())
                })),
                &mut token,
            );
        }
    });
}

#[cfg(windows)]
#[tauri::command]
pub fn cxf_reset_webview_camera_permission(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use windows::core::{Interface, HSTRING};

    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Ventana principal no encontrada".to_string())?;

    window
        .with_webview(|wv| {
            if let Err(e) = (|| -> Result<(), String> {
                unsafe {
                    let webview = wv.controller().CoreWebView2().map_err(|e| e.to_string())?;
                    let webview13: ICoreWebView2_13 = webview.cast().map_err(|e| e.to_string())?;
                    let profile = webview13.Profile().map_err(|e| e.to_string())?;
                    let profile4: ICoreWebView2Profile4 = profile.cast().map_err(|e| e.to_string())?;
                    for origin in ["https://tauri.localhost", "http://tauri.localhost"] {
                        let origin = HSTRING::from(origin);
                        profile4
                            .SetPermissionState(
                                COREWEBVIEW2_PERMISSION_KIND_CAMERA,
                                &origin,
                                COREWEBVIEW2_PERMISSION_STATE_DEFAULT,
                                None,
                            )
                            .map_err(|e| e.to_string())?;
                    }
                }
                Ok(())
            })() {
                eprintln!("[CXF] reset camera permission: {e}");
            }
        })
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(not(windows))]
pub fn install_camera_permission_handler(_window: &tauri::WebviewWindow) {}

#[cfg(not(windows))]
#[tauri::command]
pub fn cxf_reset_webview_camera_permission(_app: tauri::AppHandle) -> Result<(), String> {
    Ok(())
}
