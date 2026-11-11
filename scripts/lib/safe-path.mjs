// Yayınlanabilir dosya kuralları ve izinli kök dışına çıkmayan yol çözümleme.
// Hem geliştirme sunucusu hem üretim kopyalaması bu kuralları kullanır.
import fs from 'node:fs/promises';
import path from 'node:path';

export const PUBLIC_EXTENSIONS = new Set([
  // belge, stil, betik
  'html', 'htm', 'css', 'js', 'mjs', 'json', 'map', 'txt', 'md', 'wasm',
  'glsl', 'vert', 'frag', 'wgsl', 'csv',
  // görsel
  'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'bmp',
  // yazı tipi
  'woff', 'woff2', 'ttf', 'otf',
  // ses ve video
  'mp3', 'ogg', 'oga', 'wav', 'm4a', 'flac', 'mp4', 'webm', 'ogv',
  // 3D
  'glb', 'gltf', 'bin', 'hdr', 'exr', 'ktx2', 'obj', 'mtl', 'stl', 'ply',
]);

// Uzantısı izinli olsa bile yayınlanmayan özel dosyalar.
const PRIVATE_NAMES = new Set([
  'playground.json', 'package.json', 'package-lock.json', 'npm-shrinkwrap.json',
  'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'composer.json', 'composer.lock',
  'jsconfig.json', 'deno.json', 'deno.jsonc',
]);
const PRIVATE_PATTERNS = [
  /^tsconfig.*\.json$/i,
  /\.config\.[cm]?[jt]s$/i, // vite.config.js, eslint.config.mjs ...
  /^\.?env(?:[._-].*)?$/i, // env, env.json, env.local.js (environment.js, envelope.png değil)
];
const PRIVATE_SEGMENTS = new Set(['node_modules']);

export const MIME_TYPES = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8', json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8', txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8', csv: 'text/csv; charset=utf-8',
  glsl: 'text/plain; charset=utf-8', vert: 'text/plain; charset=utf-8',
  frag: 'text/plain; charset=utf-8', wgsl: 'text/plain; charset=utf-8',
  wasm: 'application/wasm',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
  bmp: 'image/bmp',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav',
  m4a: 'audio/mp4', flac: 'audio/flac', mp4: 'video/mp4', webm: 'video/webm',
  ogv: 'video/ogg',
  glb: 'model/gltf-binary', gltf: 'model/gltf+json', bin: 'application/octet-stream',
  hdr: 'application/octet-stream', exr: 'application/octet-stream',
  ktx2: 'image/ktx2', obj: 'text/plain; charset=utf-8', mtl: 'text/plain; charset=utf-8',
  stl: 'model/stl', ply: 'application/octet-stream',
};

export function extensionOf(file) {
  return path.extname(file).slice(1).toLowerCase();
}

/**
 * Göreli yolu ("/" ayraçlı) parçalara ayırır; kökten çıkma veya gizli
 * dosyaya erişme girişimlerinde null döner.
 */
export function splitRelative(relPath) {
  if (typeof relPath !== 'string' || relPath.includes('\0') || relPath.includes('\\')) return null;
  if (path.isAbsolute(relPath) || /^[a-z]:/i.test(relPath)) return null;
  const segments = relPath.split('/').filter((s) => s !== '' && s !== '.');
  for (const s of segments) {
    if (s === '..' || s.startsWith('.') || PRIVATE_SEGMENTS.has(s)) return null;
  }
  return segments;
}

/** Göreli yolun web üzerinden yayınlanmasına izin verilip verilmediği. */
export function isPublishable(relPath) {
  const segments = splitRelative(relPath);
  if (!segments || segments.length === 0) return false;
  const name = segments.at(-1);
  if (PRIVATE_NAMES.has(name.toLowerCase())) return false;
  if (PRIVATE_PATTERNS.some((re) => re.test(name))) return false;
  return PUBLIC_EXTENSIONS.has(extensionOf(name));
}

export function isInside(rootReal, candidateReal) {
  return candidateReal === rootReal || candidateReal.startsWith(rootReal + path.sep);
}

/**
 * relPath'i rootDir altında çözer. Sembolik bağlantılar dahil gerçek yol
 * kökün dışına çıkıyorsa, dosya yoksa veya dosya değilse null döner.
 * requirePublishable=false yalnızca metadata doğrulaması içindir.
 */
export async function resolveInside(rootDir, relPath, { requirePublishable = true } = {}) {
  const segments = splitRelative(relPath);
  if (!segments || segments.length === 0) return null;
  if (requirePublishable && !isPublishable(segments.join('/'))) return null;
  let rootReal;
  let real;
  try {
    rootReal = await fs.realpath(rootDir);
    real = await fs.realpath(path.join(rootReal, ...segments));
  } catch {
    return null;
  }
  if (!isInside(rootReal, real)) return null;
  // Gerçek yol da (symlink hedefi) gizli veya özel bir dosyaya gitmemeli.
  const realRel = path.relative(rootReal, real).split(path.sep).join('/');
  if (requirePublishable && !isPublishable(realRel)) return null;
  try {
    const stat = await fs.stat(real);
    if (!stat.isFile()) return null;
    return { path: real, size: stat.size, mtime: stat.mtime };
  } catch {
    return null;
  }
}
