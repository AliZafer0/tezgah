// Çini Fırını — boyama atölyesi, kaleydoskop simetrisi, fırınlama animasyonu ve normal tabanlı sır parlaması.
// Boyama sırasında ekran yalnızca bir şey değiştiğinde çizilir; fırından sonra ışık hareket ettikçe sır yeniden gölgelenir.
import { PALETTE, GROUND, transforms, simplify, encode, decode, generate, W_MIN, W_MAX } from './cini.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#atolye');
const ctx = canvas.getContext('2d');
const panel = $('.panel');
const ui = {
  shapes: [...document.querySelectorAll('input[name="shape"]')],
  tools: [...document.querySelectorAll('input[name="tool"]')],
  swatches: $('#swatches'), hint: $('#hint'),
  width: $('#width'), widthOut: $('#width-out'), fold: $('#fold'), foldOut: $('#fold-out'), mirror: $('#mirror'),
  undo: $('#undo'), clear: $('#clear'), sample: $('#sample'), share: $('#share'), wall: $('#wall'), png: $('#png'), fire: $('#fire'),
  shareBox: $('#sharebox'), shareLink: $('#share-link'), status: $('#status'),
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const EXT = 1.06; // boya katmanı birim uzayda [-EXT, EXT] karesini kaplar
const HINTS = {
  firca: 'Tabağa fırça sür: iz bütün dilimlerde tekrarlanır.',
  dolgu: 'Kapalı bir biçim çiz; bırakınca içi boyayla dolar.',
  benek: 'Dokun ya da sürükle: aynı boyda benekler bırakır.',
};

let doc = { shape: 't', n: 8, mirror: true, fired: false, strokes: [] };
const state = { tool: 'firca', color: 0, width: 7 };
const history = [];
let active = null;
let Ts = transforms(doc.n, doc.mirror);
const widthOf = (v) => W_MIN + (W_MAX - W_MIN) * ((v - 1) / 29) ** 1.6;

// ------------------------------------------------------------------ yerleşim
let dpr = 1; let L = { cx: 0, cy: 0, S: 100 };
const paint = document.createElement('canvas'); const pctx = paint.getContext('2d');
function layout() {
  const r = canvas.getBoundingClientRect();
  dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
  const pr = panel.getBoundingClientRect();
  const mobile = pr.top > r.height * 0.3;
  let ax = 24; let ay = 56; let aw = r.width - 48; let ah = r.height - 92;
  if (!mobile) { ax = pr.right + 24; aw = r.width - ax - 24; } else { ay = 44; ah = pr.top - ay - 14; }
  const S = Math.max(40, Math.min(aw, ah) / 2 / (doc.shape === 't' ? 1.03 : 1.06));
  L = { cx: ax + aw / 2, cy: ay + ah / 2, S, mobile };
  const P = Math.max(256, Math.min(1600, Math.round(2 * EXT * S * dpr)));
  if (!paint.width || Math.abs(P - paint.width) / paint.width > 0.12) { paint.width = paint.height = P; repaint(); }
  if (doc.fired) { baked = null; wallBake = null; }
}

// ------------------------------------------------------------------ boya katmanı
function pathOf(s) {
  if (s._path) return s._path;
  const p = new Path2D(); const pts = s.pts;
  if (s.tool === 'benek') {
    const r = s.w / 2;
    for (let i = 0; i < pts.length; i += 2) { p.moveTo(pts[i] + r, pts[i + 1]); p.arc(pts[i], pts[i + 1], r, 0, Math.PI * 2); }
  } else {
    p.moveTo(pts[0], pts[1]);
    if (pts.length === 2) p.lineTo(pts[0] + 1e-4, pts[1]);
    for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
    if (s.tool === 'dolgu') p.closePath();
  }
  Object.defineProperty(s, '_path', { value: p, enumerable: false });
  return p;
}
function colorOf(s, mode) {
  if (mode === 'height') { const v = Math.round(PALETTE[s.color].h * 255); return `rgb(${v},${v},${v})`; }
  return PALETTE[s.color][mode];
}
function drawStroke(g, size, s, mode, path = pathOf(s)) {
  const k = size / (2 * EXT);
  g.fillStyle = g.strokeStyle = colorOf(s, mode);
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const T of Ts) {
    g.setTransform(k * T[0], k * T[1], k * T[2], k * T[3], EXT * k, EXT * k);
    if (s.tool === 'firca') { g.lineWidth = s.w; g.stroke(path); }
    else if (s.tool === 'dolgu') { g.fill(path); g.lineWidth = 0.003; g.stroke(path); }
    else g.fill(path);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
}
function renderLayer(g, size, mode) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = mode === 'height' ? '#000' : GROUND[mode];
  g.fillRect(0, 0, size, size);
  for (const s of doc.strokes) drawStroke(g, size, s, mode);
}
function repaint() { if (paint.width) renderLayer(pctx, paint.width, 'raw'); }

// ------------------------------------------------------------------ ekran
const toScreen = (u, v) => [L.cx + u * L.S, L.cy + v * L.S];
function shapePath(g, cx, cy, S, shape = doc.shape) {
  g.beginPath();
  if (shape === 't') g.arc(cx, cy, S, 0, Math.PI * 2);
  else g.rect(cx - S, cy - S, 2 * S, 2 * S);
}
let matte = null;
function mattePattern() {
  if (matte) return matte;
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const g = c.getContext('2d'); const img = g.createImageData(96, 96);
  for (let i = 0; i < img.data.length; i += 4) { const v = 120 + Math.random() * 135; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  matte = ctx.createPattern(c, 'repeat');
  return matte;
}

let raf = 0;
function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
function frame(now) {
  raf = 0;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = canvas.width / dpr; const H = canvas.height / dpr;
  if (firing) { drawKiln(now, W, H); requestDraw(); return; }
  ctx.fillStyle = '#14202d'; ctx.fillRect(0, 0, W, H);
  wallGlow(W, H);
  if (doc.fired) { if (stepLight(now)) requestDraw(); drawFired(now); } else drawRaw();
}
function wallGlow(W, H) {
  const g = ctx.createRadialGradient(L.cx, L.cy, L.S * 0.2, L.cx, L.cy, Math.max(W, H) * 0.75);
  g.addColorStop(0, 'rgba(70,110,140,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function plateShadow(S = L.S, cx = L.cx, cy = L.cy, shape = doc.shape) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 28 * dpr; ctx.shadowOffsetY = 10 * dpr;
  ctx.fillStyle = '#ddd6c6'; shapePath(ctx, cx, cy, S, shape); ctx.fill();
  ctx.restore();
}
function drawRaw() {
  const { cx, cy, S } = L;
  plateShadow();
  ctx.save();
  shapePath(ctx, cx, cy, S); ctx.clip();
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(paint, cx - EXT * S, cy - EXT * S, 2 * EXT * S, 2 * EXT * S);
  // pişmemiş sır mat ve tebeşirimsi görünür
  ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.16;
  ctx.fillStyle = mattePattern(); ctx.fillRect(cx - S, cy - S, 2 * S, 2 * S);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  guides();
  ctx.restore();
  if (active && active.tool === 'dolgu') {
    ctx.save();
    ctx.strokeStyle = PALETTE[5].raw; ctx.lineWidth = 1.2; ctx.setLineDash([4, 3]);
    for (const T of Ts) {
      ctx.setTransform(dpr * S * T[0], dpr * S * T[1], dpr * S * T[2], dpr * S * T[3], dpr * cx, dpr * cy);
      ctx.lineWidth = 1.2 / S; ctx.setLineDash([4 / S, 3 / S]);
      ctx.stroke(pathOf({ ...active, tool: 'firca', pts: active.pts }));
    }
    ctx.restore();
  }
  if (cursor) ghosts();
}
function guides() {
  const { cx, cy, S } = L;
  if (doc.n === 1 && !doc.mirror) return;
  ctx.lineWidth = 1;
  const ray = (a, dash, alpha) => {
    const c = Math.cos(a); const s = Math.sin(a);
    const len = doc.shape === 't' ? 1 : 1 / Math.max(Math.abs(c), Math.abs(s));
    ctx.strokeStyle = `rgba(40,50,70,${alpha})`; ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + c * len * S, cy + s * len * S); ctx.stroke();
  };
  for (let k = 0; k < doc.n; k++) {
    const a = (k * 2 * Math.PI) / doc.n;
    if (doc.n > 1) ray(a, [], 0.13);
    if (doc.mirror) ray(a + Math.PI / doc.n, [2, 4], 0.12);
  }
  ctx.setLineDash([]);
  if (doc.shape === 't') { ctx.strokeStyle = 'rgba(40,50,70,0.09)'; ctx.beginPath(); ctx.arc(cx, cy, S * 0.84, 0, Math.PI * 2); ctx.stroke(); }
}
function ghosts() {
  const r = Math.max(2, (widthOf(state.width) / 2) * L.S);
  ctx.save();
  ctx.lineWidth = 1;
  Ts.forEach((T, i) => {
    const [x, y] = toScreen(T[0] * cursor[0] + T[2] * cursor[1], T[1] * cursor[0] + T[3] * cursor[1]);
    ctx.strokeStyle = i === 0 ? 'rgba(20,30,45,0.85)' : 'rgba(20,30,45,0.3)';
    ctx.beginPath(); ctx.arc(x, y, i === 0 ? r : Math.min(r, 6), 0, Math.PI * 2); ctx.stroke();
  });
  ctx.restore();
}

// ------------------------------------------------------------------ sır: yükseklik, normal, gölgeleme
function vhash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y) {
  const xi = Math.floor(x); const yi = Math.floor(y); const xf = x - xi; const yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf); const sy = yf * yf * (3 - 2 * yf);
  const a = vhash(xi, yi); const b = vhash(xi + 1, yi); const c = vhash(xi, yi + 1); const d = vhash(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function plateZ(u, v, shape) {
  if (shape === 't') {
    const r = Math.hypot(u, v);
    let z;
    if (r < 0.8) z = 0.03 * (r / 0.8) ** 2;
    else if (r < 0.88) { const t = (r - 0.8) / 0.08; z = 0.03 + 0.05 * t * t * (3 - 2 * t); }
    else { const t = (r - 0.88) / 0.12; z = 0.08 - 0.02 * t * t; }
    const e = Math.max(0, (r - 0.955) / 0.045);
    return z - 0.07 * e * e;
  }
  const bev = (x) => { const e = Math.max(0, (Math.abs(x) - 0.94) / 0.06); return e * e; };
  return -0.006 * (u * u + v * v) - 0.05 * (bev(u) + bev(v));
}
function boxBlur(a, F, r) {
  const t = new Float32Array(a.length); const w = 2 * r + 1;
  for (let y = 0; y < F; y++) {
    let acc = 0; const row = y * F;
    for (let x = -r; x <= r; x++) acc += a[row + Math.min(F - 1, Math.max(0, x))];
    for (let x = 0; x < F; x++) {
      t[row + x] = acc / w;
      acc += a[row + Math.min(F - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < F; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += t[Math.min(F - 1, Math.max(0, y)) * F + x];
    for (let y = 0; y < F; y++) {
      a[y * F + x] = acc / w;
      acc += t[Math.min(F - 1, y + r + 1) * F + x] - t[Math.max(0, y - r) * F + x];
    }
  }
}
// Fırınlanmış çininin değişmeyen her şeyi bir kez hesaplanır: renk, normal, maske, yükseklik
function bake(F, shape = doc.shape) {
  const c = document.createElement('canvas'); c.width = c.height = F;
  const g = c.getContext('2d', { willReadFrequently: true });
  renderLayer(g, F, 'fired');
  const col = g.getImageData(0, 0, F, F).data;
  renderLayer(g, F, 'height');
  const hd = g.getImageData(0, 0, F, F).data;
  const N = F * F; const du = (2 * EXT) / F;
  const h = new Float32Array(N);
  for (let i = 0; i < N; i++) h[i] = hd[i * 4] / 255;
  const br = Math.max(1, Math.round(F / 420));
  boxBlur(h, F, br); boxBlur(h, F, br);
  const z = new Float32Array(N);
  const B = { F, shape, du, R: new Float32Array(N), G: new Float32Array(N), Bl: new Float32Array(N), nx: new Float32Array(N), ny: new Float32Array(N), nz: new Float32Array(N), z, m: new Float32Array(N) };
  for (let y = 0; y < F; y++) {
    const v = (y + 0.5) * du - EXT;
    for (let x = 0; x < F; x++) {
      const u = (x + 0.5) * du - EXT; const i = y * F + x;
      const wav = vnoise(u * 5 + 11, v * 5 + 7) * 0.6 + vnoise(u * 13, v * 13) * 0.4;
      z[i] = plateZ(u, v, shape) + h[i] * 0.0065 + wav * 0.003;
    }
  }
  for (let y = 0; y < F; y++) {
    const v = (y + 0.5) * du - EXT;
    for (let x = 0; x < F; x++) {
      const i = y * F + x; const u = (x + 0.5) * du - EXT;
      const zx = (z[y * F + Math.min(F - 1, x + 1)] - z[y * F + Math.max(0, x - 1)]) / (2 * du);
      const zy = (z[Math.min(F - 1, y + 1) * F + x] - z[Math.max(0, y - 1) * F + x]) / (2 * du);
      const inv = 1 / Math.sqrt(zx * zx + zy * zy + 1);
      B.nx[i] = -zx * inv; B.ny[i] = -zy * inv; B.nz[i] = inv;
      let m;
      if (shape === 't') m = (1 - Math.hypot(u, v)) / du + 0.5;
      else m = (1 - Math.max(Math.abs(u), Math.abs(v))) / du + 0.5;
      B.m[i] = Math.max(0, Math.min(1, m));
      // boya pigmentinde fırça izi ve sırın altında hafif dalgalanma; zeminde seyrek demir benekleri
      const painted = h[i] > 0.05 || col[i * 4] < 225;
      let k = painted ? 0.93 + 0.12 * vnoise(u * 40 + 3, v * 40) : 1;
      if (!painted && vhash(x * 7 + 1, y * 3 + 5) < 0.0006) k = 0.55;
      B.R[i] = (col[i * 4] / 255) * k; B.G[i] = (col[i * 4 + 1] / 255) * k; B.Bl[i] = (col[i * 4 + 2] / 255) * k;
    }
  }
  B.img = new ImageData(F, F);
  B.canvas = document.createElement('canvas'); B.canvas.width = B.canvas.height = F;
  B.ctx = B.canvas.getContext('2d');
  return B;
}
// Nokta ışık (lx, ly, lz), göz sonsuzda: Blinn–Phong + sırın ince parlak katmanı
function shade(B, lx, ly, lz, k = 1) {
  const { F, du, nx, ny, nz, z, m, R, G, Bl } = B; const d = B.img.data;
  for (let y = 0, i = 0; y < F; y++) {
    const v = (y + 0.5) * du - EXT;
    for (let x = 0; x < F; x++, i++) {
      const o = i * 4; const a = m[i];
      if (a <= 0) { d[o + 3] = 0; continue; }
      const u = (x + 0.5) * du - EXT;
      let Lx = lx - u; let Ly = ly - v; let Lz = lz - z[i];
      const dist2 = Lx * Lx + Ly * Ly + Lz * Lz; const inv = 1 / Math.sqrt(dist2);
      Lx *= inv; Ly *= inv; Lz *= inv;
      const N0 = nx[i]; const N1 = ny[i]; const N2 = nz[i];
      let diff = N0 * Lx + N1 * Ly + N2 * Lz; if (diff < 0) diff = 0;
      const Hz = Lz + 1; const hinv = 1 / Math.sqrt(Lx * Lx + Ly * Ly + Hz * Hz);
      let s = (N0 * Lx + N1 * Ly + N2 * Hz) * hinv; if (s < 0) s = 0;
      const s2 = s * s; const s4 = s2 * s2; const s8 = s4 * s4; const s16 = s8 * s8; const s32 = s16 * s16;
      const s64 = s32 * s32; const s128 = s64 * s64; const s256 = s128 * s128;
      const att = 1 / (1 + 0.12 * dist2 * k * k);
      const spec = (s256 * 1.2 + s64 * 0.14 + s16 * 0.03) * att;
      const lit = (0.3 + 0.66 * diff * att);
      const fres = (1 - N2) * 1.4; // eğimli kenarlarda gökyüzü yansıması
      d[o] = (R[i] * lit + spec + fres * 0.26) * 255;
      d[o + 1] = (G[i] * lit + spec * 0.98 + fres * 0.30) * 255;
      d[o + 2] = (Bl[i] * lit + spec * 0.94 + fres * 0.34) * 255;
      d[o + 3] = a * 255;
    }
  }
  B.ctx.putImageData(B.img, 0, 0);
  return B.canvas;
}

let baked = null; let wallBake = null; let wall = false;
const light = { x: -0.45, y: -0.55, tx: -0.45, ty: -0.55, z: 1.6, lastMove: 0, frozen: false, drawn: '', at: 0 };
function ensureBaked() {
  if (!baked) baked = bake(Math.max(300, Math.min(L.mobile ? 480 : 640, Math.round(2 * EXT * L.S * dpr))));
  return baked;
}
function stepLight(now) {
  // dokunulmadığında ışık bir süre kendiliğinden gezinir, sonra durur (boşta işlemci harcamaz)
  const since = now - light.lastMove;
  const drifting = !light.frozen && !reduced && since > 2500 && since < 15000;
  if (drifting) {
    const t = now / 4200;
    light.tx = Math.cos(t) * 0.75; light.ty = Math.sin(t * 0.8) * 0.55 - 0.15;
  }
  light.x += (light.tx - light.x) * 0.16; light.y += (light.ty - light.y) * 0.16;
  const moving = Math.abs(light.tx - light.x) + Math.abs(light.ty - light.y) > 0.002;
  return moving || drifting;
}
function drawFired(now = 0) {
  const { cx, cy, S } = L;
  if (wall && doc.shape === 'k') { drawWall(); return; }
  const B = ensureBaked();
  const key = `${light.x.toFixed(3)},${light.y.toFixed(3)}`;
  // kendiliğinden kayan ışık saniyede ~20 kez yeniden gölgelenir; kullanıcı ışığı tutarken her karede
  const idle = now - light.lastMove > 2500 && !light.frozen;
  if (light.drawn !== key && (!idle || now - light.at > 48)) { shade(B, light.x, light.y, light.z); light.drawn = key; light.at = now; }
  plateShadow();
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(B.canvas, cx - EXT * S, cy - EXT * S, 2 * EXT * S, 2 * EXT * S);
}
// Karo duvarı: 3 × 3 karo, her karo ışığı kendi konumundan görür
function drawWall() {
  const { cx, cy, S } = L;
  const gap = Math.max(2, S * 0.012);
  const t = (2 * S - 2 * gap) / 3; const th = t / 2;
  if (!wallBake || wallBake.F !== Math.max(120, Math.round(t * EXT * dpr))) wallBake = bake(Math.max(120, Math.round(t * EXT * dpr)), 'k');
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 28 * dpr; ctx.shadowOffsetY = 10 * dpr;
  ctx.fillStyle = '#cfc8b8'; ctx.fillRect(cx - S - gap, cy - S - gap, 2 * S + 2 * gap, 2 * S + 2 * gap);
  ctx.restore();
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const tx = cx + i * (t + gap); const ty = cy + j * (t + gap);
      const ox = (tx - cx) / S; const oy = (ty - cy) / S; const k = th / S;
      const c = shade(wallBake, (light.x - ox) / k, (light.y - oy) / k, 0.85 / k, k);
      ctx.drawImage(c, tx - EXT * th, ty - EXT * th, 2 * EXT * th, 2 * EXT * th);
    }
  }
  light.drawn = '';
}

// ------------------------------------------------------------------ fırın
let firing = null;
const FIRE_MS = 3600;
function drawKiln(now, W, H) {
  const { cx, cy, S } = L;
  const t = Math.min(1, (now - firing.t0) / FIRE_MS);
  const ss = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  const heat = ss(0.02, 0.42, t) * (1 - ss(0.62, 0.95, t));
  const flick = heat * (1 + 0.05 * Math.sin(now / 70) + 0.03 * Math.sin(now / 23));
  ctx.fillStyle = '#14202d'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = `rgba(42,16,8,${Math.min(1, heat * 1.6)})`; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(cx, cy, S * 0.3, cx, cy, S * 2.1);
  g.addColorStop(0, `rgba(255,140,50,${0.55 * flick})`); g.addColorStop(0.5, `rgba(200,60,20,${0.3 * flick})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  plateShadow();
  ctx.save();
  shapePath(ctx, cx, cy, S); ctx.clip();
  ctx.drawImage(paint, cx - EXT * S, cy - EXT * S, 2 * EXT * S, 2 * EXT * S);
  const reveal = ss(0.58, 0.92, t);
  if (reveal > 0) { ctx.globalAlpha = reveal; ctx.drawImage(firing.lit, cx - EXT * S, cy - EXT * S, 2 * EXT * S, 2 * EXT * S); ctx.globalAlpha = 1; }
  if (heat > 0) {
    ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = Math.min(1, flick * 0.85);
    ctx.fillStyle = '#ff6a1a'; ctx.fillRect(cx - S, cy - S, 2 * S, 2 * S);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = flick * 0.28;
    ctx.fillStyle = '#ff9a40'; ctx.fillRect(cx - S, cy - S, 2 * S, 2 * S);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  ctx.restore();
  const temp = Math.round(20 + 880 * Math.max(heat, t < 0.5 ? ss(0.02, 0.42, t) : heat));
  ctx.fillStyle = `rgba(255,214,170,${0.4 + heat * 0.6})`;
  ctx.font = `600 ${Math.max(13, S * 0.07)}px ui-monospace, Menlo, monospace`; ctx.textAlign = 'center';
  ctx.fillText(`${temp} °C`, cx, cy + S * (doc.shape === 't' ? 1.0 : 1.0) + Math.max(22, S * 0.11));
  if (t >= 1) finishFiring();
}
function startFiring() {
  if (firing || doc.fired) return;
  endStroke();
  baked = null; wallBake = null;
  const B = ensureBaked();
  light.x = light.tx = -0.45; light.y = light.ty = -0.55; light.lastMove = performance.now();
  const lit = shade(B, light.x, light.y, light.z);
  const copy = document.createElement('canvas'); copy.width = copy.height = B.F; copy.getContext('2d').drawImage(lit, 0, 0);
  light.drawn = '';
  if (reduced) { doc.fired = true; afterFire(); return; }
  firing = { t0: performance.now(), lit: copy };
  setBusy(true);
  say('Çini fırında: 900 dereceye kadar ısınıyor…');
  requestDraw();
}
function finishFiring() { firing = null; doc.fired = true; setBusy(false); afterFire(); }
function afterFire() {
  syncUi(); saveHash(); requestDraw();
  say('Çini fırından çıktı. İmleci ya da parmağını gezdir: sır ışığı yakalar.');
}
function backToPaint() { doc.fired = false; wall = false; syncUi(); saveHash(); requestDraw(); say('Boyamaya dönüldü; fırınlanmamış boya yeniden mat.'); }
function setBusy(on) { for (const b of panel.querySelectorAll('button, input')) b.disabled = on; if (!on) syncUi(); }

// ------------------------------------------------------------------ fırça
let cursor = null;
function toUnit(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left - L.cx) / L.S, (e.clientY - r.top - L.cy) / L.S];
}
function inside(p, pad = 0) {
  return doc.shape === 't' ? Math.hypot(p[0], p[1]) <= 1 + pad : Math.max(Math.abs(p[0]), Math.abs(p[1])) <= 1 + pad;
}
function beginStroke(p) {
  active = { tool: state.tool, color: state.color, w: state.tool === 'dolgu' ? 0.006 : widthOf(state.width), pts: [p[0], p[1]] };
  if (active.tool !== 'dolgu') drawStroke(pctx, paint.width, active, 'raw', pathOf({ ...active, pts: [p[0], p[1]] }));
  requestDraw();
}
function addPoint(p) {
  if (!active) return;
  const n = active.pts.length; const lx = active.pts[n - 2]; const ly = active.pts[n - 1];
  const d = Math.hypot(p[0] - lx, p[1] - ly);
  if (active.tool === 'benek') {
    if (d < Math.max(active.w * 1.6, 0.012)) return;
    active.pts.push(p[0], p[1]);
    drawStroke(pctx, paint.width, active, 'raw', pathOf({ ...active, pts: [p[0], p[1]] }));
  } else {
    if (d < 0.002) return;
    active.pts.push(p[0], p[1]);
    if (active.tool === 'firca') drawStroke(pctx, paint.width, active, 'raw', pathOf({ ...active, pts: [lx, ly, p[0], p[1]] }));
  }
  requestDraw();
}
function endStroke() {
  if (!active) return;
  const s = active; active = null;
  if (s.tool === 'dolgu') {
    if (s.pts.length < 6) { requestDraw(); say('Dolgu için kapalı bir biçim çiz.'); return; }
    s.pts = simplify(s.pts, 0.0012);
    drawStroke(pctx, paint.width, s, 'raw');
  } else if (s.tool === 'firca') s.pts = simplify(s.pts);
  history.push(doc.strokes.slice());
  if (history.length > 200) history.shift();
  doc.strokes.push(s);
  syncUi(); saveHash(); requestDraw();
}
function undo() {
  if (firing || doc.fired || !history.length) return;
  active = null;
  doc.strokes = history.pop();
  repaint(); syncUi(); saveHash(); requestDraw();
  say('Son fırça izi geri alındı.');
}
function setLightTarget(p) {
  light.tx = Math.max(-1.5, Math.min(1.5, p[0])); light.ty = Math.max(-1.5, Math.min(1.5, p[1]));
  light.lastMove = performance.now(); requestDraw();
}

canvas.addEventListener('pointerdown', (e) => {
  if (firing) return;
  const p = toUnit(e);
  if (doc.fired) { setLightTarget(p); return; }
  if (!inside(p, 0.03)) return;
  canvas.setPointerCapture(e.pointerId);
  cursor = p; beginStroke(p);
});
canvas.addEventListener('pointermove', (e) => {
  if (firing) return;
  const p = toUnit(e);
  if (doc.fired) { if (e.pointerType === 'mouse' || e.buttons) setLightTarget(p); return; }
  cursor = inside(p, 0.08) || active ? p : null;
  if (active) addPoint(p); else requestDraw();
});
const up = () => { endStroke(); };
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('pointerleave', () => { if (!active) { cursor = null; requestDraw(); } });

// klavye: oklar fırçayı (fırından sonra ışığı) gezdirir
let kc = [0.35, 0];
canvas.addEventListener('keydown', (e) => {
  if (firing) return;
  const step = e.shiftKey ? 0.08 : 0.02;
  const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (mv) {
    e.preventDefault();
    kc = [Math.max(-1.1, Math.min(1.1, kc[0] + mv[0])), Math.max(-1.1, Math.min(1.1, kc[1] + mv[1]))];
    if (doc.fired) { setLightTarget(kc); return; }
    cursor = kc; if (active) addPoint(kc); else requestDraw();
    return;
  }
  if ((e.key === 'Enter' || e.key === ' ') && !doc.fired) {
    e.preventDefault();
    cursor = kc;
    if (active) { endStroke(); say('Fırça kaldırıldı.'); return; }
    if (!inside(kc, 0.03)) { say('Fırça çininin dışında.'); return; }
    beginStroke(kc);
    if (state.tool === 'benek') endStroke();
    else say('Fırça değdi; oklarla sür, Enter ile kaldır.');
    return;
  }
  if (e.key === 'Escape' && active) { endStroke(); }
});
document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFire(); }
  else if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); undo(); }
});

// ------------------------------------------------------------------ panel
PALETTE.forEach((p, i) => {
  const label = document.createElement('label'); label.title = p.name;
  label.innerHTML = `<input type="radio" name="renk" value="${i}"${i === state.color ? ' checked' : ''}><span style="--c:${p.fired}"></span><b class="sr-only">${p.name}</b>`;
  ui.swatches.append(label);
  label.querySelector('input').addEventListener('change', () => { state.color = i; say(p.name); });
});
for (const r of ui.tools) r.addEventListener('change', () => { state.tool = r.value; ui.hint.textContent = HINTS[r.value]; });
for (const r of ui.shapes) r.addEventListener('change', () => { doc.shape = r.value; paint.width = 0; layout(); syncUi(); saveHash(); requestDraw(); });
ui.width.addEventListener('input', () => { state.width = +ui.width.value; ui.widthOut.value = ui.width.value; requestDraw(); });
ui.fold.addEventListener('input', () => { doc.n = +ui.fold.value; ui.foldOut.value = ui.fold.value; resym(); });
ui.mirror.addEventListener('change', () => { doc.mirror = ui.mirror.checked; resym(); });
function resym() { Ts = transforms(doc.n, doc.mirror); repaint(); saveHash(); requestDraw(); }
ui.undo.addEventListener('click', undo);
ui.clear.addEventListener('click', () => {
  if (!doc.strokes.length) return;
  history.push(doc.strokes.slice()); doc.strokes = []; repaint(); syncUi(); saveHash(); requestDraw();
  say('Çini temizlendi. Geri al ile desen geri gelir.');
});
ui.sample.addEventListener('click', () => {
  history.push(doc.strokes.slice());
  const g = generate((Math.random() * 2 ** 31) | 0, doc.shape);
  doc.strokes = g.strokes; doc.n = g.n; doc.mirror = g.mirror;
  Ts = transforms(doc.n, doc.mirror); repaint(); syncUi(); saveHash(); requestDraw();
  say(`${doc.n} dilimli yeni bir örnek desen çizildi.`);
});
function toggleFire() { if (firing) return; if (doc.fired) backToPaint(); else startFiring(); }
ui.fire.addEventListener('click', toggleFire);
ui.wall.addEventListener('click', () => {
  wall = !wall; light.drawn = ''; syncUi(); requestDraw();
  say(wall ? 'Karolar duvara dizildi: köşe ve kenar motifleri birleşir.' : 'Tek karoya dönüldü.');
});

ui.share.addEventListener('click', async () => {
  const url = `${location.href.split('#')[0]}#${encode(doc)}`;
  ui.shareLink.value = url;
  try { await navigator.clipboard.writeText(url); ui.shareBox.hidden = true; say('Bağlantı kopyalandı. Açan kişi aynı çiniyi görür.', true); return; } catch { /* pano kapalı */ }
  ui.shareBox.hidden = false; ui.shareLink.focus(); ui.shareLink.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
  say(ok ? 'Bağlantı kopyalandı.' : 'Pano erişimi kapalı; bağlantı seçildi, elle kopyalayabilirsin.', true);
});

ui.png.addEventListener('click', () => {
  const F = 1200; let out;
  if (doc.fired) {
    out = shade(bake(F), light.x, light.y, light.z);
  } else {
    out = document.createElement('canvas'); out.width = out.height = F;
    const g = out.getContext('2d');
    const k = F / (2 * EXT);
    shapePath(g, F / 2, F / 2, k); g.clip();
    renderLayer(g, F, 'raw');
  }
  const save = (href, revoke) => {
    const a = document.createElement('a'); a.href = href; a.download = `cini-${Date.now()}.png`; a.hidden = true;
    document.body.append(a); a.click();
    setTimeout(() => { a.remove(); if (revoke) URL.revokeObjectURL(href); }, 30000);
    say(doc.fired ? 'Fırınlanmış çini PNG olarak indirildi.' : 'Çini PNG olarak indirildi.');
  };
  out.toBlob((b) => (b ? save(URL.createObjectURL(b), true) : save(out.toDataURL('image/png'), false)), 'image/png');
});

function syncUi() {
  for (const r of ui.shapes) r.checked = r.value === doc.shape;
  ui.fold.value = doc.n; ui.foldOut.value = doc.n; ui.mirror.checked = doc.mirror;
  ui.undo.disabled = !history.length;
  panel.classList.toggle('is-fired', doc.fired);
  canvas.classList.toggle('fired', doc.fired);
  ui.fire.textContent = doc.fired ? 'Boyamaya dön' : 'Fırına ver';
  ui.fire.classList.toggle('cool', doc.fired);
  ui.wall.hidden = !(doc.fired && doc.shape === 'k');
  ui.wall.textContent = wall ? 'Tek karo' : 'Duvara diz';
  ui.hint.textContent = HINTS[state.tool];
  canvas.setAttribute('aria-label', doc.fired
    ? `Fırınlanmış ${doc.shape === 't' ? 'tabak' : 'karo'}, ${doc.strokes.length} fırça izi, ${doc.n} katlı simetri`
    : `Çini boyama atölyesi: ${doc.shape === 't' ? 'tabak' : 'karo'}, ${doc.strokes.length} fırça izi, ${doc.n} katlı simetri${doc.mirror ? ', aynalı' : ''}`);
}

let sayTimer = 0;
function say(text, keep = false) {
  ui.status.textContent = text;
  clearTimeout(sayTimer);
  if (!keep) sayTimer = setTimeout(() => { if (ui.status.textContent === text) ui.status.textContent = ''; }, 4000);
}

// ------------------------------------------------------------------ adres
let hashTimer = 0;
const history_ = window.history;
function saveHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const h = `#${encode(doc)}`;
    if (location.hash === h) return;
    try { history_.replaceState(null, '', h); } catch { try { location.replace(h); } catch { /* adres değiştirilemiyor */ } }
  }, 300);
}

// ------------------------------------------------------------------ başlangıç
new ResizeObserver(() => { layout(); requestDraw(); }).observe(canvas);
const fromHash = location.hash.length > 1 ? decode(decodeURIComponent(location.hash.slice(1))) : null;
if (fromHash) doc = fromHash;
else {
  doc = generate(1453, 't');
  if (location.hash.length > 1) say('Bağlantıdaki çini okunamadı; atölyeye örnek bir tabak kondu.', true);
}
Ts = transforms(doc.n, doc.mirror);
layout();
syncUi();
requestDraw();

// Test ve ölçüm için durum ve ışık denetimi
window.cini = Object.freeze({
  stats: () => ({
    shape: doc.shape, n: doc.n, mirror: doc.mirror, tool: state.tool, color: PALETTE[state.color].key,
    strokes: doc.strokes.length, points: doc.strokes.reduce((a, s) => a + s.pts.length / 2, 0),
    fired: doc.fired, firing: !!firing, wall, bake: baked ? baked.F : 0, history: history.length,
  }),
  hash: () => encode(doc),
  light: (x, y) => { light.frozen = true; light.x = light.tx = x; light.y = light.ty = y; light.drawn = ''; requestDraw(); },
});
