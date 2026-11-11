import fs from 'node:fs';
import { MIME_TYPES, extensionOf } from './safe-path.mjs';

// Projeler kendi belgelerinde, opak bir origin'de çalışır. Doğrudan açıldığında da
// önizlemedeki iframe ile aynı kısıtlar geçerli olsun diye CSP sandbox gönderilir.
// allow-same-origin bilinçli olarak YOK: proje, galerinin depolamasına/DOM'una erişemez.
export const PROJECT_SANDBOX = 'sandbox allow-scripts allow-pointer-lock allow-popups allow-modals allow-forms allow-downloads';

export function projectHeaders() {
  return {
    'Content-Security-Policy': `${PROJECT_SANDBOX}; frame-ancestors 'self'; base-uri 'self'; object-src 'none'`,
    // Opak origin'den gelen modül betiği, fetch ve font istekleri CORS ister.
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
}

export function hubHeaders({ dev }) {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
  };
  if (!dev) {
    headers['Content-Security-Policy'] = [
      "default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' data: blob:",
      "font-src 'self'", "connect-src 'self'", "frame-src 'self'", "worker-src 'self' blob:",
      "frame-ancestors 'none'", "base-uri 'none'", "object-src 'none'", "form-action 'none'",
    ].join('; ');
  }
  return headers;
}

export function sendText(res, status, text, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(text);
}

export function sendJson(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

export function redirect(res, location, headers = {}) {
  res.writeHead(301, { Location: location, 'Cache-Control': 'no-store', ...headers });
  res.end();
}

/** Önceden doğrulanmış (resolveInside) bir dosyayı akış olarak gönderir. */
export function sendFile(req, res, file, { headers = {}, cache = 'no-cache' } = {}) {
  const type = MIME_TYPES[extensionOf(file.path)] ?? 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': file.size,
    'Last-Modified': file.mtime.toUTCString(),
    'Cache-Control': cache,
    ...headers,
  });
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(file.path);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

/** URL yolunu çözer; geçersiz kodlamada null döner. */
export function decodePathname(rawUrl) {
  try {
    const { pathname } = new URL(rawUrl, 'http://localhost');
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}
