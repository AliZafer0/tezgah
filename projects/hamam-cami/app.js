// Hamam Camı — buğulu cama parmakla yaz.
// Arkada keskin bir sahne (hamamın göbek taşı, kubbedeki fil gözleri), önünde iki katman:
//  1. buğu: bulanık sahne + süt beyazı sis. Silinen yerlerden keskin sahne görünür.
//  2. damlalar: silinen çizginin kenarında toplanan su, ağırlaşınca aşağı süzülür ve iz bırakır.
// Silme maskesi düşük çözünürlüklü bir tuvalde tutulur; buğu her karede çok az geri gelir.
const $ = (s) => document.querySelector(s);
const canvas = $('#cam');
const ctx = canvas.getContext('2d');
const ui = {
  steam: $('#buhar'), steamOut: $('#buhar-out'), brush: $('#firca'), brushOut: $('#firca-out'),
  scene: [...document.querySelectorAll('input[name="sahne"]')], clear: $('#sil'), fog: $('#bugula'),
  png: $('#png'), status: $('#status'),
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let state = { steam: 5, brush: 5, scene: 'k' };
const MS = 0.25; // maske ölçeği (ekran pikseline göre)

let W = 0, H = 0, dpr = 1;
const sharp = document.createElement('canvas');
const blurred = document.createElement('canvas');
const mask = document.createElement('canvas');
const mctx = mask.getContext('2d', { willReadFrequently: false });
const fogLayer = document.createElement('canvas');
const fctx = fogLayer.getContext('2d');
const trails = document.createElement('canvas'); // damla izleri: kalıcı ama yavaşça buğulanır
const tctx = trails.getContext('2d');

function layout() {
  const r = canvas.getBoundingClientRect();
  dpr = Math.min(devicePixelRatio || 1, 1.5);
  W = r.width; H = r.height;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  for (const c of [sharp, blurred, fogLayer]) { c.width = canvas.width; c.height = canvas.height; }
  const oldMask = mask.width ? mask : null;
  mask.width = Math.max(1, Math.round(W * MS)); mask.height = Math.max(1, Math.round(H * MS));
  trails.width = mask.width; trails.height = mask.height;
  drawScene();
  void oldMask;
}

// ------------------------------------------------------------------ sahne
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function drawScene() {
  const g = sharp.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const warm = state.scene === 'k';
  // Duvar: mermer, sıcak ışık
  const bg = g.createLinearGradient(0, 0, 0, H);
  if (warm) { bg.addColorStop(0, '#d9c3a0'); bg.addColorStop(0.55, '#c9ab82'); bg.addColorStop(1, '#8a6c4e'); }
  else { bg.addColorStop(0, '#bfd6d8'); bg.addColorStop(0.55, '#9fbec2'); bg.addColorStop(1, '#5d7f86'); }
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const r = rng(warm ? 31 : 77);
  // Mermer damarları
  g.strokeStyle = warm ? 'rgba(120,90,60,0.18)' : 'rgba(40,80,90,0.18)'; g.lineWidth = 1.2;
  for (let i = 0; i < 26; i++) {
    let x = r() * W, y = r() * H; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (r() - 0.3) * 120; y += (r() - 0.5) * 60; g.lineTo(x, y); }
    g.stroke();
  }
  // Kubbe kemeri ve fil gözleri (tavandan süzülen ışık)
  const cx = W / 2, top = H * 0.08, rad = Math.min(W, H) * 0.62;
  g.fillStyle = warm ? 'rgba(60,40,25,0.22)' : 'rgba(20,50,60,0.22)';
  g.beginPath(); g.arc(cx, top + rad, rad, Math.PI, 0); g.lineTo(cx + rad, H); g.lineTo(cx - rad, H); g.closePath(); g.fill();
  for (let ring = 0; ring < 3; ring++) {
    const n = 7 + ring * 4, rr = rad * (0.32 + ring * 0.2);
    for (let i = 0; i < n; i++) {
      const a = Math.PI + (i + 0.5) * (Math.PI / n);
      const x = cx + Math.cos(a) * rr, y = top + rad + Math.sin(a) * rr * 0.85;
      const s = 9 - ring * 2 + 6;
      const glow = g.createRadialGradient(x, y, 0, x, y, s * 3);
      glow.addColorStop(0, 'rgba(255,248,220,0.95)'); glow.addColorStop(0.25, 'rgba(255,236,190,0.5)'); glow.addColorStop(1, 'rgba(255,236,190,0)');
      g.fillStyle = glow; g.beginPath(); g.arc(x, y, s * 3, 0, 7); g.fill();
      g.fillStyle = '#fffbe9'; g.beginPath(); g.ellipse(x, y, s * 0.55, s * 0.7, 0, 0, 7); g.fill();
    }
  }
  // Göbek taşı ve kurna
  const gy = H * 0.84;
  g.fillStyle = warm ? '#efe3cf' : '#e4eeee';
  g.beginPath(); g.ellipse(cx, gy, W * 0.34, H * 0.07, 0, 0, 7); g.fill();
  g.fillStyle = warm ? 'rgba(90,65,40,0.35)' : 'rgba(30,60,70,0.35)';
  g.fillRect(cx - W * 0.34, gy, W * 0.68, H * 0.2);
  g.fillStyle = warm ? '#f4ead9' : '#eef5f5';
  g.beginPath(); g.ellipse(W * 0.82, H * 0.72, 46, 22, 0, 0, 7); g.fill();
  g.fillStyle = warm ? '#b88a52' : '#7aa4ab';
  g.beginPath(); g.ellipse(W * 0.82, H * 0.72, 30, 12, 0, 0, 7); g.fill();
  // Bulanık kopya: buğunun arkasında görünen sahne
  const b = blurred.getContext('2d');
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.filter = `blur(${Math.round(14 * dpr)}px)`;
  b.drawImage(sharp, 0, 0);
  b.filter = 'none';
}

// ------------------------------------------------------------------ maske ve damlalar
// mask: alfa 1 = tam silinmiş (keskin görünür), 0 = buğulu
const drops = [];
let last = null;
function wipe(x, y, px, py) {
  const rad = (5 + state.brush * 2.6) * Math.min(1, Math.max(0.65, W / 900)) * MS;
  mctx.globalCompositeOperation = 'source-over';
  mctx.strokeStyle = 'rgba(0,0,0,1)'; mctx.fillStyle = 'rgba(0,0,0,1)';
  mctx.lineCap = 'round'; mctx.lineJoin = 'round'; mctx.lineWidth = rad * 2;
  mctx.beginPath(); mctx.moveTo(px * MS, py * MS); mctx.lineTo(x * MS, y * MS); mctx.stroke();
  // Silinen su kenarda toplanır: arada bir damla doğar
  const dist = Math.hypot(x - px, y - py);
  if (Math.random() < Math.min(0.7, dist / 40)) {
    const a = Math.random() * Math.PI * 2;
    drops.push({ x: x + Math.cos(a) * rad / MS * 0.8, y: y + Math.abs(Math.sin(a)) * rad / MS * 0.8, r: 2.2 + Math.random() * 2.6, vy: 0, mass: 0.3 + Math.random() * 0.6, stuck: 0.3 + Math.random() * 0.9, falls: Math.random() < 0.55 });
  }
}
function stepDrops(dt) {
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    if (d.stuck > 0) { d.stuck -= dt; d.mass += dt * 0.15; continue; }
    if (!d.falls) { d.r = Math.max(0, d.r - dt * 0.25); if (d.r < 1.4) drops.splice(i, 1); continue; }
    // Ağırlaştıkça hızlanır, cama sürtünmeyle yavaşlar; yolda başka su toplar
    d.vy = Math.max(18, Math.min(240, d.vy + (60 + d.mass * 140) * dt));
    const ny = d.y + d.vy * dt;
    const nx = d.x + (Math.random() - 0.5) * 8 * dt * 10;
    // İz: damla cam yüzeyini temizler (maske) ve ince bir su yolu bırakır
    mctx.globalCompositeOperation = 'source-over';
    mctx.strokeStyle = 'rgba(0,0,0,0.85)'; mctx.lineWidth = Math.max(1, d.r * 0.9 * MS * 2); mctx.lineCap = 'round';
    mctx.beginPath(); mctx.moveTo(d.x * MS, d.y * MS); mctx.lineTo(nx * MS, ny * MS); mctx.stroke();
    tctx.strokeStyle = 'rgba(255,255,255,0.5)'; tctx.lineWidth = Math.max(0.6, d.r * 0.35 * MS * 2); tctx.lineCap = 'round';
    tctx.beginPath(); tctx.moveTo(d.x * MS, d.y * MS); tctx.lineTo(nx * MS, ny * MS); tctx.stroke();
    d.x = nx; d.y = ny;
    d.r = Math.max(1.2, d.r - dt * 0.12);
    if (Math.random() < dt * 0.35) { d.stuck = 0.15 + Math.random() * 0.5; d.vy *= 0.3; }
    if (d.y > H + 10) drops.splice(i, 1);
  }
  if (drops.length > 160) drops.splice(0, drops.length - 160);
}
// Buğu geri gelir: silinen yerler yavaşça yeniden buğulanır. Hız buhar ayarına bağlı: 5'te yazı ~15 sn'de
// solar, 1'de ~45 sn, 9'da ~8 sn. Çok küçük adımlar 8 bitlik alfada yuvarlanıp kaybolmasın diye birikip
// en az %2'lik dilimlerle uygulanır.
let refogAcc = 0;
function refog(dt) {
  if (state.steam === 0) return;
  const perFrame = 0.0004 + state.steam * 0.00045; // 60 kare/sn için
  refogAcc += perFrame * dt * 60;
  if (refogAcc < 0.02) return;
  const k = Math.min(1, refogAcc);
  refogAcc = 0;
  mctx.globalCompositeOperation = 'destination-out';
  mctx.fillStyle = `rgba(0,0,0,${k})`;
  mctx.fillRect(0, 0, mask.width, mask.height);
  tctx.globalCompositeOperation = 'destination-out';
  tctx.fillStyle = `rgba(0,0,0,${k * 0.6})`;
  tctx.fillRect(0, 0, trails.width, trails.height);
  tctx.globalCompositeOperation = 'source-over';
  mctx.globalCompositeOperation = 'source-over';
}

// ------------------------------------------------------------------ çizim
let t = 0;
function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // 1. buğulu görünüm: bulanık sahne + sis
  ctx.drawImage(blurred, 0, 0);
  ctx.fillStyle = state.scene === 'k' ? 'rgba(246,238,226,0.62)' : 'rgba(236,244,245,0.62)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // 2. silinen yerler: keskin sahne, maskeyle
  const f = fctx;
  f.setTransform(1, 0, 0, 1, 0, 0);
  f.globalCompositeOperation = 'source-over';
  f.clearRect(0, 0, fogLayer.width, fogLayer.height);
  // Maske dörtte bir çözünürlükte; yumuşak büyütme kenarları kendiliğinden yumuşatır (kare başına filtre yok).
  f.imageSmoothingEnabled = true;
  f.imageSmoothingQuality = 'high';
  f.drawImage(mask, 0, 0, fogLayer.width, fogLayer.height);
  f.globalCompositeOperation = 'source-in';
  f.drawImage(sharp, 0, 0);
  ctx.drawImage(fogLayer, 0, 0);
  // 3. damla izleri ve damlalar
  ctx.globalAlpha = 0.5;
  ctx.drawImage(trails, 0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const d of drops) {
    const gr = ctx.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.4, 0, d.x, d.y, d.r * 1.3);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(60,40,30,0.25)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * 1.15, 0, 0, 7); ctx.fill();
  }
  // 4. buhar: yavaşça yükselen hafif sis bulutları
  if (!reduced && state.steam > 0) {
    for (let i = 0; i < 5; i++) {
      const y = H - ((t * (12 + i * 3) + i * 170) % (H + 200)) + 100;
      const x = W * (0.15 + i * 0.18) + Math.sin(t * 0.3 + i) * 40;
      const s = 120 + i * 30;
      const g = ctx.createRadialGradient(x, y, 0, x, y, s);
      g.addColorStop(0, `rgba(255,255,255,${0.05 + state.steam * 0.008})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x - s, y - s, s * 2, s * 2);
    }
  }
}
let raf = 0, prev = 0;
function frame(now) {
  raf = requestAnimationFrame(frame);
  const dt = prev ? Math.min(0.1, (now - prev) / 1000) : 1 / 60;
  prev = now; t += dt;
  stepDrops(dt);
  refog(dt);
  draw();
}

// ------------------------------------------------------------------ etkileşim
const pointers = new Map();
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const r = canvas.getBoundingClientRect();
  const p = [e.clientX - r.left, e.clientY - r.top];
  pointers.set(e.pointerId, p);
  wipe(p[0], p[1], p[0], p[1]);
});
canvas.addEventListener('pointermove', (e) => {
  const prev_ = pointers.get(e.pointerId);
  if (!prev_) return;
  const r = canvas.getBoundingClientRect();
  const p = [e.clientX - r.left, e.clientY - r.top];
  wipe(p[0], p[1], prev_[0], prev_[1]);
  pointers.set(e.pointerId, p);
});
const end = (e) => pointers.delete(e.pointerId);
canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
// Klavye: oklar parmağı gezdirir, Boşluk basılı tutunca siler
let kx = null, ky = null, down = false;
canvas.addEventListener('keydown', (e) => {
  if (kx === null) { kx = W / 2; ky = H / 2; }
  const s = e.shiftKey ? 30 : 10;
  const mv = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
  if (e.key === ' ') { e.preventDefault(); down = true; wipe(kx, ky, kx, ky); return; }
  if (!mv) return;
  e.preventDefault();
  const nx = Math.max(0, Math.min(W, kx + mv[0])), ny = Math.max(0, Math.min(H, ky + mv[1]));
  if (down) wipe(nx, ny, kx, ky);
  kx = nx; ky = ny;
});
canvas.addEventListener('keyup', (e) => { if (e.key === ' ') down = false; });

ui.steam.addEventListener('input', () => { state.steam = +ui.steam.value; sync(); });
ui.brush.addEventListener('input', () => { state.brush = +ui.brush.value; sync(); });
for (const r of ui.scene) r.addEventListener('change', () => { state.scene = r.value; drawScene(); sync(); say(r.value === 'k' ? 'Kurna başı, sıcak ışık.' : 'Soğukluk, serin ışık.'); });
ui.clear.addEventListener('click', () => {
  mctx.globalCompositeOperation = 'source-over'; mctx.fillStyle = '#000'; mctx.fillRect(0, 0, mask.width, mask.height);
  drops.length = 0; say('Cam tamamen silindi; buğu yavaşça geri gelecek.');
});
ui.fog.addEventListener('click', () => {
  mctx.clearRect(0, 0, mask.width, mask.height); tctx.clearRect(0, 0, trails.width, trails.height);
  drops.length = 0; say('Cam yeniden buğulandı.');
});
ui.png.addEventListener('click', () => {
  canvas.toBlob((b) => {
    if (!b) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'hamam-cami.png';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    say('Resim indirildi.');
  });
});
function sync() {
  ui.steamOut.value = state.steam; ui.brushOut.value = state.brush;
  for (const r of ui.scene) r.checked = r.value === state.scene;
  saveHash();
}
let sayTimer = 0;
function say(text) { ui.status.textContent = text; clearTimeout(sayTimer); sayTimer = setTimeout(() => (ui.status.textContent = ''), 4000); }

// adres: buhar.fırça.sahne
function saveHash() {
  const h = `#${state.steam}.${state.brush}.${state.scene}`;
  try { history.replaceState(null, '', h); } catch { /* adres değiştirilemiyor */ }
}
const m = /^#(\d)\.(\d)\.([ks])$/.exec(location.hash);
if (m) state = { steam: +m[1], brush: +m[2], scene: m[3] };
ui.steam.value = state.steam; ui.brush.value = state.brush;
sync();
layout();
new ResizeObserver(() => { layout(); }).observe(canvas);
raf = requestAnimationFrame(frame);
document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (!raf) { prev = 0; raf = requestAnimationFrame(frame); } });

// Test için: bir yazıyı parmakla yazar gibi siler
window.hamam = Object.freeze({
  stats: () => ({ ...state, drops: drops.length, falling: drops.filter((d) => d.falls && d.stuck <= 0).length, maxY: Math.round(Math.max(0, ...drops.map((d) => d.y))), W: Math.round(W), H: Math.round(H) }),
  advance: (sec) => { for (let k = 0; k < sec * 60; k++) { stepDrops(1 / 60); refog(1 / 60); t += 1 / 60; } draw(); },
  write: (pts) => { for (let i = 1; i < pts.length; i++) wipe(pts[i][0], pts[i][1], pts[i - 1][0], pts[i - 1][1]); },
});
