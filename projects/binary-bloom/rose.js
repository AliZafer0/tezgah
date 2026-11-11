// Gülün karakter noktaları. Taç yaprakların biçimi shader'da açılma oranına göre
// hesaplanır; burada yalnızca her karakterin yaprak üzerindeki yeri (u, v),
// glif boyutu, dağılma hedefi ve sap/yaprak gibi sabit parçaların konumu üretilir.

export const PETAL_COUNT = 22;
const GOLDEN = 2.399963229728653;

// Deterministik rastgelelik: kapak ve her açılış aynı gülü üretir.
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Yaprak ölçüleri; shader'daki petalShape ile aynı formüller. */
export function petalSize(k) {
  return { length: 0.42 + 0.9 * k, halfWidth: 0.2 + 0.5 * k };
}

/**
 * @param {number} budget  taç yapraklar için karakter sayısı
 * @returns {{ data: Float32Array, count: number, stride: number, petals: {k: number, phi: number}[] }}
 *   Her nokta: kind, k, phi, u | v, glyph, seed, size | sx, sy, sz | tx, ty, tz
 *   kind 0 = taç yaprak (konum shader'da), kind 1 = sabit parça (sx..sz konum)
 */
export function buildRose(budget, seed = 7) {
  const rand = mulberry32(seed);
  const out = [];
  const glyph = () => (rand() < 0.5 ? 0 : 1);

  // Dağılma hedefi: gülün yakın çevresinde basık bir kabuk
  const scatterTarget = () => {
    const u = rand() * 2 - 1;
    const a = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const r = 0.5 + 0.5 * Math.cbrt(rand());
    return [Math.cos(a) * s * r * 2.05, -0.45 + u * r * 1.6, Math.sin(a) * s * r * 2.05];
  };

  const push = (kind, k, phi, u, v, size, sx = 0, sy = 0, sz = 0) => {
    out.push(kind, k, phi, u, v, glyph(), rand(), size, sx, sy, sz, ...scatterTarget());
  };

  // --- Taç yapraklar: içte küçük ve yoğun, dışta geniş ve seyrek ---
  const petals = [];
  let total = 0;
  for (let j = 0; j < PETAL_COUNT; j++) {
    const k = Math.pow(j / (PETAL_COUNT - 1), 0.85);
    const { length, halfWidth } = petalSize(k);
    const weight = length * halfWidth * 1.5 * (1.3 - 0.5 * k);
    petals.push({ k, phi: j * GOLDEN + (rand() - 0.5) * 0.25, length, halfWidth, weight });
    total += weight;
  }

  for (const p of petals) {
    const n = Math.max(24, Math.round((budget * p.weight) / total));
    const aspect = (2 * p.halfWidth) / p.length;
    const cols = Math.max(4, Math.round(Math.sqrt(n * aspect)));
    const rows = Math.max(6, Math.round(n / cols));
    const size = Math.min(p.length / rows, (2 * p.halfWidth) / cols) * 1.55;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Titreşimli ızgara; v kenarlara doğru seyrelir.
        const vv = ((c + 0.2 + rand() * 0.6) / cols) * 2 - 1;
        const v = Math.sign(vv) * Math.pow(Math.abs(vv), 1.35);
        const uu = (r + 0.2 + rand() * 0.6) / rows;
        const u = 0.05 + 0.95 * uu * (1 - 0.16 * v * v); // yuvarlak uç
        push(0, p.k, p.phi, u, v, size * (0.85 + rand() * 0.3));
      }
    }
    // Kontur: yaprağın uç ve yan kenarları boyunca dizili karakterler biçimi okutur.
    const step = size / 1.55;
    const sideCount = Math.max(4, Math.round(p.length / step));
    for (let i = 1; i <= sideCount; i++) {
      for (const side of [-1, 1]) {
        const u = 0.12 + 0.88 * (i / sideCount) * 0.84;
        push(0, p.k, p.phi, u, side, size);
      }
    }
    const topCount = Math.max(4, Math.round((2 * p.halfWidth * 1.1) / step));
    for (let i = 0; i <= topCount; i++) {
      const v = (i / topCount) * 2 - 1;
      push(0, p.k, p.phi, 0.05 + 0.95 * (1 - 0.16 * v * v), v, size);
    }
  }

  // --- Sap: hafif S kıvrımlı ince bir tüp ---
  const stemTop = -0.1;
  const stemBottom = -3.25;
  const stemAt = (y) => [0.1 * Math.sin((y - stemTop) * 0.8), 0.05 * Math.sin(y * 1.3)];
  const sway = (y) => Math.pow((y - stemBottom) / (stemTop - stemBottom), 2);
  for (let y = stemTop; y > stemBottom; y -= 0.045) {
    const [cx, cz] = stemAt(y);
    const radius = 0.034 - 0.008 * ((stemTop - y) / 3);
    const ring = 4;
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * Math.PI * 2 + rand() * 0.8 + y * 3;
      push(1, 0.15, sway(y), 0, 0, 0.042, cx + Math.cos(a) * radius, y + (rand() - 0.5) * 0.02, cz + Math.sin(a) * radius);
    }
  }

  // --- Çanak yapraklar: çiçeğin altında beş dar, aşağı kıvrık yaprak ---
  for (let s = 0; s < 5; s++) {
    const phi = (s / 5) * Math.PI * 2 + 0.4;
    for (let i = 0; i < 26; i++) {
      const u = (i + rand()) / 26;
      const v = (rand() * 2 - 1) * (1 - u) * 0.9;
      const ang = 1.25 + u * 1.1; // dikeyden aşağı doğru
      const r = 0.07 + Math.sin(ang) * u * 0.42;
      const y = stemTop + 0.02 - (1 - Math.cos(ang)) * u * 0.22 - u * 0.1;
      const w = v * 0.07;
      push(1, 0.05, sway(y), 0, 0, 0.04,
        Math.cos(phi) * r - Math.sin(phi) * w, y, Math.sin(phi) * r + Math.cos(phi) * w);
    }
  }

  // --- İki sade yaprak: orta damarı katlanmış, uçları sivri ---
  const leaves = [
    { y: -1.5, phi: 0.25, length: 1.1, width: 0.3, lift: 0.6, roll: 0.75 },
    { y: -2.15, phi: Math.PI - 0.35, length: 0.92, width: 0.26, lift: 0.45, roll: -0.7 },
  ];
  for (const leaf of leaves) {
    const [bx, bz] = stemAt(leaf.y);
    // u: uca doğru, v: kenardan kenara; tone: kenar ve orta damar daha parlak
    const leafPoint = (u, v, tone) => {
      const halfW = leaf.width * Math.pow(Math.sin(Math.PI * Math.min(u * 1.04, 1)), 0.85);
      // Orta damar: yataydan `lift` açısıyla yükselip sarkan sabit eğrilikli yay
      const kappa = -0.9 / leaf.length;
      const a = leaf.lift + kappa * u * leaf.length;
      const radial = 0.03 + (Math.sin(a) - Math.sin(leaf.lift)) / kappa;
      const rise = -(Math.cos(a) - Math.cos(leaf.lift)) / kappa;
      const x = v * halfW;
      const fold = Math.abs(x) * 0.3; // orta damardan V biçiminde katlanma
      // Aya orta damar etrafında döner; önden bakınca yüzey görünür.
      const across = x * Math.cos(leaf.roll);
      const lift = x * Math.sin(leaf.roll) + fold;
      push(1, tone, sway(leaf.y), 0, 0, 0.048,
        bx + Math.cos(leaf.phi) * radial - Math.sin(leaf.phi) * across,
        leaf.y + rise + lift,
        bz + Math.sin(leaf.phi) * radial + Math.cos(leaf.phi) * across);
    };
    const n = Math.round(budget * 0.026 * leaf.length);
    for (let i = 0; i < n; i++) {
      const vv = rand() * 2 - 1;
      leafPoint(0.04 + 0.95 * Math.sqrt(rand()), Math.sign(vv) * Math.pow(Math.abs(vv), 1.3), 0.4);
    }
    const contour = Math.round(leaf.length / 0.045);
    for (let i = 0; i <= contour; i++) {
      const u = 0.03 + 0.96 * (i / contour);
      leafPoint(u, -1, 0.8);
      leafPoint(u, 1, 0.8);
      if (i % 2 === 0) leafPoint(u, 0, 0.7);
    }
  }

  const stride = 14;
  return { data: new Float32Array(out), count: out.length / stride, stride, petals: petals.map(({ k, phi }) => ({ k, phi })) };
}
