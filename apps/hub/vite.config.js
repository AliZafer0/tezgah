import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const hubDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(hubDir, '../..');

export default defineConfig({
  root: hubDir,
  publicDir: 'public',
  // Galeri .env okumaz; repo kökündeki ortam dosyaları pakete giremez.
  envDir: false,
  server: {
    fs: {
      strict: true,
      // Vite yalnızca galeri kaynağını ve bağımlılıkları sunabilir; repo kökü,
      // scripts/ ve projects/ /@fs/ üzerinden erişilemez.
      allow: [hubDir, path.join(rootDir, 'node_modules')],
    },
  },
  build: {
    outDir: path.join(rootDir, 'dist'),
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 800,
  },
});
