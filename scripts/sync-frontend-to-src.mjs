#!/usr/bin/env node
/**
 * Copia el frontend canónico (carpeta app/) a src/ para el empaquetado Tauri.
 * Regenera QyC/planilla desde integrar/ cuando existen script y fuentes; si no, usa artefactos en app/.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {string} label
 * @param {string} scriptName
 * @param {{ inputs?: string[], output?: string }} opts
 * @returns {number} exit code (0 ok)
 */
function runOptionalPrep(label, scriptName, opts) {
  const inputs = opts.inputs || [];
  const output = opts.output || '';
  const scriptPath = join(root, 'scripts', scriptName);
  const outputPath = output ? join(root, output) : '';

  if (!existsSync(scriptPath)) {
    if (outputPath && existsSync(outputPath)) {
      console.warn('[sync]', label + ': script ausente; usando', output);
      return 0;
    }
    console.warn('[sync]', label + ': omitido (no hay', scriptName, 'ni', output || 'salida', ')');
    return 0;
  }

  const missingInput = inputs.find(p => !existsSync(join(root, p)));
  if (missingInput) {
    if (outputPath && existsSync(outputPath)) {
      console.warn('[sync]', label + ': sin fuente', missingInput + '; usando', output);
      return 0;
    }
    console.error('[sync]', label + ': falta', missingInput, 'y no existe', output);
    return 1;
  }

  const run = spawnSync(process.execPath, [scriptPath], { cwd: root, stdio: 'inherit' });
  if (run.status !== 0) {
    if (outputPath && existsSync(outputPath)) {
      console.warn('[sync]', label + ': falló la regeneración; se usa', output, 'existente');
      return 0;
    }
    console.error('[sync]', label, 'falló');
    return run.status || 1;
  }
  return 0;
}

let code = runOptionalPrep('QyC embed', 'prepare-qyc-embed.mjs', {
  inputs: ['integrar/sistema de facturas, cortes y estadisticas/Crozzo QyC.html'],
  output: 'app/CrozzoQyC_App.html',
});
if (code !== 0) process.exit(code);

code = runOptionalPrep('Planilla template', 'extract-planilla-template.mjs', {
  inputs: ['integrar/2026 PLANILLA BLANCO.xlsx'],
  output: 'app/CrozzoPlanilla2026.template.json',
});
if (code !== 0) process.exit(code);

const appDir = join(root, 'app');
const srcDir = join(root, 'src');
const mainHtml = join(appDir, 'Crozzo_POS_Completo.html');
const assets = [
  'CrozzoAuthSecurity.js',
  'CrozzoHoneypotSim.js',
  'CrozzoViewportFit.js',
  'CrozzoA11yUser.js',
  'CrozzoSidebarNav.js',
  'CrozzoTauriUpdater.js',
  'CrozzoSystemUpdates.js',
  'CrozzoComprasLocal.js',
  'CrozzoCentroCompras.js',
  'CrozzoCentroProcesos.js',
  'CrozzoPlanilla2026.js',
  'CrozzoPlanilla2026.template.json',
  'CrozzoModulosIntegrados.js',
  'CrozzoModulosIntegradosAcceso.js',
  'CrozzoModulosIntegradosPedidos.js',
];

const extraHtml = ['CrozzoQyC_App.html', 'Crozzo_POS_DisenadorTicket.html'];

if (!existsSync(mainHtml)) {
  console.error('[sync] No se encontró app/Crozzo_POS_Completo.html');
  process.exit(1);
}

mkdirSync(srcDir, { recursive: true });

function injectBuildVersionMeta(html, semver) {
  if (!semver || !html) return html;
  const meta = `<meta name="crozzo-app-version" content="${semver}">`;
  if (/name=["']crozzo-app-version["']/i.test(html)) {
    return html.replace(
      /<meta\s+name=["']crozzo-app-version["'][^>]*>/i,
      meta
    );
  }
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>\n${meta}`);
  }
  return html;
}

let htmlBody = readFileSync(mainHtml, 'utf8');
try {
  const tauriConf = join(root, 'src-tauri', 'tauri.conf.json');
  if (existsSync(tauriConf)) {
    const conf = JSON.parse(readFileSync(tauriConf, 'utf8'));
    const ver = String(conf.version || '').trim();
    if (ver) htmlBody = injectBuildVersionMeta(htmlBody, ver);
  }
} catch (e) {
  console.warn('[sync] No se pudo inyectar versión de build:', e.message);
}

const destHtml = join(srcDir, 'index.html');
writeFileSync(destHtml, htmlBody, 'utf8');

let copied = 0;
for (const name of extraHtml) {
  const from = join(appDir, name);
  if (existsSync(from)) {
    copyFileSync(from, join(srcDir, name));
    console.log('[sync] HTML extra:', name);
  } else {
    console.warn('[sync] Omitido HTML:', name);
  }
}

for (const name of assets) {
  const from = join(appDir, name);
  if (!existsSync(from)) {
    console.warn('[sync] Omitido (no existe en app/):', name);
    continue;
  }
  copyFileSync(from, join(srcDir, name));
  copied++;
}

const assetsDir = join(appDir, 'assets');
if (existsSync(assetsDir)) {
  mkdirSync(join(srcDir, 'assets'), { recursive: true });
  const xlsx = join(assetsDir, '2026-PLANILLA-BLANCO.xlsx');
  if (existsSync(xlsx)) {
    copyFileSync(xlsx, join(srcDir, 'assets', '2026-PLANILLA-BLANCO.xlsx'));
    console.log('[sync] assets/2026-PLANILLA-BLANCO.xlsx');
  }
}

const bytes = statSync(destHtml).size;
console.log('[sync] OK app/ → src/index.html (' + Math.round(bytes / 1024) + ' KB)');
console.log('[sync] JS copiados:', copied, 'de', assets.length);
