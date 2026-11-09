#!/usr/bin/env node
import http from 'node:http';
const port = Number(process.argv[2] || 54321);
const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  let body = '';
  req.on('data', (c) => body += c);
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.includes('/auth/v1/')) {
      res.writeHead(200);
      res.end(JSON.stringify({ access_token: 'mock-token', user: { id: 'mock-user', email: 'agent@test.com' }, expires_in: 3600 }));
      return;
    }
    if (req.method === 'GET') {
      res.writeHead(200);
      res.end('[]');
      return;
    }
    // POST/PATCH/DELETE
    res.writeHead(201);
    res.end(JSON.stringify({ ok: true }));
  });
});
server.listen(port, '127.0.0.1', () => console.log('MOCK SUPABASE on', port));