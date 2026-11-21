//! RAG mínimo para el asistente IA (Fase 2).
//! Indexa docs/ y artículos del HelpHub, embebe con nomic-embed-text (Ollama/sidecar)
//! y almacena chunks en SQLite (data/ai/rag.db). Búsqueda por similitud coseno.

use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct RagResult {
    pub source: String,
    pub text: String,
    pub score: f64,
}

#[cfg(desktop)]
mod imp {
    use super::RagResult;
    use rusqlite::{params, Connection};
    use serde_json::Value;
    use std::fs;
    use std::path::PathBuf;
    use std::time::Duration;

    const CHUNK_SIZE: usize = 900;
    const CHUNK_OVERLAP: usize = 120;

    fn base_dir() -> PathBuf {
        if let Ok(d) = std::env::var("CROZZO_DATA_DIR") {
            return PathBuf::from(d);
        }
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    }

    pub fn db_path() -> Result<PathBuf, String> {
        let dir = base_dir().join("data").join("ai");
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        Ok(dir.join("rag.db"))
    }

    fn open_conn() -> Result<Connection, String> {
        let path = db_path()?;
        let conn = Connection::open(path).map_err(|e| e.to_string())?;
        conn.execute(
            "CREATE TABLE IF NOT EXISTS chunks (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, text TEXT NOT NULL, embedding TEXT NOT NULL)",
            [],
        )
        .map_err(|e| e.to_string())?;
        Ok(conn)
    }

    fn chunk_text(text: &str) -> Vec<String> {
        let cleaned = text.replace("\r\n", "\n");
        let chars: Vec<char> = cleaned.chars().collect();
        if chars.is_empty() {
            return vec![];
        }
        let mut out = Vec::new();
        let mut i = 0usize;
        while i < chars.len() {
            let end = (i + CHUNK_SIZE).min(chars.len());
            let chunk: String = chars[i..end].iter().collect();
            let t = chunk.trim();
            if !t.is_empty() {
                out.push(t.to_string());
            }
            if end == chars.len() {
                break;
            }
            i += CHUNK_SIZE.saturating_sub(CHUNK_OVERLAP);
            if i >= chars.len() {
                break;
            }
        }
        out
    }

    fn is_text_ext(ext: &str) -> bool {
        matches!(
            ext.to_lowercase().as_str(),
            "md" | "txt" | "html" | "htm" | "json" | "jsonl" | "sql" | "ts" | "js" | "log" | "yaml" | "yml" | "toml" | "csv"
        )
    }

    fn collect_files() -> Vec<PathBuf> {
        let mut roots: Vec<PathBuf> = Vec::new();
        let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|x| x.to_path_buf()))
            .unwrap_or_else(|| cwd.clone());

        for base in [cwd.clone(), exe_dir.clone()] {
            let docs = base.join("docs");
            if docs.exists() {
                roots.push(docs);
            }
            // HelpHub articles
            for rel in [
                "app/modules/CrozzoHelpHub.js",
                "src/modules/CrozzoHelpHub.js",
                "modules/CrozzoHelpHub.js",
            ] {
                let p = base.join(rel);
                if p.exists() {
                    roots.push(p);
                }
            }
        }
        // De-duplicate while preserving order
        let mut seen = std::collections::HashSet::new();
        let mut files = Vec::new();
        for root in roots {
            if root.is_file() {
                if !seen.insert(root.clone()) {
                    continue;
                }
                files.push(root);
                continue;
            }
            // walk
            let mut stack = vec![root];
            while let Some(dir) = stack.pop() {
                let entries = match fs::read_dir(&dir) {
                    Ok(e) => e,
                    Err(_) => continue,
                };
                for entry in entries.flatten() {
                    let path = entry.path();
                    let meta = match entry.metadata() {
                        Ok(m) => m,
                        Err(_) => continue,
                    };
                    if meta.is_dir() {
                        // skip heavy/binary dirs
                        let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
                        if name == "node_modules" || name == "target" || name == ".git" {
                            continue;
                        }
                        stack.push(path);
                    } else if meta.is_file() {
                        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
                        if !is_text_ext(ext) {
                            continue;
                        }
                        if meta.len() > 2_000_000 {
                            continue;
                        }
                        if seen.insert(path.clone()) {
                            files.push(path);
                        }
                    }
                }
            }
        }
        files
    }

    fn ollama_base() -> String {
        std::env::var("CROZZO_OLLAMA_URL").unwrap_or_else(|_| "http://127.0.0.1:11434".to_string())
    }

    fn parse_embedding(v: &Value) -> Option<Vec<f32>> {
        let arr = v.as_array()?;
        let mut out = Vec::with_capacity(arr.len());
        for x in arr {
            let n = x.as_f64()?;
            out.push(n as f32);
        }
        if out.is_empty() {
            None
        } else {
            Some(out)
        }
    }

    fn embed_text(text: &str) -> Result<Vec<f32>, String> {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(120))
            .build()
            .map_err(|e| e.to_string())?;

        // 1) Ollama legacy /api/embeddings
        let body = serde_json::json!({ "model": "nomic-embed-text", "prompt": text });
        if let Ok(resp) = client
            .post(format!("{}/api/embeddings", ollama_base().trim_end_matches('/')))
            .json(&body)
            .send()
        {
            if resp.status().is_success() {
                if let Ok(v) = resp.json::<Value>() {
                    if let Some(emb) = v.get("embedding").and_then(parse_embedding) {
                        return Ok(emb);
                    }
                }
            }
        }

        // 2) Ollama new /api/embed
        let body = serde_json::json!({ "model": "nomic-embed-text", "input": text });
        if let Ok(resp) = client
            .post(format!("{}/api/embed", ollama_base().trim_end_matches('/')))
            .json(&body)
            .send()
        {
            if resp.status().is_success() {
                if let Ok(v) = resp.json::<Value>() {
                    if let Some(arr) = v.get("embeddings").and_then(|x| x.as_array()) {
                        if let Some(first) = arr.first() {
                            if let Some(emb) = parse_embedding(first) {
                                return Ok(emb);
                            }
                        }
                    }
                }
            }
        }

        // 3) sidecar llama-server /v1/embeddings
        let sidecar_base = "http://127.0.0.1:11435";
        let body = serde_json::json!({ "model": "nomic-embed-text", "input": text });
        if let Ok(resp) = client
            .post(format!("{}/v1/embeddings", sidecar_base))
            .json(&body)
            .send()
        {
            if resp.status().is_success() {
                if let Ok(v) = resp.json::<Value>() {
                    if let Some(arr) = v.get("data").and_then(|x| x.as_array()) {
                        if let Some(first) = arr.first() {
                            if let Some(emb) = first.get("embedding").and_then(parse_embedding) {
                                return Ok(emb);
                            }
                        }
                    }
                }
            }
        }

        Err("embedding_backend_unavailable".into())
    }

    pub fn reindex() -> Result<usize, String> {
        let conn = open_conn()?;
        conn.execute("DELETE FROM chunks", []).map_err(|e| e.to_string())?;

        let files = collect_files();
        let mut total = 0usize;
        for file in files {
            let text = match fs::read_to_string(&file) {
                Ok(t) => t,
                Err(_) => continue,
            };
            let source = file.to_string_lossy().to_string();
            for chunk in chunk_text(&text) {
                let emb = match embed_text(&chunk) {
                    Ok(e) => e,
                    Err(e) => return Err(format!("embed_failed ({}): {}", source, e)),
                };
                let emb_json = serde_json::to_string(&emb).map_err(|e| e.to_string())?;
                conn.execute(
                    "INSERT INTO chunks (source, text, embedding) VALUES (?1, ?2, ?3)",
                    params![source, chunk, emb_json],
                )
                .map_err(|e| e.to_string())?;
                total += 1;
            }
        }
        Ok(total)
    }

    pub fn search(query: &str, k: usize) -> Result<Vec<RagResult>, String> {
        let conn = open_conn()?;
        let qemb = embed_text(query)?;

        let mut stmt = conn
            .prepare("SELECT source, text, embedding FROM chunks")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                let source: String = row.get(0)?;
                let text: String = row.get(1)?;
                let emb: String = row.get(2)?;
                Ok((source, text, emb))
            })
            .map_err(|e| e.to_string())?;

        let mut scored: Vec<(f64, String, String)> = Vec::new();
        for r in rows {
            let (source, text, emb_str) = r.map_err(|e| e.to_string())?;
            let emb: Vec<f32> = match serde_json::from_str(&emb_str) {
                Ok(v) => v,
                Err(_) => continue,
            };
            if emb.len() != qemb.len() {
                continue;
            }
            let mut dot = 0.0f64;
            let mut na = 0.0f64;
            let mut nb = 0.0f64;
            for (a, b) in emb.iter().zip(qemb.iter()) {
                let a = *a as f64;
                let b = *b as f64;
                dot += a * b;
                na += a * a;
                nb += b * b;
            }
            let denom = (na.sqrt() * nb.sqrt()).max(1e-12);
            let score = dot / denom;
            scored.push((score, source, text));
        }
        scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        let top: Vec<RagResult> = scored
            .into_iter()
            .take(k)
            .map(|(score, source, text)| RagResult { source, text, score })
            .collect();
        Ok(top)
    }
}

#[cfg(desktop)]
#[tauri::command]
pub fn crozzo_rag_reindex() -> Result<usize, String> {
    imp::reindex()
}

#[cfg(desktop)]
#[tauri::command]
pub fn crozzo_rag_index() -> Result<usize, String> {
    imp::reindex()
}

#[cfg(desktop)]
#[tauri::command]
pub fn crozzo_rag_search(query: String, k: Option<usize>) -> Result<Vec<RagResult>, String> {
    imp::search(&query, k.unwrap_or(5))
}

// Stubs no-desktop
#[cfg(not(desktop))]
#[tauri::command]
pub fn crozzo_rag_reindex() -> Result<usize, String> {
    Err("rag_not_available_on_this_platform".into())
}

#[cfg(not(desktop))]
#[tauri::command]
pub fn crozzo_rag_index() -> Result<usize, String> {
    Err("rag_not_available_on_this_platform".into())
}

#[cfg(not(desktop))]
#[tauri::command]
pub fn crozzo_rag_search(query: String, k: Option<usize>) -> Result<Vec<RagResult>, String> {
    let _ = (query, k);
    Ok(vec![])
}
