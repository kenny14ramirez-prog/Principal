/**
 * Roundtrip decode BOF — genera QR con qrcode npm y lee con jsQR + CrozzoPairingQrReader.
 * node scripts/_pairing-decode-roundtrip.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';
import { createCanvas, loadImage } from 'canvas';
import jsQR from 'jsqr';
import QRCode from 'qrcode';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'scripts', '_qa-out');
mkdirSync(outDir, { recursive: true });

function runSeal() {
  const code = readFileSync(join(root, 'app/core/CrozzoPairingSeal.js'), 'utf8');
  const sandbox = { crypto: globalThis.crypto, TextEncoder, TextDecoder, atob, btoa, console };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox, { filename: 'seal.js' });
  return sandbox.CrozzoPairingSeal;
}

function runReader() {
  const jsqrCode = readFileSync(join(root, 'app/vendor/CrozzoJsQR.js'), 'utf8');
  const readerCode = readFileSync(join(root, 'app/modules/CrozzoPairingQrReader.js'), 'utf8');
  const sandbox = {
    console,
    document: {
      querySelector: () => ({
        getAttribute: () => null,
        addEventListener: () => {},
      }),
      createElement: () => createCanvas(1, 1),
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(jsqrCode, sandbox, { filename: 'jsqr.js' });
  vm.runInNewContext(readerCode, sandbox, { filename: 'reader.js' });
  return sandbox.CrozzoPairingQrReader;
}

const report = { ok: true, steps: [] };
function step(id, ok, detail, extra) {
  report.steps.push({ id, ok, detail, extra: extra || null });
  if (!ok) report.ok = false;
}

const seal = runSeal();
const reader = runReader();
const payload = {
  type: 'CROZZO_CLOUD_PAIRING',
  version: 4,
  target_profile: 'tablet',
  lan: { central_ip: '192.168.10.88', port: 3000, lan_sync_enabled: true, role: 'B' },
  location_id: 'qa-loc',
  network_primary: { ssid_note: 'QA WiFi' },
  timestamp: Date.now(),
};
const bof = seal.buildFastQrText(payload);
step('bof-text', bof.indexOf('BOF.') === 0, 'BOF generado', { len: bof.length });

const size = 360;
const pngBuf = await QRCode.toBuffer(bof, {
  errorCorrectionLevel: 'M',
  width: size,
  margin: 2,
  color: { dark: '#000000', light: '#ffffff' },
});
step('qr-render', pngBuf && pngBuf.length > 500, 'PNG QR ' + size + 'px', { bytes: pngBuf.length });

const img = await loadImage(pngBuf);
const canvas = createCanvas(size, size);
const ctx = canvas.getContext('2d');
ctx.drawImage(img, 0, 0, size, size);
const id = ctx.getImageData(0, 0, size, size);

const code = jsQR(id.data, id.width, id.height, { inversionAttempts: 'attemptBoth' });
const decodedJs = code && code.data ? String(code.data).trim() : '';
step('jsqr-decode', decodedJs === bof, 'jsQR lee QR generado', { prefix: decodedJs.slice(0, 8) });

const readerCanvas = createCanvas(size, size);
readerCanvas.getContext('2d').drawImage(img, 0, 0);
const decodedReader = await reader.readCanvas(readerCanvas, true);
step('reader-decode', decodedReader === bof, 'CrozzoPairingQrReader lee QR', { prefix: String(decodedReader).slice(0, 8) });

const parsed = seal.parseFastQr(decodedReader || decodedJs || bof);
step(
  'payload-ip',
  parsed && parsed.lan && parsed.lan.central_ip === '192.168.10.88',
  'IP en payload',
  { ip: parsed && parsed.lan ? parsed.lan.central_ip : null }
);

writeFileSync(join(outDir, 'pairing-decode-roundtrip.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
