/**
 * Sirve src/ (POS sincronizado) para pruebas Playwright de campo.
 */
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

export function createFieldPosHttpServer(srcRoot) {
  const server = createServer((req, res) => {
    let p = (req.url || '/').split('?')[0];
    if (p === '/') p = '/index.html';
    const file = join(srcRoot, p.replace(/^\//, ''));
    try {
      statSync(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(readFileSync(file));
    } catch {
      res.writeHead(404);
      res.end('');
    }
  });

  function listen(host = '127.0.0.1') {
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, host, () => {
        const addr = server.address();
        resolve({
          host,
          port: addr.port,
          baseUrl: `http://${host}:${addr.port}/index.html`,
        });
      });
    });
  }

  function close() {
    return new Promise((resolve) => server.close(() => resolve()));
  }

  return { server, listen, close };
}
