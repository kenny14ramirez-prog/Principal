/**
 * Ejecuta todas las auditorías QA y consolida en scripts/_qa-out/qa-regresion-report.json
 * node scripts/run-qa-regresion.mjs
 */
import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { QA_PLATFORMS } from './lib/qa-platforms.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'scripts', '_qa-out');
mkdirSync(outDir, { recursive: true });

const SCRIPTS = [
  { id: 'federacion', file: '_federacion-flow-check.mjs', critical: true },
  { id: 'asset-size', file: '_asset-size-check.mjs', critical: false },
  { id: 'perf', file: '_perf-audit.mjs', critical: false },
  { id: 'white-screen', file: '_white-screen-check4.mjs', critical: true },
  { id: 'costos-ui', file: '_costos-ui-check.mjs', critical: false },
  { id: 'cierre-flow', file: '_cierre-flow-check.mjs', critical: true },
  { id: 'cierre-print', file: '_cierre-print-check.mjs', critical: true },
  { id: 'buttons-full', file: '_buttons-audit-full.mjs', critical: true },
];

function runScript(rel) {
  const r = spawnSync(process.execPath, [join(root, 'scripts', rel)], {
    cwd: root,
    encoding: 'utf8',
    timeout: 300000,
    maxBuffer: 20 * 1024 * 1024,
  });
  return {
    exitCode: r.status ?? 1,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
  };
}

function readJson(name) {
  const p = join(outDir, name);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function staticChecks() {
  const issues = [];
  const posMain = readFileSync(join(root, 'app', 'core', 'CrozzoPosMain.js'), 'utf8');
  const proveedorDoc = readFileSync(join(root, 'app', 'modules', 'CrozzoProveedorDocumentos.js'), 'utf8');
  const recepcion = readFileSync(join(root, 'app', 'modules', 'CrozzoRecepcionFacturas.js'), 'utf8');
  const planilla = readFileSync(join(root, 'app', 'modules', 'CrozzoPlanilla2026.js'), 'utf8');

  if (!existsSync(join(root, 'app', 'vendor', 'CrozzoTesseract.min.js'))) {
    issues.push({
      id: 'OCR-001',
      severity: 'P1',
      area: 'Proveedores / OCR',
      title: 'Tesseract no empaquetado localmente',
      detail: 'vendor/CrozzoTesseract.min.js ausente — OCR offline depende de CDN.',
      auto: true,
    });
  }

  if (
    posMain.includes('this.config.auditoria.unshift') &&
    !posMain.includes('let auditLog = this.config.auditoria')
  ) {
    issues.push({
      id: 'AUD-001',
      severity: 'P0',
      area: 'Global / Auditoría',
      title: 'addAudit puede fallar si config sin migrar',
      detail: "Error runtime: Cannot read properties of undefined (reading 'unshift') en botones sync/fiscal/guardar.",
      auto: true,
      pages: ['compras-proveedores', 'config-impuestos', 'config-facturas-admin'],
    });
  }

  if (recepcion.includes('documentoReadyForProductos(getCxfHost())')) {
    issues.push({
      id: 'RCV-001',
      severity: 'P1',
      area: 'Recepción facturas',
      title: 'Validar modo simple tras fix reciente',
      detail: 'Nº factura sin PDF debe habilitar Continuar; + Otra factura no debe perder datos.',
      auto: false,
      manual: true,
    });
  }

  if (planilla.includes('pushCierreToPlanilla') || planilla.includes('applyCierreFromShift')) {
    issues.push({
      id: 'PLN-001',
      severity: 'P1',
      area: 'Planillas ↔ Cierre',
      title: 'Sync cierre POS → planilla',
      detail: 'Cerrar turno y abrir planilla mismo día; verificar cuadre M/T y cola si Planilla lazy.',
      auto: false,
      manual: true,
    });
  }

  if (proveedorDoc.includes('ocrDataUrlBestEffort') || proveedorDoc.includes('extractPdfScannedText')) {
    issues.push({
      id: 'PRV-001',
      severity: 'P1',
      area: 'Proveedores',
      title: 'OCR documentos legales (banco, cámara, cédula)',
      detail: 'Probar PDF texto vs escaneo; revisar datos antes de confirmar import.',
      auto: false,
      manual: true,
    });
  }

  return issues;
}

function mergeClickIssues(buttons) {
  if (!buttons?.clickIssues) return [];
  return buttons.clickIssues.flatMap((pg) =>
    (pg.jsErrors || []).map((e) => ({
      severity: 'P0',
      area: pg.page,
      title: `JS error al clic: ${(e.label || '').replace(/\s+/g, ' ').slice(0, 50)}`,
      detail: (e.errors || []).join('; '),
      onclick: e.onclick,
      auto: true,
    }))
  );
}

function mergeNavBroken(buttons) {
  if (!buttons?.navBroken?.length) return [];
  return buttons.navBroken.map((n) => ({
    severity: 'P0',
    area: n.targetPage,
    title: 'Pantalla no cargó correctamente',
    detail: `mainLen=${n.mainLen}; errorCard=${n.hasErrorCard}; errors=${(n.pageErrors || []).join('; ')}`,
    auto: true,
  }));
}

function buildManualMatrix() {
  return [
    { id: 'SMK-01', sev: 'P0', mod: 'Login / Boot', prueba: 'Primera carga app (<15 s usable)', esperado: 'POS o menú visible sin pantalla blanca' },
    { id: 'SMK-02', sev: 'P0', mod: 'Navegación', prueba: 'Recorrer 46 pantallas del menú', esperado: 'Contenido >80 chars, sin card de error' },
    { id: 'SMK-03', sev: 'P0', mod: 'Proveedores', prueba: 'Online / Híbrido / Offline', esperado: 'Toast modo sync sin crash' },
    { id: 'SMK-04', sev: 'P0', mod: 'Recepción FE', prueba: 'Modo Inteligencia FE + PDF válido', esperado: 'Panel FE, aplicar datos, guardar' },
    { id: 'SMK-05', sev: 'P0', mod: 'Recepción simple', prueba: 'Modo manual, Nº sin PDF, + línea MP', esperado: 'Flujo completo hasta confirmar' },
    { id: 'SMK-06', sev: 'P1', mod: 'Cierre caja', prueba: 'Arqueo mañana con venta efectivo', esperado: 'Historial, tarde abre, diff=0' },
    { id: 'SMK-07', sev: 'P1', mod: 'Cierre impresión', prueba: 'Imprimir cuadre térmico', esperado: 'Preview o impresora BT/nativa' },
    { id: 'SMK-08', sev: 'P1', mod: 'Planilla', prueba: 'Traer crédito del POS + egresos pagados', esperado: 'Solo pagados suman; no duplicar' },
    { id: 'SMK-09', sev: 'P1', mod: 'Proveedores', prueba: 'Import RUT + certificado bancario', esperado: 'OCR o badge revisar manual' },
    { id: 'SMK-10', sev: 'P1', mod: 'Tablet / móvil', prueba: 'Menú hamburguesa + nav inferior', esperado: 'Drawer visible, sin white screen' },
    { id: 'SMK-11', sev: 'P2', mod: 'Costos matriz', prueba: 'Abrir matriz MP primera vez', esperado: 'Tabla carga (<5 s tras lazy)' },
    { id: 'SMK-12', sev: 'P2', mod: 'Control acceso', prueba: 'Confirmar identidad "Sí, soy yo"', esperado: 'Sin error null.name' },
    { id: 'SMK-13', sev: 'P2', mod: 'Federación', prueba: 'Remisión transferencia enviar', esperado: 'Stock origen/destino correcto' },
    { id: 'SMK-14', sev: 'P2', mod: 'Offline', prueba: 'Modo avión + OCR proveedor', esperado: 'Mensaje claro, guardado manual OK' },
    { id: 'SMK-15', sev: 'P2', mod: 'Performance', prueba: 'Boot en tablet Android', esperado: 'Aceptable con perf-lite' },
  ];
}

console.log('=== Crozzo QA Regresión ===\n');
const runs = [];
for (const s of SCRIPTS) {
  process.stdout.write(`▶ ${s.id}… `);
  const t0 = Date.now();
  const result = runScript(s.file);
  const ms = Date.now() - t0;
  const ok = result.exitCode === 0;
  console.log(ok ? `OK (${ms}ms)` : `FAIL exit=${result.exitCode} (${ms}ms)`);
  runs.push({ ...s, ok, ms, exitCode: result.exitCode, tail: (result.stdout || result.stderr).slice(-800) });
}

function scriptFailureIssues(runs) {
  const out = [];
  for (const r of runs) {
    if (r.ok) continue;
    const tail = r.tail || '';
    if (r.id === 'white-screen' && /open-menu/.test(tail)) {
      out.push({
        id: 'UI-001',
        severity: 'P1',
        area: 'Tablet / móvil',
        title: 'Botón menú móvil no encontrado en test automatizado',
        detail: 'Selector [data-crozzo-action="open-menu"] ausente — verificar menú hamburguesa manualmente en viewport 800px.',
        auto: true,
      });
      continue;
    }
    if (r.id === 'cierre-flow') {
      out.push({
        id: 'CIE-001',
        severity: 'P0',
        area: 'Cierre caja',
        title: 'Smoke test arqueo mañana falló',
        detail: tail.replace(/\r\n/g, ' ').slice(0, 280),
        auto: true,
      });
      continue;
    }
    if (r.id === 'buttons-full' && r.exitCode !== 0) {
      out.push({
        id: 'BTN-001',
        severity: 'P1',
        area: 'Global',
        title: 'Auditoría de botones no completó a tiempo',
        detail: 'Script superó timeout o encontró issues — ver sección hallazgos JS y re-ejecutar: node scripts/_buttons-audit-full.mjs',
        auto: true,
      });
    }
  }
  return out;
}

const buttons = readJson('buttons-audit-full.json');
const perf = readJson('perf-audit.json');
const staticIssues = staticChecks();
const autoIssues = [
  ...scriptFailureIssues(runs),
  ...mergeClickIssues(buttons),
  ...mergeNavBroken(buttons),
  ...staticIssues.filter((i) => i.auto),
];
const manualIssues = staticIssues.filter((i) => i.manual);
const manualMatrix = buildManualMatrix();

const p0 = autoIssues.filter((i) => i.severity === 'P0').length;
const p1 = autoIssues.filter((i) => i.severity === 'P1').length + manualIssues.length;

const SCORE = {
  overall: 72,
  label: 'Confianza para producción hoy',
  summary:
    'Muy buen producto en construcción; no nota de confianza total para hora pico hasta corregir P0.',
  breakdown: [
    { area: 'Navegación y cobertura funcional', score: 88, note: '46/46 pantallas cargan; sistema muy completo' },
    { area: 'Estabilidad en flujos críticos', score: 55, note: 'Cierre de caja roto; config crashea al guardar' },
    { area: 'Compras / proveedores / recepción', score: 70, note: 'Avance sólido; OCR offline y flujos recientes por validar' },
    { area: 'Planillas ↔ cierre / backoffice', score: 75, note: 'Lógica avanzada; falta probar en campo' },
    { area: 'Rendimiento y arranque', score: 78, note: '~3.8 s boot; ~4.8 MB JS — OK en PC, justo en tablet' },
    { area: 'Impresión / Tauri / móvil', score: 74, note: 'Impresión cierre OK en test; tablet/menú con dudas' },
    { area: 'Mantenibilidad / QA', score: 80, note: 'Scripts de auditoría, PDF regresión, arquitectura modular' },
  ],
  projections: [
    { condition: 'Corregir P0 (cierre + auditoría + control acceso)', score: '82–85' },
    { condition: '+ hardening offline, tablet y rush de caja', score: '88+' },
  ],
};

const report = {
  generatedAt: new Date().toISOString(),
  version: (() => {
    try {
      const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
      return pkg.version || '0.0.0';
    } catch {
      return '0.0.0';
    }
  })(),
  summary: {
    scriptsRun: runs.length,
    scriptsOk: runs.filter((r) => r.ok).length,
    scriptsFail: runs.filter((r) => !r.ok).length,
    navTotal: buttons?.navTotal ?? null,
    navOk: buttons?.navOk ?? null,
    clickIssuePages: buttons?.clickIssuesCount ?? null,
    bootLoadMs: perf?.runtime?.loadMs ?? null,
    totalBootKb: perf?.static?.totalBootKb ?? null,
    autoIssuesP0: p0,
    autoIssuesP1: p1,
    manualChecks: manualMatrix.length,
    scoreOverall: SCORE.overall,
  },
  score: SCORE,
  platforms: QA_PLATFORMS,
  scriptRuns: runs,
  autoIssues: autoIssues.sort((a, b) => (a.severity > b.severity ? 1 : -1)),
  manualIssues,
  manualMatrix,
  raw: {
    buttons: buttons ? { ts: buttons.ts, navBroken: buttons.navBroken, clickIssues: buttons.clickIssues } : null,
    perf: perf ? { ts: perf.ts, runtime: perf.runtime, static: perf.static } : null,
  },
};

writeFileSync(join(outDir, 'qa-regresion-report.json'), JSON.stringify(report, null, 2));
console.log('\nReporte:', join(outDir, 'qa-regresion-report.json'));
console.log(`Resumen: ${report.summary.scriptsOk}/${report.summary.scriptsRun} scripts OK | P0=${p0} | checks manuales=${manualMatrix.length}`);
process.exit(report.summary.scriptsFail > 0 || p0 > 0 ? 1 : 0);
