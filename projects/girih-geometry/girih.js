// Girih geometrisi: periyodik döşemeler ve Hankin'in "temas eden çokgenler" yöntemi.
// Her kenarın ortasından çokgenin içine iki ışın çıkar; komşu kenarların ışınları köşe yakınında
// kesişir ve yıldız/gül (rozet) desenini oluşturur. Temas açısı θ deseni baştan değiştirir.

const R3 = Math.sqrt(3);
const regular = (cx, cy, n, r, start) => {
  const pts = [];
  for (let k = 0; k < n; k++) { const a = start + (k * 2 * Math.PI) / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
};
const circ = (n) => 1 / (2 * Math.sin(Math.PI / n)); // birim kenarlı düzgün n-genin çevrel yarıçapı
const deg = Math.PI / 180;

// Her döşeme: kafes vektörleri (a, b) ve birim hücredeki çokgenler (kenar uzunluğu 1)
export const TILINGS = {
  '4.8.8': {
    name: 'Sekizli', note: 'Sekizgen ve kare: klasik sekiz kollu yıldız.',
    cell() {
      const w = 1 + Math.SQRT2;
      return {
        a: [w, 0], b: [0, w],
        polys: [regular(0, 0, 8, circ(8), 22.5 * deg), regular(w / 2, w / 2, 4, Math.SQRT1_2, 0)],
      };
    },
    angle: 67.5,
  },
  '3.12.12': {
    name: 'Onikili', note: 'Onikigen ve üçgen: on iki kollu Selçuklu yıldızı.',
    cell() {
      const d = 2 * circ(12) * Math.cos(15 * deg); // iki onikigen merkezi arası
      const a = [d, 0]; const b = [d / 2, (d * R3) / 2];
      const c1 = [(a[0] + b[0]) / 3, (a[1] + b[1]) / 3];
      const c2 = [(2 * (a[0] + b[0])) / 3, (2 * (a[1] + b[1])) / 3];
      return {
        a, b,
        polys: [regular(0, 0, 12, circ(12), 15 * deg), regular(c1[0], c1[1], 3, 1 / R3, 30 * deg), regular(c2[0], c2[1], 3, 1 / R3, 90 * deg)],
      };
    },
    angle: 75,
  },
  '6.6.6': {
    name: 'Altılı', note: 'Altıgen döşeme: altı kollu yıldız ve geçmeler.',
    cell() { return { a: [1.5, R3 / 2], b: [0, R3], polys: [regular(0, 0, 6, 1, 0)] }; },
    angle: 60,
  },
  '4.4.4.4': {
    name: 'Dörtlü', note: 'Kare döşeme: dörtlü yıldız ve hasır örgüsü.',
    cell() { return { a: [1, 0], b: [0, 1], polys: [regular(0.5, 0.5, 4, Math.SQRT1_2, 45 * deg)] }; },
    angle: 67.5,
  },
  '3.3.3': {
    name: 'Üçlü', note: 'Üçgen döşeme: altı kollu çiçekler.',
    cell() {
      return { a: [1, 0], b: [0.5, R3 / 2], polys: [[[0, 0], [1, 0], [0.5, R3 / 2]], [[1, 0], [1.5, R3 / 2], [0.5, R3 / 2]]] };
    },
    angle: 40,
  },
};

// Bir dikdörtgeni (desen biriminde) kaplayan tüm çokgenler
export function tile(key, minX, minY, maxX, maxY) {
  const { a, b, polys } = TILINGS[key].cell();
  const det = a[0] * b[1] - a[1] * b[0];
  const toLattice = (x, y) => [(x * b[1] - y * b[0]) / det, (y * a[0] - x * a[1]) / det];
  let i0 = Infinity; let i1 = -Infinity; let j0 = Infinity; let j1 = -Infinity;
  for (const [x, y] of [[minX, minY], [maxX, minY], [minX, maxY], [maxX, maxY]]) {
    const [i, j] = toLattice(x, y);
    i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j);
  }
  const out = [];
  for (let i = Math.floor(i0) - 2; i <= Math.ceil(i1) + 1; i++) for (let j = Math.floor(j0) - 2; j <= Math.ceil(j1) + 1; j++) {
    const ox = i * a[0] + j * b[0]; const oy = i * a[1] + j * b[1];
    for (const p of polys) {
      const q = p.map(([x, y]) => [x + ox, y + oy]);
      let cx = 0; let cy = 0; for (const [x, y] of q) { cx += x; cy += y; } cx /= q.length; cy /= q.length;
      if (cx < minX - 3 || cy < minY - 3 || cx > maxX + 3 || cy > maxY + 3) continue;
      out.push(q);
    }
  }
  return out;
}

function intersect(p, d, q, e) {
  const den = d[0] * e[1] - d[1] * e[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den;
  const s = ((q[0] - p[0]) * d[1] - (q[1] - p[1]) * d[0]) / den;
  if (t < 0 || s < 0) return null;
  return [p[0] + d[0] * t, p[1] + d[1] * t];
}

// Hankin: çokgen başına çizgi parçaları ve içteki yıldız çokgeni
// theta: kenarla ışın arasındaki açı (derece), delta: ışın başlangıçlarının kenar ortasından uzaklığı
export function hankin(poly, theta, delta) {
  const n = poly.length;
  // Saat yönünün tersine sırala (iç normal sol tarafta kalsın)
  let area = 0; for (let i = 0; i < n; i++) { const [x1, y1] = poly[i]; const [x2, y2] = poly[(i + 1) % n]; area += x1 * y2 - x2 * y1; }
  const P = area < 0 ? [...poly].reverse() : poly;
  const th = theta * deg; const c = Math.cos(th); const s = Math.sin(th);
  const rays = [];
  for (let i = 0; i < n; i++) {
    const [x1, y1] = P[i]; const [x2, y2] = P[(i + 1) % n];
    const L = Math.hypot(x2 - x1, y2 - y1); const u = [(x2 - x1) / L, (y2 - y1) / L]; const nv = [-u[1], u[0]];
    const m = [(x1 + x2) / 2, (y1 + y2) / 2]; const dl = delta * L;
    rays.push({
      // fwd: bir sonraki köşeye doğru eğilen ışın (kenarın baş tarafından çıkar: çapraz "X")
      fwdStart: [m[0] - u[0] * dl, m[1] - u[1] * dl], fwd: [c * u[0] + s * nv[0], c * u[1] + s * nv[1]],
      backStart: [m[0] + u[0] * dl, m[1] + u[1] * dl], back: [-c * u[0] + s * nv[0], -c * u[1] + s * nv[1]],
      cross: [m[0] + nv[0] * dl * Math.tan(th), m[1] + nv[1] * dl * Math.tan(th)], L,
    });
  }
  const segs = []; const star = [];
  const limit = Math.max(...rays.map((r) => r.L)) * Math.min(n, 4);
  // Kör açı yakınında (θ ≈ dış açının yarısı) ışınlar paralelleşir ve çok uzakta kesişir:
  // o zaman her ışın çokgenin çevrel çemberinde kesilir, desen boşalmaz.
  let ccx = 0; let ccy = 0; for (const [x, y] of P) { ccx += x; ccy += y; } ccx /= n; ccy /= n;
  const R = Math.hypot(P[0][0] - ccx, P[0][1] - ccy);
  const clip = (s0, d) => {
    const ox = s0[0] - ccx; const oy = s0[1] - ccy; const b = ox * d[0] + oy * d[1]; const c2 = ox * ox + oy * oy - R * R;
    const t = -b + Math.sqrt(Math.max(0, b * b - c2)); return [s0[0] + d[0] * t, s0[1] + d[1] * t];
  };
  for (let i = 0; i < n; i++) {
    const A = rays[i]; const B = rays[(i + 1) % n];
    const p = intersect(A.fwdStart, A.fwd, B.backStart, B.back);
    if (!p || Math.hypot(p[0] - A.fwdStart[0], p[1] - A.fwdStart[1]) > limit) {
      segs.push([A.fwdStart, clip(A.fwdStart, A.fwd)], [B.backStart, clip(B.backStart, B.back)]);
      continue;
    }
    segs.push([A.fwdStart, p], [B.backStart, p]);
    star.push(delta > 0 ? A.cross : A.fwdStart, p);
  }
  return { segs, star: star.length === 2 * n ? star : null, sides: n };
}

export const THEMES = {
  iznik: { name: 'İznik', bg: '#f3eee4', fills: { 3: '#c7472f', 4: '#2f7f8a', 6: '#1f4e8c', 8: '#1f4e8c', 12: '#1f4e8c' }, outer: '#13294a', inner: '#f3eee4' },
  varak: { name: 'Altın varak', bg: '#0f2236', fills: { 3: '#24496f', 4: '#24496f', 6: '#8a2f2a', 8: '#8a2f2a', 12: '#8a2f2a' }, outer: '#4d3814', inner: '#d4ab52' },
  selcuklu: { name: 'Selçuklu taşı', bg: '#c8a67b', fills: { 3: '#9c7a53', 4: '#a98559', 6: '#b39063', 8: '#b39063', 12: '#b39063' }, outer: '#4b3220', inner: '#e8d4b3' },
  turkuaz: { name: 'Çini turkuaz', bg: '#e6efe9', fills: { 3: '#d9b34a', 4: '#b5463a', 6: '#2b8c88', 8: '#2b8c88', 12: '#2b8c88' }, outer: '#0f3b3a', inner: '#fbf6ea' },
  gece: { name: 'Gece', bg: '#0b0d13', fills: { 3: '#3a2a55', 4: '#3a2a55', 6: '#1c2a48', 8: '#1c2a48', 12: '#1c2a48' }, outer: '#0b0d13', inner: '#9fbcff' },
};
