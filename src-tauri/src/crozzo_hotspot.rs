//! Hotspot de respaldo de la caja (Rol A) para seguir operando si cae el router.
//! En Windows usa el Mobile Hotspot nativo (WinRT NetworkOperatorTetheringManager)
//! vía PowerShell. En otros SO devuelve "no soportado" y el front guía manualmente.

#[cfg(windows)]
fn run_ps(script: &str) -> Result<String, String> {
    use std::process::Command;
    let out = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .output()
        .map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).to_string();
    if !out.status.success() && stdout.trim().is_empty() {
        return Err(if stderr.trim().is_empty() {
            "powershell_failed".into()
        } else {
            stderr.trim().to_string()
        });
    }
    Ok(stdout)
}

#[cfg(windows)]
const PS_PREAMBLE: &str = r#"
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
Function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}
[Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime] | Out-Null
[Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager,Windows.Networking.NetworkOperators,ContentType=WindowsRuntime] | Out-Null
Function Get-Tm {
  $p = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile()
  if ($null -eq $p) { $p = [Windows.Networking.Connectivity.NetworkInformation]::GetConnectionProfiles() | Select-Object -First 1 }
  if ($null -eq $p) { throw 'no_connection_profile' }
  [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($p)
}
"#;

#[cfg(windows)]
fn parse_kv(out: &str, key: &str) -> String {
    let prefix = format!("{}=", key);
    for line in out.lines() {
        let l = line.trim();
        if let Some(v) = l.strip_prefix(&prefix) {
            return v.trim().to_string();
        }
    }
    String::new()
}

#[cfg(windows)]
#[tauri::command]
pub fn crozzo_hotspot_start() -> Result<serde_json::Value, String> {
    let script = format!(
        r#"{}
$tm = Get-Tm
$cfg = $tm.GetCurrentAccessPointConfiguration()
Write-Output ("SSID=" + $cfg.Ssid)
Write-Output ("PASS=" + $cfg.Passphrase)
if ($tm.TetheringOperationalState -ne [Windows.Networking.NetworkOperators.TetheringOperationalState]::On) {{
  $op = $tm.StartTetheringAsync()
  $res = Await $op ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult])
  Write-Output ("STATUS=" + $res.Status)
}} else {{
  Write-Output "STATUS=AlreadyOn"
}}
"#,
        PS_PREAMBLE
    );
    let out = run_ps(&script)?;
    let status = parse_kv(&out, "STATUS");
    let ok = status.eq_ignore_ascii_case("Success") || status.eq_ignore_ascii_case("AlreadyOn");
    Ok(serde_json::json!({
        "ok": ok,
        "ssid": parse_kv(&out, "SSID"),
        "passphrase": parse_kv(&out, "PASS"),
        "status": status,
    }))
}

#[cfg(windows)]
#[tauri::command]
pub fn crozzo_hotspot_stop() -> Result<serde_json::Value, String> {
    let script = format!(
        r#"{}
$tm = Get-Tm
if ($tm.TetheringOperationalState -eq [Windows.Networking.NetworkOperators.TetheringOperationalState]::On) {{
  $op = $tm.StopTetheringAsync()
  $res = Await $op ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult])
  Write-Output ("STATUS=" + $res.Status)
}} else {{
  Write-Output "STATUS=AlreadyOff"
}}
"#,
        PS_PREAMBLE
    );
    let out = run_ps(&script)?;
    Ok(serde_json::json!({ "ok": true, "status": parse_kv(&out, "STATUS") }))
}

#[cfg(windows)]
#[tauri::command]
pub fn crozzo_hotspot_status() -> Result<serde_json::Value, String> {
    let script = format!(
        r#"{}
$tm = Get-Tm
Write-Output ("STATE=" + $tm.TetheringOperationalState)
$cfg = $tm.GetCurrentAccessPointConfiguration()
Write-Output ("SSID=" + $cfg.Ssid)
"#,
        PS_PREAMBLE
    );
    let out = run_ps(&script).unwrap_or_default();
    let state = parse_kv(&out, "STATE");
    Ok(serde_json::json!({
        "on": state.eq_ignore_ascii_case("On"),
        "state": state,
        "ssid": parse_kv(&out, "SSID"),
    }))
}

/* ---- Stubs para escritorio no-Windows (macOS/Linux): no hay API uniforme ---- */
#[cfg(all(not(windows), not(any(target_os = "android", target_os = "ios"))))]
#[tauri::command]
pub fn crozzo_hotspot_start() -> Result<serde_json::Value, String> {
    Err("hotspot_no_soportado_en_este_so".into())
}

#[cfg(all(not(windows), not(any(target_os = "android", target_os = "ios"))))]
#[tauri::command]
pub fn crozzo_hotspot_stop() -> Result<serde_json::Value, String> {
    Err("hotspot_no_soportado_en_este_so".into())
}

#[cfg(all(not(windows), not(any(target_os = "android", target_os = "ios"))))]
#[tauri::command]
pub fn crozzo_hotspot_status() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "on": false, "state": "unsupported", "ssid": "" }))
}
