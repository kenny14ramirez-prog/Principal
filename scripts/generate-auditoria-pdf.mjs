/**
 * Genera PDF de auditoría Crozzo POS vs mercado Colombia (texto, multi-página).
 * Uso: node scripts/generate-auditoria-pdf.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "..", "docs", "AUDITORIA-CROZZO-POS-MERCADO-CO-2026-07.pdf");

const lines = [
  "CROZZO POS — AUDITORIA EXIGENTE VS MERCADO COLOMBIA",
  "Fecha: 2026-07-17 | Version sistema: v1.0.230 | Ambito: restaurante / tienda / hotel F&B ligero",
  "Fuente: codigo app/ + docs/maps + investigacion publica (Alegra, Siigo, Loggro, Vendty, Gestro, WARO, Scrampi)",
  "",
  "================================================================================",
  "1. VEREDICTO (DUENO EXIGENTE)",
  "================================================================================",
  "Crozzo no pierde por falta de ambicion: pierde por no cerrar el producto",
  "aburrido que el mercado colombiano ya da por hecho (DIAN one-shot, pagos",
  "digitales, turno estable). En offline/flota y food-cost esta por delante de",
  "Alegra y pelea con Loggro/Gestro. En madurez de caja diaria todavia NO es un",
  "reemplazo confiable de un SaaS pulido.",
  "",
  "Nota global Crozzo: 3.0 / 5.0",
  "Fortaleza max: Offline / resiliencia Colombia = 5/5",
  "Debilidad max: Pagos + delivery = 1/5 | Mantenibilidad monolito = 1/5",
  "",
  "================================================================================",
  "2. QUE TENEMOS HOY (INVENTARIO HONESTO)",
  "================================================================================",
  "",
  "2.1 Operacion Z0 (sala / caja / cocina)",
  "- Mesas, carrito multi-dispositivo, comandas, KDS/cocina, auto-print termico",
  "- Venta directa + modo mesas",
  "- Roles: caja, mesero, cocina, encargado, recepcion, inventario, admin",
  "- Perfiles: basico_restaurante, basico_tienda, basico_hotel (scaffold), personalizado",
  "- Juicio: FUERTE en diseno; FRAGIL en produccion (historial KI critical sync)",
  "",
  "2.2 Resiliencia Colombia (ventaja real)",
  "- Offline-first (IndexedDB + colas) + Supabase nube",
  "- LAN WebSocket/HTTP, gossip, BLE, Wi-Fi Direct, flota identity/QR, OTA Tauri/APK",
  "- Juicio: ventaja competitiva vs Alegra/Siigo cloud-only",
  "",
  "2.3 Fiscal / DIAN (parcial)",
  "- Validador NIT/DV, CUFE, guia FE, lookup adquiriente DIAN+RUES",
  "- Dock Dataico + DIAN VPFE; OCR recepcion FE de compras",
  "- Juicio: CAPAZ, no listo-y-olvidado como Alegra/Siigo habilitador nativo",
  "",
  "2.4 Backoffice",
  "- Compras, recepcion FE, costos/matriz MP, food cost, inventarios, reservorio",
  "- Planilla 2026 (propinas en cierre), cartera, federacion multi-sede (base)",
  "- Juicio: mas profundo que Alegra; menos contable que Siigo",
  "",
  "2.5 Stack",
  "- Frontend JS vanilla | Tauri+Rust | Supabase+IndexedDB | PosMain ~51.705 LOC",
  "- ~96 modulos + ~40 infra | Android APK + desktop",
  "",
  "================================================================================",
  "3. QUE NOS FALTA (GAPS QUE UN COMPETIDOR USARIA CONTRA NOSOTROS)",
  "================================================================================",
  "",
  "P0 — Documento equivalente + FE de venta one-shot en caja",
  "    Res. DIAN 000165: tiquete POS electron válido. Sin esto, demo fiscal pierde.",
  "",
  "P0 — Estabilidad sede (QA oro cerrado)",
  "    34 KI documentados; criticals en sync/cocina/caja. Un POS que casi sincroniza",
  "    es peor que uno simple que si cobra.",
  "",
  "P0 — Pasarela / datafono / Nequi-PSE en el cobro + conciliacion minima",
  "",
  "P1 — Integraciones delivery (Rappi/DiDi) y menu/pedido digital QR",
  "P1 — Contabilidad / export contador plug-and-play",
  "P1 — Time-to-value / onboarding SaaS (<1 dia vs minutos Alegra)",
  "P1 — Partir PosMain / reducir deuda (features vs regresiones)",
  "",
  "P2 — Cierre a ciegas + propinas operativas en caja (no solo planilla)",
  "P2 — Hotel PMS real (hoy scaffold F&B a proposito)",
  "P2 — Marketplace perifericos certificados CO",
  "",
  "================================================================================",
  "4. COMPARATIVA SCORES (0-5, CRITERIO ESTRICTO)",
  "================================================================================",
  "",
  "Dimension          Crozzo  Alegra  Siigo  Loggro  Gestro",
  "DIAN / FE             3       5      5      4       4",
  "Ops restaurante       4       2      3      4       5",
  "Offline CO            5       1      1      2       3",
  "Food cost             4       1      3      4       3",
  "Pagos / delivery      1       2      3      4       3",
  "Contabilidad          2       4      5      3       2",
  "Multi-sede            3       3      4      4       3",
  "UX madurez            2       4      4      4       4",
  "Mantenibilidad        1       4      4      3       3",
  "Time-to-value         2       5      4      3       4",
  "PROMEDIO            2.7     3.1    3.6    3.5     3.4",
  "",
  "(Nota: promedio simple; para CO ponderar DIAN+Offline+Ops con mas peso)",
  "Promedio ponderado CO (DIAN x2, Offline x2, Ops x2, resto x1):",
  "  Crozzo ~3.0 | Alegra ~3.0 | Siigo ~3.5 | Loggro ~3.6 | Gestro ~3.6",
  "",
  "================================================================================",
  "5. HEAD-TO-HEAD (COLOMBIA 2026)",
  "================================================================================",
  "",
  "vs Alegra: Ellos ganan formalizacion rapida y FE. Nosotros ganamos offline,",
  "           KDS/roles y food cost. En demo 'abre y factura' perdemos.",
  "",
  "vs Siigo Gastrobar: Ellos ganan contabilidad+DIAN marca. Nosotros ganamos",
  "           flota hibrida y profundidad operativa. Cadenas con contador Siigo",
  "           no nos eligen sin export contable serio.",
  "",
  "vs Loggro Restobar: Pelea directa. Ellos tienen delivery+soporte 24/7 y",
  "           producto maduro. Nosotros podemos superar en mesh offline si la",
  "           sede es inestable — solo si el sync deja de romper turnos.",
  "",
  "vs Gestro: Ellos venden Multi-KDS + LAN print + DIAN Taxxa pulido. Nosotros",
  "           tenemos mas backoffice (compras FE OCR, matriz costos). En UX de",
  "           turno ellos hoy se sienten mas 'producto'.",
  "",
  "vs WARO/Vendty/Scrampi: Espacio precio/food-cost/offline parcial. Crozzo",
  "           solo destaca si la historia de flota propia + OTA es clara y estable.",
  "",
  "Contexto normativo CO a no ignorar:",
  "- Res. 000165/2023 documento equivalente electronico POS",
  "- INC 8% restaurantes/bares; IVA 19% segun caso",
  "- Tope UVT para tiquete vs factura electronica de venta (exigir FE cuando aplique)",
  "- Habilitador tecnologico autorizado DIAN: requisito de mercado, no 'nice to have'",
  "",
  "================================================================================",
  "6. ROADMAP DE SUPERVIVENCIA (ORDEN)",
  "================================================================================",
  "",
  "P0 (4-8 semanas foco unico):",
  "  1) QA sede checklist tienda P0 en verde REAL (multi-dispositivo)",
  "  2) FE / doc. equivalente de venta confiable en flujo Cobrar",
  "  3) Al menos un medio digital conciliable (datafono o Nequi/PSE)",
  "  4) Cero critical sync abiertos en cocina/caja en sede piloto",
  "",
  "P1 (siguiente trimestre):",
  "  1) Onboarding < 1 dia",
  "  2) Export contable",
  "  3) Menu/pedido digital + 1 aggregator",
  "  4) Modularizar PosMain por dominio (dejar de crecer el monolito)",
  "",
  "P2 (diferenciacion):",
  "  Federacion multi-sede con metricas, cierre a ciegas, propinas en caja,",
  "  analytics dueno, perifericos certificados CO.",
  "",
  "================================================================================",
  "7. RIESGOS SI NO ACTUAMOS",
  "================================================================================",
  "- Quedar como 'POS laboratorio' admirable pero no vendible en CO formal.",
  "- Competidores SaaS cierran el hueco offline con 'modo offline' suficiente.",
  "- Cada feature nueva sobre PosMain 51k aumenta probabilidad de regresion en turno.",
  "- Sin DIAN one-shot, el dueño formaliza con Alegra/Siigo y nos usa solo de cocina.",
  "",
  "================================================================================",
  "8. CONCLUSION",
  "================================================================================",
  "Crozzo ya es un sistema operativo de sede ambicioso para Colombia, no un POS",
  "juguete. La exigencia correcta no es 'mas modulos': es cerrar DIAN+cobro+sync",
  "hasta que un turno sabado noche sea aburrido. Aburrido = profesional.",
  "Solo despues tiene sentido pelear delivery, contabilidad y multi-sede a escala.",
  "",
  "— Fin del informe —",
];

function escapePdfText(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPdf(textLines) {
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 48;
  const fontSize = 9;
  const leading = 12;
  const maxLines = Math.floor((pageHeight - margin * 2) / leading);

  const pages = [];
  for (let i = 0; i < textLines.length; i += maxLines) {
    pages.push(textLines.slice(i, i + maxLines));
  }

  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };

  const catalogId = 1;
  const pagesId = 2;
  // Reserve: 1 catalog, 2 pages, then per page: page, content
  // We'll rebuild with known IDs
  const pageIds = [];
  const contentIds = [];
  let nextId = 3;
  for (let p = 0; p < pages.length; p++) {
    pageIds.push(nextId++);
    contentIds.push(nextId++);
  }
  const fontId = nextId++;

  const contentStreams = pages.map((pageLines) => {
    let ops = "BT\n/F1 " + fontSize + " Tf\n";
    let y = pageHeight - margin;
    for (const line of pageLines) {
      ops += "1 0 0 1 " + margin + " " + y + " Tm\n(" + escapePdfText(line) + ") Tj\n";
      y -= leading;
    }
    ops += "ET";
    return ops;
  });

  const xrefOffsets = [];
  let pdf = "%PDF-1.4\n";

  const writeObj = (id, body) => {
    xrefOffsets[id] = Buffer.byteLength(pdf, "utf8");
    pdf += id + " 0 obj\n" + body + "\nendobj\n";
  };

  writeObj(
    catalogId,
    "<< /Type /Catalog /Pages " + pagesId + " 0 R >>"
  );
  writeObj(
    pagesId,
    "<< /Type /Pages /Kids [" +
      pageIds.map((id) => id + " 0 R").join(" ") +
      "] /Count " +
      pages.length +
      " >>"
  );

  for (let i = 0; i < pages.length; i++) {
    writeObj(
      pageIds[i],
      "<< /Type /Page /Parent " +
        pagesId +
        " 0 R /MediaBox [0 0 " +
        pageWidth +
        " " +
        pageHeight +
        "] /Contents " +
        contentIds[i] +
        " 0 R /Resources << /Font << /F1 " +
        fontId +
        " 0 R >> >> >>"
    );
    const stream = contentStreams[i];
    writeObj(
      contentIds[i],
      "<< /Length " + Buffer.byteLength(stream, "utf8") + " >>\nstream\n" + stream + "\nendstream"
    );
  }

  writeObj(fontId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const xrefStart = Buffer.byteLength(pdf, "utf8");
  const maxId = fontId;
  pdf += "xref\n0 " + (maxId + 1) + "\n";
  pdf += "0000000000 65535 f \n";
  for (let id = 1; id <= maxId; id++) {
    pdf += String(xrefOffsets[id]).padStart(10, "0") + " 00000 n \n";
  }
  pdf += "trailer\n<< /Size " + (maxId + 1) + " /Root " + catalogId + " 0 R >>\n";
  pdf += "startxref\n" + xrefStart + "\n%%EOF\n";
  return pdf;
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, buildPdf(lines), "utf8");
console.log("Wrote", outPath);
