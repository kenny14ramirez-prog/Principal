import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.mp4': 'video/mp4' };

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

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message || e)));

await page.addInitScript(() => {
  localStorage.setItem('pos_dian_config', JSON.stringify({ seguridad: { requiereLogin: false } }));
  localStorage.setItem('crozzo_lan_config', JSON.stringify({ role: 'A', serverIp: '192.168.1.50', port: 3000, lanSyncEnabled: true }));
});

await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);

await page.evaluate(() => {
  if (typeof window.crozzoOpenPairingModal === 'function') window.crozzoOpenPairingModal();
});
await page.waitForTimeout(800);

const before = await page.evaluate(() => ({
  choiceHidden: document.getElementById('crozzoPairingStepChoice')?.hidden,
  receiverHidden: document.getElementById('crozzoPairingStepReceiver')?.hidden,
  hasClose: typeof window.crozzoClosePairingModal === 'function',
  hasShare: typeof window.crozzoPairingShareQr === 'function',
}));

await page.evaluate(() => {
  if (typeof window.crozzoPairingSelectReceiver === 'function') window.crozzoPairingSelectReceiver('tablet');
});
await page.waitForTimeout(2000);

const after = await page.evaluate(() => {
  const host = document.getElementById('crozzoPairingQrHost');
  return {
    choiceHidden: document.getElementById('crozzoPairingStepChoice')?.hidden,
    receiverHidden: document.getElementById('crozzoPairingStepReceiver')?.hidden,
    qrCanvas: !!(host && host.querySelector('canvas')),
    warn: document.getElementById('crozzoPairingReceiverWarn')?.textContent || '',
    warnHidden: document.getElementById('crozzoPairingReceiverWarn')?.hidden,
  };
});

await page.evaluate(() => {
  if (typeof window.crozzoClosePairingModal === 'function') window.crozzoClosePairingModal();
});
const closed = await page.evaluate(() => document.getElementById('crozzoPairingOverlay')?.hasAttribute('hidden'));

await page.screenshot({ path: join(root, '..', 'scripts', '_qa-out', 'pairing-flow-check.png'), fullPage: false });
await browser.close();
server.close();

console.log(JSON.stringify({ errors, before, after, closed }, null, 2));
