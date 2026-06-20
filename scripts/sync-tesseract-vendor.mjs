import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const vendorDir = join(root, 'app', 'vendor');
const coreDir = join(vendorDir, 'tesseract-core');
const tessPkg = join(root, 'node_modules', 'tesseract.js');
const corePkg = join(root, 'node_modules', 'tesseract.js-core');

if (!existsSync(tessPkg)) {
  console.error('[tesseract-vendor] Falta node_modules/tesseract.js — ejecuta npm install');
  process.exit(1);
}

mkdirSync(coreDir, { recursive: true });

copyFileSync(join(tessPkg, 'dist', 'tesseract.min.js'), join(vendorDir, 'CrozzoTesseract.min.js'));
copyFileSync(join(tessPkg, 'dist', 'worker.min.js'), join(vendorDir, 'CrozzoTesseract.worker.min.js'));

for (const name of readdirSync(corePkg)) {
  if (name.endsWith('.wasm.js')) {
    copyFileSync(join(corePkg, name), join(coreDir, name));
  }
}

console.log('[tesseract-vendor] OK → app/vendor/CrozzoTesseract*.js + tesseract-core/');
