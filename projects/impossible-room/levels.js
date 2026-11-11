// Odalar. Her oda önce tutarlı bir yapı olarak kurulur; sonra parçalar çözüm bakış
// yönü (d) boyunca farklı derinliklere kaydırılır. Ortografik izdüşümde d boyunca
// kaydırma ekrandaki görüntüyü değiştirmez: parçalar yalnızca bu yönden bakınca
// birleşir, başka açılardan aralarındaki gerçek boşluk görünür.

export const COLORS = {
  porcelain: [0.95, 0.93, 0.89],
  stone: [0.84, 0.8, 0.73],
  coral: [0.89, 0.43, 0.33],
  navy: [0.13, 0.17, 0.29],
};

const DEG = Math.PI / 180;

/** Kameranın sahneden bakış yönü (hedeften kameraya). */
export function viewDir(yaw, pitch) {
  return [Math.cos(pitch * DEG) * Math.sin(yaw * DEG), Math.sin(pitch * DEG), Math.cos(pitch * DEG) * Math.cos(yaw * DEG)];
}

const normalize = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

/** Merkez ve boyutla kutu. */
const box = (center, size, color, group) => ({
  min: center.map((c, i) => c - size[i] / 2),
  max: center.map((c, i) => c + size[i] / 2),
  color,
  group,
});

/** Grupları d boyunca kaydırır; temas noktalarından birleşim çiftleri üretir. */
function displace(pieces, contacts, offsets, d) {
  const shift = (g) => scale(d, offsets[g] ?? 0);
  return {
    pieces: pieces.map((p) => ({ ...p, min: add(p.min, shift(p.group)), max: add(p.max, shift(p.group)) })),
    joints: contacts.map(([pt, ga, gb]) => [add(pt, shift(ga)), add(pt, shift(gb))]),
  };
}

// ---------- 1. Eşik: iki sütun ve bir kiriş tek bir geçide dönüşür ----------
function threshold() {
  const target = { yaw: 32, pitch: 22 };
  const d = viewDir(target.yaw, target.pitch);
  const { porcelain, stone, coral, navy } = COLORS;
  const pieces = [
    box([-1.6, 0.2, 0], [1.4, 0.4, 1.4], stone, 'plinthL'),
    box([1.6, 0.2, 0], [1.4, 0.4, 1.4], stone, 'plinthR'),
    box([-1.6, 2.0, 0], [0.8, 3.2, 0.8], porcelain, 'colL'),
    box([1.6, 2.0, 0], [0.8, 3.2, 0.8], porcelain, 'colR'),
    box([0, 3.95, 0], [4.6, 0.7, 1.1], coral, 'lintel'),
    box([0, 3.95, 0.62], [0.55, 0.5, 0.14], navy, 'lintel'),
  ];
  // Alttaki parça her zaman daha uzakta: temas yüzleri doğru örtüşür.
  const offsets = { plinthL: -2.6, colL: -1.1, plinthR: 0.4, colR: 1.9, lintel: 3.6 };
  const contacts = [
    [[-1.6, 0.4, 0], 'plinthL', 'colL'],
    [[1.6, 0.4, 0], 'plinthR', 'colR'],
    [[-1.6, 3.6, 0], 'colL', 'lintel'],
    [[1.6, 3.6, 0], 'colR', 'lintel'],
  ];
  return {
    id: 'esik', name: 'Eşik', target, start: { yaw: 84, pitch: 12 },
    ...displace(pieces, contacts, offsets, d),
  };
}

// ---------- 2. Döngü: üç kiriş kesintisiz bir imkânsız üçgen olur ----------
// Kanonik yapı d = (1,1,1) için: x, y, z boyunca üç kiriş; açık uçlar d boyunca hizalı.
function loop() {
  const L = 4.2;
  const w = 0.9;
  const { porcelain, stone, coral } = COLORS;
  // Tek malzeme: birleşim yerlerinde renk farkı yanılsamayı bozmasın.
  const canonical = [
    { min: [0, 0, 0], max: [L, w, w], color: coral },
    { min: [L - w, w, 0], max: [L, L, w], color: coral },
    { min: [L - w, L - w, w], max: [L, L, L], color: coral },
  ];
  // Hedef yönü değiştirmek için yapı y ekseni etrafında döndürülür (45° → -45°).
  const rot = (p) => [-p[2], p[1], p[0]]; // y etrafında −90°: (1,1,1) → (−1,1,1)
  const c = [L / 2, L / 2, L / 2];
  const toWorld = (p) => rot([p[0] - c[0], p[1] - c[1], p[2] - c[2]]);
  const pieces = canonical.map((b) => {
    const a = toWorld(b.min);
    const z = toWorld(b.max);
    return { min: a.map((v, i) => Math.min(v, z[i])), max: a.map((v, i) => Math.max(v, z[i])), color: b.color };
  });
  return {
    id: 'dongu', name: 'Döngü',
    target: { yaw: -45, pitch: Math.atan(1 / Math.SQRT2) / DEG },
    start: { yaw: 8, pitch: 14 },
    pieces,
    joints: [[toWorld([L, L, L]), toWorld([0, 0, 0])], [toWorld([L - w, L - w, L]), toWorld([0, 0, w])]],
  };
}

// ---------- 3. Merdiven: dört kola ayrılmış basamaklar kendi üzerine döner ----------
// Yol: +x×5, +z×5, −x×2, −z×2 (14 basamak). Toplam yer değiştirme (3s, 14h, 3s)
// çözüm yönüne paraleldir; bu yüzden 14. basamak ekranda 0. basamağın yerine düşer.
function stairs() {
  const s = 0.95;
  const h = 0.27;
  const t = 1.15; // yüksek bloklar: rıhtlar görünür
  const moves = [
    ...Array(5).fill([1, 0]), ...Array(5).fill([0, 1]),
    ...Array(2).fill([-1, 0]), ...Array(2).fill([0, -1]),
  ];
  const groups = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 3, 3];
  const n = moves.length;
  const yaw = 45;
  const pitch = Math.atan((n * h) / (3 * s * Math.SQRT2)) / DEG;
  const d = viewDir(yaw, pitch);
  const { porcelain, coral } = COLORS;
  const centers = [];
  let p = [0, 0, 0];
  for (let i = 0; i <= n; i++) {
    centers.push(p);
    if (i < n) p = [p[0] + moves[i][0] * s, p[1] + h, p[2] + moves[i][1] * s];
  }
  const mid = [2.5 * s, (n * h) / 2, 2.5 * s];
  const local = (q) => [q[0] - mid[0], q[1] - mid[1], q[2] - mid[2]];
  const pieces = [];
  for (let i = 0; i < n; i++) {
    const c = local(centers[i]);
    pieces.push(box([c[0], c[1] - t / 2, c[2]], [s, t, s], i === 0 ? coral : porcelain, groups[i]));
  }
  // Kollar d boyunca ayrılır; sıradaki kol hep daha yakında kalır (örtüşme sırası korunur).
  const offsets = { 0: 0, 1: 1.3, 2: 2.6, 3: 3.9 };
  const contacts = [
    [local(centers[5]), 0, 1],
    [local(centers[10]), 1, 2],
    [local(centers[12]), 2, 3],
  ];
  const shifted = displace(pieces, contacts, offsets, d);
  // Kapanış: var olmayan 14. basamak (grup 3) ekranda 0. basamakla (grup 0) çakışır.
  const close = [add(local(centers[n]), scale(d, offsets[3])), add(local(centers[0]), scale(d, offsets[0]))];
  return {
    id: 'merdiven', name: 'Merdiven', target: { yaw, pitch }, start: { yaw: -14, pitch: 18 },
    pieces: shifted.pieces,
    joints: [...shifted.joints, close],
  };
}

export const LEVELS = [threshold(), loop(), stairs()];

/** Sınır küresi (kadraj ve ışık için). */
export function bounds(level) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of level.pieces) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p.min[i]); hi[i] = Math.max(hi[i], p.max[i]); }
  const center = lo.map((v, i) => (v + hi[i]) / 2);
  const radius = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2;
  // Kadraj odağı: çözüm görünümünde kompozisyonun ekran merkezi (d'ye dik düzlemde)
  const d = viewDir(level.target.yaw, level.target.pitch);
  const right = normalize([d[2], 0, -d[0]]);
  const up = cross3(d, right);
  let rx0 = Infinity; let rx1 = -Infinity; let uy0 = Infinity; let uy1 = -Infinity;
  for (const p of level.pieces) {
    for (const x of [p.min[0], p.max[0]]) for (const y of [p.min[1], p.max[1]]) for (const z of [p.min[2], p.max[2]]) {
      const v = [x - center[0], y - center[1], z - center[2]];
      const a = v[0] * right[0] + v[1] * right[1] + v[2] * right[2];
      const b = v[0] * up[0] + v[1] * up[1] + v[2] * up[2];
      rx0 = Math.min(rx0, a); rx1 = Math.max(rx1, a); uy0 = Math.min(uy0, b); uy1 = Math.max(uy1, b);
    }
  }
  const ox = (rx0 + rx1) / 2;
  const oy = (uy0 + uy1) / 2;
  const focus = center.map((c, i) => c + right[i] * ox + up[i] * oy);
  return { center, radius, focus, focusShift: Math.hypot(ox, oy), extent: [rx1 - rx0, uy1 - uy0], floorY: lo[1] - 0.6 };
}

/** Kamera yönü ile hedef arasındaki açı (derece); yaw döngüsü vektörle çözülür. */
export function angleToTarget(level, yaw, pitch) {
  const a = viewDir(yaw, pitch);
  const b = viewDir(level.target.yaw, level.target.pitch);
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return Math.acos(dot) / DEG;
}

/** Ekran uzayı hizalaması: birleşim çiftlerinin bakış yönüne dik uzaklığı (en kötüsü, yarıçapa oranla). */
export function jointError(level, yaw, pitch, radius) {
  const d = viewDir(yaw, pitch);
  let worst = 0;
  for (const [a, b] of level.joints) {
    const v = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const along = v[0] * d[0] + v[1] * d[1] + v[2] * d[2];
    const perp = Math.hypot(v[0] - along * d[0], v[1] - along * d[1], v[2] - along * d[2]);
    worst = Math.max(worst, perp / radius);
  }
  return worst;
}
