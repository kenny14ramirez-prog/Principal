//! RAG simplificado para el asistente IA (Fase 2).
//! Indexa docs/ y articulos del HelpHub, almacena chunks en SQLite (data/ai/rag.db)
//! con FTS5 para busqueda de texto completo (sin embeddings).

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
    use std::fs;
    use std::path::PathBuf;

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
            "CREATE VIRTUAL TABLE IF NOT EXISTS rag_fts USING fts5(source UNINDEXED, text, tokenize='unicode61')",
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

    pub fn reindex() -> Result<usize, String> {
        let conn = open_conn()?;
        conn.execute("DELETE FROM rag_fts", []).map_err(|e| e.to_string())?;

        let files = collect_files();
        let mut total = 0usize;
        for file in files {
            let text = match fs::read_to_string(&file) {
                Ok(t) => t,
                Err(_) => continue,
            };
            let source = file.to_string_lossy().to_string();
            for chunk in chunk_text(&text) {
                conn.execute(
                    "INSERT INTO rag_fts (source, text) VALUES (?1, ?2)",
                    params![source, chunk],
                )
                .map_err(|e| e.to_string())?;
                total += 1;
            }
        }
        Ok(total)
    }

    fn sanitize_query(query: &str) -> String {
        let mut terms: Vec<String> = Vec::new();
        for raw in query.split_whitespace() {
            // keep alphanumeric-ish chars
            let cleaned: String = raw.chars().filter(|c| c.is_alphanumeric()).collect();
            if cleaned.is_empty() {
                continue;
            }
            // escape double quotes
            let esc = cleaned.replace('"', "\"\"");
            terms.push(format!("\"{}\"", esc));
        }
        if terms.is_empty() {
            // fallback: quote whole query stripped
            let cleaned: String = query.chars().filter(|c| c.is_alphanumeric() || c.is_whitespace()).collect();
            let esc = cleaned.trim().replace('"', "\"\"");
            if esc.is_empty() {
                return String::new();
            }
            return format!("\"{}\"", esc);
        }
        terms.join(" ")
    }

    pub fn search(query: &str, k: usize) -> Result<Vec<RagResult>, String> {
        let conn = open_conn()?;
        let q = sanitize_query(query);
        if q.is_empty() {
            return Ok(vec![]);
        }
        let sql = "SELECT source, text, bm25(rag_fts) FROM rag_fts WHERE rag_fts MATCH ?1 ORDER BY bm25(rag_fts) LIMIT ?2";
        let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![q, k as i64], |row| {
                let source: String = row.get(0)?;
                let text: String = row.get(1)?;
                let score: f64 = row.get(2)?;
                Ok(RagResult { source, text, score })
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| e.to_string())?);
        }
        Ok(out)
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

#[cfg(desktop)]
#[tauri::command]
pub fn crozzo_rag_fts_search(query: String, k: Option<usize>) -> Result<Vec<RagResult>, String> {
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

#[cfg(not(desktop))]
#[tauri::command]
pub fn crozzo_rag_fts_search(query: String, k: Option<usize>) -> Result<Vec<RagResult>, String> {
    let _ = (query, k);
    Ok(vec![])
}