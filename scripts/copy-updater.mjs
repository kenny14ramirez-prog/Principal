import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', '@tauri-apps', 'plugin-updater', 'dist', 'index.js');
const dest = join(root, 'src', 'tauri-plugin-updater.js');

if (!existsSync(src)) {
  console.warn('[crozzo-pos] @tauri-apps/plugin-updater no instalado aún; omitiendo copia.');
  process.exit(0);
}

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log('[crozzo-pos] Copiado plugin updater → src/tauri-plugin-updater.js');
