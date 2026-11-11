// Lale tarlası geometrisi: her karakter bir nokta. Konumlar GPU'da hesaplanır; burada yalnızca
// parametreler (tür, lale, u, v, açı, glif, tohum, katman) üretilir.
// Tür: 0 taç yaprak, 1 sap, 2 yaprak, 3 zemin

export const KIND = { PETAL: 0, STEM: 1, LEAF: 2, GROUND: 3 };

// 01010011 01000001 01011001 01000101
const SIGN = [...'SAYE'].flatMap((ch) => [...ch.charCodeAt(0).toString(2).padStart(8, '0')].map(Number));

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Renk aileleri (HSV benzeri: ton, doygunluk) — "İstanbul" kırmızı, "karışık" Lale Devri bahçesi
export const PALETTES = {
  istanbul: [[0.985, 0.92], [0.0, 0.88], [0.97, 0.9]],
  bahce: [[0.985, 0.92], [0.09, 0.95], [0.13, 0.85], [0.88, 0.55], [0.78, 0.6], [0.02, 0.15]],
  gece: [[0.74, 0.75], [0.8, 0.6], [0.66, 0.55], [0.92, 0.5]],
};

// Laleler: 0 numara ortadaki kahraman lale
export function layoutTulips(count, seed = 7) {
  const R = rng(seed); const out = [{ x: 0, z: 0, scale: 1.55, hue: 0, phase: 0, height: 1 }];
  let guard = 0;
  while (out.length < count && guard++ < 5000) {
    // Halka halka dağılım: arkaya doğru seyrelen bir tarla
    // Kameranın önünde, arkaya doğru genişleyen bir tarla; kameraya çok yakın bölge boş kalır
    const z = 1.6 - Math.pow(R(), 0.8) * 8.6; const spread = 2.2 + (1.6 - z) * 0.7;
    const x = (R() * 2 - 1) * spread;
    if (Math.hypot(x, z) < 0.95 || Math.hypot(x, z - 4.6) < 3.1) continue;
    if (out.some((t) => Math.hypot(t.x - x, t.z - z) < 0.45)) continue;
    out.push({ x, z, scale: 0.72 + R() * 0.42, hue: R(), phase: R() * Math.PI * 2, height: 0.85 + R() * 0.35 });
  }
  return out;
}

// detail: 1 masaüstü, ~0.5 mobil
export function buildField(tulips, detail = 1, seed = 11) {
  const R = rng(seed);
  const A = []; const B = [];
  const push = (kind, ti, u, v, phi, layer) => {
    A.push(kind, ti, u, v);
    B.push(phi, R() < 0.5 ? 0 : 1, R(), layer);
  };
  tulips.forEach((t, ti) => {
    const hero = ti === 0;
    const k = (hero ? 1 : 0.13) * detail;
    // Taç yapraklar: 3 dış, 3 iç
    for (let p = 0; p < 6; p++) {
      const phi = (p * Math.PI) / 3 + (p % 2 ? 0.08 : 0); const layer = p % 2;
      const n = Math.round(1300 * k * (layer ? 0.85 : 1));
      for (let i = 0; i < n; i++) {
        // u: dipten uca; uca doğru seyrelen örnekleme
        const u = Math.pow(R(), 0.85); const v = R() * 2 - 1;
        push(0, ti, u, v, phi, layer);
      }
    }
    const ns = Math.round(420 * k);
    if (hero) {
      // Ortadaki lalenin sapı: dipten uca sıralı karakterler, sabit bir bit dizisini tekrar tekrar taşır
      for (let i = 0; i < ns; i++) {
        A.push(1, ti, (i + 0.5) / ns, R() * Math.PI * 2);
        B.push(0, SIGN[i % SIGN.length], R(), 1);
      }
    } else for (let i = 0; i < ns; i++) push(1, ti, R(), R() * Math.PI * 2, 0, 0);
    for (let l = 0; l < 2; l++) {
      const phi = (t.phase || 0) + l * Math.PI + (R() - 0.5) * 0.6;
      const nl = Math.round(800 * k);
      for (let i = 0; i < nl; i++) push(2, ti, R(), R() * 2 - 1, phi, l);
    }
  });
  // Zemin: tarlanın tabanında seyrek, karanlık otlar
  const ng = Math.round(14000 * detail);
  for (let i = 0; i < ng; i++) {
    const z = 2.4 - Math.pow(R(), 0.7) * 10.5; const x = (R() * 2 - 1) * (3 + (2.4 - z) * 0.75);
    push(3, -1, x, z, R() * 0.12, 0);
  }
  return { a: new Float32Array(A), b: new Float32Array(B), count: A.length / 4 };
}
