/**
 * Verifica lógica revealQrNode: canvas oculto + img con data URL → debe mostrar img.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'app/modules/CrozzoPairingQuickQr.js'), 'utf8');
const fnBlock = src.match(/function revealQrNode\([\s\S]*?\n  \}/);
if (!fnBlock) {
  console.error('FAIL: no se encontró revealQrNode');
  process.exit(1);
}

function makeEl(tag) {
  return {
    tagName: tag.toUpperCase(),
    style: {},
    src: '',
    width: tag === 'canvas' ? 300 : 0,
    height: tag === 'canvas' ? 300 : 0,
    querySelector(sel) {
      if (sel === 'canvas') return this._canvas || null;
      if (sel === 'img') return this._img || null;
      return null;
    },
  };
}

const host = makeEl('div');
const canvas = makeEl('canvas');
canvas.style.display = 'none';
const img = makeEl('img');
img.src =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
host._canvas = canvas;
host._img = img;

// eslint-disable-next-line no-new-func
const revealQrNode = new Function(
  'host',
  'sizePx',
  fnBlock[0].replace('function revealQrNode(host, sizePx)', '') + '\nreturn revealQrNode(host, sizePx);'
);

const node = revealQrNode(host, 300);
const ok = node && node.tagName === 'IMG' && node.style.display === 'block' && canvas.style.display === 'none';

console.log(
  JSON.stringify(
    {
      RESULTADO: ok ? 'OK' : 'FAIL',
      nodeTag: node && node.tagName,
      imgDisplay: img.style.display,
      canvasDisplay: canvas.style.display,
    },
    null,
    2
  )
);
process.exit(ok ? 0 : 1);
