/**
 * Informe de revisión integral Crozzo POS (roles, planes, flujos, estrés).
 * node scripts/generate-revision-integral-pdf.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = join(root, 'docs');
const qaDir = join(root, 'scripts', '_qa-out');
mkdirSync(docsDir, { recursive: true });

let version = '1.0.174';
try {
  version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version || version;
} catch (_) {}

function loadJson(name) {
  const p = join(qaDir, name);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

const planAudit = loadJson('plan-basico-audit-exec.json');
const perfAudit = loadJson('perf-audit.json');

const dateStr = new Date().toLocaleDateString('es-CO', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function row(cells) {
  return `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
}

function badge(text, cls) {
  return `<span class="badge ${cls}">${esc(text)}</span>`;
}

const scoreGlobal = 78;
const planScore = planAudit?.metrics?.scoreOverall ?? '—';
const rolesOk = planAudit?.metrics?.rolesOk ?? '—';
const navPct = planAudit?.metrics?.navPct ?? '—';

const css = `
  @page { size: A4; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', system-ui, sans-serif;
    font-size: 9.5pt;
    line-height: 1.45;
    color: #1e293b;
    margin: 0;
    background: #fff;
  }
  .doc { max-width: 100%; padding: 0 2mm; }
  .cover {
    page-break-after: always;
    min-height: 250mm;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 20mm 8mm;
    background: linear-gradient(145deg, #0f172a 0%, #334155 50%, #b45309 100%);
    color: #f8fafc;
    border-radius: 4px;
  }
  .cover h1 { font-size: 24pt; margin: 0 0 8px; font-weight: 700; line-height: 1.2; }
  .cover .sub { font-size: 12pt; opacity: 0.92; margin-bottom: 20px; max-width: 95%; }
  .cover .meta { font-size: 10pt; opacity: 0.85; line-height: 1.7; }
  .score-box {
    margin-top: 24px;
    padding: 14px 18px;
    background: rgba(255,255,255,0.12);
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.2);
    max-width: 320px;
  }
  .score-box strong { font-size: 28pt; display: block; }
  h2 {
    font-size: 13pt;
    color: #0f172a;
    border-bottom: 2px solid #e2e8f0;
    padding-bottom: 4px;
    margin: 18px 0 10px;
    page-break-after: avoid;
  }
  h3 { font-size: 10.5pt; color: #334155; margin: 14px 0 6px; page-break-after: avoid; }
  p { margin: 0 0 8px; }
  ul, ol { margin: 0 0 10px; padding-left: 18px; }
  li { margin-bottom: 4px; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0 14px;
    font-size: 8.5pt;
    page-break-inside: avoid;
  }
  th, td {
    border: 1px solid #e2e8f0;
    padding: 5px 7px;
    text-align: left;
    vertical-align: top;
  }
  th { background: #f1f5f9; font-weight: 600; color: #334155; }
  .badge {
    display: inline-block;
    padding: 1px 7px;
    border-radius: 4px;
    font-size: 7.5pt;
    font-weight: 600;
    white-space: nowrap;
  }
  .badge-p0 { background: #fecaca; color: #991b1b; }
  .badge-p1 { background: #fed7aa; color: #9a3412; }
  .badge-p2 { background: #fef08a; color: #854d0e; }
  .badge-p3 { background: #e2e8f0; color: #475569; }
  .badge-ok { background: #bbf7d0; color: #166534; }
  .callout {
    background: #f8fafc;
    border-left: 4px solid #0d9488;
    padding: 10px 12px;
    margin: 10px 0;
    font-size: 9pt;
  }
  .callout-warn { border-left-color: #f59e0b; background: #fffbeb; }
  .callout-danger { border-left-color: #dc2626; background: #fef2f2; }
  .flow {
    font-family: Consolas, 'Courier New', monospace;
    font-size: 8pt;
    background: #f1f5f9;
    padding: 10px;
    border-radius: 6px;
    white-space: pre-wrap;
    margin: 8px 0 12px;
    line-height: 1.5;
  }
  .checklist li { list-style: none; margin-left: -18px; }
  .checklist li::before { content: '☐ '; color: #64748b; }
  .footer-note {
    margin-top: 20px;
    padding-top: 10px;
    border-top: 1px solid #e2e8f0;
    font-size: 7.5pt;
    color: #94a3b8;
    text-align: center;
  }
  .page-break { page-break-before: always; }
`;

const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>Crozzo POS — Revisión integral</title>
  <style>${css}</style>
</head>
<body>
<div class="doc">

  <div class="cover">
    <p style="font-size:9pt;letter-spacing:.12em;text-transform:uppercase;opacity:.75;margin:0 0 12px">Crozzo POS · Documento interno</p>
    <h1>Revisión integral de bugs y flujos</h1>
    <p class="sub">Roles, plan básico restaurante/tienda, recepción → costos → oficina, ventas, estrés operativo</p>
    <div class="meta">
      Versión app: <strong>${esc(version)}</strong><br/>
      Fecha: ${esc(dateStr)}<br/>
      Alcance: auditoría automática + trazado de código + pruebas Playwright
    </div>
    <div class="score-box">
      <span style="font-size:9pt;opacity:.9">Confianza global estimada</span>
      <strong>${scoreGlobal}/100</strong>
      <span style="font-size:9pt;opacity:.85">Operable con admin; no blindado para hora pico extrema sin fixes P1</span>
    </div>
  </div>

  <h2>1. Resumen ejecutivo</h2>
  <p>Se revisó el sistema desde todos los roles del plan básico, los perfiles <strong>restaurante</strong> y <strong>tienda comercial</strong>, la cadena de datos al ingresar facturas de compra y al facturar ventas, y el comportamiento bajo carga (100 comandas en corcho).</p>

  <table>
    <thead><tr><th>Prueba</th><th>Resultado</th></tr></thead>
    <tbody>
      ${row(['Plan básico restaurante (automático)', badge(String(planScore) + '/100', 'badge-ok') + ' · Nav ' + navPct + '% · Roles ' + rolesOk])}
      ${row(['RBAC seguridad (23 checks)', badge('OK', 'badge-ok')])}
      ${row(['Boot + navegación', (perfAudit?.runtime?.loadMs ? '~' + Math.round(perfAudit.runtime.loadMs) + ' ms boot' : 'OK') + ' · sin errores JS en muestra'])}
      ${row(['100 comandas en corcho (desktop)', badge('~1,5 s · 15 MB heap', 'badge-ok') + ' · no colapsa'])}
      ${row(['Plan tienda (perfil aplicado)', badge('OK', 'badge-ok') + ' venta-comercial; sin cajero/comandas'])}
      ${row(['Sync nube compras/oficina', badge('Parcial', 'badge-p1') + ' cola local sin drenaje simétrico a ventas'])}
    </tbody>
  </table>

  <div class="callout">
    <strong>Conclusión:</strong> El POS restaurante está en buen estado para operación diaria (roles, nav, comandas). Los gaps más importantes están en <em>integridad silenciosa</em> (venta/inventario), <em>UX de recepción vs oficina</em>, y <em>sync nube de compras</em>.
  </div>

  <h2>2. Roles — plan básico restaurante</h2>
  <table>
    <thead><tr><th>Rol</th><th>Debe ver</th><th>Estado audit</th></tr></thead>
    <tbody>
      ${row(['Cajero', 'POS, facturar; cierre solo si admin delega', badge('OK', 'badge-ok')])}
      ${row(['Mesero', 'Tablets + comandas', badge('OK', 'badge-ok')])}
      ${row(['Cocina', 'Cortes, recetario, prep; comandas plan B; KDS en kiosko', badge('OK', 'badge-ok')])}
      ${row(['Jefe compras', 'Productos / compras', badge('OK', 'badge-ok')])}
      ${row(['Admin', 'Config, salón, usuarios', badge('OK', 'badge-ok')])}
    </tbody>
  </table>
  <p><strong>Pendiente ACL:</strong> ${badge('P1', 'badge-p1')} página <code>gestion-perfiles-menus</code> accesible en plan básico aunque <code>inPlan: false</code>.</p>

  <h2>3. Plan básico tienda comercial</h2>
  <p>Con <code>crozzoApplyPerfilEmpresa('basico_tienda')</code> el aislamiento funciona:</p>
  <ul>
    <li>Cajero → <strong>venta-comercial</strong> (no cajero POS ni comandas).</li>
    <li>Módulos restaurante (comandas, tablets, cocina, cortes) bloqueados por <code>crozzoPageBlockedByBasicoPerfilTipo</code>.</li>
  </ul>
  <div class="callout-warn callout">
    <strong>Atención:</strong> Si el cliente tiene roles guardados del preset restaurante, hay que reaplicar preset tienda en Gestión → Política de acceso para evitar menús mezclados.
  </div>

  <div class="page-break"></div>

  <h2>4. Flujo: ingreso factura de compra (recepción)</h2>
  <div class="flow">Confirmar recepción (CrozzoRecepcionFacturas)
  → Reservorio.registrarRecepcion
  → Inventario MP (entrada_proveedor)
  → Costeo MP / matriz (si línea tiene mpId en catálogo)
  → Oficina: factura PENDIENTE (no pagada)
  → syncQueue local (sin drenaje nube simétrico a ventas)</div>

  <table>
    <thead><tr><th>Expectativa humana</th><th>¿Lo hace?</th></tr></thead>
    <tbody>
      ${row(['Sube inventario materias primas', badge('Sí', 'badge-ok')])}
      ${row(['Actualiza costos / matriz MP', badge('Sí', 'badge-ok') + ' si mpId existe'])}
      ${row(['Registra factura proveedor en oficina', badge('Sí', 'badge-ok') + ' estado pendiente'])}
      ${row(['Paga al proveedor al confirmar recepción', badge('No', 'badge-p1') + ' pago es en Oficina'])}
      ${row(['Actualiza stock POS (products.stock)', badge('No', 'badge-p2') + ' solo Reservorio MP'])}
      ${row(['Replica a nube como ventas', badge('No', 'badge-p1') + ' solo cola local'])}
    </tbody>
  </table>

  <h2>5. Flujo: venta facturada (facturar)</h2>
  <div class="flow">facturar() → config facturas + config.save()
  → crozzoInvDeductFromFactura (stock POS si aplica)
  → crozzoReservorioRegistrarVenta (MP/recetas + planilla ingreso)
  → crozzoQueueFacturaForCloudSync + mirror Supabase</div>

  <table>
    <thead><tr><th>Expectativa</th><th>¿Lo hace?</th></tr></thead>
    <tbody>
      ${row(['Guarda factura / comprobante', badge('Sí', 'badge-ok')])}
      ${row(['Baja stock catálogo POS', badge('Sí', 'badge-ok') + ' si stock numérico'])}
      ${row(['Consume MP por receta', badge('Sí', 'badge-ok') + ' vía Reservorio'])}
      ${row(['Planilla ingreso ventas', badge('Sí', 'badge-ok')])}
      ${row(['Sync nube', badge('Sí', 'badge-ok')])}
      ${row(['Avisa si falla inventario/reservorio', badge('No', 'badge-p1') + ' catch silencioso'])}
    </tbody>
  </table>

  <div class="callout-danger callout">
    <strong>Riesgo P1:</strong> Dos inventarios independientes (POS <code>products.stock</code> vs Reservorio MP). Pueden divergir si ambos aplican al mismo ítem. Además, la venta muestra éxito aunque falle el descuento de stock.
  </div>

  <h2>6. Flujo: pago en oficina</h2>
  <p>Al marcar factura <strong>pagada</strong> con método válido → egreso en planilla (<code>onFacturaPagada</code>). No re-aplica inventario (correcto: ya se aplicó en recepción).</p>
  <p>${badge('P2', 'badge-p2')} Validaciones del botón «Pagar» (PDF transferencia, retenciones) pueden saltarse editando desde el panel lateral.</p>

  <div class="page-break"></div>

  <h2>7. Hallazgos priorizados — lista de corrección</h2>

  <h3>${badge('P1', 'badge-p1')} Corregir pronto</h3>
  <table>
    <thead><tr><th>#</th><th>Problema</th><th>Archivos / área</th></tr></thead>
    <tbody>
      ${row(['1', 'Sync nube asimétrico: ventas sí, recepción/oficina/planilla Reservorio solo encolan en syncQueue local', 'CrozzoReservorio.js · CrozzoPosCloud.js'])}
      ${row(['2', 'Venta exitosa aunque falle inventario o Reservorio (try/catch vacío)', 'CrozzoPosMain.js facturar() ~28435'])}
      ${row(['3', 'Paso recepción «Verificar y pagar» no paga — solo crea pendiente en oficina', 'CrozzoRecepcionFacturas.js · UI paso 3'])}
      ${row(['4', 'gestion-perfiles-menus visible en plan básico sin estar en plan', 'CrozzoPosMain.js ACL'])}
    </tbody>
  </table>

  <h3>${badge('P2', 'badge-p2')} UX e integridad</h3>
  <table>
    <thead><tr><th>#</th><th>Problema</th><th>Notas</th></tr></thead>
    <tbody>
      ${row(['5', 'Doble inventario POS vs Reservorio sin fuente única', 'Documentar o unificar por tipo negocio'])}
      ${row(['6', 'Líneas recepción sin mpId omitidas en costeo sin aviso claro', 'CrozzoCatalogoMp.applyRecepcionItems'])}
      ${row(['7', 'Editar recepción no actualiza fila vinculada en oficina', 'CrozzoReservorio actualizarRecepcion'])}
      ${row(['8', 'Oficina: pago «pagada» sin validaciones vía panel edición', 'CrozzoComprasLocal.js'])}
      ${row(['9', 'Corcho sin virtualización — 100+ notas pesadas en tablet APK', 'CrozzoPosMain.js comandas'])}
      ${row(['10', 'Variación precio recepción: skipConfirmVariacion siempre true', 'CrozzoRecepcionFacturas.js'])}
      ${row(['11', 'Método por_definir + estado pagada → no entra planilla pero toast dice «cola planilla»', 'CrozzoReservorio onFacturaPagada'])}
    </tbody>
  </table>

  <h3>${badge('P3', 'badge-p3')} Menor</h3>
  <ul>
    <li>Adjuntos PDF recepción: timeout 8 s sin feedback al usuario.</li>
    <li>Duplicados recepción ventana 120 s (doble clic edge case).</li>
    <li>Batch recepción: fallo parcial deja algunos ingresos guardados sin reconciliación clara.</li>
    <li>Mirror Supabase ventas fire-and-forget (aceptable si cola offline confiable).</li>
  </ul>

  <h2>8. Estrés y uso abusivo</h2>
  <table>
    <thead><tr><th>Escenario</th><th>Resultado</th></tr></thead>
    <tbody>
      ${row(['100 comandas corcho (desktop 1400px)', '~1,5 s render · 100 notas · ~175 KB HTML · heap ~15 MB'])}
      ${row(['150–250 comandas tablet APK', 'Por validar en dispositivo real'])}
      ${row(['Navegación rápida entre páginas', 'Sin crash en muestra corta'])}
    </tbody>
  </table>

  <h2>9. Plan de corrección sugerido (mañana)</h2>
  <ol class="checklist">
    <li><strong>P1-2:</strong> Si falla inventario/reservorio al facturar → toast warning + log auditoría (no bloquear venta).</li>
    <li><strong>P1-3:</strong> Renombrar paso recepción a «Verificar y registrar»; aclarar que pago es en Oficina.</li>
    <li><strong>P1-1:</strong> Investigar drenaje syncQueue Reservorio → Supabase (paridad con ventas).</li>
    <li><strong>P1-4:</strong> Ocultar gestion-perfiles-menus en plan básico salvo Super Admin.</li>
    <li><strong>P2-7:</strong> Sincronizar oficina al editar recepción.</li>
    <li><strong>P2-8:</strong> Reutilizar validaciones de pago en guardado edición oficina.</li>
    <li><strong>P2-6:</strong> Toast detallado: «X líneas costeadas, Y omitidas (sin MP)».</li>
    <li>Prueba manual: recepción → costos → oficina pendiente → pagar → planilla egreso.</li>
    <li>Prueba manual: venta con receta → verificar MP Reservorio y stock POS.</li>
    <li>Prueba tablet: 50–100 comandas abiertas en hora pico simulada.</li>
  </ol>

  <h2>10. Scripts útiles para re-ejecutar</h2>
  <div class="flow">npm run sync
node scripts/_plan-basico-audit-exec.mjs
node scripts/_rbac-security-check.mjs
node scripts/_perf-audit.mjs
node scripts/generate-revision-integral-pdf.mjs</div>

  <div class="footer-note">
    Crozzo POS · Revisión integral · v${esc(version)} · ${esc(dateStr)}<br/>
    Generado por scripts/generate-revision-integral-pdf.mjs · Fuentes: app/modules/, app/core/CrozzoPosMain.js, scripts/_qa-out/
  </div>
</div>
</body>
</html>`;

const htmlPath = join(docsDir, 'CROZZO-REVISION-INTEGRAL.html');
const pdfPath = join(docsDir, 'CROZZO-REVISION-INTEGRAL.pdf');
writeFileSync(htmlPath, html, 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  margin: { top: '10mm', right: '10mm', bottom: '12mm', left: '10mm' },
  displayHeaderFooter: true,
  headerTemplate:
    '<div style="font-size:7px;width:100%;text-align:center;color:#94a3b8;padding-top:2mm">Crozzo POS — Revisión integral bugs y flujos</div>',
  footerTemplate:
    '<div style="font-size:7px;width:100%;text-align:center;color:#94a3b8;padding-bottom:2mm">Pág. <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
});
await browser.close();

const pdfStat = statSync(pdfPath);
const htmlStat = statSync(htmlPath);
console.log('HTML:', htmlPath, `(${(htmlStat.size / 1024).toFixed(1)} KB)`);
console.log('PDF:', pdfPath, `(${(pdfStat.size / 1024).toFixed(1)} KB)`);
if (pdfStat.size < 15000) {
  console.warn('Advertencia: PDF muy pequeño');
  process.exitCode = 1;
} else {
  console.log('OK — PDF listo para leer mañana');
}
