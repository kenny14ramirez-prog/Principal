//! Sidecar local de enriquecimiento adquiriente (RUES/Scrapling en 127.0.0.1:18765).
//! No bloquea el hilo UI: jobs en thread + poll desde JS.

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use std::thread;
use std::time::{Duration, Instant};

const ENRICH_BASE: &str = "http://127.0.0.1:18765";
const JOB_TTL_SECS: u64 = 120;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdqEnrichData {
    pub nombre: Option<String>,
    pub email: Option<String>,
    pub telefono: Option<String>,
    pub ciudad: Option<String>,
    pub direccion: Option<String>,
    pub source: Option<String>,
    pub ok: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdqEnrichStartResult {
    pub accepted: bool,
    pub job_id: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdqEnrichPollResult {
    pub status: String,
    pub data: Option<AdqEnrichData>,
    pub error: Option<String>,
}

#[derive(Clone)]
enum JobState {
    Pending,
    Done(AdqEnrichData),
    Error(String),
}

struct JobEntry {
    state: JobState,
    created: Instant,
}

fn jobs() -> &'static DashMap<String, JobEntry> {
    static JOBS: OnceLock<DashMap<String, JobEntry>> = OnceLock::new();
    JOBS.get_or_init(DashMap::new)
}

static JOB_SEQ: AtomicU64 = AtomicU64::new(1);

fn gc_jobs(map: &DashMap<String, JobEntry>) {
    let ttl = Duration::from_secs(JOB_TTL_SECS);
    map.retain(|_, v| v.created.elapsed() < ttl);
}

fn http_get_health() -> bool {
    let client = match reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };
    match client.get(format!("{ENRICH_BASE}/health")).send() {
        Ok(r) => r.status().is_success(),
        Err(_) => false,
    }
}

fn http_post_enrich(nit: &str, nombre_hint: Option<&str>) -> Result<AdqEnrichData, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(14))
        .build()
        .map_err(|e| e.to_string())?;
    let body = serde_json::json!({
        "nit": nit,
        "nombre_hint": nombre_hint,
    });
    let resp = client
        .post(format!("{ENRICH_BASE}/enrich"))
        .json(&body)
        .send()
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    resp.json::<AdqEnrichData>().map_err(|e| e.to_string())
}

fn sidecar_script_path() -> Option<std::path::PathBuf> {
    let candidates = [
        std::path::PathBuf::from("tools/crozzo-adq-enrich/server.py"),
        std::path::PathBuf::from("../tools/crozzo-adq-enrich/server.py"),
        std::path::PathBuf::from("../../tools/crozzo-adq-enrich/server.py"),
    ];
    for c in candidates {
        if c.exists() {
            return Some(c);
        }
    }
    None
}

/// Best-effort: arranca el sidecar si no responde /health.
#[tauri::command]
pub fn adq_enrich_ensure_sidecar() -> Result<bool, String> {
    if http_get_health() {
        return Ok(true);
    }
    let script = match sidecar_script_path() {
        Some(p) => p,
        None => return Ok(false),
    };
    let mut cmd = if cfg!(windows) {
        let mut c = Command::new("py");
        c.arg("-3").arg(&script);
        c
    } else {
        let mut c = Command::new("python3");
        c.arg(&script);
        c
    };
    if let Some(d) = script.parent() {
        cmd.current_dir(d);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let spawn_ok = cmd.spawn().is_ok() || {
        let mut cmd2 = Command::new("python");
        cmd2.arg(&script);
        if let Some(d) = script.parent() {
            cmd2.current_dir(d);
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd2.creation_flags(CREATE_NO_WINDOW);
        }
        cmd2.spawn().is_ok()
    };
    if spawn_ok {
        thread::sleep(Duration::from_millis(900));
        Ok(http_get_health())
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub fn adq_enrich_health() -> bool {
    http_get_health()
}

#[tauri::command]
pub fn adq_enrich_start_job(nit: String, nombre_hint: Option<String>) -> AdqEnrichStartResult {
    let nit_digits: String = nit.chars().filter(|c| c.is_ascii_digit()).collect();
    if nit_digits.len() < 6 {
        return AdqEnrichStartResult {
            accepted: false,
            job_id: None,
            error: Some("nit_corto".into()),
        };
    }
    let map = jobs();
    gc_jobs(map);
    let job_id = format!("j{}", JOB_SEQ.fetch_add(1, Ordering::Relaxed));
    map.insert(
        job_id.clone(),
        JobEntry {
            state: JobState::Pending,
            created: Instant::now(),
        },
    );
    let job_id_bg = job_id.clone();
    let hint = nombre_hint.clone();
    thread::spawn(move || {
        let _ = adq_enrich_ensure_sidecar();
        let result = http_post_enrich(&nit_digits, hint.as_deref());
        if let Some(mut entry) = jobs().get_mut(&job_id_bg) {
            match result {
                Ok(data) => entry.state = JobState::Done(data),
                Err(e) => entry.state = JobState::Error(e),
            }
        }
    });
    AdqEnrichStartResult {
        accepted: true,
        job_id: Some(job_id),
        error: None,
    }
}

#[tauri::command]
pub fn adq_enrich_poll(job_id: String) -> AdqEnrichPollResult {
    let map = jobs();
    match map.get(&job_id) {
        None => AdqEnrichPollResult {
            status: "missing".into(),
            data: None,
            error: Some("job_not_found".into()),
        },
        Some(e) => match &e.state {
            JobState::Pending => AdqEnrichPollResult {
                status: "pending".into(),
                data: None,
                error: None,
            },
            JobState::Done(d) => AdqEnrichPollResult {
                status: "done".into(),
                data: Some(d.clone()),
                error: None,
            },
            JobState::Error(err) => AdqEnrichPollResult {
                status: "error".into(),
                data: None,
                error: Some(err.clone()),
            },
        },
    }
}
