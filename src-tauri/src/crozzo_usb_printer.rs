//! Enumeración de dispositivos USB para detección de impresoras POS.
//! Usa PowerShell Get-PnpDevice para listar dispositivos USB sin driver de impresora.
//! Degradación honesta: si PowerShell falla, retorna lista vacía.

use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsbDevice {
    pub vendor_id: u16,
    pub product_id: u16,
    pub name: String,
    pub description: String,
    pub instance_id: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PrinterMatch {
    pub vendor_id: u16,
    pub product_id: u16,
    pub vendor: String,
    pub models: Vec<String>,
    pub driver: String,
    pub port: String,
    pub device_name: String,
    pub status: String,
}

#[tauri::command]
pub fn crozzo_usb_list_devices() -> Result<Vec<UsbDevice>, String> {
    #[cfg(windows)]
    {
        // Use PowerShell to enumerate USB devices
        let ps_script = r#"
            Get-PnpDevice -Class USB -ErrorAction SilentlyContinue |
            Where-Object { $_.InstanceId -match 'VID_[0-9A-F]{4}&PID_[0-9A-F]{4}' } |
            ForEach-Object {
                $m = [regex]::Match($_.InstanceId, 'VID_([0-9A-F]{4})&PID_([0-9A-F]{4})')
                if ($m.Success) {
                    [PSCustomObject]@{
                        vid = '0x' + $m.Groups[1].Value
                        pid = '0x' + $m.Groups[2].Value
                        name = $_.FriendlyName
                        desc = $_.Description
                        instance = $_.InstanceId
                        status = $_.Status
                    }
                }
            } | ConvertTo-Json -Compress
        "#;
        let output = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", ps_script])
            .output()
            .map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Ok(vec![]);
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        let trimmed = stdout.trim();
        if trimmed.is_empty() || trimmed == "null" {
            return Ok(vec![]);
        }
        // Parse JSON
        let parsed: serde_json::Value = serde_json::from_str(trimmed).map_err(|e| e.to_string())?;
        let arr = if parsed.is_array() { parsed.as_array().cloned().unwrap_or_default() } else { vec![parsed] };
        let mut devices = Vec::new();
        for item in arr {
            let vid_str = item.get("vid").and_then(|v| v.as_str()).unwrap_or("0x0000");
            let pid_str = item.get("pid").and_then(|v| v.as_str()).unwrap_or("0x0000");
            let vid = u16::from_str_radix(vid_str.trim_start_matches("0x"), 16).unwrap_or(0);
            let pid = u16::from_str_radix(pid_str.trim_start_matches("0x"), 16).unwrap_or(0);
            devices.push(UsbDevice {
                vendor_id: vid,
                product_id: pid,
                name: item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                description: item.get("desc").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                instance_id: item.get("instance").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                status: item.get("status").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            });
        }
        Ok(devices)
    }
    #[cfg(not(windows))]
    {
        Ok(vec![])
    }
}

#[tauri::command]
#[allow(clippy::type_complexity)]
pub fn crozzo_usb_match_printer(devices: Vec<UsbDevice>) -> Vec<PrinterMatch> {
    // PRINTER_DB embedded (vendor IDs from CrozzoDeploymentCenter)
    let printer_db: Vec<(&str, &[u16], &[&str], &str, &str)> = vec![
        ("Epson", &[0x04B8], &["TM-T20II","TM-T20III","TM-T82II","TM-T88V","TM-m30"], "Epson Advanced Printer Driver", "USB/Serial"),
        ("Star Micronics", &[0x0519], &["TSP100III","TSP143III","TSP654II"], "Star futurePRNT", "USB"),
        ("Bixolon", &[0x1504], &["SRP-350III","SRP-350plusIII"], "Bixolon Unified Driver", "USB"),
        ("Citizen", &[0x08BD, 0x1D90, 0x2730], &["CT-S310II","CT-S4000"], "Citizen Driver", "USB"),
        ("Zebra", &[0x0A5F], &["ZD220","ZD421","ZD621"], "Zebra ZDesigner", "USB"),
        ("Xprinter/Generic", &[0x0416, 0x0FE6, 0x154F], &["XP-58","XP-80","POS-58","POS-80"], "Generic / Text Only", "USB"),
        ("HP", &[0x03F0], &["OfficeJet","LaserJet","DeskJet"], "HP Universal Print Driver", "USB/Network"),
    ];
    let mut matches = Vec::new();
    for dev in &devices {
        for (vendor, ids, models, driver, port) in &printer_db {
            if ids.contains(&dev.vendor_id) {
                matches.push(PrinterMatch {
                    vendor_id: dev.vendor_id,
                    product_id: dev.product_id,
                    vendor: vendor.to_string(),
                    models: models.iter().map(|s| s.to_string()).collect(),
                    driver: driver.to_string(),
                    port: port.to_string(),
                    device_name: dev.name.clone(),
                    status: dev.status.clone(),
                });
            }
        }
    }
    matches
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_match_printer() {
        let dev = UsbDevice { vendor_id: 0x04B8, product_id: 0x0202, name: "Epson".into(), description: "".into(), instance_id: "".into(), status: "OK".into() };
        let m = crozzo_usb_match_printer(vec![dev]);
        assert_eq!(m.len(), 1);
        assert_eq!(m[0].vendor, "Epson");
    }
}