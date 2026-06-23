// Exportar HTML a PDF (oficio/carta) via WebView2 PrintToPdf en Windows.

use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize)]
pub struct CrozzoHtmlPdfResult {
    pub ok: bool,
    pub pdf_b64: String,
    pub saved_path: String,
    pub message: String,
}

fn sanitize_pdf_filename(name: &str) -> String {
    let cleaned: String = name
        .trim()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if cleaned.is_empty() {
        return String::from("comprobante.pdf");
    }
    if cleaned.to_lowercase().ends_with(".pdf") {
        cleaned
    } else {
        format!("{cleaned}.pdf")
    }
}

fn resolve_downloads_dir(app: &AppHandle) -> PathBuf {
    if let Ok(d) = app.path().download_dir() {
        return d;
    }
    #[cfg(windows)]
    if let Ok(home) = std::env::var("USERPROFILE") {
        let d = PathBuf::from(home).join("Downloads");
        let _ = std::fs::create_dir_all(&d);
        return d;
    }
    app.path()
        .cache_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn save_pdf_bytes(app: &AppHandle, bytes: &[u8], filename: &str) -> Option<String> {
    if bytes.is_empty() {
        return None;
    }
    let safe = sanitize_pdf_filename(filename);
    let dest = resolve_downloads_dir(app).join(&safe);
    std::fs::write(&dest, bytes).ok()?;
    Some(dest.to_string_lossy().into_owned())
}

#[cfg(windows)]
fn apply_pdf_print_settings(
    settings: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2PrintSettings,
    page_format: &str,
) {
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    let legal = page_format.eq_ignore_ascii_case("legal")
        || page_format.eq_ignore_ascii_case("oficio");
    let margin_in = 14.0 / 25.4;
    unsafe {
        let _ = settings.SetShouldPrintBackgrounds(true);
        let _ = settings.SetShouldPrintHeaderAndFooter(false);
        let _ = settings.SetOrientation(COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT);
        let _ = settings.SetScaleFactor(1.0);
        let _ = settings.SetMarginTop(margin_in);
        let _ = settings.SetMarginBottom(margin_in);
        let _ = settings.SetMarginLeft(margin_in);
        let _ = settings.SetMarginRight(margin_in);
        if legal {
            let _ = settings.SetPageWidth(8.5);
            let _ = settings.SetPageHeight(14.0);
        } else {
            let _ = settings.SetPageWidth(210.0 / 25.4);
            let _ = settings.SetPageHeight(297.0 / 25.4);
        }
    }
}

#[cfg(windows)]
pub fn html_to_pdf_b64_sync(
    app: tauri::AppHandle,
    html_b64: String,
    page_format: String,
    save_filename: Option<String>,
) -> Result<CrozzoHtmlPdfResult, String> {
    use base64::Engine;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::mpsc;
    use std::time::{Duration, Instant};
    use tauri::{Url, WebviewUrl, WebviewWindowBuilder};
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use webview2_com::{NavigationCompletedEventHandler, PrintToPdfCompletedHandler};
    use windows::core::{Interface, HSTRING};

    let html = String::from_utf8(
        base64::engine::general_purpose::STANDARD
            .decode(html_b64.trim())
            .map_err(|e| format!("HTML invalido (base64): {e}"))?,
    )
    .map_err(|e| format!("HTML invalido (utf-8): {e}"))?;

    let cache = app.path().cache_dir().map_err(|e| e.to_string())?;
    let label = format!(
        "crozzo-pdf-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );
    let pdf_file = cache.join(format!("{label}.pdf"));

    let (tx, rx) = mpsc::sync_channel::<Result<String, String>>(1);
    let html_ready = std::sync::Arc::new(AtomicBool::new(false));
    let pdf_started = std::sync::Arc::new(AtomicBool::new(false));

    let blank = Url::parse("about:blank").map_err(|e| format!("URL PDF: {e}"))?;
    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(blank))
        .title("Crozzo PDF")
        .visible(false)
        .focused(false)
        .inner_size(640.0, 900.0)
        .position(-12000.0, -12000.0)
        .decorations(false)
        .skip_taskbar(true)
        .build()
        .map_err(|e| format!("Ventana PDF: {e}"))?;

    let html_body = html.clone();
    let fmt_copy = page_format.clone();
    let pdf_path = pdf_file.clone();
    let tx_setup = tx.clone();
    let html_ready_flag = html_ready.clone();
    let pdf_started_flag = pdf_started.clone();

    window
        .with_webview(move |wv| {
            if let Err(e) = (|| -> Result<(), String> {
                unsafe {
                    let webview = wv.controller().CoreWebView2().map_err(|e| e.to_string())?;
                    let webview7: ICoreWebView2_7 = webview.cast().map_err(|_| {
                        String::from(
                            "WebView2 sin PrintToPdf. Actualice Microsoft Edge WebView2 Runtime.",
                        )
                    })?;
                    let webview2: ICoreWebView2_2 = webview.cast().map_err(|e| e.to_string())?;
                    let env = webview2.Environment().map_err(|e| e.to_string())?;
                    let env6: ICoreWebView2Environment6 = env.cast().map_err(|_| {
                        String::from("CreatePrintSettings no disponible en este WebView2.")
                    })?;

                    let tx_done = tx_setup.clone();
                    let mut nav_token: i64 = 0;
                    let webview7_pdf = webview7.clone();
                    let env6_settings = env6.clone();
                    let html_ready_nav = html_ready_flag.clone();
                    let pdf_started_nav = pdf_started_flag.clone();
                    let pdf_target = pdf_path.clone();
                    let fmt_nav = fmt_copy.clone();

                    let handler = NavigationCompletedEventHandler::create(Box::new(
                        move |_sender, args| {
                            if !html_ready_nav.load(Ordering::SeqCst) {
                                return Ok(());
                            }
                            if pdf_started_nav.swap(true, Ordering::SeqCst) {
                                return Ok(());
                            }
                            let Some(args) = args else {
                                return Ok(());
                            };
                            let mut success = windows::core::BOOL(0);
                            if args.IsSuccess(&mut success).is_err() || !success.as_bool() {
                                let _ = tx_done.send(Err(
                                    "No se cargo el documento para exportar PDF.".into(),
                                ));
                                return Ok(());
                            }

                            let settings = match env6_settings.CreatePrintSettings() {
                                Ok(s) => s,
                                Err(e) => {
                                    let _ = tx_done.send(Err(format!("PrintSettings: {e}")));
                                    return Ok(());
                                }
                            };
                            apply_pdf_print_settings(&settings, &fmt_nav);
                            std::thread::sleep(Duration::from_millis(700));

                            let pdf_w = HSTRING::from(
                                pdf_target.to_string_lossy().to_string().as_str(),
                            );
                            let tx_pdf = tx_done.clone();
                            let pdf_read = pdf_target.clone();
                            let pdf_handler = PrintToPdfCompletedHandler::create(Box::new(
                                move |hr, ok| {
                                    if hr.is_ok() && ok {
                                        match std::fs::read(&pdf_read) {
                                            Ok(bytes) if !bytes.is_empty() => {
                                                let b64 = base64::engine::general_purpose::STANDARD
                                                    .encode(bytes);
                                                let _ = tx_pdf.send(Ok(b64));
                                            }
                                            Ok(_) => {
                                                let _ = tx_pdf.send(Err(
                                                    "PDF generado vacio.".into(),
                                                ));
                                            }
                                            Err(e) => {
                                                let _ =
                                                    tx_pdf.send(Err(format!("Leer PDF: {e}")));
                                            }
                                        }
                                    } else {
                                        let _ = tx_pdf.send(Err(format!(
                                            "PrintToPdf fallo (hr={hr:?}, ok={ok:?})"
                                        )));
                                    }
                                    Ok(())
                                },
                            ));
                            if let Err(e) =
                                webview7_pdf.PrintToPdf(&pdf_w, &settings, &pdf_handler)
                            {
                                let _ = tx_done.send(Err(format!("PrintToPdf: {e}")));
                            }
                            Ok(())
                        },
                    ));
                    webview
                        .add_NavigationCompleted(&handler, &mut nav_token)
                        .map_err(|e| e.to_string())?;

                    html_ready_flag.store(true, Ordering::SeqCst);
                    webview
                        .NavigateToString(&HSTRING::from(html_body.as_str()))
                        .map_err(|e| format!("NavigateToString: {e}"))?;
                }
                Ok(())
            })() {
                let _ = tx_setup.send(Err(e));
            }
        })
        .map_err(|e| format!("WebView PDF: {e}"))?;

    let deadline = Instant::now() + Duration::from_secs(75);
    let mut pdf_b64: Option<String> = None;
    while Instant::now() < deadline {
        match rx.recv_timeout(Duration::from_millis(250)) {
            Ok(Ok(b64)) => {
                pdf_b64 = Some(b64);
                break;
            }
            Ok(Err(e)) => {
                let _ = window.close();
                let _ = std::fs::remove_file(&pdf_file);
                return Err(e);
            }
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }

    let _ = window.close();
    let _ = std::fs::remove_file(&pdf_file);

    let Some(b64) = pdf_b64 else {
        return Err(
            "Tiempo agotado al generar PDF. Reinicie la app e intente de nuevo.".into(),
        );
    };

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&b64)
        .unwrap_or_default();
    let mut saved_path = String::new();
    let saved_label = save_filename
        .as_ref()
        .filter(|s| !s.trim().is_empty())
        .map(|s| sanitize_pdf_filename(s));

    if let Some(name) = saved_label.as_ref() {
        if let Some(path) = save_pdf_bytes(&app, &bytes, name) {
            saved_path = path;
        }
    }

    Ok(CrozzoHtmlPdfResult {
        ok: true,
        pdf_b64: b64,
        saved_path: saved_path.clone(),
        message: if !saved_path.is_empty() {
            format!("PDF guardado: {saved_path}")
        } else if let Some(name) = saved_label {
            format!(
                "PDF generado pero no se pudo guardar en Descargas ({name}). Revise permisos."
            )
        } else {
            "PDF generado".into()
        },
    })
}

#[cfg(not(windows))]
pub fn html_to_pdf_b64_sync(
    _app: AppHandle,
    _html_b64: String,
    _page_format: String,
    _save_filename: Option<String>,
) -> Result<CrozzoHtmlPdfResult, String> {
    Err("Exportar PDF desde HTML solo esta disponible en Windows.".into())
}

#[allow(dead_code)]
fn _path_to_file_url(path: &Path) -> String {
    let mut s = path.display().to_string();
    if let Some(stripped) = s.strip_prefix(r"\\?\") {
        s = stripped.to_string();
    }
    format!("file:///{}", s.replace('\\', "/"))
}
