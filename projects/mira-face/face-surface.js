// Mira'nın dinlenme yüzeyi: tek bir koordinat sisteminde parametrik yükseklik alanı.
// Birim: yüz birimi. x sağa, y yukarı, z izleyiciye doğru. Baş merkezi orijinde.
// Başlangıçta bir kez hesaplanır ve float dokuya yazılır (eğim x, eğim y, derinlik, AO).

export const DOMAIN = { x0: -1.3, x1: 1.3, y0: -1.6, y1: 1.5 };

const g2 = (x, y, sx, sy) => Math.exp(-(x * x) / (sx * sx) - (y * y) / (sy * sy));
const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Kafa yarı genişliği: alında geniş, elmacık kemiğinde en geniş, çeneye doğru daralan oval
export function halfWidth(y) {
  const jaw = smooth(-0.3, -1.22, y);
  const crown = smooth(0.7, 1.4, y);
  return 0.83 - 0.25 * Math.pow(jaw, 1.6) - 0.22 * crown * crown;
}

function baseDepth(x, y) {
  const top = 1.42; const bottom = -1.3;
  const v = y > 0.05 ? (y - 0.05) / (top - 0.05) : (y - 0.05) / (0.05 - bottom);
  const a = halfWidth(y);
  const u = x / a;
  const r = 1 - u * u - (y > 0.05 ? v * v : Math.pow(Math.abs(v), 2.6));
  if (r <= 0) return 0;
  return 0.82 * Math.sqrt(r);
}

function nose(x, y) {
  // Burun köprüsünden uca yükselen sırt; uçta yuvarlanır, kanatlar yanlarda
  const t = smooth(0.12, -0.36, y);
  const end = 1 - smooth(-0.38, -0.47, y);
  const w = 0.055 + 0.06 * smooth(-0.15, -0.42, y);
  const bridge = smooth(0.32, 0.08, y); // sırt kaş hizasının üstünde söner, alna taşmaz
  const ridge = (0.03 * bridge + 0.2 * Math.pow(t, 1.4)) * end * Math.exp(-(x * x) / (w * w));
  const tip = 0.05 * g2(x, y + 0.37, 0.07, 0.055);
  const alae = 0.045 * (g2(x - 0.1, y + 0.405, 0.06, 0.045) + g2(x + 0.1, y + 0.405, 0.06, 0.045));
  const nostril = -0.05 * (g2(x - 0.055, y + 0.45, 0.03, 0.018) + g2(x + 0.055, y + 0.45, 0.03, 0.018));
  return ridge + tip + alae + nostril;
}

function features(x, y) {
  let z = 0;
  for (const s of [-1, 1]) {
    const ex = x - s * 0.355;
    z -= 0.11 * g2(ex, y - 0.1, 0.2, 0.13);          // göz çukuru
    z += 0.035 * g2(ex, y - 0.3, 0.24, 0.06);         // kaş kemeri
    z += 0.06 * g2(x - s * 0.46, y + 0.16, 0.2, 0.17); // yanak
    z += 0.035 * g2(x - s * 0.56, y + 0.02, 0.14, 0.08); // elmacık
    z -= 0.04 * g2(x - s * 0.8, y - 0.32, 0.12, 0.22); // şakak
    z -= 0.025 * g2(x - s * 0.3, y + 0.5, 0.06, 0.12); // nazolabial yumuşak kıvrım
  }
  z += nose(x, y);
  z -= 0.012 * g2(x, y + 0.54, 0.03, 0.05);           // filtrum
  z += 0.04 * g2(x, y + 0.635, 0.21, 0.04);           // üst dudak
  z += 0.05 * g2(x, y + 0.72, 0.17, 0.045);           // alt dudak
  z -= 0.02 * g2(x, y + 0.674, 0.22, 0.01);           // dudak çizgisi
  z -= 0.03 * g2(x, y + 0.84, 0.14, 0.035);           // dudak altı çukuru
  z += 0.06 * g2(x, y + 1.02, 0.17, 0.11);            // çene ucu
  z += 0.015 * g2(x, y - 0.62, 0.45, 0.25);           // alın
  return z;
}

/** Dinlenme yüzeyini örnekler; RGBA Float32Array (eğimX, eğimY, z, ao) döner. */
export function bakeSurface(w, h) {
  const { x0, x1, y0, y1 } = DOMAIN;
  const dx = (x1 - x0) / (w - 1); const dy = (y1 - y0) / (h - 1);
  const z = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    const y = y0 + j * dy;
    for (let i = 0; i < w; i++) {
      const x = x0 + i * dx;
      const b = baseDepth(x, y);
      // Özellikler kafa ovali içinde kalsın; kenarda yumuşakça sönsün
      z[j * w + i] = b > 0 ? b + features(x, y) * smooth(0.0, 0.25, b) : 0;
    }
  }
  // Basit AO: yerel ortalamadan derin olan bölgeler (göz çukuru, burun kanatları) kararır
  const blur = boxBlur(boxBlur(z, w, h, 4), w, h, 4);
  const out = new Float32Array(w * h * 4);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const zl = z[j * w + Math.max(0, i - 1)]; const zr = z[j * w + Math.min(w - 1, i + 1)];
      const zd = z[Math.max(0, j - 1) * w + i]; const zu = z[Math.min(h - 1, j + 1) * w + i];
      out[k * 4] = (zr - zl) / (2 * dx);
      out[k * 4 + 1] = (zu - zd) / (2 * dy);
      out[k * 4 + 2] = z[k];
      out[k * 4 + 3] = Math.min(1, Math.max(0.35, 1 + (z[k] - blur[k]) * 6.5));
    }
  }
  return out;
}

function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h); const dst = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += src[j * w + Math.min(w - 1, Math.max(0, i))];
    for (let i = 0; i < w; i++) {
      tmp[j * w + i] = acc / (2 * r + 1);
      acc += src[j * w + Math.min(w - 1, i + r + 1)] - src[j * w + Math.max(0, i - r)];
    }
  }
  for (let i = 0; i < w; i++) {
    let acc = 0;
    for (let j = -r; j <= r; j++) acc += tmp[Math.min(h - 1, Math.max(0, j)) * w + i];
    for (let j = 0; j < h; j++) {
      dst[j * w + i] = acc / (2 * r + 1);
      acc += tmp[Math.min(h - 1, j + r + 1) * w + i] - tmp[Math.max(0, j - r) * w + i];
    }
  }
  return dst;
}
