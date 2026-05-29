#!/usr/bin/env node
/**
 * Copia el frontend canónico (carpeta app/) a src/ para el empaquetado Tauri.
 * Regenera QyC/planilla desde integrar/ cuando existen script y fuentes; si no, usa artefactos en app/.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

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

  const missingInput = inputs.find((p) => !existsSync(join(root, p)));
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

function copyDirRecursive(fromDir, toDir) {
  if (!existsSync(fromDir)) return 0;
  mkdirSync(toDir, { recursive: true });
  let n = 0;
  for (const name of readdirSync(fromDir)) {
    const from = join(fromDir, name);
    const to = join(toDir, name);
    if (statSync(from).isDirectory()) {
      n += copyDirRecursive(from, to);
    } else {
      copyFileSync(from, to);
      n++;
    }
  }
  return n;
}

let code = runOptionalPrep('QyC embed', 'prepare-qyc-embed.mjs', {
  inputs: ['integrar/sistema de facturas, cortes y estadisticas/Crozzo QyC.html'],
  output: 'app/CrozzoQyC_App.html',
});
if (code !== 0) process.exit(code);

const patchOficina = join(root, 'scripts', 'patch-oficina-ui.mjs');
if (existsSync(patchOficina)) {
  const pRun = spawnSync(process.execPath, [patchOficina], { cwd: root, stdio: 'inherit' });
  if (pRun.status !== 0) {
    console.warn('[sync] patch-oficina-ui falló (revisar app/CrozzoQyC_App.html)');
  }
}

code = runOptionalPrep('Planilla template', 'extract-planilla-template.mjs', {
  inputs: ['integrar/2026 PLANILLA BLANCO.xlsx'],
  output: 'app/modules/CrozzoPlanilla2026.template.json',
});
if (code !== 0) process.exit(code);

const consolidateScript = join(root, 'scripts', 'consolidate-crozzo-bundles.mjs');
if (existsSync(consolidateScript)) {
  const cRun = spawnSync(process.execPath, [consolidateScript], { cwd: root, stdio: 'inherit' });
  if (cRun.status !== 0) console.warn('[sync] consolidate-crozzo-bundles falló');
}

const splitScript = join(root, 'scripts', 'split-pos-html.mjs');
if (existsSync(splitScript)) {
  const splitRun = spawnSync(process.execPath, [splitScript], { cwd: root, stdio: 'inherit' });
  if (splitRun.status !== 0) {
    console.warn('[sync] split-pos-html falló; se usa HTML actual');
  }
}

const appDir = join(root, 'app');
const srcDir = join(root, 'src');
const mainHtml = join(appDir, 'Crozzo_POS_Completo.html');

const extraHtml = ['CrozzoQyC_App.html', 'Crozzo_POS_DisenadorTicket.html'];

const copyDirs = ['css', 'core', 'vendor', 'ui', 'infra', 'modules', 'bundles'];

if (!existsSync(mainHtml)) {
  console.error('[sync] No se encontró app/Crozzo_POS_Completo.html');
  process.exit(1);
}

mkdirSync(srcDir, { recursive: true });

function readOtaBuildStamp() {
  try {
    const latestPath = join(root, 'releases', 'latest.json');
    if (existsSync(latestPath)) {
      const latest = JSON.parse(readFileSync(latestPath, 'utf8'));
      const stamp = latest.publishedAt || latest.updatedAt;
      if (stamp) return String(stamp);
    }
  } catch (_) {}
  return new Date().toISOString();
}

function injectBuildVersionMeta(html, semver, buildStamp) {
  if (!semver || !html) return html;
  const stamp = buildStamp || readOtaBuildStamp();
  const metaVersion = `<meta name="crozzo-app-version" content="${semver}">`;
  const metaStamp = `<meta name="crozzo-build-stamp" content="${stamp}">`;
  let out = html;
  if (/name=["']crozzo-app-version["']/i.test(out)) {
    out = out.replace(/<meta\s+name=["']crozzo-app-version["'][^>]*>/i, metaVersion);
  } else if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head([^>]*)>/i, `<head$1>\n${metaVersion}`);
  }
  if (/name=["']crozzo-build-stamp["']/i.test(out)) {
    out = out.replace(/<meta\s+name=["']crozzo-build-stamp["'][^>]*>/i, metaStamp);
  } else if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<meta\s+name=["']crozzo-app-version["'][^>]*>/i, `$&\n${metaStamp}`);
  }
  return out;
}

let htmlBody = readFileSync(mainHtml, 'utf8');
try {
  const tauriConf = join(root, 'src-tauri', 'tauri.conf.json');
  if (existsSync(tauriConf)) {
    const conf = JSON.parse(readFileSync(tauriConf, 'utf8'));
    const ver = String(conf.version || '').trim();
    if (ver) htmlBody = injectBuildVersionMeta(htmlBody, ver, readOtaBuildStamp());
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

for (const dir of copyDirs) {
  const n = copyDirRecursive(join(appDir, dir), join(srcDir, dir));
  copied += n;
  if (n) console.log('[sync]', dir + '/', n, 'archivos');
}

const assetsDir = join(appDir, 'assets');
if (existsSync(assetsDir)) {
  copied += copyDirRecursive(assetsDir, join(srcDir, 'assets'));
}

const dataDir = join(appDir, 'data');
if (existsSync(dataDir)) {
  copied += copyDirRecursive(dataDir, join(srcDir, 'data'));
}

const bytes = statSync(destHtml).size;
console.log('[sync] OK app/ → src/index.html (' + Math.round(bytes / 1024) + ' KB)');
console.log('[sync] Total archivos copiados:', copied);
