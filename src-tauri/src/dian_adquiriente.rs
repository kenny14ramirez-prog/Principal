//! Consulta de adquiriente vía SOAP DIAN GetAcquirer (cualquier NIT/CC con certificado .p12).
//! Guía: https://www.dian.gov.co/impuestos/factura-electronica/Documents/Guia-Herramienta-para-el-Consumo-de-Web-Services.pdf

use base64::Engine;
use reqwest::blocking::Client;
use serde::Serialize;
use std::time::Duration;

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CrozzoPOS/1.0";
const SOAP_ACTION: &str = "http://wcf.dian.colombia/IWcfDianCustomerServices/GetAcquirer";
const URL_PROD: &str = "https://vpfe.dian.gov.co/WcfDianCustomerServices.svc";
const URL_HAB: &str = "https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc";

#[derive(Serialize, Clone)]
pub struct DianAdquirienteResult {
    pub ok: bool,
    pub name: Option<String>,
    pub nombre: Option<String>,
    pub email: Option<String>,
    pub correo: Option<String>,
    pub ciudad: Option<String>,
    pub direccion: Option<String>,
    pub motivo: String,
}

fn hit(name: &str, email: &str, motivo: &str) -> DianAdquirienteResult {
    DianAdquirienteResult {
        ok: true,
        name: Some(name.to_string()),
        nombre: Some(name.to_string()),
        email: Some(email.to_string()),
        correo: Some(email.to_string()),
        ciudad: None,
        direccion: None,
        motivo: motivo.into(),
    }
}

fn miss(msg: &str) -> DianAdquirienteResult {
    DianAdquirienteResult {
        ok: false,
        name: None,
        nombre: None,
        email: None,
        correo: None,
        ciudad: None,
        direccion: None,
        motivo: msg.into(),
    }
}

fn decode_xml_entities(s: &str) -> String {
    s.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
}

fn extract_tag_value(xml: &str, local_name: &str) -> Option<String> {
    let lower = xml.to_lowercase();
    let tag = local_name.to_lowercase();
    let mut search_from = 0usize;
    while search_from < lower.len() {
        let rest = &lower[search_from..];
        let pos = rest.find(&format!(":{}>", tag)).or_else(|| rest.find(&format!("<{}>", tag)))?;
        let abs = search_from + pos;
        let after_open = &xml[abs..];
        let gt = after_open.find('>')?;
        let val_start = gt + 1;
        let val_rest = &after_open[val_start..];
        let close_lt = val_rest.find('<')?;
        let raw = val_rest[..close_lt].trim();
        if !raw.is_empty() {
            return Some(decode_xml_entities(raw));
        }
        search_from = abs + 1;
    }
    None
}

fn build_get_acquirer_envelope(id_type: &str, id_number: &str) -> String {
    format!(
        r#"<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:wcf="http://wcf.dian.colombia">
  <soap:Header/>
  <soap:Body>
    <wcf:GetAcquirer>
      <wcf:identificationType>{}</wcf:identificationType>
      <wcf:identificationNumber>{}</wcf:identificationNumber>
    </wcf:GetAcquirer>
  </soap:Body>
</soap:Envelope>"#,
        id_type, id_number
    )
}

fn build_http_client(p12_base64: Option<&str>, p12_password: Option<&str>) -> Result<Client, String> {
    let mut builder = Client::builder()
        .timeout(Duration::from_secs(50))
        .user_agent(UA)
        .redirect(reqwest::redirect::Policy::limited(4));

    if let (Some(b64), Some(pass)) = (p12_base64, p12_password) {
        let b64 = b64.trim();
        let pass = pass.trim();
        if !b64.is_empty() && !pass.is_empty() {
            let der = base64::engine::general_purpose::STANDARD
                .decode(b64)
                .map_err(|e| format!("No se pudo leer el certificado P12: {}", e))?;
            let identity = reqwest::Identity::from_pkcs12_der(&der, pass)
                .map_err(|e| format!("Certificado P12 inválido o contraseña incorrecta: {}", e))?;
            builder = builder.identity(identity);
        }
    }

    builder.build().map_err(|e| format!("Cliente HTTP: {}", e))
}

fn parse_get_acquirer_response(body: &str) -> Result<DianAdquirienteResult, String> {
    let lower = body.to_lowercase();
    if lower.contains("receivernamenotfound") || lower.contains("no se encontr") {
        return Err("DIAN no tiene registro para ese documento".into());
    }
    if lower.contains("fault") || lower.contains("not authorized") || lower.contains("no autorizado") {
        let fault = extract_tag_value(body, "faultstring")
            .or_else(|| extract_tag_value(body, "Message"))
            .or_else(|| extract_tag_value(body, "motivo"))
            .unwrap_or_else(|| "Error de autenticación o permisos DIAN".into());
        return Err(fault);
    }

    let status = extract_tag_value(body, "StatusCode").unwrap_or_default();
    if !status.is_empty() && status != "0" && status.to_lowercase() != "ok" && status != "200" {
        let msg = extract_tag_value(body, "StatusMessage")
            .or_else(|| extract_tag_value(body, "StatusDescription"))
            .unwrap_or_else(|| format!("DIAN respondió código {}", status));
        return Err(msg);
    }

    let name = extract_tag_value(body, "ReceiverName")
        .or_else(|| extract_tag_value(body, "RegistrationName"))
        .or_else(|| extract_tag_value(body, "ReceiverBusinessName"))
        .or_else(|| extract_tag_value(body, "Name"));

    let email = extract_tag_value(body, "ReceiverEmail")
        .or_else(|| extract_tag_value(body, "ElectronicMail"))
        .or_else(|| extract_tag_value(body, "Email"));

    let name = name.filter(|s| !s.trim().is_empty());
    if name.is_none() {
        return Err("DIAN respondió sin nombre de adquiriente".into());
    }

    Ok(hit(
        name.as_deref().unwrap_or(""),
        email.as_deref().unwrap_or(""),
        "Consulta DIAN GetAcquirer",
    ))
}

fn lookup_dian_soap(
    id_type: &str,
    id_number: &str,
    p12_base64: Option<&str>,
    p12_password: Option<&str>,
    use_hab: bool,
) -> Result<DianAdquirienteResult, String> {
    let has_cert = p12_base64
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
        && p12_password.map(|s| !s.trim().is_empty()).unwrap_or(false);

    if !has_cert {
        return Err(
            "Cargue el certificado .p12 de su empresa (Configuración → Certificado) para consultar cualquier NIT en DIAN"
                .into(),
        );
    }

    let url = if use_hab { URL_HAB } else { URL_PROD };
    let client = build_http_client(p12_base64, p12_password)?;
    let envelope = build_get_acquirer_envelope(id_type, id_number);

    let res = client
        .post(url)
        .header(
            "Content-Type",
            format!(
                "application/soap+xml; charset=utf-8; action=\"{}\"",
                SOAP_ACTION
            ),
        )
        .body(envelope)
        .send()
        .map_err(|e| format!("No se pudo conectar con DIAN: {}", e))?;

    let status = res.status().as_u16();
    let body = res
        .text()
        .map_err(|e| format!("Error leyendo respuesta DIAN: {}", e))?;

    if status >= 400 {
        return Err(format!(
            "DIAN HTTP {} — {}",
            status,
            body.chars().take(280).collect::<String>()
        ));
    }

    parse_get_acquirer_response(&body)
}

/// Solo números oficiales de habilitación DIAN (anexo guía FE).
fn lookup_hab_demo(digits: &str) -> Option<DianAdquirienteResult> {
    match digits {
        "3199991" => Some(hit(
            "Nombre NIT 1 (prueba DIAN)",
            "mail_nit1@prueba.dian",
            "DIAN habilitación (demo oficial)",
        )),
        "3199992" => Some(hit(
            "Nombre NIT 2 (prueba DIAN)",
            "mail_nit2@prueba.dian",
            "DIAN habilitación (demo oficial)",
        )),
        "3199993" => Some(hit(
            "Nombre NIT 3 (prueba DIAN)",
            "mail_nit3@prueba.dian",
            "DIAN habilitación (demo oficial)",
        )),
        "1399991" => Some(hit(
            "Nombre Cédula de ciudadanía 1",
            "mail_cc1@prueba.dian",
            "DIAN habilitación (demo oficial)",
        )),
        _ => None,
    }
}

#[tauri::command]
pub fn fetch_dian_adquiriente(
    scheme_name: String,
    identification: String,
    dv: Option<String>,
    p12_base64: Option<String>,
    p12_password: Option<String>,
    use_hab: Option<bool>,
) -> DianAdquirienteResult {
    let id_type = scheme_name.trim();
    let id_type = if id_type.is_empty() { "31" } else { id_type };
    let base: String = identification
        .chars()
        .filter(|c| c.is_ascii_digit())
        .collect();
    if base.len() < 4 {
        return miss("Documento demasiado corto");
    }

    let _dv = dv.unwrap_or_default();
    let use_hab = use_hab.unwrap_or(false);

    match lookup_dian_soap(
        id_type,
        base.as_str(),
        p12_base64.as_deref(),
        p12_password.as_deref(),
        use_hab,
    ) {
        Ok(r) => r,
        Err(e) => {
            if use_hab {
                if let Some(demo) = lookup_hab_demo(base.as_str()) {
                    return demo;
                }
            }
            miss(&e)
        }
    }
}
