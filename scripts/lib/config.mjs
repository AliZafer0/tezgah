import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Testler geçici bir proje klasörü kullanabilsin diye geçersiz kılınabilir.
export const PROJECTS_DIR = path.resolve(process.env.PLAYGROUND_PROJECTS_DIR || path.join(ROOT, 'projects'));
export const TEMPLATE_DIR = path.join(ROOT, 'projects', '_template');
export const HUB_DIR = path.join(ROOT, 'apps', 'hub');
export const DIST_DIR = path.join(ROOT, 'dist');

export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 4780;

export function serverAddress() {
  const host = process.env.HOST || DEFAULT_HOST;
  const port = Number(process.env.PORT || DEFAULT_PORT);
  return { host, port, origin: `http://${host.includes(':') ? `[${host}]` : host}:${port}` };
}
