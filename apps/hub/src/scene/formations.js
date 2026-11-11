// Parçacıkların dizilebileceği biçimler. 0 = boşta (galeri), 1–6 = projeye özgü.
// Her fonksiyon deterministiktir: aynı proje her açılışta aynı biçimi alır.

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;

function shell(out, n, r) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const inner = i % 5 === 0;
    const y = 1 - ((i + 0.5) / n) * 2;
    const rad = Math.sqrt(1 - y * y);
    const t = golden * i;
    const R = inner ? 1.25 + r() * 0.12 : 2.05 + (r() - 0.5) * 0.18;
    out.push(Math.cos(t) * rad * R, y * R, Math.sin(t) * rad * R);
  }
}

function rings(out, n, r) {
  const defs = [[1.5, 0.35, 0.2], [2.0, -0.55, 0.9], [2.5, 0.15, -0.6]];
  for (let i = 0; i < n; i++) {
    const [R, tx, tz] = defs[i % 3];
    const a = r() * TAU;
    const j = (r() - 0.5) * 0.09;
    let x = Math.cos(a) * (R + j);
    let y = (r() - 0.5) * 0.06;
    let z = Math.sin(a) * (R + j);
    // eğim: x ekseni etrafında tx, z ekseni etrafında tz
    const y1 = y * Math.cos(tx) - z * Math.sin(tx);
    const z1 = y * Math.sin(tx) + z * Math.cos(tx);
    y = y1; z = z1;
    const x2 = x * Math.cos(tz) - y * Math.sin(tz);
    const y2 = x * Math.sin(tz) + y * Math.cos(tz);
    out.push(x2, y2, z);
  }
}

function helix(out, n, r) {
  const turns = 2.6;
  const H = 4.4;
  for (let i = 0; i < n; i++) {
    const t = r();
    const y = (t - 0.5) * H;
    const a = t * TAU * turns;
    if (i % 9 === 0) {
      // basamaklar: iki sarmalı birleştiren çubuklar
      const k = Math.round(t * 28) / 28;
      const ak = k * TAU * turns;
      const u = r() * 2 - 1;
      out.push(Math.cos(ak) * 1.25 * u, (k - 0.5) * H, Math.sin(ak) * 1.25 * u);
      continue;
    }
    const side = i % 2 ? Math.PI : 0;
    const R = 1.25 + (r() - 0.5) * 0.14;
    out.push(Math.cos(a + side) * R, y, Math.sin(a + side) * R);
  }
}

function knot(out, n, r) {
  const p = 2, q = 3, R = 1.45, tube = 0.55;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU;
    const cr = R + tube * Math.cos(q * t);
    const cx = cr * Math.cos(p * t);
    const cy = cr * Math.sin(p * t);
    const cz = tube * Math.sin(q * t) * 1.6;
    const s = 0.17;
    out.push(cx + (r() - 0.5) * s, cy + (r() - 0.5) * s, cz + (r() - 0.5) * s);
  }
}

function lattice(out, n, r) {
  const size = 1.7;
  const steps = 4;
  const cos = Math.cos(0.62), sin = Math.sin(0.62);
  for (let i = 0; i < n; i++) {
    const axis = i % 3;
    const a = (Math.floor(r() * steps) / (steps - 1)) * 2 - 1;
    const b = (Math.floor(r() * steps) / (steps - 1)) * 2 - 1;
    const c = r() * 2 - 1;
    let v = axis === 0 ? [c, a, b] : axis === 1 ? [a, c, b] : [a, b, c];
    v = v.map((x) => x * size);
    // izometrik bakış için y ekseni ve x ekseni etrafında döndür
    const x1 = v[0] * cos - v[2] * sin;
    const z1 = v[0] * sin + v[2] * cos;
    const y2 = v[1] * Math.cos(0.5) - z1 * Math.sin(0.5);
    const z2 = v[1] * Math.sin(0.5) + z1 * Math.cos(0.5);
    out.push(x1, y2, z2);
  }
}

function bloom(out, n, r) {
  // gül eğrisi: r = cos(kθ), hafif çanak biçiminde kıvrılmış taçyapraklar
  const k = 2.5;
  for (let i = 0; i < n; i++) {
    const th = r() * TAU * 2;
    const layer = r();
    const rad = Math.abs(Math.cos(k * th)) * (2.25 - layer * 0.9);
    const z = (rad * rad) * 0.18 - 0.4 + (r() - 0.5) * 0.08;
    out.push(Math.cos(th) * rad, Math.sin(th) * rad, z);
  }
}

function wave(out, n, r) {
  // dairesel bir yüzey: köşesiz, kenarı seyrelerek kaybolan dalga
  const R = 2.5;
  const tilt = -0.95;
  for (let i = 0; i < n; i++) {
    const rad = R * Math.pow(r(), 0.62);
    const a = r() * TAU;
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad;
    const y = 0.42 * Math.sin(x * 1.5 + z * 0.6) * Math.cos(z * 1.2);
    const y1 = y * Math.cos(tilt) - z * Math.sin(tilt);
    const z1 = y * Math.sin(tilt) + z * Math.cos(tilt);
    out.push(x, y1, z1);
  }
}

// Halkaların her biçimdeki eğimi (x, z radyan)
export const RING_TILTS = [
  [[1.25, 0.2], [1.05, -0.55], [1.5, 0.9]],
  [[0.35, 0.2], [-0.55, 0.9], [0.15, -0.6]],
  [[1.57, 0], [1.57, 0.5], [1.57, -0.5]],
  [[0.2, 0.1], [0.5, -0.3], [-0.3, 0.4]],
  [[0.9, 0.62], [0.9, -0.62], [1.57, 0]],
  [[0.1, 0], [0.25, 0.3], [-0.2, -0.25]],
  [[1.0, 0.1], [1.2, -0.2], [0.8, 0.3]],
];

const BUILDERS = [shell, rings, helix, knot, lattice, bloom, wave];

export function formation(index, count, seed = 1) {
  const out = [];
  BUILDERS[index % BUILDERS.length](out, count, rng(seed + index * 7919));
  return new Float32Array(out);
}

/** Açılış için dağınık başlangıç: geniş, seyrek bir küre. */
export function scatter(count, seed = 3) {
  const r = rng(seed);
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = r() * 2 - 1;
    const a = r() * TAU;
    const R = 4 + r() * 3;
    const s = Math.sqrt(1 - u * u);
    out[i * 3] = Math.cos(a) * s * R;
    out[i * 3 + 1] = u * R;
    out[i * 3 + 2] = Math.sin(a) * s * R;
  }
  return out;
}

/** Bir yazının piksellerinden nokta bulutu (tarayıcıda, kanvas ile). */
export function textFormation(text, count, seed = 5) {
  const r = rng(seed);
  const W = 640; const H = 200;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 150px Georgia, "Times New Roman", serif';
  g.fillText(text, W / 2, H / 2 + 6);
  const data = g.getImageData(0, 0, W, H).data;
  const hits = [];
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (data[(y * W + x) * 4 + 3] > 140) hits.push(x, y);
  const out = new Float32Array(count * 3);
  const n = hits.length / 2;
  if (!n) return out;
  const scale = 5.4 / W;
  for (let i = 0; i < count; i++) {
    const k = Math.floor(r() * n);
    out[i * 3] = (hits[k * 2] - W / 2 + (r() - 0.5) * 2) * scale;
    out[i * 3 + 1] = -(hits[k * 2 + 1] - H / 2 + (r() - 0.5) * 2) * scale;
    out[i * 3 + 2] = (r() - 0.5) * 0.25;
  }
  return out;
}
