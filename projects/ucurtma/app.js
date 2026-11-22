// Uçurtma: physics.js'teki Verlet dünyasını tepeden bir gökyüzüne çizer.
// Kamera uçurtmayı ve çocuğu kadrajda tutacak biçimde yumuşakça yakınlaşır; bulutlar rüzgârla kayar.
import { createWorld, step, setLength, setBridle, cut, windAt } from './physics.js';

const $ = (s) => document.querySelector(s);
const cv = $('#gok');
const ctx = cv.getContext('2d');
const status = $('#status');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

const S = { wind: 7, length: 30, bridle: 0.4, reel: 0 };
(() => {
  const [w, l, b] = location.hash.slice(1).split('.').map(Number);
  if (w >= 0 && w <= 14) S.wind = w;
  if (l >= 4 && l <= 90) S.length = l;
  if (b >= 32 && b <= 52) S.bridle = b / 100;
})();
let W = createWorld({ length: S.length, wind: S.wind, seed: (Math.random() * 1e9) | 0, bridle: S.bridle });
const writeHash = () => history.replaceState(null, '', `#${S.wind}.${Math.round(W.length)}.${Math.round(S.bridle * 100)}`);

/* ------------------------------------------------------------ kamera */
let w = 0, h = 0, dpr = 1, ground = 0, left = 0;
const cam = { s: 12, x0: 0 };
function layout() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  w = cv.clientWidth; h = cv.clientHeight;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const narrow = w < 760 || w / h < 0.8;
  ground = narrow ? h - Math.min(h * 0.42, 300) : h * 0.86;
  left = narrow ? w * 0.14 : 300 + (w - 300) * 0.1;
}
const X = (x) => (left + (x - cam.x0) * cam.s) * dpr;
const Y = (y) => (ground - y * cam.s) * dpr;
// uçurtmanın sağında kuyruğa, üstünde başlığa yer kalacak ölçek
const fit = (k) => Math.min((w - left - 150) / Math.max(4, k.x + 1), (ground - 120) / Math.max(4, k.y + 1), 60);
function follow() {
  const k = W.P[W.N];
  const target = fit(k);
  cam.s += (target - cam.s) * 0.04;
}

/* ------------------------------------------------------------ manzara */
const clouds = Array.from({ length: 9 }, (_, i) => ({ x: Math.random(), y: 0.08 + Math.random() * 0.4, s: 0.6 + Math.random() * 0.9, d: 0.3 + (i % 3) * 0.3 }));
let skyline = null;
function makeSkyline() {
  // uzak tepeler ve kubbeli, minareli bir şehir silueti (genel, belirli bir yapı değil)
  const c = document.createElement('canvas');
  c.width = cv.width; c.height = Math.round(140 * dpr);
  const g = c.getContext('2d');
  const H = c.height;
  g.fillStyle = 'rgba(120,160,190,0.55)';
  g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= c.width; x += 20) g.lineTo(x, H * 0.55 - Math.sin(x * 0.004) * H * 0.18 - Math.sin(x * 0.011 + 2) * H * 0.07);
  g.lineTo(c.width, H); g.fill();
  g.fillStyle = 'rgba(92,128,160,0.7)';
  let x = c.width * 0.45;
  const r = () => Math.random();
  while (x < c.width) {
    const bw = (14 + r() * 26) * dpr, bh = (10 + r() * 22) * dpr;
    g.fillRect(x, H - bh, bw, bh);
    if (r() < 0.25) { g.beginPath(); g.arc(x + bw / 2, H - bh, bw * 0.42, Math.PI, 0); g.fill(); }
    if (r() < 0.18) { const mx = x + bw * (r() < 0.5 ? 0.1 : 0.9); g.fillRect(mx - 1.5 * dpr, H - bh - 34 * dpr, 3 * dpr, 34 * dpr); g.beginPath(); g.moveTo(mx - 2.5 * dpr, H - bh - 34 * dpr); g.lineTo(mx, H - bh - 44 * dpr); g.lineTo(mx + 2.5 * dpr, H - bh - 34 * dpr); g.fill(); }
    x += bw + r() * 6 * dpr;
  }
  return c;
}
function drawSky(t) {
  const g = ctx.createLinearGradient(0, 0, 0, ground * dpr);
  g.addColorStop(0, '#4a9fd8'); g.addColorStop(0.6, '#8fcbea'); g.addColorStop(1, '#d9eef7');
  ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
  // güneş
  const sx = cv.width * 0.82, sy = cv.height * 0.16;
  const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 120 * dpr);
  sg.addColorStop(0, 'rgba(255,250,220,0.95)'); sg.addColorStop(0.15, 'rgba(255,240,190,0.7)'); sg.addColorStop(1, 'rgba(255,240,190,0)');
  ctx.fillStyle = sg; ctx.fillRect(sx - 120 * dpr, sy - 120 * dpr, 240 * dpr, 240 * dpr);
  // bulutlar rüzgârla kayar
  for (const c of clouds) {
    c.x += (W.wind * 0.00006 * c.d * (reduce ? 0.2 : 1));
    if (c.x > 1.2) c.x = -0.25;
    const x = c.x * cv.width, y = c.y * ground * dpr, s = c.s * 60 * dpr * Math.max(0.4, Math.min(1, w / 1100));
    ctx.fillStyle = `rgba(255,255,255,${0.55 + c.d * 0.35})`;
    for (const [dx, dy, r] of [[0, 0, 1], [0.8, 0.15, 0.75], [-0.8, 0.2, 0.7], [0.3, -0.35, 0.8], [-0.3, -0.25, 0.65]]) {
      ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, r * s * 0.6, 0, Math.PI * 2); ctx.fill();
    }
  }
  void t;
}
function drawGround() {
  const gy = ground * dpr;
  if (!skyline || skyline.width !== cv.width) skyline = makeSkyline();
  ctx.drawImage(skyline, 0, gy - skyline.height + 6 * dpr);
  const g = ctx.createLinearGradient(0, gy, 0, cv.height);
  g.addColorStop(0, '#7fb35a'); g.addColorStop(1, '#4e8a3b');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, gy + 8 * dpr);
  for (let x = 0; x <= cv.width + 30; x += 30) ctx.lineTo(x, gy - Math.sin(x * 0.003 + 1) * 6 * dpr);
  ctx.lineTo(cv.width + 30, cv.height); ctx.lineTo(0, cv.height); ctx.fill();
}
function drawChild() {
  const hx = X(W.P[W.hand].x), hy = Y(W.P[W.hand].y);
  const fx = X(-0.35), gy = Y(0);
  const u = Math.max(0.5, Math.min(1.6, cam.s / 14)) * dpr; // çocuğun ekrandaki boyu kamerayla biraz değişir
  const sh = 58 * u; // boy
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#1d3a52'; ctx.fillStyle = '#1d3a52';
  // bacaklar
  ctx.lineWidth = 6 * u;
  ctx.beginPath(); ctx.moveTo(fx - 6 * u, gy); ctx.lineTo(fx, gy - sh * 0.45); ctx.lineTo(fx + 7 * u, gy); ctx.stroke();
  // gövde
  ctx.fillStyle = '#d2473a';
  ctx.beginPath(); ctx.roundRect(fx - 9 * u, gy - sh * 0.82, 18 * u, sh * 0.42, 6 * u); ctx.fill();
  // baş
  ctx.fillStyle = '#e9b48a';
  ctx.beginPath(); ctx.arc(fx, gy - sh * 0.92, 8.5 * u, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3a2416';
  ctx.beginPath(); ctx.arc(fx, gy - sh * 0.95, 8.8 * u, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
  // kollar: biri ipi tutan ele
  ctx.strokeStyle = '#d2473a'; ctx.lineWidth = 5 * u;
  ctx.beginPath(); ctx.moveTo(fx + 4 * u, gy - sh * 0.74); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(fx - 4 * u, gy - sh * 0.74); ctx.lineTo(fx - 12 * u, gy - sh * 0.5); ctx.stroke();
  // makara
  ctx.fillStyle = '#8a5a2b';
  ctx.beginPath(); ctx.arc(hx, hy, 4.5 * u, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawLine() {
  ctx.strokeStyle = 'rgba(40,40,40,0.75)';
  ctx.lineWidth = 1.1 * dpr;
  ctx.beginPath();
  W.line.forEach((i, k) => (k ? ctx.lineTo(X(W.P[i].x), Y(W.P[i].y)) : ctx.moveTo(X(W.P[i].x), Y(W.P[i].y))));
  ctx.stroke();
}
const COL = ['#d2473a', '#f2c14e', '#1f7a8c', '#17324a'];
function drawKite() {
  const n = W.P[W.N], t = W.P[W.T], b = W.P[W.B];
  // Uçurtma yüzü bize dönük çizilir: yan görünümdeki çıta eğiminin bir kısmı yatışa çevrilir.
  // Uzak kadrajda görünür kalsın diye uçurtma ve kuyruğu köprü noktası çevresinde birlikte büyütülür.
  const L = Math.hypot(n.x - t.x, n.y - t.y) * cam.s * dpr || 1;
  const k = Math.max(1, (62 * dpr) / L);
  const pitch = Math.atan2(n.x - t.x, n.y - t.y); // dikeyden sapma (eksi: burun rüzgâra)
  const lean = pitch * 0.35;
  const bx0 = X(b.x), by0 = Y(b.y);
  const ax = Math.sin(lean), ay = -Math.cos(lean); // ekranda yukarı doğru çıta
  const H = L * k;
  const cx = bx0 + 0.18 * H, cy = by0 - 0.05 * H;
  const top = [cx + ax * H * 0.5, cy + ay * H * 0.5], bot = [cx - ax * H * 0.5, cy - ay * H * 0.5];
  const cross = [cx + ax * H * 0.22, cy + ay * H * 0.22];
  const px = -ay * H * 0.33, py = ax * H * 0.33;
  const lft = [cross[0] - px, cross[1] - py], rgt = [cross[0] + px, cross[1] + py];
  // kuyruk: fizikteki zincir, kuyruk ucundan başlayarak aynı ölçekle
  const tx = X(t.x), ty = Y(t.y);
  const tp = W.tail.slice(1).map((i) => [bot[0] + (X(W.P[i].x) - tx) * k, bot[1] + (Y(W.P[i].y) - ty) * k]);
  ctx.strokeStyle = 'rgba(40,40,40,0.85)'; ctx.lineWidth = 1.2 * dpr; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(bot[0], bot[1]); tp.forEach((p) => ctx.lineTo(p[0], p[1])); ctx.stroke();
  tp.forEach((p, j) => {
    if (j % 2 === 0) return;
    const q = tp[j - 1];
    const dx = p[0] - q[0], dy = p[1] - q[1], dl = Math.hypot(dx, dy) || 1;
    const sz = Math.min(9 * dpr, H * 0.11);
    const ox = (-dy / dl) * sz, oy = (dx / dl) * sz, fx = (dx / dl) * sz * 0.55, fy = (dy / dl) * sz * 0.55;
    ctx.fillStyle = COL[((j - 1) / 2) % 4];
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + ox + fx, p[1] + oy + fy); ctx.lineTo(p[0] + ox - fx, p[1] + oy - fy); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] - ox + fx, p[1] - oy + fy); ctx.lineTo(p[0] - ox - fx, p[1] - oy - fy); ctx.closePath(); ctx.fill();
  });
  // köprü ipleri
  ctx.strokeStyle = 'rgba(40,40,40,0.5)'; ctx.lineWidth = 0.8 * dpr;
  ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(bx0, by0); ctx.lineTo(bot[0], bot[1]); ctx.stroke();
  // yelken: dört üçgen
  ctx.save();
  ctx.shadowColor = 'rgba(20,40,60,0.28)'; ctx.shadowBlur = 8 * dpr; ctx.shadowOffsetY = 4 * dpr;
  const tri = (a, b2, c, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b2[0], b2[1]); ctx.lineTo(c[0], c[1]); ctx.closePath(); ctx.fill(); };
  tri(top, lft, cross, COL[0]); tri(top, rgt, cross, COL[1]); tri(bot, lft, cross, COL[2]); tri(bot, rgt, cross, COL[0]);
  ctx.restore();
  // nazar gözü ve çıtalar
  const ex = cross[0] - ax * H * 0.06, ey = cross[1] - ay * H * 0.06;
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, H * 0.085, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1f7a8c'; ctx.beginPath(); ctx.arc(ex, ey, H * 0.055, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#17324a'; ctx.beginPath(); ctx.arc(ex, ey, H * 0.028, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(70,40,15,0.85)'; ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(bot[0], bot[1]); ctx.moveTo(lft[0], lft[1]); ctx.lineTo(rgt[0], rgt[1]); ctx.stroke();
  ctx.strokeStyle = 'rgba(30,30,30,0.75)'; ctx.lineWidth = 1 * dpr;
  ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(lft[0], lft[1]); ctx.lineTo(bot[0], bot[1]); ctx.lineTo(rgt[0], rgt[1]); ctx.closePath(); ctx.stroke();
}
function drawWindMarks(t) {
  // yerin üstünde rüzgâr çizgileri: hızla akar
  if (reduce) return;
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.2 * dpr; ctx.lineCap = 'round';
  for (let i = 0; i < 10; i++) {
    const y = ((i * 0.097 + 0.05) % 0.75) * ground * dpr;
    const sp = (W.wind * W.gust) * 40 * dpr;
    const x = ((t * sp * 0.001 + i * 397) % (cv.width + 300 * dpr)) - 150 * dpr;
    const len = (20 + W.wind * 4) * dpr;
    if (W.wind < 0.5) break;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + len * 0.5, y - 4 * dpr, x + len, y); ctx.stroke();
  }
}

/* ------------------------------------------------------------ döngü */
let last = performance.now(), acc = 0, sayT = 0, wasDown = false;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  acc += dt;
  if (S.reel) setLength(W, W.length + S.reel * 3 * dt);
  const h0 = 1 / 240;
  let n = 0;
  while (acc >= h0 && n++ < 14) { step(W, h0); acc -= h0; }
  if (n >= 14) acc = 0;
  follow();
  drawSky(now);
  drawWindMarks(now);
  drawGround();
  drawLine();
  drawKite();
  drawChild();
  readouts(now);
  requestAnimationFrame(frame);
}
function readouts(now) {
  const k = W.P[W.N], hnd = W.P[W.hand];
  const [u] = windAt(W, k.x, k.y);
  $('#o-yuk').textContent = `${Math.max(0, k.y).toFixed(0)} m`;
  $('#o-ip').textContent = W.cut ? 'kopuk' : `${W.length.toFixed(0)} m`;
  $('#o-ruz').textContent = `${u.toFixed(1)} m/s`;
  $('#o-ger').style.width = `${Math.min(100, (W.cut ? 0 : W.tension / 80) * 100)}%`;
  const down = k.y < 0.5;
  if (down && !wasDown) say('Uçurtma yere indi. Rüzgârı artır ya da ipi toplayıp çek.', true);
  wasDown = down;
  if (now - sayT > 8000) {
    const angle = Math.atan2(k.y - hnd.y, k.x - hnd.x) * 57.3;
    say(W.cut ? `İp koptu; uçurtma ${k.y.toFixed(0)} metrede sürükleniyor.` : down ? 'Uçurtma yerde.' : `Uçurtma ${k.y.toFixed(0)} metrede, ip ${angle.toFixed(0)}° açıyla.`);
  }
}
function say(text, now = false) {
  if (now || performance.now() - sayT > 8000) { status.textContent = text; sayT = performance.now(); }
}

/* ------------------------------------------------------------ denetimler */
const hold = (el, dir) => {
  const on = (e) => { e.preventDefault(); S.reel = dir; };
  const off = () => { if (S.reel === dir) { S.reel = 0; writeHash(); } };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointerleave', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && on(e));
  el.addEventListener('keyup', off);
};
hold($('#sal'), 1);
hold($('#topla'), -1);
$('#ruzgar').value = S.wind; $('#ruzgar-out').value = S.wind;
$('#kopru').value = Math.round(S.bridle * 100); $('#kopru-out').value = Math.round(S.bridle * 100);
$('#ruzgar').addEventListener('input', (e) => { S.wind = W.wind = +e.target.value; $('#ruzgar-out').value = S.wind; writeHash(); });
$('#kopru').addEventListener('input', (e) => { S.bridle = +e.target.value / 100; setBridle(W, S.bridle); $('#kopru-out').value = e.target.value; writeHash(); });
$('#kes').addEventListener('click', () => { if (!W.cut) { cut(W); say('İp kesildi! Uçurtma rüzgârla uzaklaşıyor.', true); } });
$('#yeni').addEventListener('click', () => {
  S.length = W.length;
  W = createWorld({ length: S.length, wind: S.wind, seed: (Math.random() * 1e9) | 0, bridle: S.bridle });
  say('Yeni uçurtma rüzgâra bırakıldı.', true);
});

// Eli sürükle: ipi çekmek, uçurtmaya hız kazandırır
let drag = null;
const clampHand = (x, y) => [Math.max(-2.5, Math.min(2.5, x)), Math.max(0.5, Math.min(2.4, y))];
cv.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY, hx: W.P[W.hand].x, hy: W.P[W.hand].y };
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const k = 1 / Math.max(25, cam.s * 2.2); // ekran pikseli → metre (eli kısıtlı oynatır)
  const [x, y] = clampHand(drag.hx + (e.clientX - drag.x) * k, drag.hy - (e.clientY - drag.y) * k);
  const p = W.P[W.hand];
  p.x = x; p.y = y;
});
const endDrag = () => { drag = null; };
cv.addEventListener('pointerup', endDrag);
cv.addEventListener('pointercancel', endDrag);
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input')) return;
  const p = W.P[W.hand];
  const d = 0.15;
  const mv = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] }[e.key];
  if (mv) { [p.x, p.y] = clampHand(p.x + mv[0], p.y + mv[1]); e.preventDefault(); }
  if (e.key === '+' || e.key === '=') { setLength(W, W.length + 2); writeHash(); }
  if (e.key === '-') { setLength(W, W.length - 2); writeHash(); }
});
addEventListener('resize', () => { layout(); skyline = null; });
layout();
// Başlangıçta kamera uçurtmaya göre ayarlı gelsin
for (let i = 0; i < 240 * 3; i++) step(W, 1 / 240);
cam.s = fit(W.P[W.N]);
requestAnimationFrame(frame);
