/**
 * Parser FE portable (Node entrenamiento / pruebas).
 * Mantener alineado con app/modules/CrozzoRecepcionFeDian.js (probe + emisor).
 */

export function normNit(raw) {
  return String(raw || '')
    .replace(/[\s.]/g, '')
    .replace(/-/g, '')
    .toUpperCase();
}

export function feSlugKey(str) {
  return String(str || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export function supplierSlugFromFilename(name) {
  const base = String(name || '').replace(/^.*[/\\]/, '');
  const m = base.match(/^\d{4}-\d{2}-\d{2}_(.+?)_[a-f0-9]{6,16}\.pdf$/i);
  return m ? feSlugKey(m[1].replace(/__/g, '_')) : feSlugKey(base.replace(/\.pdf$/i, ''));
}

export function razonSocialFromFilename(nombre) {
  const base = String(nombre || '')
    .replace(/^.*[/\\]/, '')
    .replace(/\.(pdf|jpg|jpeg|png|webp)$/i, '');
  let m = base.match(/^\d{4}-\d{2}-\d{2}_(.+?)_[a-f0-9]{6,16}$/i);
  if (m) return m[1].replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  m = base.match(/^(.+?)_[a-f0-9]{6,16}$/i);
  if (m && m[1].length >= 4) return m[1].replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return '';
}

export function normNombreCmp(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .replace(/[^A-ZÁÉÍÓÚÑ0-9 ]/g, '');
}

export function nombresCoinciden(a, b) {
  const na = normNombreCmp(a);
  const nb = normNombreCmp(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const words = nb.split(/\s+/).filter((w) => w.length > 3);
  if (!words.length) return false;
  const hits = words.filter((w) => na.includes(w));
  return hits.length >= Math.max(1, Math.ceil(words.length * 0.5));
}

export function feExtractNitsFromText(text) {
  const out = [];
  const seen = {};
  text = String(text || '');
  function addNit(raw) {
    const n = normNit(raw);
    if (!n || n.length < 8) return;
    if (seen[n]) return;
    seen[n] = true;
    out.push(n);
  }
  const rePrefixed =
    /(?:NIT|N\.I\.T\.?|Emisor|Proveedor|Vendedor)[:\s#.]*([0-9]{3}\.?[0-9]{3}\.?[0-9]{3}[-–]?[0-9Kk]?)/gi;
  let m;
  while ((m = rePrefixed.exec(text))) addNit(m[1]);
  const reFormato = /\b([0-9]{3}\.[0-9]{3}\.[0-9]{3}[-–][0-9Kk])\b/g;
  while ((m = reFormato.exec(text))) addNit(m[1]);
  const reNuda = /\b([0-9]{9,11})\b/g;
  while ((m = reNuda.exec(text))) {
    if (m[1].length >= 9 && m[1].length <= 11) addNit(m[1]);
  }
  return out;
}

export function parseCopAmount(raw) {
  if (raw == null || raw === '') return 0;
  let s = String(raw).trim().replace(/\$/g, '').replace(/\s/g, '');
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.indexOf(',') >= 0 && s.indexOf('.') < 0) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export function feEmisorZoneText(text) {
  text = String(text || '');
  const splitRe =
    /\b(?:ADQUIRIENTE|COMPRADOR|CLIENTE|DESTINATARIO|FACTURAR\s+A|SEÑOR(?:ES)?|DATOS\s+DEL\s+(?:CLIENTE|COMPRADOR|ADQUIRIENTE)|INFORMACI[ÓO]N\s+DEL\s+COMPRADOR|DATOS\s+DEL\s+ADQUIRIENTE|NOMBRE\s+DEL\s+CLIENTE)\b/i;
  const idx = text.search(splitRe);
  if (idx > 40) return text.slice(0, idx);
  const p1 = text.split(/\n---\s*p\d+\s*---\n/i)[0];
  return p1 || text;
}

export function parseFeFromText(text) {
  text = String(text || '');
  const flat = text.replace(/\s+/g, ' ');
  const out = {
    nitEmisor: '',
    razonSocial: '',
    numeroFactura: '',
    total: 0,
    nitReceptor: '',
    nombreReceptor: '',
    cufe: '',
    tipoDocumento: '',
    _razonSocialExplicit: false,
  };

  const nitM =
    flat.match(/NIT[:\s#.]*([0-9]{3}\.?[0-9]{3}\.?[0-9]{3}[-\u2013]?[0-9Kk])/i) ||
    flat.match(/(?:Emisor|Proveedor|Vendedor)[^0-9]{0,30}([0-9]{3}\.?[0-9]{3}\.?[0-9]{3}[-\u2013]?[0-9Kk]?)/i);
  if (nitM) out.nitEmisor = nitM[1].replace(/[\s.]/g, '');

  const rsM =
    flat.match(/Raz[o\u00f3]n\s+social[:\s]*([^|\n]{4,80}?)(?:\s{2,}|\s+NIT|\s+DV|\s+CUFE|$)/i) ||
    flat.match(/Nombre\s+(?:o\s+)?raz[o\u00f3]n\s+social[:\s]*([^|\n]{4,80}?)(?:\s{2,}|\s+NIT|\s+DV|$)/i) ||
    flat.match(/Emisor[:\s]+([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ0-9 .,&\-]{4,70}?)(?:\s{2,}|\s+NIT|\s+CUFE|$)/i);
  if (rsM) {
    out.razonSocial = rsM[1].trim().replace(/\s{2,}/g, ' ');
    out._razonSocialExplicit = true;
  }

  const nitRec =
    flat.match(/(?:Adquiriente|Comprador|Cliente|Receptor)[^0-9]{0,30}([0-9]{3}\.?[0-9]{3}\.?[0-9]{3}[-\u2013]?[0-9Kk]?)/i);
  if (nitRec) out.nitReceptor = nitRec[1].replace(/[\s.]/g, '');

  const totM =
    flat.match(/Total\s+a\s+pagar[:\s]*\$?\s*([\d.,]+)/i) ||
    flat.match(/TOTAL\s*\$?\s*([\d.,]+)/i);
  if (totM) out.total = parseCopAmount(totM[1]);

  if (/factura\s+electr[oó]nica/i.test(flat)) out.tipoDocumento = 'factura-electronica';
  else if (/factura/i.test(flat)) out.tipoDocumento = 'factura';

  const cufeM = flat.match(/\b([0-9a-fA-F]{64,96})\b/);
  if (cufeM) out.cufe = cufeM[1];

  return out;
}

function feBlockLooksLikeProduct(s) {
  s = String(s || '').trim();
  if (!s || s.length < 4) return true;
  if (/\$|[\d]{1,3}[.,][\d]{2,}/.test(s)) return true;
  if (/\b(kg|gr|und|unid|cant|subtotal)\b/i.test(s)) return true;
  return false;
}

export function feBlocksEmisorNombre(blocks) {
  blocks = blocks || [];
  const p1 = [];
  let pageH = 0;
  for (let bi = 0; bi < blocks.length; bi++) {
    const b = blocks[bi];
    if (b.page !== 1) continue;
    if (b.pageH) pageH = b.pageH;
    const s = String(b.text || '').trim();
    if (s.length < 4 || s.length > 90 || feBlockLooksLikeProduct(s)) continue;
    if (/factura|nit|cufe|cliente|adquiriente|comprador|total|dian/i.test(s)) continue;
    p1.push({ text: s, h: b.h || 0, y: b.y || 0, idx: bi });
  }
  if (!p1.length) return '';
  const yCut = pageH ? pageH * 0.62 : 0;
  let nitIdx = p1.length;
  for (let ni = 0; ni < p1.length; ni++) {
    if (/^NIT\b|N\.I\.T/i.test(p1[ni].text)) {
      nitIdx = ni;
      break;
    }
  }
  let best = '';
  let bestScore = -1;
  for (let ci = 0; ci < p1.length; ci++) {
    const cand = p1[ci];
    const t = cand.text.replace(/\s{2,}/g, ' ').trim();
    if (yCut && cand.y < yCut) continue;
    if (cand.idx > nitIdx + 10) continue;
    let score = (cand.h || 0) * 2;
    if (cand.idx <= nitIdx + 2) score += 40;
    if (/S\.?A\.?S|LTDA|S\.?A\.|E\.U\.|INC|CIA\b/i.test(t)) score += 25;
    if (/[A-ZÁÉÍÓÚÑ]{4,}/.test(t)) score += 10;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

export function enrichFeProveedor(fe, pack, meta) {
  fe = fe || {};
  pack = pack || {};
  meta = meta || {};
  const text = pack.text || '';
  const emisorText = feEmisorZoneText(text);
  const feDoc = { ...fe };
  const feEm = parseFeFromText(emisorText);
  const out = { ...feDoc, ...feEm };

  if (feEm.nitEmisor) out.nitEmisor = feEm.nitEmisor;
  if (feEm._razonSocialExplicit && feEm.razonSocial) {
    out.razonSocial = feEm.razonSocial;
    out._razonSocialExplicit = true;
  } else if (feEm.razonSocial && !out.razonSocial) {
    out.razonSocial = feEm.razonSocial;
  }

  const blockName = feBlocksEmisorNombre(pack.blocks || []);
  if (blockName && !out.razonSocial) out.razonSocial = blockName;

  if (!out.razonSocial && meta.nombreArchivo) {
    out.razonSocial = razonSocialFromFilename(meta.nombreArchivo);
    if (out.razonSocial) out.razonSocial = out.razonSocial.toUpperCase();
  }

  if (out.nitEmisor && out.nitReceptor && normNit(out.nitEmisor) === normNit(out.nitReceptor)) {
    const emisorNits = feExtractNitsFromText(emisorText);
    const rec = normNit(out.nitReceptor);
    for (const n of emisorNits) {
      if (normNit(n) !== rec) {
        out.nitEmisor = n;
        break;
      }
    }
  }
  if (!out.nitEmisor) {
    const emisorNits = feExtractNitsFromText(emisorText);
    const rec = out.nitReceptor ? normNit(out.nitReceptor) : '';
    for (const n of emisorNits) {
      if (!rec || normNit(n) !== rec) {
        out.nitEmisor = n;
        break;
      }
    }
  }

  return out;
}

export function classifyProbeResult(pack, fe) {
  const textLen = pack.textLen || String(pack.text || '').replace(/\s/g, '').length;
  if (pack.likelyScanned && textLen < 80) return 'escaneada-sin-texto';
  if (fe.cufe && textLen > 80) return 'fe-texto-pdf';
  if (fe.cufe) return 'fe-ocr';
  if (/catalogo-vpfe\.dian\.gov\.co/i.test(pack.text || '')) return 'fe-qr';
  if (textLen > 120) return 'texto-sin-cufe';
  return 'sin-fe-detectada';
}

export function tokensFromNombre(nombre) {
  return String(nombre || '')
    .toUpperCase()
    .replace(/[^A-ZÁÉÍÓÚÑ0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !/^(DEL|LOS|LAS|DE|LA|EL|Y|SAS|LTDA|CIA)$/.test(w));
}
