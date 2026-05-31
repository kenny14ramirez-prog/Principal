// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

mod crm_registro_server;
mod crozzo_print;
mod crozzo_silent_install;
mod dian_adquiriente;
mod dian_vpfe;
mod webview_permissions;

use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
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
            #[cfg(desktop)]
            if let Some(win) = app.get_webview_window("main") {
                webview_permissions::install_camera_permission_handler(&win);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            crozzo_print::crozzo_list_printers,
            crozzo_print::crozzo_get_default_printer,
            crozzo_print::crozzo_print_raw,
            crozzo_silent_install::install_setup_from_url,
            crozzo_silent_install::install_dmg_from_url,
            crozzo_silent_install::probe_platform_installer,
            webview_permissions::cxf_reset_webview_camera_permission,
            dian_vpfe::fetch_dian_vpfe,
            dian_adquiriente::fetch_dian_adquiriente,
            crm_registro_server::crm_registro_start,
            crm_registro_server::crm_registro_stop,
            crm_registro_server::crm_registro_status,
            crm_registro_server::crm_registro_drain_pending,
            crm_registro_server::crm_registro_push_pending
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
