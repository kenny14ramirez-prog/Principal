#!/usr/bin/env node
import net from 'node:net';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const root = process.cwd();
const port = 9199;
const logPath = path.join(root, 'docs', 'reports', 'escpos-test.log');
try { fs.unlinkSync(logPath); } catch (_) {}
const emu = spawn(process.execPath, [path.join(root, 'scripts', '_escpos-emulator.mjs'), String(port), logPath], { stdio: 'inherit' });

await new Promise((r) => setTimeout(r, 1500));

const payload = Buffer.from([
  0x1b, 0x40, // init
  ...Buffer.from('CROZZO POS - TEST\n', 'ascii'),
  ...Buffer.from('Producto x1  $10.000\n', 'ascii'),
  0x1d, 0x56, 0x00, // cut
]);

const client = net.createConnection({ port, host: '127.0.0.1' }, () => {
  client.write(payload, () => client.end());
});

client.on('close', async () => {
  await new Promise((r) => setTimeout(r, 1000));
  const exists = fs.existsSync(logPath);
  const size = exists ? fs.statSync(logPath).size : 0;
  const bytes = exists ? fs.readFileSync(logPath) : Buffer.alloc(0);
  const hasInit = bytes.includes(Buffer.from([0x1b, 0x40]));
  const hasCut = bytes.includes(Buffer.from([0x1d, 0x56, 0x00]));
  const checks = [
    ['emulador recibió datos', size > 0],
    ['contiene ESC @ (init)', hasInit],
    ['contiene GS V (cut)', hasCut],
    ['tamaño coincide', size === payload.length],
  ];
  console.log('\n──────── PRINTER EMULATOR ────────');
  let failed = 0;
  for (const [l, ok] of checks) { if (!ok) failed++; console.log(`  [${ok ? 'OK' : 'X '}] ${l}`); }
  console.log(`  recibidos: ${size} bytes (esperados ${payload.length})`);
  console.log('─────────────────────────────────');
  console.log(`  ${checks.length - failed}/${checks.length} OK`);
  emu.kill();
  process.exit(failed ? 1 : 0);
});
client.on('error', (e) => { console.error('client error', e.message); emu.kill(); process.exit(1); });