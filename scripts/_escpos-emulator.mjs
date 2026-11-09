#!/usr/bin/env node
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const port = Number(process.argv[2] || 9100);
const logPath = process.argv[3] || path.join(process.cwd(), 'docs', 'reports', 'escpos-session.log');
fs.mkdirSync(path.dirname(logPath), { recursive: true });

const server = net.createServer((socket) => {
  console.log('[escpos] cliente conectado');
  let chunks = [];
  socket.on('data', (d) => {
    chunks.push(d);
    fs.appendFileSync(logPath, d);
    // Basic decode: ESC/POS text often printable; print hex summary
    process.stdout.write(`[escpos] +${d.length} bytes\n`);
  });
  socket.on('end', () => {
    const buf = Buffer.concat(chunks);
    console.log(`[escpos] fin de job — ${buf.length} bytes totales`);
    console.log('[escpos] hex:', buf.toString('hex').slice(0, 120));
  });
  socket.on('error', (e) => console.error('[escpos] socket error', e.message));
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[escpos] emulador escuchando en 127.0.0.1:${port}`);
  console.log(`[escpos] log: ${logPath}`);
});
process.on('SIGINT', () => { server.close(); process.exit(0); });