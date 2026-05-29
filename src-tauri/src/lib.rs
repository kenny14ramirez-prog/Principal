// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

mod crozzo_silent_install;
mod webview_permissions;

use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(win) = app.get_webview_window("main") {
                webview_permissions::install_camera_permission_handler(&win);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            crozzo_silent_install::install_setup_from_url,
            webview_permissions::cxf_reset_webview_camera_permission
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
