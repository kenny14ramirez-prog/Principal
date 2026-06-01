//! Impresión HTML silenciosa (hojas inventario, carta) vía WebView2 Print API en Windows.

use super::CrozzoPrintResult;

#[cfg(windows)]
pub fn print_html_b64_sync(
    app: tauri::AppHandle,
    printer_name: String,
    html_b64: String,
    copies: u32,
    landscape: bool,
) -> Result<CrozzoPrintResult, String> {
    use base64::Engine;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::mpsc;
    use std::time::{Duration, Instant};
    use tauri::{Manager, Url, WebviewUrl, WebviewWindowBuilder};
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use webview2_com::{NavigationCompletedEventHandler, PrintCompletedHandler};
    use windows::core::{Interface, HSTRING};

    let html = String::from_utf8(
        base64::engine::general_purpose::STANDARD
            .decode(html_b64.trim())
            .map_err(|e| format!("HTML inválido (base64): {e}"))?,
    )
    .map_err(|e| format!("HTML inválido (utf-8): {e}"))?;

    let cache = app.path().cache_dir().map_err(|e| e.to_string())?;
    let label = format!(
        "crozzo-print-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );
    let file = cache.join(format!("{label}.html"));
    std::fs::write(&file, &html).map_err(|e| format!("No se guardó HTML temporal: {e}"))?;

    let file_path = file
        .canonicalize()
        .map_err(|e| format!("Ruta HTML: {e}"))?;
    let file_url_str = format!(
        "file:///{}",
        file_path.display().to_string().replace('\\', "/")
    );

    let target = super::resolve_printer_for_html(&printer_name)?;
    let copies = copies.max(1).min(5);

    let (tx, rx) = mpsc::sync_channel::<Result<String, String>>(1);
    let printed_once = std::sync::Arc::new(AtomicBool::new(false));

    let url = Url::parse(&file_url_str).map_err(|e| format!("URL impresión: {e}"))?;
    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(url))
        .title("Crozzo Print")
        .visible(false)
        .focused(false)
        .inner_size(900.0, 700.0)
        .decorations(false)
        .skip_taskbar(true)
        .build()
        .map_err(|e| format!("Ventana de impresión: {e}"))?;

    let printer_target = target.clone();
    let tx_setup = tx.clone();
    let printed_flag = printed_once.clone();

    window
        .with_webview(move |wv| {
            if let Err(e) = (|| -> Result<(), String> {
                unsafe {
                    let webview = wv.controller().CoreWebView2().map_err(|e| e.to_string())?;
                    let webview16: ICoreWebView2_16 = webview.cast().map_err(|_| {
                        String::from(
                            "WebView2 sin impresión silenciosa. Actualice Microsoft Edge WebView2 Runtime.",
                        )
                    })?;
                    let webview2: ICoreWebView2_2 = webview.cast().map_err(|e| e.to_string())?;
                    let env = webview2.Environment().map_err(|e| e.to_string())?;
                    let env6: ICoreWebView2Environment6 = env.cast().map_err(|_| {
                        String::from("CreatePrintSettings no disponible en este WebView2.")
                    })?;

                    let printer_w = HSTRING::from(printer_target.as_str());
                    let tx_done = tx_setup.clone();
                    let mut nav_token: i64 = 0;
                    let webview16_print = webview16.clone();
                    let env6_settings = env6.clone();
                    let printed_nav = printed_flag.clone();
                    let landscape_nav = landscape;

                    let handler = NavigationCompletedEventHandler::create(Box::new(
                        move |_sender, args| {
                            if printed_nav.swap(true, Ordering::SeqCst) {
                                return Ok(());
                            }
                            let Some(args) = args else {
                                return Ok(());
                            };
                            let mut success = windows::core::BOOL(0);
                            if args.IsSuccess(&mut success).is_err() || !success.as_bool() {
                                let _ = tx_done.send(Err(
                                    "No se cargó el documento para imprimir.".into(),
                                ));
                                return Ok(());
                            }

                            let settings = match env6_settings.CreatePrintSettings() {
                                Ok(s) => s,
                                Err(e) => {
                                    let _ =
                                        tx_done.send(Err(format!("PrintSettings: {e}")));
                                    return Ok(());
                                }
                            };
                            let settings2: ICoreWebView2PrintSettings2 = match settings.cast() {
                                Ok(s) => s,
                                Err(e) => {
                                    let _ = tx_done.send(Err(format!(
                                        "PrintSettings2 (nombre impresora): {e}"
                                    )));
                                    return Ok(());
                                }
                            };
                            let _ = settings2.SetPrinterName(&printer_w);
                            let _ = settings.SetShouldPrintBackgrounds(true);
                            let _ = settings.SetOrientation(if landscape_nav {
                                COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE
                            } else {
                                COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT
                            });

                            let tx_print = tx_done.clone();
                            let printer_msg = printer_target.clone();
                            let print_handler = PrintCompletedHandler::create(Box::new(
                                move |hr, status| {
                                    if hr.is_ok()
                                        && status == COREWEBVIEW2_PRINT_STATUS_SUCCEEDED
                                    {
                                        let _ = tx_print.send(Ok(format!(
                                            "Enviado a «{printer_msg}»"
                                        )));
                                    } else {
                                        let _ = tx_print.send(Err(format!(
                                            "Error al imprimir (estado {status:?})"
                                        )));
                                    }
                                    Ok(())
                                },
                            ));
                            if let Err(e) = webview16_print.Print(&settings, &print_handler) {
                                let _ = tx_done.send(Err(format!("Print: {e}")));
                            }
                            Ok(())
                        },
                    ));
                    webview
                        .add_NavigationCompleted(&handler, &mut nav_token)
                        .map_err(|e| e.to_string())?;
                }
                Ok(())
            })() {
                let _ = tx.send(Err(e));
            }
        })
        .map_err(|e| format!("WebView impresión: {e}"))?;

    window
        .navigate(Url::parse(&file_url_str).map_err(|e| e.to_string())?)
        .map_err(|e| format!("Navegar documento: {e}"))?;

    let deadline = Instant::now() + Duration::from_secs(90);
    let mut msg_ok: Option<String> = None;
    while Instant::now() < deadline {
        match rx.try_recv() {
            Ok(Ok(m)) => {
                msg_ok = Some(m);
                break;
            }
            Ok(Err(e)) => {
                let _ = window.close();
                let _ = std::fs::remove_file(&file);
                return Err(e);
            }
            Err(mpsc::TryRecvError::Empty) => {
                std::thread::sleep(Duration::from_millis(80));
            }
            Err(mpsc::TryRecvError::Disconnected) => break,
        }
    }

    let _ = window.close();
    let _ = std::fs::remove_file(&file);

    if let Some(msg) = msg_ok {
        Ok(CrozzoPrintResult {
            ok: true,
            message: format!("{msg} · {copies} copia(s)"),
        })
    } else {
        Err(
            "Tiempo agotado al imprimir. Revise que la impresora esté encendida y en Facturas e impresión."
                .into(),
        )
    }
}

#[cfg(not(windows))]
pub fn print_html_b64_sync(
    _app: tauri::AppHandle,
    _printer_name: String,
    _html_b64: String,
    _copies: u32,
    _landscape: bool,
) -> Result<CrozzoPrintResult, String> {
    Err("Impresión HTML silenciosa solo está disponible en Windows.".into())
}
