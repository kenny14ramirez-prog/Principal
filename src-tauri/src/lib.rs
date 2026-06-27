// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod crozzo_lan_sync_server;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod crozzo_lan_ws;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod crozzo_mdns;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod crozzo_emulation;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod crozzo_print;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod crozzo_http;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod crozzo_hotspot;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod crozzo_silent_install;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod dian_adquiriente;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod dian_vpfe;
mod webview_permissions;
mod crozzo_external;
#[cfg(target_os = "android")]
mod crozzo_android_install;
mod crozzo_ble_mesh;
mod crozzo_gossip_udp;

#[cfg(desktop)]
use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg(desktop)]
#[tauri::command]
fn crozzo_open_devtools(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        win.open_devtools();
        return Ok(());
    }
    let wins = app.webview_windows();
    if let Some(win) = wins.into_values().next() {
        win.open_devtools();
        return Ok(());
    }
    Err("No hay ventana WebView disponible".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init());

    #[cfg(any(target_os = "android", target_os = "ios"))]
    let builder = builder.plugin(tauri_plugin_barcode_scanner::init());

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .setup(|app| {
            #[cfg(target_os = "android")]
            {
                app.handle()
                    .plugin(tauri_plugin_android_package_install::init())
                    .map_err(|e| e.to_string())?;
            }
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_emulation::init_from_env();
            #[cfg(desktop)]
            {
                if let Some(win) = app.get_webview_window("main") {
                    webview_permissions::install_camera_permission_handler(&win);
                }
                crozzo_external::close_legacy_whatsapp_windows(app.handle());
                let warm = app.handle().clone();
                std::thread::spawn(move || {
                    crozzo_external::prewarm_whatsapp_dock(&warm);
                });
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
            crozzo_print::crozzo_html_to_pdf_b64,
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
            webview_permissions::cxf_open_windows_camera_settings,
    crozzo_external::crozzo_open_external_url,
    crozzo_external::crozzo_open_whatsapp_web,
    crozzo_external::crozzo_whatsapp_dock_sync,
    crozzo_external::crozzo_gmail_dock_sync,
    crozzo_external::crozzo_drive_dock_sync,
    crozzo_external::crozzo_dataico_dock_sync,
    crozzo_external::crozzo_dian_vpfe_dock_sync,
    crozzo_external::crozzo_spotify_dock_sync,
            #[cfg(target_os = "android")]
            crozzo_android_install::crozzo_android_download_apk,
            #[cfg(target_os = "android")]
            crozzo_android_install::crozzo_android_probe_updater,
            crozzo_ble_mesh::crozzo_ble_mesh_start,
            crozzo_ble_mesh::crozzo_ble_mesh_stop,
            crozzo_ble_mesh::crozzo_ble_mesh_send,
            crozzo_ble_mesh::crozzo_ble_mesh_drain,
            crozzo_ble_mesh::crozzo_ble_mesh_status,
            crozzo_ble_mesh::crozzo_ble_mesh_request_enable,
            crozzo_gossip_udp::crozzo_gossip_udp_start,
            crozzo_gossip_udp::crozzo_gossip_udp_stop,
            crozzo_gossip_udp::crozzo_gossip_udp_send,
            crozzo_gossip_udp::crozzo_gossip_udp_drain,
            crozzo_gossip_udp::crozzo_gossip_udp_status,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            dian_vpfe::fetch_dian_vpfe,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            dian_adquiriente::fetch_dian_adquiriente,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_lan_sync_server::crozzo_lan_sync_start,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_lan_sync_server::crozzo_lan_sync_update_pairing_cloud,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_lan_sync_server::crozzo_lan_sync_stop,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_lan_sync_server::crozzo_lan_sync_status,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_lan_sync_server::crozzo_lan_sync_drain_pending,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_lan_sync_server::crozzo_lan_sync_ack,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_lan_sync_server::crozzo_lan_sync_health,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_lan_sync_server::crozzo_lan_sync_post,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_hotspot::crozzo_hotspot_start,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_hotspot::crozzo_hotspot_stop,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_hotspot::crozzo_hotspot_status,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_lan_ws::crozzo_lan_ws_start,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_lan_ws::crozzo_lan_ws_stop,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_lan_ws::crozzo_lan_ws_status,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_lan_ws::crozzo_lan_ws_broadcast,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_mdns::crozzo_mdns_start_advertise,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_mdns::crozzo_mdns_start_browse,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_mdns::crozzo_mdns_stop,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_mdns::crozzo_mdns_drain_discovered,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            crozzo_mdns::crozzo_guess_local_ipv4,
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
