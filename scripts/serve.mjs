// Serves the built game. No dependencies: one file in memory, compressed once at start.
//   PORT=8080 node scripts/serve.mjs
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('../index.html', import.meta.url));
const raw = readFileSync(file);
const page = {
  identity: raw,
  gzip: gzipSync(raw, { level: 9 }),
  br: brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }),
};
const etag = '"' + createHash('sha256').update(raw).digest('base64url').slice(0, 22) + '"';

// The page is self-contained: inline script and style, no network requests of its own.
const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'media-src data: blob:',
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');
const common = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': CSP,
};

const server = createServer((req, res) => {
  const path = (req.url || '/').split('?')[0];
  if (path === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end('ok');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', ...common });
    return res.end();
  }
  if (path === '/favicon.ico') {
    res.writeHead(204, { 'Cache-Control': 'public, max-age=86400' });
    return res.end();
  }
  if (path !== '/' && path !== '/index.html') {
    res.writeHead(302, { Location: '/', ...common });
    return res.end();
  }
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ETag: etag, Vary: 'Accept-Encoding', ...common };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  const accepts = String(req.headers['accept-encoding'] || '');
  const enc = /\bbr\b/.test(accepts) ? 'br' : /\bgzip\b/.test(accepts) ? 'gzip' : 'identity';
  if (enc !== 'identity') headers['Content-Encoding'] = enc;
  headers['Content-Length'] = page[enc].length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : page[enc]);
});

const port = Number(process.env.PORT) || 8080;
server.listen(port, '0.0.0.0', () => {
  console.log(`sundown: serving ${(raw.length / 1024).toFixed(0)} KB (${(page.br.length / 1024).toFixed(0)} KB brotli) on :${port}`);
});
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)));
