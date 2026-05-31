//! Consulta VPFE DIAN por CUFE — sin CORS del navegador.
//! Intenta obtener HTML de validación y enlaces a XML/PDF oficial.

use reqwest::blocking::Client;
use serde::Serialize;
use std::time::Duration;

const VPFE_BASE: &str = "https://catalogo-vpfe.dian.gov.co";
const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CrozzoPOS/1.0";

#[derive(Serialize, Clone)]
pub struct DianVpfeResult {
    pub ok: bool,
    pub status: u16,
    pub html: String,
    pub xml: Option<String>,
    pub pdf_base64: Option<String>,
    pub pdf_url: Option<String>,
    pub xml_url: Option<String>,
    pub motivo: String,
}

fn search_url(cufe: &str) -> String {
    format!(
        "{}/document/searchqr?documentkey={}",
        VPFE_BASE,
        urlencoding_encode(cufe.trim())
    )
}

fn urlencoding_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

fn resolve_url(base: &str, href: &str) -> String {
    let href = href.trim();
    if href.starts_with("http://") || href.starts_with("https://") {
        return href.to_string();
    }
    if href.starts_with("//") {
        return format!("https:{}", href);
    }
    let base = base.trim_end_matches('/');
    if href.starts_with('/') {
        return format!("{}{}", VPFE_BASE, href);
    }
    format!("{}/{}", base, href)
}

fn extract_href_links(html: &str) -> Vec<String> {
    let mut links = Vec::new();
    let mut rest = html;
    while let Some(i) = rest.find("href=\"") {
        rest = &rest[i + 6..];
        if let Some(j) = rest.find('"') {
            let href = rest[..j].to_string();
            if !href.is_empty() && !href.starts_with('#') && !href.starts_with("javascript:") {
                links.push(href);
            }
            rest = &rest[j + 1..];
        } else {
            break;
        }
    }
    links
}

fn pick_download_url(links: &[&str], base: &str, kind: &str) -> Option<String> {
    let needles: &[&str] = match kind {
        "xml" => &[".xml", "xml", "downloadxml", "getxml", "attacheddocument"],
        _ => &[".pdf", "pdf", "downloadpdf", "getpdf"],
    };
    for href in links {
        let lower = href.to_lowercase();
        if needles.iter().any(|n| lower.contains(n)) {
            return Some(resolve_url(base, href));
        }
    }
    None
}

fn body_looks_like_xml(body: &str) -> bool {
    let t = body.trim_start();
    t.starts_with("<?xml") || t.contains(":Invoice") || t.contains("AttachedDocument")
}

fn fetch_text(client: &Client, url: &str) -> Result<(u16, String), String> {
    let res = client.get(url).send().map_err(|e| e.to_string())?;
    let status = res.status().as_u16();
    let text = res.text().map_err(|e| e.to_string())?;
    Ok((status, text))
}

fn fetch_bytes(client: &Client, url: &str) -> Result<(u16, Vec<u8>), String> {
    let res = client.get(url).send().map_err(|e| e.to_string())?;
    let status = res.status().as_u16();
    let bytes = res.bytes().map_err(|e| e.to_string())?.to_vec();
    Ok((status, bytes))
}

#[tauri::command]
pub fn fetch_dian_vpfe(cufe: String) -> DianVpfeResult {
    let cufe = cufe.trim().to_string();
    if cufe.len() < 64 {
        return DianVpfeResult {
            ok: false,
            status: 0,
            html: String::new(),
            xml: None,
            pdf_base64: None,
            pdf_url: None,
            xml_url: None,
            motivo: "CUFE inválido o incompleto".into(),
        };
    }

    let client = match Client::builder()
        .timeout(Duration::from_secs(50))
        .user_agent(UA)
        .redirect(reqwest::redirect::Policy::limited(8))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return DianVpfeResult {
                ok: false,
                status: 0,
                html: String::new(),
                xml: None,
                pdf_base64: None,
                pdf_url: None,
                xml_url: None,
                motivo: format!("Cliente HTTP: {}", e),
            };
        }
    };

    let url = search_url(&cufe);
    let (status, html) = match fetch_text(&client, &url) {
        Ok(v) => v,
        Err(e) => {
            return DianVpfeResult {
                ok: false,
                status: 0,
                html: String::new(),
                xml: None,
                pdf_base64: None,
                pdf_url: None,
                xml_url: None,
                motivo: format!("No se pudo consultar VPFE: {}", e),
            };
        }
    };

    if status >= 400 {
        return DianVpfeResult {
            ok: false,
            status,
            html,
            xml: None,
            pdf_base64: None,
            pdf_url: None,
            xml_url: None,
            motivo: format!("DIAN respondió HTTP {}", status),
        };
    }

    if body_looks_like_xml(&html) {
        return DianVpfeResult {
            ok: true,
            status,
            html: String::new(),
            xml: Some(html),
            pdf_base64: None,
            pdf_url: None,
            xml_url: Some(url),
            motivo: "XML UBL recibido".into(),
        };
    }

    let hrefs = extract_href_links(&html);
    let href_refs: Vec<&str> = hrefs.iter().map(|s| s.as_str()).collect();
    let xml_url = pick_download_url(&href_refs, &url, "xml");
    let pdf_url = pick_download_url(&href_refs, &url, "pdf");

    let mut xml: Option<String> = None;
    let mut pdf_base64: Option<String> = None;

    if let Some(ref xu) = xml_url {
        if let Ok((xs, body)) = fetch_text(&client, xu) {
            if xs < 400 && body_looks_like_xml(&body) {
                xml = Some(body);
            }
        }
    }

    if xml.is_none() {
        for href in &hrefs {
            let lower = href.to_lowercase();
            if lower.contains(".xml") || lower.contains("xml") {
                let u = resolve_url(&url, href);
                if let Ok((xs, body)) = fetch_text(&client, &u) {
                    if xs < 400 && body_looks_like_xml(&body) {
                        xml = Some(body);
                        break;
                    }
                }
            }
        }
    }

    if let Some(ref pu) = pdf_url {
        if let Ok((ps, bytes)) = fetch_bytes(&client, pu) {
            if ps < 400 && !bytes.is_empty() {
                use base64::Engine;
                pdf_base64 = Some(base64::engine::general_purpose::STANDARD.encode(&bytes));
            }
        }
    }

    let ok = xml.is_some() || pdf_base64.is_some() || html.len() > 200;
    let motivo = if xml.is_some() {
        "Factura electrónica XML descargada de DIAN".to_string()
    } else if pdf_base64.is_some() {
        "Representación PDF oficial descargada de DIAN".to_string()
    } else if ok {
        "Consulta DIAN OK — sin descarga automática (use Reanalizar o abra en DIAN)".to_string()
    } else {
        "Respuesta DIAN vacía o bloqueada — valide manualmente en el portal".to_string()
    };

    DianVpfeResult {
        ok,
        status,
        html,
        xml,
        pdf_base64,
        pdf_url,
        xml_url,
        motivo,
    }
}
