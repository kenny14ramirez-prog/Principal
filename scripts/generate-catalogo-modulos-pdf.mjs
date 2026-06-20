/**
 * Catálogo de módulos BONA origen / Crozzo POS → PDF
 * node scripts/generate-catalogo-modulos-pdf.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = join(root, 'docs');
mkdirSync(docsDir, { recursive: true });

let version = '1.0.148';
try {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  version = pkg.version || version;
} catch (_) {}

const generatedAt = new Date().toISOString().slice(0, 10);

const SECTIONS = [
  {
    id: 'operacion',
    title: 'Operación',
    icon: '▶',
    intro: 'Ventas del día a día: punto de venta, pedidos en sala, comandas y producción.',
    modules: [
      {
        name: 'Inicio ventas',
        page: 'inicio-operacion',
        desc: 'Pantalla de arranque para elegir el modo de venta: restaurante (mesas/comandas) o tienda comercial (mostrador).',
        features: ['Selector de módulo POS', 'Acceso rápido según perfil', 'Hub de operación del turno'],
      },
      {
        name: 'Restaurante · POS',
        page: 'cajero',
        desc: 'Caja principal de restaurante: mesas, domicilio/llevar, comandas y cobro en sala.',
        features: ['Mesas y mapa de sala', 'Modo llevar / domicilio', 'Comandas a cocina', 'Cobro y facturación', 'Corcho y notas por ítem'],
      },
      {
        name: 'Tienda / Comercial',
        page: 'venta-comercial',
        desc: 'Venta directa por mostrador sin mesas ni flujo de cocina.',
        features: ['Carrito de venta rápida', 'Cobro inmediato', 'Factura o ticket según modo fiscal'],
      },
      {
        name: 'Tablets · pedidos',
        page: 'tablets',
        desc: 'Toma de pedidos desde tablets o móviles para meseros en sala.',
        features: ['Grid de productos táctil', 'Envío a comandas', 'Sincronización con caja central', 'Vista optimizada APK/tablet'],
      },
      {
        name: 'Comandas',
        page: 'comandas',
        desc: 'Pantallas de producción por área (bar, cocina, parrilla, etc.).',
        features: ['Corcho por área', 'Estados LISTO / en preparación', 'Notas y modificadores', 'Impresión por estación'],
      },
      {
        name: 'Cocina (KDS)',
        page: 'cocina',
        desc: 'Vista de comandas entrantes y estado de preparación (accesible también desde Comandas).',
        features: ['Cola de pedidos entrantes', 'Marcar preparado', 'Modo kiosco en pantalla dedicada'],
      },
    ],
  },
  {
    id: 'procesos',
    title: 'Preparaciones de cocina',
    icon: '👨‍🍳',
    intro: 'Producción interna: recetas, preparaciones del día e historial de lo hecho en bodega/cocina.',
    modules: [
      {
        name: '¿Qué hago hoy?',
        page: 'compras-cortes',
        desc: 'Plan del día: partir carnes, cocinar, salsas, bases y tareas de producción.',
        features: ['Selección de tareas del día', 'Enlace con recetario y costos', 'Flujo BONA origen'],
      },
      {
        name: 'Recetario',
        page: 'compras-recetario-cocina',
        desc: 'Recetas con ingredientes, pesos y rendimientos; sincronizado con costos e inventario.',
        features: ['Ingredientes por receta', 'Pesos y unidades', 'Sincronización con matriz de costos'],
      },
      {
        name: 'Anotar preparación',
        page: 'compras-proceso-sesion',
        desc: 'Registrar una preparación en curso: salsas, bases, despiece, cocción.',
        features: ['Sesión de preparación activa', 'Pesos reales vs teóricos', 'Impacto en inventario'],
      },
      {
        name: 'Lo preparé antes',
        page: 'compras-proceso-historial',
        desc: 'Historial de preparaciones anteriores y diferencias de peso.',
        features: ['Consulta histórica', 'Diferencias de rendimiento', 'Trazabilidad de producción'],
      },
    ],
  },
  {
    id: 'gestion',
    title: 'Gestión',
    icon: '📊',
    intro: 'Control del negocio: ventas, clientes, reportes y bodegas.',
    modules: [
      {
        name: 'Facturas',
        page: 'facturas',
        desc: 'Historial de facturas electrónicas y comprobantes emitidos en el turno.',
        features: ['Listado de FE emitidas', 'Reimpresión', 'Consulta por fecha/cliente'],
      },
      {
        name: 'Cierre de caja',
        page: 'cierre-caja',
        desc: 'Arqueo de caja por turno (mañana / tarde / día) e historial de cierres.',
        features: ['Arqueo por medio de pago', 'Cuadre vs ventas', 'Impresión de cierre', 'Historial'],
      },
      {
        name: 'Cartera clientes',
        page: 'cartera-comercial',
        desc: 'Cuentas por cobrar, abonos y cotizaciones de venta.',
        features: ['Saldo por cliente', 'Abonos parciales', 'Cotizaciones comerciales'],
      },
      {
        name: 'Clientes (FE)',
        page: 'caja-clientes',
        desc: 'Directorio de clientes para facturación electrónica DIAN.',
        features: ['NIT/CC', 'Datos fiscales', 'Vinculación con ventas y mesas'],
      },
      {
        name: 'Reportes y dashboard',
        page: 'inventarios',
        desc: 'KPIs del día, ventas, inventario, exportación y resumen general.',
        features: ['Dashboard operativo', 'Exportación de datos', 'Pestaña resumen compras'],
      },
      {
        name: 'Bodegas y remisiones',
        page: 'costos-federacion',
        desc: 'Transferencias entre bodegas/sedes, préstamos e intercambio de insumos.',
        features: ['Remisiones entre sedes', 'Préstamos de inventario', 'Federación multi-sede'],
      },
      {
        name: 'Resumen compras',
        page: 'compras-dashboard',
        desc: 'Vista resumida de órdenes y recepciones de compras.',
        features: ['KPIs de compras', 'Acceso desde reportes', 'Estado de recepciones'],
      },
    ],
  },
  {
    id: 'costos',
    title: 'Costos',
    icon: '💰',
    intro: 'Costeo, inventario teórico y memoria unificada del negocio.',
    modules: [
      {
        name: 'Costos y márgenes',
        page: 'costos-matriz',
        desc: 'Costeo de materias primas, precios de venta y márgenes por producto.',
        features: ['Matriz MP → plato', 'Precio sugerido', 'Margen bruto', 'Reportes PDF'],
      },
      {
        name: 'Inventario continuo',
        page: 'costos-inventario',
        desc: 'Movimientos de inventario, teórico vs conteo físico.',
        features: ['Entradas y salidas', 'Conteo vs teórico', 'Ajustes de bodega'],
      },
      {
        name: 'Cola planilla',
        page: 'costos-planilla-feed',
        desc: 'Propuestas de datos hacia nómina/planillas (egresos, propinas, etc.).',
        features: ['Propuestas pendientes', 'Enlace con planillas', 'Cuadre administrativo'],
      },
      {
        name: 'Reservorio',
        page: 'costos-reservorio',
        desc: 'Memoria unificada interna del negocio; datos conectados entre módulos.',
        features: ['Índice de datos compartidos', 'Compactación', 'Soporte offline/LAN'],
      },
    ],
  },
  {
    id: 'administrativo',
    title: 'Administrativo',
    icon: '💼',
    intro: 'Pagos, crédito a clientes y nómina.',
    modules: [
      {
        name: 'Oficina y pagos',
        page: 'compras-oficina',
        desc: 'Pagos a proveedores: transferencias, efectivo y tarjeta.',
        features: ['Programación de pagos', 'Medios de pago', 'Vinculación con compras'],
      },
      {
        name: 'Cupos de clientes',
        page: 'cupos-clientes',
        desc: 'Límite de crédito por cliente y consulta de deuda.',
        features: ['Cupo máximo', 'Saldo utilizado', 'Control de riesgo comercial'],
      },
      {
        name: 'Planillas',
        page: 'planilla-2026',
        desc: 'Cuadre de caja, egresos, propinas y nómina del personal.',
        features: ['Turnos y extras', 'Propinas', 'Egresos', 'Integración con cierre'],
      },
    ],
  },
  {
    id: 'compras',
    title: 'Compras',
    icon: '📥',
    intro: 'Ciclo completo de compras a proveedores: cotizar, recibir, pagar y ordenar.',
    modules: [
      {
        name: 'Cotizaciones vs costeo',
        page: 'compras-cotizaciones',
        desc: 'Comparar ofertas de proveedores contra el costeo actual.',
        features: ['Comparativa multi-proveedor', 'PDF de cotización', 'Impacto en matriz de costos'],
      },
      {
        name: 'Entrada de factura',
        page: 'compras-recepcion',
        desc: 'Registrar compras: proveedor, documento PDF/foto, materias primas, pago y FE.',
        features: [
          'Selección / creación de proveedor',
          'Carga PDF, foto o cámara en vivo',
          'Lectura QR DIAN y análisis FE',
          'Líneas de materia prima',
          'Auto-detectar proveedor',
          'Guardado local o nube',
        ],
      },
      {
        name: 'Proveedores',
        page: 'compras-proveedores',
        desc: 'Directorio de proveedores: NIT, certificados, contacto.',
        features: ['Alta y edición', 'Documentos adjuntos', 'Historial de compras'],
      },
      {
        name: 'Órdenes al catálogo',
        page: 'compras-ordenes',
        desc: 'Órdenes de compra ligadas al catálogo POS.',
        features: ['Pedido a proveedor', 'Seguimiento de recepción', 'Stock objetivo'],
      },
      {
        name: 'Pedidos internos',
        page: 'pedidos-internos',
        desc: 'Solicitud de insumos entre áreas (cocina, bar, bodega).',
        features: ['Solicitud por área de comandas', 'Aprobación', 'Descarga de inventario'],
      },
    ],
  },
  {
    id: 'configuracion',
    title: 'Configuración',
    icon: '⚙',
    intro: 'Ajustes del negocio, impresión, red y usuarios.',
    modules: [
      {
        name: 'Empresa',
        page: 'config-empresa',
        desc: 'Datos legales y fiscales del establecimiento.',
        features: ['NIT, razón social', 'Ciudad y dirección', 'Resolución fiscal base'],
      },
      {
        name: 'Impuestos',
        page: 'config-impuestos',
        desc: 'IVA, retenciones, tarifas y exenciones.',
        features: ['Tarifas IVA', 'Retenciones renta/ICA', 'Exenciones por producto'],
      },
      {
        name: 'Impresión comandas',
        page: 'config-comandas',
        desc: 'Áreas de producción, impresoras y formato de tickets.',
        features: ['Estaciones de impresión', 'Áreas → impresora', 'Estilo de ticket'],
      },
      {
        name: 'Conexión de sistemas',
        page: 'config-conexiones-sistemas',
        desc: 'Red local: caja central, tablets y sincronización LAN.',
        features: ['Servidor LAN', 'Tablets emparejadas', 'Health check red'],
      },
      {
        name: 'Facturas e impresión',
        page: 'config-facturas-admin',
        desc: 'Impresoras para facturas y comandas fiscales.',
        features: ['Impresora por defecto', 'Formato FE', 'Prueba de impresión'],
      },
      {
        name: 'Usuarios',
        page: 'config-usuarios',
        desc: 'Cuentas de acceso y permisos por módulo.',
        features: ['Alta de usuarios', 'Roles', 'PIN / contraseña'],
      },
      {
        name: 'Marcación personal',
        page: 'control-acceso',
        desc: 'Entrada y salida del personal (control horario / RRHH).',
        features: ['Registro entrada/salida', 'Reporte por empleado', 'Integración planilla'],
      },
    ],
  },
  {
    id: 'soporte',
    title: 'Soporte y plataforma',
    icon: '🛡',
    intro: 'Módulos de Super Admin, soporte técnico y configuración avanzada de plataforma.',
    modules: [
      {
        name: 'Config. DIAN',
        page: 'config-dian',
        desc: 'Resolución de facturación, rangos y parámetros FE.',
        features: ['Resolución activa', 'Rangos de numeración', 'Ambiente producción/prueba'],
      },
      {
        name: 'Certificado .p12',
        page: 'config-certificado',
        desc: 'Certificado digital para firma electrónica.',
        features: ['Carga .p12', 'Vencimiento', 'Validación'],
      },
      {
        name: 'Proveedor FE',
        page: 'config-proveedor',
        desc: 'Proveedor tecnológico de facturación electrónica.',
        features: ['Selección de PT', 'Credenciales API', 'Prueba de conexión'],
      },
      {
        name: 'Nube global (Supabase)',
        page: 'super-admin-nube',
        desc: 'Conexión a Supabase: tablas, sync y activación de módulos.',
        features: ['Asistente de conexión', 'SQL Editor', 'Verificación de tablas'],
      },
      {
        name: 'Federación / remisiones',
        page: 'super-admin-federacion',
        desc: 'Puente entre bases Supabase de socios o sedes separadas.',
        features: ['SQL federado', 'Socios', 'Remisiones entre nubes'],
      },
      {
        name: 'Multi-dispositivo',
        page: 'config-multidispositivo',
        desc: 'Sincronización Cloud ↔ LAN ↔ offline entre equipos.',
        features: ['Rol A/B (caja/tablet)', 'Emparejamiento QR', 'BLE mesh / gossip UDP'],
      },
      {
        name: 'Pruebas de sistema',
        page: 'super-admin-diagnostics',
        desc: 'Diagnóstico en vivo: red, sync, almacenamiento y permisos.',
        features: ['Health checks', 'Estado LAN/nube', 'Permisos y capacidades'],
      },
      {
        name: 'Modo de operación',
        page: 'modo-demo',
        desc: 'Demo, facturación simple o electrónica DIAN.',
        features: ['Modo DEMO FE', 'Simple vs electrónico', 'Badge en cabecera'],
      },
      {
        name: 'Identidad y logos',
        page: 'super-admin-identidad',
        desc: 'Marca BONA origen y logo del cliente: imágenes, tamaños y animaciones.',
        features: ['Logo sidebar/header/login', 'Tema BONA origen', 'Tamaños y animaciones'],
      },
      {
        name: 'Actualizaciones del sistema',
        page: 'actualizaciones-sistema',
        desc: 'Versiones, parches críticos y notificaciones de nueva versión.',
        features: ['Canal de updates Tauri', 'Parches críticos', 'Historial de versiones'],
      },
      {
        name: 'Sesión y acceso',
        page: 'config-seguridad',
        desc: 'Login al iniciar, sesión activa y respaldo local.',
        features: ['Política de sesión', 'Respaldo local', 'Super Admin'],
      },
      {
        name: 'Perfiles y menús',
        page: 'gestion-perfiles-menus',
        desc: 'Perfil de empresa y visibilidad de módulos por rol.',
        features: ['Plantillas por tamaño de negocio', 'Menú por rol', 'Multi-cliente'],
      },
      {
        name: 'Auditoría (eventos)',
        page: 'auditoria',
        desc: 'Registro de cambios en configuración fiscal.',
        features: ['Trazabilidad', 'Quién cambió qué', 'Exportación'],
      },
    ],
  },
];

const EXTRA_MODULES = [
  {
    name: 'Productos / Catálogo',
    page: 'productos',
    desc: 'Platos de venta, precios, impuestos e ítems del POS (acceso según perfil o desde reportes).',
    features: ['Catálogo de venta', 'Precios e impuestos', 'Vinculación con comandas'],
  },
  {
    name: 'Catálogo materias primas',
    page: 'catalogo-mp',
    desc: 'Insumos, proveedores y recetas base para costeo.',
    features: ['Alta de MP', 'Unidades de medida', 'Proveedor preferido'],
  },
];

const ROLES = [
  { role: 'Caja / POS', access: 'Inicio ventas, Restaurante POS, Cierre, Facturas, Clientes FE' },
  { role: 'Mesero / Tablet', access: 'Tablets, Comandas' },
  { role: 'Cocina / KDS', access: 'Cocina, Comandas, Pedidos internos' },
  { role: 'Inventario / Compras', access: 'Entrada factura, Reportes, Pedidos internos, Proveedores' },
  { role: 'Administrador', access: 'Casi todos los módulos + Usuarios, Empresa, Impuestos, Auditoría' },
];

const PLATFORMS = [
  { name: 'Tauri Windows', desc: 'App de escritorio principal. WebView2, impresión nativa, hotspot LAN, cámara WebView.' },
  { name: 'APK Android', desc: 'Tablets y móviles. Cámara nativa, escáner QR, shell táctil, permisos Android.' },
  { name: 'Navegador web', desc: 'Acceso vía HTTPS o localhost. Funcionalidad según permisos del navegador.' },
];

const TECH = [
  { area: 'Frontend', detail: 'HTML/CSS/JS en app/ → sync a src/. Bundles: Compras, Costos, Reservorio.' },
  { area: 'Backend nativo', detail: 'Rust/Tauri: impresión, HTTP, LAN sync, WebSocket, mDNS, BLE mesh, permisos cámara.' },
  { area: 'Nube', detail: 'Supabase (PostgreSQL) — sync opcional multi-dispositivo y federación.' },
  { area: 'FE Colombia', detail: 'Integración DIAN: QR, VPFE, certificado .p12, análisis factura electrónica en recepción.' },
  { area: 'OCR / visión', detail: 'Tesseract, OpenCV (detección bordes), jsQR, lectura PDF facturas proveedor.' },
];

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function moduleBlock(m) {
  const feats = (m.features || []).map((f) => `<li>${esc(f)}</li>`).join('');
  return `<div class="mod">
    <h3>${esc(m.name)} <span class="page-id">${esc(m.page)}</span></h3>
    <p>${esc(m.desc)}</p>
    ${feats ? `<ul>${feats}</ul>` : ''}
  </div>`;
}

function sectionBlock(sec, index) {
  const mods = sec.modules.map(moduleBlock).join('');
  return `<section class="sec" id="sec-${esc(sec.id)}">
    <h2><span class="sec-num">${index + 1}</span> ${esc(sec.icon)} ${esc(sec.title)}</h2>
    <p class="sec-intro">${esc(sec.intro)}</p>
    ${mods}
  </section>`;
}

const tocItems = SECTIONS.map(
  (s, i) => `<li><a href="#sec-${esc(s.id)}">${i + 1}. ${esc(s.title)}</a> <span class="muted">(${s.modules.length} módulos)</span></li>`
).join('');

const rolesRows = ROLES.map((r) => `<tr><td><strong>${esc(r.role)}</strong></td><td>${esc(r.access)}</td></tr>`).join('');
const platRows = PLATFORMS.map((p) => `<tr><td><strong>${esc(p.name)}</strong></td><td>${esc(p.desc)}</td></tr>`).join('');
const techRows = TECH.map((t) => `<tr><td><strong>${esc(t.area)}</strong></td><td>${esc(t.detail)}</td></tr>`).join('');

const totalModules =
  SECTIONS.reduce((n, s) => n + s.modules.length, 0) + EXTRA_MODULES.length;

const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>BONA origen — Catálogo de módulos</title>
<style>
  @page { margin: 12mm; size: A4; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Georgia, serif; font-size: 10pt; color: #1a1a2e; line-height: 1.5; margin: 0; background: #fff; }
  .cover {
    background: linear-gradient(145deg, #3d2914 0%, #6b4423 40%, #8b6914 100%);
    color: #fff; padding: 36px 28px 32px; margin: 0 0 24px;
    page-break-after: always;
  }
  .cover h1 { font-size: 26pt; margin: 0 0 8px; font-weight: 700; letter-spacing: -0.02em; }
  .cover .brand { font-size: 11pt; opacity: 0.9; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 4px; }
  .cover .sub { font-size: 12pt; opacity: 0.92; margin: 0 0 20px; max-width: 520px; }
  .cover-meta { display: flex; flex-wrap: wrap; gap: 10px; font-size: 9pt; }
  .cover-meta span { background: rgba(255,255,255,0.15); padding: 5px 12px; border-radius: 20px; }
  .body { padding: 0 22px 24px; }
  h2 { font-size: 14pt; color: #3d2914; border-bottom: 2px solid #c9a962; padding-bottom: 6px; margin: 24px 0 10px; page-break-after: avoid; }
  h2 .sec-num { display: inline-block; background: #6b4423; color: #fff; width: 1.6em; height: 1.6em; line-height: 1.6em; text-align: center; border-radius: 50%; font-size: 10pt; margin-right: 8px; vertical-align: middle; }
  h3 { font-size: 11pt; color: #1a1a2e; margin: 14px 0 4px; page-break-after: avoid; }
  .sec-intro { color: #475569; font-style: italic; margin: 0 0 12px; font-size: 9.5pt; }
  .mod { border-left: 3px solid #c9a962; padding: 0 0 10px 12px; margin: 0 0 12px; page-break-inside: avoid; }
  .mod p { margin: 0 0 6px; color: #334155; }
  .mod ul { margin: 4px 0 0; padding-left: 18px; font-size: 9pt; color: #475569; }
  .mod li { margin: 2px 0; }
  .page-id { font-size: 8pt; font-weight: normal; color: #94a3b8; font-family: Consolas, monospace; }
  .toc { background: #faf8f5; border: 1px solid #e8dcc8; border-radius: 10px; padding: 16px 20px; margin: 0 0 24px; page-break-after: always; }
  .toc h2 { border: none; margin-top: 0; }
  .toc ol { margin: 0; padding-left: 22px; }
  .toc li { margin: 6px 0; }
  .toc a { color: #6b4423; text-decoration: none; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0 16px; font-size: 9pt; }
  th, td { border: 1px solid #cbd5e1; padding: 7px 10px; text-align: left; vertical-align: top; }
  th { background: #3d2914; color: #fff; }
  tr:nth-child(even) td { background: #faf8f5; }
  .muted { color: #94a3b8; font-size: 8.5pt; }
  .summary-box { display: flex; gap: 12px; flex-wrap: wrap; margin: 16px 0; }
  .summary-kpi { flex: 1; min-width: 120px; background: #faf8f5; border: 1px solid #e8dcc8; border-radius: 8px; padding: 10px 14px; text-align: center; }
  .summary-kpi .n { font-size: 20pt; font-weight: 700; color: #6b4423; }
  .summary-kpi .l { font-size: 8pt; text-transform: uppercase; color: #64748b; }
  .footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 8pt; color: #94a3b8; text-align: center; }
  .page-break { page-break-before: always; }
  @media print {
    .cover, th, .sec-num, h2 .sec-num { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="cover">
    <p class="brand">BONA origen · Crozzo POS</p>
    <h1>Catálogo de módulos</h1>
    <p class="sub">Referencia completa de secciones, pantallas y capacidades del sistema — estado actual del producto.</p>
    <div class="cover-meta">
      <span>📅 ${esc(generatedAt)}</span>
      <span>📦 v${esc(version)}</span>
      <span>📂 ${SECTIONS.length} secciones</span>
      <span>🧩 ${totalModules} módulos</span>
    </div>
  </div>

  <div class="body">
    <div class="toc">
      <h2>Índice</h2>
      <ol>${tocItems}</ol>
      <p class="muted" style="margin-top:12px">Nota: la visibilidad de cada módulo depende del perfil de usuario y la configuración del negocio (Perfiles y menús).</p>
    </div>

    <div class="summary-box">
      <div class="summary-kpi"><div class="n">${SECTIONS.length}</div><div class="l">Secciones menú</div></div>
      <div class="summary-kpi"><div class="n">${totalModules}</div><div class="l">Módulos / pantallas</div></div>
      <div class="summary-kpi"><div class="n">${ROLES.length}</div><div class="l">Roles típicos</div></div>
      <div class="summary-kpi"><div class="n">3</div><div class="l">Plataformas</div></div>
    </div>

    ${SECTIONS.map(sectionBlock).join('')}

    <section class="sec page-break">
      <h2><span class="sec-num">+</span> Módulos adicionales</h2>
      <p class="sec-intro">Pantallas disponibles según perfil o accesibles desde otras secciones.</p>
      ${EXTRA_MODULES.map(moduleBlock).join('')}
    </section>

    <section class="sec">
      <h2>Roles y acceso habitual</h2>
      <table>
        <thead><tr><th>Rol</th><th>Módulos habituales</th></tr></thead>
        <tbody>${rolesRows}</tbody>
      </table>
    </section>

    <section class="sec">
      <h2>Plataformas soportadas</h2>
      <table>
        <thead><tr><th>Plataforma</th><th>Descripción</th></tr></thead>
        <tbody>${platRows}</tbody>
      </table>
    </section>

    <section class="sec">
      <h2>Stack técnico (resumen)</h2>
      <table>
        <thead><tr><th>Área</th><th>Detalle</th></tr></thead>
        <tbody>${techRows}</tbody>
      </table>
    </section>

    <div class="footer">
      BONA origen · Crozzo POS · Catálogo generado ${esc(generatedAt)} · v${esc(version)}<br/>
      Documento de referencia interna — scripts/generate-catalogo-modulos-pdf.mjs
    </div>
  </div>
</body>
</html>`;

const htmlPath = join(docsDir, 'BONA-ORIGEN-CATALOGO-MODULOS.html');
const pdfPath = join(docsDir, 'BONA-ORIGEN-CATALOGO-MODULOS.pdf');
writeFileSync(htmlPath, html, 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.waitForTimeout(200);
await page.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  margin: { top: '10mm', right: '10mm', bottom: '12mm', left: '10mm' },
  displayHeaderFooter: true,
  headerTemplate:
    '<div style="font-size:7px;width:100%;text-align:center;color:#94a3b8;padding-top:2mm">BONA origen — Catálogo de módulos</div>',
  footerTemplate:
    '<div style="font-size:7px;width:100%;text-align:center;color:#94a3b8;padding-bottom:2mm">Pág. <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
});
await browser.close();

const pdfStat = statSync(pdfPath);
console.log('HTML:', htmlPath);
console.log('PDF:', pdfPath, `(${(pdfStat.size / 1024).toFixed(1)} KB)`);
console.log('Módulos documentados:', totalModules);
