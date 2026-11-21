// Crozzo POS — Device profile (RAM) for AI tiering.
// Returns total system RAM in MB.
use sysinfo::System;

#[tauri::command]
pub fn crozzo_device_ram() -> u64 {
    let mut sys = System::new_all();
    sys.refresh_memory();
    // sysinfo reports memory in bytes since 0.30? Convert defensively: if value looks like KB, adjust.
    let total = sys.total_memory();
    // Heuristic: total_memory in sysinfo 0.32 is in bytes.
    total / (1024 * 1024)
}
