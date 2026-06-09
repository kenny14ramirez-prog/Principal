import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(fileURLToPath(new URL('.', import.meta.url)), '..', 'app');
const files = [
  'css/CrozzoPosStyles.css',
  'core/CrozzoPosMain.js',
  'core/CrozzoPosExtensions.js',
  'core/CrozzoLazyModules.js',
  'bundles/CrozzoBundleCompras.js',
  'bundles/CrozzoBundleCostos.js',
  'bundles/CrozzoBundleReservorio.js',
];
for (const f of files) {
  const p = path.join(root, f);
  if (fs.existsSync(p)) console.log((fs.statSync(p).size / 1024).toFixed(1) + ' KB', f);
}
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const defer = [...html.matchAll(/<script[^>]+defer[^>]+src="([^"]+)"/g)].map((m) => m[1]);
let total = 0;
let n = 0;
for (const src of defer) {
  const p = path.join(root, src.replace(/^\.\//, ''));
  if (fs.existsSync(p)) {
    total += fs.statSync(p).size;
    n++;
  }
}
console.log('DEFER scripts:', defer.length, 'on disk:', n, 'total KB:', (total / 1024).toFixed(1));
