#!/usr/bin/env node
/**
 * Copia el frontend canónico a src/ (lo que empaqueta Tauri en CI).
 * Fuente: Crozzo_POS_Completo.html + JS en la raíz del proyecto.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'src');
const mainHtml = join(root, 'Crozzo_POS_Completo.html');
const assets = ['CrozzoA11yUser.js', 'CrozzoSidebarNav.js', 'CrozzoSystemUpdates.js'];

if (!existsSync(mainHtml)) {
  console.error('[sync] No se encontró Crozzo_POS_Completo.html en la raíz del proyecto.');
  process.exit(1);
}

mkdirSync(srcDir, { recursive: true });

const destHtml = join(srcDir, 'index.html');
copyFileSync(mainHtml, destHtml);

let copied = 0;
for (const name of assets) {
  const from = join(root, name);
  if (!existsSync(from)) {
    console.warn('[sync] Omitido (no existe):', name);
    continue;
  }
  copyFileSync(from, join(srcDir, name));
  copied++;
}

const bytes = statSync(destHtml).size;
console.log('[sync] OK → src/index.html (' + Math.round(bytes / 1024) + ' KB)');
console.log('[sync] JS copiados:', copied, 'de', assets.length);
