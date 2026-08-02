import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || 5599);
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.md': 'text/plain' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const target = path.join(ROOT, decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname));
  if (!target.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.readFile(target, (err, data) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, {
      'content-type': (TYPES[path.extname(target)] || 'application/octet-stream') + '; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(data);
  });
}).listen(PORT, () => console.log('http://localhost:' + PORT));
