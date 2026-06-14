/**
 * E2E emparejamiento — modal, QR único, decodificación roundtrip en navegador.
 * Requiere: npx playwright install chromium
 * node scripts/_pairing-flow-check.mjs
 */
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (e) {
  const report = {
    ok: false,
    skipped: true,
    reason: 'playwright no instalado — ejecute: npm install playwright --save-dev && npx playwright install chromium',
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
import { createServer } from 'http';
import { readFileSync, statSync, mkdirSync, writeFileSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src');
const outDir = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'scripts', '_qa-out');
mkdirSync(outDir, { recursive: true });

const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
};

const server = createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  const file = join(root, p.replace(/^\//, ''));
  try {
    statSync(file);
    const ext = extname(file);
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/index.html`;

const report = { ok: true, steps: [], errors: [] };
function step(id, ok, detail, extra) {
  report.steps.push({ id, ok, detail, extra: extra || null });
  if (!ok) report.ok = false;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => report.errors.push(String(e.message || e)));

await page.addInitScript(() => {
  localStorage.setItem('pos_dian_config', JSON.stringify({ seguridad: { requiereLogin: false } }));
  localStorage.setItem(
    'crozzo_lan_config',
    JSON.stringify({ role: 'A', serverIp: '192.168.1.50', centralIp: '192.168.1.50', port: 3000, lanSyncEnabled: true })
  );
  document.documentElement.classList.remove('crozzo-android-apk');
});

await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(3000);

const libs = await page.evaluate(() => ({
  jsQR: typeof window.jsQR === 'function',
  seal: !!(window.CrozzoPairingSeal && window.CrozzoPairingSeal.buildFastQrText),
  reader: !!(window.CrozzoPairingQrReader && window.CrozzoPairingQrReader.readCanvas),
  QRCode: typeof window.QRCode === 'function',
}));
step('libs-loaded', libs.jsQR && libs.seal && libs.reader, 'jsQR/seal/reader', libs);

await page.evaluate(() => {
  if (typeof window.crozzoOpenPairingModal === 'function') window.crozzoOpenPairingModal();
});
await page.waitForTimeout(600);

await page.evaluate(() => {
  if (typeof window.crozzoPairingSelectReceiver === 'function') window.crozzoPairingSelectReceiver('tablet');
});
await page.waitForTimeout(3500);

const qrState = await page.evaluate(() => {
  const host = document.getElementById('crozzoPairingQrHost');
  const canvas = host && host.querySelector('canvas');
  const single = host && host.querySelector('[data-pairing-layout="single"]');
  const warn = document.getElementById('crozzoPairingReceiverWarn');
  return {
    receiverVisible: document.getElementById('crozzoPairingStepReceiver') && !document.getElementById('crozzoPairingStepReceiver').hidden,
    hasCanvas: !!canvas,
    canvasW: canvas ? canvas.width : 0,
    canvasH: canvas ? canvas.height : 0,
    singleLayout: !!single,
    fastText: '',
    warn: warn && !warn.hidden ? warn.textContent : '',
  };
});
step(
  'qr-generated',
  qrState.hasCanvas && qrState.canvasW >= 280 && qrState.singleLayout,
  'QR único canvas ' + qrState.canvasW + 'x' + qrState.canvasH,
  qrState
);

const decodeResult = await page.evaluate(async () => {
  const host = document.getElementById('crozzoPairingQrHost');
  const canvas = host && host.querySelector('canvas');
  if (!canvas || !window.CrozzoPairingQrReader) return { ok: false, reason: 'no_canvas' };
  try {
    await window.CrozzoPairingQrReader.ensureReady();
    const raw = await window.CrozzoPairingQrReader.readCanvas(canvas, true);
    if (!raw) return { ok: false, reason: 'empty_decode' };
    var obj = null;
    if (window.CrozzoPairingSeal && window.CrozzoPairingSeal.unsealFromQr) {
      obj = await window.CrozzoPairingSeal.unsealFromQr(raw);
    }
    return {
      ok: !!obj,
      rawPrefix: String(raw).slice(0, 8),
      ip: obj && obj.lan ? obj.lan.central_ip || obj.lan.server_ip : null,
    };
  } catch (e) {
    return { ok: false, reason: String(e.message || e) };
  }
});
step('qr-decode-roundtrip', decodeResult.ok, 'lector lee QR de pantalla', decodeResult);
step('qr-fast-prefix', String(decodeResult.rawPrefix || '').indexOf('BOF.') === 0, 'payload BOF decodificado', { prefix: decodeResult.rawPrefix });

await page.evaluate(() => {
  if (typeof window.crozzoPairingSelectReader === 'function') window.crozzoPairingSelectReader();
});
await page.waitForTimeout(800);

const readerUi = await page.evaluate(() => ({
  readerVisible: document.getElementById('crozzoPairingStepReader') && !document.getElementById('crozzoPairingStepReader').hidden,
  captureInput: !!document.getElementById('crozzoPairingCaptureInput'),
  hasPickPhoto: typeof window.crozzoPairingPickPhoto === 'function',
  hasDecodeFile: typeof window.crozzoPairingDecodeFile === 'function',
}));
step('reader-ui', readerUi.readerVisible && readerUi.captureInput, 'paso lector tablet', readerUi);

await page.evaluate(() => {
  if (typeof window.crozzoClosePairingModal === 'function') window.crozzoClosePairingModal();
});
const closed = await page.evaluate(() => document.getElementById('crozzoPairingOverlay')?.hasAttribute('hidden'));
step('modal-close', !!closed, 'modal cierra correctamente');

await page.screenshot({ path: join(outDir, 'pairing-flow-check.png'), fullPage: false });
await browser.close();
server.close();

writeFileSync(join(outDir, 'pairing-flow-check.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
