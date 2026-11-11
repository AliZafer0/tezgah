#!/usr/bin/env node
// Galeri + proje sunucusu.
//   node scripts/server.mjs --dev   → Vite (galeri) + projects/ canlı keşif
//   node scripts/server.mjs         → dist/ (npm run build çıktısı)
// Varsayılan adres 127.0.0.1:4780; HOST ve PORT ortam değişkenleriyle değişir.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DIST_DIR, HUB_DIR, PROJECTS_DIR, serverAddress } from './lib/config.mjs';
import { buildManifest, discoverProjects } from './lib/projects.mjs';
import { resolveInside } from './lib/safe-path.mjs';
import {
  decodePathname, hubHeaders, projectHeaders, redirect, sendFile, sendJson, sendText,
} from './lib/http.mjs';

const dev = process.argv.includes('--dev');
const { host, port, origin } = serverAddress();

// --- Proje kaynağı: dev'de canlı keşif, üretimde dist/projects.json -------------
// Asset istekleri için kısa ömürlü önbellek. Dosya izleyici olayları birleşebildiği
// için yalnızca invalidate'e güvenilmez; manifest her istekte yeniden keşfedilir.
const DEV_CACHE_MS = 1000;
function createDevSource() {
  let cached = null;
  let cachedAt = 0;
  return {
    async get({ fresh = false } = {}) {
      if (fresh || !cached || Date.now() - cachedAt > DEV_CACHE_MS) {
        cachedAt = Date.now();
        cached = discoverProjects(PROJECTS_DIR).catch((err) => {
          cached = null;
          throw err;
        });
      }
      return cached;
    },
    invalidate() { cached = null; },
    async manifest() { return buildManifest(await this.get({ fresh: true }), { includeIssues: true }); },
    async root(slug) {
      const { projects } = await this.get();
      return projects.find((p) => p.slug === slug)?.servedRoot ?? null;
    },
  };
}

async function createDistSource() {
  const manifestPath = path.join(DIST_DIR, 'projects.json');
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch {
    console.error('dist/projects.json bulunamadı. Önce "npm run build" çalıştırın ya da geliştirme için "npm run dev" kullanın.');
    process.exit(1);
  }
  const slugs = new Set(manifest.projects.map((p) => p.slug));
  return {
    async manifest() { return manifest; },
    async root(slug) { return slugs.has(slug) ? path.join(DIST_DIR, 'projects', slug) : null; },
  };
}

const source = dev ? createDevSource() : await createDistSource();

// --- /projects/<slug>/... --------------------------------------------------------
async function handleProject(req, res, pathname) {
  const rest = pathname.slice('/projects/'.length);
  const slash = rest.indexOf('/');
  const slug = slash === -1 ? rest : rest.slice(0, slash);
  const headers = projectHeaders();

  if (!slug) return redirect(res, '/', headers);
  const root = await source.root(slug);
  if (!root) return sendText(res, 404, 'Proje bulunamadı.', headers);
  // Göreli asset yollarının proje klasörüne çözülmesi için sondaki "/" şart.
  if (slash === -1) return redirect(res, `/projects/${encodeURIComponent(slug)}/`, headers);

  let rel = rest.slice(slash + 1);
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const file = await resolveInside(root, rel);
  if (!file) return sendText(res, 404, 'Dosya bulunamadı.', headers);
  return sendFile(req, res, file, { headers });
}

// --- Galeri (üretim) -------------------------------------------------------------
async function handleDistHub(req, res, pathname) {
  const headers = hubHeaders({ dev: false });
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = await resolveInside(DIST_DIR, rel);
  if (!file) return sendText(res, 404, 'Bulunamadı.', headers);
  const immutable = rel.startsWith('assets/');
  return sendFile(req, res, file, { headers, cache: immutable ? 'public, max-age=31536000, immutable' : 'no-cache' });
}

let vite = null;
const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendText(res, 405, 'Yöntem desteklenmiyor.', { Allow: 'GET, HEAD' });
    }
    const pathname = decodePathname(req.url);
    if (pathname === null) return sendText(res, 400, 'Geçersiz adres.');

    if (pathname === '/projects.json') {
      return sendJson(res, 200, await source.manifest(), hubHeaders({ dev }));
    }
    if (pathname === '/projects') return redirect(res, '/');
    // Kendi ikonu olmayan projelerde tarayıcının otomatik isteği galeri ikonuna düşer.
    if (pathname === '/favicon.ico') return redirect(res, '/favicon.svg');
    if (pathname.startsWith('/projects/')) return await handleProject(req, res, pathname);

    if (dev) {
      for (const [k, v] of Object.entries(hubHeaders({ dev }))) res.setHeader(k, v);
      return vite.middlewares(req, res, () => sendText(res, 404, 'Bulunamadı.'));
    }
    return await handleDistHub(req, res, pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendText(res, 500, 'Sunucu hatası.');
    else res.destroy();
  }
});

if (dev) {
  const { createServer } = await import('vite');
  vite = await createServer({
    configFile: path.join(HUB_DIR, 'vite.config.js'),
    server: { middlewareMode: true, ws: { server } },
    // 'mpa': bilinmeyen yollar index.html'e düşmez, 404 döner (önizleme yönlendirmesi hash ile).
    appType: 'mpa',
  });

  // projects/ değişince keşfi tazele; galeriye ve açık önizlemeye haber ver.
  vite.watcher.add(PROJECTS_DIR);
  vite.watcher.on('all', async (_event, file) => {
    const rel = path.relative(PROJECTS_DIR, file);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return;
    const folder = rel.split(path.sep)[0];
    source.invalidate();
    let slug = null;
    try {
      const { projects } = await source.get();
      slug = projects.find((p) => p.dir === path.join(PROJECTS_DIR, folder))?.slug ?? null;
    } catch { /* keşif hatası manifest isteğinde raporlanır */ }
    vite.ws.send({ type: 'custom', event: 'playground:changed', data: { slug } });
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`${host}:${port} kullanımda. Başka bir port için: PORT=4790 npm run ${dev ? 'dev' : 'start'}`);
  else console.error(err);
  process.exit(1);
});

server.listen(port, host, async () => {
  const label = dev ? 'geliştirme' : 'üretim (dist/)';
  console.log(`\n  Playground ${label} sunucusu: ${origin}/`);
  if (dev) {
    const { projects, issues } = await source.get().catch(() => ({ projects: [], issues: [] }));
    console.log(`  ${projects.length} proje bulundu${issues.length ? `, ${issues.length} klasörde sorun var (npm run check)` : ''}.\n`);
  }
});

const shutdown = async () => {
  await vite?.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
