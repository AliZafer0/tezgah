import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter } from 'three';

export const GLYPHS = ['0', '1', '{', '}', '<', '>', '/', '*', '+', '=', ';', '#', '(', ')', '[', ']'];
export const ATLAS_COLUMNS = 4;

/** 4×4 glif atlası: parçacıklar kod karakterleri olarak çizilir. */
export async function createGlyphAtlas() {
  const family = '"JetBrains Mono Variable", ui-monospace, monospace';
  try {
    await document.fonts.load(`600 92px ${family}`, GLYPHS.join(''));
  } catch { /* yazı tipi yüklenemezse sistem monospace kullanılır */ }

  const cell = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = cell * ATLAS_COLUMNS;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 92px ${family}`;
  GLYPHS.forEach((g, i) => {
    const x = (i % ATLAS_COLUMNS) * cell + cell / 2;
    const y = Math.floor(i / ATLAS_COLUMNS) * cell + cell / 2 + 4;
    ctx.fillText(g, x, y);
  });

  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = true;
  return texture;
}
