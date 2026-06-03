// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod crm_registro_server;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod crozzo_emulation;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod crozzo_print;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod crozzo_http;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod crozzo_silent_install;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod dian_adquiriente;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod dian_vpfe;
mod webview_permissions;

#[cfg(desktop)]
use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg(desktop)]
#[tauri::command]
fn crozzo_open_devtools(app: tauri::AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "Ventana principal no encontrada".to_string())?;
    win.open_devtools();
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init());

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .setup(|app| {
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_emulation::init_from_env();
            #[cfg(desktop)]
            {
                if let Some(win) = app.get_webview_window("main") {
                    webview_permissions::install_camera_permission_handler(&win);
                }
            }
            #[cfg(not(desktop))]
            let _ = &app;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            #[cfg(desktop)]
            crozzo_open_devtools,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_print::crozzo_list_printers,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_print::crozzo_get_default_printer,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_print::crozzo_print_raw,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_print::crozzo_print_raw_b64,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_print::crozzo_print_html_b64,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_http::crozzo_http_get_text,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_http::crozzo_http_head,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_silent_install::install_setup_from_url,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_silent_install::install_dmg_from_url,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_silent_install::probe_platform_installer,
            webview_permissions::cxf_reset_webview_camera_permission,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            dian_vpfe::fetch_dian_vpfe,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            dian_adquiriente::fetch_dian_adquiriente,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crm_registro_server::crm_registro_start,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crm_registro_server::crm_registro_stop,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crm_registro_server::crm_registro_status,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crm_registro_server::crm_registro_drain_pending,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crm_registro_server::crm_registro_push_pending,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_emulation::crozzo_emulation_set_active,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_emulation::crozzo_emulation_status,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_emulation::crozzo_emulation_reset_db,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_emulation::crozzo_emulation_log_action,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_emulation::crozzo_emulation_query_sql
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
