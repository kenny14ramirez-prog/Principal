//! Impresión térmica ESC/POS: Windows (WinAPI RAW), macOS/Linux (CUPS lp).

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct CrozzoPrintResult {
    pub ok: bool,
    pub message: String,
}

#[tauri::command]
pub fn crozzo_list_printers() -> Result<Vec<String>, String> {
    #[cfg(windows)]
    {
        return win::list_printers();
    }
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        return cups::list_printers();
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Ok(Vec::new())
    }
}

#[tauri::command]
pub fn crozzo_get_default_printer() -> Result<Option<String>, String> {
    #[cfg(windows)]
    {
        return win::get_default_printer();
    }
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        return cups::get_default_printer();
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Ok(None)
    }
}

#[tauri::command]
pub fn crozzo_print_raw(
    printer_name: String,
    data: Vec<u8>,
    copies: u32,
) -> Result<CrozzoPrintResult, String> {
    let copies = copies.max(1).min(10);
    #[cfg(windows)]
    {
        return win::print_raw(&printer_name, &data, copies);
    }
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        return cups::print_raw(&printer_name, &data, copies);
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        let _ = (printer_name, data, copies);
        Err("Impresión directa no disponible en esta plataforma.".into())
    }
}

#[cfg(windows)]
mod win {
    use super::CrozzoPrintResult;
    use windows::core::PWSTR;
    use windows::Win32::Graphics::Printing::{
        ClosePrinter, EndDocPrinter, EndPagePrinter, EnumPrintersW, GetDefaultPrinterW, OpenPrinterW,
        StartDocPrinterW, StartPagePrinter, WritePrinter, DOC_INFO_1W, PRINTER_ENUM_CONNECTIONS,
        PRINTER_ENUM_LOCAL, PRINTER_HANDLE, PRINTER_INFO_2W,
    };

    fn wide(s: &str) -> Vec<u16> {
        use std::os::windows::prelude::*;
        std::ffi::OsStr::new(s).encode_wide().chain(Some(0)).collect()
    }

    fn pwstr_to_string(p: PWSTR) -> Option<String> {
        if p.0.is_null() {
            return None;
        }
        unsafe {
            let mut len = 0usize;
            while *p.0.add(len) != 0 {
                len += 1;
            }
            let slice = std::slice::from_raw_parts(p.0, len);
            String::from_utf16(slice).ok()
        }
    }

    fn bool_ok(b: windows::core::BOOL) -> bool {
        b.as_bool()
    }

    pub fn list_printers() -> Result<Vec<String>, String> {
        let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
        let mut needed: u32 = 0;
        let mut returned: u32 = 0;

        unsafe {
            let _ = EnumPrintersW(flags, None, 2, None, &mut needed, &mut returned);
        }

        if needed == 0 {
            return Ok(Vec::new());
        }

        let mut buffer = vec![0u8; needed as usize];
        unsafe {
            EnumPrintersW(
                flags,
                None,
                2,
                Some(buffer.as_mut_slice()),
                &mut needed,
                &mut returned,
            )
            .map_err(|e| format!("EnumPrintersW: {e}"))?;
        }

        let mut names = Vec::new();
        let ptr = buffer.as_ptr() as *const PRINTER_INFO_2W;
        unsafe {
            for i in 0..returned as isize {
                let info = &*ptr.offset(i);
                if let Some(name) = pwstr_to_string(info.pPrinterName) {
                    if !name.is_empty() {
                        names.push(name);
                    }
                }
            }
        }
        names.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
        names.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
        Ok(names)
    }

    pub fn get_default_printer() -> Result<Option<String>, String> {
        let mut size: u32 = 0;
        unsafe {
            let _ = GetDefaultPrinterW(None, &mut size);
        }
        if size == 0 {
            return Ok(None);
        }
        let mut buf = vec![0u16; size as usize];
        unsafe {
            if !bool_ok(GetDefaultPrinterW(Some(PWSTR(buf.as_mut_ptr())), &mut size)) {
                return Ok(None);
            }
        }
        let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        let name = String::from_utf16(&buf[..end]).map_err(|e| format!("Nombre impresora: {e}"))?;
        if name.is_empty() {
            Ok(None)
        } else {
            Ok(Some(name))
        }
    }

    fn resolve_printer_name(requested: &str) -> Result<String, String> {
        let req = requested.trim();
        if !req.is_empty() {
            return Ok(req.to_string());
        }
        get_default_printer()?.ok_or_else(|| {
            "No hay impresora predeterminada en Windows. Configure una en Facturas e impresión.".into()
        })
    }

    pub fn print_raw(printer_name: &str, data: &[u8], copies: u32) -> Result<CrozzoPrintResult, String> {
        if data.is_empty() {
            return Err("Sin datos para imprimir.".into());
        }

        let target = resolve_printer_name(printer_name)?;
        let name_w = wide(&target);
        let mut h_printer = PRINTER_HANDLE::default();

        unsafe {
            OpenPrinterW(windows::core::PCWSTR(name_w.as_ptr()), &mut h_printer, None)
                .map_err(|e| format!("No se pudo abrir «{target}»: {e}"))?;
        }

        let doc_name = wide("Crozzo POS Ticket");
        let data_type = wide("RAW");
        let doc_info = DOC_INFO_1W {
            pDocName: PWSTR(doc_name.as_ptr() as *mut u16),
            pOutputFile: PWSTR::null(),
            pDatatype: PWSTR(data_type.as_ptr() as *mut u16),
        };

        let mut last_err = String::new();
        let mut printed = 0u32;

        for copy in 0..copies {
            unsafe {
                let job = StartDocPrinterW(h_printer, 1, &doc_info);
                if job == 0 {
                    last_err = format!("StartDocPrinterW falló (copia {})", copy + 1);
                    break;
                }

                if !bool_ok(StartPagePrinter(h_printer)) {
                    let _ = EndDocPrinter(h_printer);
                    last_err = format!("StartPagePrinter falló (copia {})", copy + 1);
                    break;
                }

                let mut written: u32 = 0;
                let write_ok = WritePrinter(
                    h_printer,
                    data.as_ptr() as *const core::ffi::c_void,
                    data.len() as u32,
                    &mut written,
                );

                let _ = EndPagePrinter(h_printer);
                let _ = EndDocPrinter(h_printer);

                if !bool_ok(write_ok) || written == 0 {
                    last_err = format!(
                        "WritePrinter falló (copia {}, enviados {} de {} bytes)",
                        copy + 1,
                        written,
                        data.len()
                    );
                    break;
                }
                printed += 1;
            }
        }

        unsafe {
            let _ = ClosePrinter(h_printer);
        }

        if printed == 0 {
            return Err(if last_err.is_empty() {
                "Impresión cancelada.".into()
            } else {
                last_err
            });
        }

        Ok(CrozzoPrintResult {
            ok: true,
            message: format!("{printed} copia(s) enviadas a {target}"),
        })
    }
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
mod cups {
    use super::CrozzoPrintResult;
    use std::process::Command;

    pub fn list_printers() -> Result<Vec<String>, String> {
        let out = Command::new("lpstat")
            .arg("-a")
            .output()
            .map_err(|e| format!("lpstat no disponible: {e}"))?;
        if !out.status.success() {
            return Err(format!(
                "lpstat falló: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            ));
        }
        let text = String::from_utf8_lossy(&out.stdout);
        let mut names = Vec::new();
        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            if let Some(name) = line.split_whitespace().next() {
                if name != "lpstat:" {
                    names.push(name.to_string());
                }
            }
        }
        names.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
        names.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
        Ok(names)
    }

    pub fn get_default_printer() -> Result<Option<String>, String> {
        let out = Command::new("lpstat")
            .arg("-d")
            .output()
            .map_err(|e| format!("lpstat -d: {e}"))?;
        let text = String::from_utf8_lossy(&out.stdout);
        for line in text.lines() {
            let line = line.trim();
            if let Some(rest) = line.strip_prefix("system default destination:") {
                let name = rest.trim();
                if !name.is_empty() {
                    return Ok(Some(name.to_string()));
                }
            }
            if let Some(rest) = line.strip_prefix("destino predeterminado del sistema:") {
                let name = rest.trim();
                if !name.is_empty() {
                    return Ok(Some(name.to_string()));
                }
            }
        }
        Ok(None)
    }

    fn resolve_printer_name(requested: &str) -> Result<String, String> {
        let req = requested.trim();
        if !req.is_empty() {
            return Ok(req.to_string());
        }
        get_default_printer()?.ok_or_else(|| {
            "No hay impresora predeterminada (CUPS). Configúrela en Facturas e impresión.".into()
        })
    }

    pub fn print_raw(printer_name: &str, data: &[u8], copies: u32) -> Result<CrozzoPrintResult, String> {
        if data.is_empty() {
            return Err("Sin datos para imprimir.".into());
        }
        let target = resolve_printer_name(printer_name)?;
        let tmp = std::env::temp_dir().join(format!(
            "crozzo_ticket_{}_{}.bin",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0)
        ));
        std::fs::write(&tmp, data).map_err(|e| format!("No se pudo crear archivo temporal: {e}"))?;

        let mut printed = 0u32;
        let mut last_err = String::new();

        for copy in 0..copies {
            let out = Command::new("lp")
                .arg("-d")
                .arg(&target)
                .arg("-o")
                .arg("raw")
                .arg(&tmp)
                .output()
                .map_err(|e| format!("lp no disponible: {e}"))?;
            if out.status.success() {
                printed += 1;
            } else {
                last_err = format!(
                    "lp falló (copia {}): {}",
                    copy + 1,
                    String::from_utf8_lossy(&out.stderr).trim()
                );
                break;
            }
        }

        let _ = std::fs::remove_file(&tmp);

        if printed == 0 {
            return Err(if last_err.is_empty() {
                "Impresión CUPS cancelada.".into()
            } else {
                last_err
            });
        }

        Ok(CrozzoPrintResult {
            ok: true,
            message: format!("{printed} copia(s) enviadas a {target} (CUPS)"),
        })
    }
}
