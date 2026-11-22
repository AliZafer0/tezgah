// Uçurtma fiziği (yan görünüm, metre ve saniye; x sağa, y yukarı).
// Her şey Verlet parçacıkları ve uzunluk kısıtlarıyla: uçurtma üç parçacıklı rijit bir üçgen
// (burun, kuyruk ve hava ipinin bağlandığı köprü noktası), ip ve kuyruk birer zincir.
// Yelkene düz levha gibi hava kuvveti: F = k·(w·n)·|w|·n (w göreli rüzgâr, n yelken normali).
export const RHO_K = 0.62; // ½·ρ·A·2 (A ≈ 0.52 m²)

export function createWorld({ length = 30, wind = 7, seed = 1, bridle = 0.4 } = {}) {
  const P = []; // { x, y, px, py, im (1/kütle), fx, fy }
  const C = []; // { a, b, len, rope }
  const add = (x, y, m) => (P.push({ x, y, px: x, py: y, im: m ? 1 / m : 0, fx: 0, fy: 0 }), P.length - 1);
  const link = (a, b, len, rope = false) => C.push({ a, b, len: len ?? Math.hypot(P[a].x - P[b].x, P[a].y - P[b].y), rope });

  const hand = add(0, 1.3, 0);
  const NL = 36;
  const ang = 0.5; // ilk ip açısı
  const kx = Math.cos(ang) * length, ky = 1.3 + Math.sin(ang) * length;
  const line = [hand];
  for (let i = 1; i <= NL; i++) line.push(add((kx * i) / NL, 1.3 + ((ky - 1.3) * i) / NL, 0.0012 * (length / NL)));
  // uçurtma: köprü noktası ipin ucu
  const B = line[NL];
  P[B].im = 1 / 0.012;
  // yelken rüzgâra karşı ~35° eğik: burun yukarıda ve rüzgârın geldiği tarafta
  const S = 0.92; // çıta boyu
  const tilt = (35 * Math.PI) / 180;
  const ux = -Math.sin(tilt), uy = Math.cos(tilt); // kuyruktan buruna
  const cxk = P[B].x + 0.28, cyk = P[B].y; // yelken köprüden rüzgâr altında
  const N = add(cxk + ux * S * 0.42, cyk + uy * S * 0.42, 0.075);
  const T = add(cxk - ux * S * 0.58, cyk - uy * S * 0.58, 0.085);
  link(N, T);
  link(N, B, bridle);
  link(T, B, 1.16 - bridle);
  const segL = length / NL;
  for (let i = 1; i <= NL; i++) link(line[i - 1], line[i], segL, true);
  // kuyruk
  const tail = [T];
  const NT = 16, tl = 0.2;
  for (let i = 1; i <= NT; i++) {
    tail.push(add(P[T].x + i * tl * 0.7, P[T].y - i * tl * 0.7, 0.0045));
    link(tail[i - 1], tail[i], tl, true);
  }
  const world = { P, C, hand, line, N, T, B, tail, wind, length, segL, NL, t: 0, cut: false, seed, tension: 0, gust: 1, iter: 18 };
  return world;
}

// yumuşak değer gürültüsü (1B), tohumlu
function noise1(seed) {
  const v = [];
  let s = seed >>> 0;
  for (let i = 0; i < 512; i++) { s = (s * 1664525 + 1013904223) >>> 0; v.push(s / 4294967296); }
  return (t) => {
    const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f);
    return v[i & 511] * (1 - u) + v[(i + 1) & 511] * u;
  };
}

export function windAt(w, x, y) {
  if (!w._n) { w._n = noise1(w.seed); w._m = noise1(w.seed * 7 + 3); }
  const h = Math.max(0.3, y);
  const shear = Math.pow(h / 10, 0.18); // yere yakın rüzgâr zayıf
  const g = 1 + 0.35 * (w._n(w.t * 0.25 + x * 0.01) - 0.5) * 2 + 0.12 * (w._m(w.t * 1.7) - 0.5) * 2;
  w.gust = g;
  const u = w.wind * shear * g;
  const v = 0.6 * (w._m(w.t * 0.6 + x * 0.05 + 40) - 0.5) * Math.min(1, w.wind / 6);
  return [u, v];
}

export function step(w, dt) {
  const { P } = w;
  w.t += dt;
  for (const p of P) { p.fx = 0; p.fy = p.im ? -9.81 / p.im : 0; }
  const vel = (p) => [(p.x - p.px) / dt, (p.y - p.py) / dt];
  // yelken
  const n = P[w.N], tt = P[w.T];
  const mx = (n.x + tt.x) / 2, my = (n.y + tt.y) / 2;
  const [ax, ay] = windAt(w, mx, my);
  const vn = vel(n), vt = vel(tt);
  const wx = ax - (vn[0] + vt[0]) / 2, wy = ay - (vn[1] + vt[1]) / 2;
  let sx = n.x - tt.x, sy = n.y - tt.y;
  const sl = Math.hypot(sx, sy) || 1;
  sx /= sl; sy /= sl;
  const nx = -sy, ny = sx; // yelken normali
  const wl = Math.hypot(wx, wy);
  const wn = wx * nx + wy * ny, wt = wx * sx + wy * sy;
  const Fn = RHO_K * wn * wl, Ft = 0.06 * RHO_K * wt * wl;
  const fx = Fn * nx + Ft * sx, fy = Fn * ny + Ft * sy;
  // basınç merkezi burna yakın (çıtanın %40'ı)
  n.fx += fx * 0.6; n.fy += fy * 0.6;
  tt.fx += fx * 0.4; tt.fy += fy * 0.4;
  w.lift = Fn;
  // kuyruk ve ip: göreli rüzgârla sürüklenme
  for (let i = 1; i < w.tail.length; i++) {
    const p = P[w.tail[i]];
    const [u, v] = windAt(w, p.x, p.y);
    const [px, py] = vel(p);
    const rx = u - px, ry = v - py, rl = Math.hypot(rx, ry);
    p.fx += 0.0028 * rx * rl; p.fy += 0.0028 * ry * rl;
  }
  for (let i = 1; i < w.line.length - (w.cut ? 0 : 1); i++) {
    const p = P[w.line[i]];
    const [u, v] = windAt(w, p.x, p.y);
    const [px, py] = vel(p);
    const rx = u - px, ry = v - py, rl = Math.hypot(rx, ry);
    p.fx += 0.0009 * w.segL * rx * rl; p.fy += 0.0009 * w.segL * ry * rl;
  }
  // Verlet
  const damp = 0.999;
  for (const p of P) {
    if (!p.im) { p.px = p.x; p.py = p.y; continue; }
    const vx = (p.x - p.px) * damp, vy = (p.y - p.py) * damp;
    p.px = p.x; p.py = p.y;
    p.x += vx + p.fx * p.im * dt * dt;
    p.y += vy + p.fy * p.im * dt * dt;
  }
  // kısıtlar
  let pull = 0;
  for (let k = 0; k < w.iter; k++) {
    for (const c of w.C) {
      if (c.off) continue;
      const a = P[c.a], b = P[c.b];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-9;
      if (c.rope && d <= c.len) continue;
      const wsum = a.im + b.im;
      if (!wsum) continue;
      const diff = (d - c.len) / d / wsum;
      a.x += dx * diff * a.im; a.y += dy * diff * a.im;
      b.x -= dx * diff * b.im; b.y -= dy * diff * b.im;
      if (c.a === w.hand) pull += Math.abs(d - c.len) * (1 / b.im);
    }
    for (const p of P) if (p.y < 0.02 && p.im) { p.y = 0.02; p.px = p.x - (p.x - p.px) * 0.3; }
  }
  w.tension = w.tension * 0.95 + (pull / (dt * dt)) * 0.05;
}

export function setLength(w, L) {
  L = Math.max(4, Math.min(90, L));
  w.length = L;
  w.segL = L / w.NL;
  for (const c of w.C) if (c.rope && w.line.includes(c.a) && w.line.includes(c.b)) c.len = w.segL;
}
export function cut(w) {
  if (w.cut) return;
  w.cut = true;
  // köprü noktasıyla ip arasındaki son halka kopar: ipin ucu ayrı bir parçacık olur
  const last = w.C.find((c) => c.b === w.B && c.rope);
  const p = w.P[w.B];
  w.P.push({ x: p.x, y: p.y, px: p.px, py: p.py, im: 1 / 0.002, fx: 0, fy: 0 });
  last.b = w.P.length - 1;
  w.line[w.line.length - 1] = w.P.length - 1;
}
// Köprü ayarı: bağlantı noktası buruna yaklaştıkça hücum açısı küçülür (alçak ve kararlı uçuş);
// kuyruğa yaklaştıkça açı büyür, uçurtma diklenir ve taklaya yatkınlaşır.
export function setBridle(w, k) {
  k = Math.max(0.32, Math.min(0.52, k));
  w.C[1].len = k;
  w.C[2].len = 1.16 - k;
  w.bridle = k;
}
export const kite = (w) => ({ n: w.P[w.N], t: w.P[w.T], b: w.P[w.B] });
