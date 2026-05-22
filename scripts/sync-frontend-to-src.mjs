#!/usr/bin/env node
/**
 * Copia el frontend canónico (carpeta app/) a src/ para el empaquetado Tauri.
 * Regenera QyC embebido desde integrar/ antes de copiar.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const prepQyc = spawnSync(process.execPath, [join(root, 'scripts', 'prepare-qyc-embed.mjs')], {
  cwd: root,
  stdio: 'inherit',
});
if (prepQyc.status !== 0) {
  console.error('[sync] prepare-qyc-embed falló');
  process.exit(prepQyc.status || 1);
}
const prepPl = spawnSync(process.execPath, [join(root, 'scripts', 'extract-planilla-template.mjs')], {
  cwd: root,
  stdio: 'inherit',
});
if (prepPl.status !== 0) {
  console.error('[sync] extract-planilla-template falló');
  process.exit(prepPl.status || 1);
}
const appDir = join(root, 'app');
const srcDir = join(root, 'src');
const mainHtml = join(appDir, 'Crozzo_POS_Completo.html');
const assets = [
  'CrozzoAuthSecurity.js',
  'CrozzoHoneypotSim.js',
  'CrozzoA11yUser.js',
  'CrozzoSidebarNav.js',
  'CrozzoTauriUpdater.js',
  'CrozzoSystemUpdates.js',
  'CrozzoComprasLocal.js',
  'CrozzoCentroCompras.js',
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

const destHtml = join(srcDir, 'index.html');
copyFileSync(mainHtml, destHtml);

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
