// Çini Fırını — model: boyalar, simetri, fırça izleri, örnek desen üreteci ve adres kodlaması.
// Bütün koordinatlar birim uzaydadır: tabak yarıçapı 1, karo [-1, 1] karesi.

export const PALETTE = [
  { key: 'kobalt', name: 'Kobalt mavisi', raw: '#5e6672', fired: '#1c4b9a', h: 0.35 },
  { key: 'turkuaz', name: 'Firuze', raw: '#93aaa5', fired: '#1f9aa0', h: 0.35 },
  { key: 'mercan', name: 'Mercan kırmızısı (bolus)', raw: '#b98c74', fired: '#c3332a', h: 1.0 },
  { key: 'zumrut', name: 'Zümrüt yeşili', raw: '#8d9c83', fired: '#2c7a44', h: 0.4 },
  { key: 'mor', name: 'Patlıcan moru', raw: '#8f8592', fired: '#5b3d6c', h: 0.35 },
  { key: 'tahrir', name: 'Tahrir (kontur siyahı)', raw: '#45454a', fired: '#18202e', h: 0.25 },
  { key: 'astar', name: 'Beyaz astar (silgi)', raw: '#ebe5d7', fired: '#f6f3ea', h: 0.0 },
];
export const GROUND = { raw: '#e7e0d1', fired: '#f3efe4' };
export const TOOLS = ['firca', 'dolgu', 'benek'];
export const W_MIN = 0.004;
export const W_MAX = 0.12;

// ------------------------------------------------------------------ simetri
// n katlı dönme; ayna açıksa her dönmenin yatay eksene göre yansıması da eklenir.
// Her dönüşüm [a, b, c, d] matrisidir: x' = a x + c y, y' = b x + d y
export function transforms(n, mirror) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const t = (k * 2 * Math.PI) / n; const c = Math.cos(t); const s = Math.sin(t);
    out.push([c, s, -s, c]);
    if (mirror) out.push([c, s, s, -c]);
  }
  return out;
}

// ------------------------------------------------------------------ iz sadeleştirme (Ramer–Douglas–Peucker)
export function simplify(pts, eps = 0.0016) {
  const n = pts.length / 2;
  if (n <= 2) return pts.slice();
  const keep = new Uint8Array(n); keep[0] = 1; keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[a * 2]; const ay = pts[a * 2 + 1]; const bx = pts[b * 2]; const by = pts[b * 2 + 1];
    const dx = bx - ax; const dy = by - ay; const len = Math.hypot(dx, dy) || 1e-9;
    let best = -1; let bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i * 2] - ax) * dy - (pts[i * 2 + 1] - ay) * dx) / len;
      if (d > best) { best = d; bi = i; }
    }
    if (best > eps) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out;
}

// ------------------------------------------------------------------ adres kodlaması
// biçim: <t|k><kat (onaltılı)><ayna 0|1><f?>.<base64url>
// her iz: [araç<<3 | renk] [kalınlık 0..255] [nokta sayısı varint] [ilk nokta 2×u16] [farklar zigzag varint]…
const Q = 4095; const SPAN = 2.2;
const q = (v) => Math.max(0, Math.min(Q, Math.round(((v + SPAN / 2) / SPAN) * Q)));
const uq = (i) => (i / Q) * SPAN - SPAN / 2;

function varint(out, v) { while (v > 127) { out.push((v & 127) | 128); v >>>= 7; } out.push(v); }
const zig = (v) => (v << 1) ^ (v >> 31);
const unzig = (v) => (v >>> 1) ^ -(v & 1);

export function encode(doc) {
  const bytes = [];
  for (const s of doc.strokes) {
    bytes.push((TOOLS.indexOf(s.tool) << 3) | s.color);
    bytes.push(Math.max(0, Math.min(255, Math.round(((s.w - W_MIN) / (W_MAX - W_MIN)) * 255))));
    const n = s.pts.length / 2;
    varint(bytes, n);
    let px = 0; let py = 0;
    for (let i = 0; i < n; i++) {
      const x = q(s.pts[i * 2]); const y = q(s.pts[i * 2 + 1]);
      if (i === 0) bytes.push(x >> 8, x & 255, y >> 8, y & 255);
      else { varint(bytes, zig(x - px)); varint(bytes, zig(y - py)); }
      px = x; py = y;
    }
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i += 4096) bin += String.fromCharCode.apply(null, bytes.slice(i, i + 4096));
  const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${doc.shape}${doc.n.toString(16)}${doc.mirror ? 1 : 0}${doc.fired ? 'f' : ''}.${b64}`;
}

export function decode(text) {
  const m = /^([tk])([1-9a-c])([01])(f?)\.([A-Za-z0-9_-]*)$/.exec(text);
  if (!m) return null;
  let bin;
  try { bin = atob(m[5].replace(/-/g, '+').replace(/_/g, '/')); } catch { return null; }
  const b = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  let i = 0;
  const rd = () => { if (i >= b.length) throw new Error('kısa'); return b[i++]; };
  const rv = () => { let v = 0; let s = 0; let x; do { x = rd(); v |= (x & 127) << s; s += 7; } while (x & 128 && s < 35); return v >>> 0; };
  const strokes = [];
  try {
    while (i < b.length) {
      const h = rd(); const tool = TOOLS[h >> 3]; const color = h & 7;
      if (!tool || color >= PALETTE.length) return null;
      const w = W_MIN + (rd() / 255) * (W_MAX - W_MIN);
      const n = rv(); if (n < 1 || n > 20000) return null;
      const pts = new Array(n * 2);
      let x = 0; let y = 0;
      for (let k = 0; k < n; k++) {
        if (k === 0) { x = (rd() << 8) | rd(); y = (rd() << 8) | rd(); } else { x += unzig(rv()); y += unzig(rv()); }
        pts[k * 2] = uq(x); pts[k * 2 + 1] = uq(y);
      }
      strokes.push({ tool, color, w, pts });
    }
  } catch { return null; }
  return { shape: m[1], n: parseInt(m[2], 16), mirror: m[3] === '1', fired: m[4] === 'f', strokes };
}

// ------------------------------------------------------------------ örnek desen üreteci
// Desen yalnız ilk dilimde (0 … π/n açısı) kurulur; simetri onu bütün tabağa çoğaltır.
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const P = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
const K = { kobalt: 0, turkuaz: 1, mercan: 2, zumrut: 3, mor: 4, tahrir: 5, astar: 6 };

function arc(r, a0, a1, steps = 24) {
  const out = [];
  for (let i = 0; i <= steps; i++) out.push(...P(r, a0 + ((a1 - a0) * i) / steps));
  return out;
}
// eksen boyunca yerel (u: uzunluk, v: yan) koordinatlardan birim uzaya
function local(r0, a, pts) {
  const c = Math.cos(a); const s = Math.sin(a); const out = [];
  for (let i = 0; i < pts.length; i += 2) { const u = r0 + pts[i]; const v = pts[i + 1]; out.push(u * c - v * s, u * s + v * c); }
  return out;
}
// iki ucu sivri yaprak; bend yanal kavis
function leafShape(len, width, bend = 0, steps = 18) {
  const top = []; const bot = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; const u = t * len; const mid = Math.sin(Math.PI * t) * bend;
    const w = Math.sin(Math.PI * t) ** 0.8 * width;
    top.push(u, mid + w);
  }
  for (let i = steps - 1; i > 0; i--) {
    const t = i / steps; const u = t * len; const mid = Math.sin(Math.PI * t) * bend;
    const w = Math.sin(Math.PI * t) ** 0.8 * width;
    bot.push(u, mid - w);
  }
  return top.concat(bot);
}
function tulipShape(len, width) {
  // altı yuvarlak kâse, üstte üç sivri uç
  const pts = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) { const t = (i / steps) * Math.PI; pts.push(len * 0.45 - Math.sin(t) * len * 0.45, -Math.cos(t) * width); }
  // sağ kenardan uçlara
  pts.push(len * 0.75, width * 1.05, len, width * 0.75, len * 0.72, width * 0.38, len * 1.04, 0, len * 0.72, -width * 0.38, len, -width * 0.75, len * 0.75, -width * 1.05);
  return pts;
}

export function generate(seed, shape = 't') {
  const R = rng(seed);
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const n = shape === 'k' ? 4 : pick([6, 8, 8, 10, 12]);
  const half = Math.PI / n;
  const S = [];
  const add = (tool, color, w, pts) => S.push({ tool, color, w, pts: pts.map((v) => Math.round(v * 10000) / 10000) });
  const outline = (pts, w = 0.0055) => add('firca', K.tahrir, w, pts.concat(pts.slice(0, 2)));
  const filled = (color, pts) => { add('dolgu', color, 0.006, pts); outline(pts); };

  const c1 = pick([K.kobalt, K.kobalt, K.turkuaz]);
  const c2 = c1 === K.kobalt ? K.turkuaz : K.kobalt;
  const accent = pick([K.mercan, K.mercan, K.mor]);
  const leafC = pick([K.zumrut, K.zumrut, K.turkuaz]);

  // göbek: rozet
  const petalW = Math.min(0.07, 0.2 * Math.sin(half) * 0.95);
  filled(c1, local(0.035, 0, leafShape(0.17, petalW)));
  add('benek', c2, 0.03, P(0.165, half));
  add('benek', accent, 0.075, [0, 0]);
  add('benek', K.tahrir, 0.016, [0, 0]);

  // göbek kuşağı
  const band = shape === 'k' ? [0.27, 0.31] : [0.26, 0.3];
  add('dolgu', c1, 0.006, [...arc(band[0], -0.002, half + 0.002, 10), ...arc(band[1], half + 0.002, -0.002, 10)]);
  add('firca', K.tahrir, 0.0055, arc(band[0], 0, half, 10));
  add('firca', K.tahrir, 0.0055, arc(band[1], 0, half, 10));
  add('benek', K.astar, 0.016, P((band[0] + band[1]) / 2, half / 2));

  // ana eksende lale
  const fieldEnd = shape === 'k' ? 0.78 : 0.7;
  add('firca', leafC, 0.012, local(band[1] + 0.01, 0, [0, 0, 0.12, 0.004, 0.22, 0]));
  const tl = (fieldEnd - band[1] - 0.24) * 1.0 + 0.11;
  filled(accent, local(band[1] + 0.22, 0, tulipShape(tl, Math.min(0.055, (band[1] + 0.25) * Math.sin(half) * 0.55))));
  // saz yaprağı lalenin yanından dilim kenarına doğru kıvrılır
  const leafA = half * 0.55;
  filled(leafC, local(band[1] + 0.05, leafA * 0.35, leafShape(fieldEnd - band[1] - 0.12, 0.022, 0.025)));
  // ara eksende sümbül
  const hy = pick(['sumbul', 'karanfil']);
  const ra = band[1] + 0.06; const rb = fieldEnd - 0.04;
  if (hy === 'sumbul') {
    add('firca', K.zumrut, 0.008, [...P(ra, half), ...P(rb, half)]);
    for (let r = ra + 0.08, k = 0; r < rb; r += 0.055, k++) {
      const off = (k % 2 ? 1 : -1) * 0.022;
      add('benek', c1, 0.03, local(r, half, [0, off]));
    }
    add('benek', c1, 0.036, P(rb + 0.01, half));
  } else {
    add('firca', K.zumrut, 0.008, [...P(ra, half), ...P(rb - 0.08, half)]);
    for (let k = -2; k <= 2; k++) {
      filled(k % 2 ? c2 : accent, local(rb - 0.1, half + k * 0.12 * half, leafShape(0.11, 0.022)));
    }
  }

  if (shape === 't') {
    // kenar: kobalt kuşak, içinde beyaz dalga ve firuze benekler
    add('dolgu', c1, 0.006, [...arc(0.845, -0.002, half + 0.002, 16), ...arc(0.975, half + 0.002, -0.002, 16)]);
    add('firca', K.tahrir, 0.006, arc(0.845, 0, half, 16));
    add('firca', K.tahrir, 0.006, arc(0.975, 0, half, 16));
    const waves = 2;
    const wave = [];
    // kosinüs dalgası dilim sınırında yatay biter, aynada kırılmadan sürer
    for (let i = 0; i <= 32; i++) { const a = (half * i) / 32; wave.push(...P(0.91 + 0.026 * Math.cos((a / half) * Math.PI * waves), a)); }
    add('firca', K.astar, 0.011, wave);
    for (let k = 0; k < waves; k++) {
      const a = (half * (2 * k + 1)) / (2 * waves);
      add('benek', c2, 0.022, P(0.948, a));
      add('benek', K.astar, 0.014, P(0.872, half * k / waves));
    }
    add('firca', K.tahrir, 0.006, arc(0.8, 0, half, 12));
    add('benek', accent, 0.02, P(0.8, half));
  } else {
    // karo köşesi: dört karonun buluştuğu yerde birleşen rozetin çeyreği
    const d = Math.SQRT2;
    filled(c1, local(d - 0.42, Math.PI / 4, leafShape(0.42, 0.075)));
    add('firca', K.tahrir, 0.006, (() => { const o = []; for (let i = 0; i <= 16; i++) { const a = Math.PI + (i / 16) * (Math.PI / 2); o.push(1 + 0.5 * Math.cos(a), 1 + 0.5 * Math.sin(a)); } return o; })());
    add('benek', accent, 0.09, [1, 1]);
    // kenar ortası: komşu karoyla birleşen yarım benek
    add('benek', c2, 0.12, [1, 0]);
  }
  return { shape, n, mirror: true, fired: false, strokes: S };
}
